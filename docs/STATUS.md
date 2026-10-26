# Status — 25 October 2026

Phase 0 foundation and Phase 1 backend/browser slice implemented in part. Full Phase 1 acceptance has NOT passed. Repository on VPS: `/home/ubuntu/ctdmp-connect`; origin `https://github.com/mrowns/Ctdmp-family.git`. Existing backend preserved in baseline commit `0684aa8`; implementation checkpoint `cbe4351` on branch `build/phase-1-browser-slice`; latest documentation checkpoint is identified by `git log -1`.

Working backend: PostgreSQL migrations and fictional fixtures; validated mock-only local/test configuration; loopback PostgreSQL/Redis; preview-safe joining with conservative identity assurance; immutable Stream A→B versions; initial-event/logical-notification uniqueness; encrypted delivery payload; transactional simulated budget/consent checks; BullMQ worker; signed fictional webhook inbox.

Added browser slice: responsive semantic server-rendered `/` and `/live`; authenticated `/account`, `/account/history`, `/account/preferences`; protected development access-code form; one-hour random fixture-session issuance; HttpOnly/SameSite=Strict cookie sessions and server-side logout revocation; protected forms; generic deliberate joining (anonymous is unattributed, authenticated writes a unique action); scoped read-only `/admin` with stream history, watcher evidence, permitted branch rows and separately granted simulated budget data. HTML safely escapes dynamic content. All routes retain no-store/no-referrer behavior. Chromium null-Origin form submissions require same-origin Fetch Metadata, expected Host and browser-bound CSRF/nonce validation. Cross-site null-Origin requests are rejected.

Queue correction: BullMQ prefix now includes environment and database to prevent notification IDs from different databases sharing a queue. Test and development databases remain separate. Do not run suites concurrently against the same test database.

Actual verification this session: TypeScript passed; 14 real PostgreSQL/API integration tests passed, 0 failed, 0 skipped. Actual headless Chromium with JavaScript disabled exercised initial scheduled home, preview safety, deliberate A opening, cookie sign-in, consent withdrawal, uncertainty handling, same personal link reaching B with assurance upgrade and no duplicate check-in, anonymous generic join, scoped control-room visibility, member/moderator denial, authenticated generic joining, branch-to-branch isolation, and worker restart with duplicate prevention. The final repeatable browser run passed all 12 checks. Screenshots and structured evidence are in `docs/evidence/`. Final regression outputs (14 integration tests and 12 browser checks, all passed) are recorded separately in this session's evidence file. Initial browser failures found null-Origin/referrer and CSP redirect interactions; fixes were verified by the passing browser journey. GitHub CI configuration is updated but has NOT been executed on GitHub.

Runtime: VPS systemd API and worker; HTTP `127.0.0.1:3100` only. No public application deployment. README documents SSH tunnel viewing and private fixture-session issuance. Browser test uses port 3200 and ctdmp_test. An immediate health request during service restart initially failed before startup completed; subsequent health check and service checks passed.

Provider modes: YouTube MOCK; WhatsApp MOCK/DRY_RUN; webhook MOCK_CONTRACT. Storage/maps/push/passkeys unavailable. No real messages, provider charges or real member data used. External browser navigation during tests is intercepted. Node and Playwright were installed/run on the VPS; no application files were created on the Mac.

Material gaps: interim frontend is Fastify-served HTML, not the proposed Next.js/Tailwind application (ADR-009). Control room has no candidate-management commands yet. No production authentication/recovery, actual Meta envelope/verification challenge, real source registry, physical-device evidence, native build, backup restore, complete permissions/privacy lifecycle, or launch approval. Browser screenshots at a mobile viewport do not prove device behavior or WCAG compliance. See NEXT_STEPS.md.

Historical note: the push failed before VPS GitHub CLI authentication was completed. This was resolved at the later checkpoint below; origin now tracks the pushed build branch.

## 26 October continuation

