<p align="center">
  <img src="https://raw.githubusercontent.com/l2hyunwoo/nitro-webview/main/website/content/public/nitro-webview.png" width="120" height="120" alt="Nitro WebView" />
</p>

# nitro-webview

[Documentation](https://l2hyunwoo.github.io/nitro-webview/) · [한국어 문서](https://l2hyunwoo.github.io/nitro-webview/ko/) · [API reference](https://l2hyunwoo.github.io/nitro-webview/reference/props.html)

<table>
  <tr>
    <td align="center"><b>iOS</b></td>
    <td align="center"><b>Android</b></td>
  </tr>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/4ae45afd-b595-4efd-8e44-25c1d03434a8" width="360" autoplay loop muted playsinline /></td>
    <td><video src="https://github.com/user-attachments/assets/9431b353-24a1-41f5-9aee-1fea0520e13d" width="360" autoplay loop muted playsinline /></td>
  </tr>
</table>

A React Native WebView built on [Nitro Modules][nitro] — pure Swift / Kotlin native sides, JSI-direct prop and event dispatch, no bridge round-trips.

This branch describes the unreleased `0.2.0` candidate; its package version remains `0.1.0` until release validation completes.
The published npm API can differ. Match the documentation to your installed version.
The candidate requires the New Architecture, React Native `~0.85.3`, React `19.2.3`, and Nitro Modules `^0.35.9`.
See [installation requirements](https://l2hyunwoo.github.io/nitro-webview/start/installation.html) and [migration](https://l2hyunwoo.github.io/nitro-webview/guides/migration.html).

## Quick start

```sh
yarn add nitro-webview react-native-nitro-modules
cd ios && pod install
```

`react-native-nitro-modules` is a peer dependency — install it explicitly so your dependency graph stays deterministic.

```tsx
import { NitroWebView, callback } from 'nitro-webview'

export default function Screen() {
  return (
    <NitroWebView
      style={{ flex: 1 }}
      source={{ uri: 'https://example.com' }}
      onLoadEnd={callback(() => console.log('loaded'))}
    />
  )
}
```

Every event prop must be wrapped in `callback(...)` so Nitro can dispatch it on the right thread. Passing a raw function will throw at render time.

## Documentation

- [Quick start and hybrid refs](https://l2hyunwoo.github.io/nitro-webview/start/quick-start.html)
- [Props](https://l2hyunwoo.github.io/nitro-webview/reference/props.html), [methods](https://l2hyunwoo.github.io/nitro-webview/reference/methods.html), and [events](https://l2hyunwoo.github.io/nitro-webview/reference/events.html)
- [Platform support](https://l2hyunwoo.github.io/nitro-webview/reference/platforms.html), [permissions](https://l2hyunwoo.github.io/nitro-webview/guides/permissions.html), and [downloads and uploads](https://l2hyunwoo.github.io/nitro-webview/guides/downloads.html)
- [Migration from react-native-webview or 0.1](https://l2hyunwoo.github.io/nitro-webview/guides/migration.html)

## Development

See the [example app and native regression checks](example/README.md) and [documentation site workflow](website/README.md).

## License

[MIT](LICENSE).

[nitro]: https://github.com/mrousavy/nitro
