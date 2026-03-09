---
name: viewing-tasks
description: >
  Manages the local view server that renders task data as interactive HTML pages
  (Kanban, List, Calendar, Gantt). Starts the server, pushes data, and opens views.
  Triggers on: "kanban", "list view", "show tasks", "view", "visualize",
  "gantt", "calendar".
---

# Agentic Tasks — View Server

You manage the local view server that renders task data as interactive HTML pages.

## Provider Detection (once per session)

Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` and follow its instructions to determine `active_provider`. Skip if already determined in this conversation.

## Starting the Server

The view server runs at `http://localhost:3456`. To start it:

```bash
cd ${CLAUDE_PLUGIN_ROOT}/skills/viewing-tasks/server && npx tsx src/index.ts &
```

Before starting, check if it's already running:

```bash
curl -s http://localhost:3456/api/health 2>/dev/null
```

If the health check succeeds, the server is already running. Do NOT start a second instance.

## Available Views

| View | URL | Status |
|---|---|---|
| View Selector | http://localhost:3456/ | Available |
| List | http://localhost:3456/list.html | Available |
| Kanban | http://localhost:3456/kanban.html | Available |
| Calendar | http://localhost:3456/calendar.html | Coming soon |
| Gantt | http://localhost:3456/gantt.html | Coming soon |

## Opening a View

After ensuring the server is running, open the appropriate URL in the user's browser:

```bash
# macOS
open http://localhost:3456/kanban.html

# Linux
xdg-open http://localhost:3456/kanban.html

# WSL
wslview http://localhost:3456/kanban.html
```

Detect the platform and use the appropriate command.

## Initializing Data After Start

After starting the server, push current task data so the view is populated.
Follow the **Pushing Data to View Server** section in the active provider's SKILL.md to:
1. Fetch all tasks from the data source
2. Format as `{ "tasks": [...], "updatedAt": "<ISO timestamp>" }`
3. POST to `http://localhost:3456/api/data`

## View Features

All views support:
- **Real-time updates**: Connected to SSE at `/api/events`. Changes made via managing-tasks skill are reflected automatically.
- **Client-side filtering**: Filter by Status, Priority, search text
- **Click-to-copy**: Click a task to copy its ID for use in Claude Code
- **Dark mode**: Default dark theme

## Troubleshooting

If views don't update after task changes:
1. Check the server is running: `curl http://localhost:3456/api/health`
2. Manually push data: use the managing-tasks skill to query tasks and POST to `/api/data`
3. Check server logs in the terminal where it's running
