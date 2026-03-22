import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict

DEFAULT_CONFIG_PATH = Path(os.environ.get('HiveForge_CONFIG', 'config.json')).expanduser()


@dataclass
class SandboxConfig:
    workspace: Path
    allowed_read_roots: List[Path] = field(default_factory=list)
    allowed_write_root: Path | None = None


@dataclass
class LLMConfig:
    provider: str
    endpoint: str
    model: str
    api_key: str = ''
    api_key_env: str = ''
    extra_headers: Dict[str, str] = field(default_factory=dict)
    timeout_sec: int = 300
    read_timeout_sec: int = 300
    streaming: bool = True
    cloud_providers: bool = False
    remote_tools: bool = False


@dataclass
class GitConfig:
    name: str
    email: str
    ssh_key_path: Path


@dataclass
class AppConfig:
    llm: LLMConfig
    sandbox: SandboxConfig
    git: GitConfig


def _as_path_list(values):
    return [Path(v) for v in values]


def load_config(path: str | os.PathLike | None = None) -> AppConfig:
    cfg_path = Path(path) if path else DEFAULT_CONFIG_PATH
    if not cfg_path.exists():
        raise FileNotFoundError(f"Config file not found at {cfg_path}")

    data = json.loads(cfg_path.read_text())

    sandbox = data.get('sandbox', {})
    llm = data.get('llm', {})
    git = data.get('git', {})

    sandbox_cfg = SandboxConfig(
        workspace=Path(sandbox.get('workspace', '/sandbox/workspace')),
        allowed_read_roots=_as_path_list(sandbox.get('allowedReadRoots', sandbox.get('allowed_read_roots', []))),
        allowed_write_root=Path(sandbox.get('allowedWriteRoot', sandbox.get('allowed_write_root', '/sandbox/workspace'))),
    )

    llm_cfg = LLMConfig(
        provider=llm.get('provider', 'lmstudio'),
        endpoint=llm.get('endpoint', 'http://127.0.0.1:1234/api/v1'),
        model=llm.get('model', ''),
        api_key=str(llm.get('apiKey', llm.get('api_key', '')) or ''),
        api_key_env=str(llm.get('apiKeyEnv', llm.get('api_key_env', '')) or ''),
        extra_headers=dict(llm.get('extraHeaders', llm.get('extra_headers', {})) or {}),
        timeout_sec=int(llm.get('timeoutSec', llm.get('timeout_sec', 300))),
        read_timeout_sec=int(llm.get('readTimeoutSec', llm.get('read_timeout_sec', 300))),
        streaming=bool(llm.get('streaming', True)),
        cloud_providers=bool(llm.get('cloudProviders', llm.get('cloud_providers', False))),
        remote_tools=bool(llm.get('remoteTools', llm.get('remote_tools', False))),
    )

    git_cfg = GitConfig(
        name=git.get('user', {}).get('name', 'HiveForge Agent'),
        email=git.get('user', {}).get('email', 'HiveForge@sandbox.local'),
        ssh_key_path=Path(git.get('sshKeyPath', '/sandbox/.ssh/id_rsa')),
    )

    allowed_providers = {'lmstudio', 'openai_compatible'}
    if llm_cfg.provider not in allowed_providers:
        raise ValueError(f"Unsupported llm.provider '{llm_cfg.provider}'. Allowed: {', '.join(sorted(allowed_providers))}")

    if llm_cfg.provider != 'lmstudio' and not llm_cfg.cloud_providers:
        raise ValueError('Cloud provider selected, but llm.cloudProviders is disabled. Enable it explicitly to allow online LLMs.')

    if llm_cfg.provider == 'openai_compatible':
        resolved_key = llm_cfg.api_key.strip()
        env_name = llm_cfg.api_key_env.strip()
        if not resolved_key and env_name:
            resolved_key = str(os.environ.get(env_name, '')).strip()
        if not resolved_key:
            raise ValueError('OpenAI-compatible provider requires an API key (llm.apiKey or llm.apiKeyEnv).')

    return AppConfig(llm=llm_cfg, sandbox=sandbox_cfg, git=git_cfg)
