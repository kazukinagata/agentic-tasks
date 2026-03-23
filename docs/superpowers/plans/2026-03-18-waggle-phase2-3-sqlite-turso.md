# Waggle Phase 2-3: SQLite & Turso Providers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQLite (local zero-setup) and Turso (remote sync) providers so users can run waggle without Notion.

**Architecture:** Both providers share the same SQL schema. SQLite uses `sqlite3` CLI, Turso uses the libSQL HTTP pipeline API. Config is stored in `~/.waggle/config.json`. Detection is via config file or env var. Claude performs CRUD via Bash tool running sqlite3/curl commands as instructed by the provider SKILL.md.

**Tech Stack:** SQLite3, Bash, jq, curl, libSQL HTTP API (Turso)

---

## File Structure

```
providers/
  sqlite/
    SKILL.md             — Provider interface: CRUD via sqlite3 CLI
    setup.md             — Setup wizard: create DB + tables
    scripts/
      init-db.sh         — Create database, tables, indexes
      query-tasks.sh     — Query tasks with SQL WHERE/ORDER, output JSON
  turso/
    SKILL.md             — Provider interface: CRUD via Turso HTTP API
    setup.md             — Setup wizard: connect to Turso
    scripts/
      init-db.sh         — Create tables via Turso HTTP API
      query-tasks.sh     — Query tasks via Turso HTTP API, output JSON
      turso-exec.sh      — Low-level: execute SQL via Turso pipeline API
```

Shared SQL schema is defined in `sqlite/scripts/init-db.sh` and replicated in `turso/scripts/init-db.sh`.

Modified files:
- `skills/detecting-provider/SKILL.md` — Add config file detection
- `skills/setting-up-tasks/SKILL.md` — Add SQLite/Turso to provider choices
- `skills/resolving-identity/SKILL.md` — Add SQLite/Turso fallback identity

---

### Task 1: SQLite schema and init script

**Files:**
- Create: `skills/providers/sqlite/scripts/init-db.sh`

- [ ] **Step 1: Create the script directory**

```bash
mkdir -p /home/kazukinagata/projects/playground/waggle/skills/providers/sqlite/scripts
```

- [ ] **Step 2: Write init-db.sh**

Create `skills/providers/sqlite/scripts/init-db.sh`:

```bash
#!/usr/bin/env bash
# Initialize waggle SQLite database with schema.
#
# Usage: init-db.sh [db_path]
#   db_path defaults to ~/.waggle/tasks.db

set -euo pipefail

DB_PATH="${1:-$HOME/.waggle/tasks.db}"
mkdir -p "$(dirname "$DB_PATH")"

sqlite3 "$DB_PATH" <<'SQL'
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  acceptance_criteria TEXT DEFAULT '',
  status TEXT DEFAULT 'Backlog' CHECK(status IN ('Backlog','Ready','In Progress','In Review','Done','Blocked')),
  priority TEXT CHECK(priority IN ('Urgent','High','Medium','Low')),
  executor TEXT CHECK(executor IN ('claude-desktop','cli','human')),
  requires_review INTEGER DEFAULT 0,
  execution_plan TEXT DEFAULT '',
  working_directory TEXT DEFAULT '',
  session_reference TEXT DEFAULT '',
  dispatched_at TEXT,
  agent_output TEXT DEFAULT '',
  error_message TEXT DEFAULT '',
  context TEXT DEFAULT '',
  artifacts TEXT DEFAULT '',
  repository TEXT,
  due_date TEXT,
  tags TEXT DEFAULT '[]',
  parent_task_id TEXT REFERENCES tasks(id),
  project TEXT,
  team TEXT,
  assignees TEXT DEFAULT '[]',
  branch TEXT DEFAULT '',
  source_message_id TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_by_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, blocked_by_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  members TEXT DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_executor ON tasks(executor);

CREATE TABLE IF NOT EXISTS intake_log (
  message_id TEXT PRIMARY KEY,
  tool_name TEXT CHECK(tool_name IN ('slack','teams','discord')),
  processed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
SQL

echo "Database initialized at $DB_PATH"
```

- [ ] **Step 3: Make executable and test**

```bash
chmod +x /home/kazukinagata/projects/playground/waggle/skills/providers/sqlite/scripts/init-db.sh
bash /home/kazukinagata/projects/playground/waggle/skills/providers/sqlite/scripts/init-db.sh /tmp/waggle-test.db
sqlite3 /tmp/waggle-test.db ".tables"
rm /tmp/waggle-test.db
```

Expected output includes: `intake_log  task_dependencies  tasks  teams`

- [ ] **Step 4: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/providers/sqlite/
git commit -m "feat(sqlite): add database init script with full schema

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: SQLite query script

**Files:**
- Create: `skills/providers/sqlite/scripts/query-tasks.sh`

- [ ] **Step 1: Write query-tasks.sh**

Create `skills/providers/sqlite/scripts/query-tasks.sh`:

