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
| production | `hcc-prod` | Object Read & Write, scoped to this bucket | `r2/cors-production.json` (production origin plus localhost; edit the placeholder first) |

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
   bucket. Saving redeploys the preview. If the preview fails to boot because the production disk
   path in `DATABASE_URL` does not exist, set `DATABASE_URL=file:./preview.db` on the preview too.
3. **Seed the database.** Do this only after the env-var redeploy in step 2 has finished, and do
   not redeploy or restart the preview again until the test is over: unless the preview has a
   persistent disk, its filesystem is recreated on every deploy and the seed would vanish. The
   Render Shell runs inside the live instance, so files you place there are the ones the API uses.

   Use the staging bucket as the transfer medium. From your laptop, with the staging token:

   ```sh
   export AWS_ACCESS_KEY_ID=<staging key> AWS_SECRET_ACCESS_KEY=<staging secret>
   export AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED AWS_RESPONSE_CHECKSUM_VALIDATION=WHEN_REQUIRED
   R2=https://<account_id>.r2.cloudflarestorage.com
   aws s3 cp prisma/dev.db s3://hcc-staging/seed/hcc.db --endpoint-url $R2 --region auto
   aws s3 presign s3://hcc-staging/seed/hcc.db --expires-in 3600 --endpoint-url $R2 --region auto
   ```

   In the preview's **Shell**: `echo $DATABASE_URL` to find the file (a relative `file:` path is
   relative to `prisma/`), check `df -h` for about 4 GB free, then

   ```sh
   curl -o /path/to/db.new "<presigned url>" && mv /path/to/db.new /path/to/db
   npx prisma migrate deploy
   ```

   Running the migration by hand from the Shell is production runbook step 3 rehearsed, minus the
   restart. The already-running API picks up the new columns immediately. Then remove the seed
   object, since it is a full copy of production data:
   `aws s3 rm s3://hcc-staging/seed/hcc.db --endpoint-url $R2 --region auto`.
   The local `dev.db` snapshot has every card under one user, so log in on staging with that
   Google account to see them.
4. **Pin the Pages preview.** Push the branch, open its `pages.dev` preview URL, visit
   `/api/__preview?origin=https://<service>-pr-<n>.onrender.com`, log in, open a card. Images still
   load through the signed API route from database bytes at this point.
5. **Run production runbook steps 4 to 9** in the preview Shell: verify, backfill (detached),
   verify, open cards and confirm the Network tab shows `r2.cloudflarestorage.com` URLs with no CORS
   errors, backup, `--clear-blobs`, verify, vacuum.
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

**1. Back up the database.** This happens before the deploy, so the Render **Shell** still runs the
old code without `scripts/backup-db.js`. Paste this instead, from the `server/` directory so the
script can find `@prisma/client` (adjust the target path to the disk mount):

```sh
cat > backup.cjs <<'EOF'
const { PrismaClient } = require('@prisma/client')
const target = process.argv[2]
const p = new PrismaClient()
p.$executeRawUnsafe(`VACUUM INTO '${target}'`)
  .then(() => console.log('backup written to', target))
  .finally(() => p.$disconnect())
EOF
node backup.cjs /var/data/hcc.pre-r2.db && rm backup.cjs
```

`VACUUM INTO` produces a consistent copy while the API keeps serving, unlike `cp` on an open
database. Copy the file off the machine before continuing (`scp` over Render SSH, or however the
last production snapshot was pulled). This backup is the recovery path for everything below. After
the deploy, `node scripts/backup-db.js <path>` does the same and additionally reads the copy back.

**2. Create the production bucket and token, set CORS, add the env vars** as in *Buckets: one per
environment*, with `R2_BUCKET=hcc-prod` and the production token. Do this before deploying: with
`STORAGE_DRIVER=r2` and any R2 variable missing, the server refuses to boot.

**3. Deploy the branch.** On boot `prisma migrate deploy` applies
`20260906023507_add_image_object_storage`, then the API starts. Uploads made from now on go straight
to R2. Existing images keep loading through the signed `/api/images/:id/content` route straight
from their database bytes, so users notice nothing.

**4. Verify the bucket is reachable.** In the Render Shell:

```sh
node scripts/verify-storage.js
```

Expect every row under "blob only, not yet migrated", zero objects in storage, and no failure.
This proves credentials, endpoint and bucket name before any bytes move.

**5. Backfill.** Still in the Shell. The upload takes a while (see timings below), and Shell
sessions can drop, so detach it:

```sh
nohup node scripts/backfill-images.js > /var/data/backfill.log 2>&1 &
tail -f /var/data/backfill.log
```

It uploads each image to `u/<user_id>/<sha256>`, writes `object_key`, `mime`, `size_bytes` and
`sha256` on the row, and leaves `blob` untouched. If it dies part-way, run it again: rows already
uploaded are confirmed with a HEAD request and skipped.

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
first: it costs a few seconds and is the last moment the bytes exist in the database.

```sh
node scripts/backup-db.js /var/data/hcc.pre-clear.db
node scripts/backfill-images.js --clear-blobs
node scripts/verify-storage.js
```

**9. Reclaim disk.**

```sh
node scripts/vacuum-db.js
```

SQLite only shrinks the file on VACUUM. The file drops to roughly the size of the non-image data.

**10. Later.** Once every row has an `object_key` and no blobs remain, a follow-up Prisma migration
can drop the `blob` column. Not urgent.

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

Two things will be slower on Render: the backfill pushes 1.8 GB over the network to R2 (expect
minutes, not seconds, which is why step 5 detaches it), and Render's disk is slower than a laptop
SSD, so the migration and VACUUM may take tens of seconds rather than two.

### If something goes wrong

- **Deploy fails during the migration** (Render killed the process before `migrate deploy`
  finished). SQLite applied the migration atomically or not at all, but Prisma may have recorded it
  as started. In the Shell run `npx prisma migrate status`; if it reports a failed migration, run
  `npx prisma migrate resolve --rolled-back 20260906023507_add_image_object_storage` and redeploy.
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
