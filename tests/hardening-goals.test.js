'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessApprovalRisk,
  ensureApprovalGovernanceState,
  evaluateApprovalGovernanceDecision,
  applyIndustryApprovalPolicyPack,
  connectorRetryPlan,
  connectorExecutionKey,
  connectorMutationExecutionKey,
  isMutatingConnectorOperation,
  connectorIdempotencyMode,
  shouldReconcileConnectorExecution,
  reconcileConnectorExecution,
  evaluateGoogleAdsGuardrails,
  evaluateSupportAutonomyRouting,
  evaluateFinanceAutonomyGuardrails,
  evaluateFinanceSettlementExceptions,
  processFinanceSettlementExceptions,
  goalActionPlanFromPrompt,
  buildPublicationDistributionPlan,
  executePublicationDistributionPlan,
  buildPublicationDriftReplayPlan,
  executePublicationDriftSelfHeal,
  markConnectorExecutionRecord,
  appendApprovalDecisionAudit,
  readApprovalDecisionAudit,
  refreshWeeklyKpiPlan,
  shouldBlockMutatingConnectorInDraftMode,
  shouldSkipConnectorPolicyFailureInDraft,
  isOperationalLoopSuspended,
  ensureOperationalLoopState,
  summarizeIdleBlockers,
  makeAnalyticsSnapshot,
  shouldEscalateGameplayRemediation,
  shouldEscalateGenericTaskRemediation,
  ensureCredentialStorage,
  upsertProjectCredentialPolicy,
  recordCredentialSpend,
  buildGoalMilestones,
  evaluateMilestoneCompletion,
  verifyGoalDelivery,
  summarizeProjectAutomation,
  buildProductionEvidenceBundle,
  SUPPORTED_CREDENTIAL_SERVICES,
} = require('../hiveforge_server');

