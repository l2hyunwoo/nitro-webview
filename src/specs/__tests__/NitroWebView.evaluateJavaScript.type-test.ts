import type { HybridView } from 'react-native-nitro-modules'

import type {
  NitroWebView,
  NitroWebViewMethods,
  NitroWebViewProps,
} from '../NitroWebView.nitro'

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

type _EvalJs_IsMember = Assert<
  Equals<'evaluateJavaScript' extends keyof NitroWebViewMethods ? true : false, true>
>

type EvalJsParams = Parameters<NitroWebViewMethods['evaluateJavaScript']>

type _EvalJs_ParamsArity = Assert<Equals<EvalJsParams['length'], 1>>
type _EvalJs_ParamIsString = Assert<Equals<EvalJsParams[0], string>>

type EvalJsReturn = ReturnType<NitroWebViewMethods['evaluateJavaScript']>

type _EvalJs_ReturnIsPromiseString = Assert<Equals<EvalJsReturn, Promise<string>>>

type _EvalJs_ReturnIsNotPromiseUnknown = Assert<
  Equals<Equals<EvalJsReturn, Promise<unknown>>, false>
>
type _EvalJs_ReturnIsNotPromiseVoid = Assert<
  Equals<Equals<EvalJsReturn, Promise<void>>, false>
>
type _EvalJs_ReturnIsNotBareString = Assert<
  Equals<Equals<EvalJsReturn, string>, false>
>

type _EvalJs_AwaitedIsString = Assert<Equals<Awaited<EvalJsReturn>, string>>

declare const methods: NitroWebViewMethods

const _okCall: Promise<string> = methods.evaluateJavaScript('1 + 1')

// @ts-expect-error - `code` must be a string, not a number.
const _badArgType: Promise<string> = methods.evaluateJavaScript(42)

// @ts-expect-error - `code` is required.
const _missingArg: Promise<string> = methods.evaluateJavaScript()

// @ts-expect-error - `evaluateJavaScript` takes exactly one argument.
const _extraArg: Promise<string> = methods.evaluateJavaScript('1 + 1', 'extra')

async function _awaitEndToEnd(): Promise<string> {
  const result: string = await methods.evaluateJavaScript('document.title')
  return result
}

type _NitroWebView_IsHybridView = Assert<
  Equals<NitroWebView, HybridView<NitroWebViewProps, NitroWebViewMethods>>
>

type EvalJsViaHybridView = NitroWebViewMethods['evaluateJavaScript']
type _EvalJs_FullSignature = Assert<
  Equals<EvalJsViaHybridView, (code: string) => Promise<string>>
>

void _okCall
void _badArgType
void _missingArg
void _extraArg
void _awaitEndToEnd

export type {
  _EvalJs_IsMember,
  _EvalJs_ParamsArity,
  _EvalJs_ParamIsString,
  _EvalJs_ReturnIsPromiseString,
  _EvalJs_ReturnIsNotPromiseUnknown,
  _EvalJs_ReturnIsNotPromiseVoid,
  _EvalJs_ReturnIsNotBareString,
  _EvalJs_AwaitedIsString,
  _NitroWebView_IsHybridView,
  _EvalJs_FullSignature,
}
