# HiveForge Execution Order

## Foundation Sequence (Tasks 1-8)

1. Create and normalize HiveForge folder/reference structure.
2. Maintain architecture docs in `docs/`.
3. Scaffold dashboard runtime surface in `webui/dashboard/`.
4. Scaffold multi-agent engine in `agents/`.
5. Scaffold credential vault and manager in `sandbox/credentials/`.
6. Scaffold template system in `templates/`.
7. Integrate subordinate personalities from agency-agents and map in templates.
8. Vet/install core ClawHub skills in order:
   - `skill-vetter` first
   - `self-improving-agent`
   - `proactive-agent`
   - `github`
   - `agent-browser`
   - `api-gateway`

## Post-Foundation Phases

### Phase 1: Dashboard Runtime Wiring

- replace API stubs with live coordinator and lifecycle handlers
- persist project records
- wire manual controls to coordinator commands
- return real telemetry payloads

### Phase 2: Lifecycle Runtime

- state machine: `created -> running -> paused -> completed/failed`
- persistence and restart recovery
- retries/backoff for failed actions

### Phase 3: Continuous Pipeline

- recurring schedules per template
- dependency-aware task promotion
- stale-task escalation and SLA handling
- maintenance cycles with no-feature-task periods

### Phase 4: Connector Paths

- credential-broker-backed adapters
- coordinator policy and budget gates on all external actions
- dry-run and production modes
- allow/deny decision logging

### Phase 5: Reliability and Guardrails

- integration tests for routing, budget policy, browser gating
- chaos tests for crash/restart and message-bus continuity
- policy regression tests
- health metrics and alert thresholds in dashboard

### Phase 6: Production Readiness

- multi-heartbeat autonomous run
- continuous planning/execution/deploy/analytics loops
- restart-safe operation
- full policy/budget compliance
- LM Studio-only + sandbox + Pinokio compliance retained
