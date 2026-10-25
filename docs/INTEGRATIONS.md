# Integrations

| Service | Current mode | Evidence/limits |
|---|---|---|
| YouTube | deterministic MOCK observations | Approved fictional channel; fake video IDs; no Google API calls |
| WhatsApp | MOCK dry-run preparation | No Meta token/account/number/template approval or sending adapter |
| Webhooks | signed MOCK contract | Raw-byte HMAC, durable idempotent inbox; real Meta challenge/payload/status mapping not yet implemented |
| PostgreSQL | actual development + separate test databases | Real migrations, constraints and transaction tests |
| Redis/BullMQ | actual private development queue | Job IDs refer to notification records, no plaintext capability |
| Storage/maps/push | unavailable | No configured adapter or external account |
| AWS | development VPS connected | Not a production deployment or restored-backup claim |
| Passkeys/recovery | unavailable | Fixture bearer sessions only; public environments rejected |

Secrets are generated in ignored `.env`, never requested in chat. The SSH key stays outside the VPS application repo. Never turn mock template state into a claim of provider approval. External adapter behavior must be checked against current primary provider documentation before activation.
