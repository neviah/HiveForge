# HiveForge

HiveForge is a Business-only Openclaw-fork on Steroids, fully sandboxed, LM Studio-only packaged as a Pinokio app. It bundles the modified OpenClaw source under `openclaw/`, enforces LM Studio as the only LLM provider, and restricts filesystem access to the sandbox workspace.

## Install (Pinokio)
1. Add this repo to Pinokio.
2. Run the action **Install HiveForge** (executes `node install.js`).
3. Start LM Studio locally at `http://127.0.0.1:1234/v1` with your chosen model.
4. Run **Start HiveForge** to launch the web UI and agent.

## Start
- `node start.js` serves the web UI and streams tasks to the sandboxed agent.

## Update
- `node update.js` refreshes bundled OpenClaw and dependencies without deleting the sandbox.

## GitHub SSH
- The installer auto-generates `/sandbox/.ssh/id_rsa` and prints the public key. Add it to your GitHub account to enable pushes from inside the sandbox workspace.

## Paths
- Sandbox root: `/sandbox`
- Workspace: `/sandbox/workspace` (only writable root)
- Config: `/sandbox/config.json`

## Provider
- Only LM Studio is allowed. Cloud LLMs and remote providers are disabled.
