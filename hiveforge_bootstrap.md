## **PROJECT: HiveForge — Successor to HiveForge**

You are transforming the repository at:

```
https://github.com/neviah/HiveForge
```

into a new platform called **HiveForge**.

HiveForge is **not** a simple fork.  
HiveForge is a **new system** built on top of HiveForge’s architecture.

Follow this document **exactly** and do not deviate from the architecture or goals described here.

---

# **1. Core Identity of HiveForge**

HiveForge is:

- a **sandboxed**, **local‑LLM‑only** automation platform  
- a **multi‑agent orchestration engine**  
- a **business/project generator**  
- a **deployment and maintenance system**  
- a **credential‑aware automation framework**  
- a **dashboard‑driven control center**  
- fully runnable as a **Pinokio app**  

HiveForge must remain **100% compatible with Pinokio** at all times.

---

# **2. Starting Point**

Your starting codebase is the HiveForge repo.

You must:

- **clone HiveForge into a new folder named HiveForge**  
- **rename all references from HiveForge → HiveForge**  
- **preserve all Pinokio install/start/update scripts**  
- **preserve the sandbox architecture**  
- **preserve LM Studio as the only LLM provider**  
- **preserve the local‑only, offline‑capable design**  
- **pull subordinate agent personalities from https://github.com/msitarzewski/agency-agents (MIT) — use as `system_prompt` at LM Studio agent spawn time**  
- **extend agent capabilities using ClawHub skills from https://clawhub.ai (MIT, OpenClaw project) — install via `npx clawhub@latest install <skill>`**

Do **not** attempt to merge upstream OpenClaw changes.  
HiveForge and OpenClaw have diverged too far.

---

# **3. High‑Level Goals for HiveForge**

HiveForge must evolve into:

- a **hierarchical multi‑agent system** with a mandatory Coordinator Agent  
- a **template‑driven business generator**  
- a **credential vault** for external integrations  
- a **dashboard UI** showing active projects, agents, analytics, and heartbeat  
- a **project lifecycle manager**  
- a **task pipeline (Kanban)**  
- a **workspace explorer**  
- a **heartbeat/maintenance engine**  
- a **deployment engine** (Netlify, Git-based)  
- a **marketing engine** (Google Ads, Analytics)  
- a **persistent project system**

All of this must remain **sandboxed** and **Pinokio‑compatible**.

---

# **4. Required Subsystems to Implement**

Implement the following subsystems inside HiveForge:

---

## **4.1 Multi‑Agent Engine (Hierarchy Required)**

Every project must include:

### **A. One Coordinator Agent (mandatory)**  
This agent is the backbone of HiveForge.

The Coordinator Agent:

- prevents circular loops  
- prevents agents from talking directly to each other  
- routes all messages  
- assigns tasks  
- tracks dependencies  
- maintains global project state  
- manages the heartbeat  
- enforces credential access  
- enforces spending limits  
- reports to the dashboard  
- restarts stalled agents  
- ensures forward progress  

**No template may function without a Coordinator Agent.  
No agent may bypass the Coordinator Agent.**

### **B. Subordinate Agents**
Examples:

- CEO  
- Project Manager  
- Developer  
- Designer  
- Marketing  
- Support  
- CFO  
- Template‑specific roles  

Each subordinate agent:

- has private memory  
- has a task queue  
- uses inbox/outbox  
- communicates only through the Coordinator  
- cannot access credentials directly  

---

## **4.2 Message Bus**

Create:

```
/sandbox/agents/messages.db
```

Agents post messages to the bus.  
The Coordinator Agent routes them.

---

## **4.3 Credential Vault**

Create:

```
/sandbox/credentials/
```

Files include:

- netlify.json  
- stripe.json  
- google_ads.json  
- analytics.json  
- email_provider.json  

### Credential Access Rules:
- Only the Coordinator Agent may request credentials  
- Subordinate agents must request permission  
- Coordinator enforces budgets and scopes  
- Coordinator enforces spending limits (e.g., Google Ads daily/monthly caps)  

---

## **4.4 Dashboard UI**

Add a new dashboard with:

### Project Overview  
- status  
- heartbeat  
- last activity  
- assigned agents  
- current task  

