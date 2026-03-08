# Dispatch Prompt Template

Content of `$SDIR/task-{i}.md`. Replace `<On Completion>` with the provider-specific update instruction from the active provider's SKILL.md (Task Record Reference section).

The template below uses placeholders in angle brackets. Omit sections whose source field is empty.

````markdown
# <Title>

あなたは Headless Tasks Orchestrator から委譲された開発タスクを実行する AI エージェントです。
タスクを自律的に完遂してください。

## Description
<Description>

## Acceptance Criteria
<Acceptance Criteria>

## Context
<Context>（空の場合は省略）

## Execution Plan
<Execution Plan>（空の場合は省略）

## Environment
- Repository: <Repository>（空の場合は省略）
- Working Directory: <Working Directory>
- Git Branch: <Branch>（設定されている場合のみ）

## On Completion
タスクの Notion ページ ID: `<page-id>`

完了時は以下を実行:
1. `notion-update-page` で "Agent Output" フィールドに実行結果を書く（両環境で利用可能）
2. Status を更新:
   - Requires Review = ON の場合: "In Review"
   - Requires Review = OFF の場合: "Done"
3. エラー時: "Error Message" にエラー詳細を書き、Status を "Blocked" に更新
4. Notion 更新に失敗した場合はエラーを無視して実行を完了させること

Note: Working Directory は Claude Code では絶対パス、Cowork ではワークスペース相対パスとなる。

## Rules
- 既存コードのパターン・規約に従うこと
- 新機能にはテストを書くこと
- タスクのスコープ外のファイルを変更しないこと
- ブロッカーがあれば推測で進まず Error Message に記録すること
````
