# Account setup

Account settings are at `/account`. New password accounts start unverified.
Verification links last 24 hours and password-reset links last 30 minutes.
Only token hashes are stored in Postgres. A new link replaces an earlier link
of the same kind, and a successful password reset/change invalidates every
existing session. Verification links require an explicit confirmation button;
email link scanners cannot consume them by fetching a URL.

Apply `0004_account_security.sql` before running this version. Existing email
addresses remain unverified. A case-insensitive unique index prevents duplicate
identities; if historical duplicates exist, migration stops instead of merging
people. Every authenticated request checks the account's current session version
and suspension state in the database. Existing signed cookies work until a
password change/reset; deleted or suspended accounts cannot retain access.

## Email delivery

Set `APP_URL` to the public HTTPS origin and configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_FROM`, `SMTP_USER`, and `SMTP_PASSWORD`. Use `SMTP_SECURE=true` for port 465;
port 587 requires STARTTLS. The app does not disable certificate validation.
These are ordinary SMTP credentials from an email provider, not a Gmail sign-in
password. Do not enter secrets in tracked files.

Without mail configuration, verification/recovery pages explain that delivery
is unavailable. Account creation and sign-in still work, but public posting
requires verified email. Password changes require the current password.

For a local development rehearsal only, set:

```dotenv
APP_URL=http://127.0.0.1:3000
AUTH_MAIL_MODE=preview
AUTH_ALLOW_UNVERIFIED_LOCAL=true
```

Preview messages are private JSON files in the current OS user's
`.betamods-dev-mail` directory (outside the repository and public directory).
Open the newest file locally and use the link in `text`. Never commit, share,
or expose that folder via HTTP. Test scripts may read their own message locally
but must not print tokens. Remove used preview files after testing.

Both preview mail and the explicit unverified-account development exception
are refused when `NODE_ENV=production` or `APP_URL` is not a loopback address.
The exception does not mark an email verified. Bind the development server to
127.0.0.1 and remove it before inviting public testers.

## Administrator access

Only `ADMIN_USER_IDS` grants administrative access. `ADMIN_EMAILS` no longer
authorizes anyone. Copy the known UUID from the account's profile URL or a trusted
database query. Do not choose a row solely because its email claims to be yours.

```powershell
node scripts/bootstrap-admin.mjs <known-account-uuid> --env-file .env.local
node scripts/bootstrap-admin.mjs <known-account-uuid> --env-file .env.local --apply
```

The first command verifies the target and previews the change. The second adds
that UUID to the private environment file. Restart the app afterward. This
script never changes database records or marks emails verified. Repeat with
`.env.home` when configuring the home stack against the intended database.

Login, account creation, verification/reset requests, password changes, and
token redemption are throttled in Postgres with atomic expiring counters.
Limits survive restarts and apply across app instances. Both per-identity and
global limits are enforced; raw email addresses are not used as counter keys.
