---
name: ingesting-messages
description: >
  Reads incoming messages (Slack, Teams, Discord) addressed to the current user
  and auto-converts them into categorized Notion tasks (hearing-needed, self-action,
  or delegate). Designed for daily scheduled execution.
  Triggers on: "message intake", "メッセージ処理", "intake", "メッセージをタスク化",
  "process messages", "今日のメッセージ", "メッセージからタスク作成"
user-invocable: true
---

# Headless Tasks — Message Intake

メッセージングツールから自分宛メッセージを読み込み、Notion タスクに自動変換する。
**read-only**: メッセージの送信は行わない。タスク作成のみ。

## Cowork Scheduled Task 登録方法

Cowork で毎朝自動実行する場合:
1. Cowork → Scheduled Tasks → New
2. Trigger: Daily / 09:00（ユーザーのタイムゾーン）
3. Prompt: `ingesting-messages スキルを実行してください`

---

## Step 0: 準備

### Provider Detection + Identity Resolve

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` → `active_provider`. Skip if set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md`:
   - `current_user` を取得（メッセージフィルタ用）。
   - `org_members` を取得（カテゴリC: 担当者特定用）。

### Messaging MCP 自動検出

利用可能なMCPツールを検査し、使用するメッセージングツールを決定:

| ツール群 | サービス |
|---|---|
| `slack-*` ツール群が存在 | Slack |
| `teams-*` または `ms-teams-*` ツール群が存在 | Microsoft Teams |
| `discord-*` ツール群が存在 | Discord |

- 複数検出: AskUserQuestion で「どのメッセージングサービスを使用しますか？」と確認。
- 0件検出: 停止し「メッセージングMCPが設定されていません。Slack/Teams/DiscordのMCPを設定してください。」と案内。

### Message Intake Log の準備

1. `notion-search` で "Headless Tasks Message Intake Log" ページを検索。
2. 存在しない場合: `notion-create-pages` で自動作成（Headless Tasks 親ページ配下）。
3. ページ本文から `processed_message_ids` セット（ツール名別）を読み込み。
   フォーマット例: `{ "slack": ["msg_id1", "msg_id2", ...] }`

---

## Step 1: 未処理メッセージ取得

検出されたMessaging MCPを使って過去24時間の DM / メンション を取得:

- フィルタ条件:
  - 宛先が自分（`current_user` に対するDMまたはメンション）
  - `id ∉ processed_message_ids` (重複スキップ)
  - Bot以外が送信
  - 自分以外が送信（自分のメッセージは除外）

---

## Step 2: メッセージ分類（3カテゴリ）

各メッセージを以下の3カテゴリに分類:

| カテゴリ | 判定基準 | 処理 |
|---|---|---|
| **A: ヒアリング必要** | 情報不足・質問形式・曖昧な依頼・承認を求めている | 本タスク(Status=Blocked) + ブロッカータスク(Status=Ready, executor=human, Assignees=依頼者) |
| **B: 自分がやる** | AI処理可能な実装・調査・文書化・明確な作業依頼 | タスク(Status=Ready, executor=cowork or claude-code, Assignees=self) |
| **C: 別メンバーへ** | 明らかに他担当者向け（名前が明示されている等） | タスク(Status=Backlog, executor=human, Assignees=担当者) |

**分類が不明な場合**: カテゴリAとして処理（安全側）。

---

## Step 3: タスク一括作成

各メッセージについて直接 `notion-create-pages` でタスクを作成（managing-tasks スキルは経由しない）。

### 共通フィールド

| フィールド | 値 |
|---|---|
| Title | `From @{sender}: {メッセージ概要（50字以内）}` |
| Description | 元メッセージ全文 + 末尾に `Source: {ツール名} DM from @{sender} at {datetime}` |
| Tags | `["ingesting-messages"]` |
| Context | `Received via {ツール名} on {date}` |

### カテゴリ別フィールド

**カテゴリA（ヒアリング必要）:**
1. ブロッカータスクを先に作成:
   - Title: `[ヒアリング] {依頼者名}への確認: {質問概要}`
   - Status: `Ready`
   - Executor: `human`
   - Assignees: `[依頼者]` (Load `${CLAUDE_PLUGIN_ROOT}/skills/looking-up-members/SKILL.md` で解決)
   - 依頼者が特定できない場合: Assignees 空, Context に「送信者: {sender}」を記録
2. 本タスクを作成:
   - Status: `Blocked`
   - Blocked By: `[ブロッカータスクID]`
   - Executor: 未定なので `human`
   - Assignees: `[current_user]`

**カテゴリB（自分がやる）:**
- Status: `Ready`
- Executor: 環境とコンテキストから判断:
  - `execution_environment = "cowork"`: AI 実行タスクのデフォルトは `cowork`
  - `execution_environment = "claude-code"`: コード作業 → `claude-code`、外部連携 → `cowork`
- Assignees: `[current_user]`
- Working Directory: 空欄（ユーザーが後で設定）

**カテゴリC（別メンバーへ）:**
- Status: `Backlog`
- Executor: `human`（他人担当時は必ず human 固定）
- Assignees: Load `${CLAUDE_PLUGIN_ROOT}/skills/looking-up-members/SKILL.md` で担当者を解決
  - 担当者が特定できない場合: Assignees 空, Context に「想定担当者: {名前またはヒント}」を記録
- Working Directory: 空欄（他人のFS不明）
- Branch: 空欄（他人のgit環境不明）

---

## Step 4: ログ更新 + View Server Push

1. 処理済みメッセージIDを「Headless Tasks Message Intake Log」に追記。
   - 最大1000件を保持（FIFO: 古いIDから削除）。
   - フォーマット: `{ "slack": [...ids...], "teams": [...ids...] }` をページ本文の JSON コードブロックに書き込む。
2. Push data to view server:
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/scripts/push-view-data.sh --tasks '<tasks_json>'
```

---

## Step 5: サマリー出力

```
[Message Intake 完了] via {ツール名}
処理: N件 / スキップ: K件（処理済み）
  A（ヒアリング必要）: X件 → Blocked タスク + ブロッカータスク作成
  B（自分が対応）:     Y件 → Ready タスク作成
  C（別メンバーへ）:   Z件 → Backlog タスク作成
```

---

## Language

Always respond in the user's language.
