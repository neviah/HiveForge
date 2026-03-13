# HiveForge Templates

Each JSON file defines a launchable project template and includes:
- required coordinator role
- default subordinate roster
- optional marketplace roster
- workflow phases
- task breakdown
- dependency graph
- goal definition

Files:
- business.json
- game_studio.json
- publishing_house.json
- music_production.json
- software_agency.json
- research_lab.json
- content_creator.json

Notes:
- subordinate agents can include one or more personality prompt paths from agency-agents.
- operating_mode controls whether a project is finite_delivery or continuous_business.
- recurring_loops define template-specific recurring operations owned by specific roles.
- recurring_loops can include connector actions (type/connector/operation/input/estimated_cost).
- role_capabilities defines which roles can deploy/spend and which connectors each role can use.
- auto_staffing_policy controls coordinator-driven optional-agent expansion under load.
