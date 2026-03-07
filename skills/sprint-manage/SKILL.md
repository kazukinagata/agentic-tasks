---
name: sprint-manage
description: >
  Use when the user wants to manage sprints (batches) or the product backlog.
  Triggers on: "start sprint", "begin sprint", "new sprint", "plan sprint",
  "sprint planning", "end sprint", "close sprint", "sprint status",
  "what's in this sprint", "show sprint", "sprint backlog", "add to sprint",
  "show backlog", "product backlog", "reorder backlog", "reprioritize",
  "backlog order", "スプリント", "バックログ", "スプリント計画", "バックログ管理".
---

# Headless Tasks — Sprint Management

Manages the sprint (batch) lifecycle and product backlog. A "sprint" here is a scope-box (Objective), not a time-box.

## Database Configuration

1. Use `notion-search` with query "Headless Tasks Config" to find the config page
2. Retrieve the page body using `notion-fetch`
3. Parse JSON to extract `tasksDatabaseId`, `sprintsDatabaseId`, `maxConcurrentAgents`

If `sprintsDatabaseId` is missing, tell the user to run "set up scrum" first.

---

## Action: Start Sprint / Sprint Planning

**Triggered by**: "start sprint", "plan sprint", "new sprint", "sprint planning", "スプリント計画"

### Step 1: Guard

Fetch all sprints from `sprintsDatabaseId`. If any sprint has Status = "Active", report:
```
現在アクティブなスプリントが存在します: <Sprint Name>
新しいスプリントを開始する前に、現在のスプリントを終了してください ("end sprint")
```

### Step 2: Gather Sprint Info

Use AskUserQuestion to ask:
- **Goal** (必須): このスプリントの目標・完了条件を記述してください
- **Max Concurrent Agents** (省略可、省略時は config の `maxConcurrentAgents` を使用): 並列実行上限

### Step 3: Analyze Backlog

Fetch tasks where Status = "Backlog" or "Ready" AND Sprint = empty.

Build a topological sort considering `Blocked By` chains:
- Group A: tasks with no unresolved blockers (immediately executable)
- Group B: tasks blocked only by Group A tasks
- Group C+: deeper dependency chains

Within each group, sort by: Priority (Urgent > High > Medium > Low) then Complexity Score (higher first).

### Step 4: Propose Batch

Present the analysis to the user:

```
[バッチ提案] Goal: <Goal Text>

提案する実行バッチ（並列実行上限: <N>）:

  優先グループ A（依存なし、即時実行可）:
    1. <Task Title>   [<Priority> / Score:<N>] [<Executor>]
    2. <Task Title>   [<Priority> / Score:<N>] [<Executor>]

  優先グループ B（A完了後に実行可）:
    3. <Task Title>   [<Priority> / Score:<N>] [<Executor>]  ← Blocked by #1

グループ A の合計 Complexity Score: <N>
全体の合計 Complexity Score: <N>

「このバッチで進めますか？変更があれば "3を外して5を追加" 等と伝えてください。」
```

### Step 5: Apply Human Approval / Modifications

Accept modifications like "Nを外して" / "Mを追加" and update the proposed list.
When approved:

