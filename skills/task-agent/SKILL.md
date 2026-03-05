---
name: task-agent
description: >
  Use when the user wants autonomous task execution. Triggers on:
  "次のタスクをやって", "do the next task", "process tasks",
  "タスクを実行", "execute tasks", "auto", "自動実行",
  "ready tasks", "Readyなタスクを処理".
user-invocable: true
---

# Headless Tasks — Autonomous Task Execution

You orchestrate the autonomous execution of tasks by AI agents.

## Database Configuration

At the start of each session, read the config page to get database IDs:

1. Use `search` with query "Headless Tasks Config" to find the config page
2. Retrieve the page body using `retrieve-a-page` (or `retrieve-block-children` for the content)
3. Parse the JSON code block to extract:
   - `tasksDatabaseId`
   - `teamsDatabaseId`
   - `projectsDatabaseId`

## Schema Validation

After loading config, verify Core fields exist in the Tasks DB (same check as task-manage).

Required Core fields: `Title`, `Description`, `Acceptance Criteria`, `Status`, `Blocked By`, `Priority`, `Executor`, `Requires Review`, `Execution Plan`, `Working Directory`, `Session Reference`, `Dispatched At`, `Agent Output`, `Error Message`.

If any Core field is missing, stop and report which field is absent.

## Execution Flow

1. **Fetch actionable tasks**: Query Notion for tasks where:
   - Status = "Ready"
   - Blocked By is empty (no unresolved dependencies)
   - Executor = "claude-code" (or specified executor)
2. **Sort by priority**: Urgent > High > Medium > Low, then by Due Date
3. **For each task**:
   a. Read all Core fields and Extended fields (Context, Repository)
   b. Present the task to the user and ask for confirmation (unless --auto mode)
   c. Set Status to "In Progress"
   d. Dispatch according to the Executor field (see below)
   e. Write `Dispatched At` timestamp
   f. Record session reference in `Session Reference`
   g. On success: write result to `Agent Output`, transition status per `Requires Review`
   h. On failure: write error to `Error Message`, set Status to "Blocked"

## Dispatch by Executor

### claude-code

Spawn the `task-agent` agent using the Agent tool with the assembled prompt (see below).
After spawning, record the tmux session name or process ID in `Session Reference`.

### cowork

Create a scheduled task in Cowork with the assembled prompt.
Record the Cowork task ID in `Session Reference`.

### antigravity

Dispatch method TBD. Record any returned reference ID in `Session Reference`.

### human

Assign `Assignees`, set Status to "In Progress", and notify via comment.
Do not write `Dispatched At` or `Session Reference`.

## Dispatch Prompt Template

When dispatching to claude-code, cowork, or antigravity, assemble the prompt as follows:

```
# <Title>

## Description
<Description>

## Acceptance Criteria
<Acceptance Criteria>

## Context
<Context>

## Execution Plan
<Execution Plan>

## Environment
- Repository: <Repository>
- Working Directory: <Working Directory>

## On Completion
Update Notion page <Page ID> with results in Agent Output field and set Status to "In Review" (or "Done" if Requires Review is unchecked).
```

- `<Page ID>` = the Notion page ID returned when the task was created (from `id` field)
- Omit sections whose source field is empty
- `Execution Plan` is written by the Orchestrator before dispatch; do not modify it

## Safety

- **Default: one task at a time with user confirmation**
- Only skip confirmation if the user explicitly says "auto" or "自動"
- After execution, if `Requires Review` is checked, move to "In Review"; otherwise move to "Done"
- Never transition directly from In Progress to Done when `Requires Review` is on
