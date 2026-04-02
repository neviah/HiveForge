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

const sessionSelect = document.getElementById("session-select");
const reloadSessionsButton = document.getElementById("reload-sessions");
const timelineBody = document.getElementById("timeline-body");
const agentKanban = document.getElementById("agent-kanban");
const inboxList = document.getElementById("inbox-list");
const marketplaceList = document.getElementById("marketplace-list");
const approvalsList = document.getElementById("approvals-list");
const pipelineList = document.getElementById("pipeline-list");
const offerLabContent = document.getElementById("offer-lab-content");
const productSpecContent = document.getElementById("product-spec-content");
const launchContent = document.getElementById("launch-content");
const ceoThread = document.getElementById("ceo-thread");
const officeCanvas = document.getElementById("office-canvas");
const refreshOfficeButton = document.getElementById("refresh-office");

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

const ceoObjective = document.getElementById("ceo-objective");
const ceoBudget = document.getElementById("ceo-budget");
const ceoNudge = document.getElementById("ceo-nudge");
const runBuildButton = document.getElementById("run-build");
const sendNudgeButton = document.getElementById("send-nudge");
const ceoResponse = document.getElementById("ceo-response");

let currentReplay = { event_count: 0, agents: [], events: [] };
let currentContext = {
  strategy: {},
  offer_lab: {},
  product_spec: {},
  pipeline: { steps: [] },
  launch: {},
  inbox: [],
  approvals: [],
  office: { agents: [] },
  conversation: [],
  artifacts: [],
};
let providerSettings = { active_provider: "openrouter", providers: [], configs: {} };
let projects = [];
let activeProjectId = "agency";
let officeSprites = [];
let officeAnimationStarted = false;

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
    "offer-lab": "Offer Lab",
    "product-spec": "Product Spec",
    office: "Office",
    "build-pipeline": "Build Pipeline",
    launch: "Launch",
    inbox: "Inbox",
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

function renderInbox() {
  const messages = Array.isArray(currentContext.inbox) ? currentContext.inbox : [];
  inboxList.innerHTML = "";

  if (messages.length === 0) {
    inboxList.innerHTML = "<li><strong>No updates yet</strong><span>Agents will send updates here as work progresses.</span></li>";
    return;
  }

  messages.forEach((message) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${message.sender}: ${message.subject}</strong><span>${message.body}</span>`;
    inboxList.appendChild(li);
  });
}

function renderApprovals() {
  const approvals = Array.isArray(currentContext.approvals) ? currentContext.approvals : [];
  approvalsList.innerHTML = "";

  if (approvals.length === 0) {
    approvalsList.innerHTML = "<li><strong>No approvals pending</strong><span>Current workflow has no outstanding executive approvals.</span></li>";
    return;
  }

  approvals.forEach((approval) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${approval.title}</strong><span>Status: ${approval.status}</span>`;
    approvalsList.appendChild(li);
  });
}

