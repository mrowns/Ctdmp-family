# Next coding steps — 25 October 2026

1. Complete the remaining Phase 1 contracts: production identity preparation, owner-confirmed schedule configuration and real official-channel registry. Mock-only approval controls are now available; delivery reconciliation and privacy retention remain open. Provider health/freshness has a MOCK-only durable projection and admin view. Candidate approval/rejection, replacement/finish, explicit Home-session selection, audit reasons and pause/resume now work in the private fixture environment.
2. Implement real WebAuthn/passkeys, verified WhatsApp linking and recovery before any public pilot. Current browser access is operator-issued one-hour fictional sessions only; production startup remains blocked.
3. Extend the interim server-rendered frontend into the proposed Next.js/Tailwind application while preserving semantic forms and server-enforced authorization. Add replay contracts, full category preferences, pagination, OpenAPI and typed clients.
4. Implement Meta verification challenge and actual versioned payload contracts following current official documentation. Current signed webhook is explicitly a fictional contract; no account is connected.
5. Add encrypted payload/nonces retention and key rotation, membership interval rules, richer sensitive-read audit, campaign approval revisions, monotonic receipt processing and OUTCOME_UNKNOWN reconciliation. Mock budget and dedup tests do not establish production send correctness.
6. Finish first-slice acceptance evidence: deterministic user-operated scenario controls, paused templates/freshness, Redis-loss recovery, scoped moderation and replay boundaries, keyboard/large-text/slow-network accessibility checks, sanitized database/API evidence, restore drill, representative load and dependency/secret scans.
7. Later content, verified directory, real human handoff, privacy lifecycle and native apps remain unimplemented. No real contacts/channels/schedules/affiliation are assumed.

Completed this session: member home/history/preferences, deliberate generic join, protected cookie fixture sessions and sign-out revocation, scoped read-only control room, queue isolation, actual Chromium no-JavaScript Stream A→B browser evidence and screenshots. README has verified run/view commands.

`pnpm demo` remains the original one-shot demo and must not reset its history. `pnpm test:browser` is repeatable: it creates a fresh fictional session in ctdmp_test, starts a separate environment/database-scoped worker, intercepts all external browser requests, and saves evidence. Do not run it concurrently with the integration suite against the same test database.

Next real integration decisions: authoritative channel IDs and schedule; account/branding authority; complete authentication/recovery policy. Meta activation additionally requires actual owned account/templates, consented destinations, approved budget/retention and explicit send approval. No secrets should be requested in chat.

26 October progress: program commands and append-only transition/evidence history; terminal completion and same-source recovery fixes; explicit Home selection; recent fixture authentication and separate management grants; idempotent owner-facing scenario creation; worker-driven A/interruption/B controls; own prepared test-alert pages; local mock destination pages. 25 integration tests and 18 browser checks passed. docs/ADMINISTRATION.md contains the runnable procedure. At this historical checkpoint, the VPS CLI was not yet authenticated; this was later resolved as recorded below.


26 October update: GitHub auth completed on the VPS and build/phase-1-browser-slice is pushed at ee1ce30ddbbe919e32de053de79f2ebafdfdc9bd. Durable MOCK YouTube observation health/freshness, scoped API read, and control-room display are implemented and verified. Immediate coding priorities are privacy retention and real Meta provider mapping. The current receipt pipeline handles only signed MOCK_CONTRACT callbacks and cannot reconcile real sends or ambiguous submissions. The mock source controls do not establish real channel authority; recurrence, time zone and real source activation still depend on owner decisions.


26 October update: mock official-source governance is implemented with audited approval history, scoped/recent-auth commands, revision checks, and active-source revocation handling. Real channel IDs and schedule recurrence remain owner-gated. Verification is 26/26 integration tests and 18/18 browser checks; see docs/evidence/channel-governance-2026-10-26.txt.


26 October update: durable signed mock receipt inbox processing, unmatched-to-matched reconciliation, monotonic status projections, scoped/audited receipt reads, and an admin view are implemented. Migration 008 is applied. Verification: 26/26 integration tests and 18/18 browser checks passed. This does not validate Meta's real webhook format or provider delivery; those require official documentation and account mapping.
