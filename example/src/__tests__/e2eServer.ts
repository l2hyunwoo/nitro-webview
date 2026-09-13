import { Platform } from 'react-native'

// Must match E2E_PORT in .github/workflows/e2e.yml and the default in
// example/e2e-server.mjs. Baked in at build time — the harness runs the
// already-built app, so this cannot read a workflow env var at test time.
const E2E_PORT = 8099

// The e2e-server runs on the CI/dev host loopback. The Android emulator reaches
// the host at 10.0.2.2; the iOS simulator shares the host loopback. iOS must use
// the hostname 'localhost' (not the numeric 127.0.0.1): the app's ATS policy sets
// NSAllowsLocalNetworking, which permits cleartext HTTP to localhost/*.local but
// treats a numeric IP as a normal remote host and keeps it blocked.
export const E2E_BASE =
  Platform.OS === 'android'
    ? `http://10.0.2.2:${E2E_PORT}`
    : `http://localhost:${E2E_PORT}`
