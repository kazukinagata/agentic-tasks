---
name: detecting-provider
description: Detects the active data source provider and retrieves configuration (database IDs, constants). Internal shared skill — not for direct user invocation.
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
If no provider MCP is found at all, inform the user they need to run the **setting-up-tasks** skill first to configure a data source, then stop.

## Environment Detection

After detecting the provider, also determine the execution environment and set `execution_environment` as a conversation context variable.
**Skip if already set in this conversation.**

Detection logic:
1. If environment variable `CLAUDE_CODE_IS_COWORK` is `1` → `execution_environment = "cowork"`
2. Otherwise → `execution_environment = "claude-code"`

(`CLAUDECODE=1` is common to both environments, so it is not used for detection.)

This value is used by downstream skills (executing-tasks, managing-tasks, etc.) for execution flow branching.

## Config Retrieval

After detecting the provider, retrieve database IDs and constants from the Config page.
**Skip if `headless_config` is already set in this conversation.**

### Notion Provider

1. Search for the "Headless Tasks Config" page using `notion-search`
2. Retrieve the page body using `notion-fetch`
3. Parse the JSON code block and set the following as the `headless_config` session variable:
   - `tasksDatabaseId` (required)
   - `teamsDatabaseId` (optional)
   - `projectsDatabaseId` (optional)
   - `sprintsDatabaseId` (optional — exists after setting-up-scrum)
   - `maxConcurrentAgents` (optional — default: 3)

If the Config page is not found, instruct the user to run the setting-up-tasks skill, then stop.

## Constants

Constants shared across skills. All skills that go through detecting-provider reference these values.

| Constant | Value | Purpose |
|--------|-----|------|
| `stallThresholdMultiplier` | 4 | Stall detection: elapsed hours > Complexity Score × this value |
| `stallDefaultHours` | 24 | Default stall threshold (hours) when Complexity Score is not set |
