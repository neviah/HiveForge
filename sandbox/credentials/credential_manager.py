from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import base64
import hashlib
import re
import uuid
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

SERVICE_OPERATION_ALLOWLIST = {
    "netlify": {"deploy_site", "read_site_status", "list_sites"},
    "stripe": {"read_metrics", "create_invoice", "read_charges"},
    "google_ads": {"create_campaign", "pause_campaign", "read_metrics"},
    "analytics": {"read_metrics", "read_events"},
    "email_provider": {"send_email", "read_delivery_status"},
}

ERR_AUTH_NOT_COORDINATOR = "AUTH_NOT_COORDINATOR"
ERR_POLICY_DENIED_ROLE = "POLICY_DENIED_ROLE"
ERR_POLICY_DENIED_OPERATION = "POLICY_DENIED_OPERATION"
ERR_POLICY_DENIED_SCOPE = "POLICY_DENIED_SCOPE"
ERR_APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
ERR_SECRET_MISSING = "SECRET_MISSING"
ERR_BUDGET_DAILY_EXCEEDED = "BUDGET_DAILY_EXCEEDED"
ERR_BUDGET_MONTHLY_EXCEEDED = "BUDGET_MONTHLY_EXCEEDED"
ERR_VALIDATION_ERROR = "VALIDATION_ERROR"

