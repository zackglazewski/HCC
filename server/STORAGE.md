# Image storage

Card image bytes live in object storage, not in SQLite. The `card_images` row keeps the metadata
and an `object_key` of the form `u/<user_id>/<sha256>`; the key is derived from the bytes, so a user
who puts the same picture on several cards stores it once. Thumbnails are small and stay in the
database.

Two drivers implement the same interface (`src/storage.js`):

| `STORAGE_DRIVER` | Where bytes go | Use |
|---|---|---|
| `local` (default) | `server/storage/` (`LOCAL_STORAGE_DIR`) | development, tests |
| `r2` | Cloudflare R2 bucket | production |

Clients never receive bytes inside the card JSON. Each image carries a short-lived `url`
(`IMAGE_URL_TTL_SECONDS`, default 15 minutes): a presigned R2 URL when the object is in R2, otherwise
an HMAC-signed `/api/images/:id/content` URL that the API serves itself. The signed route also serves
rows that still have their bytes in the database, so a half-finished backfill never breaks a card.

## Buckets: one per environment

| Environment | Bucket | Token | CORS policy |
|---|---|---|---|
| staging (Render PR preview + Pages preview) | `hcc-staging` | Object Read & Write, scoped to this bucket | `r2/cors-staging.json` (any origin, because preview hostnames change per branch) |
| production | `hcc-prod` | Object Read & Write, scoped to this bucket | `r2/cors-production.json` (production origins `https://heroscapecardcreator.com`, `https://www.heroscapecardcreator.com`, `https://hcc-dw7.pages.dev`, plus localhost) |

Objects are private in both buckets. CORS only decides which web origins may read an object they
already hold a valid presigned URL for, which is why `*` is acceptable on staging. R2 does not
document wildcard hostnames such as `https://*.pages.dev`, so exact origins or `*` are the choices.
Separate tokens mean a leaked staging credential cannot read or delete production images.

**Dashboard.** R2 Object Storage → **Create bucket** (name as above, automatic location, Standard
class). Open the bucket → **Settings** → **CORS policy** → paste the matching JSON file. Leave public
access off. Then R2 overview → **Manage R2 API Tokens** → **Create API token** → permission
**Object Read & Write** → *Specify bucket(s)* → the one bucket → create, and copy the Access Key ID
and Secret Access Key (the secret is shown once). Your Account ID is on the R2 overview page.

**Wrangler** does the buckets and CORS but not the tokens:

```sh
npx wrangler login
npx wrangler r2 bucket create hcc-staging
npx wrangler r2 bucket cors set hcc-staging --file r2/cors-staging.json
npx wrangler r2 bucket create hcc-prod
npx wrangler r2 bucket cors set hcc-prod --file r2/cors-production.json
```

