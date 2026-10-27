# Status — 27 October 2026

## VPS continuation — durable notification queue recovery

After the WhatsApp-link slice, the worker queue handoff was extracted to packages/shared/dispatch-queue.ts. Each worker cycle rebuilds BullMQ jobs by scanning durable PostgreSQL PLANNED notifications, using stable notification job IDs and a bounded batch. PostgreSQL remains the source of truth; prepared or suppressed notifications are not eligible for reconstruction.

A new isolated Redis/BullMQ integration case creates two pending notifications, enqueues them, clears only its unique test queue, and verifies both are recovered. It repeats reconciliation to check job uniqueness, marks one notification prepared, clears the test queue again, and verifies only the still-planned notification returns.

Queue-recovery verification on the VPS: pnpm check passed TypeScript and 34/34 PostgreSQL/API tests; pnpm test:browser passed all 21 Chromium checks. After restarting ctdmp-worker, systemd reported active; API liveness returned MOCK/ok and readiness returned database-only/ready. git diff --check passed. This simulates loss of BullMQ queue state under a unique test prefix; it is not a Redis server outage or a production failover drill. No real provider traffic, charges, or member data were used.


## VPS continuation — notification freshness

Added T-MSG-10 integration coverage for an alert whose usefulness deadline has passed and a notification whose program has completed. Both are suppressed before preparation, their encrypted personal URL is cleared and associated join link revoked, and no cost-ledger entry or budget reservation is created. The VPS pnpm check passed TypeScript and 35/35 PostgreSQL/API tests. Browser code did not change in this slice; the previous 21-check browser run remains the latest browser evidence. This does not exercise a real Meta sender.

## VPS continuation — notification template eligibility

Added T-MSG-03 integration coverage for a mock template disabled after an alert was planned and for a template whose version changes before dispatch. Both paths suppress the notification, clear its encrypted personal URL, revoke its join capability, and create no ledger or budget reservation. The VPS pnpm check passed TypeScript and 36/36 PostgreSQL/API tests. The full GitHub Actions run 40494100605 passed on e880c8d, including 36 API/database tests and the 21-check browser suite.

## VPS continuation — accessible text scaling and slow-network joining

Shared page typography now follows root-relative text sizing, including navigation, headings, forms, and controls. The no-JavaScript browser slice checks keyboard skip/focus behavior and 360px Home layout. Separate Chromium contexts simulate 200% browser text scaling at 360px: computed body text reaches 34px on Home, and both Home and the administrator control room have no horizontal overflow. Another JavaScript-disabled Chromium context uses 400ms latency, 64KB/s download, and 32KB/s upload; the live page and deliberate Join action resolve to fictional Stream A.

The VPS browser run passed all 24 checks; screenshots are docs/evidence/screenshots/mobile-home-360-text-200.png and docs/evidence/screenshots/admin-360-text-200.png, with structured results in docs/evidence/browser-slice.json. GitHub Actions run 40496652240 passed on ca51f60 (TypeScript, 36 PostgreSQL/API tests, and 23 browser checks). The added control-room text-scale assertion passes locally and is awaiting CI on the next commit. These are focused simulations, not screen-reader, physical-device, carrier-network, or WCAG 2.2 AA certification.

## Active continuation — mock WhatsApp identity linking

The last pushed baseline is ca51f60 on origin/build/phase-1-browser-slice; the additional control-room text-scale check is the current uncommitted continuation. Current work extends the mock WhatsApp link slice with identity replacement behavior and integration/browser coverage. Migration 015 and the simulator remain local/test only. The member security page can start a challenge for a reserved fictitious test number, displays a one-time mock code without cache, and lists only masked linked identities with an unlink action. A recently authenticated demo.manage administrator can submit a separate mock inbound event. The flow stores keyed digests and an encrypted destination, limits attempts to five, expires challenges after ten minutes, and cleans stale challenges in the worker. It cannot contact Meta or verify real phone ownership.

