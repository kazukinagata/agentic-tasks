# tmux Parallel Execution Flow (Claude Code only)

Phases 3–6 of the executing-tasks skill. Loaded when the user chooses "tmux 並列実行".

## Phase 3: Prepare Files

Set session name: `SESSION="headless-tasks-$(date +%s)"`
Set session directory: `SDIR="/tmp/headless-tasks/$SESSION"`
Create directory: `mkdir -p "$SDIR"`

For each task `i` (0-indexed), generate two files:

**`$SDIR/task-{i}.md`** — Dispatch prompt (see `dispatch-prompt.md` in this directory)

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
unset CLAUDECODE

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
tmux pipe-pane -t "$PANE_ID" -o "cat >> $SDIR/task-$IDX.log"

claude --permission-mode "$PERMISSION_MODE" "$PROMPT"
EXIT_CODE=$?

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

## Phase 4: Atomic Claim (Notion Update)

**After all files are generated, before tmux launch**, update Notion for each task:
- Status → "In Progress"
- Dispatched At → current time in ISO 8601

If a claim fails for a task, exclude it from the batch and revert Status to "Ready".

Session Reference is written in Phase 5 after pane creation succeeds.

## Phase 5: tmux Session + Pane Creation

Launch tmux using the script:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/scripts/launch-tmux.sh "$SDIR" "$SESSION" "$N"
```

If the script exits with code 1 (tmux not installed), fall back to sequential Agent tool execution.

After pane creation, if running outside tmux, try to auto-open a terminal window:

```bash
# tmux 外の場合のみ自動ターミナル起動を試行
if [ -z "${TMUX:-}" ]; then
  bash ${CLAUDE_PLUGIN_ROOT}/skills/scripts/open-terminal.sh "$SESSION" || true
fi
```

After each pane is created successfully, set pane titles and write Session Reference to Notion:
- Inside tmux: `tmux select-pane -t "$CURRENT:$SESSION:0.$i" -T "<task-i-title>"`
- Outside tmux: `tmux select-pane -t "$SESSION:0.$i" -T "<task-i-title>"`
- Session Reference format: `<session-name>:0.<pane-index>` (e.g., `headless-tasks-1741305052:0.2`)

## Phase 6: Report & Fire-and-Forget

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
