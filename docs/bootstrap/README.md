# HiveForge Bootstrap Docs

This folder splits the original monolithic bootstrap into focused documents so task prompts can load only what is needed.

## Usage Order

1. Read `00_core_brief.md` first for always-on constraints.
2. Read `10_execution_order.md` when sequencing major implementation work.
3. Read `20_active_sprint.md` for current execution priorities.
4. Read `90_status_history_and_backlog.md` only when historical context is needed.

## Prompting Guidance

For normal implementation tasks, include only:

- `00_core_brief.md`
- one section from `20_active_sprint.md` or `10_execution_order.md`
- specific file paths being edited

Avoid loading `archive_bootstrap_full.md` unless doing roadmap reconciliation, audits, or historical recovery.

## Provider Assumption

Provider mode should follow `00_core_brief.md` and `README.md`. Current default is OpenAI-compatible cloud models (OpenRouter), not local-only LM Studio.