```bash
#!/usr/bin/env bash
# Query waggle SQLite database and output JSON.
#
# Usage: query-tasks.sh <db_path> [where_clause] [order_clause] [limit]
#
# Arguments:
#   db_path       — Path to SQLite database file
#   where_clause  — (optional) SQL WHERE clause without "WHERE" keyword
#   order_clause  — (optional) SQL ORDER BY clause without "ORDER BY" keyword
#   limit         — (optional) Max number of rows
#
# Output:
#   JSON object: {"results": [...tasks with blocked_by arrays...]}
#
# Examples:
#   query-tasks.sh ~/.waggle/tasks.db
#   query-tasks.sh ~/.waggle/tasks.db "status = 'Ready'"
#   query-tasks.sh ~/.waggle/tasks.db "status = 'Ready' AND executor = 'cli'" "priority ASC"

set -euo pipefail

DB_PATH="${1:?Usage: query-tasks.sh <db_path> [where_clause] [order_clause] [limit]}"
WHERE_CLAUSE="${2:-}"
ORDER_CLAUSE="${3:-}"
LIMIT="${4:-}"

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database file not found: $DB_PATH" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

# Build SQL query
SQL="SELECT t.*, GROUP_CONCAT(td.blocked_by_id) as blocked_by_ids FROM tasks t LEFT JOIN task_dependencies td ON t.id = td.task_id"

if [ -n "$WHERE_CLAUSE" ]; then
  SQL="$SQL WHERE $WHERE_CLAUSE"
fi

SQL="$SQL GROUP BY t.id"

if [ -n "$ORDER_CLAUSE" ]; then
  SQL="$SQL ORDER BY $ORDER_CLAUSE"
fi

if [ -n "$LIMIT" ]; then
  SQL="$SQL LIMIT $LIMIT"
fi

# Execute and output JSON
sqlite3 -json "$DB_PATH" "$SQL" | jq '{
  results: [.[] | {
    id: .id,
    title: .title,
    description: .description,
    acceptance_criteria: .acceptance_criteria,
    status: .status,
    priority: .priority,
    executor: .executor,
    requires_review: (.requires_review == 1),
    execution_plan: .execution_plan,
    working_directory: .working_directory,
    session_reference: .session_reference,
    dispatched_at: .dispatched_at,
    agent_output: .agent_output,
    error_message: .error_message,
    context: .context,
    artifacts: .artifacts,
    repository: .repository,
    due_date: .due_date,
    tags: (.tags | if . == null or . == "" then [] else (try fromjson catch []) end),
    parent_task_id: .parent_task_id,
    project: .project,
    team: .team,
    assignees: (.assignees | if . == null or . == "" then [] else (try fromjson catch []) end),
    branch: .branch,
    source_message_id: .source_message_id,
    blocked_by: (.blocked_by_ids | if . == null or . == "" then [] else split(",") end),
    created_at: .created_at,
    updated_at: .updated_at
  }]
}'
```

- [ ] **Step 2: Make executable and test**

```bash
chmod +x /home/kazukinagata/projects/playground/waggle/skills/providers/sqlite/scripts/query-tasks.sh

# Create test DB and insert test data
bash /home/kazukinagata/projects/playground/waggle/skills/providers/sqlite/scripts/init-db.sh /tmp/waggle-test.db
sqlite3 /tmp/waggle-test.db "INSERT INTO tasks (id, title, status, priority) VALUES ('test1', 'Test Task', 'Ready', 'High');"
sqlite3 /tmp/waggle-test.db "INSERT INTO tasks (id, title, status, priority) VALUES ('test2', 'Blocked Task', 'Blocked', 'Medium');"
sqlite3 /tmp/waggle-test.db "INSERT INTO task_dependencies (task_id, blocked_by_id) VALUES ('test2', 'test1');"

# Test query all
bash /home/kazukinagata/projects/playground/waggle/skills/providers/sqlite/scripts/query-tasks.sh /tmp/waggle-test.db

# Test filtered query
bash /home/kazukinagata/projects/playground/waggle/skills/providers/sqlite/scripts/query-tasks.sh /tmp/waggle-test.db "status = 'Ready'"

rm /tmp/waggle-test.db
```

Expected: JSON output with `{"results": [...]}` containing tasks with blocked_by arrays.

- [ ] **Step 3: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/providers/sqlite/
git commit -m "feat(sqlite): add query script with JSON output

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: SQLite SKILL.md

**Files:**
- Create: `skills/providers/sqlite/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `skills/providers/sqlite/SKILL.md`:

```markdown
# Waggle — SQLite Provider

This file contains all SQLite-specific implementation details for waggle.
Load this file when the active provider is **sqlite**.

## Config Retrieval

When `detecting-provider` requests config retrieval for the SQLite provider:

1. Read `~/.waggle/config.json`
2. Parse and set the following as the `headless_config` session variable:
   - `dbPath` (required) — path to the SQLite database file
   - `teamsDatabaseExists` (optional — true if teams table has rows)
   - `maxConcurrentAgents` (optional — default: 3)

If `~/.waggle/config.json` is not found, instruct the user to run the **setting-up-tasks** skill, then stop.

## Schema Validation

After loading config, verify the database exists and has the correct schema:

```bash
sqlite3 "<dbPath>" ".tables"
```

Expected tables: `tasks`, `task_dependencies`, `teams`, `intake_log`.

