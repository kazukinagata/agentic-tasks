# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agentic Tasks** is a Claude Code plugin for AI-native task management. It provides natural language CRUD operations, real-time HTML views (Kanban, List), and autonomous task execution via tmux parallel sessions or Cowork Scheduled Tasks. It supports any schema-definable data source through a provider abstraction (currently Notion).

## Architecture

### Plugin Structure

This is a Claude Code plugin (`.claude-plugin/plugin.json`). Skills are the core building blocks — each skill is a self-contained markdown-driven module under `skills/`.

```
skills/
├── detecting-provider/    # (shared, not user-invocable) Provider auto-detection + config retrieval
├── resolving-identity/    # (shared, not user-invocable) Current user identity resolution
├── looking-up-members/    # (shared, not user-invocable) Member name/email → provider user ID
├── providers/notion/      # Notion-specific implementation (SKILL.md + setup.md)
├── setting-up-tasks/      # Initial plugin setup and MCP configuration
├── setting-up-scrum/      # Provisions Sprints DB and sprint-related fields
├── managing-tasks/        # Task CRUD with guided creation, state transitions, "next task" logic
├── managing-sprints/      # Sprint lifecycle, backlog ordering, sprint planning
├── executing-tasks/       # Task dispatch orchestration (single, tmux parallel, Cowork)
├── viewing-tasks/         # Local view server management (start, push data, open browser)
├── viewing-my-tasks/      # Display tasks assigned to current user
├── delegating-tasks/      # Reassign tasks to other org members
├── ingesting-messages/    # Auto-convert Slack/Teams DMs into tasks
├── running-standup/       # Automated sprint status report with stall detection
├── running-daily-tasks/   # Unified daily routine: message ingestion + task refinement + dispatch
├── reviewing-sprint/      # Sprint close: velocity calculation, unfinished task disposition
└── analyzing-sprint-metrics/ # Retrospective metrics and agent performance analysis
```

### Skill Dependency Flow

All user-invocable skills start by loading `detecting-provider` (shared) to determine the active data source and retrieve config. Skills that need user identity also load `resolving-identity`. Skills never cross-reference each other directly — shared logic lives in shared skills (`user-invocable: false`).

```
User-invocable skill
  → detecting-provider (provider + config)
  → resolving-identity (current_user)
  → providers/{active_provider}/SKILL.md (provider-specific operations)
```

### Provider Abstraction

The provider layer (`skills/providers/{name}/SKILL.md`) encapsulates all data-source-specific operations: schema validation, auto-repair, CRUD via MCP tools, identity resolution, and view server data push. Currently only Notion is implemented.

### View Server

A Hono-based TypeScript server at `skills/viewing-tasks/server/` serves interactive HTML views on `http://localhost:3456`. It receives task data via POST `/api/data` and pushes real-time updates to clients via SSE at `/api/events`.

### Task Execution

Tasks can be executed in three modes:
- **Current session**: Single task executed inline
- **tmux parallel** (Claude Code): Multiple tasks dispatched to tmux panes using the `task-agent` agent (`agents/task-agent.md`)
- **Cowork Scheduled Tasks**: Tasks registered as Cowork scheduled tasks for parallel execution

### Task Schema

Tasks have 14 Core fields (auto-repaired if missing) and 11 Extended fields (graceful degradation). Key fields: Status (Backlog/Ready/In Progress/In Review/Done/Blocked), Executor (claude-code/cowork/human), Priority, Blocked By (dependency relation), Complexity Score.

#### State Transitions

```
Backlog → Ready       (requires description + acceptance criteria + assignees + execution plan; calculates Complexity Score)
Ready → In Progress   (dispatch to executor)
In Progress → In Review  (if Requires Review is on)
In Progress → Done       (if Requires Review is off)
In Progress → Blocked    (error or dependency)
In Review → Done      (review approved)
In Review → In Progress (changes requested)
Any → Backlog         (deprioritize)
```

## Development Commands

### View Server

```bash
cd skills/viewing-tasks/server

npm install          # Install dependencies
npm run dev          # Start with hot-reload (tsx watch)
npm run build        # TypeScript compilation
npm test             # Run tests (vitest)
npm run test:watch   # Interactive watch mode

# Manual start (no hot-reload)
npx tsx src/index.ts

# Health check
curl -s http://localhost:3456/api/health
```

### CI (GitHub Actions)

- **test.yml**: Runs `npm test` on the view server (Node.js 22) + version bump check on PRs
- Version check enforces that changes to `skills/` or `agents/` (excluding `*.md`, `.github/`, `docs/`) require a version bump in `.claude-plugin/plugin.json`

### Notion Provider Caveats

- Relations must be added ONE AT A TIME via `notion-update-data-source`. Batching multiple `ADD COLUMN RELATION` statements in a single call causes a 500 error.

### SKILL.md Format

Every skill has a `SKILL.md` with YAML front-matter:

```yaml
---
name: skill-name
description: Brief description of what the skill does and its trigger phrases.
user-invocable: true|false
---
```

Skills with `user-invocable: false` are shared skills loaded by other skills (e.g., `detecting-provider`, `resolving-identity`).

## Key Conventions

- All natural language in the project (SKILL.md, comments, scripts, docs) must be in English
- Each skill must be self-contained: scripts and resources live within the skill's own directory
- No cross-references between skills (one skill's SKILL.md must not directly load another skill's SKILL.md by path). Shared logic is extracted into shared skills (`user-invocable: false`)
- Provider-specific logic belongs in `skills/providers/{name}/`
- The `CLAUDE_PLUGIN_ROOT` variable points to this repository root at runtime
- Stall detection constants: `stallThresholdMultiplier=4`, `stallDefaultHours=24` (defined in detecting-provider)
- `maxConcurrentAgents` defaults to 3 (configurable per sprint)

## Semantic Versioning

| Change Type | Version Bump | Example |
|---|---|---|
| Breaking changes | MAJOR | 0.x → 1.0.0 |
| New features (new skills, new commands) | MINOR | 0.1.0 → 0.2.0 |
| Bug fixes, docs fixes | PATCH | 0.2.0 → 0.2.1 |

Before creating a PR that modifies `skills/` or `agents/`:
1. Bump version in `.claude-plugin/plugin.json`
2. Commit with message: `chore: bump version to X.Y.Z`

Files that do NOT require version bumps: `docs/`, `.github/`, `*.md` (root), `test/`
