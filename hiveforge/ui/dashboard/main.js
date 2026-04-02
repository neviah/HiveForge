const workspaceNav = document.getElementById("workspace-nav");
const viewTitle = document.getElementById("view-title");
const views = [...document.querySelectorAll("[data-view-panel]")];
const projectIcons = document.getElementById("project-icons");
const addProjectButton = document.getElementById("add-project");
const activeProjectName = document.getElementById("active-project-name");
const activeProjectStatus = document.getElementById("active-project-status");
const pauseProjectButton = document.getElementById("pause-project");
const resumeProjectButton = document.getElementById("resume-project");
const deleteProjectButton = document.getElementById("delete-project");
const llmDot = document.getElementById("llm-dot");
const llmStatusText = document.getElementById("llm-status-text");

const sessionSelect = document.getElementById("session-select");
const reloadSessionsButton = document.getElementById("reload-sessions");
const timelineBody = document.getElementById("timeline-body");
const agentKanban = document.getElementById("agent-kanban");
const marketplaceList = document.getElementById("marketplace-list");
const approvalsList = document.getElementById("approvals-list");
const missionBriefContent = document.getElementById("mission-brief-content");
const launchContent = document.getElementById("launch-content");
const ceoThread = document.getElementById("ceo-thread");
const officeCanvas = document.getElementById("office-canvas");
const refreshOfficeButton = document.getElementById("refresh-office");
const officeStyleSelect = document.getElementById("office-style");
const missionBoardNote = document.getElementById("mission-board-note");
const reloadFilesButton = document.getElementById("reload-files");
const openPreviewTabButton = document.getElementById("open-preview-tab");
const fileTree = document.getElementById("file-tree");
const previewPath = document.getElementById("preview-path");
const filePreviewFrame = document.getElementById("file-preview-frame");
const filePreviewText = document.getElementById("file-preview-text");

const metricSessions = document.getElementById("metric-sessions");
const metricEvents = document.getElementById("metric-events");
const metricAgents = document.getElementById("metric-agents");

const providerSelect = document.getElementById("provider-select");
const providerBaseUrl = document.getElementById("provider-base-url");
const providerModel = document.getElementById("provider-model");
const providerTemperature = document.getElementById("provider-temperature");
const providerMaxTokens = document.getElementById("provider-max-tokens");
const providerApiKeyEnv = document.getElementById("provider-api-key-env");
const providerApiKey = document.getElementById("provider-api-key");
const saveProviderButton = document.getElementById("save-provider");
const settingsStatus = document.getElementById("settings-status");
const projectProviderSelect = document.getElementById("project-provider-select");
const projectProviderModel = document.getElementById("project-provider-model");
const saveProjectLlmButton = document.getElementById("save-project-llm");

const ceoObjective = document.getElementById("ceo-objective");
const ceoBudget = document.getElementById("ceo-budget");
const ceoNudge = document.getElementById("ceo-nudge");
const runBuildButton = document.getElementById("run-build");
const sendNudgeButton = document.getElementById("send-nudge");
const ceoResponse = document.getElementById("ceo-response");

let currentReplay = { event_count: 0, agents: [], events: [] };
let currentContext = defaultProjectContext("agency");
let providerSettings = { active_provider: "openrouter", providers: [], configs: {} };
let projects = [];
let activeProjectId = "agency";
let officeSprites = [];
let officeAnimationStarted = false;
let spriteSheetsLoaded = false;
let agentSpriteSheet = null;   // legacy SVG fallback
let tileSpriteSheet = null;    // legacy SVG fallback
let pixelAgentCharSheets = []; // pixel-agents char_0..char_5 (112x96, 7x3 frames)
let pixelAgentFloorTiles = []; // pixel-agents floor_0..floor_8 (16x16)
let characterSheet = null;     // MetroCity Character Model.png (768×192, 32×32 frames)
let hairSheet = null;          // MetroCity Hairs.png (768×256, 32×32 frames)
let characterShadow = null;    // MetroCity Shadow.png (32×32)
let tileHouseSheet = null;     // Interior TilesHouse.png (512×512)
let carpetSheet = null;        // Interior Carpet-Sheet.png (320×64)
let outfitSheets = {};         // role → Image for each outfit PNG
let projectFiles = [];
let selectedFilePath = "";
let buildInProgress = false;

const BUILD_STAGE_BLUEPRINT = [
  { id: "strategy-roadmap", title: "Create the execution roadmap", role: "project_manager", depends_on: [] },
  { id: "market-research", title: "Research the market case", role: "researcher", depends_on: ["strategy-roadmap"] },
  { id: "offer-lab", title: "Draft the offer lab", role: "writer", depends_on: ["market-research"] },
  { id: "product-spec", title: "Design the product specification", role: "designer", depends_on: ["offer-lab"] },
  { id: "metrics-plan", title: "Define the launch metrics", role: "analyst", depends_on: ["offer-lab"] },
  { id: "landing-page", title: "Build the first web scaffold", role: "developer", depends_on: ["product-spec"] },
  { id: "data-connector-notes", title: "Document the live data path", role: "developer", depends_on: ["landing-page"] },
  { id: "launch-checklist", title: "Prepare the launch checklist", role: "writer", depends_on: ["landing-page", "metrics-plan", "data-connector-notes"] },
  { id: "risk-review", title: "Review launch risks", role: "critic", depends_on: ["launch-checklist"] },
];

function defaultProjectContext(projectId) {
  return {
    project_id: projectId,
    strategy: {},
    offer_lab: {},
    product_spec: {},
    mission_brief: {},
    pipeline: { steps: [] },
    launch: {},
    inbox: [],
    approvals: [],
    office: { agents: [] },
    conversation: [],
    artifacts: [],
    llm: {},
    llm_status: {
      connected: false,
      text: "LLM status unavailable",
      provider: "",
      model: "",
    },
  };
}

function previewPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const text = JSON.stringify(payload);
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function normalizeProjectStatus(status) {
  if (status === "paused" || status === "deleted") {
    return status;
  }
  return "running";
}

function getActiveProject() {
  return projects.find((project) => project.id === activeProjectId) || projects[0] || null;
}

function buildPlaceholderSteps(projectName) {
  return BUILD_STAGE_BLUEPRINT.map((step, index) => ({
    id: step.id,
    title: `${step.title} for ${projectName}`,
    role: step.role,
    status: index === 0 ? "active" : "queued",
    summary: index === 0 ? "Executive routing and specialist assignment in progress." : "Queued for specialist dispatch.",
    depends_on: step.depends_on,
    wave: index + 1,
  }));
}

function roleColor(role) {
  const palette = {
    project_manager: "#7251b5",
    researcher: "#0f8b8d",
    writer: "#ff7f51",
    designer: "#2d6a4f",
    developer: "#1d4ed8",
    analyst: "#c77dff",
    critic: "#c44536",
    coordinator: "#374151",
  };
  return palette[role] || "#334155";
}

