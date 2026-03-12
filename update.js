// Pinokio update manifest for HiveForge

module.exports = {
  run: [
    {
      method: 'shell.run',
      params: {
        message: [
          'echo [HiveForge] Before update: && git rev-parse HEAD && git fetch origin main && git reset --hard origin/main && echo [HiveForge] After update: && git rev-parse HEAD && echo [HiveForge] Update pulled successfully.',
          'echo [HiveForge] Done. Stop and Start HiveForge in Pinokio to apply the update.'
        ]
      }
    }
  ]
};
