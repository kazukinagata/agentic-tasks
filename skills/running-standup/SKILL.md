---
name: running-standup
description: >
  Use when the user wants a sprint status report or standup.
  Triggers on: "standup", "status report", "agent status", "スタンドアップ",
  "進捗確認", "burn down", "stalled tasks", "タイムアウト確認".
---

# Headless Tasks — Sprint Standup

Generates an automated status report for the active sprint. Focuses on stall detection and blocked task analysis rather than a human "yesterday/today/blockers" format.

## Database Configuration

1. Use `notion-search` with query "Headless Tasks Config"
2. Retrieve and parse config JSON to get `tasksDatabaseId`, `sprintsDatabaseId`

## Step 1: Find Active Sprint

Fetch all sprints from `sprintsDatabaseId`. Find the one with Status = "Active".
If none, report "アクティブなスプリントはありません" and exit.

## Step 2: Fetch Sprint Tasks

Fetch all tasks with Sprint = <Active Sprint ID>.

## Step 3: Classify Tasks into 4 Buckets

**RUNNING** — Status = "In Progress" (and not stalled)
- Show: Task title, Session Reference, elapsed time since Dispatched At

**COMPLETED (since last report)** — Status = "Done" (completed recently)
- Show: Task title, brief Agent Output summary if available

**STALLED** — Status = "In Progress" AND Dispatched At is older than (Complexity Score × 4) hours
- Stall threshold: If Complexity Score is null, use 24h as default
- Show: Task title, Session Reference, elapsed hours, expected duration hint

**BLOCKED** — Status = "Blocked" OR (Status = "Backlog"/"Ready" AND Blocked By is not empty)
- Show: Task title, Blocked By task names, Error Message if present

## Step 4: Display Report

```
[Sprint Status Report] <Sprint Name>
Goal: <Goal>

RUNNING (In Progress):
  - <Task Title>     [Session: <Session Reference>] [<N>h elapsed]
  - <Task Title>     [Session: <Session Reference>] [<N>h elapsed]

COMPLETED (since last report):
  - <Task Title>     [Done] [Agent Output: <brief summary>]

STALLED (要確認):
  - <Task Title>     [In Progress] [Dispatched <N>h ago — expected ~Score:<N> = ~<N>h]
    → セッション <Session Reference> を確認してください

BLOCKED:
  - <Task Title>     [Blocked by: <Dependency Title>]
    Error: <Error Message or "none (dependency pending)">

Complexity Score Progress: <Done Score> / <Total Score> (<N>%)
Stall rate this sprint: <stalled count>/<dispatched count> dispatched tasks (<N>%)
```

If a bucket is empty, omit it from the report.

## Step 5: Update Sprint Metrics

Append a daily snapshot to the sprint's `Metrics` field using `notion-update-page`:

```
<YYYY-MM-DD>: Done=<N>pts, InProgress=<N>pts, Stall=<N>task(s)
```

Append to the existing content (do not overwrite).

## Stall Detection Logic

A task is "stalled" when:
- Status = "In Progress"
- `Dispatched At` is set
- Hours since `Dispatched At` > (Complexity Score × 4)
  - Score 1-3 tasks: stall threshold = 12-24h
  - Score 5-8 tasks: stall threshold = 20-32h
  - Score 13 tasks: stall threshold = 52h
  - No score: default threshold = 24h

Recommend actions for stalled tasks:
- Check if the tmux session / Cowork task is still alive
- Consider restarting the task
- Consider reducing scope (split into smaller tasks)

## Language

Always communicate with the user in the language they are using.