1. Create the Sprint page in the Sprints DB via `notion-create-pages`:
   - Name: "Sprint <N>" (auto-number based on existing sprints, or accept user's name)
   - Goal: <user-provided Goal>
   - Status: "Active"
   - Max Concurrent Agents: <value>

2. Set the `Sprint` field on each selected task to point to the new Sprint page.

3. Push updated data to view server (see "After Operations" section).

4. Report:
```
スプリント開始: <Sprint Name>
アクティブタスク: <N> tasks (Complexity Score: <N>)
view server: http://localhost:3456/sprint-backlog.html
```

---

## Action: Sprint Status

**Triggered by**: "sprint status", "what's in this sprint", "show sprint", "スプリント状況"

1. Find the Active sprint from `sprintsDatabaseId`
2. Fetch all tasks with Sprint = <Active Sprint ID>
3. Calculate stall threshold: tasks with Status = "In Progress" AND Dispatched At older than (Complexity Score × 4) hours

Display:
```
Active Sprint: <Sprint Name>
Goal: <Goal Text>

実行状況:
  Done:        <bar>  <N> tasks (Score:<N>)
  In Progress: <bar>  <N> tasks (Score:<N>)   [Session: <refs>]
  Ready:       <bar>  <N> tasks (Score:<N>)
  Backlog:     <bar>  <N> tasks (Score:<N>)
  Blocked:     <bar>  <N> tasks
  STALLED:     <bar>  <N> tasks (Dispatched Xh ago — タイムアウト検討)

完了率: <Done Score> / <Total Score> Complexity Score (<N>%)
```

Flag STALLED tasks (In Progress with Dispatched At > Score×4 hours ago) with yellow/red text.

---

## Action: Show Backlog / Product Backlog

**Triggered by**: "show backlog", "product backlog", "バックログ表示", "バックログ一覧"

1. Fetch tasks where Sprint = empty AND Status in [Backlog, Ready]
2. Build topological sort by Blocked By chains
3. Sort within groups: Backlog Order (ascending) → Priority → Complexity Score (descending)
4. Display numbered list:

```
[Product Backlog] <N> tasks

#  | Title                        | Priority | Score | Executor    | Blocked By
---|------------------------------|----------|-------|-------------|----------
1  | Implement OAuth login        | Urgent   | 8     | claude-code | —
2  | Add rate limiting            | High     | 3     | claude-code | —
3  | Write onboarding docs        | Medium   | 2     | human       | 🔒 #1
4  | Dashboard perf fix           | Medium   | 3     | claude-code | —
```

🔒 = blocked by another backlog task (shows dependency)

---

## Action: Suggest Backlog Order

**Triggered by**: "suggest backlog order", "バックログ順序を提案", "reorder backlog", "reprioritize"

1. Fetch all backlog tasks (Sprint = empty)
2. Compute optimal order:
   - Topological sort (dependency-first)
   - Within same tier: Urgent > High > Medium > Low
   - Within same priority: higher Complexity Score first (more valuable)
3. Propose the new order as a numbered list
4. On approval, bulk-update Backlog Order: 1000, 2000, 3000...

---

## Action: Move Task in Backlog

**Triggered by**: "タスクXをタスクYの上に移動", "move task X before Y", "バックログ順序変更"

1. Identify tasks X and Y
2. Set X's Backlog Order = Y's Backlog Order - 500
3. Re-normalize all backlog tasks to 1000, 2000, 3000... (maintaining relative order)
4. Update via `notion-update-page`

---

## Action: Add Task to Sprint

**Triggered by**: "add to sprint", "スプリントに追加", "このタスクをスプリントへ"

1. Identify the task and Active sprint
2. Set the task's Sprint field to the Active sprint
3. Report confirmation

---

## "Next Task" Logic (Sprint-Aware)

When the user asks "what should I do next?" or "next task":

**If Active sprint exists:**
1. Fetch tasks: Sprint = ActiveSprint AND Status = "Ready" AND Blocked By = empty
2. Sort by: Backlog Order (asc) → Priority (Urgent > High > Medium > Low) → Complexity Score (desc)
3. Check running agent count: count tasks with Status = "In Progress" in the sprint
4. If running count >= maxConcurrentAgents: "現在 <N> エージェントが実行中です（上限: <M>）。完了を待つか上限を増やしてください。"
5. If Ready = 0: "スプリント内に Ready タスクがありません。Backlog からタスクを移動しますか？"
6. Present the top Ready task

**If no Active sprint:**
- Fallback to standard logic: Status = "Ready" AND Blocked By = empty → Priority → Due Date

---

## After Operations

After any data modification, push fresh data to the view server:

```bash
curl -s -X POST http://localhost:3456/api/data \
  -H "Content-Type: application/json" \
  -d '<tasks_json>' -o /dev/null 2>/dev/null || true

curl -s -X POST http://localhost:3456/api/sprint-data \
  -H "Content-Type: application/json" \
  -d '<sprints_json>' -o /dev/null 2>/dev/null || true
```

Tasks JSON format: `{ "tasks": [...], "updatedAt": "<ISO>" }`
Sprints JSON format: `{ "sprints": [...], "currentSprintId": "<ID>|null", "updatedAt": "<ISO>" }`

Each sprint object:
```json
{
  "id": "...",
  "name": "Sprint 1",
  "goal": "OAuth 実装と API レート制限",
  "status": "Active",
  "maxConcurrentAgents": 3,
  "velocity": null,
  "url": "https://notion.so/..."
}
```

Each task object must include sprint fields:
```json
{
  "sprintId": "<sprint_id_or_null>",
  "sprintName": "<sprint_name_or_null>",
  "complexityScore": 5,
  "backlogOrder": 1000
}
```

Silently skip if server is not running.

## Language

Always communicate with the user in the language they are using.
