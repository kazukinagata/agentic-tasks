---
name: task-my-tasks
description: >
  自分宛のタスクを表示する。Triggers on: "my tasks", "自分のタスク",
  "assigned to me", "今日のタスク", "show my tasks", "what are my tasks",
  "自分担当", "自分のタスクを見せて"
user-invocable: true
---

# Headless Tasks — My Tasks

自分が担当 (Assignees に自分が含まれる) タスクを一覧表示する。

## Step 1: Provider Detection + Identity Resolve

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/provider-detection/SKILL.md` and determine `active_provider`. Skip if already set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/identity-resolve/SKILL.md` and resolve `current_user`. Skip if already set.

## Step 2: Fetch My Tasks

Query the Tasks DB for all tasks and post-process:

- Filter: `Assignees` contains `current_user.id`
- If the provider supports server-side people filtering, use it; otherwise fetch all and filter client-side.

## Step 3: Display by Status Group

Group tasks by Status and display in the following order:

### In Progress
For each task, show:
- Title, Priority
- `Executor` value + `Session Reference` (if set) — e.g., "claude-code / tmux: ht-abc123"
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

## Step 4: Human → Agent Re-assignment UI

For each task where `Executor = human`:
- Ask: "「{task title}」をAgentに実行させますか？ [claude-code / cowork / このままhuman]"
- If user selects `claude-code` or `cowork`:
  1. Ask for `Working Directory` (自分の絶対パス, required).
  2. Ask for `Branch` (任意, leave blank to skip).
  3. Update task:
     - `Executor` → selected value
     - `Working Directory` → provided path
     - `Branch` → provided value (if any)
     - `Assignees` unchanged
  4. Push data to view server (per provider SKILL.md).

## Step 5: --auto Mode

If the user invoked with `--auto` flag or said "自動実行":
- After displaying tasks, without further confirmation, execute the task-agent flow for all
  `Ready` tasks where `Executor = claude-code` (up to `maxConcurrentAgents` limit).
- 同時実行数を確認し、ランチャーファイルを生成し、Notion でクレームし、タスクごとに
  tmux ペインを起動する並列ディスパッチを実行する。詳細は `/task-agent` を参照するか、
  直接 `/task-agent --auto` を実行してください。

## Language

Always respond in the user's language.
