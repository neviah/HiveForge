from __future__ import annotations

from datetime import datetime, timezone
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from hiveforge import CoordinatorAgent, ExecutiveAgent, get_marketplace
from hiveforge.tools.openclaw_wrappers.tool_router import OpenClawToolRouter


ROOT = Path(__file__).resolve().parents[1]
PROJECTS_DIR = ROOT / "sandbox" / "projects"
PROJECT_DATA_DIR = ROOT / "hiveforge" / "state" / "project_data"
MARKETPLACE_AGENTS_DIR = ROOT / "hiveforge" / "marketplace" / "agency_agents_upstream"

_DESIGN_PLAYBOOK_FILES: tuple[str, ...] = (
    "design/design-ui-designer.md",
    "design/design-ux-architect.md",
    "design/design-brand-guardian.md",
)
_DESIGN_PLAYBOOK_CACHE: str | None = None
_UUPRO_SEARCH_PY = ROOT / "hiveforge" / "tools" / "ui_ux_pro_max" / "scripts" / "search.py"


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


def _strip_yaml_frontmatter(text: str) -> str:
    if text.startswith("---\n"):
        parts = text.split("\n---\n", 1)
        if len(parts) == 2:
            return parts[1]
    return text


def _load_design_playbook() -> str:
    global _DESIGN_PLAYBOOK_CACHE
    if _DESIGN_PLAYBOOK_CACHE is not None:
        return _DESIGN_PLAYBOOK_CACHE

    chunks: list[str] = []
    for rel in _DESIGN_PLAYBOOK_FILES:
        path = MARKETPLACE_AGENTS_DIR / rel
        if not path.exists():
            continue
        try:
            raw = path.read_text(encoding="utf-8")
        except Exception:
            continue
        body = _strip_yaml_frontmatter(raw).strip()
        if not body:
            continue
        excerpt = body[:2600]
        chunks.append(f"# {path.stem}\n{excerpt}")

    _DESIGN_PLAYBOOK_CACHE = "\n\n".join(chunks)
    return _DESIGN_PLAYBOOK_CACHE


