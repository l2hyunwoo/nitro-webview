#!/usr/bin/env bash
# Runs INSIDE the reactivecircus/android-emulator-runner `script:` context
# (emulator already booted, adb on PATH). Hardened per vision-camera:
# install -> launch-alive check -> start e2e-server -> run harness under a hard timeout.
set -euo pipefail

BUNDLE_ID="${BUNDLE_ID:-com.example}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-60}"
TEST_TIMEOUT="${TEST_TIMEOUT:-720}"
APK="example/android/app/build/outputs/apk/debug/app-debug.apk"

mkdir -p example/artifacts

echo "::group::Wait for device + install"
adb wait-for-device
adb install -r "$APK"
echo "::endgroup::"

# Launch and verify the app process stays alive. The harness force-stops+starts it,
# but a crash-on-launch would otherwise surface only as an opaque bridge timeout.
echo "::group::Launch-alive check"
adb shell monkey -p "$BUNDLE_ID" -c android.intent.category.LAUNCHER 1 || true
ALIVE=0
for _ in $(seq 1 "$STARTUP_TIMEOUT"); do
  if adb shell pidof "$BUNDLE_ID" >/dev/null 2>&1; then ALIVE=1; break; fi
  sleep 1
done
if [ "$ALIVE" -ne 1 ]; then
  echo "App $BUNDLE_ID did not stay alive within ${STARTUP_TIMEOUT}s."
  adb logcat -b crash -d | tee example/artifacts/logcat-crash.txt || true
  exit 1
fi
echo "::endgroup::"

# Start the controlled HTTP server the WebView tests hit. The device reaches the
# host loopback at 10.0.2.2; the tests use that base URL on Android.
echo "::group::Start e2e-server"
node ./example/e2e-server.mjs & E2E_SRV=$!
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8099/health >/dev/null; then break; fi
  sleep 1
done
echo "::endgroup::"

cleanup() {
  kill "$E2E_SRV" 2>/dev/null || true
  adb logcat -b crash -d > example/artifacts/logcat-crash.txt 2>/dev/null || true
}
trap cleanup EXIT

echo "::group::Run harness"
cd example
# Hard wall so a hung bridge cannot burn the whole job. exit 124 => timed out => fail.
timeout --foreground --kill-after=30s "${TEST_TIMEOUT}s" yarn test:e2e:android
echo "::endgroup::"