Branch: build/phase-1-browser-slice. The latest checkpoint is available with git log -1; prior source checkpoint was cbe4351 and documentation checkpoint 4050103. Full Phase 1 and the complete product are still unfinished.

Implemented on the VPS this session:

- JSON API and no-JavaScript browser commands for candidate approval/rejection, immutable replacement, completion, explicit Home-session selection, scoped transition reads and separately authorized pause/resume.
- Active global grants and a recently verified fictional session (15 minutes) are checked transactionally for mutations. Approved source/live-state/freshness checks remain mandatory for manual approvals. Stale program or selection/control revisions reject with 409; browser conflict and reauthentication states are explicit.
- Append-only program transitions and candidate decisions capture reasons, actors, safe evidence and revisions. Audit details record selection and sending reasons. Composite observation/program constraints prevent mismatched evidence rows.
- Worker and administrator paths share program-before-observation lock order. Completed sessions stay completed under late evidence. Recovery of the same source keeps its stream sequence, and manually rejected videos stay blocked automatically until a deliberate fresh approval.
- Public Home/resolution uses program_selections for configured ORGANIZATION_ID, default demo-org. A future local date alone does not select a program. Control room prioritizes the selected session.
- Idempotent, explicit-grant interactive mock scenario creation; worker-driven start-A/interruption/replacement-B/competing/provider-error evidence controls restricted to scenario-created records. Existing sessions and history are preserved.
- Authenticated fictional members can inspect their own prepared dry-run alerts and personal joining pages at /account/alerts. Other members cannot obtain their links. Mock joins now open local destination pages /demo/streams/{videoId}; they do not call YouTube or play a real broadcast. Production provider mode remains unavailable.

Migrations 003–005 were applied to development and isolated test databases. Actual verification: pnpm check passed TypeScript and 25 PostgreSQL/API integration tests (0 failures/skips). The latest Chromium suite passed 18 checks with JavaScript disabled, real loopback API/database/worker, and intercepted external requests. It covers the complete operator-facing scenario and own alert, A-to-B with one unique action, protected management forms, stale forms, branch isolation and worker restart. Outputs and screenshots are under docs/evidence/, including check-2026-10-26.txt, browser-2026-10-26.txt and browser-slice.json. This is simulated-provider evidence, not real delivery, full accessibility certification, or physical-device evidence.

Runtime remains API and worker systemd services on VPS loopback only. Provider modes: YouTube MOCK; WhatsApp MOCK/DRY_RUN; webhook MOCK_CONTRACT. Passkeys/storage/maps/push/native apps are unavailable. No real member data, real messages or provider charges were introduced. Complete manual run/view procedure and route contracts: README.md and docs/ADMINISTRATION.md.

Historical note for this checkpoint: GitHub CLI authentication had not yet been completed and no push was claimed at that time. Authentication and push were later completed; see the current checkpoint below.

Next build work: real passkey/recovery and administrator assurance; actual Meta verification/payload contracts and reconciliation; provider health/freshness; schedule/channel governance; privacy retention and rights; remaining acceptance/load/restore/accessibility evidence; Next.js and later product phases. Owner approval is still required before any real broadcast, spending or public deployment.

26 October final source checkpoint: 413ca32 (audited program administration and interactive recovery demo). A normal push of build/phase-1-browser-slice was attempted after the commit and failed with "could not read Username for https://github.com" because no CLI authentication was saved. The working tree is checkpointed on the VPS; no remote push is claimed. Final browser run passed all 18 checks after selected-session prioritization and current-source review UI fixes. The API/worker were restarted from this source and loopback liveness was rechecked.


## 26 October checkpoint — GitHub sync and provider health

Current branch build/phase-1-browser-slice is pushed to origin; VPS and remote branch agree at ee1ce30ddbbe919e32de053de79f2ebafdfdc9bd. GitHub CLI identity used was Jennycruzy. The previous authentication blocker is resolved.

