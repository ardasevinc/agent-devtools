---
name: lazy-skill
description: Browse and load skills on-demand from ~/.agents/lazy-skills without exposing every skill description to the base agent. Use when the user explicitly asks for a lazy skill or a capability that should be loaded only on demand.
argument-hint: [search query or blank to browse]
version: 1.2.4
---

# Lazy Skill Loader

On-demand skill loading to reduce routing ambiguity, not just context bloat.

Agent runtimes may use progressive disclosure, where the model initially sees only each installed skill's name, description, and path. That still creates semantic overload when many always-installed skills have overlapping descriptions. `lazy-skill` keeps the always-visible skill surface small and lets the user explicitly summon heavier or niche skills only when needed.

The canonical lazy skill library is `~/.agents/lazy-skills/`. `~/.claude/lazy-skills/` is a legacy fallback only.

## Index

Skills available for lazy loading (name: sparse keywords - short description):

- **axiom** [collection]: apple, healthkit, swift, xcode - Apple platform development, diagnostics, testing, and native APIs
- **emil-kowalski** [collection]: design, animation, expo, swift - Emil Kowalski’s web/native design engineering and motion guidance
- **impeccable**: design, critique, typography, layout - Interface design and refinement with supporting on-demand tooling
- **taste-skill** [collection]: taste, frontend, imagegen - Anti-generic frontend design, image-to-code, and premium UI direction
- **shadcn-ui** [collection]: shadcn, components, registry - Official shadcn/ui component and registry workflow
- **next-skills** [collection]: nextjs, rsc, cache - Next.js best practices, upgrades, and Cache Components
- **vercel-agent-skills** [collection]: react, vercel, performance - Vercel React/Next/RN performance and composition guidance
- **callstack-react-native-skills** [collection]: react-native, callstack, mobile - React Native performance, upgrades, brownfield, and CI artifacts
- **expo-skills** [collection]: expo, eas, mobile - Expo SDK, EAS, dev-client, deployment, modules, and native UI workflows
- **swiftui-pro**: swiftui, ios, apple - Modern SwiftUI review and implementation guidance
- **swift-concurrency-pro**: swift, concurrency, async - Swift concurrency correctness and migration guidance
- **swift-testing-pro**: swift, testing, xctest - Swift Testing patterns, reviews, and XCTest migration
- **swiftdata-pro**: swiftdata, persistence, cloudkit - SwiftData modeling, predicates, migrations, and CloudKit
- **app-store-connect-cli-skills** [collection]: appstoreconnect, asc, testflight - asc CLI workflows for App Store shipping
- **wshobson-agents** [collection]: patterns, architecture, mobile - Broad engineering pattern library including React Native design and architecture
- **astro**: astro, ssr, islands - Astro project and framework guidance
- **cloudflare-skills** [collection]: cloudflare, workers, pages - Official Cloudflare Workers, Pages, storage, Wrangler, and platform guidance
- **cloudflare-opennext**: opennext, cloudflare, pages - Deploy OpenNext applications on Cloudflare
- **payload-skills** [collection]: payload, cms, migrations - Payload CMS development and migration guidance
- **remotion-skills** [collection]: remotion, video, react - Remotion video creation best practices
- **inference-video-skills** [collection]: video, generation, storyboard - Curated video generation, storyboard, ad spec, and render workflows
- **mattpocock-skills** [collection]: prd, tdd, diagnose - Matt Pocock's engineering, productivity, writing, and workflow skills
- **bun-runtime**: bun, runtime, test - Bun runtime, package manager, bundler, and test runner guidance
- **hono**: hono, api, middleware - Hono API, routing, middleware, testing, and Cloudflare-style app guidance
- **golang-skills** [collection]: go, golang, backend - Go style, testing, concurrency, performance, security, and production patterns
- **rust-skills** [collection]: rust, cargo, systems - Rust ownership, errors, concurrency, unsafe review, ecosystem, and domain patterns
- **architecture-wise-tree** [collection]: architecture, ddd, system-design - Durable architecture, DDD, ADR, refactoring, and system-design judgment
- **quality-constitution**: quality, mutation, complexity - Agent-operable quality gates for duplication, CRAP risk, mutation, and review queues
- **ardasevinc** [collection]: dashboard, ux, ops, research - Arda's custom lazy skills, including dense dashboard UX review

<!-- Add more entries:
- **name**: keyword1, keyword2 - "Brief description"
- **name** [collection]: keywords - "Description" (for skill repos with multiple skills)
-->

Keep this index sparse. It is a card catalog, not mini documentation. Avoid long trigger lists, exhaustive "use when" rules, or overlapping descriptions that recreate the same routing noise this skill is meant to avoid.

## Behavior

### On Invocation

- Use `$ARGUMENTS` and the current task to find the requested skill. If the user named it or the intended match is clear, read it immediately; do not ask for confirmation to load it.
- For browsing without a task or query, show the index. Ask which skill to load only when the choice remains materially ambiguous.
- Read only the selected skill and the discovery material needed to find it, never all skill bodies.

### Path Resolution

Resolve the lazy skills root in this order:

1. `$AGENTS_LAZY_SKILLS_DIR`, if set
2. `~/.agents/lazy-skills`
3. `~/.claude/lazy-skills` (legacy fallback)

**Single skills** - try in order:
1. `<lazy-root>/<name>.md`
2. `<lazy-root>/<name>/SKILL.md`

**Collections** (marked with `[collection]` in index):
1. If the requested member is already identifiable, resolve it directly. Otherwise, read `<lazy-root>/<name>/README.md` to discover the available skills.
2. Select the member that clearly matches the request or current task. If several remain plausible, show the relevant choices and ask which one the user means.
3. Resolve the selected skill by either:
   - folder path: `<lazy-root>/<name>/skills/<skill-name>/SKILL.md`
   - frontmatter name: recursively search `<lazy-root>/<name>/**/SKILL.md` for `name: <skill-name>`
4. Read the resolved `SKILL.md`

### After Loading

- Skill content is now in context
- Follow the loaded skill's instructions
- No separate "invoke" step - it's just knowledge now

## Adding Skills to Index

Edit this file's Index section:
```markdown
- **skillname**: keyword1, keyword2, keyword3 - "One-line description"
```

Then place the skill file at either:
- `~/.agents/lazy-skills/skillname.md` (single file)
- `~/.agents/lazy-skills/skillname/SKILL.md` (full skill folder, e.g., cloned repo)
- or a custom root via `$AGENTS_LAZY_SKILLS_DIR`

## Examples

**Named skill:**
```
User: /lazy-skill swiftui-pro, review this view

Agent: [Reads ~/.agents/lazy-skills/swiftui-pro/SKILL.md]
[Uses the loaded guidance to review the view.]
```

**Collection with a clear task:**
```
User: /lazy-skill cloudflare, help me configure Wrangler

Agent: [Reads ~/.agents/lazy-skills/cloudflare-skills/README.md]
[Selects and reads wrangler/SKILL.md, then helps configure Wrangler.]
```

**Collection browsing without a task:**
```
User: /lazy-skill cloudflare

Agent: [Reads ~/.agents/lazy-skills/cloudflare-skills/README.md]
Available skills include Wrangler (CLI configuration), Durable Objects,
and Workers best practices. Which one would you like to load?

User: wrangler

Agent: [Reads ~/.agents/lazy-skills/cloudflare-skills/skills/wrangler/SKILL.md]
Loaded wrangler.
```

<instructions>$ARGUMENTS</instructions>
