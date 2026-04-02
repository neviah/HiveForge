const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DASHBOARD_DIR = path.join(ROOT, "hiveforge", "ui", "dashboard");
const SESSION_DIR = path.join(ROOT, "hiveforge", "state", "sessions");
const STATE_DIR = path.join(ROOT, "hiveforge", "state");
const MODELS_PATH = path.join(ROOT, "hiveforge", "config", "models.json");
const PROJECTS_PATH = path.join(STATE_DIR, "projects.json");
const PUBLIC_KEY_PATH = path.join(ROOT, "sandbox", ".ssh", "id_rsa.pub");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": MIME[".json"],
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": MIME[".txt"],
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (_err) {
    return fallback;
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeProjectId(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultProjectsRecord() {
  return {
    active_project_id: "agency",
    projects: [
      { id: "agency", name: "Software Agency", icon: "A", status: "running" },
      { id: "publishing", name: "Publishing", icon: "P", status: "running" },
      { id: "research", name: "Research Lab", icon: "R", status: "paused" },
      { id: "game", name: "Game Studio", icon: "G", status: "running" },
    ],
  };
}

function normalizeProjectStatus(status) {
  if (status === "paused" || status === "deleted") {
    return status;
  }
  return "running";
}

function normalizeProject(project) {
  const name = String(project?.name || "Untitled Project").trim() || "Untitled Project";
  const id = sanitizeProjectId(project?.id || name) || `project-${Date.now()}`;
  const icon = String(project?.icon || name.charAt(0) || "P").trim().slice(0, 1).toUpperCase();

  return {
    id,
    name,
    icon,
    status: normalizeProjectStatus(String(project?.status || "running")),
  };
}

function readProjectsRecord() {
  const fallback = defaultProjectsRecord();
  ensureDir(STATE_DIR);

  if (!fs.existsSync(PROJECTS_PATH)) {
    fs.writeFileSync(PROJECTS_PATH, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }

  const raw = readJsonFile(PROJECTS_PATH, fallback);
  const projects = Array.isArray(raw.projects) ? raw.projects.map(normalizeProject) : fallback.projects.map(normalizeProject);

  const nonDeleted = projects.filter((project) => project.status !== "deleted");
  const preferredActive = sanitizeProjectId(raw.active_project_id);
  const active = projects.find((project) => project.id === preferredActive && project.status !== "deleted") || nonDeleted[0] || projects[0] || null;

  return {
    active_project_id: active ? active.id : "",
    projects,
  };
}

function writeProjectsRecord(record) {
  ensureDir(STATE_DIR);
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(record, null, 2), "utf-8");
}

function parseSessionEvents(sessionId) {
  const filePath = path.join(SESSION_DIR, `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  const events = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (_err) {
      // Ignore malformed lines to keep replay resilient.
    }
  }
  return events;
}

function listSessions() {
  if (!fs.existsSync(SESSION_DIR)) {
    return [];
  }

  return fs
    .readdirSync(SESSION_DIR)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => name.replace(/\.jsonl$/, ""))
    .sort();
}

function summarizeReplay(sessionId) {
  const events = parseSessionEvents(sessionId);
  const eventTypes = {};
  const agents = new Set();

  for (const event of events) {
    const eventType = event.event_type || "unknown";
    eventTypes[eventType] = (eventTypes[eventType] || 0) + 1;
    if (event.agent_id) {
      agents.add(event.agent_id);
    }
  }

  return {
    session_id: sessionId,
    event_count: events.length,
    event_types: eventTypes,
    agents: [...agents].sort(),
    events,
  };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function runCeoChat(objective, state, budget) {
  const venvPythonExe = path.join(ROOT, ".venv", "Scripts", "python.exe");
  const pythonExe = fs.existsSync(venvPythonExe) ? venvPythonExe : "python";
  const code = [
    "import json",
    "from hiveforge import ExecutiveAgent",
    "payload = json.loads(input())",
    "objective = payload.get('objective', '')",
    "state = payload.get('state', {})",
    "budget = payload.get('budget', 100.0)",
    "agent = ExecutiveAgent()",
    "result = agent.run_task(objective=objective, state=state, budget=budget)",
    "print(json.dumps(result, ensure_ascii=True))",
  ].join("\n");

  return new Promise((resolve) => {
    const child = spawn(pythonExe, ["-c", code], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    const payload = JSON.stringify({ objective, state, budget });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      resolve({ ok: false, error: String(err) });
    });

    child.on("close", () => {
      try {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        const lastLine = lines.length > 0 ? lines[lines.length - 1] : "{}";
        const parsed = JSON.parse(lastLine);
        resolve({ ok: true, result: parsed, warning: stderr.trim() || null });
      } catch (_err) {
        resolve({ ok: false, error: stderr.trim() || "Unable to parse CEO response" });
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

function serveStatic(res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(normalized).replace(/^([.][.][\\/])+/, "");
  const filePath = path.join(DASHBOARD_DIR, safePath);

  if (!filePath.startsWith(DASHBOARD_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType, "Content-Length": data.length });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
    const pathname = requestUrl.pathname;
    const projectActionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/(pause|resume|select)$/);
    const projectDeleteMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);

    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, { ok: true, service: "hiveforge_server" });
      return;
    }

    if (req.method === "GET" && pathname === "/api/public-key") {
      if (!fs.existsSync(PUBLIC_KEY_PATH)) {
        sendText(res, 404, "No SSH public key found. Run install first.");
        return;
      }
      sendText(res, 200, fs.readFileSync(PUBLIC_KEY_PATH, "utf-8"));
      return;
    }

    if (req.method === "GET" && pathname === "/api/sessions") {
      sendJson(res, 200, { ok: true, sessions: listSessions() });
      return;
    }

    if (req.method === "GET" && pathname === "/api/projects") {
      const record = readProjectsRecord();
      sendJson(res, 200, {
        ok: true,
        active_project_id: record.active_project_id,
        projects: record.projects,
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/projects") {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body || "{}");
      const name = String(parsed.name || "").trim();
      const requestedIcon = String(parsed.icon || "").trim();

      if (!name) {
        sendJson(res, 400, { ok: false, error: "name is required" });
        return;
      }

      const record = readProjectsRecord();
      const baseId = sanitizeProjectId(name) || `project-${Date.now()}`;
      let candidateId = baseId;
      let index = 1;

      while (record.projects.some((project) => project.id === candidateId)) {
        candidateId = `${baseId}-${index}`;
        index += 1;
      }

      const newProject = normalizeProject({
        id: candidateId,
        name,
        icon: requestedIcon || name.charAt(0),
        status: "running",
      });

      record.projects.push(newProject);
      record.active_project_id = newProject.id;
      writeProjectsRecord(record);

      sendJson(res, 200, {
        ok: true,
        active_project_id: record.active_project_id,
        project: newProject,
      });
      return;
    }

    if (req.method === "POST" && projectActionMatch) {
      const projectId = sanitizeProjectId(decodeURIComponent(projectActionMatch[1] || ""));
      const action = projectActionMatch[2];
      const record = readProjectsRecord();
      const project = record.projects.find((item) => item.id === projectId);

      if (!project) {
        sendJson(res, 404, { ok: false, error: "Project not found" });
        return;
      }

      if (action === "pause") {
        project.status = "paused";
      }
      if (action === "resume") {
        project.status = "running";
      }
      if (action === "select") {
        if (project.status === "deleted") {
          sendJson(res, 409, { ok: false, error: "Cannot select a deleted project" });
          return;
        }
      }

      if (action === "select" || project.id === record.active_project_id || !record.active_project_id) {
        const fallback = record.projects.find((item) => item.status !== "deleted");
        record.active_project_id = action === "select" ? project.id : (fallback ? fallback.id : "");
      }

      writeProjectsRecord(record);
      sendJson(res, 200, {
        ok: true,
        active_project_id: record.active_project_id,
        project,
        projects: record.projects,
      });
      return;
    }

    if (req.method === "DELETE" && projectDeleteMatch && pathname.startsWith("/api/projects/")) {
      const projectId = sanitizeProjectId(decodeURIComponent(projectDeleteMatch[1] || ""));
      const record = readProjectsRecord();
      const project = record.projects.find((item) => item.id === projectId);

      if (!project) {
        sendJson(res, 404, { ok: false, error: "Project not found" });
        return;
      }

      project.status = "deleted";
      const fallback = record.projects.find((item) => item.status !== "deleted");
      record.active_project_id = fallback ? fallback.id : "";
      writeProjectsRecord(record);

      sendJson(res, 200, {
        ok: true,
        active_project_id: record.active_project_id,
        project,
        projects: record.projects,
      });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/sessions/") && pathname.endsWith("/replay")) {
      const sessionId = decodeURIComponent(pathname.replace("/api/sessions/", "").replace("/replay", "")).replace(/^\/+|\/+$/g, "");
      sendJson(res, 200, { ok: true, replay: summarizeReplay(sessionId) });
      return;
    }

    if (req.method === "GET" && pathname === "/api/settings/provider") {
      const models = readJsonFile(MODELS_PATH, { active_provider: "openrouter", providers: {} });
      sendJson(res, 200, {
        ok: true,
        active_provider: models.active_provider || "openrouter",
        providers: Object.keys(models.providers || {}),
        configs: models.providers || {},
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/settings/provider") {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body || "{}");
      const activeProvider = String(parsed.active_provider || "").trim();
      const providerConfig = parsed.provider_config && typeof parsed.provider_config === "object" ? parsed.provider_config : null;

      const models = readJsonFile(MODELS_PATH, { active_provider: "openrouter", providers: {} });
      if (!activeProvider || !models.providers || !models.providers[activeProvider]) {
        sendJson(res, 400, { ok: false, error: "Unknown provider" });
        return;
      }

      if (providerConfig) {
        const existing = models.providers[activeProvider] || {};
        models.providers[activeProvider] = {
          ...existing,
          ...providerConfig,
        };
      }

      models.active_provider = activeProvider;
      fs.writeFileSync(MODELS_PATH, JSON.stringify(models, null, 2), "utf-8");
      sendJson(res, 200, {
        ok: true,
        active_provider: activeProvider,
        provider_config: models.providers[activeProvider],
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/ceo/chat") {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body || "{}");
      const objective = String(parsed.objective || "").trim();
      const budget = Number(parsed.budget || 100.0);
      const state = parsed.state && typeof parsed.state === "object" ? parsed.state : {};
      const projects = readProjectsRecord();
      const requestedProjectId = sanitizeProjectId(parsed.project_id || projects.active_project_id || "");
      const project = projects.projects.find((item) => item.id === requestedProjectId);

      if (!objective) {
        sendJson(res, 400, { ok: false, error: "objective is required" });
        return;
      }

      if (!project) {
        sendJson(res, 404, { ok: false, error: "Project not found" });
        return;
      }

      if (project.status === "paused") {
        sendJson(res, 409, { ok: false, error: "Project is paused. Resume it before running CEO tasks." });
        return;
      }

      if (project.status === "deleted") {
        sendJson(res, 409, { ok: false, error: "Project is deleted. Select another active project." });
        return;
      }

      projects.active_project_id = project.id;
      writeProjectsRecord(projects);

      const enrichedState = {
        ...state,
        project_id: project.id,
        project_name: project.name,
      };

      const chatResult = await runCeoChat(objective, enrichedState, budget);
      if (!chatResult.ok) {
        sendJson(res, 500, { ok: false, error: chatResult.error });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        response: chatResult.result,
        warning: chatResult.warning,
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
        },
      });
      return;
    }

    serveStatic(res, pathname);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`HiveForge server running at http://127.0.0.1:${PORT}`);
});