async function loadProjects() {
  const response = await fetch("/api/projects");
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to load projects");
  }

  projects = (data.projects || []).map((project) => ({
    id: String(project.id),
    name: String(project.name),
    icon: String(project.icon || project.name?.charAt(0) || "P").slice(0, 1).toUpperCase(),
    status: normalizeProjectStatus(String(project.status || "running")),
  }));

  if (data.active_project_id) {
    activeProjectId = String(data.active_project_id);
  }

  if (!projects.some((project) => project.id === activeProjectId && project.status !== "deleted")) {
    const fallback = projects.find((project) => project.status !== "deleted");
    activeProjectId = fallback ? fallback.id : "";
  }

  renderProjectRail();
  syncProjectHeader();
}

function renderProjectRail() {
  projectIcons.innerHTML = "";
  projects
    .filter((project) => project.status !== "deleted")
    .forEach((project) => {
      const button = document.createElement("button");
      button.className = "project-icon";
      button.type = "button";
      button.textContent = project.icon;
      button.title = `${project.name} (${project.status})`;
      button.dataset.projectId = project.id;
      button.dataset.projectStatus = project.status;
      button.classList.toggle("active", project.id === activeProjectId);
      projectIcons.appendChild(button);
    });
}

function syncProjectHeader() {
  const project = getActiveProject();
  if (!project) {
    activeProjectName.textContent = "None";
    activeProjectStatus.textContent = "deleted";
    activeProjectStatus.className = "status-tag deleted";
    pauseProjectButton.disabled = true;
    resumeProjectButton.disabled = true;
    deleteProjectButton.disabled = true;
    return;
  }

  activeProjectName.textContent = project.name;
  activeProjectStatus.textContent = project.status;
  activeProjectStatus.className = `status-tag ${project.status}`;

  pauseProjectButton.disabled = project.status !== "running";
  resumeProjectButton.disabled = project.status !== "paused";
  deleteProjectButton.disabled = project.status === "deleted";
}

function setLlmStatus(status) {
  const connected = Boolean(status?.connected);
  llmDot.classList.toggle("connected", connected);
  llmDot.classList.toggle("disconnected", !connected);
  llmStatusText.textContent = status?.text || "LLM status unavailable";
}

async function setProjectStatus(nextStatus) {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const action = nextStatus === "paused" ? "pause" : "resume";
  const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!data.ok) {
    ceoResponse.textContent = `Error: ${data.error || "Unable to update project"}`;
    return;
  }

  await loadProjects();
  await loadProjectContext(activeProjectId);
}

async function handleDeleteProject() {
  const project = getActiveProject();
  if (!project) {
    return;
  }

  const confirmed = window.confirm(`Delete ${project.name}? This updates the persisted project registry.`);
  if (!confirmed) {
    return;
  }

  const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: "DELETE",
  });
  const data = await response.json();
  if (!data.ok) {
    ceoResponse.textContent = `Error: ${data.error || "Unable to delete project"}`;
    return;
  }

  await loadProjects();
  if (activeProjectId) {
    await loadProjectContext(activeProjectId);
  }
}

async function handleCreateProject() {
  const name = window.prompt("New project name", "New Venture");
  if (!name) {
    return;
  }

  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  const data = await response.json();
  if (!data.ok) {
    ceoResponse.textContent = `Error: ${data.error || "Unable to create project"}`;
    return;
  }

  await loadProjects();
  await loadProjectContext(activeProjectId);
}

function setActiveView(viewName) {
  const menuItems = [...workspaceNav.querySelectorAll(".menu-item")];
  menuItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  views.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === viewName);
  });

  const viewLabels = {
    strategy: "Strategy",
    "mission-brief": "Mission Brief",
    office: "Office",
    launch: "Launch",
    files: "Files",
    approvals: "Approvals",
    marketplace: "Agent Marketplace",
    settings: "Settings",
  };
  viewTitle.textContent = viewLabels[viewName] || "Workspace";
}

function renderMarketplace() {
  const roles = [
    { role: "Project Manager", purpose: "Turns a business goal into milestones, dependencies, and delivery sequencing.", tools: "Planning, risk management, execution tracking" },
    { role: "Developer", purpose: "Builds the product, implementation scaffolds, integrations, and launch assets.", tools: "Code generation, file output, command execution" },
    { role: "Researcher", purpose: "Validates demand, market signals, and positioning opportunities.", tools: "Research, synthesis, evidence gathering" },
    { role: "Writer", purpose: "Produces the offer, landing page copy, and launch narrative.", tools: "Messaging, editing, content drafts" },
    { role: "Analyst", purpose: "Defines what to measure and how success will be judged.", tools: "Metrics plans, KPI framing, diagnostics" },
    { role: "Critic", purpose: "Challenges weak logic and flags launch risks before customers do.", tools: "QA, risk review, preflight checks" },
    { role: "Designer", purpose: "Translates strategy into usable product and interface decisions.", tools: "UX concepts, structure, visual direction" },
  ];

  marketplaceList.innerHTML = "";
  roles.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${item.role}</strong><span>${item.purpose}</span><span>Core tools: ${item.tools}</span>`;
    marketplaceList.appendChild(li);
  });
}

function renderTimeline(events) {
  timelineBody.innerHTML = "";
  events.forEach((event) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${event.ts || ""}</td>
      <td>${event.event_type || ""}</td>
      <td>${event.agent_id || "-"}</td>
      <td>${event.source || ""}</td>
      <td>${previewPayload(event.payload)}</td>
    `;
    timelineBody.appendChild(row);
  });
}

