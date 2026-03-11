# Milestone B Implementation Notes

Date: 2026-03-11

## Scope Completed
1. Credential Broker Milestone B
- Added project-level policy storage for each service.
- Added role allowlists and operation allowlists.
- Added approval threshold checks.
- Added daily/monthly budget counter tracking and enforcement.
- Added budget snapshot in approved broker responses.

2. Task 8 Runtime Check Integration
- Coordinator now loads `sandbox/skills/sandbox_policy.json` at startup.
- Added `skill_request` handling path in coordinator.
- Skill requests are now checked against:
  - enabled/disabled status
  - deny-by-default fallback
  - domain allowlists
  - direct credential access prohibition
- Browser requests are now blocked when `agent-browser` is disabled in policy.

## New Credential Manager Capabilities
- `upsert_project_policy(...)`
- `get_project_policy(project_id, service)`
- `budget_snapshot(project_id)`

Policy files are stored in:
- `sandbox/credentials/policies/<project>__<service>.json`

Budget counters are stored in:
- `sandbox/credentials/budget_counters.json`

## Additional Deny Codes Used
- `POLICY_DENIED_ROLE`
- `POLICY_DENIED_OPERATION`
- `BUDGET_DAILY_EXCEEDED`
- `BUDGET_MONTHLY_EXCEEDED`

## Message Bus / Coordinator Impact
The coordinator now supports a new message kind:
- `skill_request` -> emits `skill_response` with `{ approved, reason }`

This allows runtime skill operations to be policy-gated in one place before execution.
