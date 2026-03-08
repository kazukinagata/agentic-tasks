---
name: reviewing-sprint
description: >
  Generates an automated batch completion summary and closes the active sprint.
  Reviews done/undone tasks, calculates velocity, and handles unfinished task disposition.
  Triggers on: "sprint review", "batch complete", "end sprint", "close sprint",
  "スプリント完了", "バッチ終了", "スプリントを終了", "スプリントを閉じる".
---

# Headless Tasks — Sprint Review

Generates an automated batch completion summary and closes the sprint. The agent generates the summary; the human only approves the disposition of unfinished tasks.

## Provider Detection + Config (once per session)

Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` and follow its instructions to determine `active_provider` and retrieve `headless_config`. Skip if already set.

If `headless_config.sprintsDatabaseId` is missing, tell the user to run "set up scrum" first.

## Step 1: Find Active Sprint

Fetch all sprints from `headless_config.sprintsDatabaseId`. Find the one with Status = "Active".
If none, report "アクティブなスプリントはありません" and exit.

## Step 2: Fetch Sprint Tasks

Fetch all tasks with Sprint = <Active Sprint ID>.

## Step 3: Generate Batch Completion Summary

Categorize tasks:
- **DONE**: Status = "Done"
- **NOT DONE**: Status ≠ "Done"

For NOT DONE tasks, analyze dispositions:
- If Blocked By task is now Done → "依存解消済み → 次スプリントに持ち越し可能"
- If Status = "In Progress" → "実行中 → スプリントを延長するか次スプリントへ"
- If Status = "Backlog"/"Ready" → "未着手 → 次スプリントかバックログに戻す"
- If Status = "Blocked" + Error → "エラーでブロック → 要調査"

Display:
```
[Batch Completion Summary] <Sprint Name>

DONE (<N> tasks, Score:<N>):
  - <Task Title>   ✓  [Artifacts: <artifacts if any>]
  - <Task Title>   ✓

NOT DONE (<N> tasks, Score:<N>):
  - <Task Title>   [<Status>] — <disposition analysis>
  - <Task Title>   [<Status>] — <disposition analysis>

Sprint Metrics:
  Velocity: <Done Score> Complexity Score
  Stall incidents: <count from Metrics field>
  Error rate: <tasks with Error Message not empty> / <total dispatched>
  Avg cycle time: ~<hours> per task

未完了タスクの処置:
  "<Task Title>" → 次スプリントに持ち越しますか？バックログに戻しますか？
```

## Step 4: Ask for Disposition of Unfinished Tasks

Use AskUserQuestion for each NOT DONE task (or batch them):

Options:
- 次スプリントに持ち越す (keep Sprint relation, will be included in next batch)
- バックログに戻す (clear Sprint relation)
- このまま放置する (leave as-is)

## Step 5: Apply Dispositions

For each NOT DONE task based on the user's choice:
- "次スプリントに持ち越す" → clear the Sprint field (will be assigned to next sprint during planning)
- "バックログに戻す" → clear Sprint field, set Status = "Backlog" if it was Ready/Blocked
- "このまま" → no change

## Step 6: Finalize Sprint

1. Calculate Velocity: sum of Complexity Score for all Done tasks
2. Update Sprint via `notion-update-page`:
   - Velocity: <calculated value>
   - Completion Notes: <the auto-generated summary text>
   - Status: "Completed"

3. (Optional) If user confirms, transition Status from "Completed" to "Closed"

## Step 7: Push Updates to View Server

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/scripts/push-view-data.sh \
  --tasks '<tasks_json>' \
  --sprints '<sprints_json>'
```

## Step 8: Completion Report

```
スプリント完了: <Sprint Name>
Velocity: <N> Complexity Score (<Done tasks>/<Total tasks> tasks completed)

次のステップ:
  - "retro" でスプリントメトリクスを詳細分析
  - "start sprint" で次のスプリントを開始
```

## Language

Always communicate with the user in the language they are using.
