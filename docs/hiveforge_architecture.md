# **HiveForge: System Overview and Architecture (Updated with Coordinator Agent Specification)**

## Introduction
HiveForge is a sandboxed, local-first, multi-agent automation platform evolved from the RamClaw project. It is designed to create, manage, and maintain autonomous digital businesses and projects using coordinated teams of AI agents. HiveForge operates entirely within a secure sandbox environment, ensuring safety, reproducibility, and isolation from the host system.

HiveForge integrates a credential vault, multi-agent orchestration, business templates, analytics, and a robust dashboard to monitor and control all active projects. It uses local LLMs exclusively, ensuring privacy and offline capability.

---

# **Core Principles**
- **Local-Only Intelligence:** All LLM calls are routed through LM Studio.
- **Sandboxed Execution:** No access to host filesystem; all operations occur within a controlled environment.
- **Multi-Agent Collaboration:** Projects are executed by teams of specialized agents.
- **Coordinator Agent Required:** Every project and every template must include a single Coordinator Agent that orchestrates all other agents.
- **Template-Driven:** Users can launch entire businesses or workflows using predefined templates.
- **Credential-Aware:** Securely connects to external services (Netlify, Stripe, Google Ads, etc.) via a sandboxed credential vault.
- **Persistent Projects:** Each project maintains its own state, heartbeat, analytics, and lifecycle.
- **Dashboard-Centric:** A unified UI provides visibility into all running businesses and agents.

---

# **System Architecture**

HiveForge is composed of several interconnected subsystems:

---

## **1. Sandbox Environment**
- Isolated filesystem  
- Dedicated Python environment  
- Local Git installation  
- Auto-generated SSH keys  
- Workspace per project  
- Credential vault  

---

## **2. Multi-Agent Engine**

HiveForge uses a **hierarchical multi-agent system**.

### **2.1 Coordinator Agent (Mandatory for Every Template)**  
Every project must include **one and only one Coordinator Agent**.

The Coordinator Agent is responsible for:

### **A. Preventing circular loops**
- Agents never communicate directly with each other  
- All messages must pass through the Coordinator  
- Coordinator rejects redundant or looping messages  
- Coordinator enforces forward progress  

### **B. Task orchestration**
- Breaks user goals into tasks  
- Assigns tasks to subordinate agents  
- Tracks dependencies  
- Reassigns tasks if an agent stalls  
- Ensures no duplication  

### **C. Global project state**
- Maintains task pipeline  
- Maintains shared memory  
- Maintains message bus  
- Maintains project timeline  

### **D. Credential access**
- Only the Coordinator Agent may request credentials  
- Subordinate agents must request permission  
- Coordinator enforces spending limits (e.g., Google Ads budgets)  

### **E. Heartbeat management**
- Sends heartbeat signals  
- Restarts stalled agents  
- Logs maintenance events  
- Updates analytics  

### **F. Dashboard reporting**
- Reports agent status  
- Reports task progress  
- Reports errors  
- Reports analytics  
- Reports deployment results  

### **G. Safety enforcement**
- Ensures agents stay within sandbox boundaries  
- Ensures no agent attempts unauthorized actions  

**No template may function without a Coordinator Agent.  
No agent may bypass the Coordinator Agent.**

---

## **2.2 Subordinate Agents**
Each project spawns additional agents with:

- Role-specific responsibilities  
- Private memory  
- Task queues  
- Inbox/outbox  
- Access to the message bus (through Coordinator)  

Agents include:

- CEO  
- Project Manager  
- Developer  
- Designer  
- Marketing  
- Support  
- CFO  
- And template-specific roles  

---

## **2.3 Message Bus**
A shared communication system:

```
/sandbox/agents/messages.db
```

Agents post messages to the bus.  
The Coordinator Agent routes them.

---

# **3. Credential Vault**

A secure storage system inside the sandbox:

```
/sandbox/credentials/
    netlify.json
    stripe.json
    google_ads.json
    analytics.json
    email_provider.json
```

### Features:
- Encrypted storage  
- Access controlled via CredentialManager tool  
- Supports spending limits  
- UI for adding, revoking, and updating credentials  

### Credential Access Rules:
- Only the Coordinator Agent may request credentials  
- Subordinate agents must request permission  
- Coordinator enforces budgets and scopes  

---

# **4. Dashboard UI**