Implemented and migrated 006_provider_health.sql. Worker observation handling now keeps a durable per-organization YouTube observation status, success/failure timestamps, safe error code, consecutive-failure count and revision. Results older than the recorded attempt cannot downgrade it. The control room shows unknown/healthy/degraded plus two-minute evidence freshness; /api/v1/admin/providers/health requires a global program.read grant. Provider health is explicitly separate from program-live state and currently describes only MOCK observation fixtures.

Actual verification on the Lightsail development host: pnpm check passed TypeScript and 25 PostgreSQL/API integration tests (25 passed, 0 failed, 0 skipped). The targeted provider-health case covers unknown state, grant denial, degraded then healthy recovery, out-of-order failure rejection and stale status. pnpm test:browser passed all 18 Chromium checks with JavaScript disabled. The versioned migration was applied to development and test databases. After service restart, both ctdmp-api and ctdmp-worker were active; /health/live returned {"status":"ok","mode":"MOCK"} and /health/ready returned {"status":"ready","scope":"database-only"}. The immediate post-restart probe raced startup and failed once; the follow-up probes passed.

During implementation, an initial integration run found a PostgreSQL timestamp parameter inference error; a later test edit caused a duplicate fixture grant. Both were corrected. The final complete pnpm check and browser run passed. Detailed evidence: docs/evidence/provider-health-2026-10-26.txt and updated browser screenshots/JSON.

Provider modes remain YouTube MOCK, WhatsApp MOCK/DRY_RUN, webhook MOCK_CONTRACT. No credentials, real member data, external messages, provider charges or public deployment were used. Production identity, real Meta payload handling, schedule/source governance, real receipt reconciliation, privacy retention and other product phases remain incomplete. Full Phase 1 acceptance has not passed.


## 26 October checkpoint — mock source governance

Added migration 007_channel_governance.sql, immutable channel approval history, and protected API/browser commands for mock source approval or revocation. Commands require a global program.manage grant, recent fixture authentication, a reason, and current program revision. Real source entries cannot be approved in the MOCK environment. Revoking the source behind the active stream moves the program to AWAITING_ADMIN so the resolver stops; re-approval alone does not restore a live claim. The control room labels this registry as mock-only.

Actual verification on Lightsail: pnpm check passed TypeScript and 26 PostgreSQL/API integration tests (26 passed, 0 failed, 0 skipped). The new case covers audit evidence, active-source suspension, personal-link recovery behavior, stale revision rejection, blocked real-source configuration, and branch-scoped grant denial. pnpm test:browser passed all 18 Chromium checks with JavaScript disabled. Migration 007 was applied to development and isolated test databases. After restarting ctdmp-api and ctdmp-worker, both services were active and liveness/readiness returned healthy responses. Evidence: docs/evidence/channel-governance-2026-10-26.txt.

This completes only fictional/mock source governance. Real YouTube channel authority, recurrence/time zone configuration, real account access, and provider-specific verification remain unset and unimplemented. Phase 1 acceptance and the complete product remain unfinished.


## 26 October checkpoint — mock delivery receipt reconciliation

Added migration 008_delivery_receipts.sql. Signed MOCK_CONTRACT webhook events are durably accepted into the inbox, processed asynchronously by the worker, deduplicated, retained as receipt history, and matched to a notification when its provider message ID becomes available. Unmatched authentic events remain available for later reconciliation. Notification delivery projections advance monotonically through sent, failed, delivered, and read-observed states; lower-ranked delayed events do not downgrade a later status. The scoped messaging.receipts.read API and control-room section show safe receipt state and unmatched/matched counts, and API reads are audited. This is not a real Meta payload or send implementation; provider mode stays MOCK_CONTRACT and no notification is sent.

Actual verification on Lightsail: pnpm check passed TypeScript and 26 PostgreSQL/API integration tests (26 passed, 0 failed, 0 skipped). The receipt case covers signature rejection, durable duplicate acceptance, unmatched persistence, later matching, monotonic delayed status, read observations, failed events, scoped access, audit, and control-room display. pnpm test:browser passed all 18 Chromium checks with JavaScript disabled. Migration 008 was applied to development and test databases. The API and worker were restarted; both are active, /health/live reports MOCK, and /health/ready reports database readiness. Evidence: docs/evidence/delivery-reconciliation-2026-10-26.txt.

