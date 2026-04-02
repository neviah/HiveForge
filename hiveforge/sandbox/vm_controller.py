from __future__ import annotations

from pathlib import Path


class VMController:
    """Placeholder sandbox lifecycle controller."""

    def __init__(self, snapshots_dir: str = "hiveforge/sandbox/snapshots") -> None:
        self.snapshots_dir = Path(snapshots_dir)
        self.snapshots_dir.mkdir(parents=True, exist_ok=True)

    def list_snapshots(self) -> list[str]:
        return sorted(p.name for p in self.snapshots_dir.glob("*.snapshot"))

    def create_snapshot(self, name: str) -> Path:
        snapshot = self.snapshots_dir / f"{name}.snapshot"
        snapshot.write_text("placeholder", encoding="utf-8")
        return snapshot
