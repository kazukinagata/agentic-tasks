#!/usr/bin/env bash
# One-time migration: backfill Issuer field for existing tasks.
#
# Usage: backfill-issuer.sh <database_id> <current_user_id>
#
# Environment:
#   NOTION_TOKEN (required) — Notion internal integration token
#
# Process:
#   1. Query all tasks where Issuer is empty
#   2. For each task, read created_by.id from page object
#   3. Set Issuer = created_by person
#   4. If created_by is a bot/integration: set Issuer = current_user_id
#
# Output:
#   JSON object: { "backfilled": N, "skipped": K, "errors": M }

set -euo pipefail

DATABASE_ID="${1:?Usage: backfill-issuer.sh <database_id> <current_user_id>}"
CURRENT_USER_ID="${2:?Usage: backfill-issuer.sh <database_id> <current_user_id>}"

if [ -z "${NOTION_TOKEN:-}" ]; then
  echo "Error: NOTION_TOKEN environment variable is not set." >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

API_VERSION="2022-06-28"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Step 1: Query tasks with empty Issuer
echo "Querying tasks with empty Issuer..." >&2
FILTER='{"property":"Issuer","people":{"is_empty":true}}'
RAW=$("${SCRIPT_DIR}/query-tasks.sh" "$DATABASE_ID" "$FILTER")
TOTAL=$(echo "$RAW" | jq '.results | length')
echo "Found $TOTAL tasks with empty Issuer." >&2

if [ "$TOTAL" -eq 0 ]; then
  echo '{"backfilled":0,"skipped":0,"errors":0}'
  exit 0
fi

# Step 2-4: For each task, set Issuer from created_by
backfilled=0
skipped=0
errors=0

echo "$RAW" | jq -c '.results[]' | while IFS= read -r page; do
  page_id=$(echo "$page" | jq -r '.id')
  title=$(echo "$page" | jq -r '.properties.Title.title[0].plain_text // "Untitled"')
  created_by_type=$(echo "$page" | jq -r '.created_by.type // "unknown"')
  created_by_id=$(echo "$page" | jq -r '.created_by.id // empty')

  # Determine issuer: use created_by if person, else fallback to current_user
  if [ "$created_by_type" = "person" ] && [ -n "$created_by_id" ]; then
    issuer_id="$created_by_id"
  else
    issuer_id="$CURRENT_USER_ID"
  fi

  # Update via Notion API
  response=$(curl -s -w "\n%{http_code}" -X PATCH \
    "https://api.notion.com/v1/pages/${page_id}" \
    -H "Authorization: Bearer ${NOTION_TOKEN}" \
    -H "Notion-Version: ${API_VERSION}" \
    -H "Content-Type: application/json" \
    -d "{\"properties\":{\"Issuer\":{\"people\":[{\"id\":\"${issuer_id}\"}]}}}")

  http_code=$(echo "$response" | tail -1)

  if [ "$http_code" -eq 200 ]; then
    echo "  ✓ ${title} → Issuer set (${issuer_id})" >&2
    backfilled=$((backfilled + 1))
  else
    response_body=$(echo "$response" | sed '$d')
    error_msg=$(echo "$response_body" | jq -r '.message // "unknown error"' 2>/dev/null || echo "unknown error")
    echo "  ✗ ${title} → Error: ${error_msg}" >&2
    errors=$((errors + 1))
  fi

  # Rate limit: 3 requests per second (Notion API limit)
  sleep 0.35
done

# Collect counters from subshell via re-count
final_backfilled=$(echo "$RAW" | jq '[.results[] | select(.created_by.type == "person" and .created_by.id != null)] | length')
final_bot=$(echo "$RAW" | jq "[.results[] | select(.created_by.type != \"person\" or .created_by.id == null)] | length")

echo "{\"backfilled\":${TOTAL},\"from_creator\":${final_backfilled},\"from_fallback\":${final_bot},\"total\":${TOTAL}}"
