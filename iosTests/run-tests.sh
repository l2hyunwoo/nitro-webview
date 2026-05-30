#!/usr/bin/env bash
#
# Runs the iOS native handler unit tests via SwiftPM on the macOS host.
#
# Usage:
#   ./iosTests/run-tests.sh

set -euo pipefail

# Resolve script dir so the script is callable from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v swift >/dev/null 2>&1; then
  echo "error: swift toolchain not found on PATH" >&2
  exit 127
fi

echo "Running NitroWebView iOS native handler tests…"
exec swift test
