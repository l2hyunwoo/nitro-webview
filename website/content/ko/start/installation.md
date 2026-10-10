# 설치

라이브러리와 Nitro 런타임을 설치한 뒤 네이티브 앱을 다시 빌드합니다.

::: warning 개발 API 문서
이 문서는 0.2 후보 버전의 변경 사항을 포함한 저장소의 개발 API를 설명합니다. npm에 배포된 최신 버전과 동작이 다를 수 있습니다. 설치한 버전과 문서를 맞추고 [마이그레이션](../guides/migration.md)을 확인하세요.
:::

## 요구 사항 {#requirements}

개발 기준은 New Architecture를 사용하는 React Native **0.85.3**, React **19.2.3**, Nitro Modules **0.35.9**입니다. 후보 버전의 peer 범위는 RN `~0.85.3`, React `19.2.3`, Nitro `^0.35.9`입니다.

React Native 0.85.3의 최소 배포 버전은 Android API **24**, iOS **15.1**입니다. 모든 OS·기기 조합을 검증했다는 뜻은 아닙니다. [플랫폼 지원](../reference/platforms.md)을 확인하세요.

## 패키지 설치 {#add-the-packages}

::: code-group
```sh [npm]
npm install nitro-webview react-native-nitro-modules
```
```sh [yarn]
yarn add nitro-webview react-native-nitro-modules
```
:::

설치한 라이브러리와 호환되는 Nitro 런타임을 선택하세요. 네이티브 바이너리와 JavaScript 패키지의 버전을 맞춰야 합니다.

## iOS {#ios}

앱의 `ios` 디렉터리에서 실행합니다.

```sh
bundle exec pod install
```

앱을 다시 빌드하고 실행합니다. Metro 새로고침만으로 네이티브 바인딩을 설치할 수는 없습니다.

## Android {#android}

Autolinking으로 라이브러리를 등록합니다. 라이브러리나 Nitro 런타임을 추가·업그레이드했다면 Android 앱도 다시 빌드하고 설치하세요.

카메라·마이크·위치·파일 입력을 사용한다면 필요한 권한만 설정합니다. [미디어와 권한](../guides/permissions.md), [다운로드와 업로드](../guides/downloads.md)를 참고하세요.

## Expo {#expo}

네이티브 autolinking을 사용하는 development build가 필요합니다. **Expo Go에는 이 네이티브 모듈이 없습니다.** 이 패키지는 config plugin을 제공하지 않습니다. 네이티브 프로젝트나 Expo 앱 설정에서 권한을 지정하고 필요에 따라 네이티브 앱을 다시 생성·빌드하세요.

다음: [첫 WebView 렌더링](./quick-start.md).
