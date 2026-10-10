import React, { forwardRef, useMemo } from 'react'
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
  { onShouldStartLoadWithRequest, hybridRef, ...props },
  ref
) {
  const handler = onShouldStartLoadWithRequest?.f
  const nativeCallback = useMemo(
    () =>
      callback(
        handler === undefined ? undefined : createShouldStartLoadBridge(handler)
      ),
    [handler]
  )
  return (
    <NativeNitroWebView
      {...props}
      ref={ref}
      hybridRef={hybridRef}
      onShouldStartLoadWithRequest={nativeCallback}
    />
  )
})
