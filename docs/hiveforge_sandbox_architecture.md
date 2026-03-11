# HiveForge Sandbox Architecture

- **Sandbox root**: `/sandbox`
- **Workspace**: `/sandbox/workspace` (only writeable location)
- **Config**: `/sandbox/config.json` prepopulated with LM Studio endpoint `http://127.0.0.1:1234/v1` and placeholders for local model name; cloud providers disabled.
- **LLM provider**: LM Studio only, OpenAI-compatible API, streaming enabled.
- **Tools**: Telegram, WhatsApp, Discord, Gmail, Browser, GitHub, File remain present (stubs here), expected to be extended inside the sandbox.
- **Git**: Configured with `HiveForge Agent <HiveForge@sandbox.local>` and SSH keys at `/sandbox/.ssh/` for GitHub pushes.
- **Isolation**: Reads allowed from `/sandbox/workspace`, bundled OpenClaw, and config; writes restricted to `/sandbox/workspace`; remote cloud LLM calls blocked.
