# Decisions

- ADR-001: VPS development is authorized by the owner's later instruction; local workspace holds private SSH control memory only. Application changes and execution happen on VPS.
- ADR-002: One-host development deployment; PostgreSQL 17 and Redis 7 in memory-bounded Docker containers, loopback ports and persistent volumes. Mutable minor image tags will be pinned by digest before release.
- ADR-003: Drizzle selected instead of Prisma under specification section 19's permitted alternative. Use typed Drizzle SQL/repositories progressively; financial claims, locks and advanced constraints use reviewed PostgreSQL SQL. Current queries use node-postgres directly within the shared transaction helper; expanding typed repositories remains a task, not a claimed completed migration to ORM modeling.
- ADR-004: API and worker bind to no public application endpoint. APP_ENV other than local/test is rejected while fixture authentication exists. No real provider mode is accepted.
- ADR-005: Fictional budget uses TEST integer units; ledger entries are simulated reservations and never provider costs. Dry-run outcomes are DRY_RUN_PREPARED, not delivered.
- ADR-006: AES-256-GCM protects recoverable delivery payload; join table stores only SHA-256 digests of 256-bit tokens. Key is generated server-side in ignored environment. Current payload retention/rotation is incomplete and blocks launch.
- ADR-007: Unit database and demo database are separate. Test results reference only executed scenarios, not full source requirement compliance.
- ADR-008: Proposed web stack remains Next.js App Router/Tailwind. No website hosting service or public publication has been activated.