If any table is missing, run the init script to auto-repair:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/init-db.sh "<dbPath>"
```

## CRUD Operations

### Create Task

```bash
sqlite3 "<dbPath>" "INSERT INTO tasks (title, description, acceptance_criteria, status, priority, executor, requires_review, execution_plan, working_directory, assignees) VALUES ('<title>', '<description>', '<criteria>', '<status>', '<priority>', '<executor>', <0|1>, '<plan>', '<dir>', '<assignees_json>'); SELECT last_insert_rowid();"
```

To get the generated ID, use:
```bash
sqlite3 "<dbPath>" "INSERT INTO tasks (title, status) VALUES ('<title>', 'Backlog') RETURNING id;"
```

**IMPORTANT:** Escape single quotes in values by doubling them: `'` → `''`.

### Update Task

```bash
sqlite3 "<dbPath>" "UPDATE tasks SET <field> = '<value>', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = '<task_id>';"
```

For multiple fields:
```bash
sqlite3 "<dbPath>" "UPDATE tasks SET status = '<status>', agent_output = '<output>', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = '<task_id>';"
```

### Get Task

```bash
sqlite3 -json "<dbPath>" "SELECT t.*, GROUP_CONCAT(td.blocked_by_id) as blocked_by_ids FROM tasks t LEFT JOIN task_dependencies td ON t.id = td.task_id WHERE t.id = '<task_id>' GROUP BY t.id;"
```

### Delete Task

```bash
sqlite3 "<dbPath>" "DELETE FROM tasks WHERE id = '<task_id>';"
```

Dependencies are automatically removed via `ON DELETE CASCADE`.

### Manage Dependencies (Blocked By)

Add dependency:
```bash
sqlite3 "<dbPath>" "INSERT OR IGNORE INTO task_dependencies (task_id, blocked_by_id) VALUES ('<task_id>', '<blocker_id>');"
```

Remove dependency:
```bash
sqlite3 "<dbPath>" "DELETE FROM task_dependencies WHERE task_id = '<task_id>' AND blocked_by_id = '<blocker_id>';"
```

## Querying Tasks

Use the query script for filtered queries with JSON output:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh \
  "<dbPath>" '<where_clause>' '<order_clause>'
```

### Filter Recipes

**All tasks (no filter):**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh "<dbPath>"
```

**Ready tasks:**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh "<dbPath>" "t.status = 'Ready'"
```

**Tasks by executor and status:**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh "<dbPath>" "t.status = 'Ready' AND t.executor = 'cli'"
```

**Tasks assigned to current user:**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh "<dbPath>" "t.assignees LIKE '%<user_id>%'"
```

**In Progress tasks (for concurrency check):**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh "<dbPath>" "t.status = 'In Progress' AND t.assignees LIKE '%<user_id>%'"
```

**Sort by Priority then Due Date:**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh "<dbPath>" "" \
  "CASE t.priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END ASC, t.due_date ASC"
```

### Post-Processing (all queries)

- **Blocked By resolved**: Check that the `blocked_by` array is empty OR query each blocked_by task and confirm all have status = 'Done'.
- **Sort** (if not done in query): Priority — Urgent > High > Medium > Low; then by Due Date (earliest first).

### Displaying Task Lists

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh "<dbPath>" '<where>' '<order>' | \
  jq '[.results[] | {id, title, status, priority, executor, assignees, due_date, blocked_by: (.blocked_by | length | tostring) + " deps"}]'
```

## Task Record Reference

When referring to a task in dispatch prompts and completion instructions, use:
- **Task ID**: the hex string ID from the `id` column
- **Update instruction**: "Run: `sqlite3 <dbPath> \"UPDATE tasks SET agent_output = '<result>', status = 'Done', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = '<task_id>';\"`"

## Pushing Data to View Server

After any task operation (create, update, delete), push fresh data to the local view server:

1. Fetch all tasks:
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh "<dbPath>"
```

2. Format as TasksResponse and POST:
```bash
TASKS_JSON=$(bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/query-tasks.sh "<dbPath>" | jq -c '{tasks: [.results[] | {
  id, title, description, acceptanceCriteria: .acceptance_criteria, status, blockedBy: .blocked_by,
  priority, executor, requiresReview: .requires_review, executionPlan: .execution_plan,
  workingDirectory: .working_directory, sessionReference: .session_reference,
  dispatchedAt: .dispatched_at, agentOutput: .agent_output, errorMessage: .error_message,
  context, artifacts, repository, dueDate: .due_date, tags, parentTaskId: .parent_task_id,
  project, team, assignees, url: ""
}], updatedAt: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))}')

curl -s http://localhost:3456/api/health -o /dev/null 2>/dev/null && \
  curl -s -X POST http://localhost:3456/api/data \
    -H "Content-Type: application/json" -d "$TASKS_JSON" -o /dev/null 2>/dev/null || true
