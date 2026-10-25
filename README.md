# CTDMP Connect

A digital family built in love. Working product identity; official affiliation is unverified.

This repository is an early backend implementation of the supplied comprehensive specification. It is NOT a public pilot or a completed Phase 1. All members and providers are fictional. No real broadcasts, payments, provider accounts, or public deployment are enabled.

## Runtime

Node 24.22.1, pnpm 10.34.8, Docker Compose. Run these commands on the authorized VPS in `/home/ubuntu/ctdmp-connect`:

```bash
export PATH=/home/ubuntu/.local/node/bin:$PATH
cd /home/ubuntu/ctdmp-connect
pnpm install --frozen-lockfile
sudo docker compose --env-file .env -f infra/compose.yaml up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm check
```

The environment file is private and is never committed. `.env.example` documents settings; new installations must generate their own keys and database password. Create the isolated test database once with `sudo docker exec ctdmp-dev-postgres-1 createdb -U ctdmp ctdmp_test` before `pnpm check`.

## Running

```bash
pnpm api
# Separate terminal, same directory:
pnpm worker
```

The API listens ONLY at `http://127.0.0.1:3100`. `/health/live`, `/health/ready`, `/live`, and `/api/v1/public/programs/current` are available locally. `/health/ready` currently checks PostgreSQL only. Systemd development units are in `infra/`; when installed:

```bash
sudo systemctl status ctdmp-api ctdmp-worker --no-pager
curl --fail http://127.0.0.1:3100/health/live
```

With both services running, `pnpm demo` performs the one-shot fixture demonstration through actual HTTP and the database/Redis worker. It never follows mock redirects to YouTube, prints personal links, or sends messages. Evidence is stored in `docs/evidence/first-worker-demo.json`. It preserves history and refuses to reset an existing demo session. Integration tests use a separate database and can be repeated.

Frontend/native directories are placeholders. See docs/STATUS.md and docs/NEXT_STEPS.md.
