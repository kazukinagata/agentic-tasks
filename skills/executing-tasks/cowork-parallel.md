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
- `taskId`: `ht-<notion-page-id-prefix-8char>` (kebab-case)
- `prompt`: the constructed dispatch prompt
- `description`: `Headless Tasks: <task-title>`
- `cronExpression`: omit (manual / ad-hoc execution)

## Step 4: Session Reference

Write `cowork:<taskId>` to the Notion task's Session Reference field.

## Step 5: Report

```
Created N Cowork Scheduled Tasks:
- ht-abc12345 → Feature Login
- ht-def67890 → API Tests

Run each task from the Cowork Scheduled Tasks screen.
Check completion status: /viewing-my-tasks
```
