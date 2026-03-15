// HiveForge sandbox bootstrapper
// Creates sandbox directories, config, git defaults, and SSH keys

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SANDBOX_ROOT = path.join(__dirname, 'sandbox');
const WORKSPACE_ROOT = path.join(SANDBOX_ROOT, 'workspace');
const SSH_DIR = path.join(SANDBOX_ROOT, '.ssh');
const AGENTS_DIR = path.join(SANDBOX_ROOT, 'agents');
const MESSAGE_BUS_PATH = path.join(AGENTS_DIR, 'messages.db');
const CONFIG_PATH = path.join(SANDBOX_ROOT, 'config.json');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeConfig() {
  const config = {
    llm: {
      provider: 'lmstudio',
      endpoint: 'http://127.0.0.1:1234/api/v1',
      model: null,
      streaming: true,
      cloudProviders: false,
      remoteTools: false
    },
    sandbox: {
      workspace: path.join(SANDBOX_ROOT, 'workspace'),
      allowedReadRoots: [
        path.join(SANDBOX_ROOT, 'workspace'),
        path.join(SANDBOX_ROOT, 'config.json'),
        path.join(__dirname, 'openclaw')
      ],
      allowedWriteRoot: path.join(SANDBOX_ROOT, 'workspace')
    },
    git: {
      user: {
        name: 'HiveForge Agent',
        email: 'HiveForge@sandbox.local'
      },
      sshKeyPath: '/sandbox/.ssh/id_rsa'
    },
    runtime: {
      heartbeatIntervalMs: 30000,
      stallTimeoutMs: 600000,
      maxAutoFixes: 5,
      countManualHeartbeatForStall: false
    },
    planning: {
      preferFreeTierFirst: true,
      requireApprovalForPaidTierUpgrade: true,
      preferredDatabaseService: 'supabase'
    }
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function ensureSshKeys() {
  ensureDir(SSH_DIR);
  const privateKey = path.join(SSH_DIR, 'id_rsa');
  const publicKey = `${privateKey}.pub`;

  if (!fs.existsSync(privateKey) || !fs.existsSync(publicKey)) {
    const result = spawnSync('ssh-keygen', ['-t', 'rsa', '-b', '4096', '-f', privateKey, '-N', '', '-q'], {
      stdio: 'inherit'
    });
    if (result.error) {
      throw result.error;
    }
  }

  const pub = fs.readFileSync(publicKey, 'utf-8');
  return pub.trim();
}

function configureGit() {
  const gitConfig = [['user.name', 'HiveForge Agent'], ['user.email', 'HiveForge@sandbox.local']];
  gitConfig.forEach(([key, value]) => {
    spawnSync('git', ['config', '--global', key, value], {
      env: {
        ...process.env,
        HOME: SANDBOX_ROOT,
        USERPROFILE: SANDBOX_ROOT
      },
      stdio: 'ignore'
    });
  });
}

function bootstrapSandbox() {
  ensureDir(SANDBOX_ROOT);
  ensureDir(WORKSPACE_ROOT);
  ensureDir(SSH_DIR);
  ensureDir(AGENTS_DIR);
  if (!fs.existsSync(MESSAGE_BUS_PATH)) {
    fs.writeFileSync(MESSAGE_BUS_PATH, '');
  }
  writeConfig();
  const pubKey = ensureSshKeys();
  configureGit();
  return { pubKey };
}

if (require.main === module) {
  try {
    const { pubKey } = bootstrapSandbox();
    console.log('Sandbox initialized at', SANDBOX_ROOT);
    console.log('GitHub public key:');
    console.log(pubKey);
  } catch (err) {
    console.error('Failed to bootstrap sandbox:', err.message);
    process.exit(1);
  }
}

module.exports = {
  SANDBOX_ROOT,
  WORKSPACE_ROOT,
  SSH_DIR,
  CONFIG_PATH,
  bootstrapSandbox
};
