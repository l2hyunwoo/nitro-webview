import { defineConfig, type DefaultTheme } from 'vitepress'

const repository = 'https://github.com/l2hyunwoo/nitro-webview'
const groups = [
  [
    'Get started',
    '시작하기',
    [
      ['Installation', '설치', 'start/installation'],
      ['Your first WebView', '첫 WebView', 'start/quick-start'],
    ],
  ],
  [
    'Guides',
    '가이드',
    [
      ['Navigation', '탐색 제어', 'guides/navigation'],
      ['Messages & origins', '메시지와 origin', 'guides/messaging'],
      ['JavaScript', 'JavaScript 실행', 'guides/javascript'],
      ['Cookies & sessions', '쿠키와 세션', 'guides/cookies'],
      ['Downloads & uploads', '다운로드와 업로드', 'guides/downloads'],
      ['Media & permissions', '미디어와 권한', 'guides/permissions'],
      ['Migration', '마이그레이션', 'guides/migration'],
      ['Troubleshooting', '문제 해결', 'guides/troubleshooting'],
    ],
  ],
  [
    'Reference',
    'API Reference',
    [
      ['Props', 'Props', 'reference/props'],
      ['Methods', 'Methods', 'reference/methods'],
      ['Events', 'Events', 'reference/events'],
      ['Types', 'Types', 'reference/types'],
      ['Utilities', '유틸리티', 'reference/utilities'],
      ['Platform support', '플랫폼 지원', 'reference/platforms'],
    ],
  ],
] as const

function locale(korean: boolean): DefaultTheme.Config {
  const prefix = korean ? '/ko/' : '/'
  return {
    nav: [
      {
        text: korean ? '문서' : 'Documentation',
        link: `${prefix}start/installation`,
        activeMatch: 'start|guides',
      },
      {
        text: 'API',
        link: `${prefix}reference/props`,
        activeMatch: 'reference',
      },
    ],
    sidebar: groups.map(([en, ko, items]) => ({
      text: korean ? ko : en,
      items: items.map(([english, translated, path]) => ({
        text: korean ? translated : english,
        link: prefix + path,
      })),
    })),
    outline: {
      label: korean ? '이 페이지에서' : 'On this page',
      level: [2, 3],
    },
    editLink: {
      pattern: `${repository}/edit/main/website/content/:path`,
      text: korean ? 'GitHub에서 수정' : 'Edit this page on GitHub',
    },
    docFooter: {
      prev: korean ? '이전' : 'Previous',
      next: korean ? '다음' : 'Next',
    },
    sidebarMenuLabel: korean ? '메뉴' : 'Menu',
    returnToTopLabel: korean ? '맨 위로' : 'Return to top',
    darkModeSwitchLabel: korean ? '테마' : 'Appearance',
    darkModeSwitchTitle: korean ? '다크 모드로 전환' : 'Switch to dark theme',
    lightModeSwitchTitle: korean
      ? '라이트 모드로 전환'
      : 'Switch to light theme',
    langMenuLabel: korean ? '언어 변경' : 'Change language',
  }
}

export default defineConfig({
  title: 'Nitro WebView',
  description:
    'A React Native WebView built on Nitro Modules. Typed callbacks, native controls, and explicit platform behavior.',
  srcDir: 'content',
  base: '/nitro-webview/',
  appearance: true,
  cleanUrls: false,
  sitemap: { hostname: 'https://l2hyunwoo.github.io/nitro-webview/' },
  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        href: '/nitro-webview/nitro-webview.png',
      },
    ],
    ['meta', { name: 'theme-color', content: '#09090b' }],
    [
      'meta',
      {
        property: 'og:image',
        content: 'https://l2hyunwoo.github.io/nitro-webview/nitro-webview.png',
      },
    ],
  ],
  markdown: { theme: { light: 'github-light', dark: 'github-dark' } },
  locales: {
    root: { label: 'English', lang: 'en', themeConfig: locale(false) },
    ko: {
      label: '한국어',
      lang: 'ko',
      description:
        'Nitro Modules 기반 React Native WebView. 타입이 있는 콜백과 네이티브 제어, 플랫폼별 동작을 확인하세요.',
      themeConfig: locale(true),
    },
  },
  themeConfig: {
    logo: { src: '/nitro-webview.png', alt: '', width: 36, height: 36 },
    socialLinks: [{ icon: 'github', link: repository }],
    footer: {
      message: 'MIT licensed · Built with Nitro Modules',
      copyright: 'Nitro WebView',
    },
    search: {
      provider: 'local',
      options: {
        locales: {
          ko: {
            translations: {
              button: { buttonText: '문서 검색', buttonAriaLabel: '문서 검색' },
              modal: {
                noResultsText: '검색 결과가 없습니다',
                resetButtonTitle: '검색어 지우기',
                displayDetails: '자세히 보기',
                backButtonTitle: '검색으로 돌아가기',
                footer: {
                  selectText: '선택',
                  navigateText: '이동',
                  closeText: '닫기',
                },
              },
            },
          },
        },
      },
    },
  },
})