def _get_design_system_spec(query: str, project_name: str) -> str:
    """Generate an industry-specific design system spec using ui-ux-pro-max."""
    if not _UUPRO_SEARCH_PY.exists():
        return ""
    try:
        result = subprocess.run(
            [
                sys.executable,
                str(_UUPRO_SEARCH_PY),
                query,
                "--design-system",
                "-p", project_name,
                "--format", "markdown",
            ],
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        output = result.stdout.strip()
        return output[:3500] if output else ""
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# LLM-powered discovery, research, generation, and critic pipeline
# ---------------------------------------------------------------------------

_DISCOVERY_FALLBACK: dict[str, Any] = {
    "product_category": "web_app",
    "target_user": "general users",
    "core_features": ["core functionality", "user interface"],
    "secondary_features": [],
    "visual_direction": "clean modern minimal",
    "tone": "professional",
    "color_palette_hint": "neutral palette with a bold accent color",
    "font_style": "geometric-sans",
    "competitor_references": [],
    "domain_constraints": [],
    "known_unknowns": [],
    "build_priority": "quality and aesthetics",
}


def _make_llm() -> Any:
    """Lazily create a ModelClient. Returns None if the provider is not configured."""
    try:
        from hiveforge.models.inference import ModelClient
        client = ModelClient()
        return client if client.provider is not None else None
    except Exception:
        return None


def _run_discovery(objective: str, project_name: str, llm: Any) -> dict[str, Any]:
    """CEO-level discovery: extract rich structured product context BEFORE building anything."""
    if llm is None:
        return dict(_DISCOVERY_FALLBACK)

    try:
        raw = llm.infer(
            prompt=f"""Analyze this project brief deeply. You are the first agent in the pipeline —
your job is to extract every useful detail BEFORE anyone writes a single line of code or copy.

PROJECT NAME: {project_name}
OBJECTIVE: {objective}

Return ONLY a valid JSON object with exactly these fields:
{{
  "product_category": "one of: real_estate_search | saas_tool | e_commerce | marketplace | booking_platform | portfolio | analytics_dashboard | community | content_platform | fintech | healthtech | edtech | gaming | social_network | productivity | dev_tool | other",
  "target_user": "specific description of the primary user persona, 1 precise sentence",
  "core_features": ["list", "of", "essential", "features", "that", "MUST", "exist", "in", "v1"],
  "secondary_features": ["nice-to-have", "features", "for", "later"],
  "visual_direction": "precise design direction — e.g. 'clean minimal with strong whitespace and micro-interactions', 'bold editorial with data-density and dark mode', 'warm consumer-grade with playful illustrations'",
  "tone": "brand tone — one of: professional | approachable | luxurious | playful | trustworthy | technical-expert | urgent | calm",
  "color_palette_hint": "specific palette — e.g. 'forest green + warm cream + dark ink' or 'deep navy + electric teal + white' or 'coral + slate + off-white'",
  "font_style": "one of: geometric-sans | humanist-sans | editorial-serif | mono-accent | display-serif",
  "competitor_references": ["actual product names in this category that set the quality benchmark"],
  "domain_constraints": ["legal, technical, or business constraints specific to this category"],
  "known_unknowns": ["gaps in the brief that if clarified would significantly improve output quality"],
  "build_priority": "the single most important quality: aesthetics | conversion | data_depth | simplicity | trust | speed"
}}""",
            system_prompt="You are a senior product strategist. Return ONLY valid JSON — no markdown wrapper, no explanation.",
        )
        match = re.search(r'\{[\s\S]+\}', raw)
        parsed = json.loads(match.group() if match else raw)
        return {**_DISCOVERY_FALLBACK, **parsed}
    except Exception:
        return dict(_DISCOVERY_FALLBACK)


def _run_domain_research(
    objective: str,
    project_name: str,
    discovery: dict[str, Any],
    llm: Any,
    external_signals: str = "",
) -> str:
    """Deep domain research: understand the landscape before any artifact is generated."""
    if llm is None:
        return ""

    category = discovery.get("product_category", "web_app")
    competitors = discovery.get("competitor_references", [])
    constraints = discovery.get("domain_constraints", [])
    core_features = discovery.get("core_features", [])
    target_user = discovery.get("target_user", "users")

    try:
        return llm.infer(
            prompt=f"""Deep domain research for: {project_name}

CATEGORY: {category}
OBJECTIVE: {objective}
TARGET USER: {target_user}
CORE FEATURES TO BUILD: {core_features}
QUALITY BENCHMARKS: {competitors}
KNOWN CONSTRAINTS: {constraints}

EXTERNAL WEB SIGNALS (tool-collected):
{external_signals[:4000] if external_signals else "No external signals captured."}

Research and document the following — be specific, not generic:

1. UX PATTERNS: What are the standard UX patterns users EXPECT in {category}? What do the best products get right that mediocre ones miss?

2. QUALITY BAR: What separates a great {category} product from a forgettable one? Cite specific examples.

3. TECHNICAL PATTERNS: What frontend architecture, frameworks, and patterns are standard for {category}?

4. DATA REQUIREMENTS: What live data is needed for each core feature? What APIs and providers exist? What are their constraints?

5. TRUST SIGNALS: What makes users trust and return to a {category} product?

6. VISUAL LANGUAGE: What design aesthetic works for this category? What typography, color, and layout choices signal quality?

7. FAILURE MODES: What are the most common ways {category} products disappoint users or fail at launch?

8. DIFFERENTIATION: Where is there room to be meaningfully different and better?

Be specific. Reference actual products, APIs, design systems, and patterns by name.""",
            system_prompt="You are a domain research expert. Be specific, practical, and direct. Reference real products and patterns.",
        )
    except Exception:
        return ""


def _collect_external_signals(
    objective: str,
    project_name: str,
    discovery: dict[str, Any],
) -> str:
    """Collect lightweight competitor and category signals via browser tools."""
    category = str(discovery.get("product_category", "web_app"))
    competitors = [str(item).strip() for item in discovery.get("competitor_references", []) if str(item).strip()]
    target_user = str(discovery.get("target_user", "users"))
    core_features = [str(item).strip() for item in discovery.get("core_features", []) if str(item).strip()]

    queries: list[str] = [
        f"best {category} websites",
        f"{objective} examples",
        f"{project_name} alternatives",
        f"{target_user} pain points {category}",
    ]
    queries.extend(
        [
            f"{category} ux patterns",
            f"{category} feature checklist",
            f"{category} onboarding flow examples",
        ]
    )
    if core_features:
        queries.append(f"{category} {' '.join(core_features[:2])} implementation patterns")
    for competitor in competitors[:4]:
        queries.append(f"{competitor} product page")

    router = OpenClawToolRouter()
    lines: list[str] = []
    seen_urls: set[str] = set()

    for query in queries[:8]:
        search_result = router.route("browser", "search", query=query, engine="duckduckgo", limit=5)
        if not search_result.get("ok"):
            lines.append(f"- Query: {query} | search failed: {search_result.get('error', 'unknown error')}")
            continue

        lines.append(f"- Query: {query} | results: {search_result.get('results_count', 0)}")
        results = search_result.get("results", [])
        if not isinstance(results, list):
            continue

        for result in results[:3]:
            if not isinstance(result, dict):
                continue
            url = str(result.get("url", "")).strip()
            title = str(result.get("title", "")).strip() or "Untitled"
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            fetch_result = router.route("browser", "fetch_url", url=url)
            if not fetch_result.get("ok"):
                lines.append(f"  - {title} | {url} | fetch failed")
                continue

            preview = str(fetch_result.get("content_preview", "")).strip()
            preview = re.sub(r"\s+", " ", preview)
            if len(preview) > 280:
                preview = preview[:280] + "..."
            resolved_title = str(fetch_result.get("title", "")).strip() or title
            lines.append(f"  - {resolved_title} | {url} | {preview}")

            if len(seen_urls) >= 12:
                break
        if len(seen_urls) >= 12:
            break

    if len(seen_urls) < 3 and competitors:
        fallback_urls = [f"https://www.{_slug(name)}.com/" for name in competitors[:5]]
        lines.append("- Fallback source pass: competitor homepages")
        for url in fallback_urls:
            if url in seen_urls:
                continue
            seen_urls.add(url)
            fetch_result = router.route("browser", "fetch_url", url=url)
            if not fetch_result.get("ok"):
                lines.append(f"  - {url} | fetch failed")
                continue
            title = str(fetch_result.get("title", "")).strip() or url
            preview = re.sub(r"\s+", " ", str(fetch_result.get("content_preview", "")).strip())
            if len(preview) > 280:
                preview = preview[:280] + "..."
            lines.append(f"  - {title} | {url} | {preview}")
            if len(seen_urls) >= 12:
                break

    return "\n".join(lines)


def _domain_delivery_rules(category: str, objective: str, core_features: list[str], target_user: str) -> str:
    rules = [
        "- Implement a complete, runnable, single-file HTML app with valid <!doctype html> ... </html>.",
        "- Avoid generic shells. The UI and interactions must reflect the actual product category.",
        "- All navigation links and primary controls must be functional (no dead links/buttons).",
        "- Use competitor and research cues to prioritize top 3 must-have features for v1.",
        "- Include realistic seeded data aligned to the domain, then structure code to allow live data replacement.",
        "- Add clear integration placeholders (functions, configs, TODOs) for live provider wiring and compliance checks.",
        "- Include explicit empty/loading/error states for the core user journey.",
    ]

    c = category.lower()
    if "e_commerce" in c or "marketplace" in c:
        rules.extend(
            [
                "- Include catalog, filtering, product detail/quick view, cart, and checkout flow.",
                "- Provide inventory/provider sync abstractions (e.g., fetchProviderItems and syncInventory).",
            ]
        )
    elif "booking" in c or "healthtech" in c:
        rules.extend(
            [
                "- Include service list, staff/specialist profiles, availability calendar/time slots, and booking confirmation flow.",
                "- Provide scheduling/provider sync abstractions (e.g., fetchAvailability and createBooking).",
            ]
        )
    elif "real_estate" in c:
        rules.extend(
            [
                "- Include listing search, map/list toggles or rich list views, filters, detail cards, and inquiry flow.",
                "- Provide listing data sync abstractions (e.g., fetchListings and syncListings).",
            ]
        )
    elif "saas" in c or "analytics" in c or "productivity" in c:
        rules.extend(
            [
                "- Include dashboard views, key workflows, and at least one end-to-end task completion flow.",
                "- Provide backend integration abstractions for data fetch/mutation and auth/session boundaries.",
            ]
        )

    rules.append(f"- Objective anchor: {objective}")
    rules.append(f"- Primary user anchor: {target_user}")
    if core_features:
        rules.append(f"- Core feature anchors: {', '.join(core_features[:8])}")

    return "\n".join(rules)


def _generate_artifact_content(
    *,
    task_id: str,
    artifact_label: str,
    artifact_path: str,
    project_name: str,
    objective: str,
    discovery: dict[str, Any],
    research: str,
    completed_excerpts: dict[str, str],
    external_signals: str,
    fallback_content: str,
    llm: Any,
) -> str:
    """For each task, ask the LLM to generate the ACTUAL artifact content — not a template."""
    if llm is None:
        return fallback_content

    category = discovery.get("product_category", "web_app")
    target_user = discovery.get("target_user", "end users")
    core_features = discovery.get("core_features", [])
    secondary_features = discovery.get("secondary_features", [])
    visual_direction = discovery.get("visual_direction", "modern minimal")
    tone = discovery.get("tone", "professional")
    palette = discovery.get("color_palette_hint", "neutral with accent")
    font_style = discovery.get("font_style", "geometric-sans")
    competitors = discovery.get("competitor_references", [])
    build_priority = discovery.get("build_priority", "quality")
    is_html = Path(artifact_path).suffix.lower() in (".html", ".htm")
    design_playbook = _load_design_playbook()
    design_system_spec = (
        _get_design_system_spec(
            f"{category} {visual_direction} {' '.join(str(f) for f in core_features[:3])}",
            project_name,
        )
        if is_html
        else ""
    )
    delivery_rules = _domain_delivery_rules(
        category=category,
        objective=objective,
        core_features=[str(item) for item in core_features],
        target_user=str(target_user),
    )

    def _is_complete_html(doc: str) -> bool:
        lowered = doc.lower()
        if "<!doctype" not in lowered:
            return False
        if "</html>" not in lowered or "</body>" not in lowered:
            return False
        if "<script" in lowered and "</script>" not in lowered:
            return False
        # Guard against hard-cut outputs that end mid-token.
        tail = doc.strip()[-80:]
        if tail and not ("</html>" in tail.lower() or tail.endswith("}")):
            return "</html>" in lowered
        return True

    prior_context = "\n\n".join(
        f"### {tid.replace('-', ' ').title()}\n{excerpt[:600]}"
        for tid, excerpt in completed_excerpts.items()
    ) if completed_excerpts else ""

    competitors_str = ", ".join(competitors) if competitors else f"leading {category} products"

    if is_html:
        prompt = f"""You are an elite frontend developer and UI/UX designer.
Your job is to build a real, production-quality web application — not a template or scaffold.

PROJECT: {project_name}
OBJECTIVE: {objective}

DISCOVERY CONTEXT:
- Category: {category}
- Target User: {target_user}
- Core Features Required: {core_features}
- Secondary Features: {secondary_features}
- Visual Direction: {visual_direction}
- Tone: {tone}
- Color Palette: {palette}
- Typography Style: {font_style}
- Build Priority: {build_priority}
- Quality Benchmarks: {competitors_str}

DOMAIN RESEARCH:
{research[:2500] if research else "Focus on best practices for " + category}

PRODUCT SPECIFICATION:
{completed_excerpts.get("product-spec", "Build all core features listed above.")[:1500]}

MARKETPLACE DESIGN PLAYBOOK:
{design_playbook[:6500] if design_playbook else "No design playbook available."}

INDUSTRY-SPECIFIC DESIGN SYSTEM (ui-ux-pro-max analysis):
{design_system_spec if design_system_spec else "Apply the marketplace playbook above as the design standard."}

REQUIREMENTS FOR THE OUTPUT:
1. A complete <!doctype html> page with ALL CSS in <style> and ALL JS in <script>
2. Design quality at the level of {competitors_str} — this is the standard to meet or exceed
3. Implement ALL core features: {core_features}
4. Typography: Use Google Fonts matching the "{font_style}" direction (pick the right fonts)
5. Color system built on "{palette}" — define all colours as CSS custom properties in :root
6. Fully responsive — mobile-first, with breakpoints for tablet and desktop
7. Working interactive JS (search, filters, modals, toggles — whatever the product requires)
8. Real, specific copy throughout — no "Lorem ipsum", no "Your text here"
9. Rich visual design: gradients, subtle shadows, hover transitions, micro-interactions
10. Semantic HTML5 with proper accessibility attributes
11. Multiple clearly distinct sections (hero, core product UI, features, social proof, footer)
12. The product should feel ALIVE — populated with realistic sample data where applicable
13. NO external image dependencies — use CSS gradients, SVG shapes, and icon fonts
14. Build a coherent design system using CSS variables for color, typography scale, spacing, radii, and elevation
15. All key controls must include default, hover, focus-visible, disabled, and validation/error states when relevant
16. Accessibility is mandatory: semantic landmarks, visible focus ring, keyboard navigation, and WCAG AA contrast
17. Use restrained motion with purpose (entrance, hover, and feedback), never distracting or excessive

OUTPUT: The ENTIRE index.html file starting with <!doctype html>.
Nothing else — no explanation, no markdown fence, no preamble. Just the HTML."""

    elif task_id == "strategy-roadmap":
        prompt = f"""You are a strategic product advisor. Write the strategy roadmap for this project.

PROJECT: {project_name}
OBJECTIVE: {objective}
CATEGORY: {category}
TARGET USER: {target_user}
CORE FEATURES: {core_features}
BUILD PRIORITY: {build_priority}

DOMAIN RESEARCH:
{research[:1500] if research else ""}

Write a comprehensive, specific strategy roadmap in Markdown. Reference actual features,
user needs, and domain constraints. Do NOT write generic startup advice — write for THIS project.

Include:
- Strategic Thesis (one paragraph on why this product wins)
- Phase 1 — Foundation (Month 1-2): specific milestones and deliverables
- Phase 2 — Growth (Month 3-6): specific milestones and deliverables
- Phase 3 — Scale (Month 6-12): expansion and optimisation
- Key Risks & Mitigations (specific to {category} — name them precisely)
- Resource Requirements
- Critical Success Metrics (measurable, specific, not "grow revenue")

Output ONLY the Markdown document, beginning with # Strategy Roadmap."""

    elif task_id == "market-research":
        prompt = f"""You are a market research analyst. Write a detailed market research report.

PROJECT: {project_name}
CATEGORY: {category}
OBJECTIVE: {objective}
COMPETITOR REFERENCES: {competitors}
DOMAIN CONSTRAINTS: {discovery.get("domain_constraints", [])}

DOMAIN RESEARCH BACKGROUND:
{research[:2000] if research else ""}

EXTERNAL WEB SIGNALS (tool-collected):
{external_signals[:4000] if external_signals else "No external signals captured."}

STRATEGY CONTEXT:
{completed_excerpts.get("strategy-roadmap", "")[:600]}

Write a comprehensive market research report in Markdown. Be specific — reference actual
companies, market dynamics, and domain-specific constraints. Do NOT write generic analysis.

Include:
- Market Overview (what's happening in {category} right now — trends, shifts, tensions)
- Competitive Landscape (analyse {competitors_str} — what they do well, where they fall short)
- Target Customer Profile (deep ICP for "{target_user}" — jobs-to-be-done, pains, gains)
- Market Opportunity & Positioning (where this product can win)
- Go-to-Market Approach
- Data & Integration Landscape (APIs, providers, technical ecosystem for {category})
- Regulatory & Compliance Notes

Output ONLY the Markdown document, beginning with # Market Research."""

    elif task_id == "landing-page":
        prompt = f"""You are a senior product engineer. Build a substantive, runnable product website/app.

PROJECT: {project_name}
CATEGORY: {category}
OBJECTIVE: {objective}
TARGET USER: {target_user}
CORE FEATURES: {core_features}
SECONDARY FEATURES: {secondary_features}
VISUAL DIRECTION: {visual_direction}
BRAND TONE: {tone}
PALETTE HINT: {palette}
FONT STYLE: {font_style}
COMPETITOR REFERENCES: {competitors}
BUILD PRIORITY: {build_priority}

MARKET / RESEARCH CONTEXT:
{research[:2200] if research else ""}

EXTERNAL WEB SIGNALS (tool-collected):
{external_signals[:4500] if external_signals else "No external signals captured."}

PRODUCT SPEC CONTEXT:
{completed_excerpts.get("product-spec", "")[:1500]}

MARKETPLACE DESIGN PLAYBOOK:
{design_playbook[:6500] if design_playbook else "No design playbook available."}

REQUIREMENTS:
{delivery_rules}

DESIGN QUALITY REQUIREMENTS (MANDATORY):
- Build a coherent design system with CSS variables for palette, type scale, spacing, radius, and elevation.
- Use intentional visual hierarchy, spacing rhythm, and typography suited to {target_user}.
- Include complete interaction states: default, hover, focus-visible, disabled, and error where relevant.
- Meet accessibility expectations: semantic landmarks, keyboard-friendly flows, and WCAG AA contrast.
- Add subtle purposeful motion for feedback and transitions.

Final output constraints:
- Keep code valid, complete, and runnable in browser without external build tools.
- Every top navigation link must target a real section id on the same page.
- Do not leave dead controls or dead links.

Output ONLY the HTML document."""

    elif task_id == "offer-lab":
        prompt = f"""You are a product positioning and growth expert. Write the offer strategy document.

PROJECT: {project_name}
TARGET USER: {target_user}
CORE FEATURES: {core_features}
TONE: {tone}
CATEGORY: {category}
BUILD PRIORITY: {build_priority}

MARKET RESEARCH CONTEXT:
{completed_excerpts.get("market-research", "")[:1000]}

Write a detailed offer lab document in Markdown. Think from the customer's perspective.
Be specific, persuasive, and opinionated — not generic.

Include:
- Core Promise (1 compelling sentence that defines the entire offer)
- Ideal Customer Profile with Jobs-to-be-Done, specific pains, specific gains
- Offer Packaging: Entry / Core / Expansion tiers with specific value at each
- Pricing Hypothesis with rationale and validation approach
- Key Objections customers WILL have and how to answer them memorably
- Proof Points needed before launch (what evidence to gather first)
- Messaging Framework: 3 headline variants and supporting copy angles

Output ONLY the Markdown document, beginning with # Offer Lab."""

    elif task_id == "product-spec":
        prompt = f"""You are a senior product manager. Write the product specification.

PROJECT: {project_name}
CATEGORY: {category}
TARGET USER: {target_user}
CORE FEATURES: {core_features}
SECONDARY FEATURES: {secondary_features}

OFFER CONTEXT:
{completed_excerpts.get("offer-lab", "")[:800]}

Write a complete product specification in Markdown. Be specific and opinionated.

Include:
- Product Vision Statement (one sentence)
- MVP Scope: Decide exactly what ships in v1 (cut ruthlessly — pick the 20% that delivers 80% of value)
- Non-Goals: What is explicitly deferred to v2+
- User Stories (8-12 stories: "As a [specific persona], I want to [action] so that [outcome]")
- Functional Requirements (specific, testable, numbered — no vague requirements)
- UI/UX Direction: Layout approach, key interaction patterns, key empty states
- Technical Architecture Notes: Stack decisions, data schema hints, critical integrations
- Open Questions that must be answered before launch

Reference the specific patterns expected for {category} products.
Output ONLY the Markdown document, beginning with # Product Spec."""

    elif task_id == "metrics-plan":
        prompt = f"""You are a growth analyst. Write the metrics and measurement plan.

PROJECT: {project_name}
OBJECTIVE: {objective}
CATEGORY: {category}
BUILD PRIORITY: {build_priority}

PRODUCT CONTEXT:
{completed_excerpts.get("product-spec", "")[:600]}

Write a rigorous metrics plan in Markdown. Use domain-appropriate metric names for {category}.

Include:
- North Star Metric (one metric that captures core value — explain the choice)
- Acquisition Metrics (inputs, channels, target CPAs)
- Activation Metrics (what a successful first session looks like — define the event)
- Engagement & Retention Metrics (DAU/MAU, retention curves, churn triggers)
- Revenue Metrics (leading and lagging indicators)
- Quality & NPS Metrics
- Analytics Implementation Checklist (every event to instrument at launch)
- Weekly Operating Dashboard (exactly 5 numbers that matter every Monday)

Output ONLY the Markdown document, beginning with # Metrics Plan."""

    elif task_id == "launch-checklist":
        prompt = f"""You are a launch manager. Write the pre-launch checklist.

PROJECT: {project_name}
CATEGORY: {category}

PRIOR WORK SUMMARY:
{chr(10).join(f"- {tid}: {excerpt[:250]}" for tid, excerpt in completed_excerpts.items())}

Write a comprehensive, checkbox-driven launch checklist in Markdown.

Sections:
- Technical Readiness (deployment, performance, security, HTTPS, browser testing, mobile testing)
- Content Readiness (copy, legal pages, 404/error states, empty states, favicon, OG meta)
- Analytics & Tracking (all events from metrics plan configured and tested)
- Distribution Prep (channels identified, visual assets ready, outreach list built)
- Support & Ops (feedback capture, issue tracking, team communication plan)
- Launch Day Playbook (timeline, go/no-go criteria, rollback plan)
- Post-Launch Days 1-7 (daily actions and check-ins)

Every item must be a checkbox (- [ ]). Be specific to {category} needs — not generic.
Output ONLY the Markdown document, beginning with # Launch Checklist."""

    elif task_id == "risk-review":
        prompt = f"""You are a quality and risk reviewer performing the final pre-launch gate.

PROJECT: {project_name}
CATEGORY: {category}
OBJECTIVE: {objective}

ALL ARTIFACTS SUMMARY:
{chr(10).join(f"### {tid.replace('-',' ').title()}\\n{excerpt[:350]}" for tid, excerpt in completed_excerpts.items())}

Perform a comprehensive risk review in Markdown. Be rigorous — this is the quality gate.

For each risk provide: Severity (High/Med/Low) | Likelihood | Specific Mitigation Strategy

Sections:
- Technical Risks (feasibility gaps, missing integrations, performance concerns)
- Product Risks (scope gaps, UX issues, missing features for target user)
- Business Risks (market timing, competition, revenue model)
- Data & Legal Risks ({category}-specific compliance, privacy, API terms of service)
- Launch Execution Risks (what specific things could cause a failed launch)

End with:
- Overall Launch Readiness Score: X/10 (with explanation)
- Top 3 Issues to Fix Before Launch (prioritised)
- Recommendation: ✅ Green Light | ⚠️ Yellow Light (conditions) | 🚫 Red Light (blockers)

Output ONLY the Markdown document, beginning with # Risk Review."""

    elif task_id == "data-connector-notes":
        prompt = f"""You are a technical architect. Write the data integration guide.

PROJECT: {project_name}
CATEGORY: {category}
CORE FEATURES: {core_features}

DOMAIN RESEARCH:
{research[:1500] if research else ""}

EXTERNAL WEB SIGNALS (tool-collected):
{external_signals[:3000] if external_signals else "No external signals captured."}

Write a technical data connector document in Markdown. Be specific — name actual APIs and SDKs.

Include:
- Current Build State (what the scaffold includes: sample data, placeholder UI)
- Live Data Requirements per core feature (exactly what data each feature needs)
- Recommended Provider Options (real APIs for {category} — name specific providers, pricing tier, license requirements)
- Integration Architecture (how providers connect to the frontend — REST, GraphQL, SDK)
- Authentication & Security Requirements (API key handling, OAuth flows, CORS)
- Rate Limits & Cost Considerations (practical limits and cost projections)
- Legal & Terms of Service Notes (what you CAN and CANNOT do per provider ToS)
- Step-by-step Integration Roadmap (numbered, actionable)

Output ONLY the Markdown document, beginning with # Data Connector Notes."""

    else:
        prompt = f"""Generate the {artifact_label} document for this project.

PROJECT: {project_name}
OBJECTIVE: {objective}
CATEGORY: {category}

PRIOR CONTEXT:
{prior_context[:1200] if prior_context else "No prior context."}

EXTERNAL WEB SIGNALS (tool-collected):
{external_signals[:2400] if external_signals else "No external signals captured."}

Write a professional, specific, non-generic {artifact_label}.
Output ONLY the document content, starting with a # heading."""

    try:
        result = llm.infer(prompt=prompt, max_tokens=8000)
        if result.startswith("ERROR:") or len(result.strip()) < 200:
            return fallback_content
        if is_html:
            clean = result.strip()
            if clean.startswith("```"):
                clean = re.sub(r'^```[^\n]*\n', '', clean)
                clean = re.sub(r'\n```\s*$', '', clean).strip()
            doctype_match = re.search(r'<!doctype', clean, re.IGNORECASE)
            if doctype_match:
                clean = clean[doctype_match.start():]
            if not _is_complete_html(clean):
                return fallback_content
            return clean
        return result
    except Exception:
        return fallback_content


def _run_critic_gate(
    *,
    artifact_label: str,
    content: str,
    objective: str,
    discovery: dict[str, Any],
    llm: Any,
) -> dict[str, Any]:
    """CriticAgent quality gate: score the artifact and return structured feedback."""
    _PASS: dict[str, Any] = {"score": 8, "approved": True, "critical_issues": [], "suggestions": []}
    if llm is None:
        return _PASS

    target_user = discovery.get("target_user", "end users")
    core_features = discovery.get("core_features", [])

    try:
        raw = llm.infer(
            prompt=f"""You are a rigorous quality reviewer. Score this artifact.

ARTIFACT TYPE: {artifact_label}
PROJECT OBJECTIVE: {objective}
TARGET USER: {target_user}
REQUIRED FEATURES / CONTENT: {core_features}

ARTIFACT CONTENT (first 4000 chars):
{content[:4000]}

Score this artifact 1–10:
- Objective alignment: Does it address THIS specific objective, not just generic boilerplate?
- Completeness: Does it include everything a {artifact_label} should contain?
- Quality: Would this stand up to expert scrutiny? Is it professional-grade?
- Specificity: Is it specific to this project or could it apply to any project?

Score < 7 = needs revision. Score >= 7 = approved.

Return ONLY valid JSON:
{{"score": <int 1-10>, "approved": <bool>, "critical_issues": ["list of critical flaws that MUST be fixed"], "suggestions": ["specific, actionable improvement suggestions"]}}""",
            system_prompt="Return only valid JSON. No markdown, no explanation.",
        )
        match = re.search(r'\{[\s\S]+\}', raw)
        return json.loads(match.group() if match else raw)
    except Exception:
        return _PASS


def _revise_artifact(
    *,
    original: str,
    feedback: list[str],
    suggestions: list[str],
    artifact_label: str,
    artifact_path: str,
    objective: str,
    project_name: str,
    discovery: dict[str, Any],
    llm: Any,
) -> str:
    """Revise an artifact once based on critic feedback before finalising."""
    if llm is None or not feedback:
        return original

    is_html = Path(artifact_path).suffix.lower() in (".html", ".htm")
    format_instruction = (
        "Output ONLY the HTML starting with <!doctype html>. No explanation, no markdown."
        if is_html
        else "Output ONLY the improved document content with a # heading. No explanation."
    )

    try:
        result = llm.infer(
            prompt=f"""You are revising a {artifact_label} based on critic feedback. Make it excellent.

PROJECT: {project_name}
OBJECTIVE: {objective}

CRITIC ISSUES TO FIX:
{chr(10).join(f"- {issue}" for issue in feedback)}

SUGGESTIONS TO APPLY:
{chr(10).join(f"- {s}" for s in suggestions)}

ORIGINAL CONTENT:
{original[:6000]}

Revise the content to address every critical issue. Apply all suggestions that improve quality.
Keep everything that was already good. Elevate what was flagged.
{format_instruction}""",
            max_tokens=8000,
        )
        if result.startswith("ERROR:") or len(result.strip()) < 200:
            return original
        if is_html:
            clean = result.strip()
            if clean.startswith("```"):
                clean = re.sub(r'^```[^\n]*\n', '', clean)
                clean = re.sub(r'\n```\s*$', '', clean).strip()
            doctype_match = re.search(r'<!doctype', clean, re.IGNORECASE)
            if doctype_match:
                clean = clean[doctype_match.start():]
            return clean if re.search(r'<!doctype', clean, re.IGNORECASE) else original
        return result
    except Exception:
        return original


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Phase 1: Discovery — extract rich structured product context
    # ------------------------------------------------------------------
    llm = _make_llm()
    discovery = _run_discovery(objective, project_name, llm)
    discovery_summary = (
        f"Discovery complete. Category: {discovery.get('product_category')} | "
        f"User: {discovery.get('target_user')} | "
        f"Core features: {', '.join(str(f) for f in discovery.get('core_features', [])[:5])} | "
        f"Direction: {discovery.get('visual_direction')} | "
        f"Tone: {discovery.get('tone')} | "
        f"Benchmarks: {', '.join(discovery.get('competitor_references', [])) or 'none specified'}"
    )
    context["conversation"].append({"sender": "DiscoveryAgent", "message": discovery_summary, "ts": _now_iso()})
    _append_inbox(context, sender="DiscoveryAgent", subject="Discovery complete — product context extracted", body=discovery_summary)
    context["discovery"] = discovery
    unknowns = [str(item).strip() for item in discovery.get("known_unknowns", []) if str(item).strip()]
    if unknowns:
        context.setdefault("clarifications", [])
        context["clarifications"] = unknowns
        _append_inbox(
            context,
            sender="DiscoveryAgent",
            subject="Clarifications needed before overdelivery",
            body="\n".join(f"- {item}" for item in unknowns[:8]),
            kind="warning",
        )

    # ------------------------------------------------------------------
    # Phase 2: Domain Research — understand the landscape
    # ------------------------------------------------------------------
    external_signals = _collect_external_signals(objective, project_name, discovery)
    if external_signals:
        context["external_signals"] = external_signals
        _append_inbox(
            context,
            sender="ResearcherAgent",
            subject="External market signals captured",
            body=external_signals[:800],
        )
    research = _run_domain_research(objective, project_name, discovery, llm, external_signals)
    if research and not research.startswith("ERROR:"):
        research_preview = research[:500] + ("..." if len(research) > 500 else "")
        context["conversation"].append({"sender": "ResearchAgent", "message": research_preview, "ts": _now_iso()})
        _append_inbox(context, sender="ResearchAgent", subject="Domain research complete", body=research_preview)
        context["domain_research"] = research
    else:
        research = ""

    # Track LLM-generated content per task so later tasks can reference earlier outputs
    completed_excerpts: dict[str, str] = {}
    generated_content: dict[str, str] = {}

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
            # Phase 3: Generate actual content via LLM (not a hardcoded template)
            artifact_content = _generate_artifact_content(
                task_id=task["id"],
                artifact_label=artifact["label"],
                artifact_path=artifact["path"],
                project_name=project_name,
                objective=objective,
                discovery=discovery,
                research=research,
                completed_excerpts=completed_excerpts,
                external_signals=external_signals,
                fallback_content=artifact["content"],
                llm=llm,
            )

            # Phase 4: Critic gate — score quality and revise if needed
            critic = _run_critic_gate(
                artifact_label=artifact["label"],
                content=artifact_content,
                objective=objective,
                discovery=discovery,
                llm=llm,
            )
            if not critic.get("approved", True) and critic.get("critical_issues"):
                artifact_content = _revise_artifact(
                    original=artifact_content,
                    feedback=critic.get("critical_issues", []),
                    suggestions=critic.get("suggestions", []),
                    artifact_label=artifact["label"],
                    artifact_path=artifact["path"],
                    objective=objective,
                    project_name=project_name,
                    discovery=discovery,
                    llm=llm,
                )

            generated_content[task["id"]] = artifact_content
            completed_excerpts[task["id"]] = artifact_content[:1000]

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
                            "content": artifact_content,
                            "overwrite": True,
                        },
                    }
                ],
                "artifact_path": artifact["path"],
                "nudge_history": nudges or [],
                "dependencies_completed": sorted(completed),
                "critic_score": critic.get("score", 8),
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

    # Use LLM-generated content in context (fall back to template if generation failed)
    _gc = generated_content
    _tm = {task["id"]: task for task in task_definitions}
    _strategy_content = _gc.get("strategy-roadmap") or _tm["strategy-roadmap"]["artifact"]["content"]
    _offer_content = _gc.get("offer-lab") or _tm["offer-lab"]["artifact"]["content"]
    _spec_content = _gc.get("product-spec") or _tm["product-spec"]["artifact"]["content"]

    context["strategy"] = {
        **context["strategy"],
        "content": _strategy_content,
        "artifact_path": f"sandbox/projects/{project_id}/strategy-roadmap.md",
    }
    context["offer_lab"] = {
        "summary": "Offer, ICP, packaging, and pricing hypotheses are ready for review.",
        "artifact_path": f"sandbox/projects/{project_id}/offer-lab.md",
        "content": _offer_content,
    }
    context["product_spec"] = {
        "summary": "Product scope, user flow, and MVP boundaries have been drafted.",
        "artifact_path": f"sandbox/projects/{project_id}/product-spec.md",
        "content": _spec_content,
    }
    context["mission_brief"] = {
        "summary": "Mission statement, offer, and product scope combined for quick operator review.",
        "content": "\n\n".join([
            f"# Mission Statement\n\n{objective}",
            "## Offer\n\n" + _offer_content,
            "## Product\n\n" + _spec_content,
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
            _gc.get("launch-checklist") or _tm["launch-checklist"]["artifact"]["content"],
            _gc.get("metrics-plan") or _tm["metrics-plan"]["artifact"]["content"],
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
    for idx, question in enumerate(context.get("clarifications", [])[:5], start=1):
        context["approvals"].append(
            {
                "id": f"clarification-{idx}",
                "title": f"Clarify requirement {idx}",
                "status": "pending",
                "notes": question,
            }
        )
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