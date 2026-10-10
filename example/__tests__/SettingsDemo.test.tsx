import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { Platform, Switch } from 'react-native'
import { NitroWebView } from 'nitro-webview'
import { JSBridgeDemo } from '../src/panels/JSBridgeDemo'
import { FileDownloadDemo } from '../src/panels/FileDownloadDemo'
import { SettingsDemo } from '../src/panels/SettingsDemo'
import { StatusBanner } from '../src/components/StatusBanner'
import { ToolbarButton } from '../src/components/ToolbarButton'

jest.mock('@dr.pogodin/react-native-fs', () => ({}))

jest.mock('nitro-webview', () => {
  const ReactMock = require('react')
  const { View } = require('react-native')
  return {
    callback: (fn: unknown) => fn,
    NitroWebView: (props: unknown) => ReactMock.createElement(View, props),
  }
})

let renderer: TestRenderer.ReactTestRenderer
const methods = {
  clearCache: jest.fn(),
  clearHistory: jest.fn(),
  requestFocus: jest.fn(),
  stopLoading: jest.fn(),
}

beforeEach(async () => {
  jest.resetAllMocks()
  await act(() => {
    renderer = TestRenderer.create(<SettingsDemo />)
  })
  await act(() =>
    renderer.root.findByType(NitroWebView).props.hybridRef(methods)
  )
})
afterEach(async () => {
  await act(() => renderer.unmount())
})
const selectTab = async (tab: 'controls' | 'results') => {
  await act(() =>
    renderer.root
      .findAll(
        node =>
          node.props.testID === `demo-tab-${tab}` &&
          typeof node.props.onPress === 'function'
      )[0]
      .props.onPress()
  )
}
const press = async (label: string) => {
  await act(() =>
    renderer.root
      .findAllByType(ToolbarButton)
      .find(button => button.props.label === label)!
      .props.onPress()
  )
  await selectTab('results')
}

test('clearHistory reports the actual platform limitation without claiming a cleared iOS stack', async () => {
  await press('Clear history')
  expect(methods.clearHistory).toHaveBeenCalledTimes(1)
  const banner = renderer.root.findByType(StatusBanner)
  expect(banner.props.title).toBe('clearHistory resolved')
  expect(banner.props.body).toContain(
    Platform.OS === 'ios'
      ? 'iOS clearHistory is a no-op'
      : 'inspect the Back button'
  )
})

test('native method rejection becomes an explicit error result', async () => {
  methods.clearCache.mockRejectedValue(new Error('view disposed'))
  await press('Clear cache')
  expect(renderer.root.findByType(StatusBanner).props.status).toBe('error')
  expect(renderer.root.findByType(StatusBanner).props.body).toContain(
    'view disposed'
  )
})

test('requestFocus completion does not promise a keyboard or DOM input focus', async () => {
  await press('Request focus')
  expect(methods.requestFocus).toHaveBeenCalledTimes(1)
  expect(renderer.root.findByType(StatusBanner).props.body).toContain(
    'does not promise input focus or a keyboard'
  )
})

test('stopLoading follows observed navigation loading state and invokes the native method', async () => {
  expect(
    renderer.root
      .findAllByType(ToolbarButton)
      .find(button => button.props.label === 'Stop loading')!.props.disabled
  ).toBe(true)
  await act(() =>
    renderer.root.findByType(NitroWebView).props.onNavigationStateChange({
      url: 'http://localhost/slow',
      title: '',
      loading: true,
      canGoBack: false,
      canGoForward: false,
    })
  )
  expect(
    renderer.root
      .findAllByType(ToolbarButton)
      .find(button => button.props.label === 'Stop loading')!.props.disabled
  ).toBe(false)
  await press('Stop loading')
  expect(methods.stopLoading).toHaveBeenCalledTimes(1)
  expect(renderer.root.findByType(StatusBanner).props.title).toBe(
    'stopLoading requested'
  )
})

test('JavaScript toggle remounts the native view and unsupported platform toggles are disabled', async () => {
  const before = renderer.root.findByType(NitroWebView)
  await act(() =>
    renderer.root
      .findAllByType(Switch)
      .find(toggle => toggle.props.accessibilityLabel === 'JavaScript')!
      .props.onValueChange(false)
  )
  expect(renderer.root.findByType(NitroWebView)).not.toBe(before)
  expect(renderer.root.findByType(NitroWebView).props.javaScriptEnabled).toBe(
    false
  )
  const toggles = renderer.root.findAllByType(Switch)
  expect(
    toggles.find(toggle => toggle.props.accessibilityLabel === 'DOM storage')!
      .props.disabled
  ).toBe(Platform.OS === 'ios')
  expect(
    toggles.find(toggle => toggle.props.accessibilityLabel === 'Scrolling')!
      .props.disabled
  ).toBe(Platform.OS === 'android')
})

test.each([
  ['bridge', JSBridgeDemo],
  ['download', FileDownloadDemo],
  ['settings', SettingsDemo],
])(
  '%s tabs preserve the mounted WebView and expose untruncated results',
  async (_name, Panel) => {
    await act(() => renderer.update(<Panel />))
    const webview = renderer.root.findByType(NitroWebView)
    await selectTab('results')
    expect(renderer.root.findByType(NitroWebView)).toBe(webview)
    expect(renderer.root.findByType(StatusBanner).props.bodyNumberOfLines).toBe(
      0
    )
    await selectTab('controls')
    expect(renderer.root.findByType(NitroWebView)).toBe(webview)
  }
)
