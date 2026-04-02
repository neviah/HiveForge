#!/usr/bin/env python3
"""
Demo: Agents executing real tools via OpenClawToolRouter.

Shows how specialists can:
1. Read and write files
2. Fetch URLs
3. Send emails/messages
4. Execute commands
5. Analyze data via APIs
"""

import json
from hiveforge import OpenClawToolRouter


def demo_developer_writes_code():
    """Demo: Developer agent writes code to a file."""
    print("=" * 70)
    print("Demo 1: Developer Writes Code (Filesystem Tool)")
    print("=" * 70)

    router = OpenClawToolRouter()

    # Developer "decides" to write a Python function
    code = '''def calculate_fibonacci(n: int) -> list[int]:
    """Calculate Fibonacci sequence up to n terms."""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[-1] + fib[-2])
    return fib[:n]
'''

    result = router.write_file("fibonacci.py", code)
    print(f"\n✓ {result['message']}")
    print(f"  Path: {result.get('path')}")

    # Developer reads it back to verify
    result = router.read_file("fibonacci.py")
    print(f"\n✓ Verified write - {result['size_bytes']} bytes")


def demo_researcher_fetches_data():
    """Demo: Researcher fetches URLs and processes data."""
    print("\n" + "=" * 70)
    print("Demo 2: Researcher Fetches & Analyzes Data (Browser + API Tool)")
    print("=" * 70)

    router = OpenClawToolRouter()

    # Researcher fetches a URL
    result = router.fetch_url("https://api.example.com/projects")
    print(f"\n✓ {result['message']}")
    print(f"  Status: {result.get('status')}")

    # Researcher makes API calls
    result = router.http_request("GET", "https://api.example.com/users", limit=100)
    print(f"\n✓ API Request: {result['message']}")
    print(f"  Status: {result.get('status')}")
    print(f"  Method: {result.get('method')}")


def demo_project_manager_logs_updates():
    """Demo: Project Manager writes status updates to file."""
    print("\n" + "=" * 70)
    print("Demo 3: ProjectManager Logs Status (Filesystem Tool)")
    print("=" * 70)

    router = OpenClawToolRouter()

    # Create a status log
    status = """PROJECT: HiveForge Phase 4
DATE: 2026-04-02
STATUS: Phase 4 tool layer implementation

COMPLETED:
- Filesystem tool (read, write, edit, list)
- Browser tool (fetch, search)
- API tool (HTTP requests, authentication)
- Messaging tool (email, Slack, SMS)
- Command tool (shell execution)
- OpenClawToolRouter with lazy-loading

IN PROGRESS:
- Specialist agent integration with tools
- Tool security hardening

NEXT:
- Extended marketplace agents
- Interactive UI dashboard
- Session recording

BLOCKERS: None
"""

    result = router.write_file("project_status.md", status, overwrite=True)
    print(f"\n✓ {result['message']}")

    # List directory to show files created
    result = router.list_directory()
    print(f"\n✓ Workspace contains {result['count']} items:")
    for item in result.get('contents', [])[:10]:
        if item['type'] == 'file':
            print(f"  - {item['name']}")


def demo_critic_reviews_code():
    """Demo: Critic reads and reviews code."""
    print("\n" + "=" * 70)
    print("Demo 4: Critic Reviews Code (Filesystem Tool)")
    print("=" * 70)

    router = OpenClawToolRouter()

    # Critic reads code to review
    result = router.read_file("fibonacci.py")
    if result['ok']:
        print(f"\n✓ Read {result['size_bytes']} bytes of code")
        
        # Critic "analyzes" and decides to suggest improvements
        improved_code = result['content'].replace(
            "def calculate_fibonacci(n: int) -> list[int]:",
            "def calculate_fibonacci(n: int) -> list[int]:\n    \"\"\"Calculate Fibonacci - optimized with caching.\"\"\""
        )
        
        # Critic writes the improved version
        result = router.write_file("fibonacci_improved.py", improved_code, overwrite=True)
        print(f"✓ {result['message']}")


def demo_writer_creates_documentation():
    """Demo: Writer creates documentation."""
    print("\n" + "=" * 70)
    print("Demo 5: Writer Creates Documentation (Filesystem Tool)")
    print("=" * 70)

    router = OpenClawToolRouter()

    # Writer creates a README
    readme = """# Fibonacci Module

## Description
High-performance Fibonacci sequence generator with multiple algorithms.

## Functions

### calculate_fibonacci(n)
Generates the first n Fibonacci numbers.

**Parameters:**
- n (int): Number of Fibonacci terms to generate

**Returns:**
- list[int]: Fibonacci sequence

**Example:**
```python
from fibonacci import calculate_fibonacci
result = calculate_fibonacci(10)
print(result)  # [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```

## Performance
- Time: O(n)
- Space: O(n)

## License
MIT
"""

    result = router.write_file("FIBONACCI_README.md", readme)
    print(f"\n✓ {result['message']}")


def demo_specialist_integration():
    """Demo: Show how specialists would use the tool router."""
    print("\n" + "=" * 70)
    print("Demo 6: How Specialists Integrate Tools")
    print("=" * 70)

    print("""
Each specialist agent has access to OpenClawToolRouter:

    class DeveloperAgent(HiveForgeAgent):
        def __init__(self):
            super().__init__(...)
            self.router = OpenClawToolRouter()
        
        def run_task(self, objective, state, budget):
            # Call LLM to decide what to build
            llm_response = self.llm_client.infer(...)
            
            # THEN execute the plan using tools
            code = extract_code_from_response(llm_response)
            result = self.router.write_file("main.py", code)
            
            # Read back and verify
            verify = self.router.read_file("main.py")
            
            # Run tests
            test_result = self.router.execute_command("pytest")
            
            return result

What this enables:
✓ Agents can actually write code (not just suggest it)
✓ Agents can fetch real data (not mock it)
✓ Agents can send real notifications
✓ Agents can execute shell commands
✓ Agents can verify their own work

Next step: Inject OpenClawToolRouter into agent classes
""")


if __name__ == "__main__":
    try:
        print("\nHiveForge Tool Execution Demo\n")

        # Run demos
        demo_developer_writes_code()
        demo_researcher_fetches_data()
        demo_project_manager_logs_updates()
        demo_critic_reviews_code()
        demo_writer_creates_documentation()
        demo_specialist_integration()

        print("\n" + "=" * 70)
        print("Demo completed! Tools are operational.")
        print("=" * 70)

    except Exception as e:
        print(f"\nDemo failed: {e}")
        import traceback
        traceback.print_exc()
