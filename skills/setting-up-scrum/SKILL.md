---
name: setting-up-scrum
description: >
  Use when the user wants to enable scrum/sprint support for headless-tasks.
  Triggers on: "set up scrum", "enable scrum", "add scrum", "set up sprints",
  "スクラムをセットアップ", "スプリントを使いたい", "バッチ実行したい".
---

# Headless Tasks — Scrum Setup

This skill provisions the Sprints (Objectives) database and extends the Tasks DB with sprint-related fields. It is opt-in and idempotent.

## Database Configuration

1. Use `notion-search` with query "Headless Tasks Config" to find the config page
2. Retrieve the page body using `notion-fetch` with the page URL/ID
3. Parse the JSON code block to extract all database IDs

## Idempotency Check

Before doing anything, check if `sprintsDatabaseId` already exists in the config JSON.
If it does, report "Scrum は既に設定済みです（sprintsDatabaseId: <ID>）" and exit.

## Step 1: Create Sprints (Objectives) DB

Use `notion-create-database` to create the Sprints DB as a sibling of the Tasks DB (same parent page).

Database name: "Sprints"

Schema:

| Property | Notion Type | DDL |
|---|---|---|
| Name | title | (auto-created) |
| Goal | rich_text | `ADD COLUMN "Goal" RICH_TEXT` |
| Status | select | `ADD COLUMN "Status" SELECT('Planning':gray, 'Active':green, 'Completed':blue, 'Closed':default)` |
| Max Concurrent Agents | number | `ADD COLUMN "Max Concurrent Agents" NUMBER` |
| Velocity | number | `ADD COLUMN "Velocity" NUMBER` |
| Metrics | rich_text | `ADD COLUMN "Metrics" RICH_TEXT` |
| Completion Notes | rich_text | `ADD COLUMN "Completion Notes" RICH_TEXT` |

After creating the DB, note its ID as `SPRINTS_DS_ID`.

## Step 2: Add Sprint Relation to Tasks DB

Obtain the Tasks DB data source ID via `notion-fetch` on `tasksDatabaseId`.

Add a dual relation (one call per direction):

```
ADD COLUMN "Sprint" RELATION('<SPRINTS_DS_ID>', DUAL 'Tasks' 'tasks')
```

This creates a `Sprint` column on Tasks that points to the Sprints DB, and a back-propagated `Tasks` column on Sprints.

## Step 3: Add Complexity Score to Tasks DB

```
ADD COLUMN "Complexity Score" NUMBER
```

**Complexity Score calculation guide** (for use in managing-tasks when promoting Backlog→Ready):
- Base: number of Acceptance Criteria lines × 2
- +1 per 200 tokens in Description
- +2 per level of Blocked By dependency chain depth
- Reference past similar tasks' cycle time from Agent Output if available
- Round to nearest integer (typical range: 1–13)

## Step 4: Add Backlog Order to Tasks DB

```
ADD COLUMN "Backlog Order" NUMBER
```

Backlog Order convention: 1000, 2000, 3000... (gaps allow easy insertion). Agent proposes, human can override.

## Step 5: Update Config Page

Update the JSON code block in the config page to add:

```json
{
  "tasksDatabaseId": "...",
  "teamsDatabaseId": "...",
  "projectsDatabaseId": "...",
  "sprintsDatabaseId": "<NEW_SPRINTS_DB_ID>",
  "maxConcurrentAgents": 3
}
```

Use `notion-update-page` to overwrite the code block content.

## Step 6: Completion Report

Output a summary:

```
Scrum セットアップ完了

作成したデータベース:
  Sprints DB: <SPRINTS_DB_ID>

Tasks DB に追加したフィールド:
  - Sprint (relation → Sprints)
  - Complexity Score (number)
  - Backlog Order (number)

Config 更新:
  - sprintsDatabaseId: <ID>
  - maxConcurrentAgents: 3

次のステップ:
  - "start sprint" でスプリント計画を開始
  - "show backlog" でバックログを確認
```

## Language

Always communicate with the user in the language they are using.