A comprehensive interface for:

### **4.1 Project Overview**
- Status  
- Heartbeat  
- Last activity  
- Assigned agents  
- Current task  

### **4.2 Agent Activity Monitor**
- Current task  
- Last output  
- Health  
- Pending tasks  
- Completed tasks  

### **4.3 Task Pipeline (Kanban)**
- Backlog  
- In Progress  
- Waiting Review  
- Completed  

### **4.4 Workspace Explorer**
Browse project artifacts:
- Code  
- Marketing assets  
- Analytics reports  
- Deployment files  

### **4.5 Heartbeat Monitor**
- Heartbeat frequency  
- Maintenance logs  
- Auto-fix attempts  
- Uptime  

### **4.6 Credential Manager UI**
- Connect accounts  
- Revoke access  
- Update tokens  
- View scopes  

### **4.7 Analytics Dashboard**
- Traffic  
- Conversions  
- Revenue  
- Ad spend  
- ROI  
- Engagement  

### **4.8 Logs & Timeline**
Chronological record of:
- Agent messages  
- Task completions  
- Deployments  
- Errors  
- Fixes  

### **4.9 Manual Controls**
- Pause project  
- Resume project  
- Restart agents  
- Force heartbeat  
- Export project  
- Delete project  

### **4.10 Agent Marketplace**
A browsable panel for adding specialist agents to any running project at any time.

#### Layout
- Agents are organised by division, mirroring the agency-agents repo structure:  
  Engineering · Design · Marketing · Sales · Paid Media · Product · Project Management · Testing · Support · Specialized  
- Each entry shows: agent name, specialty summary, and a preview of its core mission  
- A search box filters across all divisions  
- Adding an agent spawns it immediately and notifies the Coordinator Agent, which assigns it relevant pending tasks  

#### Universally Recommended Additions (any project type)
| Agent | Specialty | Benefit |
|---|---|---|
| Security Engineer | Threat modeling, secure code review | Catches vulnerabilities before deployment |
| Reality Checker | Evidence-based production readiness gate | Prevents bad deployments |
| Feedback Synthesizer | User/test feedback → product priorities | Closes the feedback loop |
| Sprint Prioritizer | Agile backlog management | Manages task overload at scale |

#### Project-Type Additions
| Agent | Best For |
|---|---|
| PPC Campaign Strategist | Business, Content Creator |
| SEO Specialist | Publishing House, Content Creator, Business |
| DevOps Automator | Software Agency |
| Paid Social Strategist | Content Creator, Business |
| Brand Guardian | Business, Music Production |
| Legal Compliance Checker | Any project handling financial data or user PII |
| Incident Response Commander | Software Agency |

#### Rules
- The Coordinator Agent is automatically notified when a new agent is added  
- New agents join the existing message bus and follow all Coordinator routing rules  
- Agents added via the marketplace respect the same sandbox boundaries as default agents  
- All personality files are sourced from https://github.com/msitarzewski/agency-agents  

---

# **5. Template System**

Each template must include:

- A Coordinator Agent  
- A team of subordinate agents (default roster, auto-spawned at project start)  
- A list of optional agents (available via the Agent Marketplace)  
- A workflow definition  
- A task breakdown  
- A dependency graph  
- A goal definition  

Templates include:

### **5.1 Business Template**
**Default Roster:**
- **Coordinator Agent**
- CEO
- PM *(Senior Project Manager)*
- Developer *(Backend Architect)*
- Designer *(UI Designer)*
- Marketing *(Growth Hacker + Content Creator)*
- Support *(Support Responder)*
- CFO *(Finance Tracker)*

**Optional Agents (via Marketplace):**
- Security Engineer
- Reality Checker
- PPC Campaign Strategist
- Brand Guardian
- Legal Compliance Checker
- SEO Specialist
- Analytics Reporter

### **5.2 Game Studio Template**
**Default Roster:**
- **Coordinator Agent**
- Creative Director *(Studio Producer)*
- Game Designer
- Developer *(Backend Architect)*
- Artist *(UI Designer)*
- Sound Designer *(Game Audio Engineer)*
- QA *(Evidence Collector)*
- Community Manager *(Social Media Strategist)*

**Optional Agents (via Marketplace):**
- Narrative Designer
- Level Designer
- Technical Artist
- Reality Checker
- Feedback Synthesizer
- Sprint Prioritizer

