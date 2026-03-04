---
name: task-setup
description: >
  Use when the user says "setup headless tasks", "initialize task management",
  "configure notion tasks", "セットアップ", "タスク管理の初期設定", or needs to
  set up Notion databases for the headless-tasks plugin.
---

# Headless Tasks — Setup Guide

You are guiding the user through the initial setup of the Headless Tasks plugin.
Follow these steps in order. Ask the user to confirm each step before proceeding.

## Prerequisites

The user needs:
- A Notion account
- Admin access to a Notion workspace

## Step 1: Create Notion Integration

Guide the user to create a Notion integration:

1. Go to https://www.notion.so/profile/integrations
2. Click "New Integration"
3. Name it "Headless Tasks"
4. Select the workspace
5. Copy the "Internal Integration Secret" (starts with `ntn_`)

## Step 2: Set Environment Variable

**Claude Code:**

Ask the user to add the token to their project's `.claude/settings.local.json`:

```json
{
  "env": {
    "NOTION_TOKEN": "ntn_PASTE_TOKEN_HERE"
  }
}
```

**Cowork:**

Guide the user to set `NOTION_TOKEN` via the Cowork admin settings UI.

## Step 3: Create Notion Databases

Use the Notion MCP tools to create three databases. First verify the MCP connection works:

1. Call `search` with query "test" to verify the connection
2. Create a parent page for the databases using `create-a-page`

Then create each database using `create-a-data-source`:

### Tasks Database

Properties:
| Property | Type | Config |
|---|---|---|
| Title | title | — |
| Description | rich_text | — |
| Acceptance Criteria | rich_text | — |
| Status | status | Groups: Not Started (Backlog, Ready), In Progress (In Progress, In Review), Complete (Done) |
| Blocked By | relation | Self-relation to Tasks DB |
| Assignees | people | — |
| Reporter | people | — |
| Reviewers | people | — |
| Team | relation | → Teams DB |
| Priority | select | Options: Urgent, High, Medium, Low |
| Project | relation | → Projects DB |
| Tags | multi_select | — |
| Parent Task | relation | Self-relation to Tasks DB |
| Due Date | date | — |
| Estimate | number | Format: number |
| Agent Type | select | Options: claude-code, human, review |
| Agent Output | rich_text | — |
| Artifacts | url | — |
| Context | rich_text | — |

### Teams Database

Properties: Name (title), Members (people), Tasks (relation → Tasks DB)

### Projects Database

Properties: Name (title), Owner (people), Team (relation → Teams DB), Status (select: Active/On Hold/Completed/Archived), Tasks (relation → Tasks DB), Due Date (date)

## Step 4: Store Database IDs

After creating the databases, store their IDs in `.claude/settings.local.json`:

```json
{
  "env": {
    "NOTION_TOKEN": "ntn_...",
    "NOTION_DATABASE_ID": "TASKS_DB_ID_HERE",
    "NOTION_TEAMS_DB_ID": "TEAMS_DB_ID_HERE",
    "NOTION_PROJECTS_DB_ID": "PROJECTS_DB_ID_HERE"
  }
}
```

## Step 5: Share Databases with Integration

Remind the user to share each database with the "Headless Tasks" integration:
1. Open each database in Notion
2. Click "..." menu → "Connections" → Add "Headless Tasks"

## Step 6: Verify

Create a test task using `create-a-page` with the Tasks database as parent:
- Title: "Test task — delete me"
- Status: Ready
- Priority: Medium

If successful, tell the user setup is complete and they can start using:
- Natural language task management (task-manage skill)
- Visual views (task-view skill)