```

## Identity: Resolve Current User

Called by `resolving-identity` shared skill when `active_provider = sqlite`.

SQLite is local — no remote user system. Set:
- `id` ← `"local"`
- `name` ← `$USER` environment variable or `"local"`
- `email` ← `null`

## Identity: Resolve Team Membership

If teams table has rows:
1. Query: `sqlite3 -json "<dbPath>" "SELECT * FROM teams;"`
2. Parse members JSON array for each team
3. Match by name (case-insensitive) against `current_user.name`
4. Set `current_user.teams` and `current_team` per the same logic as other providers

## Identity: List Org Members

SQLite is local — return members from teams table if available, otherwise `org_members: []`.

```bash
sqlite3 -json "<dbPath>" "SELECT members FROM teams;" | jq '[.[].members | fromjson | .[] ] | unique_by(.name)'
```
```

- [ ] **Step 2: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/providers/sqlite/
git commit -m "feat(sqlite): add provider SKILL.md with CRUD and query interface

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: SQLite setup.md

**Files:**
- Create: `skills/providers/sqlite/setup.md`

- [ ] **Step 1: Write setup.md**

Create `skills/providers/sqlite/setup.md`:

```markdown
# Waggle — SQLite Provider Setup

## Step 1: Prerequisites

Verify sqlite3 and jq are available:

```bash
command -v sqlite3 && echo "sqlite3: OK" || echo "sqlite3: NOT FOUND"
command -v jq && echo "jq: OK" || echo "jq: NOT FOUND"
```

If either is missing, guide the user:
- **sqlite3**: `sudo apt install sqlite3` (Linux) / `brew install sqlite` (macOS)
- **jq**: `sudo apt install jq` (Linux) / `brew install jq` (macOS)

## Step 2: Initialize Database

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/sqlite/scripts/init-db.sh
```

This creates `~/.waggle/tasks.db` with all required tables.

## Step 3: Create Config

Write `~/.waggle/config.json`:

```json
{
  "provider": "sqlite",
  "dbPath": "~/.waggle/tasks.db",
  "maxConcurrentAgents": 3
}
```

Use Bash to create:
```bash
mkdir -p ~/.waggle
cat > ~/.waggle/config.json << 'EOF'
{
  "provider": "sqlite",
  "dbPath": "~/.waggle/tasks.db",
  "maxConcurrentAgents": 3
}
EOF
```

## Step 4: Verify

Insert and query a test task:

```bash
DB_PATH="$HOME/.waggle/tasks.db"
sqlite3 "$DB_PATH" "INSERT INTO tasks (title, status, priority) VALUES ('Setup test', 'Backlog', 'Low') RETURNING id, title, status;"
```

If the insert succeeds, report:
> "SQLite provider is set up. Database at `~/.waggle/tasks.db`. Ready to use."

Then delete the test task:
```bash
sqlite3 "$DB_PATH" "DELETE FROM tasks WHERE title = 'Setup test';"
```
```

- [ ] **Step 2: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/providers/sqlite/
git commit -m "feat(sqlite): add setup wizard

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Update detecting-provider for SQLite and config file

**Files:**
- Modify: `skills/detecting-provider/SKILL.md`

- [ ] **Step 1: Read the current file**

Read `skills/detecting-provider/SKILL.md`.

- [ ] **Step 2: Add config file detection between Layer 1 and Layer 2**

After the Layer 1 section (after line 23), insert a new section:

```markdown
## Layer 1b: Config File Detection

If no MCP provider was detected in Layer 1, check for a local config file:

1. Read `~/.waggle/config.json` (via Bash: `cat ~/.waggle/config.json 2>/dev/null`)
2. If the file exists and contains `"provider"`:
   - `"provider": "sqlite"` → `active_provider = "sqlite"`
   - `"provider": "turso"` → `active_provider = "turso"`
   - **REQUIRED — Read the corresponding provider SKILL.md** (same instruction as Layer 1).
```

- [ ] **Step 3: Update the "No MCP Detected" section**

Replace:
```markdown
## No MCP Detected
If no provider MCP is found at all, inform the user they need to run the **setting-up-tasks** skill first to configure a data source, then stop.
```

With:
```markdown
## No Provider Detected
If no provider is found via MCP tools or config file, inform the user they need to run the **setting-up-tasks** skill first to configure a data source, then stop.
```

- [ ] **Step 4: Update Config Retrieval section**

After the existing Config Retrieval section, add a note:

```markdown
For `sqlite` and `turso` providers, config is read directly from `~/.waggle/config.json` and stored in `headless_config`. The provider SKILL.md Config Retrieval section has the details.
```

- [ ] **Step 5: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/detecting-provider/
git commit -m "feat: add config file detection for SQLite/Turso providers

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Update setting-up-tasks for SQLite option

**Files:**
- Modify: `skills/setting-up-tasks/SKILL.md`

- [ ] **Step 1: Read the current file**

Read `skills/setting-up-tasks/SKILL.md`.

- [ ] **Step 2: Update Layer 1 detection**

Add SQLite detection to Step 1:
```markdown
- `~/.waggle/config.json` exists with `"provider": "sqlite"` → SQLite is already configured
```

- [ ] **Step 3: Update provider choice prompt**

Replace the AskUserQuestion in Step 2:
```markdown
> "Which data source would you like to use for Agentic Tasks?
> - **Notion** — recommended for teams, rich UI, free tier available
> - Other providers coming soon (SQLite, Airtable, etc.)"
```

With:
```markdown
> "Which data source would you like to use for waggle?
> - **SQLite** — instant local setup, zero external dependencies
> - **Notion** — team collaboration via Notion workspace
> - **Turso** — remote SQLite for multi-agent sync (requires Turso account)"
```

- [ ] **Step 4: Add SQLite MCP setup section**

SQLite requires no MCP setup. After the MCP setup sections, add:

```markdown
### SQLite — No MCP Required

