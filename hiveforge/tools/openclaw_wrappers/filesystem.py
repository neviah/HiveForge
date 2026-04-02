"""Filesystem tools: read, write, edit, list directories."""

from __future__ import annotations
from pathlib import Path
from typing import Any

class FileSystemTool:
    def __init__(self, sandbox_root: str | None = None):
        self.sandbox_root = Path(sandbox_root) if sandbox_root else Path.cwd()

    def _safe_path(self, target: str) -> Path:
        path = Path(target)
        if not path.is_absolute():
            path = self.sandbox_root / path
        path = path.resolve()
        try:
            path.relative_to(self.sandbox_root)
        except ValueError:
            raise PermissionError(f"Path {target} is outside sandbox")
        return path

    def read_file(self, path: str) -> dict[str, Any]:
        try:
            target = self._safe_path(path)
            if not target.exists(): return {"ok": False, "error": f"File not found: {path}"}
            if not target.is_file(): return {"ok": False, "error": f"Not a file: {path}"}
            content = target.read_text(encoding="utf-8")
            return {"ok": True, "path": str(target), "content": content, "size_bytes": len(content)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def write_file(self, path: str, content: str, overwrite: bool = False) -> dict[str, Any]:
        try:
            target = self._safe_path(path)
            if target.exists() and not overwrite:
                return {"ok": False, "error": f"File already exists: {path}"}
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            return {"ok": True, "message": f"File written: {path}", "path": str(target)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def edit_file(self, path: str, search: str, replace: str) -> dict[str, Any]:
        try:
            target = self._safe_path(path)
            if not target.exists(): return {"ok": False, "error": f"File not found: {path}"}
            content = target.read_text(encoding="utf-8")
            count = content.count(search)
            if count == 0: return {"ok": False, "error": f"Search text not found"}
            new_content = content.replace(search, replace)
            target.write_text(new_content, encoding="utf-8")
            return {"ok": True, "message": f"Replaced {count} occurrence(s)", "replacements": count}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def list_directory(self, path: str = ".") -> dict[str, Any]:
        try:
            target = self._safe_path(path)
            if not target.exists(): return {"ok": False, "error": f"Directory not found: {path}"}
            if not target.is_dir(): return {"ok": False, "error": f"Not a directory: {path}"}
            contents = [{"name": item.name, "type": "dir" if item.is_dir() else "file"} for item in sorted(target.iterdir())]
            return {"ok": True, "path": str(target), "count": len(contents), "contents": contents}
        except Exception as e:
            return {"ok": False, "error": str(e)}

_fs_tool = FileSystemTool()
def execute(operation: str, **kwargs) -> dict[str, Any]:
    handler = getattr(_fs_tool, operation.replace("-", "_"), None)
    if not handler: return {"ok": False, "error": f"Unknown operation: {operation}"}
    try:
        return handler(**kwargs)
    except Exception as e:
        return {"ok": False, "error": str(e)}
