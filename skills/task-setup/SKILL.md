---
name: task-setup
description: >
  Use when the user says "setup headless tasks", "initialize task management",
  "configure notion tasks", "セットアップ", "タスク管理の初期設定", or needs to
  set up Notion databases for the headless-tasks plugin.
---

# Headless Tasks — Setup Guide

You are guiding the user through the initial setup of the Headless Tasks plugin.
All database operations are performed via Notion MCP tools (OAuth — no token needed).

## Step 1: Verify Notion MCP Connection

Call `search` with query "test" to confirm the Notion MCP OAuth connection is working.

If it fails, tell the user to run `/mcp` in Claude Code to authenticate with Notion, then retry.

## Step 2: Choose Parent Page Location

Use `AskUserQuestion` to ask:
> "Where should I create the Headless Tasks workspace in Notion? Please provide a parent page name or URL. (Leave blank to create at the root of your workspace.)"

## Step 3: Create Parent Page

Create a parent page using `create-a-page`:
- Title: "Headless Tasks" (or as specified by user)
- Parent: the page the user specified, or workspace root if blank

Note the returned page ID as `PARENT_PAGE_ID`.

## Step 4: Create Databases

Create each database using `create-a-database` with `PARENT_PAGE_ID` as the parent.

### Tasks Database

#### Core Fields (required — skills will error if missing)

| Property | Type | Config |
|---|---|---|
| Title | title | — |
| Description | rich_text | — |
| Acceptance Criteria | rich_text | — |
| Status | status | Groups: Not Started (Backlog, Ready), In Progress (In Progress, In Review), Complete (Done) |
| Blocked By | relation | Self-relation to Tasks DB |
| Priority | select | Options: Urgent, High, Medium, Low |
| Executor | select | Options: claude-code, cowork, antigravity, human |
| Requires Review | checkbox | — |
| Execution Plan | rich_text | — |
| Working Directory | rich_text | — |
| Session Reference | rich_text | — |
| Dispatched At | date | — |
| Agent Output | rich_text | — |
| Error Message | rich_text | — |

#### Extended Fields (optional — graceful degradation if absent)

| Property | Type | Config |
|---|---|---|
| Context | rich_text | — |
| Artifacts | rich_text | — |
| Repository | url | — |
| Due Date | date | — |
| Tags | multi_select | — |
| Parent Task | relation | Self-relation to Tasks DB |
| Project | relation | → Projects DB |
| Team | relation | → Teams DB |
| Assignees | people | — |

Note the returned database ID as `TASKS_DB_ID`.

### Teams Database

Properties: Name (title), Members (people), Tasks (relation → Tasks DB)

Note the returned database ID as `TEAMS_DB_ID`.

### Projects Database

Properties: Name (title), Owner (people), Team (relation → Teams DB), Status (select: Active/On Hold/Completed/Archived), Tasks (relation → Tasks DB), Due Date (date)

Note the returned database ID as `PROJECTS_DB_ID`.

## Step 5: Create Config Page

Create a page using `create-a-page` under `PARENT_PAGE_ID`:
- Title: "Headless Tasks Config"
- Body: a code block (language: `json`) containing:

```json
{
  "tasksDatabaseId": "<TASKS_DB_ID>",
  "teamsDatabaseId": "<TEAMS_DB_ID>",
  "projectsDatabaseId": "<PROJECTS_DB_ID>"
}
```

Replace the placeholders with the actual IDs from Step 4.

After the JSON block, append the following as plain text:

```
## Schema Contract
- Core fields: 変更・削除不可（スキルが依存）
- Extended fields: リネーム・削除可能（機能が無効になる場合あり）
- User-defined fields: 完全自由（Sprint, Epic, Story Points 等を自由に追加可）
```

## Step 6: Verify

Use `AskUserQuestion` to confirm:
> "Setup complete! I've created the Headless Tasks workspace in Notion with Tasks, Teams, and Projects databases, and a Config page storing the database IDs. Would you like me to create a test task to verify everything is working?"

If yes, create a test task using `create-a-page` with the Tasks database as parent:
- Title: "Test task — delete me"
- Status: Ready
- Priority: Medium

Tell the user setup is complete and they can start using:
- Natural language task management (`task-manage` skill)
- Visual views (`task-view` skill)
