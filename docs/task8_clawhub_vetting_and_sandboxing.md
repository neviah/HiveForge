# Task 8: ClawHub Skill Vetting and Sandboxing

Date: 2026-03-11
Workspace: HiveForge

## Install Order and Status
1. Installed first (required): `skill-vetter` ✅
2. Installed after vetter: `self-improving-agent` ✅
3. Installed after vetter: `proactive-agent` ✅
4. Installed after vetter: `github` ✅
5. Installed after vetter: `agent-browser` ✅ (flagged by VirusTotal warning during install)
6. Installed after vetter: `api-gateway` ✅

Installed versions (from `clawhub list`):
- skill-vetter 1.0.0
- self-improving-agent 3.0.1
- proactive-agent 3.1.0
- github 1.0.0
- agent-browser 0.2.0
- api-gateway 1.0.65

## Subsystem Mapping (Required)
- `skill-vetter` -> Security gate for all skill onboarding and updates
- `self-improving-agent` -> Heartbeat Engine (auto-fix notes, maintenance learnings)
- `proactive-agent` -> Coordinator Agent (forward-progress enforcement, autonomous checks)
- `github` -> Deployment Engine (Git-based deployment workflows and CI status)
- `agent-browser` -> Deployment verification and web interaction tasks
- `api-gateway` -> Credential Vault integration for external service API calls

## Skill-Vetter Protocol Reports

### Skill: skill-vetter
- Source: ClawHub
- Owner: spclaudehome
- Latest: 1.0.0
- Risk Level: LOW
- Red Flags: None observed in SKILL.md
- Verdict: SAFE TO INSTALL

### Skill: self-improving-agent
- Source: ClawHub
- Owner: pskoett
- Latest: 3.0.1
- Risk Level: MEDIUM
- Red Flags: Mentions reading/writing broad workspace memory files; requires strict path controls in HiveForge sandbox.
- Verdict: INSTALL WITH CAUTION

### Skill: proactive-agent
- Source: ClawHub
- Owner: halthelobster
- Latest: 3.1.0
- Risk Level: MEDIUM
- Red Flags: Encourages broad automation patterns; must be constrained to coordinator control-plane tasks.
- Verdict: INSTALL WITH CAUTION

### Skill: github
- Source: ClawHub
- Owner: steipete
- Latest: 1.0.0
- Risk Level: MEDIUM
- Red Flags: Can trigger remote GitHub actions and PR operations; enforce repo allowlist and non-destructive command policy.
- Verdict: INSTALL WITH CAUTION

### Skill: agent-browser
- Source: ClawHub
- Owner: TheSethRose
- Latest: 0.2.0
- Risk Level: HIGH
- Red Flags: Installer warning flagged as suspicious by VirusTotal Code Insight; broad browser automation surface.
- Verdict: INSTALL WITH CAUTION (quarantined-by-policy until explicit runtime approval)

### Skill: api-gateway
- Source: ClawHub
- Owner: byungkyu
- Latest: 1.0.65
- Risk Level: HIGH
- Red Flags: Requires external network and MATON_API_KEY; can reach many third-party APIs.
- Verdict: INSTALL WITH CAUTION (coordinator-only, credential-broker-mediated)

## Enforced Sandboxing Rules
1. Skills must operate only under the HiveForge workspace and sandbox paths.
2. No skill may read or write outside sandbox allowlists.
3. No skill may read raw credential files directly.
4. All external API actions require coordinator approval through broker intent checks.
5. All skill actions must be auditable (request, decision, result).
6. `agent-browser` remains disabled for autonomous execution by default until explicit policy toggle.

## Runtime Enablement Matrix
- skill-vetter: enabled
- self-improving-agent: enabled
- proactive-agent: enabled
- github: enabled (allowlist-limited)
- agent-browser: disabled_by_default
- api-gateway: enabled (coordinator-only)

## Operational Notes
- Task 8 install prerequisites are complete.
- Browser automation and API gateway should be activated only through coordinator-controlled routes.
- No direct subordinate access to credentials is permitted.
