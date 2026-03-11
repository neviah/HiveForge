# HiveForge Credential Broker v1

## Purpose
Define a secure, coordinator-mediated credential flow so subordinate agents can perform website and API actions without direct access to raw secrets.

## Scope
This spec covers:
- Request and response schemas
- Authorization and policy checks
- Budget guardrails
- Audit log model
- Error codes and retry behavior
- Integration points for dashboard and agent engine

This spec does not cover:
- Provider-specific API implementation details
- Full key management platform rollout

## Security Model
1. Only the Coordinator can call the Credential Manager secret resolution path.
2. Subordinate agents submit intent requests, not secret requests.
3. Raw tokens are never returned to subordinate agents.
4. Every request is policy-checked and audit-logged.
5. Spend-limited services must pass preflight budget checks before execution.

## Components
1. Intent Gateway
- Entry point for subordinate agent action requests.
- Validates schema and required fields.

2. Policy Engine
- Evaluates service scope, project policy, and role permissions.
- Decides allow or deny.

3. Budget Guard
- Tracks daily and monthly spend per project and service.
- Blocks actions exceeding limits.

4. Secret Resolver
- Coordinator-only secret retrieval from vault.
- Secret remains in memory only for connector execution.

5. Connector Runner
- Executes provider operation using resolved secret.
- Returns sanitized output only.

6. Audit Writer
- Writes append-only audit records for all requests.

## Data Schemas

### Intent Request (subordinate -> coordinator)
```json
{
  "request_id": "uuid",
  "project_id": "string",
  "agent_id": "string",
  "agent_role": "string",
  "service": "netlify|stripe|google_ads|analytics|email_provider",
  "operation": "deploy_site|create_campaign|read_metrics|send_email|...",
  "scope": "string",
  "input": {},
  "estimated_cost": 0.0,
  "requires_human_approval": false,
  "ts": "ISO8601"
}
```

### Policy Record (stored per project/service)
```json
{
  "project_id": "string",
  "service": "string",
  "allowed_roles": ["Marketing Manager", "Coordinator"],
  "allowed_operations": ["create_campaign", "pause_campaign"],
  "allowed_scopes": ["ads.write", "ads.read"],
  "max_daily_spend": 100.0,
  "max_monthly_spend": 2000.0,
  "require_human_approval_over": 50.0,
  "enabled": true,
  "updated_at": "ISO8601"
}
```

### Broker Result (coordinator -> subordinate)
```json
{
  "request_id": "uuid",
  "status": "approved|denied|executed|failed",
  "service": "string",
  "operation": "string",
  "sanitized_result": {},
  "error_code": "string|null",
  "error_message": "string|null",
  "ts": "ISO8601"
}
```

### Audit Record (append-only)
```json
{
  "audit_id": "uuid",
  "request_id": "uuid",
  "project_id": "string",
  "agent_id": "string",
  "agent_role": "string",
  "service": "string",
  "operation": "string",
  "scope": "string",
  "decision": "allow|deny|fail",
  "policy_reason": "string",
  "estimated_cost": 0.0,
  "actual_cost": 0.0,
  "token_exposed": false,
  "duration_ms": 0,
  "error_code": "string|null",
  "created_at": "ISO8601"
}
```

## Validation Rules
1. Reject requests missing any required fields.
2. Reject unknown service, operation, or scope.
3. Reject if agent role is not permitted for requested service and operation.
4. Reject if policy disabled.
5. Reject if budget exceeded.
6. Require human approval if estimated cost exceeds threshold.

## Execution Flow
1. Subordinate agent posts Intent Request to coordinator inbox.
2. Coordinator validates schema.
3. Coordinator checks policy and budget.
4. If denied, coordinator returns Broker Result with deny code and writes audit.
5. If approved, coordinator resolves secret in memory.
6. Coordinator executes connector operation.
7. Coordinator redacts response.
8. Coordinator returns sanitized Broker Result.
9. Coordinator writes audit with decision and actual cost.

## Error Codes
- AUTH_NOT_COORDINATOR: non-coordinator attempted secret resolution.
- POLICY_DENIED_ROLE: role not allowed for service/operation.
- POLICY_DENIED_SCOPE: scope not allowed.
- POLICY_DISABLED: service policy disabled.
- BUDGET_DAILY_EXCEEDED: daily spend cap reached.
- BUDGET_MONTHLY_EXCEEDED: monthly spend cap reached.
- APPROVAL_REQUIRED: request requires human approval.
- SECRET_MISSING: no credential found for service.
- CONNECTOR_FAILURE: provider call failed.
- TIMEOUT: connector execution timed out.
- VALIDATION_ERROR: malformed intent payload.

## Logging and Redaction
1. Never log token values or authorization headers.
2. Redact known secret-like fields in request input and connector output.
3. Keep short operation summaries for dashboard visibility.

## Storage Layout
1. Metadata and policy:
- sandbox/credentials/<service>.json

2. Encrypted token blobs:
- sandbox/credentials/<service>.enc

3. Audit log (newline JSON):
- sandbox/credentials/audit.log.ndjson

4. Budget counters:
- sandbox/credentials/budget_counters.json

## API Surface (Coordinator Internal)
1. broker_request(intent) -> Broker Result
2. policy_upsert(project_id, service, policy) -> policy
3. policy_get(project_id, service) -> policy
4. budget_snapshot(project_id) -> counters
5. audit_query(project_id, limit, filters) -> records

## Dashboard Integration
1. Credential panel shows:
- connected status
- allowed scopes
- current spend vs limits
- last credential update

2. New audit panel fields:
- request_id
- agent role
- service + operation
- decision
- error code
- cost

## Minimal Implementation Milestones
1. Milestone A
- Add intent schema validation and deny codes.
- Add audit log writer.

2. Milestone B
- Add policy records and role/operation/scope checks.
- Add budget counters with daily/monthly checks.

3. Milestone C
- Add connector wrappers returning sanitized payloads.
- Add dashboard endpoint for credential audit.

4. Milestone D
- Replace scaffold crypto with authenticated encryption.
- Enforce env-provided key and fail closed if absent.

## Recommended Immediate Changes to Current Code
1. Replace prefix-only coordinator check with signed coordinator session token validation.
2. Add per-project policy files, not only global service metadata.
3. Add audit log writes for upsert, revoke, and resolve actions.
4. Add budget counter updates in resolve path when operation has spend impact.
5. Return only action results to subordinates, never decrypted tokens.
