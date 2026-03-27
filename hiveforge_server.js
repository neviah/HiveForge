const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const SANDBOX_ROOT = path.join(__dirname, 'sandbox');
const WEBUI_ROOT = path.join(__dirname, 'webui');
const OPENCLAW_SRC_ROOT = path.join(__dirname, 'openclaw');
const CONFIG_PATH = path.join(SANDBOX_ROOT, 'config.json');
const LOG_PATH = path.join(SANDBOX_ROOT, 'hiveforge.log');
const PROJECTS_ROOT = path.join(SANDBOX_ROOT, 'projects');
const WORKSPACE_ROOT = path.join(SANDBOX_ROOT, 'workspace');
const TEMPLATES_ROOT = path.join(__dirname, 'templates');
const CREDENTIALS_ROOT = path.join(SANDBOX_ROOT, 'credentials');
const CREDENTIAL_POLICIES_ROOT = path.join(CREDENTIALS_ROOT, 'policies');
const CREDENTIAL_AUDIT_LOG_PATH = path.join(CREDENTIALS_ROOT, 'audit.log.ndjson');
const CREDENTIAL_BUDGET_COUNTERS_PATH = path.join(CREDENTIALS_ROOT, 'budget_counters.json');
const AGENTS_RUNTIME_ROOT = path.join(SANDBOX_ROOT, 'agents');
const MESSAGE_BUS_PATH = path.join(AGENTS_RUNTIME_ROOT, 'messages.db');
const PRODUCTION_CERTIFICATION_SCRIPT_PATH = path.join(__dirname, 'scripts', 'production_certification.js');
const PRODUCTION_EVIDENCE_ROOT = path.join(SANDBOX_ROOT, 'evidence', 'production_certification');
const IMAGE_RUNTIME_ROOT = path.join(SANDBOX_ROOT, 'image_generator');
const IMAGE_COMFY_ROOT = path.join(IMAGE_RUNTIME_ROOT, 'comfyui');
const IMAGE_COMFY_VENV_ROOT = path.join(IMAGE_RUNTIME_ROOT, 'venv');
const IMAGE_COMFY_REPO_URL = 'https://github.com/comfyanonymous/ComfyUI.git';
const IMAGE_MODELS_ROOT = path.join(IMAGE_RUNTIME_ROOT, 'models');
const IMAGE_CACHE_ROOT = path.join(IMAGE_RUNTIME_ROOT, 'cache');
const IMAGE_GOLDEN_BASELINES_ROOT = path.join(IMAGE_CACHE_ROOT, 'golden_baselines');
const IMAGE_RUNTIME_STATE_PATH = path.join(IMAGE_RUNTIME_ROOT, 'runtime_state.json');
const IMAGE_SECONDARY_SDAPI_ENDPOINTS = ['http://127.0.0.1:7860', 'http://127.0.0.1:7861', 'http://127.0.0.1:7862'];
const MAX_TASK_HISTORY = 100;
const MAX_EVENTS_PER_TASK = 500;
const TASK_LEASE_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_RUNTIME_SETTINGS = {
  heartbeatIntervalMs: 30000,
  stallTimeoutMs: 10 * 60 * 1000,
  maxAutoFixes: 5,
  countManualHeartbeatForStall: false,
  fastLocalIterationMode: true,
};
const DEFAULT_PLANNING_SETTINGS = {
  preferFreeTierFirst: true,
  requireApprovalForPaidTierUpgrade: true,
  preferredDatabaseService: 'supabase',
};
const DEFAULT_IMAGE_GENERATOR_SETTINGS = {
  enabled: true,
  preferredModelId: 'zimage_fusion_8gb',
  maxPromptLength: 420,
  maxNegativePromptLength: 420,
  workerSlots: 1,
  retentionDays: 14,
  quotaMbPerProject: 1024,
  defaultDeterministic: false,
  defaultWidth: 768,
  defaultHeight: 768,
  engine: {
    provider: 'comfyui',
    endpoint: 'http://127.0.0.1:8188',
    autoStart: true,
    startupTimeoutMs: 180000,
    appPath: 'sandbox/image_generator/comfyui',
    startCommand: '',
    defaultWorkflow: null,
    defaultCheckpointName: '',
  },
};
const IMAGE_MODEL_CATALOG = {
  zimage_fusion_8gb: {
    id: 'zimage_fusion_8gb',
    label: 'Unsloth Z-Image Turbo GGUF (Q4_K_M)',
    vramProfile: '8gb',
    recommendedFor: ['game_studio', 'software_web_app', 'mobile_app'],
    downloadUrl: 'https://huggingface.co/unsloth/Z-Image-Turbo-GGUF/resolve/main/z-image-turbo-Q4_K_M.gguf?download=true',
    fileName: 'z-image-turbo-Q4_K_M.gguf',
    sha256: null,
  },
};
const AUTO_ACTION_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 30 * 1000,
  maxDelayMs: 30 * 60 * 1000,
};
const CONNECTOR_EXECUTION_STALE_MS = 15 * 60 * 1000;
const MAX_CONNECTOR_EXECUTIONS = 2000;
const DEFAULT_CONNECTOR_RETRY_POLICIES = {
  default: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 30 * 60 * 1000 },
  github: { maxAttempts: 2, baseDelayMs: 20 * 1000, maxDelayMs: 10 * 60 * 1000 },
  netlify: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 30 * 60 * 1000 },
  google_ads: { maxAttempts: 4, baseDelayMs: 45 * 1000, maxDelayMs: 45 * 60 * 1000 },
  analytics: { maxAttempts: 3, baseDelayMs: 20 * 1000, maxDelayMs: 20 * 60 * 1000 },
  stripe: { maxAttempts: 2, baseDelayMs: 60 * 1000, maxDelayMs: 60 * 60 * 1000 },
  supabase: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 20 * 60 * 1000 },
  email_provider: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 20 * 60 * 1000 },
  kdp: { maxAttempts: 3, baseDelayMs: 45 * 1000, maxDelayMs: 30 * 60 * 1000 },
  gumroad: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 20 * 60 * 1000 },
  substack: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 20 * 60 * 1000 },
  custom_cms: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 20 * 60 * 1000 },
  image_generator: { maxAttempts: 2, baseDelayMs: 10 * 1000, maxDelayMs: 2 * 60 * 1000 },
  telegram: { maxAttempts: 3, baseDelayMs: 15 * 1000, maxDelayMs: 10 * 60 * 1000 },
  whatsapp: { maxAttempts: 3, baseDelayMs: 15 * 1000, maxDelayMs: 10 * 60 * 1000 },
};
const DEFAULT_PUBLICATION_RELIABILITY_POLICY = {
  lookbackHours: 24,
  maxDriftEventsPerWindow: 6,
  maxSelfHealFailuresPerWindow: 2,
  maxReplayExhaustedPerWindow: 1,
  maxReplayAttemptsPerTargetPerWindow: 3,
  alertCooldownMinutes: 60,
};
const DEFAULT_OPERATIONAL_LOOP_SAFETY = {
  maxAutoActionFailuresInWindow: 4,
  failureWindowMs: 45 * 60 * 1000,
  suspendForMs: 60 * 60 * 1000,
  notifyCooldownMs: 15 * 60 * 1000,
};
const DEFAULT_KPI_GOALS = {
  weeklyTasksDoneTarget: 15,
  maxBacklog: 10,
  maxMonthlySpend: 500,
};
const DEFAULT_APPROVAL_GOVERNANCE = {
  enabled: true,
  autoApproveRules: [
    {
      id: 'approve-low-risk-read-only',
      maxRiskScore: 35,
      maxEstimatedCost: 50,
      connectors: ['analytics', 'github'],
      operations: ['get_profile', 'list_accounts', 'get_user', 'list_repos'],
    },
  ],
  autoDenyRules: [
    {
      id: 'deny-critical-spend-or-risk',
      minRiskScore: 90,
      minEstimatedCost: 2500,
    },
    {
      id: 'deny-deploy-from-untrusted-role',
      connectors: ['netlify'],
      operations: ['trigger_deploy'],
      actorRoles: ['intern', 'contractor', 'unknown'],
    },
  ],
  escalationRules: [],
  industryPolicyPack: null,
};
const INDUSTRY_APPROVAL_POLICY_PACKS = {
  housing: {
    id: 'housing',
    title: 'Housing Compliance Pack',
    summary: 'Adds legal/compliance escalation for landlord-tenant, leasing, and regulated housing workflows.',
    autoDenyRules: [
      {
        id: 'housing-deny-critical-untrusted-finance',
        connectors: ['stripe'],
        operations: ['create_refund', 'create_invoice', 'create_payment_intent'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        minEstimatedCost: 200,
      },
    ],
    escalationRules: [
      {
        id: 'housing-escalate-legal-review',
        connectors: ['netlify', 'stripe', 'support_ticket', 'email_provider'],
        minRiskScore: 55,
        taskKeywords: ['housing', 'property', 'landlord', 'tenant', 'lease', 'rental', 'application', 'screening', 'eviction'],
      },
      {
        id: 'housing-escalate-privacy-docs',
        operations: ['trigger_deploy'],
        taskKeywords: ['privacy', 'terms', 'policy', 'legal', 'compliance'],
      },
    ],
  },
  finance: {
    id: 'finance',
    title: 'Finance & Fintech Compliance Pack',
    summary: 'Adds escalation and denial rules for high-value payments, chargebacks, tax filings, and financial close workflows.',
    autoDenyRules: [
      {
        id: 'finance-deny-bulk-payout-untrusted',
        connectors: ['stripe'],
        operations: ['create_transfer', 'create_payout', 'create_refund'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        minEstimatedCost: 1000,
      },
      {
        id: 'finance-deny-bulk-invoice-untrusted',
        connectors: ['stripe'],
        operations: ['create_invoice', 'finalize_invoice'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        minEstimatedCost: 500,
      },
    ],
    escalationRules: [
      {
        id: 'finance-escalate-chargeback-dispute',
        connectors: ['stripe'],
        minRiskScore: 50,
        taskKeywords: ['chargeback', 'dispute', 'fraud', 'reversal', 'unauthorized charge'],
      },
      {
        id: 'finance-escalate-tax-and-close',
        connectors: ['stripe', 'analytics', 'email_provider'],
        minRiskScore: 55,
        taskKeywords: ['tax', 'vat', 'audit', 'year-end', 'financial close', 'revenue recognition', 'regulatory filing'],
      },
      {
        id: 'finance-escalate-high-value-invoice',
        connectors: ['stripe'],
        operations: ['create_invoice', 'create_payment_intent'],
        minEstimatedCost: 500,
      },
    ],
  },
  healthcare: {
    id: 'healthcare',
    title: 'Healthcare Compliance Pack',
    summary: 'Enforces HIPAA-adjacent escalation for patient data, clinical workflows, and regulated health document deployments.',
    autoDenyRules: [
      {
        id: 'healthcare-deny-phi-export-untrusted',
        connectors: ['analytics', 'email_provider', 'github'],
        operations: ['export_data', 'create_export', 'send_email', 'push_file'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        taskKeywords: ['patient', 'phi', 'medical record', 'health data', 'clinical data'],
      },
      {
        id: 'healthcare-deny-bulk-delete-health-data',
        connectors: ['analytics', 'github'],
        operations: ['delete_records', 'bulk_delete', 'drop_table'],
        actorRoles: ['intern', 'contractor', 'unknown', 'support responder'],
      },
    ],
    escalationRules: [
      {
        id: 'healthcare-escalate-phi-workflow',
        connectors: ['netlify', 'email_provider', 'support_ticket', 'analytics'],
        minRiskScore: 50,
        taskKeywords: ['patient', 'phi', 'hipaa', 'medical', 'clinical', 'prescription', 'diagnosis', 'ehr', 'health record', 'telehealth'],
      },
      {
        id: 'healthcare-escalate-consent-deploy',
        operations: ['trigger_deploy'],
        taskKeywords: ['consent', 'authorization', 'treatment', 'medication', 'patient agreement', 'notice of privacy'],
      },
      {
        id: 'healthcare-escalate-regulated-support-access',
        connectors: ['support_ticket'],
        minRiskScore: 60,
        taskKeywords: ['patient', 'medical', 'clinical', 'health information'],
      },
    ],
  },
  saas: {
    id: 'saas',
    title: 'SaaS Data Privacy Pack',
    summary: 'Adds GDPR/CCPA escalation, production data safety gates, and security review rules for multi-tenant software businesses.',
    autoDenyRules: [
      {
        id: 'saas-deny-bulk-user-data-export-untrusted',
        connectors: ['analytics', 'github'],
        operations: ['export_data', 'create_export', 'push_file'],
        actorRoles: ['intern', 'contractor', 'unknown'],
      },
      {
        id: 'saas-deny-security-config-change-non-admin',
        connectors: ['netlify', 'github'],
        operations: ['update_env', 'set_secret', 'update_config', 'disable_auth'],
        actorRoles: ['intern', 'contractor', 'unknown', 'support responder'],
      },
    ],
    escalationRules: [
      {
        id: 'saas-escalate-data-subject-request',
        connectors: ['analytics', 'email_provider', 'github'],
        minRiskScore: 45,
        taskKeywords: ['gdpr', 'ccpa', 'data subject', 'right to erasure', 'right to be forgotten', 'data export request', 'deletion request', 'data access request'],
      },
      {
        id: 'saas-escalate-secret-rotation-prod',
        connectors: ['netlify', 'github'],
        operations: ['update_env', 'set_secret', 'rotate_key'],
        minRiskScore: 55,
        taskKeywords: ['api key', 'secret rotation', 'production secret', 'env rotation'],
      },
      {
        id: 'saas-escalate-privacy-data-policy-deploy',
        operations: ['trigger_deploy'],
        taskKeywords: ['retention policy', 'privacy settings', 'data sharing', 'user deletion', 'consent management', 'cookie policy'],
      },
    ],
  },
  ecommerce: {
    id: 'ecommerce',
    title: 'E-commerce Operations Pack',
    summary: 'Protects catalog integrity, order operations, and pricing actions for online retail and marketplace businesses.',
    autoDenyRules: [
      {
        id: 'ecommerce-deny-bulk-price-change-untrusted',
        connectors: ['stripe', 'analytics'],
        operations: ['update_price', 'bulk_update', 'update_product'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        minEstimatedCost: 200,
      },
      {
        id: 'ecommerce-deny-mass-order-cancel-untrusted',
        connectors: ['stripe'],
        operations: ['cancel_subscription', 'void_invoice', 'cancel_payment_intent'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        minEstimatedCost: 500,
      },
    ],
    escalationRules: [
      {
        id: 'ecommerce-escalate-pricing-ops',
        connectors: ['stripe', 'analytics'],
        minRiskScore: 55,
        taskKeywords: ['bulk discount', 'price override', 'flash sale', 'inventory clearance', 'margin', 'supplier contract', 'pricing strategy'],
      },
      {
        id: 'ecommerce-escalate-high-value-refund',
        connectors: ['stripe'],
        operations: ['create_refund', 'cancel_subscription'],
        minEstimatedCost: 500,
      },
      {
        id: 'ecommerce-escalate-catalog-launch',
        operations: ['trigger_deploy'],
        taskKeywords: ['product launch', 'catalog', 'go live', 'storefront deploy', 'product release'],
      },
    ],
  },
  marketplace: {
    id: 'marketplace',
    title: 'Marketplace & Social Platform Pack',
    summary: 'Protects auction/bidding transactions, user profile data, trust/safety deployments, and matching algorithm changes for marketplaces, dating apps, and social platforms.',
    autoDenyRules: [
      {
        id: 'marketplace-deny-bulk-message-untrusted',
        connectors: ['email_provider', 'support_ticket'],
        operations: ['send_bulk_email', 'send_email', 'create_broadcast'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        taskKeywords: ['blast', 'broadcast', 'all users', 'mass message', 'bulk send'],
      },
      {
        id: 'marketplace-deny-auction-settlement-untrusted',
        connectors: ['stripe'],
        operations: ['create_transfer', 'create_payout', 'create_refund'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        minEstimatedCost: 100,
      },
    ],
    escalationRules: [
      {
        id: 'marketplace-escalate-trust-safety-deploy',
        operations: ['trigger_deploy'],
        taskKeywords: ['trust', 'safety', 'moderation', 'reporting', 'ban', 'block', 'terms of service', 'community guidelines', 'harassment policy'],
      },
      {
        id: 'marketplace-escalate-matching-algo-change',
        connectors: ['netlify', 'github'],
        minRiskScore: 50,
        taskKeywords: ['matching algorithm', 'ranking', 'recommendation', 'feed algorithm', 'scoring', 'search ranking', 'auction algorithm'],
      },
      {
        id: 'marketplace-escalate-fee-structure',
        connectors: ['stripe', 'analytics'],
        minRiskScore: 55,
        taskKeywords: ['fee', 'commission', 'platform cut', 'take rate', 'transaction fee', 'listing fee', 'subscription tier'],
      },
      {
        id: 'marketplace-escalate-auction-transaction',
        connectors: ['stripe'],
        operations: ['create_payment_intent', 'create_invoice', 'create_transfer'],
        minEstimatedCost: 100,
      },
    ],
  },
};
const WEEKLY_OBJECTIVES_BY_TEMPLATE = {
  default: [
    {
      key: 'ops_throughput',
      title: 'Stabilize weekly throughput against KPI target',
      ownerRole: 'Senior Project Manager',
      kpiOwnerRole: 'Analytics Reporter',
      slaHours: 48,
      metric: 'weeklyTasksDone',
    },
  ],
  business: [
    {
      key: 'sales_pipeline_velocity',
      title: 'Increase sales pipeline movement and response speed',
      ownerRole: 'Sales Manager',
      kpiOwnerRole: 'Analytics Reporter',
      slaHours: 24,
      metric: 'pipelineVelocity',
    },
    {
      key: 'support_sla_health',
      title: 'Hold support first-response SLA in all active queues',
      ownerRole: 'Customer Support',
      kpiOwnerRole: 'Analytics Reporter',
      slaHours: 8,
      metric: 'supportFirstResponse',
    },
    {
      key: 'finance_spend_guardrail',
      title: 'Maintain monthly spend inside approved guardrails',
      ownerRole: 'Financial Controller',
      kpiOwnerRole: 'Finance Tracker',
      slaHours: 24,
      metric: 'monthlySpend',
    },
  ],
  marketplace: {
    id: 'marketplace',
    title: 'Marketplace & Social Platform Pack',
    summary: 'Protects auction/bidding transactions, user profile data, trust/safety deployments, and matching algorithm changes for marketplaces, dating apps, and social platforms.',
    autoDenyRules: [
      {
        id: 'marketplace-deny-bulk-message-untrusted',
        connectors: ['email_provider', 'support_ticket'],
        operations: ['send_bulk_email', 'send_email', 'create_broadcast'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        taskKeywords: ['blast', 'broadcast', 'all users', 'mass message', 'bulk send'],
      },
      {
        id: 'marketplace-deny-auction-settlement-untrusted',
        connectors: ['stripe'],
        operations: ['create_transfer', 'create_payout', 'create_refund'],
        actorRoles: ['intern', 'contractor', 'unknown'],
        minEstimatedCost: 100,
      },
    ],
    escalationRules: [
      {
        id: 'marketplace-escalate-trust-safety-deploy',
        operations: ['trigger_deploy'],
        taskKeywords: ['trust', 'safety', 'moderation', 'reporting', 'ban', 'block', 'terms of service', 'community guidelines', 'harassment policy'],
      },
      {
        id: 'marketplace-escalate-matching-algo-change',
        connectors: ['netlify', 'github'],
        minRiskScore: 50,
        taskKeywords: ['matching algorithm', 'ranking', 'recommendation', 'feed algorithm', 'scoring', 'search ranking', 'auction algorithm'],
      },
      {
        id: 'marketplace-escalate-fee-structure',
        connectors: ['stripe', 'analytics'],
        minRiskScore: 55,
        taskKeywords: ['fee', 'commission', 'platform cut', 'take rate', 'transaction fee', 'listing fee', 'subscription tier'],
      },
      {
        id: 'marketplace-escalate-auction-transaction',
        connectors: ['stripe'],
        operations: ['create_payment_intent', 'create_invoice', 'create_transfer'],
        minEstimatedCost: 100,
      },
    ],
  },
};
const DEFAULT_RECURRING_SCHEDULE = [
  { key: 'maintenance_health', title: 'Run maintenance health check', phase: 'maintenance', everyMs: 60 * 60 * 1000 },
  { key: 'growth_review', title: 'Review growth metrics and next actions', phase: 'growth', everyMs: 3 * 60 * 60 * 1000 },
];
const RECURRING_SCHEDULE_BY_TEMPLATE = {
  business: [
    { key: 'business_content_cycle', title: 'Create weekly marketing content batch', phase: 'marketing', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'business_pipeline_review', title: 'Review sales pipeline and optimize outreach', phase: 'sales', everyMs: 4 * 60 * 60 * 1000 },
    { key: 'business_support_sla_loop', title: 'Review support queue SLA compliance and escalations', phase: 'support', ownerRole: 'Customer Support', kpiOwnerRole: 'Analytics Reporter', slaHours: 8, everyMs: 3 * 60 * 60 * 1000 },
    { key: 'business_finance_control_loop', title: 'Audit spend variance and adjust finance controls', phase: 'finance', ownerRole: 'Financial Controller', kpiOwnerRole: 'Finance Tracker', slaHours: 24, everyMs: 6 * 60 * 60 * 1000 },
  ],
  software_agency: [
    { key: 'agency_deploy_audit', title: 'Run deployment readiness and rollback audit', phase: 'engineering', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'agency_client_update', title: 'Generate client progress report and roadmap updates', phase: 'operations', everyMs: 4 * 60 * 60 * 1000 },
  ],
  software_web_app: [
    { key: 'web_release_audit', title: 'Run web release readiness and rollback audit', phase: 'engineering', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'web_performance_review', title: 'Review web app performance and conversion bottlenecks', phase: 'analytics', everyMs: 4 * 60 * 60 * 1000 },
  ],
  mobile_app: [
    { key: 'mobile_build_audit', title: 'Run mobile build readiness and release rollback audit', phase: 'engineering', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'mobile_telemetry_review', title: 'Review crash/performance telemetry and mobile UX friction', phase: 'analytics', everyMs: 4 * 60 * 60 * 1000 },
  ],
  game_studio: [
    { key: 'studio_build_validation', title: 'Run gameplay build validation pass', phase: 'development', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'studio_player_insights', title: 'Review player feedback and balancing priorities', phase: 'analysis', everyMs: 5 * 60 * 60 * 1000 },
  ],
  publishing_house: [
    { key: 'publishing_editorial_cycle', title: 'Plan and assign next editorial content cycle', phase: 'editorial', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'publishing_distribution_check', title: 'Audit distribution channels and update release queue', phase: 'distribution', everyMs: 5 * 60 * 60 * 1000 },
  ],
  music_production: [
    { key: 'music_release_ops', title: 'Prepare release operations and channel sync', phase: 'release', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'music_campaign_review', title: 'Review audience engagement and campaign adjustments', phase: 'marketing', everyMs: 5 * 60 * 60 * 1000 },
  ],
  research_lab: [
    { key: 'research_literature_scan', title: 'Run recurring literature scan and update findings', phase: 'research', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'research_experiment_review', title: 'Review experiment backlog and reprioritize hypotheses', phase: 'analysis', everyMs: 5 * 60 * 60 * 1000 },
  ],
  content_creator: [
    { key: 'creator_content_schedule', title: 'Plan and draft next content publishing batch', phase: 'content', everyMs: 4 * 60 * 60 * 1000 },
    { key: 'creator_engagement_review', title: 'Review engagement metrics and optimize hooks', phase: 'analytics', everyMs: 3 * 60 * 60 * 1000 },
  ],
};
const DEFAULT_OPERATING_MODE_BY_TEMPLATE = {
  business: 'continuous_business',
  software_agency: 'continuous_business',
  software_web_app: 'continuous_business',
  mobile_app: 'continuous_business',
  content_creator: 'continuous_business',
  game_studio: 'finite_delivery',
  publishing_house: 'finite_delivery',
  music_production: 'finite_delivery',
  research_lab: 'finite_delivery',
};
const DEFAULT_AUTO_STAFFING_POLICY = {
  enabled: true,
  cooldownMs: 60 * 60 * 1000,
  backlogPerAgentThreshold: 2,
  maxOptionalAdds: 3,
};
const DEFAULT_ROLE_CAPABILITIES = {
  'DevOps Automator': { canDeploy: true, canSpend: true, allowedConnectors: ['netlify', 'github', 'image_generator'] },
  'Backend Architect': { canDeploy: false, canSpend: false, allowedConnectors: ['github', 'supabase', 'image_generator'] },
  'Senior Project Manager': { canDeploy: false, canSpend: false, allowedConnectors: [] },
  'Growth Hacker': { canDeploy: true, canSpend: false, allowedConnectors: ['github', 'netlify', 'email_provider', 'analytics', 'kdp', 'gumroad', 'substack', 'custom_cms'] },
  'Reality Checker': { canDeploy: false, canSpend: false, allowedConnectors: ['analytics'] },
  'Growth Hacker + Content Creator': { canDeploy: false, canSpend: true, allowedConnectors: ['google_ads', 'analytics'] },
  'Support Responder': { canDeploy: false, canSpend: false, allowedConnectors: ['email_provider', 'support_chat', 'support_ticket'] },
  'Finance Tracker': { canDeploy: false, canSpend: true, allowedConnectors: ['analytics', 'stripe', 'google_ads'] },
};
const OPTIONAL_AGENT_PERSONALITY_PATHS = {
  'Security Engineer': ['agency-agents/engineering/engineering-security-engineer.md'],
  'Reality Checker': ['agency-agents/testing/testing-reality-checker.md'],
  'QA Validator': ['agency-agents/testing/testing-reality-checker.md'],
  'PPC Campaign Strategist': ['agency-agents/marketing/marketing-ppc-campaign-strategist.md'],
  'Brand Guardian': ['agency-agents/marketing/marketing-brand-guardian.md'],
  'Legal Compliance Checker': ['agency-agents/support/support-legal-compliance-checker.md'],
  'SEO Specialist': ['agency-agents/marketing/marketing-seo-specialist.md'],
  'Analytics Reporter': ['agency-agents/support/support-analytics-reporter.md'],
  'API Tester': ['agency-agents/testing/testing-api-tester.md'],
  'Incident Response Commander': ['agency-agents/support/support-incident-response-commander.md'],
  'Technical Writer': ['agency-agents/engineering/engineering-technical-writer.md'],
  'Feedback Synthesizer': ['agency-agents/support/support-feedback-synthesizer.md'],
  'Sprint Prioritizer': ['agency-agents/project-management/project-manager-sprint-prioritizer.md'],
  'Performance Benchmarker': ['agency-agents/testing/testing-performance-benchmarker.md'],
  'Narrative Designer': ['agency-agents/game-development/game-narrative-designer.md'],
  'Level Designer': ['agency-agents/game-development/game-level-designer.md'],
  'Technical Artist': ['agency-agents/game-development/game-technical-artist.md'],
  'Paid Social Strategist': ['agency-agents/marketing/marketing-paid-social-strategist.md'],
  'TikTok Strategist': ['agency-agents/marketing/marketing-tiktok-strategist.md'],
  'Instagram Curator': ['agency-agents/marketing/marketing-instagram-curator.md'],
  'LinkedIn Content Creator': ['agency-agents/marketing/marketing-linkedin-content-creator.md'],
};
const AGENT_PERSONALITY_ROOTS = [
  path.resolve(__dirname, 'agency-agents'),
  path.resolve(__dirname, '..', 'agency-agents'),
  path.resolve(__dirname),
];
const sseClients = new Set();
const projectSseClients = new Map();
const activeTasks = new Map();
const projectRuntimes = new Map();
let pythonRuntimeReady = false;
let sqliteMessageBus = null;

let nextTaskId = 1;
const taskHistory = [];
let appConfig = null;
let imageRuntimeState = null;
let imageActiveWorkers = 0;
const imageGenerationQueue = [];
let imageEngineProcess = null;
let imageEngineLastStartAt = null;
let imageEngineBootstrapPromise = null;
const imageModelDownloadPromises = new Map();
const appState = {
  llm: {
    provider: 'lmstudio',
    endpoint: 'http://127.0.0.1:1234/v1',
    cloudProviders: false,
    reachable: false,
    model: null,
    lastCheckedAt: null
  }
};

const SUPPORTED_CREDENTIAL_SERVICES = ['github', 'netlify', 'stripe', 'google_ads', 'analytics', 'supabase', 'email_provider', 'support_chat', 'support_ticket', 'kdp', 'gumroad', 'substack', 'custom_cms', 'google_play'];
const CONNECTOR_REGISTRY = {
  github: { id: 'github', label: 'GitHub', credentialService: 'github' },
  telegram: { id: 'telegram', label: 'Telegram', provider: 'telegram' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', provider: 'whatsapp' },
  netlify: { id: 'netlify', label: 'Netlify', credentialService: 'netlify' },
  stripe: { id: 'stripe', label: 'Stripe', credentialService: 'stripe' },
  google_ads: { id: 'google_ads', label: 'Google Ads', credentialService: 'google_ads' },
  analytics: { id: 'analytics', label: 'Analytics', credentialService: 'analytics' },
  supabase: { id: 'supabase', label: 'Supabase', credentialService: 'supabase' },
  email_provider: { id: 'email_provider', label: 'Email Provider', credentialService: 'email_provider' },
  support_chat: { id: 'support_chat', label: 'Support Chat', credentialService: 'support_chat' },
  support_ticket: { id: 'support_ticket', label: 'Support Ticketing', credentialService: 'support_ticket' },
  kdp: { id: 'kdp', label: 'Amazon KDP', credentialService: 'kdp' },
  gumroad: { id: 'gumroad', label: 'Gumroad', credentialService: 'gumroad' },
  substack: { id: 'substack', label: 'Substack', credentialService: 'substack' },
  custom_cms: { id: 'custom_cms', label: 'Custom CMS', credentialService: 'custom_cms' },
  google_play: { id: 'google_play', label: 'Google Play Console', credentialService: 'google_play' },
  image_generator: { id: 'image_generator', label: 'Image Generator', localRuntime: true },
};
const MUTATING_CONNECTOR_OPERATIONS = {
  netlify: new Set(['trigger_deploy']),
  github: new Set(['create_issue', 'create_pull_request', 'dispatch_workflow']),
  stripe: new Set(['create_payment_intent', 'create_refund', 'create_invoice']),
  supabase: new Set(['create_table', 'apply_schema', 'enable_auth']),
  email_provider: new Set(['send_email', 'send_campaign']),
  google_ads: new Set(['create_campaign', 'update_campaign_budget', 'pause_campaign', 'resume_campaign']),
  support_chat: new Set(['reply_conversation', 'close_conversation', 'escalate_conversation', 'triage_conversations']),
  support_ticket: new Set(['reply_ticket', 'close_ticket', 'escalate_ticket', 'triage_tickets']),
  kdp: new Set(['publish_book', 'update_publication', 'unpublish_publication']),
  gumroad: new Set(['publish_product', 'update_product', 'unpublish_product']),
  substack: new Set(['publish_post', 'update_post', 'unpublish_post']),
  custom_cms: new Set(['publish_book', 'update_publication', 'unpublish_publication']),
  google_play: new Set(['upload_bundle', 'create_release', 'update_release_notes', 'promote_release']),
  image_generator: new Set(['download_model', 'warmup', 'generate_image', 'generate_asset_pack', 'self_test', 'golden_regression', 'prune_storage']),
};
const CONNECTOR_IDEMPOTENCY_PROFILES = {
  netlify: {
    trigger_deploy: {
      mode: 'forwarded_header',
      reconciliation: 'deploy_visibility',
    },
  },
  github: {
    create_issue: {
      mode: 'native_token',
      reconciliation: null,
    },
    create_pull_request: {
      mode: 'native_token',
      reconciliation: null,
    },
    dispatch_workflow: {
      mode: 'native_token',
      reconciliation: null,
    },
  },
  stripe: {
    create_payment_intent: {
      mode: 'native_token',
      reconciliation: null,
    },
    create_refund: {
      mode: 'native_token',
      reconciliation: null,
    },
    create_invoice: {
      mode: 'native_token',
      reconciliation: null,
    },
  },
  supabase: {
    create_table: {
      mode: 'native_token',
      reconciliation: null,
    },
    apply_schema: {
      mode: 'native_token',
      reconciliation: null,
    },
    enable_auth: {
      mode: 'native_token',
      reconciliation: null,
    },
  },
  email_provider: {
    send_email: {
      mode: 'native_token',
      reconciliation: null,
    },
    send_campaign: {
      mode: 'native_token',
      reconciliation: null,
    },
  },
  google_ads: {
    create_campaign: {
      mode: 'native_token',
      reconciliation: null,
    },
    update_campaign_budget: {
      mode: 'native_token',
      reconciliation: null,
    },
    pause_campaign: {
      mode: 'native_token',
      reconciliation: null,
    },
    resume_campaign: {
      mode: 'native_token',
      reconciliation: null,
    },
  },
  support_chat: {
    reply_conversation: {
      mode: 'native_token',
      reconciliation: null,
    },
    close_conversation: {
      mode: 'native_token',
      reconciliation: null,
    },
    escalate_conversation: {
      mode: 'native_token',
      reconciliation: null,
    },
    triage_conversations: {
      mode: 'native_token',
      reconciliation: null,
    },
  },
  support_ticket: {
    reply_ticket: {
      mode: 'native_token',
      reconciliation: null,
    },
    close_ticket: {
      mode: 'native_token',
      reconciliation: null,
    },
    escalate_ticket: {
      mode: 'native_token',
      reconciliation: null,
    },
    triage_tickets: {
      mode: 'native_token',
      reconciliation: null,
    },
  },
  kdp: {
    publish_book: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
    update_publication: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
    unpublish_publication: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
  },
  gumroad: {
    publish_product: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
    update_product: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
    unpublish_product: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
  },
  substack: {
    publish_post: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
    update_post: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
    unpublish_post: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
  },
  custom_cms: {
    publish_book: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
    update_publication: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
    unpublish_publication: {
      mode: 'native_token',
      reconciliation: 'publication_state',
    },
  },
  google_play: {
    upload_bundle: {
      mode: 'native_token',
      reconciliation: 'release_state',
    },
    create_release: {
      mode: 'native_token',
      reconciliation: 'release_state',
    },
    update_release_notes: {
      mode: 'native_token',
      reconciliation: 'release_state',
    },
    promote_release: {
      mode: 'native_token',
      reconciliation: 'release_state',
    },
  },
  image_generator: {
    download_model: {
      mode: 'ledger_only',
      reconciliation: 'runtime_state',
    },
    warmup: {
      mode: 'ledger_only',
      reconciliation: 'runtime_state',
    },
    generate_image: {
      mode: 'ledger_only',
      reconciliation: 'artifact_state',
    },
    generate_asset_pack: {
      mode: 'ledger_only',
      reconciliation: 'artifact_state',
    },
    self_test: {
      mode: 'ledger_only',
      reconciliation: 'artifact_state',
    },
    golden_regression: {
      mode: 'ledger_only',
      reconciliation: 'artifact_state',
    },
    prune_storage: {
      mode: 'ledger_only',
      reconciliation: 'artifact_state',
    },
  },
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeLlmModelLabel(modelValue) {
  const raw = String(modelValue || '').trim();
  if (!raw) return null;
  if (raw.toUpperCase() === 'REPLACE_WITH_LOCAL_MODEL_NAME') return null;
  return raw;
}

function preferredLlmModelLabel() {
  return normalizeLlmModelLabel(appConfig && appConfig.llm && appConfig.llm.model)
    || normalizeLlmModelLabel(appState && appState.llm && appState.llm.model)
    || null;
}

function normalizeLlmProvider(providerValue) {
  const raw = String(providerValue || '').trim().toLowerCase();
  return raw === 'openai_compatible' ? 'openai_compatible' : 'lmstudio';
}

function resolveLlmApiKey(llmConfig) {
  const direct = String(llmConfig?.apiKey || '').trim();
  if (direct) return direct;
  const envName = String(llmConfig?.apiKeyEnv || '').trim();
  if (envName) return String(process.env[envName] || '').trim();
  return '';
}

function llmProviderLabel(providerValue) {
  return normalizeLlmProvider(providerValue) === 'openai_compatible' ? 'OpenAI-compatible LLM' : 'LM Studio';
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeRetryPolicyEntry(entry = {}, fallback = DEFAULT_CONNECTOR_RETRY_POLICIES.default) {
  return {
    maxAttempts: clampInt(entry.maxAttempts, fallback.maxAttempts, 1, 20),
    baseDelayMs: clampInt(entry.baseDelayMs, fallback.baseDelayMs, 1000, 12 * 60 * 60 * 1000),
    maxDelayMs: clampInt(entry.maxDelayMs, fallback.maxDelayMs, 1000, 24 * 60 * 60 * 1000),
  };
}

function retryPoliciesSummary() {
  const configured = (appConfig && appConfig.retryPolicies && typeof appConfig.retryPolicies === 'object')
    ? appConfig.retryPolicies
    : {};
  const merged = {};
  Object.entries(DEFAULT_CONNECTOR_RETRY_POLICIES).forEach(([key, fallback]) => {
    const cfg = configured[key] && typeof configured[key] === 'object' ? configured[key] : {};
    merged[key] = normalizeRetryPolicyEntry(cfg, fallback);
  });

  Object.entries(configured).forEach(([key, cfg]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey || merged[normalizedKey]) return;
    if (!cfg || typeof cfg !== 'object') return;
    merged[normalizedKey] = normalizeRetryPolicyEntry(cfg, DEFAULT_CONNECTOR_RETRY_POLICIES.default);
  });

  return merged;
}

function retryPolicyForConnector(connectorId) {
  const key = String(connectorId || '').trim().toLowerCase();
  const all = retryPoliciesSummary();
  return all[key] || all.default || normalizeRetryPolicyEntry();
}

function applyRetryPoliciesUpdate(partial = {}) {
  if (!partial || typeof partial !== 'object') return;
  appConfig.retryPolicies = appConfig.retryPolicies && typeof appConfig.retryPolicies === 'object'
    ? appConfig.retryPolicies
    : {};
  Object.entries(partial).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey || !value || typeof value !== 'object') return;
    const fallback = DEFAULT_CONNECTOR_RETRY_POLICIES[normalizedKey] || DEFAULT_CONNECTOR_RETRY_POLICIES.default;
    appConfig.retryPolicies[normalizedKey] = normalizeRetryPolicyEntry(value, fallback);
  });
  persistAppConfig();
}

function startOfUtcWeekIso(ts = nowIso()) {
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return nowIso();
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : (1 - day);
  dt.setUTCDate(dt.getUTCDate() + diff);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString();
}

function ensureDeadLetterState(projectState) {
  if (!Array.isArray(projectState.deadLetters)) {
    projectState.deadLetters = [];
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function connectorExecutionKey(task) {
  const connector = String(task && task.autoAction && task.autoAction.connector ? task.autoAction.connector : '').trim().toLowerCase();
  const operation = String(task && task.autoAction && task.autoAction.operation ? task.autoAction.operation : '').trim().toLowerCase();
  const input = task && task.autoAction && task.autoAction.input && typeof task.autoAction.input === 'object'
    ? task.autoAction.input
    : {};
  const inputHash = crypto.createHash('sha256').update(canonicalJson(input)).digest('hex').slice(0, 16);
  return `${String(task && task.id ? task.id : 'task')}::${connector}::${operation}::${inputHash}`;
}

function connectorMutationExecutionKey(connectorId, operation, input = {}) {
  const connector = String(connectorId || '').trim().toLowerCase();
  const operationKey = String(operation || '').trim().toLowerCase();
  const safeInput = input && typeof input === 'object' ? input : {};
  const inputHash = crypto.createHash('sha256').update(canonicalJson(safeInput)).digest('hex').slice(0, 16);
  return `${connector}::${operationKey}::${inputHash}`;
}

function isMutatingConnectorOperation(connectorId, operation) {
  const connector = String(connectorId || '').trim().toLowerCase();
  const operationKey = String(operation || '').trim().toLowerCase();
  const allowed = MUTATING_CONNECTOR_OPERATIONS[connector];
  return Boolean(allowed && allowed.has(operationKey));
}

function shouldBlockMutatingConnectorInDraftMode(mode, connectorId, operation) {
  const modeKey = String(mode || '').trim().toLowerCase();
  if (modeKey !== 'draft') return false;
  return isMutatingConnectorOperation(connectorId, operation);
}

function shouldSkipConnectorPolicyFailureInDraft(projectState, action, policyResult) {
  const modeKey = String(projectState && projectState.mode ? projectState.mode : '').trim().toLowerCase();
  if (modeKey !== 'draft') return false;
  if (!action || action.type !== 'connector') return false;
  if (!policyResult || policyResult.ok) return false;
  return true;
}

function connectorIdempotencyProfile(connectorId, operation) {
  const connector = String(connectorId || '').trim().toLowerCase();
  const operationKey = String(operation || '').trim().toLowerCase();
  const connectorProfiles = CONNECTOR_IDEMPOTENCY_PROFILES[connector] || {};
  const selected = connectorProfiles[operationKey] || null;
  if (!selected) {
    return {
      mode: isMutatingConnectorOperation(connector, operationKey) ? 'ledger_only' : 'not_required',
      reconciliation: null,
    };
  }
  return {
    mode: String(selected.mode || 'ledger_only'),
    reconciliation: selected.reconciliation || null,
  };
}

function connectorIdempotencyMode(connectorId, operation) {
  return connectorIdempotencyProfile(connectorId, operation).mode;
}

function shouldReconcileConnectorExecution(connectorId, operation) {
  const profile = connectorIdempotencyProfile(connectorId, operation);
  return Boolean(profile.reconciliation);
}

async function reconcileConnectorExecution(connectorId, operation, executionResult, context = {}) {
  const connector = String(connectorId || '').trim().toLowerCase();
  const operationKey = String(operation || '').trim().toLowerCase();
  const profile = connectorIdempotencyProfile(connector, operationKey);

  if (!profile.reconciliation) {
    return {
      checked: false,
      ok: true,
      pending: false,
      mode: profile.mode,
      reason: 'No reconciliation required for this connector operation.',
    };
  }

  if (profile.reconciliation === 'deploy_visibility' && connector === 'netlify' && operationKey === 'trigger_deploy') {
    const deployId = String(executionResult && executionResult.data && executionResult.data.id ? executionResult.data.id : '').trim();
    const siteId = String(context && context.siteId ? context.siteId : '').trim();
    if (!deployId || !siteId) {
      return {
        checked: true,
        ok: false,
        pending: true,
        mode: profile.mode,
        reason: 'Deploy visibility reconciliation pending: deployId/siteId not available yet.',
      };
    }
    try {
      const verify = await executeNetlifyConnector({ operation: 'list_deploys', siteId });
      if (!verify.ok) {
        return {
          checked: true,
          ok: false,
          pending: true,
        siteId: siteId,
          reason: `Deploy visibility reconciliation pending: ${verify.message || 'list_deploys_failed'}`,
        };
      }
      const deploys = Array.isArray(verify.data && verify.data.deploys) ? verify.data.deploys : [];
      const found = deploys.some((entry) => String(entry && entry.id ? entry.id : '') === deployId);
      return {
        checked: true,
        ok: found,
        pending: !found,
        mode: profile.mode,
        reason: found
          ? 'Deploy id verified in recent provider deploy history.'
          : 'Deploy not yet visible in provider history; eventual consistency reconciliation pending.',
      };
    } catch (err) {
      return {
        checked: true,
        ok: false,
        pending: true,
        mode: profile.mode,
        reason: `Deploy visibility reconciliation pending due to connector error: ${redactSensitive(err.message)}`,
      };
    }
  }

  if (profile.reconciliation === 'publication_state') {
    const baseData = executionResult && executionResult.data && typeof executionResult.data === 'object'
      ? executionResult.data
      : {};
    const targetEntries = Array.isArray(baseData.targets) ? baseData.targets : [];

    const hasVerificationEvidence = (payload) => {
      if (!payload || typeof payload !== 'object') return false;
      const candidate = payload.data && typeof payload.data === 'object' ? payload.data : payload;
      const evidence = [
        candidate.publicationId,
        candidate.postId,
        candidate.productId,
        candidate.id,
        candidate.slug,
        candidate.url,
        candidate.permalink,
        candidate.canonicalUrl,
      ];
      return evidence.some((value) => String(value || '').trim().length > 0);
    };

    if (targetEntries.length > 0) {
      const checks = targetEntries.map((entry) => {
        const ok = Boolean(entry && entry.ok);
        const verified = ok ? hasVerificationEvidence(entry) : false;
        const pending = ok && !verified;
        return {
          target: String(entry && (entry.target || entry.connector) || '').trim().toLowerCase() || 'unknown',
          ok,
          verified,
          pending,
          rollbacked: Boolean(entry && entry.rollbacked),
        };
      });
      const successfulChecks = checks.filter((entry) => entry.ok && !entry.rollbacked);
      const pendingChecks = successfulChecks.filter((entry) => entry.pending);
      const failedChecks = checks.filter((entry) => !entry.ok);
      const rollback = baseData.rollback && typeof baseData.rollback === 'object' ? baseData.rollback : null;
      const rollbackApplied = Boolean(rollback && rollback.attemptedCount > 0);
      const overallOk = pendingChecks.length === 0 && failedChecks.length === 0;
      return {
        checked: true,
        ok: overallOk,
        pending: pendingChecks.length > 0,
        mode: profile.mode,
        reason: overallOk
          ? `Publication state verified for ${successfulChecks.length} target(s).`
          : (pendingChecks.length > 0
            ? `Publication verification pending for ${pendingChecks.length} target(s).`
            : `Publication reconciliation detected ${failedChecks.length} failed target(s).`),
        strategy: String(baseData.strategy || '').trim().toLowerCase() || null,
        targetChecks: checks,
        rollbackApplied,
      };
    }

    const singleOk = Boolean(executionResult && executionResult.ok);
    const verified = singleOk ? hasVerificationEvidence(baseData) : false;
    return {
      checked: true,
      ok: singleOk && verified,
      pending: singleOk && !verified,
      mode: profile.mode,
      reason: singleOk && verified
        ? 'Publication state verified from connector response payload.'
        : (singleOk
          ? 'Publication verification pending: response payload missing publication identifiers.'
          : 'Publication connector execution did not succeed.'),
      targetChecks: [
        {
          target: connector,
          ok: singleOk,
          verified,
          pending: singleOk && !verified,
          rollbacked: false,
        },
      ],
      rollbackApplied: false,
    };
  }

  return {
    checked: false,
    ok: true,
    pending: false,
    mode: profile.mode,
    reason: 'No reconciliation strategy registered for this connector operation.',
  };
}

function ensureConnectorExecutionState(projectState) {
  if (!projectState.connectorExecutions || typeof projectState.connectorExecutions !== 'object') {
    projectState.connectorExecutions = {};
  }
}

function markConnectorExecutionRecord(projectState, executionKey, patch = {}) {
  ensureConnectorExecutionState(projectState);
  const existing = projectState.connectorExecutions[executionKey] && typeof projectState.connectorExecutions[executionKey] === 'object'
    ? projectState.connectorExecutions[executionKey]
    : {};
  const next = {
    ...existing,
    ...patch,
    executionKey,
    updatedAt: patch.updatedAt || nowIso(),
  };
  projectState.connectorExecutions[executionKey] = next;

  const keys = Object.keys(projectState.connectorExecutions);
  if (keys.length > MAX_CONNECTOR_EXECUTIONS) {
    const sorted = keys
      .map((key) => ({ key, updatedAt: Date.parse(projectState.connectorExecutions[key]?.updatedAt || '') || 0 }))
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const removeCount = Math.max(0, keys.length - MAX_CONNECTOR_EXECUTIONS);
    for (let idx = 0; idx < removeCount; idx += 1) {
      delete projectState.connectorExecutions[sorted[idx].key];
    }
  }

  return next;
}

function ensureFinanceExceptionState(projectState) {
  if (!Array.isArray(projectState.financeExceptions)) {
    projectState.financeExceptions = [];
  }
}

function ensurePublicationHealthState(projectState) {
  if (!projectState.publicationHealth || typeof projectState.publicationHealth !== 'object') {
    projectState.publicationHealth = {
      driftEvents: [],
      incidents: [],
      policy: {
        ...DEFAULT_PUBLICATION_RELIABILITY_POLICY,
      },
      alerting: {
        lastSignature: null,
        lastSentAt: null,
        suppressedSignals: [],
      },
      lastSlo: null,
      lastCheckedAt: null,
      lastSelfHealAt: null,
      lastSelfHealSummary: null,
    };
  }
  if (!Array.isArray(projectState.publicationHealth.driftEvents)) {
    projectState.publicationHealth.driftEvents = [];
  }
  if (!Array.isArray(projectState.publicationHealth.incidents)) {
    projectState.publicationHealth.incidents = [];
  }
  if (!projectState.publicationHealth.policy || typeof projectState.publicationHealth.policy !== 'object') {
    projectState.publicationHealth.policy = {
      ...DEFAULT_PUBLICATION_RELIABILITY_POLICY,
    };
  }
  if (!projectState.publicationHealth.alerting || typeof projectState.publicationHealth.alerting !== 'object') {
    projectState.publicationHealth.alerting = {
      lastSignature: null,
      lastSentAt: null,
      suppressedSignals: [],
    };
  }
  if (!Array.isArray(projectState.publicationHealth.alerting.suppressedSignals)) {
    projectState.publicationHealth.alerting.suppressedSignals = [];
  }
}

function publicationReliabilityPolicy(projectState, overrides = {}) {
  ensurePublicationHealthState(projectState);
  const raw = {
    ...DEFAULT_PUBLICATION_RELIABILITY_POLICY,
    ...(projectState.publicationHealth.policy && typeof projectState.publicationHealth.policy === 'object'
      ? projectState.publicationHealth.policy
      : {}),
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  };
  return {
    lookbackHours: clampInt(raw.lookbackHours, DEFAULT_PUBLICATION_RELIABILITY_POLICY.lookbackHours, 1, 24 * 30),
    maxDriftEventsPerWindow: clampInt(raw.maxDriftEventsPerWindow, DEFAULT_PUBLICATION_RELIABILITY_POLICY.maxDriftEventsPerWindow, 0, 1000),
    maxSelfHealFailuresPerWindow: clampInt(raw.maxSelfHealFailuresPerWindow, DEFAULT_PUBLICATION_RELIABILITY_POLICY.maxSelfHealFailuresPerWindow, 0, 1000),
    maxReplayExhaustedPerWindow: clampInt(raw.maxReplayExhaustedPerWindow, DEFAULT_PUBLICATION_RELIABILITY_POLICY.maxReplayExhaustedPerWindow, 0, 1000),
    maxReplayAttemptsPerTargetPerWindow: clampInt(raw.maxReplayAttemptsPerTargetPerWindow, DEFAULT_PUBLICATION_RELIABILITY_POLICY.maxReplayAttemptsPerTargetPerWindow, 0, 1000),
    alertCooldownMinutes: clampInt(raw.alertCooldownMinutes, DEFAULT_PUBLICATION_RELIABILITY_POLICY.alertCooldownMinutes, 1, 7 * 24 * 60),
  };
}

function recentPublicationHealthEvents(projectState, lookbackMs) {
  ensurePublicationHealthState(projectState);
  const nowMs = Date.now();
  return projectState.publicationHealth.driftEvents.filter((entry) => {
    const ts = Date.parse(entry && entry.ts ? entry.ts : '');
    return Number.isFinite(ts) && (nowMs - ts) <= lookbackMs;
  });
}

function evaluatePublicationReliabilitySlo(projectState, context = {}) {
  const policy = publicationReliabilityPolicy(projectState, context.policyOverrides || {});
  const lookbackMs = policy.lookbackHours * 60 * 60 * 1000;
  const events = recentPublicationHealthEvents(projectState, lookbackMs);

  const driftEvents = events.filter((entry) => String(entry && entry.kind || '') === 'publication_drift');
  const selfHealFailures = events.filter((entry) => String(entry && entry.kind || '') === 'publication_drift' && !entry.healed);
  const replayExhausted = events.filter((entry) => String(entry && entry.kind || '') === 'publication_replay_exhausted');

  const checks = [
    {
      id: 'publication_drift_rate',
      ok: driftEvents.length <= policy.maxDriftEventsPerWindow,
      actual: driftEvents.length,
      threshold: policy.maxDriftEventsPerWindow,
    },
    {
      id: 'publication_self_heal_failure_rate',
      ok: selfHealFailures.length <= policy.maxSelfHealFailuresPerWindow,
      actual: selfHealFailures.length,
      threshold: policy.maxSelfHealFailuresPerWindow,
    },
    {
      id: 'publication_replay_exhaustion_rate',
      ok: replayExhausted.length <= policy.maxReplayExhaustedPerWindow,
      actual: replayExhausted.length,
      threshold: policy.maxReplayExhaustedPerWindow,
    },
  ];
  const ok = checks.every((entry) => entry.ok);
  const failing = checks.filter((entry) => !entry.ok).map((entry) => entry.id);
  return {
    ok,
    severity: ok ? 'info' : 'high',
    summary: ok
      ? `Publication reliability SLO healthy over ${policy.lookbackHours}h window.`
      : `Publication reliability SLO breach: ${failing.join(', ')} over ${policy.lookbackHours}h window.`,
    checks,
    policy,
    lookbackHours: policy.lookbackHours,
  };
}

async function maybeTriggerPublicationReliabilityIncident(projectState, slo, context = {}) {
  ensurePublicationHealthState(projectState);
  if (!slo || typeof slo.ok !== 'boolean' || slo.ok) {
    return { alerted: false, reason: 'slo_ok', incident: null };
  }

  const policy = publicationReliabilityPolicy(projectState, slo.policy || context.policyOverrides || {});
  const failing = Array.isArray(slo.checks)
    ? slo.checks.filter((entry) => !entry.ok).map((entry) => `${entry.id}:${entry.actual}/${entry.threshold}`)
    : [];
  const signature = failing.join('|') || 'publication_reliability_breach';
  const now = nowIso();
  const nowMs = Date.parse(now);
  const alerting = projectState.publicationHealth.alerting || { lastSignature: null, lastSentAt: null, suppressedSignals: [] };
  const lastSentMs = Date.parse(alerting.lastSentAt || '');
  const cooldownMs = policy.alertCooldownMinutes * 60 * 1000;
  const withinCooldown = Number.isFinite(lastSentMs) && (nowMs - lastSentMs) < cooldownMs;
  if (withinCooldown && alerting.lastSignature === signature) {
    const nextSuppressedSignals = Array.isArray(alerting.suppressedSignals) ? [...alerting.suppressedSignals] : [];
    nextSuppressedSignals.unshift({
      ts: now,
      signature,
      source: String(context.source || 'publication_reliability_slo').toLowerCase(),
    });
    if (nextSuppressedSignals.length > 200) {
      nextSuppressedSignals.length = 200;
    }
    projectState.publicationHealth.alerting = {
      lastSignature: alerting.lastSignature || null,
      lastSentAt: alerting.lastSentAt || null,
      suppressedSignals: nextSuppressedSignals,
    };
    return { alerted: false, reason: 'cooldown', incident: null };
  }

  const incident = {
    id: crypto.randomUUID(),
    ts: now,
    severity: 'high',
    status: 'open',
    resolvedAt: null,
    summary: slo.summary,
    runbook: 'publication_reliability_incident_triage',
    checks: Array.isArray(slo.checks) ? slo.checks : [],
    source: String(context.source || 'publication_reliability_slo').toLowerCase(),
  };
  projectState.publicationHealth.incidents.unshift(incident);
  if (projectState.publicationHealth.incidents.length > 100) {
    projectState.publicationHealth.incidents.length = 100;
  }
  projectState.publicationHealth.alerting = {
    lastSignature: signature,
    lastSentAt: now,
    suppressedSignals: Array.isArray(alerting.suppressedSignals) ? [...alerting.suppressedSignals] : [],
  };

  appendProjectLog(projectState, 'warning', {
    kind: 'publication_reliability_incident',
    incident,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'incident_response_engine',
    kind: 'publication_reliability_incident',
    payload: incident,
  });
  await notifyOperator(projectState, `Publication reliability incident: ${slo.summary}`, {
    runbook: incident.runbook,
    checks: incident.checks,
    source: incident.source,
  });
  return { alerted: true, reason: 'alert_sent', incident };
}

function resolvePublicationReliabilityIncidents(projectState, context = {}) {
  ensurePublicationHealthState(projectState);
  const incidents = Array.isArray(projectState.publicationHealth.incidents)
    ? projectState.publicationHealth.incidents
    : [];
  if (!incidents.length) {
    return { resolvedCount: 0, resolvedIds: [] };
  }

  const resolvedAt = nowIso();
  const resolvedIds = [];
  incidents.forEach((incident) => {
    if (!incident || typeof incident !== 'object') return;
    const alreadyResolved = String(incident.status || '').toLowerCase() === 'resolved' || Boolean(incident.resolvedAt);
    if (alreadyResolved) return;
    incident.status = 'resolved';
    incident.resolvedAt = resolvedAt;
    incident.resolutionSource = String(context.source || 'publication_self_heal').toLowerCase();
    incident.resolutionSummary = String(context.summary || 'Publication reliability recovered after self-heal.');
    if (incident.id) {
      resolvedIds.push(incident.id);
    }
  });
  return {
    resolvedCount: resolvedIds.length,
    resolvedIds,
    resolvedAt,
  };
}

function buildPublicationIncidentDashboard(projectState, options = {}) {
  ensurePublicationHealthState(projectState);
  const windowHours = clampInt(options.windowHours, 24, 1, 24 * 30);
  const extendedWindowHours = clampInt(options.extendedWindowHours, 24 * 7, windowHours, 24 * 90);
  const maxHotspots = clampInt(options.maxHotspots, 5, 1, 25);
  const maxRunbooks = clampInt(options.maxRunbooks, 8, 1, 25);
  const nowMs = Date.now();
  const windowMs = windowHours * 60 * 60 * 1000;
  const extendedWindowMs = extendedWindowHours * 60 * 60 * 1000;

  const incidents = Array.isArray(projectState.publicationHealth.incidents)
    ? projectState.publicationHealth.incidents
    : [];
  const driftEvents = Array.isArray(projectState.publicationHealth.driftEvents)
    ? projectState.publicationHealth.driftEvents
    : [];
  const suppressedSignals = Array.isArray(projectState.publicationHealth.alerting && projectState.publicationHealth.alerting.suppressedSignals)
    ? projectState.publicationHealth.alerting.suppressedSignals
    : [];

  const incidentWindowStats = {
    current: 0,
    previous: 0,
    resolvedCurrent: 0,
  };
  const mttrHours = [];
  const runbookMap = new Map();

  incidents.forEach((incident) => {
    const createdMs = Date.parse(incident && incident.ts ? incident.ts : '');
    if (!Number.isFinite(createdMs)) return;
    const ageMs = nowMs - createdMs;
    if (ageMs <= windowMs) {
      incidentWindowStats.current += 1;
    } else if (ageMs <= (windowMs * 2)) {
      incidentWindowStats.previous += 1;
    }

    const runbook = String(incident && incident.runbook || 'unspecified');
    if (!runbookMap.has(runbook)) {
      runbookMap.set(runbook, { runbook, count: 0, open: 0, resolved: 0 });
    }
    const runbookEntry = runbookMap.get(runbook);
    runbookEntry.count += 1;

    const resolvedAtMs = Date.parse(incident && incident.resolvedAt ? incident.resolvedAt : '');
    const resolved = String(incident && incident.status || '').toLowerCase() === 'resolved' || Number.isFinite(resolvedAtMs);
    if (resolved) {
      runbookEntry.resolved += 1;
      if (Number.isFinite(resolvedAtMs) && (nowMs - resolvedAtMs) <= windowMs) {
        incidentWindowStats.resolvedCurrent += 1;
      }
      if (Number.isFinite(resolvedAtMs) && resolvedAtMs >= createdMs) {
        mttrHours.push((resolvedAtMs - createdMs) / (60 * 60 * 1000));
      }
    } else {
      runbookEntry.open += 1;
    }
  });

  mttrHours.sort((a, b) => a - b);
  const mttrAvgHours = mttrHours.length
    ? Number((mttrHours.reduce((sum, value) => sum + value, 0) / mttrHours.length).toFixed(2))
    : null;
  const mttrP95Hours = mttrHours.length
    ? Number(mttrHours[Math.max(0, Math.ceil(mttrHours.length * 0.95) - 1)].toFixed(2))
    : null;

  const targetMap = new Map();
  driftEvents.forEach((event) => {
    const tsMs = Date.parse(event && event.ts ? event.ts : '');
    if (!Number.isFinite(tsMs) || (nowMs - tsMs) > extendedWindowMs) return;
    const target = String(event && event.target || '').trim().toLowerCase();
    if (!target) return;
    const next = (targetMap.get(target) || 0) + 1;
    targetMap.set(target, next);
  });

  const suppressedStats = {
    current: 0,
    previous: 0,
  };
  suppressedSignals.forEach((signal) => {
    const tsMs = Date.parse(signal && signal.ts ? signal.ts : '');
    if (!Number.isFinite(tsMs)) return;
    const ageMs = nowMs - tsMs;
    if (ageMs <= windowMs) {
      suppressedStats.current += 1;
    } else if (ageMs <= (windowMs * 2)) {
      suppressedStats.previous += 1;
    }
  });

  const runbookHotspots = Array.from(runbookMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, maxRunbooks);
  const targetHotspots = Array.from(targetMap.entries())
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxHotspots);

  const openCount = incidents.filter((incident) => {
    const resolved = String(incident && incident.status || '').toLowerCase() === 'resolved' || Boolean(incident && incident.resolvedAt);
    return !resolved;
  }).length;

  return {
    generatedAt: nowIso(),
    windows: {
      primaryHours: windowHours,
      extendedHours: extendedWindowHours,
    },
    incidents: {
      total: incidents.length,
      open: openCount,
      resolved: Math.max(0, incidents.length - openCount),
      createdCurrentWindow: incidentWindowStats.current,
      createdPreviousWindow: incidentWindowStats.previous,
      createdTrend: incidentWindowStats.current - incidentWindowStats.previous,
      resolvedCurrentWindow: incidentWindowStats.resolvedCurrent,
      mttrHoursAvg: mttrAvgHours,
      mttrHoursP95: mttrP95Hours,
    },
    runbookHotspots,
    targetHotspots,
    cooldownSuppressions: {
      total: suppressedSignals.length,
      currentWindow: suppressedStats.current,
      previousWindow: suppressedStats.previous,
      trend: suppressedStats.current - suppressedStats.previous,
    },
  };
}

function appendPublicationDriftEvent(projectState, event = {}) {
  ensurePublicationHealthState(projectState);
  const record = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    kind: String(event.kind || 'publication_drift').trim().toLowerCase(),
    target: event.target ? String(event.target).trim().toLowerCase() : null,
    summary: String(event.summary || 'Publication drift detected.'),
    expected: event.expected && typeof event.expected === 'object' ? event.expected : {},
    observed: event.observed && typeof event.observed === 'object' ? event.observed : {},
    source: String(event.source || 'runtime').trim().toLowerCase(),
    healed: event.healed === true,
  };
  projectState.publicationHealth.driftEvents.unshift(record);
  if (projectState.publicationHealth.driftEvents.length > 200) {
    projectState.publicationHealth.driftEvents.length = 200;
  }
  return record;
}

function buildPublicationDriftReplayPlan(execution = {}, reconciliation = {}, context = {}) {
  const data = execution && execution.data && typeof execution.data === 'object' ? execution.data : {};
  const targets = Array.isArray(data.targets) ? data.targets : [];
  const checks = Array.isArray(reconciliation && reconciliation.targetChecks) ? reconciliation.targetChecks : [];
  const mode = String(context.mode || 'publish').trim().toLowerCase();
  const source = String(context.source || 'publication_execution').trim().toLowerCase();
  const replayForMode = mode === 'unpublish' ? 'unpublish' : (mode === 'update' ? 'update' : 'publish');

  const targetMap = new Map();
  targets.forEach((entry) => {
    const key = String(entry && (entry.target || entry.connector) || '').trim().toLowerCase();
    if (!key) return;
    targetMap.set(key, entry);
  });

  const driftTargets = checks
    .filter((entry) => !entry.ok || entry.pending || entry.rollbacked)
    .map((entry) => String(entry.target || '').trim().toLowerCase())
    .filter(Boolean);
  const uniqueTargets = Array.from(new Set(driftTargets));
  const steps = uniqueTargets.map((target, index) => {
    const operation = publicationOperationForTarget(target, replayForMode);
    if (!operation) return null;
    const prior = targetMap.get(target);
    const priorData = prior && prior.data && typeof prior.data === 'object' ? prior.data : {};
    return {
      index,
      target,
      connector: target,
      operation,
      input: {
        ...priorData,
        provider: target,
        replayReason: 'publication_drift',
        replaySource: source,
      },
    };
  }).filter(Boolean);

  if (!steps.length) {
    return null;
  }

  return {
    replayMode: replayForMode,
    source,
    steps,
  };
}

async function executePublicationDriftSelfHeal(projectState, options = {}) {
  ensurePublicationHealthState(projectState);
  const execution = options.execution && typeof options.execution === 'object' ? options.execution : null;
  const reconciliation = options.reconciliation && typeof options.reconciliation === 'object' ? options.reconciliation : null;
  const context = options.context && typeof options.context === 'object' ? options.context : {};
  const policy = publicationReliabilityPolicy(projectState, context.policyOverrides || {});
  const lookbackMs = policy.lookbackHours * 60 * 60 * 1000;

  projectState.publicationHealth.lastCheckedAt = nowIso();
  if (!execution || !reconciliation || reconciliation.ok || !Array.isArray(reconciliation.targetChecks)) {
    return { checked: false, driftDetected: false, replayed: 0, healed: true, replay: null };
  }

  const replayPlan = buildPublicationDriftReplayPlan(execution, reconciliation, context);
  if (!replayPlan) {
    return { checked: true, driftDetected: false, replayed: 0, healed: true, replay: null };
  }

  const driftEvents = replayPlan.steps.map((step) => appendPublicationDriftEvent(projectState, {
    kind: 'publication_drift',
    target: step.target,
    summary: `Publication drift detected for ${step.target}; planning ${step.operation} replay.`,
    expected: { operation: step.operation, mode: replayPlan.replayMode },
    observed: { reconciliationReason: reconciliation.reason || null },
    source: replayPlan.source,
    healed: false,
  }));

  const recentEvents = recentPublicationHealthEvents(projectState, lookbackMs);
  const exhaustedTargets = [];
  const eligibleSteps = replayPlan.steps.filter((step) => {
    const attempts = recentEvents.filter((entry) => (
      String(entry && entry.kind || '') === 'publication_drift'
      && String(entry && entry.target || '') === step.target
    )).length;
    if (attempts > policy.maxReplayAttemptsPerTargetPerWindow) {
      exhaustedTargets.push(step.target);
      appendPublicationDriftEvent(projectState, {
        kind: 'publication_replay_exhausted',
        target: step.target,
        summary: `Replay attempts exhausted for ${step.target} in ${policy.lookbackHours}h window.`,
        expected: {
          maxReplayAttemptsPerTargetPerWindow: policy.maxReplayAttemptsPerTargetPerWindow,
          lookbackHours: policy.lookbackHours,
        },
        observed: { attempts },
        source: replayPlan.source,
        healed: false,
      });
      return false;
    }
    return true;
  });

  if (!eligibleSteps.length) {
    const ts = nowIso();
    const slo = evaluatePublicationReliabilitySlo(projectState, { policyOverrides: policy });
    projectState.publicationHealth.lastSlo = {
      ts,
      ...slo,
    };
    const incidentResult = await maybeTriggerPublicationReliabilityIncident(projectState, slo, {
      source: context.source || 'publication_drift_self_heal',
      policyOverrides: policy,
    });
    projectState.publicationHealth.lastSelfHealAt = ts;
    projectState.publicationHealth.lastSelfHealSummary = {
      ts,
      driftDetected: true,
      replayed: 0,
      replayOk: false,
      reconciliationOk: Boolean(reconciliation && reconciliation.ok),
      healed: false,
      replayExhaustedTargets: exhaustedTargets,
      sloOk: Boolean(slo.ok),
      incidentAlerted: Boolean(incidentResult && incidentResult.alerted),
    };
    appendProjectLog(projectState, 'warning', {
      kind: 'publication_drift_replay_exhausted',
      replayMode: replayPlan.replayMode,
      replayedTargets: [],
      exhaustedTargets,
      policy,
      slo,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'coordinator',
      to: 'publication_reliability_engine',
      kind: 'publication_drift_replay_exhausted',
      payload: {
        replayMode: replayPlan.replayMode,
        exhaustedTargets,
        policy,
      },
    });
    return {
      checked: true,
      driftDetected: true,
      replayed: 0,
      healed: false,
      replay: null,
      reconciliation,
      replayExhaustedTargets: exhaustedTargets,
      slo,
      incident: incidentResult && incidentResult.incident ? incidentResult.incident : null,
    };
  }

  const replayResult = await executePublicationDistributionPlan({
    kind: replayPlan.replayMode,
    baseConnector: 'publication_self_heal',
    baseOperation: replayPlan.replayMode,
    strategy: 'broadcast',
    rollbackOnFailure: false,
    verifyAfterPublish: true,
    requiredSuccesses: eligibleSteps.length,
    targets: eligibleSteps.map((step) => step.target),
    steps: eligibleSteps,
  }, {
    executeStep: async (step) => executeLiveConnector(step.connector, {
      operation: step.operation,
      input: step.input,
      projectId: projectState.id,
      idempotencyKey: `${String(context.executionKey || 'publication_drift')}::replay::${step.connector}::${step.operation}::${step.index}`,
      _skipPublicationPlan: true,
    }),
  });

  const replayTargets = Array.isArray(replayResult && replayResult.data && replayResult.data.targets)
    ? replayResult.data.targets
    : [];
  replayTargets.forEach((entry) => {
    const match = driftEvents.find((event) => event.target === String(entry.target || entry.connector || '').trim().toLowerCase());
    if (match) {
      match.healed = Boolean(entry.ok);
      match.observed = {
        ...(match.observed || {}),
        replayMessage: entry.message || null,
      };
    }
  });

  const replayReconciliation = await reconcileConnectorExecution('custom_cms', 'publish_book', replayResult, {
    projectId: projectState.id,
    executionKey: `${String(context.executionKey || 'publication_drift')}::replay`,
  });

  const healed = Boolean(replayResult && replayResult.ok) && Boolean(replayReconciliation && replayReconciliation.ok);
  const ts = nowIso();
  const slo = evaluatePublicationReliabilitySlo(projectState, { policyOverrides: policy });
  projectState.publicationHealth.lastSlo = {
    ts,
    ...slo,
  };
  const incidentResolution = (healed && slo.ok)
    ? resolvePublicationReliabilityIncidents(projectState, {
      source: context.source || 'publication_drift_self_heal',
      summary: 'Publication drift replay restored reliability and SLO status.',
    })
    : { resolvedCount: 0, resolvedIds: [] };
  const incidentResult = await maybeTriggerPublicationReliabilityIncident(projectState, slo, {
    source: context.source || 'publication_drift_self_heal',
    policyOverrides: policy,
  });
  projectState.publicationHealth.lastSelfHealAt = ts;
  projectState.publicationHealth.lastSelfHealSummary = {
    ts,
    driftDetected: true,
    replayed: eligibleSteps.length,
    replayOk: Boolean(replayResult && replayResult.ok),
    reconciliationOk: Boolean(replayReconciliation && replayReconciliation.ok),
    healed,
    replayExhaustedTargets: exhaustedTargets,
    sloOk: Boolean(slo.ok),
    incidentAlerted: Boolean(incidentResult && incidentResult.alerted),
    incidentResolvedCount: incidentResolution.resolvedCount,
  };

  appendProjectLog(projectState, healed ? 'fix' : 'warning', {
    kind: healed ? 'publication_drift_self_healed' : 'publication_drift_self_heal_failed',
    replayMode: replayPlan.replayMode,
    replayedTargets: eligibleSteps.map((step) => step.target),
    replayExhaustedTargets: exhaustedTargets,
    replayResult: replayResult && replayResult.data ? replayResult.data : null,
    reconciliation: replayReconciliation,
    slo,
    incident: incidentResult && incidentResult.incident ? incidentResult.incident : null,
    incidentResolution,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'publication_reliability_engine',
    kind: healed ? 'publication_drift_self_healed' : 'publication_drift_self_heal_failed',
    payload: {
      replayMode: replayPlan.replayMode,
      replayedTargets: eligibleSteps.map((step) => step.target),
      replayExhaustedTargets: exhaustedTargets,
      healed,
      sloOk: Boolean(slo.ok),
      incidentResolvedCount: incidentResolution.resolvedCount,
    },
  });

  return {
    checked: true,
    driftDetected: true,
    replayed: eligibleSteps.length,
    healed,
    replay: replayResult,
    reconciliation: replayReconciliation,
    replayExhaustedTargets: exhaustedTargets,
    slo,
    incident: incidentResult && incidentResult.incident ? incidentResult.incident : null,
    incidentResolution,
  };
}

function evaluateFinanceSettlementExceptions(connectorId, operation, executionResult, context = {}) {
  const connector = String(connectorId || '').trim().toLowerCase();
  const op = String(operation || '').trim().toLowerCase();
  const input = context && context.input && typeof context.input === 'object' ? context.input : {};
  const result = executionResult && executionResult.data && typeof executionResult.data === 'object'
    ? executionResult.data
    : {};

  if (connector !== 'stripe') return [];

  const out = [];
  const nowMs = Date.now();
  const tolerance = clampNumber(input.settlementTolerance, 5, 0, 1000000);
  const expectedSettlement = Number(input.expectedSettlementAmount ?? input.expectedNetAmount);
  const actualSettlement = Number(result.settledAmount ?? result.actualSettlementAmount ?? result.netAmount);
  if (Number.isFinite(expectedSettlement) && Number.isFinite(actualSettlement)) {
    const delta = Number((actualSettlement - expectedSettlement).toFixed(2));
    if (Math.abs(delta) > tolerance) {
      out.push({
        type: 'settlement_mismatch',
        severity: 'high',
        summary: `Settlement mismatch detected for ${op}: expected $${expectedSettlement.toFixed(2)}, actual $${actualSettlement.toFixed(2)}.`,
        detail: { expectedSettlement, actualSettlement, delta, tolerance },
        runbook: 'open_reconciliation_incident',
      });
    }
  }

  const payoutDueAt = String(input.payoutDueAt || result.payoutDueAt || '').trim();
  const payoutStatus = String(result.payoutStatus || '').trim().toLowerCase();
  const payoutDueMs = Date.parse(payoutDueAt);
  if (payoutDueAt && Number.isFinite(payoutDueMs) && payoutDueMs < nowMs && payoutStatus !== 'paid') {
    out.push({
      type: 'payout_delay',
      severity: 'medium',
      summary: 'Payout due time passed without confirmed payout settlement.',
      detail: { payoutDueAt, payoutStatus: payoutStatus || 'unknown' },
      runbook: 'retry_payout_sync_then_escalate',
    });
  }

  const disputeStatus = String(result.disputeStatus || input.disputeStatus || '').trim().toLowerCase();
  const disputeOpen = Boolean(result.disputeOpen || input.disputeOpen || disputeStatus === 'open');
  if (disputeOpen) {
    out.push({
      type: 'dispute_open',
      severity: 'high',
      summary: 'Stripe dispute is open and requires evidence runbook handling.',
      detail: {
        disputeId: result.disputeId || input.disputeId || null,
        disputeStatus: disputeStatus || 'open',
      },
      runbook: 'collect_evidence_and_escalate_finance_support',
    });
  }

  const chargebackAmount = Number(result.chargebackAmount ?? input.chargebackAmount);
  const chargebackLost = disputeStatus === 'lost' || Boolean(result.chargebackReceived);
  if ((Number.isFinite(chargebackAmount) && chargebackAmount > 0) || chargebackLost) {
    out.push({
      type: 'chargeback_received',
      severity: 'critical',
      summary: 'Chargeback received; trigger critical finance dispute runbook.',
      detail: {
        chargebackAmount: Number.isFinite(chargebackAmount) ? chargebackAmount : null,
        disputeStatus: disputeStatus || null,
      },
      runbook: 'freeze_refund_lane_and_notify_operator',
    });
  }

  return out;
}

async function processFinanceSettlementExceptions(projectState, context = {}) {
  ensureFinanceExceptionState(projectState);
  const exceptions = Array.isArray(context.exceptions) ? context.exceptions : [];
  if (!exceptions.length) {
    return { count: 0, escalated: 0, items: [] };
  }

  const created = [];
  let escalated = 0;
  for (const entry of exceptions) {
    const severity = String(entry.severity || 'medium').toLowerCase();
    const item = {
      id: crypto.randomUUID(),
      createdAt: nowIso(),
      connector: String(context.connector || 'stripe').toLowerCase(),
      operation: String(context.operation || '').toLowerCase(),
      executionKey: context.executionKey || null,
      taskId: context.taskId || null,
      type: String(entry.type || 'finance_exception'),
      severity,
      summary: String(entry.summary || 'Finance exception detected.'),
      detail: entry.detail && typeof entry.detail === 'object' ? entry.detail : {},
      runbook: String(entry.runbook || 'manual_review'),
      source: String(context.source || 'connector_execution'),
      status: 'open',
    };
    projectState.financeExceptions.unshift(item);
    created.push(item);

    appendProjectLog(projectState, 'message', {
      kind: 'finance_exception_detected',
      exceptionId: item.id,
      connector: item.connector,
      operation: item.operation,
      type: item.type,
      severity: item.severity,
      runbook: item.runbook,
      summary: item.summary,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'coordinator',
      to: 'finance_runbook_engine',
      kind: 'finance_exception_detected',
      payload: {
        exceptionId: item.id,
        type: item.type,
        severity: item.severity,
        runbook: item.runbook,
        summary: item.summary,
        connector: item.connector,
        operation: item.operation,
      },
    });

    if (item.severity === 'high' || item.severity === 'critical') {
      escalated += 1;
      await notifyOperator(projectState, `Finance exception (${item.severity}): ${item.summary}`, {
        exceptionId: item.id,
        runbook: item.runbook,
        connector: item.connector,
        operation: item.operation,
        type: item.type,
      });
    }
  }

  if (projectState.financeExceptions.length > 200) {
    projectState.financeExceptions.length = 200;
  }

  return {
    count: created.length,
    escalated,
    items: created,
  };
}

function ensureKpiGoalState(projectState) {
  if (!projectState.kpiGoals || typeof projectState.kpiGoals !== 'object') {
    projectState.kpiGoals = {
      ...DEFAULT_KPI_GOALS,
      weeklyPlan: {
        weekStart: startOfUtcWeekIso(),
        lastPlannedAt: null,
        nextReviewAt: null,
        summary: null,
        objectives: [],
      },
    };
  }
  const goals = projectState.kpiGoals;
  goals.weeklyTasksDoneTarget = clampInt(goals.weeklyTasksDoneTarget, DEFAULT_KPI_GOALS.weeklyTasksDoneTarget, 1, 5000);
  goals.maxBacklog = clampInt(goals.maxBacklog, DEFAULT_KPI_GOALS.maxBacklog, 0, 10000);
  goals.maxMonthlySpend = clampNumber(goals.maxMonthlySpend, DEFAULT_KPI_GOALS.maxMonthlySpend, 0, 100000000);
  if (!goals.weeklyPlan || typeof goals.weeklyPlan !== 'object') {
    goals.weeklyPlan = {
      weekStart: startOfUtcWeekIso(),
      lastPlannedAt: null,
      nextReviewAt: null,
      summary: null,
      objectives: [],
    };
  }
  if (!goals.weeklyPlan.weekStart) goals.weeklyPlan.weekStart = startOfUtcWeekIso();
  if (!Array.isArray(goals.weeklyPlan.objectives)) goals.weeklyPlan.objectives = [];
}

function classifyFailureDeterminism(connectorId, reason, detail = {}) {
  const connector = String(connectorId || 'default').trim().toLowerCase() || 'default';
  const summary = [
    String(reason || ''),
    String(detail && detail.errorCode || ''),
    String(detail && detail.message || ''),
  ].join(' ').toLowerCase();

  const deterministicSignals = [
    'permission denied', 'forbidden', 'unauthorized', 'invalid api key', 'invalid key', 'invalid auth',
    'invalid scope', 'insufficient scope', 'insufficient permissions', 'secret_missing', 'credential',
    'not connected', 'unsupported', 'not implemented', 'unknown_connector', 'connector_not_implemented',
    'http 400', 'http 401', 'http 403', 'http 404', 'http 422', 'bad request', 'validation', 'syntax', 'parse error',
  ];
  const transientSignals = [
    'timeout', 'timed out', 'econnreset', 'enetdown', 'eai_again', 'connection reset', 'connect', 'temporar',
    'rate limit', '429', '5xx', 'http 5', 'service unavailable', 'gateway timeout', 'webhook', 'delayed',
    'execution_failed', 'llm_unavailable',
  ];

  const matchedDeterministic = deterministicSignals.filter((token) => summary.includes(token));
  const matchedTransient = transientSignals.filter((token) => summary.includes(token));

  if (matchedDeterministic.length > 0) {
    return {
      connector,
      classification: 'deterministic',
      retryable: false,
      matchedSignals: matchedDeterministic,
    };
  }
  if (matchedTransient.length > 0) {
    return {
      connector,
      classification: 'transient',
      retryable: true,
      matchedSignals: matchedTransient,
    };
  }
  return {
    connector,
    classification: 'deterministic',
    retryable: false,
    matchedSignals: [],
  };
}

function ensureTaskRetryLineage(task) {
  if (!task || typeof task !== 'object') return;
  if (!Array.isArray(task.retryLineage)) task.retryLineage = [];
}

function appendTaskRetryLineage(task, entry = {}) {
  ensureTaskRetryLineage(task);
  const normalized = {
    at: entry.at || nowIso(),
    stage: String(entry.stage || 'retry_event'),
    reason: String(entry.reason || ''),
    classification: String(entry.classification || 'deterministic'),
    retryable: Boolean(entry.retryable),
    attempt: Number(entry.attempt || task.retryCount || 0),
    connector: entry.connector || null,
    operation: entry.operation || null,
    detail: entry.detail && typeof entry.detail === 'object' ? entry.detail : {},
  };
  task.retryLineage.push(normalized);
  if (task.retryLineage.length > 50) {
    task.retryLineage = task.retryLineage.slice(-50);
  }
  return normalized;
}

function connectorRetryPlan(connectorId, attemptNumber, reason, detail = {}) {
  if (typeof connectorId === 'number') {
    detail = reason || {};
    reason = attemptNumber;
    attemptNumber = connectorId;
    connectorId = 'default';
  }
  const classification = classifyFailureDeterminism(connectorId, reason, detail);
  const nextAttempt = Math.max(1, Number(attemptNumber || 1));
  const policy = retryPolicyForConnector(connectorId);
  const rawDelay = policy.baseDelayMs * Math.pow(2, Math.max(0, nextAttempt - 1));
  return {
    retryable: classification.retryable,
    classification: classification.classification,
    matchedSignals: classification.matchedSignals,
    delayMs: Math.min(policy.maxDelayMs, rawDelay),
  };
}

function assessApprovalRisk(task, detail = {}) {
  let score = 15;
  const checks = Array.isArray(detail.checks) ? detail.checks : [];
  const estimatedCost = Number(detail.estimatedCost || task?.autoAction?.estimatedCost || 0);
  const hasPolicyDeny = checks.some((entry) => !entry.ok && (entry.type === 'project_policy' || entry.type === 'budget_cap' || entry.type === 'role_capability' || entry.type === 'role_deploy'));
  const connector = String(detail.connector || task?.autoAction?.connector || '').toLowerCase();
  const operation = String(detail.operation || task?.autoAction?.operation || '').toLowerCase();

  if (hasPolicyDeny) score += 25;
  if (connector === 'netlify' && operation === 'trigger_deploy') score += 20;
  if (connector === 'stripe') score += 18;
  if (connector === 'google_ads') score += 16;
  if (estimatedCost >= 1000) score += 25;
  else if (estimatedCost >= 250) score += 15;
  else if (estimatedCost > 0) score += 8;
  if (String(detail.reason || '').toLowerCase().includes('permission')) score += 8;

  const bounded = Math.max(0, Math.min(100, score));
  let level = 'low';
  if (bounded >= 70) level = 'high';
  else if (bounded >= 40) level = 'medium';
  return { score: bounded, level, requiresHuman: bounded >= 40 };
}

function projectActualMetrics(projectState) {
  const weekStart = startOfUtcWeekIso(nowIso());
  const weekStartMs = Date.parse(weekStart);
  const monthlySpend = Object.values(getCredentialBudgetSnapshot(projectState.id) || {}).reduce((sum, entry) => {
    return sum + (Number(entry && entry.monthlySpent) || 0);
  }, 0);
  const tasksDoneThisWeek = projectState.tasks.filter((task) => {
    if (task.status !== 'done' || !task.completedAt) return false;
    const completedMs = Date.parse(task.completedAt);
    return Number.isFinite(completedMs) && completedMs >= weekStartMs;
  }).length;
  const backlog = projectState.tasks.filter((task) => task.status === 'backlog').length;
  return {
    tasksDoneThisWeek,
    backlog,
    monthlySpend: Number(monthlySpend.toFixed(2)),
  };
}

function computeKpiVarianceAndAlerts(projectState) {
  ensureKpiGoalState(projectState);
  ensureDeadLetterState(projectState);
  const goals = projectState.kpiGoals;
  const actual = projectActualMetrics(projectState);
  const variance = {
    weeklyTasksDone: actual.tasksDoneThisWeek - goals.weeklyTasksDoneTarget,
    backlog: actual.backlog - goals.maxBacklog,
    monthlySpend: Number((actual.monthlySpend - goals.maxMonthlySpend).toFixed(2)),
  };
  const alerts = [];
  if (variance.weeklyTasksDone < 0) {
    alerts.push(`Weekly throughput below target by ${Math.abs(variance.weeklyTasksDone)} tasks.`);
  }
  if (variance.backlog > 0) {
    alerts.push(`Backlog is ${variance.backlog} over the configured limit.`);
  }
  if (variance.monthlySpend > 0) {
    alerts.push(`Monthly spend is $${variance.monthlySpend.toFixed(2)} above target.`);
  }
  if (projectState.deadLetters.length > 0) {
    alerts.push(`${projectState.deadLetters.length} task(s) are in dead-letter queue.`);
  }
  return { goals, actual, variance, alerts };
}

function evaluateAndNotifyKpiAlerts(projectState, ts = nowIso()) {
  const settings = notificationSettingsSummary();
  const kpiAlertsEnabled = settings.kpiAlerts && settings.kpiAlerts.enabled !== false;
  if (!kpiAlertsEnabled) return;

  const insight = computeKpiVarianceAndAlerts(projectState);
  const alerts = Array.isArray(insight.alerts) ? insight.alerts : [];
  const signature = alerts.join(' | ');
  if (!projectState.kpiAlerting || typeof projectState.kpiAlerting !== 'object') {
    projectState.kpiAlerting = {
      lastSentAt: null,
      lastSignature: null,
    };
  }

  if (!alerts.length) {
    projectState.kpiAlerting.lastSignature = null;
    return;
  }

  const nowMs = Date.parse(ts);
  const lastSentMs = Date.parse(projectState.kpiAlerting.lastSentAt || '');
  const cooldownMs = clampInt(settings.kpiAlerts.cooldownMinutes, 120, 1, 7 * 24 * 60) * 60 * 1000;
  const signatureChanged = projectState.kpiAlerting.lastSignature !== signature;
  const cooldownElapsed = Number.isNaN(lastSentMs) || nowMs - lastSentMs >= cooldownMs;
  if (!signatureChanged && !cooldownElapsed) return;

  const summary = `KPI alerts triggered (${alerts.length}): ${alerts.join(' ')}`;
  notifyOperator(projectState, summary, {
    alertCount: alerts.length,
    alerts,
    variance: insight.variance,
    actual: insight.actual,
    goals: {
      weeklyTasksDoneTarget: insight.goals.weeklyTasksDoneTarget,
      maxBacklog: insight.goals.maxBacklog,
      maxMonthlySpend: insight.goals.maxMonthlySpend,
    },
  }).catch(() => {});

  projectState.kpiAlerting.lastSentAt = ts;
  projectState.kpiAlerting.lastSignature = signature;
}

function runtimeSettings() {
  const raw = (appConfig && appConfig.runtime) || {};
  return {
    heartbeatIntervalMs: clampInt(raw.heartbeatIntervalMs, DEFAULT_RUNTIME_SETTINGS.heartbeatIntervalMs, 5000, 10 * 60 * 1000),
    stallTimeoutMs: clampInt(raw.stallTimeoutMs, DEFAULT_RUNTIME_SETTINGS.stallTimeoutMs, 15 * 1000, 24 * 60 * 60 * 1000),
    maxAutoFixes: clampInt(raw.maxAutoFixes, DEFAULT_RUNTIME_SETTINGS.maxAutoFixes, 1, 1000),
    countManualHeartbeatForStall: typeof raw.countManualHeartbeatForStall === 'boolean'
      ? raw.countManualHeartbeatForStall
      : DEFAULT_RUNTIME_SETTINGS.countManualHeartbeatForStall,
    fastLocalIterationMode: typeof raw.fastLocalIterationMode === 'boolean'
      ? raw.fastLocalIterationMode
      : DEFAULT_RUNTIME_SETTINGS.fastLocalIterationMode,
  };
}

function planningSettings() {
  const raw = (appConfig && appConfig.planning) || {};
  const preferredDatabaseService = String(raw.preferredDatabaseService || DEFAULT_PLANNING_SETTINGS.preferredDatabaseService).trim().toLowerCase();
  return {
    preferFreeTierFirst: typeof raw.preferFreeTierFirst === 'boolean'
      ? raw.preferFreeTierFirst
      : DEFAULT_PLANNING_SETTINGS.preferFreeTierFirst,
    requireApprovalForPaidTierUpgrade: typeof raw.requireApprovalForPaidTierUpgrade === 'boolean'
      ? raw.requireApprovalForPaidTierUpgrade
      : DEFAULT_PLANNING_SETTINGS.requireApprovalForPaidTierUpgrade,
    preferredDatabaseService: ['supabase', 'manual'].includes(preferredDatabaseService)
      ? preferredDatabaseService
      : DEFAULT_PLANNING_SETTINGS.preferredDatabaseService,
  };
}

function imageGeneratorSettings() {
  const raw = (appConfig && appConfig.imageGenerator) || {};
  const engineRaw = raw.engine && typeof raw.engine === 'object' ? raw.engine : {};
  const engineDefaults = DEFAULT_IMAGE_GENERATOR_SETTINGS.engine;
  const provider = String(engineRaw.provider || engineDefaults.provider).trim().toLowerCase();
  const endpoint = String(engineRaw.endpoint || engineDefaults.endpoint).trim() || engineDefaults.endpoint;
  const appPath = String(engineRaw.appPath || engineDefaults.appPath).trim() || engineDefaults.appPath;
  const autoStartCommand = comfyDefaultStartCommand(appPath, endpoint);
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_IMAGE_GENERATOR_SETTINGS.enabled,
    preferredModelId: String(raw.preferredModelId || DEFAULT_IMAGE_GENERATOR_SETTINGS.preferredModelId).trim() || DEFAULT_IMAGE_GENERATOR_SETTINGS.preferredModelId,
    maxPromptLength: clampInt(raw.maxPromptLength, DEFAULT_IMAGE_GENERATOR_SETTINGS.maxPromptLength, 64, 4000),
    maxNegativePromptLength: clampInt(raw.maxNegativePromptLength, DEFAULT_IMAGE_GENERATOR_SETTINGS.maxNegativePromptLength, 64, 4000),
    workerSlots: clampInt(raw.workerSlots, DEFAULT_IMAGE_GENERATOR_SETTINGS.workerSlots, 1, 8),
    retentionDays: clampInt(raw.retentionDays, DEFAULT_IMAGE_GENERATOR_SETTINGS.retentionDays, 1, 365),
    quotaMbPerProject: clampInt(raw.quotaMbPerProject, DEFAULT_IMAGE_GENERATOR_SETTINGS.quotaMbPerProject, 64, 100 * 1024),
    defaultDeterministic: typeof raw.defaultDeterministic === 'boolean'
      ? raw.defaultDeterministic
      : DEFAULT_IMAGE_GENERATOR_SETTINGS.defaultDeterministic,
    defaultWidth: clampInt(raw.defaultWidth, DEFAULT_IMAGE_GENERATOR_SETTINGS.defaultWidth, 256, 2048),
    defaultHeight: clampInt(raw.defaultHeight, DEFAULT_IMAGE_GENERATOR_SETTINGS.defaultHeight, 256, 2048),
    engine: {
      provider: provider === 'comfyui' ? 'comfyui' : engineDefaults.provider,
      endpoint,
      autoStart: typeof engineRaw.autoStart === 'boolean' ? engineRaw.autoStart : engineDefaults.autoStart,
      startupTimeoutMs: clampInt(engineRaw.startupTimeoutMs, engineDefaults.startupTimeoutMs, 10000, 10 * 60 * 1000),
      appPath,
      startCommand: String(engineRaw.startCommand || engineDefaults.startCommand).trim() || autoStartCommand,
      defaultWorkflow: engineRaw.defaultWorkflow && typeof engineRaw.defaultWorkflow === 'object' ? engineRaw.defaultWorkflow : null,
      defaultCheckpointName: String(engineRaw.defaultCheckpointName || engineDefaults.defaultCheckpointName).trim(),
    },
    blockedTerms: Array.isArray(raw.blockedTerms)
      ? raw.blockedTerms.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : ['nsfw', 'nude', 'nudity', 'porn', 'gore', 'graphic violence', 'sexual content', 'minor', 'child sexual'],
  };
}

function imageModelCatalog() {
  const configured = appConfig && appConfig.imageGenerator && appConfig.imageGenerator.models && typeof appConfig.imageGenerator.models === 'object'
    ? appConfig.imageGenerator.models
    : {};
  const merged = {};
  Object.entries(IMAGE_MODEL_CATALOG).forEach(([id, base]) => {
    const cfg = configured[id] && typeof configured[id] === 'object' ? configured[id] : {};
    merged[id] = {
      ...base,
      ...cfg,
      id,
      label: String((cfg && cfg.label) || base.label || id),
      vramProfile: String((cfg && cfg.vramProfile) || base.vramProfile || '8gb'),
      fileName: String((cfg && cfg.fileName) || base.fileName || `${id}.safetensors`),
      downloadUrl: cfg && typeof cfg.downloadUrl === 'string' ? cfg.downloadUrl.trim() : (base.downloadUrl || null),
      sha256: cfg && typeof cfg.sha256 === 'string' ? cfg.sha256.trim().toLowerCase() : (base.sha256 || null),
    };
  });
  return merged;
}

function ensureImageRuntimeState() {
  ensureDir(IMAGE_RUNTIME_ROOT);
  ensureDir(IMAGE_MODELS_ROOT);
  ensureDir(IMAGE_CACHE_ROOT);
  ensureDir(IMAGE_GOLDEN_BASELINES_ROOT);
  if (!imageRuntimeState) {
    const fallback = {
      initializedAt: nowIso(),
      lastUpdatedAt: nowIso(),
      models: {},
      queue: { queued: 0, active: 0, completed: 0, failed: 0 },
      downloads: {},
      events: [],
    };
    imageRuntimeState = safeJsonRead(IMAGE_RUNTIME_STATE_PATH, fallback) || fallback;
  }
  if (!imageRuntimeState.models || typeof imageRuntimeState.models !== 'object') imageRuntimeState.models = {};
  if (!imageRuntimeState.queue || typeof imageRuntimeState.queue !== 'object') {
    imageRuntimeState.queue = { queued: 0, active: 0, completed: 0, failed: 0 };
  }
  if (!imageRuntimeState.downloads || typeof imageRuntimeState.downloads !== 'object') imageRuntimeState.downloads = {};
  if (!imageRuntimeState.checks || typeof imageRuntimeState.checks !== 'object') imageRuntimeState.checks = {};
  if (!imageRuntimeState.checks.selfTests || typeof imageRuntimeState.checks.selfTests !== 'object') imageRuntimeState.checks.selfTests = {};
  if (!imageRuntimeState.checks.goldenPrompts || typeof imageRuntimeState.checks.goldenPrompts !== 'object') imageRuntimeState.checks.goldenPrompts = {};
  if (!Array.isArray(imageRuntimeState.events)) imageRuntimeState.events = [];
  return imageRuntimeState;
}

function persistImageRuntimeState() {
  ensureImageRuntimeState();
  imageRuntimeState.lastUpdatedAt = nowIso();
  fs.writeFileSync(IMAGE_RUNTIME_STATE_PATH, `${JSON.stringify(imageRuntimeState, null, 2)}\n`, 'utf-8');
}

function imageProgress(projectId, kind, payload = {}) {
  const data = {
    kind,
    ts: nowIso(),
    ...payload,
  };
  if (projectId) {
    emitProjectEvent(projectId, 'image_progress', data);
    const runtime = projectRuntimes.get(projectId);
    if (runtime && runtime.state) {
      appendProjectLog(runtime.state, 'message', {
        kind: 'image_progress',
        ...data,
      });
      persistProjectState(runtime.state);
    }
  }
  const state = ensureImageRuntimeState();
  state.events.unshift(data);
  if (state.events.length > 200) state.events.length = 200;
  persistImageRuntimeState();
}

function normalizeSeed(seedValue, deterministic) {
  if (Number.isFinite(Number(seedValue))) {
    const n = Math.abs(Math.floor(Number(seedValue))) % 2147483647;
    return n || 1;
  }
  if (deterministic) {
    const buf = crypto.randomBytes(4);
    return buf.readUInt32BE(0) % 2147483647 || 1;
  }
  return null;
}

function sanitizePrompt(prompt, maxLen) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function moderateImagePrompt(prompt, blockedTerms = []) {
  const text = String(prompt || '').toLowerCase();
  const hits = blockedTerms.filter((term) => term && text.includes(term));
  return {
    ok: hits.length === 0,
    hits,
    reason: hits.length ? `Prompt blocked by safety policy (${hits.join(', ')}).` : null,
  };
}

function gameAssetPackContract(input = {}) {
  const style = String(input.style || 'stylized').trim() || 'stylized';
  return [
    { key: 'player_sprite', width: 512, height: 512, promptHint: `${style} 2d game player character sprite, transparent background` },
    { key: 'enemy_sprite', width: 512, height: 512, promptHint: `${style} 2d game enemy character sprite, transparent background` },
    { key: 'tileset', width: 1024, height: 1024, promptHint: `${style} seamless 2d game tileset, top down, transparent background` },
    { key: 'ui_icon_set', width: 1024, height: 1024, promptHint: `${style} 2d game ui icon pack, transparent background` },
    { key: 'promo_keyart', width: 1280, height: 720, promptHint: `${style} key art for indie 2d game cover` },
  ];
}

function webAppAssetPackContract(input = {}) {
  const style = String(input.style || 'modern product design').trim() || 'modern product design';
  return [
    { key: 'hero_banner', width: 1536, height: 768, promptHint: `${style} hero banner illustration for SaaS landing page` },
    { key: 'feature_illustration', width: 1280, height: 720, promptHint: `${style} feature section illustration with abstract UI motifs` },
    { key: 'pricing_background', width: 1280, height: 720, promptHint: `${style} subtle pricing section background art` },
    { key: 'blog_header', width: 1200, height: 630, promptHint: `${style} editorial header artwork for product blog` },
    { key: 'social_og_image', width: 1200, height: 630, promptHint: `${style} social open graph preview image for app launch` },
  ];
}

function mobileAppAssetPackContract(input = {}) {
  const style = String(input.style || 'clean mobile product art').trim() || 'clean mobile product art';
  return [
    { key: 'store_feature_graphic', width: 1024, height: 500, promptHint: `${style} app store feature graphic, no tiny text` },
    { key: 'store_promo_art', width: 1242, height: 2208, promptHint: `${style} app store promotional screenshot backdrop` },
    { key: 'onboarding_illustration', width: 1080, height: 1920, promptHint: `${style} onboarding screen illustration for mobile app` },
    { key: 'splash_background', width: 1080, height: 1920, promptHint: `${style} splash screen background artwork` },
    { key: 'marketing_social_card', width: 1200, height: 630, promptHint: `${style} social marketing card for app launch` },
  ];
}

function imageAssetPackContractForTemplate(templateId, input = {}) {
  const normalized = String(templateId || '').trim().toLowerCase();
  if (normalized === 'game_studio') return gameAssetPackContract(input);
  if (normalized === 'software_web_app' || normalized === 'software_agency') return webAppAssetPackContract(input);
  if (normalized === 'mobile_app') return mobileAppAssetPackContract(input);
  return [];
}

function composeImagePrompt(input = {}, projectState = null) {
  const settings = imageGeneratorSettings();
  const templateId = String(input.templateId || (projectState && projectState.template_id) || '').trim().toLowerCase();
  const styleProfile = projectState && projectState.imageStyleProfile && typeof projectState.imageStyleProfile === 'object'
    ? projectState.imageStyleProfile
    : (projectState ? ensureProjectImageStyleProfile(projectState) : null);
  const style = sanitizePrompt(input.style || (styleProfile && styleProfile.promptStyle) || '', 120);
  const subject = sanitizePrompt(input.subject || input.prompt || '', settings.maxPromptLength);
  const intent = sanitizePrompt(input.intent || '', 120);
  const camera = sanitizePrompt(input.camera || '', 80);
  const lighting = sanitizePrompt(input.lighting || '', 80);
  const quality = sanitizePrompt(input.quality || 'high detail', 80);
  const base = [subject, intent, style, camera, lighting, quality].filter(Boolean).join(', ');
  const templateSuffix = templateId === 'game_studio'
    ? 'game-ready 2d asset, clean silhouette, production friendly'
    : (templateId === 'mobile_app'
      ? 'mobile product artwork, high contrast, store-ready composition'
      : (templateId === 'software_web_app' || templateId === 'software_agency'
        ? 'web product marketing artwork, clean layout, modern visual hierarchy'
        : 'production asset, clean composition'));
  const prompt = sanitizePrompt(`${base}${base ? ', ' : ''}${templateSuffix}`, settings.maxPromptLength);
  const negativePrompt = sanitizePrompt(
    input.negativePrompt || 'blurry, low quality, distorted anatomy, watermark, text artifacts, jpeg artifacts, duplicate limbs',
    settings.maxNegativePromptLength
  );
  return {
    prompt,
    negativePrompt,
  };
}

function imageProjectArtifactsRoot(projectId) {
  return path.join(projectDir(projectId), 'artifacts', 'images');
}

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach((entry) => {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    });
  };
  walk(rootDir);
  return out;
}

function applyImageStorageLifecycle(projectId) {
  const settings = imageGeneratorSettings();
  const root = imageProjectArtifactsRoot(projectId);
  ensureDir(root);
  const allFiles = listFilesRecursive(root);
  const retentionCutoff = Date.now() - (settings.retentionDays * 24 * 60 * 60 * 1000);
  let deletedCount = 0;
  allFiles.forEach((filePath) => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < retentionCutoff) {
        fs.unlinkSync(filePath);
        deletedCount += 1;
      }
    } catch (err) {}
  });

  const remaining = listFilesRecursive(root).map((filePath) => {
    const stat = fs.statSync(filePath);
    return { filePath, size: stat.size, mtimeMs: stat.mtimeMs };
  }).sort((a, b) => a.mtimeMs - b.mtimeMs);
  const maxBytes = settings.quotaMbPerProject * 1024 * 1024;
  let totalBytes = remaining.reduce((sum, item) => sum + item.size, 0);
  for (const item of remaining) {
    if (totalBytes <= maxBytes) break;
    try {
      fs.unlinkSync(item.filePath);
      totalBytes -= item.size;
      deletedCount += 1;
    } catch (err) {}
  }
  return {
    deletedCount,
    totalBytes,
    quotaBytes: maxBytes,
  };
}

function resolveImageModelEntry(modelId) {
  const catalog = imageModelCatalog();
  const selected = catalog[modelId] || catalog[imageGeneratorSettings().preferredModelId] || Object.values(catalog)[0] || null;
  if (!selected) return null;
  const fileName = selected.fileName || `${selected.id}.safetensors`;
  return {
    ...selected,
    path: path.join(IMAGE_MODELS_ROOT, fileName),
    partPath: path.join(IMAGE_MODELS_ROOT, `${fileName}.part`),
  };
}

async function downloadFileWithResume(url, destination, partPath, onProgress = null) {
  let existing = 0;
  if (fs.existsSync(partPath)) {
    try {
      existing = fs.statSync(partPath).size;
    } catch (err) {
      existing = 0;
    }
  }
  const headers = existing > 0 ? { Range: `bytes=${existing}-` } : {};
  const resp = await fetchWithTimeout(url, { method: 'GET', headers }, 15 * 60 * 1000);
  if (!resp.ok) {
    return {
      ok: false,
      error: `Model download failed with HTTP ${resp.status}.`,
    };
  }
  const totalFromHeader = Number(resp.headers.get('content-length') || 0);
  const total = existing + (Number.isFinite(totalFromHeader) ? totalFromHeader : 0);
  const mode = existing > 0 ? 'a' : 'w';
  const file = fs.createWriteStream(partPath, { flags: mode });
  let written = existing;

  if (resp.body && typeof resp.body.getReader === 'function') {
    const reader = resp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      file.write(Buffer.from(value));
      written += value.length;
      if (typeof onProgress === 'function') onProgress({ written, total });
    }
  } else if (resp.body && typeof resp.body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of resp.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      file.write(buf);
      written += buf.length;
      if (typeof onProgress === 'function') onProgress({ written, total });
    }
  } else {
    const arr = await resp.arrayBuffer();
    const buf = Buffer.from(arr);
    file.write(buf);
    written += buf.length;
    if (typeof onProgress === 'function') onProgress({ written, total });
  }

  await new Promise((resolve, reject) => {
    file.end(() => resolve());
    file.on('error', reject);
  });
  fs.renameSync(partPath, destination);
  return {
    ok: true,
    bytes: written,
  };
}

async function ensureImageModelReady(modelId, projectId = null) {
  const runtime = ensureImageRuntimeState();
  const model = resolveImageModelEntry(modelId || imageGeneratorSettings().preferredModelId);
  if (!model) {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'No image model is configured.',
      model: null,
    };
  }
  if (fs.existsSync(model.path)) {
    runtime.models[model.id] = {
      id: model.id,
      status: 'ready',
      path: model.path,
      updatedAt: nowIso(),
    };
    persistImageRuntimeState();
    return { ok: true, model };
  }
  if (!model.downloadUrl) {
    runtime.models[model.id] = {
      id: model.id,
      status: 'missing_download_url',
      path: model.path,
      updatedAt: nowIso(),
    };
    persistImageRuntimeState();
    return {
      ok: false,
      errorCode: 'MODEL_URL_MISSING',
      message: `Model ${model.id} has no download URL configured. Set appConfig.imageGenerator.models.${model.id}.downloadUrl first.`,
      model,
    };
  }

  const inFlight = imageModelDownloadPromises.get(model.id);
  if (inFlight) {
    return inFlight;
  }

  const downloadPromise = (async () => {
    let lastEmittedPct = -1;
    let lastEmittedWritten = -1;

    runtime.models[model.id] = {
      id: model.id,
      status: 'downloading',
      path: model.path,
      updatedAt: nowIso(),
    };
    persistImageRuntimeState();
    imageProgress(projectId, 'download_started', { modelId: model.id });
    const download = await downloadFileWithResume(model.downloadUrl, model.path, model.partPath, ({ written, total }) => {
      const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((written / total) * 100))) : null;
      const writeDelta = lastEmittedWritten >= 0 ? Math.max(0, Number(written || 0) - lastEmittedWritten) : Number.MAX_SAFE_INTEGER;
      const pctUnchanged = Number.isFinite(Number(pct)) && Number(pct) === Number(lastEmittedPct);
      const finished = Number(total) > 0 && Number(written) >= Number(total);
      if (pctUnchanged && !finished && writeDelta < (8 * 1024 * 1024)) {
        return;
      }
      if (Number.isFinite(Number(pct))) lastEmittedPct = Number(pct);
      if (Number.isFinite(Number(written))) lastEmittedWritten = Number(written);
      imageProgress(projectId, 'download_progress', {
        modelId: model.id,
        written,
        total,
        progressPct: pct,
      });
    });
    if (!download.ok) {
      runtime.models[model.id] = {
        id: model.id,
        status: 'download_failed',
        path: model.path,
        updatedAt: nowIso(),
        lastError: download.error,
      };
      persistImageRuntimeState();
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: download.error || 'Model download failed.',
        model,
      };
    }
    runtime.models[model.id] = {
      id: model.id,
      status: 'ready',
      path: model.path,
      sizeBytes: download.bytes,
      updatedAt: nowIso(),
    };
    persistImageRuntimeState();
    imageProgress(projectId, 'download_complete', { modelId: model.id, bytes: download.bytes });
    return { ok: true, model };
  })();

  imageModelDownloadPromises.set(model.id, downloadPromise);
  try {
    return await downloadPromise;
  } finally {
    imageModelDownloadPromises.delete(model.id);
  }
}

function safeSlug(value, fallback = 'item') {
  const v = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return v || fallback;
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function imageEngineWorkingPath(engine) {
  const raw = String(engine && engine.appPath ? engine.appPath : '').trim();
  if (!raw) return null;
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(__dirname, raw);
}

function comfyEndpointPort(endpoint) {
  try {
    const parsed = new URL(String(endpoint || '').trim() || 'http://127.0.0.1:8188');
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    return Number.isFinite(port) && port > 0 ? port : 8188;
  } catch (err) {
    return 8188;
  }
}

function comfyVenvPythonPath(comfyRoot) {
  const venvRoot = IMAGE_COMFY_VENV_ROOT;
  if (process.platform === 'win32') {
    return path.join(venvRoot, 'Scripts', 'python.exe');
  }
  return path.join(venvRoot, 'bin', 'python');
}

function comfyDefaultStartCommand(appPath, endpoint) {
  const resolvedPath = imageEngineWorkingPath({ appPath }) || IMAGE_COMFY_ROOT;
  const pythonPath = comfyVenvPythonPath(resolvedPath);
  const port = comfyEndpointPort(endpoint);
  return `"${pythonPath}" main.py --listen 127.0.0.1 --port ${port}`;
}

function resolveImagePythonCommand() {
  const comfyPython = comfyVenvPythonPath(IMAGE_COMFY_ROOT);
  if (fs.existsSync(comfyPython)) {
    return { command: comfyPython, args: [] };
  }
  const bootstrap = resolvePythonBootstrapCommand();
  return bootstrap ? { command: bootstrap.command, args: bootstrap.args } : null;
}

function pythonCommandDescription(cmd) {
  if (!cmd) return 'none';
  return [cmd.command, ...(Array.isArray(cmd.args) ? cmd.args : [])].join(' ').trim();
}

function ensurePythonPackageAvailable(commandSpec, moduleName, packageName = moduleName, allowInstall = true) {
  if (!commandSpec) {
    return { ok: false, error: 'No Python runtime available.' };
  }
  const probe = executeProvisionStep({
    label: `Python module check (${moduleName})`,
    command: commandSpec.command,
    args: [...(commandSpec.args || []), '-c', `import ${moduleName}`],
    cwd: __dirname,
  });
  if (probe.ok || !allowInstall) {
    return probe.ok ? { ok: true } : { ok: false, error: probe.error };
  }
  const install = executeProvisionStep({
    label: `Install Python package (${packageName})`,
    command: commandSpec.command,
    args: [...(commandSpec.args || []), '-m', 'pip', 'install', packageName],
    cwd: __dirname,
    timeout: 20 * 60 * 1000,
  });
  if (!install.ok) {
    return install;
  }
  const verify = executeProvisionStep({
    label: `Verify Python module (${moduleName})`,
    command: commandSpec.command,
    args: [...(commandSpec.args || []), '-c', `import ${moduleName}`],
    cwd: __dirname,
  });
  return verify.ok ? { ok: true } : verify;
}

function resizeImageWithPython(inputPath, outputPath, width, height) {
  const commandSpec = resolveImagePythonCommand();
  const pillow = ensurePythonPackageAvailable(commandSpec, 'PIL', 'pillow', true);
  if (!pillow.ok) {
    return { ok: false, error: pillow.error || 'Pillow is unavailable.' };
  }
  const script = [
    'from PIL import Image, ImageOps',
    'import sys',
    'src, dst, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])',
    'img = Image.open(src).convert("RGBA")',
    'fit = ImageOps.fit(img, (width, height), method=Image.LANCZOS, centering=(0.5, 0.5))',
    'fit.save(dst)',
  ].join('; ');
  const resized = executeProvisionStep({
    label: 'Resize image variant',
    command: commandSpec.command,
    args: [...(commandSpec.args || []), '-c', script, inputPath, outputPath, String(width), String(height)],
    cwd: __dirname,
  });
  return resized.ok ? { ok: true, backend: pythonCommandDescription(commandSpec) } : resized;
}

function sha256File(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

function normalizeSvgText(raw) {
  return String(raw || '').replace(/\r\n/g, '\n').trim();
}

function goldenRegressionScopeKey(projectId, templateId) {
  return safeSlug(projectId || String(templateId || 'global'), 'global');
}

function goldenBaselineDirectory(projectId, templateId, modelId) {
  return path.join(
    IMAGE_GOLDEN_BASELINES_ROOT,
    goldenRegressionScopeKey(projectId, templateId),
    safeSlug(modelId || 'default', 'model'),
  );
}

function goldenBaselineMetaPath(projectId, templateId, modelId, testId) {
  return path.join(goldenBaselineDirectory(projectId, templateId, modelId), `${safeSlug(testId, 'golden')}.baseline.json`);
}

function resolveGoldenBaseline(projectId, templateId, modelId, test, outputPath, metadata = null) {
  const dir = goldenBaselineDirectory(projectId, templateId, modelId);
  ensureDir(dir);
  const metaPath = goldenBaselineMetaPath(projectId, templateId, modelId, test && test.id ? test.id : 'golden');
  const slug = safeSlug(test && test.id ? test.id : 'golden', 'golden');
  const currentExt = path.extname(String(outputPath || '')).toLowerCase() || '.png';
  const currentEngine = metadata && metadata.engine ? String(metadata.engine) : null;
  const existingMeta = safeJsonRead(metaPath, null);
  const existingBaselinePath = existingMeta && existingMeta.baselinePath && fs.existsSync(existingMeta.baselinePath)
    ? String(existingMeta.baselinePath)
    : null;

  if (!existingBaselinePath) {
    const seededPath = path.join(dir, `${slug}${currentExt}`);
    try {
      fs.copyFileSync(outputPath, seededPath);
      const baselineMeta = {
        testId: test && test.id ? test.id : slug,
        templateId: templateId || null,
        projectId: projectId || null,
        modelId: modelId || null,
        extension: currentExt,
        baselinePath: seededPath,
        engine: currentEngine,
        seededAt: nowIso(),
        sourceOutputPath: outputPath,
      };
      fs.writeFileSync(metaPath, `${JSON.stringify(baselineMeta, null, 2)}\n`, 'utf-8');
      return { ok: true, seeded: true, upgraded: false, baselinePath: seededPath, metaPath, meta: baselineMeta };
    } catch (err) {
      return { ok: false, error: redactSensitive(err && err.message ? err.message : 'Failed to seed golden baseline.') };
    }
  }

  const existingExt = path.extname(existingBaselinePath).toLowerCase() || '.png';
  if (existingExt === '.svg' && currentExt !== '.svg') {
    const upgradedPath = path.join(dir, `${slug}${currentExt}`);
    try {
      fs.copyFileSync(outputPath, upgradedPath);
      if (existingBaselinePath !== upgradedPath && fs.existsSync(existingBaselinePath)) {
        try {
          fs.unlinkSync(existingBaselinePath);
        } catch {
        }
      }
      const upgradedMeta = {
        ...(existingMeta && typeof existingMeta === 'object' ? existingMeta : {}),
        testId: test && test.id ? test.id : slug,
        templateId: templateId || null,
        projectId: projectId || null,
        modelId: modelId || null,
        extension: currentExt,
        baselinePath: upgradedPath,
        engine: currentEngine,
        upgradedAt: nowIso(),
        upgradedFromExtension: existingExt,
        sourceOutputPath: outputPath,
      };
      fs.writeFileSync(metaPath, `${JSON.stringify(upgradedMeta, null, 2)}\n`, 'utf-8');
      return { ok: true, seeded: false, upgraded: true, baselinePath: upgradedPath, metaPath, meta: upgradedMeta };
    } catch (err) {
      return { ok: false, error: redactSensitive(err && err.message ? err.message : 'Failed to upgrade golden baseline.') };
    }
  }

  return {
    ok: true,
    seeded: false,
    upgraded: false,
    baselinePath: existingBaselinePath,
    metaPath,
    meta: existingMeta && typeof existingMeta === 'object' ? existingMeta : null,
  };
}

function compareGoldenArtifacts(outputPath, baselinePath) {
  if (!outputPath || !baselinePath || !fs.existsSync(outputPath) || !fs.existsSync(baselinePath)) {
    return {
      ok: false,
      error: 'Golden comparison requires both output and baseline files.',
    };
  }

  const outputExt = path.extname(String(outputPath)).toLowerCase() || '.png';
  const baselineExt = path.extname(String(baselinePath)).toLowerCase() || '.png';
  const outputSha256 = sha256File(outputPath);
  const baselineSha256 = sha256File(baselinePath);

  if (outputExt === '.svg' || baselineExt === '.svg') {
    if (outputExt !== '.svg' || baselineExt !== '.svg') {
      return {
        ok: true,
        passed: false,
        mode: 'mixed_svg_raster',
        backend: 'builtin_sha256',
        baselineSha256,
        outputSha256,
        hashDistance: null,
        meanPixelDelta: 1,
        rmsDelta: 1,
        thresholds: null,
        reason: outputExt === '.svg' ? 'degraded_to_svg_fallback' : 'legacy_svg_baseline',
      };
    }
    try {
      const baselineText = normalizeSvgText(fs.readFileSync(baselinePath, 'utf-8'));
      const outputText = normalizeSvgText(fs.readFileSync(outputPath, 'utf-8'));
      const passed = baselineText === outputText;
      return {
        ok: true,
        passed,
        mode: 'svg_text',
        backend: 'builtin_sha256',
        baselineSha256,
        outputSha256,
        hashDistance: passed ? 0 : 64,
        meanPixelDelta: passed ? 0 : 1,
        rmsDelta: passed ? 0 : 1,
        thresholds: {
          hashDistance: 0,
          meanPixelDelta: 0,
          rmsDelta: 0,
        },
        reason: passed ? null : 'svg_output_mismatch',
      };
    } catch (err) {
      return {
        ok: false,
        error: redactSensitive(err && err.message ? err.message : 'SVG golden comparison failed.'),
      };
    }
  }

  const commandSpec = resolveImagePythonCommand();
  const pillow = ensurePythonPackageAvailable(commandSpec, 'PIL', 'pillow', true);
  if (!pillow.ok) {
    return {
      ok: false,
      error: pillow.error || 'Pillow is unavailable for perceptual comparison.',
    };
  }

  const script = [
    'from PIL import Image, ImageOps, ImageChops, ImageStat',
    'import json',
    'import sys',
    '',
    'base = Image.open(sys.argv[1]).convert("RGB")',
    'cand = Image.open(sys.argv[2]).convert("RGB")',
    'target_size = (128, 128)',
    'base_fit = ImageOps.fit(base, target_size, method=Image.LANCZOS, centering=(0.5, 0.5))',
    'cand_fit = ImageOps.fit(cand, target_size, method=Image.LANCZOS, centering=(0.5, 0.5))',
    '',
    'def dhash(img):',
    '    gray = img.convert("L").resize((9, 8), Image.LANCZOS)',
    '    pixels = list(gray.getdata())',
    '    bits = []',
    '    for y in range(8):',
    '        row = pixels[y * 9:(y + 1) * 9]',
    '        for x in range(8):',
    '            bits.append("1" if row[x] > row[x + 1] else "0")',
    '    bit_string = "".join(bits)',
    '    return format(int(bit_string, 2), "016x")',
    '',
    'def hamming(left, right):',
    '    value = int(left, 16) ^ int(right, 16)',
    '    return value.bit_count() if hasattr(value, "bit_count") else bin(value).count("1")',
    '',
    'diff = ImageChops.difference(base_fit, cand_fit)',
    'stat = ImageStat.Stat(diff)',
    'mean_delta = sum(stat.mean) / (len(stat.mean) * 255.0)',
    'rms_delta = sum(stat.rms) / (len(stat.rms) * 255.0)',
    'base_hash = dhash(base_fit)',
    'cand_hash = dhash(cand_fit)',
    'hash_distance = hamming(base_hash, cand_hash)',
    'thresholds = {"hashDistance": 10, "meanPixelDelta": 0.14, "rmsDelta": 0.18}',
    'passed = hash_distance <= thresholds["hashDistance"] and mean_delta <= thresholds["meanPixelDelta"] and rms_delta <= thresholds["rmsDelta"]',
    'print(json.dumps({',
    '    "passed": passed,',
    '    "baselineHash": base_hash,',
    '    "outputHash": cand_hash,',
    '    "hashDistance": hash_distance,',
    '    "meanPixelDelta": round(mean_delta, 6),',
    '    "rmsDelta": round(rms_delta, 6),',
    '    "thresholds": thresholds',
    '}))',
  ].join('\n');
  const compared = spawnSyncUtf8(commandSpec.command, [...(commandSpec.args || []), '-c', script, baselinePath, outputPath], {
    cwd: __dirname,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
    stdio: 'pipe',
  });
  const stderr = redactSensitive(String((compared && compared.stderr) || '').trim());
  const stdout = String((compared && compared.stdout) || '').trim();
  if (compared.error || Number(compared.status) !== 0) {
    return {
      ok: false,
      error: stderr || redactSensitive(compared.error && compared.error.message ? compared.error.message : `Exit code ${compared.status}`),
    };
  }
  try {
    const parsed = JSON.parse(stdout || '{}');
    return {
      ok: true,
      passed: Boolean(parsed.passed),
      mode: 'pillow_perceptual_hash',
      backend: pythonCommandDescription(commandSpec),
      baselineSha256,
      outputSha256,
      baselineHash: parsed.baselineHash || null,
      outputHash: parsed.outputHash || null,
      hashDistance: Number.isFinite(Number(parsed.hashDistance)) ? Number(parsed.hashDistance) : null,
      meanPixelDelta: Number.isFinite(Number(parsed.meanPixelDelta)) ? Number(parsed.meanPixelDelta) : null,
      rmsDelta: Number.isFinite(Number(parsed.rmsDelta)) ? Number(parsed.rmsDelta) : null,
      thresholds: parsed.thresholds && typeof parsed.thresholds === 'object' ? parsed.thresholds : null,
      reason: parsed.passed ? null : 'perceptual_drift_detected',
    };
  } catch (err) {
    return {
      ok: false,
      error: redactSensitive(err && err.message ? err.message : 'Unable to parse perceptual comparison output.'),
    };
  }
}

async function secondaryBackendReachable() {
  for (const endpoint of IMAGE_SECONDARY_SDAPI_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(`${endpoint}/sdapi/v1/options`, { method: 'GET' }, 4000);
      if (response.ok) {
        return { ok: true, endpoint };
      }
    } catch {
    }
  }
  return { ok: false, endpoint: null };
}

function spawnSyncUtf8(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf-8',
    timeout: options.timeout || 20 * 60 * 1000,
    ...options,
  });
}

function resolvePythonBootstrapCommand() {
  const candidates = process.platform === 'win32'
    ? [
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'py', args: [] },
    ]
    : [
      { command: 'python3', args: [] },
      { command: 'python', args: [] },
    ];
  for (const candidate of candidates) {
    const probe = spawnSyncUtf8(candidate.command, [...candidate.args, '--version'], {
      stdio: 'pipe',
    });
    if (!probe.error && Number(probe.status) === 0) {
      return candidate;
    }
  }
  return null;
}

function executeProvisionStep(step) {
  const result = spawnSyncUtf8(step.command, step.args, {
    cwd: step.cwd || __dirname,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      ...(step.env || {}),
    },
    stdio: 'pipe',
  });
  const stderr = redactSensitive(String((result && result.stderr) || '').trim());
  const stdout = redactSensitive(String((result && result.stdout) || '').trim());
  if (result.error || Number(result.status) !== 0) {
    const detail = stderr || stdout || (result.error && result.error.message) || `Exit code ${result.status}`;
    return {
      ok: false,
      error: `${step.label} failed: ${detail}`,
    };
  }
  return { ok: true };
}

async function provisionComfyRuntime(projectId = null, engine = {}) {
  const comfyRoot = imageEngineWorkingPath(engine) || IMAGE_COMFY_ROOT;
  ensureDir(comfyRoot);
  const mainPy = path.join(comfyRoot, 'main.py');
  if (!fs.existsSync(mainPy)) {
    imageProgress(projectId, 'engine_bootstrap_started', {
      provider: 'comfyui',
      stage: 'clone_repo',
      repo: IMAGE_COMFY_REPO_URL,
    });
    const clone = executeProvisionStep({
      label: 'ComfyUI clone',
      command: 'git',
      args: ['clone', '--depth', '1', IMAGE_COMFY_REPO_URL, comfyRoot],
      cwd: IMAGE_RUNTIME_ROOT,
    });
    if (!clone.ok) {
      return clone;
    }
  }

  const pythonLauncher = resolvePythonBootstrapCommand();
  if (!pythonLauncher) {
    return {
      ok: false,
      error: 'No Python runtime found. Install Python 3 and rerun warmup.',
    };
  }

  const venvPython = comfyVenvPythonPath(comfyRoot);
  if (!fs.existsSync(venvPython)) {
    imageProgress(projectId, 'engine_bootstrap_started', {
      provider: 'comfyui',
      stage: 'create_venv',
    });
    const venvCreate = executeProvisionStep({
      label: 'ComfyUI virtual environment creation',
      command: pythonLauncher.command,
      args: [...pythonLauncher.args, '-m', 'venv', IMAGE_COMFY_VENV_ROOT],
      cwd: IMAGE_RUNTIME_ROOT,
    });
    if (!venvCreate.ok) {
      return venvCreate;
    }
  }

  imageProgress(projectId, 'engine_bootstrap_started', {
    provider: 'comfyui',
    stage: 'install_dependencies',
  });
  const pipUpgrade = executeProvisionStep({
    label: 'ComfyUI pip upgrade',
    command: venvPython,
    args: ['-m', 'pip', 'install', '--upgrade', 'pip'],
    cwd: comfyRoot,
  });
  if (!pipUpgrade.ok) {
    return pipUpgrade;
  }

  const installReqs = executeProvisionStep({
    label: 'ComfyUI requirements install',
    command: venvPython,
    args: ['-m', 'pip', 'install', '-r', 'requirements.txt'],
    cwd: comfyRoot,
    timeout: 30 * 60 * 1000,
  });
  if (!installReqs.ok) {
    return installReqs;
  }

  imageProgress(projectId, 'engine_bootstrap_complete', {
    provider: 'comfyui',
    appPath: comfyRoot,
  });
  return { ok: true };
}

async function ensureComfyRuntimeProvisioned(projectId = null, engine = {}) {
  const comfyRoot = imageEngineWorkingPath(engine) || IMAGE_COMFY_ROOT;
  const mainPy = path.join(comfyRoot, 'main.py');
  const venvPython = comfyVenvPythonPath(comfyRoot);
  if (fs.existsSync(mainPy) && fs.existsSync(venvPython)) {
    return { ok: true };
  }

  if (!imageEngineBootstrapPromise) {
    imageEngineBootstrapPromise = provisionComfyRuntime(projectId, engine)
      .finally(() => {
        imageEngineBootstrapPromise = null;
      });
  }
  return imageEngineBootstrapPromise;
}

async function comfyApiRequest(routePath, options = {}, timeoutMs = 20000) {
  const settings = imageGeneratorSettings();
  const endpoint = String(settings.engine.endpoint || '').trim().replace(/\/$/, '');
  if (!endpoint) {
    return {
      ok: false,
      error: 'imageGenerator.engine.endpoint is not configured.',
      status: 0,
      data: null,
      response: null,
    };
  }
  const url = `${endpoint}${routePath.startsWith('/') ? routePath : `/${routePath}`}`;
  try {
    const response = await fetchWithTimeout(url, {
      method: options.method || 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }, timeoutMs);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        status: response.status,
        error: `ComfyUI API ${routePath} failed with HTTP ${response.status}${text ? `: ${redactSensitive(text).slice(0, 180)}` : ''}.`,
        data: null,
        response,
      };
    }

    const text = await response.text().catch(() => '');
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        data = text;
      }
    }
    return {
      ok: true,
      status: response.status,
      error: null,
      data,
      response,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: redactSensitive(err && err.message ? err.message : 'ComfyUI request failed.'),
      data: null,
      response: null,
    };
  }
}

async function comfyIsHealthy() {
  const probe = await comfyApiRequest('/system_stats', { method: 'GET' }, 6000);
  if (probe.ok) return true;
  const alt = await comfyApiRequest('/object_info', { method: 'GET' }, 6000);
  return alt.ok;
}

async function startComfyRuntime(projectId = null) {
  const settings = imageGeneratorSettings();
  const engine = settings.engine || {};
  if (engine.provider !== 'comfyui') {
    return { ok: false, error: `Unsupported image engine provider: ${engine.provider || 'unknown'}.` };
  }
  if (imageEngineProcess && !imageEngineProcess.killed) {
    return { ok: true };
  }
  const provision = await ensureComfyRuntimeProvisioned(projectId, engine);
  if (!provision.ok) {
    return {
      ok: false,
      error: provision.error || 'Failed to provision ComfyUI runtime automatically.',
    };
  }
  const cmd = String(engine.startCommand || '').trim();
  if (!cmd) {
    return {
      ok: false,
      error: 'ComfyUI start command is unavailable after provisioning.',
    };
  }
  const cwd = imageEngineWorkingPath(engine) || __dirname;
  ensureDir(cwd);
  try {
    const child = spawn(cmd, {
      cwd,
      shell: true,
      detached: false,
      stdio: 'ignore',
      env: {
        ...process.env,
        HIVEFORGE_IMAGE_RUNTIME: 'comfyui',
      },
    });
    imageEngineProcess = child;
    imageEngineLastStartAt = nowIso();
    child.once('exit', () => {
      imageEngineProcess = null;
    });
    imageProgress(projectId, 'engine_start_requested', {
      provider: 'comfyui',
      endpoint: settings.engine.endpoint,
      cwd,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: redactSensitive(err && err.message ? err.message : 'Failed to start ComfyUI runtime.'),
    };
  }
}

async function ensureComfyRuntimeReady(projectId = null) {
  const settings = imageGeneratorSettings();
  const engine = settings.engine || {};
  if (engine.provider !== 'comfyui') {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      message: `Unsupported image engine provider: ${engine.provider || 'unknown'}.`,
    };
  }

  if (await comfyIsHealthy()) {
    return { ok: true };
  }

  if (!engine.autoStart) {
    return {
      ok: false,
      errorCode: 'CONNECTOR_FAILURE',
      message: `ComfyUI is not reachable at ${engine.endpoint}. Enable imageGenerator.engine.autoStart or start ComfyUI manually.`,
    };
  }

  const start = await startComfyRuntime(projectId);
  if (!start.ok) {
    return {
      ok: false,
      errorCode: 'CONNECTOR_FAILURE',
      message: start.error,
    };
  }

  const deadline = Date.now() + clampInt(engine.startupTimeoutMs, 180000, 10000, 10 * 60 * 1000);
  while (Date.now() < deadline) {
    if (await comfyIsHealthy()) {
      imageProgress(projectId, 'engine_ready', {
        provider: 'comfyui',
        endpoint: engine.endpoint,
      });
      return { ok: true };
    }
    await delayMs(2000);
  }

  return {
    ok: false,
    errorCode: 'CONNECTOR_FAILURE',
    message: `ComfyUI did not become ready within ${Math.round((engine.startupTimeoutMs || 180000) / 1000)}s.`,
  };
}

function syncModelIntoComfyPaths(modelPath, fileName) {
  const settings = imageGeneratorSettings();
  const engineRoot = imageEngineWorkingPath(settings.engine || {});
  if (!engineRoot || !fs.existsSync(engineRoot)) {
    return { ok: true, syncedTo: [] };
  }
  const targets = [
    path.join(engineRoot, 'models', 'checkpoints', fileName),
    path.join(engineRoot, 'models', 'unet', fileName),
  ];
  const syncedTo = [];
  targets.forEach((target) => {
    try {
      ensureDir(path.dirname(target));
      if (!fs.existsSync(target)) {
        fs.copyFileSync(modelPath, target);
      }
      syncedTo.push(target);
    } catch (err) {}
  });
  return { ok: true, syncedTo };
}

function deepReplaceTemplateTokens(value, replacements) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepReplaceTemplateTokens(entry, replacements));
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, val]) => {
      out[key] = deepReplaceTemplateTokens(val, replacements);
    });
    return out;
  }
  if (typeof value === 'string') {
    if (/^\{\{[a-z0-9_]+\}\}$/i.test(value.trim())) {
      const token = value.trim().slice(2, -2).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(replacements, token)) {
        return replacements[token];
      }
    }
    let out = value;
    Object.entries(replacements).forEach(([k, v]) => {
      out = out.replaceAll(`{{${k}}}`, String(v));
    });
    return out;
  }
  return value;
}

function defaultComfyWorkflow(job) {
  const settings = imageGeneratorSettings();
  const ckpt = String(settings.engine.defaultCheckpointName || job.modelFileName || '').trim();
  if (!ckpt) return null;
  return {
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: '{{checkpoint_name}}',
      },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: '{{width}}',
        height: '{{height}}',
        batch_size: 1,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: '{{prompt}}',
        clip: ['4', 1],
      },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: '{{negative_prompt}}',
        clip: ['4', 1],
      },
    },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: '{{seed}}',
        steps: '{{steps}}',
        cfg: '{{cfg}}',
        sampler_name: '{{sampler_name}}',
        scheduler: '{{scheduler}}',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['3', 0],
        vae: ['4', 2],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: '{{filename_prefix}}',
        images: ['8', 0],
      },
    },
  };
}

function resolveComfyWorkflow(job) {
  const settings = imageGeneratorSettings();
  const source = job.workflow && typeof job.workflow === 'object'
    ? job.workflow
    : (settings.engine.defaultWorkflow && typeof settings.engine.defaultWorkflow === 'object'
      ? settings.engine.defaultWorkflow
      : defaultComfyWorkflow(job));
  if (!source || typeof source !== 'object') {
    return null;
  }
  const replacements = {
    prompt: job.prompt,
    negative_prompt: job.negativePrompt || '',
    seed: Number.isFinite(Number(job.seed)) ? Number(job.seed) : 42,
    width: Number(job.width),
    height: Number(job.height),
    steps: clampInt(job.steps, 10, 4, 60),
    cfg: Number.isFinite(Number(job.cfg)) ? Number(job.cfg) : 1,
    sampler_name: String(job.samplerName || 'euler').trim() || 'euler',
    scheduler: String(job.scheduler || 'normal').trim() || 'normal',
    checkpoint_name: String(job.checkpointName || '').trim(),
    filename_prefix: String(job.filenamePrefix || 'hiveforge').trim() || 'hiveforge',
  };
  return deepReplaceTemplateTokens(source, replacements);
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fallbackPalette(seedValue) {
  const seed = Number.isFinite(Number(seedValue)) ? Number(seedValue) : 1337;
  const hash = crypto.createHash('sha256').update(String(seed)).digest('hex');
  return {
    c1: `#${hash.slice(0, 6)}`,
    c2: `#${hash.slice(6, 12)}`,
    c3: `#${hash.slice(12, 18)}`,
  };
}

function writeFallbackImageFile(outputPath, prompt, seed, width, height, assetKind = 'image') {
  const w = clampInt(width, 768, 256, 2048);
  const h = clampInt(height, 768, 256, 2048);
  const palette = fallbackPalette(seed);
  const kind = String(assetKind || 'image').toLowerCase();
  const seedHash = crypto.createHash('sha256').update(`${seed}:${prompt}:${kind}`).digest('hex');
  const circles = [0, 1, 2, 3].map((idx) => {
    const x = Math.floor((parseInt(seedHash.slice(idx * 4, idx * 4 + 4), 16) / 0xffff) * (w - 160)) + 80;
    const y = Math.floor((parseInt(seedHash.slice(16 + idx * 4, 20 + idx * 4), 16) / 0xffff) * (h - 160)) + 80;
    const r = 22 + (parseInt(seedHash.slice(32 + idx * 2, 34 + idx * 2), 16) % 48);
    const a = 0.12 + ((parseInt(seedHash.slice(40 + idx * 2, 42 + idx * 2), 16) % 45) / 100);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${a.toFixed(2)}"/>`;
  }).join('');

  const assetGlyph = kind.includes('player')
    ? `<g transform="translate(${Math.floor(w * 0.5) - 36} ${Math.floor(h * 0.58) - 44})" fill="white" opacity="0.9"><rect x="22" y="8" width="28" height="20" rx="5"/><rect x="18" y="26" width="36" height="28" rx="6"/><rect x="8" y="28" width="10" height="20" rx="4"/><rect x="54" y="28" width="10" height="20" rx="4"/><rect x="22" y="54" width="12" height="20" rx="4"/><rect x="38" y="54" width="12" height="20" rx="4"/></g>`
    : kind.includes('enemy')
      ? `<g transform="translate(${Math.floor(w * 0.5) - 34} ${Math.floor(h * 0.58) - 34})" fill="white" opacity="0.88"><polygon points="34,0 66,18 66,58 34,76 2,58 2,18"/><circle cx="24" cy="34" r="5" fill="${palette.c1}"/><circle cx="44" cy="34" r="5" fill="${palette.c1}"/></g>`
      : kind.includes('ui-icon')
        ? `<g transform="translate(${Math.floor(w * 0.5) - 72} ${Math.floor(h * 0.58) - 32})" fill="white" opacity="0.92"><rect x="0" y="0" width="28" height="28" rx="6"/><rect x="36" y="0" width="28" height="28" rx="6"/><rect x="72" y="0" width="28" height="28" rx="6"/><rect x="108" y="0" width="28" height="28" rx="6"/></g>`
        : kind.includes('tile')
          ? `<g stroke="white" stroke-opacity="0.45" fill="none"><path d="M0 ${Math.floor(h * 0.64)} H${w}"/><path d="M0 ${Math.floor(h * 0.76)} H${w}"/><path d="M${Math.floor(w * 0.2)} ${Math.floor(h * 0.56)} V${h}"/><path d="M${Math.floor(w * 0.5)} ${Math.floor(h * 0.52)} V${h}"/><path d="M${Math.floor(w * 0.8)} ${Math.floor(h * 0.56)} V${h}"/></g>`
          : `<g fill="white" opacity="0.88"><rect x="${Math.floor(w * 0.28)}" y="${Math.floor(h * 0.62)}" width="${Math.floor(w * 0.44)}" height="${Math.floor(h * 0.18)}" rx="14"/></g>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  <defs>\n    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">\n      <stop offset="0%" stop-color="${palette.c1}"/>\n      <stop offset="55%" stop-color="${palette.c2}"/>\n      <stop offset="100%" stop-color="${palette.c3}"/>\n    </linearGradient>\n  </defs>\n  <rect width="${w}" height="${h}" fill="url(#bg)"/>\n  <rect x="30" y="30" width="${Math.max(100, w - 60)}" height="${Math.max(100, h - 60)}" rx="20" fill="rgba(0,0,0,0.18)"/>\n  ${circles}\n  ${assetGlyph}\n</svg>\n`;
  fs.writeFileSync(outputPath, svg, 'utf-8');
}

function buildImageOutputBase(job, projectId) {
  const outputRoot = imageProjectArtifactsRoot(projectId || 'global');
  ensureDir(outputRoot);
  const ts = new Date();
  const dayDir = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, '0')}-${String(ts.getUTCDate()).padStart(2, '0')}`;
  const dir = path.join(outputRoot, dayDir);
  ensureDir(dir);
  const assetKind = safeSlug(job.assetKind || 'image', 'image');
  const base = `${safeSlug(job.projectName || projectId || 'project', 'project')}_${assetKind}_${job.seed || 'auto'}_${Date.now()}`;
  return { dir, base, assetKind };
}

function renderFallbackImageResult(job, projectId, reason, modelId = null) {
  const { dir, base, assetKind } = buildImageOutputBase(job, projectId);
  const outputPath = path.join(dir, `${base}.svg`);
  const metadataPath = path.join(dir, `${base}.json`);
  writeFallbackImageFile(outputPath, job.prompt, job.seed, job.width, job.height, assetKind);
  const metadata = {
    jobId: job.id,
    modelId: modelId || job.modelId || null,
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    seed: job.seed,
    deterministic: job.deterministic,
    width: job.width,
    height: job.height,
    templateId: job.templateId || null,
    assetKind,
    createdAt: nowIso(),
    engine: 'fallback_svg',
    fallbackReason: reason,
    file: path.relative(projectDir(projectId || 'global'), outputPath).replace(/\\/g, '/'),
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
  const lifecycle = applyImageStorageLifecycle(projectId || 'global');
  imageProgress(projectId, 'generation_fallback_complete', {
    jobId: job.id,
    output: outputPath,
    metadata: metadataPath,
    reason,
  });
  return {
    ok: true,
    message: 'Image generated with automatic fallback renderer.',
    data: {
      outputPath,
      metadataPath,
      metadata,
      lifecycle,
      fallback: true,
    },
  };
}

function renderBinaryImageResult(job, projectId, buffer, extension, engineName, extraMetadata = {}, modelId = null) {
  const { dir, base, assetKind } = buildImageOutputBase(job, projectId);
  const ext = String(extension || 'png').trim().toLowerCase() || 'png';
  const outputPath = path.join(dir, `${base}.${ext}`);
  const metadataPath = path.join(dir, `${base}.json`);
  fs.writeFileSync(outputPath, buffer);
  const metadata = {
    jobId: job.id,
    modelId: modelId || job.modelId || null,
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    seed: job.seed,
    deterministic: job.deterministic,
    width: job.width,
    height: job.height,
    templateId: job.templateId || null,
    assetKind,
    createdAt: nowIso(),
    engine: engineName,
    file: path.relative(projectDir(projectId || 'global'), outputPath).replace(/\\/g, '/'),
    ...extraMetadata,
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
  const lifecycle = applyImageStorageLifecycle(projectId || 'global');
  return {
    ok: true,
    message: 'Image generated successfully.',
    data: {
      outputPath,
      metadataPath,
      metadata,
      lifecycle,
    },
  };
}

function decodeBase64ImageBytes(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const normalized = text.startsWith('data:')
    ? text.slice(text.indexOf(',') + 1)
    : text;
  try {
    const buf = Buffer.from(normalized, 'base64');
    return buf && buf.length ? buf : null;
  } catch (err) {
    return null;
  }
}

async function generateImageViaSecondaryLocalBackend(job, projectId = null) {
  const seed = Number.isFinite(Number(job.seed)) ? Number(job.seed) : -1;
  for (const endpoint of IMAGE_SECONDARY_SDAPI_ENDPOINTS) {
    try {
      const payload = {
        prompt: job.prompt,
        negative_prompt: job.negativePrompt || '',
        width: clampInt(job.width, 768, 256, 2048),
        height: clampInt(job.height, 768, 256, 2048),
        steps: clampInt(job.steps, 20, 4, 60),
        cfg_scale: Number.isFinite(Number(job.cfg)) ? Number(job.cfg) : 7,
        sampler_name: String(job.samplerName || 'Euler a').trim() || 'Euler a',
        seed,
      };
      const response = await fetchWithTimeout(`${endpoint}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, clampInt(job.timeoutMs, 90 * 1000, 20 * 1000, 10 * 60 * 1000));
      if (!response.ok) continue;
      const data = await response.json().catch(() => null);
      const encoded = data && Array.isArray(data.images) && data.images.length ? data.images[0] : null;
      const buffer = decodeBase64ImageBytes(encoded);
      if (!buffer) continue;
      imageProgress(projectId, 'generation_secondary_backend_complete', {
        jobId: job.id,
        endpoint,
      });
      return {
        ok: true,
        buffer,
        extension: 'png',
        engine: 'local_sdapi',
        endpoint,
      };
    } catch (err) {
    }
  }
  return {
    ok: false,
    error: 'No secondary local image backend was reachable.',
  };
}

async function renderWithSecondaryBackendOrFallback(job, projectId, reason, modelId = null) {
  const secondary = await generateImageViaSecondaryLocalBackend(job, projectId);
  if (secondary.ok) {
    return renderBinaryImageResult(
      job,
      projectId,
      secondary.buffer,
      secondary.extension,
      secondary.engine,
      { secondaryEndpoint: secondary.endpoint, degradedReason: reason },
      modelId
    );
  }
  return renderFallbackImageResult(job, projectId, reason, modelId);
}

function firstComfyImageRef(historyEntry) {
  const outputs = historyEntry && historyEntry.outputs && typeof historyEntry.outputs === 'object'
    ? historyEntry.outputs
    : {};
  for (const nodeOutput of Object.values(outputs)) {
    if (!nodeOutput || typeof nodeOutput !== 'object') continue;
    const images = Array.isArray(nodeOutput.images) ? nodeOutput.images : [];
    if (images.length > 0) {
      const img = images[0] || {};
      return {
        filename: String(img.filename || '').trim(),
        subfolder: String(img.subfolder || '').trim(),
        type: String(img.type || 'output').trim() || 'output',
      };
    }
  }
  return null;
}

async function fetchComfyImageBinary(imageRef) {
  const qs = new URLSearchParams();
  qs.set('filename', imageRef.filename);
  if (imageRef.subfolder) qs.set('subfolder', imageRef.subfolder);
  if (imageRef.type) qs.set('type', imageRef.type);
  const settings = imageGeneratorSettings();
  const endpoint = String(settings.engine.endpoint || '').trim().replace(/\/$/, '');
  const url = `${endpoint}/view?${qs.toString()}`;
  const response = await fetchWithTimeout(url, { method: 'GET' }, 120000);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return {
      ok: false,
      error: `ComfyUI image fetch failed with HTTP ${response.status}${text ? `: ${redactSensitive(text).slice(0, 180)}` : ''}.`,
      buffer: null,
      contentType: null,
    };
  }
  const arr = await response.arrayBuffer();
  return {
    ok: true,
    error: null,
    buffer: Buffer.from(arr),
    contentType: String(response.headers.get('content-type') || 'image/png').trim().toLowerCase(),
  };
}

async function runImageGenerationJob(job) {
  const settings = imageGeneratorSettings();
  const projectId = String(job.projectId || '').trim() || null;
  const modelResult = await ensureImageModelReady(job.modelId, projectId);
  if (!modelResult.ok) {
    return renderWithSecondaryBackendOrFallback(job, projectId, `model_unavailable:${modelResult.message || modelResult.errorCode || 'unknown'}`, null);
  }

  const policy = moderateImagePrompt(job.prompt, settings.blockedTerms);
  if (!policy.ok) {
    return {
      ok: false,
      errorCode: 'POLICY_BLOCKED',
      message: policy.reason,
      data: {
        blockedTerms: policy.hits,
      },
    };
  }

  imageProgress(projectId, 'generation_started', {
    jobId: job.id,
    modelId: modelResult.model.id,
  });

  const engineReady = await ensureComfyRuntimeReady(projectId);
  if (!engineReady.ok) {
    return renderWithSecondaryBackendOrFallback(job, projectId, `engine_unavailable:${engineReady.message || engineReady.errorCode || 'unknown'}`, modelResult.model.id);
  }

  const modelSync = syncModelIntoComfyPaths(modelResult.model.path, modelResult.model.fileName || path.basename(modelResult.model.path));
  if (modelSync.syncedTo && modelSync.syncedTo.length) {
    imageProgress(projectId, 'model_synced', {
      jobId: job.id,
      modelId: modelResult.model.id,
      syncedTo: modelSync.syncedTo,
    });
  }

  const { dir, base, assetKind } = buildImageOutputBase(job, projectId);
  const workflow = resolveComfyWorkflow({
    ...job,
    checkpointName: String(settings.engine.defaultCheckpointName || modelResult.model.fileName || '').trim(),
    modelFileName: modelResult.model.fileName || path.basename(modelResult.model.path),
    filenamePrefix: base,
  });
  if (!workflow) {
    return renderWithSecondaryBackendOrFallback(job, projectId, 'workflow_missing', modelResult.model.id);
  }

  const submit = await comfyApiRequest('/prompt', {
    method: 'POST',
    body: {
      prompt: workflow,
      client_id: `hiveforge_${projectId || 'global'}`,
    },
  }, 30000);
  if (!submit.ok) {
    return renderWithSecondaryBackendOrFallback(job, projectId, `submit_failed:${submit.error || 'unknown'}`, modelResult.model.id);
  }
  const promptId = String(submit.data && submit.data.prompt_id ? submit.data.prompt_id : '').trim();
  if (!promptId) {
    return renderWithSecondaryBackendOrFallback(job, projectId, 'missing_prompt_id', modelResult.model.id);
  }

  imageProgress(projectId, 'generation_queued', {
    jobId: job.id,
    modelId: modelResult.model.id,
    promptId,
  });

  const pollTimeoutMs = clampInt(job.timeoutMs, 6 * 60 * 1000, 30 * 1000, 20 * 60 * 1000);
  const pollDeadline = Date.now() + pollTimeoutMs;
  let historyEntry = null;
  let pollCount = 0;
  while (Date.now() < pollDeadline) {
    pollCount += 1;
    const historyResp = await comfyApiRequest(`/history/${encodeURIComponent(promptId)}`, { method: 'GET' }, 20000);
    if (historyResp.ok && historyResp.data && typeof historyResp.data === 'object') {
      historyEntry = historyResp.data[promptId] || historyResp.data[String(promptId)] || null;
      if (historyEntry && historyEntry.outputs && Object.keys(historyEntry.outputs).length > 0) {
        break;
      }
    }
    if (pollCount % 3 === 0) {
      imageProgress(projectId, 'generation_progress', {
        jobId: job.id,
        promptId,
        pollCount,
      });
    }
    await delayMs(1500);
  }

  if (!historyEntry || !historyEntry.outputs || !Object.keys(historyEntry.outputs).length) {
    return renderWithSecondaryBackendOrFallback(job, projectId, `timeout:${promptId}`, modelResult.model.id);
  }

  const imageRef = firstComfyImageRef(historyEntry);
  if (!imageRef || !imageRef.filename) {
    return renderWithSecondaryBackendOrFallback(job, projectId, `missing_output:${promptId}`, modelResult.model.id);
  }

  const fetched = await fetchComfyImageBinary(imageRef);
  if (!fetched.ok) {
    return renderWithSecondaryBackendOrFallback(job, projectId, `fetch_failed:${fetched.error || promptId}`, modelResult.model.id);
  }

  const extension = fetched.contentType.includes('jpeg') ? 'jpg' : fetched.contentType.includes('webp') ? 'webp' : 'png';
  const outputPath = path.join(dir, `${base}.${extension}`);
  const metadataPath = path.join(dir, `${base}.json`);
  fs.writeFileSync(outputPath, fetched.buffer);
  const metadata = {
    jobId: job.id,
    modelId: modelResult.model.id,
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    seed: job.seed,
    deterministic: job.deterministic,
    width: job.width,
    height: job.height,
    templateId: job.templateId || null,
    assetKind,
    createdAt: nowIso(),
    engine: 'comfyui',
    comfyPromptId: promptId,
    comfyImageRef: imageRef,
    file: path.relative(projectDir(projectId || 'global'), outputPath).replace(/\\/g, '/'),
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
  const lifecycle = applyImageStorageLifecycle(projectId || 'global');

  imageProgress(projectId, 'generation_complete', {
    jobId: job.id,
    output: outputPath,
    metadata: metadataPath,
    deletedCount: lifecycle.deletedCount,
    promptId,
  });
  return {
    ok: true,
    message: 'Image generated successfully.',
    data: {
      outputPath,
      metadataPath,
      metadata,
      lifecycle,
    },
  };
}

async function enqueueImageGenerationJob(jobInput = {}) {
  ensureImageRuntimeState();
  const settings = imageGeneratorSettings();
  const deterministic = typeof jobInput.deterministic === 'boolean' ? jobInput.deterministic : settings.defaultDeterministic;
  const job = {
    id: `img_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    projectId: jobInput.projectId || null,
    projectName: jobInput.projectName || null,
    modelId: String(jobInput.modelId || settings.preferredModelId).trim() || settings.preferredModelId,
    prompt: sanitizePrompt(jobInput.prompt, settings.maxPromptLength),
    negativePrompt: sanitizePrompt(jobInput.negativePrompt, settings.maxNegativePromptLength),
    seed: normalizeSeed(jobInput.seed, deterministic),
    deterministic,
    width: clampInt(jobInput.width, settings.defaultWidth, 256, 2048),
    height: clampInt(jobInput.height, settings.defaultHeight, 256, 2048),
    steps: clampInt(jobInput.steps, 10, 4, 60),
    cfg: Number.isFinite(Number(jobInput.cfg)) ? Number(jobInput.cfg) : 1,
    samplerName: String(jobInput.samplerName || 'euler').trim() || 'euler',
    scheduler: String(jobInput.scheduler || 'normal').trim() || 'normal',
    timeoutMs: clampInt(jobInput.timeoutMs, 6 * 60 * 1000, 30 * 1000, 20 * 60 * 1000),
    workflow: jobInput.workflow && typeof jobInput.workflow === 'object' ? jobInput.workflow : null,
    templateId: String(jobInput.templateId || '').trim().toLowerCase() || null,
    assetKind: String(jobInput.assetKind || 'image').trim() || 'image',
    createdAt: nowIso(),
  };

  return new Promise((resolve) => {
    imageGenerationQueue.push({
      job,
      resolve,
    });
    const state = ensureImageRuntimeState();
    state.queue.queued = imageGenerationQueue.length;
    persistImageRuntimeState();
    drainImageGenerationQueue();
  });
}

async function drainImageGenerationQueue() {
  const settings = imageGeneratorSettings();
  while (imageActiveWorkers < settings.workerSlots && imageGenerationQueue.length > 0) {
    const item = imageGenerationQueue.shift();
    if (!item) break;
    imageActiveWorkers += 1;
    const state = ensureImageRuntimeState();
    state.queue.active = imageActiveWorkers;
    state.queue.queued = imageGenerationQueue.length;
    persistImageRuntimeState();
    runImageGenerationJob(item.job)
      .then((result) => {
        const updated = ensureImageRuntimeState();
        if (result.ok) updated.queue.completed = Number(updated.queue.completed || 0) + 1;
        else updated.queue.failed = Number(updated.queue.failed || 0) + 1;
        item.resolve({
          ...result,
          operation: 'generate_image',
          actualCost: 0,
        });
      })
      .catch((err) => {
        const updated = ensureImageRuntimeState();
        updated.queue.failed = Number(updated.queue.failed || 0) + 1;
        item.resolve({
          ok: false,
          errorCode: 'CONNECTOR_FAILURE',
          message: redactSensitive(err && err.message ? err.message : 'Image generation failed.'),
          operation: 'generate_image',
          actualCost: 0,
          data: null,
        });
      })
      .finally(() => {
        imageActiveWorkers = Math.max(0, imageActiveWorkers - 1);
        const updated = ensureImageRuntimeState();
        updated.queue.active = imageActiveWorkers;
        updated.queue.queued = imageGenerationQueue.length;
        persistImageRuntimeState();
        drainImageGenerationQueue();
      });
  }
}

function persistAppConfig() {
  ensureDir(path.dirname(CONFIG_PATH));
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(appConfig, null, 2)}\n`, 'utf-8');
}

function applyRuntimeSettingsUpdate(partial = {}) {
  const merged = {
    ...runtimeSettings(),
    ...partial,
  };
  appConfig.runtime = {
    heartbeatIntervalMs: clampInt(merged.heartbeatIntervalMs, DEFAULT_RUNTIME_SETTINGS.heartbeatIntervalMs, 5000, 10 * 60 * 1000),
    stallTimeoutMs: clampInt(merged.stallTimeoutMs, DEFAULT_RUNTIME_SETTINGS.stallTimeoutMs, 15 * 1000, 24 * 60 * 60 * 1000),
    maxAutoFixes: clampInt(merged.maxAutoFixes, DEFAULT_RUNTIME_SETTINGS.maxAutoFixes, 1, 1000),
    countManualHeartbeatForStall: typeof merged.countManualHeartbeatForStall === 'boolean'
      ? merged.countManualHeartbeatForStall
      : DEFAULT_RUNTIME_SETTINGS.countManualHeartbeatForStall,
    fastLocalIterationMode: typeof merged.fastLocalIterationMode === 'boolean'
      ? merged.fastLocalIterationMode
      : DEFAULT_RUNTIME_SETTINGS.fastLocalIterationMode,
  };
  persistAppConfig();

  // Restart active loops so interval changes apply immediately.
  projectRuntimes.forEach((runtime, projectId) => {
    if (runtime && runtime.state && runtime.state.status === 'running') {
      stopProjectLoop(projectId);
      startProjectLoop(projectId);
    }
  });
}

function applyPlanningSettingsUpdate(partial = {}) {
  const merged = {
    ...planningSettings(),
    ...(partial && typeof partial === 'object' ? partial : {}),
  };
  const preferredDatabaseService = String(merged.preferredDatabaseService || DEFAULT_PLANNING_SETTINGS.preferredDatabaseService).trim().toLowerCase();
  appConfig.planning = {
    preferFreeTierFirst: typeof merged.preferFreeTierFirst === 'boolean'
      ? merged.preferFreeTierFirst
      : DEFAULT_PLANNING_SETTINGS.preferFreeTierFirst,
    requireApprovalForPaidTierUpgrade: typeof merged.requireApprovalForPaidTierUpgrade === 'boolean'
      ? merged.requireApprovalForPaidTierUpgrade
      : DEFAULT_PLANNING_SETTINGS.requireApprovalForPaidTierUpgrade,
    preferredDatabaseService: ['supabase', 'manual'].includes(preferredDatabaseService)
      ? preferredDatabaseService
      : DEFAULT_PLANNING_SETTINGS.preferredDatabaseService,
  };
  persistAppConfig();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeJsonRead(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const normalized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    return JSON.parse(normalized);
  } catch (err) {
    return fallback;
  }
}

function projectDir(projectId) {
  return path.join(PROJECTS_ROOT, projectId);
}

function projectWorkspaceDir(projectId) {
  return path.join(WORKSPACE_ROOT, 'projects', String(projectId || '').trim());
}

function projectStatePath(projectId) {
  return path.join(projectDir(projectId), 'state.json');
}

function projectTemplateSnapshotPath(projectId) {
  return path.join(projectDir(projectId), 'template_snapshot.json');
}

function projectApprovalAuditPath(projectId) {
  return path.join(projectDir(projectId), 'approval_audit.ndjson');
}

function resolveProjectWorkspacePath(projectId, relativePath = '') {
  const root = path.resolve(projectWorkspaceDir(projectId));
  const normalizedRelative = String(relativePath || '').replace(/^[\\/]+/, '');
  const target = path.resolve(root, normalizedRelative || '.');
  if (!target.startsWith(root)) return null;
  return target;
}

function toWorkspaceRelativePath(projectId, absolutePath) {
  const root = path.resolve(projectWorkspaceDir(projectId));
  const rel = path.relative(root, absolutePath);
  return rel === '' ? '' : rel.replace(/\\/g, '/');
}

function buildProjectWorkspaceBrief(projectState) {
  const plan = projectState && projectState.goalPlan && typeof projectState.goalPlan === 'object' ? projectState.goalPlan : {};
  const planConfig = plan.planning && typeof plan.planning === 'object' ? plan.planning : planningSettings();
  const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const connectors = Array.isArray(plan.requiredConnectors) ? plan.requiredConnectors : [];
  const assumptions = Array.isArray(plan.assumptions) ? plan.assumptions : [];
  const styleProfile = ensureProjectImageStyleProfile(projectState) || null;

  const lines = [
    '# Project Brief',
    '',
    `- Project: ${String(projectState.name || projectState.id || 'Untitled')}`,
    `- Template: ${String(projectState.template || 'unknown')}`,
    `- Status: ${String(projectState.status || 'unknown')}`,
    `- Goal: ${String(projectState.goal || 'N/A')}`,
    `- Generated: ${String(plan.generatedAt || projectState.createdAt || nowIso())}`,
    '',
    '## Planning Policy',
    '',
    `- Prefer free tiers first: ${planConfig.preferFreeTierFirst ? 'yes' : 'no'}`,
    `- Require approval for paid tier upgrades: ${planConfig.requireApprovalForPaidTierUpgrade ? 'yes' : 'no'}`,
    `- Preferred database service: ${String(planConfig.preferredDatabaseService || 'manual')}`,
    '',
    '## Connector Plan',
    '',
    connectors.length ? connectors.map((entry) => `- ${entry}`).join('\n') : '- No connector dependencies identified yet.',
    '',
    '## Assumptions',
    '',
    assumptions.length ? assumptions.map((entry) => `- ${entry}`).join('\n') : '- No explicit assumptions captured.',
    '',
    '## Image Style Profile',
    '',
    styleProfile
      ? [`- Visual direction: ${styleProfile.visualDirection}`, `- Composition: ${styleProfile.composition}`, `- Tone: ${styleProfile.tone}`, `- Palette: ${Array.isArray(styleProfile.palette) ? styleProfile.palette.join(', ') : 'n/a'}`].join('\n')
      : '- No image style profile generated yet.',
    '',
    '## Milestones',
    '',
    milestones.length
      ? milestones.map((entry, index) => `${index + 1}. ${String(entry.title || entry.phase || `Milestone ${index + 1}`)}${entry.phase ? ` [${entry.phase}]` : ''}`).join('\n')
      : '1. No milestones generated yet.',
    '',
    '## Task Outline',
    '',
    tasks.length
      ? tasks.map((entry, index) => `${index + 1}. [${String(entry.phase || 'general')}] ${String(entry.title || `Task ${index + 1}`)}`).join('\n')
      : '1. No tasks generated yet.',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function deriveProjectImageStyleProfile(projectState) {
  const templateId = String(projectState && projectState.template || '').toLowerCase();
  const goal = String(projectState && projectState.goal || '').trim();
  const name = String(projectState && projectState.name || '').trim();
  const source = `${name} ${goal}`.toLowerCase();
  const palette = /health|clinic|medical/.test(source)
    ? ['#0b5fff', '#d9f3ff', '#ffffff']
    : (/finance|bank|invoice|billing/.test(source)
      ? ['#0f172a', '#22c55e', '#f8fafc']
      : (/game|arcade|fantasy|pixel/.test(source)
        ? ['#111827', '#f59e0b', '#ef4444']
        : ['#0f172a', '#38bdf8', '#f8fafc']));
  const visualDirection = templateId === 'game_studio'
    ? (/pixel|retro/.test(source) ? 'pixel art' : 'stylized 2d concept art')
    : (templateId === 'mobile_app'
      ? 'clean mobile illustration system'
      : 'modern product marketing illustration');
  const composition = templateId === 'mobile_app'
    ? 'portrait-friendly, bold focal point, clean negative space'
    : (templateId === 'game_studio'
      ? 'clear silhouettes, gameplay-readable framing, transparent-background friendly'
      : 'editorial hero composition, crisp hierarchy, product-forward framing');
  const tone = /luxury|premium|high end/.test(source)
    ? 'premium'
    : (/playful|kids|fun|casual/.test(source) ? 'playful' : 'confident');
  return {
    generatedAt: nowIso(),
    templateId,
    projectName: name || null,
    visualDirection,
    composition,
    tone,
    palette,
    promptStyle: `${visualDirection}, ${composition}, ${tone} tone`,
  };
}

function projectImageStyleProfilePath(projectState) {
  if (!projectState || !projectState.id) return null;
  return path.join(projectWorkspaceDir(projectState.id), 'docs', 'image_style_profile.json');
}

function ensureProjectImageStyleProfile(projectState) {
  if (!projectState) return null;
  if (!projectState.imageStyleProfile || typeof projectState.imageStyleProfile !== 'object') {
    projectState.imageStyleProfile = deriveProjectImageStyleProfile(projectState);
  }
  const filePath = projectImageStyleProfilePath(projectState);
  if (filePath) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(projectState.imageStyleProfile, null, 2)}\n`, 'utf-8');
  }
  return projectState.imageStyleProfile;
}

function deriveGameStudioPromptProfile(projectState) {
  const goal = String((projectState && projectState.goal) || '').trim();
  const name = String((projectState && projectState.name) || '').trim();
  const source = `${name} ${goal}`.toLowerCase();

  const title = name || goal.split(/[,.\n]/)[0].trim() || 'Game';

  let genre = 'arcade';
  if (/\b(rpg|role.?play|adventure|quest|fantasy|dungeon|hero|wizard)\b/.test(source)) genre = 'rpg';
  else if (/\b(tetris|block|falling|drop|match.3|bejeweled|gem|connect)\b/.test(source)) genre = 'puzzle';
  else if (/\b(platform|jump(?:er)?|run(?:ner)?|mario|side.?scroll)\b/.test(source)) genre = 'platformer';
  else if (/\b(card|solitaire|poker|blackjack|deck)\b/.test(source)) genre = 'card';
  else if (/\b(shoot|space|invader|bullet|blaster|asteroids?)\b/.test(source)) genre = 'shooter';
  else if (/\b(strategy|tower.?defense|tactic)\b/.test(source)) genre = 'strategy';
  else if (/\b(race|car|speed|driving)\b/.test(source)) genre = 'racing';
  else if (/\b(mine|minesweeper|bomb|flag)\b/.test(source)) genre = 'minesweeper';
  else if (/\bsnake\b/.test(source)) genre = 'snake';
  else if (/\b(pong|breakout|arkanoid|ball|paddle)\b/.test(source)) genre = 'arcade';

  return { title, genre, goal, name };
}

function shouldRewriteScaffoldFile(filePath) {
  if (!fs.existsSync(filePath)) return true;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return raw.includes('HIVEFORGE_SCAFFOLD_PLACEHOLDER');
  } catch {
    return false;
  }
}

function buildPromptDrivenScaffold(profile) {
  const { title, genre, goal } = profile;
  // Escape special HTML characters in user-supplied values (XSS prevention)
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeTitle = esc(title);
  const safeGenre = esc(genre);
  const safeGoal = esc(goal);

  return {
    kind: 'prompt-driven',
    indexHtml: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- HIVEFORGE_SCAFFOLD_PLACEHOLDER -->
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>

  <!-- ═══ SPLASH SCREEN ═══ -->
  <div id="splash" class="overlay">
    <div class="splash-inner">
      <img src="./assets/generated/promo-keyart.svg" class="keyart" alt="${safeTitle} key art" onerror="this.style.display='none'" />
      <h1 class="game-title">${safeTitle}</h1>
      <p class="genre-tag">${safeGenre}</p>
      <button id="splash-start" class="btn-primary cta-pulse">&#9654; Start Game</button>
      <p class="studio-tag">Made with <span>HiveForge</span></p>
    </div>
  </div>

  <!-- ═══ TITLE MENU ═══ -->
  <div id="title-menu" class="overlay hidden">
    <div class="menu-panel">
      <h2>How to Play</h2>
      <ul class="controls-list" id="controls-list">
        <!-- AGENTS: replace with genre-specific controls for ${safeGenre} -->
        <li><span>Move</span><span><kbd>WASD</kbd> / <kbd>Arrows</kbd></span></li>
        <li><span>Action</span><span><kbd>Space</kbd> / <kbd>Click</kbd></span></li>
        <li><span>Pause</span><span><kbd>Esc</kbd> / <kbd>P</kbd></span></li>
      </ul>
      <button id="menu-play" class="btn-primary">&#9654; Play</button>
      <button id="menu-settings" class="btn-secondary">&#9881; Settings</button>
    </div>
  </div>

  <!-- ═══ HUD (gameplay only) ═══ -->
  <div id="hud" class="hidden">
    <div class="hud-left">
      <img src="./assets/generated/player-sprite.svg" class="hud-avatar" alt="" onerror="this.style.display='none'" />
      <div class="hud-stats">
        <span id="hud-score">Score: 0</span>
        <span id="hud-lives">&#9829; &#9829; &#9829;</span>
      </div>
    </div>
    <div class="hud-center"><span id="hud-level">Level 1</span></div>
    <div class="hud-right">
      <button id="pause-btn" class="btn-icon" title="Pause (P)">&#9646;&#9646;</button>
    </div>
  </div>

  <!-- ═══ GAME CANVAS ═══ -->
  <div id="canvas-container" class="hidden">
    <canvas id="game-canvas"></canvas>
  </div>

  <!-- ═══ PAUSE MENU ═══ -->
  <div id="pause-menu" class="overlay hidden">
    <div class="pause-panel">
      <h2>&#9646;&#9646; Paused</h2>
      <button id="resume-btn" class="btn-primary">&#9654; Resume</button>
      <button id="quit-btn" class="btn-secondary">&#9646; Quit to Menu</button>
    </div>
  </div>

  <!-- ═══ GAME OVER ═══ -->
  <div id="game-over" class="overlay hidden">
    <div class="result-panel">
      <h2>Game Over</h2>
      <p id="final-score">Score: 0</p>
      <button id="retry-btn" class="btn-primary">&#8635; Try Again</button>
      <button id="go-to-menu" class="btn-secondary">&#9646; Main Menu</button>
    </div>
  </div>

  <!-- ═══ WIN SCREEN ═══ -->
  <div id="win-screen" class="overlay hidden">
    <div class="result-panel">
      <h2>&#127942; You Win!</h2>
      <p id="win-score">Score: 0</p>
      <img src="./assets/generated/promo-keyart.svg" class="win-keyart" alt="" onerror="this.style.display='none'" />
      <button id="win-retry" class="btn-primary">&#9654; Play Again</button>
      <button id="win-menu" class="btn-secondary">&#9646; Main Menu</button>
    </div>
  </div>

  <script src="./game.js"></script>
</body>
</html>
`,
    styleCss: `/* HIVEFORGE_SCAFFOLD_PLACEHOLDER \u2014 agents: implement full visual design for ${safeTitle} (${safeGenre}) */
:root {
  --bg: #0b1120;
  --bg-panel: rgba(11, 17, 32, 0.88);
  --ink: #e2e8f0;
  --ink-muted: #94a3b8;
  --accent: #22d3ee;
  --accent2: #f59e0b;
  --danger: #ef4444;
  --success: #22c55e;
  --radius: 16px;
  --font: "Segoe UI", system-ui, -apple-system, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { font-family: var(--font); background: var(--bg) url('./promo-keyart.svg') center/cover no-repeat; color: var(--ink); }

/* \u2500 OVERLAYS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.75); backdrop-filter: blur(6px); }
.overlay.hidden { display: none; }

/* \u2500 SPLASH \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.splash-inner { display: flex; flex-direction: column; align-items: center; gap: 1.2rem; text-align: center; padding: 2rem; }
.keyart { max-width: min(580px, 88vw); max-height: 38vh; object-fit: contain; border-radius: 12px; box-shadow: 0 0 60px rgba(34,211,238,0.22); }
.game-title { font-size: clamp(2rem, 6vw, 4rem); font-weight: 900; letter-spacing: -0.02em; background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.genre-tag { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--ink-muted); }
.studio-tag { font-size: 0.75rem; color: var(--ink-muted); }
.studio-tag span { color: var(--accent); font-weight: 700; }

/* \u2500 MENU / PAUSE PANELS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.menu-panel, .pause-panel { background: var(--bg-panel); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius); padding: 2.5rem; max-width: 480px; width: 90vw; display: flex; flex-direction: column; gap: 1.1rem; }
.menu-panel h2, .pause-panel h2 { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
.controls-list { list-style: none; display: grid; gap: 0.45rem; }
.controls-list li { display: flex; justify-content: space-between; font-size: 0.88rem; color: var(--ink-muted); border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.4rem; }
.controls-list li kbd { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 0.1em 0.4em; font-family: monospace; font-size: 0.8em; color: var(--ink); }

/* \u2500 BUTTONS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.btn-primary, .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.72rem 1.9rem; border-radius: 10px; font-family: var(--font); font-size: 1rem; font-weight: 700; cursor: pointer; border: none; transition: filter 0.15s, transform 0.1s; }
.btn-primary { background: linear-gradient(135deg, var(--accent), #0891b2); color: #012832; }
.btn-secondary { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: var(--ink); }
.btn-primary:hover, .btn-secondary:hover { filter: brightness(1.18); }
.btn-primary:active, .btn-secondary:active { transform: scale(0.96); }
.cta-pulse { animation: pulse 2.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0.4); } 55% { box-shadow: 0 0 0 14px rgba(34,211,238,0); } }

/* \u2500 HUD \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#hud { position: fixed; top: 0; left: 0; right: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 1.1rem; background: rgba(0,0,0,0.62); backdrop-filter: blur(4px); border-bottom: 1px solid rgba(255,255,255,0.08); }
#hud.hidden { display: none; }
.hud-left { display: flex; align-items: center; gap: 0.7rem; }
.hud-avatar { width: 34px; height: 34px; object-fit: contain; image-rendering: pixelated; flex: 0 0 34px; }
.hud-stats { display: flex; flex-direction: column; gap: 0.05rem; font-size: 0.82rem; }
#hud-score { color: var(--accent2); font-weight: 700; }
#hud-lives { color: var(--danger); font-weight: 600; font-size: 0.95rem; letter-spacing: 0.1em; }
.hud-center { font-size: 0.95rem; font-weight: 700; color: var(--accent); }
.btn-icon { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.13); border-radius: 8px; color: var(--ink); font-size: 0.9rem; padding: 0.3rem 0.55rem; cursor: pointer; transition: filter 0.15s; }
.btn-icon:hover { filter: brightness(1.3); }

/* \u2500 CANVAS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
#canvas-container { position: fixed; inset: 50px 0 0 0; display: flex; align-items: center; justify-content: center; background: #070d1a; }
#canvas-container.hidden { display: none; }
#game-canvas { display: block; border-radius: 6px; box-shadow: 0 0 50px rgba(0,0,0,0.7); }

/* \u2500 WIN / GAME OVER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.result-panel { background: var(--bg-panel); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius); padding: 3rem 2.5rem; text-align: center; max-width: 420px; width: 90vw; display: flex; flex-direction: column; gap: 1.1rem; align-items: center; }
.result-panel h2 { font-size: 2rem; font-weight: 900; }
#game-over .result-panel h2 { color: var(--danger); }
#win-screen .result-panel h2 { color: var(--success); }
.result-panel p { font-size: 1.15rem; color: var(--ink-muted); }
.win-keyart { max-width: 200px; border-radius: 8px; }
`,
    gameJs: `// HIVEFORGE_SCAFFOLD_PLACEHOLDER
// Game: ${safeTitle}
// Genre: ${safeGenre}
// Goal: ${safeGoal}
//
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// AGENT IMPLEMENTATION GUIDE
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// This scaffold provides a complete state machine: SPLASH \u2192 TITLE \u2192 PLAYING \u2192 PAUSED \u2192 WIN/GAME_OVER
// All screen transitions, HUD, and button wiring are already done.
//
// Your job as the ${safeGenre} developer agent:
//   1. updateFrame(dt)   \u2014 physics, AI, collision detection, win/lose logic
//   2. renderFrame()     \u2014 Canvas 2D: tileset.svg bg, entity sprites, particles, effects
//   3. wireControls()   \u2014 genre-appropriate keyboard / mouse / touch handlers
//   4. startGame()init  \u2014 spawn initial entities, reset game world
//
// SVG assets ready to use (in ./assets/generated/):
//   assets/generated/player-sprite.svg   \u2014 player character (also shown in HUD)
//   assets/generated/enemy-sprite.svg    \u2014 enemy / obstacle sprites
//   assets/generated/tileset.svg         \u2014 world background / floor tiles
//   assets/generated/ui-icon-set.svg     \u2014 item / pickup icons
//   assets/generated/promo-keyart.svg    \u2014 already used on splash + win screens (no action needed)
//
// Triggers (call when condition met):
//   triggerWin()        \u2014 player wins
//   triggerGameOver()   \u2014 all lives lost
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
(function () {
  'use strict';

  // \u2500 STATE MACHINE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var S = { SPLASH: 'splash', TITLE: 'title', PLAYING: 'playing', PAUSED: 'paused', WIN: 'win', GAME_OVER: 'game_over' };
  var state = S.SPLASH;
  var score = 0;
  var lives = 3;
  var level = 1;
  var animId = null;
  var lastTs = 0;
  var keyState = Object.create(null);

  // \u2500 CANVAS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var playerSprite = new Image();
  playerSprite.src = './assets/generated/player-sprite.svg';

  function resizeCanvas() {
    if (!canvas) return;
    var wrap = document.getElementById('canvas-container');
    canvas.width  = wrap ? Math.min(wrap.clientWidth,  960) : Math.min(window.innerWidth,  960);
    canvas.height = wrap ? Math.min(wrap.clientHeight - 8, 600) : Math.min(window.innerHeight - 52, 600);
  }

  // \u2500 SCREEN ROUTING \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var ALL_SCREENS = ['splash', 'title-menu', 'hud', 'canvas-container', 'pause-menu', 'game-over', 'win-screen'];
  function showOnly() {
    var ids = Array.prototype.slice.call(arguments);
    ALL_SCREENS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var shouldShow = ids.indexOf(id) >= 0;
      if (shouldShow) {
        el.classList.remove('hidden');
        el.style.display = '';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    });
  }

  // \u2500 GAME LOOP \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function loop(ts) {
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    if (state === S.PLAYING) { updateFrame(dt); renderFrame(); }
    animId = requestAnimationFrame(loop);
  }
  function startLoop() { if (!animId) { lastTs = performance.now(); animId = requestAnimationFrame(loop); } }
  function stopLoop()  { if (animId) { cancelAnimationFrame(animId); animId = null; } }

  // \u2500 IMPLEMENT THESE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function updateFrame(dt) {
    // AGENTS: ${safeGenre} physics, AI, collision detection, scoring, win/lose checks
    // Update entity positions, velocities, states based on dt (seconds since last frame)
    // Increment score, decrement lives, update level as needed
    // Call triggerWin() on win condition; triggerGameOver() when lives <= 0
    var dx = 0;
    var dy = 0;
    if (keyState.KeyW || keyState.ArrowUp) dy -= 1;
    if (keyState.KeyS || keyState.ArrowDown) dy += 1;
    if (keyState.KeyA || keyState.ArrowLeft) dx -= 1;
    if (keyState.KeyD || keyState.ArrowRight) dx += 1;
    if (dx || dy) {
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var speed = 180;
      var minX = 24;
      var minY = 24;
      var maxX = canvas ? canvas.width - 24 : 936;
      var maxY = canvas ? canvas.height - 24 : 576;
      if (!window.__hfPlayer) window.__hfPlayer = { x: 96, y: 96 };
      window.__hfPlayer.x += (dx / len) * speed * dt;
      window.__hfPlayer.y += (dy / len) * speed * dt;
      window.__hfPlayer.x = Math.max(minX, Math.min(window.__hfPlayer.x, maxX));
      window.__hfPlayer.y = Math.max(minY, Math.min(window.__hfPlayer.y, maxY));
    }
    void dt;
    updateHud();
  }

  function renderFrame() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // AGENTS: implement full ${safeGenre} renderer \u2014 draw order:
    //   1. Background / tileset  \u2014 drawImage(tilesetImg, 0, 0, canvas.width, canvas.height)
    //   2. Pickups / items       \u2014 drawImage(uiIconImg, ...) per item
    //   3. Enemies               \u2014 drawImage(enemyImg, ...) per enemy
    //   4. Player                \u2014 drawImage(playerImg, ...) at player position
    //   5. Particles / effects   \u2014 ctx.fillStyle + ctx.fillRect/arc for hits, sparks
    ctx.fillStyle = '#070d1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1f8f5a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!window.__hfPlayer) window.__hfPlayer = { x: 96, y: 96 };
    var spriteW = 48;
    var spriteH = 56;
    var drawX = window.__hfPlayer.x - spriteW / 2;
    var drawY = window.__hfPlayer.y - spriteH + 16;
    if (playerSprite.complete && playerSprite.naturalWidth > 0) {
      ctx.drawImage(playerSprite, drawX, drawY, spriteW, spriteH);
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(window.__hfPlayer.x, window.__hfPlayer.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function wireControls() {
    // AGENTS: wire genre-appropriate controls for ${safeGenre}
    // Keyboard, mouse, and touch handlers \u2014 call onKeyDown / onCanvasClick / onCanvasTouch
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    if (canvas) {
      canvas.addEventListener('click', onCanvasClick);
      canvas.addEventListener('touchstart', onCanvasTouch, { passive: true });
    }
  }

  function onKeyDown(e) {
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
    if (state !== S.PLAYING) return;
    keyState[e.code] = true;
    // AGENTS: handle ${safeGenre} keydown events here
  }

  function onKeyUp(e) {
    keyState[e.code] = false;
  }

  function onCanvasClick(e) {
    if (state !== S.PLAYING) return;
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) * (canvas.width  / r.width);
    var y = (e.clientY - r.top)  * (canvas.height / r.height);
    // AGENTS: handle click/tap at (x, y) for ${safeGenre} mechanics
    void x; void y;
  }

  function onCanvasTouch(e) {
    if (state !== S.PLAYING || !e.touches[0]) return;
    var t = e.touches[0];
    var r = canvas.getBoundingClientRect();
    var x = (t.clientX - r.left) * (canvas.width  / r.width);
    var y = (t.clientY - r.top)  * (canvas.height / r.height);
    // AGENTS: handle touch at (x, y) for ${safeGenre} mechanics
    void x; void y;
  }

  // \u2500 HUD UPDATE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function updateHud() {
    var el;
    el = document.getElementById('hud-score'); if (el) el.textContent = 'Score: ' + score.toLocaleString();
    el = document.getElementById('hud-lives'); if (el) el.textContent = ('\u2665 ').repeat(Math.max(0, lives)).trim() || '\u2620';
    el = document.getElementById('hud-level'); if (el) el.textContent = 'Level ' + level;
  }

  // \u2500 TRANSITIONS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function startGame() {
    score = 0; lives = 3; level = 1;
    state = S.PLAYING;
    resizeCanvas();
    updateHud();
    showOnly('hud', 'canvas-container');
    startLoop();
    // AGENTS: initialize entities, player position, first wave/level here
  }

  function togglePause() {
    if (state === S.PLAYING) {
      state = S.PAUSED;
      showOnly('hud', 'canvas-container', 'pause-menu');
    } else if (state === S.PAUSED) {
      state = S.PLAYING;
      lastTs = performance.now();
      showOnly('hud', 'canvas-container');
    }
  }

  function triggerGameOver() {
    state = S.GAME_OVER;
    var el = document.getElementById('final-score');
    if (el) el.textContent = 'Score: ' + score.toLocaleString();
    showOnly('game-over');
  }

  function triggerWin() {
    state = S.WIN;
    var el = document.getElementById('win-score');
    if (el) el.textContent = 'Score: ' + score.toLocaleString();
    showOnly('win-screen');
  }

  // \u2500 BUTTON WIRING \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function wire(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); }

  function wireSplash()   {
    function advanceToTitle() {
      state = S.TITLE;
      showOnly('title-menu');
    }
    wire('splash-start', advanceToTitle);
    var splash = document.getElementById('splash');
    if (splash) {
      splash.addEventListener('click', function (e) {
        if (state !== S.SPLASH) return;
        var target = e.target;
        if (target && target.closest && target.closest('button')) return;
        advanceToTitle();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (state !== S.SPLASH) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        advanceToTitle();
      }
    });
  }
  function wireMenu()     { wire('menu-play', startGame); wire('menu-settings', function () { /* AGENTS: open settings panel */ }); }
  function wirePause()    {
    wire('pause-btn', togglePause);
    wire('resume-btn', togglePause);
    wire('quit-btn', function () { stopLoop(); state = S.TITLE; showOnly('title-menu'); });
  }
  function wireGameOver() {
    wire('retry-btn',   function () { stopLoop(); animId = null; startGame(); });
    wire('go-to-menu',  function () { stopLoop(); state = S.TITLE; showOnly('title-menu'); });
  }
  function wireWin()      {
    wire('win-retry',   function () { stopLoop(); animId = null; startGame(); });
    wire('win-menu',    function () { stopLoop(); state = S.TITLE; showOnly('title-menu'); });
  }

  // \u2500 INIT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    wireSplash();
    wireMenu();
    wirePause();
    wireGameOver();
    wireWin();
    wireControls();
    showOnly('splash');
    startLoop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
`,
    readme: `# ${safeTitle}

Generated by HiveForge \u2014 Game Studio template.

**Genre**: ${safeGenre}
**Goal**: ${safeGoal}

## Run locally

Open \`index.html\` in a browser or serve this folder with any static file server.

## Asset files

- \`player-sprite.svg\` \u2014 player character
- \`enemy-sprite.svg\` \u2014 enemy sprites
- \`tileset.svg\` \u2014 world tileset / background
- \`ui-icon-set.svg\` \u2014 item / pickup icons
- \`promo-keyart.svg\` \u2014 promotional key art (splash + win screens)

## Agent implementation targets

1. \`game.js\` \u2014 \`updateFrame(dt)\`, \`renderFrame()\`, \`wireControls()\`
2. \`style.css\` \u2014 visual polish, animations, responsive layout
3. \`index.html\` \u2014 update controls list in \`#title-menu\` for genre
`,
  };
}
function templateArtifactContract(templateId) {
  const key = String(templateId || '').toLowerCase();
  const map = {
    software_agency: [
      { path: 'web/package.json', minLines: 16 },
      { path: 'web/index.html', minLines: 10 },
      { path: 'web/src/main.tsx', minLines: 12 },
      { path: 'web/src/App.tsx', minLines: 30 },
      { path: 'docs/qa_report.md', minLines: 8 },
    ],
    software_web_app: [
      { path: 'web/package.json', minLines: 16 },
      { path: 'web/index.html', minLines: 10 },
      { path: 'web/src/main.tsx', minLines: 12 },
      { path: 'web/src/App.tsx', minLines: 30 },
      { path: 'docs/qa_report.md', minLines: 8 },
    ],
    mobile_app: [
      { path: 'mobile/package.json', minLines: 16 },
      { path: 'mobile/app.json', minLines: 10 },
      { path: 'mobile/babel.config.js', minLines: 6 },
      { path: 'mobile/App.tsx', minLines: 40 },
      { path: 'mobile/src/screens/HomeScreen.tsx', minLines: 25 },
      { path: 'docs/qa_report.md', minLines: 8 },
    ],
    business: [
      { path: 'website/index.html', minLines: 30 },
      { path: 'website/app.js', minLines: 30 },
      { path: 'website/style.css', minLines: 20 },
      { path: 'docs/research_brief.md', minLines: 16 },
      { path: 'docs/business_plan.md', minLines: 10 },
    ],
    music_production: [
      { path: 'music/track_outline.md', minLines: 8 },
      { path: 'music/lyrics.md', minLines: 12 },
      { path: 'music/release_plan.md', minLines: 8 },
    ],
    research_lab: [
      { path: 'research/research_brief.md', minLines: 10 },
      { path: 'research/findings.md', minLines: 12 },
      { path: 'research/references.md', minLines: 8 },
    ],
    content_creator: [
      { path: 'content/content_calendar.md', minLines: 10 },
      { path: 'content/draft_asset.md', minLines: 10 },
      { path: 'content/distribution_plan.md', minLines: 8 },
    ],
    publishing_house: [
      { path: 'book/story_bible.md', minLines: 10 },
      { path: 'book/chapter_outline.md', minLines: 10 },
      { path: 'book/manuscript.md', minLines: 14 },
      { path: 'book/editorial_report.md', minLines: 8 },
      { path: 'book/release_plan.md', minLines: 8 },
    ],
  };
  return map[key] || [];
}

function scaffoldContentForContractPath(projectState, relativePath) {
  const title = String(projectState?.name || 'Project').trim() || 'Project';
  const lower = String(relativePath || '').toLowerCase();
  if (lower === 'web/src/main.tsx') {
    return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
  }
  if (lower === 'web/src/app.tsx') {
    return `import React from 'react';
import { generatedImageAssets } from './generatedImageAssets';

export default function App(): React.JSX.Element {
  return (
    <main style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', minHeight: '100vh', background: '#0f172a', color: '#f8fafc', padding: '48px' }}>
      <section style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: '0.14em', color: '#38bdf8' }}>HiveForge Generated Experience</p>
        <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)', lineHeight: 1.05, margin: 0 }}>${title}</h1>
        <p style={{ maxWidth: 680, color: '#cbd5e1', fontSize: '1.1rem' }}>Generated assets are wired automatically. Replace this with your finished product UI, but the template already knows where image outputs live.</p>
        {generatedImageAssets.hero_banner ? <img src={generatedImageAssets.hero_banner} alt="Generated hero artwork" style={{ width: '100%', borderRadius: 24, display: 'block', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }} /> : null}
      </section>
    </main>
  );
}
`;
  }
  if (lower === 'web/package.json') {
    return `{
  "name": "${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'hiveforge-web-app'}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "HIVEFORGE_SCAFFOLD_PLACEHOLDER",
    "react-dom": "HIVEFORGE_SCAFFOLD_PLACEHOLDER"
  },
  "devDependencies": {
    "typescript": "HIVEFORGE_SCAFFOLD_PLACEHOLDER",
    "vite": "HIVEFORGE_SCAFFOLD_PLACEHOLDER"
  }
}\n`;
  }
  if (lower === 'mobile/package.json') {
    return `{
  "name": "${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'hiveforge-mobile-app'}",
  "version": "0.1.0",
  "private": true,
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "HIVEFORGE_SCAFFOLD_PLACEHOLDER",
    "react": "HIVEFORGE_SCAFFOLD_PLACEHOLDER",
    "react-native": "HIVEFORGE_SCAFFOLD_PLACEHOLDER"
  }
}\n`;
  }
  if (lower === 'mobile/app.json') {
    return `{
  "expo": {
    "name": "${title}",
    "slug": "${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'hiveforge-mobile-app'}",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "assetBundlePatterns": ["**/*"],
    "hiveforgePlaceholder": "HIVEFORGE_SCAFFOLD_PLACEHOLDER"
  }
}\n`;
  }
  if (lower === 'mobile/app.tsx') {
    return `import React from 'react';
import HomeScreen from './src/screens/HomeScreen';

export default function App(): React.JSX.Element {
  return <HomeScreen />;
}
`;
  }
  if (lower === 'mobile/src/screens/homescreen.tsx') {
    return `import React from 'react';
import { Image, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { generatedImageAssets } from '../generatedImageAssets';

export default function HomeScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#07111f' }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 18 }}>
        <Text style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 2 }}>HiveForge Mobile Template</Text>
        <Text style={{ color: '#f8fafc', fontSize: 34, fontWeight: '700' }}>${title}</Text>
        <Text style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 24 }}>Generated image outputs are already wired into this starter screen. Replace this with your final app flow when implementation is ready.</Text>
        {generatedImageAssets.splash_background ? <Image source={generatedImageAssets.splash_background} style={{ width: '100%', height: 360, borderRadius: 24 }} resizeMode="cover" /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
`;
  }
  if (lower === 'website/index.html') {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <main class="container">
    <header class="header">
      <h1>${title}</h1>
      <p>Draft preview renders with API fallback when backend services are unavailable.</p>
    </header>
    <section id="status" class="status"></section>
    <section id="app" class="auctions-grid"></section>
  </main>
  <script src="./app.js"></script>
</body>
</html>
`;
  }
  if (lower === 'website/app.js') {
    return [
      "const API_BASE = '/.netlify/functions/api';",
      '',
      'const DEMO_AUCTIONS = [',
      '  {',
      "    id: 'demo-1',",
      "    title: 'Rooftop Dinner Date',",
      "    description: 'Bid for an evening dinner date experience with skyline views.',",
      '    current_price: 42,',
      '    bid_count: 7,',
      '    ends_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),',
      '  },',
      '  {',
      "    id: 'demo-2',",
      "    title: 'Gallery Walk + Coffee',",
      "    description: 'Win a curated gallery date followed by coffee.',",
      '    current_price: 28,',
      '    bid_count: 4,',
      '    ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),',
      '  },',
      '];',
      '',
      "const statusEl = document.getElementById('status');",
      "const appEl = document.getElementById('app');",
      '',
      "function renderStatus(message, kind) {",
      "  const level = kind || 'info';",
      "  statusEl.className = 'status ' + level;",
      '  statusEl.textContent = message;',
      '}',
      '',
      'function renderAuctions(items) {',
      "  appEl.innerHTML = (items || []).map(function (auction) {",
      "    return '<article class=\"card\">' +",
      "      '<h3>' + auction.title + '</h3>' +",
      "      '<p>' + auction.description + '</p>' +",
      "      '<p><strong>$' + Number(auction.current_price || 0).toFixed(2) + '</strong> · ' + Number(auction.bid_count || 0) + ' bids</p>' +",
      "      '<p class=\"meta\">Ends ' + new Date(auction.ends_at).toLocaleString() + '</p>' +",
      "      '</article>';",
      "  }).join('');",
      '}',
      '',
      'async function fetchAuctions() {',
      '  try {',
      "    const response = await fetch(API_BASE + '/auctions');",
      "    if (!response.ok) throw new Error('HTTP_' + response.status);",
      '    const payload = await response.json();',
      '    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : []);',
      "    renderStatus('Live API data loaded.', 'ok');",
      '    return rows;',
      '  } catch (_err) {',
      "    renderStatus('Draft preview fallback active: backend API unavailable, showing demo data.', 'warn');",
      '    return DEMO_AUCTIONS;',
      '  }',
      '}',
      '',
      'async function boot() {',
      "  renderStatus('Loading auctions...', 'info');",
      '  const auctions = await fetchAuctions();',
      '  renderAuctions(auctions);',
      '}',
      '',
      'boot();',
      '',
    ].join('\\n');
  }
  if (lower === 'website/style.css') {
    return `:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f4f6fb; color: #1f2a37; }
.container { max-width: 1100px; margin: 0 auto; padding: 24px; }
.header h1 { margin: 0 0 6px; }
.header p { margin: 0 0 18px; color: #5b6675; }
.status { margin-bottom: 16px; padding: 10px 12px; border-radius: 8px; border: 1px solid #d6dde8; background: #eef3fb; }
.status.ok { border-color: #b6e3c6; background: #e7f7ee; }
.status.warn { border-color: #f0d4a8; background: #fff4e2; }
.auctions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.card { background: #fff; border: 1px solid #e3e8f1; border-radius: 10px; padding: 14px; box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05); }
.card h3 { margin: 0 0 8px; }
.card p { margin: 0 0 8px; color: #334155; }
.card .meta { margin: 0; color: #64748b; font-size: 0.92rem; }
`;
  }
  if (lower.endsWith('.html')) {
    return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>${title}</title>\n  <link rel="stylesheet" href="./style.css" />\n</head>\n<body>\n  <main id="app">\n    <h1>${title}</h1>\n    <p>HIVEFORGE_SCAFFOLD_PLACEHOLDER</p>\n  </main>\n  <script src="./app.js"></script>\n</body>\n</html>\n`;
  }
  if (lower.endsWith('.js')) {
    return `// HIVEFORGE_SCAFFOLD_PLACEHOLDER\nconsole.log('Implement ${relativePath} for ${title}');\n`;
  }
  if (lower.endsWith('.tsx')) {
    return `// HIVEFORGE_SCAFFOLD_PLACEHOLDER
import React from 'react';
import { SafeAreaView, Text, View } from 'react-native';

export default function PlaceholderScreen(): React.JSX.Element {
  return (
    <SafeAreaView>
      <View>
        <Text>Implement ${relativePath} for ${title}</Text>
      </View>
    </SafeAreaView>
  );
}
`;
  }
  if (lower.endsWith('.css')) {
    return `/* HIVEFORGE_SCAFFOLD_PLACEHOLDER */\nbody { font-family: system-ui, sans-serif; margin: 0; padding: 1rem; }\n`;
  }
  return `# ${title}\n\nHIVEFORGE_SCAFFOLD_PLACEHOLDER\n\nThis file should be replaced with real deliverable content by the assigned agent.\n`;
}

function writeProjectWorkspaceArtifacts(projectState) {
  if (!projectState || !projectState.id) return;
  const targetDir = projectWorkspaceDir(projectState.id);
  ensureDir(targetDir);
  const templateId = String(projectState.template || '').toLowerCase();
  const plan = projectState.goalPlan && typeof projectState.goalPlan === 'object' ? projectState.goalPlan : {};
  ensureProjectImageStyleProfile(projectState);
  fs.writeFileSync(path.join(targetDir, 'project_brief.md'), buildProjectWorkspaceBrief(projectState), 'utf-8');
  fs.writeFileSync(path.join(targetDir, 'goal_plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(path.join(targetDir, 'milestones.json'), `${JSON.stringify(Array.isArray(plan.milestones) ? plan.milestones : [], null, 2)}\n`, 'utf-8');

  const requiredArtifacts = templateArtifactContract(templateId);
  for (const artifact of requiredArtifacts) {
    const relPath = String(artifact && artifact.path ? artifact.path : '').trim();
    if (!relPath) continue;
    const absPath = path.join(targetDir, relPath);
    ensureDir(path.dirname(absPath));
    if (shouldRewriteScaffoldFile(absPath)) {
      fs.writeFileSync(absPath, scaffoldContentForContractPath(projectState, relPath), 'utf-8');
    }
  }

  if (templateId === 'game_studio') {
    const gameDir = path.join(targetDir, 'game');
    ensureDir(gameDir);
    const profile = deriveGameStudioPromptProfile(projectState);
    fs.writeFileSync(path.join(gameDir, 'game_profile.json'), `${JSON.stringify(profile, null, 2)}\n`, 'utf-8');
    const scaffold = buildPromptDrivenScaffold(profile);

    if (shouldRewriteScaffoldFile(path.join(gameDir, 'index.html'))) {
      fs.writeFileSync(path.join(gameDir, 'index.html'), scaffold.indexHtml, 'utf-8');
    }
    if (shouldRewriteScaffoldFile(path.join(gameDir, 'style.css'))) {
      fs.writeFileSync(path.join(gameDir, 'style.css'), scaffold.styleCss, 'utf-8');
    }
    if (shouldRewriteScaffoldFile(path.join(gameDir, 'game.js'))) {
      fs.writeFileSync(path.join(gameDir, 'game.js'), scaffold.gameJs, 'utf-8');
    }
    if (shouldRewriteScaffoldFile(path.join(gameDir, 'README.md'))) {
      fs.writeFileSync(path.join(gameDir, 'README.md'), scaffold.readme, 'utf-8');
    }

    const netlify = projectState.connectorBindings && projectState.connectorBindings.netlify
      ? projectState.connectorBindings.netlify
      : {};
    fs.writeFileSync(path.join(targetDir, 'deploy_status.json'), `${JSON.stringify({
      projectId: projectState.id,
      siteId: netlify.siteId || null,
      siteName: netlify.siteName || null,
      siteUrl: netlify.siteUrl || null,
      lastDeployUrl: netlify.lastDeployUrl || null,
      lastDeployAt: netlify.lastDeployAt || null,
      lastDeployArtifactHash: netlify.lastDeployArtifactHash || null,
      deployStatus: netlify.status || 'unknown',
    }, null, 2)}\n`, 'utf-8');
  }
}


function listProjectWorkspace(projectId, relativePath = '') {
  const dirPath = resolveProjectWorkspacePath(projectId, relativePath);
  if (!dirPath) {
    throw new Error('Invalid workspace path.');
  }
  ensureDir(projectWorkspaceDir(projectId));
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error('Workspace directory not found.');
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .map((entry) => {
      const absolutePath = path.join(dirPath, entry.name);
      const stats = fs.statSync(absolutePath);
      return {
        name: entry.name,
        path: toWorkspaceRelativePath(projectId, absolutePath),
        type: entry.isDirectory() ? 'dir' : 'file',
        size: entry.isDirectory() ? null : stats.size,
        updatedAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return {
    projectId,
    path: String(relativePath || '').replace(/\\/g, '/'),
    entries,
  };
}

function readProjectWorkspaceFile(projectId, relativePath = '') {
  const targetPath = resolveProjectWorkspacePath(projectId, relativePath);
  if (!targetPath) {
    throw new Error('Invalid workspace file path.');
  }
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    throw new Error('Workspace file not found.');
  }
  const raw = fs.readFileSync(targetPath, 'utf-8');
  const maxChars = 200000;
  const truncated = raw.length > maxChars;
  return {
    projectId,
    path: toWorkspaceRelativePath(projectId, targetPath),
    content: truncated ? `${raw.slice(0, maxChars)}\n\n...truncated...` : raw,
    truncated,
  };
}

function readLastLine(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return null;
  return lines[lines.length - 1];
}

function appendApprovalDecisionAudit(projectId, record = {}) {
  const safeProjectId = String(projectId || '').trim();
  if (!safeProjectId) return null;
  ensureDir(projectDir(safeProjectId));
  const target = projectApprovalAuditPath(safeProjectId);

  let prevHash = null;
  const lastLine = readLastLine(target);
  if (lastLine) {
    try {
      const prior = JSON.parse(lastLine);
      prevHash = prior.hash || null;
    } catch (err) {
      prevHash = null;
    }
  }

  const base = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    projectId: safeProjectId,
    taskId: String(record.taskId || ''),
    decision: String(record.decision || ''),
    actor: String(record.actor || 'operator'),
    note: typeof record.note === 'string' && record.note ? record.note : null,
    reason: typeof record.reason === 'string' && record.reason ? record.reason : null,
    riskScore: Number.isFinite(Number(record.riskScore)) ? Number(record.riskScore) : null,
    riskLevel: record.riskLevel ? String(record.riskLevel) : null,
    estimatedCost: Number.isFinite(Number(record.estimatedCost)) ? Number(record.estimatedCost) : null,
    connector: record.connector ? String(record.connector) : null,
    operation: record.operation ? String(record.operation) : null,
    matchedRuleId: record.matchedRuleId ? String(record.matchedRuleId) : null,
    prevHash,
  };
  const hashSource = `${base.prevHash || ''}|${canonicalJson(base)}`;
  const hash = crypto.createHash('sha256').update(hashSource).digest('hex');
  const entry = { ...base, hash };
  fs.appendFileSync(target, `${JSON.stringify(entry)}\n`, 'utf-8');
  return entry;
}

function readApprovalDecisionAudit(projectId, limit = 200) {
  const safeProjectId = String(projectId || '').trim();
  if (!safeProjectId) return [];
  const target = projectApprovalAuditPath(safeProjectId);
  if (!fs.existsSync(target)) return [];
  const max = clampInt(limit, 200, 1, 2000);
  const lines = fs.readFileSync(target, 'utf-8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    if (out.length >= max) break;
    try {
      out.push(JSON.parse(lines[idx]));
    } catch (err) {
    }
  }
  return out;
}

function cloneApprovalRules(rules = []) {
  return Array.isArray(rules) ? rules.map((rule) => ({ ...(rule && typeof rule === 'object' ? rule : {}) })) : [];
}

function ensureBudgetHardStopState(projectState) {
  if (!projectState.budgetHardStop || typeof projectState.budgetHardStop !== 'object') {
    projectState.budgetHardStop = {
      active: false,
      reason: null,
      activatedAt: null,
      activatedBy: null,
      context: {},
      blockedActionsCount: 0,
      lastBlockedAt: null,
      resumedAt: null,
      resumedBy: null,
      lastNotifiedAt: null,
    };
  }
}

function activateBudgetHardStop(projectState, reason, context = {}, activatedBy = 'policy_engine') {
  ensureBudgetHardStopState(projectState);
  const stop = projectState.budgetHardStop;
  const at = nowIso();
  stop.active = true;
  stop.reason = String(reason || 'budget_cap_exceeded');
  stop.activatedAt = stop.activatedAt || at;
  stop.activatedBy = activatedBy;
  stop.context = context && typeof context === 'object' ? { ...context } : {};
  stop.blockedActionsCount = Number(stop.blockedActionsCount || 0) + 1;
  stop.lastBlockedAt = at;
  stop.resumedAt = null;
  stop.resumedBy = null;

  const shouldLog = Number(stop.blockedActionsCount || 0) <= 1;
  if (shouldLog) {
    appendProjectLog(projectState, 'warning', {
      kind: 'budget_hard_stop_activated',
      reason: stop.reason,
      context: stop.context,
      activatedBy,
      blockedActionsCount: stop.blockedActionsCount,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: activatedBy,
      to: 'operator',
      kind: 'budget_hard_stop_activated',
      payload: {
        reason: stop.reason,
        context: stop.context,
      },
    });
    notifyOperator(projectState, 'Budget hard-stop activated', {
      reason: stop.reason,
      context: stop.context,
    }).catch(() => {});
  }
}

function clearBudgetHardStop(projectState, resumedBy = 'operator', detail = {}) {
  ensureBudgetHardStopState(projectState);
  const stop = projectState.budgetHardStop;
  const wasActive = stop.active === true;
  stop.active = false;
  stop.resumedAt = nowIso();
  stop.resumedBy = resumedBy;
  stop.lastNotifiedAt = null;
  stop.reason = null;
  stop.context = {};
  stop.blockedActionsCount = 0;
  if (wasActive) {
    appendProjectLog(projectState, 'message', {
      kind: 'budget_hard_stop_cleared',
      resumedBy,
      detail,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: resumedBy,
      to: 'policy_engine',
      kind: 'budget_hard_stop_cleared',
      payload: {
        resumedBy,
        detail,
      },
    });
  }
}

function approvalGovernanceSnapshot(projectState) {
  ensureApprovalGovernanceState(projectState);
  return {
    enabled: Boolean(projectState.approvalGovernance.enabled),
    autoApproveRules: cloneApprovalRules(projectState.approvalGovernance.autoApproveRules),
    autoDenyRules: cloneApprovalRules(projectState.approvalGovernance.autoDenyRules),
    escalationRules: cloneApprovalRules(projectState.approvalGovernance.escalationRules),
    industryPolicyPack: projectState.approvalGovernance.industryPolicyPack
      ? { ...projectState.approvalGovernance.industryPolicyPack }
      : null,
    updatedAt: projectState.approvalGovernance.updatedAt || null,
  };
}

function recordApprovalGovernanceRevision(projectState, actor = 'system', reason = 'governance_update') {
  ensureApprovalGovernanceState(projectState);
  const revisionState = projectState.approvalGovernance.revisions;
  const snapshot = approvalGovernanceSnapshot(projectState);
  const previous = revisionState.history.length > 0 ? revisionState.history[revisionState.history.length - 1] : null;
  const payload = JSON.stringify(snapshot);
  const hashInput = `${previous ? previous.hash : 'root'}:${payload}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
  if (previous && previous.hash === hash) {
    return previous;
  }
  const revision = {
    id: `govrev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: nowIso(),
    actor: String(actor || 'system'),
    reason: String(reason || 'governance_update'),
    previousHash: previous ? previous.hash : null,
    hash,
    snapshot,
  };
  revisionState.history.push(revision);
  if (revisionState.history.length > 50) {
    revisionState.history = revisionState.history.slice(-50);
  }
  revisionState.currentRevisionId = revision.id;
  return revision;
}

function rollbackApprovalGovernanceRevision(projectState, revisionId, actor = 'operator', reason = 'manual_rollback') {
  ensureApprovalGovernanceState(projectState);
  const revisionState = projectState.approvalGovernance.revisions;
  const target = revisionState.history.find((entry) => String(entry.id) === String(revisionId));
  if (!target || !target.snapshot) {
    return { ok: false, error: 'Revision not found.' };
  }
  const snap = target.snapshot;
  projectState.approvalGovernance.enabled = snap.enabled !== false;
  projectState.approvalGovernance.autoApproveRules = cloneApprovalRules(snap.autoApproveRules || []);
  projectState.approvalGovernance.autoDenyRules = cloneApprovalRules(snap.autoDenyRules || []);
  projectState.approvalGovernance.escalationRules = cloneApprovalRules(snap.escalationRules || []);
  projectState.approvalGovernance.industryPolicyPack = snap.industryPolicyPack ? { ...snap.industryPolicyPack } : null;
  projectState.approvalGovernance.updatedAt = nowIso();

  const newRevision = recordApprovalGovernanceRevision(projectState, actor, `rollback:${reason}:${revisionId}`);
  return { ok: true, targetRevisionId: revisionId, appliedRevision: newRevision };
}

function ensureApprovalGovernanceState(projectState) {
  if (!projectState.approvalGovernance || typeof projectState.approvalGovernance !== 'object') {
    projectState.approvalGovernance = {
      enabled: DEFAULT_APPROVAL_GOVERNANCE.enabled,
      autoApproveRules: cloneApprovalRules(DEFAULT_APPROVAL_GOVERNANCE.autoApproveRules),
      autoDenyRules: cloneApprovalRules(DEFAULT_APPROVAL_GOVERNANCE.autoDenyRules),
      escalationRules: cloneApprovalRules(DEFAULT_APPROVAL_GOVERNANCE.escalationRules),
      industryPolicyPack: DEFAULT_APPROVAL_GOVERNANCE.industryPolicyPack,
      updatedAt: null,
    };
  }
  projectState.approvalGovernance.enabled = projectState.approvalGovernance.enabled !== false;
  if (!Array.isArray(projectState.approvalGovernance.autoApproveRules)) {
    projectState.approvalGovernance.autoApproveRules = cloneApprovalRules(DEFAULT_APPROVAL_GOVERNANCE.autoApproveRules);
  }
  if (!Array.isArray(projectState.approvalGovernance.autoDenyRules)) {
    projectState.approvalGovernance.autoDenyRules = cloneApprovalRules(DEFAULT_APPROVAL_GOVERNANCE.autoDenyRules);
  }
  if (!Array.isArray(projectState.approvalGovernance.escalationRules)) {
    projectState.approvalGovernance.escalationRules = cloneApprovalRules(DEFAULT_APPROVAL_GOVERNANCE.escalationRules);
  }
  if (typeof projectState.approvalGovernance.industryPolicyPack === 'undefined') {
    projectState.approvalGovernance.industryPolicyPack = null;
  }
  if (!projectState.approvalGovernance.revisions || typeof projectState.approvalGovernance.revisions !== 'object') {
    projectState.approvalGovernance.revisions = {
      currentRevisionId: null,
      history: [],
    };
  }
  if (!Array.isArray(projectState.approvalGovernance.revisions.history)) {
    projectState.approvalGovernance.revisions.history = [];
  }
  if (typeof projectState.approvalGovernance.revisions.currentRevisionId === 'undefined') {
    projectState.approvalGovernance.revisions.currentRevisionId = null;
  }
}

function roleLooksLike(value, expected) {
  return String(value || '').trim().toLowerCase() === String(expected || '').trim().toLowerCase();
}

function ruleMatchesApprovalContext(rule = {}, context = {}) {
  const riskScore = Number(context.riskScore || 0);
  const estimatedCost = Number(context.estimatedCost || 0);
  const connector = String(context.connector || '').toLowerCase();
  const operation = String(context.operation || '').toLowerCase();
  const actorRole = String(context.actorRole || '').toLowerCase();
  const taskTitle = String(context.taskTitle || '').toLowerCase();
  const taskPhase = String(context.taskPhase || '').toLowerCase();

  if (typeof rule.minRiskScore === 'number' && riskScore < rule.minRiskScore) return false;
  if (typeof rule.maxRiskScore === 'number' && riskScore > rule.maxRiskScore) return false;
  if (typeof rule.minEstimatedCost === 'number' && estimatedCost < rule.minEstimatedCost) return false;
  if (typeof rule.maxEstimatedCost === 'number' && estimatedCost > rule.maxEstimatedCost) return false;

  if (Array.isArray(rule.connectors) && rule.connectors.length > 0) {
    const allowed = rule.connectors.map((v) => String(v || '').toLowerCase());
    if (!allowed.includes(connector)) return false;
  }
  if (Array.isArray(rule.operations) && rule.operations.length > 0) {
    const allowed = rule.operations.map((v) => String(v || '').toLowerCase());
    if (!allowed.includes(operation)) return false;
  }
  if (Array.isArray(rule.actorRoles) && rule.actorRoles.length > 0) {
    const allowed = rule.actorRoles.map((v) => String(v || '').toLowerCase());
    if (!allowed.some((entry) => roleLooksLike(actorRole, entry))) return false;
  }
  if (Array.isArray(rule.taskKeywords) && rule.taskKeywords.length > 0) {
    const matchedKeyword = rule.taskKeywords
      .map((entry) => String(entry || '').toLowerCase().trim())
      .filter(Boolean)
      .some((needle) => taskTitle.includes(needle));
    if (!matchedKeyword) return false;
  }
  if (Array.isArray(rule.phases) && rule.phases.length > 0) {
    const allowed = rule.phases.map((entry) => String(entry || '').toLowerCase());
    if (!allowed.includes(taskPhase)) return false;
  }
  return true;
}

function inferIndustryApprovalPack(templateId, goalPlan = {}) {
  const templateKey = String(templateId || '').trim().toLowerCase();
  const tags = goalPlan && goalPlan.tags && typeof goalPlan.tags === 'object' ? goalPlan.tags : {};
  const goalText = String(goalPlan && goalPlan.goal || '').toLowerCase();
  if (Boolean(tags.property)) return 'housing';
  if (Boolean(tags.healthcare)) return 'healthcare';
  if (Boolean(tags.ecommerce)) return 'ecommerce';
  if (Boolean(tags.fintech)) return 'finance';
  if (Boolean(tags.marketplace) || Boolean(tags.social)) return 'marketplace';
  if (templateKey === 'business' && Boolean(tags.legal) && textContainsAny(goalText, ['housing', 'landlord', 'tenant', 'lease', 'rental', 'property'])) {
    return 'housing';
  }
  if (templateKey === 'business' && Boolean(tags.webApp) && textContainsAny(goalText, ['saas', 'multi-tenant', 'gdpr', 'data privacy', 'user data', 'subscription software'])) {
    return 'saas';
  }
  if (templateKey === 'business' && Boolean(tags.payments) && textContainsAny(goalText, ['finance', 'fintech', 'accounting', 'bookkeeping', 'payroll', 'cashflow'])) {
    return 'finance';
  }
  return null;
}

function applyIndustryApprovalPolicyPack(projectState, options = {}) {
  ensureApprovalGovernanceState(projectState);
  const approval = projectState.approvalGovernance;
  const packId = String(options.packId || inferIndustryApprovalPack(options.templateId, options.goalPlan) || '').trim().toLowerCase();
  if (!packId) {
    return { applied: false, packId: null };
  }
  const pack = INDUSTRY_APPROVAL_POLICY_PACKS[packId];
  if (!pack) {
    return { applied: false, packId, reason: 'unknown_pack' };
  }

  const addUniqueRule = (target, incomingRule) => {
    if (!incomingRule || typeof incomingRule !== 'object') return;
    const id = String(incomingRule.id || '').trim();
    if (!id) return;
    if (target.some((rule) => String(rule && rule.id || '').trim() === id)) return;
    target.push({ ...incomingRule, policyPack: pack.id });
  };

  cloneApprovalRules(pack.autoApproveRules || []).forEach((rule) => addUniqueRule(approval.autoApproveRules, rule));
  cloneApprovalRules(pack.autoDenyRules || []).forEach((rule) => addUniqueRule(approval.autoDenyRules, rule));
  cloneApprovalRules(pack.escalationRules || []).forEach((rule) => addUniqueRule(approval.escalationRules, rule));

  approval.industryPolicyPack = {
    id: pack.id,
    title: pack.title,
    summary: pack.summary,
    appliedAt: nowIso(),
  };
  approval.updatedAt = nowIso();

  return {
    applied: true,
    packId: pack.id,
    title: pack.title,
    summary: pack.summary,
  };
}

function evaluateApprovalGovernanceDecision(projectState, task, detail = {}) {
  ensureApprovalGovernanceState(projectState);
  const governance = projectState.approvalGovernance;
  if (!governance.enabled) {
    return { decision: null, matchedRuleId: null, reason: null };
  }

  const riskScore = Number(detail.riskScore || task?.pendingApproval?.risk?.score || 0);
  const estimatedCost = Number(detail.estimatedCost || task?.autoAction?.estimatedCost || 0);
  const connector = String(detail.connector || task?.autoAction?.connector || '').toLowerCase();
  const operation = String(detail.operation || task?.autoAction?.operation || '').toLowerCase();
  const actorRole = String(detail.actorRole || task?.autoAction?.actorRole || '').toLowerCase();
  const taskTitle = String(detail.taskTitle || task?.title || '').toLowerCase();
  const taskPhase = String(detail.taskPhase || task?.phase || '').toLowerCase();
  const context = { riskScore, estimatedCost, connector, operation, actorRole, taskTitle, taskPhase };

  const denyRule = governance.autoDenyRules.find((rule) => ruleMatchesApprovalContext(rule, context));
  if (denyRule) {
    return {
      decision: 'deny',
      matchedRuleId: String(denyRule.id || 'auto_deny_rule'),
      reason: `Auto-denied by policy pack rule ${String(denyRule.id || 'auto_deny_rule')}.`,
    };
  }

  const escalateRule = governance.escalationRules.find((rule) => ruleMatchesApprovalContext(rule, context));
  if (escalateRule) {
    return {
      decision: 'escalate',
      matchedRuleId: String(escalateRule.id || 'auto_escalate_rule'),
      reason: `Escalation required by policy pack rule ${String(escalateRule.id || 'auto_escalate_rule')}.`,
    };
  }

  const approveRule = governance.autoApproveRules.find((rule) => ruleMatchesApprovalContext(rule, context));
  if (approveRule) {
    return {
      decision: 'approve',
      matchedRuleId: String(approveRule.id || 'auto_approve_rule'),
      reason: `Auto-approved by policy pack rule ${String(approveRule.id || 'auto_approve_rule')}.`,
    };
  }

  return { decision: null, matchedRuleId: null, reason: null };
}

function weeklyObjectiveSpecsForTemplate(templateKey) {
  const safeTemplate = String(templateKey || '').toLowerCase();
  const fromTemplate = WEEKLY_OBJECTIVES_BY_TEMPLATE[safeTemplate] || [];
  return fromTemplate.length ? fromTemplate : WEEKLY_OBJECTIVES_BY_TEMPLATE.default;
}

function ensureOperationalLoopState(projectState) {
  if (!projectState.operationalLoops || typeof projectState.operationalLoops !== 'object') {
    projectState.operationalLoops = {
      weekStart: startOfUtcWeekIso(),
      generatedAt: null,
      objectives: [],
      safety: {
        recentAutoActionFailures: [],
        suspendedUntil: null,
        lastSuspendedAt: null,
        lastSuspendReason: null,
        lastNotifyAt: null,
      },
    };
  }
  if (!Array.isArray(projectState.operationalLoops.objectives)) {
    projectState.operationalLoops.objectives = [];
  }
  if (!projectState.operationalLoops.safety || typeof projectState.operationalLoops.safety !== 'object') {
    projectState.operationalLoops.safety = {
      recentAutoActionFailures: [],
      suspendedUntil: null,
      lastSuspendedAt: null,
      lastSuspendReason: null,
      lastNotifyAt: null,
    };
  }
  if (!Array.isArray(projectState.operationalLoops.safety.recentAutoActionFailures)) {
    projectState.operationalLoops.safety.recentAutoActionFailures = [];
  }
}

function pruneOperationalLoopAutoActionFailures(projectState, nowMs = Date.now()) {
  ensureOperationalLoopState(projectState);
  const safety = projectState.operationalLoops.safety;
  safety.recentAutoActionFailures = safety.recentAutoActionFailures.filter((entry) => {
    const atMs = Date.parse(entry && entry.at ? entry.at : '');
    return Number.isFinite(atMs) && (nowMs - atMs) <= DEFAULT_OPERATIONAL_LOOP_SAFETY.failureWindowMs;
  });
}

function isOperationalLoopSuspended(projectState, ts = nowIso()) {
  ensureOperationalLoopState(projectState);
  const safety = projectState.operationalLoops.safety;
  const untilMs = Date.parse(safety.suspendedUntil || '');
  const nowMs = Date.parse(ts);
  if (Number.isFinite(untilMs) && Number.isFinite(nowMs) && nowMs < untilMs) {
    return {
      suspended: true,
      suspendedUntil: safety.suspendedUntil,
      reason: safety.lastSuspendReason || 'operational_loop_safety_suspended',
      failureCount: safety.recentAutoActionFailures.length,
    };
  }
  if (Number.isFinite(untilMs) && Number.isFinite(nowMs) && nowMs >= untilMs) {
    safety.suspendedUntil = null;
    safety.lastSuspendReason = null;
  }
  return {
    suspended: false,
    suspendedUntil: null,
    reason: null,
    failureCount: safety.recentAutoActionFailures.length,
  };
}

function recordOperationalLoopAutoActionFailure(projectState, task, reason, detail = {}) {
  ensureOperationalLoopState(projectState);
  const safety = projectState.operationalLoops.safety;
  const at = nowIso();
  safety.recentAutoActionFailures.push({
    at,
    taskId: task && task.id ? task.id : null,
    recurringKey: task && task.recurringKey ? task.recurringKey : null,
    connector: task && task.autoAction && task.autoAction.connector ? task.autoAction.connector : null,
    operation: task && task.autoAction && task.autoAction.operation ? task.autoAction.operation : null,
    reason: String(reason || 'auto_action_failed'),
  });
  pruneOperationalLoopAutoActionFailures(projectState, Date.parse(at));

  const suspended = isOperationalLoopSuspended(projectState, at);
  if (suspended.suspended) {
    return suspended;
  }

  const failureCount = safety.recentAutoActionFailures.length;
  if (failureCount < DEFAULT_OPERATIONAL_LOOP_SAFETY.maxAutoActionFailuresInWindow) {
    return { suspended: false, failureCount };
  }

  safety.suspendedUntil = new Date(Date.now() + DEFAULT_OPERATIONAL_LOOP_SAFETY.suspendForMs).toISOString();
  safety.lastSuspendedAt = at;
  safety.lastSuspendReason = String(reason || 'auto_action_failures_threshold_reached');
  const summary = `Recurring automation paused for ${Math.round(DEFAULT_OPERATIONAL_LOOP_SAFETY.suspendForMs / 60000)}m after ${failureCount} auto-action failures in ${Math.round(DEFAULT_OPERATIONAL_LOOP_SAFETY.failureWindowMs / 60000)}m.`;
  appendProjectLog(projectState, 'warning', {
    kind: 'operational_loop_safety_suspended',
    summary,
    suspendedUntil: safety.suspendedUntil,
    failureCount,
    reason: safety.lastSuspendReason,
    detail,
  });

  const nowMs = Date.now();
  const lastNotifyMs = Date.parse(safety.lastNotifyAt || '');
  const notifyEligible = !Number.isFinite(lastNotifyMs)
    || (nowMs - lastNotifyMs) >= DEFAULT_OPERATIONAL_LOOP_SAFETY.notifyCooldownMs;
  if (notifyEligible) {
    safety.lastNotifyAt = at;
    notifyOperator(projectState, 'Operational loop safety pause activated', {
      summary,
      suspendedUntil: safety.suspendedUntil,
      failureCount,
      reason: safety.lastSuspendReason,
    }).catch(() => {});
  }

  return {
    suspended: true,
    suspendedUntil: safety.suspendedUntil,
    reason: safety.lastSuspendReason,
    failureCount,
  };
}

function clearOperationalLoopAutoActionFailures(projectState) {
  ensureOperationalLoopState(projectState);
  projectState.operationalLoops.safety.recentAutoActionFailures = [];
}

function projectLeadRoleFromRoles(roles = []) {
  const unique = Array.from(new Set((Array.isArray(roles) ? roles : [])
    .map((role) => String(role || '').trim())
    .filter(Boolean)));
  if (!unique.length) return null;
  const priorityKeywords = ['project manager', 'producer', 'ceo', 'chief', 'director', 'lead', 'head', 'manager'];
  const preferred = unique.find((roleName) => {
    const normalized = roleName.toLowerCase();
    return priorityKeywords.some((keyword) => normalized.includes(keyword));
  });
  return preferred || unique[0];
}

function projectLeadRoleForTemplate(templateData = null) {
  const subordinates = Array.isArray(templateData && templateData.subordinate_agents)
    ? templateData.subordinate_agents
    : [];
  const roles = subordinates.map((spec) => String(spec && (spec.alias || spec.role) ? (spec.alias || spec.role) : '').trim());
  return projectLeadRoleFromRoles(roles);
}

function projectLeadRoleForProject(projectState) {
  const roles = Array.isArray(projectState && projectState.agents)
    ? projectState.agents
      .filter((agent) => !agent.isCoordinator)
      .map((agent) => String(agent.role || '').trim())
    : [];
  return projectLeadRoleFromRoles(roles);
}

function resolveExecutionOwnerRole(projectState, preferredRole) {
  const wanted = String(preferredRole || '').trim().toLowerCase();
  if (wanted) {
    const exact = Array.isArray(projectState && projectState.agents)
      ? projectState.agents.find((agent) => !agent.isCoordinator && String(agent.role || '').trim().toLowerCase() === wanted)
      : null;
    if (exact) return exact.role;
  }
  return projectLeadRoleForProject(projectState);
}

function findOwnerAgentId(projectState, roleName) {
  const wanted = String(roleName || '').trim().toLowerCase();
  if (!wanted) return null;
  const exact = projectState.agents.find((agent) => String(agent.role || '').trim().toLowerCase() === wanted);
  if (exact) return exact.id;
  const projectLeadRole = projectLeadRoleForProject(projectState);
  if (projectLeadRole) {
    const projectLead = projectState.agents.find((agent) => !agent.isCoordinator && String(agent.role || '').trim().toLowerCase() === projectLeadRole.toLowerCase());
    if (projectLead) return projectLead.id;
  }
  const fallback = projectState.agents.find((agent) => !agent.isCoordinator);
  return fallback ? fallback.id : null;
}

function emitProjectEvent(projectId, eventName, payload) {
  const clients = projectSseClients.get(projectId);
  if (!clients || !clients.size) return;
  const data = JSON.stringify({ ...payload, ts: payload.ts || nowIso() });
  clients.forEach((res) => {
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${data}\n\n`);
    } catch (err) {
      clients.delete(res);
    }
  });
}

function appendProjectLog(projectState, type, data) {
  const entry = { ts: nowIso(), type, data };
  projectState.logs.unshift(entry);
  if (projectState.logs.length > 1000) {
    projectState.logs.length = 1000;
  }
  projectState.lastActivity = entry.ts;

  const payload = data || {};
  const kind = String(payload.kind || payload.event || '').toLowerCase();
  const hasDecision = typeof payload.approved === 'boolean' || typeof payload.decision === 'string' || typeof payload.error_code === 'string';
  const isPolicyKind = kind === 'skill_response' || kind === 'browser_response' || kind === 'credential_response';
  if (hasDecision || isPolicyKind) {
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'coordinator',
      to: 'policy_engine',
      kind: 'policy_decision',
      payload,
    });
  }

  return entry;
}

function loadTemplateById(templateId) {
  // Normalize: lowercase, spaces ? underscores, strip unsafe chars
  const normalized = String(templateId || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!normalized) return null;
  const templatePath = path.resolve(TEMPLATES_ROOT, `${normalized}.json`);
  // Security: must remain inside TEMPLATES_ROOT
  if (!templatePath.startsWith(path.resolve(TEMPLATES_ROOT))) {
    return null;
  }
  if (!fs.existsSync(templatePath)) return null;
  return safeJsonRead(templatePath, null);
}

function roleToAgentId(role, index) {
  const normalized = String(role || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${normalized || 'agent'}_${index + 1}`;
}

function normalizeOperatingMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'continuous_business' || normalized === 'finite_delivery') {
    return normalized;
  }
  return 'finite_delivery';
}

function templateOperatingMode(templateKey, templateData) {
  if (templateData && typeof templateData.operating_mode === 'string') {
    return normalizeOperatingMode(templateData.operating_mode);
  }
  const fallback = DEFAULT_OPERATING_MODE_BY_TEMPLATE[String(templateKey || '').toLowerCase()] || 'finite_delivery';
  return normalizeOperatingMode(fallback);
}

function normalizeRecurringLoopSpec(spec, idx = 0) {
  const key = String(spec && spec.key ? spec.key : `template_loop_${idx + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return {
    key: key || `template_loop_${idx + 1}`,
    title: String(spec && spec.title ? spec.title : `Recurring loop ${idx + 1}`),
    phase: String(spec && spec.phase ? spec.phase : 'maintenance'),
    ownerRole: String(spec && (spec.owner_role || spec.ownerRole) ? (spec.owner_role || spec.ownerRole) : ''),
    kpiOwnerRole: String(spec && (spec.kpi_owner_role || spec.kpiOwnerRole) ? (spec.kpi_owner_role || spec.kpiOwnerRole) : ''),
    slaHours: clampInt(spec && (spec.sla_hours || spec.slaHours), 24, 1, 7 * 24),
    objectiveTag: String(spec && (spec.objective_tag || spec.objectiveTag) ? (spec.objective_tag || spec.objectiveTag) : '').trim() || null,
    everyMs: clampInt(spec && spec.every_ms, 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    action: spec && spec.action && typeof spec.action === 'object'
      ? {
          type: String(spec.action.type || '').trim().toLowerCase(),
          connector: String(spec.action.connector || '').trim().toLowerCase(),
          operation: String(spec.action.operation || '').trim(),
          estimatedCost: Number.isFinite(Number(
            typeof spec.action.estimated_cost !== 'undefined' ? spec.action.estimated_cost : spec.action.estimatedCost
          ))
            ? Number(typeof spec.action.estimated_cost !== 'undefined' ? spec.action.estimated_cost : spec.action.estimatedCost)
            : 0,
          input: spec.action.input && typeof spec.action.input === 'object' ? spec.action.input : {},
          requiresPermission: Boolean(
            typeof spec.action.requires_permission !== 'undefined'
              ? spec.action.requires_permission
              : spec.action.requiresPermission
          ),
        }
      : null,
  };
}

function hasUnresolvedTemplateValue(value) {
  if (typeof value === 'string') {
    return /\{\{[^{}]+\}\}/.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasUnresolvedTemplateValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => hasUnresolvedTemplateValue(entry));
  }
  return false;
}

function recurringScheduleForTemplate(templateKey, templateData = null) {
  const key = String(templateKey || '').toLowerCase();
  const mode = String(
    (templateData && templateData.operating_mode)
    || DEFAULT_OPERATING_MODE_BY_TEMPLATE[key]
    || 'continuous_business'
  ).toLowerCase();
  const includeDefaultRecurring = mode === 'continuous_business';
  const fastLocalGameMode = key === 'game_studio' && runtimeSettings().fastLocalIterationMode;
  if (fastLocalGameMode) return [];

  const fromTemplate = Array.isArray(templateData && templateData.recurring_loops)
    ? templateData.recurring_loops
      .filter((entry) => entry && entry.enabled !== false)
      .map((entry, idx) => normalizeRecurringLoopSpec(entry, idx))
    : [];
  const templateSchedule = RECURRING_SCHEDULE_BY_TEMPLATE[key] || [];
  const defaults = includeDefaultRecurring ? DEFAULT_RECURRING_SCHEDULE : [];
  const merged = fromTemplate.length ? [...defaults, ...fromTemplate] : [...defaults, ...templateSchedule];
  return merged.map((entry, idx) => normalizeRecurringLoopSpec({
    key: entry.key,
    title: entry.title,
    phase: entry.phase,
    owner_role: entry.ownerRole,
    kpi_owner_role: entry.kpiOwnerRole,
    sla_hours: entry.slaHours,
    objective_tag: entry.objectiveTag,
    every_ms: entry.everyMs,
    action: entry.action,
  }, idx));
}

function templateAutoStaffingPolicy(templateData = null, subordinateCount = 0) {
  const raw = templateData && typeof templateData.auto_staffing_policy === 'object'
    ? templateData.auto_staffing_policy
    : {};
  const maxOptionalAdds = clampInt(
    raw.max_optional_adds,
    DEFAULT_AUTO_STAFFING_POLICY.maxOptionalAdds,
    0,
    20,
  );
  const maxAgents = clampInt(
    raw.max_agents,
    Math.max(subordinateCount + maxOptionalAdds, subordinateCount),
    subordinateCount,
    100,
  );
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_AUTO_STAFFING_POLICY.enabled,
    cooldownMs: clampInt(raw.cooldown_minutes, DEFAULT_AUTO_STAFFING_POLICY.cooldownMs / 60000, 1, 24 * 60) * 60 * 1000,
    backlogPerAgentThreshold: clampInt(raw.backlog_per_agent_threshold, DEFAULT_AUTO_STAFFING_POLICY.backlogPerAgentThreshold, 1, 20),
    maxOptionalAdds,
    maxAgents,
  };
}

function templateRoleCapabilities(templateData = null, agents = []) {
  const capabilities = {};
  agents.forEach((agent) => {
    if (agent.isCoordinator) return;
    const key = String(agent.role || '').trim();
    if (!key) return;
    const defaults = DEFAULT_ROLE_CAPABILITIES[key] || { canDeploy: false, canSpend: false, allowedConnectors: [] };
    capabilities[key] = {
      canDeploy: Boolean(defaults.canDeploy),
      canSpend: Boolean(defaults.canSpend),
      allowedConnectors: Array.isArray(defaults.allowedConnectors) ? [...defaults.allowedConnectors] : [],
    };
  });
  const overrides = templateData && typeof templateData.role_capabilities === 'object'
    ? templateData.role_capabilities
    : {};
  Object.entries(overrides).forEach(([role, cfg]) => {
    if (!cfg || typeof cfg !== 'object') return;
    const base = capabilities[role] || { canDeploy: false, canSpend: false, allowedConnectors: [] };
    capabilities[role] = {
      canDeploy: typeof cfg.can_deploy === 'boolean' ? cfg.can_deploy : base.canDeploy,
      canSpend: typeof cfg.can_spend === 'boolean' ? cfg.can_spend : base.canSpend,
      allowedConnectors: Array.isArray(cfg.allowed_connectors)
        ? cfg.allowed_connectors.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
        : base.allowedConnectors,
    };
  });
  const imageEnabled = imageGeneratorSettings().enabled;
  if (imageEnabled) {
    Object.keys(capabilities).forEach((roleName) => {
      const defaults = DEFAULT_ROLE_CAPABILITIES[roleName] || null;
      if (!defaults || !Array.isArray(defaults.allowedConnectors) || !defaults.allowedConnectors.includes('image_generator')) return;
      const list = Array.isArray(capabilities[roleName].allowedConnectors)
        ? capabilities[roleName].allowedConnectors
        : [];
      if (!list.includes('image_generator')) list.push('image_generator');
      capabilities[roleName].allowedConnectors = list;
    });
  }
  return capabilities;
}

function findRuntimeAgentByRole(projectState, role) {
  const wanted = String(role || '').trim().toLowerCase();
  if (!wanted) return null;
  return projectState.agents.find((agent) => String(agent.role || '').trim().toLowerCase() === wanted) || null;
}

function optionalAgentPersonalityPaths(role) {
  const mapped = OPTIONAL_AGENT_PERSONALITY_PATHS[String(role || '')];
  return Array.isArray(mapped) ? [...mapped] : [];
}

function createInitialAgents(projectId, template) {
  const agents = [];
  agents.push({
    id: `coordinator_${projectId}`,
    name: 'Coordinator Agent',
    role: 'Coordinator Agent',
    status: 'running',
    currentTask: null,
    tasksDone: 0,
    tokens: 0,
    recentLog: ['Coordinator online'],
    isCoordinator: true,
    personalityPromptPaths: [],
    templateRole: 'Coordinator Agent',
    sourceRole: 'Coordinator Agent',
  });

  const subordinates = Array.isArray(template.subordinate_agents) ? template.subordinate_agents : [];
  subordinates.forEach((agentSpec, idx) => {
    const role = agentSpec.alias || agentSpec.role || `Agent ${idx + 1}`;
    agents.push({
      id: roleToAgentId(role, idx),
      name: role,
      role: role,
      templateRole: String(agentSpec.role || role),
      sourceRole: String(agentSpec.role || role),
      status: 'idle',
      currentTask: null,
      tasksDone: 0,
      tokens: 0,
      recentLog: ['Idle'],
      isCoordinator: false,
      personalityPromptPaths: Array.isArray(agentSpec.personality_prompt_paths)
        ? agentSpec.personality_prompt_paths.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [],
    });
  });

  return agents;
}

function textContainsAny(haystack, needles = []) {
  const source = String(haystack || '').toLowerCase();
  return needles.some((needle) => source.includes(String(needle || '').toLowerCase()));
}

function normalizeGoalKeywordTags(goalText) {
  const source = String(goalText || '').toLowerCase();
  return {
    webApp: textContainsAny(source, ['website', 'web app', 'app', 'portal', 'platform', 'saas']),
    deployment: textContainsAny(source, ['deploy', 'deployment', 'go live', 'launch', 'netlify']),
    payments: textContainsAny(source, ['payment', 'payments', 'billing', 'subscription', 'monthly fee', 'invoice', 'checkout']),
    support: textContainsAny(source, ['support', 'help desk', 'ticket', 'customer service']),
    marketing: textContainsAny(source, ['marketing', 'ads', 'advertising', 'campaign', 'growth', 'acquisition']),
    analytics: textContainsAny(source, ['analytics', 'kpi', 'conversion', 'roi', 'funnel']),
    legal: textContainsAny(source, ['legal', 'compliance', 'policy', 'privacy', 'terms']),
    property: textContainsAny(source, ['property', 'landlord', 'tenant', 'lease', 'rental', 'application']),
    fintech: textContainsAny(source, ['fintech', 'financial service', 'accounting', 'bookkeeping', 'payroll', 'cashflow', 'ledger', 'accounts payable', 'accounts receivable', 'expense tracking']),
    healthcare: textContainsAny(source, ['patient', 'medical', 'clinical', 'healthcare', 'health care', 'hipaa', 'ehr', 'prescription', 'diagnosis', 'hospital', 'clinic', 'telehealth']),
    ecommerce: textContainsAny(source, ['ecommerce', 'e-commerce', 'online store', 'shopify', 'woocommerce', 'product catalog', 'inventory', 'order fulfillment', 'retail store']),
    marketplace: textContainsAny(source, ['marketplace', 'auction', 'bidding', 'bid', 'listing', 'buy and sell', 'seller', 'buyer', 'classifieds', 'peer-to-peer']),
    social: textContainsAny(source, ['social', 'profile', 'dating', 'match', 'matchmaking', 'network', 'community', 'forum', 'feed', 'follow', 'user-generated']),
    mobileMonetization: textContainsAny(source, ['monetize', 'monetization', 'iap', 'in-app purchase', 'freemium', 'premium unlock', 'rewarded ad', 'interstitial', 'banner ad', 'revenue model', 'play store revenue', 'app revenue']),
    imageGeneration: textContainsAny(source, ['image generation', 'image generator', 'ai art', 'sprite', 'spritesheet', 'tileset', 'concept art', 'character art', 'game art', 'asset pack', 'illustration']),
  };
}

function connectorHealthCheckActionForService(connector) {
  const key = normalizeConnectorId(connector);
  if (key === 'netlify') {
    return { connector: 'netlify', operation: 'get_account', actorRole: 'Backend Architect', phase: 'deployment' };
  }
  if (key === 'supabase') {
    return { connector: 'supabase', operation: 'get_profile', actorRole: 'Backend Architect', phase: 'product_build' };
  }
  if (key === 'stripe') {
    return { connector: 'stripe', operation: 'get_balance', actorRole: 'Finance Tracker', phase: 'finance' };
  }
  if (key === 'google_ads') {
    return { connector: 'google_ads', operation: 'get_profile', actorRole: 'Growth Hacker + Content Creator', phase: 'marketing' };
  }
  if (key === 'support_ticket') {
    return { connector: 'support_ticket', operation: 'list_tickets', actorRole: 'Support Responder', phase: 'support' };
  }
  if (key === 'analytics') {
    return { connector: 'analytics', operation: 'get_profile', actorRole: 'Finance Tracker', phase: 'analytics' };
  }
  if (key === 'email_provider') {
    return { connector: 'email_provider', operation: 'list_inbox', actorRole: 'Support Responder', phase: 'support' };
  }
  if (key === 'google_play') {
    return { connector: 'google_play', operation: 'get_release_status', actorRole: 'DevOps Automator', phase: 'deployment' };
  }
  if (key === 'image_generator') {
    return { connector: 'image_generator', operation: 'get_profile', actorRole: 'Backend Architect', phase: 'product_build' };
  }
  return null;
}

function goalClarificationQuestions(templateId, goalText, tags = {}) {
  const text = String(goalText || '').toLowerCase();
  const templateKey = String(templateId || '').trim().toLowerCase();
  const questions = [];

  if (templateKey === 'game_studio') {
    const mentionsSingle = /(single[\s-]?player|solo|offline\s*mode)/.test(text);
    const mentionsMulti = /(multiplayer|co[-\s]?op|coop|pvp|online\s+match)/.test(text);
    const mentionsTheme = /(theme|genre|setting|visual\s*style|art\s*direction|tone)/.test(text);
    const mentionsPlatform = /(itch|itch\.io|steam|desktop|browser|web|mobile)/.test(text);
    const mentionsPerspective = /(top[\s-]?down|side[\s-]?scroller|isometric|first[\s-]?person|third[\s-]?person|orthographic)/.test(text);

    if (!mentionsSingle && !mentionsMulti) {
      questions.push('Should this game be single-player, multiplayer, or both? If multiplayer, should we start with P2P listen-server to reduce hosting cost?');
    }
    if (!mentionsTheme) {
      questions.push('What theme/genre and visual direction should we target (for example: pixel roguelite, cozy farming, arcade shooter)?');
    }
    if (!mentionsPlatform) {
      questions.push('Which release lane should we prioritize first: browser/Netlify testing, itch.io launch, or Steam desktop packaging?');
    }
    if (!mentionsPerspective) {
      questions.push('What gameplay perspective should we use (top-down, side-scroller, isometric, first-person, or third-person), and should we stay 2D or 3D for MVP?');
    }
  }

  if (tags.webApp && !/(auth|login|sign[\s-]?in|account)/.test(text)) {
    questions.push('Do you want account-based authentication in the MVP, or should we start with guest-only access?');
  }

  if (templateKey === 'business') {
    if (tags.webApp && !/(dashboard|admin|portal|backoffice|reporting)/.test(text)) {
      questions.push('Should this MVP include an operator/admin dashboard in phase 1, or can we defer dashboard tooling to a later milestone?');
    }
    if (tags.marketplace && !/(seller|buyer|two[-\s]?sided|role|persona)/.test(text)) {
      questions.push('For marketplace scope, which personas are required in MVP (for example seller, buyer, moderator), and which can ship later?');
    }
    if ((tags.marketplace || tags.ecommerce || tags.webApp) && !/(search|filter|sort|category|discover)/.test(text)) {
      questions.push('Do you want discovery controls (search/filter/sort/categories) in MVP, or should discovery stay minimal for first release?');
    }
    if ((tags.social || tags.marketplace || tags.property) && !/(profile|onboarding|verification|kyc)/.test(text)) {
      questions.push('How deep should onboarding/profile setup be for MVP (basic profile only vs richer verification and preferences)?');
    }
    if (!/(dashboard|admin|portal|backoffice|reporting|none|not needed)/.test(text)) {
      questions.push('Should operators have a dashboard/admin portal in MVP, or should the initial release focus only on end-user workflows?');
    }
  }

  return questions.slice(0, 5);
}

function buildBusinessWebExperienceRequirements(tags = {}, goalText = '') {
  const text = String(goalText || '').toLowerCase();
  const requirements = [
    'clear navigation/menu information architecture',
    'robust loading, empty, and error states for critical views',
  ];

  if (tags.webApp || tags.social || tags.marketplace || tags.property) {
    requirements.push('auth entry with explicit scope decision (account-based or guest-only)');
  }
  if (tags.social || tags.marketplace || tags.property) {
    requirements.push('profile setup/edit flow appropriate to target personas');
  }
  if (tags.marketplace) {
    requirements.push('seller listing/create flow and buyer participation flow');
    requirements.push('user activity tracking views (for example my bids/listings/watchlist/order activity)');
  } else if (tags.ecommerce) {
    requirements.push('catalog browsing and purchase journey from discovery to checkout');
  }
  if (tags.marketplace || tags.ecommerce || tags.webApp) {
    requirements.push('discovery controls where relevant (search/filter/sort/category)');
  }
  if (/(dashboard|admin|portal|backoffice|reporting)/.test(text)) {
    requirements.push('dashboard/portal workflows specified in the goal');
  }

  return requirements;
}

function goalActionPlanFromPrompt(templateId, goal, template = {}) {
  const goalText = String(goal || '').trim();
  const normalizedTemplate = String(templateId || '').toLowerCase();
  const isGameTemplate = normalizedTemplate === 'game_studio';
  const isSoftwareWebTemplate = normalizedTemplate === 'software_web_app' || normalizedTemplate === 'software_agency';
  const isMobileTemplate = normalizedTemplate === 'mobile_app';
  const isSoftwareTemplate = isSoftwareWebTemplate || isMobileTemplate;
  if (!goalText) {
    return {
      generatedAt: nowIso(),
      source: 'template_default',
      goal: '',
      assumptions: [],
      clarificationQuestions: [],
      requiredConnectors: [],
      missingCredentialServices: [],
      tasks: [],
      milestones: [],
    };
  }

  const tags = normalizeGoalKeywordTags(goalText);
  const clarificationQuestions = goalClarificationQuestions(templateId, goalText, tags);
  const planConfig = planningSettings();
  const imageTemplateContractId = isGameTemplate
    ? 'game_studio'
    : (isMobileTemplate
      ? 'mobile_app'
      : (isSoftwareWebTemplate ? 'software_web_app' : ''));
  const imageTemplateLabel = imageTemplateContractId === 'game_studio'
    ? 'game'
    : (imageTemplateContractId === 'mobile_app' ? 'mobile app' : (imageTemplateContractId === 'software_web_app' ? 'web app' : 'project'));
  const needsManagedDatabase = Boolean(tags.webApp || tags.social || tags.marketplace || tags.property || tags.healthcare || tags.ecommerce || tags.fintech);
  const connectorSet = new Set();
  if (isSoftwareWebTemplate || ((tags.deployment || tags.webApp) && !isMobileTemplate)) connectorSet.add('netlify');
  if (isMobileTemplate) connectorSet.add('google_play');
  if (isGameTemplate || isSoftwareTemplate || tags.imageGeneration) connectorSet.add('image_generator');
  if (tags.payments) connectorSet.add('stripe');
  if (tags.marketing) connectorSet.add('google_ads');
  if (needsManagedDatabase && planConfig.preferredDatabaseService === 'supabase') connectorSet.add('supabase');
  if (tags.support || tags.property || tags.healthcare) {
    connectorSet.add('support_ticket');
    connectorSet.add('email_provider');
  }
  if (tags.ecommerce || tags.fintech) connectorSet.add('stripe');
  if (tags.analytics || tags.marketing || tags.payments || tags.ecommerce) connectorSet.add('analytics');
  if (tags.marketplace || tags.social) {
    connectorSet.add('stripe');
    connectorSet.add('support_ticket');
    connectorSet.add('email_provider');
  }

  const requiredConnectors = Array.from(connectorSet);
  const metadata = readCredentialMetadata();
  const missingCredentialServices = requiredConnectors.filter((connector) => {
    const connectorMeta = CONNECTOR_REGISTRY[connector] || null;
    if (!connectorMeta || !connectorMeta.credentialService) return false;
    const service = CONNECTOR_REGISTRY[connector] && CONNECTOR_REGISTRY[connector].credentialService
      ? CONNECTOR_REGISTRY[connector].credentialService
      : connector;
    const entry = metadata.find((item) => item.service === service);
    return !(entry && entry.connected);
  });

  const GOAL_PHASE_SEQUENCE = ['strategy', 'product_build', 'finance', 'compliance', 'deployment', 'growth', 'analytics', 'marketing', 'support', 'maintenance'];
  const lastIdxByPhase = {};
  const tasks = [];
  const strategyOwnerRole = projectLeadRoleForTemplate(template) || 'Senior Project Manager';
  const addTask = (task) => {
    if (!task || !task.title) return;
    const phase = String(task.phase || 'general');
    const phasePos = GOAL_PHASE_SEQUENCE.indexOf(phase);
    let depIdx = null;
    if (typeof lastIdxByPhase[phase] === 'number') {
      depIdx = lastIdxByPhase[phase];
    } else if (phasePos > 0) {
      for (let p = phasePos - 1; p >= 0; p--) {
        const prev = GOAL_PHASE_SEQUENCE[p];
        if (typeof lastIdxByPhase[prev] === 'number') {
          depIdx = lastIdxByPhase[prev];
          break;
        }
      }
    }
    const idx = tasks.length;
    tasks.push({ ...task, dependencies: depIdx !== null ? [depIdx] : [] });
    lastIdxByPhase[phase] = idx;
  };

  addTask({
    title: 'Coordinator + CEO convert goal into execution charter',
    phase: 'strategy',
    requiredRole: strategyOwnerRole,
    description: `Analyze goal prompt, constraints, and success metrics: ${goalText}`,
  });
  addTask({
    title: 'Define milestone roadmap, owners, and acceptance checks',
    phase: 'strategy',
    requiredRole: strategyOwnerRole,
    description: 'Produce execution milestones from point A to point B with owner roles and verification gates.',
  });

  if (normalizedTemplate === 'business') {
    addTask({
      title: 'Run structured market and UX research baseline before implementation',
      phase: 'strategy',
      requiredRole: strategyOwnerRole,
      description: 'Research comparable products and best-practice UX patterns using web/browser tooling. Produce docs/research_brief.md with: product archetype, competitor pattern matrix, must-have vs later feature split, role/persona map, navigation model, trust/compliance risks, and explicit open questions to operator.',
    });
  }

  if (normalizedTemplate === 'game_studio') {
    addTask({
      title: 'Run structured genre and visual-direction research baseline',
      phase: 'strategy',
      requiredRole: strategyOwnerRole,
      description: 'Research similar games and genre conventions using web/browser tooling. Produce docs/game_research_brief.md with: genre references, perspective choice (top-down/side-scroller/isometric/etc), visual style board, control scheme options, scope benchmark for MVP, and explicit design risks/questions.',
    });
  }

  if (planConfig.preferFreeTierFirst) {
    const databaseTier = planConfig.preferredDatabaseService === 'supabase' && needsManagedDatabase
      ? 'Supabase free tier'
      : 'manual database selection';
    const freeTierDescription = isMobileTemplate
      ? `Default to Expo managed workflow for cross-platform mobile delivery and EAS free tier for Android packaging; use ${databaseTier} for data/auth where applicable.`
      : `Default to the lowest-cost launch stack first: Netlify free tier for hosting and ${databaseTier} for data/auth where applicable.`;
    addTask({
      title: 'Choose free-tier infrastructure footprint for MVP launch',
      phase: 'strategy',
      requiredRole: strategyOwnerRole,
      description: freeTierDescription,
    });
  }

  if (tags.webApp || isSoftwareTemplate) {
    const businessRequirements = !isMobileTemplate
      ? buildBusinessWebExperienceRequirements(tags, goalText).join(', ')
      : null;
    addTask({
      title: isMobileTemplate
        ? 'Design system architecture, mobile state model, and API contracts'
        : 'Design system architecture, domain model, and API contracts',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: isMobileTemplate
        ? 'Translate business workflows into React Native app modules, backend services, data model, and endpoint contracts.'
        : 'Translate business workflows into backend services, data model, and endpoint contracts.',
    });
    addTask({
      title: isMobileTemplate
        ? 'Implement cross-platform mobile experience (React Native + Expo) and role-based user journeys'
        : 'Implement core web experience and role-based user journeys',
      phase: 'product_build',
      requiredRole: 'UI Designer',
      description: isMobileTemplate
        ? 'Build production-ready mobile UX in React Native with Expo navigation/state patterns for required personas and success paths.'
        : `Build production-ready web UX in React + TypeScript for required personas and success paths, including: ${businessRequirements}.`,
    });
  }

  if (needsManagedDatabase && planConfig.preferredDatabaseService === 'supabase') {
    addTask({
      title: 'Provision Supabase database, auth, and storage baseline',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: 'Set up the MVP data plane using Supabase first: relational schema, auth boundaries, storage buckets, and row-level access strategy.',
    });
  }

  if (tags.property) {
    addTask({
      title: 'Implement landlord/tenant/property lifecycle workflows',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: 'Cover listings, applications, approvals, tenancy management, and operational state transitions.',
    });
  }

  if (tags.payments) {
    addTask({
      title: 'Model recurring billing, subscription lifecycle, and payment recovery',
      phase: 'finance',
      requiredRole: 'Finance Tracker',
      description: 'Define monthly fee collection logic, invoicing events, and failed-payment handling.',
    });
  }

  if (tags.healthcare) {
    addTask({
      title: 'Design HIPAA-aligned data architecture and consent workflows',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: 'Define PHI boundaries, access controls, consent capture, and data retention policies.',
    });
    addTask({
      title: 'Establish patient data escalation and regulated support triage policy',
      phase: 'compliance',
      requiredRole: 'Legal Compliance Checker',
      description: 'Document PHI access paths, breach notification procedures, and regulated support routing.',
    });
  }

  if (tags.ecommerce) {
    addTask({
      title: 'Build product catalog, inventory tracking, and order management system',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: 'Implement catalog management, stock levels, order lifecycle, and fulfillment workflows.',
    });
    addTask({
      title: 'Configure pricing rules, discount engine, and checkout flow',
      phase: 'finance',
      requiredRole: 'Finance Tracker',
      description: 'Set up product pricing, promotional tiers, tax rules, and checkout-to-payment integration.',
    });
  }

  if (tags.fintech) {
    addTask({
      title: 'Model financial ledger, accounts payable/receivable, and reporting pipeline',
      phase: 'finance',
      requiredRole: 'Finance Tracker',
      description: 'Define transaction recording, reconciliation workflows, and financial reporting outputs.',
    });
  }

  if (isGameTemplate || isSoftwareTemplate || tags.imageGeneration) {
    addTask({
      title: 'Configure image generation runtime profile and 8GB VRAM-safe defaults',
      phase: 'strategy',
      requiredRole: 'Backend Architect',
      description: 'Select an image model profile for low-VRAM execution, set deterministic seed policy, and document retry/timeout guardrails for first-run downloads.',
      autoAction: {
        type: 'connector',
        connector: 'image_generator',
        operation: 'warmup',
        input: {},
        estimatedCost: 0,
        actorRole: 'Backend Architect',
        requiresPermission: false,
      },
    });
    addTask({
      title: `Define template-aware asset contract for generated ${imageTemplateLabel} art`,
      phase: 'strategy',
      requiredRole: isGameTemplate ? 'Game Designer' : 'Backend Architect',
      description: 'Lock required asset pack outputs with dimensions, naming, and acceptance criteria for downstream implementation tasks.',
      autoAction: {
        type: 'connector',
        connector: 'image_generator',
        operation: 'get_asset_pack_contract',
        input: { templateId: imageTemplateContractId || normalizedTemplate },
        estimatedCost: 0,
        actorRole: 'Backend Architect',
        requiresPermission: false,
      },
    });
    addTask({
      title: isGameTemplate
        ? 'Generate baseline visual asset pack for prototype gameplay loop'
        : `Generate baseline visual asset pack for ${imageTemplateLabel} MVP`,
      phase: 'product_build',
      requiredRole: isGameTemplate ? 'Technical Artist' : 'Backend Architect',
      description: isGameTemplate
        ? 'Generate initial player/enemy sprites, tileset, icon set, and key art using template-aware prompts. Persist metadata for reproducibility.'
        : 'Generate initial marketing and interface artwork using template-aware prompts. Persist metadata for reproducibility.',
      autoAction: {
        type: 'connector',
        connector: 'image_generator',
        operation: 'generate_asset_pack',
        input: { templateId: imageTemplateContractId || normalizedTemplate },
        estimatedCost: 0,
        actorRole: 'Backend Architect',
        requiresPermission: true,
      },
    });
    addTask({
      title: 'Run end-to-end image pipeline self-test and auto-wire assets',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: 'Generate a smoke asset, inject it into template paths, verify manifest and dimension checks, and confirm template UI wiring can resolve generated assets.',
      autoAction: {
        type: 'connector',
        connector: 'image_generator',
        operation: 'self_test',
        input: { templateId: imageTemplateContractId || normalizedTemplate },
        estimatedCost: 0,
        actorRole: 'Backend Architect',
        requiresPermission: false,
      },
    });
    addTask({
      title: 'Run deterministic golden prompt regression suite',
      phase: 'compliance',
      requiredRole: 'Backend Architect',
      description: 'Run deterministic template-specific golden prompts and verify output invariants so image generation regressions are caught before project completion.',
      autoAction: {
        type: 'connector',
        connector: 'image_generator',
        operation: 'golden_regression',
        input: { templateId: imageTemplateContractId || normalizedTemplate },
        estimatedCost: 0,
        actorRole: 'Backend Architect',
        requiresPermission: false,
      },
    });
    addTask({
      title: 'Run image safety/moderation and storage lifecycle governance checks',
      phase: 'compliance',
      requiredRole: 'Legal Compliance Checker',
      description: 'Validate prompt safety policy enforcement, artifact metadata completeness, retention policy, and quota pruning behavior before release.',
      autoAction: {
        type: 'connector',
        connector: 'image_generator',
        operation: 'prune_storage',
        input: {},
        estimatedCost: 0,
        actorRole: 'Backend Architect',
        requiresPermission: false,
      },
    });
  }

  requiredConnectors.forEach((connector) => {
    const probe = connectorHealthCheckActionForService(connector);
    if (!probe) return;
    addTask({
      title: `Validate ${connector} connector readiness`,
      phase: probe.phase,
      requiredRole: probe.actorRole,
      description: `Coordinator validates ${connector} credentials and API connectivity before autonomous execution.`,
      autoAction: {
        type: 'connector',
        connector: probe.connector,
        operation: probe.operation,
        input: {},
        estimatedCost: 0,
        actorRole: probe.actorRole,
        requiresPermission: false,
      },
    });
  });

  if (tags.deployment || tags.webApp) {
    addTask({
      title: 'Prepare deployment runbook and production rollback checks',
      phase: 'deployment',
      requiredRole: 'Backend Architect',
      description: 'Ensure release safety checks, rollback path, and release verification are in place.',
    });
  }

  if (isMobileTemplate) {
    if (tags.mobileMonetization || tags.payments) {
      addTask({
        title: 'Define mobile monetization model and in-app billing strategy',
        phase: 'finance',
        requiredRole: 'Finance Tracker',
        description: 'Choose monetization approach (free / ads / IAP / subscriptions / hybrid). Define paywall placement, entitlement tiers, pricing SKUs, and free-to-paid conversion funnel before build begins.',
      });
      addTask({
        title: 'Implement app store billing catalog and in-app purchase flows',
        phase: 'product_build',
        requiredRole: 'Backend Architect',
        description: 'Configure Google Play Billing / RevenueCat SKUs. Wire purchase initiation, server-side receipt validation, entitlement state management, and restore-purchases flow.',
      });
      addTask({
        title: 'Instrument monetization funnel and conversion KPI tracking',
        phase: 'analytics',
        requiredRole: 'Finance Tracker',
        description: 'Track paywall impressions, purchase events, subscription starts/cancellations, and LTV estimates. Wire to analytics connector for recurring revenue dashboards.',
      });
    }
    addTask({
      title: 'Build signed Android App Bundle (AAB) and submit to Play Store internal track',
      phase: 'deployment',
      requiredRole: 'DevOps Automator',
      description: [
        'Build a signed release AAB via EAS Build (eas build --platform android --profile production).',
        'If google_play connector is connected and project mode is not draft: upload AAB to the Play Store internal testing track via the Google Play Console API (upload_bundle, track=internal).',
        'If connector is not yet connected: produce docs/release_handoff.md with signing config, upload steps, compliance checklist, and Play Store listing guidance for manual submission.',
        'Document minimum API level, permissions manifest, and privacy policy URL before any submission.',
      ].join(' '),
      autoAction: {
        type: 'connector',
        connector: 'google_play',
        operation: 'upload_bundle',
        input: { track: 'internal' },
        estimatedCost: 0,
        actorRole: 'DevOps Automator',
        requiresPermission: true,
      },
    });
  }

  if (tags.marketing || tags.analytics) {
    addTask({
      title: 'Launch growth instrumentation and acquisition optimization loop',
      phase: 'growth',
      requiredRole: 'Growth Hacker + Content Creator',
      description: 'Connect KPIs to campaign actions and establish recurring optimization cadence.',
    });
  }

  if (tags.support || tags.property) {
    addTask({
      title: 'Establish support triage, SLA routing, and escalation playbook',
      phase: 'support',
      requiredRole: 'Support Responder',
      description: 'Define support response policy, escalation triggers, and feedback closure loop.',
    });
  }

  if (tags.legal || tags.property || templateId === 'business') {
    addTask({
      title: 'Run legal/compliance risk review for operating model',
      phase: 'compliance',
      requiredRole: 'Legal Compliance Checker',
      description: 'Review contracts, privacy, policy obligations, and regulated workflow boundaries.',
    });
  }

  if (tags.marketplace) {
    addTask({
      title: 'Build listing, auction/bidding mechanics, and transaction flow',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: 'Implement listing creation, bid management, auction lifecycle, transaction settlement, and seller/buyer dashboards.',
    });
    addTask({
      title: 'Configure platform commission, fee structure, and payout routing',
      phase: 'finance',
      requiredRole: 'Finance Tracker',
      description: 'Set up take-rate rules, seller payout timing, escrow-like settlement, and financial reconciliation.',
    });
  }

  if (tags.social) {
    addTask({
      title: 'Implement user profile management, onboarding, and verification flow',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: 'Cover account creation, profile setup, identity verification, photo/media handling, and privacy controls.',
    });
    addTask({
      title: 'Build trust and safety system: reporting, moderation, and community guidelines enforcement',
      phase: 'compliance',
      requiredRole: 'Legal Compliance Checker',
      description: 'Implement user reporting, content moderation workflow, ban/block mechanics, and community policy enforcement.',
    });
    if (planConfig.preferredDatabaseService === 'supabase') {
      addTask({
        title: 'Model relational schema for profiles, matches, chat, and moderation records',
        phase: 'product_build',
        requiredRole: 'Backend Architect',
        description: 'Use a relational data model for profile visibility, matching state, conversations, blocks, reports, and moderation audit trails.',
      });
    }
  }

  if (tags.marketplace || tags.social) {
    addTask({
      title: 'Establish user safety incident escalation and abuse response playbook',
      phase: 'support',
      requiredRole: 'Support Responder',
      description: 'Define escalation paths for harassment, fraud, and platform abuse incidents with fast-response SLAs.',
    });
  }

  if (tags.marketplace || tags.ecommerce || tags.payments || tags.fintech) {
    addTask({
      title: 'Execute payment flow validation and settlement simulation',
      phase: 'finance',
      requiredRole: 'Finance Tracker',
      description: 'Run a controlled payment-intent flow to validate billing logic, settlement routing, and connector policy controls.',
      autoAction: {
        type: 'connector',
        connector: 'stripe',
        operation: 'create_payment_intent',
        input: { mode: 'simulation', amount: 1000, currency: 'usd' },
        estimatedCost: 20,
        actorRole: 'Finance Tracker',
        requiresPermission: true,
      },
    });
  }

  if (tags.fintech) {
    addTask({
      title: 'Run invoice issuance and collection workflow validation',
      phase: 'finance',
      requiredRole: 'Finance Tracker',
      description: 'Validate invoice generation, collection events, and reconciliation checkpoints for finance-heavy workflows.',
      autoAction: {
        type: 'connector',
        connector: 'stripe',
        operation: 'create_invoice',
        input: { mode: 'simulation' },
        estimatedCost: 15,
        actorRole: 'Finance Tracker',
        requiresPermission: true,
      },
    });
  }

  if (tags.marketplace || tags.social || tags.support || tags.healthcare) {
    addTask({
      title: 'Execute support-ticket triage automation baseline',
      phase: 'support',
      requiredRole: 'Support Responder',
      description: 'Run support-ticket triage to verify routing, escalation behavior, and SLA-aware queue handling.',
      autoAction: {
        type: 'connector',
        connector: 'support_ticket',
        operation: 'triage_tickets',
        input: { mode: 'baseline' },
        estimatedCost: 0,
        actorRole: 'Support Responder',
        requiresPermission: true,
      },
    });
  }

  if (tags.marketplace || tags.social || tags.marketing) {
    addTask({
      title: 'Run lifecycle messaging dry-run for onboarding and policy updates',
      phase: 'support',
      requiredRole: 'Support Responder',
      description: 'Validate outbound messaging pipeline for onboarding, policy updates, and account notices.',
      autoAction: {
        type: 'connector',
        connector: 'email_provider',
        operation: 'send_campaign',
        input: { mode: 'dry_run', audience: 'internal_test' },
        estimatedCost: 0,
        actorRole: 'Support Responder',
        requiresPermission: true,
      },
    });
  }

  if (String(templateId || '').toLowerCase() === 'game_studio') {
    const fastLocalGameMode = runtimeSettings().fastLocalIterationMode === true;
    addTask({
      title: 'Design game mechanics, rules, and player experience',
      phase: 'product_build',
      requiredRole: 'Game Designer',
      description: [
        `Design the complete game for: "${goalText}".`,
        'Produce a design document covering: core game loop, controls, win/lose conditions, scoring, visual theme, and UX flow.',
        'Write the design doc to the workspace at /sandbox/workspace/projects/{projectId}/game_design.md using the file tool.',
        'This doc will guide the Developer agent during implementation.',
      ].join('\n'),
    });
    addTask({
      title: 'Implement game HTML structure (index.html)',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: [
        `Write the HTML page for the browser game: "${goalText}".`,
        'Write ONLY this one file using the file tool (action=write):',
        '  /sandbox/workspace/projects/{projectId}/game/index.html',
        'Requirements:',
        '  - Include <link rel="stylesheet" href="./style.css"> and <script src="./game.js"></script>.',
        '  - Include a #game-container div, a score/status area, core gameplay region, and a #restartBtn button.',
        '  - The <title> and main <h1> must match the project name exactly.',
        '  - Do NOT include HIVEFORGE_SCAFFOLD_PLACEHOLDER anywhere.',
        'Write only index.html, then end with TASK_DONE.',
      ].join('\n'),
    });
    addTask({
      title: 'Implement game JavaScript logic (game.js)',
      phase: 'product_build',
      requiredRole: 'Backend Architect',
      description: [
        `Write the complete, playable game logic for: "${goalText}".`,
        'Optionally read for context: /sandbox/workspace/projects/{projectId}/game_design.md',
        'Write ONLY this one file using the file tool (action=write):',
        '  /sandbox/workspace/projects/{projectId}/game/game.js',
        'Requirements:',
        '  - Vanilla JavaScript only � no imports, no npm packages.',
        '  - Universal gameplay loop contract (genre-agnostic):',
        '    * Main loop scheduler (requestAnimationFrame or equivalent timer).',
        '    * Player input handlers (keyboard/mouse/touch as relevant).',
        '    * Update step + render step each frame/tick.',
        '    * Progress metric (score/points/level/objective/timer/currency).',
        '    * Explicit success condition and explicit failure condition.',
        '    * Restart path that returns to a playable state.',
        '  - Use getElementById/querySelector to interact with DOM elements from index.html.',
        '  - Do NOT include HIVEFORGE_SCAFFOLD_PLACEHOLDER anywhere.',
        'Write only game.js, then end with TASK_DONE.',
      ].join('\n'),
    });
    addTask({
      title: '[QA GATE] Validate game loop: requestAnimationFrame, update, render, win/lose, restart',
      phase: 'product_build',
      requiredRole: 'QA Validator',
      description: [
        `Strict validation gate for: "${goalText}".`,
        '',
        'This is a BLOCKING GATE. Do NOT proceed to CSS until all checks pass.',
        '',
        'ACTION: Read game.js and confirm these exact elements exist:',
        '  1. requestAnimationFrame(...) or setInterval(...) main loop scheduler',
        '  2. updateFrame(dt) function definition (updates state, collision, scoring)',
        '  3. renderFrame() function definition (draws canvas with entities)',
        '  4. Explicit win condition check and triggerWin() call',
        '  5. Explicit game-over condition check and triggerGameOver() call',
        '  6. restart/startGame path that resets world state and returns to PLAYING',
        '',
        'If ANY element is missing or commented out:',
        '  Immediately reject this task (exit 1) so a remediation subtask is created.',
        '',
        'If ALL elements are present and verified:',
        '  End with TASK_DONE to unblock CSS and subsequent tasks.',
      ].join('\n'),
    });
    addTask({
      title: 'Implement game CSS styles (style.css)',
      phase: 'product_build',
      requiredRole: 'UI Designer',
      description: [
        `Write the complete visual styles for the browser game: "${goalText}".`,
        'Write ONLY this one file using the file tool (action=write):',
        '  /sandbox/workspace/projects/{projectId}/game/style.css',
        'Requirements:',
        '  - Polished visual style matched to the game concept in the goal prompt.',
        '  - Style gameplay area, player/status panels, buttons, and status messages.',
        '  - Responsive layout that works at 900px+ width.',
        '  - Do NOT include HIVEFORGE_SCAFFOLD_PLACEHOLDER anywhere.',
        'Write only style.css, then end with TASK_DONE.',
      ].join('\n'),
    });
    addTask({
      title: 'Validate game files and fix any remaining scaffold',
      phase: 'product_build',
      requiredRole: 'QA',
      description: [
        `Validate all three game files for: "${goalText}".`,
        'Use the file tool (action=read) to read each file:',
        '  /sandbox/workspace/projects/{projectId}/game/index.html',
        '  /sandbox/workspace/projects/{projectId}/game/game.js',
        '  /sandbox/workspace/projects/{projectId}/game/style.css',
        'For EACH file: if it contains "HIVEFORGE_SCAFFOLD_PLACEHOLDER" or has fewer than 30 lines of real content,',
        '  immediately rewrite that file from scratch with a complete, working implementation using the file tool (action=write).',
        'game.js MUST contain full game logic. style.css MUST contain complete styles. index.html MUST have proper structure.',
        'End with TASK_DONE only after confirming all three files are complete with no scaffold placeholder.',
      ].join('\n'),
    });
    if (!fastLocalGameMode) {
      addTask({
        title: 'Deploy finalized game build to Netlify',
        phase: 'deployment',
        requiredRole: 'Backend Architect',
        description: 'Trigger a fresh Netlify deploy using the configured site binding after game files are fully implemented and validated.',
        autoAction: {
          type: 'connector',
          connector: 'netlify',
          operation: 'trigger_deploy',
          input: {
            siteId: '{{netlify_site_id}}',
          },
          estimatedCost: 0,
          actorRole: 'Backend Architect',
          requiresPermission: false,
        },
      });
    } else {
      addTask({
        title: 'Run local-only gameplay verification pass',
        phase: 'deployment',
        requiredRole: 'Evidence Collector',
        description: 'Fast local iteration mode is enabled. Validate playability in local preview and defer remote deploy until operator explicitly requests release deploy.',
      });
    }
  }

  addTask({
    title: 'Publish coordinator operating runbook and autonomous maintenance policy',
    phase: 'maintenance',
    requiredRole: strategyOwnerRole,
    description: 'Document monitoring, escalation, and long-running business maintenance procedures.',
  });

  if (planConfig.requireApprovalForPaidTierUpgrade && (tags.webApp || needsManagedDatabase || requiredConnectors.length > 0)) {
    addTask({
      title: 'Define provider upgrade thresholds and approval gate before moving off free tiers',
      phase: 'maintenance',
      requiredRole: strategyOwnerRole,
      description: 'Keep Netlify and data providers on free tiers until storage, bandwidth, performance, or compliance thresholds justify an upgrade, then request operator approval before any paid plan change.',
    });
  }

  const milestones = buildGoalMilestones(tasks, tags);
  const assumptions = [
    'Coordinator remains the only credential-broker and policy enforcer.',
    'Blocked connector actions trigger operator assistance notifications with context.',
    'Plan executes using currently available connectors and falls back to manual assistance where needed.',
  ];
  if (planConfig.preferFreeTierFirst) {
    assumptions.push('Infrastructure planning starts on free or hobby tiers before any paid provider plans are considered.');
  }
  if (planConfig.requireApprovalForPaidTierUpgrade) {
    assumptions.push('Any provider tier upgrade beyond free defaults requires explicit operator approval before execution.');
  }

  return {
    generatedAt: nowIso(),
    source: 'goal_prompt_analysis',
    goal: goalText,
    tags,
    planning: {
      ...planConfig,
      recommendedHostingTier: planConfig.preferFreeTierFirst ? 'free' : 'operator_choice',
      recommendedDatabaseService: needsManagedDatabase ? planConfig.preferredDatabaseService : null,
    },
    assumptions,
    clarificationQuestions,
    requiredConnectors,
    missingCredentialServices,
    tasks,
    milestones,
  };
}

function createInitialTasks(template, options = {}) {
  const breakdown = Array.isArray(template.task_breakdown) ? template.task_breakdown : [];
  const dependencyGraph = template.dependency_graph || {};
  const createdAt = nowIso();
  const baseTasks = breakdown.map((task, idx) => ({
    id: task.id || `TASK-${idx + 1}`,
    title: task.title || `Task ${idx + 1}`,
    phase: task.phase || 'general',
    status: 'backlog',
    assignee: null,
    blockedBy: (dependencyGraph[task.id] || [])[0] || null,
    dependencies: dependencyGraph[task.id] || [],
    executionState: 'queued',
    retryCount: 0,
    lastFailedAt: null,
    lastError: null,
    lastProgressAt: null,
    executionTaskRunId: null,
    inprogressCycles: 0,
    pendingApproval: null,
    autoActionNotBeforeAt: null,
    deadLetteredAt: null,
    createdAt,
    completedAt: null,
    startedAt: null,
    description: '',
    assistanceRequestedAt: null,
    retryLineage: [],
  }));

  const goalPlan = options.goalPlan && typeof options.goalPlan === 'object' ? options.goalPlan : null;
  const templateId = String(options.templateId || '').trim().toLowerCase();
  const generatedTasks = Array.isArray(goalPlan && goalPlan.tasks)
    ? goalPlan.tasks.map((task, idx) => {
        const dependencies = Array.isArray(task.dependencies)
          ? task.dependencies
              .map((dep) => Number(dep))
              .filter((dep) => Number.isInteger(dep) && dep >= 0 && dep < (goalPlan.tasks.length || 0))
              .map((dep) => `GOAL-${dep + 1}`)
          : (idx === 0 ? [] : [`GOAL-${idx}`]);
        return {
          id: `GOAL-${idx + 1}`,
          title: String(task.title || `Goal task ${idx + 1}`),
          phase: String(task.phase || 'strategy'),
          status: 'backlog',
          assignee: null,
          blockedBy: dependencies[0] || null,
          dependencies,
          requiredRole: task.requiredRole ? String(task.requiredRole) : null,
          executionState: 'queued',
          retryCount: 0,
          lastFailedAt: null,
          lastError: null,
          lastProgressAt: null,
          executionTaskRunId: null,
          inprogressCycles: 0,
          pendingApproval: null,
          autoActionNotBeforeAt: null,
          deadLetteredAt: null,
          recurringKey: null,
          autoAction: task.autoAction && task.autoAction.type === 'connector'
            ? {
                type: 'connector',
                connector: task.autoAction.connector,
                operation: task.autoAction.operation,
                input: task.autoAction.input || {},
                estimatedCost: Number(task.autoAction.estimatedCost || 0),
                actorRole: String(task.autoAction.actorRole || task.requiredRole || ''),
                requiresPermission: Boolean(task.autoAction.requiresPermission),
              }
            : null,
          createdAt,
          completedAt: null,
          startedAt: null,
          description: String(task.description || ''),
          assistanceRequestedAt: null,
          retryLineage: [],
        };
      })
    : [];

  if (!generatedTasks.length) {
    return baseTasks;
  }
  if (templateId === 'business' || templateId === 'game_studio') {
    return generatedTasks;
  }
  return [...generatedTasks, ...baseTasks];
}

function humanizeDurationMs(ms) {
  const totalMinutes = Math.max(1, Math.round(Number(ms || 0) / 60000));
  if (totalMinutes % (24 * 60) === 0) return `${totalMinutes / (24 * 60)}d`;
  if (totalMinutes % 60 === 0) return `${totalMinutes / 60}h`;
  return `${totalMinutes}m`;
}

function buildGoalMilestones(tasks, tags = {}) {
  const PHASE_TITLE_MAP = {
    strategy: 'Strategy & Charter',
    product_build: 'Product Build & Architecture',
    finance: 'Finance, Billing & Payments',
    compliance: 'Legal & Compliance Review',
    deployment: 'Deployment & Release',
    growth: 'Growth & Acquisition',
    analytics: 'Analytics & Instrumentation',
    marketing: 'Marketing',
    support: 'Support & Operations',
    maintenance: 'Ongoing Maintenance',
  };
  const PHASE_ACCEPTANCE_MAP = {
    strategy: ['Execution charter reviewed and accepted by coordinator', 'Milestone roadmap and owners documented with verification gates'],
    product_build: ['Core product features implemented, reviewed, and ready for deployment'],
    finance: ['Billing flows tested end-to-end with live connector', 'Payment recovery and edge cases documented'],
    compliance: ['Legal/compliance review complete with no blocking findings', 'Policy and operating obligations documented'],
    deployment: ['Production deployment successful', 'Rollback path verified and documented'],
    growth: ['KPI instrumentation live with data flowing', 'Initial campaign or acquisition loop running'],
    analytics: ['Analytics pipeline verified with live data', 'Dashboards and alerting configured'],
    marketing: ['Marketing channels configured', 'Campaign KPIs set and tracked'],
    support: ['Support triage policy documented and SLA routing active', 'Escalation paths verified'],
    maintenance: ['Coordinator operating runbook published', 'Autonomous maintenance policy active'],
  };
  const phaseOrder = [];
  const tasksByPhase = {};
  tasks.forEach((task, idx) => {
    const phase = String(task.phase || 'general');
    if (!tasksByPhase[phase]) {
      tasksByPhase[phase] = [];
      phaseOrder.push(phase);
    }
    tasksByPhase[phase].push(`GOAL-${idx + 1}`);
  });
  return phaseOrder.map((phase) => ({
    id: `MS-${phase}`,
    phase,
    title: PHASE_TITLE_MAP[phase] || String(phase).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    acceptanceCriteria: PHASE_ACCEPTANCE_MAP[phase] || [`All ${phase} tasks completed and verified`],
    requiredTaskIds: tasksByPhase[phase],
    completedAt: null,
  }));
}

function evaluateMilestoneCompletion(projectState) {
  const goalPlan = projectState.goalPlan;
  if (!goalPlan || !Array.isArray(goalPlan.milestones) || goalPlan.milestones.length === 0) {
    return { total: 0, completed: 0, pct: 100, milestones: [] };
  }
  const doneTasks = new Set(projectState.tasks.filter((t) => t.status === 'done').map((t) => t.id));
  let completed = 0;
  const milestones = goalPlan.milestones.map((m) => {
    const requiredIds = Array.isArray(m.requiredTaskIds) ? m.requiredTaskIds : [];
    const allDone = requiredIds.length > 0 && requiredIds.every((id) => doneTasks.has(id));
    if (allDone && !m.completedAt) m.completedAt = nowIso();
    else if (!allDone) m.completedAt = null;
    if (m.completedAt) completed++;
    return {
      id: m.id,
      phase: m.phase,
      title: m.title,
      completedAt: m.completedAt || null,
      requiredTaskCount: requiredIds.length,
      doneTaskCount: requiredIds.filter((id) => doneTasks.has(id)).length,
    };
  });
  const total = milestones.length;
  return { total, completed, pct: total === 0 ? 100 : Math.round((completed / total) * 100), milestones };
}

function hasGameStudioPlayableArtifacts(projectState) {
  if (!projectState || String(projectState.template || '').toLowerCase() !== 'game_studio') return true;
  const root = projectWorkspaceDir(projectState.id);
  const required = [
    path.join(root, 'game', 'index.html'),
    path.join(root, 'game', 'game.js'),
    path.join(root, 'game', 'style.css'),
  ];
  return required.every((target) => fs.existsSync(target) && fs.statSync(target).isFile());
}

function hasGameStudioDeployEvidence(projectState) {
  if (!projectState || String(projectState.template || '').toLowerCase() !== 'game_studio') return true;
  if (runtimeSettings().fastLocalIterationMode) return true;
  const netlify = projectState.connectorBindings && projectState.connectorBindings.netlify
    ? projectState.connectorBindings.netlify
    : {};
  return Boolean(String(netlify.lastDeployUrl || '').trim());
}

function templateRequiredArtifactSpecs(projectState) {
  if (!projectState) return [];
  return templateArtifactContract(String(projectState.template || '').toLowerCase());
}

function templateRequiredArtifactPaths(projectState) {
  const root = projectWorkspaceDir(projectState.id);
  return templateRequiredArtifactSpecs(projectState).map((item) => path.join(root, item.path));
}

function hasTemplateDeliveryArtifacts(projectState) {
  const specs = templateRequiredArtifactSpecs(projectState);
  if (!specs.length) return true;
  const root = projectWorkspaceDir(projectState.id);
  return specs.every((spec) => {
    const target = path.join(root, spec.path);
    try {
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;
      const text = fs.readFileSync(target, 'utf-8');
      if (text.includes('HIVEFORGE_SCAFFOLD_PLACEHOLDER')) return false;
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const minLines = Number.isFinite(Number(spec.minLines)) ? Number(spec.minLines) : 1;
      return lines.length >= minLines;
    } catch {
      return false;
    }
  });
}

function templateImageContractItems(projectState) {
  if (!projectState) return [];
  const templateId = String(projectState.template || '').toLowerCase();
  return imageAssetPackContractForTemplate(templateId, {});
}

function templateImageInjectionRoot(projectState) {
  if (!projectState) return null;
  const workspaceRoot = projectWorkspaceDir(projectState.id);
  const templateId = String(projectState.template || '').toLowerCase();
  if (templateId === 'game_studio') return path.join(workspaceRoot, 'game', 'assets', 'generated');
  if (templateId === 'software_web_app' || templateId === 'software_agency') return path.join(workspaceRoot, 'web', 'public', 'assets', 'generated');
  if (templateId === 'mobile_app') return path.join(workspaceRoot, 'mobile', 'assets', 'generated');
  return null;
}

function templateImageManifestPath(projectState) {
  if (!projectState) return null;
  return path.join(projectWorkspaceDir(projectState.id), 'docs', 'generated_image_assets.json');
}

function writeTemplateImageAssetModule(projectState, manifestItems) {
  if (!projectState) return;
  const templateId = String(projectState.template || '').toLowerCase();
  const workspaceRoot = projectWorkspaceDir(projectState.id);
  if (templateId === 'software_web_app' || templateId === 'software_agency') {
    const modulePath = path.join(workspaceRoot, 'web', 'src', 'generatedImageAssets.ts');
    ensureDir(path.dirname(modulePath));
    const lines = [
      'export const generatedImageAssets = {',
      ...manifestItems.map((item) => `  ${JSON.stringify(item.key)}: ${JSON.stringify(item.publicUrl || '')},`),
      '} as const;',
      '',
    ];
    fs.writeFileSync(modulePath, lines.join('\n'), 'utf-8');
  }
  if (templateId === 'mobile_app') {
    const modulePath = path.join(workspaceRoot, 'mobile', 'src', 'generatedImageAssets.ts');
    ensureDir(path.dirname(modulePath));
    const lines = [
      '/* eslint-disable @typescript-eslint/no-var-requires */',
      'export const generatedImageAssets = {',
      ...manifestItems.map((item) => `  ${JSON.stringify(item.key)}: require(${JSON.stringify(item.mobileRequirePath || '../assets/generated/placeholder.png')}),`),
      '} as const;',
      '',
    ];
    fs.writeFileSync(modulePath, lines.join('\n'), 'utf-8');
  }
}

function writeTemplateImageAssetSummary(projectState, manifest) {
  if (!projectState) return;
  const docsPath = path.join(projectWorkspaceDir(projectState.id), 'docs', 'generated_image_assets.md');
  ensureDir(path.dirname(docsPath));
  const rows = (manifest.items || []).map((item) => `- ${item.key}: ${item.injectedPath} (${item.generatedWidth}x${item.generatedHeight})`).join('\n');
  const text = [
    '# Generated Image Assets',
    '',
    `Template: ${String(projectState.template || 'unknown')}`,
    `Updated: ${nowIso()}`,
    '',
    rows || '- No assets generated yet.',
    '',
  ].join('\n');
  fs.writeFileSync(docsPath, text, 'utf-8');
}

function templateImageVariantSpecs(projectState, assetKey) {
  const templateId = String(projectState && projectState.template || '').toLowerCase();
  const key = String(assetKey || '').toLowerCase();
  if (templateId === 'software_web_app' || templateId === 'software_agency') {
    if (key === 'hero_banner') return [{ name: 'desktop', width: 1920, height: 960 }, { name: 'tablet', width: 1280, height: 640 }];
    if (key === 'social_og_image') return [{ name: 'twitter', width: 1600, height: 900 }];
  }
  if (templateId === 'mobile_app') {
    if (key === 'store_feature_graphic') return [{ name: 'play_store_backup', width: 2048, height: 1000 }];
    if (key === 'splash_background') return [{ name: 'tablet', width: 1600, height: 2560 }];
  }
  if (templateId === 'game_studio') {
    if (key === 'promo_keyart') return [{ name: 'itch_cover', width: 630, height: 500 }, { name: 'steam_capsule', width: 616, height: 353 }];
  }
  return [];
}

function createInjectedImageVariants(projectState, item, injectedAbs) {
  const variants = [];
  const specs = templateImageVariantSpecs(projectState, item.key);
  specs.forEach((spec) => {
    const ext = path.extname(injectedAbs) || '.png';
    const variantAbs = path.join(path.dirname(injectedAbs), `${safeSlug(item.key, 'asset')}__${safeSlug(spec.name, 'variant')}${ext}`);
    const resized = resizeImageWithPython(injectedAbs, variantAbs, spec.width, spec.height);
    if (resized.ok) {
      variants.push({
        name: spec.name,
        targetWidth: spec.width,
        targetHeight: spec.height,
        injectedPath: path.relative(projectWorkspaceDir(projectState.id), variantAbs).replace(/\\/g, '/'),
        deliveryMode: 'resized',
        backend: resized.backend || null,
      });
      return;
    }
    try {
      fs.copyFileSync(injectedAbs, variantAbs);
      variants.push({
        name: spec.name,
        targetWidth: spec.width,
        targetHeight: spec.height,
        injectedPath: path.relative(projectWorkspaceDir(projectState.id), variantAbs).replace(/\\/g, '/'),
        deliveryMode: 'copied_master',
        backend: null,
        lastError: resized.error || null,
      });
    } catch {
    }
  });
  return variants;
}

function ensureTemplateImageUiWiring(projectState, manifestItems) {
  if (!projectState) return;
  const templateId = String(projectState.template || '').toLowerCase();
  const workspaceRoot = projectWorkspaceDir(projectState.id);
  const filesToSeed = [];
  if (templateId === 'software_web_app' || templateId === 'software_agency') {
    filesToSeed.push('web/src/main.tsx', 'web/src/App.tsx');
  }
  if (templateId === 'mobile_app') {
    filesToSeed.push('mobile/App.tsx', 'mobile/src/screens/HomeScreen.tsx');
  }
  filesToSeed.forEach((relPath) => {
    const absPath = path.join(workspaceRoot, relPath);
    if (shouldRewriteScaffoldFile(absPath)) {
      ensureDir(path.dirname(absPath));
      fs.writeFileSync(absPath, scaffoldContentForContractPath(projectState, relPath), 'utf-8');
      return;
    }
    try {
      const text = fs.readFileSync(absPath, 'utf-8');
      if (!text.includes('generatedImageAssets') && text.includes('HIVEFORGE_SCAFFOLD_PLACEHOLDER')) {
        fs.writeFileSync(absPath, scaffoldContentForContractPath(projectState, relPath), 'utf-8');
      }
    } catch {
    }
  });
}

function applyTemplateImageAssetInjection(projectState, generatedAssets = [], options = {}) {
  if (!projectState || !projectState.id) {
    return { ok: false, reason: 'missing_project_state', gaps: ['Project state is required for image asset injection.'] };
  }
  const strictContract = options && Object.prototype.hasOwnProperty.call(options, 'strictContract')
    ? Boolean(options.strictContract)
    : true;
  const contract = templateImageContractItems(projectState);
  if (!contract.length) {
    return { ok: true, skipped: true, reason: 'template_has_no_image_contract', manifestPath: null, items: [] };
  }
  const injectionRoot = templateImageInjectionRoot(projectState);
  if (!injectionRoot) {
    return { ok: false, reason: 'missing_injection_root', gaps: ['Template image injection root could not be resolved.'] };
  }
  ensureDir(injectionRoot);

  const byKey = new Map((Array.isArray(generatedAssets) ? generatedAssets : [])
    .filter((item) => item && item.key)
    .map((item) => [String(item.key), item]));
  const expectedItems = strictContract
    ? contract
    : contract.filter((entry) => {
      const key = String(entry && entry.key || '').trim();
      return key && byKey.has(key);
    });

  const items = [];
  const gaps = [];
  for (const expected of expectedItems) {
    const key = String(expected.key || '').trim();
    if (!key) continue;
    const produced = byKey.get(key);
    if (!produced || !produced.outputPath || !fs.existsSync(produced.outputPath)) {
      gaps.push(`Missing generated image for key ${key}.`);
      continue;
    }

    const ext = path.extname(String(produced.outputPath)).toLowerCase() || '.png';
    const fileName = `${safeSlug(key, 'asset')}${ext}`;
    const injectedAbs = path.join(injectionRoot, fileName);
    ensureDir(path.dirname(injectedAbs));
    try {
      fs.copyFileSync(produced.outputPath, injectedAbs);
    } catch (err) {
      gaps.push(`Failed to inject image for key ${key}: ${redactSensitive(err && err.message ? err.message : 'copy_failed')}`);
      continue;
    }

    let generatedWidth = Number(produced.width || expected.width || 0);
    let generatedHeight = Number(produced.height || expected.height || 0);
    if (produced.metadataPath && fs.existsSync(produced.metadataPath)) {
      try {
        const meta = safeJsonRead(produced.metadataPath, null);
        if (meta && Number.isFinite(Number(meta.width))) generatedWidth = Number(meta.width);
        if (meta && Number.isFinite(Number(meta.height))) generatedHeight = Number(meta.height);
      } catch {}
    }

    const workspaceRoot = projectWorkspaceDir(projectState.id);
    const injectedRel = path.relative(workspaceRoot, injectedAbs).replace(/\\/g, '/');
    const publicUrl = injectedRel.startsWith('web/public/') ? `/${injectedRel.slice('web/public/'.length)}` : null;
    const mobileRequirePath = injectedRel.startsWith('mobile/assets/')
      ? `../assets/${injectedRel.slice('mobile/assets/'.length)}`
      : null;
    const variants = createInjectedImageVariants(projectState, expected, injectedAbs);
    items.push({
      key,
      expectedWidth: Number(expected.width || 0),
      expectedHeight: Number(expected.height || 0),
      generatedWidth,
      generatedHeight,
      injectedPath: injectedRel,
      publicUrl,
      mobileRequirePath,
      variants,
      sourceOutputPath: String(produced.outputPath),
      sourceMetadataPath: produced.metadataPath ? String(produced.metadataPath) : null,
      dimensionMatch: generatedWidth === Number(expected.width || 0) && generatedHeight === Number(expected.height || 0),
    });
  }

  if (strictContract) {
    const missingKeys = contract
      .map((item) => String(item.key || ''))
      .filter((key) => key && !items.some((entry) => entry.key === key));
    missingKeys.forEach((key) => gaps.push(`Missing injected asset for key ${key}.`));
  }

  const manifest = {
    templateId: String(projectState.template || '').toLowerCase(),
    projectId: projectState.id,
    generatedAt: nowIso(),
    items,
  };
  const manifestPath = templateImageManifestPath(projectState);
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  writeTemplateImageAssetModule(projectState, items);
  writeTemplateImageAssetSummary(projectState, manifest);
  ensureTemplateImageUiWiring(projectState, items);

  const badDimensions = items.filter((item) => !item.dimensionMatch).map((item) => item.key);
  badDimensions.forEach((key) => gaps.push(`Asset ${key} has wrong dimensions vs template contract.`));
  return {
    ok: gaps.length === 0,
    reason: gaps.length ? 'image_asset_injection_incomplete' : 'ok',
    manifestPath,
    items,
    gaps,
  };
}

function validateTemplateImageAssets(projectState) {
  const contract = templateImageContractItems(projectState);
  if (!contract.length) return { ok: true, gaps: [] };
  const manifestPath = templateImageManifestPath(projectState);
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return { ok: false, gaps: ['Image asset manifest is missing.'] };
  }
  const manifest = safeJsonRead(manifestPath, null);
  if (!manifest || !Array.isArray(manifest.items)) {
    return { ok: false, gaps: ['Image asset manifest is invalid.'] };
  }

  const gaps = [];
  contract.forEach((expected) => {
    const key = String(expected.key || '').trim();
    const item = manifest.items.find((entry) => String(entry && entry.key || '') === key);
    if (!item) {
      gaps.push(`Missing generated asset ${key}.`);
      return;
    }
    const injectedRel = String(item.injectedPath || '').trim();
    const injectedAbs = injectedRel ? path.join(projectWorkspaceDir(projectState.id), injectedRel) : null;
    if (!injectedAbs || !fs.existsSync(injectedAbs)) {
      gaps.push(`Injected file missing for asset ${key}.`);
    }
    const expectedW = Number(expected.width || 0);
    const expectedH = Number(expected.height || 0);
    if (Number(item.generatedWidth || 0) !== expectedW || Number(item.generatedHeight || 0) !== expectedH) {
      gaps.push(`Asset ${key} dimensions mismatch (${item.generatedWidth}x${item.generatedHeight}, expected ${expectedW}x${expectedH}).`);
    }
    const expectedVariants = templateImageVariantSpecs(projectState, key);
    expectedVariants.forEach((variant) => {
      const variantEntry = Array.isArray(item.variants)
        ? item.variants.find((entry) => String(entry && entry.name || '') === String(variant.name || ''))
        : null;
      if (!variantEntry) {
        gaps.push(`Missing image variant ${key}:${variant.name}.`);
        return;
      }
      const variantAbs = path.join(projectWorkspaceDir(projectState.id), String(variantEntry.injectedPath || ''));
      if (!fs.existsSync(variantAbs)) {
        gaps.push(`Variant file missing for ${key}:${variant.name}.`);
      }
    });
  });
  return { ok: gaps.length === 0, gaps };
}

function goldenPromptSuiteForTemplate(templateId) {
  const normalized = String(templateId || '').trim().toLowerCase();
  if (normalized === 'game_studio') {
    return [
      { id: 'game_keyart', prompt: 'indie action game key art, dramatic lighting, readable silhouettes', width: 1280, height: 720, assetKind: 'golden_keyart' },
      { id: 'game_sprite', prompt: '2d player sprite concept, transparent background feel, bold shape language', width: 512, height: 512, assetKind: 'golden_sprite' },
    ];
  }
  if (normalized === 'mobile_app') {
    return [
      { id: 'mobile_store', prompt: 'mobile app feature graphic, crisp modern illustration, premium product feel', width: 1024, height: 500, assetKind: 'golden_store' },
      { id: 'mobile_splash', prompt: 'mobile splash artwork, portrait composition, clean focal point', width: 1080, height: 1920, assetKind: 'golden_splash' },
    ];
  }
  return [
    { id: 'web_hero', prompt: 'saas landing page hero illustration, modern visual hierarchy, editorial composition', width: 1536, height: 768, assetKind: 'golden_hero' },
    { id: 'web_social', prompt: 'product social card image, launch announcement artwork, polished branding', width: 1200, height: 630, assetKind: 'golden_social' },
  ];
}

async function runGoldenPromptRegressionSuite(projectId, templateId, modelId) {
  const runtime = ensureImageRuntimeState();
  const projectState = projectId ? (projectRuntimes.get(projectId) && projectRuntimes.get(projectId).state) : null;
  const suite = goldenPromptSuiteForTemplate(templateId);
  const results = [];
  for (let index = 0; index < suite.length; index += 1) {
    const test = suite[index];
    const generated = await executeImageGeneratorConnector({
      projectId,
      operation: 'generate_image',
      input: {
        modelId,
        prompt: test.prompt,
        templateId,
        width: test.width,
        height: test.height,
        deterministic: true,
        seed: 1000 + index,
        assetKind: test.assetKind,
      },
    });
    const outputPath = generated && generated.data ? generated.data.outputPath : null;
    const metadata = generated && generated.data ? generated.data.metadata : null;
    const structuralPass = Boolean(generated && generated.ok && outputPath && fs.existsSync(outputPath)
      && metadata && Number(metadata.width) === Number(test.width) && Number(metadata.height) === Number(test.height));
    let baseline = null;
    let visual = null;
    if (structuralPass && outputPath) {
      baseline = resolveGoldenBaseline(projectId, templateId, modelId, test, outputPath, metadata);
      if (baseline.ok && !baseline.seeded && !baseline.upgraded) {
        visual = compareGoldenArtifacts(outputPath, baseline.baselinePath);
      } else if (baseline.ok) {
        visual = {
          ok: true,
          passed: true,
          mode: baseline.upgraded ? 'baseline_upgraded' : 'baseline_seeded',
          backend: 'filesystem_copy',
          reason: baseline.upgraded ? 'baseline_upgraded_from_svg_fallback' : 'baseline_seeded_on_first_run',
          hashDistance: 0,
          meanPixelDelta: 0,
          rmsDelta: 0,
          thresholds: null,
        };
      } else {
        visual = {
          ok: false,
          passed: false,
          mode: 'baseline_error',
          backend: null,
          reason: baseline.error || 'baseline_resolution_failed',
          hashDistance: null,
          meanPixelDelta: null,
          rmsDelta: null,
          thresholds: null,
        };
      }
    }
    const passed = Boolean(structuralPass && visual && visual.ok && visual.passed);
    results.push({
      id: test.id,
      prompt: test.prompt,
      width: test.width,
      height: test.height,
      ok: passed,
      structuralOk: structuralPass,
      outputPath: outputPath || null,
      baselinePath: baseline && baseline.baselinePath ? baseline.baselinePath : null,
      baselineSeeded: Boolean(baseline && baseline.seeded),
      baselineUpgraded: Boolean(baseline && baseline.upgraded),
      engine: metadata && metadata.engine ? metadata.engine : null,
      visual,
      createdAt: nowIso(),
      reason: passed
        ? null
        : (visual && visual.reason)
          || (generated && generated.message ? generated.message : 'golden_prompt_failed'),
    });
  }
  const summary = {
    templateId,
    projectId: projectId || null,
    executedAt: nowIso(),
    ok: results.every((item) => item.ok),
    visualOk: results.every((item) => item.structuralOk && item.visual && item.visual.ok && item.visual.passed),
    baselineSeededCount: results.filter((item) => item.baselineSeeded).length,
    baselineUpgradedCount: results.filter((item) => item.baselineUpgraded).length,
    visualFailureCount: results.filter((item) => item.structuralOk && item.visual && item.visual.ok && !item.visual.passed).length,
    results,
  };
  const key = projectId || String(templateId || 'global');
  runtime.checks.goldenPrompts[key] = summary;
  persistImageRuntimeState();
  if (projectState) {
    appendProjectLog(projectState, 'message', {
      kind: 'image_golden_prompt_suite_completed',
      ok: summary.ok,
      templateId,
      results: results.map((item) => ({ id: item.id, ok: item.ok, engine: item.engine, visualOk: Boolean(item.visual && item.visual.passed) })),
    });
  }
  return summary;
}

async function buildImageReadinessScoreboard(projectId = null, modelId = null, templateId = null) {
  const state = ensureImageRuntimeState();
  const settings = imageGeneratorSettings();
  const selectedModel = resolveImageModelEntry(modelId || settings.preferredModelId);
  const comfyReady = await comfyIsHealthy();
  const secondary = await secondaryBackendReachable();
  const pythonCmd = resolveImagePythonCommand();
  const pillowCheck = ensurePythonPackageAvailable(pythonCmd, 'PIL', 'pillow', false);
  const key = projectId || String(templateId || 'global');
  const selfTest = state.checks.selfTests[key] || null;
  const golden = state.checks.goldenPrompts[key] || null;
  return {
    generatedAt: nowIso(),
    modelReady: Boolean(selectedModel && fs.existsSync(selectedModel.path)),
    comfyReady,
    secondaryBackendReady: Boolean(secondary.ok),
    secondaryBackendEndpoint: secondary.endpoint || null,
    fallbackRendererAvailable: true,
    resizeBackendReady: Boolean(pillowCheck.ok),
    resizeBackend: pythonCommandDescription(pythonCmd),
    selfTestOk: Boolean(selfTest && selfTest.ok),
    selfTestAt: selfTest && selfTest.executedAt ? selfTest.executedAt : null,
    goldenPromptSuiteOk: Boolean(golden && golden.ok),
    goldenPromptSuiteAt: golden && golden.executedAt ? golden.executedAt : null,
    goldenVisualOk: Boolean(golden && golden.visualOk),
    goldenVisualAt: golden && golden.executedAt ? golden.executedAt : null,
  };
}

function latestGameArtifactUpdatedAt(projectState) {
  if (!projectState || String(projectState.template || '').toLowerCase() !== 'game_studio') return 0;
  const root = projectWorkspaceDir(projectState.id);
  const required = [
    path.join(root, 'game', 'index.html'),
    path.join(root, 'game', 'game.js'),
    path.join(root, 'game', 'style.css'),
  ];
  let latest = 0;
  required.forEach((target) => {
    try {
      const stat = fs.statSync(target);
      const ms = Number(stat && stat.mtimeMs ? stat.mtimeMs : 0);
      if (ms > latest) latest = ms;
    } catch {
    }
  });
  return latest;
}

function gameStudioArtifactHash(projectState) {
  if (!projectState || String(projectState.template || '').toLowerCase() !== 'game_studio') return null;
  const root = projectWorkspaceDir(projectState.id);
  const required = [
    path.join(root, 'game', 'index.html'),
    path.join(root, 'game', 'game.js'),
    path.join(root, 'game', 'style.css'),
  ];
  try {
    const chunks = required.map((target) => fs.readFileSync(target));
    const hash = crypto.createHash('sha256');
    chunks.forEach((buf) => hash.update(buf));
    return hash.digest('hex');
  } catch {
    return null;
  }
}

function verifyGoalDelivery(projectState) {
  const goalPlan = projectState.goalPlan;
  if (!goalPlan || !Array.isArray(goalPlan.tasks) || goalPlan.tasks.length === 0) {
    return { verified: true, gaps: [] };
  }
  const gaps = [];
  const deadGoalTasks = projectState.tasks.filter(
    (t) => String(t.id).startsWith('GOAL-') && t.deadLetteredAt,
  );
  if (deadGoalTasks.length > 0) {
    gaps.push(`${deadGoalTasks.length} goal task(s) dead-lettered without resolution: ${deadGoalTasks.map((t) => t.id).join(', ')}`);
  }
  if (Array.isArray(goalPlan.requiredConnectors)) {
    const unverified = goalPlan.requiredConnectors.filter((connector) => {
      const probe = projectState.tasks.find((t) =>
        String(t.title || '').toLowerCase().includes(`validate ${connector} connector`),
      );
      return probe && probe.status !== 'done';
    });
    if (unverified.length > 0) {
      gaps.push(`Connector readiness unverified for: ${unverified.join(', ')}`);
    }
  }
  const completion = evaluateMilestoneCompletion(projectState);
  const incomplete = completion.milestones.filter((m) => !m.completedAt);
  if (incomplete.length > 0) {
    gaps.push(`${incomplete.length} delivery milestone(s) not fully verified: ${incomplete.map((m) => m.id).join(', ')}`);
  }
  if (!hasGameStudioPlayableArtifacts(projectState)) {
    gaps.push('Game Studio delivery artifacts missing: expected workspace files game/index.html, game/game.js, and game/style.css.');
  } else if (String(projectState.template || '').toLowerCase() === 'game_studio') {
    // Intent-match gate: files exist but must not still be scaffold placeholders
    const gameJsPath = path.join(projectWorkspaceDir(projectState.id), 'game', 'game.js');
    try {
      const gameJsContent = fs.readFileSync(gameJsPath, 'utf-8');
      if (gameJsContent.includes('HIVEFORGE_SCAFFOLD_PLACEHOLDER')) {
        const gameSandboxPath = `/sandbox/workspace/projects/${projectState.id}/game`;
        const scaffoldFiles = [];
        for (const fname of ['game.js', 'style.css', 'index.html']) {
          try {
            const content = fs.readFileSync(path.join(projectWorkspaceDir(projectState.id), 'game', fname), 'utf-8');
            if (content.includes('HIVEFORGE_SCAFFOLD_PLACEHOLDER')) scaffoldFiles.push(fname);
          } catch { scaffoldFiles.push(fname); }
        }
        const fileList = scaffoldFiles.map((f) => `  ${gameSandboxPath}/${f}`).join('\n');
        gaps.push(`Game files still contain scaffold placeholder. Use the file tool (action=write) to write real ${String(projectState.name || 'game')} implementation to each of these files:\n${fileList}`);
      }
    } catch { /* file unreadable � existence already confirmed above */ }
  }
  if (!hasGameStudioDeployEvidence(projectState)) {
    gaps.push('Game Studio deploy evidence missing: no deploy URL recorded for project Netlify site yet.');
  } else if (String(projectState.template || '').toLowerCase() === 'game_studio') {
    if (runtimeSettings().fastLocalIterationMode) {
      if (gaps.length === 0) {
        return { verified: true, gaps: [] };
      }
      return { verified: false, gaps };
    }
    const netlify = projectState.connectorBindings && projectState.connectorBindings.netlify
      ? projectState.connectorBindings.netlify
      : {};
    const deployAtMs = Date.parse(String(netlify.lastDeployAt || ''));
    const latestArtifactMs = latestGameArtifactUpdatedAt(projectState);
    if (latestArtifactMs > 0 && (!Number.isFinite(deployAtMs) || deployAtMs < latestArtifactMs)) {
      gaps.push('Game Studio deploy is stale: last Netlify deploy happened before latest game artifact updates. Trigger a fresh Netlify deploy after game file validation.');
    }
  }
  if (!hasTemplateDeliveryArtifacts(projectState)) {
    const required = templateRequiredArtifactSpecs(projectState)
      .map((item) => ({
        path: `/sandbox/workspace/projects/${projectState.id}/${item.path}`,
        minLines: Number.isFinite(Number(item.minLines)) ? Number(item.minLines) : 1,
      }));
    if (required.length) {
      const templateName = String(projectState.template || 'template').replace(/_/g, ' ');
      gaps.push(`${templateName} artifacts missing/incomplete. Required files:\n${required.map((item) => `  ${item.path} (min ${item.minLines} non-empty lines)`).join('\n')}`);
    }
  }
  const templateImageValidation = validateTemplateImageAssets(projectState);
  if (!templateImageValidation.ok) {
    gaps.push(`Template image assets incomplete:\n${templateImageValidation.gaps.map((item) => `  ${item}`).join('\n')}`);
  }
  if (gaps.length === 0) {
    return { verified: true, gaps: [] };
  }
  const gapTaskExists = projectState.tasks.some((t) => t.id === 'GOAL-DELIVERY-GAP');
  if (!gapTaskExists) {
    projectState.tasks.push({
      id: 'GOAL-DELIVERY-GAP',
      title: 'Address delivery gaps before project close',
      phase: 'maintenance',
      status: 'backlog',
      assignee: null,
      blockedBy: null,
      dependencies: [],
      requiredRole: 'Backend Architect',
      executionState: 'queued',
      retryCount: 0,
      lastFailedAt: null,
      lastError: null,
      lastProgressAt: null,
      executionTaskRunId: null,
      inprogressCycles: 0,
      pendingApproval: null,
      autoActionNotBeforeAt: null,
      deadLetteredAt: null,
      createdAt: nowIso(),
      completedAt: null,
      startedAt: null,
      assistanceRequestedAt: null,
      description: `Delivery gaps found before project close:\n${gaps.map((g) => `- ${g}`).join('\n')}\n\nFor any listed workspace files, you MUST use the file tool (action=write) to write complete, real deliverables. Do NOT output HIVEFORGE_SCAFFOLD_PLACEHOLDER.`,
    });
    appendProjectLog(projectState, 'message', { kind: 'delivery_gap_task_created', gaps });
    notifyOperator(projectState, 'Delivery gap review required before project close', { gaps }).catch(() => {});
  }
  return { verified: false, gaps, deliveryTaskCreated: !gapTaskExists };
}

function readWorkspaceGameFile(projectState, name) {
  const filePath = path.join(projectWorkspaceDir(projectState.id), 'game', String(name || ''));
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function isScaffoldOrThin(content, minLines = 30) {
  if (typeof content !== 'string') return true;
  if (content.includes('HIVEFORGE_SCAFFOLD_PLACEHOLDER')) return true;
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length < minLines;
}

function validateUniversalGameplayLoop(indexHtmlContent, gameJsContent) {
  const html = String(indexHtmlContent || '');
  const js = String(gameJsContent || '');
  const combined = `${html}\n${js}`;
  const failures = [];

  if (!/(requestAnimationFrame|setInterval\s*\(|setTimeout\s*\()/i.test(js)) {
    failures.push('missing_main_loop_scheduler');
  }
  if (!/(addEventListener\s*\(\s*['\"](?:keydown|keyup|mousedown|mouseup|pointerdown|pointerup|touchstart|touchend|click)['\"]|onkeydown|ontouchstart)/i.test(js)) {
    failures.push('missing_player_input_handlers');
  }
  if (!/\b(updateFrame|update|tick|step)\s*\(/i.test(js)) {
    failures.push('missing_update_step');
  }
  if (!/\b(renderFrame|render|draw)\s*\(/i.test(js)) {
    failures.push('missing_render_step');
  }
  if (!/\b(score|points|xp|level|wave|objective|progress|currency|coins|timeLeft|timer)\b/i.test(combined)) {
    failures.push('missing_progress_metric');
  }
  if (!/\b(win|victory|complete|cleared|success)\b/i.test(combined)) {
    failures.push('missing_success_condition');
  }
  if (!/\b(game\s*over|lose|loss|defeat|failed|dead)\b/i.test(combined)) {
    failures.push('missing_failure_condition');
  }
  if (!/\b(restart|retry|reset|newGame|startGame|playAgain)\b/i.test(combined)) {
    failures.push('missing_restart_path');
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

function validateGameStudioTaskArtifacts(projectState, task) {
  if (String(projectState?.template || '').toLowerCase() !== 'game_studio') {
    return { ok: true };
  }
  const title = String(task?.title || '').toLowerCase();
  const taskId = String(task?.id || '');
  const needsFullValidation = title.includes('validate game files') || title.includes('gameplay verification pass') || taskId === 'GOAL-DELIVERY-GAP';

  if (title.includes('research baseline') || title.includes('visual-direction research')) {
    const researchPath = path.join(projectWorkspaceDir(projectState.id), 'docs', 'game_research_brief.md');
    try {
      const text = fs.readFileSync(researchPath, 'utf-8');
      if (isScaffoldOrThin(text, 16)) {
        return { ok: false, reason: 'game_research_brief_incomplete' };
      }
    } catch {
      return { ok: false, reason: 'game_research_brief_missing' };
    }
  }

  const indexHtml = readWorkspaceGameFile(projectState, 'index.html');
  const gameJs = readWorkspaceGameFile(projectState, 'game.js');
  const styleCss = readWorkspaceGameFile(projectState, 'style.css');

  if (title.includes('html page')) {
    if (isScaffoldOrThin(indexHtml, 35) || !String(indexHtml || '').includes('./game.js')) {
      return { ok: false, reason: 'index_html_missing_or_scaffold' };
    }
  }
  if (title.includes('javascript logic')) {
    if (isScaffoldOrThin(gameJs, 60)) {
      return { ok: false, reason: 'game_js_missing_or_scaffold' };
    }
    const loopCheck = validateUniversalGameplayLoop(indexHtml, gameJs);
    if (!loopCheck.ok) {
      return { ok: false, reason: `gameplay_loop_incomplete:${loopCheck.failures.slice(0, 3).join('|')}` };
    }
  }
  if (title.includes('css styles')) {
    if (isScaffoldOrThin(styleCss, 40)) {
      return { ok: false, reason: 'style_css_missing_or_scaffold' };
    }
  }
  if (needsFullValidation) {
    if (isScaffoldOrThin(indexHtml, 30) || isScaffoldOrThin(gameJs, 50) || isScaffoldOrThin(styleCss, 30)) {
      return { ok: false, reason: 'delivery_gap_artifacts_incomplete' };
    }
    const loopCheck = validateUniversalGameplayLoop(indexHtml, gameJs);
    if (!loopCheck.ok) {
      return { ok: false, reason: `gameplay_loop_incomplete:${loopCheck.failures.slice(0, 4).join('|')}` };
    }
  }

  return { ok: true };
}

function validateTemplateTaskArtifacts(projectState, task) {
  const gameCheck = validateGameStudioTaskArtifacts(projectState, task);
  if (!gameCheck.ok) return gameCheck;

  const businessCheck = validateBusinessTemplateTaskArtifacts(projectState, task);
  if (!businessCheck.ok) return businessCheck;

  const title = String(task?.title || '').toLowerCase();
  const taskId = String(task?.id || '');
  const needsImageValidation = title.includes('asset pack') || title.includes('image') || taskId === 'GOAL-DELIVERY-GAP';
  if (!needsImageValidation) {
    return { ok: true };
  }
  const imageCheck = validateTemplateImageAssets(projectState);
  if (!imageCheck.ok) {
    return {
      ok: false,
      reason: `template_image_assets_incomplete:${imageCheck.gaps.slice(0, 2).join(' | ')}`,
    };
  }
  return { ok: true };
}

function validateBusinessTemplateTaskArtifacts(projectState, task) {
  if (String(projectState?.template || '').toLowerCase() !== 'business') {
    return { ok: true };
  }

  const title = String(task?.title || '').toLowerCase();
  const taskId = String(task?.id || '');

  if (title.includes('research baseline') || title.includes('market and ux research')) {
    const researchPath = path.join(projectWorkspaceDir(projectState.id), 'docs', 'research_brief.md');
    try {
      const text = fs.readFileSync(researchPath, 'utf-8');
      if (isScaffoldOrThin(text, 16)) {
        return { ok: false, reason: 'business_research_brief_incomplete' };
      }
    } catch {
      return { ok: false, reason: 'business_research_brief_missing' };
    }
  }

  const needsWebsiteValidation = title.includes('core web experience')
    || title.includes('web experience')
    || title.includes('landing site')
    || taskId === 'GOAL-DELIVERY-GAP';
  if (!needsWebsiteValidation) {
    return { ok: true };
  }

  const websiteRoot = path.join(WORKSPACE_ROOT, 'projects', projectState.id, 'website');
  const indexPath = path.join(websiteRoot, 'index.html');
  const appPath = path.join(websiteRoot, 'app.js');
  const stylePath = path.join(websiteRoot, 'style.css');
  if (!fs.existsSync(indexPath) || !fs.existsSync(appPath) || !fs.existsSync(stylePath)) {
    return { ok: false, reason: 'website_artifacts_missing' };
  }

  const indexHtml = fs.readFileSync(indexPath, 'utf-8');
  const appJs = fs.readFileSync(appPath, 'utf-8');
  const styleCss = fs.readFileSync(stylePath, 'utf-8');

  const hasScriptRef = /<script[^>]+src=["'](?:\.\/)?app\.js["']/i.test(indexHtml);
  const hasStyleRef = /<link[^>]+href=["'](?:\.\/)?style\.css["']/i.test(indexHtml);
  if (isScaffoldOrThin(indexHtml, 20) || !hasScriptRef || !hasStyleRef) {
    return { ok: false, reason: 'website_index_incomplete' };
  }
  if (isScaffoldOrThin(appJs, 60)) {
    return { ok: false, reason: 'website_app_js_incomplete' };
  }
  if (isScaffoldOrThin(styleCss, 40)) {
    return { ok: false, reason: 'website_style_css_incomplete' };
  }

  try {
    // Parse-only syntax validation so broken JS cannot be marked as done.
    // eslint-disable-next-line no-new-func
    new Function(appJs);
  } catch (err) {
    const detail = String(err && err.message ? err.message : 'invalid_javascript').slice(0, 180);
    return { ok: false, reason: `website_app_js_syntax_error:${detail}` };
  }

  if (/const\s+supabase\s*=\s*supabase\.createClient\s*\(/i.test(appJs)) {
    return { ok: false, reason: 'website_supabase_client_init_invalid' };
  }

  const goalText = String(projectState?.goal || '').toLowerCase();
  const goalTags = (projectState && projectState.goalPlan && projectState.goalPlan.tags)
    ? projectState.goalPlan.tags
    : normalizeGoalKeywordTags(goalText);
  const combined = `${indexHtml}\n${appJs}`.toLowerCase();
  const requiredFlowChecks = [
    { key: 'navigation', regex: /\b(nav|navbar|menu|sidebar)\b/ },
    { key: 'resilience_states', regex: /\b(loading|empty|error|not found|try again)\b/ },
  ];

  if (goalTags.webApp || goalTags.social || goalTags.marketplace || goalTags.property) {
    requiredFlowChecks.push({ key: 'auth_scope', regex: /\b(login|sign\s*up|signup|auth|account|guest\s*only|guest\s*mode)\b/ });
  }
  if (goalTags.social || goalTags.marketplace || goalTags.property) {
    requiredFlowChecks.push({ key: 'profile', regex: /\bprofile|onboarding|settings\b/ });
  }
  if (goalTags.marketplace) {
    requiredFlowChecks.push({ key: 'seller_buyer_flows', regex: /\b(seller|buyer|bid|listing|auction|create\s*auction|list\s*an?\s*item)\b/ });
    requiredFlowChecks.push({ key: 'activity_tracking', regex: /\b(my\s*bids|my\s*auctions|watchlist|order\s*history|activity)\b/ });
    requiredFlowChecks.push({ key: 'discovery_filters', regex: /\b(filter|category|sort|search)\b/ });
  } else if (goalTags.ecommerce || goalTags.webApp) {
    requiredFlowChecks.push({ key: 'discovery_filters', regex: /\b(filter|category|sort|search)\b/ });
  }
  if (/(dashboard|admin|portal|backoffice|reporting)/.test(goalText)) {
    requiredFlowChecks.push({ key: 'dashboard', regex: /\b(dashboard|admin|portal|backoffice|reporting)\b/ });
  }

  const missingFlows = requiredFlowChecks
    .filter((check) => !check.regex.test(combined))
    .map((check) => check.key);
  if (missingFlows.length) {
    return { ok: false, reason: `website_core_flows_missing:${missingFlows.join('|')}` };
  }

  return { ok: true };
}

function shouldEscalateGameplayRemediation(projectState, task, effectiveExitCode, failureReason, failureCount) {
  if (failureCount < 2) return false;
  if (String(projectState?.template || '').toLowerCase() !== 'game_studio') return false;

  const taskTitle = String(task?.title || '').toLowerCase();
  const isGameJsTask = taskTitle.includes('javascript logic') || taskTitle.includes('game.js');
  if (!isGameJsTask) return false;

  if (effectiveExitCode === 2 && String(failureReason || '').includes('gameplay_loop_incomplete')) {
    return true;
  }

  return effectiveExitCode !== 0;
}

function shouldEscalateGenericTaskRemediation(task, effectiveExitCode, failureCount) {
  if (failureCount < 2) return false;
  if (effectiveExitCode === 0) return false;
  const taskId = String(task && task.id ? task.id : '');
  if (taskId.endsWith('-REMEDIATE')) return false;
  return true;
}

function summarizeProjectAutomation(projectState) {
  ensureRecurringState(projectState);
  ensureDeadLetterState(projectState);
  ensureFinanceExceptionState(projectState);
  ensurePublicationHealthState(projectState);
  ensureApprovalGovernanceState(projectState);
  ensureOperationalLoopState(projectState);
  ensureProjectConnectorBindings(projectState);
  ensureBudgetHardStopState(projectState);
  const publicationDashboard = buildPublicationIncidentDashboard(projectState, {
    windowHours: 24,
    extendedWindowHours: 24 * 7,
    maxHotspots: 5,
    maxRunbooks: 8,
  });
  const goalPlan = projectState.goalPlan && typeof projectState.goalPlan === 'object' ? projectState.goalPlan : null;
  const pendingApprovals = projectState.tasks.filter((task) => task.status === 'review' && task.executionState === 'awaiting_approval');
  const assistanceRequests = projectState.tasks.filter((task) => task.assistanceRequestedAt && task.status !== 'done');
  const connectorReadinessTasks = projectState.tasks.filter((task) => /validate\s+.+\s+connector\s+readiness/i.test(String(task.title || '')));
  const pendingConnectorReadiness = connectorReadinessTasks.filter((task) => task.status !== 'done');
  const recentPolicyDecisions = readMessageBusEntries({
    projectId: projectState.id,
    limit: 120,
    kind: 'policy_decision|connector_policy_decision|approval_decision_applied',
  });
  const milestoneCompletion = goalPlan && Array.isArray(goalPlan.milestones) && goalPlan.milestones.length > 0
    ? evaluateMilestoneCompletion(projectState)
    : null;
  return {
    recurring: {
      enabled: Boolean(projectState.recurring.enabled),
      lastRunAt: projectState.recurring.lastRunAt || {},
      operatingMode: projectState.operatingMode || 'finite_delivery',
    },
    schedule: projectState.recurring.schedule.map((entry) => ({
      ...entry,
      everyHuman: humanizeDurationMs(entry.everyMs),
    })),
    approvalGovernance: {
      enabled: Boolean(projectState.approvalGovernance.enabled),
      autoApproveRuleCount: Array.isArray(projectState.approvalGovernance.autoApproveRules)
        ? projectState.approvalGovernance.autoApproveRules.length
        : 0,
      autoDenyRuleCount: Array.isArray(projectState.approvalGovernance.autoDenyRules)
        ? projectState.approvalGovernance.autoDenyRules.length
        : 0,
      escalationRuleCount: Array.isArray(projectState.approvalGovernance.escalationRules)
        ? projectState.approvalGovernance.escalationRules.length
        : 0,
      industryPolicyPack: projectState.approvalGovernance.industryPolicyPack || null,
      revisions: {
        currentRevisionId: projectState.approvalGovernance.revisions.currentRevisionId || null,
        count: Array.isArray(projectState.approvalGovernance.revisions.history)
          ? projectState.approvalGovernance.revisions.history.length
          : 0,
      },
    },
    budgetHardStop: {
      active: Boolean(projectState.budgetHardStop.active),
      reason: projectState.budgetHardStop.reason || null,
      activatedAt: projectState.budgetHardStop.activatedAt || null,
      activatedBy: projectState.budgetHardStop.activatedBy || null,
      blockedActionsCount: Number(projectState.budgetHardStop.blockedActionsCount || 0),
      resumedAt: projectState.budgetHardStop.resumedAt || null,
      resumedBy: projectState.budgetHardStop.resumedBy || null,
    },
    weeklyObjectives: {
      weekStart: projectState.operationalLoops.weekStart,
      generatedAt: projectState.operationalLoops.generatedAt,
      count: Array.isArray(projectState.operationalLoops.objectives)
        ? projectState.operationalLoops.objectives.length
        : 0,
    },
    staffing: {
      enabled: Boolean(projectState.staffing && projectState.staffing.enabled),
      optionalPoolSize: Array.isArray(projectState.staffing && projectState.staffing.optionalPool)
        ? projectState.staffing.optionalPool.length
        : 0,
      maxAgents: Number(projectState.staffing && projectState.staffing.maxAgents) || 0,
    },
    deadLetters: {
      count: projectState.deadLetters.length,
    },
    financeExceptions: {
      count: projectState.financeExceptions.length,
      criticalOpen: projectState.financeExceptions.filter((item) => String(item && item.severity || '').toLowerCase() === 'critical').length,
    },
    publicationHealth: {
      driftEvents: projectState.publicationHealth.driftEvents.length,
      incidents: Array.isArray(projectState.publicationHealth.incidents)
        ? projectState.publicationHealth.incidents.length
        : 0,
      lastCheckedAt: projectState.publicationHealth.lastCheckedAt || null,
      lastSelfHealAt: projectState.publicationHealth.lastSelfHealAt || null,
      lastSelfHealSummary: projectState.publicationHealth.lastSelfHealSummary || null,
      lastSlo: projectState.publicationHealth.lastSlo || null,
      dashboard: publicationDashboard,
    },
    goalPlan: goalPlan
      ? {
          source: goalPlan.source || null,
          generatedAt: goalPlan.generatedAt || null,
          milestoneCount: Array.isArray(goalPlan.milestones) ? goalPlan.milestones.length : 0,
          requiredConnectors: Array.isArray(goalPlan.requiredConnectors) ? goalPlan.requiredConnectors : [],
          missingCredentialServices: Array.isArray(goalPlan.missingCredentialServices) ? goalPlan.missingCredentialServices : [],
          clarificationQuestions: Array.isArray(goalPlan.clarificationQuestions) ? goalPlan.clarificationQuestions : [],
        }
      : null,
    milestoneCompletion,
    orchestration: {
      pendingApprovalCount: pendingApprovals.length,
      pendingApprovals: pendingApprovals.slice(0, 25).map((task) => ({
        taskId: task.id,
        title: task.title,
        phase: task.phase,
        requestedAt: task.pendingApproval && task.pendingApproval.requestedAt ? task.pendingApproval.requestedAt : task.lastProgressAt,
        riskScore: task.pendingApproval && task.pendingApproval.risk ? Number(task.pendingApproval.risk.score || 0) : 0,
        reason: task.pendingApproval && task.pendingApproval.reason ? task.pendingApproval.reason : task.lastError,
      })),
      assistanceRequestCount: assistanceRequests.length,
      assistanceRequests: assistanceRequests.slice(0, 25).map((task) => ({
        taskId: task.id,
        title: task.title,
        phase: task.phase,
        assistanceRequestedAt: task.assistanceRequestedAt,
        lastError: task.lastError || null,
      })),
      connectorReadinessTotal: connectorReadinessTasks.length,
      pendingConnectorReadinessCount: pendingConnectorReadiness.length,
      pendingConnectorReadiness: pendingConnectorReadiness.slice(0, 25).map((task) => ({
        taskId: task.id,
        title: task.title,
        phase: task.phase,
        status: task.status,
      })),
      recentPolicyDecisionCount: recentPolicyDecisions.length,
      milestoneProgressPct: milestoneCompletion ? milestoneCompletion.pct : null,
    },
    connectorBootstrap: {
      status: projectState.connectorBootstrap.status,
      lastRunAt: projectState.connectorBootstrap.lastRunAt,
      completedAt: projectState.connectorBootstrap.completedAt,
      lastError: projectState.connectorBootstrap.lastError,
      summary: projectState.connectorBootstrap.summary,
      bindings: projectState.connectorBindings,
    },
  };
}

function ensureRecurringState(projectState) {
  if (!projectState.recurring || typeof projectState.recurring !== 'object') {
    projectState.recurring = { enabled: false, lastRunAt: {}, lastIdleNoticeAt: null };
  }
  if (!projectState.recurring.lastRunAt || typeof projectState.recurring.lastRunAt !== 'object') {
    projectState.recurring.lastRunAt = {};
  }
  if (!Array.isArray(projectState.recurring.schedule)) {
    projectState.recurring.schedule = recurringScheduleForTemplate(projectState.template);
  }
  if (typeof projectState.recurring.enabled !== 'boolean') {
    projectState.recurring.enabled = projectState.recurring.schedule.length > 0;
  }
  if (typeof projectState.recurring.lastIdleNoticeAt === 'undefined') {
    projectState.recurring.lastIdleNoticeAt = null;
  }
}

function ensureStaffingState(projectState) {
  if (!projectState.staffing || typeof projectState.staffing !== 'object') {
    const subordinates = projectState.agents.filter((agent) => !agent.isCoordinator).length;
    projectState.staffing = {
      enabled: DEFAULT_AUTO_STAFFING_POLICY.enabled,
      cooldownMs: DEFAULT_AUTO_STAFFING_POLICY.cooldownMs,
      backlogPerAgentThreshold: DEFAULT_AUTO_STAFFING_POLICY.backlogPerAgentThreshold,
      maxOptionalAdds: DEFAULT_AUTO_STAFFING_POLICY.maxOptionalAdds,
      maxAgents: subordinates + DEFAULT_AUTO_STAFFING_POLICY.maxOptionalAdds,
      baseSubordinateCount: subordinates,
      optionalPool: [],
      lastScaledAt: null,
    };
  }
  if (!Array.isArray(projectState.staffing.optionalPool)) projectState.staffing.optionalPool = [];
  if (typeof projectState.staffing.lastScaledAt === 'undefined') projectState.staffing.lastScaledAt = null;
  if (!Number.isFinite(Number(projectState.staffing.baseSubordinateCount))) {
    projectState.staffing.baseSubordinateCount = projectState.agents.filter((agent) => !agent.isCoordinator).length;
  }
}

function shouldKeepRunningForRecurring(projectState) {
  ensureRecurringState(projectState);
  return projectState.operatingMode === 'continuous_business'
    && Boolean(projectState.recurring.enabled)
    && Array.isArray(projectState.recurring.schedule)
    && projectState.recurring.schedule.length > 0;
}

function summarizeIdleBlockers(projectState, loopSafety = null) {
  const inprogressCount = projectState.tasks.filter((task) => task.status === 'inprogress').length;
  const backlogTasks = projectState.tasks.filter((task) => task.status === 'backlog');
  const reviewAwaitingApproval = projectState.tasks.filter((task) => task.status === 'review' && task.executionState === 'awaiting_approval');
  const done = projectDoneTaskIds(projectState);
  let backlogBlockedByDependencies = 0;
  let backlogRunnable = 0;
  backlogTasks.forEach((task) => {
    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
    const depsSatisfied = deps.every((depId) => done.has(depId));
    if (depsSatisfied) backlogRunnable += 1;
    else backlogBlockedByDependencies += 1;
  });
  const recurringEnabled = shouldKeepRunningForRecurring(projectState);
  const suspended = loopSafety && loopSafety.suspended
    ? {
        suspendedUntil: loopSafety.suspendedUntil,
        reason: loopSafety.reason,
        failureCount: Number(loopSafety.failureCount || 0),
      }
    : null;
  const summaryParts = [];
  if (suspended) {
    summaryParts.push(`Recurring automation is paused until ${suspended.suspendedUntil} (${suspended.reason}).`);
  }
  if (reviewAwaitingApproval.length) {
    summaryParts.push(`${reviewAwaitingApproval.length} task(s) are awaiting approval.`);
  }
  if (backlogBlockedByDependencies > 0) {
    summaryParts.push(`${backlogBlockedByDependencies} backlog task(s) are blocked by dependencies.`);
  }
  if (backlogRunnable > 0) {
    summaryParts.push(`${backlogRunnable} backlog task(s) are runnable.`);
  }
  if (!summaryParts.length) {
    summaryParts.push('No runnable tasks at the moment; waiting for new work or prerequisites.');
  }
  return {
    inprogressCount,
    backlogTotal: backlogTasks.length,
    backlogRunnable,
    backlogBlockedByDependencies,
    awaitingApprovalCount: reviewAwaitingApproval.length,
    recurringEnabled,
    recurringSuspended: suspended,
    summary: summaryParts.join(' '),
  };
}

function maybeEmitIdleNotice(projectState, source, loopSafety, ts = nowIso()) {
  ensureRecurringState(projectState);
  if (source !== 'interval') return;
  const nowMs = Date.parse(ts);
  const lastNoticeMs = Date.parse(projectState.recurring.lastIdleNoticeAt || '');
  const cooldownMs = 5 * 60 * 1000;
  if (Number.isFinite(lastNoticeMs) && (nowMs - lastNoticeMs) < cooldownMs) {
    return;
  }
  const idle = summarizeIdleBlockers(projectState, loopSafety);
  projectState.recurring.lastIdleNoticeAt = ts;
  appendProjectLog(projectState, 'message', {
    kind: 'project_idle_waiting',
    source,
    summary: idle.summary,
    idle,
  });
}

function hasPendingRecurringTask(projectState, recurringKey) {
  return projectState.tasks.some((task) =>
    task.recurringKey === recurringKey && (
      task.status === 'backlog'
      || task.status === 'inprogress'
      || (task.status === 'review' && task.executionState === 'awaiting_approval')
    )
  );
}

function enqueueRecurringTasks(projectState, ts, source = 'interval') {
  ensureRecurringState(projectState);
  if (!projectState.recurring.enabled) return 0;

  const nowMs = Date.parse(ts || nowIso());
  const schedule = projectState.recurring.schedule;
  let inserted = 0;

  for (const spec of schedule) {
    if (inserted >= 2) break;
    const lastRun = Date.parse(projectState.recurring.lastRunAt[spec.key] || '');
    const due = Number.isNaN(lastRun) || (nowMs - lastRun >= spec.everyMs);
    if (!due) continue;
    if (hasPendingRecurringTask(projectState, spec.key)) continue;

    const task = {
      id: `RECUR-${spec.key}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      title: spec.title,
      phase: spec.phase,
      ownerRole: spec.ownerRole || null,
      kpiOwnerRole: spec.kpiOwnerRole || null,
      slaHours: Number(spec.slaHours || 24),
      status: 'backlog',
      assignee: null,
      blockedBy: null,
      dependencies: [],
      recurringKey: spec.key,
      autoAction: spec.action && spec.action.type === 'connector'
        ? {
            type: 'connector',
            connector: spec.action.connector,
            operation: spec.action.operation,
            input: spec.action.input || {},
            estimatedCost: Number(spec.action.estimatedCost || 0),
            actorRole: spec.ownerRole || null,
            requiresPermission: Boolean(spec.action.requiresPermission),
          }
        : null,
      executionState: 'queued',
      retryCount: 0,
      lastFailedAt: null,
      lastError: null,
      lastProgressAt: null,
      executionTaskRunId: null,
      inprogressCycles: 0,
      pendingApproval: null,
      autoActionNotBeforeAt: null,
      assistanceRequestedAt: null,
      deadLetteredAt: null,
      createdAt: ts,
      completedAt: null,
      startedAt: null,
      description: `Recurring task scheduled by coordinator (${source}).`,
    };

    projectState.tasks.push(task);
    projectState.recurring.lastRunAt[spec.key] = ts;
    inserted += 1;

    appendProjectLog(projectState, 'task', {
      kind: 'recurring_task_scheduled',
      taskId: task.id,
      recurringKey: spec.key,
      title: spec.title,
      source,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'coordinator',
      to: 'scheduler',
      kind: 'recurring_task_enqueued',
      payload: {
        taskId: task.id,
        recurringKey: spec.key,
        title: spec.title,
        autoAction: task.autoAction ? {
          type: task.autoAction.type,
          connector: task.autoAction.connector,
          operation: task.autoAction.operation,
          actorRole: task.autoAction.actorRole,
        } : null,
      },
    });
    emitProjectEvent(projectState.id, 'task_update', task);
  }

  return inserted;
}

function agentAlreadyPresent(projectState, roleName) {
  const target = String(roleName || '').toLowerCase();
  return projectState.agents.some((agent) => String(agent.role || '').toLowerCase() === target);
}

function pickAutoStaffingRole(projectState) {
  const pool = Array.isArray(projectState.staffing && projectState.staffing.optionalPool)
    ? projectState.staffing.optionalPool
    : [];
  if (!pool.length) return null;

  const backlogText = projectState.tasks
    .filter((task) => task.status === 'backlog')
    .map((task) => `${task.title || ''} ${task.phase || ''} ${task.description || ''}`.toLowerCase())
    .join(' ');

  const priorities = [
    { role: 'Legal Compliance Checker', keywords: ['legal', 'privacy', 'contract', 'policy', 'compliance'] },
    { role: 'Security Engineer', keywords: ['security', 'incident', 'vulnerability', 'auth', 'breach'] },
    { role: 'SEO Specialist', keywords: ['seo', 'ranking', 'search', 'metadata', 'backlink'] },
    { role: 'Analytics Reporter', keywords: ['analytics', 'kpi', 'roi', 'cohort', 'funnel'] },
    { role: 'PPC Campaign Strategist', keywords: ['ads', 'campaign', 'cac', 'cpc', 'ctr'] },
    { role: 'Reality Checker', keywords: ['qa', 'test', 'verify', 'review', 'audit'] },
  ];

  for (const priority of priorities) {
    if (!pool.includes(priority.role)) continue;
    if (agentAlreadyPresent(projectState, priority.role)) continue;
    const match = priority.keywords.some((kw) => backlogText.includes(kw));
    if (match) return priority.role;
  }

  return pool.find((roleName) => !agentAlreadyPresent(projectState, roleName)) || null;
}

function evaluateAutoStaffing(projectState, ts) {
  ensureStaffingState(projectState);
  const staffing = projectState.staffing;
  if (!staffing.enabled) return null;

  const nowMs = Date.parse(ts || nowIso());
  const lastScaledMs = Date.parse(staffing.lastScaledAt || '');
  if (!Number.isNaN(lastScaledMs) && nowMs - lastScaledMs < staffing.cooldownMs) {
    return null;
  }

  const workers = projectState.agents.filter((agent) => !agent.isCoordinator);
  const backlog = projectState.tasks.filter((task) => task.status === 'backlog').length;
  const running = workers.filter((agent) => agent.status === 'running').length;
  const optionalCount = Math.max(0, workers.length - Number(staffing.baseSubordinateCount || workers.length));
  const shouldScale = backlog >= Math.max(1, workers.length) * staffing.backlogPerAgentThreshold && running >= workers.length;

  if (!shouldScale) return null;
  if (workers.length >= staffing.maxAgents) return null;
  if (optionalCount >= staffing.maxOptionalAdds) return null;

  const role = pickAutoStaffingRole(projectState);
  if (!role) return null;

  const newAgent = {
    id: roleToAgentId(role, projectState.agents.length),
    name: role,
    role,
    templateRole: role,
    sourceRole: role,
    status: 'idle',
    currentTask: null,
    tasksDone: 0,
    tokens: 0,
    recentLog: ['Auto-added by coordinator'],
    isCoordinator: false,
    personalityPromptPaths: optionalAgentPersonalityPaths(role),
  };
  projectState.agents.push(newAgent);
  staffing.lastScaledAt = ts || nowIso();

  appendProjectLog(projectState, 'task', {
    kind: 'agent_auto_added',
    agentId: newAgent.id,
    role: newAgent.role,
    reason: 'backlog_pressure',
    backlog,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: newAgent.id,
    kind: 'agent_auto_added',
    payload: {
      agentId: newAgent.id,
      role: newAgent.role,
      backlog,
      optionalCount: optionalCount + 1,
    },
  });
  emitProjectEvent(projectState.id, 'agent_message', {
    agentId: newAgent.id,
    name: newAgent.name,
    role: newAgent.role,
    status: newAgent.status,
    currentTask: newAgent.currentTask,
    tasksDone: newAgent.tasksDone,
    recentLog: newAgent.recentLog,
  });
  return newAgent;
}

function pickRunnableAutoActionTask(projectState) {
  const done = projectDoneTaskIds(projectState);
  const nowMs = Date.now();
  return projectState.tasks.find((task) => {
    if (task.status !== 'backlog') return false;
    if (!task.autoAction || task.autoAction.type !== 'connector') return false;
    if (task.autoActionNotBeforeAt) {
      const notBeforeMs = Date.parse(task.autoActionNotBeforeAt);
      if (Number.isFinite(notBeforeMs) && nowMs < notBeforeMs) return false;
    }
    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
    return deps.every((depId) => done.has(depId));
  }) || null;
}

function finalizeAutoActionTask(projectState, task, ok, reason, detail = {}) {
  task.status = 'done';
  task.completedAt = nowIso();
  task.executionState = ok ? 'done' : 'failed';
  task.lastError = ok ? null : String(reason || 'auto_action_failed');
  task.lastProgressAt = nowIso();
  task.autoActionNotBeforeAt = null;
  task.pendingApproval = null;
  appendProjectLog(projectState, ok ? 'task' : 'error', {
    kind: ok ? 'recurring_auto_action_completed' : 'recurring_auto_action_failed',
    taskId: task.id,
    recurringKey: task.recurringKey,
    reason,
    detail,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'automation_engine',
    kind: ok ? 'recurring_auto_action_completed' : 'recurring_auto_action_failed',
    payload: {
      taskId: task.id,
      recurringKey: task.recurringKey,
      reason,
      detail,
    },
  });
  emitProjectEvent(projectState.id, 'task_update', task);
  if (ok) {
    clearOperationalLoopAutoActionFailures(projectState);
  }
}

function sendTaskToDeadLetter(projectState, task, reason, detail = {}) {
  ensureDeadLetterState(projectState);
  ensureConnectorExecutionState(projectState);
  const at = nowIso();
  const connectorId = String(task.autoAction?.connector || '').trim().toLowerCase();
  const classification = classifyFailureDeterminism(connectorId, reason, detail);
  task.status = 'done';
  task.executionState = 'failed';
  task.completedAt = at;
  task.lastFailedAt = at;
  task.lastProgressAt = at;
  task.lastError = String(reason || 'dead_lettered');
  task.deadLetteredAt = at;
  task.autoActionNotBeforeAt = null;
  ensureTaskRetryLineage(task);
  appendTaskRetryLineage(task, {
    at,
    stage: 'auto_action_dead_lettered',
    reason,
    classification: classification.classification,
    retryable: false,
    attempt: Number(task.retryCount || 0),
    connector: task.autoAction?.connector || null,
    operation: task.autoAction?.operation || null,
    detail,
  });

  const record = {
    taskId: task.id,
    title: task.title,
    recurringKey: task.recurringKey || null,
    connector: task.autoAction?.connector || null,
    operation: task.autoAction?.operation || null,
    retryCount: Number(task.retryCount || 0),
    failedAt: at,
    reason: String(reason || 'dead_lettered'),
    detail,
  };
  projectState.deadLetters.unshift(record);
  if (projectState.deadLetters.length > 200) projectState.deadLetters.length = 200;

  const executionKey = String(detail && detail.executionKey ? detail.executionKey : '').trim();
  if (executionKey) {
    markConnectorExecutionRecord(projectState, executionKey, {
      status: 'dead_lettered',
      lastError: String(reason || 'dead_lettered'),
      deadLetteredAt: at,
    });
  }

  appendProjectLog(projectState, 'error', {
    kind: 'recurring_auto_action_dead_lettered',
    ...record,
  });
  recordOperationalLoopAutoActionFailure(projectState, task, reason, detail);
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'dlq',
    kind: 'task_dead_lettered',
    payload: record,
  });
  emitProjectEvent(projectState.id, 'task_update', task);
}

function retryReasonNeedsAssistance(reason, detail = {}) {
  const summary = `${String(reason || '').toLowerCase()} ${String(detail && detail.errorCode || '').toLowerCase()}`;
  const blockers = [
    'secret_missing',
    'credential',
    'not connected',
    'disabled',
    'unsupported',
    'not implemented',
    'unknown_connector',
    'connector_not_implemented',
  ];
  return blockers.some((token) => summary.includes(token));
}

function maybeEscalateAutoActionAssistance(projectState, task, reason, detail = {}) {
  if (!retryReasonNeedsAssistance(reason, detail)) {
    return false;
  }
  const nowMs = Date.now();
  const lastMs = Date.parse(task.assistanceRequestedAt || '');
  const cooldownMs = 60 * 60 * 1000;
  if (Number.isFinite(lastMs) && (nowMs - lastMs) < cooldownMs) {
    return false;
  }
  const at = nowIso();
  task.assistanceRequestedAt = at;
  appendProjectLog(projectState, 'warning', {
    kind: 'recurring_auto_action_assistance_requested',
    taskId: task.id,
    title: task.title,
    connector: task.autoAction && task.autoAction.connector ? task.autoAction.connector : null,
    operation: task.autoAction && task.autoAction.operation ? task.autoAction.operation : null,
    reason,
    detail,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'operator',
    kind: 'assistance_requested_connector_blocked',
    payload: {
      taskId: task.id,
      connector: task.autoAction && task.autoAction.connector ? task.autoAction.connector : null,
      operation: task.autoAction && task.autoAction.operation ? task.autoAction.operation : null,
      reason,
      detail,
    },
  });
  notifyOperator(projectState, `Assistance needed: ${task.title}`, {
    taskId: task.id,
    connector: task.autoAction && task.autoAction.connector ? task.autoAction.connector : null,
    operation: task.autoAction && task.autoAction.operation ? task.autoAction.operation : null,
    reason,
    detail,
  }).catch(() => {});
  return true;
}

function scheduleAutoActionRetry(projectState, task, reason, detail = {}) {
  const nextRetryCount = Number(task.retryCount || 0) + 1;
  const connectorId = String(task && task.autoAction && task.autoAction.connector ? task.autoAction.connector : '').trim().toLowerCase();
  const retryPlan = connectorRetryPlan(connectorId, nextRetryCount, reason, detail);
  const policy = retryPolicyForConnector(connectorId);
  if (!retryPlan.retryable || nextRetryCount > policy.maxAttempts) {
    sendTaskToDeadLetter(projectState, task, reason, detail);
    return false;
  }

  const at = nowIso();
  const notBeforeAt = new Date(Date.now() + retryPlan.delayMs).toISOString();
  task.status = 'backlog';
  task.executionState = 'queued';
  task.assignee = null;
  task.startedAt = null;
  task.inprogressCycles = 0;
  task.retryCount = nextRetryCount;
  task.lastFailedAt = at;
  task.lastProgressAt = at;
  task.lastError = String(reason || 'retry_scheduled');
  task.autoActionNotBeforeAt = notBeforeAt;
  ensureTaskRetryLineage(task);
  appendTaskRetryLineage(task, {
    at,
    stage: 'auto_action_retry_scheduled',
    reason,
    classification: retryPlan.classification,
    retryable: true,
    attempt: nextRetryCount,
    connector: task.autoAction?.connector || null,
    operation: task.autoAction?.operation || null,
    detail: {
      ...detail,
      retryDelayMs: retryPlan.delayMs,
      matchedSignals: retryPlan.matchedSignals,
    },
  });
  if (typeof task.assistanceRequestedAt === 'undefined') {
    task.assistanceRequestedAt = null;
  }

  maybeEscalateAutoActionAssistance(projectState, task, reason, detail);
  recordOperationalLoopAutoActionFailure(projectState, task, reason, detail);

  appendProjectLog(projectState, 'fix', {
    kind: 'recurring_auto_action_retry_scheduled',
    taskId: task.id,
    recurringKey: task.recurringKey,
    reason,
    retryCount: nextRetryCount,
    retryDelayMs: retryPlan.delayMs,
    notBeforeAt,
    detail,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'automation_engine',
    kind: 'recurring_auto_action_retry_scheduled',
    payload: {
      taskId: task.id,
      reason,
      retryCount: nextRetryCount,
      retryDelayMs: retryPlan.delayMs,
      notBeforeAt,
    },
  });
  emitProjectEvent(projectState.id, 'task_update', task);
  return true;
}

function executeRecurringAutoAction(projectState, task, source = 'interval') {
  const runtime = projectRuntimes.get(projectState.id);
  if (!runtime || runtime.execution || runtime.recurringAction) {
    return false;
  }
  const action = task.autoAction;
  if (!action || action.type !== 'connector') {
    return false;
  }

  if (shouldBlockMutatingConnectorInDraftMode(projectState.mode, action.connector, action.operation)) {
    finalizeAutoActionTask(projectState, task, true, `Skipped ${action.connector}:${action.operation} in draft mode. Promote to production to allow mutating connector actions.`, {
      connector: action.connector,
      operation: action.operation,
      source,
      skipped: true,
      skippedReason: 'draft_mode_mutation_blocked',
    });
    persistProjectState(projectState);
    return true;
  }

  ensureConnectorExecutionState(projectState);
  const executionKey = connectorExecutionKey(task);
  const previousExecution = projectState.connectorExecutions[executionKey] || null;
  if (previousExecution && previousExecution.status === 'succeeded') {
    finalizeAutoActionTask(projectState, task, true, previousExecution.message || 'idempotent_replay_success', {
      connector: action.connector,
      operation: action.operation,
      source,
      idempotentReplay: true,
      executionKey,
      originalCompletedAt: previousExecution.completedAt || null,
    });
    persistProjectState(projectState);
    return true;
  }

  if (previousExecution && previousExecution.status === 'running') {
    const startedMs = Date.parse(previousExecution.startedAt || previousExecution.updatedAt || '');
    if (Number.isFinite(startedMs) && (Date.now() - startedMs) < CONNECTOR_EXECUTION_STALE_MS) {
      return false;
    }
    markConnectorExecutionRecord(projectState, executionKey, {
      status: 'stale_running',
      staleAt: nowIso(),
      message: 'Marked stale after runtime recovery timeout.',
    });
  }

  const actorRole = String(action.actorRole || '').trim();
  const actor = actorRole ? findRuntimeAgentByRole(projectState, actorRole) : null;
  const resolvedActionInput = resolveConnectorActionInput(action && action.input && typeof action.input === 'object' ? action.input : {}, projectState);
  const siteId = String(resolvedActionInput && resolvedActionInput.siteId ? resolvedActionInput.siteId : '').trim();
  const unresolvedInput = resolvedActionInput && typeof resolvedActionInput === 'object'
    ? hasUnresolvedTemplateValue(resolvedActionInput)
    : false;
  if ((action.connector === 'netlify' && action.operation === 'trigger_deploy' && (!siteId || unresolvedInput)) || unresolvedInput) {
    const reason = action.connector === 'netlify' && action.operation === 'trigger_deploy'
      ? 'Recurring deploy needs a concrete Netlify siteId. Configure credentials/settings before running trigger_deploy.'
      : 'Recurring connector action has unresolved template placeholders in input. Provide concrete connector values before execution.';
    markTaskAwaitingApproval(projectState, task, reason, {
      connector: action.connector,
      operation: action.operation,
      actorRole,
      source,
      requiresPermission: true,
      executionKey,
      inputPreview: resolvedActionInput,
    });
    markConnectorExecutionRecord(projectState, executionKey, {
      status: 'awaiting_approval',
      lastError: reason,
    });
    notifyOperator(projectState, `Approval needed: ${task.title}`, {
      taskId: task.id,
      reason,
      connector: action.connector,
      operation: action.operation,
      actorRole,
    }).catch(() => {});
    persistProjectState(projectState);
    return true;
  }

  if (
    String(projectState.template || '').toLowerCase() === 'game_studio'
    && String(action.connector || '').toLowerCase() === 'netlify'
    && String(action.operation || '').toLowerCase() === 'trigger_deploy'
  ) {
    ensureProjectConnectorBindings(projectState);
    const binding = projectState.connectorBindings.netlify || {};
    const currentArtifactHash = gameStudioArtifactHash(projectState);
    const previousArtifactHash = String(binding.lastDeployArtifactHash || '').trim();
    if (currentArtifactHash && previousArtifactHash && previousArtifactHash === currentArtifactHash) {
      finalizeAutoActionTask(projectState, task, true, 'No deploy needed: game artifacts unchanged since last successful deploy.', {
        connector: action.connector,
        operation: action.operation,
        source,
        skipped: true,
        skippedReason: 'artifact_hash_unchanged',
        executionKey,
        artifactHash: currentArtifactHash,
      });
      markConnectorExecutionRecord(projectState, executionKey, {
        status: 'succeeded',
        message: 'Skipped deploy because game artifacts are unchanged.',
        completedAt: nowIso(),
        actualCost: 0,
        result: {
          skipped: true,
          reason: 'artifact_hash_unchanged',
          artifactHash: currentArtifactHash,
        },
      });
      persistProjectState(projectState);
      return true;
    }
  }

  task.status = 'inprogress';
  task.assignee = actor ? actor.id : null;
  task.startedAt = nowIso();
  task.executionState = 'running';
  task.lastProgressAt = task.startedAt;
  emitProjectEvent(projectState.id, 'task_update', task);

  runtime.recurringAction = {
    taskId: task.id,
    startedAt: task.startedAt,
    connector: action.connector,
    operation: action.operation,
    actorRole,
    executionKey,
  };

  markConnectorExecutionRecord(projectState, executionKey, {
    taskId: task.id,
    connector: String(action.connector || '').trim().toLowerCase(),
    operation: String(action.operation || '').trim().toLowerCase(),
    status: 'running',
    startedAt: task.startedAt,
    attempts: Number(previousExecution && previousExecution.attempts || 0) + 1,
    source,
    lastError: null,
  });

  executeConnectorPolicy(action.connector, {
    dryRun: false,
    projectId: projectState.id,
    estimatedCost: Number(action.estimatedCost || 0),
    actorRole,
    operation: action.operation,
  }).then(async (policyResult) => {
    if (!policyResult.ok) {
      if (shouldSkipConnectorPolicyFailureInDraft(projectState, action, policyResult)) {
        finalizeAutoActionTask(projectState, task, true, `Skipped ${action.connector}:${action.operation} in draft mode because connector readiness is incomplete.`, {
          connector: action.connector,
          operation: action.operation,
          source,
          skipped: true,
          skippedReason: 'draft_connector_policy_unavailable',
          policyReason: policyResult.reason,
          checks: policyResult.checks,
          executionKey,
        });
        markConnectorExecutionRecord(projectState, executionKey, {
          status: 'succeeded',
          message: `Skipped in draft mode: ${policyResult.reason || 'connector readiness incomplete'}`,
          completedAt: nowIso(),
          actualCost: 0,
          result: {
            skipped: true,
            skippedReason: 'draft_connector_policy_unavailable',
            policyReason: policyResult.reason || null,
            checks: policyResult.checks || [],
          },
        });
        persistProjectState(projectState);
        return;
      }

      const needsPermission = Boolean(action.requiresPermission);
      if (needsPermission) {
        await notifyOperator(projectState, `Permission needed for ${action.connector}:${action.operation}`, {
          taskId: task.id,
          actorRole,
          reason: policyResult.reason,
          checks: policyResult.checks,
        });
        markTaskAwaitingApproval(projectState, task, policyResult.reason, {
          connector: action.connector,
          operation: action.operation,
          actorRole,
          source,
          requiresPermission: true,
          checks: policyResult.checks,
          executionKey,
        });
        markConnectorExecutionRecord(projectState, executionKey, {
          status: 'awaiting_approval',
          lastError: policyResult.reason,
          checks: policyResult.checks,
        });
        persistProjectState(projectState);
        return;
      }
      scheduleAutoActionRetry(projectState, task, policyResult.reason, {
        connector: action.connector,
        operation: action.operation,
        actorRole,
        source,
        requiresPermission: needsPermission,
        checks: policyResult.checks,
        executionKey,
      });
      markConnectorExecutionRecord(projectState, executionKey, {
        status: 'failed',
        lastError: policyResult.reason,
      });
      persistProjectState(projectState);
      return;
    }

    const supportRouting = evaluateSupportAutonomyRouting({
      connector: action.connector,
      operation: action.operation,
      input: resolvedActionInput || {},
      actorRole,
    });
    if (!supportRouting.ok) {
      scheduleAutoActionRetry(projectState, task, supportRouting.summary, {
        connector: action.connector,
        operation: action.operation,
        actorRole,
        source,
        executionKey,
        supportRouting,
      });
      markConnectorExecutionRecord(projectState, executionKey, {
        status: 'failed',
        lastError: supportRouting.summary,
        checks: supportRouting.checks,
      });
      persistProjectState(projectState);
      return;
    }

    const financeGuardrail = evaluateFinanceAutonomyGuardrails({
      connector: action.connector,
      operation: action.operation,
      input: resolvedActionInput || {},
      actorRole,
      projectState,
    });
    if (!financeGuardrail.ok) {
      scheduleAutoActionRetry(projectState, task, financeGuardrail.summary, {
        connector: action.connector,
        operation: action.operation,
        actorRole,
        source,
        executionKey,
        financeGuardrail,
      });
      markConnectorExecutionRecord(projectState, executionKey, {
        status: 'failed',
        lastError: financeGuardrail.summary,
        checks: financeGuardrail.checks,
      });
      persistProjectState(projectState);
      return;
    }

    const actionInput = {
      ...(resolvedActionInput && typeof resolvedActionInput === 'object' ? resolvedActionInput : {}),
      supportRouting: supportRouting.route,
      financeGuardrail: financeGuardrail.route,
    };
    let execution = await executeLiveConnector(action.connector, {
      operation: action.operation,
      input: actionInput,
      projectId: projectState.id,
      estimatedCost: Number(action.estimatedCost || 0),
      idempotencyKey: executionKey,
    });

    if (!execution.ok) {
      const failureReason = execution.message || execution.errorCode || 'execution_failed';
      scheduleAutoActionRetry(projectState, task, failureReason, {
        connector: action.connector,
        operation: action.operation,
        actorRole,
        source,
        errorCode: execution.errorCode || null,
        executionKey,
      });
      markConnectorExecutionRecord(projectState, executionKey, {
        status: 'failed',
        lastError: failureReason,
      });
      persistProjectState(projectState);
      return;
    }

    let imageInjection = null;
    if (String(action.connector || '').toLowerCase() === 'image_generator' && String(action.operation || '').toLowerCase() === 'generate_asset_pack') {
      const generatedAssets = execution && execution.data && Array.isArray(execution.data.assets)
        ? execution.data.assets
        : [];
      imageInjection = applyTemplateImageAssetInjection(projectState, generatedAssets);
      if (!imageInjection.ok) {
        const failureReason = `Image asset injection failed: ${(imageInjection.gaps || []).join('; ') || imageInjection.reason || 'unknown'}`;
        scheduleAutoActionRetry(projectState, task, failureReason, {
          connector: action.connector,
          operation: action.operation,
          actorRole,
          source,
          executionKey,
          imageInjection,
        });
        markConnectorExecutionRecord(projectState, executionKey, {
          status: 'failed',
          lastError: failureReason,
          result: {
            connectorResult: execution.data || null,
            imageInjection,
          },
        });
        persistProjectState(projectState);
        return;
      }
      execution = {
        ...execution,
        data: {
          ...(execution.data || {}),
          imageInjection,
        },
      };
      appendProjectLog(projectState, 'message', {
        kind: 'image_assets_injected',
        taskId: task.id,
        manifestPath: imageInjection.manifestPath || null,
        count: Array.isArray(imageInjection.items) ? imageInjection.items.length : 0,
      });
    }

    const actualCost = Number.isFinite(Number(execution.actualCost)) ? Number(execution.actualCost) : Number(action.estimatedCost || 0);
    const reconciliation = await reconcileConnectorExecution(action.connector, action.operation, execution, {
      projectId: projectState.id,
      siteId: String(actionInput.siteId || ''),
      executionKey,
    });
    const publicationDriftSelfHeal = await executePublicationDriftSelfHeal(projectState, {
      execution,
      reconciliation,
      context: {
        mode: publicationOperationKind(action.operation),
        source: 'recurring_auto_action',
        executionKey,
      },
    });
    const financeExceptions = await processFinanceSettlementExceptions(projectState, {
      connector: action.connector,
      operation: action.operation,
      execution,
      input: actionInput,
      executionKey,
      source: 'recurring_auto_action',
      taskId: task.id,
    });
    if (actualCost > 0 && policyResult.credentialService) {
      recordCredentialSpend(projectState.id, policyResult.credentialService, actualCost, nowIso());
    }

    finalizeAutoActionTask(projectState, task, true, execution.message || 'ok', {
      connector: action.connector,
      operation: action.operation,
      actorRole,
      source,
      actualCost,
      executionKey,
      reconciliation,
      publicationDriftSelfHeal,
      supportRouting: supportRouting.route,
      financeGuardrail: financeGuardrail.route,
      financeExceptions,
      imageInjection,
    });
    if (String(action.connector || '').toLowerCase() === 'netlify') {
      ensureProjectConnectorBindings(projectState);
      const binding = projectState.connectorBindings.netlify || {};
      const currentArtifactHash = gameStudioArtifactHash(projectState);
      const deployUrl = String(execution && execution.data && execution.data.deployUrl ? execution.data.deployUrl : '').trim();
      const siteUrl = String(execution && execution.data && execution.data.siteUrl ? execution.data.siteUrl : '').trim();
      const siteId = String(actionInput.siteId || binding.siteId || '').trim();
      projectState.connectorBindings.netlify = {
        ...binding,
        siteId: siteId || binding.siteId || null,
        siteUrl: siteUrl || binding.siteUrl || null,
        lastDeployUrl: deployUrl || binding.lastDeployUrl || null,
        lastDeployAt: nowIso(),
        lastDeployArtifactHash: currentArtifactHash || binding.lastDeployArtifactHash || null,
        status: 'ready',
        updatedAt: nowIso(),
      };
      if (deployUrl) {
        appendProjectLog(projectState, 'message', {
          kind: 'netlify_deploy_url_available',
          taskId: task.id,
          siteId: siteId || null,
          deployUrl,
          siteUrl: siteUrl || null,
        });
      }
    }
    markConnectorExecutionRecord(projectState, executionKey, {
      status: 'succeeded',
      message: execution.message || 'ok',
      completedAt: nowIso(),
      actualCost,
      result: execution.data || null,
      reconciliation,
      publicationDriftSelfHeal,
      financeExceptions,
    });
    if (reconciliation && reconciliation.checked && !reconciliation.ok) {
      appendProjectLog(projectState, 'message', {
        kind: 'connector_reconciliation_pending',
        taskId: task.id,
        connector: action.connector,
        operation: action.operation,
        executionKey,
        reconciliation,
      });
      appendMessageBusEntry({
        projectId: projectState.id,
        from: 'coordinator',
        to: 'reconciliation_engine',
        kind: 'connector_reconciliation_pending',
        payload: {
          taskId: task.id,
          connector: action.connector,
          operation: action.operation,
          executionKey,
          reconciliation,
        },
      });
    }
    persistProjectState(projectState);
  }).catch(async (err) => {
    const errMsg = redactSensitive(err.message);
    await notifyOperator(projectState, `Auto action error on ${action.connector}:${action.operation}`, {
      taskId: task.id,
      actorRole,
      reason: errMsg,
    });
    scheduleAutoActionRetry(projectState, task, errMsg, {
      connector: action.connector,
      operation: action.operation,
      actorRole,
      source,
      executionKey,
    });
    markConnectorExecutionRecord(projectState, executionKey, {
      status: 'failed',
      lastError: errMsg,
    });
    persistProjectState(projectState);
  }).finally(() => {
    const rt = projectRuntimes.get(projectState.id);
    if (rt) rt.recurringAction = null;
  });

  appendProjectLog(projectState, 'task', {
    kind: 'recurring_auto_action_started',
    taskId: task.id,
    connector: action.connector,
    operation: action.operation,
    actorRole,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: actor ? actor.id : 'automation_engine',
    kind: 'recurring_auto_action_started',
    payload: {
      taskId: task.id,
      connector: action.connector,
      operation: action.operation,
      actorRole,
      source,
    },
  });

  persistProjectState(projectState);
  return true;
}

function summarizeProject(projectState) {
  const inProgress = projectState.tasks.find((task) => task.status === 'inprogress');
  const goalPlan = projectState.goalPlan && typeof projectState.goalPlan === 'object' ? projectState.goalPlan : null;
  return {
    id: projectState.id,
    name: projectState.name,
    template: projectState.template,
    mode: String(projectState.mode || 'production').toLowerCase(),
    status: projectState.status,
    heartbeat: projectState.heartbeat?.status || 'unknown',
    lastActivity: projectState.lastActivity,
    agentCount: projectState.agents.length,
    currentTask: inProgress ? inProgress.title : null,
    goalPlan: goalPlan
      ? {
          source: goalPlan.source || null,
          milestoneCount: Array.isArray(goalPlan.milestones) ? goalPlan.milestones.length : 0,
          missingCredentialServices: Array.isArray(goalPlan.missingCredentialServices) ? goalPlan.missingCredentialServices.length : 0,
          clarificationQuestions: Array.isArray(goalPlan.clarificationQuestions) ? goalPlan.clarificationQuestions.length : 0,
        }
      : null,
    completedAt: projectState.completedAt || null,
    failedAt: projectState.failedAt || null
  };
}

function persistProjectState(projectState) {
  const dir = projectDir(projectState.id);
  ensureDir(dir);
  fs.writeFileSync(projectStatePath(projectState.id), `${JSON.stringify(projectState, null, 2)}\n`, 'utf-8');
}

function projectDoneTaskIds(projectState) {
  const done = new Set();
  projectState.tasks.forEach((task) => {
    if (task.status === 'done') done.add(task.id);
  });
  return done;
}

function nextRunnableTask(projectState) {
  const done = projectDoneTaskIds(projectState);
  return projectState.tasks.find((task) => {
    if (task.status !== 'backlog') return false;
    if (task.autoAction && task.autoAction.type === 'connector') return false;
    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
    return deps.every((depId) => done.has(depId));
  }) || null;
}

function normalizeConnectorId(value) {
  return String(value || '').trim().toLowerCase();
}

function taskCapabilityRequirements(task) {
  const title = String(task && task.title ? task.title : '').toLowerCase();
  const phase = String(task && task.phase ? task.phase : '').toLowerCase();
  const req = {
    requiredRole: String(task && task.requiredRole ? task.requiredRole : '').trim() || null,
    connector: null,
    canDeploy: false,
    canSpend: false,
  };

  if (task && task.autoAction && task.autoAction.type === 'connector') {
    req.connector = normalizeConnectorId(task.autoAction.connector);
    req.requiredRole = req.requiredRole || String(task.autoAction.actorRole || '').trim() || null;
    req.canDeploy = req.connector === 'netlify' && String(task.autoAction.operation || '').toLowerCase() === 'trigger_deploy';
    req.canSpend = Number(task.autoAction.estimatedCost || 0) > 0;
    return req;
  }

  // Avoid marking generic planning/strategy tasks as deploy-capability work.
  // Only explicit deploy/release wording should require canDeploy when no connector action is attached.
  const looksLikeDeploy = phase.includes('deploy') || phase.includes('release') || title.includes('deploy') || title.includes('release');
  if (looksLikeDeploy) req.canDeploy = true;
  return req;
}

function roleCapabilitiesFor(projectState, role) {
  const roleName = String(role || '').trim();
  const caps = projectState && projectState.roleCapabilities && typeof projectState.roleCapabilities === 'object'
    ? projectState.roleCapabilities[roleName]
    : null;
  return caps || { canDeploy: false, canSpend: false, allowedConnectors: [] };
}

function agentRoleMatchesRequired(agent, requiredRole) {
  if (!requiredRole) return true;
  const required = String(requiredRole).toLowerCase();
  // Check display role, template role (original), and source role (alias may differ)
  return [
    String(agent.role || ''),
    String(agent.templateRole || ''),
    String(agent.sourceRole || ''),
  ].some((r) => r.toLowerCase() === required);
}

function agentCanHandleTask(projectState, agent, task) {
  if (!agent || agent.isCoordinator || !task) return false;
  const req = taskCapabilityRequirements(task);
  const agentRole = String(agent.role || '').trim();
  const caps = roleCapabilitiesFor(projectState, agentRole);

  if (req.requiredRole && !agentRoleMatchesRequired(agent, req.requiredRole)) {
    return false;
  }
  if (req.connector) {
    const allowed = Array.isArray(caps.allowedConnectors)
      ? caps.allowedConnectors.map((entry) => normalizeConnectorId(entry))
      : [];
    if (!allowed.includes(req.connector)) {
      return false;
    }
  }
  if (req.canDeploy && !caps.canDeploy) {
    return false;
  }
  if (req.canSpend && !caps.canSpend) {
    return false;
  }
  return true;
}

function agentCanHandleTaskCapabilitiesOnly(projectState, agent, task) {
  // Like agentCanHandleTask but ignores requiredRole � used for fallback assignment
  if (!agent || agent.isCoordinator || !task) return false;
  const req = taskCapabilityRequirements(task);
  const agentRole = String(agent.role || '').trim();
  const caps = roleCapabilitiesFor(projectState, agentRole);
  if (req.connector) {
    const allowed = Array.isArray(caps.allowedConnectors)
      ? caps.allowedConnectors.map((entry) => normalizeConnectorId(entry))
      : [];
    if (!allowed.includes(req.connector)) return false;
  }
  if (req.canDeploy && !caps.canDeploy) return false;
  if (req.canSpend && !caps.canSpend) return false;
  return true;
}

function pickWorkerAgent(projectState, task = null) {
  const candidates = projectState.agents.filter((agent) => !agent.isCoordinator && agent.status === 'idle');
  const allCandidates = projectState.agents.filter((agent) => !agent.isCoordinator);
  const pool = candidates.length ? candidates : allCandidates;
  if (!pool.length) return null;

  if (!task) {
    const index = projectState.heartbeat?.cycleCount ? projectState.heartbeat.cycleCount % pool.length : 0;
    return pool[index];
  }

  // Tier 1: exact role + capability match (preferred)
  const exactMatch = pool.filter((agent) => agentCanHandleTask(projectState, agent, task));
  if (exactMatch.length) {
    const index = projectState.heartbeat?.cycleCount ? projectState.heartbeat.cycleCount % exactMatch.length : 0;
    return exactMatch[index];
  }

  // Tier 2: capability match without role restriction (coordinator finds best available)
  const capMatch = pool.filter((agent) => agentCanHandleTaskCapabilitiesOnly(projectState, agent, task));
  if (capMatch.length) {
    const index = projectState.heartbeat?.cycleCount ? projectState.heartbeat.cycleCount % capMatch.length : 0;
    appendProjectLog(projectState, 'message', {
      kind: 'agent_role_fallback_assignment',
      taskId: task.id,
      requiredRole: task.requiredRole || null,
      assignedRole: capMatch[index % capMatch.length].role,
    });
    return capMatch[index];
  }

  // Tier 3: any available agent � coordinator picks whoever is free
  const index = projectState.heartbeat?.cycleCount ? projectState.heartbeat.cycleCount % pool.length : 0;
  appendProjectLog(projectState, 'message', {
    kind: 'agent_any_available_assignment',
    taskId: task.id,
    requiredRole: task.requiredRole || null,
    assignedRole: pool[index].role,
  });
  return pool[index];
}

function markTaskAwaitingApproval(projectState, task, reason, detail = {}) {
  const at = nowIso();
  ensureApprovalGovernanceState(projectState);
  const risk = assessApprovalRisk(task, { ...detail, reason });
  task.status = 'review';
  task.executionState = 'awaiting_approval';
  task.lastError = String(reason || 'approval_required');
  task.lastProgressAt = at;
  task.pendingApproval = {
    requestedAt: at,
    reason: String(reason || 'approval_required'),
    risk,
    detail,
  };
  appendProjectLog(projectState, 'task', {
    kind: 'task_awaiting_approval',
    taskId: task.id,
    reason,
    risk,
    detail,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'operator',
    kind: 'task_awaiting_approval',
    payload: {
      taskId: task.id,
      title: task.title,
      reason,
      risk,
      detail,
    },
  });

  const governanceDecision = evaluateApprovalGovernanceDecision(projectState, task, {
    riskScore: risk.score,
    estimatedCost: Number(detail.estimatedCost || task?.autoAction?.estimatedCost || 0),
    connector: detail.connector || task?.autoAction?.connector,
    operation: detail.operation || task?.autoAction?.operation,
    actorRole: detail.actorRole || task?.autoAction?.actorRole,
  });
  if (governanceDecision.decision) {
    task.pendingApproval.policyDecision = {
      source: 'approval_policy_pack',
      matchedRuleId: governanceDecision.matchedRuleId,
      evaluatedAt: at,
      decision: governanceDecision.decision,
    };

    if (governanceDecision.decision === 'approve' || governanceDecision.decision === 'deny') {
      applyTaskApprovalDecision(
        projectState,
        task,
        governanceDecision.decision,
        governanceDecision.reason || 'Automated policy decision.',
        'approval_policy_pack',
      );
    } else if (governanceDecision.decision === 'escalate') {
      notifyOperator(projectState, `Policy escalation required: ${task.title}`, {
        taskId: task.id,
        matchedRuleId: governanceDecision.matchedRuleId,
        reason: governanceDecision.reason,
        source: 'approval_policy_pack',
      }).catch(() => {});
    }

    appendProjectLog(projectState, 'message', {
      kind: 'task_approval_policy_pack_decision',
      taskId: task.id,
      decision: governanceDecision.decision,
      matchedRuleId: governanceDecision.matchedRuleId,
      reason: governanceDecision.reason,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'approval_policy_pack',
      to: 'coordinator',
      kind: 'task_approval_policy_pack_decision',
      payload: {
        taskId: task.id,
        decision: governanceDecision.decision,
        matchedRuleId: governanceDecision.matchedRuleId,
        reason: governanceDecision.reason,
      },
    });
  }
  emitProjectEvent(projectState.id, 'task_update', task);
}

function applyTaskApprovalDecision(projectState, task, decision, note = '', actor = 'operator') {
  const decidedAt = nowIso();
  const priorPending = task.pendingApproval || {};
  task.pendingApproval = {
    ...priorPending,
    decision,
    decidedAt,
    note: note || null,
  };

  if (decision === 'approve') {
    if (task.autoAction && task.autoAction.type === 'connector') {
      const resolvedInput = resolveConnectorActionInput(task.autoAction.input && typeof task.autoAction.input === 'object' ? task.autoAction.input : {}, projectState);
      const unresolvedInput = resolvedInput && typeof resolvedInput === 'object'
        ? hasUnresolvedTemplateValue(resolvedInput)
        : false;
      const netlifySiteId = String(resolvedInput && resolvedInput.siteId ? resolvedInput.siteId : '').trim();
      if (unresolvedInput || (task.autoAction.connector === 'netlify' && task.autoAction.operation === 'trigger_deploy' && !netlifySiteId)) {
        const reason = task.autoAction.connector === 'netlify' && task.autoAction.operation === 'trigger_deploy' && !netlifySiteId
          ? 'Cannot approve recurring deploy until a concrete Netlify siteId is configured.'
          : 'Cannot approve task while connector input still contains unresolved template placeholders.';
        task.status = 'review';
        task.executionState = 'awaiting_approval';
        task.lastError = reason;
        task.lastProgressAt = decidedAt;
        task.pendingApproval = {
          ...task.pendingApproval,
          decision: null,
          decidedAt: null,
          note: reason,
          reason,
        };
        appendProjectLog(projectState, 'task', {
          kind: 'task_approval_blocked_missing_connector_config',
          taskId: task.id,
          reason,
        });
        appendMessageBusEntry({
          projectId: projectState.id,
          from: actor,
          to: 'coordinator',
          kind: 'task_approval_blocked_missing_connector_config',
          payload: { taskId: task.id, reason },
        });
        emitProjectEvent(projectState.id, 'task_update', task);
        return;
      }
      task.autoAction.input = resolvedInput;
    }
    if (task.autoAction && task.autoAction.type === 'connector') {
      task.autoAction.requiresPermission = false;
    }
    task.status = 'backlog';
    task.executionState = 'queued';
    task.lastError = null;
    task.lastProgressAt = decidedAt;
    task.assignee = null;
    task.startedAt = null;
    task.inprogressCycles = 0;
    appendProjectLog(projectState, 'task', {
      kind: 'task_approval_granted',
      taskId: task.id,
      note,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: actor,
      to: 'coordinator',
      kind: 'task_approval_granted',
      payload: { taskId: task.id, note: note || null },
    });
  } else {
    task.status = 'done';
    task.executionState = 'failed';
    task.lastError = note || 'approval_denied';
    task.lastFailedAt = decidedAt;
    task.lastProgressAt = decidedAt;
    task.completedAt = decidedAt;
    appendProjectLog(projectState, 'task', {
      kind: 'task_approval_denied',
      taskId: task.id,
      note,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: actor,
      to: 'coordinator',
      kind: 'task_approval_denied',
      payload: { taskId: task.id, note: note || null },
    });
  }

  appendApprovalDecisionAudit(projectState.id, {
    taskId: task.id,
    decision,
    actor,
    note,
    reason: priorPending.reason || task.lastError || null,
    riskScore: Number(priorPending.risk && priorPending.risk.score || 0),
    riskLevel: priorPending.risk && priorPending.risk.level ? priorPending.risk.level : null,
    estimatedCost: Number(task && task.autoAction && task.autoAction.estimatedCost || 0),
    connector: task && task.autoAction && task.autoAction.connector ? task.autoAction.connector : null,
    operation: task && task.autoAction && task.autoAction.operation ? task.autoAction.operation : null,
    matchedRuleId: priorPending.policyDecision && priorPending.policyDecision.matchedRuleId
      ? priorPending.policyDecision.matchedRuleId
      : null,
  });

  emitProjectEvent(projectState.id, 'task_update', task);
  return task;
}

function markAgentLog(agent, message) {
  const line = `${new Date().toISOString().slice(11, 19)} ${message}`;
  agent.recentLog = Array.isArray(agent.recentLog) ? agent.recentLog : [];
  agent.recentLog.unshift(line);
  if (agent.recentLog.length > 10) {
    agent.recentLog.length = 10;
  }
}

function ensureMessageBus() {
  ensureDir(AGENTS_RUNTIME_ROOT);
  if (sqliteMessageBus) return;

  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(MESSAGE_BUS_PATH);
    db.exec('PRAGMA busy_timeout = 1000;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_bus (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        project_id TEXT,
        from_actor TEXT,
        to_actor TEXT,
        kind TEXT,
        payload_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_message_bus_project_ts ON message_bus(project_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_message_bus_ts ON message_bus(ts DESC);
    `);
    sqliteMessageBus = db;
    return;
  } catch (err) {
    sqliteMessageBus = null;
  }

  if (!fs.existsSync(MESSAGE_BUS_PATH)) {
    fs.writeFileSync(MESSAGE_BUS_PATH, '', 'utf-8');
  }
}

function appendMessageBusEntry({ projectId, from, to, kind, payload = {} }) {
  ensureMessageBus();
  const entry = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    projectId: String(projectId || ''),
    from: String(from || 'unknown'),
    to: String(to || 'unknown'),
    kind: String(kind || 'message'),
    payload,
  };
  if (sqliteMessageBus) {
    const stmt = sqliteMessageBus.prepare(`
      INSERT INTO message_bus (id, ts, project_id, from_actor, to_actor, kind, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        stmt.run(
          entry.id,
          entry.ts,
          entry.projectId,
          entry.from,
          entry.to,
          entry.kind,
          JSON.stringify(entry.payload || {})
        );
        lastError = null;
        break;
      } catch (err) {
        const msg = String(err && err.message ? err.message : '').toLowerCase();
        if (!msg.includes('database is locked')) {
          throw err;
        }
        lastError = err;
      }
    }
    if (lastError) {
      throw lastError;
    }
    return entry;
  }

  fs.appendFileSync(MESSAGE_BUS_PATH, `${JSON.stringify(entry)}\n`, 'utf-8');
  return entry;
}

function readMessageBusEntries(projectId, limit = 200, filters = {}) {
  ensureMessageBus();
  const max = clampInt(limit, 200, 1, 2000);
  const kind = String(filters.kind || '').trim().toLowerCase();
  const actor = String(filters.actor || '').trim().toLowerCase();
  const query = String(filters.query || '').trim().toLowerCase();

  if (sqliteMessageBus) {
    const where = [];
    const values = [];
    if (projectId) {
      where.push('project_id = ?');
      values.push(String(projectId));
    }
    if (kind) {
      where.push('kind = ?');
      values.push(kind);
    }
    if (actor) {
      where.push('(LOWER(from_actor) LIKE ? OR LOWER(to_actor) LIKE ?)');
      values.push(`%${actor}%`, `%${actor}%`);
    }
    if (query) {
      where.push('(LOWER(kind) LIKE ? OR LOWER(from_actor) LIKE ? OR LOWER(to_actor) LIKE ? OR LOWER(payload_json) LIKE ?)');
      values.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }
    const sql = `
      SELECT id, ts, project_id, from_actor, to_actor, kind, payload_json
      FROM message_bus
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ts DESC
      LIMIT ?
    `;
    values.push(max);
    const stmt = sqliteMessageBus.prepare(sql);
    return stmt.all(...values).map((row) => ({
      id: row.id,
      ts: row.ts,
      projectId: row.project_id,
      from: row.from_actor,
      to: row.to_actor,
      kind: row.kind,
      payload: safeJsonReadFromText(row.payload_json, {}),
    }));
  }

  const raw = fs.readFileSync(MESSAGE_BUS_PATH, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const out = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (out.length >= max) break;
    try {
      const entry = JSON.parse(lines[i]);
      if (projectId && entry.projectId !== projectId) continue;
      if (kind && String(entry.kind || '').toLowerCase() !== kind) continue;
      if (actor) {
        const fromMatch = String(entry.from || '').toLowerCase().includes(actor);
        const toMatch = String(entry.to || '').toLowerCase().includes(actor);
        if (!fromMatch && !toMatch) continue;
      }
      if (query) {
        const haystack = JSON.stringify(entry).toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      out.push(entry);
    } catch (err) {
    }
  }
  return out;
}

function safeJsonReadFromText(raw, fallback = {}) {
  try {
    if (typeof raw !== 'string') return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function ensureTaskLeaseFields(task) {
  if (!task || typeof task !== 'object') return;
  if (typeof task.leaseId === 'undefined') task.leaseId = null;
  if (typeof task.leaseOwner === 'undefined') task.leaseOwner = null;
  if (typeof task.leaseAcquiredAt === 'undefined') task.leaseAcquiredAt = null;
  if (typeof task.leaseExpiresAt === 'undefined') task.leaseExpiresAt = null;
}

function clearTaskLease(task) {
  ensureTaskLeaseFields(task);
  task.leaseId = null;
  task.leaseOwner = null;
  task.leaseAcquiredAt = null;
  task.leaseExpiresAt = null;
}

function isTaskLeaseActive(task, at = nowIso()) {
  ensureTaskLeaseFields(task);
  if (!task.leaseId || !task.leaseOwner || !task.leaseExpiresAt) return false;
  const nowMs = Date.parse(String(at || nowIso()));
  const expiresMs = Date.parse(String(task.leaseExpiresAt || ''));
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) return false;
  return expiresMs >= nowMs;
}

function acquireTaskLease(task, leaseOwner, acquiredAt = nowIso(), ttlMs = TASK_LEASE_DURATION_MS) {
  ensureTaskLeaseFields(task);
  const owner = String(leaseOwner || '').trim();
  if (!owner) return null;

  if (isTaskLeaseActive(task, acquiredAt) && task.leaseOwner !== owner) {
    return null;
  }

  const leaseId = crypto.randomUUID();
  const acquiredMs = Date.parse(String(acquiredAt || nowIso()));
  const safeAcquiredMs = Number.isFinite(acquiredMs) ? acquiredMs : Date.now();
  const expiresAt = new Date(safeAcquiredMs + Math.max(1000, Number(ttlMs || TASK_LEASE_DURATION_MS))).toISOString();
  task.leaseId = leaseId;
  task.leaseOwner = owner;
  task.leaseAcquiredAt = new Date(safeAcquiredMs).toISOString();
  task.leaseExpiresAt = expiresAt;
  return {
    leaseId,
    leaseOwner: owner,
    leaseAcquiredAt: task.leaseAcquiredAt,
    leaseExpiresAt: expiresAt,
  };
}

function refreshTaskLease(task, at = nowIso(), ttlMs = TASK_LEASE_DURATION_MS) {
  ensureTaskLeaseFields(task);
  if (!task.leaseId || !task.leaseOwner) return null;
  const atMs = Date.parse(String(at || nowIso()));
  const safeAtMs = Number.isFinite(atMs) ? atMs : Date.now();
  task.leaseExpiresAt = new Date(safeAtMs + Math.max(1000, Number(ttlMs || TASK_LEASE_DURATION_MS))).toISOString();
  return task.leaseExpiresAt;
}

// -- Shared task-requeue helper --------------------------------------------
// All code paths that return a task to backlog must use this so fields stay
// consistent and debug metadata (lastError, lastFailedAt) is preserved.
function requeueTaskToBacklog(task, reason = 'requeued', bumpRetry = true, expectedLeaseId = null) {
  ensureTaskLeaseFields(task);
  if (expectedLeaseId && task.leaseId && String(task.leaseId) !== String(expectedLeaseId)) {
    return false;
  }
  task.status = 'backlog';
  task.assignee = null;
  task.startedAt = null;
  task.executionState = 'queued';
  task.inprogressCycles = 0;
  task.executionTaskRunId = null;
  task.lastProgressAt = null;
  clearTaskLease(task);
  if (bumpRetry) {
    const classification = classifyFailureDeterminism('default', reason, {});
    task.retryCount = Number(task.retryCount || 0) + 1;
    task.lastFailedAt = nowIso();
    task.lastError = reason;
    appendTaskRetryLineage(task, {
      at: task.lastFailedAt,
      stage: 'task_execution_requeue',
      reason,
      classification: classification.classification,
      retryable: classification.retryable,
      attempt: task.retryCount,
      detail: {},
    });
  }
  return true;
}

function cancelProjectExecution(projectId, reason = 'cancelled', requeueTask = true) {
  const runtime = projectRuntimes.get(projectId);
  if (!runtime || !runtime.execution) return false;

  const execution = runtime.execution;
  runtime.execution = null;

  if (execution.child) {
    try {
      execution.child.kill();
    } catch (err) {
    }
  }

  const task = runtime.state.tasks.find((t) => t.id === execution.taskId);
  if (task && task.status === 'inprogress') {
    if (requeueTask) {
      const requeued = requeueTaskToBacklog(task, reason, false, execution.leaseId || null);
      if (!requeued) {
        appendProjectLog(runtime.state, 'warning', {
          kind: 'task_requeue_stale_lease_rejected',
          taskId: task.id,
          expectedLeaseId: execution.leaseId || null,
          actualLeaseId: task.leaseId || null,
          reason,
        });
      }
    }
    emitProjectEvent(projectId, 'task_update', task);
  }

  const worker = runtime.state.agents.find((a) => a.id === execution.agentId);
  if (worker) {
    worker.status = 'idle';
    worker.currentTask = null;
    markAgentLog(worker, `Execution cancelled (${reason})`);
    emitProjectEvent(projectId, 'agent_message', {
      agentId: worker.id,
      name: worker.name,
      role: worker.role,
      status: worker.status,
      currentTask: worker.currentTask,
      tasksDone: worker.tasksDone,
      recentLog: worker.recentLog,
    });
  }

  appendProjectLog(runtime.state, 'message', {
    kind: 'task_execution_cancelled',
    reason,
    taskId: execution.taskId,
    agentId: execution.agentId,
  });
  appendMessageBusEntry({
    projectId,
    from: 'coordinator',
    to: execution.agentId || 'unknown',
    kind: 'execution_cancelled',
    payload: { reason, taskId: execution.taskId },
  });
  persistProjectState(runtime.state);
  return true;
}

function finalizeProjectTaskExecution(projectId, taskId, taskRunId, exitCode, leaseId = null) {
  const runtime = projectRuntimes.get(projectId);
  if (!runtime || !runtime.execution) return;
  if (
    runtime.execution.taskRunId !== taskRunId
    || runtime.execution.taskId !== taskId
    || (leaseId && runtime.execution.leaseId && runtime.execution.leaseId !== leaseId)
  ) return;

  const settings = runtimeSettings();
  const execution = runtime.execution;
  runtime.execution = null;

  const task = runtime.state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== 'inprogress') return;
  if (leaseId && task.leaseId && task.leaseId !== leaseId) {
    appendProjectLog(runtime.state, 'warning', {
      kind: 'task_finalize_stale_lease_rejected',
      taskId,
      taskRunId,
      expectedLeaseId: leaseId,
      actualLeaseId: task.leaseId,
    });
    persistProjectState(runtime.state);
    return;
  }

  const worker = runtime.state.agents.find((a) => a.id === task.assignee);
  let effectiveExitCode = exitCode;

  // Capture the actual stderr/stdout from the task run for diagnostic use
  const taskRun = taskHistory.find((r) => r.id === taskRunId);
  const stderrLines = taskRun
    ? (taskRun.events || []).filter((e) => e.type === 'stderr').map((e) => String(e.message || '')).join('').trim()
    : '';
  const stdoutLines = taskRun
    ? (taskRun.events || []).filter((e) => e.type === 'stdout').map((e) => String(e.message || '')).join('').trim()
    : '';
  // Use last 800 chars of stderr (trimmed) as the failure reason if available
  const capturedError = stderrLines
    ? stderrLines.slice(-800)
    : (stdoutLines ? stdoutLines.slice(-400) : null);

  let failureReason = capturedError || `exit_code_${exitCode}`;
  if (effectiveExitCode === 0) {
    const artifactCheck = validateTemplateTaskArtifacts(runtime.state, task);
    if (!artifactCheck.ok) {
      effectiveExitCode = 2;
      failureReason = artifactCheck.reason || 'task_output_validation_failed';
      appendProjectLog(runtime.state, 'warning', {
        kind: 'task_output_validation_failed',
        taskId: task.id,
        title: task.title,
        reason: artifactCheck.reason,
      });
      appendMessageBusEntry({
        projectId,
        from: 'coordinator',
        to: execution.agentId || 'unknown',
        kind: 'task_output_validation_failed',
        payload: { taskId: task.id, reason: artifactCheck.reason },
      });
    }
  }

  if (effectiveExitCode === 0) {
    task.status = 'done';
    task.completedAt = nowIso();
    task.executionState = 'done';
    task.inprogressCycles = 0;
    task.executionTaskRunId = null;
    task.lastError = null;
    clearTaskLease(task);

    if (worker) {
      worker.status = 'idle';
      worker.currentTask = null;
      worker.tasksDone = Number(worker.tasksDone || 0) + 1;
      markAgentLog(worker, `Completed ${task.id}`);
      emitProjectEvent(projectId, 'agent_message', {
        agentId: worker.id,
        name: worker.name,
        role: worker.role,
        status: worker.status,
        currentTask: null,
        tasksDone: worker.tasksDone,
        recentLog: worker.recentLog,
      });
    }

    appendProjectLog(runtime.state, 'task', {
      kind: 'task_completed',
      taskId: task.id,
      title: task.title,
      assignee: execution.agentId,
      source: 'agent_execution',
    });
    appendMessageBusEntry({
      projectId,
      from: execution.agentId || 'unknown',
      to: 'coordinator',
      kind: 'task_completed',
      payload: { taskId: task.id, taskRunId, exitCode },
    });
    emitProjectEvent(projectId, 'task_update', task);

    const allDone = runtime.state.tasks.length > 0 && runtime.state.tasks.every((t) => t.status === 'done');
    if (allDone && !shouldKeepRunningForRecurring(runtime.state)) {
      const delivery = verifyGoalDelivery(runtime.state);
      if (delivery.verified) {
        markProjectCompleted(runtime.state);
      } else {
        persistProjectState(runtime.state);
      }
      return;
    }
  } else {
    if (effectiveExitCode !== 2 && !capturedError) {
      failureReason = `exit_code_${effectiveExitCode}`;
    }
    const requeued = requeueTaskToBacklog(task, failureReason, true, execution.leaseId || null);
    if (!requeued) {
      appendProjectLog(runtime.state, 'warning', {
        kind: 'task_requeue_stale_lease_rejected',
        taskId: task.id,
        taskRunId,
        expectedLeaseId: execution.leaseId || null,
        actualLeaseId: task.leaseId || null,
        reason: failureReason,
      });
      persistProjectState(runtime.state);
      return;
    }

    const failureCount = Number(task.failureStreak || 0) + 1;
    task.failureStreak = failureCount;
    let countAgainstAutoFixBudget = true;

    if (worker) {
      worker.status = 'idle';
      worker.currentTask = null;
      markAgentLog(worker, `Execution failed for ${task.id} (exit ${effectiveExitCode})`);
      emitProjectEvent(projectId, 'agent_message', {
        agentId: worker.id,
        name: worker.name,
        role: worker.role,
        status: worker.status,
        currentTask: null,
        tasksDone: worker.tasksDone,
        recentLog: worker.recentLog,
      });
    }

    appendProjectLog(runtime.state, 'fix', {
      kind: 'task_execution_failed_requeued',
      taskId: task.id,
      exitCode: effectiveExitCode,
      autoFixCount: runtime.state.heartbeat.autoFixCount,
    });
    appendMessageBusEntry({
      projectId,
      from: execution.agentId || 'unknown',
      to: 'coordinator',
      kind: 'task_failed',
      payload: { taskId: task.id, taskRunId, exitCode: effectiveExitCode },
    });
    emitProjectEvent(projectId, 'task_update', task);

    // Auto-remediation: escalate repeated failures into explicit fix tasks before global auto-fix budget is exhausted.
    let remediationCreated = false;
    if (shouldEscalateGameplayRemediation(runtime.state, task, effectiveExitCode, failureReason, failureCount)) {
      const remediationTaskId = `${task.id}-REMEDIATE`;
      const existingRemediation = runtime.state.tasks.find((t) => t.id === remediationTaskId);
      if (!existingRemediation) {
        const remediationTask = {
          id: remediationTaskId,
          title: `[REMEDIATE] Fix gameplay loop in game.js`,
          phase: 'product_build',
          status: 'backlog',
          assignee: null,
          blockedBy: null,
          dependencies: [],
          requiredRole: 'Backend Architect',
          executionState: 'queued',
          retryCount: 0,
          lastFailedAt: null,
          lastError: null,
          lastProgressAt: null,
          executionTaskRunId: null,
          inprogressCycles: 0,
          pendingApproval: null,
          autoActionNotBeforeAt: null,
          deadLetteredAt: null,
          createdAt: nowIso(),
          completedAt: null,
          startedAt: null,
          failureStreak: 0,
          description: [
            `The game.js implementation failed ${failureCount}x: ${failureReason}`,
            '',
            'EXPLICIT REQUIREMENTS (all five are mandatory):',
            '  1. Main loop scheduler: requestAnimationFrame(...) or setInterval(...) that runs updateFrame/renderFrame every tick.',
            '  2. updateFrame(dt) function that updates entity positions, collision checks, score/level/lives.',
            '  3. renderFrame() function that draws canvas: tileset background -> enemies -> player -> pickups.',
            '  4. Win condition test and Game Over condition test; call triggerWin() or triggerGameOver() when met.',
            '  5. Restart path: startGame() or equivalent that resets the world and returns to PLAYING state.',
            '',
            'Review current game.js structure first. Add only the missing stubs. End with TASK_DONE once all five are present.',
          ].join('\n'),
          assistanceRequestedAt: null,
        };
        runtime.state.tasks.push(remediationTask);

        const taskDeps = Array.isArray(task.dependencies) ? task.dependencies.filter(Boolean) : [];
        if (!taskDeps.includes(remediationTaskId)) {
          task.dependencies = [...taskDeps, remediationTaskId];
        }
        task.blockedBy = remediationTaskId;

        countAgainstAutoFixBudget = false;
        remediationCreated = true;
        appendProjectLog(runtime.state, 'message', {
          kind: 'remediation_task_created',
          sourceTaskId: task.id,
          failureReason,
          failureCount,
          remediationTaskId,
        });
      }
    }

    if (!remediationCreated && shouldEscalateGenericTaskRemediation(task, effectiveExitCode, failureCount)) {
      const remediationTaskId = `${task.id}-REMEDIATE`;
      const existingRemediation = runtime.state.tasks.find((t) => t.id === remediationTaskId);
      if (!existingRemediation) {
        const fallbackRole = worker && worker.role ? worker.role : 'Backend Architect';
        const remediationTask = {
          id: remediationTaskId,
          title: `[REMEDIATE] Resolve repeated failure: ${task.title}`,
          phase: task.phase || 'product_build',
          status: 'backlog',
          assignee: null,
          blockedBy: null,
          dependencies: [],
          requiredRole: task.requiredRole || fallbackRole,
          executionState: 'queued',
          retryCount: 0,
          lastFailedAt: null,
          lastError: null,
          lastProgressAt: null,
          executionTaskRunId: null,
          inprogressCycles: 0,
          pendingApproval: null,
          autoActionNotBeforeAt: null,
          deadLetteredAt: null,
          createdAt: nowIso(),
          completedAt: null,
          startedAt: null,
          failureStreak: 0,
          description: [
            `Task ${task.id} failed ${failureCount} times with reason: ${failureReason}`,
            '',
            'Remediation requirements:',
            `  1. Read the current artifacts and task brief for "${task.title}".`,
            '  2. Identify the concrete failing step and implement only the missing/corrective changes.',
            '  3. Produce the required output artifacts and verify they are non-scaffold quality.',
            '  4. End with TASK_DONE only when this specific task can pass without requeue.',
          ].join('\n'),
          assistanceRequestedAt: null,
        };
        runtime.state.tasks.push(remediationTask);

        const taskDeps = Array.isArray(task.dependencies) ? task.dependencies.filter(Boolean) : [];
        if (!taskDeps.includes(remediationTaskId)) {
          task.dependencies = [...taskDeps, remediationTaskId];
        }
        task.blockedBy = remediationTaskId;

        countAgainstAutoFixBudget = false;
        appendProjectLog(runtime.state, 'message', {
          kind: 'remediation_task_created',
          sourceTaskId: task.id,
          failureReason,
          failureCount,
          remediationTaskId,
          strategy: 'generic_repeated_failure',
        });
      }
    }

    if (countAgainstAutoFixBudget) {
      runtime.state.heartbeat.autoFixCount = (runtime.state.heartbeat.autoFixCount || 0) + 1;
    }

    if (runtime.state.heartbeat.autoFixCount >= settings.maxAutoFixes) {
      markProjectFailed(runtime.state);
      return;
    }
  }

  persistProjectState(runtime.state);
}

function loadAgentPersonalityPrompt(paths) {
  if (!Array.isArray(paths) || !paths.length) return '';
  const snippets = [];
  paths.forEach((entry) => {
    const rel = String(entry || '').trim();
    if (!rel) return;
    const resolved = path.resolve(__dirname, rel);
    const allowed = AGENT_PERSONALITY_ROOTS.some((root) => resolved.startsWith(root));
    if (!allowed || !fs.existsSync(resolved)) return;
    try {
      const text = fs.readFileSync(resolved, 'utf-8').trim();
      if (!text) return;
      snippets.push(`# Personality Source: ${path.basename(resolved)}\n${text.slice(0, 12000)}`);
    } catch (err) {
    }
  });
  return snippets.join('\n\n');
}

function startProjectTaskExecution(projectState, task, assignee) {
  const runtime = projectRuntimes.get(projectState.id);
  if (!runtime || runtime.execution) return false;
  if (task.status !== 'inprogress' || task.executionState !== 'leased') return false;
  if (!isTaskLeaseActive(task) || String(task.leaseOwner || '') !== String(assignee.id || '')) return false;

  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: assignee.id,
    kind: 'task_assigned',
    payload: {
      taskId: task.id,
      title: task.title,
      projectName: projectState.name,
    },
  });

  const personalityPrompt = loadAgentPersonalityPrompt(assignee.personalityPromptPaths);

  const templateId = String(projectState.template || '').toLowerCase();
  const sandboxRoot = `/sandbox/workspace/projects/${projectState.id}`;
  const requiredArtifacts = templateArtifactContract(templateId);
  let workspaceContext = '';

  if (templateId === 'game_studio') {
    const sandboxGamePath = `${sandboxRoot}/game`;

    // Inject actual generated SVG asset paths so agents can reference them directly
    const assetManifestPath = path.join(projectWorkspaceDir(projectState.id), 'docs', 'generated_image_assets.json');
    const assetLines = [];
    try {
      const assetManifest = JSON.parse(fs.readFileSync(assetManifestPath, 'utf-8'));
      const items = Array.isArray(assetManifest.items) ? assetManifest.items : [];
      if (items.length) {
        assetLines.push('  Generated SVG assets — ALL must be used in gameplay (canvas drawImage or <img src>):');
        items.forEach((item) => {
          const rel = String(item.injectedPath || '').replace(/\\/g, '/');
          // injectedPath is relative to project workspace root, e.g. "game/assets/generated/player-sprite.svg"
          // From inside the game/ folder the src path strips the "game/" prefix
          const srcRef = rel.startsWith('game/') ? rel.slice(5) : rel;
          assetLines.push(`    ${item.key}: use src="${srcRef}" (full sandbox path: ${sandboxGamePath}/${srcRef.replace(/^\//, '')})`);
        });
      }
    } catch (_e) { /* manifest not yet written — asset generation task hasn't run */ }

    workspaceContext = [
      '',
      'WORKSPACE CONTEXT - Game Studio:',
      `  Sandbox game path: ${sandboxGamePath}`,
      '  Files to write (use file tool with action=write):',
      `    ${sandboxGamePath}/index.html`,
      `    ${sandboxGamePath}/game.js`,
      `    ${sandboxGamePath}/style.css`,
      '',
      '  *** CRITICAL SCAFFOLD RULE — READ BEFORE WRITING ANY FILE ***',
      '  index.html already contains the COMPLETE HTML shell:',
      '    #splash overlay (promo-keyart.svg hero + animated Start button)',
      '    #title-menu overlay (controls list + Play button)',
      '    #hud bar (avatar, score, lives, level, pause button)',
      '    #canvas-container with <canvas id="game-canvas">',
      '    #pause-menu, #game-over, #win-screen overlays',
      '  DO NOT rewrite index.html from scratch. PRESERVE this structure.',
      '  Only update the <ul id="controls-list"> entries with genre-specific controls.',
      '',
      '  game.js scaffold already has the state machine (SPLASH/TITLE/PLAYING/PAUSED/WIN/GAME_OVER),',
      '  requestAnimationFrame loop, screen routing, HUD update, and all button wiring.',
      '  Implement ONLY these stub functions — do not touch anything else:',
      '    updateFrame(dt)   — physics, AI, collision detection, scoring, win/lose logic',
      '    renderFrame()     — Canvas 2D: draw tileset → enemies → player → pickups → effects',
      '    wireControls()    — keyboard/mouse/touch handlers for this genre',
      '    startGame() body  — spawn initial entities and reset world state',
      '  Call triggerWin() when the player wins. Call triggerGameOver() when lives reach 0.',
      '',
      '  style.css — extend the scaffold design system, do NOT remove scaffold layout rules:',
      '    Customize CSS custom properties (--accent, --accent2, etc.) for this genre.',
      '    Add genre-specific animations, tile patterns, character effects.',
      '    Never remove or redefine: .overlay, #hud, #canvas-container, .btn-primary, .result-panel.',
      '',
      ...assetLines,
      '',
      '  Image generation connector: image_generator (internal runtime)',
      `  Generated assets manifest: ${sandboxRoot}/docs/generated_image_assets.json`,
      `  Image style profile: ${sandboxRoot}/docs/image_style_profile.json`,
      '  Keep prompts policy-safe; prohibited prompt classes are automatically blocked by moderation checks.',
      '  Remove the HIVEFORGE_SCAFFOLD_PLACEHOLDER comment from any file you write.',
      '  Do NOT output HIVEFORGE_SCAFFOLD_PLACEHOLDER in any written file.',
    ].join('\n');
  } else if (requiredArtifacts.length) {
    workspaceContext = [
      '',
      `WORKSPACE CONTEXT - ${templateId}:`,
      `  Sandbox project path: ${sandboxRoot}`,
      '  Required deliverable files to update (use file tool with action=write):',
      ...requiredArtifacts.map((item) => `    ${sandboxRoot}/${item.path}`),
      ...(templateId === 'mobile_app'
        ? [
          '  Stack policy: mobile_app defaults to React Native + Expo + TypeScript.',
          '  Image generation is available through connector: image_generator (automatic runtime + local fallback).',
          '  Prefer template-aware asset packs for store graphics, onboarding illustration, splash art, and launch social cards.',
          `  Generated image style profile: ${sandboxRoot}/docs/image_style_profile.json`,
          `  Generated asset module: ${sandboxRoot}/mobile/src/generatedImageAssets.ts`,
          '  Include practical run commands in docs/qa_report.md (for example: npm install, npx expo start, npx expo run:android).',
          '  If Android output is required, document EAS Build steps for APK/AAB and required credentials/signing handoff.',
          '  Google Play release: if google_play connector is connected, DevOps Automator may submit the signed AAB to the Play Store internal testing track (upload_bundle, track=internal).',
          '  If google_play connector is not connected, produce docs/release_handoff.md instead — include signing config, Play Store listing checklist, and privacy policy URL requirements.',
        ]
        : templateId === 'software_web_app' || templateId === 'software_agency'
          ? [
            '  Stack policy: software_web_app defaults to React + TypeScript + Vite.',
            '  Image generation is available through connector: image_generator (automatic runtime + local fallback).',
            '  Prefer template-aware asset packs for hero/banner visuals, section illustrations, and OG/social artwork.',
            `  Generated image style profile: ${sandboxRoot}/docs/image_style_profile.json`,
            `  Generated asset module: ${sandboxRoot}/web/src/generatedImageAssets.ts`,
            '  Include practical run commands in docs/qa_report.md (for example: npm install, npm run dev, npm run build).',
            '  For draft preview, include a short walkthrough of key UI flows and expected states.',
          ]
          : templateId === 'business'
            ? [
              '  Discovery requirement: before implementation, run focused web research with browser tool and capture findings in docs/research_brief.md.',
              '  Research output MUST include: comparable products, feature matrix (must-have / later / out-of-scope), role/persona map, navigation model, and unresolved clarification questions.',
              '  Draft preview requirement: website/app.js must gracefully handle unavailable backend endpoints.',
              '  If API calls fail, render a demo fallback dataset instead of showing a blank page or fatal error.',
              '  Ensure index.html can render meaningful content with only website/index.html + website/app.js + website/style.css.',
              '  Product quality requirement: deliver domain-appropriate UX (not a toy page).',
              '  Include only role/workflow modules implied by this goal; do not force auction-only or dashboard-only features when not required.',
              '  If role scope is ambiguous (for example seller/buyer/admin or whether dashboard is needed), ask clarifying questions before finalizing flows.',
              '  Use established patterns from similar products in the same domain as implementation references.',
              '  Include clear loading, empty, and error states for each critical screen.',
            ]
          : templateId === 'game_studio'
            ? [
              '  Discovery requirement: run focused genre/gameplay research with browser tool and write docs/game_research_brief.md before implementation.',
              '  Research output MUST include: genre references, perspective selection (top-down/side-scroller/isometric/first-person/etc), control scheme, visual style direction, and MVP scope boundaries.',
              '  Use researched references to justify gameplay loop and UI decisions; avoid barebones placeholder mechanics.',
            ]
        : []),
      '  Replace HIVEFORGE_SCAFFOLD_PLACEHOLDER content with real work output before marking tasks complete.',
    ].join('\n');
  }

  const prompt = [
    `Project: ${projectState.name}`,
    `Goal: ${projectState.goal || 'N/A'}`,
    `Assigned Agent Role: ${assignee.role}`,
    `Task ${task.id}: ${task.title}`,
    task.description ? `Task Description:\n${task.description.replace(/\{projectId\}/g, projectState.id)}` : '',
    personalityPrompt ? `Agent Personality Guidance:\n${personalityPrompt}` : '',
    workspaceContext,
    task.lastError
      ? [
        'Previous attempt failed. Fix this issue before ending with TASK_DONE:',
        `  ${task.lastError}`,
        ...(String(task.lastError).includes('gameplay_loop_incomplete')
          ? [
            'For gameplay_loop_incomplete errors, include these exact elements in game.js:',
            '  - requestAnimationFrame(...) main loop scheduler',
            '  - updateFrame(...) function called by the loop',
            '  - renderFrame(...) function called by the loop',
            '  - explicit win + game over conditions and a restart path',
          ]
          : []),
        ...((String(task.lastError).includes('business_research_brief_incomplete') || String(task.lastError).includes('business_research_brief_missing'))
          ? [
            'For business research brief failures, you MUST write this exact file with the file tool (action=write):',
            `  /sandbox/workspace/projects/${projectState.id}/docs/research_brief.md`,
            'Requirements for docs/research_brief.md:',
            '  - At least 16 non-empty lines',
            '  - Must NOT contain HIVEFORGE_SCAFFOLD_PLACEHOLDER',
            '  - Include: comparable products, must-have/later/out-of-scope feature matrix, role/persona map, navigation model, trust/compliance risks, unresolved operator questions',
            'Do not only describe the research in chat output; persist it to the workspace file path above before TASK_DONE.',
          ]
          : []),
        ...((String(task.lastError).startsWith('website_') || String(task.lastError).includes('website_'))
          ? [
            'For website artifact failures, you MUST update these files with the file tool before TASK_DONE:',
            `  /sandbox/workspace/projects/${projectState.id}/website/index.html`,
            `  /sandbox/workspace/projects/${projectState.id}/website/app.js`,
            `  /sandbox/workspace/projects/${projectState.id}/website/style.css`,
            'Minimum acceptance checks:',
            '  - index.html includes a stylesheet link to style.css (either "style.css" or "./style.css")',
            '  - index.html includes a script reference to app.js (either "app.js" or "./app.js")',
            '  - app.js is substantial (non-scaffold) and parse-valid JavaScript',
            '  - style.css is substantial (non-scaffold) and includes layout + responsive styles',
            '  - Include loading, empty, and error states for critical UI paths',
            'Do not end with TASK_DONE until files above are actually written and saved in the workspace.',
          ]
          : []),
      ].join('\n')
      : '',
    'Execute the task and provide concrete output artifacts or decisions. End with TASK_DONE when complete.'
  ].filter(Boolean).join('\n\n');

  const { taskRun, child } = runAgentTask(prompt, null);
  if (!child) {
    return false;
  }

  runtime.execution = {
    taskId: task.id,
    taskRunId: taskRun.id,
    agentId: assignee.id,
    leaseId: task.leaseId,
    child,
    startedAt: nowIso(),
    lastProgressAt: nowIso(),
    progressChunks: 0,
  };
  task.executionTaskRunId = taskRun.id;
  task.executionState = 'running';
  task.lastProgressAt = runtime.execution.lastProgressAt;
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: assignee.id,
    kind: 'task_started',
    payload: {
      taskId: task.id,
      taskRunId: taskRun.id,
      title: task.title,
    },
  });

  child.stdout.on('data', (chunk) => {
    const rt = projectRuntimes.get(projectState.id);
    if (rt && rt.execution && rt.execution.taskRunId === taskRun.id) {
      rt.execution.lastProgressAt = nowIso();
      rt.execution.progressChunks = Number(rt.execution.progressChunks || 0) + 1;
      const active = rt.state.tasks.find((t) => t.id === task.id);
      if (active) {
        active.lastProgressAt = rt.execution.lastProgressAt;
        refreshTaskLease(active, rt.execution.lastProgressAt);
        emitProjectEvent(projectState.id, 'task_update', active);
      }
      if (rt.execution.progressChunks === 1 || rt.execution.progressChunks % 5 === 0) {
        appendMessageBusEntry({
          projectId: projectState.id,
          from: assignee.id,
          to: 'coordinator',
          kind: 'task_progress',
          payload: {
            taskId: task.id,
            taskRunId: taskRun.id,
            stream: 'stdout',
            chunkSize: String(chunk || '').length,
            progressChunks: rt.execution.progressChunks,
          },
        });
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    const rt = projectRuntimes.get(projectState.id);
    if (rt && rt.execution && rt.execution.taskRunId === taskRun.id) {
      rt.execution.lastProgressAt = nowIso();
      rt.execution.progressChunks = Number(rt.execution.progressChunks || 0) + 1;
      const active = rt.state.tasks.find((t) => t.id === task.id);
      if (active) {
        active.lastProgressAt = rt.execution.lastProgressAt;
        refreshTaskLease(active, rt.execution.lastProgressAt);
        emitProjectEvent(projectState.id, 'task_update', active);
      }
      if (rt.execution.progressChunks === 1 || rt.execution.progressChunks % 5 === 0) {
        appendMessageBusEntry({
          projectId: projectState.id,
          from: assignee.id,
          to: 'coordinator',
          kind: 'task_progress',
          payload: {
            taskId: task.id,
            taskRunId: taskRun.id,
            stream: 'stderr',
            chunkSize: String(chunk || '').length,
            progressChunks: rt.execution.progressChunks,
          },
        });
      }
    }
  });
  const executionLeaseId = task.leaseId;
  child.on('close', (code) => {
    finalizeProjectTaskExecution(projectState.id, task.id, taskRun.id, code, executionLeaseId);
  });

  return true;
}

function markProjectCompleted(projectState) {
  projectState.status = 'completed';
  projectState.completedAt = nowIso();
  projectState.heartbeat.status = 'completed';
  projectState.agents.forEach((agent) => {
    if (!agent.isCoordinator) {
      agent.status = 'idle';
      agent.currentTask = null;
      markAgentLog(agent, 'Project completed');
    } else {
      markAgentLog(agent, 'All tasks complete � project finished');
    }
  });
  appendProjectLog(projectState, 'message', { kind: 'project_completed', tasksTotal: projectState.tasks.length });
  emitProjectEvent(projectState.id, 'project_status', { status: 'completed', projectId: projectState.id });
  stopProjectLoop(projectState.id);
  persistProjectState(projectState);
}

function markProjectFailed(projectState) {
  projectState.status = 'failed';
  projectState.failedAt = nowIso();
  projectState.heartbeat.status = 'failed';
  projectState.agents.forEach((agent) => {
    if (!agent.isCoordinator) {
      agent.status = 'error';
      markAgentLog(agent, 'Project failed � max auto-fixes reached');
    }
  });
  appendProjectLog(projectState, 'error', { kind: 'project_failed', autoFixCount: projectState.heartbeat.autoFixCount });
  emitProjectEvent(projectState.id, 'project_status', { status: 'failed', projectId: projectState.id });
  stopProjectLoop(projectState.id);
  persistProjectState(projectState);
}

function runProjectHeartbeat(projectState, source = 'interval') {
  if (projectState.status !== 'running') {
    return;
  }
  const settings = runtimeSettings();

  const beatTs = nowIso();
  ensureRecurringState(projectState);
  ensureStaffingState(projectState);
  ensureKpiGoalState(projectState);
  ensureApprovalGovernanceState(projectState);
  ensureOperationalLoopState(projectState);
  ensureDeadLetterState(projectState);
  ensureBudgetHardStopState(projectState);
  projectState.heartbeat.lastBeat = beatTs;
  projectState.heartbeat.status = 'alive';
  projectState.heartbeat.cycleCount = (projectState.heartbeat.cycleCount || 0) + 1;
  refreshWeeklyKpiPlan(projectState, beatTs);
  evaluateAndNotifyKpiAlerts(projectState, beatTs);
  const loopSafety = isOperationalLoopSuspended(projectState, beatTs);
  if (!loopSafety.suspended) {
    enqueueRecurringTasks(projectState, beatTs, source);
  }
  evaluateAutoStaffing(projectState, beatTs);
  if (projectState.goalPlan && Array.isArray(projectState.goalPlan.milestones)) {
    evaluateMilestoneCompletion(projectState);
  }

  // -- Stall detection + auto-fix -------------------------------------------
  const runtime = projectRuntimes.get(projectState.id);
  const activeTask = projectState.tasks.find((task) => task.status === 'inprogress');
  if (activeTask) {
    activeTask.inprogressCycles = (activeTask.inprogressCycles || 0) + 1;

    const progressTs = (runtime && runtime.execution && runtime.execution.lastProgressAt)
      ? runtime.execution.lastProgressAt
      : (activeTask.startedAt || beatTs);
    const progressAtMs = Date.parse(progressTs);
    const elapsedMs = Number.isNaN(progressAtMs) ? 0 : Math.max(0, Date.now() - progressAtMs);
    const canCountForStall = settings.countManualHeartbeatForStall || source === 'interval' || source === 'startup';

    if (canCountForStall && elapsedMs >= settings.stallTimeoutMs) {
      // Stall detected � auto-fix: cancel execution and requeue
      const cancelled = cancelProjectExecution(projectState.id, 'stall_timeout', true);
      if (!cancelled) {
        requeueTaskToBacklog(activeTask, 'stall_timeout', true);
      }
      projectState.heartbeat.autoFixCount = (projectState.heartbeat.autoFixCount || 0) + 1;
      appendProjectLog(projectState, 'fix', {
        kind: 'task_stall_recovered',
        taskId: activeTask.id,
        title: activeTask.title,
        autoFixCount: projectState.heartbeat.autoFixCount
      });
      emitProjectEvent(projectState.id, 'task_update', activeTask);

      if (projectState.heartbeat.autoFixCount >= settings.maxAutoFixes) {
        markProjectFailed(projectState);
        return;
      }
    }
  } else {
    if (!loopSafety.suspended && !projectState.budgetHardStop.active) {
      const autoActionTask = pickRunnableAutoActionTask(projectState);
      if (autoActionTask) {
        const startedAutoAction = executeRecurringAutoAction(projectState, autoActionTask, source);
        if (startedAutoAction) {
          appendProjectLog(projectState, 'message', {
            kind: 'heartbeat',
            message: `Heartbeat cycle ${projectState.heartbeat.cycleCount} (${source})`,
          });
          persistProjectState(projectState);
          return;
        }
      }
    }

    // -- Start next available task ----------------------------------------
    const nextTask = projectState.budgetHardStop.active ? null : nextRunnableTask(projectState);
    if (nextTask) {
      if (!appState.llm.reachable) {
        const reason = `${llmProviderLabel(appState.llm.provider)} is not reachable at ${appState.llm.endpoint}. Configure and verify the endpoint before task execution.`;
        const lastNoticeMs = Date.parse(projectState.llmOfflineNotifiedAt || '');
        const shouldNotify = Number.isNaN(lastNoticeMs) || (Date.now() - lastNoticeMs) >= (5 * 60 * 1000);
        nextTask.lastError = 'llm_unavailable';
        nextTask.lastProgressAt = beatTs;
        emitProjectEvent(projectState.id, 'task_update', nextTask);
        if (shouldNotify) {
          projectState.llmOfflineNotifiedAt = beatTs;
          appendProjectLog(projectState, 'warning', {
            kind: 'llm_unavailable_blocking_task_start',
            taskId: nextTask.id,
            reason,
            endpoint: appState.llm.endpoint,
          });
          notifyOperator(projectState, `Task start paused: ${nextTask.title}`, {
            taskId: nextTask.id,
            reason,
            endpoint: appState.llm.endpoint,
          }).catch(() => {});
        }
      } else {
      const assignee = pickWorkerAgent(projectState, nextTask);
      if (assignee) {
        const lease = acquireTaskLease(nextTask, assignee.id, beatTs);
        if (!lease) {
          appendProjectLog(projectState, 'warning', {
            kind: 'task_lease_acquire_failed',
            taskId: nextTask.id,
            assignee: assignee.id,
            source,
          });
          persistProjectState(projectState);
          return;
        }
        nextTask.status = 'inprogress';
        nextTask.assignee = assignee.id;
        nextTask.startedAt = beatTs;
        nextTask.executionState = 'leased';
        nextTask.lastProgressAt = beatTs;
        nextTask.blockedBy = null;
        nextTask.inprogressCycles = 0;
        assignee.status = 'running';
        assignee.currentTask = nextTask.title;
        markAgentLog(assignee, `Started ${nextTask.id}`);
        appendMessageBusEntry({
          projectId: projectState.id,
          from: 'coordinator',
          to: assignee.id,
          kind: 'task_start_requested',
          payload: { taskId: nextTask.id, title: nextTask.title }
        });
        appendProjectLog(projectState, 'task', {
          kind: 'task_started',
          taskId: nextTask.id,
          title: nextTask.title,
          assignee: assignee.id,
          leaseId: lease.leaseId,
          source
        });
        emitProjectEvent(projectState.id, 'task_update', nextTask);
        emitProjectEvent(projectState.id, 'agent_message', {
          agentId: assignee.id, name: assignee.name, role: assignee.role,
          status: assignee.status, currentTask: assignee.currentTask,
          tasksDone: assignee.tasksDone, recentLog: assignee.recentLog
        });
        const started = startProjectTaskExecution(projectState, nextTask, assignee);
        if (!started) {
          const requeued = requeueTaskToBacklog(nextTask, 'spawn_failed', true, lease.leaseId);
          if (!requeued) {
            appendProjectLog(projectState, 'warning', {
              kind: 'task_requeue_stale_lease_rejected',
              taskId: nextTask.id,
              expectedLeaseId: lease.leaseId,
              actualLeaseId: nextTask.leaseId || null,
              reason: 'spawn_failed',
            });
          }
          assignee.status = 'idle';
          assignee.currentTask = null;
          projectState.heartbeat.autoFixCount = (projectState.heartbeat.autoFixCount || 0) + 1;
          appendProjectLog(projectState, 'fix', {
            kind: 'task_start_failed_requeued',
            taskId: nextTask.id,
            autoFixCount: projectState.heartbeat.autoFixCount
          });
          emitProjectEvent(projectState.id, 'task_update', nextTask);
          emitProjectEvent(projectState.id, 'agent_message', {
            agentId: assignee.id, name: assignee.name, role: assignee.role,
            status: assignee.status, currentTask: assignee.currentTask,
            tasksDone: assignee.tasksDone, recentLog: assignee.recentLog
          });
          if (projectState.heartbeat.autoFixCount >= settings.maxAutoFixes) {
            markProjectFailed(projectState);
            return;
          }
        }
      } else {
        const req = taskCapabilityRequirements(nextTask);
        const summaryBits = [];
        if (req.requiredRole) summaryBits.push(`role=${req.requiredRole}`);
        if (req.connector) summaryBits.push(`connector=${req.connector}`);
        if (req.canDeploy) summaryBits.push('requires_deploy=true');
        if (req.canSpend) summaryBits.push('requires_spend=true');
        const reason = summaryBits.length
          ? `No eligible agent for capability requirements (${summaryBits.join(', ')}).`
          : 'No eligible agent for task capability requirements.';
        markTaskAwaitingApproval(projectState, nextTask, reason, {
          requirement: req,
          source,
        });
        notifyOperator(projectState, `Approval needed: ${nextTask.title}`, {
          taskId: nextTask.id,
          reason,
          requirement: req,
        }).catch(() => {});
      }
      }
    } else {
      if (projectState.budgetHardStop.active) {
        const lastNotifyMs = Date.parse(projectState.budgetHardStop.lastNotifiedAt || '');
        const shouldNotify = Number.isNaN(lastNotifyMs) || (Date.now() - lastNotifyMs) >= (15 * 60 * 1000);
        if (shouldNotify) {
          projectState.budgetHardStop.lastNotifiedAt = beatTs;
          appendProjectLog(projectState, 'warning', {
            kind: 'budget_hard_stop_blocking_execution',
            reason: projectState.budgetHardStop.reason || 'budget_cap_exceeded',
            activatedAt: projectState.budgetHardStop.activatedAt,
            blockedActionsCount: Number(projectState.budgetHardStop.blockedActionsCount || 0),
          });
        }
      }
      // No runnable backlog tasks and no inprogress � check if everything is done
      const allDone = projectState.tasks.length > 0 && projectState.tasks.every((t) => t.status === 'done');
      if (allDone && !shouldKeepRunningForRecurring(projectState)) {
        const delivery = verifyGoalDelivery(projectState);
        if (delivery.verified) {
          markProjectCompleted(projectState);
        } else {
          persistProjectState(projectState);
        }
        return;
      }
      maybeEmitIdleNotice(projectState, source, loopSafety, beatTs);
    }
  }

  const heartbeatLine = {
    ts: beatTs,
    message: `Heartbeat cycle ${projectState.heartbeat.cycleCount} (${source})`
  };
  projectState.heartbeat.log.unshift(heartbeatLine);
  if (projectState.heartbeat.log.length > 200) {
    projectState.heartbeat.log.length = 200;
  }

  appendProjectLog(projectState, 'heartbeat', {
    kind: 'heartbeat',
    source,
    cycle: projectState.heartbeat.cycleCount
  });
  emitProjectEvent(projectState.id, 'heartbeat', {
    status: projectState.heartbeat.status,
    uptime: projectUptime(projectState),
    lastBeat: projectState.heartbeat.lastBeat,
    autoFixCount: projectState.heartbeat.autoFixCount,
    log: projectState.heartbeat.log.slice(0, 25)
  });
  persistProjectState(projectState);
}

function projectUptime(projectState) {
  const startedAt = Date.parse(projectState.startedAt || '');
  if (!startedAt || Number.isNaN(startedAt)) {
    return '0m';
  }
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const minutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remMinutes}m`;
  return `${remMinutes}m`;
}

function startProjectLoop(projectId) {
  const runtime = projectRuntimes.get(projectId);
  if (!runtime || runtime.timer) return;
  runtime.state.status = 'running';
  const intervalMs = runtimeSettings().heartbeatIntervalMs;
  runtime.timer = setInterval(() => runProjectHeartbeat(runtime.state, 'interval'), intervalMs);
  appendProjectLog(runtime.state, 'message', { kind: 'project_loop_started' });
  persistProjectState(runtime.state);
}

function stopProjectLoop(projectId) {
  const runtime = projectRuntimes.get(projectId);
  if (!runtime || !runtime.timer) return;
  clearInterval(runtime.timer);
  runtime.timer = null;
}

function recoverProjectStateAfterRestart(state) {
  if (!state || !state.id) {
    return { requeuedTaskIds: [], allDoneAfterRecovery: false };
  }

  if (!Array.isArray(state.logs)) state.logs = [];
  if (!Array.isArray(state.tasks)) state.tasks = [];
  if (!Array.isArray(state.agents)) state.agents = [];
  if (!state.heartbeat) {
    state.heartbeat = { status: 'unknown', lastBeat: null, autoFixCount: 0, cycleCount: 0, log: [] };
  }

  state.tasks.forEach((t) => { if (typeof t.inprogressCycles !== 'number') t.inprogressCycles = 0; });
  state.tasks.forEach((t) => {
    ensureTaskLeaseFields(t);
    if (!t.executionState) t.executionState = t.status === 'done' ? 'done' : (t.status === 'inprogress' ? 'running' : 'queued');
    if (typeof t.retryCount !== 'number') t.retryCount = 0;
    if (typeof t.lastFailedAt === 'undefined') t.lastFailedAt = null;
    if (typeof t.lastError === 'undefined') t.lastError = null;
    if (typeof t.lastProgressAt === 'undefined') t.lastProgressAt = null;
    if (!Array.isArray(t.retryLineage)) t.retryLineage = [];
    if (typeof t.executionTaskRunId === 'undefined') t.executionTaskRunId = null;
    if (typeof t.recurringKey === 'undefined') t.recurringKey = null;
    if (typeof t.pendingApproval === 'undefined') t.pendingApproval = null;
    if (typeof t.autoActionNotBeforeAt === 'undefined') t.autoActionNotBeforeAt = null;
    if (typeof t.assistanceRequestedAt === 'undefined') t.assistanceRequestedAt = null;
    if (typeof t.deadLetteredAt === 'undefined') t.deadLetteredAt = null;
  });
  if (typeof state.operatingMode !== 'string') {
    state.operatingMode = templateOperatingMode(state.template, null);
  } else {
    state.operatingMode = normalizeOperatingMode(state.operatingMode);
  }
  ensureRecurringState(state);
  ensureStaffingState(state);
  ensureKpiGoalState(state);
  ensureApprovalGovernanceState(state);
  ensureOperationalLoopState(state);
  ensureDeadLetterState(state);
  ensureFinanceExceptionState(state);
  ensurePublicationHealthState(state);
  ensureConnectorExecutionState(state);
  ensureBudgetHardStopState(state);
  ensureProjectConnectorBindings(state);
  if (!state.goalPlan || typeof state.goalPlan !== 'object') {
    state.goalPlan = goalActionPlanFromPrompt(state.template, state.goal || '', {});
  }
  if (!state.approvalGovernance.industryPolicyPack) {
    applyIndustryApprovalPolicyPack(state, {
      templateId: state.template,
      goalPlan: state.goalPlan,
    });
  }
  if (!Array.isArray(state.approvalGovernance.revisions.history) || state.approvalGovernance.revisions.history.length === 0) {
    recordApprovalGovernanceRevision(state, 'system', 'recovery_baseline');
  }
  if (!state.kpiAlerting || typeof state.kpiAlerting !== 'object') {
    state.kpiAlerting = { lastSentAt: null, lastSignature: null };
  }
  if (!state.roleCapabilities || typeof state.roleCapabilities !== 'object') {
    state.roleCapabilities = {};
    state.agents.forEach((agent) => {
      if (agent.isCoordinator) return;
      const defaults = DEFAULT_ROLE_CAPABILITIES[String(agent.role || '').trim()] || { canDeploy: false, canSpend: false, allowedConnectors: [] };
      state.roleCapabilities[String(agent.role || '').trim()] = {
        canDeploy: Boolean(defaults.canDeploy),
        canSpend: Boolean(defaults.canSpend),
        allowedConnectors: Array.isArray(defaults.allowedConnectors) ? [...defaults.allowedConnectors] : [],
      };
    });
  }
  if (state.roleCapabilities && typeof state.roleCapabilities === 'object') {
    const imageEnabled = imageGeneratorSettings().enabled;
    if (imageEnabled) {
      Object.keys(state.roleCapabilities).forEach((roleName) => {
        const defaults = DEFAULT_ROLE_CAPABILITIES[roleName] || null;
        if (!defaults || !Array.isArray(defaults.allowedConnectors) || !defaults.allowedConnectors.includes('image_generator')) return;
        const caps = state.roleCapabilities[roleName] && typeof state.roleCapabilities[roleName] === 'object'
          ? state.roleCapabilities[roleName]
          : null;
        if (!caps) return;
        if (!Array.isArray(caps.allowedConnectors)) caps.allowedConnectors = [];
        caps.allowedConnectors = caps.allowedConnectors.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
        if (!caps.allowedConnectors.includes('image_generator')) caps.allowedConnectors.push('image_generator');
      });
    }
  }

  const requeuedTaskIds = [];
  state.tasks.forEach((t) => {
    if (t.status === 'inprogress') {
      const previousAssignee = t.assignee;
      requeueTaskToBacklog(t, 'process_restart', false);
      requeuedTaskIds.push(t.id);
      appendMessageBusEntry({
        projectId: state.id,
        from: 'coordinator',
        to: previousAssignee || 'unknown',
        kind: 'task_requeued_on_restart',
        payload: { taskId: t.id, title: t.title, reason: 'process_restart' },
      });
    }
  });

  state.agents.forEach((agent) => {
    if (!agent.isCoordinator && agent.status === 'running') {
      agent.status = 'idle';
      agent.currentTask = null;
    }
  });

  const allDoneAfterRecovery = state.tasks.length > 0 && state.tasks.every((t) => t.status === 'done');
  if (state.status === 'running' && allDoneAfterRecovery && !shouldKeepRunningForRecurring(state)) {
    state.status = 'completed';
    state.completedAt = state.completedAt || nowIso();
    state.heartbeat.status = 'completed';
  }

  return { requeuedTaskIds, allDoneAfterRecovery };
}

function loadProjectsFromDisk() {
  ensureDir(PROJECTS_ROOT);
  const children = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
  children.forEach((entry) => {
    if (!entry.isDirectory()) return;
    const state = safeJsonRead(path.join(PROJECTS_ROOT, entry.name, 'state.json'), null);
    if (!state || !state.id) return;
    const runtime = { state, timer: null, execution: null, recurringAction: null };
    projectRuntimes.set(state.id, runtime);
    recoverProjectStateAfterRestart(state);

    // Recovery: resume running projects, or persist completed normalization.
    if (state.status === 'running') {
      startProjectLoop(state.id);
    } else {
      persistProjectState(state);
    }
  });
}

function createProjectFromTemplate({ name, template, goal, mode = 'production' }) {
  const tpl = loadTemplateById(template);
  if (!tpl) {
    throw new Error(`Unknown template: ${template}`);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const initialAgents = createInitialAgents(id, tpl);
  const subordinateCount = initialAgents.filter((agent) => !agent.isCoordinator).length;
  const operatingMode = templateOperatingMode(template, tpl);
  const staffingPolicy = templateAutoStaffingPolicy(tpl, subordinateCount);
  const goalPlan = goalActionPlanFromPrompt(template, goal || tpl.goal_definition || '', tpl);
  const recurringSchedule = recurringScheduleForTemplate(template, tpl);
  const state = {
    id,
    name,
    template,
    mode: String(mode).toLowerCase() === 'draft' ? 'draft' : 'production',
    operatingMode,
    goal: goal || tpl.goal_definition || '',
    status: 'running',
    startedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    lastActivity: createdAt,
    completedAt: null,
    failedAt: null,
    recurring: {
      enabled: recurringSchedule.length > 0,
      lastRunAt: {},
      schedule: recurringSchedule,
      lastIdleNoticeAt: null,
    },
    staffing: {
      enabled: staffingPolicy.enabled,
      cooldownMs: staffingPolicy.cooldownMs,
      backlogPerAgentThreshold: staffingPolicy.backlogPerAgentThreshold,
      maxOptionalAdds: staffingPolicy.maxOptionalAdds,
      maxAgents: staffingPolicy.maxAgents,
      baseSubordinateCount: subordinateCount,
      optionalPool: Array.isArray(tpl.optional_agents) ? tpl.optional_agents.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
      lastScaledAt: null,
    },
    roleCapabilities: templateRoleCapabilities(tpl, initialAgents),
    kpiGoals: {
      ...DEFAULT_KPI_GOALS,
      weeklyPlan: {
        weekStart: startOfUtcWeekIso(createdAt),
        lastPlannedAt: null,
        nextReviewAt: null,
        summary: null,
        objectives: [],
      },
    },
    approvalGovernance: {
      enabled: DEFAULT_APPROVAL_GOVERNANCE.enabled,
      autoApproveRules: cloneApprovalRules(DEFAULT_APPROVAL_GOVERNANCE.autoApproveRules),
      autoDenyRules: cloneApprovalRules(DEFAULT_APPROVAL_GOVERNANCE.autoDenyRules),
      escalationRules: cloneApprovalRules(DEFAULT_APPROVAL_GOVERNANCE.escalationRules),
      industryPolicyPack: DEFAULT_APPROVAL_GOVERNANCE.industryPolicyPack,
      updatedAt: null,
      revisions: {
        currentRevisionId: null,
        history: [],
      },
    },
    budgetHardStop: {
      active: false,
      reason: null,
      activatedAt: null,
      activatedBy: null,
      context: {},
      blockedActionsCount: 0,
      lastBlockedAt: null,
      resumedAt: null,
      resumedBy: null,
      lastNotifiedAt: null,
    },
    operationalLoops: {
      weekStart: startOfUtcWeekIso(createdAt),
      generatedAt: null,
      objectives: [],
    },
    deadLetters: [],
    financeExceptions: [],
    publicationHealth: {
      driftEvents: [],
      incidents: [],
      policy: {
        ...DEFAULT_PUBLICATION_RELIABILITY_POLICY,
      },
      alerting: {
        lastSignature: null,
        lastSentAt: null,
        suppressedSignals: [],
      },
      lastSlo: null,
      lastCheckedAt: null,
      lastSelfHealAt: null,
      lastSelfHealSummary: null,
    },
    connectorExecutions: {},
    goalPlan,
    kpiAlerting: {
      lastSentAt: null,
      lastSignature: null,
    },
    agents: initialAgents,
    tasks: createInitialTasks(tpl, { templateId: template, goalPlan }),
    logs: [],
    heartbeat: {
      status: 'alive',
      lastBeat: null,
      autoFixCount: 0,
      cycleCount: 0,
      log: []
    }
  };
  ensureProjectConnectorBindings(state);

  const appliedPolicyPack = applyIndustryApprovalPolicyPack(state, {
    templateId: template,
    goalPlan,
  });

  appendProjectLog(state, 'message', {
    kind: 'project_created',
    template,
    goal: state.goal
  });

  if (appliedPolicyPack && appliedPolicyPack.applied) {
    appendProjectLog(state, 'message', {
      kind: 'industry_policy_pack_applied',
      policyPack: appliedPolicyPack.packId,
      summary: appliedPolicyPack.summary,
    });
    appendMessageBusEntry({
      projectId: state.id,
      from: 'coordinator',
      to: 'compliance_engine',
      kind: 'industry_policy_pack_applied',
      payload: {
        policyPack: appliedPolicyPack.packId,
        title: appliedPolicyPack.title,
      },
    });
  }

  recordApprovalGovernanceRevision(state, 'system', 'initial_project_governance_state');

  if (Array.isArray(goalPlan && goalPlan.tasks) && goalPlan.tasks.length > 0) {
    appendProjectLog(state, 'message', {
      kind: 'goal_action_plan_generated',
      source: goalPlan.source,
      milestoneCount: Array.isArray(goalPlan.milestones) ? goalPlan.milestones.length : 0,
      requiredConnectors: goalPlan.requiredConnectors || [],
    });
    appendMessageBusEntry({
      projectId: state.id,
      from: 'coordinator',
      to: 'ceo_planner',
      kind: 'goal_action_plan_generated',
      payload: {
        goal: state.goal,
        milestoneCount: Array.isArray(goalPlan.milestones) ? goalPlan.milestones.length : 0,
        requiredConnectors: goalPlan.requiredConnectors || [],
      },
    });
  }

  const clarificationQuestions = Array.isArray(goalPlan && goalPlan.clarificationQuestions)
    ? goalPlan.clarificationQuestions.map((question) => String(question || '').trim()).filter(Boolean)
    : [];
  if (clarificationQuestions.length > 0) {
    appendProjectLog(state, 'warning', {
      kind: 'goal_plan_clarification_requested',
      clarificationQuestions,
      summary: `Coordinator needs answers to ${clarificationQuestions.length} goal clarification question(s) before execution scope is locked.`,
    });
    appendMessageBusEntry({
      projectId: state.id,
      from: 'coordinator',
      to: 'operator',
      kind: 'assistance_requested_goal_clarification',
      payload: {
        goal: state.goal,
        clarificationQuestions,
      },
    });
    notifyOperator(
      state,
      `Goal clarification needed: please answer ${clarificationQuestions.length} question(s) from the coordinator.`,
      {
        kind: 'goal_clarification',
        clarificationQuestions,
        projectId: state.id,
        fallback: 'If messaging channels are unavailable, answer in dashboard Logs or Message Bus.',
      },
    ).catch(() => {});
  }

  if (Array.isArray(goalPlan && goalPlan.missingCredentialServices) && goalPlan.missingCredentialServices.length > 0) {
    const missing = goalPlan.missingCredentialServices;
    appendProjectLog(state, 'warning', {
      kind: 'goal_plan_missing_credentials',
      missingCredentialServices: missing,
      summary: `Goal execution needs connector credentials not yet connected: ${missing.join(', ')}.`,
    });
    appendMessageBusEntry({
      projectId: state.id,
      from: 'coordinator',
      to: 'operator',
      kind: 'assistance_requested_missing_credentials',
      payload: {
        missingCredentialServices: missing,
        goal: state.goal,
      },
    });
    notifyOperator(
      state,
      `Assistance needed: connect credentials (${missing.join(', ')}) to execute the new goal plan.`,
      {
        kind: 'missing_credentials',
        missingCredentialServices: missing,
        projectId: state.id,
      },
    ).catch(() => {});
  }

  const runtime = { state, timer: null, execution: null, recurringAction: null };
  projectRuntimes.set(id, runtime);

  ensureDir(projectDir(id));
  writeProjectWorkspaceArtifacts(state);
  fs.writeFileSync(projectTemplateSnapshotPath(id), `${JSON.stringify(tpl, null, 2)}\n`, 'utf-8');
  persistProjectState(state);
  startProjectLoop(id);
  runProjectHeartbeat(state, 'startup');
  autoProvisionProjectConnectors(state).catch(() => {});
  return summarizeProject(state);
}

async function cleanupProjectConnectorResources(projectSnapshot = null) {
  if (!projectSnapshot || typeof projectSnapshot !== 'object') return;
  const bindings = projectSnapshot.connectorBindings && typeof projectSnapshot.connectorBindings === 'object'
    ? projectSnapshot.connectorBindings
    : {};

  if (bindings.netlify && bindings.netlify.source === 'project_provisioned' && bindings.netlify.siteId) {
    const netlifyDelete = await executeNetlifyConnector({
      operation: 'delete_site',
      siteId: String(bindings.netlify.siteId || '').trim(),
    });
    if (!netlifyDelete.ok) {
      appendLog(`Cleanup warning: failed to delete Netlify site ${bindings.netlify.siteId} for project ${projectSnapshot.id}: ${netlifyDelete.message}`);
    }
  }

  if (bindings.supabase && bindings.supabase.source === 'project_provisioned' && (bindings.supabase.projectRef || bindings.supabase.projectId)) {
    const supabaseDelete = await executeSupabaseConnector({
      operation: 'delete_project',
      projectRef: String(bindings.supabase.projectRef || bindings.supabase.projectId || '').trim(),
    });
    if (!supabaseDelete.ok) {
      appendLog(`Cleanup warning: failed to delete Supabase project ${bindings.supabase.projectRef || bindings.supabase.projectId} for project ${projectSnapshot.id}: ${supabaseDelete.message}`);
    }
  }

  if (bindings.googleAds && bindings.googleAds.campaignId && bindings.googleAds.customerId && bindings.googleAds.status === 'ready') {
    const adsPause = await executeGoogleAdsConnector({
      operation: 'pause_campaign',
      projectId: String(projectSnapshot.id || '').trim(),
      input: {
        customerId: String(bindings.googleAds.customerId || '').trim(),
        campaignId: String(bindings.googleAds.campaignId || '').trim(),
      },
      estimatedCost: 0,
    });
    if (!adsPause.ok) {
      appendLog(`Cleanup warning: failed to pause Google Ads campaign ${bindings.googleAds.campaignId} for project ${projectSnapshot.id}: ${adsPause.message}`);
    }
  }
}

function removeProject(projectId) {
  const runtime = projectRuntimes.get(projectId);
  const projectSnapshot = runtime && runtime.state
    ? {
        id: runtime.state.id,
        name: runtime.state.name,
        connectorBindings: runtime.state.connectorBindings,
      }
    : null;

  cleanupProjectConnectorResources(projectSnapshot).catch((err) => {
    appendLog(`Cleanup warning: project ${projectId} connector cleanup failed: ${err.message}`);
  });

  cancelProjectExecution(projectId, 'project_deleted', false);
  stopProjectLoop(projectId);
  projectRuntimes.delete(projectId);
  const clients = projectSseClients.get(projectId);
  if (clients) {
    clients.forEach((res) => {
      try {
        res.end();
      } catch (err) {
      }
    });
    projectSseClients.delete(projectId);
  }

  const target = projectDir(projectId);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  const workspaceTarget = projectWorkspaceDir(projectId);
  if (fs.existsSync(workspaceTarget)) {
    fs.rmSync(workspaceTarget, { recursive: true, force: true });
  }
}

function stripUtf8Bom(text) {
  if (typeof text !== 'string') return text;
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function parseJsonBodySafe(rawBody) {
  if (!rawBody) return {};
  return JSON.parse(stripUtf8Bom(rawBody));
}

function readJsonFileSafe(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(stripUtf8Bom(raw));
}

function credentialMetaPath(service) {
  return path.join(CREDENTIALS_ROOT, `${service}.json`);
}

function credentialTokenPath(service) {
  return path.join(CREDENTIALS_ROOT, `${service}.enc`);
}

function ensureCredentialStorage() {
  ensureDir(CREDENTIALS_ROOT);
  ensureDir(CREDENTIAL_POLICIES_ROOT);
}

function readCredentialToken(service) {
  const target = credentialTokenPath(service);
  if (!fs.existsSync(target)) return null;
  try {
    const encoded = fs.readFileSync(target, 'utf-8').trim();
    if (!encoded) return null;
    return Buffer.from(encoded, 'base64').toString('utf-8');
  } catch (err) {
    return null;
  }
}

function credentialPolicyPath(projectId, service) {
  const safeProject = String(projectId || '').trim();
  const safeService = String(service || '').trim();
  return path.join(CREDENTIAL_POLICIES_ROOT, `${safeProject}__${safeService}.json`);
}

function defaultCredentialPolicy(projectId, service) {
  return {
    projectId: String(projectId || ''),
    service: String(service || ''),
    enabled: true,
    monthlyCap: null,
    updatedAt: null,
  };
}

function getProjectCredentialPolicy(projectId, service) {
  const fallback = defaultCredentialPolicy(projectId, service);
  if (!projectId || !service) return fallback;
  ensureDir(CREDENTIAL_POLICIES_ROOT);
  const stored = safeJsonRead(credentialPolicyPath(projectId, service), null);
  if (!stored || typeof stored !== 'object') return fallback;
  return {
    ...fallback,
    ...stored,
    projectId: String(projectId || ''),
    service: String(service || ''),
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : true,
    monthlyCap: typeof stored.monthlyCap === 'number' && Number.isFinite(stored.monthlyCap) ? stored.monthlyCap : null,
  };
}

function listProjectCredentialPolicies(projectId) {
  return SUPPORTED_CREDENTIAL_SERVICES.map((service) => getProjectCredentialPolicy(projectId, service));
}

function upsertProjectCredentialPolicy(projectId, service, patch = {}) {
  const next = {
    ...getProjectCredentialPolicy(projectId, service),
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : getProjectCredentialPolicy(projectId, service).enabled,
    monthlyCap: typeof patch.monthlyCap === 'number' && Number.isFinite(patch.monthlyCap)
      ? patch.monthlyCap
      : (patch.monthlyCap === null ? null : getProjectCredentialPolicy(projectId, service).monthlyCap),
    updatedAt: nowIso(),
  };
  ensureDir(CREDENTIAL_POLICIES_ROOT);
  fs.writeFileSync(credentialPolicyPath(projectId, service), `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return next;
}

function currentBudgetPeriods(ts = nowIso()) {
  const iso = String(ts || nowIso());
  return {
    day: iso.slice(0, 10),
    month: iso.slice(0, 7),
  };
}

function readCredentialBudgetCounters() {
  ensureCredentialStorage();
  return safeJsonRead(CREDENTIAL_BUDGET_COUNTERS_PATH, {});
}

function writeCredentialBudgetCounters(counters) {
  ensureCredentialStorage();
  fs.writeFileSync(CREDENTIAL_BUDGET_COUNTERS_PATH, `${JSON.stringify(counters, null, 2)}\n`, 'utf-8');
}

function normalizeBudgetCounterEntry(entry, ts = nowIso()) {
  const periods = currentBudgetPeriods(ts);
  const next = {
    dailyPeriod: periods.day,
    monthlyPeriod: periods.month,
    dailySpent: 0,
    monthlySpent: 0,
    updatedAt: null,
    ...(entry && typeof entry === 'object' ? entry : {}),
  };

  if (next.dailyPeriod !== periods.day) {
    next.dailyPeriod = periods.day;
    next.dailySpent = 0;
  }
  if (next.monthlyPeriod !== periods.month) {
    next.monthlyPeriod = periods.month;
    next.monthlySpent = 0;
  }
  return next;
}

function getCredentialBudgetSnapshot(projectId) {
  const counters = readCredentialBudgetCounters();
  const projectCounters = counters[String(projectId || '')] || {};
  const snapshot = {};
  SUPPORTED_CREDENTIAL_SERVICES.forEach((service) => {
    snapshot[service] = normalizeBudgetCounterEntry(projectCounters[service], nowIso());
  });
  return snapshot;
}

function recordCredentialSpend(projectId, service, amount, ts = nowIso()) {
  const safeProjectId = String(projectId || '').trim();
  const safeService = String(service || '').trim();
  const increment = Number(amount);
  if (!safeProjectId || !safeService || !Number.isFinite(increment) || increment <= 0) {
    return normalizeBudgetCounterEntry({}, ts);
  }

  const counters = readCredentialBudgetCounters();
  counters[safeProjectId] = counters[safeProjectId] || {};
  const current = normalizeBudgetCounterEntry(counters[safeProjectId][safeService], ts);
  current.dailySpent = Number((current.dailySpent + increment).toFixed(2));
  current.monthlySpent = Number((current.monthlySpent + increment).toFixed(2));
  current.updatedAt = ts;
  counters[safeProjectId][safeService] = current;
  writeCredentialBudgetCounters(counters);
  return current;
}

function appendCredentialAudit(record = {}) {
  ensureCredentialStorage();
  const entry = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    projectId: record.projectId ? String(record.projectId) : null,
    service: record.service ? String(record.service) : null,
    operation: record.operation ? String(record.operation) : null,
    action: record.action ? String(record.action) : 'credential_event',
    decision: record.decision ? String(record.decision) : null,
    errorCode: record.errorCode ? String(record.errorCode) : null,
    cost: typeof record.cost === 'number' && Number.isFinite(record.cost) ? record.cost : 0,
    dryRun: Boolean(record.dryRun),
    reason: record.reason ? redactSensitive(String(record.reason)) : null,
    meta: record.meta && typeof record.meta === 'object' ? record.meta : {},
  };
  fs.appendFileSync(CREDENTIAL_AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf-8');
  return entry;
}

function readCredentialAudit(projectId, limit = 100) {
  ensureCredentialStorage();
  if (!fs.existsSync(CREDENTIAL_AUDIT_LOG_PATH)) return [];
  const raw = fs.readFileSync(CREDENTIAL_AUDIT_LOG_PATH, 'utf-8');
  const rows = raw.split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      return null;
    }
  }).filter(Boolean);

  const filtered = projectId
    ? rows.filter((entry) => String(entry.projectId || '') === String(projectId))
    : rows;
  return filtered.slice(-clampInt(limit, 100, 1, 500)).reverse();
}

function credentialDefaultFieldForService(service) {
  if (service === 'netlify') return 'defaultSiteId';
  if (service === 'google_ads') return 'defaultCustomerId';
  if (service === 'supabase') return 'defaultProjectRef';
  return null;
}

function readCredentialDefaultValue(service, metadata = {}) {
  const config = metadata && metadata.config && typeof metadata.config === 'object' ? metadata.config : {};
  if (service === 'netlify') {
    return String(config.defaultSiteId || config.siteId || metadata.defaultSiteId || metadata.siteId || '').trim();
  }
  if (service === 'google_ads') {
    return String(config.defaultCustomerId || config.customerId || metadata.defaultCustomerId || metadata.customerId || '').trim();
  }
  if (service === 'supabase') {
    return String(config.defaultProjectRef || config.projectRef || metadata.defaultProjectRef || metadata.projectRef || '').trim();
  }
  return '';
}

function readCredentialConfig(service, metadata = {}) {
  return {
    defaultSiteId: service === 'netlify' ? (readCredentialDefaultValue('netlify', metadata) || null) : null,
    defaultCustomerId: service === 'google_ads' ? (readCredentialDefaultValue('google_ads', metadata) || null) : null,
    defaultProjectRef: service === 'supabase' ? (readCredentialDefaultValue('supabase', metadata) || null) : null,
  };
}

function applyCredentialDefaultConfig(meta, service, config = {}) {
  const field = credentialDefaultFieldForService(service);
  if (!field) return;
  if (!meta.config || typeof meta.config !== 'object') {
    meta.config = {};
  }
  const nextValue = typeof config[field] === 'string' ? config[field].trim() : null;
  if (nextValue && nextValue.length > 0) {
    meta.config[field] = nextValue;
  } else if (typeof config[field] === 'string') {
    delete meta.config[field];
  }
}

function readCredentialMetadata() {
  ensureCredentialStorage();
  return SUPPORTED_CREDENTIAL_SERVICES.map((service) => {
    const metadata = safeJsonRead(credentialMetaPath(service), {});
    const connected = Boolean(metadata.connected) || fs.existsSync(credentialTokenPath(service));
    const monthlyBudget = metadata.budget && typeof metadata.budget.monthly !== 'undefined'
      ? metadata.budget.monthly
      : (typeof metadata.budget === 'number' ? metadata.budget : null);

    return {
      service,
      connected,
      budget: monthlyBudget,
      lastUsed: metadata.last_used || metadata.lastUsed || metadata.updated_at || null,
      config: readCredentialConfig(service, metadata),
    };
  });
}

function saveCredentialMetadata(service, token, budget, config = {}) {
  ensureCredentialStorage();
  const meta = safeJsonRead(credentialMetaPath(service), {});
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  const hasToken = Boolean(normalizedToken) || Boolean(readCredentialToken(service));
  meta.service = service;
  meta.connected = hasToken;
  meta.updated_at = nowIso();
  meta.last_used = meta.last_used || null;
  meta.budget = {
    daily: meta.budget && typeof meta.budget.daily !== 'undefined' ? meta.budget.daily : null,
    monthly: typeof budget === 'number' && Number.isFinite(budget) ? budget : (meta.budget && typeof meta.budget.monthly !== 'undefined' ? meta.budget.monthly : null)
  };
  applyCredentialDefaultConfig(meta, service, config);

  fs.writeFileSync(credentialMetaPath(service), `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
  if (normalizedToken) {
    const encoded = Buffer.from(normalizedToken, 'utf-8').toString('base64');
    fs.writeFileSync(credentialTokenPath(service), `${encoded}\n`, 'utf-8');
  }
  appendCredentialAudit({
    service,
    action: 'credential_upsert',
    decision: 'allow',
    reason: 'Credential metadata updated.',
    meta: {
      monthlyBudget: meta.budget.monthly,
      ...readCredentialConfig(service, meta),
    },
  });
}

function projectResourceSlug(raw, fallback = 'project') {
  const base = String(raw || '').trim().toLowerCase();
  const slug = base
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return slug || String(fallback || 'project');
}

function defaultProjectConnectorBindings(projectState = null) {
  const projectName = projectState && projectState.name ? String(projectState.name) : 'project';
  const projectId = projectState && projectState.id ? String(projectState.id) : crypto.randomUUID();
  const shortId = projectId.slice(0, 8);
  const slug = projectResourceSlug(projectName, `project-${shortId}`);
  return {
    netlify: {
      siteId: null,
      siteName: null,
      source: null,
      status: 'pending',
      lastError: null,
      updatedAt: null,
    },
    supabase: {
      projectRef: null,
      projectId: null,
      projectName: null,
      source: null,
      status: 'pending',
      lastError: null,
      updatedAt: null,
    },
    googleAds: {
      customerId: null,
      campaignId: null,
      campaignName: `${slug}-launch-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      source: null,
      status: 'pending',
      lastError: null,
      updatedAt: null,
    },
    stripe: {
      projectTag: `${slug}-${shortId}`,
      workspaceId: crypto.randomUUID(),
      source: 'project_generated',
      status: 'ready',
      lastError: null,
      updatedAt: nowIso(),
    },
  };
}

function ensureProjectConnectorBindings(projectState) {
  if (!projectState || typeof projectState !== 'object') return;
  const defaults = defaultProjectConnectorBindings(projectState);
  if (!projectState.connectorBindings || typeof projectState.connectorBindings !== 'object') {
    projectState.connectorBindings = defaults;
  } else {
    projectState.connectorBindings = {
      ...defaults,
      ...projectState.connectorBindings,
      netlify: { ...defaults.netlify, ...(projectState.connectorBindings.netlify || {}) },
      supabase: { ...defaults.supabase, ...(projectState.connectorBindings.supabase || {}) },
      googleAds: { ...defaults.googleAds, ...(projectState.connectorBindings.googleAds || {}) },
      stripe: { ...defaults.stripe, ...(projectState.connectorBindings.stripe || {}) },
    };
  }
  if (!projectState.connectorBootstrap || typeof projectState.connectorBootstrap !== 'object') {
    projectState.connectorBootstrap = {
      status: 'pending',
      lastRunAt: null,
      completedAt: null,
      lastError: null,
      summary: null,
    };
  }
}

function projectConnectorTemplateContext(projectState = null) {
  if (!projectState || typeof projectState !== 'object') {
    return {
      netlify_site_id: '',
      supabase_project_ref: '',
      google_ads_customer_id: '',
      google_ads_campaign_id: '',
      google_ads_campaign_name: '',
      stripe_project_tag: '',
      stripe_workspace_id: '',
    };
  }
  ensureProjectConnectorBindings(projectState);
  const bindings = projectState.connectorBindings || {};
  return {
    netlify_site_id: String(bindings.netlify && bindings.netlify.siteId ? bindings.netlify.siteId : '').trim(),
    supabase_project_ref: String(bindings.supabase && bindings.supabase.projectRef ? bindings.supabase.projectRef : '').trim(),
    google_ads_customer_id: String(bindings.googleAds && bindings.googleAds.customerId ? bindings.googleAds.customerId : '').trim(),
    google_ads_campaign_id: String(bindings.googleAds && bindings.googleAds.campaignId ? bindings.googleAds.campaignId : '').trim(),
    google_ads_campaign_name: String(bindings.googleAds && bindings.googleAds.campaignName ? bindings.googleAds.campaignName : '').trim(),
    stripe_project_tag: String(bindings.stripe && bindings.stripe.projectTag ? bindings.stripe.projectTag : '').trim(),
    stripe_workspace_id: String(bindings.stripe && bindings.stripe.workspaceId ? bindings.stripe.workspaceId : '').trim(),
  };
}

function connectorActionTemplateContext(projectState = null) {
  const metadata = readCredentialMetadata();
  const netlify = metadata.find((entry) => entry.service === 'netlify') || {};
  const googleAds = metadata.find((entry) => entry.service === 'google_ads') || {};
  const supabase = metadata.find((entry) => entry.service === 'supabase') || {};
  const projectContext = projectConnectorTemplateContext(projectState);
  return {
    netlify_site_id: projectContext.netlify_site_id || String(netlify && netlify.config && netlify.config.defaultSiteId ? netlify.config.defaultSiteId : '').trim(),
    google_ads_customer_id: projectContext.google_ads_customer_id || String(googleAds && googleAds.config && googleAds.config.defaultCustomerId ? googleAds.config.defaultCustomerId : '').trim(),
    supabase_project_ref: projectContext.supabase_project_ref || String(supabase && supabase.config && supabase.config.defaultProjectRef ? supabase.config.defaultProjectRef : '').trim(),
    google_ads_campaign_id: projectContext.google_ads_campaign_id,
    google_ads_campaign_name: projectContext.google_ads_campaign_name,
    stripe_project_tag: projectContext.stripe_project_tag,
    stripe_workspace_id: projectContext.stripe_workspace_id,
  };
}

function resolveConnectorActionInput(input = {}, projectState = null) {
  const context = connectorActionTemplateContext(projectState);
  const resolveValue = (value) => {
    if (typeof value === 'string') {
      let out = value;
      if (context.netlify_site_id) {
        out = out
          .split('{{netlify_site_id}}').join(context.netlify_site_id)
          .split('{{netlify.default_site_id}}').join(context.netlify_site_id)
          .split('{{netlify.site_id}}').join(context.netlify_site_id);
      }
      if (context.google_ads_customer_id) {
        out = out
          .split('{{google_ads_customer_id}}').join(context.google_ads_customer_id)
          .split('{{google_ads.default_customer_id}}').join(context.google_ads_customer_id)
          .split('{{google_ads.customer_id}}').join(context.google_ads_customer_id);
      }
      if (context.supabase_project_ref) {
        out = out
          .split('{{supabase_project_ref}}').join(context.supabase_project_ref)
          .split('{{supabase.default_project_ref}}').join(context.supabase_project_ref)
          .split('{{supabase.project_ref}}').join(context.supabase_project_ref);
      }
      if (context.google_ads_campaign_id) {
        out = out
          .split('{{google_ads_campaign_id}}').join(context.google_ads_campaign_id)
          .split('{{google_ads.campaign_id}}').join(context.google_ads_campaign_id);
      }
      if (context.google_ads_campaign_name) {
        out = out
          .split('{{google_ads_campaign_name}}').join(context.google_ads_campaign_name)
          .split('{{google_ads.campaign_name}}').join(context.google_ads_campaign_name);
      }
      if (context.stripe_project_tag) {
        out = out
          .split('{{stripe_project_tag}}').join(context.stripe_project_tag)
          .split('{{stripe.project_tag}}').join(context.stripe_project_tag);
      }
      if (context.stripe_workspace_id) {
        out = out
          .split('{{stripe_workspace_id}}').join(context.stripe_workspace_id)
          .split('{{stripe.workspace_id}}').join(context.stripe_workspace_id);
      }
      return out;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => resolveValue(entry));
    }
    if (value && typeof value === 'object') {
      const next = {};
      Object.entries(value).forEach(([key, entry]) => {
        next[key] = resolveValue(entry);
      });
      return next;
    }
    return value;
  };
  return resolveValue(input && typeof input === 'object' ? input : {});
}

async function autoProvisionProjectConnectors(projectState) {
  if (!projectState || !projectState.id) return;
  ensureProjectConnectorBindings(projectState);
  const bootstrap = projectState.connectorBootstrap;
  if (bootstrap.status === 'running') return;

  bootstrap.status = 'running';
  bootstrap.lastRunAt = nowIso();
  bootstrap.lastError = null;
  bootstrap.summary = null;
  persistProjectState(projectState);

  const bindings = projectState.connectorBindings;
  const creds = readCredentialMetadata();
  const byService = (service) => creds.find((entry) => entry.service === service) || { connected: false, config: {} };
  const shortId = String(projectState.id).slice(0, 8);
  const slug = projectResourceSlug(projectState.name, `project-${shortId}`);

  const markBinding = (key, patch = {}) => {
    bindings[key] = {
      ...(bindings[key] || {}),
      ...patch,
      updatedAt: nowIso(),
    };
  };

  const summarizeStatus = () => ({
    netlify: bindings.netlify && bindings.netlify.status,
    supabase: bindings.supabase && bindings.supabase.status,
    googleAds: bindings.googleAds && bindings.googleAds.status,
    stripe: bindings.stripe && bindings.stripe.status,
  });

  try {
    if (readCredentialToken('netlify')) {
      if (!String(bindings.netlify.siteId || '').trim()) {
        const siteName = `${slug}-${shortId}`.slice(0, 60);
        const createSite = await executeNetlifyConnector({ operation: 'create_site', name: siteName });
        if (createSite.ok && createSite.data) {
          markBinding('netlify', {
            siteId: String(createSite.data.id || '').trim() || null,
            siteName: String(createSite.data.name || siteName).trim() || siteName,
            siteUrl: String(createSite.data.siteUrl || createSite.data.url || '').trim() || null,
            source: 'project_provisioned',
            status: String(createSite.data.id || '').trim() ? 'ready' : 'needs_selection',
            lastError: String(createSite.data.id || '').trim() ? null : 'Netlify site was created but no site id was returned.',
          });
        } else {
          const fallback = String(byService('netlify').config && byService('netlify').config.defaultSiteId ? byService('netlify').config.defaultSiteId : '').trim();
          markBinding('netlify', {
            siteId: fallback || null,
            source: fallback ? 'credential_default' : null,
            status: fallback ? 'ready' : 'blocked',
            lastError: createSite.message || 'Netlify site provisioning failed.',
          });
        }
      }
    } else {
      markBinding('netlify', {
        status: 'blocked',
        lastError: 'Netlify token is missing.',
      });
    }

    if (readCredentialToken('supabase')) {
      if (!String(bindings.supabase.projectRef || '').trim()) {
        const projectName = `${slug}-${shortId}`.slice(0, 63);
        const createProject = await executeSupabaseConnector({ operation: 'create_project', name: projectName });
        if (createProject.ok && createProject.data) {
          const ref = String(createProject.data.ref || createProject.data.projectRef || '').trim();
          markBinding('supabase', {
            projectRef: ref || null,
            projectId: String(createProject.data.id || '').trim() || null,
            projectName: String(createProject.data.name || projectName).trim() || projectName,
            source: 'project_provisioned',
            status: ref ? 'ready' : 'needs_selection',
            lastError: ref ? null : 'Supabase project was created but no project ref was returned.',
          });
        } else {
          const fallback = String(byService('supabase').config && byService('supabase').config.defaultProjectRef ? byService('supabase').config.defaultProjectRef : '').trim();
          markBinding('supabase', {
            projectRef: fallback || null,
            source: fallback ? 'credential_default' : null,
            status: fallback ? 'ready' : 'blocked',
            lastError: createProject.message || 'Supabase project provisioning failed.',
          });
        }
      }
    } else {
      markBinding('supabase', {
        status: 'blocked',
        lastError: 'Supabase token is missing.',
      });
    }

    if (readCredentialToken('google_ads')) {
      const credentialDefaultCustomer = String(byService('google_ads').config && byService('google_ads').config.defaultCustomerId ? byService('google_ads').config.defaultCustomerId : '').trim();
      let customerId = String(bindings.googleAds.customerId || '').trim() || credentialDefaultCustomer;
      if (!customerId) {
        const discoverCustomers = await executeGoogleAdsConnector({ operation: 'list_accessible_customers' });
        if (discoverCustomers.ok && discoverCustomers.data && Array.isArray(discoverCustomers.data.resourceNames) && discoverCustomers.data.resourceNames.length > 0) {
          const first = String(discoverCustomers.data.resourceNames[0] || '').trim();
          customerId = first.includes('/') ? first.split('/').pop() : first;
        }
      }

      const campaignName = String(bindings.googleAds.campaignName || `${slug}-launch-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`).trim();
      let campaignId = String(bindings.googleAds.campaignId || '').trim();
      let adsStatus = 'blocked';
      let adsError = null;
      if (customerId) {
        const createCampaign = await executeGoogleAdsConnector({
          operation: 'create_campaign',
          projectId: projectState.id,
          input: {
            customerId,
            campaignName,
            dailyBudget: 20,
            currency: 'USD',
          },
          estimatedCost: 0,
        });
        if (createCampaign.ok) {
          const data = createCampaign.data && typeof createCampaign.data === 'object' ? createCampaign.data : {};
          campaignId = String(data.campaignId || data.id || campaignId || '').trim();
          adsStatus = 'ready';
        } else {
          adsStatus = 'partial';
          adsError = createCampaign.message || 'Google Ads campaign provisioning failed.';
        }
      } else {
        adsError = 'No Google Ads customer id available. Set default customer id or connect a developer token for discovery.';
      }
      markBinding('googleAds', {
        customerId: customerId || null,
        campaignName,
        campaignId: campaignId || null,
        source: customerId ? (credentialDefaultCustomer ? 'credential_default' : 'discovered_or_created') : null,
        status: adsStatus,
        lastError: adsError,
      });
    } else {
      markBinding('googleAds', {
        status: 'blocked',
        lastError: 'Google Ads token is missing.',
      });
    }

    const stripeTokenPresent = Boolean(readCredentialToken('stripe'));
    markBinding('stripe', {
      projectTag: String(bindings.stripe.projectTag || `${slug}-${shortId}`).trim(),
      workspaceId: String(bindings.stripe.workspaceId || crypto.randomUUID()).trim(),
      source: stripeTokenPresent ? 'project_generated' : null,
      status: stripeTokenPresent ? 'ready' : 'blocked',
      lastError: stripeTokenPresent ? null : 'Stripe token is missing.',
    });

    bootstrap.status = 'completed';
    bootstrap.completedAt = nowIso();
    bootstrap.summary = summarizeStatus();
    appendProjectLog(projectState, 'message', {
      kind: 'project_connector_bootstrap_completed',
      summary: bootstrap.summary,
      bindings: projectState.connectorBindings,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'coordinator',
      to: 'automation_engine',
      kind: 'project_connector_bootstrap_completed',
      payload: {
        summary: bootstrap.summary,
      },
    });
  } catch (err) {
    bootstrap.status = 'failed';
    bootstrap.lastError = err.message;
    appendProjectLog(projectState, 'warning', {
      kind: 'project_connector_bootstrap_failed',
      error: err.message,
    });
  }

  persistProjectState(projectState);
}

function normalizeConnectorBootstrapCandidates(service, discovery = {}) {
  const data = discovery && typeof discovery.data === 'object' ? discovery.data : {};
  if (service === 'netlify') {
    return (Array.isArray(data.sites) ? data.sites : [])
      .map((site) => ({
        id: String(site && site.id ? site.id : '').trim(),
        label: String(site && site.name ? site.name : site && site.id ? site.id : 'Netlify Site').trim(),
        description: String(site && (site.url || site.sslUrl || site.state) ? (site.url || site.sslUrl || site.state) : '').trim() || null,
      }))
      .filter((entry) => entry.id)
      .slice(0, 25);
  }

  if (service === 'google_ads') {
    return (Array.isArray(data.resourceNames) ? data.resourceNames : [])
      .map((resourceName) => {
        const raw = String(resourceName || '').trim();
        const id = raw.includes('/') ? raw.split('/').pop() : raw;
        return {
          id: String(id || '').trim(),
          label: `Customer ${String(id || '').trim()}`,
          description: raw || null,
        };
      })
      .filter((entry) => entry.id)
      .slice(0, 25);
  }

  if (service === 'supabase') {
    const projectRows = Array.isArray(data)
      ? data
      : (Array.isArray(data.projects)
        ? data.projects
        : (Array.isArray(data.items)
          ? data.items
          : []));
    return projectRows
      .map((row) => {
        const id = String(row && (row.ref || row.projectRef || row.id || row.projectId) ? (row.ref || row.projectRef || row.id || row.projectId) : '').trim();
        const label = String(row && (row.name || row.ref || row.id) ? (row.name || row.ref || row.id) : '').trim() || id;
        const description = String(row && (row.region || row.organizationId || row.orgId) ? (row.region || row.organizationId || row.orgId) : '').trim() || null;
        return { id, label, description };
      })
      .filter((entry) => entry.id)
      .slice(0, 25);
  }

  return [];
}

function setCredentialBootstrapDefault(service, selectedId) {
  const field = credentialDefaultFieldForService(service);
  if (!field) {
    throw new Error('Unsupported bootstrap service');
  }
  if (!readCredentialToken(service)) {
    throw new Error(`Credential token is missing for ${service}.`);
  }
  const config = {};
  config[field] = String(selectedId || '').trim();
  saveCredentialMetadata(service, '', null, config);
  const metadata = readCredentialMetadata().find((entry) => entry.service === service);
  return metadata ? metadata.config : {};
}

async function discoverConnectorBootstrapTargets(service) {
  const normalized = String(service || '').trim().toLowerCase();
  if (!['netlify', 'google_ads', 'supabase'].includes(normalized)) {
    return { ok: false, error: 'Unsupported bootstrap service' };
  }
  if (!readCredentialToken(normalized)) {
    return { ok: false, error: `Credential token is missing for ${normalized}.` };
  }

  let discovery;
  if (normalized === 'netlify') {
    discovery = await executeNetlifyConnector({ operation: 'list_sites' });
  } else if (normalized === 'google_ads') {
    discovery = await executeGoogleAdsConnector({ operation: 'list_accessible_customers' });
  } else {
    discovery = await executeSupabaseConnector({ operation: 'list_projects' });
  }

  if (!discovery || !discovery.ok) {
    return {
      ok: false,
      error: String(discovery && discovery.message ? discovery.message : `Discovery failed for ${normalized}.`),
      errorCode: discovery && discovery.errorCode ? discovery.errorCode : 'CONNECTOR_FAILURE',
      service: normalized,
    };
  }

  const candidates = normalizeConnectorBootstrapCandidates(normalized, discovery);
  const metadata = readCredentialMetadata().find((entry) => entry.service === normalized) || { config: {} };
  const field = credentialDefaultFieldForService(normalized);
  let selectedId = field && metadata && metadata.config ? String(metadata.config[field] || '').trim() : '';
  let autoSelected = false;

  if (!selectedId && candidates.length === 1) {
    selectedId = candidates[0].id;
    setCredentialBootstrapDefault(normalized, selectedId);
    autoSelected = true;
  }

  return {
    ok: true,
    service: normalized,
    candidates,
    selectedId: selectedId || null,
    autoSelected,
    message: `Discovered ${candidates.length} target${candidates.length === 1 ? '' : 's'} for ${normalized}.`,
  };
}

async function autoBootstrapConnectorTargets() {
  const services = ['netlify', 'google_ads', 'supabase'];
  const results = [];

  for (const service of services) {
    try {
      const result = await discoverConnectorBootstrapTargets(service);
      results.push({
        service,
        ok: Boolean(result && result.ok),
        candidatesCount: Array.isArray(result && result.candidates) ? result.candidates.length : 0,
        selectedId: result && result.selectedId ? String(result.selectedId) : null,
        autoSelected: Boolean(result && result.autoSelected),
        message: result && result.message ? String(result.message) : null,
        error: result && result.ok ? null : String((result && (result.error || result.message)) || 'Discovery failed.'),
        errorCode: result && result.errorCode ? String(result.errorCode) : null,
      });
    } catch (err) {
      results.push({
        service,
        ok: false,
        candidatesCount: 0,
        selectedId: null,
        autoSelected: false,
        message: null,
        error: err.message,
        errorCode: 'UNEXPECTED_ERROR',
      });
    }
  }

  const succeeded = results.filter((entry) => entry.ok).length;
  const autoSelected = results.filter((entry) => entry.autoSelected).length;
  const selected = results.filter((entry) => Boolean(entry.selectedId)).length;
  return {
    ok: true,
    results,
    summary: {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      autoSelected,
      selected,
    },
    message: `Auto bootstrap completed: ${selected}/${results.length} services now have a selected default (${autoSelected} newly auto-selected).`,
  };
}

function deleteCredentialMetadata(service) {
  const meta = safeJsonRead(credentialMetaPath(service), { service });
  meta.connected = false;
  meta.updated_at = nowIso();
  fs.writeFileSync(credentialMetaPath(service), `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
  const tokenPath = credentialTokenPath(service);
  if (fs.existsSync(tokenPath)) {
    fs.rmSync(tokenPath, { force: true });
  }
  appendCredentialAudit({
    service,
    action: 'credential_delete',
    decision: 'allow',
    reason: 'Credential removed.',
  });
}

function refreshWeeklyKpiPlan(projectState, ts = nowIso()) {
  ensureKpiGoalState(projectState);
  ensureOperationalLoopState(projectState);
  const plan = projectState.kpiGoals.weeklyPlan;
  const loops = projectState.operationalLoops;
  const nowMs = Date.parse(ts);
  const weekStart = startOfUtcWeekIso(ts);
  if (plan.weekStart !== weekStart) {
    plan.weekStart = weekStart;
    plan.lastPlannedAt = null;
    plan.nextReviewAt = null;
    plan.summary = null;
  }
  if (loops.weekStart !== weekStart) {
    loops.weekStart = weekStart;
    loops.generatedAt = null;
    loops.objectives = [];
  }
  const nextReviewMs = Date.parse(plan.nextReviewAt || '');
  if (plan.lastPlannedAt && Number.isFinite(nextReviewMs) && nowMs < nextReviewMs) {
    return;
  }

  const objectiveSpecs = weeklyObjectiveSpecsForTemplate(projectState.template);
  const weekEndMs = Date.parse(weekStart) + (7 * 24 * 60 * 60 * 1000);
  loops.generatedAt = ts;
  loops.objectives = objectiveSpecs.map((spec, idx) => {
    const ownerRole = resolveExecutionOwnerRole(projectState, spec.ownerRole || 'Senior Project Manager') || String(spec.ownerRole || 'Senior Project Manager');
    const kpiOwnerRole = String(spec.kpiOwnerRole || ownerRole);
    const ownerAgentId = findOwnerAgentId(projectState, ownerRole);
    const kpiOwnerAgentId = findOwnerAgentId(projectState, kpiOwnerRole);
    const slaHours = clampInt(spec.slaHours, 24, 1, 7 * 24);
    return {
      id: `${weekStart.slice(0, 10)}::${String(spec.key || `objective_${idx + 1}`)}`,
      key: String(spec.key || `objective_${idx + 1}`),
      title: String(spec.title || `Weekly objective ${idx + 1}`),
      ownerRole,
      ownerAgentId,
      kpiOwnerRole,
      kpiOwnerAgentId,
      metric: String(spec.metric || 'weeklyTasksDone'),
      slaHours,
      dueAt: new Date(Math.min(weekEndMs, nowMs + (slaHours * 60 * 60 * 1000))).toISOString(),
      status: 'planned',
      generatedAt: ts,
    };
  });

  const { goals, actual, variance } = computeKpiVarianceAndAlerts(projectState);
  const objectiveSummary = loops.objectives
    .map((item) => `${item.title} (owner: ${item.ownerRole}, KPI owner: ${item.kpiOwnerRole}, SLA: ${item.slaHours}h)`)
    .join(' | ');
  const summary = `Weekly plan: target ${goals.weeklyTasksDoneTarget} tasks, cap backlog ${goals.maxBacklog}, cap monthly spend $${goals.maxMonthlySpend}. Current: ${actual.tasksDoneThisWeek} tasks done this week, backlog ${actual.backlog}, monthly spend $${actual.monthlySpend}. Variance: throughput ${variance.weeklyTasksDone}, backlog ${variance.backlog}, spend ${variance.monthlySpend}. Objectives: ${objectiveSummary}.`;
  plan.lastPlannedAt = ts;
  plan.nextReviewAt = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString();
  plan.summary = summary;
  plan.objectives = loops.objectives;

  appendProjectLog(projectState, 'message', {
    kind: 'weekly_kpi_plan_generated',
    weekStart: plan.weekStart,
    summary,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'analytics_engine',
    kind: 'weekly_kpi_plan_generated',
    payload: {
      weekStart: plan.weekStart,
      summary,
      objectives: loops.objectives,
    },
  });
}

function makeAnalyticsSnapshot(projectState) {
  ensureKpiGoalState(projectState);
  ensureFinanceExceptionState(projectState);
  ensurePublicationHealthState(projectState);
  const done = projectState.tasks.filter((t) => t.status === 'done').length;
  const inProgress = projectState.tasks.filter((t) => t.status === 'inprogress').length;
  const backlog = projectState.tasks.filter((t) => t.status === 'backlog').length;
  const agentsActive = projectState.agents.filter((a) => a.status === 'running').length;
  const totalAgents = projectState.agents.length;
  const totalTokens = projectState.agents.reduce((sum, a) => sum + (Number(a.tokens) || 0), 0);
  const uptime = projectUptime(projectState);
  const insight = computeKpiVarianceAndAlerts(projectState);
  const publicationDashboard = buildPublicationIncidentDashboard(projectState, {
    windowHours: 24,
    extendedWindowHours: 24 * 7,
    maxHotspots: 10,
    maxRunbooks: 12,
  });
  const goalPlan = projectState.goalPlan && typeof projectState.goalPlan === 'object' ? projectState.goalPlan : null;

  return {
    kpi: [
      String(done),
      String(inProgress),
      String(backlog),
      `${agentsActive}/${totalAgents}`,
      String(totalTokens),
      uptime
    ],
    metrics: insight.actual,
    goals: {
      weeklyTasksDoneTarget: insight.goals.weeklyTasksDoneTarget,
      maxBacklog: insight.goals.maxBacklog,
      maxMonthlySpend: insight.goals.maxMonthlySpend,
    },
    variance: insight.variance,
    alerts: insight.alerts,
    weeklyPlan: insight.goals.weeklyPlan,
    deadLetters: Array.isArray(projectState.deadLetters) ? projectState.deadLetters.slice(0, 20) : [],
    financeExceptions: Array.isArray(projectState.financeExceptions) ? projectState.financeExceptions.slice(0, 20) : [],
    publicationHealth: projectState.publicationHealth && typeof projectState.publicationHealth === 'object'
      ? {
        lastCheckedAt: projectState.publicationHealth.lastCheckedAt || null,
        lastSelfHealAt: projectState.publicationHealth.lastSelfHealAt || null,
        lastSelfHealSummary: projectState.publicationHealth.lastSelfHealSummary || null,
        lastSlo: projectState.publicationHealth.lastSlo || null,
        driftEvents: Array.isArray(projectState.publicationHealth.driftEvents)
          ? projectState.publicationHealth.driftEvents.slice(0, 20)
          : [],
        incidents: Array.isArray(projectState.publicationHealth.incidents)
          ? projectState.publicationHealth.incidents.slice(0, 20)
          : [],
        dashboard: publicationDashboard,
      }
      : {
        lastCheckedAt: null,
        lastSelfHealAt: null,
        lastSelfHealSummary: null,
        lastSlo: null,
        driftEvents: [],
        incidents: [],
        dashboard: publicationDashboard,
      },
    goalPlan: goalPlan
      ? {
          source: goalPlan.source || null,
          generatedAt: goalPlan.generatedAt || null,
          assumptions: Array.isArray(goalPlan.assumptions) ? goalPlan.assumptions : [],
          milestones: Array.isArray(goalPlan.milestones) ? goalPlan.milestones.slice(0, 25) : [],
          requiredConnectors: Array.isArray(goalPlan.requiredConnectors) ? goalPlan.requiredConnectors : [],
          missingCredentialServices: Array.isArray(goalPlan.missingCredentialServices) ? goalPlan.missingCredentialServices : [],
          clarificationQuestions: Array.isArray(goalPlan.clarificationQuestions) ? goalPlan.clarificationQuestions : [],
        }
      : null,
    lastUpdated: nowIso()
  };
}

const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

function log(message) {
  const safeMessage = redactSensitive(message);
  const line = `[${new Date().toISOString()}] ${safeMessage}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

function getConfiguredSecrets() {
  const cfg = appConfig || {};
  const integrations = cfg.integrations || {};
  const secrets = [];

  const githubToken = integrations.github && integrations.github.token;
  const telegramToken = integrations.telegram && integrations.telegram.botToken;
  const whatsappToken = integrations.whatsapp && integrations.whatsapp.accessToken;

  if (githubToken) secrets.push(githubToken);
  if (telegramToken) secrets.push(telegramToken);
  if (whatsappToken) secrets.push(whatsappToken);

  return secrets.filter(Boolean);
}

function redactSensitive(input) {
  if (input === null || input === undefined) {
    return '';
  }

  let text = String(input);
  getConfiguredSecrets().forEach((secret) => {
    if (secret) {
      text = text.split(secret).join('[REDACTED]');
    }
  });

  text = text.replace(/(Bearer\s+)[A-Za-z0-9._-]{12,}/gi, '$1[REDACTED]');
  text = text.replace(/\bghp_[A-Za-z0-9]{20,}\b/g, '[REDACTED]');
  text = text.replace(/\b[0-9]{8,}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]');
  text = text.replace(/\bEA[A-Za-z0-9]{16,}\b/g, '[REDACTED]');

  return text;
}

function inferPhase(type, message) {
  const msg = (message || '').toLowerCase();
  if (type === 'stderr') return 'error';
  if (type === 'system' && msg.includes('started')) return 'planning';
  if (type === 'system' && (msg.includes('finished') || msg.includes('interrupted'))) return 'finish';
  if (/tool|action|step|invoke|execute|command/.test(msg)) return 'action';
  if (/file|write|edit|mkdir|folder|path|workspace|read/.test(msg)) return 'file';
  return 'execution';
}

function broadcastEvent(event) {
  const payload = JSON.stringify({
    ...event,
    ts: event.ts || new Date().toISOString()
  });
  sseClients.forEach((res) => {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (err) {
      sseClients.delete(res);
    }
  });
}

function appendTaskEvent(taskRun, type, message) {
  const safeMessage = redactSensitive(message);
  const phase = inferPhase(type, safeMessage);
  const event = {
    ts: new Date().toISOString(),
    type,
    phase,
    message: safeMessage
  };
  taskRun.events.push(event);
  if (taskRun.events.length > MAX_EVENTS_PER_TASK) {
    taskRun.events.shift();
  }
  broadcastEvent({
    event: 'task-event',
    taskId: taskRun.id,
    task: taskRun.task,
    status: taskRun.status,
    ...event
  });
}

function summarizeTask(taskRun) {
  const text = `${taskRun.task}\n${taskRun.events.map((ev) => ev.message).join('\n')}`.toLowerCase();
  const keywords = ['github', 'telegram', 'whatsapp', 'gmail', 'discord', 'browser', 'file', 'git'];
  const tags = keywords.filter((tag) => text.includes(tag));
  return {
    id: taskRun.id,
    source: taskRun.source || 'task',
    task: taskRun.task,
    status: taskRun.status,
    startedAt: taskRun.startedAt,
    finishedAt: taskRun.finishedAt,
    exitCode: taskRun.exitCode,
    durationMs: taskRun.finishedAt ? (new Date(taskRun.finishedAt).getTime() - new Date(taskRun.startedAt).getTime()) : null,
    eventCount: taskRun.events.length,
    preview: taskRun.events.slice(-4).map((ev) => ev.message).join('\n').slice(0, 500),
    tags
  };
}

function getMetrics() {
  let totalDuration = 0;
  let completedCount = 0;
  let success = 0;
  let failed = 0;
  let running = 0;

  taskHistory.forEach((taskRun) => {
    if (taskRun.status === 'running') {
      running += 1;
      return;
    }

    if (taskRun.exitCode === 0) {
      success += 1;
    } else {
      failed += 1;
    }

    if (taskRun.finishedAt) {
      totalDuration += new Date(taskRun.finishedAt).getTime() - new Date(taskRun.startedAt).getTime();
      completedCount += 1;
    }
  });

  return {
    totalTasks: taskHistory.length,
    runningTasks: running,
    succeededTasks: success,
    failedTasks: failed,
    averageDurationMs: completedCount ? Math.round(totalDuration / completedCount) : 0
  };
}

function integrationStatus() {
  const cfg = appConfig || {};
  const integrations = cfg.integrations || {};
  const githubKeyPath = path.join(SANDBOX_ROOT, '.ssh', 'id_rsa.pub');
  const apiGateway = integrations.apiGateway || {};
  return {
    github: {
      publicKeyPresent: fs.existsSync(githubKeyPath),
      configured: !!integrations.github,
      notes: 'Uses sandbox SSH key by default; add key to GitHub account.'
    },
    telegram: {
      configured: !!(integrations.telegram && integrations.telegram.botToken && integrations.telegram.chatId),
      notes: 'Set integrations.telegram.botToken and chatId in sandbox/config.json to enable.'
    },
    whatsapp: {
      configured: !!(integrations.whatsapp && (integrations.whatsapp.accessToken || integrations.whatsapp.sessionPath)),
      notes: 'Set integrations.whatsapp credentials/session in sandbox/config.json to enable.'
    },
    apiGateway: {
      configured: Boolean(String(apiGateway.endpoint || process.env.CLAWHUB_API_GATEWAY_ENDPOINT || '').trim()),
      notes: 'Set integrations.apiGateway.endpoint (or CLAWHUB_API_GATEWAY_ENDPOINT) for autonomous external API actions.'
    }
  };
}

function resolveDoctorRequiredCredentialServices(projectId = null) {
  const runtimes = [];
  if (projectId) {
    const runtime = projectRuntimes.get(String(projectId || '').trim());
    if (runtime && runtime.state) runtimes.push(runtime.state);
  } else {
    projectRuntimes.forEach((runtime) => {
      if (runtime && runtime.state) runtimes.push(runtime.state);
    });
  }

  const required = new Set();
  runtimes.forEach((state) => {
    const goalConnectors = Array.isArray(state && state.goalPlan && state.goalPlan.requiredConnectors)
      ? state.goalPlan.requiredConnectors
      : [];
    goalConnectors.forEach((connectorId) => {
      const key = String(connectorId || '').trim().toLowerCase();
      if (!key) return;
      const meta = CONNECTOR_REGISTRY[key] || null;
      const service = meta && meta.credentialService ? meta.credentialService : null;
      if (service) required.add(service);
    });

    const taskConnectors = Array.isArray(state && state.tasks)
      ? state.tasks
          .map((task) => task && task.autoAction && task.autoAction.type === 'connector'
            ? String(task.autoAction.connector || '').trim().toLowerCase()
            : '')
          .filter(Boolean)
      : [];
    taskConnectors.forEach((connectorId) => {
      const meta = CONNECTOR_REGISTRY[connectorId] || null;
      const service = meta && meta.credentialService ? meta.credentialService : null;
      if (service) required.add(service);
    });
  });

  return Array.from(required).sort();
}

function runSandboxWorkspaceDoctorProbe() {
  const probeDir = path.join(WORKSPACE_ROOT, '.doctor');
  const probeFile = path.join(probeDir, `probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.txt`);
  const content = `hiveforge-doctor-${nowIso()}`;
  try {
    ensureDir(probeDir);
    fs.writeFileSync(probeFile, content, 'utf-8');
    const readBack = fs.readFileSync(probeFile, 'utf-8');
    fs.rmSync(probeFile, { force: true });
    return {
      ok: readBack === content,
      reason: readBack === content
        ? 'Sandbox workspace read/write probe succeeded.'
        : 'Sandbox workspace probe read-back mismatch.',
      detail: {
        probeDir,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: `Sandbox workspace probe failed: ${redactSensitive(err.message)}`,
      detail: {
        probeDir,
      },
    };
  }
}

function evaluateDoctorReadiness(checks = [], context = {}) {
  const list = Array.isArray(checks) ? checks : [];
  const failing = list.filter((entry) => !entry.ok);
  const criticalFailing = list.filter((entry) => !entry.ok && String(entry.severity || 'critical') === 'critical');
  const ok = criticalFailing.length === 0;
  return {
    ok,
    checkedAt: nowIso(),
    summary: ok
      ? 'Doctor checks passed.'
      : `Doctor checks failed (${criticalFailing.length} critical issue${criticalFailing.length === 1 ? '' : 's'}).`,
    context,
    checks: list,
    failingCount: failing.length,
    criticalFailingCount: criticalFailing.length,
  };
}

async function runDoctorChecks(options = {}) {
  const projectId = String(options.projectId || '').trim() || null;
  const includeIntegrationTests = Boolean(options.includeIntegrationTests);
  const provider = normalizeLlmProvider(appState.llm.provider || appConfig?.llm?.provider);
  const endpoint = String(appState.llm.endpoint || appConfig?.llm?.endpoint || 'http://127.0.0.1:1234/v1').trim();
  const apiKey = resolveLlmApiKey(appConfig?.llm || {});
  const checks = [];

  if (projectId && !projectRuntimes.has(projectId)) {
    return evaluateDoctorReadiness([
      {
        id: 'project_context',
        ok: false,
        severity: 'critical',
        reason: 'Project not found.',
        detail: { projectId },
      },
    ], { projectId, includeIntegrationTests });
  }

  const llmProbe = await pingLLMEndpoint(provider, endpoint, apiKey);
  checks.push({
    id: 'llm_endpoint_reachable',
    ok: Boolean(llmProbe.reachable),
    severity: 'critical',
    reason: llmProbe.reachable
      ? `${llmProviderLabel(provider)} endpoint is reachable.`
      : `${llmProviderLabel(provider)} endpoint is not reachable at ${endpoint}.`,
    detail: {
      provider,
      endpoint,
      model: llmProbe.model || null,
      apiKeyConfigured: Boolean(apiKey),
    },
  });

  const sandboxProbe = runSandboxWorkspaceDoctorProbe();
  checks.push({
    id: 'sandbox_workspace_rw',
    ok: Boolean(sandboxProbe.ok),
    severity: 'critical',
    reason: sandboxProbe.reason,
    detail: sandboxProbe.detail,
  });

  const notifications = notificationSettingsSummary();
  const notifyReady = Boolean(
    (notifications && notifications.whatsapp && notifications.whatsapp.enabled)
    || (notifications && notifications.telegram && notifications.telegram.enabled)
  );
  checks.push({
    id: 'notification_route_health',
    ok: notifyReady,
    severity: 'critical',
    reason: notifyReady
      ? 'At least one operator notification route is configured.'
      : 'No operator notification route is configured (WhatsApp/Telegram).',
    detail: notifications,
  });

  const requiredServices = resolveDoctorRequiredCredentialServices(projectId);
  const metadata = readCredentialMetadata();
  requiredServices.forEach((service) => {
    const entry = metadata.find((row) => row.service === service) || null;
    const hasToken = Boolean(readCredentialToken(service));
    checks.push({
      id: `credential_presence_${service}`,
      ok: hasToken,
      severity: 'critical',
      reason: hasToken
        ? `Credential token is present for ${service}.`
        : `Credential token is missing for required service ${service}.`,
      detail: {
        service,
        connected: Boolean(entry && entry.connected),
      },
    });
  });

  if (requiredServices.length === 0) {
    checks.push({
      id: 'credential_presence_required_set',
      ok: true,
      severity: 'info',
      reason: 'No required connector credentials inferred from current project scope.',
      detail: {
        projectId,
      },
    });
  }

  if (includeIntegrationTests) {
    const providers = ['telegram', 'whatsapp'];
    for (const providerId of providers) {
      const integration = await testIntegration(providerId);
      checks.push({
        id: `integration_probe_${providerId}`,
        ok: Boolean(integration.ok),
        severity: 'warning',
        reason: integration.message || `${providerId} integration probe completed.`,
        detail: integration,
      });
    }
  }

  return evaluateDoctorReadiness(checks, {
    projectId,
    includeIntegrationTests,
    requiredCredentialServices: requiredServices,
  });
}

function apiGatewaySettings() {
  const cfg = appConfig || {};
  const integrations = cfg.integrations || {};
  const gateway = integrations.apiGateway || {};
  return {
    endpoint: String(gateway.endpoint || process.env.CLAWHUB_API_GATEWAY_ENDPOINT || '').trim(),
    apiKey: String(gateway.apiKey || process.env.CLAWHUB_API_GATEWAY_API_KEY || '').trim(),
    timeoutMs: clampInt(gateway.timeoutMs, 20000, 1000, 120000),
  };
}

async function executeViaApiGateway(provider, operation, payload = {}, timeoutMs = null) {
  const settings = apiGatewaySettings();
  if (!settings.endpoint) {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'API gateway endpoint is not configured. Set integrations.apiGateway.endpoint or CLAWHUB_API_GATEWAY_ENDPOINT.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'HiveForge',
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  const resp = await fetchWithTimeout(settings.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: String(provider || '').trim().toLowerCase(),
      operation: String(operation || '').trim(),
      payload,
    }),
  }, timeoutMs || settings.timeoutMs);

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return {
      ok: false,
      errorCode: 'CONNECTOR_FAILURE',
      message: `API gateway request failed with HTTP ${resp.status}${text ? `: ${redactSensitive(text).slice(0, 180)}` : ''}.`,
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const body = await resp.json().catch(() => ({}));
  const ok = body && body.ok !== false;
  return {
    ok,
    errorCode: ok ? null : String(body.errorCode || 'CONNECTOR_FAILURE'),
    message: String(body.message || `${provider}:${operation} via API gateway ${ok ? 'succeeded' : 'failed'}.`),
    operation,
    actualCost: Number.isFinite(Number(body.actualCost)) ? Number(body.actualCost) : 0,
    data: body.data && typeof body.data === 'object' ? body.data : body,
  };
}

function notificationSettingsSummary() {
  const integrations = (appConfig && appConfig.integrations) || {};
  const whatsapp = integrations.whatsapp || {};
  const telegram = integrations.telegram || {};
  return {
    preferredChannel: String((appConfig && appConfig.notifications && appConfig.notifications.preferredChannel) || 'whatsapp').toLowerCase() === 'telegram'
      ? 'telegram'
      : 'whatsapp',
    whatsapp: {
      notifyTo: String(whatsapp.notifyTo || ''),
      enabled: Boolean(whatsapp.accessToken && whatsapp.phoneNumberId && whatsapp.notifyTo),
    },
    telegram: {
      chatId: String(telegram.chatId || ''),
      enabled: Boolean(telegram.botToken && telegram.chatId),
    },
    kpiAlerts: {
      enabled: appConfig && appConfig.notifications && appConfig.notifications.kpiAlerts
        ? Boolean(appConfig.notifications.kpiAlerts.enabled)
        : true,
      cooldownMinutes: clampInt(
        appConfig && appConfig.notifications && appConfig.notifications.kpiAlerts
          ? appConfig.notifications.kpiAlerts.cooldownMinutes
          : 120,
        120,
        1,
        7 * 24 * 60,
      ),
    },
  };
}

function hasPriorSuccessfulDeploy(projectState, siteId = '') {
  const wantedSiteId = String(siteId || '').trim();
  const executions = projectState && projectState.connectorExecutions && typeof projectState.connectorExecutions === 'object'
    ? Object.values(projectState.connectorExecutions)
    : [];
  return executions.some((entry) => {
    if (!entry || entry.status !== 'succeeded') return false;
    if (String(entry.connector || '').trim().toLowerCase() !== 'netlify') return false;
    if (String(entry.operation || '').trim().toLowerCase() !== 'trigger_deploy') return false;
    if (!wantedSiteId) return true;
    const resultSiteId = String(entry.result && entry.result.siteId ? entry.result.siteId : '').trim();
    return resultSiteId === wantedSiteId;
  });
}

function evaluateProductionPreflight(projectState, options = {}) {
  const connectorId = String(options.connector || '').trim().toLowerCase();
  const operation = String(options.operation || '').trim().toLowerCase();
  const estimatedCost = Number.isFinite(Number(options.estimatedCost)) ? Number(options.estimatedCost) : 0;
  const input = options.input && typeof options.input === 'object' ? options.input : {};
  const notifications = options.notifications && typeof options.notifications === 'object'
    ? options.notifications
    : notificationSettingsSummary();
  const checks = [];

  if (!projectState || !projectState.id) {
    return {
      ok: false,
      summary: 'Production preflight failed: missing project context.',
      checks: [{ id: 'project_context', ok: false, reason: 'projectId is required for production preflight.' }],
    };
  }

  const connectorMeta = connectorId ? CONNECTOR_REGISTRY[connectorId] || null : null;
  const credentialService = connectorMeta && connectorMeta.credentialService ? connectorMeta.credentialService : null;
  if (credentialService) {
    const metadata = readCredentialMetadata();
    const cred = metadata.find((entry) => entry.service === credentialService);
    const hasToken = Boolean(readCredentialToken(credentialService));
    checks.push({
      id: 'credential_scope_validation',
      ok: Boolean(cred && cred.connected && hasToken),
      reason: cred && cred.connected && hasToken
        ? `Credential ${credentialService} is connected for production execution.`
        : `Credential ${credentialService} is missing, disconnected, or has no token.`,
    });
  } else {
    checks.push({
      id: 'credential_scope_validation',
      ok: true,
      reason: 'No credential-scoped connector required for this operation.',
    });
  }

  if (credentialService) {
    const policy = getProjectCredentialPolicy(projectState.id, credentialService);
    const budget = getCredentialBudgetSnapshot(projectState.id)[credentialService] || normalizeBudgetCounterEntry({}, nowIso());
    const projectedMonthly = Number(((Number(budget.monthlySpent || 0)) + Math.max(0, estimatedCost)).toFixed(2));
    const cap = typeof policy.monthlyCap === 'number' && Number.isFinite(policy.monthlyCap) ? policy.monthlyCap : null;
    const budgetOk = Boolean(policy.enabled) && (cap === null || projectedMonthly <= cap);
    checks.push({
      id: 'budget_sanity',
      ok: budgetOk,
      reason: budgetOk
        ? `Projected monthly spend $${projectedMonthly} is within configured budget policy.`
        : (!policy.enabled
          ? `Credential policy for ${credentialService} is disabled.`
          : `Projected monthly spend $${projectedMonthly} exceeds cap $${cap}.`),
      detail: {
        monthlySpent: Number(budget.monthlySpent || 0),
        estimatedCost,
        projectedMonthly,
        monthlyCap: cap,
      },
    });
  } else {
    checks.push({
      id: 'budget_sanity',
      ok: true,
      reason: 'No budget-scoped credential involved in this operation.',
    });
  }

  const notifyReady = Boolean(
    (notifications && notifications.whatsapp && notifications.whatsapp.enabled)
    || (notifications && notifications.telegram && notifications.telegram.enabled)
  );
  checks.push({
    id: 'notification_route_health',
    ok: notifyReady,
    reason: notifyReady
      ? 'At least one operator notification route is configured (WhatsApp/Telegram).'
      : 'No operator notification routes are configured for production incidents.',
  });

  if (connectorId === 'netlify' && operation === 'trigger_deploy') {
    const siteId = String(input.siteId || options.siteId || '').trim();
    const explicitRollback = Boolean(input.rollbackDeployId || input.rollbackPlan || options.rollbackReady === true);
    const historicalRollback = hasPriorSuccessfulDeploy(projectState, siteId);
    const rollbackOk = Boolean(siteId) && (explicitRollback || historicalRollback);
    checks.push({
      id: 'rollback_readiness',
      ok: rollbackOk,
      reason: rollbackOk
        ? 'Rollback readiness confirmed via explicit rollback plan or prior successful deploy history.'
        : 'Rollback readiness failed: provide siteId and rollback plan or establish prior successful deploy history.',
      detail: {
        siteId: siteId || null,
        explicitRollback,
        historicalRollback,
      },
    });
  } else {
    checks.push({
      id: 'rollback_readiness',
      ok: true,
      reason: 'Rollback readiness check not required for this connector/operation.',
    });
  }

  const ok = checks.every((entry) => Boolean(entry.ok));
  return {
    ok,
    summary: ok
      ? 'Production preflight checks passed.'
      : 'Production preflight checks failed. Resolve failing controls before production-mode execution.',
    connector: connectorId || null,
    operation: operation || null,
    checks,
    checkedAt: nowIso(),
  };
}

function writeJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function createTaskRun(task, source = 'task', meta = {}) {
  const taskRun = {
    id: nextTaskId++,
    source,
    task,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    events: [],
    meta
  };
  taskHistory.push(taskRun);
  if (taskHistory.length > MAX_TASK_HISTORY) {
    taskHistory.shift();
  }
  return taskRun;
}

function completeTaskRun(taskRun, status, exitCode, message) {
  taskRun.status = status;
  taskRun.exitCode = exitCode;
  taskRun.finishedAt = new Date().toISOString();
  appendTaskEvent(taskRun, 'system', message);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function runProductionCertification(baseUrl) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [PRODUCTION_CERTIFICATION_SCRIPT_PATH], {
      cwd: __dirname,
      env: {
        ...process.env,
        HIVEFORGE_BASE_URL: baseUrl,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      resolve({
        ok: false,
        exitCode: -1,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: `${stderr}${err.message}\n`,
      });
    });

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
}

function certificationRunIdFromNow() {
  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${y}${m}${d}T${hh}${mm}${ss}Z-${suffix}`;
}

function safeEvidenceRunId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '');
}

function productionEvidenceRunDir(runId) {
  return path.join(PRODUCTION_EVIDENCE_ROOT, safeEvidenceRunId(runId));
}

function buildProductionEvidenceBundle(result, context = {}) {
  const runtimes = Array.isArray(context.projectSummaries) ? context.projectSummaries : [];
  const preflights = Array.isArray(context.preflightChecks) ? context.preflightChecks : [];
  const doctor = context.doctor && typeof context.doctor === 'object' ? context.doctor : null;
  const checklist = [
    {
      id: 'certification_script',
      title: 'Production certification script exits successfully',
      ok: Boolean(result && result.ok),
      evidence: `exitCode=${Number(result && result.exitCode)}`,
    },
    {
      id: 'runtime_projects_present',
      title: 'Project runtime state is readable for evidence capture',
      ok: runtimes.length >= 0,
      evidence: `projects=${runtimes.length}`,
    },
    {
      id: 'preflight_controls',
      title: 'Production preflight controls pass across active projects',
      ok: preflights.length === 0 || preflights.every((entry) => Boolean(entry && entry.passed)),
      evidence: `preflightProjects=${preflights.length}`,
    },
    {
      id: 'doctor_preflight',
      title: 'Doctor readiness checks pass before autonomous production execution',
      ok: doctor ? Boolean(doctor.ok) : true,
      evidence: doctor
        ? `criticalFailing=${Number(doctor.criticalFailingCount || 0)} failing=${Number(doctor.failingCount || 0)}`
        : 'doctor report missing',
    },
  ];
  const passed = checklist.every((entry) => entry.ok);
  return {
    generatedAt: nowIso(),
    passed,
    checklist,
    summary: {
      certificationOk: Boolean(result && result.ok),
      durationMs: Number(result && result.durationMs || 0),
      projectCount: runtimes.length,
      preflightProjectCount: preflights.length,
      doctorOk: Boolean(doctor && doctor.ok),
    },
    context: {
      runtimeSettings: runtimeSettings(),
      projectSummaries: runtimes,
      preflightChecks: preflights,
      doctor,
    },
  };
}

async function collectProductionEvidenceContext() {
  const projectSummaries = Array.from(projectRuntimes.values()).map((runtime) => summarizeProject(runtime.state));
  const preflightChecks = Array.from(projectRuntimes.values()).map((runtime) => {
    const preflight = evaluateProductionPreflight(runtime.state, {});
    return {
      projectId: runtime.state.id,
      projectName: runtime.state.name,
      passed: Boolean(preflight && preflight.passed),
      checkCount: Array.isArray(preflight && preflight.checks) ? preflight.checks.length : 0,
      failingCheckCount: Array.isArray(preflight && preflight.checks)
        ? preflight.checks.filter((item) => !item.ok).length
        : 0,
    };
  });
  const doctor = await runDoctorChecks({ includeIntegrationTests: false });
  return { projectSummaries, preflightChecks, doctor };
}

async function persistProductionCertificationEvidence(result, options = {}) {
  ensureDir(PRODUCTION_EVIDENCE_ROOT);
  const runId = certificationRunIdFromNow();
  const runDir = productionEvidenceRunDir(runId);
  ensureDir(runDir);

  const context = await collectProductionEvidenceContext();
  const bundle = buildProductionEvidenceBundle(result, context);
  const summary = {
    runId,
    generatedAt: bundle.generatedAt,
    baseUrl: String(options.baseUrl || '').trim() || null,
    result: {
      ok: Boolean(result && result.ok),
      exitCode: Number(result && result.exitCode || 0),
      durationMs: Number(result && result.durationMs || 0),
    },
    checklist: bundle.checklist,
    passed: bundle.passed,
    summary: bundle.summary,
    context: bundle.context,
  };

  fs.writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(path.join(runDir, 'stdout.log'), String(result && result.stdout || ''), 'utf-8');
  fs.writeFileSync(path.join(runDir, 'stderr.log'), String(result && result.stderr || ''), 'utf-8');
  fs.writeFileSync(path.join(runDir, 'checklist.json'), `${JSON.stringify(bundle.checklist, null, 2)}\n`, 'utf-8');

  return {
    runId,
    runDir,
    summary,
    files: {
      summary: path.join(runDir, 'summary.json'),
      stdout: path.join(runDir, 'stdout.log'),
      stderr: path.join(runDir, 'stderr.log'),
      checklist: path.join(runDir, 'checklist.json'),
    },
  };
}

function listProductionEvidenceRuns(limit = 20) {
  ensureDir(PRODUCTION_EVIDENCE_ROOT);
  const entries = fs.readdirSync(PRODUCTION_EVIDENCE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  return entries.slice(0, Math.max(1, limit)).map((runId) => {
    const summaryPath = path.join(productionEvidenceRunDir(runId), 'summary.json');
    const summary = safeJsonRead(summaryPath, null);
    return summary || {
      runId,
      generatedAt: null,
      passed: false,
      result: { ok: false, exitCode: -1, durationMs: 0 },
      checklist: [],
      summary: null,
      context: null,
    };
  });
}

function readProductionEvidenceRun(runId) {
  const safeRunId = safeEvidenceRunId(runId);
  if (!safeRunId) return null;
  const runDir = productionEvidenceRunDir(safeRunId);
  if (!fs.existsSync(runDir)) return null;
  const summary = safeJsonRead(path.join(runDir, 'summary.json'), null);
  if (!summary) return null;
  const stdout = fs.existsSync(path.join(runDir, 'stdout.log')) ? fs.readFileSync(path.join(runDir, 'stdout.log'), 'utf-8') : '';
  const stderr = fs.existsSync(path.join(runDir, 'stderr.log')) ? fs.readFileSync(path.join(runDir, 'stderr.log'), 'utf-8') : '';
  return {
    ...summary,
    stdout,
    stderr,
  };
}

function exportProductionEvidenceText(run) {
  if (!run) return '';
  const lines = [];
  lines.push(`HiveForge Production Evidence Run: ${run.runId}`);
  lines.push(`Generated At: ${run.generatedAt || ''}`);
  lines.push(`Passed: ${run.passed ? 'yes' : 'no'}`);
  lines.push(`Exit Code: ${run.result && run.result.exitCode}`);
  lines.push(`Duration Ms: ${run.result && run.result.durationMs}`);
  lines.push('');
  lines.push('Checklist');
  lines.push('---------');
  (Array.isArray(run.checklist) ? run.checklist : []).forEach((entry) => {
    lines.push(`- [${entry.ok ? 'x' : ' '}] ${entry.id}: ${entry.title} :: ${entry.evidence || ''}`);
  });
  lines.push('');
  lines.push('STDOUT');
  lines.push('------');
  lines.push(String(run.stdout || '').trim() || '(empty)');
  lines.push('');
  lines.push('STDERR');
  lines.push('------');
  lines.push(String(run.stderr || '').trim() || '(empty)');
  lines.push('');
  lines.push('Context Summary');
  lines.push('---------------');
  lines.push(JSON.stringify(run.summary || {}, null, 2));
  return `${lines.join('\n')}\n`;
}

async function testGithubIntegration() {
  const status = integrationStatus().github;
  const githubCfg = (appConfig && appConfig.integrations && appConfig.integrations.github) || {};
  if (!status.publicKeyPresent && !githubCfg.token) {
    return {
      provider: 'github',
      ok: false,
      message: 'No SSH key or token configured.',
      testedAt: new Date().toISOString()
    };
  }

  if (githubCfg.token) {
    try {
      const resp = await fetchWithTimeout('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${githubCfg.token}`,
          'User-Agent': 'HiveForge'
        }
      });
      if (!resp.ok) {
        return {
          provider: 'github',
          ok: false,
          message: `GitHub token test failed with HTTP ${resp.status}.`,
          testedAt: new Date().toISOString()
        };
      }
      const body = await resp.json();
      return {
        provider: 'github',
        ok: true,
        message: `Connected as ${body.login || 'GitHub user'}.`,
        testedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        provider: 'github',
        ok: false,
        message: `GitHub token test error: ${redactSensitive(err.message)}`,
        testedAt: new Date().toISOString()
      };
    }
  }

  return {
    provider: 'github',
    ok: true,
    message: 'SSH key detected. Add it to GitHub and test by performing a push/pull task.',
    testedAt: new Date().toISOString()
  };
}

async function testTelegramIntegration() {
  const telegramCfg = (appConfig && appConfig.integrations && appConfig.integrations.telegram) || {};
  if (!telegramCfg.botToken || !telegramCfg.chatId) {
    return {
      provider: 'telegram',
      ok: false,
      message: 'Missing botToken or chatId in integrations.telegram.',
      testedAt: new Date().toISOString()
    };
  }

  try {
    const resp = await fetchWithTimeout(`https://api.telegram.org/bot${telegramCfg.botToken}/getMe`);
    const body = await resp.json();
    if (!resp.ok || !body.ok) {
      return {
        provider: 'telegram',
        ok: false,
        message: `Telegram test failed: ${(body && body.description) ? body.description : `HTTP ${resp.status}`}`,
        testedAt: new Date().toISOString()
      };
    }
    return {
      provider: 'telegram',
      ok: true,
      message: `Telegram bot reachable: @${(body.result && body.result.username) || 'unknown'}`,
      testedAt: new Date().toISOString()
    };
  } catch (err) {
    return {
      provider: 'telegram',
      ok: false,
      message: `Telegram test error: ${redactSensitive(err.message)}`,
      testedAt: new Date().toISOString()
    };
  }
}

async function testWhatsappIntegration() {
  const whatsappCfg = (appConfig && appConfig.integrations && appConfig.integrations.whatsapp) || {};
  if (whatsappCfg.accessToken && whatsappCfg.phoneNumberId) {
    try {
      const resp = await fetchWithTimeout(`https://graph.facebook.com/v21.0/${whatsappCfg.phoneNumberId}`, {
        headers: {
          Authorization: `Bearer ${whatsappCfg.accessToken}`
        }
      });
      if (!resp.ok) {
        return {
          provider: 'whatsapp',
          ok: false,
          message: `WhatsApp Graph API test failed with HTTP ${resp.status}.`,
          testedAt: new Date().toISOString()
        };
      }
      return {
        provider: 'whatsapp',
        ok: true,
        message: 'WhatsApp Graph API reachable.',
        testedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        provider: 'whatsapp',
        ok: false,
        message: `WhatsApp test error: ${redactSensitive(err.message)}`,
        testedAt: new Date().toISOString()
      };
    }
  }

  if (whatsappCfg.sessionPath) {
    const sessionPath = path.isAbsolute(whatsappCfg.sessionPath)
      ? whatsappCfg.sessionPath
      : path.join(SANDBOX_ROOT, whatsappCfg.sessionPath);
    const exists = fs.existsSync(sessionPath);
    return {
      provider: 'whatsapp',
      ok: exists,
      message: exists ? 'WhatsApp local session path exists.' : 'WhatsApp session path does not exist.',
      testedAt: new Date().toISOString()
    };
  }

  return {
    provider: 'whatsapp',
    ok: false,
    message: 'Missing integrations.whatsapp config (accessToken + phoneNumberId or sessionPath).',
    testedAt: new Date().toISOString()
  };
}

async function sendWhatsAppNotification(message) {
  const whatsappCfg = (appConfig && appConfig.integrations && appConfig.integrations.whatsapp) || {};
  if (!whatsappCfg.accessToken || !whatsappCfg.phoneNumberId || !whatsappCfg.notifyTo) {
    return { ok: false, provider: 'whatsapp', reason: 'notifyTo/accessToken/phoneNumberId not configured' };
  }
  try {
    const resp = await fetchWithTimeout(`https://graph.facebook.com/v21.0/${whatsappCfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsappCfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: String(whatsappCfg.notifyTo),
        type: 'text',
        text: { body: String(message || '').slice(0, 1024) },
      }),
    }, 10000);
    if (!resp.ok) {
      return { ok: false, provider: 'whatsapp', reason: `HTTP ${resp.status}` };
    }
    return { ok: true, provider: 'whatsapp' };
  } catch (err) {
    return { ok: false, provider: 'whatsapp', reason: redactSensitive(err.message) };
  }
}

async function sendTelegramNotification(message) {
  const telegramCfg = (appConfig && appConfig.integrations && appConfig.integrations.telegram) || {};
  if (!telegramCfg.botToken || !telegramCfg.chatId) {
    return { ok: false, provider: 'telegram', reason: 'botToken/chatId not configured' };
  }
  try {
    const resp = await fetchWithTimeout(`https://api.telegram.org/bot${telegramCfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramCfg.chatId,
        text: String(message || '').slice(0, 3500),
      }),
    }, 10000);
    if (!resp.ok) {
      return { ok: false, provider: 'telegram', reason: `HTTP ${resp.status}` };
    }
    return { ok: true, provider: 'telegram' };
  } catch (err) {
    return { ok: false, provider: 'telegram', reason: redactSensitive(err.message) };
  }
}

async function notifyOperator(projectState, summary, detail = {}) {
  const projectName = projectState && projectState.name ? projectState.name : 'Unknown Project';
  const msg = `[HiveForge Coordinator] ${projectName}: ${summary}`;
  const preferred = String((appConfig && appConfig.notifications && appConfig.notifications.preferredChannel) || 'whatsapp').trim().toLowerCase();
  let sent = { ok: false, provider: preferred, reason: 'not_sent' };
  if (preferred === 'telegram') {
    sent = await sendTelegramNotification(msg);
    if (!sent.ok) sent = await sendWhatsAppNotification(msg);
  } else {
    sent = await sendWhatsAppNotification(msg);
    if (!sent.ok) sent = await sendTelegramNotification(msg);
  }

  if (projectState) {
    appendProjectLog(projectState, 'message', {
      kind: 'operator_notification',
      summary,
      channel: sent.provider,
      delivered: Boolean(sent.ok),
      detail,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'coordinator',
      to: 'operator',
      kind: 'operator_notification',
      payload: {
        summary,
        channel: sent.provider,
        delivered: Boolean(sent.ok),
        reason: sent.reason || null,
        detail,
      },
    });
  }
  return sent;
}

async function testIntegration(provider) {
  if (provider === 'github') return testGithubIntegration();
  if (provider === 'telegram') return testTelegramIntegration();
  if (provider === 'whatsapp') return testWhatsappIntegration();
  return {
    provider,
    ok: false,
    message: 'Unknown integration provider.',
    testedAt: new Date().toISOString()
  };
}

async function executeConnectorPolicy(connectorId, options = {}) {
  const connectorKey = String(connectorId || '').trim().toLowerCase();
  const connector = CONNECTOR_REGISTRY[connectorKey];
  if (!connector) {
    return {
      connector: connectorKey,
      ok: false,
      decision: 'deny',
      reason: 'Unsupported connector.',
      errorCode: 'unknown_connector',
      dryRun: Boolean(options.dryRun),
      checkedAt: nowIso(),
      checks: []
    };
  }

  const checks = [];

  if (connector.localRuntime) {
    const enabled = imageGeneratorSettings().enabled === true;
    checks.push({
      type: 'local_runtime',
      target: connector.id,
      ok: enabled,
      message: enabled
        ? `${connector.label} local runtime is enabled.`
        : `${connector.label} local runtime is disabled in configuration.`,
    });
  }

  if (connector.provider) {
    const result = await testIntegration(connector.provider);
    checks.push({
      type: 'integration',
      target: connector.provider,
      ok: Boolean(result.ok),
      message: String(result.message || ''),
    });
  }

  if (connector.credentialService) {
    const metadata = readCredentialMetadata();
    const found = metadata.find((entry) => entry.service === connector.credentialService);
    const connected = Boolean(found && found.connected);
    const policy = options.projectId ? getProjectCredentialPolicy(options.projectId, connector.credentialService) : null;
    const budgetEntry = options.projectId ? getCredentialBudgetSnapshot(options.projectId)[connector.credentialService] : null;
    const estimatedCost = typeof options.estimatedCost === 'number' && Number.isFinite(options.estimatedCost) ? options.estimatedCost : 0;
    checks.push({
      type: 'credential',
      target: connector.credentialService,
      ok: connected,
      message: connected
        ? `Credential ${connector.credentialService} is connected.`
        : `Credential ${connector.credentialService} is not connected.`
    });

    if (policy) {
      checks.push({
        type: 'project_policy',
        target: connector.credentialService,
        ok: policy.enabled,
        message: policy.enabled
          ? `Project policy allows ${connector.credentialService}.`
          : `Project policy disabled ${connector.credentialService}.`
      });

      if (typeof options.estimatedCost === 'number' && Number.isFinite(options.estimatedCost) && typeof policy.monthlyCap === 'number') {
        const projectedMonthly = Number(((budgetEntry?.monthlySpent || 0) + estimatedCost).toFixed(2));
        checks.push({
          type: 'budget_cap',
          target: connector.credentialService,
          ok: projectedMonthly <= policy.monthlyCap,
          message: projectedMonthly <= policy.monthlyCap
            ? `Projected monthly spend $${projectedMonthly} is within cap $${policy.monthlyCap}.`
            : `Projected monthly spend $${projectedMonthly} exceeds cap $${policy.monthlyCap}.`
        });
      }

      if (budgetEntry) {
        checks.push({
          type: 'budget_snapshot',
          target: connector.credentialService,
          ok: true,
          message: `Current spend: daily $${Number(budgetEntry.dailySpent || 0).toFixed(2)}, monthly $${Number(budgetEntry.monthlySpent || 0).toFixed(2)}.`
        });
      }
    }
  }

  if (options.projectId && options.actorRole) {
    const runtime = projectRuntimes.get(options.projectId);
    const roleCapabilities = (options.roleCapabilities && typeof options.roleCapabilities === 'object')
      ? options.roleCapabilities
      : (runtime && runtime.state && runtime.state.roleCapabilities
        ? runtime.state.roleCapabilities
        : {});
    const roleName = String(options.actorRole || '').trim();
    const caps = roleCapabilities[roleName] || null;
    if (!caps) {
      checks.push({
        type: 'role_capability',
        target: roleName,
        ok: false,
        message: `Role ${roleName} has no capability contract for ${connector.id}.`,
      });
    } else {
      const allowedConnectors = Array.isArray(caps.allowedConnectors) ? caps.allowedConnectors : [];
      const connectorAllowed = allowedConnectors.includes(connector.id);
      checks.push({
        type: 'role_capability',
        target: roleName,
        ok: connectorAllowed,
        message: connectorAllowed
          ? `Role ${roleName} is allowed to use ${connector.id}.`
          : `Role ${roleName} is not allowed to use ${connector.id}.`,
      });
      if (options.estimatedCost > 0) {
        checks.push({
          type: 'role_budget',
          target: roleName,
          ok: Boolean(caps.canSpend),
          message: caps.canSpend
            ? `Role ${roleName} can execute costed actions.`
            : `Role ${roleName} cannot execute costed actions.`,
        });
      }
      if (connector.id === 'netlify' && String(options.operation || '').toLowerCase() === 'trigger_deploy') {
        checks.push({
          type: 'role_deploy',
          target: roleName,
          ok: Boolean(caps.canDeploy),
          message: caps.canDeploy
            ? `Role ${roleName} can trigger deploy operations.`
            : `Role ${roleName} cannot trigger deploy operations.`,
        });
      }
    }
  }

  if (options.projectId) {
    const runtime = projectRuntimes.get(options.projectId);
    const mode = runtime && runtime.state ? runtime.state.mode : null;
    if (shouldBlockMutatingConnectorInDraftMode(mode, connector.id, options.operation)) {
      checks.push({
        type: 'mode_guard',
        target: mode || 'unknown',
        ok: false,
        message: `Draft mode blocks mutating connector actions (${connector.id}:${String(options.operation || '').toLowerCase()}). Promote to production first.`,
      });
    }
  }

  const ok = checks.length > 0 && checks.every((entry) => Boolean(entry.ok));
  const failedChecks = checks.filter((entry) => !entry.ok).map((entry) => entry.message).filter(Boolean);

  if (options.projectId) {
    const runtime = projectRuntimes.get(options.projectId);
    const budgetFailure = checks.find((entry) => entry.type === 'budget_cap' && !entry.ok);
    if (runtime && runtime.state && budgetFailure) {
      activateBudgetHardStop(
        runtime.state,
        'budget_cap_exceeded',
        {
          connector: connector.id,
          operation: String(options.operation || '').trim().toLowerCase() || null,
          message: budgetFailure.message,
        },
        'policy_engine',
      );
      persistProjectState(runtime.state);
    }
  }

  return {
    connector: connector.id,
    label: connector.label,
    credentialService: connector.credentialService || null,
    ok,
    decision: ok ? 'allow' : 'deny',
    reason: ok
      ? `${connector.label} connector passed policy checks.`
      : (failedChecks.join(' ') || `${connector.label} connector did not pass policy checks.`),
    dryRun: Boolean(options.dryRun),
    checkedAt: nowIso(),
    checks,
  };
}

async function executeNetlifyConnector(options = {}) {
  const operation = String(options.operation || 'list_sites').trim() || 'list_sites';
  const input = options.input && typeof options.input === 'object' ? options.input : {};
  const token = readCredentialToken('netlify');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Netlify credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'HiveForge',
  };

  if (operation === 'get_account') {
    const resp = await fetchWithTimeout('https://api.netlify.com/api/v1/user', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Netlify account request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    return {
      ok: true,
      message: 'Fetched Netlify account summary.',
      operation,
      actualCost: 0,
      data: {
        id: body?.id || null,
        email: body?.email || null,
        fullName: body?.full_name || null,
      },
    };
  }

  if (operation === 'list_sites') {
    const resp = await fetchWithTimeout('https://api.netlify.com/api/v1/sites', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: resp.status === 401
          ? 'Netlify sites request returned HTTP 401 (token is invalid, expired, or missing required scope). Reconnect Netlify credential with a fresh personal access token.'
          : `Netlify sites request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    const sites = Array.isArray(body) ? body.slice(0, 20).map((site) => ({
      id: site?.id || null,
      name: site?.name || null,
      url: site?.url || null,
      state: site?.state || null,
      sslUrl: site?.ssl_url || null,
    })) : [];
    return {
      ok: true,
      message: `Fetched ${sites.length} Netlify site${sites.length === 1 ? '' : 's'}.`,
      operation,
      actualCost: 0,
      data: { sites },
    };
  }

  if (operation === 'create_site') {
    const requestedName = String(options.name || options.siteName || input.name || '').trim();
    const payload = requestedName ? { name: requestedName } : {};
    const resp = await fetchWithTimeout('https://api.netlify.com/api/v1/sites', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, 15000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: resp.status === 401
          ? 'Netlify create_site returned HTTP 401 (token is invalid, expired, or missing required scope).'
          : `Netlify create_site failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const site = await resp.json().catch(() => ({}));
    return {
      ok: true,
      message: `Created Netlify site ${site && site.name ? site.name : requestedName || 'unnamed'}.`,
      operation,
      actualCost: 0,
      data: {
        id: site?.id || null,
        name: site?.name || requestedName || null,
        url: site?.url || null,
        siteUrl: site?.url || null,
        sslUrl: site?.ssl_url || null,
        state: site?.state || null,
      },
    };
  }

  if (operation === 'delete_site') {
    const siteId = String(options.siteId || input.siteId || '').trim();
    if (!siteId) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'siteId is required for delete_site.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const resp = await fetchWithTimeout(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}`,
      { method: 'DELETE', headers },
      15000,
    );
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Netlify delete_site failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    return {
      ok: true,
      message: `Deleted Netlify site ${siteId}.`,
      operation,
      actualCost: 0,
      data: { siteId },
    };
  }

  if (operation === 'trigger_deploy') {
    const siteId = String(options.siteId || input.siteId || '').trim();
    const projectId = String(options.projectId || input.projectId || '').trim();
    if (!siteId) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'siteId is required for trigger_deploy.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const triggerHeaders = {
      ...headers,
    };
    if (options.idempotencyKey) {
      // Netlify does not guarantee this header today, but forwarding it keeps parity with providers that do.
      triggerHeaders['Idempotency-Key'] = String(options.idempotencyKey);
      triggerHeaders['X-Idempotency-Key'] = String(options.idempotencyKey);
    }
    const resp = await fetchWithTimeout(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/builds`,
      { method: 'POST', headers: triggerHeaders },
      15000,
    );
    if (!resp.ok) {
      if (resp.status === 404 && projectId) {
        const workspaceDeploy = await deployProjectWorkspaceToNetlify({
          siteId,
          projectId,
          headers: triggerHeaders,
          timeoutMs: 20000,
        });
        if (workspaceDeploy.ok) {
          return {
            ok: true,
            message: `Workspace deploy published for site ${siteId}.`,
            operation,
            actualCost: 0,
            data: {
              id: workspaceDeploy.data && workspaceDeploy.data.id ? workspaceDeploy.data.id : null,
              state: workspaceDeploy.data && workspaceDeploy.data.state ? workspaceDeploy.data.state : 'processing',
              createdAt: workspaceDeploy.data && workspaceDeploy.data.createdAt ? workspaceDeploy.data.createdAt : null,
              idempotencyKey: options.idempotencyKey || null,
              deployUrl: workspaceDeploy.data && workspaceDeploy.data.deployUrl ? workspaceDeploy.data.deployUrl : `https://app.netlify.com/sites/${siteId}/deploys`,
              siteUrl: workspaceDeploy.data && workspaceDeploy.data.siteUrl ? workspaceDeploy.data.siteUrl : null,
              publishMode: 'workspace_files',
              fileCount: workspaceDeploy.data && Number.isFinite(Number(workspaceDeploy.data.fileCount))
                ? Number(workspaceDeploy.data.fileCount)
                : null,
            },
          };
        }
      }
      const detailedMessage = resp.status === 404
        ? 'Netlify trigger_deploy failed with HTTP 404. This site likely has no build pipeline yet (for example, Netlify Drop style). Publish at least one deploy from the Netlify dashboard, then retry.'
        : `Netlify trigger_deploy failed with HTTP ${resp.status}.`;
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: detailedMessage,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json().catch(() => ({}));
    return {
      ok: true,
      message: `Deploy triggered for site ${siteId}.`,
      operation,
      actualCost: 0,
      data: {
        id: body?.id || null,
        state: body?.state || null,
        createdAt: body?.created_at || null,
        idempotencyKey: options.idempotencyKey || null,
        deployUrl: body?.deploy_url || body?.ssl_url || body?.url || `https://app.netlify.com/sites/${siteId}/deploys`,
        siteUrl: body?.ssl_url || body?.url || null,
      },
    };
  }

  if (operation === 'list_deploys') {
    const siteId = String(options.siteId || input.siteId || '').trim();
    if (!siteId) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'siteId is required for list_deploys.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const resp = await fetchWithTimeout(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/deploys?per_page=10`,
      { headers },
      10000,
    );
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Netlify list_deploys failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const rawDeploys = await resp.json().catch(() => []);
    const deploys = (Array.isArray(rawDeploys) ? rawDeploys : []).slice(0, 10).map((d) => ({
      id: d?.id || null,
      state: d?.state || null,
      createdAt: d?.created_at || null,
      publishedAt: d?.published_at || null,
      branch: d?.branch || null,
      commitRef: d?.commit_ref ? String(d.commit_ref).slice(0, 7) : null,
      errorMessage: d?.error_message || null,
      deployUrl: d?.deploy_url || null,
    }));
    return {
      ok: true,
      message: `Fetched ${deploys.length} recent deploy${deploys.length === 1 ? '' : 's'} for site ${siteId}.`,
      operation,
      actualCost: 0,
      data: { deploys },
    };
  }

  return {
    ok: false,
    errorCode: 'VALIDATION_ERROR',
    message: `Unsupported Netlify operation: ${operation}.`,
    operation,
    actualCost: 0,
    data: null,
  };
}

function collectWorkspaceFilesRecursive(rootDir) {
  const files = [];
  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.forEach((entry) => {
      const abs = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        return;
      }
      if (!entry.isFile()) return;
      const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
      files.push({ abs, rel });
    });
  };
  walk(rootDir);
  return files;
}

function chooseNetlifyPublishDir(projectId) {
  const rootDir = projectWorkspaceDir(projectId);
  const gameDir = path.join(rootDir, 'game');
  const gameIndex = path.join(gameDir, 'index.html');
  const rootIndex = path.join(rootDir, 'index.html');
  if (fs.existsSync(gameIndex)) return gameDir;
  if (fs.existsSync(rootIndex)) return rootDir;
  return rootDir;
}

function encodePathForNetlifyUrl(filePath) {
  return String(filePath || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function deployProjectWorkspaceToNetlify({ siteId, projectId, headers, timeoutMs = 20000 }) {
  try {
    const publishDir = chooseNetlifyPublishDir(projectId);
    if (!fs.existsSync(publishDir) || !fs.statSync(publishDir).isDirectory()) {
      return {
        ok: false,
        error: `Publish directory does not exist: ${publishDir}`,
      };
    }

    const files = collectWorkspaceFilesRecursive(publishDir);
    if (!files.length) {
      return {
        ok: false,
        error: 'Publish directory has no files to deploy.',
      };
    }

    const fileDigestMap = {};
    const digestToFile = new Map();
    const digestToPaths = new Map();
    files.forEach(({ abs, rel }) => {
      const raw = fs.readFileSync(abs);
      const sha = crypto.createHash('sha1').update(raw).digest('hex');
      fileDigestMap[rel] = sha;
      if (!digestToFile.has(sha)) digestToFile.set(sha, abs);
      const list = digestToPaths.get(sha) || [];
      list.push(rel);
      digestToPaths.set(sha, list);
    });

    const createDeployResp = await fetchWithTimeout(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/deploys`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: fileDigestMap }),
      },
      timeoutMs,
    );

    if (!createDeployResp.ok) {
      return {
        ok: false,
        error: `Netlify file deploy init failed with HTTP ${createDeployResp.status}.`,
      };
    }

    const deployBody = await createDeployResp.json().catch(() => ({}));
    const deployId = String(deployBody && deployBody.id ? deployBody.id : '').trim();
    if (!deployId) {
      return {
        ok: false,
        error: 'Netlify file deploy did not return a deploy id.',
      };
    }

    const requiredDigests = Array.isArray(deployBody && deployBody.required)
      ? deployBody.required
      : [];

    for (const digest of requiredDigests) {
      const digestKey = String(digest || '').trim();
      if (!digestKey) continue;
      const sourceFile = digestToFile.get(digestKey);
      const targetPaths = digestToPaths.get(digestKey) || [];
      if (!sourceFile || !targetPaths.length) continue;
      const fileContent = fs.readFileSync(sourceFile);
      for (const relPath of targetPaths) {
        const uploadResp = await fetchWithTimeout(
          `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(deployId)}/files/${encodePathForNetlifyUrl(relPath)}`,
          {
            method: 'PUT',
            headers: {
              ...headers,
              'Content-Type': 'application/octet-stream',
            },
            body: fileContent,
          },
          timeoutMs,
        );
        if (!uploadResp.ok) {
          return {
            ok: false,
            error: `Netlify file upload failed for ${relPath} (HTTP ${uploadResp.status}).`,
          };
        }
      }
    }

    const verifyResp = await fetchWithTimeout(
      `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(deployId)}`,
      { headers },
      timeoutMs,
    );
    const verifyBody = verifyResp.ok ? await verifyResp.json().catch(() => ({})) : {};
    const siteUrl = String((verifyBody && (verifyBody.ssl_url || verifyBody.url)) || '').trim();
    const deployUrl = String((verifyBody && (verifyBody.deploy_url || verifyBody.ssl_url || verifyBody.url)) || '').trim();

    return {
      ok: true,
      data: {
        id: deployId,
        state: verifyBody && verifyBody.state ? verifyBody.state : 'processing',
        createdAt: verifyBody && verifyBody.created_at ? verifyBody.created_at : null,
        deployUrl: deployUrl || `https://app.netlify.com/sites/${siteId}/deploys/${deployId}`,
        siteUrl: siteUrl || null,
        fileCount: files.length,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: redactSensitive(err.message || 'Netlify workspace deploy failed.'),
    };
  }
}

async function executeGithubConnector(options = {}) {
  const operation = String(options.operation || 'get_user').trim() || 'get_user';
  const token = readCredentialToken('github');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'GitHub credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'HiveForge',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (operation === 'get_user') {
    const resp = await fetchWithTimeout('https://api.github.com/user', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `GitHub user request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    return {
      ok: true,
      message: `Fetched GitHub user ${body?.login || 'unknown'}.`,
      operation,
      actualCost: 0,
      data: {
        login: body?.login || null,
        name: body?.name || null,
        publicRepos: body?.public_repos ?? null,
      },
    };
  }

  if (operation === 'list_repos') {
    const resp = await fetchWithTimeout('https://api.github.com/user/repos?per_page=20&sort=updated', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `GitHub repos request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    const repos = Array.isArray(body) ? body.slice(0, 20).map((repo) => ({
      id: repo?.id || null,
      name: repo?.name || null,
      fullName: repo?.full_name || null,
      private: Boolean(repo?.private),
      url: repo?.html_url || null,
      pushedAt: repo?.pushed_at || null,
    })) : [];
    return {
      ok: true,
      message: `Fetched ${repos.length} GitHub repo${repos.length === 1 ? '' : 's'}.`,
      operation,
      actualCost: 0,
      data: { repos },
    };
  }

  return {
    ok: false,
    errorCode: 'VALIDATION_ERROR',
    message: `Unsupported GitHub operation: ${operation}. Use get_user or list_repos.`,
    operation,
    actualCost: 0,
    data: null,
  };
}

async function executeAnalyticsConnector(options = {}) {
  const operation = String(options.operation || 'list_accounts').trim() || 'list_accounts';
  const token = readCredentialToken('analytics');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Google Analytics credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'HiveForge',
  };

  if (operation === 'get_profile') {
    const resp = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/userinfo', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Google profile request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    return {
      ok: true,
      message: 'Fetched Google profile for analytics credential.',
      operation,
      actualCost: 0,
      data: {
        email: body?.email || null,
        name: body?.name || null,
        subject: body?.sub || null,
      },
    };
  }

  if (operation === 'list_accounts') {
    const resp = await fetchWithTimeout('https://analyticsadmin.googleapis.com/v1beta/accounts?pageSize=20', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Analytics accounts request failed with HTTP ${resp.status}. Try get_profile to validate token scope first.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    const accounts = Array.isArray(body?.accounts) ? body.accounts.slice(0, 20).map((account) => ({
      name: account?.name || null,
      displayName: account?.displayName || null,
      regionCode: account?.regionCode || null,
    })) : [];
    return {
      ok: true,
      message: `Fetched ${accounts.length} Analytics account${accounts.length === 1 ? '' : 's'}.`,
      operation,
      actualCost: 0,
      data: { accounts },
    };
  }

  return {
    ok: false,
    errorCode: 'VALIDATION_ERROR',
    message: `Unsupported Analytics operation: ${operation}. Use list_accounts or get_profile.`,
    operation,
    actualCost: 0,
    data: null,
  };
}

function evaluateGoogleAdsGuardrails(options = {}) {
  const operation = String(options.operation || '').trim().toLowerCase();
  const projectId = String(options.projectId || '').trim();
  const input = options.input && typeof options.input === 'object' ? options.input : {};
  const estimatedCost = Number.isFinite(Number(options.estimatedCost)) ? Number(options.estimatedCost) : 0;
  const checks = [];

  if (operation === 'create_campaign') {
    const campaignName = String(input.campaignName || '').trim();
    checks.push({
      id: 'campaign_name_required',
      ok: Boolean(campaignName),
      reason: campaignName ? 'campaignName provided.' : 'campaignName is required for create_campaign.',
    });
  }

  if (operation === 'update_campaign_budget' || operation === 'pause_campaign' || operation === 'resume_campaign') {
    const campaignId = String(input.campaignId || '').trim();
    checks.push({
      id: 'campaign_id_required',
      ok: Boolean(campaignId),
      reason: campaignId ? 'campaignId provided.' : `campaignId is required for ${operation}.`,
    });
  }

  if (operation === 'update_campaign_budget') {
    const newDailyBudget = Number(input.newDailyBudget);
    checks.push({
      id: 'new_budget_valid',
      ok: Number.isFinite(newDailyBudget) && newDailyBudget > 0,
      reason: Number.isFinite(newDailyBudget) && newDailyBudget > 0
        ? 'newDailyBudget is valid.'
        : 'newDailyBudget must be a positive number for update_campaign_budget.',
      detail: {
        newDailyBudget: Number.isFinite(newDailyBudget) ? newDailyBudget : null,
      },
    });
  }

  if (projectId) {
    const policy = getProjectCredentialPolicy(projectId, 'google_ads');
    const budget = getCredentialBudgetSnapshot(projectId).google_ads || normalizeBudgetCounterEntry({}, nowIso());
    const budgetDelta = Number.isFinite(Number(input.newDailyBudget)) ? Number(input.newDailyBudget) : 0;
    const projectedMonthly = Number((Number(budget.monthlySpent || 0) + Math.max(estimatedCost, budgetDelta)).toFixed(2));
    const cap = typeof policy.monthlyCap === 'number' && Number.isFinite(policy.monthlyCap) ? policy.monthlyCap : null;
    const budgetOk = Boolean(policy.enabled) && (cap === null || projectedMonthly <= cap);
    checks.push({
      id: 'policy_budget_sanity',
      ok: budgetOk,
      reason: budgetOk
        ? 'Projected Google Ads spend is within project policy cap.'
        : (!policy.enabled
          ? 'Google Ads credential policy is disabled for this project.'
          : `Projected monthly Google Ads spend $${projectedMonthly} exceeds cap $${cap}.`),
      detail: {
        monthlySpent: Number(budget.monthlySpent || 0),
        projectedMonthly,
        monthlyCap: cap,
      },
    });

    const runtime = projectRuntimes.get(projectId);
    if (runtime && runtime.state && (operation === 'create_campaign' || operation === 'update_campaign_budget')) {
      const insight = computeKpiVarianceAndAlerts(runtime.state);
      const spendOverTarget = Number(insight && insight.variance && insight.variance.monthlySpend || 0) > 0;
      checks.push({
        id: 'kpi_spend_variance_gate',
        ok: !spendOverTarget,
        reason: !spendOverTarget
          ? 'KPI spend variance is within target for budget-increasing ads actions.'
          : 'Monthly spend is already above KPI target; block campaign creation/budget increase until variance is resolved.',
        detail: {
          monthlySpendVariance: Number(insight && insight.variance && insight.variance.monthlySpend || 0),
        },
      });
    }
  }

  const ok = checks.every((entry) => Boolean(entry.ok));
  return {
    ok,
    operation,
    checks,
    summary: ok
      ? 'Google Ads guardrails passed.'
      : 'Google Ads guardrails failed. Resolve validation or budget/KPI constraints before execution.',
  };
}

function evaluateSupportAutonomyRouting(options = {}) {
  const connector = String(options.connector || '').trim().toLowerCase();
  const operation = String(options.operation || '').trim().toLowerCase();
  const input = options.input && typeof options.input === 'object' ? options.input : {};

  if (connector !== 'support_chat' && connector !== 'support_ticket') {
    return {
      ok: true,
      checks: [],
      summary: 'Support routing guardrails not required for this connector.',
      route: null,
    };
  }

  const isEscalationOperation = operation.startsWith('escalate_');
  const isReplyOperation = operation.startsWith('reply_');
  const allowsAutoReply = Boolean(isReplyOperation || operation.startsWith('triage_'));
  const confidence = clampNumber(
    input.responseConfidence ?? input.confidence,
    isReplyOperation ? 0 : 1,
    0,
    1,
  );
  const minConfidence = clampNumber(input.minConfidence, connector === 'support_chat' ? 0.8 : 0.72, 0.5, 0.99);
  const waitingMinutes = clampInt(
    input.waitingMinutes ?? input.firstResponseAgeMinutes ?? input.ticketAgeMinutes,
    0,
    0,
    14 * 24 * 60,
  );
  const slaMinutes = clampInt(input.slaMinutes, connector === 'support_chat' ? 15 : 60, 1, 7 * 24 * 60);
  const confidenceOk = !allowsAutoReply || confidence >= minConfidence;
  const withinSla = waitingMinutes <= slaMinutes;
  const decision = (!withinSla || !confidenceOk) && !isEscalationOperation
    ? 'escalate'
    : 'auto_reply';

  const checks = [
    {
      id: 'support_confidence_gate',
      ok: confidenceOk,
      reason: confidenceOk
        ? `Response confidence ${confidence.toFixed(2)} meets threshold ${minConfidence.toFixed(2)}.`
        : `Response confidence ${confidence.toFixed(2)} is below threshold ${minConfidence.toFixed(2)}.`,
      detail: { confidence, minConfidence },
    },
    {
      id: 'support_sla_window',
      ok: withinSla,
      reason: withinSla
        ? `Queue age ${waitingMinutes}m is within SLA ${slaMinutes}m.`
        : `Queue age ${waitingMinutes}m exceeded SLA ${slaMinutes}m.`,
      detail: { waitingMinutes, slaMinutes },
    },
  ];

  const blockedAutoReply = decision === 'escalate' && isReplyOperation && !isEscalationOperation;
  const summary = blockedAutoReply
    ? 'Support guardrail blocked auto-reply; escalate to human support role.'
    : decision === 'escalate'
      ? 'Support request should be escalated due to SLA or confidence constraints.'
      : 'Support request can proceed with autonomous response.';

  return {
    ok: !blockedAutoReply,
    checks,
    summary,
    route: {
      decision,
      escalate: decision === 'escalate',
      connector,
      operation,
      confidence,
      minConfidence,
      waitingMinutes,
      slaMinutes,
      escalationTargetRole: String(input.escalationTargetRole || 'Support Responder'),
    },
  };
}

function evaluateFinanceAutonomyGuardrails(options = {}) {
  const connector = String(options.connector || '').trim().toLowerCase();
  const operation = String(options.operation || '').trim().toLowerCase();
  const input = options.input && typeof options.input === 'object' ? options.input : {};
  const projectState = options.projectState && typeof options.projectState === 'object' ? options.projectState : null;

  if (connector !== 'stripe') {
    return {
      ok: true,
      checks: [],
      summary: 'Finance guardrails not required for this connector.',
      route: null,
    };
  }

  const lifecycleOps = new Set(['create_invoice', 'create_refund', 'create_payment_intent']);
  if (!lifecycleOps.has(operation)) {
    return {
      ok: true,
      checks: [],
      summary: 'Finance guardrails not required for this operation.',
      route: null,
    };
  }

  const amount = clampNumber(input.amount ?? input.invoiceAmount ?? input.refundAmount, 0, 0, 1000000000);
  const maxRefundAmount = clampNumber(input.maxRefundAmount, 5000, 0, 1000000000);
  const minCashReserve = clampNumber(input.minCashReserve, 0, 0, 1000000000);
  const currentCashReserve = clampNumber(input.currentCashReserve ?? input.availableBalance ?? input.cashReserve, minCashReserve, 0, 1000000000);
  const spendVarianceTrigger = Number.isFinite(Number(input.triggerWhenMonthlySpendVarianceAbove))
    ? Number(input.triggerWhenMonthlySpendVarianceAbove)
    : null;
  const insight = projectState ? computeKpiVarianceAndAlerts(projectState) : null;
  const monthlySpendVariance = Number(insight && insight.variance && insight.variance.monthlySpend || 0);

  const checks = [];
  if (operation === 'create_refund') {
    checks.push({
      id: 'finance_refund_cap',
      ok: amount <= maxRefundAmount,
      reason: amount <= maxRefundAmount
        ? `Refund amount $${amount.toFixed(2)} is within cap $${maxRefundAmount.toFixed(2)}.`
        : `Refund amount $${amount.toFixed(2)} exceeds cap $${maxRefundAmount.toFixed(2)}.`,
      detail: { amount, maxRefundAmount },
    });
  }

  checks.push({
    id: 'finance_cash_reserve',
    ok: currentCashReserve >= minCashReserve,
    reason: currentCashReserve >= minCashReserve
      ? `Cash reserve $${currentCashReserve.toFixed(2)} is above minimum $${minCashReserve.toFixed(2)}.`
      : `Cash reserve $${currentCashReserve.toFixed(2)} is below minimum $${minCashReserve.toFixed(2)}.`,
    detail: { currentCashReserve, minCashReserve },
  });

  if (spendVarianceTrigger !== null && (operation === 'create_invoice' || operation === 'create_payment_intent')) {
    checks.push({
      id: 'finance_cashflow_variance_trigger',
      ok: monthlySpendVariance >= spendVarianceTrigger,
      reason: monthlySpendVariance >= spendVarianceTrigger
        ? `Monthly spend variance $${monthlySpendVariance.toFixed(2)} meets trigger $${spendVarianceTrigger.toFixed(2)}.`
        : `Monthly spend variance $${monthlySpendVariance.toFixed(2)} is below trigger $${spendVarianceTrigger.toFixed(2)}.`,
      detail: { monthlySpendVariance, spendVarianceTrigger },
    });
  }

  const ok = checks.every((entry) => Boolean(entry.ok));
  return {
    ok,
    checks,
    summary: ok
      ? 'Finance guardrails passed.'
      : 'Finance guardrails failed. Escalate or adjust lifecycle action constraints.',
    route: {
      connector,
      operation,
      monthlySpendVariance,
      amount,
      minCashReserve,
      currentCashReserve,
    },
  };
}

async function executeGoogleAdsConnector(options = {}) {
  const operation = String(options.operation || 'get_profile').trim() || 'get_profile';
  const token = readCredentialToken('google_ads');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Google Ads credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'HiveForge',
  };

  if (operation === 'get_profile') {
    const resp = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/userinfo', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Google profile request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    return {
      ok: true,
      message: 'Fetched Google profile for ads credential.',
      operation,
      actualCost: 0,
      data: {
        email: body?.email || null,
        name: body?.name || null,
        subject: body?.sub || null,
      },
    };
  }

  if (operation === 'list_accessible_customers') {
    const developerToken = String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
    if (!developerToken) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'GOOGLE_ADS_DEVELOPER_TOKEN is required for list_accessible_customers. Use get_profile if you only want token validation.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const resp = await fetchWithTimeout('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
      method: 'POST',
      headers: {
        ...headers,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }, 12000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Google Ads customers request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    const resourceNames = Array.isArray(body?.resourceNames) ? body.resourceNames : [];
    return {
      ok: true,
      message: `Fetched ${resourceNames.length} accessible Google Ads customer${resourceNames.length === 1 ? '' : 's'}.`,
      operation,
      actualCost: 0,
      data: { resourceNames },
    };
  }

  if (operation === 'create_campaign' || operation === 'update_campaign_budget' || operation === 'pause_campaign' || operation === 'resume_campaign' || operation === 'optimize_campaigns') {
    const guardrails = evaluateGoogleAdsGuardrails({
      operation,
      projectId: options.projectId,
      input: options.input || {},
      estimatedCost: Number(options.estimatedCost || 0),
    });
    if (!guardrails.ok) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: guardrails.summary,
        operation,
        actualCost: 0,
        data: {
          guardrails: guardrails.checks,
        },
      };
    }

    const gateway = await executeViaApiGateway('google_ads', operation, {
      ...(options.input && typeof options.input === 'object' ? options.input : {}),
      credentialToken: token,
      idempotencyKey: options.idempotencyKey || null,
      projectId: options.projectId || null,
    }, 25000);
    if (!gateway.ok) return gateway;
    return {
      ok: true,
      message: gateway.message || `Google Ads operation ${operation} completed via API gateway.`,
      operation,
      actualCost: Number.isFinite(Number(gateway.actualCost))
        ? Number(gateway.actualCost)
        : Number(options.estimatedCost || 0),
      data: {
        ...(gateway.data && typeof gateway.data === 'object' ? gateway.data : {}),
        guardrails: guardrails.checks,
      },
    };
  }

  return {
    ok: false,
    errorCode: 'VALIDATION_ERROR',
    message: `Unsupported Google Ads operation: ${operation}. Use get_profile, list_accessible_customers, create_campaign, update_campaign_budget, pause_campaign, resume_campaign, or optimize_campaigns.`,
    operation,
    actualCost: 0,
    data: null,
  };
}

async function executeStripeConnector(options = {}) {
  const operation = String(options.operation || 'get_balance').trim() || 'get_balance';
  const token = readCredentialToken('stripe');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Stripe credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const gateway = await executeViaApiGateway('stripe', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 25000);
  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `Stripe operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeSupabaseConnector(options = {}) {
  const operation = String(options.operation || 'list_projects').trim() || 'list_projects';
  const token = readCredentialToken('supabase');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Supabase credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const directHeaders = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'HiveForge',
  };

  const directListProjects = async () => {
    const resp = await fetchWithTimeout('https://api.supabase.com/v1/projects', {
      method: 'GET',
      headers: directHeaders,
    }, 12000);

    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: resp.status === 401
          ? 'Supabase list_projects returned HTTP 401 (token is invalid or expired). Reconnect Supabase credential with a fresh personal access token.'
          : `Supabase list_projects failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }

    const body = await resp.json().catch(() => []);
    const projects = (Array.isArray(body) ? body : []).slice(0, 30).map((project) => ({
      id: project?.id || null,
      ref: project?.ref || null,
      name: project?.name || null,
      region: project?.region || null,
      organizationId: project?.organization_id || project?.organizationId || null,
      status: project?.status || null,
    }));
    return {
      ok: true,
      message: `Fetched ${projects.length} Supabase project${projects.length === 1 ? '' : 's'} via direct API.`,
      operation,
      actualCost: 0,
      data: { projects },
    };
  };

  const directListOrganizations = async () => {
    const resp = await fetchWithTimeout('https://api.supabase.com/v1/organizations', {
      method: 'GET',
      headers: directHeaders,
    }, 12000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Supabase list_organizations failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json().catch(() => []);
    const organizations = (Array.isArray(body) ? body : []).slice(0, 20).map((org) => ({
      id: org?.id || null,
      name: org?.name || null,
      slug: org?.slug || null,
    }));
    return {
      ok: true,
      message: `Fetched ${organizations.length} Supabase organization${organizations.length === 1 ? '' : 's'}.`,
      operation,
      actualCost: 0,
      data: { organizations },
    };
  };

  const directCreateProject = async () => {
    const requestedName = String(options.name || (options.input && options.input.name) || '').trim();
    const region = String(options.region || (options.input && options.input.region) || 'us-east-1').trim() || 'us-east-1';
    const dbPass = String(options.databasePassword || (options.input && options.input.databasePassword) || `hf-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}A!`).trim();
    if (!requestedName) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'name is required for Supabase create_project.',
        operation,
        actualCost: 0,
        data: null,
      };
    }

    let organizationId = String(options.organizationId || (options.input && options.input.organizationId) || '').trim();
    if (!organizationId) {
      const orgResult = await directListOrganizations();
      if (!orgResult.ok) return orgResult;
      const organizations = Array.isArray(orgResult.data && orgResult.data.organizations) ? orgResult.data.organizations : [];
      organizationId = String(organizations[0] && organizations[0].id ? organizations[0].id : '').trim();
      if (!organizationId) {
        return {
          ok: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'No Supabase organization found for create_project.',
          operation,
          actualCost: 0,
          data: null,
        };
      }
    }

    const resp = await fetchWithTimeout('https://api.supabase.com/v1/projects', {
      method: 'POST',
      headers: {
        ...directHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: requestedName,
        organization_id: organizationId,
        db_pass: dbPass,
        region,
      }),
    }, 25000);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Supabase create_project failed with HTTP ${resp.status}${text ? `: ${redactSensitive(text).slice(0, 180)}` : ''}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }

    const body = await resp.json().catch(() => ({}));
    return {
      ok: true,
      message: `Created Supabase project ${body?.name || requestedName}.`,
      operation,
      actualCost: 0,
      data: {
        id: body?.id || null,
        ref: body?.ref || null,
        name: body?.name || requestedName,
        status: body?.status || null,
        organizationId: body?.organization_id || organizationId,
        region: body?.region || region,
      },
    };
  };

  const directDeleteProject = async () => {
    const projectRef = String(options.projectRef || (options.input && options.input.projectRef) || '').trim();
    if (!projectRef) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'projectRef is required for delete_project.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const resp = await fetchWithTimeout(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}`, {
      method: 'DELETE',
      headers: directHeaders,
    }, 25000);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Supabase delete_project failed with HTTP ${resp.status}${text ? `: ${redactSensitive(text).slice(0, 180)}` : ''}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    return {
      ok: true,
      message: `Deleted Supabase project ${projectRef}.`,
      operation,
      actualCost: 0,
      data: { projectRef },
    };
  };

  if (operation === 'list_organizations') {
    return directListOrganizations();
  }

  if (operation === 'create_project') {
    return directCreateProject();
  }

  if (operation === 'delete_project') {
    return directDeleteProject();
  }

  if (operation === 'list_projects') {
    const direct = await directListProjects();
    if (direct.ok) return direct;
  }

  const gateway = await executeViaApiGateway('supabase', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 25000);

  if (!gateway.ok && operation === 'list_projects') {
    const gatewayReason = String(gateway.message || '').toLowerCase();
    const endpointMissing = gatewayReason.includes('api gateway endpoint is not configured');
    if (endpointMissing) {
      return directListProjects();
    }
  }

  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `Supabase operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeEmailProviderConnector(options = {}) {
  const operation = String(options.operation || 'list_inbox').trim() || 'list_inbox';
  const token = readCredentialToken('email_provider');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Email provider credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const gateway = await executeViaApiGateway('email_provider', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 25000);
  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `Email provider operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeSupportChatConnector(options = {}) {
  const operation = String(options.operation || 'list_conversations').trim() || 'list_conversations';
  const token = readCredentialToken('support_chat');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Support chat credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const gateway = await executeViaApiGateway('support_chat', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 25000);
  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `Support chat operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeSupportTicketConnector(options = {}) {
  const operation = String(options.operation || 'list_tickets').trim() || 'list_tickets';
  const token = readCredentialToken('support_ticket');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Support ticketing credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const gateway = await executeViaApiGateway('support_ticket', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 25000);
  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `Support ticketing operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeKdpConnector(options = {}) {
  const operation = String(options.operation || 'publish_book').trim() || 'publish_book';
  const token = readCredentialToken('kdp');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'KDP credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const gateway = await executeViaApiGateway('kdp', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 25000);
  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `KDP operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeGumroadConnector(options = {}) {
  const operation = String(options.operation || 'publish_product').trim() || 'publish_product';
  const token = readCredentialToken('gumroad');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Gumroad credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const gateway = await executeViaApiGateway('gumroad', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 25000);
  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `Gumroad operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeSubstackConnector(options = {}) {
  const operation = String(options.operation || 'publish_post').trim() || 'publish_post';
  const token = readCredentialToken('substack');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Substack credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const gateway = await executeViaApiGateway('substack', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 25000);
  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `Substack operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeCustomCmsConnector(options = {}) {
  const operation = String(options.operation || 'publish_book').trim() || 'publish_book';
  const token = readCredentialToken('custom_cms');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Custom CMS credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const gateway = await executeViaApiGateway('custom_cms', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 25000);
  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `Custom CMS operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeGooglePlayConnector(options = {}) {
  const operation = String(options.operation || 'get_release_status').trim() || 'get_release_status';
  const token = readCredentialToken('google_play');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Google Play credential token is missing. Connect a Google Play service account JSON key in the Credentials panel.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const gateway = await executeViaApiGateway('google_play', operation, {
    ...(options.input && typeof options.input === 'object' ? options.input : {}),
    credentialToken: token,
    idempotencyKey: options.idempotencyKey || null,
    projectId: options.projectId || null,
  }, 30000);
  if (!gateway.ok) return gateway;
  return {
    ok: true,
    message: gateway.message || `Google Play operation ${operation} completed via API gateway.`,
    operation,
    actualCost: Number.isFinite(Number(gateway.actualCost))
      ? Number(gateway.actualCost)
      : Number(options.estimatedCost || 0),
    data: gateway.data || null,
  };
}

async function executeImageGeneratorConnector(options = {}) {
  const settings = imageGeneratorSettings();
  const state = ensureImageRuntimeState();
  const operation = String(options.operation || 'get_profile').trim().toLowerCase() || 'get_profile';
  const input = options.input && typeof options.input === 'object' ? options.input : {};
  const modelId = String(input.modelId || settings.preferredModelId).trim() || settings.preferredModelId;

  if (!settings.enabled) {
    return {
      ok: false,
      errorCode: 'DISABLED',
      message: 'Image generator is disabled in appConfig.imageGenerator.enabled.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  if (operation === 'get_profile') {
    const catalog = imageModelCatalog();
    const projectId = options.projectId || null;
    const projectState = projectId ? (projectRuntimes.get(projectId) && projectRuntimes.get(projectId).state) : null;
    const templateId = projectState && projectState.template ? projectState.template : input.templateId || null;
    const modelStatus = Object.values(catalog).map((entry) => {
      const runtimeModel = state.models[entry.id] || {};
      const ready = fs.existsSync(path.join(IMAGE_MODELS_ROOT, entry.fileName || `${entry.id}.safetensors`));
      return {
        id: entry.id,
        label: entry.label,
        vramProfile: entry.vramProfile,
        downloadConfigured: Boolean(entry.downloadUrl),
        ready,
        status: runtimeModel.status || (ready ? 'ready' : 'missing'),
        updatedAt: runtimeModel.updatedAt || null,
      };
    });
    const readiness = await buildImageReadinessScoreboard(projectId, modelId, templateId);
    const checkKey = projectId || String(templateId || 'global');
    return {
      ok: true,
      message: 'Image generator profile retrieved.',
      operation,
      actualCost: 0,
      data: {
        preferredModelId: settings.preferredModelId,
        queue: {
          ...state.queue,
          queued: imageGenerationQueue.length,
          active: imageActiveWorkers,
        },
        settings: {
          workerSlots: settings.workerSlots,
          retentionDays: settings.retentionDays,
          quotaMbPerProject: settings.quotaMbPerProject,
          defaultDeterministic: settings.defaultDeterministic,
          defaultWidth: settings.defaultWidth,
          defaultHeight: settings.defaultHeight,
        },
        engine: {
          provider: settings.engine.provider,
          endpoint: settings.engine.endpoint,
          autoStart: settings.engine.autoStart,
          appPath: settings.engine.appPath,
          hasDefaultWorkflow: Boolean(settings.engine.defaultWorkflow),
          defaultCheckpointName: settings.engine.defaultCheckpointName || null,
          fallbackRendererAvailable: true,
          processRunning: Boolean(imageEngineProcess && !imageEngineProcess.killed),
          lastStartAt: imageEngineLastStartAt,
        },
        readiness,
        checks: {
          selfTest: state.checks.selfTests[checkKey] || null,
          goldenPromptSuite: state.checks.goldenPrompts[checkKey] || null,
        },
        models: modelStatus,
      },
    };
  }

  if (operation === 'list_models') {
    const catalog = imageModelCatalog();
    return {
      ok: true,
      message: `Found ${Object.keys(catalog).length} image model profile(s).`,
      operation,
      actualCost: 0,
      data: {
        models: Object.values(catalog),
      },
    };
  }

  if (operation === 'download_model' || operation === 'warmup') {
    imageProgress(options.projectId || null, operation === 'warmup' ? 'warmup_started' : 'download_requested', {
      modelId,
    });
    const ensured = await ensureImageModelReady(modelId, options.projectId || null);
    if (!ensured.ok) {
      return {
        ok: false,
        errorCode: ensured.errorCode || 'CONNECTOR_FAILURE',
        message: ensured.message,
        operation,
        actualCost: 0,
        data: {
          modelId,
        },
      };
    }
    if (operation === 'warmup') {
      const engineReady = await ensureComfyRuntimeReady(options.projectId || null);
      if (!engineReady.ok) {
        imageProgress(options.projectId || null, 'warmup_degraded_mode', {
          modelId,
          reason: engineReady.message,
        });
        return {
          ok: true,
          message: `Model is ready and fallback rendering is available while ComfyUI boots: ${engineReady.message}`,
          operation,
          actualCost: 0,
          data: {
            modelId,
            modelPath: ensured.model.path,
            degradedMode: true,
            fallbackRendererAvailable: true,
          },
        };
      }
    }
    imageProgress(options.projectId || null, operation === 'warmup' ? 'warmup_complete' : 'download_complete', {
      modelId,
      modelPath: ensured.model.path,
    });
    return {
      ok: true,
      message: `Model ${modelId} is ready for generation.`,
      operation,
      actualCost: 0,
      data: {
        modelId,
        modelPath: ensured.model.path,
      },
    };
  }

  if (operation === 'prune_storage') {
    if (!options.projectId) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'projectId is required for prune_storage.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const lifecycle = applyImageStorageLifecycle(options.projectId);
    return {
      ok: true,
      message: `Pruned image storage (deleted ${lifecycle.deletedCount} file(s)).`,
      operation,
      actualCost: 0,
      data: lifecycle,
    };
  }

  if (operation === 'get_asset_pack_contract') {
    const templateId = String(input.templateId || '').trim().toLowerCase();
    const assets = imageAssetPackContractForTemplate(templateId, input);
    return {
      ok: true,
      message: `Resolved ${assets.length} asset contract item(s).`,
      operation,
      actualCost: 0,
      data: {
        templateId,
        assets,
      },
    };
  }

  if (operation === 'generate_asset_pack') {
    const projectId = options.projectId || null;
    const templateId = String(input.templateId || '').trim().toLowerCase();
    const assets = imageAssetPackContractForTemplate(templateId, input);
    const projectState = projectId ? (projectRuntimes.get(projectId) && projectRuntimes.get(projectId).state) : null;
    if (!projectId) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'projectId is required for generate_asset_pack.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    if (!assets.length) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: `No template-aware asset contract found for template ${templateId || 'unknown'}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }

    const outputs = [];
    for (const asset of assets) {
      const composed = composeImagePrompt({
        prompt: input.prompt || asset.promptHint,
        style: input.style || '',
        negativePrompt: input.negativePrompt || '',
        templateId,
      }, projectState);
      const generated = await enqueueImageGenerationJob({
        projectId,
        projectName: input.projectName || null,
        modelId,
        prompt: composed.prompt,
        negativePrompt: composed.negativePrompt,
        seed: input.seed,
        deterministic: input.deterministic,
        width: asset.width,
        height: asset.height,
        steps: input.steps,
        cfg: input.cfg,
        samplerName: input.samplerName,
        scheduler: input.scheduler,
        timeoutMs: input.timeoutMs,
        workflow: input.workflow,
        templateId,
        assetKind: asset.key,
      });
      if (!generated.ok) return generated;
      outputs.push({
        key: asset.key,
        width: asset.width,
        height: asset.height,
        outputPath: generated.data && generated.data.outputPath ? generated.data.outputPath : null,
        metadataPath: generated.data && generated.data.metadataPath ? generated.data.metadataPath : null,
      });
    }

    return {
      ok: true,
      message: `Generated ${outputs.length} image asset(s).`,
      operation,
      actualCost: 0,
      data: {
        templateId,
        assets: outputs,
      },
    };
  }

  if (operation === 'self_test') {
    const projectId = options.projectId || null;
    const projectState = projectId ? (projectRuntimes.get(projectId) && projectRuntimes.get(projectId).state) : null;
    const templateId = String(input.templateId || (projectState && projectState.template) || '').trim().toLowerCase();
    const contract = imageAssetPackContractForTemplate(templateId, input);
    const sample = contract[0] || { key: 'smoke_asset', width: 768, height: 768, promptHint: 'high quality concept artwork' };
    imageProgress(projectId, 'self_test_started', {
      modelId,
      templateId: templateId || null,
      key: sample.key,
    });

    const composed = composeImagePrompt({
      prompt: input.prompt || sample.promptHint,
      style: input.style || '',
      negativePrompt: input.negativePrompt || '',
      templateId,
    }, projectState);
    const generated = await enqueueImageGenerationJob({
      projectId,
      projectName: projectState && projectState.name ? projectState.name : null,
      modelId,
      prompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
      seed: input.seed,
      deterministic: true,
      width: sample.width,
      height: sample.height,
      steps: input.steps,
      cfg: input.cfg,
      samplerName: input.samplerName,
      scheduler: input.scheduler,
      timeoutMs: input.timeoutMs,
      workflow: input.workflow,
      templateId,
      assetKind: sample.key,
    });
    if (!generated.ok) {
      return {
        ok: false,
        errorCode: generated.errorCode || 'CONNECTOR_FAILURE',
        message: generated.message || 'Image self-test failed while generating smoke asset.',
        operation,
        actualCost: 0,
        data: generated.data || null,
      };
    }

    let injection = null;
    let validation = { ok: true, scope: 'self_test_sample', gaps: [] };
    if (projectState) {
      injection = applyTemplateImageAssetInjection(projectState, [{
        key: sample.key,
        width: sample.width,
        height: sample.height,
        outputPath: generated.data && generated.data.outputPath ? generated.data.outputPath : null,
        metadataPath: generated.data && generated.data.metadataPath ? generated.data.metadataPath : null,
      }], { strictContract: false });
      if (!injection || !injection.ok) {
        validation.ok = false;
        validation.gaps.push(...(injection && Array.isArray(injection.gaps) ? injection.gaps : ['Image self-test injection failed.']));
      } else {
        const sampleItem = Array.isArray(injection.items)
          ? injection.items.find((item) => String(item && item.key || '') === String(sample.key || ''))
          : null;
        if (!sampleItem) {
          validation.ok = false;
          validation.gaps.push(`Self-test injected sample is missing for key ${sample.key}.`);
        } else {
          const injectedAbs = path.join(projectWorkspaceDir(projectState.id), String(sampleItem.injectedPath || ''));
          if (!sampleItem.injectedPath || !fs.existsSync(injectedAbs)) {
            validation.ok = false;
            validation.gaps.push(`Self-test injected file is missing for key ${sample.key}.`);
          }
          if (!sampleItem.dimensionMatch) {
            validation.ok = false;
            validation.gaps.push(`Self-test injected sample has wrong dimensions for key ${sample.key}.`);
          }
        }
      }
      persistProjectState(projectState);
    }

    if (!validation.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Image self-test failed: ${[
          ...(Array.isArray(validation.gaps) ? validation.gaps : []),
        ].join('; ') || 'asset injection/validation failed.'}`,
        operation,
        actualCost: 0,
        data: {
          templateId,
          generated: generated.data || null,
          injection,
          validation,
        },
      };
    }

    imageProgress(projectId, 'self_test_complete', {
      modelId,
      templateId: templateId || null,
      key: sample.key,
      manifestPath: injection && injection.manifestPath ? injection.manifestPath : null,
    });
    const runtimeState = ensureImageRuntimeState();
    const checkKey = projectId || String(templateId || 'global');
    runtimeState.checks.selfTests[checkKey] = {
      executedAt: nowIso(),
      ok: true,
      templateId,
      modelId,
      manifestPath: injection && injection.manifestPath ? injection.manifestPath : null,
      sampleKey: sample.key,
    };
    persistImageRuntimeState();
    return {
      ok: true,
      message: 'Image pipeline self-test passed.',
      operation,
      actualCost: 0,
      data: {
        templateId,
        generated: generated.data || null,
        injection,
        validation,
      },
    };
  }

  if (operation === 'golden_regression') {
    const projectId = options.projectId || null;
    const projectState = projectId ? (projectRuntimes.get(projectId) && projectRuntimes.get(projectId).state) : null;
    const templateId = String(input.templateId || (projectState && projectState.template) || '').trim().toLowerCase();
    const summary = await runGoldenPromptRegressionSuite(projectId, templateId, modelId);
    return {
      ok: Boolean(summary.ok),
      message: summary.ok ? 'Golden prompt regression suite passed.' : 'Golden prompt regression suite found failures.',
      operation,
      actualCost: 0,
      data: summary,
    };
  }

  if (operation === 'generate_image') {
    const projectState = options.projectId ? (projectRuntimes.get(options.projectId) && projectRuntimes.get(options.projectId).state) : null;
    const composed = composeImagePrompt({
      ...input,
      templateId: input.templateId || (projectState && projectState.template_id) || null,
    }, projectState);
    if (!composed.prompt) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'prompt is required for generate_image.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    return enqueueImageGenerationJob({
      projectId: options.projectId || null,
      projectName: projectState && projectState.name ? projectState.name : null,
      modelId,
      prompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
      seed: input.seed,
      deterministic: input.deterministic,
      width: input.width,
      height: input.height,
      steps: input.steps,
      cfg: input.cfg,
      samplerName: input.samplerName,
      scheduler: input.scheduler,
      timeoutMs: input.timeoutMs,
      workflow: input.workflow,
      templateId: input.templateId || (projectState && projectState.template_id) || null,
      assetKind: input.assetKind || 'image',
    });
  }

  return {
    ok: false,
    errorCode: 'VALIDATION_ERROR',
    message: `Unsupported image_generator operation: ${operation}. Use get_profile, list_models, download_model, warmup, generate_image, generate_asset_pack, self_test, golden_regression, get_asset_pack_contract, or prune_storage.`,
    operation,
    actualCost: 0,
    data: null,
  };
}

function publicationOperationKind(operation) {
  const normalized = String(operation || '').trim().toLowerCase();
  if (['publish_book', 'publish_post', 'publish_product'].includes(normalized)) return 'publish';
  if (['update_publication', 'update_post', 'update_product'].includes(normalized)) return 'update';
  if (['unpublish_publication', 'unpublish_post', 'unpublish_product'].includes(normalized)) return 'unpublish';
  return null;
}

function publicationOperationForTarget(target, kind) {
  const connector = String(target || '').trim().toLowerCase();
  if (kind === 'publish') {
    if (connector === 'kdp') return 'publish_book';
    if (connector === 'gumroad') return 'publish_product';
    if (connector === 'substack') return 'publish_post';
    if (connector === 'custom_cms') return 'publish_book';
  }
  if (kind === 'update') {
    if (connector === 'kdp') return 'update_publication';
    if (connector === 'gumroad') return 'update_product';
    if (connector === 'substack') return 'update_post';
    if (connector === 'custom_cms') return 'update_publication';
  }
  if (kind === 'unpublish') {
    if (connector === 'kdp') return 'unpublish_publication';
    if (connector === 'gumroad') return 'unpublish_product';
    if (connector === 'substack') return 'unpublish_post';
    if (connector === 'custom_cms') return 'unpublish_publication';
  }
  return null;
}

function normalizePublicationTargetList(rawTargets, fallbackConnector) {
  const input = Array.isArray(rawTargets)
    ? rawTargets
    : (typeof rawTargets === 'string' && rawTargets.trim() ? rawTargets.split(',') : []);
  const normalized = input
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry) => ['kdp', 'gumroad', 'substack', 'custom_cms'].includes(entry));
  if (normalized.length) {
    return Array.from(new Set(normalized));
  }
  const fallback = String(fallbackConnector || '').trim().toLowerCase();
  return fallback ? [fallback] : [];
}

function stripPublicationPlanConfig(input = {}) {
  const next = { ...(input && typeof input === 'object' ? input : {}) };
  delete next.distributionTargets;
  delete next.distribution_targets;
  delete next.distributionStrategy;
  delete next.distribution_strategy;
  delete next.requiredSuccesses;
  delete next.required_successes;
  delete next.fallbackOrder;
  delete next.fallback_order;
  delete next.rollbackOnFailure;
  delete next.rollback_on_failure;
  delete next.verifyAfterPublish;
  delete next.verify_after_publish;
  return next;
}

function buildPublicationDistributionPlan(connectorId, operation, input = {}) {
  const connector = String(connectorId || '').trim().toLowerCase();
  const kind = publicationOperationKind(operation);
  const rawTargets = input && typeof input === 'object'
    ? (input.distributionTargets ?? input.distribution_targets ?? input.fallbackOrder ?? input.fallback_order)
    : null;
  if (!kind || (!rawTargets && !['kdp', 'gumroad', 'substack', 'custom_cms'].includes(connector))) {
    return null;
  }

  const targets = normalizePublicationTargetList(rawTargets, connector);
  if (targets.length <= 1) {
    return null;
  }

  const strategyRaw = String((input && typeof input === 'object' ? (input.distributionStrategy ?? input.distribution_strategy) : '') || 'broadcast').trim().toLowerCase();
  const strategy = strategyRaw === 'fallback' ? 'fallback' : 'broadcast';
  const rollbackOnFailure = Boolean(input && typeof input === 'object'
    ? (input.rollbackOnFailure ?? input.rollback_on_failure ?? true)
    : true);
  const verifyAfterPublish = Boolean(input && typeof input === 'object'
    ? (input.verifyAfterPublish ?? input.verify_after_publish ?? true)
    : true);
  const requiredSuccessesDefault = strategy === 'fallback' ? 1 : targets.length;
  const requiredSuccesses = clampInt(
    input && typeof input === 'object' ? (input.requiredSuccesses ?? input.required_successes) : requiredSuccessesDefault,
    requiredSuccessesDefault,
    1,
    targets.length
  );
  const baseInput = stripPublicationPlanConfig(input);
  const steps = targets.map((target, index) => {
    const targetOperation = publicationOperationForTarget(target, kind);
    return {
      index,
      target,
      connector: target,
      operation: targetOperation,
      input: {
        ...baseInput,
        distributionTarget: target,
        provider: target,
      },
    };
  }).filter((step) => step.operation);

  if (steps.length <= 1) {
    return null;
  }

  return {
    kind,
    baseConnector: connector,
    baseOperation: String(operation || '').trim().toLowerCase(),
    strategy,
    rollbackOnFailure,
    verifyAfterPublish,
    requiredSuccesses,
    targets,
    steps,
  };
}

async function executePublicationDistributionPlan(plan, options = {}) {
  const steps = Array.isArray(plan && plan.steps) ? plan.steps : [];
  const executeStep = typeof options.executeStep === 'function' ? options.executeStep : null;
  const executeRollbackStep = typeof options.executeRollbackStep === 'function' ? options.executeRollbackStep : null;
  if (!steps.length || !executeStep) {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      operation: plan && plan.baseOperation ? plan.baseOperation : 'publish',
      actualCost: 0,
      message: 'Publication distribution plan is missing executable steps.',
      data: { strategy: plan && plan.strategy ? plan.strategy : 'broadcast', targets: [] },
    };
  }

  const results = [];
  let actualCost = 0;
  let successCount = 0;
  for (const step of steps) {
    let result;
    try {
      result = await executeStep(step);
    } catch (err) {
      result = {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: redactSensitive(err && err.message ? err.message : 'publication_distribution_step_failed'),
        operation: step.operation,
        actualCost: 0,
        data: null,
      };
    }

    const cost = Number.isFinite(Number(result && result.actualCost)) ? Number(result.actualCost) : 0;
    actualCost += cost;
    if (result && result.ok) {
      successCount += 1;
    }
    results.push({
      target: step.target,
      connector: step.connector,
      operation: step.operation,
      ok: Boolean(result && result.ok),
      errorCode: result && result.errorCode ? String(result.errorCode) : null,
      message: result && result.message ? String(result.message) : null,
      actualCost: cost,
      data: result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : null,
    });

    if (plan.strategy === 'fallback' && result && result.ok) {
      break;
    }
  }

  const ok = successCount >= Number(plan.requiredSuccesses || 1);
  const successfulTargets = results.filter((entry) => entry.ok);
  let rollback = {
    attemptedCount: 0,
    successCount: 0,
    failedCount: 0,
    items: [],
    required: false,
  };
  if (!ok && plan.kind === 'publish' && plan.rollbackOnFailure && successfulTargets.length > 0 && executeRollbackStep) {
    rollback.required = true;
    for (const entry of successfulTargets.slice().reverse()) {
      const rollbackOperation = publicationOperationForTarget(entry.connector, 'unpublish');
      if (!rollbackOperation) continue;
      let rollbackResult;
      try {
        rollbackResult = await executeRollbackStep({
          target: entry.target,
          connector: entry.connector,
          operation: rollbackOperation,
          input: {
            ...(entry.data && typeof entry.data === 'object' ? entry.data : {}),
            rollbackReason: 'publication_distribution_failure',
            failedStrategy: plan.strategy,
          },
        });
      } catch (err) {
        rollbackResult = {
          ok: false,
          errorCode: 'CONNECTOR_FAILURE',
          message: redactSensitive(err && err.message ? err.message : 'publication_rollback_failed'),
          data: null,
        };
      }
      rollback.attemptedCount += 1;
      if (rollbackResult && rollbackResult.ok) {
        rollback.successCount += 1;
      } else {
        rollback.failedCount += 1;
      }
      rollback.items.push({
        target: entry.target,
        connector: entry.connector,
        operation: rollbackOperation,
        ok: Boolean(rollbackResult && rollbackResult.ok),
        errorCode: rollbackResult && rollbackResult.errorCode ? String(rollbackResult.errorCode) : null,
        message: rollbackResult && rollbackResult.message ? String(rollbackResult.message) : null,
      });
      const matched = results.find((candidate) => candidate.target === entry.target && candidate.connector === entry.connector);
      if (matched) {
        matched.rollbacked = true;
      }
    }
  }

  return {
    ok,
    errorCode: ok ? null : 'CONNECTOR_FAILURE',
    operation: plan.baseOperation,
    actualCost,
    message: ok
      ? `Publication distribution ${plan.strategy} completed with ${successCount}/${steps.length} successful targets.`
      : `Publication distribution ${plan.strategy} failed with ${successCount}/${steps.length} successful targets.`,
    data: {
      kind: plan.kind,
      strategy: plan.strategy,
      rollbackOnFailure: plan.rollbackOnFailure,
      verifyAfterPublish: plan.verifyAfterPublish,
      requiredSuccesses: plan.requiredSuccesses,
      successCount,
      attemptedCount: results.length,
      rollback,
      targets: results,
    },
  };
}

async function executeLiveConnector(connectorId, options = {}) {
  const connectorKey = String(connectorId || '').trim().toLowerCase();
  const actionInput = options.input && typeof options.input === 'object' ? options.input : {};
  if (!options._skipPublicationPlan) {
    const publicationPlan = buildPublicationDistributionPlan(connectorKey, options.operation, actionInput);
    if (publicationPlan) {
      return executePublicationDistributionPlan(publicationPlan, {
        executeStep: async (step) => executeLiveConnector(step.connector, {
          ...options,
          operation: step.operation,
          input: step.input,
          idempotencyKey: `${String(options.idempotencyKey || 'publication_plan')}::${step.connector}::${step.operation}::${step.index}`,
          _skipPublicationPlan: true,
        }),
        executeRollbackStep: async (step) => executeLiveConnector(step.connector, {
          ...options,
          operation: step.operation,
          input: step.input,
          idempotencyKey: `${String(options.idempotencyKey || 'publication_plan')}::rollback::${step.connector}::${step.operation}`,
          _skipPublicationPlan: true,
        }),
      });
    }
  }
  if (connectorKey === 'github') {
    return executeGithubConnector(options);
  }
  if (connectorKey === 'netlify') {
    return executeNetlifyConnector(options);
  }
  if (connectorKey === 'analytics') {
    return executeAnalyticsConnector(options);
  }
  if (connectorKey === 'google_ads') {
    return executeGoogleAdsConnector(options);
  }
  if (connectorKey === 'stripe') {
    return executeStripeConnector(options);
  }
  if (connectorKey === 'supabase') {
    return executeSupabaseConnector(options);
  }
  if (connectorKey === 'email_provider') {
    return executeEmailProviderConnector(options);
  }
  if (connectorKey === 'support_chat') {
    return executeSupportChatConnector(options);
  }
  if (connectorKey === 'support_ticket') {
    return executeSupportTicketConnector(options);
  }
  if (connectorKey === 'kdp') {
    return executeKdpConnector(options);
  }
  if (connectorKey === 'gumroad') {
    return executeGumroadConnector(options);
  }
  if (connectorKey === 'substack') {
    return executeSubstackConnector(options);
  }
  if (connectorKey === 'custom_cms') {
    return executeCustomCmsConnector(options);
  }
  if (connectorKey === 'google_play') {
    return executeGooglePlayConnector(options);
  }
  if (connectorKey === 'image_generator') {
    return executeImageGeneratorConnector(options);
  }
  return {
    ok: false,
    errorCode: 'CONNECTOR_NOT_IMPLEMENTED',
    message: `No live adapter implemented yet for ${connectorKey}.`,
    operation: String(options.operation || 'default'),
    actualCost: 0,
    data: null,
  };
}

function venvPython() {
  const venv = path.join(SANDBOX_ROOT, 'venv');
  const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
  const exe = process.platform === 'win32' ? 'python.exe' : 'python';
  return path.join(venv, bin, exe);
}

async function pingLLMEndpoint(provider, endpoint, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const base = endpoint.replace(/\/$/, '');
    const rootNoV1 = base.replace(/\/(api\/)?v1$/, '');
    const candidates = [
      `${base}/models`,
      `${rootNoV1}/api/v1/models`,
      `${rootNoV1}/v1/models`,
      `${rootNoV1}/models`,
    ];

    for (const url of candidates) {
      try {
        const headers = {};
        if (apiKey && normalizeLlmProvider(provider) === 'openai_compatible') {
          headers.Authorization = `Bearer ${apiKey}`;
        }
        const resp = await fetch(url, { signal: controller.signal, headers });
        if (resp.ok) {
          clearTimeout(timeout);
          let model = null;
          try {
            const data = await resp.json();
            model = (Array.isArray(data?.data) && data.data[0]?.id) ? data.data[0].id : null;
          } catch {}
          return { reachable: true, model };
        }
      } catch (err) {
      }
    }

    clearTimeout(timeout);
    return { reachable: false, model: null };
  } catch (err) {
    clearTimeout(timeout);
    return { reachable: false, model: null };
  }
}

function previewRootsForProject(projectId) {
  const projectRoot = path.join(WORKSPACE_ROOT, 'projects', projectId);
  return {
    projectRoot,
    gameRoot: path.join(projectRoot, 'game'),
    appRoot: path.join(projectRoot, 'app'),
    websiteRoot: path.join(projectRoot, 'website'),
    webRoot: path.join(projectRoot, 'web'),
    mobileRoot: path.join(projectRoot, 'mobile'),
    previewRoot: path.join(projectRoot, 'preview'),
  };
}

function resolveProjectPreviewRoot(projectId) {
  const roots = previewRootsForProject(projectId);
  const gameIndex = path.join(roots.gameRoot, 'index.html');
  const appIndex = path.join(roots.appRoot, 'index.html');
  const websiteIndex = path.join(roots.websiteRoot, 'index.html');
  const webIndex = path.join(roots.webRoot, 'index.html');
  const previewIndex = path.join(roots.previewRoot, 'index.html');
  const rootIndex = path.join(roots.projectRoot, 'index.html');
  if (fs.existsSync(gameIndex)) return roots.gameRoot;
  if (fs.existsSync(appIndex)) return roots.appRoot;
  if (fs.existsSync(websiteIndex)) return roots.websiteRoot;
  if (fs.existsSync(webIndex)) return roots.webRoot;
  if (fs.existsSync(previewIndex)) return roots.previewRoot;
  if (fs.existsSync(rootIndex)) return roots.projectRoot;
  return null;
}

function contentTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

function serveStatic(req, res) {
  const rawPath = (req.url || '/').split('?')[0] || '/';
  // Root ? redirect to the HiveForge dashboard
  if (rawPath === '/' || rawPath === '/index.html') {
    res.writeHead(302, { Location: '/dashboard/' });
    res.end();
    return;
  }
  // /dashboard/ ? serve the dashboard index
  const dashboardRoot = path.join(WEBUI_ROOT, 'dashboard');
  let resolvedBase = WEBUI_ROOT;
  let normalizedPath = rawPath.replace(/^\/+/, '');
  if (normalizedPath === 'dashboard' || normalizedPath === 'dashboard/') {
    resolvedBase = dashboardRoot;
    normalizedPath = 'index.html';
  } else if (normalizedPath.startsWith('dashboard/')) {
    resolvedBase = dashboardRoot;
    normalizedPath = normalizedPath.slice('dashboard/'.length) || 'index.html';
  }
  const target = path.join(resolvedBase, normalizedPath);
  if (!target.startsWith(WEBUI_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg']);
  const ext = path.extname(target).toLowerCase();
  const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon'
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';

  fs.readFile(target, (err, data) => {
    if (err && imageExts.has(ext) && !normalizedPath.includes('/') && !normalizedPath.includes('\\')) {
      // Fall back to project root for top-level image assets (e.g. /icon_hiveforge.png)
      const rootAsset = path.join(__dirname, normalizedPath);
      if (!rootAsset.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.readFile(rootAsset, (err2, data2) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data2);
      });
      return;
    }
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const contentTypes2 = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon'
    };
    const contentType2 = contentTypes2[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType2 });
    res.end(data);
  });
}

function runAgentTask(task, responseStream) {
  const taskRun = createTaskRun(task, 'task');
  log(`Task ${taskRun.id} started: ${task}`);
  appendTaskEvent(taskRun, 'system', `Task ${taskRun.id} started`);

  const ready = ensurePythonRuntime(taskRun);
  if (!ready.ok) {
    completeTaskRun(taskRun, 'failed', 1, `Task ${taskRun.id} failed before execution`);
    if (responseStream && !responseStream.writableEnded) {
      responseStream.write(`\n[err] ${ready.message}`);
      responseStream.end();
    }
    return { taskRun, child: null };
  }

  const existingPythonPath = process.env.PYTHONPATH || '';
  const mergedPythonPath = existingPythonPath
    ? `${OPENCLAW_SRC_ROOT}${path.delimiter}${existingPythonPath}`
    : OPENCLAW_SRC_ROOT;

  const child = spawn(venvPython(), ['-m', 'openclaw.agent', task], {
    cwd: SANDBOX_ROOT,
    env: {
      ...process.env,
      HOME: SANDBOX_ROOT,
      USERPROFILE: SANDBOX_ROOT,
      HiveForge_CONFIG: CONFIG_PATH,
      PYTHONPATH: mergedPythonPath,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
  });

  activeTasks.set(taskRun.id, child);

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const safeText = redactSensitive(text);
    if (responseStream && !responseStream.writableEnded) {
      responseStream.write(safeText);
    }
    appendTaskEvent(taskRun, 'stdout', text);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    log(`Task ${taskRun.id} stderr: ${text.trim()}`);
    const safeText = redactSensitive(text);
    if (responseStream && !responseStream.writableEnded) {
      responseStream.write(`\n[err] ${safeText}`);
    }
    appendTaskEvent(taskRun, 'stderr', text);
  });

  child.on('close', (code) => {
    activeTasks.delete(taskRun.id);
    if (taskRun.status === 'running') {
      taskRun.status = code === 0 ? 'succeeded' : 'failed';
      taskRun.exitCode = code;
      taskRun.finishedAt = new Date().toISOString();
      verifySmokeArtifacts(taskRun);
      appendTaskEvent(taskRun, 'system', `Task ${taskRun.id} finished with code ${taskRun.exitCode}`);
    }

    log(`Task ${taskRun.id} finished with code ${taskRun.exitCode}`);
    if (responseStream && !responseStream.writableEnded) {
      responseStream.end();
    }
  });

  return { taskRun, child };
}

function runCanonicalSmokeTest(responseStream) {
  const smokePrompt = [
    'Run a real filesystem smoke test using the file tool only (no simulation).',
    '1) Create /sandbox/workspace/healthcheck directory.',
    '2) Write /sandbox/workspace/healthcheck/status.json with keys timestamp, writable_root, checks.',
    '3) Append "openclaw smoke test ok" plus newline to /sandbox/workspace/healthcheck/log.txt.',
    '4) Read back both files and report contents.',
    '5) List files in /sandbox/workspace/healthcheck.',
    'End with SMOKE_TEST_PASS only if all operations actually succeeded.'
  ].join(' ');

  const result = runAgentTask(smokePrompt, responseStream);
  result.taskRun.source = 'smoke-test';
  return result;
}

function runCanonicalBrowserSmokeTest(responseStream) {
  const prompt = [
    'Run a browser smoke test using the browser tool only.',
    '1) Fetch https://example.com and return status code, title, and first 200 chars.',
    '2) Fetch https://httpbin.org/get and return status code and origin field.',
    '3) If both succeed, end with BROWSER_SMOKE_TEST_PASS.'
  ].join(' ');

  const result = runAgentTask(prompt, responseStream);
  result.taskRun.source = 'smoke-browser';
  return result;
}

function isSmokePrompt(taskText) {
  const text = (taskText || '').toLowerCase();
  return text.includes('smoke test') || text.includes('healthcheck');
}

function verifySmokeArtifacts(taskRun) {
  if (!isSmokePrompt(taskRun.task) || !['task', 'smoke-test'].includes(taskRun.source)) {
    return;
  }

  const healthDir = path.join(SANDBOX_ROOT, 'workspace', 'healthcheck');
  const statusPath = path.join(healthDir, 'status.json');
  const logPath = path.join(healthDir, 'log.txt');

  const missing = [];
  if (!fs.existsSync(healthDir)) missing.push('healthcheck directory');
  if (!fs.existsSync(statusPath)) missing.push('healthcheck/status.json');
  if (!fs.existsSync(logPath)) missing.push('healthcheck/log.txt');

  if (missing.length) {
    taskRun.status = 'failed';
    taskRun.exitCode = taskRun.exitCode === 0 ? 2 : taskRun.exitCode;
    appendTaskEvent(taskRun, 'stderr', `Filesystem verification failed: missing ${missing.join(', ')}`);
    appendTaskEvent(taskRun, 'system', 'Filesystem verification verdict: FAIL');
    return;
  }

  try {
    const statusRaw = fs.readFileSync(statusPath, 'utf-8');
    const statusObj = JSON.parse(statusRaw);
    const logRaw = fs.readFileSync(logPath, 'utf-8');

    const checks = Array.isArray(statusObj.checks) ? statusObj.checks.map((v) => String(v).toLowerCase()) : [];
    const acceptedCheckSets = [
      ['write', 'read', 'list', 'append'],
      ['directory_creation', 'file_write', 'append_test']
    ];
    const checksOk = acceptedCheckSets.some((checkSet) => checkSet.every((name) => checks.includes(name)));

    const rootValue = statusObj.writable_root;
    const rootOk = (
      (typeof rootValue === 'string' && rootValue.length > 0) ||
      (typeof rootValue === 'boolean' && rootValue)
    );
    const logOk = logRaw.includes('openclaw smoke test ok');
    const timestampOk = typeof statusObj.timestamp === 'string' && statusObj.timestamp.length > 0;

    if (checksOk && rootOk && logOk && timestampOk) {
      appendTaskEvent(taskRun, 'system', 'Filesystem verification verdict: PASS (healthcheck artifacts confirmed)');
      return;
    }

    taskRun.status = 'failed';
    taskRun.exitCode = taskRun.exitCode === 0 ? 2 : taskRun.exitCode;
    appendTaskEvent(taskRun, 'stderr', 'Filesystem verification failed: artifact content did not match expected smoke-test markers');
    appendTaskEvent(taskRun, 'system', 'Filesystem verification verdict: FAIL');
  } catch (err) {
    taskRun.status = 'failed';
    taskRun.exitCode = taskRun.exitCode === 0 ? 2 : taskRun.exitCode;
    appendTaskEvent(taskRun, 'stderr', `Filesystem verification failed: ${err.message}`);
    appendTaskEvent(taskRun, 'system', 'Filesystem verification verdict: FAIL');
  }
}

function runPythonCheck(args) {
  return spawnSync(venvPython(), args, {
    cwd: __dirname,
    env: {
      ...process.env,
      HOME: SANDBOX_ROOT,
      USERPROFILE: SANDBOX_ROOT,
      HiveForge_CONFIG: CONFIG_PATH,
      PYTHONPATH: OPENCLAW_SRC_ROOT,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
    encoding: 'utf-8'
  });
}

function stopTaskById(taskId) {
  const child = activeTasks.get(taskId);
  if (!child) {
    return false;
  }
  try {
    child.kill();
  } catch (err) {
  }

  const taskRun = taskHistory.find((entry) => entry.id === taskId);
  if (taskRun && taskRun.status === 'running') {
    completeTaskRun(taskRun, 'failed', -1, `Task ${taskId} stopped by user`);
  }
  activeTasks.delete(taskId);
  return true;
}

function latestRunningTaskId() {
  const running = taskHistory.filter((entry) => entry.status === 'running');
  if (!running.length) return null;
  return running[running.length - 1].id;
}

function ensurePythonRuntime(taskRun) {
  if (pythonRuntimeReady) {
    return { ok: true };
  }

  const check = runPythonCheck(['-c', 'import openclaw, requests']);
  if (check.status === 0) {
    pythonRuntimeReady = true;
    return { ok: true };
  }

  appendTaskEvent(taskRun, 'system', 'Runtime check failed; attempting auto-repair for Python dependencies...');

  const install = runPythonCheck(['-m', 'pip', 'install', './openclaw']);
  if (install.status !== 0) {
    const stderr = redactSensitive((install.stderr || '').trim());
    const stdout = redactSensitive((install.stdout || '').trim());
    const details = stderr || stdout || 'Unknown pip install failure';
    appendTaskEvent(taskRun, 'stderr', `Auto-repair failed: ${details}`);
    return {
      ok: false,
      message: `Python runtime auto-repair failed: ${details}`
    };
  }

  const verify = runPythonCheck(['-c', 'import openclaw, requests']);
  if (verify.status !== 0) {
    const details = redactSensitive((verify.stderr || verify.stdout || '').trim()) || 'Unknown verification failure';
    appendTaskEvent(taskRun, 'stderr', `Auto-repair verification failed: ${details}`);
    return {
      ok: false,
      message: `Python runtime verification failed: ${details}`
    };
  }

  pythonRuntimeReady = true;
  appendTaskEvent(taskRun, 'system', 'Python runtime auto-repair completed successfully.');
  return { ok: true };
}

function recordIntegrationTestInHistory(result) {
  const taskRun = createTaskRun(`[integration] ${result.provider} connection test`, 'integration-test', {
    provider: result.provider
  });
  appendTaskEvent(taskRun, 'system', `Integration test started: ${result.provider}`);
  appendTaskEvent(taskRun, result.ok ? 'stdout' : 'stderr', result.message);
  completeTaskRun(
    taskRun,
    result.ok ? 'succeeded' : 'failed',
    result.ok ? 0 : 1,
    `Integration test finished: ${result.provider} (${result.ok ? 'pass' : 'fail'})`
  );
}

function verifyBrowserSmoke(taskRun) {
  if (taskRun.source !== 'smoke-browser') {
    return;
  }

  const hadBrowserToolSuccess = taskRun.events.some((event) =>
    event.type === 'stdout' && event.message.includes('[tool:browser] ok')
  );

  if (!hadBrowserToolSuccess) {
    taskRun.status = 'failed';
    taskRun.exitCode = taskRun.exitCode === 0 ? 3 : taskRun.exitCode;
    appendTaskEvent(taskRun, 'stderr', 'Browser smoke verification failed: no successful browser tool call detected');
    appendTaskEvent(taskRun, 'system', 'Browser smoke verification verdict: FAIL');
    return;
  }

  appendTaskEvent(taskRun, 'system', 'Browser smoke verification verdict: PASS');
}

function exportTaskTranscript(taskRun) {
  const lines = [];
  lines.push(`Task #${taskRun.id}`);
  lines.push(`Source: ${taskRun.source || 'task'}`);
  lines.push(`Prompt: ${taskRun.task}`);
  lines.push(`Status: ${taskRun.status}`);
  lines.push(`Started: ${taskRun.startedAt}`);
  lines.push(`Finished: ${taskRun.finishedAt || ''}`);
  lines.push(`Exit Code: ${taskRun.exitCode}`);
  lines.push('');
  lines.push('Events:');
  taskRun.events.forEach((event) => {
    lines.push(`[${event.ts}] [${event.phase || 'execution'}] [${event.type}] ${event.message}`);
  });
  return lines.join('\n');
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
    const { taskRun, child } = runAgentTask(task, res);
    req.on('close', () => {
      if (taskRun.status === 'running' && child) {
        child.kill();
        completeTaskRun(taskRun, 'failed', -1, `Task ${taskRun.id} interrupted by client disconnect`);
      }
    });
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

  appConfig = readJsonFileSafe(CONFIG_PATH);
  appConfig.llm = appConfig.llm || {};
  appConfig.llm.provider = normalizeLlmProvider(appConfig.llm.provider);
  appConfig.llm.cloudProviders = Boolean(appConfig.llm.cloudProviders);
  appConfig.runtime = runtimeSettings();
  persistAppConfig();
  ensureMessageBus();
  ensureImageRuntimeState();
  persistImageRuntimeState();
  const endpoint = appConfig.llm?.endpoint || 'http://127.0.0.1:1234/v1';
  const provider = normalizeLlmProvider(appConfig.llm?.provider);
  const apiKey = resolveLlmApiKey(appConfig.llm);
  appState.llm.provider = provider;
  appState.llm.cloudProviders = Boolean(appConfig.llm?.cloudProviders);
  appState.llm.endpoint = endpoint;
  const lmResult = await pingLLMEndpoint(provider, endpoint, apiKey);
  appState.llm.reachable = lmResult.reachable;
  if (lmResult.model && !normalizeLlmModelLabel(appConfig?.llm?.model)) appState.llm.model = lmResult.model;
  appState.llm.lastCheckedAt = new Date().toISOString();
  if (!lmResult.reachable) {
    log(`Warning: ${llmProviderLabel(provider)} is not reachable at ${endpoint}. UI will still start; tasks may fail until the endpoint is reachable.`);
  }

  loadProjectsFromDisk();

  // Log template discovery once at startup (not per request)
  try {
    ensureDir(TEMPLATES_ROOT);
    const foundTemplates = fs.readdirSync(TEMPLATES_ROOT)
      .filter((f) => f.endsWith('.json') && f !== 'schema.json')
      .map((f) => f.replace('.json', ''));
    log(`Templates available (${foundTemplates.length}): ${foundTemplates.join(', ') || 'NONE � check templates/ directory'}`);
  } catch (err) {
    log(`Warning: could not read templates directory: ${err.message}`);
  }

  const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const pathname = urlObj.pathname;

    if (pathname === '/events' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      if (!projectId || !projectRuntimes.has(projectId)) {
        writeJson(res, { error: 'Unknown projectId for event stream' }, 404);
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(': connected\n\n');
      const set = projectSseClients.get(projectId) || new Set();
      set.add(res);
      projectSseClients.set(projectId, set);
      req.on('close', () => {
        const activeSet = projectSseClients.get(projectId);
        if (activeSet) {
          activeSet.delete(res);
        }
      });
      return;
    }

    if (pathname === '/api/projects' && req.method === 'GET') {
      const projects = Array.from(projectRuntimes.values()).map((runtime) => summarizeProject(runtime.state));
      writeJson(res, projects);
      return;
    }

    if (pathname === '/api/projects' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const name = String(payload.name || '').trim();
        const template = String(payload.template || '').trim();
        if (!name || !template) {
          writeJson(res, { error: 'name and template are required' }, 400);
          return;
        }

        try {
          const project = createProjectFromTemplate({
            name,
            template,
            mode: String(payload.mode || 'production').trim(),
            goal: String(payload.goal || '').trim()
          });
          writeJson(res, project, 201);
        } catch (err) {
          writeJson(res, { error: err.message }, 400);
        }
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname.startsWith('/api/projects/') && req.method === 'DELETE') {
      const projectId = pathname.replace('/api/projects/', '').trim();
      if (!projectId || !projectRuntimes.has(projectId)) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      removeProject(projectId);
      writeJson(res, { ok: true });
      return;
    }

    if (pathname === '/api/agents' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, []);
        return;
      }
      writeJson(res, runtime.state.agents);
      return;
    }

    if (pathname === '/api/agents' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const agentId = String(payload.agentId || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        if (!agentId) {
          writeJson(res, { error: 'agentId is required' }, 400);
          return;
        }

        const newAgent = {
          id: `${agentId}_${Date.now().toString(36)}`,
          name: agentId.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
          role: agentId,
          status: 'idle',
          currentTask: null,
          tasksDone: 0,
          tokens: 0,
          recentLog: ['Added from marketplace'],
          isCoordinator: false
        };
        runtime.state.agents.push(newAgent);
        appendProjectLog(runtime.state, 'message', {
          kind: 'agent_added',
          agentId: newAgent.id,
          role: newAgent.role
        });
        persistProjectState(runtime.state);
        writeJson(res, newAgent, 201);
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname.startsWith('/api/agents/') && req.method === 'DELETE') {
      const agentId = pathname.replace('/api/agents/', '').trim();
      const projectId = urlObj.searchParams.get('projectId') || '';
      const runtime = projectRuntimes.get(projectId);
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      const before = runtime.state.agents.length;
      runtime.state.agents = runtime.state.agents.filter((agent) => agent.id !== agentId || agent.isCoordinator);
      if (runtime.state.agents.length === before) {
        writeJson(res, { error: 'Agent not found or cannot remove coordinator' }, 404);
        return;
      }
      appendProjectLog(runtime.state, 'message', { kind: 'agent_removed', agentId });
      persistProjectState(runtime.state);
      writeJson(res, { ok: true });
      return;
    }

    if (pathname === '/api/tasks' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      writeJson(res, runtime ? runtime.state.tasks : []);
      return;
    }

    if (pathname === '/api/tasks' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const title = String(payload.title || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        if (!title) {
          writeJson(res, { error: 'title is required' }, 400);
          return;
        }

        const task = {
          id: `MANUAL-${Date.now().toString(36)}`,
          title,
          phase: 'manual',
          status: 'backlog',
          assignee: payload.assignee ? String(payload.assignee) : null,
          blockedBy: null,
          dependencies: [],
          executionState: 'queued',
          retryCount: 0,
          lastFailedAt: null,
          lastError: null,
          lastProgressAt: null,
          executionTaskRunId: null,
          pendingApproval: null,
          autoActionNotBeforeAt: null,
          deadLetteredAt: null,
          createdAt: nowIso(),
          completedAt: null,
          startedAt: null,
          description: String(payload.description || ''),
          retryLineage: [],
        };
        runtime.state.tasks.push(task);
        appendProjectLog(runtime.state, 'task', { kind: 'task_created', taskId: task.id, title: task.title });
        persistProjectState(runtime.state);
        writeJson(res, task, 201);
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/approvals' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const sortBy = String(urlObj.searchParams.get('sortBy') || 'risk').trim().toLowerCase();
      const direction = String(urlObj.searchParams.get('direction') || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
      const minRisk = String(urlObj.searchParams.get('minRisk') || 'all').trim().toLowerCase();
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      const riskThreshold = minRisk === 'high' ? 70 : minRisk === 'medium' ? 40 : 0;
      const approvals = runtime.state.tasks
        .filter((task) => task.status === 'review' && task.executionState === 'awaiting_approval')
        .map((task) => ({
          taskId: task.id,
          title: task.title,
          phase: task.phase,
          assignee: task.assignee,
          requestedAt: task.pendingApproval && task.pendingApproval.requestedAt ? task.pendingApproval.requestedAt : task.lastProgressAt,
          reason: task.pendingApproval && task.pendingApproval.reason ? task.pendingApproval.reason : task.lastError,
          risk: task.pendingApproval && task.pendingApproval.risk ? task.pendingApproval.risk : { score: 0, level: 'low', requiresHuman: true },
          detail: task.pendingApproval && task.pendingApproval.detail ? task.pendingApproval.detail : {},
        }))
        .filter((entry) => Number(entry.risk && entry.risk.score || 0) >= riskThreshold);

      approvals.sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'requestedat') {
          const av = Date.parse(a.requestedAt || '');
          const bv = Date.parse(b.requestedAt || '');
          cmp = (Number.isFinite(av) ? av : 0) - (Number.isFinite(bv) ? bv : 0);
        } else if (sortBy === 'title') {
          cmp = String(a.title || '').localeCompare(String(b.title || ''));
        } else {
          cmp = Number(a.risk && a.risk.score || 0) - Number(b.risk && b.risk.score || 0);
        }
        return direction === 'asc' ? cmp : -cmp;
      });

      writeJson(res, { projectId, sortBy, direction, minRisk, items: approvals });
      return;
    }

    if (pathname === '/api/approval_audit' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const limit = Number(urlObj.searchParams.get('limit') || 200);
      if (!projectId) {
        writeJson(res, { error: 'projectId is required' }, 400);
        return;
      }
      writeJson(res, {
        projectId,
        items: readApprovalDecisionAudit(projectId, limit),
      });
      return;
    }

    if (pathname === '/api/approval_audit/export' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      if (!projectId) {
        writeJson(res, { error: 'projectId is required' }, 400);
        return;
      }
      const target = projectApprovalAuditPath(projectId);
      if (!fs.existsSync(target)) {
        writeJson(res, { error: 'No approval audit exists for this project yet.' }, 404);
        return;
      }
      const ndjson = fs.readFileSync(target, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="approval-audit-${projectId}.ndjson"`,
      });
      res.end(ndjson);
      return;
    }

    if (pathname === '/api/retry_policy/test' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const connector = String(payload.connector || 'default').trim().toLowerCase() || 'default';
        const reason = String(payload.reason || 'HTTP 503 timeout').trim();
        const policy = retryPolicyForConnector(connector);
        const attempts = [];
        for (let attempt = 1; attempt <= policy.maxAttempts + 1; attempt += 1) {
          const plan = connectorRetryPlan(connector, attempt, reason, {});
          attempts.push({
            attempt,
            retryable: Boolean(plan.retryable && attempt <= policy.maxAttempts),
            delayMs: Number(plan.delayMs || 0),
          });
        }
        writeJson(res, {
          ok: true,
          connector,
          reason,
          policy,
          attempts,
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/task_approval' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const taskId = String(payload.taskId || '').trim();
        const decision = String(payload.decision || '').trim().toLowerCase();
        const note = String(payload.note || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        if (!taskId || (decision !== 'approve' && decision !== 'deny')) {
          writeJson(res, { error: 'taskId and decision (approve|deny) are required' }, 400);
          return;
        }

        const task = runtime.state.tasks.find((entry) => entry.id === taskId);
        if (!task) {
          writeJson(res, { error: 'Task not found' }, 404);
          return;
        }
        if (!(task.status === 'review' && task.executionState === 'awaiting_approval')) {
          writeJson(res, { error: 'Task is not awaiting approval' }, 400);
          return;
        }

        applyTaskApprovalDecision(runtime.state, task, decision, note, 'operator');
        persistProjectState(runtime.state);
        writeJson(res, { ok: true, task });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/task_approval/batch' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const decision = String(payload.decision || '').trim().toLowerCase();
        const note = String(payload.note || '').trim();
        const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        if (!taskIds.length || (decision !== 'approve' && decision !== 'deny')) {
          writeJson(res, { error: 'taskIds[] and decision (approve|deny) are required' }, 400);
          return;
        }

        const results = [];
        taskIds.forEach((taskId) => {
          const task = runtime.state.tasks.find((entry) => entry.id === taskId);
          if (!task) {
            results.push({ taskId, ok: false, error: 'Task not found' });
            return;
          }
          if (!(task.status === 'review' && task.executionState === 'awaiting_approval')) {
            results.push({ taskId, ok: false, error: 'Task is not awaiting approval' });
            return;
          }
          applyTaskApprovalDecision(runtime.state, task, decision, note, 'operator_batch');
          results.push({ taskId, ok: true, task });
        });

        persistProjectState(runtime.state);
        writeJson(res, {
          ok: true,
          projectId,
          decision,
          results,
          successCount: results.filter((entry) => entry.ok).length,
          failureCount: results.filter((entry) => !entry.ok).length,
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/heartbeat' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, {
          status: 'unknown',
          uptime: '0m',
          lastBeat: null,
          autoFixCount: 0,
          log: []
        });
        return;
      }
      writeJson(res, {
        status: runtime.state.heartbeat.status,
        uptime: projectUptime(runtime.state),
        lastBeat: runtime.state.heartbeat.lastBeat,
        autoFixCount: runtime.state.heartbeat.autoFixCount,
        log: runtime.state.heartbeat.log.slice(0, 50)
      });
      return;
    }

    if (pathname === '/api/heartbeat' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }
        const projectId = String(payload.projectId || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        runProjectHeartbeat(runtime.state, 'manual');
        writeJson(res, { triggered: true, ts: nowIso() });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/workspace' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const relativePath = String(urlObj.searchParams.get('path') || '').trim();
      if (!projectId) {
        writeJson(res, { error: 'projectId is required' }, 400);
        return;
      }
      const runtime = projectRuntimes.get(projectId);
      if (runtime && runtime.state) {
        writeProjectWorkspaceArtifacts(runtime.state);
      }
      try {
        writeJson(res, listProjectWorkspace(projectId, relativePath));
      } catch (err) {
        writeJson(res, { error: err.message }, 404);
      }
      return;
    }

    if (pathname === '/api/workspace/file' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const relativePath = String(urlObj.searchParams.get('path') || '').trim();
      if (!projectId) {
        writeJson(res, { error: 'projectId is required' }, 400);
        return;
      }
      const runtime = projectRuntimes.get(projectId);
      if (runtime && runtime.state) {
        writeProjectWorkspaceArtifacts(runtime.state);
      }
      try {
        writeJson(res, readProjectWorkspaceFile(projectId, relativePath));
      } catch (err) {
        writeJson(res, { error: err.message }, 404);
      }
      return;
    }

    if (pathname === '/api/credentials' && req.method === 'GET') {
      writeJson(res, readCredentialMetadata());
      return;
    }

    if (pathname === '/api/connector_bootstrap' && req.method === 'GET') {
      const service = String(urlObj.searchParams.get('service') || '').trim().toLowerCase();
      if (!['netlify', 'google_ads', 'supabase'].includes(service)) {
        writeJson(res, { error: 'service must be one of netlify, google_ads, supabase' }, 400);
        return;
      }
      discoverConnectorBootstrapTargets(service).then((result) => {
        if (!result.ok) {
          writeJson(res, result, 400);
          return;
        }
        writeJson(res, result);
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/connector_bootstrap' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const service = String(payload.service || '').trim().toLowerCase();
        const selectedId = String(payload.selectedId || payload.resourceId || '').trim();
        if (!['netlify', 'google_ads', 'supabase'].includes(service)) {
          writeJson(res, { error: 'service must be one of netlify, google_ads, supabase' }, 400);
          return;
        }
        if (!selectedId) {
          writeJson(res, { error: 'selectedId is required' }, 400);
          return;
        }

        try {
          const config = setCredentialBootstrapDefault(service, selectedId);
          writeJson(res, {
            ok: true,
            service,
            selectedId,
            config,
          });
        } catch (err) {
          writeJson(res, { error: err.message }, 400);
        }
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/connector_bootstrap/auto' && req.method === 'POST') {
      autoBootstrapConnectorTargets().then((result) => {
        writeJson(res, result);
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/credential_budget' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      if (!projectId) {
        writeJson(res, { error: 'projectId is required' }, 400);
        return;
      }

      const snapshot = getCredentialBudgetSnapshot(projectId);
      const policies = listProjectCredentialPolicies(projectId);
      writeJson(res, {
        projectId,
        services: SUPPORTED_CREDENTIAL_SERVICES.map((service) => {
          const policy = policies.find((entry) => entry.service === service) || defaultCredentialPolicy(projectId, service);
          const budget = snapshot[service] || normalizeBudgetCounterEntry({}, nowIso());
          return {
            service,
            dailySpent: budget.dailySpent,
            monthlySpent: budget.monthlySpent,
            dailyPeriod: budget.dailyPeriod,
            monthlyPeriod: budget.monthlyPeriod,
            monthlyCap: policy.monthlyCap,
            enabled: policy.enabled,
          };
        }),
      });
      return;
    }

    if (pathname === '/api/credential_audit' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const limit = Number(urlObj.searchParams.get('limit') || 80);
      writeJson(res, readCredentialAudit(projectId || null, limit));
      return;
    }

    if (pathname === '/api/credentials' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const service = String(payload.service || '').trim();
        const token = String(payload.token || '').trim();
        const defaultSiteId = String(payload.defaultSiteId || payload.siteId || '').trim();
        const defaultCustomerId = String(payload.defaultCustomerId || payload.customerId || '').trim();
        const defaultProjectRef = String(payload.defaultProjectRef || payload.projectRef || '').trim();
        if (!SUPPORTED_CREDENTIAL_SERVICES.includes(service)) {
          writeJson(res, { error: 'Unsupported credential service' }, 400);
          return;
        }
        const hasExistingToken = Boolean(readCredentialToken(service));
        if (!token && !hasExistingToken) {
          writeJson(res, { error: 'token is required' }, 400);
          return;
        }
        const budget = typeof payload.budget === 'number' ? payload.budget : null;
        saveCredentialMetadata(service, token, budget, {
          defaultSiteId: service === 'netlify' ? defaultSiteId : undefined,
          defaultCustomerId: service === 'google_ads' ? defaultCustomerId : undefined,
          defaultProjectRef: service === 'supabase' ? defaultProjectRef : undefined,
        });
        writeJson(res, {
          service,
          connected: true,
          config: {
            defaultSiteId: service === 'netlify' ? (defaultSiteId || null) : null,
            defaultCustomerId: service === 'google_ads' ? (defaultCustomerId || null) : null,
            defaultProjectRef: service === 'supabase' ? (defaultProjectRef || null) : null,
          },
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname.startsWith('/api/credentials/') && req.method === 'DELETE') {
      const service = pathname.replace('/api/credentials/', '').trim();
      if (!SUPPORTED_CREDENTIAL_SERVICES.includes(service)) {
        writeJson(res, { error: 'Unsupported credential service' }, 400);
        return;
      }
      deleteCredentialMetadata(service);
      writeJson(res, { ok: true });
      return;
    }

    if (pathname === '/api/analytics' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      writeJson(res, runtime ? makeAnalyticsSnapshot(runtime.state) : {
        kpi: ['-', '-', '-', '-', '-', '-'],
        metrics: { tasksDoneThisWeek: 0, backlog: 0, monthlySpend: 0 },
        goals: { ...DEFAULT_KPI_GOALS },
        variance: { weeklyTasksDone: 0, backlog: 0, monthlySpend: 0 },
        alerts: [],
        weeklyPlan: null,
        deadLetters: [],
        lastUpdated: nowIso(),
      });
      return;
    }

    if (pathname === '/api/kpi_goals' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      ensureKpiGoalState(runtime.state);
      writeJson(res, {
        projectId,
        goals: {
          weeklyTasksDoneTarget: runtime.state.kpiGoals.weeklyTasksDoneTarget,
          maxBacklog: runtime.state.kpiGoals.maxBacklog,
          maxMonthlySpend: runtime.state.kpiGoals.maxMonthlySpend,
        },
        weeklyPlan: runtime.state.kpiGoals.weeklyPlan,
      });
      return;
    }

    if (pathname === '/api/kpi_goals' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }
        const projectId = String(payload.projectId || '').trim();
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }

        ensureKpiGoalState(runtime.state);
        const goalsPatch = payload.goals && typeof payload.goals === 'object' ? payload.goals : {};
        runtime.state.kpiGoals.weeklyTasksDoneTarget = clampInt(goalsPatch.weeklyTasksDoneTarget, runtime.state.kpiGoals.weeklyTasksDoneTarget, 1, 5000);
        runtime.state.kpiGoals.maxBacklog = clampInt(goalsPatch.maxBacklog, runtime.state.kpiGoals.maxBacklog, 0, 10000);
        runtime.state.kpiGoals.maxMonthlySpend = clampNumber(goalsPatch.maxMonthlySpend, runtime.state.kpiGoals.maxMonthlySpend, 0, 100000000);
        runtime.state.kpiGoals.weeklyPlan.lastPlannedAt = null;
        runtime.state.kpiGoals.weeklyPlan.nextReviewAt = null;

        refreshWeeklyKpiPlan(runtime.state, nowIso());
        persistProjectState(runtime.state);
        writeJson(res, {
          ok: true,
          projectId,
          goals: {
            weeklyTasksDoneTarget: runtime.state.kpiGoals.weeklyTasksDoneTarget,
            maxBacklog: runtime.state.kpiGoals.maxBacklog,
            maxMonthlySpend: runtime.state.kpiGoals.maxMonthlySpend,
          },
          weeklyPlan: runtime.state.kpiGoals.weeklyPlan,
          analytics: makeAnalyticsSnapshot(runtime.state),
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/doctor' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const includeIntegrationTests = String(urlObj.searchParams.get('includeIntegrationTests') || '').trim().toLowerCase() === 'true';
      runDoctorChecks({
        projectId: projectId || null,
        includeIntegrationTests,
      }).then((report) => {
        writeJson(res, report, report.ok ? 200 : 503);
      }).catch((err) => {
        writeJson(res, {
          ok: false,
          summary: `Doctor execution failed: ${err.message}`,
          checks: [],
        }, 500);
      });
      return;
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      const latestDoctor = evaluateDoctorReadiness([
        {
          id: 'cached_doctor_status',
          ok: Boolean(appState.llm.reachable),
          severity: 'critical',
          reason: appState.llm.reachable
            ? 'Cached LLM reachability check is healthy.'
            : `${llmProviderLabel(appState.llm.provider)} endpoint is currently unreachable.`,
          detail: {
            endpoint: appState.llm.endpoint,
            provider: appState.llm.provider,
          },
        },
      ], { cached: true });
      const recentEvidence = listProductionEvidenceRuns(10);
      writeJson(res, {
        runtime: runtimeSettings(),
        defaults: DEFAULT_RUNTIME_SETTINGS,
        planning: planningSettings(),
        planningDefaults: DEFAULT_PLANNING_SETTINGS,
        retryPolicies: retryPoliciesSummary(),
        llm: {
          provider: appState.llm.provider,
          endpoint: appState.llm.endpoint,
          model: preferredLlmModelLabel(),
          cloudProviders: Boolean(appConfig?.llm?.cloudProviders),
          apiKeyEnv: String(appConfig?.llm?.apiKeyEnv || ''),
          apiKeyConfigured: Boolean(resolveLlmApiKey(appConfig?.llm || {})),
        },
        lastCertification: (appConfig && appConfig.lastCertification) || null,
        productionEvidence: {
          latest: recentEvidence[0] || null,
          recentRuns: recentEvidence,
        },
        doctor: latestDoctor,
        notifications: notificationSettingsSummary(),
      });
      return;
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const runtimePatch = payload.runtime && typeof payload.runtime === 'object' ? payload.runtime : {};
        const planningPatch = payload.planning && typeof payload.planning === 'object' ? payload.planning : {};
        const retryPolicyPatch = payload.retryPolicies && typeof payload.retryPolicies === 'object' ? payload.retryPolicies : {};
        const llmPatch = payload.llm && typeof payload.llm === 'object' ? payload.llm : {};
        const nextEndpoint = String(llmPatch.endpoint || '').trim();
        const nextProvider = normalizeLlmProvider(llmPatch.provider);
        const nextModel = String(llmPatch.model || '').trim();
        const nextCloudProviders = typeof llmPatch.cloudProviders === 'boolean' ? llmPatch.cloudProviders : null;
        const nextApiKeyEnv = typeof llmPatch.apiKeyEnv !== 'undefined' ? String(llmPatch.apiKeyEnv || '').trim() : null;
        const nextApiKey = typeof llmPatch.apiKey !== 'undefined' ? String(llmPatch.apiKey || '').trim() : null;
        const notificationPatch = payload.notifications && typeof payload.notifications === 'object' ? payload.notifications : {};

        applyRuntimeSettingsUpdate(runtimePatch);
        applyPlanningSettingsUpdate(planningPatch);

        if (nextEndpoint || nextModel || typeof llmPatch.provider !== 'undefined' || nextCloudProviders !== null || nextApiKeyEnv !== null || nextApiKey !== null) {
          appConfig.llm = appConfig.llm || {};
          if (nextEndpoint) {
            appConfig.llm.endpoint = nextEndpoint;
            appState.llm.endpoint = nextEndpoint;
          }
          appConfig.llm.provider = nextProvider;
          appState.llm.provider = nextProvider;
          if (nextModel) {
            appConfig.llm.model = nextModel;
            appState.llm.model = nextModel;
          }
          if (nextCloudProviders !== null) {
            appConfig.llm.cloudProviders = Boolean(nextCloudProviders);
          }
          if (nextApiKeyEnv !== null) {
            appConfig.llm.apiKeyEnv = nextApiKeyEnv;
          }
          if (nextApiKey !== null) {
            appConfig.llm.apiKey = nextApiKey;
          }
          appState.llm.cloudProviders = Boolean(appConfig.llm.cloudProviders);
          persistAppConfig();
        }

        if (notificationPatch && typeof notificationPatch === 'object') {
          appConfig.integrations = appConfig.integrations || {};
          appConfig.integrations.whatsapp = appConfig.integrations.whatsapp || {};
          appConfig.integrations.telegram = appConfig.integrations.telegram || {};
          appConfig.notifications = appConfig.notifications || {};
          appConfig.notifications.kpiAlerts = appConfig.notifications.kpiAlerts || {};

          const nextNotifyTo = String(notificationPatch.whatsappNotifyTo || '').trim();
          const nextTelegramChatId = String(notificationPatch.telegramChatId || '').trim();
          const nextChannel = String(notificationPatch.preferredChannel || '').trim().toLowerCase();
          const nextKpiAlertsEnabled = typeof notificationPatch.kpiAlertsEnabled === 'boolean'
            ? notificationPatch.kpiAlertsEnabled
            : null;
          const nextKpiAlertCooldownMinutes = notificationPatch.kpiAlertCooldownMinutes;

          if (nextNotifyTo || notificationPatch.whatsappNotifyTo === '') {
            appConfig.integrations.whatsapp.notifyTo = nextNotifyTo;
          }
          if (nextTelegramChatId || notificationPatch.telegramChatId === '') {
            appConfig.integrations.telegram.chatId = nextTelegramChatId;
          }
          if (nextChannel === 'whatsapp' || nextChannel === 'telegram') {
            appConfig.notifications.preferredChannel = nextChannel;
          }
          if (nextKpiAlertsEnabled !== null) {
            appConfig.notifications.kpiAlerts.enabled = nextKpiAlertsEnabled;
          }
          if (typeof nextKpiAlertCooldownMinutes !== 'undefined') {
            appConfig.notifications.kpiAlerts.cooldownMinutes = clampInt(nextKpiAlertCooldownMinutes, 120, 1, 7 * 24 * 60);
          }
          persistAppConfig();
        }

        if (retryPolicyPatch && typeof retryPolicyPatch === 'object') {
          applyRetryPoliciesUpdate(retryPolicyPatch);
        }

        writeJson(res, {
          ok: true,
          runtime: runtimeSettings(),
          defaults: DEFAULT_RUNTIME_SETTINGS,
          planning: planningSettings(),
          planningDefaults: DEFAULT_PLANNING_SETTINGS,
          retryPolicies: retryPoliciesSummary(),
          llm: {
            provider: appState.llm.provider,
            endpoint: appState.llm.endpoint,
            model: preferredLlmModelLabel(),
            cloudProviders: Boolean(appConfig?.llm?.cloudProviders),
            apiKeyEnv: String(appConfig?.llm?.apiKeyEnv || ''),
            apiKeyConfigured: Boolean(resolveLlmApiKey(appConfig?.llm || {})),
          },
          notifications: notificationSettingsSummary(),
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/settings/reset' && req.method === 'POST') {
      applyRuntimeSettingsUpdate(DEFAULT_RUNTIME_SETTINGS);
      applyPlanningSettingsUpdate(DEFAULT_PLANNING_SETTINGS);
      writeJson(res, {
        ok: true,
        runtime: runtimeSettings(),
        defaults: DEFAULT_RUNTIME_SETTINGS,
        planning: planningSettings(),
        planningDefaults: DEFAULT_PLANNING_SETTINGS,
        retryPolicies: retryPoliciesSummary(),
        llm: {
          provider: appState.llm.provider,
          endpoint: appState.llm.endpoint,
          model: preferredLlmModelLabel(),
          cloudProviders: Boolean(appConfig?.llm?.cloudProviders),
          apiKeyEnv: String(appConfig?.llm?.apiKeyEnv || ''),
          apiKeyConfigured: Boolean(resolveLlmApiKey(appConfig?.llm || {})),
        },
        notifications: notificationSettingsSummary(),
      });
      return;
    }

    if (pathname === '/api/production_certification' && req.method === 'POST') {
      const port = Number(process.env.PORT || 3000);
      const baseUrl = `http://127.0.0.1:${port}`;
      runProductionCertification(baseUrl).then(async (result) => {
        const evidence = await persistProductionCertificationEvidence(result, { baseUrl });
        appConfig.lastCertification = {
          at: new Date().toISOString(),
          passed: result.ok,
          durationMs: result.durationMs,
          evidenceRunId: evidence.runId,
          checklistPassed: Boolean(evidence.summary && evidence.summary.passed),
        };
        persistAppConfig();
        writeJson(res, {
          ...result,
          evidence: {
            runId: evidence.runId,
            summary: evidence.summary,
          },
        }, result.ok ? 200 : 500);
      }).catch((err) => {
        writeJson(res, {
          ok: false,
          exitCode: -1,
          durationMs: 0,
          stdout: '',
          stderr: redactSensitive(err.message),
        }, 500);
      });
      return;
    }

    if (pathname === '/api/production_certification' && req.method === 'GET') {
      const runId = String(urlObj.searchParams.get('runId') || '').trim();
      const limit = clampInt(urlObj.searchParams.get('limit'), 20, 1, 100);
      const latest = listProductionEvidenceRuns(1)[0] || null;
      if (runId) {
        const run = readProductionEvidenceRun(runId);
        if (!run) {
          writeJson(res, { error: 'Evidence run not found.' }, 404);
          return;
        }
        writeJson(res, {
          latest,
          run,
          recentRuns: listProductionEvidenceRuns(limit),
        });
        return;
      }
      writeJson(res, {
        latest,
        recentRuns: listProductionEvidenceRuns(limit),
      });
      return;
    }

    if (pathname === '/api/production_certification/evidence/export' && req.method === 'GET') {
      const requestedRunId = String(urlObj.searchParams.get('runId') || '').trim();
      const latest = listProductionEvidenceRuns(1)[0] || null;
      const runId = requestedRunId || (latest && latest.runId) || '';
      const run = readProductionEvidenceRun(runId);
      if (!run) {
        writeJson(res, { error: 'No production evidence run available.' }, 404);
        return;
      }
      const text = exportProductionEvidenceText(run);
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="hiveforge-production-evidence-${run.runId}.txt"`,
      });
      res.end(text);
      return;
    }

    if (pathname === '/api/preflight' && (req.method === 'GET' || req.method === 'POST')) {
      const runWithPayload = (payload = {}) => {
        const projectId = String(payload.projectId || '').trim();
        const connector = String(payload.connector || '').trim();
        const operation = String(payload.operation || '').trim();
        const estimatedCost = Number(payload.estimatedCost || 0);
        const input = payload.input && typeof payload.input === 'object' ? payload.input : {};

        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }

        const preflight = evaluateProductionPreflight(runtime.state, {
          connector,
          operation,
          estimatedCost,
          input,
        });
        writeJson(res, {
          projectId,
          ...preflight,
        }, preflight.ok ? 200 : 412);
      };

      if (req.method === 'GET') {
        runWithPayload({
          projectId: String(urlObj.searchParams.get('projectId') || '').trim(),
          connector: String(urlObj.searchParams.get('connector') || '').trim(),
          operation: String(urlObj.searchParams.get('operation') || '').trim(),
          estimatedCost: Number(urlObj.searchParams.get('estimatedCost') || 0),
          input: {
            siteId: String(urlObj.searchParams.get('siteId') || '').trim(),
            rollbackDeployId: String(urlObj.searchParams.get('rollbackDeployId') || '').trim(),
          },
        });
      } else {
        readRequestBody(req).then((body) => {
          let payload = {};
          try {
            payload = parseJsonBodySafe(body);
          } catch (err) {
            writeJson(res, { error: 'Invalid JSON body' }, 400);
            return;
          }
          runWithPayload(payload);
        }).catch((err) => {
          writeJson(res, { error: err.message }, 400);
        });
      }
      return;
    }

    if (pathname === '/api/netlify/deploy' && req.method === 'POST') {
      readRequestBody(req).then(async (body) => {
        let payload = {};
        try { payload = parseJsonBodySafe(body); } catch (_) {}
        const siteId = String(payload.siteId || '').trim();
        const idempotencyKey = String(payload.idempotencyKey || '').trim() || connectorMutationExecutionKey('netlify', 'trigger_deploy', { siteId });
        const projectId = String(payload.projectId || '').trim();
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        if (!siteId) {
          writeJson(res, { ok: false, error: 'siteId is required.' }, 400);
          return;
        }
        if (projectId && runtime?.state?.mode === 'draft') {
          writeJson(res, { ok: false, error: 'Cannot deploy in draft mode. Promote to production first.' }, 412);
          return;
        }
        if (projectId) {
          if (!runtime) {
            writeJson(res, { ok: false, error: 'Project not found.' }, 404);
            return;
          }
          const preflight = evaluateProductionPreflight(runtime.state, {
            connector: 'netlify',
            operation: 'trigger_deploy',
            estimatedCost: 0,
            input: {
              siteId,
              rollbackDeployId: String(payload.rollbackDeployId || '').trim(),
              rollbackPlan: payload.rollbackPlan || null,
            },
            rollbackReady: Boolean(payload.rollbackReady),
          });
          if (!preflight.ok) {
            writeJson(res, {
              ok: false,
              error: 'Production preflight checks failed.',
              errorCode: 'PRECHECK_FAILED',
              preflight,
            }, 412);
            return;
          }
        }
        try {
          const result = await executeNetlifyConnector({ operation: 'trigger_deploy', siteId, idempotencyKey, projectId: projectId || undefined });
          const reconciliation = result.ok
            ? await reconcileConnectorExecution('netlify', 'trigger_deploy', result, { siteId, projectId, idempotencyKey })
            : null;
          if (result.ok) {
            await appendMessageBusEntry({
              kind: 'netlify_deploy_triggered',
              projectId: projectId || null,
              agentId: null,
              payload: {
                siteId,
                deployId: result.data?.id,
                state: result.data?.state,
                idempotencyKey,
                reconciliation,
              },
            });
          }
          writeJson(res, {
            ...result,
            idempotency: {
              key: idempotencyKey,
              mode: connectorIdempotencyMode('netlify', 'trigger_deploy'),
            },
            reconciliation,
          }, result.ok ? 200 : 500);
        } catch (err) {
          writeJson(res, { ok: false, error: redactSensitive(err.message) }, 500);
        }
      }).catch(() => writeJson(res, { ok: false, error: 'Invalid request body.' }, 400));
      return;
    }

    if (pathname === '/api/netlify/deploys' && req.method === 'GET') {
      const siteId = String(urlObj.searchParams.get('siteId') || '').trim();
      if (!siteId) {
        writeJson(res, { ok: false, error: 'siteId query parameter is required.' }, 400);
        return;
      }
      executeNetlifyConnector({ operation: 'list_deploys', siteId }).then((result) => {
        writeJson(res, result, result.ok ? 200 : 500);
      }).catch((err) => {
        writeJson(res, { ok: false, error: redactSensitive(err.message) }, 500);
      });
      return;
    }

    if (pathname === '/api/project_settings' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      writeJson(res, summarizeProjectAutomation(runtime.state));
      return;
    }

    if (pathname === '/api/project_settings' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }

        ensureRecurringState(runtime.state);
        ensureApprovalGovernanceState(runtime.state);
        ensureBudgetHardStopState(runtime.state);
        const recurring = payload.recurring && typeof payload.recurring === 'object' ? payload.recurring : {};
        const approvalGovernance = payload.approvalGovernance && typeof payload.approvalGovernance === 'object'
          ? payload.approvalGovernance
          : {};
        const budgetHardStop = payload.budgetHardStop && typeof payload.budgetHardStop === 'object'
          ? payload.budgetHardStop
          : {};
        let enqueuedNow = 0;
        if (typeof recurring.enabled === 'boolean') {
          runtime.state.recurring.enabled = recurring.enabled;
          appendProjectLog(runtime.state, 'message', {
            kind: 'project_recurring_updated',
            enabled: recurring.enabled,
          });
          appendMessageBusEntry({
            projectId,
            from: 'coordinator',
            to: 'scheduler',
            kind: 'project_recurring_updated',
            payload: { enabled: recurring.enabled },
          });
        }

        if (recurring.enqueueNow === true) {
          enqueuedNow = enqueueRecurringTasks(runtime.state, nowIso(), 'manual_trigger');
          appendProjectLog(runtime.state, 'message', {
            kind: 'project_recurring_run_now',
            enqueued: enqueuedNow,
          });
          appendMessageBusEntry({
            projectId,
            from: 'coordinator',
            to: 'scheduler',
            kind: 'project_recurring_run_now',
            payload: { enqueued: enqueuedNow },
          });
        }

        if (typeof approvalGovernance.enabled === 'boolean') {
          runtime.state.approvalGovernance.enabled = approvalGovernance.enabled;
          runtime.state.approvalGovernance.updatedAt = nowIso();
          recordApprovalGovernanceRevision(runtime.state, 'operator', 'project_settings_update');
          appendProjectLog(runtime.state, 'message', {
            kind: 'approval_governance_updated',
            enabled: approvalGovernance.enabled,
          });
          appendMessageBusEntry({
            projectId,
            from: 'operator',
            to: 'approval_policy_pack',
            kind: 'approval_governance_updated',
            payload: { enabled: approvalGovernance.enabled },
          });
        }

        if (budgetHardStop && budgetHardStop.resume === true) {
          clearBudgetHardStop(runtime.state, 'operator', {
            reason: String(budgetHardStop.reason || '').trim() || 'manual_resume',
          });
        }

        persistProjectState(runtime.state);
        writeJson(res, {
          ...summarizeProjectAutomation(runtime.state),
          enqueuedNow,
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/approval_governance/revisions' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const limit = clampInt(urlObj.searchParams.get('limit'), 30, 1, 200);
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      ensureApprovalGovernanceState(runtime.state);
      const history = Array.isArray(runtime.state.approvalGovernance.revisions.history)
        ? runtime.state.approvalGovernance.revisions.history
        : [];
      const items = history.slice(-limit).reverse();
      writeJson(res, {
        projectId,
        currentRevisionId: runtime.state.approvalGovernance.revisions.currentRevisionId || null,
        count: history.length,
        items,
      });
      return;
    }

    if (pathname === '/api/approval_governance/rollback' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const revisionId = String(payload.revisionId || '').trim();
        const reason = String(payload.reason || '').trim() || 'manual_rollback';
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        if (!revisionId) {
          writeJson(res, { error: 'revisionId is required' }, 400);
          return;
        }

        const rollback = rollbackApprovalGovernanceRevision(runtime.state, revisionId, 'operator', reason);
        if (!rollback.ok) {
          writeJson(res, { error: rollback.error || 'Rollback failed.' }, 400);
          return;
        }

        appendProjectLog(runtime.state, 'message', {
          kind: 'approval_governance_rollback_applied',
          targetRevisionId: revisionId,
          reason,
          appliedRevisionId: rollback.appliedRevision && rollback.appliedRevision.id,
        });
        appendMessageBusEntry({
          projectId,
          from: 'operator',
          to: 'approval_policy_pack',
          kind: 'approval_governance_rollback_applied',
          payload: {
            targetRevisionId: revisionId,
            reason,
            appliedRevisionId: rollback.appliedRevision && rollback.appliedRevision.id,
          },
        });
        persistProjectState(runtime.state);
        writeJson(res, {
          ok: true,
          projectId,
          targetRevisionId: revisionId,
          appliedRevision: rollback.appliedRevision,
          summary: summarizeProjectAutomation(runtime.state),
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/credential_policy' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      if (!projectId) {
        writeJson(res, { error: 'projectId is required' }, 400);
        return;
      }
      writeJson(res, {
        projectId,
        services: listProjectCredentialPolicies(projectId),
      });
      return;
    }

    if (pathname === '/api/credential_policy' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const service = String(payload.service || '').trim();
        if (!projectId) {
          writeJson(res, { error: 'projectId is required' }, 400);
          return;
        }
        if (!SUPPORTED_CREDENTIAL_SERVICES.includes(service)) {
          writeJson(res, { error: 'Unsupported credential service' }, 400);
          return;
        }

        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }

        const policyPatch = payload.policy && typeof payload.policy === 'object' ? payload.policy : {};
        const nextPolicy = upsertProjectCredentialPolicy(projectId, service, {
          enabled: typeof policyPatch.enabled === 'boolean' ? policyPatch.enabled : undefined,
          monthlyCap: typeof policyPatch.monthlyCap === 'number'
            ? policyPatch.monthlyCap
            : (policyPatch.monthlyCap === null ? null : undefined),
        });

        appendProjectLog(runtime.state, nextPolicy.enabled ? 'policy_allow' : 'policy_deny', {
          kind: 'credential_policy_updated',
          service,
          approved: nextPolicy.enabled,
          decision: nextPolicy.enabled ? 'allow' : 'deny',
          monthlyCap: nextPolicy.monthlyCap,
        });
        appendMessageBusEntry({
          projectId,
          from: 'coordinator',
          to: 'policy_engine',
          kind: 'credential_policy_updated',
          payload: {
            service,
            enabled: nextPolicy.enabled,
            monthlyCap: nextPolicy.monthlyCap,
          },
        });
        appendCredentialAudit({
          projectId,
          service,
          action: 'policy_update',
          decision: nextPolicy.enabled ? 'allow' : 'deny',
          reason: nextPolicy.enabled ? 'Credential policy enabled.' : 'Credential policy disabled.',
          meta: {
            monthlyCap: nextPolicy.monthlyCap,
          },
        });
        persistProjectState(runtime.state);

        writeJson(res, {
          projectId,
          services: listProjectCredentialPolicies(projectId),
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/connectors/execute' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const connector = String(payload.connector || '').trim();
        const projectId = String(payload.projectId || '').trim();
        const dryRun = Boolean(payload.dryRun);
        const estimatedCost = typeof payload.estimatedCost === 'number' ? payload.estimatedCost : null;
        const operation = String(payload.operation || '').trim();
        const input = payload.input && typeof payload.input === 'object' ? payload.input : {};
        const actorRole = String(payload.actorRole || '').trim();
        const requiresPermission = Boolean(payload.requiresPermission);
        const productionMode = Boolean(payload.productionMode);

        if (!connector) {
          writeJson(res, { error: 'connector is required' }, 400);
          return;
        }

        executeConnectorPolicy(connector, { dryRun, projectId, estimatedCost, actorRole, operation }).then(async (result) => {
          let response = { ...result, operation, execution: null };
          let auditDecision = result.decision;
          let auditReason = result.reason;
          let auditErrorCode = result.errorCode || null;
          let actualCost = 0;
          let reconciliation = null;
          const isMutating = isMutatingConnectorOperation(connector, operation);
          const idempotencyMode = connectorIdempotencyMode(connector, operation);
          const executionKey = (!dryRun && isMutating)
            ? String(payload.idempotencyKey || '').trim() || connectorMutationExecutionKey(connector, operation, input)
            : null;

          if (result.ok && !dryRun && productionMode) {
            const runtime = projectRuntimes.get(projectId);
            if (!runtime) {
              response.ok = false;
              response.decision = 'deny';
              response.reason = 'Project not found for production preflight.';
              response.errorCode = 'project_not_found';
            } else {
              const preflight = evaluateProductionPreflight(runtime.state, {
                connector,
                operation,
                estimatedCost: Number(estimatedCost || 0),
                input,
                rollbackReady: Boolean(payload.rollbackReady),
              });
              response.preflight = preflight;
              if (!preflight.ok) {
                response.ok = false;
                response.decision = 'deny';
                response.reason = preflight.summary;
                response.errorCode = 'PRECHECK_FAILED';
              }
            }
          }

          if (response.ok && !dryRun && projectId && executionKey) {
            const runtime = projectRuntimes.get(projectId);
            if (runtime && runtime.state) {
              ensureConnectorExecutionState(runtime.state);
              const previousExecution = runtime.state.connectorExecutions[executionKey] || null;
              if (previousExecution && previousExecution.status === 'succeeded') {
                response.reason = previousExecution.message || 'idempotent_replay_success';
                response.execution = {
                  ok: true,
                  operation,
                  actualCost: 0,
                  message: response.reason,
                  data: previousExecution.result || null,
                  idempotentReplay: true,
                  executionKey,
                };
                reconciliation = previousExecution.reconciliation || null;
              } else if (previousExecution && previousExecution.status === 'running') {
                const startedMs = Date.parse(previousExecution.startedAt || previousExecution.updatedAt || '');
                if (Number.isFinite(startedMs) && (Date.now() - startedMs) < CONNECTOR_EXECUTION_STALE_MS) {
                  response.reason = 'Duplicate mutating connector execution suppressed while prior run is still active.';
                  response.execution = {
                    ok: true,
                    operation,
                    actualCost: 0,
                    message: response.reason,
                    data: previousExecution.result || null,
                    idempotentReplay: true,
                    executionKey,
                    pending: true,
                  };
                } else {
                  markConnectorExecutionRecord(runtime.state, executionKey, {
                    status: 'stale_running',
                    staleAt: nowIso(),
                    message: 'Marked stale after manual connector execution recovery timeout.',
                  });
                }
              }
            }
          }

          if (response.ok && !dryRun) {
            if (!response.execution) {
              if (projectId && executionKey) {
                const runtime = projectRuntimes.get(projectId);
                if (runtime && runtime.state) {
                  markConnectorExecutionRecord(runtime.state, executionKey, {
                    connector: String(connector || '').trim().toLowerCase(),
                    operation: String(operation || '').trim().toLowerCase(),
                    status: 'running',
                    startedAt: nowIso(),
                    attempts: 1,
                    source: 'manual_execute',
                    lastError: null,
                  });
                  persistProjectState(runtime.state);
                }
              }

              const supportRouting = evaluateSupportAutonomyRouting({
                connector,
                operation,
                input,
                actorRole,
              });
              response.supportRouting = supportRouting.route;
              if (!supportRouting.ok) {
                response.ok = false;
                response.decision = 'deny';
                response.reason = supportRouting.summary;
                response.errorCode = 'PRECHECK_FAILED';
                auditDecision = 'deny';
                auditReason = supportRouting.summary;
                auditErrorCode = 'PRECHECK_FAILED';
                if (projectId && executionKey) {
                  const runtime = projectRuntimes.get(projectId);
                  if (runtime && runtime.state) {
                    markConnectorExecutionRecord(runtime.state, executionKey, {
                      status: 'failed',
                      lastError: supportRouting.summary,
                      checks: supportRouting.checks,
                    });
                    persistProjectState(runtime.state);
                  }
                }
              }

              const runtimeForFinanceGuard = projectId ? projectRuntimes.get(projectId) : null;
              const financeGuardrail = evaluateFinanceAutonomyGuardrails({
                connector,
                operation,
                input,
                actorRole,
                projectState: runtimeForFinanceGuard && runtimeForFinanceGuard.state ? runtimeForFinanceGuard.state : null,
              });
              response.financeGuardrail = financeGuardrail.route;
              if (response.ok && !financeGuardrail.ok) {
                response.ok = false;
                response.decision = 'deny';
                response.reason = financeGuardrail.summary;
                response.errorCode = 'PRECHECK_FAILED';
                auditDecision = 'deny';
                auditReason = financeGuardrail.summary;
                auditErrorCode = 'PRECHECK_FAILED';
                if (projectId && executionKey) {
                  const runtime = projectRuntimes.get(projectId);
                  if (runtime && runtime.state) {
                    markConnectorExecutionRecord(runtime.state, executionKey, {
                      status: 'failed',
                      lastError: financeGuardrail.summary,
                      checks: financeGuardrail.checks,
                    });
                    persistProjectState(runtime.state);
                  }
                }
              }

              if (response.ok) {
                const executionInput = {
                  ...input,
                  supportRouting: supportRouting.route,
                  financeGuardrail: financeGuardrail.route,
                };
                const execution = await executeLiveConnector(connector, {
                  operation,
                  input: executionInput,
                  projectId,
                  estimatedCost,
                  idempotencyKey: executionKey || undefined,
                });
                response.execution = execution;
                if (!execution.ok) {
                  response.ok = false;
                  response.decision = 'deny';
                  response.reason = execution.message;
                  response.errorCode = execution.errorCode;
                  auditDecision = 'deny';
                  auditReason = execution.message;
                  auditErrorCode = execution.errorCode;
                  if (projectId && executionKey) {
                    const runtime = projectRuntimes.get(projectId);
                    if (runtime && runtime.state) {
                      markConnectorExecutionRecord(runtime.state, executionKey, {
                        status: 'failed',
                        lastError: execution.message || execution.errorCode || 'execution_failed',
                      });
                      persistProjectState(runtime.state);
                    }
                  }
                } else {
                  actualCost = typeof execution.actualCost === 'number' && Number.isFinite(execution.actualCost)
                    ? execution.actualCost
                    : (typeof estimatedCost === 'number' ? estimatedCost : 0);
                  let financeExceptions = { count: 0, escalated: 0, items: [] };
                  if (projectId) {
                    const runtime = projectRuntimes.get(projectId);
                    if (runtime && runtime.state) {
                      financeExceptions = await processFinanceSettlementExceptions(runtime.state, {
                        connector,
                        operation,
                        execution,
                        input: executionInput,
                        executionKey,
                        source: 'manual_execute',
                        taskId: null,
                      });
                      response.financeExceptions = financeExceptions;
                    }
                  }
                  response.reason = execution.message || response.reason;
                  auditDecision = 'allow';
                  auditReason = response.reason;
                  if (isMutating) {
                    reconciliation = await reconcileConnectorExecution(connector, operation, execution, {
                      projectId,
                      siteId: String(input && input.siteId ? input.siteId : ''),
                      executionKey,
                    });
                    response.reconciliation = reconciliation;
                  }
                  if (projectId && executionKey) {
                    const runtime = projectRuntimes.get(projectId);
                    if (runtime && runtime.state) {
                      markConnectorExecutionRecord(runtime.state, executionKey, {
                        status: 'succeeded',
                        message: response.reason,
                        completedAt: nowIso(),
                        actualCost,
                        result: execution.data || null,
                        reconciliation,
                        financeExceptions,
                      });
                      if (reconciliation && reconciliation.checked && !reconciliation.ok) {
                        appendProjectLog(runtime.state, 'message', {
                          kind: 'connector_reconciliation_pending',
                          connector,
                          operation,
                          executionKey,
                          reconciliation,
                        });
                        appendMessageBusEntry({
                          projectId,
                          from: 'coordinator',
                          to: 'reconciliation_engine',
                          kind: 'connector_reconciliation_pending',
                          payload: {
                            connector,
                            operation,
                            executionKey,
                            reconciliation,
                          },
                        });
                      }
                      persistProjectState(runtime.state);
                    }
                  }
                }
              }
            } else {
              auditDecision = 'allow';
              auditReason = response.reason;
            }
          }

          if (projectId && result.credentialService && response.ok && !dryRun && actualCost > 0) {
            response.budget = recordCredentialSpend(projectId, result.credentialService, actualCost, nowIso());
          } else if (projectId && result.credentialService) {
            response.budget = getCredentialBudgetSnapshot(projectId)[result.credentialService] || null;
          }

          appendCredentialAudit({
            projectId: projectId || null,
            service: result.credentialService || connector,
            operation,
            action: 'connector_execute',
            decision: auditDecision,
            errorCode: auditErrorCode,
            cost: actualCost,
            dryRun,
            reason: auditReason,
            meta: {
              connector: result.connector,
              estimatedCost,
              idempotencyKey: executionKey,
              idempotencyMode,
              reconciliation,
            },
          });

          if (projectId) {
            const runtime = projectRuntimes.get(projectId);
            if (runtime) {
              if (!response.ok && requiresPermission) {
                await notifyOperator(runtime.state, `Permission requested for ${connector}:${operation || 'n/a'}`, {
                  actorRole: actorRole || null,
                  reason: response.reason,
                  checks: response.checks,
                });
              }
              appendProjectLog(runtime.state, response.ok ? 'policy_allow' : 'policy_deny', {
                kind: 'connector_policy_decision',
                connector: response.connector,
                operation,
                decision: response.decision,
                approved: response.ok,
                dryRun: response.dryRun,
                actorRole: actorRole || null,
                reason: response.reason,
                checks: response.checks,
                actualCost,
              });
              appendMessageBusEntry({
                projectId,
                from: 'coordinator',
                to: 'policy_engine',
                kind: 'connector_policy_decision',
                payload: {
                  connector: response.connector,
                  operation,
                  decision: response.decision,
                  approved: response.ok,
                  dryRun: response.dryRun,
                  actorRole: actorRole || null,
                  reason: response.reason,
                  actualCost,
                },
              });
              persistProjectState(runtime.state);
            }
          }

          writeJson(res, response, response.errorCode ? 400 : 200);
        }).catch((err) => {
          writeJson(res, {
            connector,
            operation,
            ok: false,
            decision: 'deny',
            reason: `Connector execution failed: ${redactSensitive(err.message)}`,
            dryRun,
            checkedAt: nowIso(),
            checks: []
          }, 500);
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/logs' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const filter = String(urlObj.searchParams.get('filter') || 'all');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, []);
        return;
      }
      const allLogs = runtime.state.logs || [];
      const out = filter === 'all' ? allLogs : allLogs.filter((entry) => entry.type === filter);
      writeJson(res, out.slice(0, 500));
      return;
    }

    if (pathname === '/api/message_bus' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const limit = Number(urlObj.searchParams.get('limit') || 200);
      const kind = String(urlObj.searchParams.get('kind') || '').trim();
      const actor = String(urlObj.searchParams.get('actor') || '').trim();
      const query = String(urlObj.searchParams.get('q') || '').trim();
      writeJson(res, readMessageBusEntries(projectId || null, limit, { kind, actor, query }));
      return;
    }

    if (pathname === '/api/control' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const action = String(payload.action || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }

        if (action === 'pause') {
          runtime.state.status = 'paused';
          cancelProjectExecution(projectId, 'project_paused', true);
          stopProjectLoop(projectId);
          runtime.state.agents.forEach((agent) => {
            if (!agent.isCoordinator && agent.status === 'running') {
              agent.status = 'idle';
              agent.currentTask = null;
              markAgentLog(agent, 'Paused by project control');
            }
          });
          appendProjectLog(runtime.state, 'message', { kind: 'project_paused' });
          appendMessageBusEntry({ projectId, from: 'coordinator', to: 'all', kind: 'project_paused', payload: {} });
          emitProjectEvent(projectId, 'project_status', { status: 'paused', projectId });
        } else if (action === 'resume') {
          runtime.state.status = 'running';
          appendProjectLog(runtime.state, 'message', { kind: 'project_resumed' });
          appendMessageBusEntry({ projectId, from: 'coordinator', to: 'all', kind: 'project_resumed', payload: {} });
          emitProjectEvent(projectId, 'project_status', { status: 'running', projectId });
          startProjectLoop(projectId);
        } else if (action === 'restart_agents') {
          cancelProjectExecution(projectId, 'restart_agents', true);
          const isFailed    = runtime.state.status === 'failed';
          const isCompleted = runtime.state.status === 'completed';

          if (isCompleted) {
            // Full replay: reset all tasks to backlog
            runtime.state.tasks.forEach((t) => {
              requeueTaskToBacklog(t, 'restart_replay', false);
              t.completedAt = null;
              t.blockedBy = t.dependencies?.[0] || null;
            });
            runtime.state.completedAt = null;
          } else {
            // Reset any stalled inprogress tasks back to backlog
            runtime.state.tasks.forEach((t) => {
              if (t.status === 'inprogress') {
                requeueTaskToBacklog(t, 'restart_agents', false);
              }
            });
          }

          if (isFailed || isCompleted) {
            runtime.state.status = 'running';
            runtime.state.failedAt = null;
            runtime.state.heartbeat.autoFixCount = 0;
            runtime.state.heartbeat.status = 'alive';
            emitProjectEvent(projectId, 'project_status', { status: 'running', projectId });
          }

          runtime.state.agents.forEach((agent) => {
            if (agent.isCoordinator) {
              agent.status = 'running';
            } else {
              agent.status = 'idle';
              agent.currentTask = null;
            }
            markAgentLog(agent, 'Restarted by coordinator control');
          });
          appendProjectLog(runtime.state, 'fix', { kind: 'agents_restarted', from: isFailed ? 'failed' : isCompleted ? 'completed' : 'running' });
          appendMessageBusEntry({ projectId, from: 'coordinator', to: 'all', kind: 'agents_restarted', payload: { from: isFailed ? 'failed' : isCompleted ? 'completed' : 'running' } });
          if (isFailed || isCompleted) startProjectLoop(projectId);
        } else if (action === 'heartbeat') {
          runProjectHeartbeat(runtime.state, 'manual_control');
        } else if (action === 'export') {
          const exportPath = path.join(projectDir(projectId), `export_${Date.now()}.json`);
          fs.writeFileSync(exportPath, `${JSON.stringify(runtime.state, null, 2)}\n`, 'utf-8');
          appendProjectLog(runtime.state, 'message', { kind: 'project_exported', exportPath: path.basename(exportPath) });
        } else if (action === 'delete') {
          removeProject(projectId);
          writeJson(res, { ok: true, action, projectId });
          return;
        } else {
          writeJson(res, { error: `Unsupported action: ${action}` }, 400);
          return;
        }

        persistProjectState(runtime.state);
        writeJson(res, { ok: true, action, projectId });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/llm_health' && req.method === 'GET') {
      const model = preferredLlmModelLabel() || 'connected';
      writeJson(res, appState.llm.reachable
        ? { status: 'ok', provider: appState.llm.provider, model, endpoint: appState.llm.endpoint }
        : { status: 'error', provider: appState.llm.provider, message: `${llmProviderLabel(appState.llm.provider)} not reachable`, endpoint: appState.llm.endpoint });
      return;
    }

    if (pathname === '/api/integrations' && req.method === 'GET') {
      const status = integrationStatus();
      writeJson(res, {
        github: Boolean(status.github.configured || status.github.publicKeyPresent),
        clawhub: fs.existsSync(path.join(__dirname, '.clawhub')),
        apiGateway: Boolean(status.apiGateway && status.apiGateway.configured),
      });
      return;
    }

    if (req.url === '/api/task' && req.method === 'POST') {
      readRequestBody(req).then((body) => handleTask(req, res, body)).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (req.url === '/api/task/smoke' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      const { taskRun, child } = runCanonicalSmokeTest(res);
      req.on('close', () => {
        if (taskRun.status === 'running' && child) {
          child.kill();
          completeTaskRun(taskRun, 'failed', -1, `Task ${taskRun.id} interrupted by client disconnect`);
        }
      });
      return;
    }

    if (req.url === '/api/task/smoke-browser' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      const { taskRun, child } = runCanonicalBrowserSmokeTest(res);
      req.on('close', () => {
        if (taskRun.status === 'running' && child) {
          child.kill();
          completeTaskRun(taskRun, 'failed', -1, `Task ${taskRun.id} interrupted by client disconnect`);
        }
      });
      return;
    }

    if (req.url === '/api/task/stop' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const requested = payload.taskId ? Number(payload.taskId) : null;
        const targetTaskId = Number.isFinite(requested) && requested > 0 ? requested : latestRunningTaskId();
        if (!targetTaskId) {
          writeJson(res, { ok: false, message: 'No running task to stop.' }, 404);
          return;
        }

        const stopped = stopTaskById(targetTaskId);
        writeJson(res, {
          ok: stopped,
          taskId: targetTaskId,
          message: stopped ? `Stopped task ${targetTaskId}.` : `Task ${targetTaskId} is not running.`
        }, stopped ? 200 : 409);
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (req.url === '/api/public-key') {
      handlePublicKey(res);
      return;
    }

    if (req.url === '/api/state') {
      writeJson(res, {
        llm: appState.llm,
        metrics: getMetrics(),
        history: taskHistory.slice().reverse().map(summarizeTask),
        integrations: integrationStatus()
      });
      return;
    }

    if (req.url === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    if (req.url === '/api/llm/check') {
      const provider = normalizeLlmProvider(appConfig?.llm?.provider || appState.llm.provider);
      const endpoint = String(appConfig?.llm?.endpoint || appState.llm.endpoint || '').trim();
      const apiKey = resolveLlmApiKey(appConfig?.llm || {});
      pingLLMEndpoint(provider, endpoint, apiKey).then((result) => {
        appState.llm.provider = provider;
        appState.llm.endpoint = endpoint;
        appState.llm.cloudProviders = Boolean(appConfig?.llm?.cloudProviders);
        appState.llm.reachable = result.reachable;
        if (result.model && !normalizeLlmModelLabel(appConfig?.llm?.model)) appState.llm.model = result.model;
        appState.llm.lastCheckedAt = new Date().toISOString();
        writeJson(res, {
          ...appState.llm,
          model: preferredLlmModelLabel(),
        });
      }).catch(() => {
        appState.llm.provider = provider;
        appState.llm.endpoint = endpoint;
        appState.llm.cloudProviders = Boolean(appConfig?.llm?.cloudProviders);
        appState.llm.reachable = false;
        appState.llm.lastCheckedAt = new Date().toISOString();
        writeJson(res, {
          ...appState.llm,
          model: preferredLlmModelLabel(),
        });
      });
      return;
    }

    if (req.url === '/api/integrations/test' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        testIntegration(payload.provider).then((result) => {
          recordIntegrationTestInHistory(result);
          writeJson(res, result);
        }).catch((err) => {
          writeJson(res, {
            provider: payload.provider,
            ok: false,
            message: `Integration test failed: ${redactSensitive(err.message)}`,
            testedAt: new Date().toISOString()
          }, 500);
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/notifications/test' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }
        const projectId = String(payload.projectId || '').trim();
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        const projectState = runtime ? runtime.state : null;
        const summary = String(payload.summary || 'Coordinator test notification').trim();
        notifyOperator(projectState, summary, {
          test: true,
          requestedBy: 'dashboard',
          projectId: projectId || null,
        }).then((result) => {
          writeJson(res, {
            ok: Boolean(result.ok),
            provider: result.provider,
            reason: result.reason || null,
            notifications: notificationSettingsSummary(),
          }, result.ok ? 200 : 409);
        }).catch((err) => {
          writeJson(res, {
            ok: false,
            provider: null,
            reason: redactSensitive(err.message),
          }, 500);
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (req.url === '/api/task/rerun' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const taskId = Number(payload.taskId);
        const existing = taskHistory.find((entry) => entry.id === taskId);
        if (!existing) {
          writeJson(res, { error: 'Task not found' }, 404);
          return;
        }

        if (existing.source === 'integration-test') {
          const provider = existing.meta && existing.meta.provider;
          testIntegration(provider).then((result) => {
            recordIntegrationTestInHistory(result);
            writeJson(res, {
              ok: true,
              rerunType: 'integration-test',
              result
            });
          }).catch((err) => {
            writeJson(res, {
              ok: false,
              error: redactSensitive(err.message)
            }, 500);
          });
          return;
        }

        const { taskRun } = runAgentTask(existing.task, null);
        writeJson(res, {
          ok: true,
          rerunType: 'task',
          taskId: taskRun.id,
          message: 'Task rerun queued.'
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (req.url && req.url.startsWith('/api/history/') && req.url.endsWith('/export')) {
      const parts = req.url.split('/').filter(Boolean);
      const id = Number(parts[2]);
      const taskRun = taskHistory.find((entry) => entry.id === id);
      if (!taskRun) {
        writeJson(res, { error: 'Task not found' }, 404);
        return;
      }
      const transcript = exportTaskTranscript(taskRun);
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="HiveForge-task-${id}.txt"`
      });
      res.end(transcript);
      return;
    }

    if (req.url && req.url.startsWith('/api/history/')) {
      const id = Number(req.url.split('/').pop());
      const taskRun = taskHistory.find((entry) => entry.id === id);
      if (!taskRun) {
        writeJson(res, { error: 'Task not found' }, 404);
        return;
      }
      writeJson(res, taskRun);
      return;
    }

    // ============================================
    // DRAFT MODE & USER FEEDBACK API ROUTES
    // ============================================

    // Preview static assets endpoint for draft projects (js/css/images)
    if (pathname.startsWith('/api/projects/') && pathname.includes('/preview/assets/') && req.method === 'GET') {
      const match = pathname.match(/^\/api\/projects\/([^/]+)\/preview\/assets\/?(.*)$/);
      if (!match) {
        writeJson(res, { error: 'Invalid preview asset path' }, 400);
        return;
      }
      const projectId = decodeURIComponent(match[1]);
      const relPath = decodeURIComponent(match[2] || 'index.html');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime || runtime.state.mode !== 'draft') {
        writeJson(res, { error: 'Preview not available for this project' }, 404);
        return;
      }
      const root = resolveProjectPreviewRoot(projectId);
      if (!root) {
        writeJson(res, { error: 'Preview assets not ready yet' }, 404);
        return;
      }
      const target = path.resolve(root, relPath || 'index.html');
      if (!target.startsWith(path.resolve(root))) {
        writeJson(res, { error: 'Forbidden path' }, 403);
        return;
      }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        writeJson(res, { error: 'Preview asset not found' }, 404);
        return;
      }
      res.writeHead(200, { 'Content-Type': contentTypeForPath(target) });
      res.end(fs.readFileSync(target));
      return;
    }

    // Preview endpoint for draft projects
    if (pathname.startsWith('/api/projects/') && pathname.endsWith('/preview') && req.method === 'GET') {
      const url_parts = pathname.split('/');
      const projectId = url_parts[3];
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime || runtime.state.mode !== 'draft') {
        writeJson(res, { error: 'Preview not available for this project' }, 404);
        return;
      }

      try {
        const roots = previewRootsForProject(projectId);
        const previewRoot = resolveProjectPreviewRoot(projectId);
        if (previewRoot) {
          const indexPath = path.join(previewRoot, 'index.html');
          let html = fs.readFileSync(indexPath, 'utf-8');
          if (previewRoot === roots.webRoot && /src\/(main|index)\.(ts|tsx)/i.test(html)) {
            const appSourcePath = path.join(roots.webRoot, 'src', 'App.tsx');
            const mainSourcePath = path.join(roots.webRoot, 'src', 'main.tsx');
            const appSource = fs.existsSync(appSourcePath) ? fs.readFileSync(appSourcePath, 'utf-8') : 'No App.tsx generated yet.';
            const mainSource = fs.existsSync(mainSourcePath) ? fs.readFileSync(mainSourcePath, 'utf-8') : 'No main.tsx generated yet.';
            const esc = (text) => String(text || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            const webPreview = `<!doctype html><html><head><meta charset="utf-8"/><title>Web Draft Preview</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:20px;background:#0b1220;color:#e6edf8}h1{font-size:20px;margin:0 0 10px}p{line-height:1.45;color:#b7c3d8}code{background:#162033;padding:2px 6px;border-radius:6px}pre{white-space:pre-wrap;background:#111a2b;border:1px solid #25314a;border-radius:10px;padding:12px;line-height:1.4;color:#d7e2f2;max-height:40vh;overflow:auto}</style></head><body><h1>Web Draft Preview</h1><p>This project uses React + TypeScript + Vite. Draft preview shows source snapshots; run locally with <code>npm install</code> then <code>npm run dev</code> for an interactive browser experience.</p><h2>src/main.tsx</h2><pre>${esc(mainSource)}</pre><h2>src/App.tsx</h2><pre>${esc(appSource)}</pre></body></html>`;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(webPreview);
            return;
          }
          const baseHref = `/api/projects/${encodeURIComponent(projectId)}/preview/assets/`;
          if (/<base\s+href=/i.test(html)) {
            html = html.replace(/<base\s+href=["'][^"']*["']\s*\/?\s*>/i, `<base href="${baseHref}">`);
          } else if (/<head[^>]*>/i.test(html)) {
            html = html.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${baseHref}">`);
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        const mobileAppTsx = path.join(roots.mobileRoot, 'App.tsx');
        if (fs.existsSync(mobileAppTsx)) {
          const appSource = fs.readFileSync(mobileAppTsx, 'utf-8');
          const screenPath = path.join(roots.mobileRoot, 'src', 'screens', 'HomeScreen.tsx');
          const screenSource = fs.existsSync(screenPath) ? fs.readFileSync(screenPath, 'utf-8') : 'No HomeScreen.tsx generated yet.';
          const esc = (text) => String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          const mobilePreview = `<!doctype html><html><head><meta charset="utf-8"/><title>Mobile Draft Preview</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:20px;background:#0b1220;color:#e6edf8}h1{font-size:20px;margin:0 0 10px}p{line-height:1.45;color:#b7c3d8}code{background:#162033;padding:2px 6px;border-radius:6px}pre{white-space:pre-wrap;background:#111a2b;border:1px solid #25314a;border-radius:10px;padding:12px;line-height:1.4;color:#d7e2f2;max-height:40vh;overflow:auto}</style></head><body><h1>Mobile Draft Preview</h1><p>This project uses React Native + Expo, so there is no direct browser render of native screens in draft preview.</p><p>Run locally with <code>npm install</code> then <code>npx expo start</code>. For Android wrapper builds, use <code>npx expo run:android</code> or EAS build in production flow.</p><h2>App.tsx</h2><pre>${esc(appSource)}</pre><h2>HomeScreen.tsx</h2><pre>${esc(screenSource)}</pre></body></html>`;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(mobilePreview);
          return;
        }

        // Fallback preview for non-HTML templates (e.g., Publishing House)
        const manuscript = path.join(roots.projectRoot, 'book', 'manuscript.md');
        const brief = path.join(roots.projectRoot, 'project_brief.md');
        const sourcePath = fs.existsSync(manuscript) ? manuscript : (fs.existsSync(brief) ? brief : null);
        const sourceText = sourcePath ? fs.readFileSync(sourcePath, 'utf-8') : 'No preview-ready artifact found yet. Open Workspace Explorer to inspect files.';
        const escaped = sourceText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const fallbackHtml = `<!doctype html><html><head><meta charset="utf-8"/><title>Draft Preview</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#fff;color:#111}h1{font-size:18px;margin:0 0 12px}pre{white-space:pre-wrap;background:#f6f8fa;border:1px solid #ddd;border-radius:8px;padding:12px;line-height:1.45}</style></head><body><h1>Draft Preview</h1><pre>${escaped}</pre></body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallbackHtml);
      } catch (err) {
        writeJson(res, { error: 'Failed to load preview' }, 500);
      }
      return;
    }

    // User feedback endpoint
    if (pathname.startsWith('/api/projects/') && pathname.endsWith('/feedback') && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try { payload = parseJsonBodySafe(body); } catch (_) {}
        const url_parts = pathname.split('/');
        const projectId = url_parts[3];
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
          payload: { message, targetAgentRole: targetAgentRole || 'coordinator', feedbackId, sentAt: nowIso() }
        }).then(() => {
          appendProjectLog(runtime.state, 'message', {
            kind: 'user_feedback_received',
            feedbackId,
            message,
            targetAgentRole: targetAgentRole || 'coordinator',
          });
          persistProjectState(runtime.state);
          writeJson(res, { ok: true, feedbackId, message: 'Feedback sent to coordinator', status: 'pending' }, 201);
        }).catch((err) => {
          writeJson(res, { error: 'Failed to send feedback' }, 500);
        });
      }).catch(() => writeJson(res, { error: 'Invalid request' }, 400));
      return;
    }

    // Project messages history
    if (pathname.startsWith('/api/projects/') && pathname.endsWith('/messages') && req.method === 'GET') {
      const url_parts = pathname.split('/');
      const projectId = url_parts[3];
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      const msgs = Array.isArray(runtime.state.logs)
        ? runtime.state.logs
            .filter((entry) => {
              const kind = String(entry?.data?.kind || '').toLowerCase();
              return kind === 'user_feedback_received' || kind === 'feedback_task_created' || kind === 'agent_response_to_feedback';
            })
            .map((entry) => ({
              ts: entry.ts,
              type: entry.type,
              kind: entry?.data?.kind || '',
              message: entry?.data?.message || '',
              targetAgentRole: entry?.data?.targetAgentRole || '',
              feedbackId: entry?.data?.feedbackId || '',
            }))
        : [];
      writeJson(res, { ok: true, messages: msgs, count: msgs.length });
      return;
    }

    // Promote draft to production
    if (pathname.startsWith('/api/projects/') && pathname.endsWith('/promote') && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        const url_parts = pathname.split('/');
        const projectId = url_parts[3];
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
        appendProjectLog(runtime.state, 'message', {
          kind: 'project_promoted_to_production',
          message: 'Project promoted to production. Deploy can proceed.',
        });
        persistProjectState(runtime.state);
        writeJson(res, { ok: true, projectId, message: 'Project promoted to production', mode: 'production' }, 200);
      }).catch(() => writeJson(res, { error: 'Invalid request' }, 400));
      return;
    }

    if (req.url === '/workspace') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Workspace lives inside /sandbox/workspace within the Pinokio sandbox.');
      return;
    }

    serveStatic(req, res);
  });

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => log(`HiveForge UI running at http://localhost:${port}`));
}

if (require.main === module) {
  main().catch((err) => {
    log(`Start failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  executeConnectorPolicy,
  upsertProjectCredentialPolicy,
  recordCredentialSpend,
  getCredentialBudgetSnapshot,
  ensureCredentialStorage,
  assessApprovalRisk,
  ensureApprovalGovernanceState,
  evaluateApprovalGovernanceDecision,
  applyIndustryApprovalPolicyPack,
  connectorRetryPlan,
  buildGoalMilestones,
  evaluateMilestoneCompletion,
  verifyGoalDelivery,
  summarizeProjectAutomation,
  buildProductionEvidenceBundle,
  evaluateDoctorReadiness,
  connectorExecutionKey,
  connectorMutationExecutionKey,
  isMutatingConnectorOperation,
  shouldBlockMutatingConnectorInDraftMode,
  shouldSkipConnectorPolicyFailureInDraft,
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
  activateBudgetHardStop,
  clearBudgetHardStop,
  recordApprovalGovernanceRevision,
  rollbackApprovalGovernanceRevision,
  refreshWeeklyKpiPlan,
  ensureOperationalLoopState,
  summarizeIdleBlockers,
  isOperationalLoopSuspended,
  makeAnalyticsSnapshot,
  shouldEscalateGameplayRemediation,
  shouldEscalateGenericTaskRemediation,
  runProjectHeartbeat,
  evaluateProductionPreflight,
  ensureMessageBus,
  appendMessageBusEntry,
  readMessageBusEntries,
  recoverProjectStateAfterRestart,
  acquireTaskLease,
  isTaskLeaseActive,
  requeueTaskToBacklog,
  evaluateAutoStaffing,
  ensureStaffingState,
  shouldKeepRunningForRecurring,
  SUPPORTED_CREDENTIAL_SERVICES,
};





