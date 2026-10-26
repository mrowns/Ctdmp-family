# CTDMP Connect

A digital family built in love. Working product identity; official affiliation is unverified.

This repository is an early backend and browser implementation of the supplied comprehensive specification. It is NOT a public pilot or a completed Phase 1. All members and providers are fictional. No real broadcasts, payments, provider accounts, or public deployment are enabled.

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

## Private browser slice

The API now serves a responsive, server-rendered frontend without JavaScript:

- `/` and `/live`: truthful current program and deliberate generic joining.
- `/account`, `/account/history`, `/account/preferences`: private fictional member pages.
- `/admin`: permission-checked control room, candidate decisions, explicit Home-session selection, completion, simulated sending controls, branch-scoped link openings and transition evidence.
- `/account/alerts`: own prepared dry-run alerts and their private personal joining pages.
- `/demo/sign-in`: protected development access-code form. This is not public-pilot authentication.

To issue a one-hour code on the VPS (never paste the code into chat):

```bash
export PATH=/home/ubuntu/.local/node/bin:$PATH
cd /home/ubuntu/ctdmp-connect
pnpm fixture:session alice
# Read artifacts/private/alice.access privately on the VPS.
```

Use `admin-a` instead of `alice` for the explicitly granted fictional control-room account. Access-code files are ignored by Git. The website stays bound to loopback; it is not published on the static IP. To view it from your Mac, run an SSH tunnel:

```bash
ssh -i ~/Downloads/LightsailDefaultKey-eu-central-1.pem -N -L 3100:127.0.0.1:3100 ubuntu@3.73.141.132
```

Then visit `http://127.0.0.1:3100`. Browser form origins must use that port. Fixture streams open local `/demo/streams/MockVideo_A` and `/demo/streams/MockVideo_B` pages. They show the selected mock destination without calling YouTube or playing a real broadcast.

For browser verification on the VPS:

```bash
pnpm exec playwright install --with-deps chromium
pnpm test:browser
```

The browser suite uses a separate test database and worker, disables JavaScript, intercepts all external browser requests, and saves sanitized screenshots and assertions under `docs/evidence/`. It preserves fictional test history rather than resetting the demo database. It is a Chromium desktop-engine test with a mobile viewport, not physical-device validation.

Native directories remain placeholders. The full Next.js frontend, real authentication and later product phases are incomplete. See docs/STATUS.md and docs/NEXT_STEPS.md.

## Interactive recovery demonstration

See `docs/ADMINISTRATION.md` for the complete browser procedure and command contracts. On the VPS, issue separate fictional access codes for `admin-a` and `alice`, then use separate browser profiles. Enable Alice's simulated live-start preference. Sign in again as admin-a before changes; administrative verification lasts 15 minutes.

In the control room, create and show a fictional session, simulate Stream A starting, and refresh until verified. Alice's prepared alert appears at `/account/alerts`. Opening its landing page creates no check-in; Watch Live opens the local Stream A page. Queue the interruption and replacement B from the control room. Reopen the same personal link and choose Watch Live: it opens local Stream B and preserves one unique action. Prior sessions and their history are preserved.

Production startup and real providers remain blocked. Fixture identity does not establish production authentication.
