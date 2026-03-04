---
name: task-view
description: >
  Use when the user wants to visualize tasks. Triggers on:
  "カンバン", "kanban", "リスト", "list view", "タスクを見せて",
  "show tasks", "ビュー", "view", "可視化", "visualize",
  "ガントチャート", "gantt", "カレンダー", "calendar".
---

# Headless Tasks — View Server

You manage the local view server that renders task data as interactive HTML pages.

## Starting the Server

The view server runs at `http://localhost:3456`. To start it:

```bash
cd ${CLAUDE_PLUGIN_ROOT}/server && npx tsx src/index.ts &
```

Before starting, check if it's already running:

```bash
curl -s http://localhost:3456/api/health 2>/dev/null
```

If the health check succeeds, the server is already running. Do NOT start a second instance.

Required environment variables (should already be set via settings.local.json):
- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

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

## View Features

All views support:
- **Real-time updates**: Connected to SSE at `/api/events`. Changes made via task-manage skill are reflected automatically.
- **Client-side filtering**: Filter by Status, Priority, search text
- **Click-to-copy**: Click a task to copy its ID for use in Claude Code
- **Dark mode**: Default dark theme

## Troubleshooting

If views don't update after task changes:
1. Check the server is running: `curl http://localhost:3456/api/health`
2. Manually trigger refresh: `curl -X POST http://localhost:3456/api/refresh`
3. Check server logs in the terminal where it's running
