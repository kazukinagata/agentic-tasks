#!/bin/bash
set -euo pipefail

BASE_URL="http://localhost:3456"

# Silent check: exit if server is not running
if ! curl -s "${BASE_URL}/api/health" -o /dev/null 2>/dev/null; then
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tasks)
      shift
      curl -s -X POST "${BASE_URL}/api/data" \
        -H "Content-Type: application/json" \
        -d "$1" -o /dev/null 2>/dev/null || true
      shift
      ;;
    --sprints)
      shift
      curl -s -X POST "${BASE_URL}/api/sprint-data" \
        -H "Content-Type: application/json" \
        -d "$1" -o /dev/null 2>/dev/null || true
      shift
      ;;
    *)
      echo "Usage: push-view-data.sh [--tasks <json>] [--sprints <json>]" >&2
      exit 1
      ;;
  esac
done
