# Security and privacy

Assets: member identity, private religious link actions, consent, bearer capabilities, staff grants, provider secrets and budget state. Boundaries: browser/API; provider/webhook; API/worker/DB; Redis; operator/root. Only fictional data is allowed in this development build.

Implemented controls: 256-bit random tokens, digest-only join table, AES-GCM delivery envelope, short-lived browser-bound single-use nonce, origin check and SameSite/HttpOnly cookie, unique action keys, current source revalidation, authenticated-account mismatch rejection, scoped SQL history filtering, grants read on each request, HMAC raw-byte mock ingress and unique inbox key, isolated mock budget transaction, no automatic real sending, no request-path logs, no-store/no-referrer/CSP headers and loopback services.

Threats/residual work: passkeys and admin reauthentication absent; fixture sessions are not public authentication. Rate limits, durable audit for every sensitive command, complete tenant-consistent grant constraints, historical branch intervals, migrations/ledger immutability privileges, provider raw-event retention, encryption key rotation, full deletion/exports, minors/safeguarding and the production retention matrix remain incomplete. No real religious/member data until owner-approved policies and controls exist.

Mock source matching is deliberately narrow and is not approved for production. Real webhook contract and receipt reconciliation are absent. Actual exactly-once provider delivery is not claimed; an eventual provider timeout must create OUTCOME_UNKNOWN, never blind retry.

A bounded worker cleanup now clears encrypted notification payloads on a worker sweep after their usefulness or capability expiry, removes consumed/expired join nonces, revokes stale links and deletes unreferenced expired link digests. The member alert keeps its encrypted link only while the six-hour join capability is valid. This narrow lifecycle does not replace the owner-approved production retention matrix. The journal/pastor request/content features do not yet exist. Nothing is sent to an optional model provider. No spiritual scores or watching claims.

SSH access is restricted to approved source plus browser SSH at the cloud firewall. Application processes run as ubuntu with no new privileges and systemd filesystem restrictions. Operators with root remain able to inspect development data; this is not end-to-end encryption.
