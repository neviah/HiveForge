# HiveForge Core Brief (Always-On)

## Identity

HiveForge is a sandboxed automation platform built on HiveForge architecture.

It is:

- a hierarchical multi-agent orchestration engine
- a business and project generator
- a credential-aware automation framework
- a dashboard-driven control center
- fully runnable as a Pinokio app

## Non-Negotiable Constraints

1. Preserve Pinokio compatibility.
2. Keep sandbox boundaries intact.
3. Use OpenAI-compatible provider wiring; OpenRouter is the current default deployment path.
4. Maintain mandatory Coordinator Agent architecture.
5. No direct subordinate-to-subordinate communication.
6. No direct credential access by subordinate agents.
7. No unsandboxed ClawHub skill execution.
8. Do not merge upstream OpenClaw into this repo.

## Required Architecture Invariants

- Every project has exactly one Coordinator Agent.
- Coordinator routes all inter-agent messages.
- Message bus is persisted at `/sandbox/agents/messages.db`.
- Credential vault lives at `/sandbox/credentials/`.
- Dashboard must expose project, agent, task, heartbeat, credential, and logs/timeline views.

## Coordinator Responsibilities

- route messages and prevent loops
- assign tasks and track dependencies
- enforce credential policy and budgets
- maintain heartbeat and restart stalled agents
- report runtime status to dashboard

## Skill Governance

- Vet every ClawHub skill with `skill-vetter` before install/use.
- Skills cannot bypass sandbox policy.
- Skills cannot access credentials directly.
