export interface LoadUrlCommand {
  type: 'loadUrl'
  url: string
}

export interface LoadHtmlCommand {
  type: 'loadHtml'
  html: string
  baseUrl?: string
}

export type NativeViewCommand = LoadUrlCommand | LoadHtmlCommand
