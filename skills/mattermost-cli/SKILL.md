---
name: mattermost-cli
description: This skill should be used when the user asks to "check my mattermost messages", "fetch DMs", "what did X say", "check messages from coworker", "read mattermost", or mentions mattermost conversations, chat history, or finding tasks mentioned in chat.
version: 1.0.0
---

# Mattermost CLI

Fetch and display Mattermost messages using the `mm` command. Output is automatically redacted for safe LLM processing.

## When to Invoke Immediately

Trigger this skill when the user explicitly:
- Asks to check/read/fetch their Mattermost messages or DMs
- Wants to see what someone said ("what did alice say about X")
- Needs to find tasks or action items from chat
- References a conversation they had on Mattermost

## When to Suggest (Don't Auto-Invoke)

Offer to use this skill when:
- User mentions a task "from chat" without specifying Mattermost
- User is looking for context that might be in messages
- You need message history to understand a task better

Say: "want me to check your Mattermost messages for context?" - don't auto-invoke.

## Prerequisites

The `mm` CLI must be installed and configured:

```bash
# Test if working
mm channels
```

If it fails, user needs to set `MM_URL` and `MM_TOKEN` (env vars or `.env` file).

## Commands

### List DM Channels
```bash
mm channels              # Pretty output - who have I chatted with?
mm channels --json       # Structured output
```

### Fetch Messages
```bash
mm dms                        # All DMs, last 7 days
mm dms -u <username>          # From specific user
mm dms -u alice -u bob        # Multiple users
mm dms --since 24h            # Last 24 hours
mm dms --since 30d --limit 100  # More history
mm dms --json                 # For parsing
```

### Quick Reference

| Task | Command |
|------|---------|
| Recent messages | `mm dms --since 24h` |
| From specific person | `mm dms -u alice` |
| All channels list | `mm channels` |
| JSON for processing | `mm dms --json` |
| Extended history | `mm dms --since 30d --limit 200` |

## Output Formats

| Context | Format | Use Case |
|---------|--------|----------|
| Terminal (TTY) | Pretty | Reading directly |
| Piped/non-TTY | Markdown | Passing to tools |
| `--json` flag | JSON | Parsing, analysis |

## Security

**All secrets are automatically redacted:**
- API keys, tokens, passwords, JWTs
- Connection strings
- Credentials in config snippets

Example: `ghp_abc123xyz789secret` → `ghp_...cret`

Output is safe to include in context or pass to other LLMs.

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Mattermost URL required" | `MM_URL` not set | `export MM_URL="https://..."` or add to `.env` |
| "Mattermost token required" | `MM_TOKEN` not set | `export MM_TOKEN="..."` or add to `.env` |
| "Could not find DM channel" | User doesn't exist or no DM history | Check username spelling |
| Connection errors | Network/server issues | Verify URL is correct and accessible |

## When NOT to Use

- User is asking about Slack, Discord, or other chat platforms
- User wants to *send* messages (this is read-only)
- User needs real-time notifications (this is one-shot fetch)

## Example Workflows

### "What did Alice say about the deployment?"
```bash
mm dms -u alice --since 7d
```
Then grep or scan output for deployment-related content.

### "Check my recent messages for any tasks"
```bash
mm dms --since 24h
```
Review output for action items, requests, or TODOs.

### "Get context from a specific conversation"
```bash
mm dms -u bob --limit 50 --json > /tmp/bob-chat.json
```
Parse JSON for relevant context to include in your response.
