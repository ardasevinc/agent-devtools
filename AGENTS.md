# Agent Guide

AI agent devtools - custom skills, Claude Code integrations, and related tooling.

## Directory Layout

```
agent-devtools/
├── AGENTS.md           # You are here
├── CLAUDE.md           # Project instructions (includes this file)
├── README.md           # Human-facing overview
├── claudecode/         # Claude Code customizations
│   └── statusline.ts   # Custom statusline script (bun)
├── skills/             # Custom skills for Claude Code
│   └── <skill-name>/
│       └── SKILL.md    # Skill definition
└── .claude/
    └── settings.local.json
```

## Skills System

### Skill Structure

Each skill lives in `skills/<skill-name>/` with a `SKILL.md` file:

```markdown
---
name: skill-name
description: Trigger phrases - when user says X, Y, or Z
version: 1.0.0
---

# Skill Name

Brief description of what this skill does.

## When to Invoke Immediately
Explicit triggers - auto-invoke on these.

## When to Suggest (Don't Auto-Invoke)
Implicit triggers - ask user first.

## Prerequisites
Requirements, setup commands.

## Commands
Usage examples organized by task.

## Error Handling
Common errors and solutions.

## When NOT to Use
Negative cases to avoid false triggers.

## Example Workflows
Real scenarios showing the skill in action.
```

### Invoke vs Suggest

**Invoke immediately** when user explicitly asks for the skill's function:
- "check my mattermost messages" → invoke mattermost-cli
- User provides clear intent

**Suggest first** when context implies the skill might help:
- "I remember someone mentioned this in chat" → offer to check mattermost
- Say "want me to check X?" - don't auto-invoke

### Adding a New Skill

1. Create directory: `skills/<skill-name>/`
2. Add `SKILL.md` with frontmatter (name, description, version)
3. Include: invoke triggers, suggest triggers, prerequisites, commands, errors, negative cases
4. Test the skill manually before committing

## Claude Code Integration

`claudecode/` contains customizations for Claude Code CLI:

### statusline.ts

Custom statusline showing:
- Hostname
- Current directory (last 2 path components)
- Git info: branch, worktree indicator (⎇), dirty (*), ahead (↑n), behind (↓n)
- Context usage percentage (parsed from session JSONL)
- Model name (e.g., opus-4.5, sonnet-4)
- DateTime (dd.mm.yyyy HH:MM)

**Setup:** Symlink to `~/.claude/statusline.ts` and configure in settings:
```json
"statusLine": {
  "type": "command",
  "command": "bun ~/.claude/statusline.ts",
  "padding": 0
}
```

**Dependencies:** Bun runtime

## Conventions

### Git Commits

Use conventional commits:
- `feat:` new feature or skill
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code restructuring

Include scope when relevant: `feat(mattermost-cli): add relative time`

### Documentation

- Keep skill docs practical - focus on when/how to use
- Include negative cases ("when NOT to use")
- Tables for quick reference
- Real command examples, not pseudocode
