---
name: viewing-my-tasks
description: >
  自分宛のタスクを表示する。Triggers on: "my tasks", "自分のタスク",
  "assigned to me", "今日のタスク", "show my tasks", "what are my tasks",
  "自分担当", "自分のタスクを見せて"
user-invocable: true
---

# Headless Tasks — My Tasks

自分が担当 (Assignees に自分が含まれる) タスクを一覧表示する。

## Step 1: Provider Detection + Identity Resolve

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` and determine `active_provider`. Skip if already set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md` and resolve `current_user`. Skip if already set.

## Step 2: Fetch My Tasks

Query the Tasks DB for all tasks and post-process:

- Filter: `Assignees` contains `current_user.id`
- If the provider supports server-side people filtering, use it; otherwise fetch all and filter client-side.

## Step 3: Display by Status Group

Group tasks by Status and display in the following order:

### In Progress
For each task, show:
- Title, Priority
- Executor / Session Reference（存在する場合はそのまま表示: tmux セッション名でも cowork:xxx でも）
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

タスク一覧表示後、次のアクションを案内する:

```
次のアクション:
- タスクを実行: /executing-tasks
- タスクを管理（再割り当て・ステータス変更等）: /managing-tasks
- タスクを委譲: /delegating-tasks
```

## Language

Always respond in the user's language.
