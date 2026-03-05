---
name: task-manage
description: >
  Use when the user wants to create, update, delete, or query tasks.
  Triggers on: "タスク追加", "タスク作成", "add task", "create task",
  "update task", "タスク更新", "done", "完了", "ステータス変更",
  "タスク一覧", "list tasks", "what's next", "次のタスク",
  "block", "ブロック", "assign", "アサイン", "prioritize", "優先度".
---

# Headless Tasks — Task Management

You are managing tasks stored in a Notion database. Use the Notion MCP tools for all data operations.

## Database Configuration

At the start of each session, read the config page to get database IDs:

1. Use `notion-search` with query "Headless Tasks Config" to find the config page
2. Retrieve the page body using `notion-fetch` with the page URL/ID
3. Parse the JSON code block to extract:
   - `tasksDatabaseId`
   - `teamsDatabaseId`
   - `projectsDatabaseId`

Use these IDs for all subsequent Notion operations.

## Schema Validation

After loading config, verify Core fields by calling `notion-fetch` with `tasksDatabaseId` and inspecting the returned schema's `properties` object.

Required Core fields: `Title`, `Description`, `Acceptance Criteria`, `Status`, `Blocked By`, `Priority`, `Executor`, `Requires Review`, `Execution Plan`, `Working Directory`, `Session Reference`, `Dispatched At`, `Agent Output`, `Error Message`.

### Auto-Repair (Missing Fields)

If any Core field is missing, automatically repair using `notion-update-data-source`.
First obtain the data source ID via `notion-fetch` on the database URL.
Then run the appropriate DDL (one `ADD COLUMN` per call):

| Missing Field | Repair DDL |
|---|---|
| Status | `ADD COLUMN "Status" SELECT('Backlog':gray, 'Ready':blue, 'In Progress':yellow, 'In Review':orange, 'Done':green, 'Blocked':red)` |
| Priority | `ADD COLUMN "Priority" SELECT('Urgent':red, 'High':orange, 'Medium':yellow, 'Low':blue)` |
| Executor | `ADD COLUMN "Executor" SELECT('claude-code':purple, 'cowork':green, 'antigravity':blue, 'human':gray)` |
| Dispatched At / Due Date | `ADD COLUMN "<field>" DATE` |
| (other text fields) | `ADD COLUMN "<field>" RICH_TEXT` |

After repair, re-verify and continue. **Never ask the user to manually fix the schema.**

## Notion MCP Tool Reference

- `notion-create-pages` — Create a task (parent: `{ "data_source_id": TASKS_DS_ID }`)
- `notion-update-page` — Update task properties
- `notion-fetch` — Get a database, data source, or single task by URL/ID
- `notion-search` — Full-text search across tasks; use for filtering by field value
- `notion-get-comments` / `notion-create-comment` — Read/write task comments

## Schema: Property Name → Notion Type

### Core Fields (required — verify existence at session start)

| Property | Type | Notes |
|---|---|---|
| Title | title | Task name |
| Description | rich_text | Orchestrator-written detail |
| Acceptance Criteria | rich_text | Verifiable completion conditions |
| Status | select | Backlog / Ready / In Progress / In Review / Done / Blocked |
| Blocked By | relation | Self-relation (dependency). Empty = actionable |
| Priority | select | Urgent / High / Medium / Low |
| Executor | select | claude-code / cowork / antigravity / human |
| Requires Review | checkbox | On → must pass In Review. Off → can go directly to Done |
| Execution Plan | rich_text | Orchestrator's plan written before dispatch. write-once |
| Working Directory | rich_text | claude-code: absolute path. cowork: workspace-relative path |
| Session Reference | rich_text | Written after dispatch: tmux session name / Cowork task ID |
| Dispatched At | date | Dispatch timestamp. Used for timeout detection |
| Agent Output | rich_text | Execution result |
| Error Message | rich_text | Written on failure only. Query with "Error Message is not empty" |

### Extended Fields (optional — graceful degradation if absent)

