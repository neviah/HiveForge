// RamClaw sandbox bootstrapper
// Creates sandbox directories, config, git defaults, and SSH keys

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SANDBOX_ROOT = path.join(__dirname, 'sandbox');
const WORKSPACE_ROOT = path.join(SANDBOX_ROOT, 'workspace');
const SSH_DIR = path.join(SANDBOX_ROOT, '.ssh');
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
      model: 'REPLACE_WITH_LOCAL_MODEL_NAME',
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
        name: 'RamClaw Agent',
        email: 'ramclaw@sandbox.local'
      },
      sshKeyPath: '/sandbox/.ssh/id_rsa'
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
  const gitConfig = [['user.name', 'RamClaw Agent'], ['user.email', 'ramclaw@sandbox.local']];
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
