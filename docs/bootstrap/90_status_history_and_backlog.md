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
5. Pinokio compatibility, sandbox boundaries, LM Studio-only constraints preserved.
