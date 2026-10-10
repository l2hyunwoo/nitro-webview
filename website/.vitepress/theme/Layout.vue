<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData, withBase } from 'vitepress'
const { lang } = useData()
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <div class="development-notice">
        <span class="status-dot" aria-hidden="true" />
        <template v-if="lang === 'ko'">
          0.2.0 문서입니다. 설치한 버전의 API와
          <a :href="withBase('/ko/guides/migration.html')">변경 사항</a>을
          확인하세요.
        </template>
        <template v-else>
          Documentation for 0.2.0. Check your installed version and the
          <a :href="withBase('/guides/migration.html')">migration guide</a>.
        </template>
      </div>
    </template>
  </DefaultTheme.Layout>
</template>
