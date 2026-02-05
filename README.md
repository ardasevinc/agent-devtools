# Agent Devtools UX Set

My personal AI Agent devtools/dev UX set.

## Skills Catalog

Custom skills for Claude Code that extend its capabilities.

| Skill | Description | Trigger Examples |
|-------|-------------|------------------|
| **interview** | Socratic interviewer for requirements elicitation. Probes blind spots, challenges assumptions, synthesizes understanding. | `/interview auth system`, "help me think through this feature", vague requirements |
| **lazy-skill** | On-demand skill loader to reduce context bloat. Browse and load skills from `~/.claude/lazy-skills/` only when needed. | `/lazy-skill`, `/lazy-skill docker` |
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
macbook │ anthropics/claude-code │ ⎇ main*↑1 │ ctx:52% │ opus-4.5 │ 20260130 16:00
```

### Setup

Requires [Bun](https://bun.com) runtime.

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
- **Time**: yyyymmdd HH:MM format

---

## Task List Picker

Interactive fzf picker to browse and resume Claude Code sessions by their task lists. Launches Claude with `CLAUDE_CODE_TASK_LIST_ID` set, enabling task sharing/resumption across sessions.

```
agent-devtools (3 tasks) - 2h ago    │ ✓ Add skills catalog to README
vyvo-app (12 tasks) - 1d ago         │ → Implement auth flow
mattermost-cli (5 tasks) - 3d ago    │ ○ Add rate limiting
```

### Setup

Requires [Bun](https://bun.com) and [fzf](https://github.com/junegunn/fzf).

```bash
# Add to PATH
ln -sf /path/to/agent-devtools/claudecode/claude-tasks.ts ~/.local/bin/claude-tasks

# Make executable
chmod +x ~/.local/bin/claude-tasks
```

### Usage

```bash
claude-tasks              # Pick a task list, launches claude
claude-tasks --resume     # Pass flags through to claude
```

### Features

- **Project detection**: Resolves project path from session files
- **Task preview**: Shows tasks with status (✓ done, → in progress, ○ pending)
- **Recency sorting**: Most recent sessions first
- **Seamless launch**: Opens Claude in the correct directory with task context

---

## Lazy Skill System

Reduce context bloat by loading skills on-demand instead of always injecting them. Skills in `~/.claude/lazy-skills/` are only read when you invoke `/lazy-skill`.

### Setup

```bash
# Create the lazy skills directory
mkdir -p ~/.claude/lazy-skills

# Install the meta-skill
bunx skills add https://github.com/ardasevinc/agent-devtools --skill lazy-skill
```

### Adding Lazy Skills

1. Place skill file at `~/.claude/lazy-skills/<name>.md` or clone a skill repo to `~/.claude/lazy-skills/<name>/`
2. Edit the index in the installed skill (`~/.claude/skills/lazy-skill/SKILL.md`):

```markdown
## Index
- **skillname**: keyword1, keyword2 - "Brief description"
- **reponame** [collection]: keywords - "Description"  # for skill repos
```

### Supported Structures

```
~/.claude/lazy-skills/
├── stripe.md                    # single file
├── dokploy/                     # single skill repo
│   └── SKILL.md
└── threejs-skills/              # skill collection (multiple skills)
    ├── README.md                # shows available skills
    └── skills/
        ├── threejs-fundamentals/
        │   └── SKILL.md
        └── ...
```

- **Single skills**: auto-detects `<name>.md` or `<name>/SKILL.md`
- **Collections**: mark with `[collection]` in index, reads README first
