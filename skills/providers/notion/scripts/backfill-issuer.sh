#!/usr/bin/env bash
# One-time migration: add Issuer column (if missing) and backfill for existing tasks.
#
# Usage: backfill-issuer.sh <database_id> <current_user_id>
#
# Environment:
#   NOTION_TOKEN (required) — Notion internal integration token
#
# Process:
#   1. Check if Issuer column exists; if not, add it via PATCH /v1/databases
#   2. Query all tasks where Issuer is empty
#   3. For each task, read created_by.id from page object
#   4. Set Issuer = created_by person
#   5. If created_by is a bot/integration: set Issuer = current_user_id
#
# Output:
#   JSON object: { "column_added": bool, "backfilled": N, "from_creator": K, "from_fallback": M, "total": N }

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

# Step 1: Ensure Issuer column exists
echo "Checking if Issuer column exists..." >&2
DB_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "https://api.notion.com/v1/databases/${DATABASE_ID}" \
  -H "Authorization: Bearer ${NOTION_TOKEN}" \
  -H "Notion-Version: ${API_VERSION}")
DB_HTTP=$(echo "$DB_RESPONSE" | tail -1)
DB_BODY=$(echo "$DB_RESPONSE" | sed '$d')

if [ "$DB_HTTP" -ne 200 ]; then
  echo "Error: Failed to fetch database schema (HTTP ${DB_HTTP})" >&2
  echo "$DB_BODY" | jq -r '.message // .' >&2 2>/dev/null || echo "$DB_BODY" >&2
  exit 1
fi

COLUMN_ADDED=false
HAS_ISSUER=$(echo "$DB_BODY" | jq 'has("properties") and (.properties | has("Issuer"))')
if [ "$HAS_ISSUER" = "false" ]; then
  echo "Issuer column not found. Adding it..." >&2
  ADD_RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH \
    "https://api.notion.com/v1/databases/${DATABASE_ID}" \
    -H "Authorization: Bearer ${NOTION_TOKEN}" \
    -H "Notion-Version: ${API_VERSION}" \
    -H "Content-Type: application/json" \
    -d '{"properties":{"Issuer":{"people":{}}}}')
  ADD_HTTP=$(echo "$ADD_RESPONSE" | tail -1)
  if [ "$ADD_HTTP" -eq 200 ]; then
    echo "  ✓ Issuer column added." >&2
    COLUMN_ADDED=true
  else
    ADD_BODY=$(echo "$ADD_RESPONSE" | sed '$d')
    echo "  ✗ Failed to add Issuer column (HTTP ${ADD_HTTP})" >&2
    echo "$ADD_BODY" | jq -r '.message // .' >&2 2>/dev/null || echo "$ADD_BODY" >&2
    exit 1
  fi
else
  echo "  ✓ Issuer column already exists." >&2
fi

# Step 2: Query tasks with empty Issuer
echo "Querying tasks with empty Issuer..." >&2
FILTER='{"property":"Issuer","people":{"is_empty":true}}'
RAW=$("${SCRIPT_DIR}/query-tasks.sh" "$DATABASE_ID" "$FILTER")
TOTAL=$(echo "$RAW" | jq '.results | length')
echo "Found $TOTAL tasks with empty Issuer." >&2

if [ "$TOTAL" -eq 0 ]; then
  echo "{\"column_added\":${COLUMN_ADDED},\"backfilled\":0,\"from_creator\":0,\"from_fallback\":0,\"total\":0}"
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

echo "{\"column_added\":${COLUMN_ADDED},\"backfilled\":${TOTAL},\"from_creator\":${final_backfilled},\"from_fallback\":${final_bot},\"total\":${TOTAL}}"
