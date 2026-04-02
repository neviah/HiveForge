from __future__ import annotations

from typing import Any

from hiveforge.loop.types import AgentContext, AgentStepResult


class ClawCodeIntegration:
    """Bridge between HiveForge agent loop and claw-code query engine."""

    def __init__(self) -> None:
        try:
            from hiveforge.loop.claw_code_bridge import get_claw_code_runtime

            self.runtime = get_claw_code_runtime()
            self.available = True
        except ImportError:
            self.available = False
            self.runtime = None

    def route_to_command_or_tool(self, objective: str) -> dict[str, Any]:
        """Use claw-code's routing logic to classify an objective."""
        if not self.available:
            return {"routed": False, "reason": "claw_code_not_available"}

        try:
            manifest = self.runtime.manifest
            matched_commands = []
            matched_tools = []

            # Query the manifest's command/tool registries
            if hasattr(manifest, "commands"):
                for cmd in manifest.commands:
                    if cmd.name.lower() in objective.lower():
                        matched_commands.append(cmd.name)

            if hasattr(manifest, "tools"):
                for tool in manifest.tools:
                    if tool.name.lower() in objective.lower():
                        matched_tools.append(tool.name)

            return {
                "routed": len(matched_commands) > 0 or len(matched_tools) > 0,
                "matched_commands": matched_commands,
                "matched_tools": matched_tools,
                "manifest": str(manifest),
            }
        except Exception as e:
            return {"routed": False, "error": str(e)}

    def submit_turn(self, context: AgentContext) -> AgentStepResult:
        """Submit a turn to claw-code's query engine and return result."""
        if not self.available:
            return AgentStepResult(
                phase="CLAW_CODE_TURN",
                summary="claw-code runtime not available",
                data={"available": False},
            )

        try:
            routed = self.route_to_command_or_tool(context.objective)
            turn_result = self.runtime.submit_message(
                prompt=context.objective,
                matched_commands=tuple(routed.get("matched_commands", [])),
                matched_tools=tuple(routed.get("matched_tools", [])),
            )

            return AgentStepResult(
                phase="CLAW_CODE_TURN",
                summary=f"Turn submitted: {turn_result.stop_reason}",
                data={
                    "output": turn_result.output,
                    "stop_reason": turn_result.stop_reason,
                    "usage": {
                        "input_tokens": turn_result.usage.input_tokens,
                        "output_tokens": turn_result.usage.output_tokens,
                    },
                },
            )
        except Exception as e:
            return AgentStepResult(
                phase="CLAW_CODE_TURN",
                summary=f"Error: {str(e)}",
                data={"error": str(e)},
            )
