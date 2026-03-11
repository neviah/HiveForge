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
        url: 'http://127.0.0.1:3000/'
      }
    },
    {
      when: "{{exists('sandbox/config.json')}}",
      method: 'shell.run',
      params: {
        message: [
          'node hiveforge_server.js'
        ]
      }
    }
  ]
};
