// Pinokio install manifest for RamClaw

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
      when: "{{!exists('sandbox/venv')}}",
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
        message: [
          '".\\sandbox\\venv\\Scripts\\python.exe" -m pip install --upgrade pip',
          '".\\sandbox\\venv\\Scripts\\python.exe" -m pip install ./openclaw',
          '".\\sandbox\\venv\\Scripts\\python.exe" -m pip install playwright gitpython',
          '".\\sandbox\\venv\\Scripts\\python.exe" -m playwright install chromium',
          'node create_sandbox.js'
        ]
      }
    }
  ]
};
