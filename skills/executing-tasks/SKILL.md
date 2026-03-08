---
name: executing-tasks
description: >
  Use when the user wants autonomous task execution. Triggers on:
  "次のタスクをやって", "do the next task", "process tasks",
  "タスクを実行", "execute tasks", "auto", "自動実行",
  "ready tasks", "Readyなタスクを処理".
user-invocable: true
---

# Headless Tasks — Task Execution

You orchestrate the execution of tasks. Tasks can be executed one at a time in the current session, or in parallel (tmux panes in Claude Code / Scheduled Tasks in Cowork).

## Provider Detection + Identity Resolve (once per session)

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` and determine `active_provider`. Skip if already set.
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
3. Calculate `available_slots = maxConcurrentAgents - in_progress_count` (config default: 3)
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

#### 「1つずつ実行」選択時

1. AskUserQuestion でどのタスクを実行するか選択させる
2. クレーム: Status → "In Progress", Dispatched At → now
3. 現セッション内で実行:
   - `cd <Working Directory>`
   - Branch が設定されている場合: `git checkout <branch> || git checkout -b <branch>`
   - タスクの Description, Acceptance Criteria, Execution Plan に基づいて作業を実行
   - 完了時: Agent Output に結果を記録、Status を Requires Review に応じて "In Review" or "Done" に更新
   - エラー時: Error Message にエラー詳細を記録、Status を "Blocked" に更新

#### 「tmux 並列実行」選択時（Claude Code 環境のみ）

1. AskUserQuestion で permission mode を選択:
   - plan (Recommended)
   - default
   - acceptEdits
   - bypassPermissions
2. Phase 3〜6 に進む（Claude Code: tmux 並列実行フロー）

#### 「Cowork Scheduled Task 並列作成」選択時（Cowork 環境のみ）

1. **Dispatch Prompt 生成:** 各タスクについて既存の Dispatch Prompt Template を使い prompt テキストを構築
2. **Notion クレーム:** 各タスクの Status → "In Progress", Dispatched At → now
3. **Scheduled Task 一括作成:** 各タスクについて `mcp__scheduled-tasks__create_scheduled_task` を呼ぶ:
   - `taskId`: `ht-<notion-page-id-prefix-8char>` (kebab-case)
   - `prompt`: 構築した dispatch prompt
   - `description`: `Headless Tasks: <task-title>`
   - `cronExpression`: 省略（手動実行 = アドホック）
4. **Session Reference 書き込み:** Notion の Session Reference に `cowork:<taskId>` を記録
5. **レポート出力:**
   ```
   N件の Cowork Scheduled Task を作成しました:
   - ht-abc12345 → Feature Login
   - ht-def67890 → API Tests

   Cowork の Scheduled Tasks 画面から各タスクを実行してください。
   完了状況の確認: /viewing-my-tasks
   ```

### Claude Code: tmux 並列実行フロー

以下の Phase 3〜6 は Claude Code 環境専用です。

### Phase 3: Prepare Files

Set session name: `SESSION="headless-tasks-$(date +%s)"`
Set session directory: `SDIR="/tmp/headless-tasks/$SESSION"`
Create directory: `mkdir -p "$SDIR"`

For each task `i` (0-indexed), generate two files:

**`$SDIR/task-{i}.md`** — Dispatch prompt (see Dispatch Prompt Template below)

**`$SDIR/task-{i}.sh`** — Launcher script:

```bash
#!/bin/bash
set -euo pipefail
TASK_TITLE="<title>"
TASK_ID="<notion-page-id>"
PANE_ID="$TMUX_PANE"
SDIR="<session-dir>"
IDX="<i>"
PERMISSION_MODE="<selected-permission-mode>"

# Crash fallback
trap 'tmux select-pane -t "$PANE_ID" -T "CRASHED: $TASK_TITLE"; \
  printf "{\"task_id\":\"%s\",\"status\":\"crashed\"}\n" "$TASK_ID" \
  > "$SDIR/task-$IDX.status.json"' EXIT

# Working Directory validation
if [ ! -d "<working-directory>" ]; then
  tmux select-pane -t "$PANE_ID" -T "ERROR: $TASK_TITLE (no workdir)"
  printf "{\"task_id\":\"%s\",\"status\":\"error\",\"message\":\"Working directory not found\"}\n" \
    "$TASK_ID" > "$SDIR/task-$IDX.status.json"
  trap - EXIT; exit 1
fi

cd "<working-directory>"

# Branch checkout (only if Branch field is set)
# if [ -n "<branch>" ]; then
#   git checkout "<branch>" 2>/dev/null || git checkout -b "<branch>"
# fi

# Execute task (Interactive mode: TUI is displayed in real time)
PROMPT=$(cat "$SDIR/task-$IDX.md")
claude --permission-mode "$PERMISSION_MODE" "$PROMPT" 2>&1 | tee "$SDIR/task-$IDX.log"
EXIT_CODE=${PIPESTATUS[0]}

