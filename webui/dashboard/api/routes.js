/**
 * HiveForge API Endpoint Stubs — api/routes.js
 *
 * Express-style route handler stubs showing the full API contract.
 * Wire these into hiveforge_server.js during Task 4 (multi-agent engine).
 *
 * All handlers are pure stubs that return 501 Not Implemented until
 * the backend logic is added. Each stub documents its expected
 * request shape and response schema.
 *
 * Usage in hiveforge_server.js:
 *   const routes = require('./webui/dashboard/api/routes');
 *   routes.register(app);   // app = Express/http.Server wrapper
 */

'use strict';

// ─── Projects ──────────────────────────────────────────────────────────────

/**
 * GET /api/projects
 * Returns all projects stored in sandbox/projects/.
 *
 * Response 200:
 * [
 *   {
 *     id: string,           // uuid
 *     name: string,
 *     template: string,     // key from TEMPLATES constant
 *     status: 'running'|'idle'|'paused'|'error',
 *     heartbeat: 'alive'|'dead'|'unknown',
 *     lastActivity: ISO8601,
 *     agentCount: number,
 *     currentTask: string|null
 *   }, ...
 * ]
 */
function getProjects(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4 (multi-agent engine)' }));
}

/**
 * POST /api/projects
 * Create a new project and spawn the Coordinator Agent.
 *
 * Body: { name: string, template: string, goal: string }
 *
 * Response 201: { id, name, template, status: 'running', ... }
 */