DEFAULT_SERVICE_ROLE_ALLOWLIST = {
    "netlify": ["Coordinator Agent", "DevOps", "CTO", "PM", "Developer"],
    "stripe": ["Coordinator Agent", "CFO", "CEO"],
    "google_ads": ["Coordinator Agent", "Marketing", "PPC Campaign Strategist"],
    "analytics": ["Coordinator Agent", "Data Analyst", "Analytics Reporter", "Marketing"],
    "email_provider": ["Coordinator Agent", "Marketing", "Support", "Social Media Manager"],
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

    @property
    def _audit_log_path(self) -> Path:
        return self.vault_dir / "audit.log.ndjson"

    @property
    def _policy_dir(self) -> Path:
        return self.vault_dir / "policies"

    @property
    def _budget_counters_path(self) -> Path:
        return self.vault_dir / "budget_counters.json"

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

    def _write_audit_record(self, record: Dict[str, Any]) -> None:
        self._audit_log_path.parent.mkdir(parents=True, exist_ok=True)
        with self._audit_log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")

    @staticmethod
    def _safe_key(raw: str) -> str:
        value = raw.strip().lower()
        return re.sub(r"[^a-z0-9_.-]+", "_", value)

    def _project_policy_path(self, project_id: str, service: str) -> Path:
        self._policy_dir.mkdir(parents=True, exist_ok=True)
        return self._policy_dir / f"{self._safe_key(project_id)}__{self._safe_key(service)}.json"

    def _read_budget_counters(self) -> Dict[str, Any]:
        data = self._read_json(self._budget_counters_path)
        if not data:
            return {"daily": {}, "monthly": {}, "updated_at": None}
        data.setdefault("daily", {})
        data.setdefault("monthly", {})
        return data

    def _write_budget_counters(self, counters: Dict[str, Any]) -> None:
        counters["updated_at"] = self._utc_now()
        self._write_json(self._budget_counters_path, counters)

    @staticmethod
    def _daily_counter_key(project_id: str, service: str, ts: datetime) -> str:
        return f"{project_id}:{service}:{ts.strftime('%Y-%m-%d')}"

    @staticmethod
    def _monthly_counter_key(project_id: str, service: str, ts: datetime) -> str:
        return f"{project_id}:{service}:{ts.strftime('%Y-%m')}"

    @staticmethod
    def _role_allowed(agent_role: str, allowed_roles: list[str]) -> bool:
        role_norm = agent_role.strip().casefold()
        return any(role_norm == item.strip().casefold() for item in allowed_roles)

    def upsert_project_policy(
        self,
        requester_id: str,
        project_id: str,
        service: str,
        *,
        allowed_roles: list[str],
        allowed_operations: list[str],
        allowed_scopes: list[str],
        max_daily_spend: float | None,
        max_monthly_spend: float | None,
        require_human_approval_over: float | None = None,
        enabled: bool = True,
    ) -> Dict[str, Any]:
        if not self._is_coordinator(requester_id):
            raise PermissionError("Only coordinator may write project policies")
        if service not in SUPPORTED_SERVICES:
            raise ValueError(f"Unsupported service: {service}")

        policy = {
            "project_id": project_id,
            "service": service,
            "allowed_roles": sorted(set(allowed_roles)),
            "allowed_operations": sorted(set(allowed_operations)),
            "allowed_scopes": sorted(set(allowed_scopes)),
            "max_daily_spend": max_daily_spend,
            "max_monthly_spend": max_monthly_spend,
            "require_human_approval_over": require_human_approval_over,
            "enabled": bool(enabled),
            "updated_at": self._utc_now(),
        }
        self._write_json(self._project_policy_path(project_id, service), policy)
        return policy

    def get_project_policy(self, project_id: str, service: str) -> Dict[str, Any]:
        path = self._project_policy_path(project_id, service)
        if path.exists():
            return self._read_json(path)

        metadata = self._read_json(self._service_json_path(service))
        return {
            "project_id": project_id,
            "service": service,
            "allowed_roles": DEFAULT_SERVICE_ROLE_ALLOWLIST.get(service, ["Coordinator Agent"]),
            "allowed_operations": sorted(SERVICE_OPERATION_ALLOWLIST.get(service, [])),
            "allowed_scopes": metadata.get("scopes", []),
            "max_daily_spend": metadata.get("budget", {}).get("daily"),
            "max_monthly_spend": metadata.get("budget", {}).get("monthly"),
            "require_human_approval_over": None,
            "enabled": True,
            "updated_at": None,
        }

    def budget_snapshot(self, project_id: str) -> Dict[str, Any]:
        counters = self._read_budget_counters()
        prefix = f"{project_id}:"
        daily = {k: v for k, v in counters["daily"].items() if k.startswith(prefix)}
        monthly = {k: v for k, v in counters["monthly"].items() if k.startswith(prefix)}
        return {"project_id": project_id, "daily": daily, "monthly": monthly}

    def _check_budget_limits(self, project_id: str, service: str, estimated_cost: float, policy: Dict[str, Any]) -> tuple[bool, str | None]:
        now = datetime.now(timezone.utc)
        counters = self._read_budget_counters()
        daily_key = self._daily_counter_key(project_id, service, now)
        monthly_key = self._monthly_counter_key(project_id, service, now)

        current_daily = float(counters["daily"].get(daily_key, 0.0))
        current_monthly = float(counters["monthly"].get(monthly_key, 0.0))

        daily_limit = policy.get("max_daily_spend")
        monthly_limit = policy.get("max_monthly_spend")

        if isinstance(daily_limit, (int, float)) and current_daily + estimated_cost > float(daily_limit):
            return False, ERR_BUDGET_DAILY_EXCEEDED
        if isinstance(monthly_limit, (int, float)) and current_monthly + estimated_cost > float(monthly_limit):
            return False, ERR_BUDGET_MONTHLY_EXCEEDED
        return True, None

    def _increment_budget_counters(self, project_id: str, service: str, cost: float) -> None:
        if cost <= 0:
            return
        now = datetime.now(timezone.utc)
        counters = self._read_budget_counters()
        daily_key = self._daily_counter_key(project_id, service, now)
        monthly_key = self._monthly_counter_key(project_id, service, now)
        counters["daily"][daily_key] = float(counters["daily"].get(daily_key, 0.0)) + float(cost)
        counters["monthly"][monthly_key] = float(counters["monthly"].get(monthly_key, 0.0)) + float(cost)
        self._write_budget_counters(counters)

    def read_audit_records(self, limit: int = 100) -> list[Dict[str, Any]]:
        if limit <= 0:
            return []
        if not self._audit_log_path.exists():
            return []

        lines = self._audit_log_path.read_text(encoding="utf-8").splitlines()
        sliced = lines[-limit:]
        records: list[Dict[str, Any]] = []
        for line in sliced:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                records.append(
                    {
                        "audit_id": str(uuid.uuid4()),
                        "decision": "fail",
                        "error_code": ERR_VALIDATION_ERROR,
                        "policy_reason": "Malformed audit line",
                        "created_at": self._utc_now(),
                    }
                )
        return records

    @staticmethod
    def _new_result(
        request_id: str,
        service: str,
        operation: str,
        status: str,
        sanitized_result: Optional[Dict[str, Any]] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {
            "request_id": request_id,
            "status": status,
            "service": service,
            "operation": operation,
            "sanitized_result": sanitized_result or {},
            "error_code": error_code,
            "error_message": error_message,
            "ts": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _require_nonempty_str(payload: Dict[str, Any], key: str, errors: list[str]) -> str:
        value = payload.get(key)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"Missing or invalid field: {key}")
            return ""
        return value.strip()

    def _validate_intent(self, intent: Dict[str, Any]) -> tuple[bool, list[str], Dict[str, Any]]:
        errors: list[str] = []
        normalized: Dict[str, Any] = {}

        normalized["request_id"] = self._require_nonempty_str(intent, "request_id", errors)
        normalized["project_id"] = self._require_nonempty_str(intent, "project_id", errors)
        normalized["agent_id"] = self._require_nonempty_str(intent, "agent_id", errors)
        normalized["agent_role"] = self._require_nonempty_str(intent, "agent_role", errors)
        normalized["service"] = self._require_nonempty_str(intent, "service", errors)
        normalized["operation"] = self._require_nonempty_str(intent, "operation", errors)
        normalized["scope"] = self._require_nonempty_str(intent, "scope", errors)

        input_payload = intent.get("input", {})
        if input_payload is None:
            input_payload = {}
        if not isinstance(input_payload, dict):
            errors.append("Field input must be an object")
            input_payload = {}
        normalized["input"] = input_payload

        estimated_cost = intent.get("estimated_cost", 0.0)
        if not isinstance(estimated_cost, (int, float)):
            errors.append("Field estimated_cost must be numeric")
            estimated_cost = 0.0
        normalized["estimated_cost"] = float(estimated_cost)

        requires_human_approval = intent.get("requires_human_approval", False)
        if not isinstance(requires_human_approval, bool):
            errors.append("Field requires_human_approval must be boolean")
            requires_human_approval = False
        normalized["requires_human_approval"] = requires_human_approval

        normalized["ts"] = self._require_nonempty_str(intent, "ts", errors)

        service = normalized["service"]
        if service and service not in SUPPORTED_SERVICES:
            errors.append(f"Unsupported service: {service}")

        operation = normalized["operation"]
        if service in SERVICE_OPERATION_ALLOWLIST and operation:
            if operation not in SERVICE_OPERATION_ALLOWLIST[service]:
                errors.append(f"Unsupported operation for {service}: {operation}")

        return (len(errors) == 0, errors, normalized)

    def broker_request(self, coordinator_id: str, intent: Dict[str, Any]) -> Dict[str, Any]:
        """Milestone A broker entrypoint.

        Performs schema validation + deny-code responses and writes an append-only
        audit record for every decision.
        """
        now = self._utc_now()
        fallback_request_id = str(uuid.uuid4())
        request_id = intent.get("request_id") if isinstance(intent.get("request_id"), str) else fallback_request_id
        service = str(intent.get("service") or "unknown")
        operation = str(intent.get("operation") or "unknown")

        if not self._is_coordinator(coordinator_id):
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="denied",
                error_code=ERR_AUTH_NOT_COORDINATOR,
                error_message="Only coordinator may process broker requests",
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": str(intent.get("project_id") or "unknown"),
                    "agent_id": str(intent.get("agent_id") or "unknown"),
                    "agent_role": str(intent.get("agent_role") or "unknown"),
                    "service": service,
                    "operation": operation,
                    "scope": str(intent.get("scope") or ""),
                    "decision": "deny",
                    "policy_reason": "Non-coordinator request",
                    "estimated_cost": float(intent.get("estimated_cost") or 0.0),
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": ERR_AUTH_NOT_COORDINATOR,
                    "created_at": now,
                }
            )
            return result

        is_valid, validation_errors, normalized = self._validate_intent(intent)
        request_id = normalized.get("request_id") or request_id
        service = normalized.get("service") or service
        operation = normalized.get("operation") or operation

        if not is_valid:
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="failed",
                error_code=ERR_VALIDATION_ERROR,
                error_message="; ".join(validation_errors),
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": normalized.get("project_id", "unknown"),
                    "agent_id": normalized.get("agent_id", "unknown"),
                    "agent_role": normalized.get("agent_role", "unknown"),
                    "service": service,
                    "operation": operation,
                    "scope": normalized.get("scope", ""),
                    "decision": "fail",
                    "policy_reason": "Intent validation failed",
                    "estimated_cost": normalized.get("estimated_cost", 0.0),
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": ERR_VALIDATION_ERROR,
                    "created_at": now,
                }
            )
            return result

        if normalized["requires_human_approval"]:
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="denied",
                error_code=ERR_APPROVAL_REQUIRED,
                error_message="Human approval is required for this operation",
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": normalized["project_id"],
                    "agent_id": normalized["agent_id"],
                    "agent_role": normalized["agent_role"],
                    "service": service,
                    "operation": operation,
                    "scope": normalized["scope"],
                    "decision": "deny",
                    "policy_reason": "Approval required",
                    "estimated_cost": normalized["estimated_cost"],
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": ERR_APPROVAL_REQUIRED,
                    "created_at": now,
                }
            )
            return result

        policy = self.get_project_policy(normalized["project_id"], service)
        if not bool(policy.get("enabled", True)):
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="denied",
                error_code=ERR_POLICY_DENIED_OPERATION,
                error_message=f"Service policy disabled for {service}",
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": normalized["project_id"],
                    "agent_id": normalized["agent_id"],
                    "agent_role": normalized["agent_role"],
                    "service": service,
                    "operation": operation,
                    "scope": normalized["scope"],
                    "decision": "deny",
                    "policy_reason": "Service policy disabled",
                    "estimated_cost": normalized["estimated_cost"],
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": ERR_POLICY_DENIED_OPERATION,
                    "created_at": now,
                }
            )
            return result

        allowed_roles = policy.get("allowed_roles", [])
        if allowed_roles and not self._role_allowed(normalized["agent_role"], allowed_roles):
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="denied",
                error_code=ERR_POLICY_DENIED_ROLE,
                error_message=f"Role denied for {service}: {normalized['agent_role']}",
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": normalized["project_id"],
                    "agent_id": normalized["agent_id"],
                    "agent_role": normalized["agent_role"],
                    "service": service,
                    "operation": operation,
                    "scope": normalized["scope"],
                    "decision": "deny",
                    "policy_reason": "Role denied",
                    "estimated_cost": normalized["estimated_cost"],
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": ERR_POLICY_DENIED_ROLE,
                    "created_at": now,
                }
            )
            return result

        allowed_operations = policy.get("allowed_operations", [])
        if allowed_operations and operation not in allowed_operations:
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="denied",
                error_code=ERR_POLICY_DENIED_OPERATION,
                error_message=f"Operation denied for {service}: {operation}",
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": normalized["project_id"],
                    "agent_id": normalized["agent_id"],
                    "agent_role": normalized["agent_role"],
                    "service": service,
                    "operation": operation,
                    "scope": normalized["scope"],
                    "decision": "deny",
                    "policy_reason": "Operation denied",
                    "estimated_cost": normalized["estimated_cost"],
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": ERR_POLICY_DENIED_OPERATION,
                    "created_at": now,
                }
            )
            return result

        approval_threshold = policy.get("require_human_approval_over")
        if isinstance(approval_threshold, (int, float)) and normalized["estimated_cost"] > float(approval_threshold):
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="denied",
                error_code=ERR_APPROVAL_REQUIRED,
                error_message="Cost exceeds policy threshold and requires human approval",
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": normalized["project_id"],
                    "agent_id": normalized["agent_id"],
                    "agent_role": normalized["agent_role"],
                    "service": service,
                    "operation": operation,
                    "scope": normalized["scope"],
                    "decision": "deny",
                    "policy_reason": "Approval threshold exceeded",
                    "estimated_cost": normalized["estimated_cost"],
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": ERR_APPROVAL_REQUIRED,
                    "created_at": now,
                }
            )
            return result

        metadata = self._read_json(self._service_json_path(service))
        if not bool(metadata.get("connected", False)):
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="denied",
                error_code=ERR_SECRET_MISSING,
                error_message=f"Service {service} is not connected",
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": normalized["project_id"],
                    "agent_id": normalized["agent_id"],
                    "agent_role": normalized["agent_role"],
                    "service": service,
                    "operation": operation,
                    "scope": normalized["scope"],
                    "decision": "deny",
                    "policy_reason": "Credential missing",
                    "estimated_cost": normalized["estimated_cost"],
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": ERR_SECRET_MISSING,
                    "created_at": now,
                }
            )
            return result

        configured_scopes = set(policy.get("allowed_scopes") or metadata.get("scopes") or [])
        if configured_scopes and normalized["scope"] not in configured_scopes:
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="denied",
                error_code=ERR_POLICY_DENIED_SCOPE,
                error_message=f"Scope denied for {service}: {normalized['scope']}",
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": normalized["project_id"],
                    "agent_id": normalized["agent_id"],
                    "agent_role": normalized["agent_role"],
                    "service": service,
                    "operation": operation,
                    "scope": normalized["scope"],
                    "decision": "deny",
                    "policy_reason": "Scope denied",
                    "estimated_cost": normalized["estimated_cost"],
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": ERR_POLICY_DENIED_SCOPE,
                    "created_at": now,
                }
            )
            return result

        within_budget, budget_error = self._check_budget_limits(
            normalized["project_id"],
            service,
            normalized["estimated_cost"],
            policy,
        )
        if not within_budget:
            message = "Daily budget exceeded" if budget_error == ERR_BUDGET_DAILY_EXCEEDED else "Monthly budget exceeded"
            result = self._new_result(
                request_id=request_id,
                service=service,
                operation=operation,
                status="denied",
                error_code=budget_error,
                error_message=message,
            )
            self._write_audit_record(
                {
                    "audit_id": str(uuid.uuid4()),
                    "request_id": request_id,
                    "project_id": normalized["project_id"],
                    "agent_id": normalized["agent_id"],
                    "agent_role": normalized["agent_role"],
                    "service": service,
                    "operation": operation,
                    "scope": normalized["scope"],
                    "decision": "deny",
                    "policy_reason": "Budget exceeded",
                    "estimated_cost": normalized["estimated_cost"],
                    "actual_cost": 0.0,
                    "token_exposed": False,
                    "duration_ms": 0,
                    "error_code": budget_error,
                    "created_at": now,
                }
            )
            return result

        self._increment_budget_counters(normalized["project_id"], service, normalized["estimated_cost"])

        result = self._new_result(
            request_id=request_id,
            service=service,
            operation=operation,
            status="approved",
            sanitized_result={
                "ready_for_connector": True,
                "budget_snapshot": self.budget_snapshot(normalized["project_id"]),
            },
        )
        self._write_audit_record(
            {
                "audit_id": str(uuid.uuid4()),
                "request_id": request_id,
                "project_id": normalized["project_id"],
                "agent_id": normalized["agent_id"],
                "agent_role": normalized["agent_role"],
                "service": service,
                "operation": operation,
                "scope": normalized["scope"],
                "decision": "allow",
                "policy_reason": "Milestone A checks passed",
                "estimated_cost": normalized["estimated_cost"],
                "actual_cost": 0.0,
                "token_exposed": False,
                "duration_ms": 0,
                "error_code": None,
                "created_at": now,
            }
        )
        return result

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
        self._write_audit_record(
            {
                "audit_id": str(uuid.uuid4()),
                "request_id": str(uuid.uuid4()),
                "project_id": "system",
                "agent_id": requester_id,
                "agent_role": "Coordinator",
                "service": service,
                "operation": "upsert_credential",
                "scope": "",
                "decision": "allow",
                "policy_reason": "Credential updated",
                "estimated_cost": 0.0,
                "actual_cost": 0.0,
                "token_exposed": False,
                "duration_ms": 0,
                "error_code": None,
                "created_at": self._utc_now(),
            }
        )
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
        self._write_audit_record(
            {
                "audit_id": str(uuid.uuid4()),
                "request_id": str(uuid.uuid4()),
                "project_id": "system",
                "agent_id": requester_id,
                "agent_role": "Coordinator",
                "service": service,
                "operation": "revoke_credential",
                "scope": "",
                "decision": "allow",
                "policy_reason": "Credential revoked",
                "estimated_cost": 0.0,
                "actual_cost": 0.0,
                "token_exposed": False,
                "duration_ms": 0,
                "error_code": None,
                "created_at": self._utc_now(),
            }
        )
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

        token = self._decrypt_token(token_path.read_text(encoding="utf-8"))
        self._write_audit_record(
            {
                "audit_id": str(uuid.uuid4()),
                "request_id": str(uuid.uuid4()),
                "project_id": "system",
                "agent_id": requester_id,
                "agent_role": "Coordinator",
                "service": service,
                "operation": "resolve_token_for_use",
                "scope": scope or "",
                "decision": "allow",
                "policy_reason": "Coordinator token resolve",
                "estimated_cost": 0.0,
                "actual_cost": 0.0,
                "token_exposed": True,
                "duration_ms": 0,
                "error_code": None,
                "created_at": self._utc_now(),
            }
        )
        return token