### Agent Activity Monitor  
- current task  
- last output  
- health  
- pending tasks  
- completed tasks  

### Task Pipeline (Kanban)  
- backlog  
- in progress  
- waiting review  
- completed  

### Workspace Explorer  
- browse generated files  
- inspect artifacts  

### Heartbeat Monitor  
- heartbeat frequency  
- maintenance logs  
- uptime  
- auto‑fix attempts  

### Credential Manager UI  
- connect accounts  
- revoke access  
- update tokens  
- view scopes  

### Analytics Dashboard  
- traffic  
- conversions  
- revenue  
- ad spend  
- ROI  
- engagement  

### Logs & Timeline  
- agent messages  
- task completions  
- deployments  
- errors  
- fixes  

### Manual Controls  
- pause project  
- resume project  
- restart agents  
- force heartbeat  
- export project  
- delete project  

---

## **4.5 Template System**

Each template must include:

- a Coordinator Agent  
- a team of subordinate agents  
- a workflow definition  
- a task breakdown  
- a dependency graph  
- a goal definition  

Templates include:

- Business  
- Game Studio  
- Publishing House  
- Music Production  
- Software Agency  
- Research Lab  
- Content Creator  

---

## **4.6 Heartbeat System**

Each project must have a heartbeat that:

- checks agent health  
- ensures tasks are progressing  
- performs maintenance  
- updates analytics  
- restarts stalled agents  
- logs activity  

If a heartbeat fails, the dashboard displays a warning.

---

## **4.7 Deployment Engine**

Support:

- Netlify  
- Git-based deployments  
- static site generation  

Agents coordinate:

- build  
- test  
- deploy  
- verify  

---

# **5. Rules for Copilot**

Copilot must:

- follow this document **exactly**  
- never merge upstream OpenClaw  
- never reintroduce cloud LLM providers  
- never remove sandboxing  
- never break Pinokio compatibility  
- never remove LM Studio as the only LLM provider  
- never alter the sandbox filesystem boundaries  
- never overwrite the credential vault  
- never remove the multi‑agent architecture  
- never remove the Coordinator Agent  
- never remove the dashboard  
- never drift from the HiveForge vision  
- never install a ClawHub skill without first vetting it with `skill-vetter`  
- never allow a ClawHub skill to operate outside the sandbox boundaries or access credentials directly  

---

# **6. First Tasks for Copilot**

When beginning work, Copilot must:

### **Task 1 — Create the HiveForge folder structure**
Copy HiveForge → HiveForge and rename all references.

### **Task 2 — Add the HiveForge architecture document**
Place the architecture document in:

```
/HiveForge/docs/hiveforge_architecture.md
```

### **Task 3 — Scaffold the new dashboard**
Create:

```
/HiveForge/webui/dashboard/
```

Add placeholder files for:

- index.html  
- dashboard.js  
- dashboard.css  
- api endpoints  

### **Task 4 — Scaffold the multi‑agent engine**
Create:

```
/HiveForge/agents/
```

Add:

- coordinator_agent.py  
- agent_base.py  
- message_bus.py  
- task_scheduler.py  

### **Task 5 — Scaffold the credential vault**
Create:

```
/HiveForge/sandbox/credentials/
```

Add:

- credential_manager.py  
- placeholder credential files  

### **Task 6 — Scaffold the template system**
Create:

```
/HiveForge/templates/
```

Add JSON templates for each business type.

### **Task 7 — Integrate agent personalities**

1. Clone or copy https://github.com/msitarzewski/agency-agents alongside the HiveForge repo  
2. For each template, map every subordinate agent role to its corresponding `.md` personality file (see HiveForgeSystem.md Section 8 for the full mapping table)  
3. Write a custom Coordinator Agent system prompt — **do not use any agency-agents file for the Coordinator**; its routing, loop-prevention, state management, and credential enforcement logic is unique to HiveForge  
4. Store mapped personality paths in each template's JSON so they are loaded at agent spawn time

### **Task 8 — Install and vet core ClawHub skills**

1. Vet and install the following skills via `npx clawhub@latest install <skill-name>`:  
   - `skill-vetter` — install and run this **first**, before any others  
   - `self-improving-agent` — Heartbeat auto-fix and maintenance logs  
   - `proactive-agent` — Coordinator forward-progress enforcement and autonomous crons  
   - `github` — Git-based deployment support  
   - `agent-browser` — Netlify interaction and deployment verification  
   - `api-gateway` — External service credential-gated API calls  