The configured database is APP_ENV=local, /ctdmp, provider mock, outbound disabled. Migration 015 is applied. API and worker are active; after restart, loopback liveness returned {"status":"ok","mode":"MOCK"} and readiness returned {"status":"ready","scope":"database-only"}. The mock link now replaces an existing test identity only after the new sender/code is confirmed; a failed collision leaves the previous link intact. pnpm check passed TypeScript and all 33 PostgreSQL/API tests. pnpm test:browser passed 21 checks, including the no-JavaScript challenge, privileged mock inbound, masked identity and unlink flow. Evidence: docs/evidence/whatsapp-linking-2026-10-27.txt and docs/evidence/screenshots/mock-whatsapp-linked.png. No real WhatsApp identity or delivery was tested.



## CI failure investigation — 27 October 2026

GitHub Actions foundation runs 40463968170, 40465814710, 40475601153, and 40475700889 failed in the pnpm check step. The latest run showed account-creation returning 404 and the following recovery case failing because the fresh ctdmp_test database lacked demo-org. scripts/test.ts migrated the database but seeded fixtures only in the browser path. The standard test path now runs the idempotent fictional seed after migrations. On the VPS, pnpm check then passed TypeScript and 31/31 PostgreSQL/API tests. GitHub Actions run 40477949371 passed on commit 315e266, including pnpm check, Chromium installation, and pnpm test:browser. The suite does not include WhatsApp-link-specific assertions.

Phase 0 foundation and Phase 1 backend/browser slice implemented in part. Full Phase 1 acceptance has NOT passed. Repository on VPS: `/home/ubuntu/ctdmp-connect`; origin `https://github.com/mrowns/Ctdmp-family.git`. Existing backend preserved in baseline commit `0684aa8`; implementation checkpoint `cbe4351` on branch `build/phase-1-browser-slice`; latest documentation checkpoint is identified by `git log -1`.

Working backend: PostgreSQL migrations and fictional fixtures; validated mock-only local/test configuration; loopback PostgreSQL/Redis; preview-safe joining with conservative identity assurance; immutable Stream A→B versions; initial-event/logical-notification uniqueness; encrypted delivery payload; transactional simulated budget/consent checks; BullMQ worker; signed fictional webhook inbox.

Added browser slice: responsive semantic server-rendered `/` and `/live`; authenticated `/account`, `/account/history`, `/account/preferences`; protected development access-code form; one-hour random fixture-session issuance; HttpOnly/SameSite=Strict cookie sessions and server-side logout revocation; protected forms; generic deliberate joining (anonymous is unattributed, authenticated writes a unique action); scoped read-only `/admin` with stream history, watcher evidence, permitted branch rows and separately granted simulated budget data. HTML safely escapes dynamic content. All routes retain no-store/no-referrer behavior. Chromium null-Origin form submissions require same-origin Fetch Metadata, expected Host and browser-bound CSRF/nonce validation. Cross-site null-Origin requests are rejected.

Queue correction: BullMQ prefix now includes environment and database to prevent notification IDs from different databases sharing a queue. Test and development databases remain separate. Do not run suites concurrently against the same test database.

Actual verification this session: TypeScript passed; 14 real PostgreSQL/API integration tests passed, 0 failed, 0 skipped. Actual headless Chromium with JavaScript disabled exercised initial scheduled home, preview safety, deliberate A opening, cookie sign-in, consent withdrawal, uncertainty handling, same personal link reaching B with assurance upgrade and no duplicate check-in, anonymous generic join, scoped control-room visibility, member/moderator denial, authenticated generic joining, branch-to-branch isolation, and worker restart with duplicate prevention. The final repeatable browser run passed all 12 checks. Screenshots and structured evidence are in `docs/evidence/`. Final regression outputs (14 integration tests and 12 browser checks, all passed) are recorded separately in this session's evidence file. Initial browser failures found null-Origin/referrer and CSP redirect interactions; fixes were verified by the passing browser journey. GitHub CI configuration is updated but has NOT been executed on GitHub.

