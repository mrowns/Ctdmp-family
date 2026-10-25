# Development operations

Authorized development host only; no public launch. Node runs under the ubuntu home directory, application at `/home/ubuntu/ctdmp-connect`. No SSH credentials are stored in the repository. Provider mode is independently reported as mock/unavailable in INTEGRATIONS.md.

Docker Compose: `sudo docker compose --env-file .env -f infra/compose.yaml up -d --wait`. Database and Redis listen on 127.0.0.1 only. Do not open 5432, 6379, 3100 or future development web ports to the public. The API has no trusted reverse proxy yet.

Migrate with `pnpm db:migrate`; migration checksum changes are rejected. New installation: generate `.env`, start containers, migrate all SQL, seed fixtures. Test DB: `sudo docker exec ctdmp-dev-postgres-1 createdb -U ctdmp ctdmp_test`. Do not re-run that command if it already exists. `pnpm check` migrates/runs only the separate test database.

Install development process units from infra with owner-authorized sudo; inspect using `sudo systemctl status ctdmp-api ctdmp-worker --no-pager`. Stop both with `sudo systemctl stop ctdmp-api ctdmp-worker`. Pausing worker stops new simulated dispatch work but is not a substitute for future persisted campaign controls.

Rollback: stop services, preserve database/volumes and uncommitted code; use a compatible previously verified artifact. Do not delete volumes or force destructive rollback to recover software. No production backup, off-host copy, restore test, HTTPS/domain, reverse proxy, alerting, deployment pipeline or service-level guarantee exists yet.

Required runbooks before launch: wrong stream/interruption/quota outage; Meta auth/templates/webhooks; budget cap/ambiguous send; leaked token/admin compromise/media exposure; DB outage/restore/deletion tombstones and failed deployment. RPO/RTO and accountable operators remain owner decisions.
