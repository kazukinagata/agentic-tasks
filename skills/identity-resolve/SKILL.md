---
name: identity-resolve
description: Internal shared skill to resolve current user identity and org members. Not intended for direct user invocation.
user-invocable: false
---

# Headless Tasks — Identity Resolve

Resolve the current user's identity from the active provider.
**Skip if `current_user` is already set in this conversation.**

## Prerequisites

`active_provider` must already be determined (caller must run provider-detection first).
If `active_provider` is not set, stop and return an error to the caller.

## Step 1: Resolve Current User

If `current_user` is already set in this session, skip to Step 2.

Load `${CLAUDE_PLUGIN_ROOT}/skills/providers/{active_provider}/SKILL.md` and follow the
**Identity: Resolve Current User** section.

Result: set session variable `current_user: { id, name, email }`.

- If the provider does not support user identity, set `current_user: { id: "local", name: $USER env var or "local", email: null }`.
- Always produce a `current_user` value — never fail the caller due to identity resolution.

## Step 2: Resolve Org Members (on demand)

Only execute if the caller explicitly requests member lookup (i.e., `org_members` is needed).
**Skip if `org_members` is already set in this session.**

Load `${CLAUDE_PLUGIN_ROOT}/skills/providers/{active_provider}/SKILL.md` and follow the
**Identity: List Org Members** section.

Result: set session variable `org_members: OrgMember[]` where each member has `{ id, name, email }`.

- If the provider does not support member listing, set `org_members: []`.
