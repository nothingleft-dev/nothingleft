# Storage

Where your organisation's files live, how much room they take, and how to store them in a
bucket of your own. All of it is under **Organisation → Storage**, for Org Admins and the
Owner. Everyone else sees how full the storage is on the dashboard and above an issue's
attachments.

## What counts

Every file attached to an issue, a comment, a time entry or an article counts toward your
organisation's storage: 5 GB on the free plan. Avatars never count. From 80% a notice appears;
at 95% the Org Admins and the Owner get one email; at 100% new uploads are refused until there
is room. There is no way to buy more — you either make room or bring your own bucket.

## Making room

**Organisation → Storage** lists every file, largest first, with the issue or article it
belongs to, who uploaded it and when. Sort by date instead, or narrow to one project. Delete a
file from the list and its space is free at once; the issue or article it was on loses it too.

Three kinds of file are counted but not listed:

- **Unclaimed uploads** — files someone attached to a form they never saved. Only they can see
  them, and they are removed after two days.
- **Files awaiting purge** — files of a deleted issue or article. They stay while it can still
  be restored, for 14 days, and are then removed with it. The list shows them with the date they
  go.
- **Files in your own bucket**, once you connect one — shown, never counted.

## Bringing your own bucket

Connect a Cloudflare R2 or AWS S3 bucket and your files are stored there instead. The storage
limit no longer applies, and the files are yours: in your account, on your bill. Avatars stay
with Nothing Left.

### 1. Give it a key that can do exactly three things

Create a new key just for Nothing Left. It needs to write, read and delete files in that one
bucket, and nothing else:

- **AWS S3** — create an IAM user and attach the policy the setup screen shows. It is filled in
  with your bucket name: `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on the bucket's
  objects, and `s3:ListBucket` on the bucket.
- **Cloudflare R2** — create an API token with *Object Read & Write*, limited to that bucket.

**Do not give it full S3 access, or a token for your whole account.** The key is stored
encrypted and never shown again, but a key that can only touch one bucket is one that can only
ever lose one bucket.

### 2. Let the app reach the bucket

Your browser uploads and opens files straight from the bucket, so the bucket must allow the app
to. Paste the CORS rule the setup screen shows into the bucket's CORS settings (AWS: bucket →
Permissions → CORS; R2: bucket → Settings → CORS policy).

### 3. Enter the key and check it

Enter your R2 account ID (or your S3 region), the bucket name, the access key ID and the secret,
then confirm with your password (and a two-factor code, if you use one). Nothing Left then
checks the bucket twice:

1. **From the server** — it writes a small test file, reads it back and deletes it. If anything
   fails, the screen says what: a key ID that does not exist, a secret that does not match, no
   bucket by that name, or a permission the key is missing.
2. **From your browser** — it uploads an 8 KB test file and opens it again. If this fails while
   the first check passed, the CORS rule is missing or wrong: the screen shows it again.

When both pass, the bucket is connected, and **the storage limit lifts at once**. Everyone who
administers the organisation gets an email saying so, and the audit log records who connected
it.

### 4. Move your existing files

From that moment new files go to your bucket, while the files you already had stay where they
were and keep working. Choose **Move files** to copy them across. The screen shows how many have
moved; you can leave it running. Each file is copied, checked, and only then removed from
Nothing Left's storage, so every file keeps opening throughout. If the move stops — a network
problem, a permission removed halfway — choose **Retry** and it carries on from where it
stopped.

## When the key stops working

If the bucket starts refusing the key — it was deleted, rotated, or lost a permission — Nothing
Left stops using it straight away and emails the admins once. Until it is fixed, files in the
bucket show as unavailable and nobody can upload; nothing is sent to Nothing Left's storage
instead, so you never fill it up by surprise.

**To fix it**, enter a working key for the same bucket. It is checked before it replaces the old
one, so a typo changes nothing. Changing to a different bucket — or the same bucket name in
another account — means disconnecting first.

## Disconnecting

**Disconnect** asks you to confirm with your password. After it:

- The key is forgotten. Nothing Left still remembers which bucket each file is in: the provider,
  the R2 account or S3 region, and the bucket name.
- **Your files stay in your bucket** — nothing there is deleted — but they no longer open in
  Nothing Left. They are listed as files in an earlier bucket.
- **Connect the same bucket again — same account or region, same name — and they open again.**
  A bucket with the same name in a different account is a different bucket: connecting it does not
  bring the earlier files back.
- New uploads use Nothing Left's storage, and the limit applies again.

Nothing Left deletes a file from your bucket only when the file itself is deleted: someone
deletes it, an unsaved upload expires, or a deleted issue or article reaches the end of its 14
days. Disconnecting never deletes anything there, and neither does deleting the organisation —
whatever is in your bucket then is yours to keep or remove.

## Asking an agent

An agent with an Org Admin's token and the `admin:org` scope can list the files by size
(`list_files`) and delete one (`delete_attachment`) — handy for "what is taking up our storage?".
Connecting, checking and disconnecting a bucket stay in the web app: an agent never handles its
keys.

## Example

ACME is at 97% of its 5 GB. Alex Lee, an Org Admin, opens **Organisation → Storage**, sees that a
screen recording on ACME-212 takes 180 MB and deletes it. Then Alex connects ACME's own R2 bucket:
the checks pass, the limit lifts, and Alex chooses **Move files**. Casey Kim uploads a screenshot
a minute later; it goes straight to ACME's bucket.
