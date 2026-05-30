import type {
  NitroWebViewErrorEvent,
  NitroWebViewProps,
  WebViewErrorEvent,
} from '../NitroWebView.nitro'

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

type Assert<T extends true> = T

type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K
}[keyof T]

type OptionalKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? K : never
}[keyof T]

type NitroErrEventNativeEvent = NitroWebViewErrorEvent['nativeEvent']

type _Shape_TopLevelKeys = Assert<
  Equals<keyof NitroWebViewErrorEvent, 'nativeEvent'>
>

type _Shape_NativeEventKeys = Assert<
  Equals<
    keyof NitroErrEventNativeEvent,
    'code' | 'description' | 'url' | 'domain'
  >
>

type _NativeEvent_IsRequired = Assert<
  Equals<RequiredKeys<NitroWebViewErrorEvent>, 'nativeEvent'>
>

type _NativeEvent_HasNoOptionalTopLevelKeys = Assert<
  Equals<OptionalKeys<NitroWebViewErrorEvent>, never>
>

type _Code_IsNumber = Assert<Equals<NitroErrEventNativeEvent['code'], number>>

type _Description_IsString = Assert<
  Equals<NitroErrEventNativeEvent['description'], string>
>

// `url` is always a string. When the native side has no URL in hand it
// forwards an empty string — never null/undefined. Pinning this at the
// type level guarantees downstream consumers can read `event.nativeEvent.url`
// without optional-chaining.
type _Url_IsString = Assert<Equals<NitroErrEventNativeEvent['url'], string>>

type _Url_IsNotOptional = Assert<
  Equals<Equals<NitroErrEventNativeEvent['url'], string | undefined>, false>
>
type _Url_IsNotNullable = Assert<
  Equals<Equals<NitroErrEventNativeEvent['url'], string | null>, false>
>

type _Domain_IsString = Assert<
  Equals<NitroErrEventNativeEvent['domain'], string>
>

type _NativeEvent_AllFieldsRequired = Assert<
  Equals<
    RequiredKeys<NitroErrEventNativeEvent>,
    'code' | 'description' | 'url' | 'domain'
  >
>

type _NativeEvent_NoOptionalFields = Assert<
  Equals<OptionalKeys<NitroErrEventNativeEvent>, never>
>

type _OnError_IsMember = Assert<
  Equals<'onError' extends keyof NitroWebViewProps ? true : false, true>
>

type _OnError_IsOptional = Assert<
  Equals<'onError' extends OptionalKeys<NitroWebViewProps> ? true : false, true>
>

type OnErrorCallback = NonNullable<NitroWebViewProps['onError']>

type _OnError_FullSignature = Assert<
  Equals<OnErrorCallback, (event: NitroWebViewErrorEvent) => void>
>

type OnErrorParams = Parameters<OnErrorCallback>
type _OnError_Arity = Assert<Equals<OnErrorParams['length'], 1>>
type _OnError_ParamIsEvent = Assert<
  Equals<OnErrorParams[0], NitroWebViewErrorEvent>
>

type _OnError_Returns_Void = Assert<Equals<ReturnType<OnErrorCallback>, void>>

type _Legacy_AliasMatchesCanonical = Assert<
  Equals<WebViewErrorEvent, NitroWebViewErrorEvent>
>

const _accepted_full: NitroWebViewErrorEvent = {
  nativeEvent: {
    code: -1003,
    description: 'A server with the specified hostname could not be found.',
    url: 'https://nonexistent.example.invalid/path',
    domain: 'NSURLErrorDomain',
  },
}

const _accepted_emptyUrl: NitroWebViewErrorEvent = {
  nativeEvent: {
    code: -999,
    description: 'cancelled',
    url: '',
    domain: 'NSURLErrorDomain',
  },
}

// @ts-expect-error - `nativeEvent` is required.
const _rejected_missingNativeEvent: NitroWebViewErrorEvent = {}

const _rejected_missingCode: NitroWebViewErrorEvent = {
  // @ts-expect-error - `code` is required on `nativeEvent`.
  nativeEvent: {
    description: 'oops',
    url: '',
    domain: 'NSURLErrorDomain',
  },
}

const _rejected_missingDescription: NitroWebViewErrorEvent = {
  // @ts-expect-error - `description` is required on `nativeEvent`.
  nativeEvent: {
    code: -1,
    url: '',
    domain: 'NSURLErrorDomain',
  },
}

const _rejected_missingUrl: NitroWebViewErrorEvent = {
  // @ts-expect-error - `url` is required on `nativeEvent`.
  nativeEvent: {
    code: -1,
    description: 'oops',
    domain: 'NSURLErrorDomain',
  },
}

const _rejected_missingDomain: NitroWebViewErrorEvent = {
  // @ts-expect-error - `domain` is required on `nativeEvent`.
  nativeEvent: {
    code: -1,
    description: 'oops',
    url: '',
  },
}

const _rejected_codeWrongType: NitroWebViewErrorEvent = {
  nativeEvent: {
    // @ts-expect-error - `code` must be a number, not a string.
    code: '-1003',
    description: 'oops',
    url: '',
    domain: 'NSURLErrorDomain',
  },
}

const _rejected_descriptionWrongType: NitroWebViewErrorEvent = {
  nativeEvent: {
    code: -1,
    // @ts-expect-error - `description` must be a string, not a number.
    description: 42,
    url: '',
    domain: 'NSURLErrorDomain',
  },
}

const _rejected_urlIsNull: NitroWebViewErrorEvent = {
  nativeEvent: {
    code: -1,
    description: 'oops',
    // @ts-expect-error - `url` must be a string (empty string is OK; null is not).
    url: null,
    domain: 'NSURLErrorDomain',
  },
}

const _rejected_domainWrongType: NitroWebViewErrorEvent = {
  nativeEvent: {
    code: -1,
    description: 'oops',
    url: '',
    // @ts-expect-error - `domain` must be a string, not a boolean.
    domain: true,
  },
}

const _props_withoutOnError: Pick<NitroWebViewProps, 'source'> = {
  source: { uri: 'https://example.com' },
}

const _props_withOnError: Pick<NitroWebViewProps, 'source' | 'onError'> = {
  source: { uri: 'https://example.com' },
  onError: (event) => {
    const _code: number = event.nativeEvent.code
    const _description: string = event.nativeEvent.description
    const _url: string = event.nativeEvent.url
    const _domain: string = event.nativeEvent.domain
    void _code
    void _description
    void _url
    void _domain
  },
}

void _accepted_full
void _accepted_emptyUrl
void _rejected_missingNativeEvent
void _rejected_missingCode
void _rejected_missingDescription
void _rejected_missingUrl
void _rejected_missingDomain
void _rejected_codeWrongType
void _rejected_descriptionWrongType
void _rejected_urlIsNull
void _rejected_domainWrongType
void _props_withoutOnError
void _props_withOnError

export type {
  _Shape_TopLevelKeys,
  _Shape_NativeEventKeys,
  _NativeEvent_IsRequired,
  _NativeEvent_HasNoOptionalTopLevelKeys,
  _Code_IsNumber,
  _Description_IsString,
  _Url_IsString,
  _Url_IsNotOptional,
  _Url_IsNotNullable,
  _Domain_IsString,
  _NativeEvent_AllFieldsRequired,
  _NativeEvent_NoOptionalFields,
  _OnError_IsMember,
  _OnError_IsOptional,
  _OnError_FullSignature,
  _OnError_Arity,
  _OnError_ParamIsEvent,
  _OnError_Returns_Void,
  _Legacy_AliasMatchesCanonical,
}