function renderPipeline() {
  const steps = Array.isArray(currentContext.pipeline?.steps) ? currentContext.pipeline.steps : [];
  pipelineList.innerHTML = "";

  if (steps.length === 0) {
    pipelineList.innerHTML = "<li><strong>No pipeline yet</strong><span>Run Build Business to generate the execution pipeline.</span></li>";
    return;
  }

  steps.forEach((step) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${step.role}: ${step.title}</strong><span>Status: ${step.status}</span><span>${step.summary || ""}</span>`;
    pipelineList.appendChild(li);
  });
}

function renderStrategyViews() {
  ceoResponse.textContent = currentContext.strategy?.latest_response || currentContext.strategy?.ceo_summary || "No strategy output yet.";
  offerLabContent.textContent = currentContext.offer_lab?.content || currentContext.offer_lab?.summary || "Offer lab not generated yet.";
  productSpecContent.textContent = currentContext.product_spec?.content || currentContext.product_spec?.summary || "Product spec not generated yet.";
  launchContent.textContent = currentContext.launch?.content || currentContext.launch?.summary || "Launch plan not generated yet.";
}

function renderKanbanFromOffice() {
  const agents = Array.isArray(currentContext.office?.agents) ? currentContext.office.agents : [];
  agentKanban.innerHTML = "";

  const lanes = {
    queued: [],
    active: [],
    approvals: [],
    done: [],
  };

  agents.forEach((agent) => {
    const lane = lanes[agent.lane] ? agent.lane : "queued";
    lanes[lane].push(agent);
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
      .map((agent) => {
        const matchingStep = (currentContext.pipeline?.steps || []).find((step) => step.id === agent.task);
        const score = matchingStep?.status === "done" ? 100 : matchingStep?.status === "needs_attention" ? 55 : 72;
        return `
          <article class="kanban-card ${meta.key}">
            <header>
              <span class="agent-avatar">${String(agent.id || "AG").slice(0, 2).toUpperCase()}</span>
              <div>
                <h5>${agent.id || "Agent"}</h5>
                <p>${agent.task || "standby"}</p>
              </div>
            </header>
            <p class="meta">${agent.role || "specialist"} • ${agent.mood || "working"}</p>
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
  const agents = Array.isArray(currentContext.office?.agents) ? currentContext.office.agents : [];
  officeSprites = agents.map((agent, index) => {
    const laneRow = Math.floor(index / 4);
    const laneCol = index % 4;
    const baseX = 120 + laneCol * 180;
    const baseY = 120 + laneRow * 80;
    return {
      id: agent.id,
      role: agent.role,
      mood: agent.mood,
      x: baseX,
      y: baseY,
      targetX: baseX + 16,
      targetY: baseY,
      speed: 0.7 + (index % 3) * 0.2,
    };
  });
}

function drawPixelAgent(ctx, sprite) {
  const color = roleColor(sprite.role);
  const px = Math.round(sprite.x);
  const py = Math.round(sprite.y);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(px + 4, py + 2, 8, 8);
  ctx.fillStyle = color;
  ctx.fillRect(px + 2, py + 10, 12, 12);
  ctx.fillStyle = "#f5d0a9";
  ctx.fillRect(px + 5, py + 4, 6, 4);
  ctx.fillStyle = "#111827";
  ctx.fillRect(px + 2, py + 22, 4, 6);
  ctx.fillRect(px + 10, py + 22, 4, 6);
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
  ctx.fillStyle = "#f1ede4";
  ctx.fillRect(0, 0, officeCanvas.width, officeCanvas.height);
  ctx.fillStyle = "#d9cbb7";
  for (let x = 0; x < officeCanvas.width; x += 32) {
    ctx.fillRect(x, 0, 1, officeCanvas.height);
  }
  for (let y = 0; y < officeCanvas.height; y += 32) {
    ctx.fillRect(0, y, officeCanvas.width, 1);
  }
  ctx.fillStyle = "#9a6b3f";
  for (let desk = 0; desk < 4; desk += 1) {
    ctx.fillRect(90 + desk * 180, 70, 80, 28);
    ctx.fillRect(90 + desk * 180, 220, 80, 28);
  }

  officeSprites.forEach((sprite, index) => {
    const dx = sprite.targetX - sprite.x;
    const dy = sprite.targetY - sprite.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      const row = Math.floor(index / 4);
      const col = index % 4;
      sprite.targetX = 100 + col * 180 + Math.round(Math.random() * 48);
      sprite.targetY = 110 + row * 96 + Math.round(Math.random() * 18);
    } else {
      sprite.x += Math.sign(dx) * Math.min(Math.abs(dx), sprite.speed);
      sprite.y += Math.sign(dy) * Math.min(Math.abs(dy), sprite.speed);
    }
    drawPixelAgent(ctx, sprite);
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
  metricAgents.textContent = String((currentContext.office?.agents || []).length);
  renderThread();
  renderInbox();
  renderApprovals();
  renderPipeline();
  renderStrategyViews();
  renderKanbanFromOffice();
  prepareOfficeSprites();
  ensureOfficeAnimation();
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

async function loadProjectContext(projectId) {
  if (!projectId) {
    return;
  }
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/context`);
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Unable to load project context");
  }
  currentContext = data.context || currentContext;
  renderProjectViews();
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

  ceoResponse.textContent = "Running CEO, coordinator, and specialist workflow...";
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
    ceoResponse.textContent = `Error: ${data.error || "build failed"}`;
    return;
  }

  currentContext = data.context || currentContext;
  ceoResponse.textContent = currentContext.strategy?.ceo_summary || "Build completed.";
  renderProjectViews();
  await loadSessions();
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
  const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/office`);
  const data = await response.json();
  if (!data.ok) {
    ceoResponse.textContent = `Error: ${data.error || "Unable to refresh office"}`;
    return;
  }
  currentContext.office = data.office || { agents: [] };
  currentContext.pipeline = data.pipeline || { steps: [] };
  renderProjectViews();
}

workspaceNav.addEventListener("click", (event) => {
  const target = event.target.closest(".menu-item");
  if (!target) {
    return;
  }
  setActiveView(target.dataset.view || "strategy");
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

refreshOfficeButton.addEventListener("click", async () => {
  await refreshOffice();
});

async function bootstrap() {
  setActiveView("strategy");
  renderMarketplace();
  await loadProjects();
  await Promise.all([loadSessions(), loadProviderSettings()]);
  if (activeProjectId) {
    await loadProjectContext(activeProjectId);
  }
}

bootstrap().catch((err) => {
  ceoResponse.textContent = String(err);
});