SQLite requires no external MCP server. Proceed directly to Step 3.
```

- [ ] **Step 5: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/setting-up-tasks/
git commit -m "feat: add SQLite and Turso to provider selection in setup

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: SQLite integration test

- [ ] **Step 1: Full lifecycle test**

```bash
# Setup
DB_PATH="/tmp/waggle-integration-test.db"
SCRIPT_DIR="/home/kazukinagata/projects/playground/waggle/skills/providers/sqlite/scripts"

# Init
bash "$SCRIPT_DIR/init-db.sh" "$DB_PATH"

# Create tasks
sqlite3 "$DB_PATH" "INSERT INTO tasks (id, title, description, acceptance_criteria, status, priority, executor, working_directory) VALUES ('t1', 'Build API', 'Build REST API', 'Tests pass', 'Ready', 'High', 'cli', '/tmp');"
sqlite3 "$DB_PATH" "INSERT INTO tasks (id, title, status, priority) VALUES ('t2', 'Write docs', 'Backlog', 'Medium');"
sqlite3 "$DB_PATH" "INSERT INTO task_dependencies (task_id, blocked_by_id) VALUES ('t2', 't1');"

# Query all
echo "=== All tasks ==="
bash "$SCRIPT_DIR/query-tasks.sh" "$DB_PATH" | jq '.results | length'

# Query filtered
echo "=== Ready tasks ==="
bash "$SCRIPT_DIR/query-tasks.sh" "$DB_PATH" "t.status = 'Ready'" | jq '.results[].title'

# Query with blocked_by
echo "=== Blocked by ==="
bash "$SCRIPT_DIR/query-tasks.sh" "$DB_PATH" "t.id = 't2'" | jq '.results[0].blocked_by'

# Update
sqlite3 "$DB_PATH" "UPDATE tasks SET status = 'In Progress', dispatched_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = 't1';"
echo "=== After update ==="
bash "$SCRIPT_DIR/query-tasks.sh" "$DB_PATH" "t.id = 't1'" | jq '.results[0].status'

# View server format
echo "=== View server JSON ==="
bash "$SCRIPT_DIR/query-tasks.sh" "$DB_PATH" | jq -c '{tasks: [.results[] | {id, title, status, priority, executor, blockedBy: .blocked_by, requiresReview: .requires_review}], updatedAt: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))}' | jq '.tasks | length'

# Cleanup
rm "$DB_PATH"
echo "=== Integration test PASSED ==="
```

Expected: All queries return correct data, 2 tasks total, 1 Ready, blocked_by shows ["t1"], status updates to "In Progress".

- [ ] **Step 2: Commit test results (if any fixes needed)**

---

### Task 8: Turso execution helper script

**Files:**
- Create: `skills/providers/turso/scripts/turso-exec.sh`

- [ ] **Step 1: Create script directory**

```bash
mkdir -p /home/kazukinagata/projects/playground/waggle/skills/providers/turso/scripts
```

- [ ] **Step 2: Write turso-exec.sh**

Create `skills/providers/turso/scripts/turso-exec.sh`:

```bash
#!/usr/bin/env bash
# Execute SQL statement(s) against a Turso database via HTTP pipeline API.
#
# Usage: turso-exec.sh <sql_statement> [sql_statement2] ...
#
# Environment:
#   TURSO_URL        (required) — Turso database HTTP URL (e.g. https://db-name-org.turso.io)
#   TURSO_AUTH_TOKEN (required) — Turso authentication token
#
# Output:
#   JSON response from Turso pipeline API

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: turso-exec.sh <sql_statement> [sql_statement2] ..." >&2
  exit 1
fi

if [ -z "${TURSO_URL:-}" ]; then
  echo "Error: TURSO_URL environment variable is not set." >&2
  exit 1
fi

if [ -z "${TURSO_AUTH_TOKEN:-}" ]; then
  echo "Error: TURSO_AUTH_TOKEN environment variable is not set." >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

# Build requests array
REQUESTS="[]"
for sql in "$@"; do
  REQUESTS=$(echo "$REQUESTS" | jq --arg s "$sql" '. + [{"type": "execute", "stmt": {"sql": $s}}]')
done

# Add close request
REQUESTS=$(echo "$REQUESTS" | jq '. + [{"type": "close"}]')

BODY=$(jq -n --argjson r "$REQUESTS" '{"requests": $r}')

response=$(curl -s -w "\n%{http_code}" -X POST "${TURSO_URL}/v2/pipeline" \
  -H "Authorization: Bearer ${TURSO_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY")

http_code=$(echo "$response" | tail -1)
response_body=$(echo "$response" | sed '$d')

if [ "$http_code" -ne 200 ]; then
  echo "Error: Turso API returned HTTP ${http_code}" >&2
  echo "$response_body" >&2
  exit 1