function renderThread() {
  const conversation = Array.isArray(currentContext.conversation) ? currentContext.conversation : [];
  ceoThread.innerHTML = "";

  if (conversation.length === 0) {
    ceoThread.innerHTML = "<li><strong>No CEO thread yet</strong><span>Run a build or send a nudge to create the thread.</span></li>";
    return;
  }

  conversation.slice(-10).forEach((message) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${message.sender || "Unknown"}</strong><span>${message.message || ""}</span>`;
    ceoThread.appendChild(li);
  });
}

function renderApprovals() {
  const approvals = Array.isArray(currentContext.approvals) ? currentContext.approvals : [];
  const updates = Array.isArray(currentContext.inbox) ? currentContext.inbox.slice(0, 4) : [];
  approvalsList.innerHTML = "";

  if (approvals.length === 0 && updates.length === 0) {
    approvalsList.innerHTML = "<li><strong>No approvals pending</strong><span>The active project has no pending approvals or recent escalations.</span></li>";
    return;
  }

  approvals.forEach((approval) => {
    const li = document.createElement("li");
    const id = String(approval.id || "");
    const controls = approval.status === "pending"
      ? `<div class=\"row compact\"><button data-approval-id=\"${id}\" data-decision=\"approved\" type=\"button\">Approve</button><button class=\"danger\" data-approval-id=\"${id}\" data-decision=\"rejected\" type=\"button\">Reject</button></div>`
      : "";
    li.innerHTML = `<strong>${approval.title}</strong><span>Status: ${approval.status}</span><span>${approval.notes || ""}</span>${controls}`;
    approvalsList.appendChild(li);
  });

  updates.forEach((message) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>Update: ${message.sender || "Agent"}</strong><span>${message.subject || "Update"}</span><span>${message.body || ""}</span>`;
    approvalsList.appendChild(li);
  });
}

function renderMissionBrief() {
  const sections = [];
  const objective = currentContext.strategy?.objective || "No objective yet.";
  sections.push(`# Mission Statement\n\n${objective}`);

  const ceo = currentContext.strategy?.ceo_summary || "No CEO summary yet.";
  const coordinator = currentContext.strategy?.coordinator_summary || "No coordinator plan yet.";
  sections.push(`## Executive Direction\n\n${ceo}\n\n${coordinator}`);

  const offer = currentContext.offer_lab?.content || currentContext.offer_lab?.summary || "Offer lab not generated yet.";
  sections.push(`## Offer\n\n${offer}`);

  const spec = currentContext.product_spec?.content || currentContext.product_spec?.summary || "Product spec not generated yet.";
  sections.push(`## Product\n\n${spec}`);

  missionBriefContent.textContent = sections.join("\n\n");
}

function renderStrategyViews() {
  ceoResponse.textContent = currentContext.strategy?.latest_response || currentContext.strategy?.ceo_summary || "No strategy output yet.";
  launchContent.textContent = currentContext.launch?.content || currentContext.launch?.summary || "Launch plan not generated yet.";
  renderMissionBrief();
}

function laneForStep(step) {
  if (step.status === "done") {
    return "done";
  }
  if (step.status === "needs_attention" || step.status === "blocked") {
    return "approvals";
  }
  if (step.status === "active" || step.status === "in_progress") {
    return "active";
  }
  return "queued";
}

function renderKanbanFromPipeline() {
  const steps = Array.isArray(currentContext.pipeline?.steps) ? currentContext.pipeline.steps : [];
  agentKanban.innerHTML = "";

  if (missionBoardNote) {
    if (buildInProgress) {
      missionBoardNote.textContent = `Build in progress for ${currentContext.project_id || activeProjectId}. Specialists are being routed now.`;
    } else if (steps.length === 0) {
      missionBoardNote.textContent = `No build run yet for ${currentContext.project_id || activeProjectId}. Click Build Business to generate artifacts.`;
    } else if (steps.length > 0 && steps.every((step) => step.status === "done")) {
      missionBoardNote.textContent = `Latest scaffold run completed. Outputs are in sandbox/projects/${currentContext.project_id || activeProjectId}. Open Files to inspect or preview.`;
    } else {
      missionBoardNote.textContent = `Build in progress for ${currentContext.project_id || activeProjectId}.`;
    }
  }

  // No build run yet: show the agent roster so the board isn't empty
  if (!buildInProgress && steps.length === 0) {
    const rosterDescriptions = {
      project_manager: "Turns goals into milestones and delivery plans",
      researcher: "Validates market signals and positioning",
      writer: "Crafts the offer, copy, and launch narrative",
      designer: "Translates strategy into usable interfaces",
      developer: "Builds product scaffolds and integrations",
      analyst: "Defines metrics and success criteria",
      critic: "Reviews logic and flags launch risks",
    };
    const rosterEl = document.createElement("div");
    rosterEl.className = "kanban-roster";
    const cards = Object.keys(rosterDescriptions).map((role) => `
      <article class="kanban-card queued roster-card">
        <header>
          <span class="agent-avatar">${role.slice(0, 2).toUpperCase()}</span>
          <div>
            <h5>${role.replace(/_/g, ' ')}</h5>
            <p>${rosterDescriptions[role]}</p>
          </div>
        </header>
        <p class="meta">Status: standing by</p>
        <div class="progress-track"><div class="progress-fill" style="width:0%"></div></div>
      </article>
    `).join('');
    rosterEl.innerHTML = `
      <p class="roster-heading">Your team is standing by &mdash; configure a project objective and click <strong>Build Business</strong> to deploy them.</p>
      <div class="roster-grid">${cards}</div>
    `;
    agentKanban.appendChild(rosterEl);
    return;
  }

  const lanes = {
    queued: [],
    active: [],
    approvals: [],
    done: [],
  };

  steps.forEach((step) => {
    lanes[laneForStep(step)].push(step);
  });

  const laneMeta = [
    { key: "queued", title: "Queued" },
    { key: "active", title: "In Progress" },
    { key: "approvals", title: "Needs Approval" },
    { key: "done", title: "Completed" },
  ];

  laneMeta.forEach((meta) => {
    const laneEl = document.createElement("article");
    laneEl.className = "kanban-lane";
    const cards = lanes[meta.key]
      .map((step) => {
        const score = meta.key === "done" ? 100 : meta.key === "approvals" ? 45 : meta.key === "active" ? 66 : 20;
        return `
          <article class="kanban-card ${meta.key}">
            <header>
              <span class="agent-avatar">${String(step.role || "AG").slice(0, 2).toUpperCase()}</span>
              <div>
                <h5>${step.role || "agent"}</h5>
                <p>${step.title || "task"}</p>
              </div>
            </header>
            <p class="meta">Status: ${step.status || "queued"}</p>
            <div class="progress-track"><div class="progress-fill" style="width:${score}%"></div></div>
          </article>
        `;
      })
      .join("");

    laneEl.innerHTML = `
      <header>
        <h4>${meta.title}</h4>
        <span class="lane-count">${lanes[meta.key].length}</span>
      </header>
      <div class="lane-body">${cards || '<p class="empty-lane">No items</p>'}</div>
    `;
    agentKanban.appendChild(laneEl);
  });
}

