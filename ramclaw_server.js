const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const SANDBOX_ROOT = path.join(__dirname, 'sandbox');
const WEBUI_ROOT = path.join(__dirname, 'webui');
const CONFIG_PATH = path.join(SANDBOX_ROOT, 'config.json');
const LOG_PATH = path.join(SANDBOX_ROOT, 'ramclaw.log');

const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

function venvPython() {
  const venv = path.join(SANDBOX_ROOT, 'venv');
  const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
  const exe = process.platform === 'win32' ? 'python.exe' : 'python';
  return path.join(venv, bin, exe);
}

async function pingLMStudio(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const base = endpoint.replace(/\/$/, '');
    const candidates = [
      `${base}/models`,
      `${base.replace(/\/v1$/, '')}/v1/models`,
      `${base.replace(/\/v1$/, '')}/models`,
    ];

    for (const url of candidates) {
      try {
        const resp = await fetch(url, { signal: controller.signal });
        if (resp.ok) {
          clearTimeout(timeout);
          return true;
        }
      } catch (err) {
      }
    }

    clearTimeout(timeout);
    return false;
  } catch (err) {
    clearTimeout(timeout);
    return false;
  }
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const target = path.join(WEBUI_ROOT, urlPath);
  if (!target.startsWith(WEBUI_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200);
    res.end(data);
  });
}

function handleTask(req, res, body) {
  try {
    const { task } = JSON.parse(body || '{}');
    if (!task) {
      res.writeHead(400);
      res.end('Missing task');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    const child = spawn(venvPython(), ['-m', 'openclaw.agent', task], {
      cwd: SANDBOX_ROOT,
      env: {
        ...process.env,
        HOME: SANDBOX_ROOT,
        USERPROFILE: SANDBOX_ROOT,
        RAMCLAW_CONFIG: CONFIG_PATH,
      },
    });

    log(`Task started: ${task}`);
    child.stdout.on('data', (chunk) => res.write(chunk));
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      log(`Task stderr: ${text.trim()}`);
      res.write(`\n[err] ${text}`);
    });
    child.on('close', (code) => {
      log(`Task finished with code ${code}`);
      res.end();
    });
    req.on('close', () => child.kill());
  } catch (err) {
    res.writeHead(500);
    res.end(`Task failed: ${err.message}`);
  }
}

function handlePublicKey(res) {
  const pub = path.join(SANDBOX_ROOT, '.ssh', 'id_rsa.pub');
  try {
    const key = fs.readFileSync(pub, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(key);
  } catch (err) {
    res.writeHead(500);
    res.end('Public key not found. Run install.js first.');
  }
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    log('Config missing. Run install.js first.');
    process.exit(1);
  }

  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const endpoint = cfg.llm?.endpoint || 'http://127.0.0.1:1234/v1';
  const ok = await pingLMStudio(endpoint);
  if (!ok) {
    log(`Warning: LM Studio is not reachable at ${endpoint}. UI will still start; tasks may fail until LM Studio API is enabled.`);
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/api/task' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => handleTask(req, res, body));
      return;
    }

    if (req.url === '/api/public-key') {
      handlePublicKey(res);
      return;
    }

    if (req.url === '/workspace') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Workspace lives inside /sandbox/workspace within the Pinokio sandbox.');
      return;
    }

    serveStatic(req, res);
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => log(`RamClaw UI running at http://localhost:${port}`));
}

main().catch((err) => {
  log(`Start failed: ${err.message}`);
  process.exit(1);
});
