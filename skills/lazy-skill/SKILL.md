---
name: lazy-skill
description: Browse and load skills on-demand from ~/.agents/lazy-skills without exposing every skill description to the base agent. Use when the user explicitly asks for a lazy skill or a capability that should be loaded only on demand.
argument-hint: [search query or blank to browse]
version: 1.1.0
---

# Lazy Skill Loader

On-demand skill loading to reduce routing ambiguity, not just context bloat.

Agent runtimes may use progressive disclosure, where the model initially sees only each installed skill's name, description, and path. That still creates semantic overload when many always-installed skills have overlapping descriptions. `lazy-skill` keeps the always-visible skill surface small and lets the user explicitly summon heavier or niche skills only when needed.

The canonical lazy skill library is `~/.agents/lazy-skills/`. `~/.claude/lazy-skills/` is a legacy fallback only.

## Index

Skills available for lazy loading (name: sparse keywords - short description):

- **taste-skill** [collection]: taste, frontend, imagegen - Anti-generic frontend design, image-to-code, and premium UI direction
- **shadcn-ui** [collection]: shadcn, components, registry - Official shadcn/ui component and registry workflow
- **next-skills** [collection]: nextjs, rsc, cache - Next.js best practices, upgrades, and Cache Components
- **vercel-agent-skills** [collection]: react, vercel, performance - Vercel React/Next/RN performance and composition guidance
- **callstack-react-native-skills** [collection]: react-native, callstack, mobile - React Native performance, upgrades, brownfield, and CI artifacts
- **expo-skills** [collection]: expo, eas, mobile - Expo SDK, EAS, dev-client, deployment, modules, and native UI workflows
- **wshobson-agents** [collection]: patterns, architecture, mobile - Broad engineering pattern library including React Native design and architecture
- **threejs-skills** [collection]: threejs, 3d, webgl, graphics - "Three.js skills for 3D graphics (10 skills)"

<!-- Add more entries:
- **name**: keyword1, keyword2 - "Brief description"
- **name** [collection]: keywords - "Description" (for skill repos with multiple skills)
-->

Keep this index sparse. It is a card catalog, not mini documentation. Avoid long trigger lists, exhaustive "use when" rules, or overlapping descriptions that recreate the same routing noise this skill is meant to avoid.

## Behavior

### On Invocation

1. If `$ARGUMENTS` provided, filter index to matching keywords
2. If blank, show full index
3. **Always ask user** which skill to load before reading - never read all skills
4. Use Read tool to load the selected skill file

### Path Resolution

Resolve the lazy skills root in this order:

1. `$AGENTS_LAZY_SKILLS_DIR`, if set
2. `~/.agents/lazy-skills`
3. `~/.claude/lazy-skills` (legacy fallback)

**Single skills** - try in order:
1. `<lazy-root>/<name>.md`
2. `<lazy-root>/<name>/SKILL.md`

**Collections** (marked with `[collection]` in index):
1. Read `<lazy-root>/<name>/README.md` to show available skills
2. Ask user which specific skill to load
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

**Single skill:**
```
User: /lazy-skill stripe

Claude: Found 1 matching skill:
- **stripe**: payments, billing, checkout - "Stripe API operations"

Want me to load it?

User: yes

Claude: [Reads ~/.agents/lazy-skills/stripe.md]
Loaded stripe skill. What would you like to do?
```

**Collection:**
```
User: /lazy-skill threejs

Claude: Found 1 matching collection:
- **threejs-skills** [collection]: threejs, 3d, webgl - "Three.js skills (10 skills)"

Want me to show the available skills in this collection?

User: yes

Claude: [Reads ~/.agents/lazy-skills/threejs-skills/README.md]

Available skills in threejs-skills:
| Skill | Description |
|-------|-------------|
| threejs-fundamentals | Scene setup, cameras, renderer |
| threejs-geometry | Shapes, BufferGeometry, instancing |
| threejs-materials | PBR, shader materials |
... (7 more)

Which one should I load?

User: fundamentals

Claude: [Reads ~/.agents/lazy-skills/threejs-skills/skills/threejs-fundamentals/SKILL.md]
Loaded threejs-fundamentals. Ready to help with Three.js scene setup.
```

<instructions>$ARGUMENTS</instructions>
