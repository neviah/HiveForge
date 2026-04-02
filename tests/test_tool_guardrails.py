import json
import os
import tempfile
import unittest

from hiveforge.agents.specialists import tool_execution


class FakeRouter:
    def route(self, tool_name: str, operation: str, **payload):
        return {
            "ok": True,
            "tool_name": tool_name,
            "operation": operation,
            "payload": payload,
        }


class ToolGuardrailTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.policy_path = os.path.join(self.temp_dir.name, "tool_policy.json")
        self.audit_path = os.path.join(self.temp_dir.name, "tool_audit.jsonl")

        policy = {
            "roles": {
                "tester": {
                    "tools": {
                        "filesystem": ["read_file"],
                        "command": ["execute"],
                    },
                    "limits": {
                        "max_calls_per_task": 2,
                        "max_calls_per_minute": 2,
                        "max_calls_per_tool": {"command": 1},
                    },
                }
            }
        }
        with open(self.policy_path, "w", encoding="utf-8") as handle:
            json.dump(policy, handle)

        os.environ["HIVEFORGE_TOOL_POLICY_PATH"] = self.policy_path
        os.environ["HIVEFORGE_TOOL_AUDIT_PATH"] = self.audit_path
        tool_execution._reset_tool_execution_state_for_tests()

    def tearDown(self):
        os.environ.pop("HIVEFORGE_TOOL_POLICY_PATH", None)
        os.environ.pop("HIVEFORGE_TOOL_AUDIT_PATH", None)
        tool_execution._reset_tool_execution_state_for_tests()
        self.temp_dir.cleanup()

    def test_blocks_operation_not_in_allowlist(self):
        records = tool_execution.execute_tool_calls(
            router=FakeRouter(),
            state={
                "tool_calls": [
                    {
                        "tool": "filesystem",
                        "operation": "write_file",
                        "payload": {"path": "x", "content": "y"},
                    }
                ]
            },
            role="tester",
            agent_name="TesterAgent",
        )

        self.assertEqual(len(records), 1)
        self.assertFalse(records[0]["ok"])
        self.assertIn("blocked by policy", records[0]["error"])

    def test_enforces_per_task_budget(self):
        records = tool_execution.execute_tool_calls(
            router=FakeRouter(),
            state={
                "tool_calls": [
                    {"tool": "filesystem", "operation": "read_file", "payload": {"path": "a"}},
                    {"tool": "filesystem", "operation": "read_file", "payload": {"path": "b"}},
                    {"tool": "filesystem", "operation": "read_file", "payload": {"path": "c"}},
                ]
            },
            role="tester",
            agent_name="TesterAgent",
        )

        self.assertTrue(records[0]["ok"])
        self.assertTrue(records[1]["ok"])
        self.assertFalse(records[2]["ok"])
        self.assertIn("budget exceeded", records[2]["error"])

    def test_enforces_rate_limit_across_calls(self):
        first = tool_execution.execute_tool_calls(
            router=FakeRouter(),
            state={"tool_calls": [{"tool": "filesystem", "operation": "read_file", "payload": {"path": "a"}}]},
            role="tester",
            agent_name="RateLimitedAgent",
        )
        second = tool_execution.execute_tool_calls(
            router=FakeRouter(),
            state={"tool_calls": [{"tool": "filesystem", "operation": "read_file", "payload": {"path": "b"}}]},
            role="tester",
            agent_name="RateLimitedAgent",
        )
        third = tool_execution.execute_tool_calls(
            router=FakeRouter(),
            state={"tool_calls": [{"tool": "filesystem", "operation": "read_file", "payload": {"path": "c"}}]},
            role="tester",
            agent_name="RateLimitedAgent",
        )

        self.assertTrue(first[0]["ok"])
        self.assertTrue(second[0]["ok"])
        self.assertFalse(third[0]["ok"])
        self.assertIn("rate limit exceeded", third[0]["error"])

    def test_writes_audit_log_entries(self):
        tool_execution.execute_tool_calls(
            router=FakeRouter(),
            state={
                "tool_calls": [
                    {"tool": "filesystem", "operation": "read_file", "payload": {"path": "ok"}},
                    {"tool": "filesystem", "operation": "write_file", "payload": {"path": "blocked"}},
                ]
            },
            role="tester",
            agent_name="AuditAgent",
        )

        with open(self.audit_path, "r", encoding="utf-8") as handle:
            lines = [json.loads(line) for line in handle.readlines() if line.strip()]

        self.assertGreaterEqual(len(lines), 2)
        keys = {"timestamp", "agent", "role", "tool", "operation", "decision", "reason", "ok"}
        self.assertTrue(keys.issubset(lines[0].keys()))


if __name__ == "__main__":
    unittest.main()
