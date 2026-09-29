# Bug report workflow

`feedback-schema.ts` extends the core schema with the tables defined in
`migrations/0005_bug_workflow.sql`.

- `bug_report_workflow` stores one author response and the reporter's latest
  structured retest, including the exact tested build. Marking fixed asks for a
  retest; a reporter finding the issue again reopens it.
- `bug_attachments` stores one private attachment per newly submitted report.
  The table accepts only `clean` scan state. Uploads reserve quota before writing
  quarantine, scan with ClamAV, then publish and settle the reservation atomically
  with the report. Logs and saves are limited to 20 MiB and supported extensions.
  Only the reporter and mod author may request a download; R2 links expire in at
  most 60 seconds. The storage key is never exposed in report UI.
- Attachments link to `storage_reservations` through `reservation_id`, while
  builds/media use their existing reverse links. Attachment and mod deletion
  remove storage first, then remove the attachment and ledger in one transaction.
  Failed storage cleanup retains a counted reservation for reconciliation.

Every user mutation locks the parent `beta_mods` row and rechecks owner (where
required), status and moderation visibility. Promotion obtains the same lock.
Long scans happen before that final transaction; a promotion that occurs during
scanning prevents the upload from committing and triggers storage cleanup.
Votes contain the build ID displayed to the user. A newer build causes a clear
rejection rather than silently recording a verdict against untested bytes.
