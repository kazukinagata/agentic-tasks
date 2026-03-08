---
name: detecting-provider
description: Detects the active data source provider and retrieves configuration (database IDs, constants). Internal shared skill — not for direct user invocation.
user-invocable: false
---

# Headless Tasks — Provider Detection

Determine the active provider using the following layered check.
**Skip if already determined in this conversation.**

## Layer 1: MCP Tool Auto-Detection
Inspect which MCP tools are available:
- `notion-*` tools present → active_provider = **notion**
- `mcp__airtable__*` tools present → active_provider = **airtable**
- SQLite/database tools present → active_provider = **sqlite**

If exactly one provider MCP is detected, use it. Load
`${CLAUDE_PLUGIN_ROOT}/skills/providers/{active_provider}/SKILL.md` if available, then continue.

## Layer 2: Conflict Resolution (multiple provider MCPs detected)
If multiple provider MCPs are detected, determine the environment:
- **Claude Code**: Check `env.HEADLESS_TASKS_PROVIDER` in `~/.claude/settings.json`
- **Cowork / Global Instructions**: Look for `HEADLESS_TASKS_PROVIDER: <value>` in the Global Instructions or CLAUDE.md

If a value is found, use it as active_provider and load the corresponding provider SKILL.md.

## Layer 3: Ask User
If provider is still undetermined, use AskUserQuestion:
> "Multiple data source MCPs are available. Which provider should I use for headless-tasks? Available: [list detected providers]"

## No MCP Detected
If no provider MCP is found at all, inform the user they need to run the **setting-up-tasks** skill first to configure a data source, then stop.

## Environment Detection

Provider 検出後、実行環境も判定し `execution_environment` を会話コンテキスト変数に設定する。
**Skip if already set in this conversation.**

判定ロジック:
1. 環境変数 `CLAUDE_CODE_IS_COWORK` が `1` → `execution_environment = "cowork"`
2. それ以外 → `execution_environment = "claude-code"`

（`CLAUDECODE=1` は両環境で共通のため判定には使わない）

この値は downstream スキル（executing-tasks, managing-tasks 等）で実行フロー分岐に使用する。

## Config Retrieval

Provider 検出後、Config ページからデータベース ID と定数を取得する。
**Skip if `headless_config` is already set in this conversation.**

### Notion Provider

1. `notion-search` で "Headless Tasks Config" ページを検索
2. `notion-fetch` でページ本文を取得
3. JSON コードブロックをパースし、以下を `headless_config` セッション変数に設定:
   - `tasksDatabaseId` (required)
   - `teamsDatabaseId` (optional)
   - `projectsDatabaseId` (optional)
   - `sprintsDatabaseId` (optional — setting-up-scrum 後に存在)
   - `maxConcurrentAgents` (optional — default: 3)

Config ページが見つからない場合、ユーザーに setting-up-tasks スキルの実行を案内して停止する。

## Constants

スキル間で共有される定数。detecting-provider を経由する全スキルがこの値を参照する。

| 定数名 | 値 | 用途 |
|--------|-----|------|
| `stallThresholdMultiplier` | 4 | Stall 判定: elapsed hours > Complexity Score × この値 |
| `stallDefaultHours` | 24 | Complexity Score が未設定の場合のデフォルト Stall 閾値（時間） |
