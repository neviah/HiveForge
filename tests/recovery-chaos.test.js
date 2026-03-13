'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureMessageBus,
  appendMessageBusEntry,
  readMessageBusEntries,
  recoverProjectStateAfterRestart,
} = require('../hiveforge_server');

function uniqueProjectId(name) {
  return `test-${name}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

function baseState(projectId) {
  return {
    id: projectId,
    name: 'Recovery Test Project',
    template: 'business',
    status: 'running',
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    logs: [],
    recurring: { enabled: true, lastRunAt: {}, lastIdleNoticeAt: null },
    heartbeat: { status: 'alive', lastBeat: null, autoFixCount: 0, cycleCount: 0, log: [] },
    agents: [
      { id: `coordinator_${projectId}`, isCoordinator: true, status: 'running', currentTask: null },
      { id: 'worker_1', isCoordinator: false, status: 'running', currentTask: 'Old task' },
    ],
    tasks: [],
  };
}

test('recovery requeues inprogress task and idles running subordinate', () => {
  const projectId = uniqueProjectId('requeue');
  const state = baseState(projectId);
  state.tasks.push({
    id: 'TASK-1',
    title: 'Finish feature',
    status: 'inprogress',
    assignee: 'worker_1',
    startedAt: new Date().toISOString(),
    dependencies: [],
    inprogressCycles: 3,
    executionState: 'running',
    retryCount: 0,
    lastProgressAt: new Date().toISOString(),
    executionTaskRunId: 42,
  });

  const result = recoverProjectStateAfterRestart(state);

  assert.deepEqual(result.requeuedTaskIds, ['TASK-1']);
  assert.equal(state.tasks[0].status, 'backlog');
  assert.equal(state.tasks[0].assignee, null);
  assert.equal(state.tasks[0].executionState, 'queued');
  assert.equal(state.tasks[0].executionTaskRunId, null);
  assert.equal(state.tasks[0].lastProgressAt, null);

  const worker = state.agents.find((a) => a.id === 'worker_1');
  assert.ok(worker);
  assert.equal(worker.status, 'idle');
  assert.equal(worker.currentTask, null);
});

test('recovery marks running project completed when all tasks are done', () => {
  const projectId = uniqueProjectId('all-done');
  const state = baseState(projectId);
  state.operatingMode = 'finite_delivery';
  state.tasks.push({
    id: 'TASK-1',
    title: 'Done task',
    status: 'done',
    assignee: 'worker_1',
    dependencies: [],
    completedAt: new Date().toISOString(),
  });

  const result = recoverProjectStateAfterRestart(state);

  assert.equal(result.allDoneAfterRecovery, true);
  assert.equal(state.status, 'completed');
  assert.equal(state.heartbeat.status, 'completed');
  assert.ok(state.completedAt);
});

test('message bus continuity keeps prior records and appends restart requeue event', () => {
  ensureMessageBus();
  const projectId = uniqueProjectId('bus');

  appendMessageBusEntry({
    projectId,
    from: 'coordinator',
    to: 'scheduler',
    kind: 'pre_restart_marker',
    payload: { note: 'before recovery' },
  });

  const state = baseState(projectId);
  state.tasks.push({
    id: 'TASK-1',
    title: 'Interrupted task',
    status: 'inprogress',
    assignee: 'worker_1',
    startedAt: new Date().toISOString(),
    dependencies: [],
    executionState: 'running',
  });

  recoverProjectStateAfterRestart(state);

  const entries = readMessageBusEntries(projectId, 200);
  const kinds = entries.map((entry) => entry.kind);

  assert.equal(kinds.includes('pre_restart_marker'), true);
  assert.equal(kinds.includes('task_requeued_on_restart'), true);
});
