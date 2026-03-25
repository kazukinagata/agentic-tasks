> **This repository has been archived.** Development continues at [waggle](https://github.com/kazukinagata/waggle).

# Agentic Tasks

AI-native task management plugin for [Claude Code](https://claude.ai/code) and [Cowork](https://cowork.com). Manage tasks through natural language, visualize them in real-time HTML views, and execute them autonomously with parallel agent orchestration.

## Features

- **Natural Language CRUD** — Create, update, query, and delete tasks by talking to Claude
- **Real-time Views** — Kanban, List, Calendar, and Gantt views served locally at `http://localhost:3456` with live updates via SSE (Claude Code)
- **Autonomous Execution** — Dispatch tasks to parallel tmux sessions (Claude Code) or Scheduled Tasks (Cowork)
- **Daily Routine** — Unified daily message intake + task refinement + dispatch (Claude Code and Cowork)
- **Message Intake** — Auto-convert Slack/Teams DMs into categorized tasks
- **Provider Abstraction** — Pluggable data source layer (Notion supported, more planned)

## Quick Start

### Prerequisites

- [Claude Code](https://claude.ai/code) CLI (v1.0.33+) or [Cowork](https://claude.com/cowork) (Pro / Max / Team / Enterprise)
- A [Notion](https://www.notion.so/) account (free tier works)

### Install the Plugin

#### Claude Code (CLI / VS Code / Desktop)

1. Add the marketplace:

   ```
   /plugin marketplace add kazukinagata/agentic-tasks
   ```

2. Install the plugin:

   ```
   /plugin install agentic-tasks@kazukinagata-agentic-tasks
   ```

   You can also browse it interactively — run `/plugin`, go to the **Discover** tab, and select **agentic-tasks**.

#### Cowork

1. Open the Cowork tab in Claude Desktop
2. Click **Customize** in the left sidebar
3. Click **Browse plugins** and search for **agentic-tasks**, then click **Install**

   Alternatively, upload the plugin file directly if you have it locally.

### Connect Notion

After installing the plugin, you need to connect a Notion workspace as the data source.

1. Run the setup skill:

   ```
   /setting-up-tasks
   ```

2. The skill auto-detects whether a Notion MCP connection already exists.
   - **If not configured**: it will guide you through adding the Notion MCP server and authenticating via OAuth.
   - **If already configured**: it will skip straight to database creation.

3. Follow the prompts to create the Tasks database in your Notion workspace.

> **Cowork users**: The setup skill also offers to register a daily routine as a Scheduled Task that automatically ingests messages and dispatches tasks each morning.

## Usage

### Task Management

| Command | Description |
|---------|-------------|
| "add a task to fix the login bug" | Create a new task |
| "what's next?" | Get the highest-priority ready task |
| "my tasks" | Show all tasks assigned to you |
| "mark login task as done" | Update task status |
| "delegate API task to Alice" | Reassign a task |

### Views

| Command | Description |
|---------|-------------|
| "show kanban" | Open Kanban board in browser |
| "list view" | Open List view in browser |
| "gantt" / "calendar" | Open Gantt or Calendar view in browser |

### Execution

| Command | Description |
|---------|-------------|
| "execute tasks" | Dispatch ready tasks for execution |
| "do the next task" | Execute the top-priority task |
| "daily tasks" | Run daily routine: message intake + task refinement + dispatch |

### Message Intake

| Command | Description |
|---------|-------------|
| "process messages" | Convert unread DMs into tasks |

## Architecture

```
skills/
├── detecting-provider/       # Provider auto-detection (shared)
├── resolving-identity/       # User identity resolution (shared)
├── looking-up-members/       # Member lookup (shared)
├── providers/notion/         # Notion-specific implementation
├── setting-up-tasks/         # Initial setup wizard
├── managing-tasks/           # Task CRUD and state transitions
├── executing-tasks/          # Task dispatch orchestration
├── viewing-tasks/            # Local view server (Hono + SSE)
├── delegating-tasks/         # Task reassignment
├── ingesting-messages/       # Message-to-task conversion
└── running-daily-tasks/      # Unified daily routine: message intake + task refinement + dispatch
agents/
└── task-agent.md             # Agent definition for autonomous task execution
```

Each skill is a self-contained module with a `SKILL.md` that defines its behavior, triggers, and data flow. Skills communicate through session variables and shared skills — never by cross-referencing each other.

## Data Source

Currently supports **Notion** as the data source via [Notion MCP](https://mcp.notion.com). The provider abstraction layer (`skills/providers/`) is designed for additional backends (SQLite, Airtable, etc.).

### Notion MCP Limitations & Workarounds

The Notion hosted MCP server (`https://mcp.notion.com/mcp`) has significant querying limitations:

| MCP Tool | Limitation |
|----------|-----------|
| `notion-fetch` (database/data source) | Returns **schema only** — no row data. Cannot retrieve task records from a database. |
| `notion-fetch` (page) | Returns full properties for a **single page**. Requires N+1 calls for N tasks. |
| `notion-search` | Semantic search returning page IDs + titles + text excerpts. **No property values** (Status, Assignees, etc.) in results. |
| `notion-create-view` FILTER DSL | `select`, `date`, `text` filters work. **`person` type silently dropped** — the filter is ignored without error. |
| `notion-fetch` with `?v=<view_id>` | Returns database schema/views metadata, **not filtered row data**. |

**Missing tools** (require Business+ plan with Notion AI, not available on Plus):
- `notion-query-data-sources` — SQL-like queries with filters, grouping, rollups
- `notion-query-database-view` — Query using a view's pre-configured filters/sorts

**Result**: Server-side filtering by `Assignees` (people property) is impossible through Notion MCP on the Plus plan. All tasks must be fetched individually and filtered client-side.

#### Workarounds

| Environment | Approach | How it works |
|------------|----------|-------------|
| **Claude Code** | `query-tasks.sh` script | Calls Notion REST API directly (`POST /v1/databases/{db_id}/query`) with `curl`. Supports people filters, compound filters, sorts, pagination. Requires `NOTION_TOKEN` env var (internal integration token). |
| **Cowork** | `.mcpb` Desktop Extension | Node.js MCP server packaged as a Desktop Extension. Token stored in OS Keychain via `sensitive: true` in manifest. Build from `skills/providers/notion/extension/`. |
| **Fallback** | MCP-only | `notion-search` → individual `notion-fetch` per page → client-side filter. Works without any token but slow for large databases. |

See `skills/providers/notion/SKILL.md` § "Querying Tasks" for implementation details.

### Task Schema

Tasks have 14 Core fields (auto-repaired if missing) and 8 Extended fields (graceful degradation). Key fields include:

- **Status**: Backlog → Ready → In Progress → In Review → Done (or Blocked)
- **Executor**: `claude-code` / `cowork` / `human`
- **Priority**: Urgent / High / Medium / Low
- **Blocked By**: Dependency relation for automatic execution ordering

## License

MIT