function prepareOfficeSprites() {
  const steps = Array.isArray(currentContext.pipeline?.steps) ? currentContext.pipeline.steps : [];
  // When no build has run, populate the office with the full agent roster idling
  const roster = steps.length > 0 ? steps : BUILD_STAGE_BLUEPRINT.map((s) => ({ id: s.id, role: s.role, status: 'queued' }));
  const existing = {};
  officeSprites.forEach((s) => { existing[s.id] = s; });

  officeSprites = roster.slice(0, 10).map((step, index) => {
    const laneRow = Math.floor(index / 5);
    const laneCol = index % 5;
    const baseX = 94 + laneCol * 148;
    const baseY = 96 + laneRow * 148;
    const newStatus = step.status || 'queued';

    if (existing[step.id]) {
      const prev = existing[step.id];
      const wasStatus = prev.status;
      prev.status = newStatus;
      prev.speed = statusSpeed(newStatus);
      // Burst particles when a step first hits 'done'
      if (wasStatus !== 'done' && newStatus === 'done') {
        prev.particles = Array.from({ length: 12 }, () => createParticle(prev.x, prev.y));
      }
      return prev;
    }

    return {
      id: step.id,
      role: step.role,
      status: newStatus,
      x: baseX,
      y: baseY,
      targetX: baseX + 12,
      targetY: baseY + 8,
      homeX: baseX,
      homeY: baseY,
      speed: statusSpeed(newStatus),
      frame: 0,
      particles: [],
      emoteBob: Math.random() * Math.PI * 2,
    };
  });
}

function roleCharacterRow(role) {
  // Character Model.png rows: 0-2 = female (light/med/dark), 3-5 = male (light/med/dark)
  if (role === 'project_manager') return 3;
  if (role === 'developer')       return 1;
  if (role === 'researcher')      return 0;
  if (role === 'writer')          return 2;
  if (role === 'designer')        return 4;
  if (role === 'analyst')         return 5;
  if (role === 'critic')          return 3;
  return 0;
}

function roleHairRow(role) {
  // Hairs.png rows: 0=brown, 1=grey, 2=red, 3=orange, 4=light-brown, 5=med-brown, 6=dark, 7=black
  if (role === 'project_manager') return 6;
  if (role === 'developer')       return 4;
  if (role === 'researcher')      return 2;
  if (role === 'writer')          return 1;
  if (role === 'designer')        return 3;
  if (role === 'analyst')         return 7;
  if (role === 'critic')          return 0;
  return 5;
}

function roleOutfitKey(role) {
  if (outfitSheets[role]) return role;
  return 'developer';
}

function rolePaletteIndex(role) {
  if (role === 'project_manager') return 0;
  if (role === 'developer')       return 1;
  if (role === 'researcher')      return 2;
  if (role === 'writer')          return 3;
  if (role === 'designer')        return 4;
  if (role === 'analyst')         return 5;
  if (role === 'critic')          return 0;
  return 1;
}

function spriteRoleFrame(role) {
  if (role === "project_manager") return 0;
  if (role === "researcher") return 1;
  if (role === "writer") return 2;
  if (role === "designer") return 3;
  if (role === "developer") return 1;
  if (role === "analyst") return 0;
  if (role === "critic") return 2;
  return 3;
}

function statusSpeed(status) {
  if (status === 'active' || status === 'in_progress') return 1.6;
  if (status === 'done') return 0;
  if (status === 'needs_attention' || status === 'blocked') return 0.4;
  return 0.35;
}

function createParticle(x, y) {
  const colors = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'];
  return {
    x: x + 14 + (Math.random() - 0.5) * 16,
    y: y - 10,
    vx: (Math.random() - 0.5) * 2.5,
    vy: -1.5 - Math.random() * 1.5,
    life: 1.0,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 2 + Math.random() * 2,
  };
}

async function loadSpriteSheets() {
  if (spriteSheetsLoaded) {
    return;
  }

  const loadImage = (src) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

  const BASE = "./assets/imports/raw";
  const PIXEL_BASE = "./assets/imports/pixel-agents";

  const [pixelChars, pixelFloors] = await Promise.all([
    Promise.all(Array.from({ length: 6 }, (_v, i) => loadImage(`${PIXEL_BASE}/characters/char_${i}.png`))),
    Promise.all(Array.from({ length: 9 }, (_v, i) => loadImage(`${PIXEL_BASE}/floors/floor_${i}.png`))),
  ]);
  pixelAgentCharSheets = pixelChars.filter((img) => img !== null);
  pixelAgentFloorTiles = pixelFloors.filter((img) => img !== null);

  const [
    charImg, hairImg, shadowImg, tileImg, carpetImg,
    outfit_pm, outfit_dev, outfit_res,
    outfit_wr, outfit_des, outfit_an, outfit_crit,
    svgAgents, svgTiles,
  ] = await Promise.all([
    loadImage(`${BASE}/metrocity/CharacterModel/Character%20Model.png`),
    loadImage(`${BASE}/metrocity/Hair/Hairs.png`),
    loadImage(`${BASE}/metrocity/CharacterModel/Shadow.png`),
    loadImage(`${BASE}/interior/Home/TilesHouse.png`),
    loadImage(`${BASE}/interior/Home/Carpet-Sheet.png`),
    loadImage(`${BASE}/metrocity/Outfits/Suit.png`),
    loadImage(`${BASE}/metrocity/Outfits/Outfit2.png`),
    loadImage(`${BASE}/metrocity/Outfits/Outfit3.png`),
    loadImage(`${BASE}/metrocity/Outfits/Outfit5.png`),
    loadImage(`${BASE}/metrocity/Outfits/Outfit4.png`),
    loadImage(`${BASE}/metrocity/Outfits/Outfit1.png`),
    loadImage(`${BASE}/metrocity/Outfits/Outfit6.png`),
    loadImage("./assets/sprites/agents.svg"),
    loadImage("./assets/sprites/office_tiles.svg"),
  ]);

  characterSheet = charImg;
  hairSheet = hairImg;
  characterShadow = shadowImg;
  tileHouseSheet = tileImg;
  carpetSheet = carpetImg;
  outfitSheets = {
    project_manager: outfit_pm,
    developer:       outfit_dev,
    researcher:      outfit_res,
    writer:          outfit_wr,
    designer:        outfit_des,
    analyst:         outfit_an,
    critic:          outfit_crit,
  };
  agentSpriteSheet = svgAgents;
  tileSpriteSheet  = svgTiles;

  spriteSheetsLoaded = pixelAgentCharSheets.length > 0 || characterSheet !== null || agentSpriteSheet !== null;
}

const OFFICE_TILE_STYLES = {
  0: { base: "#bca989", edge: "#9a8567", accent: "#d7c8ad", pattern: "boards" },
  1: { base: "#e5dcc9", edge: "#c7bca7", accent: "#f4ecdb", pattern: "boards" },
  2: { base: "#7f5736", edge: "#56371e", accent: "#aa7a4e", pattern: "desk" },
  3: { base: "#628169", edge: "#42604a", accent: "#84a48a", pattern: "rug" },
  4: { base: "#6e7782", edge: "#4f5660", accent: "#97a1ab", pattern: "divider" },
  5: { base: "#c15e4a", edge: "#7f372d", accent: "#e4bf69", pattern: "accent" },
};

