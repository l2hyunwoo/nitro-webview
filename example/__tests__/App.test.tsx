import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import {
  BackHandler,
  KeyboardAvoidingView,
  TouchableOpacity,
} from 'react-native'
import App from '../App'

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default
)
jest.mock('../src/panels/index', () => {
  const ReactMock = require('react')
  const { Text } = require('react-native')
  const entries = [
    {
      id: 'fixture',
      title: 'Fixture demo',
      description: 'A local demo',
      category: 'demo',
      component: () =>
        ReactMock.createElement(
          Text,
          { testID: 'active-fixture' },
          'Mounted fixture'
        ),
    },
    {
      id: 'second',
      title: 'Second demo',
      description: 'Another local demo',
      category: 'demo',
      component: () =>
        ReactMock.createElement(
          Text,
          { testID: 'active-second' },
          'Second fixture'
        ),
    },
  ]
  return {
    PANELS: entries,
    findPanelById: (id: string) => entries.find(entry => entry.id === id),
  }
})

test('routes a capability, returns home on Android back, and removes its listener', async () => {
  const remove = jest.fn()
  let onBack: () => boolean = () => false
  const listener = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      onBack = handler as () => boolean
      return { remove }
    })
  let renderer!: TestRenderer.ReactTestRenderer
  await act(() => {
    renderer = TestRenderer.create(<App />)
  })
  await act(() =>
    renderer.root
      .findAll(
        node =>
          node.props.testID === 'home-list-row-fixture' &&
          typeof node.props.onPress === 'function'
      )[0]!
      .props.onPress()
  )
  expect(renderer.root.findByProps({ testID: 'active-fixture' })).toBeDefined()
  await act(() => {
    expect(onBack()).toBe(true)
  })
  expect(
    renderer.root.findAllByProps({ testID: 'active-fixture' })
  ).toHaveLength(0)
  expect(remove).toHaveBeenCalledTimes(1)
  await act(() => renderer.unmount())
  listener.mockRestore()
})

test('feature menu switches screens directly and closes without discarding the active screen', async () => {
  let onBack: () => boolean = () => false
  const listener = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      onBack = handler as () => boolean
      return { remove: jest.fn() }
    })
  let renderer!: TestRenderer.ReactTestRenderer
  await act(() => {
    renderer = TestRenderer.create(<App />)
  })
  const press = (id: string) =>
    renderer.root
      .findAllByType(TouchableOpacity)
      .find(node => node.props.testID === id)!
      .props.onPress()
  await act(() => press('open-features-menu'))
  const menu = renderer.root
    .findAllByType(TouchableOpacity)
    .filter(node => node.props.testID === 'feature-menu-row-fixture')
  await act(() => menu[menu.length - 1]!.props.onPress())
  expect(renderer.root.findByProps({ testID: 'active-fixture' })).toBeDefined()
  await act(() => press('open-features-menu'))
  await act(() => press('feature-menu-row-second'))
  expect(
    renderer.root.findAllByProps({ testID: 'active-fixture' })
  ).toHaveLength(0)
  const active = renderer.root.findByProps({ testID: 'active-second' })
  await act(() => press('open-features-menu'))
  expect(
    renderer.root.findByType(KeyboardAvoidingView).props
      .importantForAccessibility
  ).toBe('no-hide-descendants')
  await act(() => expect(onBack()).toBe(true))
  expect(
    renderer.root.findAllByProps({ testID: 'close-features-menu' })
  ).toHaveLength(0)
  expect(renderer.root.findByProps({ testID: 'active-second' })).toBe(active)
  await act(() => press('open-features-menu'))
  await act(() => press('close-features-menu'))
  expect(renderer.root.findByProps({ testID: 'active-second' })).toBe(active)
  expect(
    renderer.root.findByType(KeyboardAvoidingView).props
      .importantForAccessibility
  ).toBe('auto')
  await act(() => renderer.unmount())
  listener.mockRestore()
})
