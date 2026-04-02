#!/usr/bin/env python3
"""
Demo: Specialist Marketplace with core agents on standby + dynamic loading.

Shows:
1. Marketplace initialization with 7 core agents ready
2. Instant access to core agents
3. CEO hiring specialists from the marketplace
4. Marketplace statistics and management
"""

import json
from hiveforge import ExecutiveAgent, get_marketplace


def demo_marketplace_initialization():
    """Demo: Marketplace starts with 7 core agents on standby."""
    print("=" * 70)
    print("Demo 1: Marketplace Initialization")
    print("=" * 70)

    marketplace = get_marketplace()
    stats = marketplace.get_stats()

    print(f"\nMarketplace initialized with:")
    print(f"  Core agents ready: {stats['core_agents']}")
    print(f"  Extended registered: {stats['extended_registered']}")
    print(f"  Total available: {stats['total_available']}")
    print(f"\nCore agent roles:")
    for role in stats['core_roles']:
        print(f"  - {role}")


def demo_instant_specialist_access():
    """Demo: Core agents are instantly available (no loading wait)."""
    print("\n" + "=" * 70)
    print("Demo 2: Instant Access to Core Specialists")
    print("=" * 70)

    marketplace = get_marketplace()

    print("\nHiring core specialists (instant):")
    core_roles = ["developer", "project_manager", "researcher"]
    for role in core_roles:
        agent = marketplace.hire(role)
        print(f"  ✓ {role}: {agent.profile.name} (${agent.profile.hourly_cost}/hr)")


def demo_ceo_uses_marketplace():
    """Demo: CEO can hire specialists from the marketplace."""
    print("\n" + "=" * 70)
    print("Demo 3: CEO Hiring Specialists")
    print("=" * 70)

    ceo = ExecutiveAgent()

    print("\nCEO listing available specialists...")
    available = ceo.marketplace.list_available_agents()
    print(f"Found {len(available)} available specialist roles:")
    for role, profile in list(available.items())[:7]:
        print(f"  - {role}: {profile.skills}")

    print("\nCEO hiring a developer...")
    dev = ceo.hire_specialist("developer")
    if dev:
        print(f"  ✓ Hired: {dev.profile.name}")
        print(f"    Skills: {dev.profile.skills}")
        print(f"    Cost: ${dev.profile.hourly_cost}/hr")

    print("\nCEO hiring a researcher...")
    researcher = ceo.hire_specialist("researcher")
    if researcher:
        print(f"  ✓ Hired: {researcher.profile.name}")
        print(f"    Skills: {researcher.profile.skills}")


def demo_marketplace_stats():
    """Demo: Track marketplace state."""
    print("\n" + "=" * 70)
    print("Demo 4: Marketplace Statistics")
    print("=" * 70)

    marketplace = get_marketplace()

    # Hire a few agents to see stats
    marketplace.hire("developer")
    marketplace.hire("writer")
    marketplace.hire("analyst")

    stats = marketplace.get_stats()

    print(f"\nMarketplace Stats:")
    print(f"  Core agents available: {stats['core_agents']}")
    print(f"  Extended agents registered: {stats['extended_registered']}")
    print(f"  Extended agents loaded: {stats['extended_loaded']}")
    print(f"  Total specialists available: {stats['total_available']}")
    print(f"\nCore agents on standby:")
    for role in stats['core_roles']:
        print(f"    - {role}")
    if stats['extended_loaded_roles']:
        print(f"\nExtended agents loaded:")
        for role in stats['extended_loaded_roles']:
            print(f"    - {role}")


if __name__ == "__main__":
    try:
        print("\nHiveForge Specialist Marketplace Demo\n")

        # Demo 1: Initialization
        demo_marketplace_initialization()

        # Demo 2: Instant access
        demo_instant_specialist_access()

        # Demo 3: CEO hiring
        demo_ceo_uses_marketplace()

        # Demo 4: Stats
        demo_marketplace_stats()

        print("\n" + "=" * 70)
        print("Demo completed successfully!")
        print("=" * 70)

    except Exception as e:
        print(f"\nDemo failed: {e}")
        import traceback
        traceback.print_exc()
