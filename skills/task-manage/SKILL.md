---
name: task-manage
description: >
  Use when the user wants to create, update, delete, or query tasks.
  Triggers on: "タスク追加", "タスク作成", "add task", "create task",
  "update task", "タスク更新", "done", "完了", "ステータス変更",
  "タスク一覧", "list tasks", "what's next", "次のタスク",
  "block", "ブロック", "assign", "アサイン", "prioritize", "優先度".
---

# Headless Tasks — Task Management

You are managing tasks stored in a Notion database. Use the Notion MCP tools for all data operations.

## Database Configuration

At the start of each session, read the config page to get database IDs:

1. Use `search` with query "Headless Tasks Config" to find the config page
2. Retrieve the page body using `retrieve-a-page` (or `retrieve-block-children` for the content)
3. Parse the JSON code block to extract:
   - `tasksDatabaseId`
   - `teamsDatabaseId`
   - `projectsDatabaseId`

Use these IDs for all subsequent Notion operations.

## Notion MCP Tool Reference

- `create-a-page` — Create a task (parent: `{ "database_id": tasksDatabaseId }`)
- `update-page-properties` — Update task properties
- `query-data-source` — Query tasks with filters/sorts
- `search` — Full-text search across tasks
- `retrieve-a-page` — Get a single task's details
- `retrieve-comments` / `create-a-comment` — Read/write task comments

## Schema: Property Name → Notion Type

| Property | Type | Notes |
|---|---|---|
| Title | title | Task name |
| Description | rich_text | Agent-executable detail |
| Acceptance Criteria | rich_text | Verifiable completion conditions |
| Status | status | Backlog → Ready → In Progress → In Review → Done |
| Blocked By | relation | Self-relation (dependency) |
| Assignees | people | Multi-person |
| Reporter | people | Creator |
| Reviewers | people | For In Review |
| Team | relation | → Teams DB |
| Priority | select | Urgent / High / Medium / Low |
| Project | relation | → Projects DB |
| Tags | multi_select | Free tags |
| Parent Task | relation | Self-relation (hierarchy) |
| Due Date | date | ISO format |
| Estimate | number | Hours |
| Agent Type | select | claude-code / human / review |
| Agent Output | rich_text | Execution result |
| Artifacts | url | PR links, file paths |
| Context | rich_text | Background info |

## State Transition Rules

Valid transitions:
- Backlog → Ready (when description + acceptance criteria are filled)
- Ready → In Progress (when someone starts working)
- In Progress → In Review (when work is done, needs review)
- In Progress → Blocked (when blocked by another task)
- In Review → Done (when reviewers approve)
- In Review → In Progress (when changes requested)
- Any → Backlog (deprioritize)

**Never skip In Review for tasks with `Agent Type: claude-code`.** Agent outputs must be reviewed.

## "Next Task" Logic

When the user asks "what should I do next?" or "次のタスク":

1. Query tasks where Status = "Ready" AND Blocked By is empty
2. Sort by Priority: Urgent > High > Medium > Low
3. Within same priority, sort by Due Date (earliest first)
4. Present the top task with its full context

## Task Creation Best Practices

When creating a task, ensure:
- **Description** is detailed enough for an agent or team member to execute without asking questions
- **Acceptance Criteria** is verifiable (not vague like "works well")
- **Agent Type** is set — default to "human" unless the task is clearly automatable
- **Priority** is always set — ask the user if not provided
- **Project** is set if the user has active projects

## Bulk Operations

For requests like "show me all blocked tasks" or "mark all Done tasks as archived":
1. Use `query-data-source` with appropriate filters
2. Present results to user for confirmation
3. Execute updates in sequence using `update-page-properties`

## After Any Task Operation

After creating, updating, or deleting tasks, push fresh data to the view server:

1. Query all tasks via `query-data-source` on `tasksDatabaseId`
2. Format the response as a `TasksResponse` JSON object:
   ```json
   { "tasks": [...], "updatedAt": "<ISO timestamp>" }
   ```
3. POST to `http://localhost:3456/api/data` with `Content-Type: application/json`

Use the Bash tool:
```bash
curl -s -X POST http://localhost:3456/api/data \
  -H "Content-Type: application/json" \
  -d '<json>' -o /dev/null 2>/dev/null || true
```

Silently skip if the server is not running (the `|| true` handles this).
