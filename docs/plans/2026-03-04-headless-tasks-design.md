# Headless Tasks - Design Document

## Overview

Claude Code plugin that turns Notion into an AI-native task management tool. The core logic lives in Skills, views are served by a local HTTP server with real-time updates, and data is stored in Notion databases.

## Problem

- No task management tool fits everyone. The "last one mile" of UI is the bottleneck.
- Switching between tools is friction. Want to stay in the terminal.
- Manual task operations are tedious. Want natural language.
- In the AI Agent era, tasks should be autonomously executed, not just tracked.

## Solution

A Claude Code plugin (Cowork-compatible) with:

- **Skills** as the core: domain logic, schema knowledge, workflow rules, view generation instructions
- **Notion** as the database: zero migration cost, leveraging existing infrastructure
- **Local view server**: real-time HTML views (kanban, calendar, gantt, list) with SSE push updates
- **PostToolUse hooks**: detect MCP operations and trigger view refresh

## Architecture

```
[User]
  |
  v
[Claude Code / Cowork]
  |-- Skills (domain logic, workflow, UI instructions)
  |-- Notion MCP (data operations)
  |-- PostToolUse Hook --> curl POST /api/refresh
  |
[Local View Server :3456]
  |-- Serves HTML views
  |-- Fetches from Notion API
  |-- SSE push to browser
  |
[Browser]
  |-- Kanban / Calendar / Gantt / List views
  |-- Real-time updates via SSE
```

## Plugin Structure

```
headless-tasks/
├── plugin.json              # Plugin manifest
├── .mcp.json                # Notion MCP server config
├── skills/
│   ├── task-setup.md        # Interactive setup guide
│   ├── task-manage.md       # Task CRUD, state management
│   ├── task-view.md         # View launch & switching
│   └── task-agent.md        # Autonomous task execution
├── agents/
│   └── task-agent.md        # Autonomous execution agent
├── hooks/
│   └── notify-view.sh       # PostToolUse: notify view server on MCP ops
├── server/                  # Local view server
│   ├── index.ts             # Entry point (Hono)
│   ├── notion-client.ts     # Notion API data fetching
│   ├── sse.ts               # SSE endpoint
│   └── views/               # HTML view templates
│       ├── kanban.html
│       ├── calendar.html
│       ├── gantt.html
│       └── list.html
├── package.json
└── docs/
    └── setup.md
```

## Notion Database Schema

### Tasks DB

| Property | Notion Type | Description |
|---|---|---|
| **Core** | | |
| Title | Title | Task name |
| Description | Rich Text | Detailed description for agent/member execution |
| Acceptance Criteria | Rich Text | Completion conditions |
| **Status** | | |
| Status | Status | Backlog / Ready / In Progress / In Review / Done |
| Blocked By | Relation (self) | Dependency tasks |
| **People & Teams** | | |
| Assignees | Person (multi) | Assigned members (multiple) |
| Reporter | Person | Task creator |
| Reviewers | Person (multi) | Review/approval assignees |
| Team | Relation -> Teams | Owning team |
| **Classification** | | |
| Priority | Select | Urgent / High / Medium / Low |
| Project | Relation -> Projects | Parent project |
| Tags | Multi-select | Free-form tags |
| Parent Task | Relation (self) | Parent task (subtask hierarchy) |
| **Schedule** | | |
| Due Date | Date | Deadline |
| Estimate | Number | Estimated hours |
| **Agent Execution** | | |
| Agent Type | Select | claude-code / human / review |
| Agent Output | Rich Text | Execution result |
| Artifacts | URL | Deliverable links (PR URLs, file paths) |
| **Context** | | |
| Context | Rich Text | Background, references, constraints |

### Teams DB

| Property | Notion Type | Description |
|---|---|---|
| Name | Title | Team name |
| Members | Person (multi) | Team members |
| Tasks | Relation -> Tasks | Team's tasks |

### Projects DB

| Property | Notion Type | Description |
|---|---|---|
| Name | Title | Project name |
| Owner | Person | Project owner |
| Team | Relation -> Teams | Responsible team |
| Status | Select | Active / On Hold / Completed / Archived |
| Tasks | Relation -> Tasks | Project's tasks |
| Due Date | Date | Project deadline |

### Schema Design Decisions

- **Assignees (multi-person)**: Supports pair work, mob programming, agent+human collaboration
- **Reporter**: Tracks who requested what. Essential for team accountability
- **Reviewers**: Explicit review assignees for In Review status. Required for human review of agent outputs
- **Team as Relation**: Enables team-based views and member lookups (not just a Select label)
- **Project as Relation**: Enables cross-project dashboards and project-level gantt charts
- **Blocked By (separate from Parent Task)**: "Decomposition" (parent-child) and "dependency" (blocked-by) are distinct concepts. Agents use Blocked By to determine actionable tasks
- **Comments**: Use Notion's built-in page comments (no schema addition needed)

