---
name: managing-tasks
description: >
  Use when the user wants to create, update, delete, or query tasks.
  Triggers on: "add task", "create task", "update task", "done", "change status",
  "list tasks", "what's next", "next task", "block", "assign", "prioritize".
---

# Headless Tasks — Task Management

You are managing tasks in the configured data source. Use the provider-specific tools for all data operations.

## Provider Detection (once per session)

Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` and follow its instructions to determine `active_provider`. Skip if already determined in this conversation.

After provider detection, also check the config for sprint fields (if present):
- `sprintsDatabaseId` (optional — present only if scrum is enabled)
- `maxConcurrentAgents` (optional — default 3 if absent)

## Schema: Property Name → Notion Type

### Core Fields (required — verify existence at session start)

| Property | Type | Notes |
|---|---|---|
| Title | title | Task name |
| Description | rich_text | Orchestrator-written detail |
| Acceptance Criteria | rich_text | Verifiable completion conditions |
| Status | select | Backlog / Ready / In Progress / In Review / Done / Blocked |
| Blocked By | relation | Self-relation (dependency). Empty = actionable |
| Priority | select | Urgent / High / Medium / Low |
| Executor | select | claude-code / cowork / human |
| Requires Review | checkbox | On → must pass In Review. Off → can go directly to Done |
| Execution Plan | rich_text | Orchestrator's plan written before dispatch. write-once |
| Working Directory | rich_text | claude-code: absolute path. cowork: workspace-relative path |
| Session Reference | rich_text | Written after dispatch: tmux session name / Cowork task ID |
| Dispatched At | date | Dispatch timestamp. Used for timeout detection |
| Agent Output | rich_text | Execution result |
| Error Message | rich_text | Written on failure only. Query with "Error Message is not empty" |

### Extended Fields (optional — graceful degradation if absent)

| Property | Type | Notes |
|---|---|---|
| Context | rich_text | Background info, constraints |
| Artifacts | rich_text | PR URLs, file paths (newline-separated) |
| Repository | url | GitHub repository URL |
| Due Date | date | ISO format |
| Tags | multi_select | Free tags |
| Parent Task | relation | Self-relation (hierarchy) |
| Project | relation | → Projects DB |
| Team | relation | → Teams DB |
| Assignees | people | Human executor assignment |
| Branch | rich_text | Git branch name (e.g. feature/task-slug). Leave blank to work on the current branch |
| Sprint | relation | → Sprints DB (バッチ割り当て。setting-up-scrum 後に使用可能) |
| Complexity Score | number | オーケストレーターが自動計算。Backlog→Ready 昇格時に記入 |
| Backlog Order | number | バックログ位置（小さいほど優先）。エージェント提案・人間上書き可 |

## State Transition Rules

Valid transitions:
- Backlog → Ready (when description + acceptance criteria + Assignees are filled; also calculate Complexity Score if absent)
- Ready → In Progress (when dispatched to executor)
- In Progress → In Review (when `Requires Review` is checked and work is done)
- In Progress → Done (when `Requires Review` is unchecked and work is done)
- In Progress → Blocked (when blocked by another task or error)
- In Review → Done (when review approved)
- In Review → In Progress (when changes requested)
- Any → Backlog (deprioritize)

**When `Requires Review` is Off**, skip In Review and transition directly to Done.
**When writing errors**, set Status to Blocked and write the error message in `Error Message` (not in Agent Output).

### Backlog → Ready: Complexity Score Calculation

When promoting a task from Backlog to Ready, if `Complexity Score` field exists and is empty, calculate and write it:

| Factor | Points |
|---|---|
| Acceptance Criteria lines | × 2 |
| Every 200 tokens in Description | +1 |
| Each level of Blocked By dependency depth | +2 |
| Reference similar past task cycle time (from Agent Output) | adjust ±1-3 |

Round to nearest integer. Typical range: 1–13 (Fibonacci-like: 1, 2, 3, 5, 8, 13).
Write the result to the `Complexity Score` field via the provider's update tool.

## "Next Task" Logic

When the user asks "what should I do next?" or "next task":

**If `sprintsDatabaseId` is in config and an Active sprint exists:**
1. Fetch tasks: Sprint = ActiveSprint AND Status = "Ready" AND Blocked By = empty
2. Sort by: Backlog Order (asc) → Priority (Urgent > High > Medium > Low) → Complexity Score (desc)
3. Count tasks with Status = "In Progress" in the sprint (running agents)
4. If running count >= `maxConcurrentAgents`: report "現在 <N> エージェントが実行中です（上限: <M>）。完了を待つか上限を増やしてください。"
5. If Ready = 0: "スプリント内に Ready タスクがありません。Backlog からタスクを移動しますか？"
6. Present the top Ready task

**If no Active sprint (or scrum not set up):**
1. Query tasks where Status = "Ready" using the active provider's query tools
2. Filter out tasks where `Blocked By` is not empty (unresolved dependencies)
3. Sort by Priority: Urgent > High > Medium > Low
4. Within same priority, sort by Due Date (earliest first)
5. Present the top task with its full context

## Task Creation Best Practices

### Assignees and Identity Resolution

**Assignees は常に1人**（スキルレベルのルール）。複数人が必要な場合はタスクを分割することを提案する。

**自分のタスクの場合:**
- ユーザーが「自分の」「my」と明示した場合:
  1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` → `active_provider`.
  2. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md` → `current_user`.
  3. `Assignees` に `current_user` を自動セット（確認不要）。

**他メンバーへの割り当ての場合:**
- ユーザーが他のメンバー名を指定した場合:
  1. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md` → `org_members` も取得。
  2. Load `${CLAUDE_PLUGIN_ROOT}/skills/looking-up-members/SKILL.md` でメンバーIDを解決。
  3. 候補が複数の場合は AskUserQuestion で確認。
  4. メンバーが見つからない場合のみ AskUserQuestion でメンバーを聞く。
  5. 以下のフィールドを強制適用（他人担当時の制約）:

