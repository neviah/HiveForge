// Pinokio update manifest for RamClaw

module.exports = {
  run: [
    {
      method: 'shell.run',
      params: {
        message: [
          'git pull'
        ]
      }
    },
    {
      when: "{{exists('sandbox/venv')}}",
      method: 'shell.run',
      params: {
        message: [
          '".\\sandbox\\venv\\Scripts\\python.exe" -m pip install --upgrade ./openclaw',
          '".\\sandbox\\venv\\Scripts\\python.exe" -m pip install --upgrade playwright gitpython',
          '".\\sandbox\\venv\\Scripts\\python.exe" -m playwright install chromium',
          'node create_sandbox.js'
        ]
      }
    },
    {
      when: "{{!exists('sandbox/venv')}}",
      method: 'shell.run',
      params: {
        message: [
          'echo RamClaw is not installed yet. Run install.js first.'
        ]
      }
    }
  ]
};