**API environment** (Render → service → Environment; for staging, the preview's own Environment tab):

```
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...            # from the token for this environment's bucket
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=hcc-staging    # or hcc-prod
URL_SIGNING_SECRET=<openssl rand -hex 32>
```

The server refuses to start with `STORAGE_DRIVER=r2` and any R2 variable missing. Without
`URL_SIGNING_SECRET` it generates a random one and warns; signed URLs then stop working after each
restart, which is harmless in development and undesirable anywhere else.

## Staging test run

Staging is a Render pull-request preview of the API plus a Cloudflare Pages preview of the client,
pinned together through `/api/__preview` (see `client/functions/api/[[path]].ts`). A preview copies
the parent service's environment variables when it is created, and its values can be changed
afterwards without touching production. Render does not copy the production disk into a preview,
so expect an empty database and load a snapshot into it to rehearse the migration.

1. **Staging bucket and token exist** (above).
2. **Open a pull request for this branch.** Render builds `https://<service>-pr-<n>.onrender.com`.
   The first boot uses the parent's variables, so it runs with the `local` driver; that is fine.
   In the preview's **Environment** tab set the six variables above with the staging token and
   bucket, overwriting the leftover point-model `R2_*` values that were copied from production. Saving redeploys the preview.
3. **Seed the database.** First confirm the preview keeps its database across deploys: after the
   env-var redeploy in step 2 the logs should say "No pending migrations to apply" rather than
   re-running every migration, and `df -h /data` in the Shell shows the database directory on its
   own device. A preview without a persistent disk cannot be seeded this way.

   Use the staging bucket as the transfer medium. From your laptop, with the staging token:

   ```sh
   export AWS_ACCESS_KEY_ID=<staging key> AWS_SECRET_ACCESS_KEY=<staging secret>
   R2=https://<account_id>.r2.cloudflarestorage.com
   aws s3 cp prisma/dev.db s3://hcc-staging/seed/hcc.db --endpoint-url $R2 --region auto
   aws s3 presign s3://hcc-staging/seed/hcc.db --expires-in 3600 --endpoint-url $R2 --region auto
   ```

   In the preview's **Shell** (`echo $DATABASE_URL` shows the file, `/data/db.sqlite` on Render):

   ```sh
   curl -o /data/db.sqlite.new "<presigned url>"
   ls -la /data/db.sqlite.new          # about 1.9 GB
   mv /data/db.sqlite.new /data/db.sqlite
   ```

   The running API still holds the old file open, so restart the preview: **Manual Deploy →
   Restart service**. On boot `prisma migrate deploy` applies the image-storage migration to the
   snapshot, which is production runbook step 3 rehearsed on real data; the logs show
   `Applying migration 20260906023507_add_image_object_storage`. Then remove the seed object, since
   it is a full copy of production data:
   `aws s3 rm s3://hcc-staging/seed/hcc.db --endpoint-url $R2 --region auto`.
   The local `dev.db` snapshot has every card under one user, so log in on staging with that
   Google account to see them.
4. **Pin the Pages preview.** Push the branch, open its `pages.dev` preview URL, visit
   `/api/__preview?origin=https://<service>-pr-<n>.onrender.com`, log in, open a card. Images still
   load through the signed API route from database bytes at this point.
5. **Run production runbook steps 4 to 9** in the preview Shell: verify, backfill (detached,
   logging to `/data/backfill.log`), verify, open cards and confirm the Network tab shows
   `r2.cloudflarestorage.com` URLs with no CORS errors, then the pre-clear backup, `--clear-blobs`,
   verify, vacuum. The preview's 4.9 GB disk cannot hold a backup next to the 3.8 GB migrated file,
   so point `BACKUP_BEFORE_MIGRATE` at `/tmp/pre-clear.db` if `df -h /tmp` shows room, and skip the
   backup on staging otherwise. Never run `scripts/backup-db.js` from the Shell against an instance
   that is serving: its read lock stalls writes for minutes.
6. **Exercise the write paths in the app.** Upload an image to a card and watch it appear under
   `u/<user_id>/` in the bucket. Run background removal on it (re-upload plus delete of the old
   object). Delete the image, then the card, then a folder containing cards, and confirm the
   objects disappear unless another card of the same user shares them.
7. **Reset.** `aws s3 rm s3://hcc-staging/u/ --recursive --endpoint-url $R2 --region auto`,
   or delete and recreate the bucket. Closing the pull request removes the Render preview.

## Production runbook

Every step is additive until step 8; nothing before it removes data, and each step can be re-run.
Order matters because the schema migration runs automatically when the new code boots
(`npm run start:migrate`), and because the browser only stops needing the database bytes once the
bucket has been verified to hold every image.

**0. Check disk headroom on Render.** The schema migration rewrites the `card_images` table (SQLite
cannot alter a column in place), so the database file roughly doubles until the VACUUM in step 9.
The backup in step 1 is another full copy if it lives on the same disk. Rule of thumb: free space
of at least 2× the database file, 3× if the backup stays on the disk. Render → service → **Disks**
shows size and usage; disks can be grown, not shrunk.

**1. Arrange the backup.** Do not take it from the Shell while the API is serving: `VACUUM INTO`
holds a read lock for the whole copy, which takes minutes on Render's disk, and every write in that
window waits and then times out. Instead the API takes the backup itself at boot, before running
migrations, when nothing is serving. Add this to the service's environment together with the
variables in step 2:

```
BACKUP_BEFORE_MIGRATE=/data/hcc.pre-r2.db
```

The deploy in step 3 then writes the backup first and refuses to migrate if that fails. Leave the
variable in place; once the file exists every later restart logs "already exists; skipping". As a
second net, note the time of the disk's latest automatic snapshot (Render → service → Disks →
Snapshots). `node scripts/backup-db.js <path>` still exists for ad-hoc copies, but only run it when
nothing is writing.

