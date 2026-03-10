---
name: running-daily-tasks
description: >
  Unified daily routine: ingests messages into tasks, then guides user through
  task refinement and dispatch. Works in both Claude Code and Cowork.
  Triggers on: "daily tasks", "daily routine", "run daily tasks"
user-invocable: true
---

# Agentic Tasks — Daily Routine

Unified daily routine that ingests messages into tasks, then guides the user through task refinement and dispatch. Works in both Claude Code and Cowork environments.

---

## Step 0: Preparation

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` → `active_provider`, `headless_config`. Skip if set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md` → `current_user`, `org_members`. Skip if set.

---

## Step 1: Message Intake

Execute the `ingesting-messages` skill.

Record the result as `intake_result`. If the skill was skipped (e.g., no messaging MCP detected), set `intake_result = "skipped (no messaging MCP)"`.

---

## Step 2: Task Dispatch

Execute the `executing-tasks` skill (normal mode).
The skill will verify all tasks have complete Execution Plans, Acceptance Criteria, and
other required fields before dispatch. The user will be prompted to fill any gaps and
choose the execution method.

Record the result as `dispatch_result`.

---

## Step 3: Summary

Output the following report:

```
[Daily Tasks Complete]
Message Intake: {intake_result}
Task Dispatch: {dispatch_result}
```

---

## Language

Always respond in the user's language.
