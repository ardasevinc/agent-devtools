# Agent Devtools UX Set

My personal AI Agent devtools/dev UX set.

## Skills Catalog

Custom skills for Claude Code that extend its capabilities.

| Skill | Description | Trigger Examples |
|-------|-------------|------------------|
| **interview** | Socratic interviewer for requirements elicitation. Probes blind spots, challenges assumptions, synthesizes understanding. | `/interview auth system`, "help me think through this feature", vague requirements |
| **mattermost-cli** | Fetch and search Mattermost messages. Auto-redacts secrets for safe LLM processing. Requires [`mattermost-cli`](https://github.com/ardasevinc/mattermost-cli). | "check my messages", "what did alice say about X", `/mattermost` |

### Installation

```bash
bunx skills add https://github.com/ardasevinc/agent-devtools --skill <skill-name>
# also works: npx skills add ... / pnpx skills add ...
```

**mattermost-cli** also requires the CLI tool: `bun i -g mattermost-cli` (or npm/pnpm) ([npm](https://www.npmjs.com/package/mattermost-cli))

---

## Statusline

Custom statusline for Claude Code CLI showing hostname, directory, git status, context usage, model, and time.

```
macbook │ anthropics/claude-code │ ⎇ main*↑1 │ ctx:52% │ opus-4.5 │ 30.01.2026 16:00
```

### Setup

Requires [Bun](https://bun.sh) runtime.

```bash
# Symlink to Claude config
ln -sf /path/to/agent-devtools/claudecode/statusline.ts ~/.claude/statusline.ts

# Add to ~/.claude/settings.json
```

```json
{
  "statusLine": {
    "type": "command",
    "command": "bun ~/.claude/statusline.ts",
    "padding": 0
  }
}
```

### Features

- **Hostname**: Machine name
- **Directory**: Last 2 path components
- **Git**: Branch, worktree (⎇), dirty (*), ahead (↑n), behind (↓n)
- **Context**: Usage percentage from session files
- **Model**: Current Claude model (opus-4.5, sonnet-4, etc.)
- **Time**: dd.mm.yyyy HH:MM format