## Skills Design

### task-setup.md

**Trigger**: User says "setup", "initialize", "configure headless tasks"

**Behavior**:
1. Guide Notion Integration creation (API key)
2. Verify Notion MCP connection
3. Create Tasks/Teams/Projects DBs with recommended schema via Notion MCP
4. Store DB IDs and API key in `settings.local.json` env
5. Create test task to verify end-to-end flow
6. Detect environment (Claude Code vs Cowork) and adjust guidance

### task-manage.md

**Trigger**: User mentions task creation, updates, deletion, queries

**Responsibilities**:
- Hold Notion DB schema definition and property type mappings
- Translate natural language to Notion MCP tool calls
- Enforce state transition rules: Backlog -> Ready -> In Progress -> In Review -> Done
- "Next actionable task" inference: Ready + Blocked By empty + Priority sort
- Task decomposition guidance (agent-executable granularity)

### task-view.md

**Trigger**: User asks for visualization, kanban, calendar, gantt, or any view

**Responsibilities**:
- Start local view server (if not running)
- Open browser to appropriate view URL
- Guide view switching

### task-agent.md

**Trigger**: User says "do next task", "process ready tasks", "execute"

**Responsibilities**:
- Fetch Ready + unblocked tasks from Notion
- Sort by Priority
- For Agent Type: claude-code, begin autonomous execution
- Record results in Agent Output
- Verify against Acceptance Criteria
- Update Status (In Review on success, Blocked on failure)
- Default: confirm each task with user. --auto flag for continuous execution

## View Server Design

### Technology

Node.js + Hono (lightweight, TypeScript, MCP ecosystem affinity)

### Endpoints

```
GET /                    -> View selector
GET /kanban              -> Kanban view
GET /calendar            -> Calendar view
GET /gantt               -> Gantt chart
GET /list                -> List view
GET /api/tasks           -> Tasks JSON data
GET /api/events          -> SSE stream (real-time updates)
POST /api/refresh        -> Refresh notification from Hook
```

### Real-time Update Flow

```
1. User: "Mark this task as Done"
2. task-manage Skill -> Claude Code -> Notion MCP update
3. PostToolUse Hook fires -> curl POST localhost:3456/api/refresh
4. View server fetches latest data from Notion API
5. SSE push to browser
6. Browser JS updates DOM (no page reload)
```

### Lifecycle

- Auto-start when task-view Skill is invoked (background process)
- Auto-shutdown after 30 minutes of inactivity
- No duplicate instances (check port before starting)

### View Features (MVP)

- **Kanban**: Group by Status, show Priority badges, Assignees avatars
- **Calendar**: Monthly view by Due Date, color-coded by Priority
- **Gantt**: Timeline with Due Date + Estimate, dependency arrows from Blocked By
- **List**: Sortable/filterable table, expand/collapse for details
- All views: dark mode, click-to-copy task ID, client-side filtering

## Configuration

Environment variables stored in `.claude/settings.local.json`:

```json
{
  "env": {
    "NOTION_API_KEY": "secret_xxx...",
    "NOTION_DATABASE_ID": "tasks-db-id",
    "NOTION_TEAMS_DB_ID": "teams-db-id",
    "NOTION_PROJECTS_DB_ID": "projects-db-id"
  }
}
```

`.mcp.json` references these via `${VAR_NAME}` syntax.

## Cowork Compatibility

| Component | Claude Code | Cowork | Compatibility |
|---|---|---|---|
| plugin.json | Same | Same | OK |
| skills/ (markdown) | Same | Same | OK |
| .mcp.json | Same | Same | OK |
| Env var setup | settings.local.json | Admin UI | Skill detects & guides |
| View server | localhost + open browser | localhost + browser tab | OK |

## MVP Scope

- **Target user**: Self (personal experiment)
- **Schema**: Team-collaboration-ready (Teams, Projects, multi-assignee)
- **Views**: Kanban + List (start with 2, add Calendar/Gantt next)
- **Agent**: Basic autonomous execution with user confirmation
- **Concurrency**: Single user, no real-time sync concerns

## Future Evolution

- **Approach B migration**: If Notion MCP limits are hit, build custom MCP server with high-level task tools
- **Interactive views**: Add mutation capabilities to views (drag-and-drop status changes, inline editing)
- **Additional DB adapters**: Google Sheets, SQLite
- **Multi-agent orchestration**: Multiple agents working on different tasks in parallel
