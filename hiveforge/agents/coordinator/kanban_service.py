from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class KanbanService:
    def __init__(self, board_path: str = "hiveforge/ui/kanban/board.json") -> None:
        self.board_path = Path(board_path)

    def load(self) -> dict[str, Any]:
        return json.loads(self.board_path.read_text(encoding="utf-8"))

    def save(self, board: dict[str, Any]) -> None:
        self.board_path.write_text(json.dumps(board, indent=2), encoding="utf-8")
