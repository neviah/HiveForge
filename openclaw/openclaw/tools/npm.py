import json
import subprocess
from pathlib import Path
from typing import Any


class NpmTool:
    def __init__(self, workspace: str):
        self.workspace = Path(workspace)

    def install(self, packages: str | list[str] = "", save_dev: bool = False) -> dict[str, Any]:
        """Install npm packages. If no packages specified, runs npm install"""
        try:
            cmd = ["npm", "install"]
            
            if isinstance(packages, str):
                packages = packages.strip()
                if packages:
                    packages = packages.split()
            elif isinstance(packages, list):
                packages = packages
            else:
                packages = []
            
            if packages:
                cmd.extend(packages)
                if save_dev:
                    cmd.append("--save-dev")
            
            result = subprocess.run(
                cmd,
                cwd=self.workspace,
                capture_output=True,
                text=True,
                timeout=120,
            )
            
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "stdout": "",
                "stderr": "npm install timed out after 120 seconds",
                "exit_code": -1,
            }
        except Exception as e:
            return {
                "success": False,
                "stdout": "",
                "stderr": str(e),
                "exit_code": -1,
            }

    def list(self) -> dict[str, Any]:
        """List installed packages"""
        try:
            result = subprocess.run(
                ["npm", "list", "--depth=0"],
                cwd=self.workspace,
                capture_output=True,
                text=True,
                timeout=30,
            )
            
            return {
                "success": result.returncode == 0,
                "packages": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.returncode,
            }
        except Exception as e:
            return {
                "success": False,
                "packages": "",
                "stderr": str(e),
                "exit_code": -1,
            }

    def run(
        self,
        action: str,
        packages: str | list[str] = "",
        save_dev: bool = False,
        **_: Any,
    ) -> dict[str, Any]:
        if action == "install":
            return self.install(packages=packages, save_dev=save_dev)
        elif action == "list":
            return self.list()
        raise ValueError(f"Unsupported npm action: {action}")
