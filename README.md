# Headless Tasks

AI-native task management plugin for [Claude Code](https://claude.ai/code) and [Cowork](https://cowork.com). Manage tasks through natural language, visualize them in real-time HTML views, and execute them autonomously with parallel agent orchestration.

## Features

- **Natural Language CRUD** — Create, update, query, and delete tasks by talking to Claude
- **Real-time Views** — Kanban, List, Calendar, and Gantt views served locally at `http://localhost:3456` with live updates via SSE (Claude Code)
- **Autonomous Execution** — Dispatch tasks to parallel tmux sessions (Claude Code) or Scheduled Tasks (Cowork)
- **Daily Routine** — Automated daily message intake + task dispatch via Cowork Scheduled Tasks
- **Sprint Management** — Objective-based sprints with backlog ordering, velocity tracking, and automated retrospectives
- **Stall Detection** — Automatic detection of stuck agents based on complexity-aware time thresholds
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
   /plugin marketplace add kazukinagata/headless-tasks
   ```

2. Install the plugin:

   ```
   /plugin install headless-tasks@kazukinagata-headless-tasks
   ```

   You can also browse it interactively — run `/plugin`, go to the **Discover** tab, and select **headless-tasks**.

#### Cowork

1. Open the Cowork tab in Claude Desktop
2. Click **Customize** in the left sidebar
3. Click **Browse plugins** and search for **headless-tasks**, then click **Install**

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

### Optional: Enable Scrum

```
/setting-up-scrum
```

This creates a Sprints database and adds sprint-related fields (Sprint, Complexity Score, Backlog Order) to your Tasks database.

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

### Execution

| Command | Description |
|---------|-------------|
| "execute tasks" | Dispatch ready tasks for execution |
| "do the next task" | Execute the top-priority task |
| "process tasks --auto" | Auto-execute all ready tasks in parallel |
| "daily tasks" | Run daily routine: message intake + task dispatch (Cowork) |

### Sprint Workflow

| Command | Description |
|---------|-------------|
| "start sprint" | Plan and start a new sprint |
| "sprint status" | View current sprint progress |
| "standup" | Generate automated status report |
| "end sprint" | Review and close the active sprint |
| "retro" | Analyze sprint metrics |

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
├── setting-up-scrum/         # Sprint infrastructure setup
├── managing-tasks/           # Task CRUD and state transitions
├── managing-sprints/         # Sprint lifecycle and backlog
├── executing-tasks/          # Task dispatch orchestration
├── viewing-tasks/            # Local view server (Hono + SSE)
├── viewing-my-tasks/         # Personal task dashboard
├── delegating-tasks/         # Task reassignment
├── ingesting-messages/       # Message-to-task conversion
├── running-standup/          # Sprint status reports
├── running-daily-tasks/      # Daily message intake + task dispatch (Cowork)
├── reviewing-sprint/         # Sprint close and velocity
└── analyzing-sprint-metrics/ # Retrospective analytics
agents/
└── task-agent.md             # Agent definition for autonomous task execution
```

Each skill is a self-contained module with a `SKILL.md` that defines its behavior, triggers, and data flow. Skills communicate through session variables and shared skills — never by cross-referencing each other.

## Data Source

Currently supports **Notion** as the data source via [Notion MCP](https://mcp.notion.com). The provider abstraction layer (`skills/providers/`) is designed for additional backends (SQLite, Airtable, etc.).

### Task Schema

Tasks have 14 Core fields (auto-repaired if missing) and 11 Extended fields (graceful degradation). Key fields include:

- **Status**: Backlog → Ready → In Progress → In Review → Done (or Blocked)
- **Executor**: `claude-code` / `cowork` / `human`
- **Priority**: Urgent / High / Medium / Low
- **Blocked By**: Dependency relation for automatic execution ordering
- **Complexity Score**: Fibonacci-like score (1–13) for stall detection and velocity tracking

## License

MIT