function drawTile(ctx, index, x, y, size = 16) {
  const style = OFFICE_TILE_STYLES[index];
  if (style) {
    ctx.fillStyle = style.base;
    ctx.fillRect(x, y, size, size);

    ctx.fillStyle = style.accent;
    if (style.pattern === "boards") {
      ctx.fillRect(x, y, size, 2);
      if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
        ctx.fillRect(x, y + size - 5, size, 2);
      }
    } else if (style.pattern === "desk") {
      ctx.fillRect(x + 2, y + 2, size - 4, 3);
      ctx.fillRect(x + 3, y + 6, size - 6, size - 10);
    } else if (style.pattern === "rug") {
      ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
      ctx.fillStyle = style.base;
      ctx.fillRect(x + 5, y + 5, size - 10, size - 10);
      ctx.fillStyle = style.accent;
    } else if (style.pattern === "divider") {
      ctx.fillRect(x, y + 5, size, 3);
      ctx.fillRect(x + 5, y, 2, size);
    } else if (style.pattern === "accent") {
      ctx.fillRect(x + Math.floor(size * 0.25), y + Math.floor(size * 0.25), Math.floor(size * 0.5), Math.floor(size * 0.5));
    }

    ctx.fillStyle = style.edge;
    ctx.fillRect(x, y + size - 2, size, 2);
    ctx.fillRect(x + size - 2, y, 2, size);
    return;
  }

  // Primary: use pixel-agents floor tiles (0-8).
  if (pixelAgentFloorTiles.length > 0) {
    const tile = pixelAgentFloorTiles[index % pixelAgentFloorTiles.length];
    if (tile) {
      ctx.drawImage(tile, 0, 0, tile.width, tile.height, x, y, size, size);
      return;
    }
  }
  // Fallback: legacy SVG tile strip
  if (tileSpriteSheet) {
    ctx.drawImage(tileSpriteSheet, index * 16, 0, 16, 16, x, y, size, size);
  }
}

function drawSpriteAgent(ctx, sprite) {
  const px = Math.round(sprite.x);
  const py = Math.round(sprite.y);

  if (pixelAgentCharSheets.length > 0) {
    const sheet = pixelAgentCharSheets[rolePaletteIndex(sprite.role) % pixelAgentCharSheets.length];
    if (sheet) {
      const FRAME_W = 16;
      const FRAME_H = 32;
      const agentStatus = sprite.status || 'queued';
      const isMoving = Math.abs(sprite.targetX - sprite.x) > 2 || Math.abs(sprite.targetY - sprite.y) > 2;
      let walkCycle, frameRate;
      if (agentStatus === 'active' || agentStatus === 'in_progress') {
        walkCycle = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
        frameRate = 100;
      } else if (agentStatus === 'done' || !isMoving) {
        walkCycle = [0];
        frameRate = 400;
      } else {
        walkCycle = [0, 1, 0, 1];
        frameRate = 260;
      }
      const frame = walkCycle[Math.floor(performance.now() / frameRate) % walkCycle.length];
      const dir = sprite.dir !== undefined ? sprite.dir : 0;

      let row = 0;
      let flip = false;
      if (dir === 3) row = 1;        // up
      else if (dir === 2) row = 2;   // right
      else if (dir === 1) {          // left (flipped right)
        row = 2;
        flip = true;
      }

      const sx = frame * FRAME_W;
      const sy = row * FRAME_H;
      const drawW = 24;
      const drawH = 48;
      // Bottom-center anchor, matching pixel-agents style.
      const drawX = Math.round(px + 14 - drawW / 2);
      const drawY = Math.round(py + 30 - drawH);

      if (flip) {
        ctx.save();
        ctx.translate(drawX + drawW, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, drawX, drawY, drawW, drawH);
      }
      return;
    }
  }

  const drawSize = 56;
  const drawX = px - 12;
  const drawY = py - 22;

  if (characterSheet) {
    const FRAME_W = 32;
    const FRAME_H = 32;
    // Direction cols: down=0-5, left=6-11, right=12-17, up=18-23
    const dir = sprite.dir !== undefined ? sprite.dir : 0;
    const walkCycle = [0, 1, 2, 1];
    const walkFrame = walkCycle[Math.floor(performance.now() / 140) % walkCycle.length];
    const col = dir * 6 + walkFrame;
    const sx = col * FRAME_W;
    const bodyRow = roleCharacterRow(sprite.role);
    const hairRow = roleHairRow(sprite.role);
    const outfit = outfitSheets[roleOutfitKey(sprite.role)];

    if (characterShadow) {
      ctx.drawImage(characterShadow, 0, 0, FRAME_W, FRAME_H, drawX, drawY, drawSize, drawSize);
    }
    // Layer 1: body
    ctx.drawImage(characterSheet, sx, bodyRow * FRAME_H, FRAME_W, FRAME_H, drawX, drawY, drawSize, drawSize);
    // Layer 2: outfit (same frame, single row at sy=0)
    if (outfit) {
      ctx.drawImage(outfit, sx, 0, FRAME_W, FRAME_H, drawX, drawY, drawSize, drawSize);
    }
    // Layer 3: hair (same frame, row from hair sheet)
    if (hairSheet) {
      ctx.drawImage(hairSheet, sx, hairRow * FRAME_H, FRAME_W, FRAME_H, drawX, drawY, drawSize, drawSize);
    }
    return;
  }

  // Fallback: legacy SVG sprite
  if (agentSpriteSheet) {
    const roleFrame = spriteRoleFrame(sprite.role);
    const frameToggle = Math.floor(performance.now() / 320) % 2 === 0;
    const sx = frameToggle ? roleFrame * 32 : roleFrame * 32 + 32;
    const sy = roleFrame < 2 ? 0 : 32;
    ctx.drawImage(agentSpriteSheet, sx, sy, 32, 32, px, py, 32, 32);
    return;
  }

  // Fallback: solid-color rect
  ctx.fillStyle = roleColor(sprite.role);
  ctx.fillRect(px + 4, py + 8, 12, 12);
}

