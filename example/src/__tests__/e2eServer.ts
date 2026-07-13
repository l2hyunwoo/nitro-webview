import { Platform } from 'react-native'

// The e2e-server runs on the CI/dev host loopback. The Android emulator reaches
// the host at 10.0.2.2; the iOS simulator shares the host loopback (127.0.0.1).
export const E2E_BASE =
  Platform.OS === 'android' ? 'http://10.0.2.2:8099' : 'http://127.0.0.1:8099'
