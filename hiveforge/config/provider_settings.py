from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class ProviderSettings:
    def __init__(self, path: str = "hiveforge/config/models.json") -> None:
        self.path = Path(path)
        self.data: dict[str, Any] = {}

    def load(self) -> dict[str, Any]:
        self.data = json.loads(self.path.read_text(encoding="utf-8"))
        return self.data

    def active_provider(self) -> dict[str, Any]:
        if not self.data:
            self.load()
        active = self.data["active_provider"]
        return self.data["providers"][active]
