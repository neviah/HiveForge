from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from hiveforge import CoordinatorAgent, ExecutiveAgent, get_marketplace


ROOT = Path(__file__).resolve().parents[1]
PROJECTS_DIR = ROOT / "sandbox" / "projects"
PROJECT_DATA_DIR = ROOT / "hiveforge" / "state" / "project_data"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id


def _context_path(project_id: str) -> Path:
    return PROJECT_DATA_DIR / f"{project_id}.json"


def _read_context(project_id: str) -> dict[str, Any]:
    path = _context_path(project_id)
    if not path.exists():
        return {
            "project_id": project_id,
            "strategy": {},
            "offer_lab": {},
            "product_spec": {},
            "pipeline": {"steps": []},
            "launch": {},
            "inbox": [],
            "approvals": [],
            "office": {"agents": []},
            "conversation": [],
            "artifacts": [],
            "last_run": None,
        }
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {
            "project_id": project_id,
            "strategy": {},
            "offer_lab": {},
            "product_spec": {},
            "pipeline": {"steps": []},
            "launch": {},
            "inbox": [],
            "approvals": [],
            "office": {"agents": []},
            "conversation": [],
            "artifacts": [],
            "last_run": None,
        }


def _write_context(project_id: str, context: dict[str, Any]) -> None:
    PROJECT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    _context_path(project_id).write_text(json.dumps(context, indent=2), encoding="utf-8")


def _append_inbox(context: dict[str, Any], *, sender: str, subject: str, body: str, kind: str = "update") -> None:
    inbox = context.setdefault("inbox", [])
    inbox.insert(
        0,
        {
            "id": f"msg-{len(inbox) + 1}-{int(datetime.now(timezone.utc).timestamp())}",
            "sender": sender,
            "subject": subject,
            "body": body,
            "kind": kind,
            "ts": _now_iso(),
        },
    )


def _register_artifact(context: dict[str, Any], *, label: str, relative_path: str, category: str) -> None:
    artifacts = context.setdefault("artifacts", [])
    if any(item.get("path") == relative_path for item in artifacts):
        return
    artifacts.append({"label": label, "path": relative_path, "category": category})


def _slug(text: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in text)
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-") or "venture"


def _headline(project_name: str, objective: str) -> str:
    return f"{project_name} is building around: {objective.strip()}"