2. Sandbox each skill: no host filesystem access, no direct credential access  
3. Document which skill is active in which HiveForge subsystem

---

# **7. Final Instruction**

**Begin by creating the HiveForge folder structure and renaming all HiveForge references.  
Then proceed through the tasks in order.  
Do not skip steps.  
Do not deviate from this document.**

HiveForge must remain fully runnable as a **Pinokio app**.

---

# **8. Next Steps to Full Autonomous Operation (Post-Task 8)**

Task 8 completes the foundational scaffold. To reach the target behavior (build, market, monitor, and maintain continuously), complete the following phases in order.

## **Phase 1 — Replace Dashboard API Stubs with Live Runtime Wiring (Immediate Next Step)**

Goal: make dashboard actions execute real coordinator and project lifecycle logic.

Implement:

1. Wire `webui/dashboard/api/routes.js` endpoints to real handlers in the server runtime.
2. Add persistent project records (create, update status, pause/resume, delete).
3. Connect project creation to template loading and Coordinator spawn.
4. Connect manual controls (pause, resume, force heartbeat, restart agents) to coordinator commands.
5. Return real telemetry payloads for agents, tasks, heartbeat, and policy decisions.

Exit criteria:

- Dashboard no longer returns "Not implemented" for core project/agent/task endpoints.
- Creating a template project starts a running coordinator loop.

## **Phase 2 — Project Lifecycle Runtime**

Goal: each project runs as a managed long-lived process.

Implement:

1. Add project state machine: `created -> running -> paused -> completed/failed`.
2. Persist runtime snapshots so projects survive app restarts.
3. Add startup recovery that rehydrates running projects and resumes heartbeat loops.
4. Add backoff/retry policy for stalled tasks and failed agent actions.

Exit criteria:

- Projects resume safely after process restart.
- Coordinator can recover from transient failures without manual intervention.

## **Phase 3 — Continuous Work Pipeline (Build + Marketing + Maintenance)**

Goal: convert one-shot generation into recurring autonomous operation.

Implement:

1. Add recurring task schedules per template (content cadence, ad checks, deployment checks, support triage).
2. Add dependency-aware task promotion from backlog to execution.
3. Add SLA timers and stale-task escalation to the coordinator.
4. Add automatic maintenance cycles that run even when no new feature tasks are queued.

Exit criteria:

- A business template keeps producing work after initial generation.
- Heartbeat logs show recurring maintenance and growth actions over time.

## **Phase 4 — Connector Execution Paths**

Goal: make external operations real while preserving credential safety.

Implement:

1. Implement credential-broker-backed execution adapters for GitHub/Netlify/Google services.
2. Require all external calls to pass through coordinator policy checks and budget checks.
3. Add dry-run mode and production mode for deployment and campaign actions.
4. Record each external action in policy decision logs with allow/deny reason.

Exit criteria:

- Deployment, campaign updates, and analytics sync run through live adapters.
- No connector path bypasses coordinator and credential manager.

## **Phase 5 — Reliability, Guardrails, and QA Gates**

Goal: make autonomous operation safe for long-duration use.

Implement:

1. Add integration tests for coordinator routing, budget enforcement, and browser gating.
2. Add chaos tests for agent crash/restart and message-bus recovery.
3. Add policy regression tests (deny-by-default, scope checks, overspend blocking).
4. Add observable health metrics and alert thresholds surfaced in dashboard KPIs.

Exit criteria:

- Critical control paths are covered by automated tests.
- Runtime remains stable under simulated failures.

## **Phase 6 — Final Production Readiness**

Goal: certify HiveForge as an autonomous, sandboxed, Pinokio-compatible operator.

Definition of done:

1. A new Business template project can run for multiple heartbeat cycles with no manual code edits.
2. It can plan work, execute tasks, deploy updates, track analytics, and schedule follow-up actions continuously.
3. It obeys policy limits, credential scopes, and budget ceilings under both normal and adversarial inputs.
4. It survives restart and resumes prior state.
5. It remains LM Studio-only, sandboxed, and Pinokio compatible.

---

