from __future__ import annotations

from pathlib import Path


class ClawCodeAdapter:
    """Adapter for the upstream Python claw-code workspace."""

    def __init__(self, upstream_root: str = "hiveforge/third_party/claw_code_upstream") -> None:
        self.upstream_root = Path(upstream_root)

    def is_available(self) -> bool:
        return (self.upstream_root / "src").exists()

    def manifest_hint(self) -> dict[str, str]:
        return {
            "expected_main": "src/main.py",
            "expected_models": "src/models.py",
            "status": "available" if self.is_available() else "missing_upstream",
        }
