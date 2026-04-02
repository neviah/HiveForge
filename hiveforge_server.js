const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DASHBOARD_DIR = path.join(ROOT, "hiveforge", "ui", "dashboard");
const SESSION_DIR = path.join(ROOT, "hiveforge", "state", "sessions");
const MODELS_PATH = path.join(ROOT, "hiveforge", "config", "models.json");
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
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/settings/provider") {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body || "{}");
      const activeProvider = String(parsed.active_provider || "").trim();

      const models = readJsonFile(MODELS_PATH, { active_provider: "openrouter", providers: {} });
      if (!activeProvider || !models.providers || !models.providers[activeProvider]) {
        sendJson(res, 400, { ok: false, error: "Unknown provider" });
        return;
      }

      models.active_provider = activeProvider;
      fs.writeFileSync(MODELS_PATH, JSON.stringify(models, null, 2), "utf-8");
      sendJson(res, 200, { ok: true, active_provider: activeProvider });
      return;
    }

    if (req.method === "POST" && pathname === "/api/ceo/chat") {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body || "{}");
      const objective = String(parsed.objective || "").trim();
      const budget = Number(parsed.budget || 100.0);
      const state = parsed.state && typeof parsed.state === "object" ? parsed.state : {};

      if (!objective) {
        sendJson(res, 400, { ok: false, error: "objective is required" });
        return;
      }

      const chatResult = await runCeoChat(objective, state, budget);
      if (!chatResult.ok) {
        sendJson(res, 500, { ok: false, error: chatResult.error });
        return;
      }

      sendJson(res, 200, { ok: true, response: chatResult.result, warning: chatResult.warning });
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
