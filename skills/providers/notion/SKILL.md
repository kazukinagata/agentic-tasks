# Agentic Tasks — Notion Provider

This file contains all Notion-specific implementation details for agentic-tasks.
Load this file when the active provider is **notion**.

## Database Configuration

At the start of each session, read the config page to get database IDs:

1. Use `notion-search` with query "Agentic Tasks Config" to find the config page
2. Retrieve the page body using `notion-fetch` with the page URL/ID
3. Parse the JSON code block to extract:
   - `tasksDatabaseId`
   - `teamsDatabaseId`

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

## MCP Tool Reference

- `notion-create-pages` — Create a task (parent: `{ "data_source_id": TASKS_DS_ID }`)
- `notion-update-page` — Update task properties
- `notion-fetch` — Get a database, data source, or single task by URL/ID
- `notion-search` — Full-text search across tasks; use for filtering by field value
- `notion-get-comments` / `notion-create-comment` — Read/write task comments

## Schema: Notion Property → Canonical Role

### Core Fields (required — verify existence at session start)

| Property | Notion Type | Canonical Role | Notes |
|---|---|---|---|
| Title | title | `task_title` | Task name |
| Description | rich_text | `task_description` | Orchestrator-written detail |
| Acceptance Criteria | rich_text | `task_acceptance_criteria` | Verifiable completion conditions |
| Status | select | `task_status` | Backlog / Ready / In Progress / In Review / Done / Blocked |
| Blocked By | relation | `task_blocked_by` | Self-relation (dependency). Empty or all blockers Done = actionable |
| Priority | select | `task_priority` | Urgent / High / Medium / Low |
| Executor | select | `task_executor` | claude-code / cowork / human |
| Requires Review | checkbox | `task_requires_review` | On → must pass In Review. Off → can go directly to Done |
| Execution Plan | rich_text | `task_execution_plan` | Orchestrator's plan written before dispatch. write-once |
| Working Directory | rich_text | `task_working_directory` | claude-code: absolute path. cowork: workspace-relative path |
| Session Reference | rich_text | `task_session_ref` | Written after dispatch: tmux session name / Cowork task ID |
| Dispatched At | date | `task_dispatched_at` | Dispatch timestamp. Used for timeout detection |
| Agent Output | rich_text | `task_agent_output` | Execution result |
| Error Message | rich_text | `task_error_message` | Written on failure only. Query with "Error Message is not empty" |

### Extended Fields (optional — graceful degradation if absent)

| Property | Notion Type | Canonical Role | Notes |
|---|---|---|---|
| Context | rich_text | `task_context` | Background info, constraints |
| Artifacts | rich_text | `task_artifacts` | PR URLs, file paths (newline-separated) |
| Repository | url | `task_repository` | GitHub repository URL |
| Due Date | date | `task_due_date` | ISO format |
| Tags | multi_select | `task_tags` | Free tags |
| Parent Task | relation | `task_parent` | Self-relation (hierarchy) |
| Assignees | people | `task_assignees` | Human executor assignment |
| Branch | rich_text | `task_branch` | Git branch name (e.g. feature/task-slug). Leave blank to work on the current branch |
| Source Message ID | rich_text | `task_source_message_id` | Messaging tool message unique ID (e.g. Slack `channel_id:ts`). Used for cross-member dedup |

### Auto-Repair DDL for Extended Fields

If `Source Message ID` is missing and needed, repair with:
```
ADD COLUMN "Source Message ID" RICH_TEXT
```

## Intake Log Database

The Intake Log DB tracks processed message IDs to avoid reprocessing. It is created automatically by the ingesting-messages skill on first run.

| Property | Notion Type | Description |
|---|---|---|
| Message ID | title | Message unique ID (e.g. Slack: `channel_id:ts`) |
| Tool Name | select | `slack` / `teams` / `discord` |
| Processed At | date | Processing timestamp |

The database ID is stored in the config page as `intakeLogDatabaseId`.

## Querying Tasks

Use the first available query path (checked in order):

### Query Path Detection

1. **Cowork + `notion-query` tool available** → Path 2 (Extension)
2. **`NOTION_TOKEN` env var set** (check: run `echo $NOTION_TOKEN` via Bash) → Path 1 (API script)
3. **Otherwise** → Path 3 (MCP fallback)

### Path 1: Notion API Script (requires NOTION_TOKEN)

Call the query script for server-side filtering:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/notion/scripts/query-tasks.sh \
  "<tasksDatabaseId>" '<filter_json>' '<sort_json>'