function projectId(prefix) {
  return `test-${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
}

test('approval risk scores deploy + high cost as high risk', () => {
  const task = {
    id: 'RECUR-1',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      estimatedCost: 1200,
    },
  };

  const risk = assessApprovalRisk(task, {
    reason: 'Permission needed for netlify:trigger_deploy',
    checks: [
      { type: 'project_policy', ok: false },
    ],
  });

  assert.equal(risk.level, 'high');
  assert.equal(risk.requiresHuman, true);
  assert.ok(risk.score >= 70);
});

test('retry plan marks transient failures as retryable with backoff', () => {
  const first = connectorRetryPlan(1, 'HTTP 503 connector timeout');
  const third = connectorRetryPlan(3, 'HTTP 503 connector timeout');

  assert.equal(first.retryable, true);
  assert.equal(third.retryable, true);
  assert.ok(third.delayMs > first.delayMs);
});

test('analytics snapshot includes variance alerts when goals drift', () => {
  ensureCredentialStorage();
  const id = projectId('analytics-goals');
  const now = new Date().toISOString();

  const state = {
    id,
    name: 'Goal Drift Test',
    status: 'running',
    startedAt: now,
    tasks: [
      { id: 'D1', status: 'done', completedAt: now },
      { id: 'B1', status: 'backlog' },
      { id: 'B2', status: 'backlog' },
      { id: 'B3', status: 'backlog' },
      { id: 'B4', status: 'backlog' },
      { id: 'B5', status: 'backlog' },
    ],
    agents: [
      { id: 'coordinator', status: 'running', tokens: 0 },
      { id: 'worker', status: 'idle', tokens: 42 },
    ],
    kpiGoals: {
      weeklyTasksDoneTarget: 10,
      maxBacklog: 2,
      maxMonthlySpend: 0,
      weeklyPlan: {
        weekStart: now,
        lastPlannedAt: null,
        nextReviewAt: null,
        summary: null,
      },
    },
    deadLetters: [{ taskId: 'RECUR-failed', retryCount: 3, reason: 'timeout' }],
  };

  const snapshot = makeAnalyticsSnapshot(state);
  assert.ok(Array.isArray(snapshot.alerts));
  assert.ok(snapshot.alerts.length > 0);
  assert.equal(typeof snapshot.variance.weeklyTasksDone, 'number');
  assert.equal(Array.isArray(snapshot.deadLetters), true);
  assert.equal(snapshot.deadLetters.length, 1);
  assert.equal(typeof snapshot.publicationHealth.dashboard, 'object');
  assert.equal(typeof snapshot.publicationHealth.dashboard.incidents.total, 'number');
});

test('goal prompt analysis generates phased action plan with connector readiness checks', () => {
  const plan = goalActionPlanFromPrompt('business', 'Build a property management website where landlords and tenants sign up, process monthly fee billing, launch to production, and run ads/support.', {});

  assert.equal(plan.source, 'goal_prompt_analysis');
  assert.equal(Array.isArray(plan.tasks), true);
  assert.equal(plan.tasks.length > 6, true);
  assert.equal(Array.isArray(plan.requiredConnectors), true);
  assert.equal(plan.requiredConnectors.includes('stripe'), true);
  assert.equal(plan.requiredConnectors.includes('netlify'), true);
  assert.equal(plan.requiredConnectors.includes('google_ads'), true);
  assert.equal(plan.requiredConnectors.includes('support_ticket'), true);
  assert.equal(plan.tasks.some((task) => /validate stripe connector readiness/i.test(String(task.title || ''))), true);
  assert.equal(plan.tasks.some((task) => /landlord\/tenant\/property lifecycle/i.test(String(task.title || ''))), true);
});

test('goal prompt analysis asks clarifying questions for ambiguous game studio prompts', () => {
  const plan = goalActionPlanFromPrompt('game_studio', 'Build a 2D game prototype quickly.', {});

  assert.equal(Array.isArray(plan.clarificationQuestions), true);
  assert.equal(plan.clarificationQuestions.length >= 2, true);
  assert.equal(
    plan.clarificationQuestions.some((question) => /single-player, multiplayer, or both/i.test(String(question || ''))),
    true,
  );
  assert.equal(
    plan.clarificationQuestions.some((question) => /release lane should we prioritize first/i.test(String(question || ''))),
    true,
  );
});

test('goal prompt analysis asks auth clarification for web app goals without auth detail', () => {
  const plan = goalActionPlanFromPrompt('business', 'Build a web app for tenant billing and payment reminders.', {});

  assert.equal(Array.isArray(plan.clarificationQuestions), true);
  assert.equal(
    plan.clarificationQuestions.some((question) => /account-based authentication/i.test(String(question || ''))),
    true,
  );
});

test('business web implementation task requires complete marketplace UX flows', () => {
  const plan = goalActionPlanFromPrompt('business', 'Build an auction dating website where users can bid for date experiences.', {});
  const implementationTask = (plan.tasks || []).find((task) => /implement core web experience/i.test(String(task.title || '')));
  assert.ok(implementationTask);
  const desc = String(implementationTask.description || '').toLowerCase();

  assert.match(desc, /navigation|menu/);
  assert.match(desc, /login|signup|auth|account/);
  assert.match(desc, /profile/);
  assert.match(desc, /create-auction|seller flow|create auction/);
  assert.match(desc, /my bids|my auctions|watchlist|dashboard/);
  assert.match(desc, /filter|search|sort|category/);
  assert.match(desc, /loading|empty|error/);
});

test('draft mode blocks mutating connector actions only', () => {
  assert.equal(shouldBlockMutatingConnectorInDraftMode('draft', 'netlify', 'trigger_deploy'), true);
  assert.equal(shouldBlockMutatingConnectorInDraftMode('draft', 'analytics', 'get_profile'), false);
  assert.equal(shouldBlockMutatingConnectorInDraftMode('production', 'netlify', 'trigger_deploy'), false);
});

test('draft mode soft-skips connector policy failures for auto-actions', () => {
  assert.equal(
    shouldSkipConnectorPolicyFailureInDraft(
      { mode: 'draft' },
      { type: 'connector', connector: 'google_ads', operation: 'optimize_campaigns' },
      { ok: false, reason: 'Credential google_ads is not connected.' },
    ),
    true,
  );
  assert.equal(
    shouldSkipConnectorPolicyFailureInDraft(
      { mode: 'production' },
      { type: 'connector', connector: 'google_ads', operation: 'optimize_campaigns' },
      { ok: false, reason: 'Credential google_ads is not connected.' },
    ),
    false,
  );
  assert.equal(
    shouldSkipConnectorPolicyFailureInDraft(
      { mode: 'draft' },
      { type: 'connector', connector: 'google_ads', operation: 'optimize_campaigns' },
      { ok: true, reason: 'ok' },
    ),
    false,
  );
});

test('operational loop suspension clears after expiry', () => {
  const state = { operationalLoops: null };
  ensureOperationalLoopState(state);
  state.operationalLoops.safety.suspendedUntil = new Date(Date.now() - 60 * 1000).toISOString();
  state.operationalLoops.safety.lastSuspendReason = 'test_reason';

  const status = isOperationalLoopSuspended(state);
  assert.equal(status.suspended, false);
  assert.equal(state.operationalLoops.safety.suspendedUntil, null);
  assert.equal(state.operationalLoops.safety.lastSuspendReason, null);
});

test('idle blocker summary explains approvals, dependency blockers, and loop suspension', () => {
  const state = {
    operatingMode: 'continuous_business',
    recurring: { enabled: true, schedule: [{ key: 'x', everyMs: 1000 }], lastRunAt: {} },
    tasks: [
      { id: 'A', status: 'done' },
      { id: 'B', status: 'backlog', dependencies: ['A'] },
      { id: 'C', status: 'backlog', dependencies: ['MISSING'] },
      { id: 'D', status: 'review', executionState: 'awaiting_approval' },
    ],
  };

  const idle = summarizeIdleBlockers(state, {
    suspended: true,
    suspendedUntil: '2099-01-01T00:00:00.000Z',
    reason: 'test_pause',
    failureCount: 4,
  });

  assert.equal(idle.backlogRunnable, 1);
  assert.equal(idle.backlogBlockedByDependencies, 1);
  assert.equal(idle.awaitingApprovalCount, 1);
  assert.equal(Boolean(idle.recurringSuspended), true);
  assert.match(idle.summary, /paused until/i);
  assert.match(idle.summary, /awaiting approval/i);
  assert.match(idle.summary, /blocked by dependencies/i);
});

test('gameplay remediation escalation triggers for repeated game.js execution failures', () => {
  const projectState = { template: 'game_studio' };
  const task = { title: 'Implement game JavaScript logic (game.js)' };

  const shouldEscalate = shouldEscalateGameplayRemediation(
    projectState,
    task,
    1,
    'exit_code_1',
    2,
  );

  assert.equal(shouldEscalate, true);
});

test('gameplay remediation escalation does not trigger before repeated failures', () => {
  const projectState = { template: 'game_studio' };
  const task = { title: 'Implement game JavaScript logic (game.js)' };

  const shouldEscalate = shouldEscalateGameplayRemediation(
    projectState,
    task,
    1,
    'exit_code_1',
    1,
  );

  assert.equal(shouldEscalate, false);
});

test('gameplay remediation escalation remains scoped to game_studio game.js tasks', () => {
  const shouldEscalateWrongTemplate = shouldEscalateGameplayRemediation(
    { template: 'business' },
    { title: 'Implement game JavaScript logic (game.js)' },
    2,
    'gameplay_loop_incomplete:missing_main_loop_scheduler',
    3,
  );

  const shouldEscalateWrongTask = shouldEscalateGameplayRemediation(
    { template: 'game_studio' },
    { title: 'Implement game CSS styles (style.css)' },
    2,
    'gameplay_loop_incomplete:missing_main_loop_scheduler',
    3,
  );

  assert.equal(shouldEscalateWrongTemplate, false);
  assert.equal(shouldEscalateWrongTask, false);
});

test('generic remediation escalation triggers for repeated non-remediation failures', () => {
  assert.equal(
    shouldEscalateGenericTaskRemediation({ id: 'GOAL-5' }, 1, 2),
    true,
  );
  assert.equal(
    shouldEscalateGenericTaskRemediation({ id: 'GOAL-5' }, 0, 2),
    false,
  );
  assert.equal(
    shouldEscalateGenericTaskRemediation({ id: 'GOAL-5-REMEDIATE' }, 1, 3),
    false,
  );
  assert.equal(
    shouldEscalateGenericTaskRemediation({ id: 'GOAL-5' }, 1, 1),
    false,
  );
});

test('publication incident dashboard tracks mttr, runbook hotspots, and cooldown trends', () => {
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const state = {
    id: projectId('publication-dashboard-trends'),
    name: 'Publication Dashboard Test',
    status: 'running',
    startedAt: new Date(now - (3 * 60 * 60 * 1000)).toISOString(),
    tasks: [
      { id: 'D1', status: 'done', completedAt: new Date(now - (2 * 60 * 60 * 1000)).toISOString() },
      { id: 'B1', status: 'backlog' },
    ],
    agents: [
      { id: 'coordinator', status: 'running', tokens: 2 },
      { id: 'worker', status: 'idle', tokens: 10 },
    ],
    kpiGoals: {
      weeklyTasksDoneTarget: 5,
      maxBacklog: 10,
      maxMonthlySpend: 100,
      weeklyPlan: {
        weekStart: new Date(now).toISOString(),
        lastPlannedAt: null,
        nextReviewAt: null,
        summary: null,
      },
    },
    deadLetters: [],
    financeExceptions: [],
    publicationHealth: {
      driftEvents: [
        { id: 'd1', ts: iso(2 * 60 * 60 * 1000), kind: 'publication_drift', target: 'substack', source: 'test', healed: false },
        { id: 'd2', ts: iso(3 * 60 * 60 * 1000), kind: 'publication_drift', target: 'substack', source: 'test', healed: true },
        { id: 'd3', ts: iso(4 * 60 * 60 * 1000), kind: 'publication_drift', target: 'custom_cms', source: 'test', healed: true },
      ],
      incidents: [
        {
          id: 'i1',
          ts: iso(2 * 60 * 60 * 1000),
          status: 'resolved',
          resolvedAt: iso(30 * 60 * 1000),
          runbook: 'publication_reliability_incident_triage',
          summary: 'Resolved incident',
          checks: [],
        },
        {
          id: 'i2',
          ts: iso(3 * 60 * 60 * 1000),
          status: 'open',
          resolvedAt: null,
          runbook: 'publication_reliability_incident_triage',
          summary: 'Open incident',
          checks: [],
        },
        {
          id: 'i3',
          ts: iso(26 * 60 * 60 * 1000),
          status: 'open',
          resolvedAt: null,
          runbook: 'manual_review',
          summary: 'Previous-window incident',
          checks: [],
        },
      ],
      alerting: {
        lastSignature: 'publication_reliability_breach',
        lastSentAt: iso(3 * 60 * 60 * 1000),
        suppressedSignals: [
          { ts: iso(2 * 60 * 60 * 1000), signature: 'publication_reliability_breach', source: 'test' },
          { ts: iso(27 * 60 * 60 * 1000), signature: 'publication_reliability_breach', source: 'test' },
        ],
      },
      policy: {},
      lastSlo: null,
      lastCheckedAt: null,
      lastSelfHealAt: null,
      lastSelfHealSummary: null,
    },
  };

  const snapshot = makeAnalyticsSnapshot(state);
  const dashboard = snapshot.publicationHealth.dashboard;

  assert.equal(dashboard.incidents.total, 3);
  assert.equal(dashboard.incidents.open, 2);
  assert.equal(dashboard.incidents.resolved, 1);
  assert.equal(dashboard.incidents.createdCurrentWindow, 2);
  assert.equal(dashboard.incidents.createdPreviousWindow, 1);
  assert.equal(dashboard.incidents.createdTrend, 1);
  assert.equal(dashboard.incidents.mttrHoursAvg, 1.5);
  assert.equal(dashboard.runbookHotspots[0].runbook, 'publication_reliability_incident_triage');
  assert.equal(dashboard.targetHotspots[0].target, 'substack');
  assert.equal(dashboard.cooldownSuppressions.currentWindow, 1);
  assert.equal(dashboard.cooldownSuppressions.previousWindow, 1);
  assert.equal(dashboard.cooldownSuppressions.trend, 0);
});

test('connector execution key is deterministic for equivalent input payloads', () => {
  const taskA = {
    id: 'RECUR-abc',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      input: { siteId: 'site-1', options: { force: true, region: 'us' } },
    },
  };
  const taskB = {
    id: 'RECUR-abc',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      input: { options: { region: 'us', force: true }, siteId: 'site-1' },
    },
  };

  const keyA = connectorExecutionKey(taskA);
  const keyB = connectorExecutionKey(taskB);
  assert.equal(keyA, keyB);
});

test('connector execution ledger upsert keeps latest status', () => {
  const state = { connectorExecutions: {} };
  const key = 'task-1::netlify::trigger_deploy::abcdef';

  markConnectorExecutionRecord(state, key, {
    status: 'running',
    startedAt: new Date().toISOString(),
    attempts: 1,
  });
  markConnectorExecutionRecord(state, key, {
    status: 'succeeded',
    completedAt: new Date().toISOString(),
    attempts: 1,
  });

  assert.equal(state.connectorExecutions[key].status, 'succeeded');
  assert.equal(state.connectorExecutions[key].attempts, 1);
});

test('manual connector mutation key is deterministic for equivalent payloads', () => {
  const keyA = connectorMutationExecutionKey('netlify', 'trigger_deploy', {
    siteId: 'site-123',
    opts: { branch: 'main', force: true },
  });
  const keyB = connectorMutationExecutionKey('netlify', 'trigger_deploy', {
    opts: { force: true, branch: 'main' },
    siteId: 'site-123',
  });
  assert.equal(keyA, keyB);
});

test('mutating operation guard identifies write actions', () => {
  assert.equal(isMutatingConnectorOperation('netlify', 'trigger_deploy'), true);
  assert.equal(isMutatingConnectorOperation('netlify', 'list_deploys'), false);
  assert.equal(isMutatingConnectorOperation('github', 'list_repos'), false);
  assert.equal(isMutatingConnectorOperation('github', 'create_issue'), true);
  assert.equal(isMutatingConnectorOperation('stripe', 'create_payment_intent'), true);
  assert.equal(isMutatingConnectorOperation('support_ticket', 'reply_ticket'), true);
  assert.equal(isMutatingConnectorOperation('support_ticket', 'list_tickets'), false);
  assert.equal(isMutatingConnectorOperation('custom_cms', 'publish_book'), true);
  assert.equal(isMutatingConnectorOperation('gumroad', 'publish_product'), true);
  assert.equal(isMutatingConnectorOperation('substack', 'publish_post'), true);
  assert.equal(isMutatingConnectorOperation('kdp', 'publish_book'), true);
});

test('provider idempotency mode maps supported write operations', () => {
  assert.equal(connectorIdempotencyMode('netlify', 'trigger_deploy'), 'forwarded_header');
  assert.equal(connectorIdempotencyMode('github', 'create_issue'), 'native_token');
  assert.equal(connectorIdempotencyMode('stripe', 'create_refund'), 'native_token');
  assert.equal(connectorIdempotencyMode('email_provider', 'send_campaign'), 'native_token');
  assert.equal(connectorIdempotencyMode('google_ads', 'create_campaign'), 'native_token');
  assert.equal(connectorIdempotencyMode('support_ticket', 'reply_ticket'), 'native_token');
  assert.equal(connectorIdempotencyMode('custom_cms', 'publish_book'), 'native_token');
  assert.equal(connectorIdempotencyMode('gumroad', 'publish_product'), 'native_token');
  assert.equal(connectorIdempotencyMode('substack', 'publish_post'), 'native_token');
  assert.equal(connectorIdempotencyMode('kdp', 'publish_book'), 'native_token');
  assert.equal(connectorIdempotencyMode('analytics', 'list_accounts'), 'not_required');
  assert.equal(connectorIdempotencyMode('unknown_connector', 'create_anything'), 'not_required');
});

test('publication distribution plan maps targets to provider-specific operations', () => {
  const plan = buildPublicationDistributionPlan('custom_cms', 'publish_book', {
    publication: 'book-production',
    distribution_targets: ['custom_cms', 'substack', 'gumroad', 'kdp'],
    distribution_strategy: 'broadcast',
    required_successes: 2,
  });

  assert.ok(plan);
  assert.equal(plan.strategy, 'broadcast');
  assert.equal(plan.requiredSuccesses, 2);
  assert.deepEqual(
    plan.steps.map((step) => `${step.connector}:${step.operation}`),
    [
      'custom_cms:publish_book',
      'substack:publish_post',
      'gumroad:publish_product',
      'kdp:publish_book',
    ]
  );
});

test('publication distribution fallback stops after first success', async () => {
  const plan = buildPublicationDistributionPlan('custom_cms', 'publish_book', {
    distribution_targets: ['substack', 'gumroad', 'kdp'],
    distribution_strategy: 'fallback',
  });
  const calls = [];

  const result = await executePublicationDistributionPlan(plan, {
    executeStep: async (step) => {
      calls.push(step.connector);
      if (step.connector === 'substack') {
        return {
          ok: false,
          errorCode: 'CONNECTOR_FAILURE',
          message: 'substack down',
          actualCost: 0,
          data: null,
        };
      }
      return {
        ok: true,
        message: `${step.connector} ok`,
        actualCost: 0,
        data: { connector: step.connector },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['substack', 'gumroad']);
  assert.equal(result.data.successCount, 1);
  assert.equal(result.data.attemptedCount, 2);
});

test('publication distribution broadcast triggers rollback when threshold is not met', async () => {
  const plan = buildPublicationDistributionPlan('custom_cms', 'publish_book', {
    distribution_targets: ['custom_cms', 'substack', 'gumroad'],
    distribution_strategy: 'broadcast',
    required_successes: 2,
    rollback_on_failure: true,
  });

  const rollbackCalls = [];
  const result = await executePublicationDistributionPlan(plan, {
    executeStep: async (step) => {
      if (step.connector === 'custom_cms') {
        return {
          ok: true,
          message: 'custom ok',
          actualCost: 0,
          data: { publicationId: 'pub_1' },
        };
      }
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `${step.connector} failed`,
        actualCost: 0,
        data: null,
      };
    },
    executeRollbackStep: async (step) => {
      rollbackCalls.push(`${step.connector}:${step.operation}`);
      return {
        ok: true,
        message: 'rollback ok',
        actualCost: 0,
        data: { unpublished: true },
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.data.rollback.required, true);
  assert.equal(result.data.rollback.attemptedCount, 1);
  assert.deepEqual(rollbackCalls, ['custom_cms:unpublish_publication']);
});

test('support routing guardrails block low-confidence autonomous replies', () => {
  const routing = evaluateSupportAutonomyRouting({
    connector: 'support_ticket',
    operation: 'reply_ticket',
    input: {
      waitingMinutes: 20,
      slaMinutes: 60,
      responseConfidence: 0.54,
      minConfidence: 0.72,
    },
  });

  assert.equal(routing.ok, false);
  assert.equal(routing.route?.decision, 'escalate');
});

test('support routing guardrails allow triage with escalation when SLA is breached', () => {
  const routing = evaluateSupportAutonomyRouting({
    connector: 'support_chat',
    operation: 'triage_conversations',
    input: {
      waitingMinutes: 35,
      slaMinutes: 15,
      responseConfidence: 0.86,
      minConfidence: 0.8,
    },
  });

  assert.equal(routing.ok, true);
  assert.equal(routing.route?.escalate, true);
});

test('finance guardrails block refunds above policy cap', () => {
  const guardrail = evaluateFinanceAutonomyGuardrails({
    connector: 'stripe',
    operation: 'create_refund',
    input: {
      amount: 420,
      maxRefundAmount: 300,
      minCashReserve: 500,
      currentCashReserve: 2000,
    },
  });

  assert.equal(guardrail.ok, false);
  assert.equal(Boolean((guardrail.checks || []).find((entry) => entry.id === 'finance_refund_cap' && !entry.ok)), true);
});

test('finance guardrails require variance trigger for invoice automation', () => {
  const state = {
    id: projectId('finance-variance-trigger'),
    tasks: [
      { id: 'D-1', status: 'done', completedAt: new Date().toISOString() },
      { id: 'B-1', status: 'backlog' },
    ],
    agents: [],
    deadLetters: [],
    kpiGoals: {
      weeklyTasksDoneTarget: 10,
      maxBacklog: 5,
      maxMonthlySpend: 5000,
      weeklyPlan: { weekStart: new Date().toISOString(), lastPlannedAt: null, nextReviewAt: null, summary: null },
    },
  };

  const guardrail = evaluateFinanceAutonomyGuardrails({
    connector: 'stripe',
    operation: 'create_invoice',
    input: {
      amount: 500,
      triggerWhenMonthlySpendVarianceAbove: 100,
      minCashReserve: 100,
      currentCashReserve: 800,
    },
    projectState: state,
  });

  assert.equal(guardrail.ok, false);
  assert.equal(Boolean((guardrail.checks || []).find((entry) => entry.id === 'finance_cashflow_variance_trigger' && !entry.ok)), true);
});

test('finance settlement exception detection flags disputes and payout delay', () => {
  const exceptions = evaluateFinanceSettlementExceptions('stripe', 'create_invoice', {
    ok: true,
    data: {
      payoutStatus: 'pending',
      disputeStatus: 'open',
      disputeId: 'dp_1',
    },
  }, {
    input: {
      payoutDueAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  });

  assert.equal(Array.isArray(exceptions), true);
  assert.equal(Boolean(exceptions.find((entry) => entry.type === 'dispute_open')), true);
  assert.equal(Boolean(exceptions.find((entry) => entry.type === 'payout_delay')), true);
});

test('finance settlement exception runbook processing stores and escalates high severity events', async () => {
  const state = {
    id: projectId('finance-exceptions'),
    financeExceptions: [],
    logs: [],
  };

  const summary = await processFinanceSettlementExceptions(state, {
    connector: 'stripe',
    operation: 'create_refund',
    executionKey: 'stripe::create_refund::abc',
    source: 'manual_execute',
    exceptions: [
      {
        type: 'settlement_mismatch',
        severity: 'high',
        summary: 'Mismatch',
        runbook: 'open_reconciliation_incident',
      },
    ],
  });

  assert.equal(summary.count, 1);
  assert.equal(summary.escalated, 1);
  assert.equal(state.financeExceptions.length, 1);
  assert.equal(state.financeExceptions[0].type, 'settlement_mismatch');
});

test('reconciliation policy flags eventual consistency operations', () => {
  assert.equal(shouldReconcileConnectorExecution('netlify', 'trigger_deploy'), true);
  assert.equal(shouldReconcileConnectorExecution('custom_cms', 'publish_book'), true);
  assert.equal(shouldReconcileConnectorExecution('github', 'create_issue'), false);
  assert.equal(shouldReconcileConnectorExecution('stripe', 'create_refund'), false);
});

test('publication reconciliation verifies per-target release evidence', async () => {
  const result = await reconcileConnectorExecution('custom_cms', 'publish_book', {
    ok: true,
    data: {
      strategy: 'broadcast',
      targets: [
        {
          target: 'custom_cms',
          connector: 'custom_cms',
          ok: true,
          data: { publicationId: 'pub_123' },
        },
        {
          target: 'substack',
          connector: 'substack',
          ok: true,
          data: {},
        },
      ],
    },
  });

  assert.equal(result.checked, true);
  assert.equal(result.ok, false);
  assert.equal(result.pending, true);
  assert.equal(Array.isArray(result.targetChecks), true);
  assert.equal(result.targetChecks.find((entry) => entry.target === 'substack')?.pending, true);
});

test('publication drift replay plan targets only unhealthy publication endpoints', () => {
  const replayPlan = buildPublicationDriftReplayPlan({
    ok: false,
    data: {
      strategy: 'broadcast',
      targets: [
        { target: 'custom_cms', ok: true, data: { publicationId: 'pub_1' } },
        { target: 'substack', ok: false, data: null },
      ],
    },
  }, {
    ok: false,
    pending: true,
    targetChecks: [
      { target: 'custom_cms', ok: true, pending: false, rollbacked: false },
      { target: 'substack', ok: false, pending: true, rollbacked: false },
    ],
  }, {
    mode: 'publish',
    source: 'reconciliation',
  });

  assert.ok(replayPlan);
  assert.equal(replayPlan.replayMode, 'publish');
  assert.deepEqual(replayPlan.steps.map((entry) => `${entry.connector}:${entry.operation}`), ['substack:publish_post']);
});

test('publication drift self-heal replays failing targets and records health summary', async () => {
  const state = {
    id: projectId('publication-self-heal'),
    logs: [],
    publicationHealth: {
      driftEvents: [],
      lastCheckedAt: null,
      lastSelfHealAt: null,
      lastSelfHealSummary: null,
    },
  };

  const summary = await executePublicationDriftSelfHeal(state, {
    execution: {
      ok: false,
      data: {
        strategy: 'broadcast',
        targets: [
          { target: 'custom_cms', connector: 'custom_cms', ok: true, data: { publicationId: 'pub_ok' } },
          { target: 'substack', connector: 'substack', ok: false, data: null },
        ],
      },
    },
    reconciliation: {
      ok: false,
      pending: true,
      reason: 'Publication verification pending for 1 target(s).',
      targetChecks: [
        { target: 'custom_cms', ok: true, pending: false, rollbacked: false },
        { target: 'substack', ok: false, pending: true, rollbacked: false },
      ],
    },
    context: {
      mode: 'publish',
      executionKey: 'pub::selfheal::1',
      source: 'test',
    },
  });

  assert.equal(summary.checked, true);
  assert.equal(summary.driftDetected, true);
  assert.equal(summary.replayed, 1);
  assert.equal(typeof summary.slo, 'object');
  assert.equal(typeof state.publicationHealth.lastSelfHealSummary, 'object');
  assert.equal(Array.isArray(state.publicationHealth.driftEvents), true);
  assert.equal(state.publicationHealth.driftEvents.length > 0, true);
});

test('publication drift self-heal enforces replay exhaustion policy and raises incident', async () => {
  const state = {
    id: projectId('publication-replay-exhausted'),
    name: 'Publication Replay Exhaustion Test',
    logs: [],
    tasks: [],
    agents: [],
    deadLetters: [],
    financeExceptions: [],
    publicationHealth: {
      driftEvents: [
        {
          id: 'seed-drift-substack',
          ts: new Date().toISOString(),
          kind: 'publication_drift',
          target: 'substack',
          summary: 'Seed drift event',
          expected: {},
          observed: {},
          source: 'test',
          healed: false,
        },
      ],
      incidents: [],
      policy: {
        lookbackHours: 24,
        maxDriftEventsPerWindow: 100,
        maxSelfHealFailuresPerWindow: 100,
        maxReplayExhaustedPerWindow: 0,
        maxReplayAttemptsPerTargetPerWindow: 0,
        alertCooldownMinutes: 60,
      },
      alerting: {
        lastSignature: null,
        lastSentAt: null,
      },
      lastSlo: null,
      lastCheckedAt: null,
      lastSelfHealAt: null,
      lastSelfHealSummary: null,
    },
  };

  const summary = await executePublicationDriftSelfHeal(state, {
    execution: {
      ok: false,
      data: {
        strategy: 'broadcast',
        targets: [
          { target: 'substack', connector: 'substack', ok: false, data: null },
        ],
      },
    },
    reconciliation: {
      ok: false,
      pending: true,
      reason: 'Publication verification pending for 1 target(s).',
      targetChecks: [
        { target: 'substack', ok: false, pending: true, rollbacked: false },
      ],
    },
    context: {
      mode: 'publish',
      executionKey: 'pub::selfheal::exhausted',
      source: 'test',
    },
  });

  assert.equal(summary.checked, true);
  assert.equal(summary.driftDetected, true);
  assert.equal(summary.replayed, 0);
  assert.equal(summary.healed, false);
  assert.deepEqual(summary.replayExhaustedTargets, ['substack']);
  assert.equal(summary.slo && summary.slo.ok, false);
  assert.equal(Array.isArray(state.publicationHealth.incidents), true);
  assert.equal(state.publicationHealth.incidents.length >= 1, true);
  assert.equal(state.publicationHealth.incidents[0].runbook, 'publication_reliability_incident_triage');

  const analytics = makeAnalyticsSnapshot(state);
  assert.equal(Array.isArray(analytics.publicationHealth.incidents), true);
  assert.equal(analytics.publicationHealth.incidents.length >= 1, true);
  assert.equal(typeof analytics.publicationHealth.lastSlo, 'object');
  assert.equal(analytics.publicationHealth.lastSlo.ok, false);
});

test('netlify reconciliation returns pending when deploy identity is incomplete', async () => {
  const result = await reconcileConnectorExecution('netlify', 'trigger_deploy', {
    ok: true,
    data: {
      id: null,
    },
  }, {
    siteId: 'site-123',
  });

  assert.equal(result.checked, true);
  assert.equal(result.ok, false);
  assert.equal(result.pending, true);
});

test('google ads guardrails require campaign fields for mutate operations', () => {
  const missingName = evaluateGoogleAdsGuardrails({
    operation: 'create_campaign',
    projectId: null,
    input: {},
    estimatedCost: 0,
  });
  const missingCampaignId = evaluateGoogleAdsGuardrails({
    operation: 'update_campaign_budget',
    projectId: null,
    input: { newDailyBudget: 25 },
    estimatedCost: 10,
  });

  assert.equal(missingName.ok, false);
  assert.equal(missingCampaignId.ok, false);
});

test('google ads guardrails block projected spend over project policy cap', () => {
  ensureCredentialStorage();
  const id = projectId('ads-guardrail-cap');
  upsertProjectCredentialPolicy(id, 'google_ads', {
    enabled: true,
    monthlyCap: 100,
  });
  recordCredentialSpend(id, 'google_ads', 95, new Date().toISOString());

  const guardrail = evaluateGoogleAdsGuardrails({
    operation: 'update_campaign_budget',
    projectId: id,
    input: {
      campaignId: 'cmp-1',
      newDailyBudget: 20,
    },
    estimatedCost: 20,
  });

  const budgetCheck = guardrail.checks.find((entry) => entry.id === 'policy_budget_sanity');
  assert.equal(guardrail.ok, false);
  assert.ok(budgetCheck);
  assert.equal(budgetCheck.ok, false);
});

test('approval governance policy packs auto-deny critical approval context', () => {
  const state = {
    id: projectId('approval-governance'),
    approvalGovernance: null,
  };
  ensureApprovalGovernanceState(state);

  const task = {
    id: 'RECUR-risk',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      estimatedCost: 3000,
      actorRole: 'Intern',
    },
  };

  const decision = evaluateApprovalGovernanceDecision(state, task, {
    riskScore: 95,
    estimatedCost: 3000,
    connector: 'netlify',
    operation: 'trigger_deploy',
    actorRole: 'Intern',
  });

  assert.equal(decision.decision, 'deny');
  assert.equal(typeof decision.matchedRuleId, 'string');
  assert.equal(Boolean(decision.matchedRuleId), true);
});

test('housing policy pack adds escalation for landlord-tenant compliance workflows', () => {
  const state = {
    id: projectId('approval-housing-pack'),
    approvalGovernance: null,
  };
  ensureApprovalGovernanceState(state);

  const applied = applyIndustryApprovalPolicyPack(state, {
    templateId: 'business',
    goalPlan: {
      goal: 'Build and operate a landlord and tenant property management platform.',
      tags: { property: true },
    },
  });

  const task = {
    id: 'GOAL-legal',
    title: 'Publish housing lease policy and tenant screening disclosures',
    phase: 'compliance',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      estimatedCost: 20,
      actorRole: 'Backend Architect',
    },
  };

  const decision = evaluateApprovalGovernanceDecision(state, task, {
    riskScore: 70,
    estimatedCost: 20,
    connector: 'netlify',
    operation: 'trigger_deploy',
    actorRole: 'Backend Architect',
    taskTitle: task.title,
    taskPhase: task.phase,
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.packId, 'housing');
  assert.equal(state.approvalGovernance.industryPolicyPack.id, 'housing');
  assert.equal(decision.decision, 'escalate');
  assert.equal(typeof decision.matchedRuleId, 'string');
  assert.equal(Boolean(decision.matchedRuleId), true);
});

test('finance policy pack escalates chargeback and dispute workflows', () => {
  const state = { id: projectId('approval-finance-pack'), approvalGovernance: null };
  ensureApprovalGovernanceState(state);

  const applied = applyIndustryApprovalPolicyPack(state, {
    templateId: 'business',
    goalPlan: {
      goal: 'Build a fintech accounting and cashflow management platform.',
      tags: { fintech: true },
    },
  });

  const task = {
    id: 'GOAL-finance',
    title: 'Investigate and respond to unauthorized charge dispute on Stripe account',
    phase: 'finance',
    autoAction: {
      connector: 'stripe',
      operation: 'create_refund',
      estimatedCost: 150,
      actorRole: 'Finance Tracker',
    },
  };

  const decision = evaluateApprovalGovernanceDecision(state, task, {
    riskScore: 65,
    estimatedCost: 150,
    connector: 'stripe',
    operation: 'create_refund',
    actorRole: 'Finance Tracker',
    taskTitle: task.title,
    taskPhase: task.phase,
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.packId, 'finance');
  assert.equal(state.approvalGovernance.industryPolicyPack.id, 'finance');
  assert.equal(decision.decision, 'escalate');
  assert.equal(Boolean(decision.matchedRuleId), true);
});

test('healthcare policy pack escalates patient consent and PHI deployments', () => {
  const state = { id: projectId('approval-healthcare-pack'), approvalGovernance: null };
  ensureApprovalGovernanceState(state);

  const applied = applyIndustryApprovalPolicyPack(state, {
    templateId: 'business',
    goalPlan: {
      goal: 'Build a telehealth patient scheduling and clinical records platform.',
      tags: { healthcare: true },
    },
  });

  const task = {
    id: 'GOAL-health',
    title: 'Deploy updated patient consent and privacy notice to production',
    phase: 'compliance',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      estimatedCost: 10,
      actorRole: 'Backend Architect',
    },
  };

  const decision = evaluateApprovalGovernanceDecision(state, task, {
    riskScore: 52,
    estimatedCost: 10,
    connector: 'netlify',
    operation: 'trigger_deploy',
    actorRole: 'Backend Architect',
    taskTitle: task.title,
    taskPhase: task.phase,
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.packId, 'healthcare');
  assert.equal(state.approvalGovernance.industryPolicyPack.id, 'healthcare');
  assert.equal(decision.decision, 'escalate');
  assert.equal(Boolean(decision.matchedRuleId), true);
});

test('saas policy pack escalates GDPR data subject and deletion requests', () => {
  const state = { id: projectId('approval-saas-pack'), approvalGovernance: null };
  ensureApprovalGovernanceState(state);

  const applied = applyIndustryApprovalPolicyPack(state, {
    templateId: 'business',
    packId: 'saas',
    goalPlan: {
      goal: 'Build a multi-tenant SaaS platform with GDPR data subject request handling.',
      tags: { webApp: true },
    },
  });

  const task = {
    id: 'GOAL-saas',
    title: 'Process GDPR right to erasure and data export request for user account',
    phase: 'compliance',
    autoAction: {
      connector: 'analytics',
      operation: 'export_data',
      estimatedCost: 0,
      actorRole: 'Backend Architect',
    },
  };

  const decision = evaluateApprovalGovernanceDecision(state, task, {
    riskScore: 50,
    estimatedCost: 0,
    connector: 'analytics',
    operation: 'export_data',
    actorRole: 'Backend Architect',
    taskTitle: task.title,
    taskPhase: task.phase,
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.packId, 'saas');
  assert.equal(state.approvalGovernance.industryPolicyPack.id, 'saas');
  assert.equal(decision.decision, 'escalate');
  assert.equal(Boolean(decision.matchedRuleId), true);
});

test('ecommerce policy pack escalates catalog deploys and high-value refunds', () => {
  const state = { id: projectId('approval-ecommerce-pack'), approvalGovernance: null };
  ensureApprovalGovernanceState(state);

  const applied = applyIndustryApprovalPolicyPack(state, {
    templateId: 'business',
    goalPlan: {
      goal: 'Build and operate an online retail store and product marketplace.',
      tags: { ecommerce: true },
    },
  });

  const task = {
    id: 'GOAL-ecom',
    title: 'Deploy updated product catalog and new storefront to production',
    phase: 'deployment',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      estimatedCost: 0,
      actorRole: 'Backend Architect',
    },
  };

  const decision = evaluateApprovalGovernanceDecision(state, task, {
    riskScore: 30,
    estimatedCost: 0,
    connector: 'netlify',
    operation: 'trigger_deploy',
    actorRole: 'Backend Architect',
    taskTitle: task.title,
    taskPhase: task.phase,
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.packId, 'ecommerce');
  assert.equal(state.approvalGovernance.industryPolicyPack.id, 'ecommerce');
  assert.equal(decision.decision, 'escalate');
  assert.equal(Boolean(decision.matchedRuleId), true);
});

test('marketplace policy pack escalates trust-and-safety deployment changes', () => {
  const state = { id: projectId('approval-marketplace-pack'), approvalGovernance: null };
  ensureApprovalGovernanceState(state);

  const applied = applyIndustryApprovalPolicyPack(state, {
    templateId: 'business',
    goalPlan: {
      goal: 'Build a social marketplace where users create profiles and auction date experiences.',
      tags: { marketplace: true, social: true },
    },
  });

  const task = {
    id: 'GOAL-mkt',
    title: 'Deploy trust and safety moderation policy updates to production',
    phase: 'compliance',
    autoAction: {
      connector: 'netlify',
      operation: 'trigger_deploy',
      estimatedCost: 0,
      actorRole: 'Backend Architect',
    },
  };

  const decision = evaluateApprovalGovernanceDecision(state, task, {
    riskScore: 62,
    estimatedCost: 0,
    connector: 'netlify',
    operation: 'trigger_deploy',
    actorRole: 'Backend Architect',
    taskTitle: task.title,
    taskPhase: task.phase,
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.packId, 'marketplace');
  assert.equal(state.approvalGovernance.industryPolicyPack.id, 'marketplace');
  assert.equal(decision.decision, 'escalate');
  assert.equal(Boolean(decision.matchedRuleId), true);
});

test('goal prompt analysis detects social marketplace and infers marketplace policy pack', () => {
  const goal = 'Build an auction dating website where people can create profiles, bid on date experiences, and handle payments safely.';
  const plan = goalActionPlanFromPrompt('business', goal, {});
  const inferred = plan && plan.tags ? (plan.tags.marketplace && plan.tags.social) : false;

  const state = { id: projectId('marketplace-infer'), approvalGovernance: null };
  ensureApprovalGovernanceState(state);
  const applied = applyIndustryApprovalPolicyPack(state, { templateId: 'business', goalPlan: plan });

  assert.equal(Boolean(inferred), true);
  assert.equal(plan.requiredConnectors.includes('stripe'), true);
  assert.equal(plan.requiredConnectors.includes('support_ticket'), true);
  assert.equal(plan.requiredConnectors.includes('email_provider'), true);
  assert.equal(applied.packId, 'marketplace');
});

test('goal prompt analysis adds runnable domain auto-actions for social marketplace prompts', () => {
  const plan = goalActionPlanFromPrompt(
    'business',
    'Build an auction dating marketplace where users create profiles, bid on date experiences, and receive onboarding messages.',
    {},
  );

  const hasPaymentSimulation = plan.tasks.some((task) =>
    task.autoAction
    && task.autoAction.connector === 'stripe'
    && task.autoAction.operation === 'create_payment_intent',
  );
  const hasSupportTriage = plan.tasks.some((task) =>
    task.autoAction
    && task.autoAction.connector === 'support_ticket'
    && task.autoAction.operation === 'triage_tickets',
  );
  const hasLifecycleMessaging = plan.tasks.some((task) =>
    task.autoAction
    && task.autoAction.connector === 'email_provider'
    && task.autoAction.operation === 'send_campaign',
  );

  assert.equal(hasPaymentSimulation, true);
  assert.equal(hasSupportTriage, true);
  assert.equal(hasLifecycleMessaging, true);
});

test('goal prompt analysis defaults to free-tier planning and adds Supabase for social web app workflows', () => {
  const plan = goalActionPlanFromPrompt(
    'business',
    'Launch a dating web app with profile matching, moderation, and onboarding workflows.',
    {},
  );

  assert.equal(Boolean(plan.planning), true);
  assert.equal(plan.planning.preferFreeTierFirst, true);
  assert.equal(plan.planning.requireApprovalForPaidTierUpgrade, true);
  assert.equal(plan.requiredConnectors.includes('supabase'), true);
  assert.equal(
    plan.tasks.some((task) => String(task.title || '').toLowerCase().includes('free-tier infrastructure footprint')),
    true,
  );
  assert.equal(
    plan.tasks.some((task) => String(task.title || '').toLowerCase().includes('provision supabase database')),
    true,
  );
});

test('supported credential services include supabase', () => {
  assert.equal(SUPPORTED_CREDENTIAL_SERVICES.includes('supabase'), true);
});

test('project automation summary exposes orchestration intelligence signals', () => {
  const now = new Date().toISOString();
  const state = {
    id: projectId('automation-summary-signals'),
    name: 'Automation Summary Signals',
    status: 'running',
    startedAt: now,
    template: 'business',
    operatingMode: 'continuous_business',
    tasks: [
      { id: 'GOAL-1', title: 'Define charter', phase: 'strategy', status: 'done', completedAt: now, assistanceRequestedAt: null },
      {
        id: 'GOAL-2',
        title: 'Approve auction policy deployment',
        phase: 'compliance',
        status: 'review',
        executionState: 'awaiting_approval',
        pendingApproval: {
          requestedAt: now,
          reason: 'Policy-sensitive deploy',
          risk: { score: 71, level: 'high', requiresHuman: true },
        },
        assistanceRequestedAt: now,
        lastError: 'Policy gate escalation',
      },
      {
        id: 'GOAL-3',
        title: 'Validate stripe connector readiness',
        phase: 'finance',
        status: 'backlog',
        assistanceRequestedAt: null,
      },
    ],
    agents: [{ id: 'coordinator', isCoordinator: true, status: 'running', tokens: 0 }],
    goalPlan: {
      source: 'goal_prompt_analysis',
      generatedAt: now,
      requiredConnectors: ['stripe', 'support_ticket'],
      missingCredentialServices: ['stripe'],
      milestones: [
        {
          id: 'MS-strategy',
          phase: 'strategy',
          title: 'Strategy',
          acceptanceCriteria: ['complete strategy'],
          requiredTaskIds: ['GOAL-1'],
          completedAt: null,
        },
        {
          id: 'MS-compliance',
          phase: 'compliance',
          title: 'Compliance',
          acceptanceCriteria: ['complete compliance'],
          requiredTaskIds: ['GOAL-2'],
          completedAt: null,
        },
      ],
    },
    heartbeat: { status: 'alive', lastBeat: now, autoFixCount: 0, cycleCount: 1, log: [] },
    recurring: { enabled: true, lastRunAt: {}, schedule: [] },
    logs: [],
    deadLetters: [],
    financeExceptions: [],
    publicationHealth: { driftEvents: [], incidents: [], recentDeliveries: [] },
    operationalLoops: { weekStart: now, generatedAt: null, objectives: [] },
    approvalGovernance: null,
  };

  const summary = summarizeProjectAutomation(state);

  assert.equal(summary.goalPlan.source, 'goal_prompt_analysis');
  assert.equal(summary.orchestration.pendingApprovalCount, 1);
  assert.equal(summary.orchestration.assistanceRequestCount, 1);
  assert.equal(summary.orchestration.pendingConnectorReadinessCount, 1);
  assert.equal(Array.isArray(summary.orchestration.pendingApprovals), true);
  assert.equal(Array.isArray(summary.orchestration.assistanceRequests), true);
  assert.equal(Array.isArray(summary.orchestration.pendingConnectorReadiness), true);
  assert.equal(typeof summary.orchestration.recentPolicyDecisionCount, 'number');
});

test('production evidence bundle generates checklist and pass verdict', () => {
  const result = { ok: true, exitCode: 0, durationMs: 321, stdout: 'ok', stderr: '' };
  const bundle = buildProductionEvidenceBundle(result, {
    projectSummaries: [{ id: 'P1', status: 'running' }],
    preflightChecks: [{ projectId: 'P1', passed: true }],
  });

  assert.equal(bundle.passed, true);
  assert.equal(Array.isArray(bundle.checklist), true);
  assert.equal(bundle.checklist.length >= 3, true);
  assert.equal(bundle.summary.certificationOk, true);
  assert.equal(bundle.summary.preflightProjectCount, 1);
});

test('production evidence bundle fails checklist when certification fails', () => {
  const result = { ok: false, exitCode: 2, durationMs: 111, stdout: '', stderr: 'failed' };
  const bundle = buildProductionEvidenceBundle(result, {
    projectSummaries: [{ id: 'P1', status: 'running' }],
    preflightChecks: [{ projectId: 'P1', passed: true }],
  });

  assert.equal(bundle.passed, false);
  assert.equal(bundle.checklist.some((entry) => entry.id === 'certification_script' && entry.ok === false), true);
});

test('buildGoalMilestones creates phase-grouped verification milestones', () => {
  const tasks = [
    { title: 'Task 1', phase: 'strategy' },
    { title: 'Task 2', phase: 'product_build' },
    { title: 'Task 3', phase: 'product_build' },
    { title: 'Task 4', phase: 'compliance' },
  ];
  const milestones = buildGoalMilestones(tasks, {});
  const productMilestone = milestones.find((m) => m.phase === 'product_build');

  assert.equal(Array.isArray(milestones), true);
  assert.equal(milestones.length >= 3, true);
  assert.equal(Boolean(productMilestone), true);
  assert.equal(Array.isArray(productMilestone.requiredTaskIds), true);
  assert.equal(productMilestone.requiredTaskIds.length, 2);
  assert.equal(Array.isArray(productMilestone.acceptanceCriteria), true);
  assert.equal(productMilestone.acceptanceCriteria.length > 0, true);
});

test('verifyGoalDelivery creates explicit backlog task when milestones are incomplete', () => {
  const state = {
    id: projectId('goal-delivery-gap'),
    template: 'business',
    goalPlan: {
      goal: 'Ship business workflow',
      source: 'goal_prompt_analysis',
      tasks: [{ title: 'A', phase: 'strategy' }, { title: 'B', phase: 'product_build' }],
      requiredConnectors: ['netlify'],
      milestones: [
        {
          id: 'MS-strategy',
          phase: 'strategy',
          title: 'Strategy',
          acceptanceCriteria: ['done'],
          requiredTaskIds: ['GOAL-1'],
          completedAt: null,
        },
        {
          id: 'MS-product',
          phase: 'product_build',
          title: 'Build',
          acceptanceCriteria: ['done'],
          requiredTaskIds: ['GOAL-2'],
          completedAt: null,
        },
      ],
    },
    tasks: [
      { id: 'GOAL-1', title: 'A', phase: 'strategy', status: 'done', deadLetteredAt: null },
      { id: 'GOAL-2', title: 'B', phase: 'product_build', status: 'backlog', deadLetteredAt: null },
      { id: 'GOAL-3', title: 'Validate netlify connector readiness', phase: 'deployment', status: 'backlog', deadLetteredAt: null },
    ],
    logs: [],
    approvalGovernance: null,
    recurring: { enabled: false, lastRunAt: {}, schedule: [] },
    deadLetters: [],
    financeExceptions: [],
    publicationHealth: { driftEvents: [], incidents: [], recentDeliveries: [] },
    operationalLoops: { weekStart: new Date().toISOString(), generatedAt: null, objectives: [] },
  };

  const completion = evaluateMilestoneCompletion(state);
  const delivery = verifyGoalDelivery(state);
  const gapTask = state.tasks.find((t) => t.id === 'GOAL-DELIVERY-GAP');

  assert.equal(completion.total, 2);
  assert.equal(completion.completed, 1);
  assert.equal(delivery.verified, false);
  assert.equal(Boolean(gapTask), true);
  assert.equal(gapTask.status, 'backlog');
});

test('approval decision audit uses immutable hash chaining', () => {
  const id = projectId('approval-audit');
  const first = appendApprovalDecisionAudit(id, {
    taskId: 'T-1',
    decision: 'approve',
    actor: 'operator',
    reason: 'ok',
    riskScore: 25,
  });
  const second = appendApprovalDecisionAudit(id, {
    taskId: 'T-2',
    decision: 'deny',
    actor: 'operator',
    reason: 'risk',
    riskScore: 92,
  });
  const rows = readApprovalDecisionAudit(id, 5);

  assert.equal(Boolean(first.hash), true);
  assert.equal(Boolean(second.hash), true);
  assert.equal(second.prevHash, first.hash);
  assert.equal(rows.length >= 2, true);
});

test('weekly plan generation creates objectives with owner and SLA fields', () => {
  const now = new Date().toISOString();
  const state = {
    id: projectId('weekly-objectives'),
    template: 'business',
    tasks: [],
    deadLetters: [],
    kpiGoals: {
      weeklyTasksDoneTarget: 10,
      maxBacklog: 5,
      maxMonthlySpend: 1000,
      weeklyPlan: {
        weekStart: now,
        lastPlannedAt: null,
        nextReviewAt: null,
        summary: null,
        objectives: [],
      },
    },
    agents: [
      { id: 'coordinator', role: 'Coordinator Agent', isCoordinator: true },
      { id: 'sales_1', role: 'Sales Manager', isCoordinator: false },
      { id: 'support_1', role: 'Customer Support', isCoordinator: false },
      { id: 'finance_1', role: 'Financial Controller', isCoordinator: false },
      { id: 'analytics_1', role: 'Analytics Reporter', isCoordinator: false },
      { id: 'tracker_1', role: 'Finance Tracker', isCoordinator: false },
    ],
    logs: [],
  };

  refreshWeeklyKpiPlan(state, now);
  const objectives = state.kpiGoals.weeklyPlan.objectives;

  assert.equal(Array.isArray(objectives), true);
  assert.equal(objectives.length >= 3, true);
  assert.equal(objectives.every((item) => Number(item.slaHours) > 0), true);
  assert.equal(objectives.every((item) => typeof item.ownerRole === 'string' && item.ownerRole.length > 0), true);
  assert.equal(objectives.every((item) => typeof item.kpiOwnerRole === 'string' && item.kpiOwnerRole.length > 0), true);
});