**2. Create the production bucket and token, set CORS, add the env vars** as in *Buckets: one per
environment*, with `R2_BUCKET=hcc-prod` and the production token. The API service already carries
`R2_*` variables left over from the point-model experiment, which nothing on the API reads;
overwrite their values rather than adding duplicates, or the server will boot against the wrong
bucket. Do this before deploying: with `STORAGE_DRIVER=r2` and any R2 variable missing, the
server refuses to boot.

**3. Deploy the branch.** On boot the service writes the backup (Logs show `[backup] wrote
/data/hcc.pre-r2.db ... integrity_check: ok`), `prisma migrate deploy` applies
`20260906023507_add_image_object_storage`, then the API starts. The service is unavailable for the
backup plus the migration; the migration alone took 4 minutes on Render's disk. Uploads made from
now on go straight to R2. Existing images keep loading through the signed `/api/images/:id/content`
route from their database bytes, so users notice nothing else.

Then copy `/data/hcc.pre-r2.db` off the machine (`scp` over Render SSH, or however the last
production snapshot was pulled). Do not continue until that copy is somewhere other than this disk.

**4. Verify the bucket is reachable.** In the Render Shell:

```sh
node scripts/verify-storage.js
```

Expect every row under "blob only, not yet migrated", zero objects in storage, and no failure.
This proves credentials, endpoint and bucket name before any bytes move.

**5. Backfill.** Still in the Shell. The upload takes a while (see timings below), and Shell
sessions can drop, so detach it and keep the log on the persistent disk:

```sh
nohup node scripts/backfill-images.js > /data/backfill.log 2>&1 &
tail -f /data/backfill.log
```

It uploads each image to `u/<user_id>/<sha256>`, writes `object_key`, `mime`, `size_bytes` and
`sha256` on the row, and leaves `blob` untouched. If it dies part-way, run it again: rows already
uploaded are confirmed with a HEAD request and skipped.

Memory: the instance limit covers the API and the backfill together. The script loads one image
at a time and stayed between 170 and 250 MB of RSS under a 512 MB Linux limit with all 2,230
images; an earlier version that batched 25 images was killed at 512 MB on staging and took the
API down with it. Moving the service to a larger instance for the migration day is cheap
insurance and can be reverted afterwards.

**6. Verify the backfill.**

```sh
node scripts/verify-storage.js
```

Required result: "rows whose object is missing: 0", "rows whose object size differs: 0", and the
final line `OK: every image the database points at is in storage`. Then open a handful of cards in
the app, including one with several images. Their image URLs should now be
`https://<account>.r2.cloudflarestorage.com/...` (browser dev tools → Network). If images fail to
load with a CORS error in the console, fix the bucket CORS policy; nothing has been deleted.

**7. Optional soak.** Leave it here for a day if you like. Both copies of every image exist, so
the app can be rolled back to the previous deploy at any point with zero loss (the old code ignores
the new columns).

**8. Clear the database bytes.** The only destructive step. Per row it re-checks the object exists,
then nulls `blob`; a row whose object cannot be confirmed keeps its bytes. Take one more backup
first, the same way as step 1: change `BACKUP_BEFORE_MIGRATE` to `/data/hcc.pre-clear.db` and save.
The service restarts, writes the backup, finds no pending migrations, and comes back; confirm the
`[backup] wrote` line in Logs. This is the last moment the bytes exist in the database. Then:

```sh
node scripts/backfill-images.js --clear-blobs
node scripts/verify-storage.js
```

**9. Reclaim disk.**

```sh
node scripts/vacuum-db.js
```

SQLite only shrinks the file on VACUUM. The file drops to roughly the size of the non-image data.

**10. Later.** Remove `BACKUP_BEFORE_MIGRATE` from the environment and, once you are comfortable,
the two backup files from the disk (keep the off-box copy). Once every row has an `object_key` and
no blobs remain, a follow-up Prisma migration can drop the `blob` column. Not urgent.

### Timings measured on a copy of the production database

Rehearsed on 2026-09-11 against a `VACUUM INTO` copy of the production snapshot (2,239 cards,
2,230 images, 1,877 MB of blobs, 1,901 MB file), with the `local` driver on a laptop SSD:

