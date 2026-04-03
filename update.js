// Pinokio update manifest for HiveForge

module.exports = {
  run: [
    {
      method: 'shell.run',
      params: {
        message: [
          'echo [HiveForge] Backing up runtime state... && if not exist sandbox mkdir sandbox && if not exist sandbox\\backups mkdir sandbox\\backups && if exist hiveforge\\state\\projects.json copy /Y hiveforge\\state\\projects.json sandbox\\backups\\projects.json >nul && if exist hiveforge\\config\\models.json copy /Y hiveforge\\config\\models.json sandbox\\backups\\models.json >nul',
          'echo [HiveForge] Before update: && git rev-parse HEAD && git fetch origin main && git reset --hard origin/main && echo [HiveForge] After update: && git rev-parse HEAD && echo [HiveForge] Update pulled successfully.',
          'echo [HiveForge] Restoring runtime state... && if exist sandbox\\backups\\projects.json copy /Y sandbox\\backups\\projects.json hiveforge\\state\\projects.json >nul && if exist sandbox\\backups\\models.json copy /Y sandbox\\backups\\models.json hiveforge\\config\\models.json >nul',
          'git submodule sync --recursive && git submodule update --init --recursive && echo [HiveForge] Agency-agents personality library synced. || echo [HiveForge] Warning: submodule sync failed; check .gitmodules mapping.',
          'echo [HiveForge] Done. Stop and Start HiveForge in Pinokio to apply the update.'
        ]
      }
    }
  ]
};
