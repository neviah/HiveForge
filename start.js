// Pinokio start manifest for HiveForge

module.exports = {
  daemon: true,
  run: [
    {
      when: "{{!exists('.venv/Scripts/python.exe')}}",
      method: 'shell.run',
      params: {
        message: [
          'echo HiveForge is not installed yet. Run install.js first.'
        ]
      }
    },
    {
      when: "{{exists('.venv/Scripts/python.exe')}}",
      method: 'shell.run',
      params: {
        message: [
          'node hiveforge_server.js'
        ],
        on: [{
          event: "/(http:\\/\\/\\S+)/",
          done: true
        }]
      }
    },
    {
      when: "{{exists('.venv/Scripts/python.exe')}}",
      method: 'local.set',
      params: {
        url: "{{input.event[1]}}"
      }
    }
  ]
};
