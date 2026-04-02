#!/usr/bin/env python3
"""
Demo: CEO and Coordinator agents making real LLM calls.

This script demonstrates:
1. CEO interprets a user goal and breaks it into tasks
2. Coordinator orchestrates specialist assignment and budgeting
3. Both agents use ModelClient to call the configured LLM provider
"""

import json
from hiveforge.agents.ceo import ExecutiveAgent
from hiveforge.agents.coordinator import CoordinatorAgent
from hiveforge.models.inference import InferenceContext, ModelClient

def demo_ceo_analysis():
    """Demo: CEO analyzes a project goal."""
    print("=" * 70)
    print("DEMO: CEO Agent Analyzing Project Goal")
    print("=" * 70)

    ceo = ExecutiveAgent()
    
    # Example project goal
    objective = "Build a REST API for a task management system with authentication, user roles, and WebSocket notifications"
    
    # Current state
    state = {
        "project": "TaskMgmt API",
        "status": "initiation",
        "budget_usd": 500.0,
        "calendar_days": 14,
        "team_size": 1,
    }

    print(f"\nObjective: {objective}")
    print(f"State: {json.dumps(state, indent=2)}")
    print("\nCEO is analyzing...\n")

    result = ceo.run_task(objective=objective, state=state, budget=100.0)

    print(f"CEO Response:\n")
    if "error" in result:
        print(f"Error: {result['error']}")
    else:
        print(f"Agent: {result['agent']} ({result['role']})")
        print(f"Analysis:\n{result['llm_analysis']}\n")
        print(f"Cost Estimate: ${result['cost_estimate']}")


def demo_coordinator_orchestration():
    """Demo: Coordinator plans specialist assignment."""
    print("\n" + "=" * 70)
    print("DEMO: Coordinator Agent Planning Task Distribution")
    print("=" * 70)

    coordinator = CoordinatorAgent()
    
    # A task handed down from CEO
    objective = "Implement user authentication with JWT tokens and role-based access control"
    
    state = {
        "tasks_pending": 3,
        "specialists_available": ["Developer", "ProjectManager", "Analyst"],
        "budget_per_task": 150.0,
    }

    print(f"\nTask: {objective}")
    print(f"State: {json.dumps(state, indent=2)}")
    print("\nCoordinator is planning...\n")

    result = coordinator.run_task(objective=objective, state=state, budget=150.0)

    print(f"Coordinator Response:\n")
    if "error" in result:
        print(f"Error: {result['error']}")
    else:
        print(f"Agent: {result['agent']} ({result['role']})")
        print(f"Orchestration Plan:\n{result['llm_orchestration_plan']}\n")
        print(f"Budget Remaining: ${result['budget_remaining']}")


def demo_cost_tracking():
    """Demo: Track inference costs across multiple calls."""
    print("\n" + "=" * 70)
    print("DEMO: Cost Tracking with InferenceContext")
    print("=" * 70)

    client = ModelClient()
    context = InferenceContext(client)

    prompts = [
        "Summarize the architecture of a REST API framework",
        "List 5 best practices for database design",
        "Explain the differences between SQL and NoSQL"
    ]

    print(f"\nMaking {len(prompts)} inference calls with cost tracking...\n")

    for i, prompt in enumerate(prompts, 1):
        print(f"Call {i}: {prompt[:50]}...")
        response = context.infer(
            prompt=prompt,
            system_prompt="You are a technical expert. Keep responses under 150 words."
        )
        print(f"Response length: {len(response)} chars\n")

    usage = context.get_usage_summary()
    print("\nUsage Summary:")
    print(f"  Total input tokens: {usage['input_tokens']}")
    print(f"  Total output tokens: {usage['output_tokens']}")
    print(f"  Total tokens: {usage['total_tokens']}")
    print(f"  Estimated cost: ${usage['estimated_cost_usd']:.6f}")
    print(f"  Provider: {usage['provider']}")


if __name__ == "__main__":
    try:
        print("\nHiveForge CEO + Coordinator + LLM Demo\n")

        # CEO task analysis
        demo_ceo_analysis()

        # Coordinator orchestration
        demo_coordinator_orchestration()

        # Cost tracking
        demo_cost_tracking()

        print("\n" + "=" * 70)
        print("Demo completed successfully!")
        print("=" * 70)

    except Exception as e:
        print(f"\nDemo failed: {e}")
        import traceback
        traceback.print_exc()
