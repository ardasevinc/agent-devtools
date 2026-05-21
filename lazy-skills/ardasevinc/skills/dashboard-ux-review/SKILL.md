---
name: dashboard-ux-review
description: Review dense SaaS, ops, security, observability, admin, or compliance dashboards with evidence-first UX and design findings. Use when the user asks to improve dashboard readability, information density, tables, filters, charts, freshness, or operational workflows.
version: 1.0.0
---

# Dashboard UX Review

Browser-first, evidence-first dashboard review for dense operational tools. The goal is prioritized, concrete UX/design findings, not redesign theater.

## When To Use

Use this for dashboards and workbenches where users inspect real operational state:
- security posture, findings, exceptions, evidence, audit trails
- fleet, infrastructure, backups, incidents, alerts, deploys, observability
- admin, compliance, internal ops, support, or inventory surfaces
- table-heavy or filter-heavy SaaS screens

Do not use this for landing pages, brand systems, speculative product strategy, or implementation unless the user explicitly asks for those.

## Review Stance

- Inspect the real surface first: local app, browser, screenshots, repo, data fixtures, or Figma.
- Prefer actual evidence over vibes: URL, screenshot path, viewport, command output, DOM/a11y observation, or file reference.
- Separate triage/status surfaces from investigation/data-grid surfaces.
- Treat density as a usability requirement, not a visual flaw.
- Avoid decorative dashboard instincts: large metric cards, charts, gradients, and hero composition must earn their pixels.
- Do not invent backend/product state. Mark unknowns and ask only when a wrong assumption would change the review.

## Inputs To Establish

Collect these from context when possible. Ask briefly only when missing data would make the review misleading.

- Product/domain and target operator
- Primary workflow: triage, investigation, audit, remediation, reporting, management
- Artifact: URL, screenshot, design file, repo path, or existing implementation
- Data realism: empty, fixture, production-like, production
- Viewport/device and theme
- Risk focus: accessibility, readability, performance, data trust, tables, filters, incident use
- Output preference: quick verdict, prioritized findings, or implementation plan

## Workflow

1. Open or inspect the real dashboard.
2. Map the main regions: nav, filters, summary, tables/grids, charts, drawers, detail panes, actions, status banners.
3. Ask the operator questions the UI must answer:
   - What is happening?
   - What changed?
   - What matters most?
   - What is stale, partial, failed, unauthorized, or unknown?
   - What can I safely do next?
   - Can I trust this data?
4. Review information architecture and hierarchy:
   - first viewport priority
   - scan path
   - grouping and labels
   - visible scope, time range, source, refresh state, and active filters
5. Review density and tables:
   - stable columns, row height, alignment, wrapping, truncation, copy affordances
   - sorting, pagination, hidden defaults, result counts, saved/shareable views
   - table vs interactive grid semantics
6. Review filters and query state:
   - visible active filters
   - reset path
   - understandable boolean/range/exact logic
   - no hidden operator-hostile defaults
7. Review states:
   - empty, loading, refreshing, stale, partial, failed, unauthorized, filtered-out
   - live updates that do not steal focus or reorder content mid-action
8. Review trust and ops semantics:
   - last checked, source, evidence path, actor, audit log, ownership, severity, confidence, freshness
   - unknowns are explicit, not rendered as success or zero
   - mutating actions are visually distinct from inspection
9. Review accessibility basics:
   - keyboard path, focus visibility/order, labels, contrast, color-not-alone, status announcements
   - native table semantics unless an actual grid interaction model is needed
10. Produce prioritized findings with concrete fixes.

## Findings Format

Lead with the highest-severity issues. Keep each finding compact and actionable.

```markdown
## Verdict
One short paragraph: what works, what blocks operator confidence, and the main design direction.

## Findings

### High - Finding title
- Location: page/region/component
- Evidence: screenshot, URL, selector, file, or observation
- Issue: what the user experiences
- Why it matters: operational/user risk
- Fix: concrete design or implementation change

## Workflow Gaps
- Missing state, action, or transition that affects real use.

## Verification Checklist
- Browser/viewports checked
- Data volume/state checked
- Keyboard/a11y checks performed
- Remaining unknowns
```

Severity guide:
- `Critical`: can cause unsafe action, hidden incident/security state, inaccessible core workflow, or severe data mistrust.
- `High`: blocks triage/investigation, hides important state, or makes common workflows error-prone.
- `Medium`: slows scanning, comparison, or recovery, but has a workaround.
- `Low`: polish, consistency, or minor comprehension issue.

## Dense Dashboard Checklist

- The first viewport answers scope, source, time range, last refresh, active filters, and current priority.
- Triage status is not buried under full inventory.
- Severity, confidence, freshness, ownership, and remediation state are distinct.
- Unknown, stale, failed, unauthorized, not configured, not scanned, and filtered-out states are explicit.
- Active filters and sort order are visible near the result set.
- Result counts, pagination, and page size are clear.
- Long hostnames, IDs, paths, IPs, URLs, and evidence refs remain readable or copyable.
- Tables use semantic markup for ordinary tabular data.
- Interactive grids implement a real keyboard model if used.
- Sortable headers expose visible and programmatic sort state.
- Status does not rely on color alone.
- Mutating controls are separated from navigation/inspection controls.
- Evidence and audit details are one click away without destroying investigation context.
- Live refresh preserves orientation and avoids row jumps while acting.
- Empty and error states explain cause, impact, and next step.

## References

Use these as review lenses, not as citation wallpaper:

- Vault reference: `/Users/arda/Documents/obsidian/obsidian-main/reference/tech/dense-dashboard-ux-guidelines.md`
- WCAG 2.2, especially contrast, keyboard access, focus, target size, labels, errors, and status messages
- WAI-ARIA APG table/grid/sortable table patterns
- GOV.UK Service Manual and Design System for plain task-oriented services
- IBM Carbon data table guidance
- Atlassian Dynamic Table and Lozenge patterns
- Material data table guidance
- Nielsen Norman usability heuristics
- Grafana, Datadog, Elastic, and Google SRE monitoring guidance for ops dashboards

## Output Rules

- Prefer fewer, sharper findings over a long taste dump.
- Include evidence for every non-obvious claim.
- If the dashboard is beautiful but operationally ambiguous, say that plainly.
- If the UI needs pagination, query state, freshness, table semantics, or state modeling before polish, say so.
- Do not propose a total redesign unless the evidence proves incremental fixes cannot resolve the core workflow.

<instructions>$ARGUMENTS</instructions>
