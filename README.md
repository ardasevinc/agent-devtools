# Agent Devtools UX Set

My personal AI Agent devtools/dev UX set.

## Contents

- **skills/** - Custom Claude Code skills (mattermost-cli, etc.)
- **claudecode/** - Claude Code customizations

## Statusline

Custom statusline for Claude Code CLI showing hostname, directory, git status, context usage, and time.

```
macbook │ anthropics/claude-code │ ⎇ main*↑1 │ ctx:52% │ 30.01.2026 16:00
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
- **Time**: dd.mm.yyyy HH:MM format