fi

echo "$response_body"
```

- [ ] **Step 3: Make executable**

```bash
chmod +x /home/kazukinagata/projects/playground/waggle/skills/providers/turso/scripts/turso-exec.sh
```

- [ ] **Step 4: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/providers/turso/
git commit -m "feat(turso): add HTTP pipeline API execution helper

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Turso init and query scripts

**Files:**
- Create: `skills/providers/turso/scripts/init-db.sh`
- Create: `skills/providers/turso/scripts/query-tasks.sh`

- [ ] **Step 1: Write init-db.sh**

Create `skills/providers/turso/scripts/init-db.sh`:

```bash
#!/usr/bin/env bash
# Initialize waggle tables in a Turso database.
#
# Environment:
#   TURSO_URL        (required)
#   TURSO_AUTH_TOKEN (required)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/turso-exec.sh" \
  "CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    acceptance_criteria TEXT DEFAULT '',
    status TEXT DEFAULT 'Backlog' CHECK(status IN ('Backlog','Ready','In Progress','In Review','Done','Blocked')),
    priority TEXT CHECK(priority IN ('Urgent','High','Medium','Low')),
    executor TEXT CHECK(executor IN ('claude-desktop','cli','human')),
    requires_review INTEGER DEFAULT 0,
    execution_plan TEXT DEFAULT '',
    working_directory TEXT DEFAULT '',
    session_reference TEXT DEFAULT '',
    dispatched_at TEXT,
    agent_output TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    context TEXT DEFAULT '',
    artifacts TEXT DEFAULT '',
    repository TEXT,
    due_date TEXT,
    tags TEXT DEFAULT '[]',
    parent_task_id TEXT REFERENCES tasks(id),
    project TEXT,
    team TEXT,
    assignees TEXT DEFAULT '[]',
    branch TEXT DEFAULT '',
    source_message_id TEXT,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )" \
  "CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    blocked_by_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, blocked_by_id)
  )" \
  "CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    members TEXT DEFAULT '[]'
  )" \
  "CREATE TABLE IF NOT EXISTS intake_log (
    message_id TEXT PRIMARY KEY,
    tool_name TEXT CHECK(tool_name IN ('slack','teams','discord')),
    processed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )" \
  "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)" \
  "CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)" \
  "CREATE INDEX IF NOT EXISTS idx_tasks_executor ON tasks(executor)" > /dev/null

echo "Turso database initialized."
```

- [ ] **Step 2: Write query-tasks.sh**

Create `skills/providers/turso/scripts/query-tasks.sh`:

```bash
#!/usr/bin/env bash
# Query waggle tasks from Turso database and output JSON.
#
# Usage: query-tasks.sh [where_clause] [order_clause] [limit]
#
# Environment:
#   TURSO_URL        (required)
#   TURSO_AUTH_TOKEN (required)

set -euo pipefail

WHERE_CLAUSE="${1:-}"
ORDER_CLAUSE="${2:-}"
LIMIT="${3:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Build SQL query
SQL="SELECT t.*, GROUP_CONCAT(td.blocked_by_id) as blocked_by_ids FROM tasks t LEFT JOIN task_dependencies td ON t.id = td.task_id"

if [ -n "$WHERE_CLAUSE" ]; then
  SQL="$SQL WHERE $WHERE_CLAUSE"
fi

SQL="$SQL GROUP BY t.id"

if [ -n "$ORDER_CLAUSE" ]; then
  SQL="$SQL ORDER BY $ORDER_CLAUSE"
fi

if [ -n "$LIMIT" ]; then
  SQL="$SQL LIMIT $LIMIT"
fi

# Execute via Turso API
RESPONSE=$("$SCRIPT_DIR/turso-exec.sh" "$SQL")

# Parse Turso pipeline response into waggle JSON format
# Turso returns: {"results": [{"response": {"type": "execute", "result": {"cols": [...], "rows": [...]}}}]}
echo "$RESPONSE" | jq '
  .results[0].response.result as $r |
  ($r.cols | map(.name)) as $cols |
  {results: [
    $r.rows[] | . as $row |
    [range($cols | length)] | map({($cols[.]): $row[.].value}) | add |
    {
      id: .id,
      title: .title,
      description: .description,
      acceptance_criteria: .acceptance_criteria,
      status: .status,
      priority: .priority,
      executor: .executor,
      requires_review: (if .requires_review == 1 or .requires_review == "1" then true else false end),
      execution_plan: .execution_plan,
      working_directory: .working_directory,
      session_reference: .session_reference,
      dispatched_at: .dispatched_at,
      agent_output: .agent_output,
      error_message: .error_message,
      context: .context,
      artifacts: .artifacts,
      repository: .repository,
      due_date: .due_date,
      tags: (.tags | if . == null or . == "" then [] else (try fromjson catch []) end),
      parent_task_id: .parent_task_id,
      project: .project,
      team: .team,
      assignees: (.assignees | if . == null or . == "" then [] else (try fromjson catch []) end),
      branch: .branch,
      source_message_id: .source_message_id,
      blocked_by: (.blocked_by_ids | if . == null or . == "" then [] else split(",") end),
      created_at: .created_at,
      updated_at: .updated_at
    }
  ]}
