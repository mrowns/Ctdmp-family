# Next coding steps — 25 October 2026

## Current VPS continuation — 27 October

The latest pushed checkpoint is b01ef31; GitHub Actions run 40497372947 is validating the 36-test API/database and 24-check browser suite. The current VPS worktree passes TypeScript plus 37/37 PostgreSQL/API tests and 24/24 browser checks. It adds OPS-002 deterministic failure injection after a partial enqueue: PostgreSQL retains both PLANNED notifications and recovery restores both stable jobs without duplication. Evidence: docs/evidence/queue-outage-recovery-2026-10-27.txt. This is not a Redis-server outage/failover drill. A complete Redis host outage/failover drill, scoped moderation/replay boundaries, screen-reader/physical-device accessibility evidence, restore/load checks, and dependency/secret scans remain.

1. Complete the remaining Phase 1 contracts: production identity preparation, owner-confirmed schedule configuration and real official-channel registry. Mock-only approval controls are now available; delivery reconciliation and privacy retention remain open. Provider health/freshness has a MOCK-only durable projection and admin view. Candidate approval/rejection, replacement/finish, explicit Home-session selection, audit reasons and pause/resume now work in the private fixture environment.
2. WebAuthn passkey registration, discoverable sign-in, development-only self-registration and one-time recovery codes now work for fictional members. New accounts remain inactive until the first passkey verifies and begin with alerts off. Complete production recovery and signup policy, real-provider WhatsApp identity linking, real-domain RP configuration, stronger distributed abuse controls, administrator assurance and physical-device checks before any pilot. Production startup remains blocked.
3. Extend the interim server-rendered frontend into the proposed Next.js/Tailwind application while preserving semantic forms and server-enforced authorization. Add replay contracts, full category preferences, pagination, OpenAPI and typed clients.
4. A disabled-by-default Meta challenge and status-only webhook contract now maps signed delivery receipts through an explicitly enabled phone/WABA registry. Remaining: inbound message processing, account ownership/onboarding, current provider-version validation, real send/reconciliation and explicit activation approval.
5. A bounded cleanup for encrypted notification payloads and short-lived join capabilities is implemented. Remaining: encryption key rotation, retention periods for each production data class, membership interval rules, richer sensitive-read audit, campaign approval revisions and OUTCOME_UNKNOWN reconciliation. Monotonic mock receipt projections are implemented; current Meta receipt semantics still need account/provider validation. Mock budget and dedup tests do not establish production send correctness.
6. Finish first-slice acceptance evidence: Redis queue reconstruction, stale/completed alert suppression, and template withdrawal/version drift are now tested. Remaining work includes Redis host outage/failover, scoped moderation/replay boundaries, screen-reader/physical-device accessibility checks across more routes, sanitized database/API evidence, restore drill, representative load and dependency/secret scans.
7. Later content, verified directory, real human handoff, privacy lifecycle and native apps remain unimplemented. No real contacts/channels/schedules/affiliation are assumed.

Completed this session: member home/history/preferences, deliberate generic join, protected cookie fixture sessions and sign-out revocation, scoped read-only control room, queue isolation, actual Chromium no-JavaScript Stream A→B browser evidence and screenshots. README has verified run/view commands.

`pnpm demo` remains the original one-shot demo and must not reset its history. `pnpm test:browser` is repeatable: it creates a fresh fictional session in ctdmp_test, starts a separate environment/database-scoped worker, intercepts all external browser requests, and saves evidence. Do not run it concurrently with the integration suite against the same test database.

Next real integration decisions: authoritative channel IDs and schedule; account/branding authority; complete authentication/recovery policy. Meta activation additionally requires actual owned account/templates, consented destinations, approved budget/retention and explicit send approval. No secrets should be requested in chat.

26 October progress: program commands and append-only transition/evidence history; terminal completion and same-source recovery fixes; explicit Home selection; recent fixture authentication and separate management grants; idempotent owner-facing scenario creation; worker-driven A/interruption/B controls; own prepared test-alert pages; local mock destination pages. 25 integration tests and 18 browser checks passed. docs/ADMINISTRATION.md contains the runnable procedure. At this historical checkpoint, the VPS CLI was not yet authenticated; this was later resolved as recorded below.


26 October update: GitHub auth completed on the VPS; the current build/phase-1-browser-slice code checkpoint is de698e1eafe74c18c41337789a17adf4aa71bf62. Durable MOCK YouTube observation health/freshness, scoped API read, and control-room display are implemented and verified. Immediate coding priorities are privacy retention and real Meta provider mapping. The current receipt pipeline handles only signed MOCK_CONTRACT callbacks and cannot reconcile real sends or ambiguous submissions. The mock source controls do not establish real channel authority; recurrence, time zone and real source activation still depend on owner decisions.


