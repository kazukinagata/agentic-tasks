---
name: task-manage
description: >
  Use when the user wants to create, update, delete, or query tasks.
  Triggers on: "add task", "create task", "update task", "done", "change status",
  "list tasks", "what's next", "next task", "block", "assign", "prioritize".
---

# Headless Tasks — Task Management

You are managing tasks stored in a Notion database. Use the Notion MCP tools for all data operations.

## Database Configuration

At the start of each session, read the config page to get database IDs:

1. Use `notion-search` with query "Headless Tasks Config" to find the config page
2. Retrieve the page body using `notion-fetch` with the page URL/ID
3. Parse the JSON code block to extract:
   - `tasksDatabaseId`
   - `teamsDatabaseId`
   - `projectsDatabaseId`

Use these IDs for all subsequent Notion operations.

## Schema Validation

After loading config, verify Core fields by calling `notion-fetch` with `tasksDatabaseId` and inspecting the returned schema's `properties` object.

Required Core fields: `Title`, `Description`, `Acceptance Criteria`, `Status`, `Blocked By`, `Priority`, `Executor`, `Requires Review`, `Execution Plan`, `Working Directory`, `Session Reference`, `Dispatched At`, `Agent Output`, `Error Message`.

### Auto-Repair (Missing Fields)

If any Core field is missing, automatically repair using `notion-update-data-source`.
First obtain the data source ID via `notion-fetch` on the database URL.
Then run the appropriate DDL (one `ADD COLUMN` per call):

| Missing Field | Repair DDL |
|---|---|
| Status | `ADD COLUMN "Status" SELECT('Backlog':gray, 'Ready':blue, 'In Progress':yellow, 'In Review':orange, 'Done':green, 'Blocked':red)` |
| Priority | `ADD COLUMN "Priority" SELECT('Urgent':red, 'High':orange, 'Medium':yellow, 'Low':blue)` |
| Executor | `ADD COLUMN "Executor" SELECT('claude-code':purple, 'cowork':green, 'human':gray)` |
| Dispatched At / Due Date | `ADD COLUMN "<field>" DATE` |
| (other text fields) | `ADD COLUMN "<field>" RICH_TEXT` |

After repair, re-verify and continue. **Never ask the user to manually fix the schema.**

## Notion MCP Tool Reference

- `notion-create-pages` — Create a task (parent: `{ "data_source_id": TASKS_DS_ID }`)
- `notion-update-page` — Update task properties
- `notion-fetch` — Get a database, data source, or single task by URL/ID
- `notion-search` — Full-text search across tasks; use for filtering by field value
- `notion-get-comments` / `notion-create-comment` — Read/write task comments

## Schema: Property Name → Notion Type

### Core Fields (required — verify existence at session start)

| Property | Type | Notes |
|---|---|---|
| Title | title | Task name |
| Description | rich_text | Orchestrator-written detail |
| Acceptance Criteria | rich_text | Verifiable completion conditions |
| Status | select | Backlog / Ready / In Progress / In Review / Done / Blocked |
| Blocked By | relation | Self-relation (dependency). Empty = actionable |
| Priority | select | Urgent / High / Medium / Low |
| Executor | select | claude-code / cowork / human |
| Requires Review | checkbox | On → must pass In Review. Off → can go directly to Done |
| Execution Plan | rich_text | Orchestrator's plan written before dispatch. write-once |
| Working Directory | rich_text | claude-code: absolute path. cowork: workspace-relative path |
| Session Reference | rich_text | Written after dispatch: tmux session name / Cowork task ID |
| Dispatched At | date | Dispatch timestamp. Used for timeout detection |
| Agent Output | rich_text | Execution result |
| Error Message | rich_text | Written on failure only. Query with "Error Message is not empty" |

### Extended Fields (optional — graceful degradation if absent)

| Property | Type | Notes |
|---|---|---|
| Context | rich_text | Background info, constraints |
| Artifacts | rich_text | PR URLs, file paths (newline-separated) |
| Repository | url | GitHub repository URL |
| Due Date | date | ISO format |
| Tags | multi_select | Free tags |
| Parent Task | relation | Self-relation (hierarchy) |
| Project | relation | → Projects DB |
| Team | relation | → Teams DB |
| Assignees | people | Human executor assignment |
| Branch | rich_text | Git branch name (e.g. feature/task-slug). Leave blank to work on the current branch |

## State Transition Rules

Valid transitions:
- Backlog → Ready (when description + acceptance criteria are filled)
- Ready → In Progress (when dispatched to executor)
- In Progress → In Review (when `Requires Review` is checked and work is done)
- In Progress → Done (when `Requires Review` is unchecked and work is done)
- In Progress → Blocked (when blocked by another task or error)
- In Review → Done (when review approved)
- In Review → In Progress (when changes requested)
- Any → Backlog (deprioritize)

**When `Requires Review` is Off**, skip In Review and transition directly to Done.
**When writing errors**, set Status to Blocked and write the error message in `Error Message` (not in Agent Output).

## "Next Task" Logic

When the user asks "what should I do next?" or "next task":

1. Use `notion-search` to find tasks where Status = "Ready"
   (Filter Blocked By = empty in post-processing, or use `notion-fetch` on the data source)
2. Sort by Priority: Urgent > High > Medium > Low
3. Within same priority, sort by Due Date (earliest first)
4. Present the top task with its full context

## Task Creation Best Practices

### Required Confirmations (no guessing or omitting)

Always confirm the following fields with AskUserQuestion unless the user has explicitly stated them.
Do NOT infer and commit to values from the task description.

| Field | Reason |
|---|---|
| Executor | Execution method varies entirely by executor type |
| Priority | Urgency depends on the user's current context |
| Working Directory | Wrong path directly causes agent execution errors |

### How to Choose Executor

Never decide the Executor on your own.
Present options and recommended reasons to the user and let them decide.

| Executor | Best for |
|---|---|
| `claude-code` | Code implementation, research, documentation, script execution |
| `cowork` | Slack integration, external service notifications, delegating interviews to others |
| `human` | Tasks requiring human judgment, relationships, or direct interaction |

In AskUserQuestion, include a description with each option explaining why it is recommended.

### Branch (git worktree support)

For tasks with Executor=claude-code where the target is a git repository:
- Suggest setting the Branch field (not mandatory)
- Default candidate: `feature/<task-title-slug>`
- If set, task-agent can create an isolated environment via `git worktree add`
- If left blank, work proceeds on the current branch (not suitable for parallel execution)

### Description and Acceptance Criteria Quality

- Description: Detailed enough to execute without additional questions
- Acceptance Criteria: Verifiable conditions such as "command X succeeds" or "file Y exists"

## Bulk Operations

For requests like "show me all blocked tasks" or "mark all Done tasks as archived":
1. Use `notion-search` or `notion-fetch` on the data source with appropriate filters
2. Present results to user for confirmation
3. Execute updates in sequence using `notion-update-page`

## After Any Task Operation

After creating, updating, or deleting tasks, push fresh data to the view server:

1. Retrieve all tasks via `notion-fetch` on the tasks data source URL
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

## Language

Always communicate with the user in the language they are using.
Write all task content (Title, Description, Acceptance Criteria, Execution Plan, etc.)
in the user's language.
