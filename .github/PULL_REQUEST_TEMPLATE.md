## What changed

Explain the problem, the solution, and any related Issue. Keep the change focused.

## Verification

List the commands you ran and their outcomes. Clearly identify checks you could not run or that were skipped. Include before and after screenshots for UI changes, using synthetic data.

## Risks and operational impact

Describe changes to permissions, uploads, storage, quotas, data migrations, dependencies, or deployment. Explain how data is preserved and how a problematic change can be rolled back. Write `None` if this is not applicable.

## Checklist

- [ ] I read `CONTRIBUTING.md` and reviewed the full diff.
- [ ] The change includes appropriate tests or explains why none are needed.
- [ ] I reported lint, typecheck, unit test, and build results, including anything not run.
- [ ] I used only isolated test data and did not test destructively against the live pilot.
- [ ] No secrets, access codes, signed file URLs, private user data, uploads, or backups are included.
- [ ] New code and assets are material I have the right to contribute, with relevant third-party licensing documented.
- [ ] I preserved server-side authorization and the quarantine, scan, and final-storage sequence.

For a suspected vulnerability, stop and use the private channel in `SECURITY.md` instead of describing it here.