'
```

- [ ] **Step 3: Make executable**

```bash
chmod +x /home/kazukinagata/projects/playground/waggle/skills/providers/turso/scripts/init-db.sh
chmod +x /home/kazukinagata/projects/playground/waggle/skills/providers/turso/scripts/query-tasks.sh
```

- [ ] **Step 4: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/providers/turso/
git commit -m "feat(turso): add init and query scripts via HTTP pipeline API

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Turso SKILL.md and setup.md

**Files:**
- Create: `skills/providers/turso/SKILL.md`
- Create: `skills/providers/turso/setup.md`

- [ ] **Step 1: Write SKILL.md**

Create `skills/providers/turso/SKILL.md` — same structure as SQLite SKILL.md but using Turso HTTP API:

```markdown
# Waggle — Turso Provider

This file contains all Turso-specific implementation details for waggle.
Load this file when the active provider is **turso**.

## Config Retrieval

When `detecting-provider` requests config retrieval for the Turso provider:

1. Read `~/.waggle/config.json`
2. Parse and set the following as the `headless_config` session variable:
   - `tursoUrl` (required) — Turso database HTTP URL
   - `tursoAuthToken` (required) — Turso auth token
   - `teamsDatabaseExists` (optional)
   - `maxConcurrentAgents` (optional — default: 3)
3. Set environment variables for scripts:
   ```bash
   export TURSO_URL="<tursoUrl>"
   export TURSO_AUTH_TOKEN="<tursoAuthToken>"
   ```

If `~/.waggle/config.json` is not found or missing Turso fields, instruct the user to run the **setting-up-tasks** skill.

## Schema Validation

After loading config, verify tables exist:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/turso-exec.sh \
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected tables: `intake_log`, `task_dependencies`, `tasks`, `teams`.

If any table is missing, run init:
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/init-db.sh
```

## CRUD Operations

### Create Task

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/turso-exec.sh \
  "INSERT INTO tasks (title, description, acceptance_criteria, status, priority, executor, requires_review, execution_plan, working_directory, assignees) VALUES ('<title>', '<description>', '<criteria>', '<status>', '<priority>', '<executor>', <0|1>, '<plan>', '<dir>', '<assignees_json>') RETURNING id;"
```

**IMPORTANT:** Escape single quotes in values by doubling them: `'` → `''`.

### Update Task

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/turso-exec.sh \
  "UPDATE tasks SET <field> = '<value>', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = '<task_id>';"
```

### Get Task

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/turso-exec.sh \
  "SELECT t.*, GROUP_CONCAT(td.blocked_by_id) as blocked_by_ids FROM tasks t LEFT JOIN task_dependencies td ON t.id = td.task_id WHERE t.id = '<task_id>' GROUP BY t.id;"
```

### Delete Task

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/turso-exec.sh \
  "DELETE FROM tasks WHERE id = '<task_id>';"
```

### Manage Dependencies (Blocked By)

Same SQL as SQLite, executed via turso-exec.sh.

## Querying Tasks

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/query-tasks.sh \
  '<where_clause>' '<order_clause>'
```

Filter recipes and post-processing are identical to the SQLite provider. See SQLite SKILL.md for examples.

Note: Turso query-tasks.sh does NOT take a db_path argument (connection info comes from env vars).

## Task Record Reference

- **Task ID**: the hex string ID from the `id` column
- **Update instruction**: "Run: `bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/turso-exec.sh \"UPDATE tasks SET agent_output = '<result>', status = 'Done', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = '<task_id>';\"`"

## Pushing Data to View Server

Same pattern as SQLite provider, using `turso/scripts/query-tasks.sh` (no db_path arg):

```bash
TASKS_JSON=$(bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/query-tasks.sh | jq -c '{tasks: [.results[] | {
  id, title, description, acceptanceCriteria: .acceptance_criteria, status, blockedBy: .blocked_by,
  priority, executor, requiresReview: .requires_review, executionPlan: .execution_plan,
  workingDirectory: .working_directory, sessionReference: .session_reference,
  dispatchedAt: .dispatched_at, agentOutput: .agent_output, errorMessage: .error_message,
  context, artifacts, repository, dueDate: .due_date, tags, parentTaskId: .parent_task_id,
  project, team, assignees, url: ""
}], updatedAt: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))}')

curl -s http://localhost:3456/api/health -o /dev/null 2>/dev/null && \
  curl -s -X POST http://localhost:3456/api/data \
    -H "Content-Type: application/json" -d "$TASKS_JSON" -o /dev/null 2>/dev/null || true
```

## Identity

Same as SQLite provider — local identity based on `$USER` env var. Teams and org members from the teams table if populated.
```

- [ ] **Step 2: Write setup.md**

Create `skills/providers/turso/setup.md`:

```markdown
# Waggle — Turso Provider Setup

## Step 1: Prerequisites

Verify required tools:

```bash
command -v curl && echo "curl: OK" || echo "curl: NOT FOUND"
command -v jq && echo "jq: OK" || echo "jq: NOT FOUND"
```

## Step 2: Turso Account