| フィールド | 値 | 理由 |
|---|---|---|
| `Executor` | `human` 固定 | 担当者が自分で判断する |
| `Working Directory` | 空欄 | 他人のFS情報は不明 |
| `Branch` | 空欄 | 他人のgit環境は不明 |
| `Session Reference` | 空欄 | 担当者のAgentが記録する |
| `Dispatched At` | 空欄 | 担当者のAgentが記録する |
| `Requires Review` | unchecked | 担当者が判断する |

### Required Confirmations (no guessing or omitting)

Always confirm the following fields with AskUserQuestion unless the user has explicitly stated them.
Do NOT infer and commit to values from the task description.

| Field | Reason |
|---|---|
| Executor | Execution method varies entirely by executor type |
| Priority | Urgency depends on the user's current context |
| Working Directory | Wrong path directly causes agent execution errors |
| Sprint (if Active sprint exists) | "このタスクはスプリントに入れますか、バックログですか？" |

### How to Choose Executor

Never decide the Executor on your own.
Present options and recommended reasons to the user and let them decide.

| Executor | Best for |
|---|---|
| `claude-code` | Code implementation, research, documentation, script execution |
| `cowork` | Slack integration, external service notifications, delegating interviews to others |
| `human` | Tasks requiring human judgment, relationships, or direct interaction |

In AskUserQuestion, include a description with each option explaining why it is recommended.

### 環境別の推奨

- `execution_environment = "cowork"` の場合: AI 実行タスクは `cowork` を推奨。
  `claude-code` も選択可能だが、実行には別途 Claude Code 環境が必要と案内する。
- `execution_environment = "claude-code"` の場合: AI 実行タスクは `claude-code` を推奨。
  `cowork` も選択可能だが、実行には Cowork 環境が必要と案内する。

### Branch (git worktree support)

For tasks with Executor=claude-code where the target is a git repository:
- Suggest setting the Branch field (not mandatory)
- Default candidate: `feature/<task-title-slug>`
- If set, executing-tasks can create an isolated environment via `git worktree add`
- If left blank, work proceeds on the current branch (not suitable for parallel execution)

### Description and Acceptance Criteria Quality

- Description: Detailed enough to execute without additional questions
- Acceptance Criteria: Verifiable conditions such as "command X succeeds" or "file Y exists"

## Human → Agent Re-assignment

ユーザーが Executor=human のタスクを Agent に変更したい場合:
- AskUserQuestion: "「{task title}」をAgentに実行させますか？ [claude-code / cowork / このままhuman]"
- claude-code or cowork 選択時:
  1. Working Directory を確認（required）
  2. Branch を確認（optional）
  3. Executor, Working Directory, Branch を更新
  4. View Server にデータ push

## Bulk Operations

For requests like "show me all blocked tasks" or "mark all Done tasks as archived":
1. Query tasks using the active provider's query tools with appropriate filters
2. Present results to user for confirmation
3. Execute updates in sequence using the provider's update tools

## After Any Task Operation

After creating, updating, or deleting tasks, push fresh data to the view server as described in the active provider's SKILL.md (Pushing Data to View Server section).

If `sprintsDatabaseId` is available, also push sprint data to the view server:

```bash
curl -s -X POST http://localhost:3456/api/sprint-data \
  -H "Content-Type: application/json" \
  -d '<sprints_json>' -o /dev/null 2>/dev/null || true
```

Sprints JSON format: `{ "sprints": [...], "currentSprintId": "<active_sprint_id_or_null>", "updatedAt": "<ISO>" }`

Silently skip if the server is not running.

## Language

Always communicate with the user in the language they are using.
Write all task content (Title, Description, Acceptance Criteria, Execution Plan, etc.)
in the user's language.
