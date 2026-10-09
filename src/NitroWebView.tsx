import React, { forwardRef, useMemo } from 'react'
import {
  callback,
  getHostComponent,
  type HybridView,
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

export type NitroWebViewType = HybridView<
  NitroWebViewProps,
  NitroWebViewMethods
>

const NativeNitroWebView = getHostComponent<
  NativeNitroWebViewProps,
  NitroWebViewMethods
>('NitroWebView', () => NitroWebViewConfig)

type ComponentProps = React.ComponentPropsWithoutRef<
  ReactNativeView<NitroWebViewProps, NitroWebViewMethods>
>
type NativeComponentProps = React.ComponentProps<typeof NativeNitroWebView>

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
  // shortcut: the same native instance has a different internal callback type;
  // assign navigation callbacks through React props, not through hybridRef.
  const nativeHybridRef = hybridRef as NativeComponentProps['hybridRef']

  return (
    <NativeNitroWebView
      {...props}
      ref={ref}
      hybridRef={nativeHybridRef}
      onShouldStartLoadWithRequest={nativeCallback}
    />
  )
})
