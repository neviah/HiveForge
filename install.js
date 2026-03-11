// Pinokio install manifest for HiveForge

module.exports = {
  run: [
    {
      method: 'shell.run',
      params: {
        message: [
          'mkdir sandbox 2>nul',
          'mkdir sandbox\\workspace 2>nul'
        ]
      }
    },
    {
      when: "{{!exists('sandbox/venv/Scripts/python.exe')}}",
      method: 'shell.run',
      params: {
        message: [
          'python -m venv sandbox/venv'
        ]
      }
    },
    {
      method: 'shell.run',
      params: {
        venv: 'sandbox/venv',
        message: [
          'python -m pip install --upgrade pip',
          'uv pip install ./openclaw',
          'uv pip install playwright gitpython',
          'python -m playwright install chromium'
        ]
      }
    },
    {
      method: 'shell.run',
      params: {
        message: [
          'node create_sandbox.js',
          'echo HiveForge install completed.'
        ]
      }
    }
  ]
};