def _landing_page_html(project_name: str, objective: str, offer_summary: str) -> str:
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>{project_name}</title>
  <style>
    :root {{ color-scheme: light; }}
    body {{ margin: 0; font-family: Arial, sans-serif; background: linear-gradient(180deg, #fff9ef, #f3efe7); color: #1c1f24; }}
    main {{ max-width: 960px; margin: 0 auto; padding: 72px 24px; }}
    .hero {{ display: grid; gap: 24px; }}
    .badge {{ display: inline-block; padding: 8px 12px; border-radius: 999px; background: #17324d; color: #fff; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }}
    h1 {{ font-size: 56px; line-height: 1.02; margin: 0; max-width: 12ch; }}
    p {{ font-size: 18px; line-height: 1.6; max-width: 60ch; }}
    .cta {{ display: flex; gap: 12px; flex-wrap: wrap; }}
    .cta a {{ text-decoration: none; padding: 14px 18px; border-radius: 12px; font-weight: bold; }}
    .primary {{ background: #0f8b8d; color: #fff; }}
    .secondary {{ background: #fff; color: #17324d; border: 1px solid #d7c9b4; }}
    .grid {{ display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 40px; }}
    .card {{ background: rgba(255,255,255,0.88); border: 1px solid #dccfbf; border-radius: 18px; padding: 20px; box-shadow: 0 10px 24px rgba(17, 20, 26, 0.08); }}
  </style>
</head>
<body>
  <main>
    <section class=\"hero\">
      <span class=\"badge\">HiveForge Launch Draft</span>
      <h1>{project_name}</h1>
      <p>{objective}</p>
      <p>{offer_summary}</p>
      <div class=\"cta\">
        <a class=\"primary\" href=\"#waitlist\">Join the Waitlist</a>
        <a class=\"secondary\" href=\"#product\">View Product Story</a>
      </div>
    </section>
    <section class=\"grid\">
      <article class=\"card\"><h2>Who it is for</h2><p>Operators who need faster execution without rebuilding the same internal stack each time.</p></article>
      <article class=\"card\"><h2>What it changes</h2><p>Turns strategy, product specification, and launch planning into a coordinated build pipeline.</p></article>
      <article class=\"card\"><h2>How it launches</h2><p>Start with a focused wedge, capture qualified demand, and convert learnings into a sharper offer.</p></article>
    </section>
  </main>
</body>
</html>
"""


def _offer_markdown(project_name: str, objective: str) -> str:
    return f"""# Offer Lab\n\n## Core Offer\n{project_name} helps customers solve this problem: {objective}\n\n## ICP\n- Founder-led teams with urgent delivery bottlenecks\n- Operators willing to adopt AI-assisted workflows\n- Buyers who need visible progress and measurable outcomes\n\n## Packaging\n- Pilot: focused setup and validation sprint\n- Core plan: production workflow with launch assets\n- Expansion: automation, operations, and optimization layers\n\n## Pricing Hypothesis\n- Entry pilot for fast validation\n- Recurring plan once repeatable value is proven\n\n## Validation Questions\n- What pain is expensive enough to buy now?\n- What proof makes the offer credible?\n- Which niche can close fastest?\n"""


def _product_spec_markdown(project_name: str, objective: str) -> str:
    return f"""# Product Spec\n\n## Product Name\n{project_name}\n\n## Objective\n{objective}\n\n## MVP Scope\n- Landing page and waitlist capture\n- Clear problem framing and offer articulation\n- Lightweight onboarding path\n- Core workflow demonstration\n\n## User Flow\n1. Visitor arrives on landing page\n2. Visitor understands offer and outcome\n3. Visitor joins waitlist or books a call\n4. Team captures feedback and qualifies demand\n\n## Build Notes\n- Keep the first release narrow\n- Validate demand before deep backend expansion\n- Use project inbox for stakeholder updates and agent escalations\n"""


def _launch_markdown(project_name: str) -> str:
    return f"""# Launch Checklist\n\n- Confirm hero messaging and CTA\n- Publish landing page\n- Connect waitlist capture\n- Identify first outreach list\n- Send founder narrative to warm network\n- Track signups, replies, and booked calls\n- Review results after first demand cycle\n\nPrepared for {project_name}.\n"""


def _task_definitions(project_id: str, project_name: str, objective: str) -> list[dict[str, Any]]:
    base = f"sandbox/projects/{project_id}"
    offer = _offer_markdown(project_name, objective)
    spec = _product_spec_markdown(project_name, objective)
    launch = _launch_markdown(project_name)
    landing = _landing_page_html(project_name, objective, f"A focused offer for teams that need faster, more visible execution.")
    research = f"# Market Research\n\n## Thesis\n{objective}\n\n## Early Signals\n- Teams want faster execution with less management overhead\n- Credibility will come from concrete artifacts, not abstract autonomy claims\n- A tight niche angle is likely to outperform a broad platform pitch\n"
    roadmap = f"# Strategy Roadmap\n\n## Thesis\n{_headline(project_name, objective)}\n\n## Phase 1\n- Validate demand\n- Ship landing page\n- Capture first conversations\n\n## Phase 2\n- Turn validated demand into MVP workflow\n- Tighten onboarding and messaging\n\n## Phase 3\n- Scale with automations and operational depth\n"
    review = "# QA and Risk Review\n\n- Verify message clarity before launch\n- Ensure each artifact supports a single wedge offer\n- Avoid overbuilding before customer proof\n"
    metrics = "# Metrics Plan\n\n- Waitlist signups\n- Reply rate\n- Discovery calls booked\n- Conversion to paid pilot\n"

    return [
        {
            "id": "strategy-roadmap",
            "role": "project_manager",
            "objective": f"Create the execution roadmap for {project_name}",
            "budget": 120.0,
            "artifact": {"label": "Strategy Roadmap", "path": f"{base}/strategy-roadmap.md", "content": roadmap, "category": "strategy"},
        },
        {
            "id": "market-research",
            "role": "researcher",
            "objective": f"Research the market case for {project_name}",
            "budget": 90.0,
            "artifact": {"label": "Market Research", "path": f"{base}/market-research.md", "content": research, "category": "offer_lab"},
        },
        {
            "id": "offer-lab",
            "role": "writer",
            "objective": f"Draft the offer lab for {project_name}",
            "budget": 80.0,
            "artifact": {"label": "Offer Lab", "path": f"{base}/offer-lab.md", "content": offer, "category": "offer_lab"},
        },
        {
            "id": "product-spec",
            "role": "designer",
            "objective": f"Design the product specification for {project_name}",
            "budget": 95.0,
            "artifact": {"label": "Product Spec", "path": f"{base}/product-spec.md", "content": spec, "category": "product_spec"},
        },
        {
            "id": "landing-page",
            "role": "developer",
            "objective": f"Build the landing page scaffold for {project_name}",
            "budget": 180.0,
            "artifact": {"label": "Landing Page", "path": f"{base}/website/index.html", "content": landing, "category": "build"},
        },
        {
            "id": "metrics-plan",
            "role": "analyst",
            "objective": f"Define the launch metrics for {project_name}",
            "budget": 70.0,
            "artifact": {"label": "Metrics Plan", "path": f"{base}/metrics-plan.md", "content": metrics, "category": "launch"},
        },
        {
            "id": "launch-checklist",
            "role": "writer",
            "objective": f"Prepare the launch checklist for {project_name}",
            "budget": 70.0,
            "artifact": {"label": "Launch Checklist", "path": f"{base}/launch-checklist.md", "content": launch, "category": "launch"},
        },
        {
            "id": "risk-review",
            "role": "critic",
            "objective": f"Review launch risks for {project_name}",
            "budget": 65.0,
            "artifact": {"label": "Risk Review", "path": f"{base}/risk-review.md", "content": review, "category": "review"},
        },
    ]


def _result_excerpt(result: dict[str, Any]) -> str:
    for key in [
        "implementation_spec",
        "research_report",
        "content_draft",
        "project_plan",
        "analysis_report",
        "critique_report",
        "design_brief",
        "llm_orchestration_plan",
        "llm_analysis",
        "error",
    ]:
        value = result.get(key)
        if isinstance(value, str) and value.strip():
            return value[:600]
    return json.dumps(result, ensure_ascii=True)[:600]


def _tool_succeeded(result: dict[str, Any]) -> bool:
    records = result.get("tool_results", [])
    if not isinstance(records, list):
        return False
    return any(bool(record.get("ok")) for record in records if isinstance(record, dict))


def _clean_summary(raw_summary: str, *, fallback: str) -> str:
    return fallback if raw_summary.startswith("ERROR:") else raw_summary


def run_build_workflow(
    *,
    project_id: str,
    project_name: str,
    objective: str,
    budget: float,
    nudges: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    _project_dir(project_id).mkdir(parents=True, exist_ok=True)

    context = _read_context(project_id)
    context["project_id"] = project_id
    context["project_name"] = project_name

    ceo = ExecutiveAgent()
    coordinator = CoordinatorAgent()
    marketplace = get_marketplace()

    ceo_result = ceo.run_task(
        objective,
        state={
            "project_id": project_id,
            "project_name": project_name,
            "nudges": nudges or [],
        },
        budget=round(budget * 0.2, 2),
    )
    coordinator_result = coordinator.run_task(
        f"Coordinate build workflow for {project_name}: {objective}",
        state={"project_id": project_id, "project_name": project_name},
        budget=round(budget * 0.12, 2),
    )

    ceo_summary = _clean_summary(
        _result_excerpt(ceo_result),
        fallback=f"CEO direction: validate demand, shape a focused wedge, and ship the first landing page for {project_name}.",
    )
    coordinator_summary = _clean_summary(
        _result_excerpt(coordinator_result),
        fallback=f"Coordinator plan: route work through specialists, generate launch assets, and complete a first-pass business package for {project_name}.",
    )

    context["conversation"] = [
        {"sender": "Operator", "message": objective, "ts": _now_iso()},
        {"sender": "ExecutiveAgent", "message": ceo_summary, "ts": _now_iso()},
        {"sender": "CoordinatorAgent", "message": coordinator_summary, "ts": _now_iso()},
    ]
    context["strategy"] = {
        "objective": objective,
        "ceo_summary": ceo_summary,
        "coordinator_summary": coordinator_summary,
        "nudge_count": len(nudges or []),
        "content": "",
    }

    _append_inbox(
        context,
        sender="ExecutiveAgent",
        subject=f"Strategy direction for {project_name}",
        body=context["strategy"]["ceo_summary"],
    )
    _append_inbox(
        context,
        sender="CoordinatorAgent",
        subject="Execution pipeline drafted",
        body=context["strategy"]["coordinator_summary"],
    )

    pipeline_steps: list[dict[str, Any]] = []
    office_agents: list[dict[str, Any]] = []
    task_definitions = _task_definitions(project_id, project_name, objective)
    total_specialist_budget = round(budget * 0.68, 2)
    per_task_budget = round(total_specialist_budget / max(len(task_definitions), 1), 2)

    for index, task in enumerate(task_definitions):
        specialist = marketplace.hire(task["role"])
        if specialist is None:
            pipeline_steps.append(
                {
                    "id": task["id"],
                    "title": task["objective"],
                    "role": task["role"],
                    "status": "blocked",
                    "summary": "No specialist registered for this role.",
                }
            )
            continue

        artifact = task["artifact"]
        state = {
            "project_id": project_id,
            "project_name": project_name,
            "objective": objective,
            "tool_calls": [
                {
                    "tool": "filesystem",
                    "operation": "write_file",
                    "payload": {
                        "path": artifact["path"],
                        "content": artifact["content"],
                        "overwrite": True,
                    },
                }
            ],
            "artifact_path": artifact["path"],
            "nudge_history": nudges or [],
        }
        result = specialist.run_task(task["objective"], state=state, budget=min(task["budget"], per_task_budget))
        tool_succeeded = _tool_succeeded(result)
        excerpt = _result_excerpt(result)
        if tool_succeeded and excerpt.startswith("ERROR:"):
            excerpt = f"Artifact created at {artifact['path']}. LLM summary unavailable, but the deliverable file was written successfully."
        step_status = "done" if tool_succeeded or (not str(excerpt).startswith("ERROR:") and not result.get("error")) else "needs_attention"

        pipeline_steps.append(
            {
                "id": task["id"],
                "title": task["objective"],
                "role": task["role"],
                "status": step_status,
                "summary": excerpt,
                "artifact_path": artifact["path"],
            }
        )
        office_agents.append(
            {
                "id": specialist.profile.name,
                "role": task["role"],
                "lane": "done" if step_status == "done" else "approvals",
                "desk": index % 4,
                "mood": "working" if step_status == "done" else "waiting",
                "task": task["id"],
            }
        )
        _register_artifact(context, label=artifact["label"], relative_path=artifact["path"], category=artifact["category"])
        _append_inbox(
            context,
            sender=specialist.profile.name,
            subject=f"{artifact['label']} ready",
            body=excerpt,
            kind="update" if step_status == "done" else "warning",
        )

    task_map = {task["id"]: task for task in task_definitions}
    context["strategy"] = {
        **context["strategy"],
        "content": task_map["strategy-roadmap"]["artifact"]["content"],
        "artifact_path": f"sandbox/projects/{project_id}/strategy-roadmap.md",
    }
    context["offer_lab"] = {
        "summary": "Offer, ICP, packaging, and pricing hypotheses are ready for review.",
        "artifact_path": f"sandbox/projects/{project_id}/offer-lab.md",
        "content": task_map["offer-lab"]["artifact"]["content"],
    }
    context["product_spec"] = {
        "summary": "Product scope, user flow, and MVP boundaries have been drafted.",
        "artifact_path": f"sandbox/projects/{project_id}/product-spec.md",
        "content": task_map["product-spec"]["artifact"]["content"],
    }
    context["pipeline"] = {"steps": pipeline_steps}
    context["launch"] = {
        "summary": "Launch checklist and metrics plan are available.",
        "artifact_paths": [
            f"sandbox/projects/{project_id}/launch-checklist.md",
            f"sandbox/projects/{project_id}/metrics-plan.md",
        ],
        "content": "\n\n".join([
            task_map["launch-checklist"]["artifact"]["content"],
            task_map["metrics-plan"]["artifact"]["content"],
        ]),
    }
    context["approvals"] = [
        {
            "id": "approve-launch-copy",
            "title": "Approve launch messaging before external distribution",
            "status": "pending",
        }
    ]
    context["office"] = {"agents": office_agents}
    context["last_run"] = {
        "ts": _now_iso(),
        "objective": objective,
        "budget": budget,
    }

    _write_context(project_id, context)

    return {
        "ok": True,
        "project_id": project_id,
        "project_name": project_name,
        "strategy": context["strategy"],
        "pipeline": context["pipeline"],
        "artifacts": context["artifacts"],
        "inbox_count": len(context["inbox"]),
        "approvals": context["approvals"],
    }


def run_ceo_nudge(
    *,
    project_id: str,
    project_name: str,
    message: str,
    budget: float,
) -> dict[str, Any]:
    context = _read_context(project_id)
    conversation = context.setdefault("conversation", [])
    conversation.append({"sender": "Operator", "message": message, "ts": _now_iso()})

    ceo = ExecutiveAgent()
    result = ceo.run_task(
        f"Operator guidance for {project_name}: {message}",
        state={
            "project_id": project_id,
            "project_name": project_name,
            "conversation": conversation[-8:],
            "strategy": context.get("strategy", {}),
        },
        budget=budget,
    )
    reply = _clean_summary(
        _result_excerpt(result),
        fallback=f"CEO received the nudge for {project_name} and will bias the next build cycle toward that direction.",
    )
    conversation.append({"sender": "ExecutiveAgent", "message": reply, "ts": _now_iso()})
    _append_inbox(
        context,
        sender="ExecutiveAgent",
        subject="CEO nudge response",
        body=reply,
    )
    context["strategy"] = {
        **context.get("strategy", {}),
        "latest_nudge": message,
        "latest_response": reply,
    }
    _write_context(project_id, context)
    return {
        "ok": True,
        "reply": reply,
        "conversation": conversation,
        "strategy": context.get("strategy", {}),
    }