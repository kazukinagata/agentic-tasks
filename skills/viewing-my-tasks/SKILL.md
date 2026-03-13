---
name: viewing-my-tasks
description: >
  Displays tasks assigned to the current user, grouped by status. Shows sprint
  context and suggests next actions (execute, manage, delegate).
  Triggers on: "my tasks", "assigned to me", "show my tasks", "what are my tasks"
user-invocable: true
---

# Agentic Tasks — My Tasks

Lists all tasks assigned to the current user (where Assignees contains the user).

## Step 1: Provider Detection + Identity Resolve

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` and determine `active_provider`. Skip if already set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md` and resolve `current_user`. Skip if already set.

## Step 2: Fetch My Tasks

Use the active provider SKILL.md's "Querying Tasks" section to fetch tasks filtered by Assignee = `current_user.id`. The provider determines the optimal query path.

## Step 3: Display by Status Group

Group tasks by Status and display in the following order:

### In Progress
For each task, show:
- Title, Priority
- Executor / Session Reference (display as-is if present: whether tmux session name or cowork:xxx)
- `Dispatched At` (if set)

### Ready
Group by `Executor`:
- **claude-code**: ready for autonomous execution
- **cowork**: ready for Cowork agent
- **human**: waiting for manual action

### Blocked
For each task, show the blocking task titles (from `Blocked By` relation).

### In Review
List tasks awaiting review.

### Backlog
List titles only (collapsed to keep output concise).

### Sprint Context
If `sprintsDatabaseId` is in config and an Active Sprint exists:
- Mark sprint tasks with `[Sprint]` prefix.
- Show sprint tasks first within each status group.

## Step 4: Next Actions

After displaying the task list, suggest next actions:

```
Next actions:
- Execute tasks: /executing-tasks
- Manage tasks (reassign, change status, etc.): /managing-tasks
- Delegate tasks: /delegating-tasks
```

## Language

Always respond in the user's language.
