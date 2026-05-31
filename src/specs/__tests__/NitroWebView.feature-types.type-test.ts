import type {
  Cookie,
  FileDownload,
  FileDownloadEvent,
  NitroWebViewMethods,
  NitroWebViewProps,
} from '../NitroWebView.nitro'
import type { UriSource } from '../WebViewSource'

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

// --- defaultHeaders prop ---------------------------------------------------

type _DefaultHeaders_IsOptional = Assert<
  Equals<
    'defaultHeaders' extends OptionalKeys<NitroWebViewProps> ? true : false,
    true
  >
>

type _DefaultHeaders_IsRecord = Assert<
  Equals<
    NitroWebViewProps['defaultHeaders'],
    Record<string, string> | undefined
  >
>

// --- UriSource.headers -----------------------------------------------------

type _UriSource_HeadersIsOptionalRecord = Assert<
  Equals<UriSource['headers'], Record<string, string> | undefined>
>

// --- Cookie shape ----------------------------------------------------------

type _Cookie_Required = Assert<Equals<RequiredKeys<Cookie>, 'name' | 'value'>>
type _Cookie_Optional = Assert<
  Equals<
    OptionalKeys<Cookie>,
    'domain' | 'path' | 'expires' | 'secure' | 'httpOnly'
  >
>
type _Cookie_Name_String = Assert<Equals<Cookie['name'], string>>
type _Cookie_Value_String = Assert<Equals<Cookie['value'], string>>
type _Cookie_Expires_Number = Assert<
  Equals<Cookie['expires'], number | undefined>
>
type _Cookie_Secure_Boolean = Assert<
  Equals<Cookie['secure'], boolean | undefined>
>
type _Cookie_HttpOnly_Boolean = Assert<
  Equals<Cookie['httpOnly'], boolean | undefined>
>

// --- FileDownload shape ----------------------------------------------------

type _FD_Required = Assert<Equals<RequiredKeys<FileDownload>, 'url'>>
type _FD_Optional = Assert<
  Equals<
    OptionalKeys<FileDownload>,
    'mimeType' | 'fileName' | 'contentLength' | 'userAgent'
  >
>

// --- FileDownloadEvent shape ----------------------------------------------

type _FDE_TopLevelKeys = Assert<Equals<keyof FileDownloadEvent, 'nativeEvent'>>
type _FDE_NativeEvent_IsFileDownload = Assert<
  Equals<FileDownloadEvent['nativeEvent'], FileDownload>
>

// --- onFileDownload prop ---------------------------------------------------

type _OnFD_IsOptional = Assert<
  Equals<
    'onFileDownload' extends OptionalKeys<NitroWebViewProps> ? true : false,
    true
  >
>
type _OnFD_Signature = Assert<
  Equals<
    NonNullable<NitroWebViewProps['onFileDownload']>,
    (event: FileDownloadEvent) => void
  >
>

// --- Cookie methods --------------------------------------------------------

type _GetCookies_Signature = Assert<
  Equals<NitroWebViewMethods['getCookies'], (url: string) => Promise<Cookie[]>>
>
type _SetCookie_Signature = Assert<
  Equals<
    NitroWebViewMethods['setCookie'],
    (url: string, cookie: Cookie) => Promise<void>
  >
>
type _ClearCookies_Signature = Assert<
  Equals<NitroWebViewMethods['clearCookies'], () => Promise<void>>
>

// --- Sanity: usage examples that must compile -----------------------------

const _exampleProps: Pick<
  NitroWebViewProps,
  'source' | 'defaultHeaders' | 'onFileDownload'
> = {
  source: {
    uri: 'https://example.com',
    headers: { Authorization: 'Bearer t' },
  },
  defaultHeaders: { 'X-App': 'nitro' },
  onFileDownload: (event) => {
    const _url: string = event.nativeEvent.url
    const _mime: string | undefined = event.nativeEvent.mimeType
    void _url
    void _mime
  },
}

void _exampleProps

export type {
  _DefaultHeaders_IsOptional,
  _DefaultHeaders_IsRecord,
  _UriSource_HeadersIsOptionalRecord,
  _Cookie_Required,
  _Cookie_Optional,
  _Cookie_Name_String,
  _Cookie_Value_String,
  _Cookie_Expires_Number,
  _Cookie_Secure_Boolean,
  _Cookie_HttpOnly_Boolean,
  _FD_Required,
  _FD_Optional,
  _FDE_TopLevelKeys,
  _FDE_NativeEvent_IsFileDownload,
  _OnFD_IsOptional,
  _OnFD_Signature,
  _GetCookies_Signature,
  _SetCookie_Signature,
  _ClearCookies_Signature,
}
