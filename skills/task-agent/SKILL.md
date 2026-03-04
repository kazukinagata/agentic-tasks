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

## Execution Flow

1. **Fetch actionable tasks**: Query Notion for tasks where:
   - Status = "Ready"
   - Blocked By is empty (no unresolved dependencies)
   - Agent Type = "claude-code"
2. **Sort by priority**: Urgent > High > Medium > Low, then by Due Date
3. **For each task**:
   a. Read the Description and Acceptance Criteria
   b. Present the task to the user and ask for confirmation (unless --auto mode)
   c. Spawn the `task-agent` agent to execute the task
   d. Record the result in Agent Output
   e. Update Status to "In Review"
   f. If execution failed, update Status to "Blocked" and add a note

## Spawning the Agent

Use the Agent tool with:
- `subagent_type`: "task-agent" (custom agent defined in this plugin)
- `prompt`: Include the task's Description, Acceptance Criteria, and Context
- `mode`: "plan" (requires plan approval before making changes)

## Safety

- **Default: one task at a time with user confirmation**
- Only skip confirmation if the user explicitly says "auto" or "自動"
- Always set `mode: "plan"` so the agent must get approval before code changes
- After execution, the task moves to "In Review" — never directly to "Done"
