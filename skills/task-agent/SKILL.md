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

## Provider Detection + Identity Resolve (once per session)

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/provider-detection/SKILL.md` and determine `active_provider`. Skip if already set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/identity-resolve/SKILL.md` and resolve `current_user`. Skip if already set.

## Schema Validation

After loading the provider SKILL.md and config, verify Core fields exist in the Tasks data source (same check as task-manage). Required Core fields: `Title`, `Description`, `Acceptance Criteria`, `Status`, `Blocked By`, `Priority`, `Executor`, `Requires Review`, `Execution Plan`, `Working Directory`, `Session Reference`, `Dispatched At`, `Agent Output`, `Error Message`.

If any Core field is missing, follow the active provider SKILL.md's instructions for handling missing fields (auto-repair or stop, as defined per provider).

## Execution Flow

1. **Fetch actionable tasks**: Query for tasks where:
   - Status = "Ready"
   - Blocked By is empty (no unresolved dependencies)
   - Executor = "claude-code" (or specified executor)
   - Assignees contains `current_user.id` OR Assignees is empty (backward compatibility)
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

When dispatching to claude-code, cowork, or antigravity, assemble the prompt as follows.
Replace `<On Completion>` with the provider-specific update instruction from the active provider's SKILL.md (Task Record Reference section).

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
<On Completion: provider-specific instruction to write results to Agent Output and update Status>
```

- Omit sections whose source field is empty
- `Execution Plan` is written by the Orchestrator before dispatch; do not modify it

## Safety

- **Default: one task at a time with user confirmation**
- Only skip confirmation if the user explicitly says "auto" or "自動"
- After execution, if `Requires Review` is checked, move to "In Review"; otherwise move to "Done"
- Never transition directly from In Progress to Done when `Requires Review` is on
