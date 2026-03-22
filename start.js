// Pinokio start manifest for HiveForge

module.exports = {
  run: [
    {
      when: "{{!exists('sandbox/config.json')}}",
      method: 'shell.run',
      params: {
        message: [
          'echo HiveForge is not installed yet. Run install.js first.'
        ]
      }
    },
    {
      when: "{{exists('sandbox/config.json')}}",
      method: 'local.set',
      params: {
        url: 'http://127.0.0.1:3000/dashboard/'
      }
    },
    {
      when: "{{exists('sandbox/config.json')}}",
      method: 'shell.run',
      params: {
        message: [
          'powershell -NoProfile -ExecutionPolicy Bypass -Command "$cfg = Get-Content ''sandbox/config.json'' -Raw | ConvertFrom-Json; $envName = [string]$cfg.llm.apiKeyEnv; if ($envName) { $secret = [System.Environment]::GetEnvironmentVariable($envName, ''User''); if (-not $secret) { $secret = [System.Environment]::GetEnvironmentVariable($envName, ''Machine'') }; if ($secret) { Set-Item -Path (''Env:'' + $envName) -Value $secret } }; node hiveforge_server.js"'
        ]
      }
    }
  ]
};