26 October update: mock official-source governance is implemented with audited approval history, scoped/recent-auth commands, revision checks, and active-source revocation handling. Real channel IDs and schedule recurrence remain owner-gated. Verification is 26/26 integration tests and 18/18 browser checks; see docs/evidence/channel-governance-2026-10-26.txt.


26 October update: durable signed mock receipt inbox processing, unmatched-to-matched reconciliation, monotonic status projections, scoped/audited receipt reads, and an admin view are implemented. Migration 008 is applied. Verification: 26/26 integration tests and 18/18 browser checks passed. This does not validate Meta's real webhook format or provider delivery; those require official documentation and account mapping.


26 October update: one-off mock session scheduling is implemented with timezone/offset round-trip checks, daylight-saving gap rejection, revision/history/audit, protected no-JavaScript form, and public schedule display. It does not establish the real CTDMP schedule or recurrence. Latest checks: 27/27 integration tests and 18/18 browser checks; see docs/evidence/program-schedule-2026-10-26.txt.


27 October update: migration 010 and a bounded worker cleanup now expire stale planned notices, erase encrypted joining payloads on a worker sweep after their usefulness/capability deadline, remove consumed or expired nonces, and delete unreferenced revoked/expired link digests. Actual checks passed: 28/28 PostgreSQL/API and 18/18 Chromium with JavaScript disabled. Evidence: docs/evidence/ephemeral-retention-2026-10-27.txt. This does not select production retention periods or complete data rights, key rotation, or raw provider-event retention.


27 October update: implemented a disabled-by-default Meta WhatsApp webhook challenge and signed status-only callback adapter. It verifies raw-body HMAC, maps phone-number and WABA IDs to an enabled organization record, stores normalized status receipts idempotently, and reuses the durable receipt processor. Fictional integration tests cover challenge success/failure, signatures, mapping mismatch, privacy-safe normalization and inbound-message rejection. Latest verification: 29/29 PostgreSQL/API checks and 18/18 Chromium checks. No Meta secret, account, phone mapping, inbound message, or outbound send is configured. Evidence: docs/evidence/meta-webhook-2026-10-27.txt.


27 October checkpoint at migration 012: local WebAuthn registration, discoverable sign-in, credential listing/revocation, digest-stored sessions and browser-bound challenge cleanup were implemented and verified. At that checkpoint, account creation remained the next auth task; migration 013 and the following update implement development-only self-registration. Recovery, verified identity linking, real domain configuration, production administrator policy and physical-device evidence remain open. See docs/evidence/webauthn-2026-10-27.txt.



27 October account-creation checkpoint: dev-only self-registration activates only after a verified first passkey; 30-minute pending records are cleaned up and alert preferences default off. At that checkpoint, the 30-test PostgreSQL/API suite and 19-check browser suite passed. Recovery codes are implemented in the following update. See docs/evidence/account-passkey-2026-10-27.txt.



27 October update: local/test passkey recovery codes are implemented and verified with the full browser flow. Next authentication work is verified WhatsApp identity linking, production recovery/signup policy, stronger distributed abuse controls, real-domain RP configuration and physical-device checks. See docs/evidence/recovery-codes-2026-10-27.txt.


27 October update: the account security page now supports a local/test-only WhatsApp identity-link simulation. It accepts reserved fictional numbers, stores only keyed challenge/phone digests plus an encrypted destination, requires recent member authentication and a recent demo.manage administrator for the mock inbound event, masks the resulting identity, supports unlinking, and cleans expired challenges. The app remains MOCK/DRY_RUN; no Meta traffic or real phone-ownership verification occurs. Migration 015 was applied to the local development database, API/worker services restarted and loopback health/readiness returned ok/ready. pnpm typecheck passed. No API or browser test suite was run for this change; feature-level integration/browser acceptance remains outstanding. Next: add approved automated cases when test execution is requested, then implement real provider linking only after account, consent, and Meta activation decisions.


27 October CI repair: the non-browser test path seeds its isolated database after migrations. This fixed the recent fresh-database account-creation/recovery failures; GitHub runs 40477949371 and 40478178531 passed. The follow-up WhatsApp mock-link work adds sender/code, permission, five-attempt, replacement, unlink and retention coverage; pnpm check passes 33/33 PostgreSQL/API tests and pnpm test:browser passes 21 checks including the no-JavaScript account/admin flow. Evidence is in docs/evidence/whatsapp-linking-2026-10-27.txt. The next Phase 1 work is remaining independent reliability, privacy, accessibility and recovery acceptance, while real schedules/channels/Meta activation stay owner-gated.