### **5.3 Publishing House Template**
**Default Roster:**
- **Coordinator Agent**
- Editor-in-Chief *(Senior Project Manager)*
- Writer *(Content Creator)*
- Researcher *(Trend Researcher)*
- Proofreader *(Reality Checker)*
- Designer *(Visual Storyteller)*
- Marketing *(Growth Hacker)*

**Optional Agents (via Marketplace):**
- Technical Writer
- SEO Specialist
- Brand Guardian
- Feedback Synthesizer
- Legal Compliance Checker

### **5.4 Music Production Template**
**Default Roster:**
- **Coordinator Agent**
- Producer *(Studio Producer)*
- Composer
- Lyricist *(Content Creator)*
- Mixing Engineer
- Marketing *(Social Media Strategist)*
- Visual Designer *(Image Prompt Engineer)*

**Optional Agents (via Marketplace):**
- Brand Guardian
- Paid Social Strategist
- TikTok Strategist
- Instagram Curator
- Legal Compliance Checker

### **5.5 Software Agency Template**
**Default Roster:**
- **Coordinator Agent**
- CTO *(Backend Architect)*
- Backend Dev *(Backend Architect)*
- Frontend Dev *(Frontend Developer)*
- QA *(Reality Checker)*
- DevOps *(DevOps Automator)*
- PM *(Senior Project Manager)*

**Optional Agents (via Marketplace):**
- Security Engineer
- API Tester
- Incident Response Commander
- Technical Writer
- Feedback Synthesizer
- Sprint Prioritizer
- Performance Benchmarker

### **5.6 Research Lab Template**
**Default Roster:**
- **Coordinator Agent**
- Lead Scientist *(Trend Researcher)*
- Researcher *(Trend Researcher)*
- Data Analyst *(Analytics Reporter)*
- Writer *(Technical Writer)*
- Reviewer *(Reality Checker)*

**Optional Agents (via Marketplace):**
- Feedback Synthesizer
- Sprint Prioritizer
- Legal Compliance Checker
- Brand Guardian
- SEO Specialist

### **5.7 Content Creator Template**
**Default Roster:**
- **Coordinator Agent**
- Scriptwriter *(Content Creator)*
- Editor *(Reality Checker)*
- Thumbnail Designer *(Image Prompt Engineer)*
- SEO Specialist
- Social Media Manager *(Social Media Strategist)*

**Optional Agents (via Marketplace):**
- TikTok Strategist
- Instagram Curator
- LinkedIn Content Creator
- Brand Guardian
- PPC Campaign Strategist
- Paid Social Strategist
- Analytics Reporter  

---

# **6. Heartbeat System**

Each project has a heartbeat process that:

- Checks agent health  
- Ensures tasks are progressing  
- Performs maintenance  
- Updates analytics  
- Restarts stalled agents  
- Logs activity  

If a heartbeat fails, the dashboard displays a warning.

---

# **7. Deployment Workflows**

HiveForge supports automated deployment via:

- Netlify  
- Git-based deployments  
- Static site generation  

Agents coordinate to:

- Build the project  
- Run tests  
- Deploy updates  
- Verify deployment success  

---

# **8. Agent Personality Library**

HiveForge subordinate agents use battle-tested personality files from **The Agency** by msitarzewski:

**Repository:** https://github.com/msitarzewski/agency-agents  
**License:** MIT — use freely, commercially or personally.  
**Format:** Each agent is a `.md` file containing identity, core mission, critical rules, deliverables, workflow process, and success metrics. OpenClaw-compatible (`SOUL.md` + `AGENTS.md` + `IDENTITY.md` format).

### **How They Are Used in HiveForge**
Each personality file is loaded as the `system_prompt` parameter when an LM Studio agent is spawned. The personality file defines *how the agent thinks and communicates*; HiveForge's runtime (task queue, inbox/outbox, message bus) defines *how it operates*.

> **Important:** The **Coordinator Agent system prompt is custom-written for HiveForge** and is NOT sourced from agency-agents. Its routing logic, loop prevention, state management, and credential enforcement are unique to this platform. The agency-agents `Agents Orchestrator` and `Studio Producer` serve as reference material only.

### **Role Mapping by Template**