Ask the user:
> "Do you already have a Turso database URL and auth token? If not, you can create one at https://turso.tech (free tier available)."

If the user needs help:
1. Sign up at https://turso.tech
2. Install Turso CLI: `curl -sSfL https://get.tur.so/install.sh | bash`
3. Login: `turso auth login`
4. Create database: `turso db create waggle`
5. Get URL: `turso db show waggle --url`
6. Create token: `turso db tokens create waggle`

## Step 3: Configure

Get the URL and token from the user via AskUserQuestion:
> "Please provide your Turso database URL (e.g. https://waggle-username.turso.io):"

Then:
> "Please provide your Turso auth token:"

Write config:
```bash
mkdir -p ~/.waggle
cat > ~/.waggle/config.json << EOF
{
  "provider": "turso",
  "tursoUrl": "<user_provided_url>",
  "tursoAuthToken": "<user_provided_token>",
  "maxConcurrentAgents": 3
}
EOF
```

Also set env vars in `~/.claude/settings.json` for script access:
```json
{
  "env": {
    "TURSO_URL": "<user_provided_url>",
    "TURSO_AUTH_TOKEN": "<user_provided_token>"
  }
}
```

## Step 4: Initialize Database

```bash
export TURSO_URL="<url>"
export TURSO_AUTH_TOKEN="<token>"
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/init-db.sh
```

## Step 5: Verify

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/turso/scripts/turso-exec.sh \
  "INSERT INTO tasks (title, status, priority) VALUES ('Setup test', 'Backlog', 'Low') RETURNING id, title, status;" \
  "DELETE FROM tasks WHERE title = 'Setup test';"
```

If successful, report:
> "Turso provider is set up. Database at `<turso_url>`. Ready to use."
```

- [ ] **Step 3: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/providers/turso/
git commit -m "feat(turso): add provider SKILL.md and setup wizard

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Update detecting-provider for Turso

**Files:**
- Modify: `skills/detecting-provider/SKILL.md`

- [ ] **Step 1: Verify Turso is already covered**

The Layer 1b section added in Task 5 already handles `"provider": "turso"` from `~/.waggle/config.json`. Additionally, check that the `TURSO_URL` env var can serve as a detection signal.

Add to Layer 1b:

```markdown
3. Alternatively, if `TURSO_URL` environment variable is set (check via Bash: `[ -n "$TURSO_URL" ] && echo "SET"`):
   - `active_provider = "turso"`
   - **REQUIRED — Read the corresponding provider SKILL.md.**
```

- [ ] **Step 2: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add skills/detecting-provider/
git commit -m "feat: add TURSO_URL env var detection for Turso provider

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Update README and version bump

**Files:**
- Modify: `README.md`
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Update README providers table**

Replace the providers table in README.md:

```markdown
| Provider | Use Case | Status |
|---|---|---|
| **SQLite** | Local, instant, zero-setup | Available |
| **Notion** | Team collaboration via Notion workspace | Available |
| **Turso** | Remote SQLite, multi-agent sync | Available |
```

- [ ] **Step 2: Version bump**

Update `.claude-plugin/plugin.json` version from `"1.0.0"` to `"1.1.0"` (new features: two new providers).

- [ ] **Step 3: Commit**

```bash
cd /home/kazukinagata/projects/playground/waggle && git add README.md .claude-plugin/plugin.json
git commit -m "feat: mark SQLite and Turso providers as available, bump to v1.1.0

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Final verification

- [ ] **Step 1: Verify file structure**

```bash
cd /home/kazukinagata/projects/playground/waggle
find skills/providers/sqlite skills/providers/turso -type f | sort
```

Expected:
```
skills/providers/sqlite/SKILL.md
skills/providers/sqlite/scripts/init-db.sh
skills/providers/sqlite/scripts/query-tasks.sh
skills/providers/sqlite/setup.md
skills/providers/turso/SKILL.md
skills/providers/turso/scripts/init-db.sh
skills/providers/turso/scripts/query-tasks.sh
skills/providers/turso/scripts/turso-exec.sh
skills/providers/turso/setup.md
```

- [ ] **Step 2: Run SQLite integration test again**

```bash
DB_PATH="/tmp/waggle-final-test.db"
SCRIPT_DIR="/home/kazukinagata/projects/playground/waggle/skills/providers/sqlite/scripts"
bash "$SCRIPT_DIR/init-db.sh" "$DB_PATH"
sqlite3 "$DB_PATH" "INSERT INTO tasks (id, title, status, priority) VALUES ('t1', 'Test', 'Ready', 'High');"
bash "$SCRIPT_DIR/query-tasks.sh" "$DB_PATH" | jq '.results | length'
rm "$DB_PATH"
```

Expected: `1`

- [ ] **Step 3: Run existing view server tests**

```bash
cd /home/kazukinagata/projects/playground/waggle/skills/viewing-tasks/server && npm test
```

Expected: All 33 tests pass (no regression).

- [ ] **Step 4: Verify no broken references**

```bash
cd /home/kazukinagata/projects/playground/waggle
grep -r "agentic-tasks" skills/providers/sqlite/ skills/providers/turso/ || echo "No stale references"
```

Expected: No stale references.
