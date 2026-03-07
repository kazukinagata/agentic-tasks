---
name: sprint-metrics
description: >
  Use when the user wants sprint performance analysis or retrospective insights.
  Triggers on: "sprint metrics", "retrospective", "retro", "agent performance",
  "振り返り", "メトリクス", "レトロ", "パフォーマンス分析".
---

# Headless Tasks — Sprint Metrics

Automated agent performance analysis derived from Notion task data. Replaces human retrospective with quantitative metrics.

## Database Configuration

1. Use `notion-search` with query "Headless Tasks Config"
2. Retrieve and parse config JSON to get `tasksDatabaseId`, `sprintsDatabaseId`

## Step 1: Identify Target Sprint

If the user specified a sprint name, find it in `sprintsDatabaseId`.
Otherwise, use AskUserQuestion: "どのスプリントのメトリクスを表示しますか？（省略時: 最新の Closed スプリント）"
If no Closed sprint exists, use the most recent Completed sprint.

## Step 2: Fetch Sprint and Task Data

1. Fetch the target sprint from the Sprints DB
2. Fetch all tasks with Sprint = <target sprint ID>
3. Parse the Metrics field for existing daily snapshots

## Step 3: Calculate Metrics

### Throughput
- Tasks completed: count of Status = "Done"
- Tasks not completed: count of Status ≠ "Done"
- Completion rate: done_count / total_count × 100%
- Complexity Score completion: sum(done scores) / sum(all scores) × 100%

### Agent Performance
- **Timeout/Stall rate**: tasks where evidence of stall exists in Metrics snapshots / total dispatched tasks
  - Dispatched = tasks that had Status = "In Progress" at any point (Dispatched At is set)
  - Stall = Dispatched At set AND elapsed > Score×4h AND required human intervention (check Agent Output / Error Message for retry indicators)
- **Error rate**: tasks with Error Message not empty / total dispatched
- **Human intervention**: tasks where Agent Output or Error Message mentions "manual", "retry", "human" or Status went Blocked→In Progress
- **Avg cycle time**: for Done tasks with Dispatched At set, estimate from daily Metrics snapshots
  - If no snapshot data, note "Dispatched At データから推定不可"

### Dependency Analysis
- Blocked tasks at sprint start: tasks with non-empty Blocked By at sprint creation
- Resolved during sprint: blocked tasks that reached Done status
- Bottleneck identification: tasks whose completion unblocked the most other tasks

## Step 4: Display Report

```
[Sprint Metrics Report] <Sprint Name>
Goal: <Goal>

THROUGHPUT:
  Tasks completed:     <N> / <M> (<N>%)
  Complexity Score:    <N> / <M> (<N>%)

AGENT PERFORMANCE:
  Timeout/Stall rate:  <N> / <M> dispatched (<N>%)  [threshold: >30% = warning]
  Error rate:          <N> / <M> dispatched (<N>%)
  Human intervention:  <N> task(s) [<task names if any>]
  Avg cycle time:      <N>h (Score:1-3) / <N>h (Score:5-8)

DEPENDENCY ANALYSIS:
  Blocked tasks at sprint start: <N> / <M> (<N>%)
  Resolved during sprint:        <N> / <N>
  Bottleneck task:               <task name if applicable>

RECOMMENDATIONS:
  <generated recommendations based on data>
```

### Recommendation Rules

Generate recommendations automatically:
- If any task's actual cycle time > Score×6h: "Score 推定が低すぎた可能性 — <task name>"
- If stall rate > 30%: "ストール率が高い (>30%) — maxConcurrentAgents を減らすか、タスクのスコープを縮小を検討"
- If stall rate < 10%: "ストール率が良好 (<10%) — maxConcurrentAgents を増やせる可能性あり"
- If blocked tasks > 40% of sprint: "依存チェーンがボトルネック — スプリント計画時に依存解消タスクを先行させる"
- If error rate > 20%: "エラー率が高い — Execution Plan の品質向上か、タスク分割を検討"
- If completion rate < 60%: "完了率が低い — 次スプリントのバッチサイズを縮小することを検討"
- If completion rate > 90%: "完了率が優秀 — 次スプリントのバッチサイズを増やせる可能性あり"

## Step 5: Write to Sprint Metrics Field

Append (or overwrite if doing full retro) the report to the sprint's `Metrics` field via `notion-update-page`.

Format:
```
=== Sprint Metrics Report (<YYYY-MM-DD>) ===
Throughput: <N>/<M> tasks (<N>%)
Velocity: <N> pts
Stall rate: <N>%
Error rate: <N>%
...
```

## Step 6: Next Sprint Recommendations

Output actionable suggestions for the next sprint:
- Adjust `maxConcurrentAgents` (up/down based on stall rate)
- Tasks to re-evaluate Complexity Score
- Dependency ordering improvements for next sprint planning

## Language

Always communicate with the user in the language they are using.
