#!/usr/bin/env bash
# claude-md-guardrails.sh — CLAUDE.md style rule enforcer for PostToolUse hooks.
#
# Two invocation modes:
#   1) Claude Code PostToolUse hook — JSON payload on stdin with
#      `tool_input.file_path` (Edit/Write tool calls).
#   2) Direct CLI — first positional argument is the absolute path.
#
# Exit 0: clean, or file outside watched scope. Exit 2: violation found.
set -euo pipefail

FILE="${1:-}"

# If no CLI arg, try the Claude Code hook JSON payload on stdin.
if [[ -z "$FILE" ]] && [[ ! -t 0 ]]; then
  STDIN_JSON="$(cat || true)"
  if [[ -n "$STDIN_JSON" ]]; then
    # Extract tool_input.file_path with python (no jq dependency).
    FILE="$(
      printf '%s' "$STDIN_JSON" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("file_path", ""))
except Exception:
    pass
' 2>/dev/null || true
    )"
  fi
fi

# No file or file does not exist → nothing to check.
[[ -z "$FILE" || ! -f "$FILE" ]] && exit 0

# region: skip directories ---------------------------------------------------
# Directories that must never be linted (generated, vendored, build artefacts).
SKIP_PATTERNS=(
  "/node_modules/"
  "/nitrogen/generated/"
  "/android/build/"
  "/example/node_modules/"
  "/example/android/build/"
  "/example/ios/build/"
  "/example/ios/Pods/"
  "/.omc/"
  "/.ouroboros/"
  "/.claude/"
  "/lib/"
  "/.build/"
)
for pat in "${SKIP_PATTERNS[@]}"; do
  if [[ "$FILE" == *"$pat"* ]]; then
    exit 0
  fi
done

# Watched source roots (only lint files under these paths).
WATCHED=0
for root in \
  "/src/" \
  "/ios/" \
  "/iosTests/" \
  "/android/src/" \
  "/example/App.tsx" \
  "/example/ios/" \
  "/example/android/app/src/" \
  "/gradle/" \
  "/Package.swift" \
  "/NitroWebview.podspec"
do
  if [[ "$FILE" == *"$root"* ]] || [[ "$FILE" == *"$root" ]]; then
    WATCHED=1
    break
  fi
done
# Also match exact paths for single-file entries.
basename_file="$(basename "$FILE")"
if [[ "$basename_file" == "App.tsx" || "$basename_file" == "Package.swift" || "$basename_file" == "NitroWebview.podspec" ]]; then
  WATCHED=1
fi
[[ "$WATCHED" -eq 0 ]] && exit 0

# region: determine language --------------------------------------------------
EXT="${FILE##*.}"
IS_SWIFT=0
IS_KOTLIN=0
[[ "$EXT" == "swift" ]] && IS_SWIFT=1
[[ "$EXT" == "kt" || "$EXT" == "kts" ]] && IS_KOTLIN=1

# region: collect violations --------------------------------------------------
VIOLATIONS=()
VIOLATION_COUNT=0
MAX_VIOLATIONS=28  # leave 2 lines for header + footer

add_violation() {
  local lineno="$1" rule="$2" text="$3"
  # Truncate matched text to 120 cols.
  text="${text:0:120}"
  VIOLATIONS+=("${lineno}:${rule}: ${text}")
  (( VIOLATION_COUNT++ )) || true
}

run_check() {
  local pattern="$1" rule="$2"
  # BSD grep (macOS) — no -P, use -E.
  while IFS=: read -r lineno matched; do
    [[ "$VIOLATION_COUNT" -ge "$MAX_VIOLATIONS" ]] && break
    add_violation "$lineno" "$rule" "$matched"
  done < <(grep -nE "$pattern" "$FILE" 2>/dev/null || true)
}

# Rule 1a: Swift must not use /** */ doc comments.
if [[ "$IS_SWIFT" -eq 1 ]]; then
  run_check '/\*\*' "swift-no-kdoc: use /// not /** */ in Swift"
fi

# Rule 1b: Kotlin must not use /// doc comments.
if [[ "$IS_KOTLIN" -eq 1 ]]; then
  run_check '///' "kotlin-no-triple-slash: use /** */ not /// in Kotlin"
fi

# Rule 2: No ASCII-art box-drawing dividers (3+ consecutive chars from ─━═).
run_check '[─━═]{3,}' "no-box-drawing: remove ASCII-art section dividers"

# Rule 3a: Kotlin must not contain // MARK:.
if [[ "$IS_KOTLIN" -eq 1 ]]; then
  run_check '//[[:space:]]*MARK:' "kotlin-no-mark: // MARK: is Swift-only, banned in Kotlin"
fi

# Rule 3b: Swift must not contain // region:.
if [[ "$IS_SWIFT" -eq 1 ]]; then
  run_check '//[[:space:]]*region:' "swift-no-region: // region: is Kotlin/IntelliJ-only, banned in Swift"
fi

# Rule 4: Orchestration-tool vocabulary banned in all watched files.
ORCH_PATTERN='\bAC[ -]?[0-9]+\b|\bSub-AC\b|seed_[0-9a-f]+|interview_[0-9_]+|orch_[0-9a-f]+|\bspec-literal\b|\bouroboros\b|\borchestrator\b|\bL[1-9]\b|\bLevel [1-9]\b'
run_check "$ORCH_PATTERN" "no-orch-vocab: orchestration vocabulary banned in source (see CLAUDE.md)"

# region: report --------------------------------------------------------------
[[ "${#VIOLATIONS[@]}" -eq 0 ]] && exit 0

{
  echo "claude-md guardrail violation: $FILE"
  for v in "${VIOLATIONS[@]}"; do
    echo "  $v"
  done
  if [[ "$VIOLATION_COUNT" -ge "$MAX_VIOLATIONS" ]]; then
    echo "  ... (output truncated; fix the above violations first)"
  fi
  echo "  -> See CLAUDE.md §'Code style' for the full rules."
} >&2

exit 2
