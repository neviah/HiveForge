import sys
import json
import os
from pathlib import Path
from typing import Dict, Any, Iterable, Generator

from .config import load_config, AppConfig
from .provider import LMStudioProvider, OpenAICompatibleProvider
from .sandbox_fs import assert_path_allowed, SandboxViolation
from .tools import TOOLS


class Agent:
    def __init__(self, config: AppConfig):
        self.config = config
        if config.llm.provider == 'lmstudio':
            self.provider = LMStudioProvider(
                endpoint=config.llm.endpoint,
                model=config.llm.model,
                timeout=config.llm.timeout_sec,
                read_timeout=config.llm.read_timeout_sec,
            )
            self._provider_policy = 'Use the configured local LM Studio model for reasoning and tool use.'
        elif config.llm.provider == 'openai_compatible':
            api_key_env = (config.llm.api_key_env or '').strip()
            api_key = str(os.environ.get(api_key_env, '') or '').strip() if api_key_env else ''
            self.provider = OpenAICompatibleProvider(
                endpoint=config.llm.endpoint,
                model=config.llm.model,
                timeout=config.llm.timeout_sec,
                read_timeout=config.llm.read_timeout_sec,
                headers=config.llm.extra_headers,
                api_key=api_key,
            )
            self._provider_policy = 'Use the configured OpenAI-compatible endpoint and model for reasoning and tool use.'
        else:
            raise ValueError(f"Unsupported provider: {config.llm.provider}")
        self.tools = TOOLS
        self.tool_schemas = [
            {
                "type": "function",
                "function": {
                    "name": "file",
                    "description": "Read, write, append, mkdir, and list files inside sandbox workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "action": {
                                "type": "string",
                                "enum": ["write", "read", "append", "mkdir", "list"]
                            },
                            "path": {"type": "string"},
                            "content": {"type": "string"}
                        },
                        "required": ["action", "path"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "browser",
                    "description": "Fetch web pages and return status, title, and preview content.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "action": {
                                "type": "string",
                                "enum": ["fetch"]
                            },
                            "url": {"type": "string"},
                            "timeout": {"type": "integer"},
                            "max_chars": {"type": "integer"}
                        },
                        "required": ["action", "url"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "npm",
                    "description": "Manage npm packages in the workspace. Install packages or list installed dependencies.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "action": {
                                "type": "string",
                                "enum": ["install", "list"]
                            },
                            "packages": {"type": "string"},
                            "save_dev": {"type": "boolean"}
                        },
                        "required": ["action"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "playwright",
                    "description": "Interact with web pages: click, fill, navigate, take screenshots, wait for elements.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "action": {
                                "type": "string",
                                "enum": ["navigate", "click", "fill", "wait_for_selector", "screenshot", "get_content"]
                            },
                            "url": {"type": "string"},
                            "selector": {"type": "string"},
                            "text": {"type": "string"},
                            "path": {"type": "string"},
                            "timeout": {"type": "integer"}
                        },
                        "required": ["action"]
                    }
                }
            }
        ]

    def _system_message(self) -> Dict[str, Any]:
        return {
            "role": "system",
            "content": (
                f"You are HiveForge. {self._provider_policy} "
                "All file writes must remain inside /sandbox/workspace. "
                "Do not claim filesystem actions unless they were executed via the file tool and returned success. "
                "If tool execution fails, state the failure explicitly."
            ),
        }

    def _workspace_root(self) -> Path:
        return self.config.sandbox.workspace.resolve()

    def _normalize_path(self, raw: str) -> str:
        workspace = self._workspace_root()
        value = (raw or '').strip()

        if value.startswith('/sandbox/workspace'):
            suffix = value[len('/sandbox/workspace'):].lstrip('/\\')
            return str((workspace / suffix).resolve())

        path_value = Path(value)
        if path_value.is_absolute():
            return str(path_value.resolve())

        return str((workspace / path_value).resolve())

    def _normalize_tool_args(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if name != 'file':
            return args

        normalized = dict(args)
        path = normalized.get('path') or normalized.get('file') or normalized.get('target')
        if path:
            normalized['path'] = self._normalize_path(str(path))
        if 'content' in normalized and not isinstance(normalized['content'], str):
            normalized['content'] = json.dumps(normalized['content'], ensure_ascii=False, indent=2)
        return normalized

    def _parse_tool_chunk(self, chunk: str) -> list[Dict[str, Any]] | None:
        try:
            payload = json.loads(chunk)
        except json.JSONDecodeError:
            return None
        if isinstance(payload, dict) and isinstance(payload.get('tool_calls'), list):
            return payload['tool_calls']
        return None

    def _execute_tool_calls(self, tool_calls: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        executed = []
        for call in tool_calls:
            function = call.get('function', {})
            tool_name = function.get('name')
            arguments_text = function.get('arguments') or '{}'
            try:
                arguments = json.loads(arguments_text)
            except json.JSONDecodeError:
                arguments = {}

            try:
                normalized_args = self._normalize_tool_args(tool_name, arguments)
                result = self._apply_tool_guard(tool_name, normalized_args)
                result_text = result if isinstance(result, str) else json.dumps(result)
                executed.append({
                    'ok': True,
                    'id': call.get('id', f"call_{tool_name}"),
                    'name': tool_name,
                    'args': normalized_args,
                    'result': result_text
                })
            except Exception as exc:
                executed.append({
                    'ok': False,
                    'id': call.get('id', f"call_{tool_name}"),
                    'name': tool_name,
                    'args': arguments,
                    'result': f"Tool execution error: {exc}"
                })
        return executed

    def _apply_tool_guard(self, name: str, args: Dict[str, Any]) -> Any:
        if name == "file":
            # Enforce filesystem sandboxing
            path = args.get("path") or args.get("file") or args.get("target")
            if not path:
                raise SandboxViolation("File path missing")
            write = args.get("action") == "write" or args.get("content") is not None
            assert_path_allowed(path, self.config.sandbox.allowed_read_roots, self.config.sandbox.allowed_write_root, write=write)
        tool = self.tools.get(name)
        if not tool:
            raise ValueError(f"Tool {name} is not available")
        if hasattr(tool, "run"):
            return tool.run(**args)
        raise ValueError(f"Tool {name} has no run method")

    def run_task(self, prompt: str) -> Generator[str, None, None]:
        # Initialize npm tool with workspace
        from .tools.npm import NpmTool
        self.tools["npm"] = NpmTool(str(self._workspace_root()))
        
        messages: list[Dict[str, Any]] = [self._system_message(), {"role": "user", "content": prompt}]

        for _ in range(8):
            assistant_text_chunks: list[str] = []
            tool_call_state: Dict[int, Dict[str, Any]] = {}

            for chunk in self.provider.complete(messages, tools=self.tool_schemas):
                tool_call_deltas = self._parse_tool_chunk(chunk)
                if tool_call_deltas is not None:
                    for delta in tool_call_deltas:
                        index = int(delta.get('index', 0))
                        current = tool_call_state.get(index, {
                            'id': None,
                            'type': 'function',
                            'function': {'name': '', 'arguments': ''}
                        })

                        if delta.get('id'):
                            current['id'] = delta['id']

                        fn_delta = delta.get('function', {})
                        if fn_delta.get('name'):
                            current['function']['name'] = fn_delta['name']
                        if fn_delta.get('arguments'):
                            current['function']['arguments'] += fn_delta['arguments']

                        tool_call_state[index] = current
                    continue

                assistant_text_chunks.append(chunk)
                yield chunk

            if not tool_call_state:
                return

            assistant_text = ''.join(assistant_text_chunks)
            ordered_calls = [tool_call_state[idx] for idx in sorted(tool_call_state.keys())]
            messages.append({
                'role': 'assistant',
                'content': assistant_text,
                'tool_calls': ordered_calls
            })

            executed_calls = self._execute_tool_calls(ordered_calls)
            for executed in executed_calls:
                tool_result_content = executed['result']
                messages.append({
                    'role': 'tool',
                    'tool_call_id': executed['id'],
                    'name': executed['name'],
                    'content': tool_result_content
                })
                outcome = 'ok' if executed['ok'] else 'error'
                yield f"\n[tool:{executed['name']}] {outcome}: {tool_result_content}\n"

        yield "\nTask ended due to tool-call iteration limit.\n"

    def cli(self, prompt: str):
        for chunk in self.run_task(prompt):
            sys.stdout.write(chunk)
            sys.stdout.flush()


def main():
    config = load_config()
    agent = Agent(config)
    if len(sys.argv) > 1:
        task = " ".join(sys.argv[1:])
    else:
        task = input("Enter task: ")
    agent.cli(task)


if __name__ == "__main__":
    main()
