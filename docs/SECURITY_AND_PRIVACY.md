# Security and privacy

Assets: member identity, private religious link actions, consent, bearer capabilities, staff grants, provider secrets and budget state. Boundaries: browser/API; provider/webhook; API/worker/DB; Redis; operator/root. Only fictional data is allowed in this development build.

Implemented controls: 256-bit random tokens, digest-only join table, AES-GCM delivery envelope, short-lived browser-bound single-use nonce, origin check and SameSite/HttpOnly cookie, unique action keys, current source revalidation, authenticated-account mismatch rejection, scoped SQL history filtering, grants read on each request, HMAC raw-byte mock ingress plus a disabled-by-default Meta status adapter and unique inbox keys, isolated mock budget transaction, no automatic real sending, no request-path logs, no-store/no-referrer/CSP headers and loopback services.

Threats/residual work: public account creation, recovery and verified identity linking remain absent; fixture sessions are not public authentication. Rate limits, durable audit for every sensitive command, complete tenant-consistent grant constraints, historical branch intervals, migrations/ledger immutability privileges, provider raw-event retention, encryption key rotation, full deletion/exports, minors/safeguarding and the production retention matrix remain incomplete. No real religious/member data until owner-approved policies and controls exist.

Mock source matching is deliberately narrow and is not approved for production. Real inbound WhatsApp message handling, provider activation and sender integration remain absent. Status receipts use a normalized durable inbox. Actual exactly-once provider delivery is not claimed; an eventual provider timeout must create OUTCOME_UNKNOWN, never blind retry.

A bounded worker cleanup now clears encrypted notification payloads on a worker sweep after their usefulness or capability expiry, removes consumed/expired join nonces, revokes stale links and deletes unreferenced expired link digests. The member alert keeps its encrypted link only while the six-hour join capability is valid. This narrow lifecycle does not replace the owner-approved production retention matrix. The journal/pastor request/content features do not yet exist. Nothing is sent to an optional model provider. No spiritual scores or watching claims.

SSH access is restricted to approved source plus browser SSH at the cloud firewall. Application processes run as ubuntu with no new privileges and systemd filesystem restrictions. Operators with root remain able to inspect development data; this is not end-to-end encryption.


## WebAuthn passkey slice (2026-10-27)

The local/test member flow uses SimpleWebAuthn server and browser packages. RP ID and exact expected origin are fixed configuration; they are never derived from an incoming Host header. Registration requires recent authentication, a resident credential and user verification. Login uses discoverable credentials and requires user verification. Server verification checks the single-use challenge, origin, RP ID, credential signature and returned user handle. Challenges are browser-bound and expire after five minutes. The service stores only authenticator public material, counters and metadata; it never receives the authenticator's private key or biometric data.

A successful passkey ceremony issues a random 12-hour session token; only its digest is stored. The browser cookie is HttpOnly and SameSite=Strict, Secure when the configured origin is HTTPS, and server-revocable. Credential removal revokes sessions created by that credential and refuses to remove the last active passkey. Expired challenges and stale sessions are removed by bounded worker retention.

This remains a local/test authentication slice. Fixture sign-in is the bootstrap for fictional accounts. User-facing account creation and recovery, verified WhatsApp linking, an owner-controlled HTTPS domain/RP policy, robust distributed rate limiting, production administrator assurance, and physical-device/native validation remain launch blockers. A Chromium virtual authenticator proves the local ceremony only; it does not establish platform behavior or production readiness.