| Property | Type | Notes |
|---|---|---|
| Context | rich_text | Background info, constraints |
| Artifacts | rich_text | PR URLs, file paths (newline-separated) |
| Repository | url | GitHub repository URL |
| Due Date | date | ISO format |
| Tags | multi_select | Free tags |
| Parent Task | relation | Self-relation (hierarchy) |
| Project | relation | → Projects DB |
| Team | relation | → Teams DB |
| Assignees | people | Human executor assignment |
| Branch | rich_text | git ブランチ名（例: feature/task-slug）。空なら現在ブランチで作業 |

## State Transition Rules

Valid transitions:
- Backlog → Ready (when description + acceptance criteria are filled)
- Ready → In Progress (when dispatched to executor)
- In Progress → In Review (when `Requires Review` is checked and work is done)
- In Progress → Done (when `Requires Review` is unchecked and work is done)
- In Progress → Blocked (when blocked by another task or error)
- In Review → Done (when review approved)
- In Review → In Progress (when changes requested)
- Any → Backlog (deprioritize)

**When `Requires Review` is Off**, skip In Review and transition directly to Done.
**When writing errors**, set Status to Blocked and write the error message in `Error Message` (not in Agent Output).

## "Next Task" Logic

When the user asks "what should I do next?" or "次のタスク":

1. Use `notion-search` to find tasks where Status = "Ready"
   (Filter Blocked By = empty in post-processing, or use `notion-fetch` on the data source)
2. Sort by Priority: Urgent > High > Medium > Low
3. Within same priority, sort by Due Date (earliest first)
4. Present the top task with its full context

## Task Creation Best Practices

### 必須確認項目（省略・推測禁止）

以下の項目はユーザーが明示していない限り AskUserQuestion で確認すること。
タスクの説明文から推測して確定してはならない。

| 項目 | 理由 |
|---|---|
| Executor | 同じタスクでも消化方法が全く異なる |
| Priority | ユーザーの文脈によって緊急度が変わる |
| Working Directory | パス間違いはエージェント実行エラーに直結 |

### Executor の選び方（優秀な部下と上司の関係）

Executor を自己判断で確定してはならない。
ユーザーに選択肢と推奨理由を提示して意思決定を委ねる。

| Executor | 適したタスク |
|---|---|
| `claude-code` | コード実装・調査・文書化・スクリプト実行 |
| `cowork` | Slack連携・外部サービス通知・他者へのヒアリング委任 |
| `antigravity` | Antigravityプラットフォームでの作業 |
| `human` | 人間の判断・関係性・直接対話が必須な作業 |

AskUserQuestion では各選択肢の説明と推奨理由を description に記載する。

### Branch（git worktree 対応）

Executor=claude-code のタスクで対象が git リポジトリの場合:
- Branch フィールドの設定を提案する（強制ではない）
- デフォルト候補: `feature/<タスクタイトルのslug>`
- 設定されていれば task-agent が `git worktree add` で独立環境を作成できる
- 空の場合は現在ブランチで作業（並行実行には不向き）

### Description と Acceptance Criteria の品質

- Description: 追加質問なしに実行できる詳細度
- Acceptance Criteria: 「○○コマンドが成功する」「○○ファイルが存在する」など検証可能な形式

## Bulk Operations

For requests like "show me all blocked tasks" or "mark all Done tasks as archived":
1. Use `notion-search` or `notion-fetch` on the data source with appropriate filters
2. Present results to user for confirmation
3. Execute updates in sequence using `notion-update-page`

## After Any Task Operation

After creating, updating, or deleting tasks, push fresh data to the view server:

1. Retrieve all tasks via `notion-fetch` on the tasks data source URL
2. Format the response as a `TasksResponse` JSON object:
   ```json
   { "tasks": [...], "updatedAt": "<ISO timestamp>" }
   ```
3. POST to `http://localhost:3456/api/data` with `Content-Type: application/json`

Use the Bash tool:
```bash
curl -s -X POST http://localhost:3456/api/data \
  -H "Content-Type: application/json" \
  -d '<json>' -o /dev/null 2>/dev/null || true
```

Silently skip if the server is not running (the `|| true` handles this).
