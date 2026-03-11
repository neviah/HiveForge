from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import base64
import hashlib
import json
import os
from typing import Any, Dict, Optional


SUPPORTED_SERVICES = {
    "netlify": "netlify.json",
    "stripe": "stripe.json",
    "google_ads": "google_ads.json",
    "analytics": "analytics.json",
    "email_provider": "email_provider.json",
}


@dataclass(slots=True)
class CredentialPolicy:
    scopes: list[str]
    max_daily_spend: float | None = None
    max_monthly_spend: float | None = None


class CredentialManager:
    """Scaffold credential vault for HiveForge.

    Rules enforced:
    - Credentials are stored under sandbox/credentials only.
    - Only coordinator identities may read or write credential tokens.
    - Metadata (scopes and budget limits) is stored in per-service JSON files.
    - Token material is stored separately as encrypted .enc blobs.

    Note:
    The encryption helper here is intentionally minimal for scaffold use.
    Replace with a hardened key management strategy before production use.
    """

    def __init__(self, vault_dir: str | Path) -> None:
        self.vault_dir = Path(vault_dir)
        self.vault_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_placeholders()

    def _ensure_placeholders(self) -> None:
        for service, filename in SUPPORTED_SERVICES.items():
            path = self.vault_dir / filename
            if path.exists():
                continue
            self._write_json(
                path,
                {
                    "service": service,
                    "connected": False,
                    "scopes": [],
                    "budget": {"daily": None, "monthly": None},
                    "updated_at": None,
                    "token_file": f"{service}.enc",
                },
            )

    @staticmethod
    def _utc_now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _service_json_path(self, service: str) -> Path:
        if service not in SUPPORTED_SERVICES:
            raise ValueError(f"Unsupported service: {service}")
        return self.vault_dir / SUPPORTED_SERVICES[service]

    def _service_token_path(self, service: str) -> Path:
        self._service_json_path(service)
        return self.vault_dir / f"{service}.enc"

    @staticmethod
    def _is_coordinator(requester_id: str) -> bool:
        # Coordinator IDs follow coordinator::<project_id> in this codebase.
        return requester_id.startswith("coordinator::")

    @staticmethod
    def _read_json(path: Path) -> Dict[str, Any]:
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _write_json(path: Path, data: Dict[str, Any]) -> None:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    def _derive_key(self) -> bytes:
        env_key = os.environ.get("HIVEFORGE_CREDENTIAL_KEY", "").strip()
        if env_key:
            material = env_key.encode("utf-8")
        else:
            # Scaffold fallback for local-only development. Override with env key.
            material = b"hiveforge-local-scaffold-key"
        return hashlib.sha256(material).digest()

    @staticmethod
    def _xor_stream_encrypt(plaintext: bytes, key: bytes, nonce: bytes) -> bytes:
        stream = bytearray()
        counter = 0
        while len(stream) < len(plaintext):
            block = hashlib.sha256(key + nonce + counter.to_bytes(4, "big")).digest()
            stream.extend(block)
            counter += 1
        return bytes(a ^ b for a, b in zip(plaintext, stream[: len(plaintext)]))

    def _encrypt_token(self, token: str) -> str:
        key = self._derive_key()
        nonce = os.urandom(16)
        cipher = self._xor_stream_encrypt(token.encode("utf-8"), key, nonce)
        return base64.b64encode(nonce + cipher).decode("ascii")

    def _decrypt_token(self, payload: str) -> str:
        key = self._derive_key()
        raw = base64.b64decode(payload.encode("ascii"))
        nonce, cipher = raw[:16], raw[16:]
        plain = self._xor_stream_encrypt(cipher, key, nonce)
        return plain.decode("utf-8")

    def upsert_credential(
        self,
        requester_id: str,
        service: str,
        token: str,
        policy: CredentialPolicy,
    ) -> Dict[str, Any]:
        if not self._is_coordinator(requester_id):
            raise PermissionError("Only coordinator may write credentials")

        metadata_path = self._service_json_path(service)
        token_path = self._service_token_path(service)

        token_path.write_text(self._encrypt_token(token), encoding="utf-8")

        metadata = self._read_json(metadata_path)
        metadata["connected"] = True
        metadata["scopes"] = sorted(set(policy.scopes))
        metadata["budget"] = {
            "daily": policy.max_daily_spend,
            "monthly": policy.max_monthly_spend,
        }
        metadata["updated_at"] = self._utc_now()
        metadata["token_file"] = token_path.name
        self._write_json(metadata_path, metadata)
        return self.public_metadata(service)

    def revoke_credential(self, requester_id: str, service: str) -> Dict[str, Any]:
        if not self._is_coordinator(requester_id):
            raise PermissionError("Only coordinator may revoke credentials")

        metadata_path = self._service_json_path(service)
        token_path = self._service_token_path(service)

        if token_path.exists():
            token_path.unlink()

        metadata = self._read_json(metadata_path)
        metadata["connected"] = False
        metadata["scopes"] = []
        metadata["budget"] = {"daily": None, "monthly": None}
        metadata["updated_at"] = self._utc_now()
        self._write_json(metadata_path, metadata)
        return self.public_metadata(service)

    def public_metadata(self, service: str) -> Dict[str, Any]:
        metadata = self._read_json(self._service_json_path(service))
        return {
            "service": metadata.get("service", service),
            "connected": bool(metadata.get("connected", False)),
            "scopes": metadata.get("scopes", []),
            "budget": metadata.get("budget", {"daily": None, "monthly": None}),
            "updated_at": metadata.get("updated_at"),
        }

    def list_public_metadata(self) -> list[Dict[str, Any]]:
        return [self.public_metadata(service) for service in SUPPORTED_SERVICES]

    def resolve_token_for_use(self, requester_id: str, service: str, scope: Optional[str] = None) -> str:
        if not self._is_coordinator(requester_id):
            raise PermissionError("Only coordinator may request credential tokens")

        metadata = self._read_json(self._service_json_path(service))
        allowed_scopes = set(metadata.get("scopes", []))
        if scope and allowed_scopes and scope not in allowed_scopes:
            raise PermissionError(f"Scope denied for service {service}: {scope}")

        token_path = self._service_token_path(service)
        if not token_path.exists():
            raise FileNotFoundError(f"Token not found for service: {service}")

        return self._decrypt_token(token_path.read_text(encoding="utf-8"))