function createProject(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

/**
 * DELETE /api/projects/:id
 * Stop all agents and delete project data from sandbox.
 *
 * Response 200: { ok: true }
 */
function deleteProject(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

// ─── Agents ────────────────────────────────────────────────────────────────

/**
 * GET /api/agents?projectId=<id>
 * Returns all agents currently loaded in the given project.
 *
 * Response 200:
 * [
 *   {
 *     id: string,
 *     name: string,
 *     role: string,
 *     status: 'running'|'idle'|'paused'|'error',
 *     currentTask: string|null,
 *     tasksDone: number,
 *     tokens: number,
 *     recentLog: string[]   // last 10 output lines
 *   }, ...
 * ]
 */
function getAgents(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

/**
 * POST /api/agents
 * Add an agent from the marketplace to an active project.
 * The Coordinator Agent is notified and pending tasks are re-routed.
 *
 * Body: { projectId: string, agentId: string }
 *
 * Response 201: { id, name, role, status: 'idle' }
 */
function addAgent(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

/**
 * DELETE /api/agents/:id?projectId=<id>
 * Stop and remove an agent from a project.
 * Coordinator re-routes any in-flight tasks.
 *
 * Response 200: { ok: true }
 */
function removeAgent(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

/**
 * GET /api/tasks?projectId=<id>
 * Returns all tasks in the project, used to populate the Kanban board.
 *
 * Response 200:
 * [
 *   {
 *     id: string,
 *     title: string,
 *     status: 'backlog'|'inprogress'|'review'|'done',
 *     assignee: string|null,  // agent id
 *     blockedBy: string|null, // task id
 *     createdAt: ISO8601,
 *     completedAt: ISO8601|null
 *   }, ...
 * ]
 */
function getTasks(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

/**
 * POST /api/tasks
 * Inject a manual task into the Coordinator's queue.
 *
 * Body: { projectId: string, title: string, description: string, assignee?: string }
 *
 * Response 201: { id, title, status: 'backlog' }
 */
function createTask(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

// ─── Heartbeat ─────────────────────────────────────────────────────────────

/**
 * GET /api/heartbeat?projectId=<id>
 * Returns the current heartbeat status of the project.
 *
 * Response 200:
 * {
 *   status: 'alive'|'dead'|'unknown',
 *   uptime: string,           // e.g. "2h 14m"
 *   lastBeat: ISO8601,
 *   autoFixCount: number,
 *   log: [{ ts: ISO8601, message: string }, ...]
 * }
 */
function getHeartbeat(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

/**
 * POST /api/heartbeat
 * Trigger an immediate heartbeat cycle for the project.
 *
 * Body: { projectId: string }
 *
 * Response 200: { triggered: true, ts: ISO8601 }
 */
function forceHeartbeat(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

// ─── Credentials ──────────────────────────────────────────────────────────

/**
 * GET /api/credentials
 * Returns saved credential metadata (NO tokens — never expose tokens to the UI).
 *
 * Response 200:
 * [
 *   {
 *     service: string,
 *     connected: boolean,
 *     budget: number|null,    // monthly spend limit USD
 *     lastUsed: ISO8601|null
 *   }, ...
 * ]
 */
function getCredentials(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 5 (credential vault)' }));
}

/**
 * POST /api/credentials
 * Save or update a credential. Token is AES-encrypted at rest in
 * sandbox/credentials/<service>.enc — never stored in plaintext.
 *
 * Body: { service: string, token: string, budget?: number }
 *
 * Response 200: { service, connected: true }
 */
function saveCredential(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 5' }));
}

/**
 * DELETE /api/credentials/:service
 * Remove an encrypted credential file.
 *
 * Response 200: { ok: true }
 */
function deleteCredential(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 5' }));
}

// ─── Analytics ─────────────────────────────────────────────────────────────

/**
 * GET /api/analytics?projectId=<id>
 * Returns aggregated analytics KPIs for the project.
 * Data is fetched (and cached) by the Analytics Reporter agent via the
 * api-gateway ClawHub skill.
 *
 * Response 200:
 * {
 *   kpi: string[],           // 6 values matching KPI_LABELS: visitors, conversions, revenue, adSpend, roas, openRate
 *   lastUpdated: ISO8601
 * }
 */
function getAnalytics(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4 + credentials' }));
}

// ─── Logs ──────────────────────────────────────────────────────────────────

/**
 * GET /api/logs?projectId=<id>&filter=<type>
 * Returns structured event log for the project.
 * filter: 'all'|'message'|'task'|'deploy'|'error'|'fix'|'heartbeat'
 *
 * Response 200:
 * [
 *   {
 *     ts: ISO8601,
 *     type: string,
 *     data: object
 *   }, ...
 * ]
 */
function getLogs(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

// ─── Control ───────────────────────────────────────────────────────────────

/**
 * POST /api/control
 * Send a manual control action to the project's Coordinator Agent.
 *
 * Body: { projectId: string, action: 'pause'|'resume'|'restart_agents'|'heartbeat'|'export'|'delete' }
 *
 * Response 200: { ok: true, action, projectId }
 */
function projectControl(req, res) {
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — pending Task 4' }));
}

// ─── LLM Health ────────────────────────────────────────────────────────────

/**
 * GET /api/llm_health
 * Checks whether LM Studio is reachable at the configured endpoint.
 *
 * Response 200: { status: 'ok', model: string, endpoint: string }
 * Response 200: { status: 'error', message: string }
 */
function getLLMHealth(req, res) {
  // Stubbed — hiveforge_server.js already has an /api/llm_health-equivalent;
  // this stub is a placeholder until it's formally extracted to a route.
  res.writeHead(501, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not implemented — wire into hiveforge_server.js' }));
}

// ─── Route registration helper ─────────────────────────────────────────────

/**
 * Register all dashboard API routes on the given simple HTTP server wrapper.
 * Called from hiveforge_server.js once the server is up.
 *
 * @param {object} router  - Object with { get(path, handler), post(path, handler), delete(path, handler) }
 */
function register(router) {
  router.get('/api/projects',         getProjects);
  router.post('/api/projects',        createProject);
  router.delete('/api/projects/:id',  deleteProject);

  router.get('/api/agents',           getAgents);
  router.post('/api/agents',          addAgent);
  router.delete('/api/agents/:id',    removeAgent);

  router.get('/api/tasks',            getTasks);
  router.post('/api/tasks',           createTask);

  router.get('/api/heartbeat',        getHeartbeat);
  router.post('/api/heartbeat',       forceHeartbeat);

  router.get('/api/credentials',      getCredentials);
  router.post('/api/credentials',     saveCredential);
  router.delete('/api/credentials/:service', deleteCredential);

  router.get('/api/analytics',        getAnalytics);
  router.get('/api/logs',             getLogs);
  router.post('/api/control',         projectControl);
  router.get('/api/llm_health',       getLLMHealth);
}

module.exports = {
  register,
  // Export individual handlers so they can be tested in isolation
  getProjects, createProject, deleteProject,
  getAgents, addAgent, removeAgent,
  getTasks, createTask,
  getHeartbeat, forceHeartbeat,
  getCredentials, saveCredential, deleteCredential,
  getAnalytics, getLogs, projectControl, getLLMHealth,
};
