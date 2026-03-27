# HiveForge

HiveForge is a business-focused OpenClaw fork packaged as a Pinokio app with sandboxed execution and coordinated multi-agent automation. It bundles modified OpenClaw source under `openclaw/`, supports OpenAI-compatible model endpoints (with OpenRouter as the current default in production usage), and restricts filesystem access to the sandbox workspace.

## Install (Pinokio)
1. Add this repo to Pinokio.
2. Run the action **Install HiveForge** (executes `node install.js`).
3. Configure your model provider credentials in `sandbox/config.json` (OpenRouter/OpenAI-compatible endpoint).
4. Run **Start HiveForge** to launch the web UI and agent.

## Start
- `node start.js` serves the web UI and streams tasks to the sandboxed agent.

## Production Certification
- With HiveForge running locally, execute `node scripts/production_certification.js` to run the Sprint D certification flow against the live HTTP API.
- Override the target server with `HIVEFORGE_BASE_URL=http://127.0.0.1:3000 node scripts/production_certification.js` if needed.

## Coordinator Permission Notifications
- The coordinator can escalate permission requests and automation failures to an operator.
- Preferred channel is WhatsApp (Graph API), with Telegram as fallback.
- Configure in `sandbox/config.json`:
	- `integrations.whatsapp.accessToken`
	- `integrations.whatsapp.phoneNumberId`
	- `integrations.whatsapp.notifyTo`
	- optional fallback: `integrations.telegram.botToken` and `integrations.telegram.chatId`

## Update
- `node update.js` refreshes bundled OpenClaw and dependencies without deleting the sandbox.

## GitHub SSH
- The installer auto-generates `/sandbox/.ssh/id_rsa` and prints the public key. Add it to your GitHub account to enable pushes from inside the sandbox workspace.

## Paths
- Sandbox root: `/sandbox`
- Workspace: `/sandbox/workspace` (only writable root)
- Config: `/sandbox/config.json`

## Provider
- OpenAI-compatible providers are supported.
- Current runtime default is cloud-hosted models via OpenRouter.
- Local providers can still be used when configured, but are no longer the required default.
