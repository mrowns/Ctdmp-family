# Architecture

TypeScript pnpm monorepo: apps/api (Fastify), apps/worker (BullMQ), packages/db (PostgreSQL, Drizzle and transactional SQL), packages/shared (configuration/domain), packages/integrations (token and encryption utilities). apps/web and apps/mobile are reserved placeholders.

PostgreSQL is authoritative for program/stream versions, outbox, notification identity, consent, join capabilities/nonces, engagement and simulated cost ledger. Redis queues contain notification IDs only. The worker scans durable pending records, so Redis loss does not destroy logical identity. Duplicate jobs remain safe through transactional checks.

Observation → locked program revision → immutable stream version + unique outbox event → recipient preparation with encrypted token delivery payload → fresh consent/template/budget checks → MOCK dry-run preparation. No outbound Meta adapter exists.

GET joining page creates only a transient nonce and browser context. Protected POST checks origin, capability, nonce, member status, current source approval and current destination, then atomically consumes nonce and upserts a unique action before 303. Anonymous token actions are TOKEN_ASSOCIATED; matching fixture sessions upgrade to AUTHENTICATED_MEMBER without increasing unique counts. Conflicting accounts are refused attribution.

All services are loopback-only on the VPS; no reverse proxy, HTTPS, public DNS or production infrastructure is configured. Database Redis and application logs do not intentionally include bearer links. Fastify request logging is disabled pending a reviewed redaction logger.

The present mock title/date matcher is not a production verifier. Human approval commands, competing-candidate tooling, schedule recurrence and real provider health policies still need implementation.


## Passkey authentication — local/test slice

A fixed `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` configure both the server verification and browser ceremony. Defaults resolve to `localhost` at the configured local port; no request Host value changes the relying party. Registration options create required resident credentials with user verification. Challenges are short-lived, single-use, and tied to a digest of the browser CSRF cookie and, for registration, the current member.

The server stores a random per-member WebAuthn user handle, credential public key, credential ID, counter, transport/device/backup metadata and display label. Private keys remain in authenticators. Discoverable login verifies the account handle and signature, then creates an opaque 12-hour member session whose digest is stored in PostgreSQL. The browser receives only an HttpOnly, SameSite=Strict cookie. Session verification records support the same recent-authentication gate as fixture bootstrap sessions. Browser modules are served from the installed pinned dependency under a same-origin CSP.

The first passkey is added only after a recent fixture sign-in on a fictional member. This is not public account creation or production authentication. Recovery, verified WhatsApp linking, owned-domain configuration, production session/admin policy and native/physical-device support remain open.
