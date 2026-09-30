# Feedback schema and write rules

`feedback-schema.ts` extends the core schema with the tables in
`migrations/0005_bug_workflow.sql`.

- `bug_report_workflow` stores the author's response and the reporter's latest
  structured retest, including the tested build. Marking fixed can request a
  retest; a report of the issue still being present reopens it.
- `bug_attachments` stores a private attachment associated with a report. Rows
  accept only the `clean` scan state. The reporter and mod author may download
  it; signed object-storage links expire within 60 seconds. The storage key is
  not displayed in the report UI.
- Attachments reference `storage_reservations` through `reservation_id`.
  Deletion removes stored bytes before removing the attachment and ledger entry
  in a transaction. Uncertain or failed cleanup retains the quota charge for
  reconciliation.

Attachment uploads reserve quota before quarantine, validation, and scanning.
The configured scanner may be ClamAV or Transloadit. The non-cloud limit is
20 MiB with the extension policy in `lib/feedback-policy.ts`. The cloud profile
further restricts attachments to validated text formats or strict ZIP, at most
8 MiB. Binary game saves are not supported by the cloud profile. Do not infer
acceptance from an HTML file input's extension filter alone.

User mutations lock the parent `beta_mods` row and recheck the required actor,
listing status, and moderation visibility. Promotion obtains the same lock.
Long scans finish before the final transaction: a listing promoted or hidden
during scanning must not accept a stale upload, and stored bytes must be cleaned
up or retain an accounted reservation if cleanup is uncertain.

Votes contain the build ID displayed to the tester. A newer build causes a
rejection rather than silently recording a verdict against untested bytes.
