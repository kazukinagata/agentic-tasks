# Agentic Tasks — Notion Provider Setup

This file contains Notion-specific setup steps. It is called by the setting-up-tasks skill
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

### 2a: List available teamspaces

Call `notion-get-teams` to retrieve available teamspaces and display them to the user.

### 2b: Ask the user for a shared parent page

Use `AskUserQuestion` to ask:
> "Where should I create the Agentic Tasks workspace? To ensure all team members can discover the configuration, please specify an existing **page** inside a shared teamspace (e.g. a page name or URL).
>
> **Note:** Please choose a normal page, not a database. If you want it directly under a teamspace root, first create a new empty page there in the Notion UI, then tell me its name."

Show the teamspaces retrieved in 2a as reference.

**Edge case — no teamspaces found (solo user):**
If `notion-get-teams` returns no results, the workspace likely has a single user. In this case, inform the user that creating at the workspace root will make the page private and only visible to them, then allow root creation:
> "No shared teamspaces were found. Creating at the workspace root will make the page private (only visible to you). Is that OK?"

### 2c: Resolve and validate the specified page

1. Use `notion-search` to find the page the user specified.
2. **Reject databases:** If the search result's type is `database`, do NOT use it. Inform the user that databases cannot be used as a parent and ask them to choose a normal page instead.
3. If the search returns multiple matches, ask the user to disambiguate.
4. **Verify with `notion-fetch`:** Call `notion-fetch` on the selected page ID to confirm it is a page and to retrieve its ancestor path.
5. **Show the actual hierarchy:** Display the ancestor path (e.g. "Teamspace > Company Home > Office Manual > **Selected Page**") to the user and ask them to confirm this is the correct location. This is important because `notion-search` results do not show the full hierarchy, which can be misleading.

Once confirmed, note the page ID as `TARGET_PARENT_PAGE_ID`.

## Step 3: Create Parent Page

Create a parent page using `notion-create-pages`:
- Title: "Agentic Tasks" (or as specified by user)
- Parent: `{ "page_id": "<TARGET_PARENT_PAGE_ID>" }` (always use the resolved page ID from Step 2c; only omit for solo users who accepted the private-root fallback)

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

#### Intake Log Database

Create with:

| Property | Type | Config |
|---|---|---|
| Message ID | title | — |
| Tool Name | select | Options: slack, teams, discord |
| Processed At | date | — |

Note the returned data source ID as `INTAKE_LOG_DS_ID`.

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
- Title: "Agentic Tasks Config"
- Body: a code block (language: `json`) containing:

```json
{
  "tasksDatabaseId": "<TASKS_DB_ID>",
  "teamsDatabaseId": "<TEAMS_DB_ID>",
  "projectsDatabaseId": "<PROJECTS_DB_ID>",
  "intakeLogDatabaseId": "<INTAKE_LOG_DB_ID>",
  "selfUserId": "<NOTION_USER_UUID>"
}
```

Replace the placeholders with the actual IDs from Step 4.
For `selfUserId`: call `notion-get-users` with `user_id: "self"` and use the returned `id` value.
This allows `resolving-identity` to work without an API call on subsequent sessions.

After the JSON block, append the following as plain text:

```
**WARNING: Do not rename this page.** The plugin discovers configuration by searching for a page titled "Agentic Tasks Config". Renaming it will break auto-discovery for all team members.

## Schema Contract
- Core fields: Do not rename or delete (skills depend on them)
- Extended fields: May be renamed or deleted (some features will stop working)
- User-defined fields: Fully customizable (add Sprint, Epic, Story Points, etc. as needed)
```

## Step 6: Verify

Use `AskUserQuestion` to confirm:
> "Setup complete! I've created the Agentic Tasks workspace in Notion with Tasks, Teams, and Projects databases, and a Config page storing the database IDs. Would you like me to create a test task to verify everything is working?"

If yes, create a test task using `notion-create-pages` with the Tasks database as parent:
- Title: "Test task — delete me"
- properties: `{"Status": "Ready", "Priority": "Medium"}`

Tell the user setup is complete and they can start using:
- Natural language task management (`managing-tasks` skill)
- Visual views (`viewing-tasks` skill)
