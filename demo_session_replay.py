from __future__ import annotations

from hiveforge import DeveloperAgent, list_recorded_sessions, replay_session


def run_demo() -> dict:
    agent = DeveloperAgent()
    agent.run_task(
        objective="Create and inspect a marker file for session replay demo",
        state={
            "tool_calls": [
                {
                    "tool": "filesystem",
                    "operation": "write_file",
                    "payload": {
                        "path": "sandbox/projects/replay_demo.txt",
                        "content": "phase6 replay demo\n",
                        "overwrite": True,
                    },
                },
                {
                    "tool": "filesystem",
                    "operation": "read_file",
                    "payload": {"path": "sandbox/projects/replay_demo.txt"},
                },
            ]
        },
        budget=20.0,
    )

    sessions = list_recorded_sessions()
    latest = sessions[-1] if sessions else ""
    return replay_session(latest) if latest else {}


if __name__ == "__main__":
    summary = run_demo()
    print("Session:", summary.get("session_id"))
    print("Events:", summary.get("event_count"))
    print("Event types:", summary.get("event_types"))
