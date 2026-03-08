---
name: setting-up-tasks
description: >
  Use when the user says "setup headless tasks", "initialize task management",
  "configure notion tasks", "configure data source", or needs to set up a data source for the headless-tasks plugin.
---

# Headless Tasks — Setup Guide

You are guiding the user through the initial setup of the Headless Tasks plugin.

## Step 1: Check for Existing MCP Configuration

Inspect available MCP tools to detect any already-configured providers:
- `notion-*` tools present → Notion MCP is already configured
- `mcp__airtable__*` tools present → Airtable MCP is already configured
- SQLite/database tools present → SQLite is already configured

### If a single provider MCP is already present
Use AskUserQuestion to confirm:
> "I detected an existing [provider] MCP connection. Would you like to set up Headless Tasks using [provider]?"

If yes, skip to Step 3 with that provider.

### If multiple provider MCPs are present
Use AskUserQuestion to ask which one to use:
> "I detected multiple data source MCPs: [list providers]. Which one should I set up Headless Tasks for?"

Then skip to Step 3 with the selected provider.

### If no provider MCP is present
Continue to Step 2 to guide the user through MCP setup.

## Step 2: Choose a Data Source and Configure MCP

Use AskUserQuestion to ask which data source the user wants to use:
> "Which data source would you like to use for Headless Tasks?
> - **Notion** — recommended for teams, rich UI, free tier available
> - Other providers coming soon (SQLite, Airtable, etc.)"

Then guide MCP setup based on the environment:

### Determining the Environment

- **Claude Code**: `~/.claude/settings.json` exists or `CLAUDE_PLUGIN_ROOT` is set
- **Cowork**: Global Instructions / CLAUDE.md is accessible from the current context

### Claude Code — MCP Setup Instructions

Add the following to `~/.claude/settings.json` under `"mcpServers"`:

**Notion:**
```json
"notion": {
  "type": "http",
  "url": "https://mcp.notion.com/mcp"
}
```

After adding, authenticate by visiting `https://mcp.notion.com/mcp` in a browser and following the OAuth flow. Then restart Claude Code and run the setup skill again.

### Cowork — MCP Setup Instructions

**Notion:**
Open Cowork settings → MCP Servers → Add Server → Enter `https://mcp.notion.com/mcp`.
Authenticate with your Notion account when prompted. Then run the setup skill again.

## Step 3: Run Provider-Specific Setup

Once the active provider is confirmed, load and follow:

```
${CLAUDE_PLUGIN_ROOT}/skills/providers/{active_provider}/setup.md
```

This file contains all provider-specific database creation, schema initialization, and verification steps.

## Language

Always communicate with the user in the language they are using.