The earlier final test run found a fixed test-fixture collision from a globally reused mock channel ID; the fixture now uses an organization-specific ID. The final complete checks passed. Remaining: actual Meta account mapping/payload contract, provider send and ambiguous-outcome reconciliation, rate-card reconciliation, privacy retention, owner-confirmed recurring schedules, and launch-ready authentication. Full Phase 1 acceptance has not passed.


## Current repository checkpoint — 26 October 2026

The implementation checkpoint at 675603464fc483a3fabbb50a2a8511cde3a3f3da was the repository state before schedule editing. The subsequent source-governance and delivery-reconciliation checkpoints are recorded below; the latest one-off-schedule implementation commit and push are recorded in the schedule section.


## 26 October checkpoint — one-off mock scheduling

Added migration 009_program_schedules.sql, audited schedule history, a protected API command and a no-JavaScript control-room form for one-off mock sessions. Administrators supply an RFC3339 timestamp with an explicit offset plus an IANA zone. The server verifies that the timestamp round-trips in that zone, rejects nonexistent daylight-saving times or offset mismatches, and requires a future time, current program revision, reason, recent fixture authentication and global program.manage. The session local date is derived from the entered wall time. Public current/next schedule contracts and Home display show the configured time without changing program state or claiming a stream is live.

A CSRF helper issue surfaced while testing the multi-form schedule control room: several forms on one response received different browser bindings. The request now reuses one random browser binding for all CSRF fields on that page.

Actual verification on Lightsail: pnpm check passed TypeScript and 27 PostgreSQL/API integration tests (27 passed, 0 failed, 0 skipped); pnpm test:browser passed all 18 Chromium checks with JavaScript disabled. The schedule test covers offset/time-zone mismatch, invalid zones, a nonexistent daylight-saving time, protected form submission, audit/history, stale revisions and rescheduling. Migration 009 is applied to development and test databases. The services restarted and returned active MOCK/database-ready health. Evidence: docs/evidence/program-schedule-2026-10-26.txt.

Limits: this is a one-off MOCK schedule editor. Real recurrence, the organization-approved schedule/time zone, authoritative channel evidence and live YouTube verification remain unconfigured. It is not a production schedule or launch approval.

Latest code checkpoint: 157670d22c3a9d5918bcbe8a35892f3c3ec2bebd was pushed to origin/build/phase-1-browser-slice and verified equal to GitHub's branch ref on 2026-10-27. The implementation worktree was clean immediately after that push.


## 27 October checkpoint — ephemeral retention

Migration 010 associates each encrypted notification URL with its digest-only join capability and expiry. The worker sweeps at most 500 records once per minute. It expires pending notices at their usefulness deadline; clears encrypted payloads on the next successful sweep after expiry and revokes their associated capability; deletes consumed/expired nonces; and removes revoked/expired link rows after references clear. Prepared mock alerts retain the encrypted URL through the capability's six-hour lifetime. The cleanup does not touch check-ins, consent, receipts, audit logs, or budget history.

Verification on the VPS: migration applied to development and test databases; TypeScript passed; 28 PostgreSQL/API checks passed with 0 failures or skips; 18 Chromium checks passed with JavaScript disabled. Browser evidence and screenshots were refreshed. Afterward ctdmp-worker restarted active and loopback liveness/readiness returned MOCK/database-ready. The SSH shell lacks a `pnpm` executable, so TypeScript/tsx were invoked through the Node 24 binary used by systemd; the suite itself ran the migration and integration checks. Full output and scope limits: docs/evidence/ephemeral-retention-2026-10-27.txt.

Limits: production retention durations, raw provider-event retention, key rotation, account export/deletion, backup tombstones, and future sensitive-data classes remain unresolved. This local fixture cleanup is not production privacy compliance.
