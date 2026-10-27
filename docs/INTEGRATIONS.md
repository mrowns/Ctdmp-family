# Integrations

| Service | Current mode | Evidence/limits |
|---|---|---|
| YouTube | deterministic MOCK observations | Approved fictional channel; fake video IDs; no Google API calls |
| WhatsApp | MOCK dry-run preparation | No Meta token/account/number/template approval or sending adapter |
| Webhooks | MOCK contract plus disabled-by-default Meta WhatsApp status adapter | Raw-byte HMAC, challenge verification, phone/WABA mapping, normalized status receipts and idempotent durable inbox. No Meta secrets, account mapping, inbound message handling, or real sending configured |
| PostgreSQL | actual development + separate test databases | Real migrations, constraints and transaction tests |
| Redis/BullMQ | actual private development queue | Job IDs refer to notification records, no plaintext capability |
| Storage/maps/push | unavailable | No configured adapter or external account |
| AWS | development VPS connected | Not a production deployment or restored-backup claim |
| Passkeys | SimpleWebAuthn 14.0.x; local/test RP only | Dev-only self-registration, discoverable sign-in, and single-use recovery codes verified with virtual authenticators. Production recovery, WhatsApp linking and physical-device evidence remain unavailable |

Secrets are generated in ignored `.env`, never requested in chat. The SSH key stays outside the VPS application repo. Never turn mock template state into a claim of provider approval. External adapter behavior must be checked against current primary provider documentation before activation.


Meta webhook adapter checkpoint (2026-10-27): `GET /webhooks/meta/whatsapp` verifies the subscription token and echoes the challenge; signed status-only callbacks accept the `whatsapp_business_account` envelope and map each phone-number/WABA pair to an explicitly enabled organization record before durable inbox insertion. The adapter stores only normalized delivery status fields, not raw webhook JSON or recipient numbers. Inbound user messages and other webhook fields are rejected for retry; message-intent handling is not implemented. `META_WEBHOOK_ENABLED` defaults to false, the phone mapping table starts empty, public environments remain blocked, and outbound sending remains disabled. The status schema follows Meta's [official WhatsApp Cloud API webhook examples](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-ba924e99-3d98-4954-b4e3-73a519939c33); verify account/version behavior and current app setup at activation time.


Passkey and recovery checkpoint (2026-10-27): registration and discoverable authentication use the locally served SimpleWebAuthn browser module and server verification. RP ID and origin are explicit configuration, with loopback localhost defaults. Credentials use resident keys and require authenticator user verification. No biometric material or private key reaches the service. Development self-registration creates an inactive fictional member and activates it only after the first verified passkey; usernames are normalized and reserved names are rejected. Account creation defaults all alerts off. Members can generate eight random one-time recovery codes; only SHA-256 digests are stored, codes display once, and use invalidates the full set and revokes existing sessions. Public environments stay blocked. Production recovery, verified WhatsApp linking, native app ceremonies and physical-device validation remain unimplemented.
