---
name: lazy-skill
description: Browse and load skills on-demand from ~/.claude/lazy-skills/. Use when you need a skill that isn't always loaded.
argument-hint: [search query or blank to browse]
version: 1.0.0
---

# Lazy Skill Loader

On-demand skill loading to reduce context bloat. Skills in `~/.claude/lazy-skills/` are only read when explicitly requested.

## Index

Skills available for lazy loading (name: keywords - description):

- **dokploy**: docker, paas, deploy, compose - "Self-hosted PaaS for docker-compose deployments"

<!-- Add more entries as needed:
- **name**: keyword1, keyword2 - "Brief description"
-->

## Behavior

### On Invocation

1. If `$ARGUMENTS` provided, filter index to matching keywords
2. If blank, show full index
3. **Always ask user** which skill to load before reading - never read all skills
4. Use Read tool to load the selected skill file

### Path Resolution (Auto-detect)

Try paths in order:
1. `~/.claude/lazy-skills/<name>.md` (single file)
2. `~/.claude/lazy-skills/<name>/SKILL.md` (cloned skill repo)

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
- `~/.claude/lazy-skills/skillname.md` (single file)
- `~/.claude/lazy-skills/skillname/SKILL.md` (full skill folder, e.g., cloned repo)

## Example

```
User: /lazy-skill docker

Claude: Found 1 matching skill:
- **dokploy**: docker, paas, deploy, compose - "Self-hosted PaaS for docker-compose deployments"

Want me to load dokploy?

User: yes

Claude: [Reads ~/.claude/lazy-skills/dokploy.md]
Loaded dokploy skill. I now have knowledge about Dokploy deployments. What would you like to do?
```

<instructions>$ARGUMENTS</instructions>