| HiveForge Role | agency-agents Personality |
|---|---|
| **All Templates** | |
| Designer | `design/design-ui-designer.md` |
| Marketing | `marketing/marketing-growth-hacker.md`, `marketing/marketing-content-creator.md` |
| Support | `support/support-support-responder.md` |
| Analytics | `support/support-analytics-reporter.md` |
| **Business Template** | |
| Developer | `engineering/engineering-backend-architect.md` |
| CFO | `support/support-finance-tracker.md` |
| PM | `project-management/project-manager-senior.md` |
| **Software Agency Template** | |
| Backend Dev | `engineering/engineering-backend-architect.md` |
| Frontend Dev | `engineering/engineering-frontend-developer.md` |
| QA | `testing/testing-reality-checker.md` |
| DevOps | `engineering/engineering-devops-automator.md` |
| Security | `engineering/engineering-security-engineer.md` |
| **Game Studio Template** | |
| Game Designer | `game-development/game-designer.md` |
| Artist | `design/design-ui-designer.md` |
| QA | `testing/testing-evidence-collector.md` |
| Narrative Designer | `game-development/narrative-designer.md` |
| Audio Engineer | `game-development/game-audio-engineer.md` |
| **Publishing House Template** | |
| Writer | `marketing/marketing-content-creator.md` |
| Technical Writer | `engineering/engineering-technical-writer.md` |
| SEO | `marketing/marketing-seo-specialist.md` |
| **Research Lab Template** | |
| Researcher | `product/product-trend-researcher.md` |
| Data Analyst | `support/support-analytics-reporter.md` |
| Writer | `engineering/engineering-technical-writer.md` |
| **Content Creator Template** | |
| SEO Specialist | `marketing/marketing-seo-specialist.md` |
| Social Media Manager | `marketing/marketing-social-media-strategist.md` |
| Thumbnail Designer | `design/design-image-prompt-engineer.md` |

---

# **9. Skill Registry (ClawHub)**

HiveForge agents can be extended with installable CLI-based capability skills from **ClawHub**:

**Registry:** https://clawhub.ai  
**License:** MIT  
**Install:** `npx clawhub@latest install <skill-name>`

> **Note:** ClawHub is itself an OpenClaw project — the same lineage as HiveForge. This means ClawHub skills use the same `SKILL.md` format and are natively compatible with HiveForge's agent architecture.

### **Two Layers of Usage**

**A. Development-time skills** — installed while building HiveForge itself  
**B. Runtime skills** — bundled with HiveForge and injected into agent environments at project spawn time

### **Recommended Skills by Subsystem**

| ClawHub Skill | Installs | Maps To HiveForge Subsystem |
|---|---|---|
| `self-improving-agent` (pskoett) | 168k | Heartbeat Engine — auto-fix, error capture, maintenance logs |
| `proactive-agent` (halthelobster) | 84.6k | Coordinator Agent — forward-progress enforcement, autonomous crons, WAL Protocol |
| `github` (steipete) | 94.8k | Deployment Engine — Git-based deployments, branch management |
| `agent-browser` (TheSethRose) | 106k | Deployment Engine — Netlify interaction, deployment verification |
| `api-gateway` (byungkyu) | 39.4k | Credential Vault — external service calls (GA4, Stripe, Google Ads, Netlify) |
| `automation-workflows` (JK-0001) | 33.2k | Marketing Engine — Zapier/Make/n8n workflow automation |
| `skill-vetter` (spclaudehome) | 63.2k | Security — mandatory gate before installing any additional skill |
| `find-skills` (JimLiuxinghai) | 165k | Development utility — discovering relevant skills dynamically |

### **Security Rules for Skill Use**
- Every skill must be vetted with `skill-vetter` before integration  
- Skills must operate entirely within the HiveForge sandbox boundaries  
- No skill may be granted access to the host filesystem  
- No skill may make direct credential calls — all external API access routes through the Coordinator Agent and the Credential Vault  

---

# **Conclusion**

HiveForge is a powerful, extensible platform for creating autonomous digital businesses using coordinated multi-agent teams. Its sandboxed architecture, credential vault, dashboard, and template system make it safe, scalable, and user-friendly.

The **Coordinator Agent** is the backbone of the entire system, ensuring hierarchy, safety, progress, and stability.

HiveForge is designed to evolve into a full ecosystem for automated business creation, deployment, and maintenance.

