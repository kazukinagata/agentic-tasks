---
name: executing-tasks
description: >
  Orchestrates autonomous task execution via current session, tmux parallel,
  or Cowork scheduled tasks. Fetches ready tasks, validates working directories,
  and dispatches to the chosen execution mode.
  Triggers on: "次のタスクをやって", "do the next task", "process tasks",
  "タスクを実行", "execute tasks", "auto", "自動実行",
  "ready tasks", "Readyなタスクを処理".
user-invocable: true
---

# Headless Tasks — Task Execution

You orchestrate the execution of tasks. Tasks can be executed one at a time in the current session, or in parallel (tmux panes in Claude Code / Scheduled Tasks in Cowork).

## Provider Detection + Identity Resolve (once per session)

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` and determine `active_provider` + `headless_config`. Skip if already set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md` and resolve `current_user`. Skip if already set.

## Schema Validation

After loading the provider SKILL.md and config, verify Core fields exist in the Tasks data source (same check as managing-tasks). Required Core fields: `Title`, `Description`, `Acceptance Criteria`, `Status`, `Blocked By`, `Priority`, `Executor`, `Requires Review`, `Execution Plan`, `Working Directory`, `Session Reference`, `Dispatched At`, `Agent Output`, `Error Message`.

If any Core field is missing, follow the active provider SKILL.md's instructions for handling missing fields (auto-repair or stop, as defined per provider).

## Execution Flow

### Phase 1: Fetch & Concurrency Check

1. Query tasks where:
   - Status = "Ready"
   - Blocked By is empty (no unresolved dependencies)
   - Executor = current environment's executor type:
     - `execution_environment = "claude-code"` → Executor = "claude-code"
     - `execution_environment = "cowork"` → Executor = "cowork"
   - Assignees contains `current_user.id`
2. Count In Progress tasks with the same filter conditions (Status = "In Progress")
3. Calculate `available_slots = headless_config.maxConcurrentAgents - in_progress_count` (default: 3)
4. If `available_slots <= 0`: report "N件が実行中（上限: M）。完了を待つか maxConcurrentAgents を増やしてください" and stop
5. Sort by Priority (Urgent > High > Medium > Low), then Due Date ascending
6. Take the first `min(ready_count, available_slots)` tasks

### Phase 2: Validate & Choose Execution Mode

For each fetched task:
- Verify Working Directory exists: `test -d "$WORKING_DIR"`
- If not found: exclude that task, set Status = "Blocked", Error Message = "Working directory not found"

Display the task list:

```
実行可能なタスク:
1. [Urgent] Feature Login   → /home/user/project-a
2. [High]   API Tests       → /home/user/project-b  (branch: feature/api)
3. [Medium] Fix Bug #42     → /home/user/project-c
```

**`--auto` モード時:**
- Claude Code: tmux 並列 + plan モードで自動実行（確認スキップ）
- Cowork: Scheduled Task 並列作成で自動実行（確認スキップ）

**通常モード時:** AskUserQuestion で実行方法を選択:

**Claude Code 環境 (`execution_environment = "claude-code"`):**

| 選択肢 | 説明 |
|--------|------|
| 1つずつ実行 (Recommended) | タスクを1つ選んで現在のセッションで実行 |
| tmux 並列実行 | 複数タスクを tmux ペインで同時実行 |

**Cowork 環境 (`execution_environment = "cowork"`):**

| 選択肢 | 説明 |
|--------|------|
| 1つずつ実行 (Recommended) | タスクを1つ選んで現在のセッションで実行 |
| Cowork Scheduled Task 並列作成 | 各タスクを Scheduled Task として登録し並列実行 |

### 「1つずつ実行」選択時

1. AskUserQuestion でどのタスクを実行するか選択させる
2. クレーム: Status → "In Progress", Dispatched At → now
3. 現セッション内で実行:
   - `cd <Working Directory>`
   - Branch が設定されている場合: `git checkout <branch> || git checkout -b <branch>`
   - タスクの Description, Acceptance Criteria, Execution Plan に基づいて作業を実行
   - 完了時: Agent Output に結果を記録、Status を Requires Review に応じて "In Review" or "Done" に更新
   - エラー時: Error Message にエラー詳細を記録、Status を "Blocked" に更新

### 「tmux 並列実行」選択時（Claude Code 環境のみ）

1. AskUserQuestion で permission mode を選択:
   - plan (Recommended)
   - default
   - acceptEdits
   - bypassPermissions
2. Load `tmux-parallel.md` (this directory) and follow Phases 3–6.

### 「Cowork Scheduled Task 並列作成」選択時（Cowork 環境のみ）

Load `cowork-parallel.md` (this directory) and follow Steps 1–5.

## Dispatch Prompt Template

See `dispatch-prompt.md` in this directory.

## Fallback: Sequential Execution

**Claude Code 環境:** tmux が利用不可の場合、Agent ツールで逐次実行にフォールバック:

For each task:
1. Set Status → "In Progress", Dispatched At → now
2. Spawn the `task-agent` agent using the Agent tool with the assembled dispatch prompt
3. Record any returned session reference in `Session Reference`
4. On success: write result to `Agent Output`, transition Status per `Requires Review`
5. On failure: write error to `Error Message`, set Status → "Blocked"

**Cowork 環境:** Scheduled Task 作成が不可の場合、現セッション内で1つずつ実行にフォールバック（「1つずつ実行」と同じフロー）。

## Safety

- Default: single task in current session
- Parallel execution is opt-in via AskUserQuestion (tmux in Claude Code, Scheduled Tasks in Cowork)
- Default permission mode for tmux agents: plan
- Never use `--dangerously-skip-permissions`
- Respect `maxConcurrentAgents` limit by subtracting current In Progress count
- Claude Code: Order strictly: generate files → claim in Notion → launch tmux
- Cowork: Order strictly: generate prompts → claim in Notion → create Scheduled Tasks
- Write Session Reference only after pane/task creation succeeds (no speculative writes)
- On tmux unavailable (Claude Code): error message + fallback to sequential Agent tool execution
- On Scheduled Task creation failure (Cowork): fallback to sequential in-session execution
