// New API routes for draft mode preview and user feedback loop (added to hiveforge_server.js before serveStatic)

// === DRAFT MODE PREVIEW ENDPOINT ===
if (pathname.startsWith('/api/projects/') && pathname.endsWith('/preview') && req.method === 'GET') {
  const url_parts = pathname.split('/');
  const projectId = url_parts[3]; // /api/projects/{projectId}/preview
  const runtime = projectId ? projectRuntimes.get(projectId) : null;
  if (!runtime || runtime.state.mode !== 'draft') {
    writeJson(res, { error: 'Preview not available for this project' }, 404);
    return;
  }
  const previewRoot = path.join(WORKSPACE_ROOT, 'projects', projectId, 'preview');
  const indexHtml = path.join(previewRoot, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    writeJson(res, { error: 'Preview files not ready yet' }, 404);
    return;
  }
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(indexHtml, 'utf-8'));
  } catch (err) {
    writeJson(res, { error: 'Failed to load preview' }, 500);
  }
  return;
}

// === USER FEEDBACK / AGENT COMMUNICATION ENDPOINT ===
if (pathname.startsWith('/api/projects/') && pathname.endsWith('/feedback') && req.method === 'POST') {
  readRequestBody(req).then((body) => {
    let payload = {};
    try { payload = parseJsonBodySafe(body); } catch (_) {}
    const url_parts = pathname.split('/');
    const projectId = url_parts[3]; // /api/projects/{projectId}/feedback
    const runtime = projectId ? projectRuntimes.get(projectId) : null;
    if (!runtime) {
      writeJson(res, { error: 'Project not found' }, 404);
      return;
    }
    const message = String(payload.message || '').trim();
    const targetAgentRole = String(payload.targetAgentRole || '').trim();
    if (!message) {
      writeJson(res, { error: 'message is required' }, 400);
      return;
    }
    const feedbackId = crypto.randomUUID();
    appendMessageBusEntry({
      kind: 'user_feedback',
      projectId,
      from: 'operator',
      to: targetAgentRole || 'coordinator',
      correlationId: feedbackId,
      payload: {
        message,
        targetAgentRole: targetAgentRole || 'coordinator',
        feedbackId,
        timeSent: nowIso()
      }
    }).then(() => {
      if (runtime.state.projectLog) {
        runtime.state.projectLog.push({
          ts: nowIso(),
          kind: 'user_feedback_received',
          feedbackId,
          message,
          targetAgentRole: targetAgentRole || 'coordinator'
        });
      }
      writeJson(res, {
        ok: true,
        feedbackId,
        message: 'Feedback sent to project coordinator',
        status: 'pending'
      }, 201);
    }).catch((err) => {
      writeJson(res, { error: 'Failed to send feedback: ' + err.message }, 500);
    });
  }).catch(() => writeJson(res, { error: 'Invalid request' }, 400));
  return;
}

// === GET PROJECT MESSAGES/FEEDBACK HISTORY ===
if (pathname.startsWith('/api/projects/') && pathname.endsWith('/messages') && req.method === 'GET') {
  const url_parts = pathname.split('/');
  const projectId = url_parts[3]; // /api/projects/{projectId}/messages
  const runtime = projectId ? projectRuntimes.get(projectId) : null;
  if (!runtime) {
    writeJson(res, { error: 'Project not found' }, 404);
    return;
  }
  const feedbackEntries = runtime.state.projectLog
    ? runtime.state.projectLog.filter((entry) =>
        entry.kind === 'user_feedback_received' ||
        entry.kind === 'agent_response_to_feedback' ||
        entry.kind === 'feedback_task_created'
      )
    : [];
  writeJson(res, { ok: true, messages: feedbackEntries, count: feedbackEntries.length });
  return;
}

// === PROMOTE DRAFT TO PRODUCTION ===
if (pathname.startsWith('/api/projects/') && pathname.endsWith('/promote') && req.method === 'POST') {
  readRequestBody(req).then((body) => {
    let payload = {};
    try { payload = parseJsonBodySafe(body); } catch (_) {}
    const url_parts = pathname.split('/');
    const projectId = url_parts[3]; // /api/projects/{projectId}/promote
    const runtime = projectId ? projectRuntimes.get(projectId) : null;
    if (!runtime) {
      writeJson(res, { error: 'Project not found' }, 404);
      return;
    }
    if (runtime.state.mode !== 'draft') {
      writeJson(res, { error: 'Project is not in draft mode' }, 412);
      return;
    }
    runtime.state.mode = 'production';
    runtime.state.promotedAt = nowIso();
    if (runtime.state.projectLog) {
      runtime.state.projectLog.push({
        ts: nowIso(),
        kind: 'project_promoted_to_production',
        promotedAt: runtime.state.promotedAt,
        message: 'Project promoted from draft to production. Ready for deployment.'
      });
    }
    persistProjectState(runtime.state);
    writeJson(res, {
      ok: true,
      projectId,
      message: 'Project promoted to production mode. Deploy tasks can now proceed.',
      mode: 'production'
    }, 200);
  }).catch(() => writeJson(res, { error: 'Invalid request' }, 400));
  return;
}
