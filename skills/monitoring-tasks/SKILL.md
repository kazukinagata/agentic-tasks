---
name: monitoring-tasks
description: >
  Performs a health check on tasks. Analyzes task age (stagnation),
  field completeness by status, blocked tasks (including other assignees' blockers),
  and executor ratio (human vs AI delegation).
  Supports 3 modes: specific assignee (by name), all tasks (team-wide overview),
  or defaults to current user when no target is specified.
  Use this skill whenever the user wants to monitor task health, check stagnation,
  audit task quality, or review AI delegation metrics — even if they don't say "monitor" explicitly.
  Triggers on: "monitor tasks", "task health check", "task analysis", "stagnation report",
  "task monitoring", "task report"
user-invocable: true
---

# Agentic Tasks — Task Monitoring

You are performing a health check on tasks in the configured data source. This skill analyzes 4 dimensions: task age, field quality, blocked tasks, and executor ratio.

## Step 0: Provider Detection (once per session)

Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` and follow its instructions to determine `active_provider`. Skip if already determined in this conversation.

After provider detection completes, read `${CLAUDE_PLUGIN_ROOT}/skills/providers/{active_provider}/SKILL.md` if you have not already done so — this defines the Query Path Detection logic.

## Step 1: Identity Resolution

Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md` and resolve `current_user`. Skip if already resolved.

## Step 2: Determine Monitoring Scope

Determine the target based on the user's request:

| User Request | Mode | Target |
|---|---|---|
| Mentions a person's name (e.g., "yagishitaryoma's tasks") | `user` | Resolve via `looking-up-members` |
| Says "all tasks", "team", "overall", "全体" | `all` | No assignee filter |
| No target specified | `user` | `current_user` |

For **mode=user** with a name, load `${CLAUDE_PLUGIN_ROOT}/skills/looking-up-members/SKILL.md` to resolve the name to a user ID. If ambiguous, ask the user to clarify.

Store the result as:
- `target_mode`: "user" or "all"
- `target_id`: user UUID (only for mode=user)
- `target_name`: display name (or "All" for mode=all)

## Step 3: Fetch Task Data

Two queries are needed. Use the Query Path Detection from the provider SKILL.md.

### Query A: Target Tasks

**mode=user** — all tasks assigned to the target user (all statuses):
```json
{"property": "Assignees", "people": {"contains": "<target_id>"}}
```

**mode=all** — all tasks (no filter):
```
(empty filter — pass '' or omit)
```

### Query B: All Blocked Tasks

All tasks with Status = Blocked, regardless of assignee:
```json
{"property": "Status", "select": {"equals": "Blocked"}}
```

This captures blockers assigned to other people that may affect the target user's workflow.

### Execution

**Path 1 (NOTION_TOKEN available)**:

```bash
# Query A
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/notion/scripts/query-tasks.sh \
  "<tasksDatabaseId>" '<filter_A>' > /tmp/monitor_tasks.json

# Query B
bash ${CLAUDE_PLUGIN_ROOT}/skills/providers/notion/scripts/query-tasks.sh \
  "<tasksDatabaseId>" '{"property":"Status","select":{"equals":"Blocked"}}' > /tmp/monitor_blocked.json
```

**Path 2 (Notion Query Extension)**: Use `notion-query` MCP tool with the same filters. Save results to temp files in the same JSON format (`{"results": [...]}`).

**Path 3 (MCP Fallback)**: Use `notion-search` + `notion-fetch`. After collecting all page objects, construct `{"results": [...]}` and save to temp files. This path is slower — prefer Path 1 or 2 when available.

## Step 4: Run Analysis

### Path 1/2: Use the analysis script

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/monitoring-tasks/scripts/analyze-tasks.sh \
  "<target_mode>" "<target_id>" "<target_name>" \
  /tmp/monitor_tasks.json /tmp/monitor_blocked.json
```

The script outputs a JSON object with 4 sections: `age`, `quality`, `blocked`, `executor_ratio`. Parse this output and render the report as described in Step 5.

### Path 3: Inline analysis

If the analysis script is not available (no bash, no jq), compute the metrics manually from the fetched data:

1. **Age**: For each task, compute `(today - created_time)` in days. Group by status, calculate count/avg/min/max. Find the top 10 non-Done tasks by age.

2. **Quality**: For each status, check field completeness:
   - **Ready / In Progress**: Description, Acceptance Criteria, Execution Plan, Assignees should be filled. In Progress also needs Executor.
   - **Backlog**: Description should be filled.
   - Report fill rates as percentages. List tasks missing required fields.

3. **Blocked**: List all Blocked tasks (from Query B) with assignee names, priority, and age. Sort by age descending.

4. **Executor Ratio**: Count tasks by executor value (human, claude-code, cowork, unset) across three slices: all tasks, Done only, non-Done only.

## Step 5: Render Report

Format the analysis results as a markdown report. Respond in the user's language.

### Report Structure

```
# Task Health Report — {target_name}
_Generated: {date} | Total: {n} tasks_

## 1. Task Age
Table: Status | Count | Avg Days | Min | Max
Subsection: Top 10 Stagnating Tasks (non-Done, sorted by age desc)

## 2. Task Quality
Table: Status | Description | AC | Exec Plan | Assignees | Executor
  (show percentages, highlight values below 50% as concerning)
Subsection: Tasks Missing Required Fields (title, status, missing fields)

## 3. Blocked Tasks (All Assignees)
Table: Title | Assignee | Priority | Age (days)
  (sorted by age desc, includes tasks from other assignees)

## 4. Executor Ratio
Table: Executor | All | Done | Active (non-Done)
  (show both counts and percentages)
  Compute AI ratio = (claude-code + cowork) / total

## Recommendations
```

### Recommendations Guidelines

Generate 3-5 actionable recommendations based on findings. Focus on:

- **Stagnation**: Tasks sitting in Ready/Backlog for 7+ days without progress
- **Quality gaps**: Statuses where Acceptance Criteria or Execution Plan fill rates are below 50%
- **Blocked accumulation**: Blocked tasks older than 5 days, especially those blocking the target user
- **AI delegation opportunity**: If human executor ratio is above 70%, suggest reviewing Ready tasks for AI-executable candidates
- **Unset executors**: Tasks in Ready/In Progress without an Executor assigned