function drawAgentEmote(ctx, sprite) {
  const status = sprite.status || 'queued';
  const now = performance.now();
  const bob = Math.sin(now / 600 + (sprite.emoteBob || 0)) * 3;

  const px = Math.round(sprite.x);
  const py = Math.round(sprite.y);
  const emoteX = px + 14;
  const emoteY = py - 18 + bob;

  let bgColor, textColor, label;

  if (status === 'active' || status === 'in_progress') {
    bgColor = '#3b82f6';
    textColor = '#fff';
    // Animate gear spin via cycling label chars
    const spin = Math.floor(now / 180) % 4;
    label = ['◐', '◓', '◑', '◒'][spin];
  } else if (status === 'done') {
    bgColor = '#22c55e';
    textColor = '#fff';
    label = '★';
  } else if (status === 'needs_attention' || status === 'blocked') {
    const flash = Math.floor(now / 280) % 2 === 0;
    bgColor = flash ? '#ef4444' : '#f97316';
    textColor = '#fff';
    label = '!';
  } else {
    // queued — soft gray dots
    bgColor = 'rgba(80,80,80,0.65)';
    textColor = '#ddd';
    const dots = Math.floor(now / 480) % 3;
    label = dots === 0 ? '.' : dots === 1 ? '..' : '...';
  }

  const bubbleW = 18;
  const bubbleH = 13;
  const bx = emoteX - bubbleW / 2;
  const by = emoteY - bubbleH;

  ctx.save();
  ctx.fillStyle = bgColor;
  // Bubble body
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(bx, by, bubbleW, bubbleH, 3);
  } else {
    ctx.rect(bx, by, bubbleW, bubbleH);
  }
  ctx.fill();
  // Tail
  ctx.beginPath();
  ctx.moveTo(emoteX - 3, by + bubbleH);
  ctx.lineTo(emoteX + 3, by + bubbleH);
  ctx.lineTo(emoteX, by + bubbleH + 4);
  ctx.closePath();
  ctx.fill();
  // Label
  ctx.fillStyle = textColor;
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, emoteX, by + bubbleH / 2);
  ctx.restore();
}

function drawAgentParticles(ctx, sprite) {
  if (!sprite.particles || sprite.particles.length === 0) return;
  sprite.particles = sprite.particles.filter((p) => p.life > 0);
  sprite.particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06;
    p.life -= 0.022;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(p.size), Math.ceil(p.size));
    ctx.restore();
  });
}

function drawStudioOffice(ctx) {
  // Floor base: left side (tiles 0), right side (tiles 1).
  for (let y = 0; y < officeCanvas.height; y += 16) {
    for (let x = 0; x < officeCanvas.width; x += 16) {
      const floorTile = x < 420 ? 0 : 1;
      drawTile(ctx, floorTile, x, y);
    }
  }

  // Corridor divider stripe.
  for (let x = 420; x < officeCanvas.width; x += 16) {
    drawTile(ctx, 4, x, 126);
  }

  // Desk banks: two rows on left, two on right.
  for (let desk = 0; desk < 2; desk += 1) {
    for (let dx = 0; dx < 6; dx += 1) {
      drawTile(ctx, 2, 92 + desk * 178 + dx * 16, 88);
      drawTile(ctx, 2, 92 + desk * 178 + dx * 16, 234);
      drawTile(ctx, 2, 456 + desk * 176 + dx * 16, 92);
      drawTile(ctx, 2, 456 + desk * 176 + dx * 16, 232);
    }
  }

  // Meeting area: rug zone.
  for (let y = 162; y < 162 + 160; y += 16) {
    for (let x = 540; x < 540 + 288; x += 16) {
      drawTile(ctx, 3, x, y);
    }
  }

  // Inner highlight in meeting area.
  for (let y = 200; y < 200 + 64; y += 16) {
    for (let x = 602; x < 602 + 128; x += 16) {
      drawTile(ctx, 4, x, y);
    }
  }

  // Accent markers near exits.
  drawTile(ctx, 5, 34, 286, 32);
  drawTile(ctx, 5, 844, 286, 32);
}

function drawMinimalOffice(ctx) {
  // Simple uniform floor.
  for (let y = 0; y < officeCanvas.height; y += 16) {
    for (let x = 0; x < officeCanvas.width; x += 16) {
      drawTile(ctx, 1, x, y);
    }
  }

  // Desk banks.
  for (let desk = 0; desk < 5; desk += 1) {
    for (let dx = 0; dx < 5; dx += 1) {
      drawTile(ctx, 2, 78 + desk * 148 + dx * 16, 68);
      drawTile(ctx, 2, 78 + desk * 148 + dx * 16, 214);
    }
  }
}

function drawOffice() {
  if (!officeCanvas) {
    return;
  }
  const ctx = officeCanvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, officeCanvas.width, officeCanvas.height);

  if (officeStyleSelect.value === "minimal") {
    drawMinimalOffice(ctx);
  } else {
    drawStudioOffice(ctx);
  }

  officeSprites.forEach((sprite, index) => {
    const status = sprite.status || 'queued';
    const hx = sprite.homeX !== undefined ? sprite.homeX : sprite.x;
    const hy = sprite.homeY !== undefined ? sprite.homeY : sprite.y;

    if (status === 'done') {
      // Stand still — face down, show celebration
      sprite.dir = 0;
    } else {
      const dx = sprite.targetX - sprite.x;
      const dy = sprite.targetY - sprite.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
        if (status === 'active' || status === 'in_progress') {
          // Energetic — roam across a wide area around desk
          sprite.targetX = hx + (Math.random() - 0.5) * 80;
          sprite.targetY = hy + (Math.random() - 0.5) * 50;
        } else if (status === 'needs_attention' || status === 'blocked') {
          // Pace nervously in a tight zone
          sprite.targetX = hx + (Math.random() - 0.5) * 18;
          sprite.targetY = hy + (Math.random() - 0.5) * 12;
        } else {
          // Queued — slow idle drift near home
          sprite.targetX = hx + Math.round(Math.random() * 20) - 10;
          sprite.targetY = hy + Math.round(Math.random() * 14) - 7;
        }
      } else {
        sprite.x += Math.sign(dx) * Math.min(Math.abs(dx), sprite.speed);
        sprite.y += Math.sign(dy) * Math.min(Math.abs(dy), sprite.speed);
        // 0=down, 1=left, 2=right, 3=up
        if (Math.abs(dx) >= Math.abs(dy)) {
          sprite.dir = dx < 0 ? 1 : 2;
        } else {
          sprite.dir = dy < 0 ? 3 : 0;
        }
      }
    }

    drawSpriteAgent(ctx, sprite);
    drawAgentEmote(ctx, sprite);
    drawAgentParticles(ctx, sprite);
  });
}

