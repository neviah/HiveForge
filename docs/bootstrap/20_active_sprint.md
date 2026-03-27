# HiveForge Active Sprint

## Current Sprint: Real Execution + Message Bus Hardening

### A1. Real Task Execution Lifecycle

Implement:

1. Start real agent execution when a task enters `inprogress`.
2. Mark task `done` only on successful execution exit.
3. On non-zero exit, requeue with coordinator-managed retry metadata.
4. Track `startedAt`, `lastProgressAt`, and timeout checks by elapsed wall-clock time.

Exit criteria:

- no auto-complete after one heartbeat
- long model runs tolerated when progress is observed

### A2. Message Bus Hardening (`/sandbox/agents/messages.db`)

Implement:

1. Ensure message bus file exists at startup/bootstrap.
2. Persist coordinator-routed events (assignment, progress, completion, failure).
3. Add dashboard/log inspection read endpoint with project filtering.

Exit criteria:

- routing decisions inspectable from persisted records
- history survives restarts

## Next Sprint Queue

1. Recurring work engine by template.
2. Connector execution paths through credential broker.
3. Guardrail/policy regression test expansion.
4. Chaos and restart-recovery validation.
