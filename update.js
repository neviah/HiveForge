// Pinokio update manifest for HiveForge

module.exports = {
  run: [
    {
      method: 'shell.run',
      params: {
        message: [
          'git fetch origin main && git reset --hard origin/main && echo [HiveForge] Update pulled successfully.'
        ]
      }
    },
    {
      method: 'shell.run',
      params: {
        message: [
          'echo [HiveForge] Done. Stop and Start HiveForge in Pinokio to apply the update.'
        ]
      }
    }
  ]
};
