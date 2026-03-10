---
name: running-daily-tasks
description: >
  Unified daily routine: ingests messages into tasks, then auto-dispatches
  Ready tasks assigned to the current user as Cowork Scheduled Tasks.
  Designed for daily scheduled execution via Cowork.
  Triggers on: "daily tasks", "daily routine", "run daily tasks"
user-invocable: true
---

# Agentic Tasks — Daily Routine

Unified daily routine that ingests messages into tasks and auto-dispatches Ready tasks assigned to the current user. Designed for autonomous daily execution via a Cowork Scheduled Task.

**Scope**: Cowork only. Claude Code users should use `executing-tasks` and `ingesting-messages` separately.

---

## Step 0: Preparation

### Provider Detection + Identity Resolve

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` → `active_provider`, `headless_config`. Skip if set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md` → `current_user`, `org_members`. Skip if set.

### Environment Check

Verify `execution_environment = "cowork"`. If not, inform:
> "This skill is designed for Cowork. In Claude Code, use executing-tasks and ingesting-messages separately."

Then stop.

---

## Step 1: Message Intake (conditional)

### Messaging MCP Auto-Detection

Inspect available MCP tools:

| Tool group | Service |
|---|---|
| `slack-*` tools exist | Slack |
| `teams-*` or `ms-teams-*` tools exist | Microsoft Teams |
| `discord-*` tools exist | Discord |

- **If no messaging MCP is detected**: skip this step silently, set `intake_result = "skipped (no messaging MCP)"`
- **If detected**: proceed with message intake below

### Message Intake Flow

Follow the same flow as the ingesting-messages skill:

1. **Log Preparation**: Search for the "Agentic Tasks Message Intake Log" page via `notion-search`. Create if not found.
2. **Fetch Messages**: Retrieve DMs / mentions from the past 24 hours addressed to `current_user`, excluding already-processed IDs, bots, and self.
3. **Classify**: Categorize each message:
   - **A (Hearing Needed)**: Insufficient info → Blocked task + Blocker task (executor=human)
   - **B (Self-Action)**: AI-processable → Ready task (executor=cowork)
   - **C (Delegate)**: Intended for another member → Backlog task (executor=human)
4. **Create Tasks**: Use `notion-create-pages` directly (same field mappings as ingesting-messages).
   - For member resolution, load `${CLAUDE_PLUGIN_ROOT}/skills/looking-up-members/SKILL.md`.
5. **Update Log**: Append processed message IDs (retain up to 1000 entries, FIFO).
6. **Set** `intake_result = "N new tasks created (A: X, B: Y, C: Z)"`

---

## Step 2: Check Assignments

Query the Tasks database for tasks assigned to `current_user`:

1. **Ready tasks**: Status = "Ready" AND Assignees contains `current_user.id` AND Blocked By is empty AND Executor = "cowork"
   - Sort by Priority (Urgent > High > Medium > Low), then Backlog Order ascending
2. **In Progress count**: Status = "In Progress" AND Assignees contains `current_user.id` AND Executor = "cowork"
3. **Calculate**: `available_slots = headless_config.maxConcurrentAgents - in_progress_count` (default maxConcurrentAgents: 3)

If `available_slots <= 0` or no Ready tasks:
- Skip to Step 4 (Summary) with `dispatch_result = "0 tasks dispatched (N in progress, limit: M)"` or `"0 tasks dispatched (no Ready tasks)"`

Otherwise, take the first `min(ready_count, available_slots)` tasks as `dispatch_targets`.

---

## Step 3: Auto-Dispatch

For each task in `dispatch_targets`:

### 3a: Build Dispatch Prompt

Use the Dispatch Prompt Template (`dispatch-prompt.md` in this directory) to build the prompt text with the task's fields.

### 3b: Claim in Notion

Update the task via `notion-update-page`:
- Status → "In Progress"
- Dispatched At → current time in ISO 8601

### 3c: Create Scheduled Task

Call `mcp__scheduled-tasks__create_scheduled_task`:
- `taskId`: `<task-title-slug>-<page-id-4char>` (see Slug Generation Rules below)
- `prompt`: the constructed dispatch prompt
- `description`: `Agentic Tasks: <task-title>`
- `cronExpression`: omit (ad-hoc, one-off execution)

### Slug Generation Rules

To generate `<task-title-slug>` from the task title:

1. Lowercase the text
2. Replace non-alphanumeric characters with hyphens
3. Collapse consecutive hyphens
4. Trim leading/trailing hyphens
5. Truncate to 30 characters (break at hyphen boundary if possible)

`<page-id-4char>` is the first 4 characters of the Notion page ID (for uniqueness).

Example: "Implement Login API" with page ID `b2dc0275...` → `implement-login-api-b2dc`

### 3d: Write Session Reference

Update the Notion task's Session Reference field: `cowork:<taskId>`

### 3e: Set dispatch result

`dispatch_result = "M tasks dispatched (K slots remaining)"`

---

## Step 4: Summary

Output the following report:

```
[Daily Tasks Complete]
Message Intake: {intake_result}
Task Dispatch: {dispatch_result}
```

If tasks were dispatched, list them:

```
  - feature-login-abc1 → Feature Login
  - api-tests-def6 → API Tests
```

---

## Error Handling

- If a single task's Scheduled Task creation fails, log the error, set its Status back to "Ready", and continue with remaining tasks.
- If Notion API calls fail during claim (Step 3b), skip that task and continue.
- Never halt the entire routine for a single task failure.

---

## Language

Always respond in the user's language.