function ensureOfficeAnimation() {
  if (officeAnimationStarted) {
    return;
  }
  officeAnimationStarted = true;
  const tick = () => {
    drawOffice();
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

function renderProjectViews() {
  metricAgents.textContent = String((currentContext.pipeline?.steps || []).length);
  renderThread();
  renderApprovals();
  renderStrategyViews();
  renderKanbanFromPipeline();
  prepareOfficeSprites();
  setLlmStatus(currentContext.llm_status || {});
  ensureOfficeAnimation();
}

function previewUrlFor(pathname) {
  return `/preview/projects/${encodeURIComponent(activeProjectId)}/${pathname.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

function renderFileTree() {
  if (!fileTree) {
    return;
  }

  fileTree.innerHTML = "";
  if (!projectFiles.length) {
    fileTree.innerHTML = "<li>No generated files yet. Run Build Business first.</li>";
    return;
  }

  projectFiles.forEach((entry) => {
    const li = document.createElement("li");
    const depth = String(entry.path || "").split("/").length - 1;
    li.style.paddingLeft = `${depth * 14 + 10}px`;
    li.textContent = entry.type === "directory" ? `${entry.path}/` : entry.path;
    li.classList.toggle("directory", entry.type === "directory");
    li.classList.toggle("active", entry.path === selectedFilePath);
    li.dataset.path = entry.path;
    li.dataset.type = entry.type;
    fileTree.appendChild(li);
  });
}

async function previewFile(entry) {
  if (!entry || entry.type !== "file") {
    return;
  }

  selectedFilePath = entry.path;
  renderFileTree();
  previewPath.textContent = `sandbox/projects/${activeProjectId}/${entry.path}`;
  const ext = String(entry.ext || "").toLowerCase();
  const visualExt = [".html", ".htm", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"];

  if (visualExt.includes(ext)) {
    filePreviewText.style.display = "none";
    filePreviewFrame.style.display = "block";
    filePreviewFrame.src = previewUrlFor(entry.path);
    return;
  }

  filePreviewFrame.style.display = "none";
  filePreviewText.style.display = "block";
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/files?path=${encodeURIComponent(entry.path)}`);
  const data = await response.json();
  if (!data.ok) {
    filePreviewText.textContent = data.error || "Unable to preview this file.";
    return;
  }
  filePreviewText.textContent = data.content || "";
}

async function loadProjectFiles() {
  if (!activeProjectId || !fileTree) {
    return;
  }

  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/files`);
  const data = await response.json();
  if (!data.ok) {
    previewPath.textContent = data.error || "Unable to load project files.";
    return;
  }

  projectFiles = Array.isArray(data.files) ? data.files : [];
  renderFileTree();

  if (selectedFilePath) {
    const selected = projectFiles.find((item) => item.path === selectedFilePath);
    if (selected) {
      await previewFile(selected);
      return;
    }
  }

  const firstPreviewable = projectFiles.find((item) => item.type === "file" && item.previewable);
  if (firstPreviewable) {
    await previewFile(firstPreviewable);
  } else {
    filePreviewFrame.removeAttribute("src");
    filePreviewFrame.style.display = "none";
    filePreviewText.style.display = "block";
    filePreviewText.textContent = "No previewable files yet.";
  }
}

function fillProviderForm(providerName) {
  const config = providerSettings.configs?.[providerName] || {};
  providerBaseUrl.value = config.base_url || "";
  providerModel.value = config.model || "";
  providerTemperature.value = String(config.temperature ?? 0.2);
  providerMaxTokens.value = String(config.max_tokens ?? 4000);
  providerApiKeyEnv.value = config.api_key_env || "";
  providerApiKey.value = config.api_key || "";
}

function fillProjectLlmForm() {
  const llm = currentContext.llm || {};
  projectProviderSelect.innerHTML = "";
  providerSettings.providers.forEach((providerName) => {
    const option = document.createElement("option");
    option.value = providerName;
    option.textContent = providerName;
    projectProviderSelect.appendChild(option);
  });

  const provider = llm.provider || providerSettings.active_provider || providerSettings.providers[0] || "openrouter";
  if ([...projectProviderSelect.options].some((opt) => opt.value === provider)) {
    projectProviderSelect.value = provider;
  }
  projectProviderModel.value = llm.model || "";
}

async function loadProjectContext(projectId) {
  if (!projectId) {
    return;
  }
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/context`);
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to load project context");
  }

  const loaded = data.context || defaultProjectContext(projectId);
  if (loaded.project_id && String(loaded.project_id) !== String(projectId)) {
    currentContext = defaultProjectContext(projectId);
  } else {
    currentContext = {
      ...defaultProjectContext(projectId),
      ...loaded,
      llm_status: loaded.llm_status || data.llm_status || defaultProjectContext(projectId).llm_status,
    };
  }

  fillProjectLlmForm();
  renderProjectViews();
  await loadProjectFiles();
}

