# Documentation site

VitePress builds the English and Korean documentation from `content/`. This is a standalone package; it does not install React Native or build a native app.

```sh
cd website
npm ci --ignore-scripts
npm run dev
npm run build
npm run preview
```

The site uses `/nitro-webview/` as its base for GitHub Pages. Open the URL printed by VitePress with that base. Markdown links use `.md`; generated HTML links use `.html` so direct requests work on static hosting.

After changing public types, run `npm run reference:generate` and review both generated type pages. The build rejects stale type excerpts, missing prop/method documentation, missing translations, and broken built links or anchors.

The Documentation workflow installs only this package and uploads a site artifact on pull requests. To publish after merge, enable GitHub Pages with the **GitHub Actions** source, then dispatch the workflow on `main` with `deploy=true`. Pull requests and ordinary pushes do not publish.

The docs describe version 0.2.0. Keep the version banner, installation requirements, and migration guide aligned with the package release.
