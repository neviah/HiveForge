// Pinokio install manifest for HiveForge

module.exports = {
  run: [
    {
      method: 'shell.run',
      params: {
        message: [
          'mkdir sandbox 2>nul',
          'mkdir sandbox\\workspace 2>nul',
          'mkdir sandbox\\projects 2>nul'
        ]
      }
    },
    {
      method: 'shell.run',
      params: {
        message: [
          'git submodule sync --recursive && git submodule update --init --recursive || echo [HiveForge] Warning: submodule sync failed; continuing with local files.'
        ]
      }
    },
    {
      when: "{{!exists('.venv/Scripts/python.exe')}}",
      method: 'shell.run',
      params: {
        message: [
          'python -m venv .venv'
        ]
      }
    },
    {
      method: 'shell.run',
      params: {
        venv: '.venv',
        message: [
          'python -m pip install --upgrade pip',
          'python -m pip install openai anthropic playwright',
          'python -m playwright install chromium || echo [HiveForge] Playwright Chromium install failed; browser tools may be limited.'
        ]
      }
    },
    {
      method: 'shell.run',
      params: {
        message: [
          'echo HiveForge install completed.'
        ]
      }
    }
  ]
};
