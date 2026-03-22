# HiveForge Bootstrap (Compact Router)

This file is intentionally concise.

Use the split bootstrap docs in `docs/bootstrap/` to avoid oversized context payloads.

## Read Order

1. `docs/bootstrap/00_core_brief.md` (always load first)
2. `docs/bootstrap/20_active_sprint.md` (for current implementation work)
3. `docs/bootstrap/10_execution_order.md` (for sequencing and phase planning)
4. `docs/bootstrap/90_status_history_and_backlog.md` (only when needed)

## Full Historical Source

- `docs/bootstrap/archive_bootstrap_full.md` contains the previous monolithic bootstrap snapshot.

## Prompting Rule (Default)

For normal coding tasks, only include:

- core brief
- one active sprint section
- directly related source file paths

Load historical/status docs only when doing roadmap reconciliation, audit checks, or milestone archaeology.

## Why This Exists

This split keeps execution focused and reduces context overflow while preserving all original project guidance.
