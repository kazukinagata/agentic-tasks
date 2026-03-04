#!/usr/bin/env bash
# Notify the headless-tasks view server to refresh data from Notion.
# Called by PostToolUse hook when any Notion MCP tool is used.
# Runs async — failure is silent (view server may not be running).

curl -s -X POST http://localhost:3456/api/refresh -o /dev/null 2>/dev/null || true
