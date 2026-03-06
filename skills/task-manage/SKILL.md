---
name: task-manage
description: >
  Use when the user wants to create, update, delete, or query tasks.
  Triggers on: "add task", "create task", "update task", "done", "change status",
  "list tasks", "what's next", "next task", "block", "assign", "prioritize".
---

# Headless Tasks — Task Management

You are managing tasks in the configured data source. Use the provider-specific tools for all data operations.

## Provider Detection (once per session)

At the start of each session, determine the active provider using the following layered check. Skip if already determined in this conversation.

### Layer 1: MCP Tool Auto-Detection
Inspect which MCP tools are available:
- `notion-*` tools present → active_provider = **notion**
- `mcp__airtable__*` tools present → active_provider = **airtable**
- SQLite/database tools present → active_provider = **sqlite**

If exactly one provider MCP is detected, use it. Load `${CLAUDE_PLUGIN_ROOT}/skills/providers/{active_provider}/SKILL.md` if available, then continue.

### Layer 2: Conflict Resolution (multiple provider MCPs detected)
If multiple provider MCPs are detected, determine the environment:
- **Claude Code**: Check `env.HEADLESS_TASKS_PROVIDER` in `~/.claude/settings.json`
- **Cowork / Global Instructions**: Look for `HEADLESS_TASKS_PROVIDER: <value>` in the Global Instructions or CLAUDE.md

If a value is found, use it as active_provider and load the corresponding provider SKILL.md.

### Layer 3: Ask User
If provider is still undetermined, use AskUserQuestion:
> "Multiple data source MCPs are available. Which provider should I use for headless-tasks? Available: [list detected providers]"

### No MCP Detected
If no provider MCP is found at all, inform the user they need to run the **task-setup** skill first to configure a data source, then stop.

## State Transition Rules

Valid transitions:
- Backlog → Ready (when description + acceptance criteria are filled)
- Ready → In Progress (when dispatched to executor)
- In Progress → In Review (when `Requires Review` is checked and work is done)
- In Progress → Done (when `Requires Review` is unchecked and work is done)
- In Progress → Blocked (when blocked by another task or error)
- In Review → Done (when review approved)
- In Review → In Progress (when changes requested)
- Any → Backlog (deprioritize)

**When `Requires Review` is Off**, skip In Review and transition directly to Done.
**When writing errors**, set Status to Blocked and write the error message in `Error Message` (not in Agent Output).

## "Next Task" Logic

When the user asks "what should I do next?" or "next task":

1. Query tasks where Status = "Ready" using the active provider's query tools
2. Filter out tasks where `Blocked By` is not empty (unresolved dependencies)
3. Sort by Priority: Urgent > High > Medium > Low
4. Within same priority, sort by Due Date (earliest first)
5. Present the top task with its full context

## Task Creation Best Practices

### Required Confirmations (no guessing or omitting)

Always confirm the following fields with AskUserQuestion unless the user has explicitly stated them.
Do NOT infer and commit to values from the task description.

| Field | Reason |
|---|---|
| Executor | Execution method varies entirely by executor type |
| Priority | Urgency depends on the user's current context |
| Working Directory | Wrong path directly causes agent execution errors |

### How to Choose Executor

Never decide the Executor on your own.
Present options and recommended reasons to the user and let them decide.

| Executor | Best for |
|---|---|
| `claude-code` | Code implementation, research, documentation, script execution |
| `cowork` | Slack integration, external service notifications, delegating interviews to others |
| `human` | Tasks requiring human judgment, relationships, or direct interaction |

In AskUserQuestion, include a description with each option explaining why it is recommended.

### Branch (git worktree support)

For tasks with Executor=claude-code where the target is a git repository:
- Suggest setting the Branch field (not mandatory)
- Default candidate: `feature/<task-title-slug>`
- If set, task-agent can create an isolated environment via `git worktree add`
- If left blank, work proceeds on the current branch (not suitable for parallel execution)

### Description and Acceptance Criteria Quality

- Description: Detailed enough to execute without additional questions
- Acceptance Criteria: Verifiable conditions such as "command X succeeds" or "file Y exists"

## Bulk Operations

For requests like "show me all blocked tasks" or "mark all Done tasks as archived":
1. Query tasks using the active provider's query tools with appropriate filters
2. Present results to user for confirmation
3. Execute updates in sequence using the provider's update tools

## After Any Task Operation

After creating, updating, or deleting tasks, push fresh data to the view server as described in the active provider's SKILL.md (Pushing Data to View Server section).

## Language

Always communicate with the user in the language they are using.
Write all task content (Title, Description, Acceptance Criteria, Execution Plan, etc.)
in the user's language.
