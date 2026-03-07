# Headless Tasks — Notion Provider Setup

This file contains Notion-specific setup steps. It is called by the task-setup skill
after the active provider has been confirmed as **notion**.

## Step 1: Verify Notion MCP Connection

Call `notion-search` with query "test" to confirm the Notion MCP connection is working.

If it fails, guide the user to set up the Notion MCP in their environment:

**Claude Code:**
Add the following to `~/.claude/settings.json` under `"mcpServers"`:
```json
"notion": {
  "type": "http",
  "url": "https://mcp.notion.com/mcp"
}
```
Then restart Claude Code and run the setup skill again.

**Cowork:**
Open Cowork settings → MCP Servers → Add Server → Enter `https://mcp.notion.com/mcp`.
Authenticate with your Notion account when prompted.

## Step 2: Choose Parent Page Location

Use `AskUserQuestion` to ask:
> "Where should I create the Headless Tasks workspace in Notion? Please provide a parent page name or URL. (Leave blank to create at the root of your workspace.)"

## Step 3: Create Parent Page

Create a parent page using `notion-create-pages`:
- Title: "Headless Tasks" (or as specified by user)
- Parent: the page the user specified, or workspace root if blank

Note the returned page ID as `PARENT_PAGE_ID`.

## Step 4: Create Databases

Create each database using `notion-create-database` with `PARENT_PAGE_ID` as the parent.

**IMPORTANT: Relations must be added AFTER creating the database, one at a time via `notion-update-data-source`.** Do NOT include relations in the initial `notion-create-database` call — add them separately in Step 4b. Adding multiple relations in a single `notion-update-data-source` call causes an internal server error; each relation must be its own call.

### Step 4a: Create databases (no relations yet)

#### Tasks Database

Create with all non-relation fields:

| Property | Type | Config |
|---|---|---|
| Title | title | — |
| Description | rich_text | — |
| Acceptance Criteria | rich_text | — |
| Status | select | Options: Backlog, Ready, In Progress, In Review, Done, Blocked |
| Priority | select | Options: Urgent, High, Medium, Low |
| Executor | select | Options: claude-code, cowork, human |
| Requires Review | checkbox | — |
| Execution Plan | rich_text | — |
| Working Directory | rich_text | — |
| Session Reference | rich_text | — |
| Dispatched At | date | — |
| Agent Output | rich_text | — |
| Error Message | rich_text | — |
| Context | rich_text | — |
| Artifacts | rich_text | — |
| Repository | url | — |
| Due Date | date | — |
| Tags | multi_select | — |
| Assignees | people | — |
| Branch | rich_text | Git branch name. Set when using git worktree with Executor=claude-code |

Note the returned data source ID as `TASKS_DS_ID`.

#### Teams Database

Create with: Name (title), Members (people)

Note the returned data source ID as `TEAMS_DS_ID`.

#### Projects Database

Create with: Name (title), Owner (people), Status (select: Active/On Hold/Completed/Archived), Due Date (date)

Note the returned data source IDs as `PROJECTS_DS_ID`.

### Step 4b: Add relations one at a time

**Each `notion-update-data-source` call must contain exactly ONE `ADD COLUMN` statement.** Multiple statements in one call will fail with a 500 error.

Add the following relations in separate calls:

1. Tasks ← `Blocked By` → Tasks (self): `ADD COLUMN "Blocked By" RELATION('<TASKS_DS_ID>')`
2. Tasks ← `Parent Task` → Tasks (self): `ADD COLUMN "Parent Task" RELATION('<TASKS_DS_ID>')`
3. Tasks ← `Project` → Projects (dual, syncs Tasks on Projects): `ADD COLUMN "Project" RELATION('<PROJECTS_DS_ID>', DUAL 'Tasks' 'tasks')`
4. Tasks ← `Team` → Teams (dual, syncs Tasks on Teams): `ADD COLUMN "Team" RELATION('<TEAMS_DS_ID>', DUAL 'Tasks' 'tasks')`
5. Projects ← `Team` → Teams: `ADD COLUMN "Team" RELATION('<TEAMS_DS_ID>')`

Steps 3 and 4 automatically create the synced `Tasks` property on Projects/Teams respectively, so no separate calls are needed for those.

## Step 5: Create Config Page

Create a page using `notion-create-pages` under `PARENT_PAGE_ID`:
- Title: "Headless Tasks Config"
- Body: a code block (language: `json`) containing:

```json
{
  "tasksDatabaseId": "<TASKS_DB_ID>",
  "teamsDatabaseId": "<TEAMS_DB_ID>",
  "projectsDatabaseId": "<PROJECTS_DB_ID>",
  "selfUserId": "<NOTION_USER_UUID>"
}
```

Replace the placeholders with the actual IDs from Step 4.
For `selfUserId`: call `notion-get-users` with `user_id: "self"` and use the returned `id` value.
This allows `identity-resolve` to work without an API call on subsequent sessions.

After the JSON block, append the following as plain text:

```
## Schema Contract
- Core fields: Do not rename or delete (skills depend on them)
- Extended fields: May be renamed or deleted (some features will stop working)
- User-defined fields: Fully customizable (add Sprint, Epic, Story Points, etc. as needed)
```

## Step 6: Verify

Use `AskUserQuestion` to confirm:
> "Setup complete! I've created the Headless Tasks workspace in Notion with Tasks, Teams, and Projects databases, and a Config page storing the database IDs. Would you like me to create a test task to verify everything is working?"

If yes, create a test task using `notion-create-pages` with the Tasks database as parent:
- Title: "Test task — delete me"
- properties: `{"Status": "Ready", "Priority": "Medium"}`

Tell the user setup is complete and they can start using:
- Natural language task management (`task-manage` skill)
- Visual views (`task-view` skill)
