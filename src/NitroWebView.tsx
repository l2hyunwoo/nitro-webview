import React, { forwardRef, useMemo } from 'react'
import { Platform } from 'react-native'
import {
  callback,
  getHostComponent,
  type HybridView,
  type HybridViewProps,
  type NitroViewWrappedCallback,
  type ReactNativeView,
} from 'react-native-nitro-modules'
import NitroWebViewConfig from '../nitrogen/generated/shared/json/NitroWebViewConfig.json'
import type {
  NitroWebViewMethods,
  NitroWebViewProps as NativeNitroWebViewProps,
} from './specs/NitroWebView.nitro'
import type { OnShouldStartLoadWithRequest } from './originWhitelist'
import { createShouldStartLoadBridge } from './shouldStartLoadBridge'
import { patchAndroidPostMessage } from './bridgeScript'

/** Public callbacks may settle asynchronously; the component bridges their result. */
export interface NitroWebViewProps extends Omit<
  NativeNitroWebViewProps,
  'onShouldStartLoadWithRequest'
> {
  onShouldStartLoadWithRequest?: OnShouldStartLoadWithRequest
}

/** Imperative methods and Nitro lifecycle API; set view props through React. */
export type NitroWebViewType = Readonly<
  HybridView<HybridViewProps, NitroWebViewMethods>
>

const NativeNitroWebView = getHostComponent<
  NativeNitroWebViewProps,
  NitroWebViewMethods
>('NitroWebView', () => NitroWebViewConfig)

// Nitro's optional callback converter still requires the object envelope when clearing it.
const emptyCallback = { f: undefined }

type ComponentProps = Omit<
  React.ComponentPropsWithoutRef<
    ReactNativeView<NitroWebViewProps, NitroWebViewMethods>
  >,
  'hybridRef'
> & {
  hybridRef?: NitroViewWrappedCallback<
    ((ref: NitroWebViewType) => void) | undefined
  >
}

/** React component for the Nitro-backed WebView. */
export const NitroWebView = forwardRef<
  React.ComponentRef<typeof NativeNitroWebView>,
  ComponentProps
>(function NitroWebView(
  { onShouldStartLoadWithRequest, onMessage, hybridRef, ...props },
  ref
) {
  const handler = onShouldStartLoadWithRequest?.f
  const nativeHybridRef = useMemo(
    () =>
      Platform.OS !== 'android' || hybridRef == null
        ? hybridRef
        : callback((value: NitroWebViewType) => {
            patchAndroidPostMessage(value)
            hybridRef.f?.(value)
          }),
    [hybridRef]
  )
  const nativeCallback = useMemo(
    () =>
      handler === undefined
        ? emptyCallback
        : callback(createShouldStartLoadBridge(handler)),
    [handler]
  )
  return (
    <NativeNitroWebView
      {...props}
      ref={ref}
      hybridRef={nativeHybridRef}
      onMessage={onMessage ?? emptyCallback}
      onShouldStartLoadWithRequest={nativeCallback}
    />
  )
})