if [ $EXIT_CODE -ne 0 ]; then
  tmux select-pane -t "$PANE_ID" -T "ERROR($EXIT_CODE): $TASK_TITLE"
  printf "{\"task_id\":\"%s\",\"status\":\"error\",\"exit_code\":%d}\n" \
    "$TASK_ID" "$EXIT_CODE" > "$SDIR/task-$IDX.status.json"
else
  tmux select-pane -t "$PANE_ID" -T "DONE: $TASK_TITLE"
  printf "{\"task_id\":\"%s\",\"status\":\"done\"}\n" \
    "$TASK_ID" > "$SDIR/task-$IDX.status.json"
fi

trap - EXIT
```

### Phase 4: Atomic Claim (Notion Update)

**After all files are generated, before tmux launch**, update Notion for each task:
- Status → "In Progress"
- Dispatched At → current time in ISO 8601

If a claim fails for a task, exclude it from the batch and revert Status to "Ready".

Session Reference is written in Phase 5 after pane creation succeeds.

### Phase 5: tmux Session + Pane Creation

**First, check if tmux is installed:**
```bash
if ! command -v tmux &>/dev/null; then
  echo "tmux がインストールされていません。Agent ツールで逐次実行にフォールバックします。"
  # Fall back to sequential Agent tool execution
fi
```

**If tmux is available, detect context and launch:**

```bash
if [ -n "$TMUX" ]; then
  # Inside tmux: create a new window in the current session
  CURRENT=$(tmux display-message -p '#S')
  tmux new-window -t "$CURRENT" -n "$SESSION"
  tmux send-keys -t "$CURRENT:$SESSION" "bash $SDIR/task-0.sh" Enter
  for i in $(seq 1 $((N-1))); do
    tmux split-window -t "$CURRENT:$SESSION" "bash $SDIR/task-$i.sh"
  done
  tmux select-layout -t "$CURRENT:$SESSION" tiled
  tmux set-option -t "$CURRENT:$SESSION" -w pane-border-status top
  for i in $(seq 0 $((N-1))); do
    tmux select-pane -t "$CURRENT:$SESSION:0.$i" -T "<task-i-title>"
  done
  tmux switch-client -t "$CURRENT:$SESSION"
else
  # Outside tmux: create a new detached session
  tmux new-session -d -s "$SESSION" -x 220 -y 50 "bash $SDIR/task-0.sh"
  for i in $(seq 1 $((N-1))); do
    tmux split-window -t "$SESSION" "bash $SDIR/task-$i.sh"
  done
  tmux select-layout -t "$SESSION" tiled
  tmux set-option -t "$SESSION" pane-border-status top
  tmux set-option -t "$SESSION" remain-on-exit on
  for i in $(seq 0 $((N-1))); do
    tmux select-pane -t "$SESSION:0.$i" -T "<task-i-title>"
  done
fi
```

After each pane is created successfully, write Session Reference to Notion:
- Format: `<session-name>:0.<pane-index>` (e.g., `headless-tasks-1741305052:0.2`)

### Phase 6: Report & Fire-and-Forget

Report to the user:

```
N件のタスクを並列実行中です:
- headless-tasks-<ts>:0.0 → Feature Login
- headless-tasks-<ts>:0.1 → API Tests
- headless-tasks-<ts>:0.2 → Fix Bug #42

モニタリング:
  tmux attach -t headless-tasks-<ts>         （tmux 外から）
  tmux switch-client -t headless-tasks-<ts>  （tmux 内から）

完了状況の確認: /viewing-my-tasks  または  ls /tmp/headless-tasks/headless-tasks-<ts>/
```

The Orchestrator exits here. Each Sub-Agent runs independently and handles its own completion.

---

## Dispatch Prompt Template

Content of `$SDIR/task-{i}.md`. Replace `<On Completion>` with the provider-specific update instruction from the active provider's SKILL.md (Task Record Reference section).

```markdown
# <Title>

あなたは Headless Tasks Orchestrator から委譲された開発タスクを実行する AI エージェントです。
タスクを自律的に完遂してください。

## Description
<Description>

## Acceptance Criteria
<Acceptance Criteria>

## Context
<Context>（空の場合は省略）

## Execution Plan
<Execution Plan>（空の場合は省略）

## Environment
- Repository: <Repository>（空の場合は省略）
- Working Directory: <Working Directory>
- Git Branch: <Branch>（設定されている場合のみ）

## On Completion
タスクの Notion ページ ID: `<page-id>`

完了時は以下を実行:
1. `notion-update-page` で "Agent Output" フィールドに実行結果を書く（両環境で利用可能）
2. Status を更新:
   - Requires Review = ON の場合: "In Review"
   - Requires Review = OFF の場合: "Done"
3. エラー時: "Error Message" にエラー詳細を書き、Status を "Blocked" に更新
4. Notion 更新に失敗した場合はエラーを無視して実行を完了させること

Note: Working Directory は Claude Code では絶対パス、Cowork ではワークスペース相対パスとなる。

## Rules
- 既存コードのパターン・規約に従うこと
- 新機能にはテストを書くこと
- タスクのスコープ外のファイルを変更しないこと
- ブロッカーがあれば推測で進まず Error Message に記録すること
```

- Omit sections whose source field is empty

---

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