```

The script returns `{"results": [...]}` with full page objects including all properties.

#### Filter Recipes

**Tasks assigned to a user:**
```json
{"property":"Assignees","people":{"contains":"<user_id>"}}
```

**Ready tasks assigned to a user:**
```json
{"and":[{"property":"Status","select":{"equals":"Ready"}},{"property":"Assignees","people":{"contains":"<user_id>"}}]}
```

**In Progress tasks (for concurrency check):**
```json
{"and":[{"property":"Status","select":{"equals":"In Progress"}},{"property":"Assignees","people":{"contains":"<user_id>"}}]}
```

**Ready tasks by executor and assignee:**
```json
{"and":[{"property":"Status","select":{"equals":"Ready"}},{"property":"Executor","select":{"equals":"claude-code"}},{"property":"Assignees","people":{"contains":"<user_id>"}}]}
```

**Sort by Priority then Due Date:**
```json
[{"property":"Priority","direction":"ascending"},{"property":"Due Date","direction":"ascending"}]
```

### Path 2: notion-query Extension (Cowork)

When the `notion-query` MCP tool is available (installed via Desktop Extension), call it directly:

```
notion-query({ database_id: "<tasksDatabaseId>", filter: <filter_object>, sorts: <sort_array> })
```

The tool accepts the same filter/sort objects as Path 1's filter recipes. It returns `{"results": [...]}` with full page objects.

**Build & install:** See `skills/providers/notion/extension/` for source and build instructions.

### Path 3: MCP Fallback (no token, no extension)

Use `notion-search` with `data_source_url` to find task pages, then `notion-fetch` each page individually to get properties. Filter client-side by checking property values.

This is the slowest path — use only when Path 1 and Path 2 are unavailable.

### Post-Processing (all paths)

- **Blocked By resolved**: Check that the `Blocked By` relation array is empty OR fetch each referenced task's Status and confirm all are "Done". This cannot be filtered server-side.
- **Sort** (if not done server-side): Priority — Urgent > High > Medium > Low; then by Due Date (earliest first).

## Task Record Reference

When referring to a task in dispatch prompts and completion instructions, use:
- **Task ID**: the Notion page ID (from the `id` field when the task was created)
- **Update instruction**: "Use `notion-update-page` with page ID `<Page ID>` to write results to Agent Output and update Status."

In the Cowork environment, the dispatch prompt is set as the Scheduled Task's prompt.
Notion MCP tools (notion-update-page) are available in both environments.

## Pushing Data to View Server

After any task operation (create, update, delete), push fresh data to the local view server:

1. Retrieve all tasks via `notion-fetch` on the tasks data source URL
2. Format the response as a `TasksResponse` JSON object:
   ```json
   { "tasks": [...], "updatedAt": "<ISO timestamp>" }
   ```
3. POST to `http://localhost:3456/api/data` with `Content-Type: application/json`

```bash
# Silently skip if server is not running
curl -s http://localhost:3456/api/health -o /dev/null 2>/dev/null && \
  curl -s -X POST http://localhost:3456/api/data \
    -H "Content-Type: application/json" -d '<json>' -o /dev/null 2>/dev/null || true
```

---

## Identity: Resolve Current User

Called by `resolving-identity` shared skill when `active_provider = notion`.

1. Call `notion-get-users` with `user_id: "self"`.
2. Map the response:
   - `id` ← `response.id`
   - `name` ← `response.name`
   - `email` ← `response.person.email` (null if Bot user)
3. Save to session variable `current_user: { id, name, email }`.
4. **Fallback**: If `notion-get-users` is unavailable or fails:
   - `id` ← `"unknown"`
   - `name` ← `$USER` environment variable or "local"
   - `email` ← null

## Identity: Resolve Team Membership

Called by `resolving-identity` shared skill when `teamsDatabaseId` is present in config.

1. Call `notion-fetch` on `teamsDatabaseId` to retrieve all team pages.
2. For each team, inspect the `Members` people field. Check if `current_user.id` is present in the array.
3. Set `current_user.teams` to the list of matching teams: `[{ id, name, members: [{ id, name }] }]`.
4. Determine `current_team`:
   - 1 matching team → automatically set `current_team` to that team.
   - 2+ matching teams → use AskUserQuestion: "You belong to multiple teams: [list]. Which team are you working with now?"
   - 0 matching teams → set `current_team: null`.
5. If `current_team` is set, populate `current_team.members` with all members from that team's `Members` field (array of `{ id, name }`). This is used by downstream skills for team-scoped filtering.

## Identity: List Org Members

Called by `resolving-identity` shared skill when `org_members` lookup is needed.

1. Call `notion-get-users` with no arguments to list all workspace members.
2. Map each user to `OrgMember { id, name, email }`:
   - `id` ← `user.id`
   - `name` ← `user.name`
   - `email` ← `user.person.email` (null for Bot users)
3. Save to session variable `org_members: OrgMember[]`.
4. **Fallback**: If `notion-get-users` is unavailable, set `org_members: []` and return.
   The `looking-up-members` skill will then fall back to TeamsDB Members field.

## Identity: Self-Task Detection

To determine whether a task is assigned to the current user:

- Fetch the task's `Assignees` property (people type — returns an array of person objects).
- Check if any element in the array has `id === current_user.id`.
- Use this check when filtering tasks in `viewing-my-tasks` and `executing-tasks`.
