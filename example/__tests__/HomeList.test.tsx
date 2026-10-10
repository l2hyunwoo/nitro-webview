import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { TextInput, TouchableOpacity } from 'react-native'
import { HomeList } from '../src/components/HomeList'

const entries = [
  {
    id: 'bridge',
    title: 'JS bridge',
    description: 'Messages and evaluation',
    category: 'demo' as const,
  },
  {
    id: 'regression-verification',
    title: 'Regression verification',
    description: 'Actual native events',
    category: 'verify' as const,
  },
]

test('filters capabilities by category and case-insensitive description, with an empty state', async () => {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(() => {
    renderer = TestRenderer.create(
      <HomeList entries={entries} onSelect={() => {}} />
    )
  })
  const rows = () =>
    renderer.root
      .findAllByType(TouchableOpacity)
      .filter(
        node =>
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith('home-list-row-') &&
          typeof node.props.onPress === 'function'
      )
  expect(rows()).toHaveLength(2)
  const tabs = renderer.root
    .findAllByType(TouchableOpacity)
    .filter(
      node =>
        node.props.accessibilityRole === 'tab' &&
        typeof node.props.onPress === 'function'
    )
  await act(() => tabs[1]!.props.onPress())
  expect(rows()).toHaveLength(1)
  expect(rows()[0]!.props.testID).toBe('home-list-row-bridge')
  expect(tabs[1]!.props.accessibilityState.selected).toBe(true)
  await act(() =>
    renderer.root.findByType(TextInput).props.onChangeText(' NATIVE ')
  )
  expect(rows()).toHaveLength(0)
  expect(JSON.stringify(renderer.toJSON())).toContain(
    'No matching capabilities'
  )
  await act(() => tabs[0]!.props.onPress())
  expect(rows()).toHaveLength(1)
  expect(rows()[0]!.props.testID).toBe('home-list-row-regression-verification')
  await act(() => renderer.unmount())
})

test('opens exactly the selected capability and the native checks shortcut', async () => {
  const select = jest.fn()
  let renderer!: TestRenderer.ReactTestRenderer
  await act(() => {
    renderer = TestRenderer.create(
      <HomeList entries={entries} onSelect={select} />
    )
  })
  await act(() =>
    renderer.root
      .findAll(
        node =>
          node.props.testID === 'home-list-row-bridge' &&
          typeof node.props.onPress === 'function'
      )[0]!
      .props.onPress()
  )
  expect(select).toHaveBeenLastCalledWith('bridge')
  await act(() =>
    renderer.root
      .findAll(
        node =>
          node.props.accessibilityLabel === 'Open native regression checks' &&
          typeof node.props.onPress === 'function'
      )[0]!
      .props.onPress()
  )
  expect(select).toHaveBeenLastCalledWith('regression-verification')
  expect(select).toHaveBeenCalledTimes(2)
  await act(() => renderer.unmount())
})
