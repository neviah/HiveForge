// Pinokio install manifest for RamClaw
// Sets up sandbox, venv, installs bundled OpenClaw, Playwright Chromium, and generates config + SSH keys

const path = require('path');

const python = process.platform === 'win32' ? 'python' : 'python3';
const venvPython = process.platform === 'win32'
  ? path.join('sandbox', 'venv', 'Scripts', 'python.exe')
  : path.join('sandbox', 'venv', 'bin', 'python');

module.exports = {
  run: [
    // Create sandbox directories
    {
      method: 'fs.mkdir',
      params: { path: 'sandbox', recursive: true }
    },
    {
      method: 'fs.mkdir',
      params: { path: path.join('sandbox', 'workspace'), recursive: true }
    },

    // Create venv
    {
      method: 'shell.run',
      params: {
        message: [`${python} -m venv sandbox/venv`]
      }
    },

    // Upgrade pip, install bundled OpenClaw, Playwright, and chromium
    {
      method: 'shell.run',
      params: {
        message: [
          `${venvPython} -m pip install --upgrade pip`,
          `${venvPython} -m pip install ./openclaw`,
          `${venvPython} -m pip install playwright`,
          `${venvPython} -m playwright install chromium`,
          `${venvPython} -m pip install gitpython`
        ]
      }
    },

    // Bootstrap sandbox config, git identity, and SSH keys
    {
      method: 'shell.run',
      params: {
        message: ['node create_sandbox.js']
      }
    }
  ]
};