| Step | Time | Database file |
|---|---|---|
| Backup (`VACUUM INTO`) | 2 s | copy of 1,901 MB written |
| Schema migration (`prisma migrate deploy`) | 2 s | 1,901 MB → 3,785 MB |
| Backfill, 2,230 rows | 13 s | unchanged |
| `verify-storage.js` | 1 s | |
| Backfill `--clear-blobs` | 6 s | unchanged (space becomes free pages) |
| `vacuum-db.js` | < 1 s | 3,785 MB → 21 MB |

Every row ended up in storage, `PRAGMA integrity_check` returned `ok`, and card, image, power and
thumbnail counts were unchanged. The 2,230 rows produced 2,042 objects (1,810 MB) because a user's
duplicate uploads share one key; the rehearsal copy had every card under a single user, so
production, with keys per user, will deduplicate less.

On Render staging (512 MB instance, 4.9 GB network disk) with the same data: the migration took
**4 minutes** and the boot-time backup **207 seconds**, so a production deploy that does both is
about **8 minutes** of downtime. The backfill peaked at 177 MB RSS, `--clear-blobs` and the vacuum
took seconds, and the file went from 3,782 MB to 29 MB. The backfill's own duration is set by
reading 1.9 GB off that disk and about 2,000 sequential uploads; detach it as step 5 says.

### If something goes wrong

- **Deploy fails during the migration** (Render killed the process before `migrate deploy`
  finished). SQLite applied the migration atomically or not at all, but Prisma may have recorded it
  as started. In the Shell run `npx prisma migrate status`; if it reports a failed migration, run
  `npx prisma migrate resolve --rolled-back 20260906023507_add_image_object_storage` and redeploy.
- **Deploy fails at the boot-time backup** (`[backup] FAILED` in Logs: wrong path, disk full).
  Nothing has been migrated. Fix the path or free space and redeploy. Removing
  `BACKUP_BEFORE_MIGRATE` would skip the backup; don't.
- **A request hits a database error** (for example a timeout while a long read lock is held).
  The API answers that request with a 500 and keeps running; before `express-async-errors` was
  added, one such error crashed the process and Render restarted the container.
- **"Instance failed: ran out of memory" during the backfill.** Render restarts the container.
  The API comes back on its own, `/data` is intact, and rows already backfilled stay done, but the
  detached backfill process and anything on the ephemeral filesystem are gone. Re-run the same
  `nohup` command; it resumes. If it recurs, move the service to a larger instance for the rest of
  the migration.
- **Backfill errors on some rows.** The script prints each failing image id and exits 1. Fix the
  cause (usually credentials or a transient network error) and re-run; it resumes.
- **Images broken after step 8.** Restore the pre-clear backup from step 8 (it has every byte plus
  all edits up to that moment): stop the service, replace the database file, start it. Objects
  already in R2 stay valid, so investigating and re-running `--clear-blobs` later is cheap.
- **Need to abandon the whole thing before step 8.** Redeploy the previous commit. The extra
  columns are ignored by the old code and the bucket can be deleted.

## Checking the bucket

- `node scripts/verify-storage.js` (Render Shell or locally with the R2 env vars) lists every
  object and cross-checks it against the database. This is the authoritative check.
- Cloudflare dashboard → R2 → bucket → **Objects** browses keys; **Metrics** shows object count and
  stored bytes (updated with a lag of a few minutes).
- The AWS CLI works against R2 with an S3 endpoint:

  ```sh
  AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
    aws s3 ls s3://<bucket>/u/ --recursive --summarize \
    --endpoint-url https://<account_id>.r2.cloudflarestorage.com --region auto
  ```

## Deleting

Deleting an image, a card, or a folder removes the rows through the usual cascades, then deletes
any storage object no remaining row references. Cleanup failures are logged and never fail the
request, so an outage can leave orphaned objects behind; they cost storage but nothing else.

## Local development

Nothing to configure. The default `local` driver writes to `server/storage/` (gitignored). Legacy
rows in `dev.db` keep working through the signed API route; run the backfill to move them into the
local directory if you want the full path exercised.

After checking out this branch run `npx prisma generate` in `server/`. The generated client is not
tracked by git, and one built from another branch's schema treats `blob` as required and knows
nothing about `object_key`; the symptom is "Argument `not` must not be null" from the scripts or
`P2022 column does not exist` from the API.
