'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureMessageBus,
  evaluateAutoStaffing,
  recoverProjectStateAfterRestart,
} = require('../hiveforge_server');

function projectId(prefix) {
  return `test-${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

function baseState(id) {
  return {
    id,
    name: 'Operating Mode Test',
    template: 'business',
    operatingMode: 'continuous_business',
    status: 'running',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    logs: [],
    recurring: {
      enabled: true,
      lastRunAt: {},
      schedule: [
        { key: 'loop_1', title: 'Loop', phase: 'maintenance', everyMs: 60 * 60 * 1000 },
      ],
      lastIdleNoticeAt: null,
    },
    staffing: {
      enabled: true,
      cooldownMs: 1,
      backlogPerAgentThreshold: 1,
      maxOptionalAdds: 2,
      maxAgents: 5,
      baseSubordinateCount: 1,
      optionalPool: ['Legal Compliance Checker', 'SEO Specialist'],
      lastScaledAt: null,
    },
    heartbeat: { status: 'alive', lastBeat: null, autoFixCount: 0, cycleCount: 0, log: [] },
    agents: [
      { id: `coordinator_${id}`, isCoordinator: true, status: 'running', currentTask: null, role: 'Coordinator Agent' },
      { id: 'worker_1', isCoordinator: false, status: 'running', currentTask: 'Busy', role: 'Backend Architect', recentLog: ['Busy'], tasksDone: 0, tokens: 0 },
    ],
    tasks: [],
  };
}

test('continuous mode does not auto-complete on recovery when all tasks are done', () => {
  const id = projectId('continuous-recovery');
  const state = baseState(id);
  state.tasks.push({ id: 'DONE-1', title: 'Done', status: 'done', dependencies: [], phase: 'maintenance' });

  const result = recoverProjectStateAfterRestart(state);

  assert.equal(result.allDoneAfterRecovery, true);
  assert.equal(state.status, 'running');
  assert.notEqual(state.heartbeat.status, 'completed');
});

test('auto staffing adds optional specialist under backlog pressure', () => {
  ensureMessageBus();
  const id = projectId('auto-staffing');
  const state = baseState(id);
  state.tasks.push(
    { id: 'TASK-1', title: 'Legal compliance review for privacy policy', status: 'backlog', dependencies: [], phase: 'operations' },
    { id: 'TASK-2', title: 'Contract clause review', status: 'backlog', dependencies: [], phase: 'operations' },
    { id: 'TASK-3', title: 'Escalated support legal request', status: 'backlog', dependencies: [], phase: 'support' },
  );

  const added = evaluateAutoStaffing(state, new Date().toISOString());

  assert.ok(added);
  assert.equal(added.role, 'Legal Compliance Checker');
  assert.equal(state.agents.some((agent) => agent.role === 'Legal Compliance Checker'), true);
  assert.ok(state.staffing.lastScaledAt);
});
