---
name: provider-detection
description: Internal shared skill loaded by task-agent, task-manage, and task-view to determine the active data source provider. Not intended for direct user invocation.
user-invocable: false
---

# Headless Tasks — Provider Detection

Determine the active provider using the following layered check.
**Skip if already determined in this conversation.**

## Layer 1: MCP Tool Auto-Detection
Inspect which MCP tools are available:
- `notion-*` tools present → active_provider = **notion**
- `mcp__airtable__*` tools present → active_provider = **airtable**
- SQLite/database tools present → active_provider = **sqlite**

If exactly one provider MCP is detected, use it. Load
`${CLAUDE_PLUGIN_ROOT}/skills/providers/{active_provider}/SKILL.md` if available, then continue.

## Layer 2: Conflict Resolution (multiple provider MCPs detected)
If multiple provider MCPs are detected, determine the environment:
- **Claude Code**: Check `env.HEADLESS_TASKS_PROVIDER` in `~/.claude/settings.json`
- **Cowork / Global Instructions**: Look for `HEADLESS_TASKS_PROVIDER: <value>` in the Global Instructions or CLAUDE.md

If a value is found, use it as active_provider and load the corresponding provider SKILL.md.

## Layer 3: Ask User
If provider is still undetermined, use AskUserQuestion:
> "Multiple data source MCPs are available. Which provider should I use for headless-tasks? Available: [list detected providers]"

## No MCP Detected
If no provider MCP is found at all, inform the user they need to run the **task-setup** skill first to configure a data source, then stop.
