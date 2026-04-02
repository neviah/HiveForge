import os
import tempfile
import unittest

from hiveforge import replay_session
from hiveforge.agents.specialists.developer import DeveloperAgent
from hiveforge.telemetry.session_recorder import (
    _reset_session_recorder_for_tests,
    list_recorded_sessions,
    load_session_events,
)


class SessionReplayTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["HIVEFORGE_SESSION_LOG_DIR"] = self.temp_dir.name
        os.environ["HIVEFORGE_SESSION_ID"] = "test-session"
        _reset_session_recorder_for_tests()

    def tearDown(self):
        os.environ.pop("HIVEFORGE_SESSION_LOG_DIR", None)
        os.environ.pop("HIVEFORGE_SESSION_ID", None)
        _reset_session_recorder_for_tests()
        self.temp_dir.cleanup()

    def test_records_session_events_for_agent_run(self):
        agent = DeveloperAgent()
        result = agent.run_task(
            objective="run a tiny task",
            state={
                "tool_calls": [
                    {
                        "tool": "filesystem",
                        "operation": "list_directory",
                        "payload": {"path": "."},
                    }
                ]
            },
            budget=5.0,
        )

        self.assertIn("tool_results", result)

        sessions = list_recorded_sessions()
        self.assertIn("test-session", sessions)

        events = load_session_events("test-session")
        event_types = {event.get("event_type") for event in events}

        self.assertIn("task_start", event_types)
        self.assertIn("task_end", event_types)
        self.assertIn("loop_phase", event_types)
        self.assertIn("tool_call", event_types)
        self.assertIn("llm_call", event_types)
        self.assertIn("llm_response", event_types)

    def test_replay_summary_contains_counts(self):
        DeveloperAgent().run_task(
            objective="replay summary test",
            state={"tool_calls": []},
            budget=3.0,
        )

        summary = replay_session("test-session")
        self.assertEqual(summary["session_id"], "test-session")
        self.assertGreater(summary["event_count"], 0)
        self.assertIn("loop_phase", summary["event_types"])


if __name__ == "__main__":
    unittest.main()
