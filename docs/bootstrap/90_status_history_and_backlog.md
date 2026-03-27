# HiveForge Status, History, and Backlog

This file is the compact status layer. For complete historical wording, see `archive_bootstrap_full.md`.

## Recent Completion Summary

The system has already completed major milestones across:

- approval workflow and governance packs
- connector retry and idempotency protections
- KPI planning/alerts and notification escalation
- production safety gate and certification endpoints
- dashboard automation visibility and evidence export
- expanded autonomy loops for marketing, support, finance, and publishing

## Active Milestone State

1. Base system milestone set: complete.
2. Autonomous operations completion track: complete for planned items currently listed.
3. Remaining work focus: future feature candidates and expansion initiatives.

## Future Feature Candidates

1. Dashboard-native policy simulation and controls.
2. Additional regulator-specific policy/runbook expansion.

## OpenClaw Upstream Backport Queue (2026-03 Review)

Priority order for revisit and selective cherry-pick into HiveForge:

1. OpenAI-compatible tool-call hardening.
2. Sandbox/media path boundary hardening.
3. Control-plane WebSocket/auth fail-closed hardening.
4. Error classification and fallback/retry behavior improvements.
5. Session continuity and restart resilience fixes.
6. Optional API compatibility expansion (`/v1/models`, `/v1/embeddings`).
7. Plugin SDK and marketplace overhaul (defer unless ecosystem expansion is planned).
8. Channel-specific UX/reliability improvements (selective only as needed).

Adoption guidance:

1. Adopt 1-4 first for reliability/safety baseline.
2. Adopt 5 next for long-running run stability.
3. Adopt 6 only if API compatibility/RAG adapters become a near-term requirement.
4. Keep 7-8 on watchlist and cherry-pick narrowly.

## Planned Initiative: Internal Asset Generation Subsystem

Stages:

1. Asset planning layer and schema integration.
2. Internal local asset worker.
3. Review and promotion workflow.
4. Cross-template expansion.

Definition of success:

- coordinator-brokered local draft asset generation
- sandbox-only storage and metadata tracking
- policy/approval controls for release-critical assets
- VRAM-aware scheduling to protect LM Studio runtime stability

## Operational Readiness Criteria

1. Multi-day autonomous run with no coordinator deadlocks.
2. Idempotent, policy-gated, auditable external actions.
3. Actionable KPI alerts and scalable approval management.
4. Restart/failure recovery without duplicate side effects.
5. Pinokio compatibility, sandbox boundaries, and configured LLM provider constraints preserved.

## 30-Day Initiative: Paperclip-Parity Reliability Sprint (Cloud-First)

Objective:

- Harden HiveForge into a high-trust cloud-runtime control plane without sacrificing sandbox/coordinator architecture.

Success metrics by day 30:

1. Zero duplicate side effects across restarts for retryable connector actions in certification runs.
2. >= 95% automatic recovery from transient connector/LLM outages within policy limits.
3. Hard budget-stop behavior verified in automated regression scenarios.
4. One-command operator preflight reports actionable pass/fail status for LLM + connector readiness.

### Week 1 (Days 1-7): Execution Safety Foundation

1. Add explicit task lease metadata (`leaseId`, `leaseOwner`, `leaseExpiresAt`) for in-progress tasks.
2. Enforce idempotent lease acquisition before execution start.
3. Reject stale lease completions and stale retry writes.
4. Add deterministic execution state transitions (`queued -> leased -> running -> completed|failed|awaiting_approval`).

Deliverable:

- duplicate execution prevention under heartbeat/restart pressure.

### Week 2 (Days 8-14): Resume + Retry Discipline

1. Persist restart-resume checkpoints for active tasks and connector attempts.
2. Classify failures into deterministic vs transient classes with connector-specific overrides.
3. Enforce capped exponential backoff using persisted attempt lineage.
4. Promote non-retryable failures directly to review/dead-letter with operator context.

Deliverable:

- reliable recovery behavior and reduced infinite remediation loops.

### Week 3 (Days 15-21): Budget + Governance Hard Stops

1. Convert budget threshold warnings into hard-stop execution gates for high-risk actions.
2. Require explicit board/operator resume for hard-stopped projects.
3. Add immutable governance event trail for policy changes and overrides.
4. Add rollback operation for governance config revisions.

Deliverable:

- cloud spend blast radius constrained by policy, not best effort.

### Week 4 (Days 22-30): Operator Reliability Tooling

1. Ship `/api/doctor` preflight endpoint covering:
	- LLM endpoint reachability + auth sanity
	- configured connector credential presence
	- notification route readiness (WhatsApp/Telegram)
	- sandbox workspace write/read checks
2. Add dashboard doctor panel with one-click rerun.
3. Add certification assertions for doctor pass state before autonomous run start.
4. Publish runbook for degraded-mode operation and incident response.

Deliverable:

- operator-visible runtime readiness and faster triage.

### Sequencing rule

1. Do not start week N+1 until week N acceptance checks pass.
2. Prioritize runtime correctness over UI polish for this initiative.
3. Prefer additive changes; avoid control-plane rewrites during the sprint.