Runtime: VPS systemd API and worker; HTTP `127.0.0.1:3100` only. No public application deployment. README documents SSH tunnel viewing and private fixture-session issuance. Browser test uses port 3200 and ctdmp_test. An immediate health request during service restart initially failed before startup completed; subsequent health check and service checks passed.

Provider modes: YouTube MOCK; WhatsApp MOCK/DRY_RUN; webhook MOCK_CONTRACT. Passkeys and one-time recovery codes work only in local/test. Storage/maps/push/native apps remain unavailable. No real messages, provider charges or real member data used. External browser navigation during tests is intercepted. Node and Playwright were installed/run on the VPS; no application files were created on the Mac.

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

Latest code checkpoint: de698e1eafe74c18c41337789a17adf4aa71bf62 was pushed to origin/build/phase-1-browser-slice and verified equal to GitHub's branch ref on 2026-10-27. The implementation worktree was clean immediately after that push.


## 27 October checkpoint — ephemeral retention

Migration 010 associates each encrypted notification URL with its digest-only join capability and expiry. The worker sweeps at most 500 records once per minute. It expires pending notices at their usefulness deadline; clears encrypted payloads on the next successful sweep after expiry and revokes their associated capability; deletes consumed/expired nonces; and removes revoked/expired link rows after references clear. Prepared mock alerts retain the encrypted URL through the capability's six-hour lifetime. The cleanup does not touch check-ins, consent, receipts, audit logs, or budget history.

Verification on the VPS: migration applied to development and test databases; TypeScript passed; 28 PostgreSQL/API checks passed with 0 failures or skips; 18 Chromium checks passed with JavaScript disabled. Browser evidence and screenshots were refreshed. Afterward ctdmp-worker restarted active and loopback liveness/readiness returned MOCK/database-ready. The SSH shell lacks a `pnpm` executable, so TypeScript/tsx were invoked through the Node 24 binary used by systemd; the suite itself ran the migration and integration checks. Full output and scope limits: docs/evidence/ephemeral-retention-2026-10-27.txt.

Limits: production retention durations, raw provider-event retention, key rotation, account export/deletion, backup tombstones, and future sensitive-data classes remain unresolved. This local fixture cleanup is not production privacy compliance.


## 27 October checkpoint — Meta WhatsApp webhook contract

Added a disabled-by-default Meta WhatsApp callback route. The GET handshake validates the configured token and returns the supplied challenge as plain text. POST verifies `X-Hub-Signature-256` over the original request bytes, parses the versioned WhatsApp Business Account status envelope, requires a configured enabled phone-number/WABA mapping, then transactionally inserts only normalized receipt fields into the durable inbox. Duplicate status callbacks are idempotent and flow through the existing unmatched/matched receipt processor with provider key `meta-whatsapp`. Recipient numbers and raw webhook bodies are not stored by this path.

The current adapter deliberately rejects inbound member messages and unsupported WhatsApp webhook fields so they are not acknowledged and silently lost. Message-intent handling, account/number ownership, mapping administration, real sender integration and Meta account activation remain incomplete. `META_WEBHOOK_ENABLED` defaults to false, the mapping registry is empty, outbound sending remains disabled, and production environments remain blocked. Payload shape reference: Meta's official [WhatsApp Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-ba924e99-3d98-4954-b4e3-73a519939c33).

Actual verification on the VPS: migration 011 applied to development and isolated test databases; TypeScript passed; 29 PostgreSQL/API tests passed with 0 failures/skips; 18 Chromium checks passed with JavaScript disabled. The new case verifies challenge and signature failures, durable deduplication, phone/WABA mismatch handling, normalized privacy-safe storage, receipt reconciliation, and inbound-message rejection. No real Meta credentials/account or external webhook was used. After the code restart, liveness/readiness returned MOCK/database-ready and the disabled Meta route returned 404. The first immediate probe raced startup; retry succeeded. See docs/evidence/meta-webhook-2026-10-27.txt.


