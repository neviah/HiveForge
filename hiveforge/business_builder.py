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
            "mission_brief": {},
            "pipeline": {"steps": []},
            "launch": {},
            "deployment": {},
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
            "mission_brief": {},
            "pipeline": {"steps": []},
            "launch": {},
            "deployment": {},
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


def _product_mode(objective: str) -> str:
        text = objective.lower()
        real_estate_terms = ["real estate", "zillow", "house", "houses", "homes", "listing", "mls", "city", "state"]
        if any(term in text for term in real_estate_terms):
                return "real_estate_finder"
        return "general_launch"


def _real_estate_app_html(project_name: str, objective: str) -> str:
        return f"""<!doctype html>
<html lang=\"en\">
<head>
    <meta charset=\"utf-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
    <title>{project_name} | City Home Finder</title>
    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">
    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>
    <link href=\"https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap\" rel=\"stylesheet\">
    <style>
        :root {{
            --ink: #0f172a;
            --ink-soft: #334155;
            --paper: #f6f7fb;
            --card: #ffffff;
            --line: #d8dce7;
            --accent: #0f766e;
            --accent-2: #1d4ed8;
            --warn: #b45309;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            font-family: \"Space Grotesk\", \"Segoe UI\", sans-serif;
            color: var(--ink);
            background:
                radial-gradient(1200px 480px at 12% -20%, #e0fbf4 5%, transparent 58%),
                radial-gradient(1000px 500px at 96% -30%, #dbeafe 7%, transparent 62%),
                linear-gradient(180deg, #f8fafc, #edf1f9);
        }}
        .shell {{ max-width: 1180px; margin: 0 auto; padding: 28px 20px 40px; }}
        .hero {{
            border: 1px solid var(--line);
            border-radius: 24px;
            padding: 28px;
            background: linear-gradient(140deg, rgba(15, 118, 110, 0.08), rgba(29, 78, 216, 0.08));
            box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
        }}
        .hero h1 {{ margin: 0 0 10px; font-size: clamp(2rem, 4vw, 3.8rem); line-height: 1.02; }}
        .hero p {{ margin: 0; font-size: 1.06rem; color: var(--ink-soft); max-width: 74ch; }}
        .hero .tag {{
            display: inline-block;
            margin-bottom: 14px;
            font-family: \"IBM Plex Mono\", monospace;
            font-size: 0.8rem;
            background: #0f172a;
            color: #fff;
            padding: 7px 10px;
            border-radius: 999px;
            letter-spacing: 0.05em;
        }}
        .layout {{
            display: grid;
            grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
            gap: 18px;
            margin-top: 18px;
        }}
        .panel {{
            border: 1px solid var(--line);
            border-radius: 18px;
            background: var(--card);
            box-shadow: 0 12px 26px rgba(15, 23, 42, 0.06);
            padding: 16px;
        }}
        .panel h2 {{ margin: 0 0 12px; font-size: 1.1rem; }}
        .grid {{ display: grid; gap: 10px; }}
        label {{ font-size: 0.84rem; color: var(--ink-soft); display: grid; gap: 5px; }}
        input, select {{
            font: inherit;
            border: 1px solid var(--line);
            border-radius: 10px;
            padding: 10px 12px;
            background: #fff;
            color: var(--ink);
        }}
        .row {{ display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }}
        button {{
            font: inherit;
            border: 1px solid transparent;
            border-radius: 10px;
            padding: 10px 14px;
            cursor: pointer;
            background: var(--accent);
            color: #fff;
            font-weight: 600;
        }}
        button.alt {{ background: #0f172a; }}
        .subtle {{ font-size: 0.83rem; color: var(--ink-soft); }}
        .warn {{ color: var(--warn); font-family: \"IBM Plex Mono\", monospace; font-size: 0.77rem; margin-top: 8px; }}
        .cards {{ display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }}
        .listing {{
            border: 1px solid var(--line);
            border-radius: 14px;
            overflow: hidden;
            background: #fff;
        }}
        .listing .img {{
            aspect-ratio: 16/9;
            background:
                linear-gradient(130deg, rgba(15, 118, 110, 0.22), rgba(29, 78, 216, 0.2)),
                repeating-linear-gradient(45deg, #dbeafe 0 10px, #eff6ff 10px 20px);
        }}
        .listing .body {{ padding: 10px 12px 12px; display: grid; gap: 6px; }}
        .price {{ font-size: 1.05rem; font-weight: 700; }}
        .meta {{ font-size: 0.84rem; color: var(--ink-soft); }}
        .badge {{
            display: inline-flex;
            border: 1px solid var(--line);
            border-radius: 999px;
            font-size: 0.74rem;
            padding: 4px 8px;
            width: fit-content;
            color: var(--ink-soft);
        }}
        .empty {{
            border: 1px dashed var(--line);
            border-radius: 14px;
            padding: 20px;
            color: var(--ink-soft);
            background: rgba(248, 250, 252, 0.7);
            text-align: center;
        }}
        @media (max-width: 980px) {{
            .layout {{ grid-template-columns: 1fr; }}
        }}
    </style>
</head>
<body>
    <main class=\"shell\">
        <section class=\"hero\">
            <span class=\"tag\">MULTI-AGENT PRODUCT SCAFFOLD</span>
            <h1>{project_name}</h1>
            <p>{objective}</p>
            <p class=\"subtle\">This build includes a real-estate search UI scaffold with city/state filtering and listing cards. Connect a compliant data provider to enable live inventory.</p>
        </section>

        <section class=\"layout\">
            <article class=\"panel\">
                <h2>Search Controls</h2>
                <div class=\"grid\">
                    <label>State
                        <select id=\"state\"></select>
                    </label>
                    <label>City
                        <select id=\"city\"></select>
                    </label>
                    <label>Max Price
                        <input id=\"maxPrice\" type=\"number\" value=\"800000\" min=\"50000\" step=\"10000\">
                    </label>
                    <label>Min Beds
                        <input id=\"minBeds\" type=\"number\" value=\"2\" min=\"0\" step=\"1\">
                    </label>
                    <div class=\"row\">
                        <button id=\"apply\" type=\"button\">Apply Filters</button>
                        <button id=\"reset\" type=\"button\" class=\"alt\">Reset</button>
                    </div>
                    <p class=\"warn\">No Zillow scraping by default. Use licensed APIs or partner feeds (MLS/RESO, ATTOM, RentCast, Estated, etc.) for production.</p>
                </div>
            </article>

            <article class=\"panel\">
                <h2>Homes For Sale</h2>
                <div class=\"cards\" id=\"results\"></div>
            </article>
        </section>
    </main>

    <script>
        const listings = [
            {{ id: 1, city: \"Austin\", state: \"TX\", address: \"1420 Barton Sky Dr\", price: 615000, beds: 3, baths: 2, sqft: 1980, source: \"sample\" }},
            {{ id: 2, city: \"Austin\", state: \"TX\", address: \"509 Willow Brook Ln\", price: 785000, beds: 4, baths: 3, sqft: 2540, source: \"sample\" }},
            {{ id: 3, city: \"Miami\", state: \"FL\", address: \"88 Harbor Point Ave\", price: 739000, beds: 3, baths: 2, sqft: 1760, source: \"sample\" }},
            {{ id: 4, city: \"Miami\", state: \"FL\", address: \"201 Ocean Crest Blvd\", price: 930000, beds: 4, baths: 3, sqft: 2330, source: \"sample\" }},
            {{ id: 5, city: \"Phoenix\", state: \"AZ\", address: \"33 Desert Oak Ct\", price: 520000, beds: 3, baths: 2, sqft: 1890, source: \"sample\" }},
            {{ id: 6, city: \"Phoenix\", state: \"AZ\", address: \"742 Canyon Mesa Rd\", price: 648000, beds: 4, baths: 3, sqft: 2190, source: \"sample\" }}
        ];

        const stateSelect = document.getElementById('state');
        const citySelect = document.getElementById('city');
        const maxPrice = document.getElementById('maxPrice');
        const minBeds = document.getElementById('minBeds');
        const results = document.getElementById('results');

        const states = [...new Set(listings.map((x) => x.state))].sort();
        stateSelect.innerHTML = ['<option value="">Any state</option>', ...states.map((s) => `<option value="${{s}}">${{s}}</option>`)].join('');

        function refreshCities() {{
            const selectedState = stateSelect.value;
            const cities = [...new Set(listings.filter((x) => !selectedState || x.state === selectedState).map((x) => x.city))].sort();
            citySelect.innerHTML = ['<option value="">Any city</option>', ...cities.map((c) => `<option value="${{c}}">${{c}}</option>`)].join('');
        }}

        function money(value) {{
            return new Intl.NumberFormat('en-US', {{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}).format(value);
        }}

        function render() {{
            const state = stateSelect.value;
            const city = citySelect.value;
            const max = Number(maxPrice.value || 99999999);
            const beds = Number(minBeds.value || 0);
            const filtered = listings.filter((x) => (!state || x.state === state) && (!city || x.city === city) && x.price <= max && x.beds >= beds);
            if (!filtered.length) {{
                results.innerHTML = '<div class="empty">No homes match these filters yet.</div>';
                return;
            }}
            results.innerHTML = filtered.map((x) => `
                <article class="listing">
                    <div class="img"></div>
                    <div class="body">
                        <div class="price">${{money(x.price)}}</div>
                        <div><strong>${{x.address}}</strong></div>
                        <div class="meta">${{x.city}}, ${{x.state}} • ${{x.beds}} bd • ${{x.baths}} ba • ${{x.sqft}} sqft</div>
                        <span class="badge">source: ${{x.source}}</span>
                    </div>
                </article>
            `).join('');
        }}

        document.getElementById('apply').addEventListener('click', render);
        document.getElementById('reset').addEventListener('click', () => {{
            stateSelect.value = '';
            refreshCities();
            citySelect.value = '';
            maxPrice.value = 800000;
            minBeds.value = 2;
            render();
        }});

        stateSelect.addEventListener('change', () => {{
            refreshCities();
            render();
        }});
        citySelect.addEventListener('change', render);
        maxPrice.addEventListener('change', render);
        minBeds.addEventListener('change', render);

        refreshCities();
        render();
    </script>
</body>
</html>
"""


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
    mode = _product_mode(objective)
    offer = _offer_markdown(project_name, objective)
    spec = _product_spec_markdown(project_name, objective)
    launch = _launch_markdown(project_name)
    if mode == "real_estate_finder":
        landing = _real_estate_app_html(project_name, objective)
    else:
        landing = _landing_page_html(project_name, objective, f"A focused offer for teams that need faster, more visible execution.")

    connector_notes = (
        "# Data Connector Notes\n\n"
        "## Current State\n"
        "- This build ships with a UI scaffold and sample data.\n"
        "- Live listing connectors are not wired automatically.\n\n"
        "## Production Guidance\n"
        "- Prefer licensed feeds or approved APIs over scraping websites.\n"
        "- Candidate providers: RESO MLS feeds, ATTOM, RentCast, Estated.\n"
        "- Add caching, retries, and legal-compliance checks before launch.\n"
    )
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
            "depends_on": [],
            "artifact": {"label": "Strategy Roadmap", "path": f"{base}/strategy-roadmap.md", "content": roadmap, "category": "strategy"},
        },
        {
            "id": "market-research",
            "role": "researcher",
            "objective": f"Research the market case for {project_name}",
            "budget": 90.0,
            "depends_on": ["strategy-roadmap"],
            "artifact": {"label": "Market Research", "path": f"{base}/market-research.md", "content": research, "category": "offer_lab"},
        },
        {
            "id": "offer-lab",
            "role": "writer",
            "objective": f"Draft the offer lab for {project_name}",
            "budget": 80.0,
            "depends_on": ["market-research"],
            "artifact": {"label": "Offer Lab", "path": f"{base}/offer-lab.md", "content": offer, "category": "offer_lab"},
        },
        {
            "id": "product-spec",
            "role": "designer",
            "objective": f"Design the product specification for {project_name}",
            "budget": 95.0,
            "depends_on": ["offer-lab"],
            "artifact": {"label": "Product Spec", "path": f"{base}/product-spec.md", "content": spec, "category": "product_spec"},
        },
        {
            "id": "landing-page",
            "role": "developer",
            "objective": f"Build an objective-specific web app scaffold for {project_name}",
            "budget": 180.0,
            "depends_on": ["product-spec"],
            "artifact": {"label": "Landing Page", "path": f"{base}/website/index.html", "content": landing, "category": "build"},
        },
        {
            "id": "data-connector-notes",
            "role": "developer",
            "objective": f"Document live data integration path for {project_name}",
            "budget": 45.0,
            "depends_on": ["landing-page"],
            "artifact": {"label": "Data Connector Notes", "path": f"{base}/website/DATA_CONNECTOR.md", "content": connector_notes, "category": "build"},
        },
        {
            "id": "metrics-plan",
            "role": "analyst",
            "objective": f"Define the launch metrics for {project_name}",
            "budget": 70.0,
            "depends_on": ["offer-lab"],
            "artifact": {"label": "Metrics Plan", "path": f"{base}/metrics-plan.md", "content": metrics, "category": "launch"},
        },
        {
            "id": "launch-checklist",
            "role": "writer",
            "objective": f"Prepare the launch checklist for {project_name}",
            "budget": 70.0,
            "depends_on": ["landing-page", "metrics-plan", "data-connector-notes"],
            "artifact": {"label": "Launch Checklist", "path": f"{base}/launch-checklist.md", "content": launch, "category": "launch"},
        },
        {
            "id": "risk-review",
            "role": "critic",
            "objective": f"Review launch risks for {project_name}",
            "budget": 65.0,
            "depends_on": ["launch-checklist"],
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

    queued = {task["id"]: task for task in task_definitions}
    completed: set[str] = set()
    wave = 0

    while queued:
        wave += 1
        ready = [task for task in queued.values() if set(task.get("depends_on", [])) <= completed]
        if not ready:
            for task in queued.values():
                pipeline_steps.append(
                    {
                        "id": task["id"],
                        "title": task["objective"],
                        "role": task["role"],
                        "status": "blocked",
                        "summary": f"Waiting on dependencies: {', '.join(task.get('depends_on', []))}",
                        "artifact_path": task["artifact"]["path"],
                        "depends_on": task.get("depends_on", []),
                        "wave": wave,
                    }
                )
            break

        for task in ready:
            index = len(completed)
            specialist = marketplace.hire(task["role"])
            if specialist is None:
                pipeline_steps.append(
                    {
                        "id": task["id"],
                        "title": task["objective"],
                        "role": task["role"],
                        "status": "blocked",
                        "summary": "No specialist registered for this role.",
                        "depends_on": task.get("depends_on", []),
                        "wave": wave,
                    }
                )
                queued.pop(task["id"], None)
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
                "dependencies_completed": sorted(completed),
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
                    "depends_on": task.get("depends_on", []),
                    "wave": wave,
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
            if step_status == "done":
                completed.add(task["id"])
            queued.pop(task["id"], None)

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
    context["mission_brief"] = {
        "summary": "Mission statement, offer, and product scope combined for quick operator review.",
        "content": "\n\n".join([
            f"# Mission Statement\n\n{objective}",
            "## Offer\n\n" + task_map["offer-lab"]["artifact"]["content"],
            "## Product\n\n" + task_map["product-spec"]["artifact"]["content"],
        ]),
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
            "notes": "CEO requests final review on messaging before launch.",
        },
        {
            "id": "approve-deployment",
            "title": "Approve deployment target and data stack",
            "status": "pending",
            "notes": "Suggested target: Vercel. Suggested DB: Supabase Postgres unless custom constraints require plain Postgres.",
        }
    ]
    context["deployment"] = {
        "target": "vercel",
        "database": "supabase-postgres",
        "status": "awaiting_approval",
    }
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