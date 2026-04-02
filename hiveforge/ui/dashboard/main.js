const panelIds = [
  "project-overview",
  "agent-activity",
  "kanban",
  "settings",
  "ceo-chat",
  "logs",
  "vault",
  "sandbox-controls",
];

for (const id of panelIds) {
  const node = document.getElementById(id);
  if (!node) continue;
  node.dataset.status = "placeholder";
}
