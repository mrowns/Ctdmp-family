# Program administration and interactive fixture demo

Implemented on the private VPS in mock-only local/test environments. Production startup remains blocked. All administrator identities in the seed are fictional.

## Grants and recent verification

Program reads use program.read. Mutations require a global program.manage grant (branch_id must be null), an active matching session and member, and a verification from the development sign-in form within 15 minutes. Sending controls separately require global messaging.manage. Demo creation and evidence injection require both global demo.manage and program.manage. A role name alone grants nothing.

The seeded admin-a has these explicit fixture grants; admin-b has read permissions for its permitted records, and moderators have no program-management permission. Each command rechecks the database and locks the relevant grant/session through its authorization boundary. Revocation that commits first prevents the command. This is fixture security, not approved production administrator assurance; real strong authentication and recovery are still required.

## Commands

All changes require a reason (8–500 characters) and current revision. JSON API routes use numeric revisions. Browser forms coerce form fields, enforce the same schemas, and additionally validate browser-bound CSRF. Mutations use the shared transaction services; the UI cannot bypass a grant by changing a hidden field.

- POST /api/v1/admin/programs/{id}/candidates/{observationId}/approve: revision, reason. Checks the latest observation for that video, approved mock source, matching program/organization, live/available status, title match, valid video ID and evidence within two minutes. Records immutable source/decision/transition history and one stable initial outbox identity, or a distinct recovery/replacement event. A completed session cannot reopen.
- POST /api/v1/admin/programs/{id}/candidates/{observationId}/reject: revision, reason. Records a rejection and blocks automatic future use of that video in the same session. Explicit approval of fresh valid evidence can supersede it. The current selected source must be finished or replaced instead of rejected silently.
- POST /api/v1/admin/programs/{id}/finish: revision, reason. Ends an already-started session, records a transition and event, and makes joining unavailable. Late observations cannot revive it.
- POST /api/v1/admin/programs/{id}/select: revision, selectionRevision, reason. Selects that session for the organization's public Home/resolver. Selection has its own revision and audit context. Creating a future-dated session alone does not select it. Public selection uses configured ORGANIZATION_ID (demo-org by default).
- PUT /api/v1/admin/sending-controls: revision, paused, reason. Atomically toggles the organization's dry-run authorization switch; existing provider acceptance is outside this mock-only implementation. Workers recheck the switch while holding its shared lock. Stale controls return 409.
- GET /api/v1/admin/programs/{id}/transitions: explicitly permitted organization-scoped evidence, bounded to 100 rows.

- PUT /api/v1/admin/programs/{id}/schedule: revision, reason, scheduledStartAt and timeZone. Requires a future RFC3339 timestamp with an explicit offset that round-trips in the supplied IANA zone. Nonexistent local daylight-saving times and mismatched offsets are rejected. Saves one-off mock schedule history; recurrence is not implemented.
- POST /admin/programs/{id}/schedule: the equivalent CSRF-protected no-JavaScript administrator form.
- GET /api/v1/public/programs/next: the next future scheduled occurrence for configured ORGANIZATION_ID. A schedule never changes a session to live by itself.


Program and observation lock order is consistent between worker and administrator commands. A delayed/stale decision returns 409. Reauthentication and insufficient grants return 403; forbidden organizations/objects return 404. Evidence and audit context contain safe mock IDs and reasons, never joining capabilities or credentials. Existing pre-migration transitions are not fabricated or backfilled.

## Browser demonstration

1. On the VPS, run pnpm fixture:session admin-a and pnpm fixture:session alice. Each writes a one-hour code under artifacts/private with restrictive permissions; read it privately through your own terminal. Never paste these codes into chat or a repository.
2. Use separate browser profiles for the operator and member at the private loopback site through the documented SSH tunnel. Sign in with the respective fictional access codes. Enable Alice's simulated live-start preference.
3. In /admin, enter a reason and choose Create and show fictional session. This creates approved mock-only fixtures and explicitly selects the new session. Repeating the same creation request is idempotent; a changed payload using its key is rejected. Existing sessions are preserved.
4. Choose Simulate Stream A starting and refresh the control room. The real worker processes the queued evidence, records a verified mock destination, creates one logical notification per recipient, suppresses opted-out fixtures and reserves TEST accounting units for eligible dry runs.
5. As Alice, open /account/alerts and the latest prepared personal joining page. A preview/GET creates no check-in. Choose Watch Live to reach /demo/streams/MockVideo_A. This is a local destination marker with no real video playback.
6. As the operator, choose Simulate Stream A interruption, refresh, then Simulate replacement Stream B and refresh. The worker performs the state changes; the buttons do not merely relabel the page.
7. As Alice, reopen the exact previous personal link and choose Watch Live. It now reaches local Stream B. Own history shows one unique action with matching signed-in identity assurance. Reopening does not increase unique count.
8. Inspect permitted branch openings and immutable source/transition history. Optional controls can exercise competing evidence, source approval/rejection, pause/resume, selecting a different existing session, and completion.

The fake observation endpoints accept only sessions created by the fixture workflow. They cannot inject evidence into an arbitrary existing session. One-time codes, personal URLs and encrypted payloads remain excluded from logs and ordinary exports. The member's test-alert view decrypts only that authenticated fictional recipient's payload in this private mock environment. The worker clears expired encrypted payloads and capabilities in bounded batches; this is not a production retention policy.

## Evidence and remaining work

The latest 27 October run passed 28 PostgreSQL/API integration tests and 18 Chromium checks with JavaScript disabled. The browser suite covers the owner-facing scenario controls, own prepared alert, Stream A→B, stale forms, restricted branches and worker restart. External requests are intercepted, and mock destinations are local. See docs/evidence/check-2026-10-26.txt, docs/evidence/browser-2026-10-26.txt, docs/evidence/provider-health-2026-10-26.txt, docs/evidence/channel-governance-2026-10-26.txt, docs/evidence/delivery-reconciliation-2026-10-26.txt, docs/evidence/program-schedule-2026-10-26.txt, docs/evidence/ephemeral-retention-2026-10-27.txt, browser-slice.json and screenshots/.

Still incomplete: real WebAuthn/recovery, production admin assurance, real Meta contracts/activation, verified real YouTube sources, owner-confirmed recurrence and schedule policy, full Next.js client, provider freshness from a real adapter, the production retention matrix/deletion, restore/load/security review, mobile devices and later content/human workflows. These checks do not establish full Phase 1 acceptance or production readiness.
