<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
const { lang } = useData()
const korean = computed(() => lang.value === 'ko')
const route = (path: string) =>
  withBase(`${korean.value ? '/ko' : ''}/${path}.html`)
const copy = computed(() =>
  korean.value
    ? {
        badge: '개발 문서',
        description:
          'Nitro Modules로 만든 React Native WebView. 익숙한 웹 콘텐츠를 타입이 있는 콜백과 네이티브 API로 연결하세요.',
        start: '시작하기',
        api: 'API 살펴보기',
        caption: 'iOS · Android · New Architecture',
        section: 'WEB → REACT NATIVE',
        heading: '첫 화면부터 연결까지.',
        detail:
          'WebView를 렌더링하고 페이지의 메시지를 받으세요. 콜백은 callback()으로 감쌉니다.',
        guide: '첫 WebView 만들기',
        index: 'DOCUMENTATION',
        indexTitle: '만들려는 기능부터 시작하세요.',
        cards: [
          [
            '01',
            '탐색 제어',
            '링크, 새 창, 뒤로 가기를 앱의 흐름에 연결하세요.',
            'guides/navigation',
          ],
          [
            '02',
            '메시지와 origin',
            '페이지와 메시지를 주고받고 네이티브 발신 정보를 확인하세요.',
            'guides/messaging',
          ],
          [
            '03',
            '쿠키와 세션',
            '플랫폼별 cookie store와 iOS 비공개 세션을 이해하세요.',
            'guides/cookies',
          ],
          [
            '04',
            'API Reference',
            'Props, 메서드, 이벤트와 플랫폼별 차이를 확인하세요.',
            'reference/props',
          ],
        ],
        footer: '플랫폼마다 다른 동작, 문서에서 먼저 확인하세요.',
        platforms: '플랫폼 지원 확인',
      }
    : {
        badge: 'Development docs',
        description:
          'A React Native WebView built on Nitro Modules. Connect your web content with typed callbacks and native APIs.',
        start: 'Get started',
        api: 'Explore the API',
        caption: 'iOS · Android · New Architecture',
        section: 'WEB → REACT NATIVE',
        heading: 'From a page to your app.',
        detail:
          'Render a WebView and receive a message from the page. Wrap event handlers with callback().',
        guide: 'Build your first WebView',
        index: 'DOCUMENTATION',
        indexTitle: 'Start with what you want to build.',
        cards: [
          [
            '01',
            'Control navigation',
            'Connect links, new windows, and history to your app flow.',
            'guides/navigation',
          ],
          [
            '02',
            'Exchange messages',
            'Send page messages and check the native sender identity.',
            'guides/messaging',
          ],
          [
            '03',
            'Manage sessions',
            'Understand cookie stores and private sessions on iOS.',
            'guides/cookies',
          ],
          [
            '04',
            'Find an API',
            'Look up props, methods, events, and platform differences.',
            'reference/props',
          ],
        ],
        footer: 'Different platforms. Explicit behavior.',
        platforms: 'Check platform support',
      }
)
</script>

<template>
  <div class="nitro-home">
    <section class="hero" aria-labelledby="home-title">
      <div class="hero-copy">
        <a class="version-pill" :href="route('guides/migration')"
          ><span class="status-dot" aria-hidden="true" />{{ copy.badge
          }}<span aria-hidden="true">↗</span></a
        >
        <p class="eyebrow">NITRO WEBVIEW / REACT NATIVE</p>
        <h1 id="home-title">Nitro +<br /><span>WebView = 🚀</span></h1>
        <p class="hero-description">{{ copy.description }}</p>
        <div class="hero-actions">
          <a class="primary-action" :href="route('start/installation')"
            >{{ copy.start }}<span aria-hidden="true">→</span></a
          >
          <a class="secondary-action" :href="route('reference/props')">{{
            copy.api
          }}</a>
        </div>
        <p class="hero-caption">{{ copy.caption }}</p>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="art-orbit">
          <span class="orbit-label">JSI / NATIVE VIEWS</span>
        </div>
        <img
          :src="withBase('/nitro-webview.png')"
          width="1254"
          height="1254"
          alt=""
          fetchpriority="high"
        />
        <span class="art-coordinate">35° N / WEB</span>
      </div>
    </section>

    <div class="capability-strip" aria-label="Technology">
      <span>TypeScript</span><span>Nitro Modules</span><span>WKWebView</span
      ><span>Android WebView</span><span>MIT licensed</span>
    </div>

    <section class="connection-section" aria-labelledby="connection-title">
      <div class="section-copy">
        <p class="eyebrow">{{ copy.section }}</p>
        <h2 id="connection-title">{{ copy.heading }}</h2>
        <p>{{ copy.detail }}</p>
        <a class="text-link" :href="route('start/quick-start')"
          >{{ copy.guide }} <span aria-hidden="true">→</span></a
        >
        <div class="connection-path" aria-hidden="true">
          <span>WEB</span><i /><span>JSI</span><i /><span>NATIVE</span>
        </div>
      </div>
      <div class="example-panel">
        <div class="example-header">
          <span class="file-name">Screen.tsx</span><span>React Native</span>
        </div>
        <div class="vp-doc"><slot /></div>
        <div class="example-result">
          <span class="status-dot" aria-hidden="true" /><code>onMessage</code
          ><span>hello from the web</span>
        </div>
      </div>
    </section>

    <section class="guide-section" aria-labelledby="guides-title">
      <p class="eyebrow">{{ copy.index }}</p>
      <h2 id="guides-title">{{ copy.indexTitle }}</h2>
      <div class="guide-grid">
        <a
          v-for="[number, title, description, path] in copy.cards"
          :key="path"
          class="guide-card"
          :href="route(path)"
        >
          <div class="guide-card-top">
            <span>{{ number }}</span
            ><span aria-hidden="true">↗</span>
          </div>
          <h3>{{ title }}</h3>
          <p>{{ description }}</p>
        </a>
      </div>
    </section>
    <div class="home-bottom">
      <p>{{ copy.footer }}</p>
      <a class="text-link" :href="route('reference/platforms')"
        >{{ copy.platforms }} <span aria-hidden="true">→</span></a
      >
    </div>
  </div>
</template>
