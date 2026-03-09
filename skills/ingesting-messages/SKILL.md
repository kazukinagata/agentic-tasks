---
name: ingesting-messages
description: >
  Reads incoming messages (Slack, Teams, Discord) addressed to the current user
  and auto-converts them into categorized Notion tasks (hearing-needed, self-action,
  or delegate). Designed for daily scheduled execution.
  Triggers on: "message intake", "intake", "process messages"
user-invocable: true
---

# Agentic Tasks — Message Intake

Reads incoming messages from messaging tools addressed to the current user and auto-converts them into Notion tasks.
**read-only**: Does not send any messages. Only creates tasks.

## Cowork Scheduled Task Setup

To run automatically every morning via Cowork:
1. Cowork → Scheduled Tasks → New
2. Trigger: Daily / 09:00 (user's timezone)
3. Prompt: `Run the ingesting-messages skill`

---

## Step 0: Preparation

### Provider Detection + Identity Resolve

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/detecting-provider/SKILL.md` → `active_provider`. Skip if set.
2. Load `${CLAUDE_PLUGIN_ROOT}/skills/resolving-identity/SKILL.md`:
   - Obtain `current_user` (for message filtering).
   - Obtain `org_members` (for Category C: identifying assignees).

### Messaging MCP Auto-Detection

Inspect available MCP tools and determine which messaging tool to use:

| Tool group | Service |
|---|---|
| `slack-*` tools exist | Slack |
| `teams-*` or `ms-teams-*` tools exist | Microsoft Teams |
| `discord-*` tools exist | Discord |

- Multiple detected: Use AskUserQuestion to ask "Which messaging service would you like to use?"
- None detected: Stop and inform "No messaging MCP is configured. Please set up a Slack/Teams/Discord MCP."

### Message Intake Log Preparation

1. Search for the "Agentic Tasks Message Intake Log" page via `notion-search`.
2. If not found: Auto-create via `notion-create-pages` (under the Agentic Tasks parent page).
3. Load the `processed_message_ids` set (per tool name) from the page body.
   Format example: `{ "slack": ["msg_id1", "msg_id2", ...] }`

---

## Step 1: Fetch Unprocessed Messages

Use the detected Messaging MCP to retrieve DMs / mentions from the past 24 hours:

- Filter criteria:
  - Addressed to self (DM or mention targeting `current_user`)
  - `id ∉ processed_message_ids` (skip duplicates)
  - Not sent by a bot
  - Not sent by self (exclude own messages)

---

## Step 2: Classify Messages (3 Categories)

Classify each message into one of 3 categories:

| Category | Criteria | Action |
|---|---|---|
| **A: Hearing Needed** | Insufficient info, question format, ambiguous request, seeking approval | Main task (Status=Blocked) + Blocker task (Status=Ready, executor=human, Assignees=requester) |
| **B: Self-Action** | AI-processable implementation, research, documentation, clear work request | Task (Status=Ready, executor=cowork or claude-code, Assignees=self) |
| **C: Delegate** | Clearly intended for another team member (name explicitly mentioned, etc.) | Task (Status=Backlog, executor=human, Assignees=assignee) |

**When classification is unclear**: Treat as Category A (safe default).

---

## Step 3: Bulk Task Creation

Create tasks directly via `notion-create-pages` for each message (do not go through the managing-tasks skill).

### Common Fields

| Field | Value |
|---|---|
| Title | `From @{sender}: {message summary (50 chars max)}` |
| Description | Full original message + append `Source: {tool_name} DM from @{sender} at {datetime}` |
| Tags | `["ingesting-messages"]` |
| Context | `Received via {tool_name} on {date}` |

### Category-Specific Fields

**Category A (Hearing Needed):**
1. Create the blocker task first:
   - Title: `[Hearing] Confirm with {requester_name}: {question summary}`
   - Status: `Ready`
   - Executor: `human`
   - Assignees: `[requester]` (Load `${CLAUDE_PLUGIN_ROOT}/skills/looking-up-members/SKILL.md` to resolve)
   - If requester cannot be identified: Assignees empty, record "Sender: {sender}" in Context
2. Create the main task:
   - Status: `Blocked`
   - Blocked By: `[blocker_task_id]`
   - Executor: `human` (undetermined)
   - Assignees: `[current_user]`

**Category B (Self-Action):**
- Status: `Ready`
- Executor: Determine from environment and context:
  - `execution_environment = "cowork"`: Default for AI-executed tasks is `cowork`
  - `execution_environment = "claude-code"`: Code work → `claude-code`, external integrations → `cowork`
- Assignees: `[current_user]`
- Working Directory: Empty (user sets later)

**Category C (Delegate):**
- Status: `Backlog`
- Executor: `human` (always fixed to human when assigned to others)
- Assignees: Load `${CLAUDE_PLUGIN_ROOT}/skills/looking-up-members/SKILL.md` to resolve assignee
  - If assignee cannot be identified: Assignees empty, record "Expected assignee: {name or hint}" in Context
- Working Directory: Empty (other person's filesystem unknown)
- Branch: Empty (other person's git environment unknown)

---

## Step 4: Log Update + View Server Push

1. Append processed message IDs to the "Agentic Tasks Message Intake Log".
   - Retain up to 1000 entries (FIFO: remove oldest IDs first).
   - Format: Write `{ "slack": [...ids...], "teams": [...ids...] }` as a JSON code block in the page body.
2. Push data to view server:
```bash
# Silently skip if server is not running
curl -s http://localhost:3456/api/health -o /dev/null 2>/dev/null && \
  curl -s -X POST http://localhost:3456/api/data \
    -H "Content-Type: application/json" -d '<tasks_json>' -o /dev/null 2>/dev/null || true
```

---

## Step 5: Summary Output

```
[Message Intake Complete] via {tool_name}
Processed: N / Skipped: K (already processed)
  A (Hearing Needed): X → Blocked tasks + Blocker tasks created
  B (Self-Action):    Y → Ready tasks created
  C (Delegate):       Z → Backlog tasks created
```

---

## Language

Always respond in the user's language.
