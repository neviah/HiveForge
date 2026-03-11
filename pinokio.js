// Pinokio app manifest for HiveForge with dynamic menu (install / start / update)

module.exports = {
	version: '2.0',
	title: 'HiveForge',
	description: 'Sandboxed LM Studio-only OpenClaw fork packaged for Pinokio.',
	icon: 'icon.png',
	menu: async (kernel, info) => {
		const sandboxExists = info.exists('sandbox');
		const venvExists = info.exists('sandbox/venv');
		const installed = sandboxExists && venvExists;

		const running = {
			install: info.running('install.js'),
			start: info.running('start.js'),
			update: info.running('update.js'),
		};

		if (running.install) {
			return [{
				default: true,
				icon: 'fa-solid fa-plug',
				text: 'Installing',
				href: 'install.js'
			}, {
				icon: 'fa-solid fa-terminal',
				text: 'Update Only',
				href: 'update.js'
			}];
		}

		if (installed) {
			if (running.start) {
				return [{
					default: true,
					icon: 'fa-solid fa-rocket',
					text: 'OpenWebUI',
					href: 'http://localhost:3000/'
				}, {
					icon: 'fa-solid fa-terminal',
					text: 'Terminal',
					href: 'start.js'
				}];
			}

			if (running.update) {
				return [{
					default: true,
					icon: 'fa-solid fa-terminal',
					text: 'Updating (no install/start)',
					href: 'update.js'
				}];
			}

			// Idle + installed: show Start, Update, Logs, Workspace, Key
			return [
				{
					default: true,
					icon: 'fa-solid fa-power-off',
					text: 'Start',
					href: 'start.js'
				},
				{
					icon: 'fa-solid fa-plug',
					text: 'Update Only',
					href: 'update.js'
				},
				{
					icon: 'fa-solid fa-eye',
					text: 'View Logs',
					href: 'sandbox/hiveforge.log'
				},
				{
					icon: 'fa-solid fa-folder-open',
					text: 'Open Workspace',
					href: 'sandbox/workspace'
				},
				{
					icon: 'fa-solid fa-sliders',
					text: 'Integration Config',
					href: 'sandbox/config.json'
				},
				{
					icon: 'fa-regular fa-key',
					text: 'Show GitHub Public Key',
					href: 'sandbox/.ssh/id_rsa.pub'
				}
			];
		}

		// Not installed yet
		return [{
			default: true,
			icon: 'fa-solid fa-plug',
			text: 'Install',
			href: 'install.js'
		}, {
			icon: 'fa-solid fa-terminal',
			text: 'Update Only',
			href: 'update.js'
		}];
	}
};
