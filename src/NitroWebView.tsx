import React, { forwardRef, useMemo } from 'react'
import { Platform, type HostInstance, type ViewProps } from 'react-native'
import {
  callback,
  getHostComponent,
  type HybridView,
  type HybridViewProps,
  type NitroViewWrappedCallback,
} from 'react-native-nitro-modules'
import NitroWebViewConfig from '../nitrogen/generated/shared/json/NitroWebViewConfig.json'
import type {
  NitroWebViewMethods,
  NitroWebViewProps as NativeNitroWebViewProps,
} from './specs/NitroWebView.nitro'
import type { OnShouldStartLoadWithRequest } from './originWhitelist'
import { createShouldStartLoadBridge } from './shouldStartLoadBridge'
import { patchAndroidPostMessage } from './bridgeScript'

type EventHandler = (...args: never[]) => unknown
type CallbackProp<T extends EventHandler> =
  | T
  | NitroViewWrappedCallback<T | undefined>
type PublicCallbacks<Props> = {
  [K in keyof Props]: NonNullable<Props[K]> extends EventHandler
    ? CallbackProp<NonNullable<Props[K]>>
    : Props[K]
}

/** Event handlers accept plain functions or existing Nitro callback wrappers. */
export interface NitroWebViewProps extends PublicCallbacks<
  Omit<NativeNitroWebViewProps, 'onShouldStartLoadWithRequest'>
> {
  onShouldStartLoadWithRequest?: CallbackProp<OnShouldStartLoadWithRequest>
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

function unwrapCallback<T extends EventHandler>(
  value: CallbackProp<T> | undefined
): T | undefined {
  return typeof value === 'function' ? value : value?.f
}

function useNativeCallback<T extends EventHandler>(
  value: CallbackProp<T> | undefined
) {
  const handler = unwrapCallback(value)
  return useMemo(() => callback(handler) ?? emptyCallback, [handler])
}

type ComponentProps = NitroWebViewProps &
  ViewProps & {
    hybridRef?: CallbackProp<(ref: NitroWebViewType) => void>
  }

// Explicit type: RN 0.88's inferred ref type points at a private module and breaks declaration emit.
/** React component for the Nitro-backed WebView. */
export const NitroWebView: React.ForwardRefExoticComponent<
  React.PropsWithoutRef<ComponentProps> & React.RefAttributes<HostInstance>
  // eslint-disable-next-line @typescript-eslint/no-shadow -- keeps the DevTools name
> = forwardRef<HostInstance, ComponentProps>(function NitroWebView(
  {
    onShouldStartLoadWithRequest,
    onMessage,
    onLoadStart,
    onLoad,
    onLoadProgress,
    onLoadEnd,
    onNavigationStateChange,
    onError,
    onHttpError,
    onOpenWindow,
    onFileDownload,
    onRenderProcessGone,
    onScroll,
    hybridRef,
    ...props
  },
  ref
) {
  const handler = unwrapCallback(onShouldStartLoadWithRequest)
  const refHandler = unwrapCallback(hybridRef)
  const nativeHybridRef = useMemo(
    () =>
      refHandler === undefined
        ? emptyCallback
        : callback(
            Platform.OS === 'android'
              ? (value: NitroWebViewType) => {
                  patchAndroidPostMessage(value)
                  refHandler(value)
                }
              : refHandler
          ),
    [refHandler]
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
      onMessage={useNativeCallback(onMessage)}
      onLoadStart={useNativeCallback(onLoadStart)}
      onLoad={useNativeCallback(onLoad)}
      onLoadProgress={useNativeCallback(onLoadProgress)}
      onLoadEnd={useNativeCallback(onLoadEnd)}
      onNavigationStateChange={useNativeCallback(onNavigationStateChange)}
      onError={useNativeCallback(onError)}
      onHttpError={useNativeCallback(onHttpError)}
      onOpenWindow={useNativeCallback(onOpenWindow)}
      onFileDownload={useNativeCallback(onFileDownload)}
      onRenderProcessGone={useNativeCallback(onRenderProcessGone)}
      onScroll={useNativeCallback(onScroll)}
      onShouldStartLoadWithRequest={nativeCallback}
    />
  )
})
