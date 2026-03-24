---
name: validating-fields
description: >
  Deterministic field validation for task status transitions.
  Returns pass/fail with errors and warnings as JSON.
  Used by managing-tasks, executing-tasks, and running-daily-tasks.
user-invocable: false
---

# Validating Fields

This shared skill provides a deterministic bash+jq validation script for task status transitions.
It enforces required fields as hard-block errors and recommends optional fields as warnings.

## Usage

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/validating-fields/scripts/validate-task-fields.sh \
  <target_status> <task_json_file>
```

- `target_status`: The status being transitioned TO (e.g., `Ready`, `In Progress`, `Blocked`, `Done`)
- `task_json_file`: Path to a JSON file containing a single Notion page object (full properties)

## Output

```json
{
  "valid": true,
  "target_status": "Ready",
  "errors": [],
  "warnings": [
    {"field": "Issuer", "rule": "recommended", "message": "Issuer is empty. Consider running backfill."}
  ]
}
```

- `valid: false` → block the transition, present errors to user
- `valid: true` with warnings → allow proceeding, present warnings to user
- Exit code is always 0 — check `.valid` in the JSON output

## Validation Rules

| Target Status | Required (errors) | Recommended (warnings) |
|---|---|---|
| **Ready** | Description (non-empty, ≥50 chars), AC (non-empty + semantic check), Execution Plan (non-empty) | Issuer (non-empty), Assignees (non-empty), Priority (set) |
| **In Progress** | All Ready requirements + Executor (set), Working Directory (non-empty for AI executors) | Issuer, Branch (for claude-code executor) |
| **Blocked** | Description (non-empty), AC (non-empty) | Issuer, Error Message |
| **Done** | Description (non-empty) | Agent Output (for AI executors) |

**Issuer is always a warning**, never an error — ensures backward compatibility with pre-migration tasks.

## Semantic AC Check

AC text is scanned for at least one verifiable condition indicator:
- **Command**: `npm`, `curl`, `git`, `python`, `bash`, `test`, `run`, `build`, `deploy`
- **File path**: contains `/` or common extensions (`.ts`, `.js`, `.py`, `.md`, `.html`, `.css`)
- **Numeric threshold**: digits followed by `%`, `ms`, `s`, `count`, `times`, `items`
- **Explicit state**: `returns`, `displays`, `creates`, `exists`, `passes`, `fails`, `contains`, `shows`, `generates`, `sends`, `receives`, `confirms`, `records`, `updates`

If none found → error: "AC lacks verifiable conditions. Include commands, file paths, metrics, or observable outcomes."

This is a heuristic backstop, not a perfect quality gate. It catches worst-case garbage but not subtle gaps.
