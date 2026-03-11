// Pinokio update manifest for HiveForge

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
      method: 'shell.run',
      params: {
        message: [
          'echo HiveForge update completed. No install or start steps were executed.'
        ]
      }
    }
  ]
};