async function loadReplay(sessionId) {
  if (!sessionId) {
    return;
  }
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/replay`);
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to load replay");
  }
  currentReplay = data.replay;
  metricEvents.textContent = String(currentReplay.event_count || 0);
  renderTimeline(currentReplay.events || []);
}

async function loadSessions() {
  const response = await fetch("/api/sessions");
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to load sessions");
  }

  const sessions = data.sessions || [];
  metricSessions.textContent = String(sessions.length);
  sessionSelect.innerHTML = "";
  sessions.forEach((sessionId) => {
    const option = document.createElement("option");
    option.value = sessionId;
    option.textContent = sessionId;
    sessionSelect.appendChild(option);
  });

  if (sessions.length > 0) {
    const latest = sessions[sessions.length - 1];
    sessionSelect.value = latest;
    await loadReplay(latest);
  } else {
    currentReplay = { event_count: 0, agents: [], events: [] };
    metricEvents.textContent = "0";
    renderTimeline([]);
  }
}

async function loadProviderSettings() {
  const response = await fetch("/api/settings/provider");
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to load provider settings");
  }

  providerSettings = {
    active_provider: data.active_provider || "openrouter",
    providers: data.providers || [],
    configs: data.configs || {},
  };

  providerSelect.innerHTML = "";
  providerSettings.providers.forEach((providerName) => {
    const option = document.createElement("option");
    option.value = providerName;
    option.textContent = providerName;
    providerSelect.appendChild(option);
  });
  providerSelect.value = providerSettings.active_provider;
  fillProviderForm(providerSelect.value);
}

async function saveProviderSettings() {
  settingsStatus.textContent = "Saving provider config...";
  const activeProvider = providerSelect.value;
  const providerConfig = {
    base_url: providerBaseUrl.value.trim(),
    model: providerModel.value.trim(),
    temperature: Number(providerTemperature.value || 0.2),
    max_tokens: Number(providerMaxTokens.value || 4000),
    api_key_env: providerApiKeyEnv.value.trim(),
    api_key: providerApiKey.value.trim(),
  };

  const response = await fetch("/api/settings/provider", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active_provider: activeProvider, provider_config: providerConfig }),
  });
  const data = await response.json();
  if (!data.ok) {
    settingsStatus.textContent = `Error: ${data.error || "save failed"}`;
    return;
  }

  settingsStatus.textContent = `Saved ${data.active_provider} provider configuration.`;
  await loadProviderSettings();
  await loadProjectContext(activeProjectId);
}

async function saveProjectLlm() {
  const activeProject = getActiveProject();
  if (!activeProject) {
    settingsStatus.textContent = "Error: No active project selected.";
    return;
  }

  settingsStatus.textContent = "Saving project LLM override...";
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/llm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: projectProviderSelect.value,
      model: projectProviderModel.value.trim(),
    }),
  });
  const data = await response.json();
  if (!data.ok) {
    settingsStatus.textContent = `Error: ${data.error || "Unable to save project LLM"}`;
    return;
  }

  settingsStatus.textContent = "Saved project LLM override.";
  await loadProjectContext(activeProject.id);
}

async function runBuild() {
  const activeProject = getActiveProject();
  if (!activeProject) {
    ceoResponse.textContent = "No active project selected.";
    return;
  }
  if (!ceoObjective.value.trim()) {
    ceoResponse.textContent = "Provide an objective before running the build.";
    return;
  }

  buildInProgress = true;
  runBuildButton.disabled = true;
  currentContext = {
    ...currentContext,
    project_id: activeProject.id,
    pipeline: { steps: buildPlaceholderSteps(activeProject.name) },
  };
  ceoResponse.textContent = "Running CEO, coordinator, and specialist workflow...";
  renderProjectViews();

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objective: ceoObjective.value.trim(),
        budget: Number(ceoBudget.value || 600),
      }),
    });
    const data = await response.json();
    if (!data.ok) {
      buildInProgress = false;
      currentContext = {
        ...currentContext,
        pipeline: {
          steps: (currentContext.pipeline?.steps || []).map((step, index) => ({
            ...step,
            status: index === 0 ? "needs_attention" : step.status,
            summary: index === 0 ? (data.error || "Build failed before completion.") : step.summary,
          })),
        },
      };
      ceoResponse.textContent = `Error: ${data.error || "build failed"}`;
      renderProjectViews();
      return;
    }

    buildInProgress = false;
    currentContext = data.context || currentContext;
    ceoResponse.textContent = currentContext.strategy?.ceo_summary || "Build completed.";
    renderProjectViews();
    await loadProjectFiles();
    await loadSessions();
  } catch (error) {
    buildInProgress = false;
    currentContext = {
      ...currentContext,
      pipeline: {
        steps: (currentContext.pipeline?.steps || []).map((step, index) => ({
          ...step,
          status: index === 0 ? "needs_attention" : step.status,
          summary: index === 0 ? String(error?.message || error || "Build request failed.") : step.summary,
        })),
      },
    };
    ceoResponse.textContent = `Error: ${error?.message || "build failed"}`;
    renderProjectViews();
  } finally {
    runBuildButton.disabled = false;
  }
}

async function sendNudge() {
  const activeProject = getActiveProject();
  if (!activeProject) {
    ceoResponse.textContent = "No active project selected.";
    return;
  }
  if (!ceoNudge.value.trim()) {
    ceoResponse.textContent = "Write a nudge before sending it to the CEO.";
    return;
  }

  ceoResponse.textContent = "Sending nudge to CEO...";
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/ceo-nudge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: ceoNudge.value.trim(),
      budget: Number(ceoBudget.value || 120),
    }),
  });
  const data = await response.json();
  if (!data.ok) {
    ceoResponse.textContent = `Error: ${data.error || "nudge failed"}`;
    return;
  }

  currentContext = data.context || currentContext;
  ceoResponse.textContent = data.result?.reply || currentContext.strategy?.latest_response || "CEO nudge recorded.";
  ceoNudge.value = "";
  renderProjectViews();
}

async function refreshOffice() {
  if (!activeProjectId) {
    return;
  }
  await loadProjectContext(activeProjectId);
}

async function actOnApproval(approvalId, decision) {
  const activeProject = getActiveProject();
  if (!activeProject) {
    return;
  }

  const response = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/approvals/${encodeURIComponent(approvalId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  const data = await response.json();
  if (!data.ok) {
    ceoResponse.textContent = `Error: ${data.error || "Unable to update approval"}`;
    return;
  }

  currentContext = data.context || currentContext;
  renderProjectViews();
}

workspaceNav.addEventListener("click", (event) => {
  const target = event.target.closest(".menu-item");
  if (!target) {
    return;
  }
  const viewName = target.dataset.view || "strategy";
  setActiveView(viewName);
  if (viewName === "files") {
    void loadProjectFiles();
  }
});

fileTree?.addEventListener("click", async (event) => {
  const target = event.target.closest("li[data-path]");
  if (!target) {
    return;
  }
  if (target.dataset.type === "directory") {
    return;
  }
  const entry = projectFiles.find((item) => item.path === target.dataset.path);
  if (!entry) {
    return;
  }
  await previewFile(entry);
});

reloadFilesButton?.addEventListener("click", async () => {
  await loadProjectFiles();
});

openPreviewTabButton?.addEventListener("click", () => {
  if (!selectedFilePath) {
    return;
  }
  window.open(previewUrlFor(selectedFilePath), "_blank", "noopener,noreferrer");
});

approvalsList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-approval-id]");
  if (!button) {
    return;
  }
  await actOnApproval(button.dataset.approvalId, button.dataset.decision);
});

projectIcons.addEventListener("click", async (event) => {
  const target = event.target.closest(".project-icon[data-project-id]");
  if (!target) {
    return;
  }
  const project = projects.find((item) => item.id === target.dataset.projectId);
  if (!project || project.status === "deleted") {
    return;
  }

  currentContext = defaultProjectContext(project.id);
  renderProjectViews();

  const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!data.ok) {
    ceoResponse.textContent = `Error: ${data.error || "Unable to select project"}`;
    return;
  }

  activeProjectId = project.id;
  await loadProjects();
  await loadProjectContext(activeProjectId);
});

providerSelect.addEventListener("change", () => {
  fillProviderForm(providerSelect.value);
});

sessionSelect.addEventListener("change", async () => {
  await loadReplay(sessionSelect.value);
});

reloadSessionsButton.addEventListener("click", async () => {
  await loadSessions();
});

saveProviderButton.addEventListener("click", async () => {
  await saveProviderSettings();
});

saveProjectLlmButton.addEventListener("click", async () => {
  await saveProjectLlm();
});

runBuildButton.addEventListener("click", async () => {
  await runBuild();
});

sendNudgeButton.addEventListener("click", async () => {
  await sendNudge();
});

pauseProjectButton.addEventListener("click", async () => {
  await setProjectStatus("paused");
});

resumeProjectButton.addEventListener("click", async () => {
  await setProjectStatus("running");
});

deleteProjectButton.addEventListener("click", async () => {
  await handleDeleteProject();
});

addProjectButton.addEventListener("click", async () => {
  await handleCreateProject();
});

officeStyleSelect.addEventListener("change", () => {
  drawOffice();
});

refreshOfficeButton.addEventListener("click", async () => {
  await refreshOffice();
});

async function bootstrap() {
  setActiveView("strategy");
  renderMarketplace();
  await loadSpriteSheets();
  await loadProjects();
  await Promise.all([loadSessions(), loadProviderSettings()]);
  if (activeProjectId) {
    await loadProjectContext(activeProjectId);
  }
}

bootstrap().catch((err) => {
  ceoResponse.textContent = String(err);
});
