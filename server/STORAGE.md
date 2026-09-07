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

## Setting up R2

1. Cloudflare dashboard → R2 → **Create bucket**. Any name, e.g. `hcc-images`. Leave it private.
2. R2 → **Manage R2 API Tokens** → create a token with **Object Read & Write** scoped to that bucket.
   Note the Access Key ID, Secret Access Key, and your Account ID (shown on the R2 overview page).
3. Bucket → **Settings** → **CORS policy**. The browser fetches presigned URLs directly, so the bucket
   must allow your web origins:

   ```json
   [
     {
       "AllowedOrigins": ["https://<your-pages-domain>", "http://localhost:3000"],
       "AllowedMethods": ["GET"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Add every origin the app is served from (Pages preview hosts included, or `"*"` if you accept
   any origin reading objects it holds a valid presigned URL for).
4. Set the API's environment (Render → Environment):

   ```
   STORAGE_DRIVER=r2
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=hcc-images
   URL_SIGNING_SECRET=<openssl rand -hex 32>
   ```

   The server refuses to start with `STORAGE_DRIVER=r2` and any R2 variable missing. Without
   `URL_SIGNING_SECRET` it generates a random one and warns; signed URLs then stop working after
   each restart, which is harmless in development and undesirable in production.

## Migrating existing images

The schema migration rewrites the `card_images` table (SQLite can't alter a column in place), so
the database file roughly doubles in size until the VACUUM at the end of these steps. Make sure the
disk holding the database has that much headroom before deploying.

Deploy the new code first; new uploads go straight to storage. Then, from `server/` with the same
environment the API runs with (on Render, use the service **Shell**):

```sh
node scripts/backfill-images.js --dry-run    # shows what would be uploaded
node scripts/backfill-images.js              # uploads, records object_key on each row, keeps blobs
```

Open a few cards and confirm images load. Then reclaim the space:

```sh
node scripts/backfill-images.js --clear-blobs   # re-verifies each object exists, then nulls blob
node scripts/vacuum-db.js                       # SQLite only shrinks the file on VACUUM
```

Both scripts are idempotent and safe to re-run; the backfill only visits rows that still hold bytes.
`--clear-blobs` never drops bytes for a row whose object it could not confirm.

Once every row has an `object_key` and no blobs remain, the `blob` column can be dropped in a
follow-up Prisma migration.

## Deleting

Deleting an image, a card, or a folder removes the rows through the usual cascades, then deletes
any storage object no remaining row references. Cleanup failures are logged and never fail the
request, so an outage can leave orphaned objects behind; they cost storage but nothing else.

## Local development

Nothing to configure. The default `local` driver writes to `server/storage/` (gitignored). Legacy
rows in `dev.db` keep working through the signed API route; run the backfill to move them into the
local directory if you want the full path exercised.
