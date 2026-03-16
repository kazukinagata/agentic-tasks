# Cowork Scheduled Task Parallel Flow (Cowork only)

Loaded when the user chooses "Cowork Scheduled Task parallel creation" in executing-tasks.

## Step 1: Dispatch Prompt Generation

For each task, use the Dispatch Prompt Template (see `dispatch-prompt.md` in this directory) to build the prompt text.

## Step 2: Notion Claim

For each task:
- Status → "In Progress"
- Dispatched At → current time in ISO 8601

## Step 3: Scheduled Task Creation

For each task, call `mcp__scheduled-tasks__create_scheduled_task`:
- `taskId`: `<task-title-slug>-<page-id-4char>` (see Slug Generation Rules below)
- `prompt`: the constructed dispatch prompt
- `description`: `Agentic Tasks: <task-title>`
- `cronExpression`: omit (manual / ad-hoc execution)

### Slug Generation Rules

To generate `<task-title-slug>` from the task title:

1. Lowercase the text
2. Replace non-alphanumeric characters with hyphens
3. Collapse consecutive hyphens
4. Trim leading/trailing hyphens
5. Truncate to 30 characters (break at hyphen boundary if possible)

`<page-id-4char>` is the first 4 characters of the Notion page ID (for uniqueness).

Example: "Implement Login API" with page ID `b2dc0275...` → `implement-login-api-b2dc`

## Step 4: Session Reference

Write `cowork:<taskId>` to the Notion task's Session Reference field.

## Step 5: Report

```
Created N Cowork Scheduled Tasks:
- feature-login-abc1 → Feature Login
- api-tests-def6 → API Tests

⚠️ Set the working folder for each Scheduled Task in the Cowork settings screen:
- feature-login-abc1 → <Working Directory value from task>
- api-tests-def6 → <Working Directory value from task>

Run each task from the Cowork Scheduled Tasks screen.
Check completion status: /managing-tasks (my tasks)
```

For each task, read the **Working Directory** field and display it in the report. If the field is empty, show the current repository root as the default.
