// Pinokio start manifest for RamClaw

module.exports = {
  run: [
    {
      when: "{{!exists('sandbox/config.json')}}",
      method: 'shell.run',
      params: {
        message: [
          'echo RamClaw is not installed yet. Run install.js first.'
        ]
      }
    },
    {
      when: "{{exists('sandbox/config.json')}}",
      method: 'shell.run',
      params: {
        message: [
          'node ramclaw_server.js'
        ],
        on: [{
          "event": "/http:\/\/\\S+/",
          "done": true
        }]
      }
    },
    {
      method: 'local.set',
      params: {
        url: "http://127.0.0.1:{{input.event[0].split(':').pop()}}"
      }
    }
  ]
};