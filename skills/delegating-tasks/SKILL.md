---
name: delegating-tasks
description: >
  Delegates a task to another organization member by updating Assignees,
  resetting executor fields, and recording delegation history in Context.
  Triggers on: "delegate task", "assign to", "タスクを渡す", "〇〇さんに任せて",
  "transfer task", "reassign", "委譲", "担当を変えて", "別の人に渡して"
user-invocable: true
---

# Headless Tasks — Task Delegate

タスクを別の組織メンバーに委譲する。Assignees を受取人に変更し、委譲履歴を Context に追記する。

## Step 1: Provider Detection + Identity Resolve

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` and determine `active_provider`. Skip if already set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md`:
   - Resolve `current_user` (delegator identity).
   - Also resolve `org_members` (needed for recipient lookup).

## Step 2: Identify the Task

If the user did not specify a task clearly:
- Use AskUserQuestion to ask for the task title or ID.
- Search Tasks DB for matching tasks; if multiple match, present a short list and ask the user to confirm.

## Step 3: Identify the Recipient

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/looking-up-members/SKILL.md`.
2. Run member lookup with the recipient name/email the user provided.
3. Handle results:
   - 0 matches → inform the user and ask for a different name or email.
   - 1 match → confirm: "「{recipient.name}」に委譲してよいですか？"
   - 2–5 matches → present the list and ask the user to select one.

## Step 4: Update the Task

Apply the following field updates (other fields remain unchanged):

| Field | Value | Reason |
|---|---|---|
| `Assignees` | `[recipient]` | 委譲先を責任者にする |
| `Executor` | `human` | 受取人が自分で判断する（強制固定） |
| `Working Directory` | 空欄にリセット | 受取人のFSは不明 |
| `Branch` | 空欄にリセット | 受取人のgit環境は不明 |
| `Session Reference` | 空欄にリセット | 受取人のAgentが記録する |
| `Dispatched At` | 空欄にリセット | 受取人のAgentが記録する |
| `Requires Review` | unchecked にリセット | 受取人が判断する |
| `Context` | 既存テキストに追記 | 委譲履歴を残す |

`Context` フィールドへの追記フォーマット:
```
Delegated from @{current_user.name} to @{recipient.name} on {YYYY-MM-DD}
```

(任意) ユーザーに確認して Status を `Backlog` にリセットする（再トリアージを示唆）。

## Step 5: Push to View Server

After updating the task, push fresh data to the view server as described in the active provider's SKILL.md (Pushing Data to View Server section).

## Step 6: Completion Message

Report:
```
委譲完了: 「{task title}」→ @{recipient.name}
Context に委譲履歴を追記しました。
受取人が viewing-my-tasks を実行すると、このタスクが表示されます。
```

## Field Constraints for Delegated Tasks

**他人を担当者にする場合は以下のフィールドは設定しない**（受取人が判断する）:

| フィールド | 理由 |
|---|---|
| `Executor` | human 固定（受取人が変更する） |
| `Working Directory` | 受取人のFS情報は不明 |
| `Branch` | 受取人のgit環境は不明 |
| `Session Reference` | 受取人のAgentが記録する |
| `Dispatched At` | 受取人のAgentが記録する |
| `Requires Review` | 受取人が判断する |

## Language

Always respond in the user's language.