## 27 October checkpoint — WebAuthn passkey sign-in

Source checkpoint: `37cb636de884f5f4801cf486149467e9584486be` on `build/phase-1-browser-slice`.

Added `@simplewebauthn/server` 14.0.3 and `@simplewebauthn/browser` 14.0.0 from the maintained SimpleWebAuthn packages. Migration 012 adds discoverable-account handles, public credential records, one-use browser-bound challenges, revocable member sessions, and recent-authentication records. The RP ID and expected origin are fixed configuration values; local defaults use `localhost` and the configured port. Public/staging startup remains rejected while `APP_ENV` is not local/test.

A recently authenticated fictional member can register a resident passkey with user verification required. The server verifies origin, RP ID, challenge, signature and user verification using SimpleWebAuthn; it stores the public key, counter, transport/device/backup metadata and a label. Passkey login uses discoverable credentials, checks the returned user handle, updates the counter and creates a digest-stored 12-hour session in an HttpOnly, SameSite=Strict cookie. Logout and credential revocation revoke server-side sessions. The account security page lists registered passkeys. Browser code is served locally from the pinned package under a same-origin-only script/connect CSP.

Fixture sign-in remains an explicitly labeled development bootstrap for registering the first passkey on fictional accounts. Public account creation, username setup, real-provider WhatsApp linking, recovery, real-domain RP configuration, production admin assurance and physical-device checks are not complete. The API and worker were restarted and both reported active; loopback liveness/readiness returned MOCK/database-ready, and the passkey UI plus locally served browser module returned HTTP 200. The services remain loopback-only; no public app deployment or real provider use occurred.

Actual verification: `pnpm typecheck` passed; `pnpm test` passed all 29 PostgreSQL/API checks; `pnpm test:browser` passed the existing browser slice plus a Chromium virtual authenticator registration and discoverable passkey sign-in. The passkey browser case used a unique fictional member in isolated `ctdmp_test`. Detailed output is recorded in `docs/evidence/webauthn-2026-10-27.txt`; browser JSON is `docs/evidence/browser-slice.json`. Full Phase 1 acceptance and the complete product remain unfinished.



27 October update: development-only account creation is now implemented through the first verified passkey ceremony. Migration 013 adds organization-scoped normalized usernames and expiring pending registrations. New members remain inactive until resident-key registration verifies with required user verification; registration adds no branch or role, and live-start alert preferences default off. The worker removes expired pending signups. Public runtime remains blocked. Verification: pnpm check passed TypeScript and 30 PostgreSQL/API tests; pnpm test:browser passed 19 Chromium checks, including signup, a second-device virtual passkey, discoverable sign-in, plus the existing joining/recovery and scoped-access scenarios. Evidence: docs/evidence/account-passkey-2026-10-27.txt and docs/evidence/browser-slice.json. Recovery, verified WhatsApp linking, real domain/RP setup, physical-device checks, and production auth remain incomplete. Full Phase 1 is not complete.



27 October update: local/test account recovery is implemented with eight random one-time codes stored only as SHA-256 digests. Generating a new set invalidates the previous set; a successful recovery consumes all codes, revokes existing member sessions, issues a 12-hour session and allows registering a replacement passkey. Attempts are limited to eight per browser token per 15-minute window, with one-day bucket cleanup. The no-JavaScript browser journey passes. Verification: pnpm check passed TypeScript and 31 PostgreSQL/API tests; pnpm test:browser passed 20 Chromium checks. Evidence: docs/evidence/recovery-codes-2026-10-27.txt and docs/evidence/browser-slice.json. This remains local/test only; production recovery policy, stronger distributed abuse controls, verified WhatsApp linking, domain/RP setup, physical-device validation and full Phase 1 remain incomplete.
