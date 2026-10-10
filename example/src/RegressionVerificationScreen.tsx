import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Button,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { callback, NitroWebView, wrapWithOriginWhitelist } from 'nitro-webview';
import type {
  FileDownloadEvent,
  OpenWindowEvent,
  NitroWebViewErrorEvent,
  NitroWebViewMethods,
  NitroWebViewProps,
  NitroWebViewRenderProcessGoneEvent,
  ShouldStartLoadRequest,
  WebViewLoadEvent,
  WebViewMessageEvent,
  WebViewNavigationState,
  WebViewSource,
} from 'nitro-webview';

import { color, fontSize, spacing } from './components/theme';

const origin = 'http://127.0.0.1:8098';
const fixtureText = 'Nitro native regression bytes: 한글 😀\n';
const delay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

type CaseResult = {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
};
type RequestRecord = {
  receivedAt: number;
  path: string;
  query: string;
  method: string;
  body: string;
  cookieNames: string[];
  authorizationMatches: boolean;
  authorizationCount: number;
};
type Settings = Pick<
  NitroWebViewProps,
  | 'javaScriptEnabled'
  | 'domStorageEnabled'
  | 'incognito'
  | 'sharedCookiesEnabled'
  | 'defaultHeaders'
  | 'injectedJavaScript'
  | 'injectedJavaScriptBeforeContentLoaded'
  | 'mediaCapturePermissionOrigins'
  | 'geolocationPermissionOrigins'
  | 'allowsInlineMediaPlayback'
  | 'allowedMessageOrigins'
>;
type MessageRecord = WebViewMessageEvent['nativeEvent'];
type Decision = (request: ShouldStartLoadRequest) => boolean | Promise<boolean>;
type DecisionTiming = {
  url: string;
  invokedAt: number;
  settledAt?: number;
  allowed?: boolean;
  error?: string;
};
type EvaluationProbe = {
  startedAt: number;
  settledAt?: number;
  rejected?: boolean;
  pendingAtRendererExit?: boolean;
};
type Observation = {
  key: number;
  source: WebViewSource;
  settings: Settings;
  decide?: Decision;
  ref: NitroWebViewMethods | null;
  events: string[];
  messages: string[];
  messageEvents: MessageRecord[];
  downloads: FileDownloadEvent['nativeEvent'][];
  windows: string[];
  errors: NitroWebViewErrorEvent['nativeEvent'][];
  httpStatuses: number[];
  states: WebViewNavigationState[];
  decisions: string[];
  rendererEvents: NitroWebViewRenderProcessGoneEvent['nativeEvent'][];
  timeline: { at: number; event: string; url?: string }[];
  decisionTimings: DecisionTiming[];
  diagnostics: string[];
  evaluationProbe?: EvaluationProbe;
};

function check(value: unknown, detail: string): asserts value {
  if (!value) throw new Error(detail);
}

async function bounded<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 10000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function rejects(promise: Promise<unknown>, label: string) {
  const outcome = await bounded(
    promise.then(
      () => false,
      () => true,
    ),
    label,
  );
  check(outcome, `${label} unexpectedly fulfilled`);
}

async function fixture<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${origin}${path}`, {
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    check(response.ok, `${path}: HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Runs through the normal AppRegistry root, with production callbacks and refs. */
export function RegressionVerificationScreen() {
  const [views, setViews] = useState<Observation[]>([]);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState('Ready');
  const [summary, setSummary] = useState('READY');
  const [reportError, setReportError] = useState('');
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const sequence = useRef(0);
  const liveViews = useRef<Observation[]>([]);
  const appStates = useRef<string[]>([]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      appStates.current.push(state);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, []);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setResults([]);
    setSummary('RUNNING');
    setReportError('');
    const completed: CaseResult[] = [];
    const runID = Date.now().toString(36);
    let caseIndex = 0;
    let caseViews: Observation[] = [];
    const query = () => `?case=${runID}-${caseIndex}`;
    const url = (path: string) => `${origin}${path}${query()}`;
    const active = () => mounted.current;

    async function until(
      predicate: () => boolean,
      label: string,
      timeoutMs = 10000,
    ) {
      const deadline = Date.now() + timeoutMs;
      while (!predicate()) {
        check(active(), 'Regression screen was removed');
        check(Date.now() < deadline, `${label} timed out`);
        await delay(25);
      }
      check(active(), 'Regression screen was removed');
    }

    function create(
      source: WebViewSource,
      settings: Settings = {},
      decide?: Decision,
    ): Observation {
      const observation: Observation = {
        key: ++sequence.current,
        source,
        settings: {
          javaScriptEnabled: true,
          domStorageEnabled: true,
          incognito: false,
          sharedCookiesEnabled: false,
          ...settings,
        },
        decide,
        ref: null,
        events: [],
        messages: [],
        messageEvents: [],
        downloads: [],
        windows: [],
        errors: [],
        httpStatuses: [],
        states: [],
        decisions: [],
        rendererEvents: [],
        timeline: [],
        decisionTimings: [],
        diagnostics: [],
      };
      caseViews.push(observation);
      return observation;
    }

    async function show(next: Observation[]) {
      check(active(), 'Regression screen was removed');
      liveViews.current = next;
      setViews(next);
      await until(() => next.every(view => view.ref !== null), 'hybridRef');
    }

    async function mount(
      path: string,
      settings: Settings = {},
      decide?: Decision,
      source?: WebViewSource,
    ) {
      const view = create(source ?? { uri: url(path) }, settings, decide);
      await show([view]);
      return view;
    }

    async function unmount() {
      liveViews.current.forEach(view => {
        view.ref = null;
      });
      liveViews.current = [];
      if (active()) setViews([]);
      // Give React's removal commit a turn before constructing another view.
      await delay(150);
    }

    function ref(view: Observation) {
      check(view.ref, 'hybridRef is missing');
      return view.ref;
    }

    async function ready(view: Observation, path?: string, timeoutMs = 10000) {
      await until(
        () =>
          view.messages.some(message => {
            if (!message.startsWith('ready:')) return false;
            return (
              path === undefined || JSON.parse(message.slice(6)).path === path
            );
          }),
        `page ready ${path ?? ''}`,
        timeoutMs,
      );
      await until(
        () => {
          if (!view.events.includes('end')) return false;
          if (path === undefined) return true;
          const state = view.states.at(-1);
          return (
            state !== undefined &&
            new URL(state.url).pathname === path &&
            !state.loading
          );
        },
        'onLoadEnd',
        timeoutMs,
      );
    }

    async function records() {
      const all = await fixture<RequestRecord[]>('/requests');
      return all.filter(request => request.query === query());
    }

    async function evaluate(view: Observation, code: string): Promise<unknown> {
      const value = await bounded(
        ref(view).evaluateJavaScript(code),
        'evaluateJavaScript',
      );
      return JSON.parse(value);
    }

    async function pageDiagnostic(view: Observation, label: string) {
      try {
        const value = await bounded(
          ref(view).evaluateJavaScript(
            '({url:location.href,historyLength:history.length,readyState:document.readyState,hasFocus:document.hasFocus(),visibility:document.visibilityState,secureContext:window.isSecureContext})',
          ),
          'page diagnostic',
          2000,
        );
        view.diagnostics.push(`${label}: ${value}`);
      } catch (error) {
        view.diagnostics.push(`${label}: ${String(error)}`);
      }
    }

    function click(view: Observation, markNavigation = false) {
      ref(view).injectJavaScript(
        `${
          markNavigation
            ? `
          (() => {
            const marker = new XMLHttpRequest();
            marker.open('GET', '/navigation-start-marker' + location.search, false);
            marker.send();
            if (marker.status !== 200) throw new Error('Navigation marker failed');
          })();`
            : ''
        }
        document.getElementById('nav').click();true;`,
      );
    }

    async function interact(action: string, label?: string) {
      const id = `${runID}-${caseIndex}-${++sequence.current}`;
      await fixture('/interaction', {
        id,
        action,
        ...(label ? { label } : {}),
      });
      try {
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
          const result = await fixture<{
            id: string;
            ok: boolean;
            detail: string;
          } | null>('/interaction-result');
          if (result?.id === id) {
            check(result.ok, result.detail);
            return;
          }
          check(active(), 'Regression screen was removed');
          await delay(250);
        }
        throw new Error(`Native interaction ${action} timed out`);
      } finally {
        await fixture('/interaction', null);
      }
    }

    async function report(complete: boolean) {
      try {
        await fixture('/results', {
          complete,
          platform: Platform.OS,
          cases: completed,
        });
        if (active()) setReportError('');
        return true;
      } catch (error) {
        if (active()) setReportError(`Result upload failed: ${String(error)}`);
        return false;
      }
    }

    const tests: [string, () => Promise<string>][] = [
      [
        'load-200',
        async () => {
          const view = await mount('/200');
          // The first WebKit process launch is slower on hosted simulators.
          await ready(view, undefined, 30000);
          await delay(200);
          check(
            view.events.join(',') === 'start,load,end',
            `load order: ${view.events.join(',')}`,
          );
          check(
            view.errors.length === 0 && view.httpStatuses.length === 0,
            '200 emitted an error',
          );
          const requests = await records();
          check(
            requests.filter(request => request.path === '/200').length === 1,
            '200 request duplicated',
          );
          return 'onLoadStart → onLoad → onLoadEnd, each once; server saw one request';
        },
      ],
      [
        'http-404',
        async () => {
          const view = await mount('/404');
          await until(
            () =>
              view.events.includes('end') && view.httpStatuses.includes(404),
            '404 events',
          );
          await delay(200);
          check(
            view.events.filter(event => event === 'load').length === 0,
            '404 emitted success',
          );
          check(
            view.events.filter(event => event === 'end').length === 1,
            '404 terminal event duplicated',
          );
          check(
            view.httpStatuses.length === 1 && view.errors.length === 0,
            '404 error classification duplicated',
          );
          return 'one onHttpError(404), one onLoadEnd, zero onLoad';
        },
      ],
      [
        'transport-error',
        async () => {
          const view = await mount('/unreachable', {}, undefined, {
            uri: `http://127.0.0.1:8097/unreachable${query()}`,
          });
          await until(
            () => view.events.includes('end') && view.errors.length > 0,
            'transport error',
          );
          await delay(200);
          check(
            !view.events.includes('load'),
            'transport failure emitted success',
          );
          check(
            view.events.filter(event => event === 'end').length === 1,
            'transport terminal event duplicated',
          );
          check(
            view.errors.length === 1 && view.httpStatuses.length === 0,
            'transport error classification duplicated',
          );
          return 'one onError, one onLoadEnd, zero onLoad; port 8097 refused connection';
        },
      ],
      [
        'message-roundtrip',
        async () => {
          const view = await mount('/message');
          await ready(view);
          const payload = 'quotes " \\ newline\n한글 😀 \u2028 end';
          ref(view).postMessage(payload);
          await until(
            () => view.messages.includes(`echo:${payload}`),
            'native message echo',
          );
          await delay(150);
          check(
            view.messages.filter(message => message === `echo:${payload}`)
              .length === 1,
            'message echo duplicated',
          );
          return 'actual native → page → onMessage payload matched quotes, newline and Unicode';
        },
      ],
      [
        'evaluate-json',
        async () => {
          const view = await mount('/evaluate');
          await ready(view);
          const samples: [string, unknown][] = [
            ['2', 2],
            ['true', true],
            [JSON.stringify('hello "\n한글 😀'), 'hello "\n한글 😀'],
            ['({a:1})', { a: 1 }],
            ['[1,"a"]', [1, 'a']],
            ['null', null],
            ['undefined', null],
          ];
          for (const [code, expected] of samples) {
            const value = await evaluate(view, code);
            check(
              JSON.stringify(value) === JSON.stringify(expected),
              `JSON result mismatch for ${code}`,
            );
          }
          return `${samples.length} real evaluation results parsed once into the expected values`;
        },
      ],
      [
        'evaluation-removal',
        async () => {
          const view = await mount('/evaluation-removal');
          await ready(view);
          const outcome = ref(view)
            .evaluateJavaScript(
              '(()=>{const end=Date.now()+1500;while(Date.now()<end){};return "too late"})()',
            )
            .then(
              () => false,
              () => true,
            );
          await unmount();
          check(
            await bounded(outcome, 'evaluation cancellation'),
            'evaluation fulfilled after view removal',
          );
          return 'pending production evaluation rejected when its WebView was removed';
        },
      ],
      [
        'headers-case-insensitive',
        async () => {
          const view = await mount(
            '/headers',
            {
              defaultHeaders: { Authorization: 'fixture-default' },
            },
            undefined,
            {
              uri: url('/headers'),
              headers: { authorization: 'fixture-request' },
            },
          );
          await ready(view);
          const requests = (await records()).filter(
            request => request.path === '/headers',
          );
          check(requests.length === 1, 'header request duplicated');
          check(
            requests[0]?.authorizationMatches &&
              requests[0]?.authorizationCount === 1,
            'server did not receive one source Authorization value',
          );
          return 'server received one Authorization header with the source value';
        },
      ],
      [
        'headers-duplicate-source',
        async () => {
          const view = await mount('/duplicate-headers', {}, undefined, {
            uri: url('/duplicate-headers'),
            headers: {
              Authorization: 'fixture-default',
              authorization: 'fixture-request',
            },
          });
          await until(
            () =>
              view.errors.some(error => error.domain === 'NitroWebViewSource'),
            'duplicate-header source error',
          );
          await delay(250);
          check(
            view.errors.length === 1 && view.events.length === 0,
            'invalid source emitted duplicate or load events',
          );
          check(
            (await records()).length === 0,
            'invalid source reached the server',
          );
          return 'one source error, zero load events, zero server requests';
        },
      ],
      [
        'cookie-url-validation',
        async () => {
          const view = await mount('/cookie-validation');
          await ready(view);
          for (const invalid of ['not a URL', 'file:///private', 'https://']) {
            await rejects(
              ref(view).getCookies(invalid),
              `getCookies(${invalid})`,
            );
            await rejects(
              ref(view).setCookie(invalid, {
                name: 'reg-invalid',
                value: 'fixture',
              }),
              `setCookie(${invalid})`,
            );
          }
          return 'getCookies and setCookie rejected all three malformed/non-HTTP URLs';
        },
      ],
      [
        'initial-javascript-disabled',
        async () => {
          const view = await mount('/js-disabled', {
            javaScriptEnabled: false,
            injectedJavaScriptBeforeContentLoaded: `fetch('/before-marker${query()}');window.ReactNativeWebView.postMessage('before');true;`,
            injectedJavaScript: `fetch('/after-marker${query()}');window.ReactNativeWebView.postMessage('after');true;`,
          });
          await until(() => view.events.includes('end'), 'JS-disabled load');
          await delay(500);
          check(
            view.messages.length === 0,
            'inline or injected JavaScript sent a message',
          );
          check(
            !(await records()).some(request =>
              request.path.endsWith('-marker'),
            ),
            'disabled script requested a marker',
          );
          check(
            view.events.join(',') === 'start,load,end',
            `JS-disabled load order: ${view.events.join(',')}`,
          );
          if (Platform.OS === 'ios') {
            await rejects(
              ref(view).evaluateJavaScript('2'),
              'JS-disabled evaluateJavaScript',
            );
          }
          return 'first load succeeded with zero inline/injected script markers or messages';
        },
      ],
    ];

    for (const [name, verdict, pause] of [
      ['navigation-allow', true, 0],
      ['navigation-block', false, 0],
      ['navigation-delayed-false', false, 500],
    ] as const) {
      tests.push([
        name,
        async () => {
          const view = await mount(`/${name}`, {}, request => {
            if (!request.url.includes('/target')) return true;
            return pause ? delay(pause).then(() => verdict) : verdict;
          });
          await ready(view);
          const clickedAt = Date.now();
          const measureBudget = pause > 250 && Platform.OS === 'android';
          click(view, measureBudget);
          await until(
            () => view.decisions.some(target => target.includes('/target')),
            'navigation callback',
          );
          const allowed = verdict || (pause > 250 && Platform.OS === 'android');
          if (allowed) await ready(view, '/target');
          else await delay(pause + 250);
          const recorded = await records();
          const requests = recorded.filter(
            request => request.path === '/target',
          );
          const requestsObservedAt = Date.now();
          const decision = view.decisionTimings.find(timing =>
            timing.url.includes('/target'),
          );
          check(decision, 'target navigation decision timing is missing');
          await until(
            () => decision.settledAt !== undefined,
            'actual navigation callback settlement',
          );
          check(
            decision.allowed === verdict,
            `target callback returned ${String(decision.allowed)}: ${decision.error ?? ''}`,
          );
          const targetLoadedAt = view.timeline.find(
            item => item.event === 'load' && item.url?.includes('/target?'),
          )?.at;
          const offset = (at?: number) =>
            at === undefined ? 'none' : String(at - clickedAt);
          const timingDetail = `callback invoked +${offset(decision.invokedAt)} ms, settled +${offset(decision.settledAt)} ms; native target load observed +${offset(targetLoadedAt)} ms; fixture checked +${offset(requestsObservedAt)} ms`;
          view.diagnostics.push(timingDetail);
          check(
            decision.settledAt! - decision.invokedAt >= pause - 5,
            `callback settled before its requested ${pause} ms delay: ${timingDetail}`,
          );
          if (measureBudget) {
            const marker = recorded.find(
              request => request.path === '/navigation-start-marker',
            );
            check(marker, 'navigation start marker is missing');
            const requestDelay = requests[0]?.receivedAt - marker.receivedAt;
            view.diagnostics.push(
              `fixture request after marker: ${requestDelay} ms`,
            );
            check(
              Number.isFinite(requestDelay) && requestDelay >= 245,
              `target request arrived ${requestDelay} ms after marker, before the nominal 250 ms budget`,
            );
          }
          check(
            requests.length === (allowed ? 1 : 0),
            `target requests: ${requests.length}, expected ${allowed ? 1 : 0}`,
          );
          if (!allowed)
            check(
              view.events.filter(event => event === 'load').length === 1,
              'cancelled navigation emitted success',
            );
          return `${pause} ms callback; ${allowed ? 'one target request' : 'no target request'} on ${Platform.OS}; ${timingDetail}`;
        },
      ]);
    }

    for (const [name, fail] of [
      [
        'navigation-handler-throw',
        () => {
          throw new Error('fixture navigation handler throw');
        },
      ],
      [
        'navigation-handler-reject',
        () => Promise.reject(new Error('fixture navigation handler reject')),
      ],
    ] as const) {
      tests.push([
        name,
        async () => {
          const view = await mount(`/${name}`, {}, request => {
            if (!request.url.includes('/target')) return true;
            return fail();
          });
          await ready(view);
          click(view);
          await until(
            () => view.decisions.some(target => target.includes('/target')),
            'failing navigation callback',
          );
          const decision = view.decisionTimings.find(timing =>
            timing.url.includes('/target'),
          );
          check(decision, 'failing target decision timing is missing');
          await until(
            () => decision.settledAt !== undefined,
            'failing navigation callback settlement',
          );
          check(
            view.decisions.filter(target => target.includes('/target'))
              .length === 1 && decision.error !== undefined,
            `target hook did not fail exactly once: ${decision.error ?? 'no error'}`,
          );
          await ready(view, '/target');
          const requests = (await records()).filter(
            request => request.path === '/target',
          );
          check(
            requests.length === 1 && requests[0]?.method === 'GET',
            `failed handler target requests: ${JSON.stringify(requests)}`,
          );
          const eventCount = view.events.length;
          await unmount();
          await delay(250);
          check(
            view.events.length === eventCount,
            'unmount emitted an extra load event after the failed handler',
          );
          return `target hook failed once (${decision.error}); fail-open loaded one GET target and unmount emitted no extra event`;
        },
      ]);
    }

    tests.push(
      [
        'origin-whitelist-block',
        async () => {
          const guardCalls: string[] = [];
          const innerCalls: string[] = [];
          const guard = wrapWithOriginWhitelist(
            request => {
              innerCalls.push(request.url);
              return true;
            },
            [origin],
          );
          const view = await mount('/origin-whitelist', {}, request => {
            guardCalls.push(request.url);
            return guard(request);
          });
          await ready(view);
          const blockedURL = `http://localhost:8098/target${query()}`;
          ref(view).injectJavaScript(
            `document.getElementById('nav').href=${JSON.stringify(blockedURL)};document.getElementById('nav').click();true;`,
          );
          await until(
            () => guardCalls.includes(blockedURL),
            'native origin-whitelist guard callback',
          );
          const decision = view.decisionTimings.find(
            item => item.url === blockedURL,
          );
          check(decision, 'origin-whitelist decision timing is missing');
          await until(
            () => decision.settledAt !== undefined,
            'origin-whitelist false settlement',
          );
          // Observe effects after both the nominal Android budget and a late
          // 500 ms decision would have completed.
          await delay(650);
          view.diagnostics.push(
            `whitelist guard calls=${JSON.stringify(guardCalls)}; inner calls=${JSON.stringify(innerCalls)}`,
          );
          check(
            guardCalls.filter(value => value === blockedURL).length === 1 &&
              decision.allowed === false,
            'native request did not invoke the guard exactly once and resolve false',
          );
          check(
            !innerCalls.includes(blockedURL),
            'origin-whitelist invoked its inner handler for the denied origin',
          );
          check(
            !(await records()).some(request => request.path === '/target'),
            'origin-whitelist denial still sent a target request',
          );
          check(
            view.events.filter(event => event === 'load').length === 1,
            'origin-whitelist denial emitted another successful load',
          );
          return `localhost denied through the native navigation callback; denied guard calls=1, denied inner calls=0; zero target requests or extra success after 650 ms; total guard calls=${guardCalls.length}, total inner calls=${innerCalls.length}`;
        },
      ],
      [
        'post-body-once',
        async () => {
          const body = `name=Nitro+WebView&message=한글&line=one\ntwo&run=${runID}`;
          const view = await mount(
            '/post',
            {},
            async () => {
              await delay(500);
              return true;
            },
            {
              uri: url('/post'),
              method: 'POST',
              body,
            },
          );
          await ready(view);
          const requests = (await records()).filter(
            request => request.path === '/post',
          );
          check(requests.length === 1, 'POST was replayed');
          check(
            requests[0]?.method === 'POST' && requests[0]?.body === body,
            'POST method/body changed',
          );
          if (Platform.OS === 'android')
            check(
              view.decisions.length === 0,
              'Android unexpectedly intercepted the initial POST',
            );
          else
            check(
              view.decisions.length > 0,
              'iOS did not invoke its navigation policy hook',
            );
          return `one POST preserved its UTF-8/newline body; delayed hook calls: ${view.decisions.length}`;
        },
      ],
      [
        'redirect-once',
        async () => {
          const view = await mount('/redirect', {}, async () => {
            await delay(500);
            return true;
          });
          await ready(view, '/target');
          const requests = await records();
          check(
            requests.filter(request => request.path === '/redirect').length ===
              1,
            'redirect source replayed',
          );
          check(
            requests.filter(request => request.path === '/target').length === 1,
            'redirect target replayed',
          );
          return 'one redirect and one target request; delayed decision did not reload the URL';
        },
      ],
      [
        'history-back-forward',
        async () => {
          const view = await mount('/history', {}, async () => {
            await delay(500);
            return true;
          });
          await ready(view);
          await pageDiagnostic(view, 'before history navigation');
          await fixture('/interaction', {
            id: `${runID}-${caseIndex}-history`,
            label: 'Navigate',
          });
          try {
            await ready(view, '/target', 90000);
          } finally {
            await fixture('/interaction', null);
          }
          await pageDiagnostic(view, 'before goBack');
          view.diagnostics.push(
            `native before goBack: ${JSON.stringify(view.states.at(-1))}`,
          );
          const initial = await records();
          check(
            initial.filter(request => request.path === '/history').length ===
              1 &&
              initial.filter(request => request.path === '/target').length ===
                1,
            'initial history requests replayed',
          );
          ref(view).goBack();
          await until(() => {
            const state = view.states.at(-1);
            return (
              state?.url.includes('/history?') === true &&
              !state.loading &&
              state.canGoForward
            );
          }, 'history goBack');
          await pageDiagnostic(view, 'after goBack');
          ref(view).goForward();
          await until(() => {
            const state = view.states.at(-1);
            return (
              state?.url.includes('/target?') === true &&
              !state.loading &&
              state.canGoBack
            );
          }, 'history goForward');
          await pageDiagnostic(view, 'after goForward');
          const final = await records();
          check(
            final.every(request => request.method === 'GET'),
            'history unexpectedly issued a non-GET request',
          );
          return `back/forward restored both URLs and native history flags; fixture recorded ${final.length} GET requests; ${view.diagnostics.join('; ')}`;
        },
      ],
    );

    tests.push(
      [
        'download-http-metadata',
        async () => {
          const view = await mount('/download-fixture');
          await ready(view);
          await interact('tap', 'Download HTTP');
          await until(
            () => view.downloads.length > 0,
            'HTTP download callback',
          );
          await delay(250);
          const download = view.downloads[0];
          // WebKit sniffs this text attachment; Android reports its HTTP MIME type.
          const mimeType =
            Platform.OS === 'ios' ? 'text/plain' : 'application/octet-stream';
          check(
            view.downloads.length === 1 && download?.url === url('/attachment'),
            'HTTP download URL/count changed',
          );
          check(
            download.mimeType === mimeType &&
              download.fileName === 'nitro-regression.txt' &&
              download.contentLength === 43,
            `HTTP metadata: ${JSON.stringify(download)}`,
          );
          check(
            (await evaluate(view, 'location.pathname')) === '/download-fixture',
            'HTTP download replaced its parent',
          );
          if (Platform.OS === 'ios') {
            check(
              view.errors.length === 0 &&
                view.events.filter(event => event === 'load').length === 1 &&
                view.events.filter(event => event === 'end').length ===
                  view.events.filter(event => event === 'start').length,
              'download policy interruption emitted a page error or unbalanced load events',
            );
          }
          check(
            (await records()).filter(item => item.path === '/attachment')
              .length === 1,
            'attachment requested more than once',
          );
          return 'one real attachment callback with URL, MIME type, filename and 43-byte length; parent preserved';
        },
      ],
      [
        'download-blob-bytes',
        async () => {
          const view = await mount('/download-fixture');
          await ready(view);
          await interact('tap', 'Download blob');
          await until(
            () => view.downloads.length > 0,
            'blob download callback',
            20000,
          );
          await delay(250);
          check(view.downloads.length === 1, 'blob callback duplicated');
          const download = view.downloads[0]!;
          if (Platform.OS === 'ios') {
            check(
              download.url.startsWith('file://'),
              'iOS blob is not a local file',
            );
            const path = decodeURI(download.url.slice(7));
            try {
              check(
                (await bounded(
                  RNFS.readFile(path, 'utf8'),
                  'read native blob file',
                )) === fixtureText,
                'native blob file bytes changed',
              );
            } finally {
              check(
                path.includes('/nitro-webview-blob/'),
                'unexpected blob destination',
              );
              await RNFS.unlink(path.slice(0, path.lastIndexOf('/')));
            }
          } else {
            const encoded = await evaluate(
              view,
              'btoa(unescape(encodeURIComponent(window.fixtureText)))',
            );
            check(
              download.url ===
                `data:application/octet-stream;base64,${String(encoded)}`,
              'Android blob data URL bytes changed',
            );
            check(
              download.contentLength === 43,
              'Android blob byte count changed',
            );
          }
          check(view.errors.length === 0, 'successful blob emitted an error');
          check(
            (await evaluate(view, 'location.pathname')) === '/download-fixture',
            'blob changed the parent',
          );
          return 'native blob callback fired once; actual local bytes matched Unicode fixture and page remained usable';
        },
      ],
      [
        'message-native-frame-origins',
        async () => {
          const view = await mount('/frames');
          await ready(view, '/frames');
          if (Platform.OS === 'android') {
            await evaluate(
              view,
              'try{window.ReactNativeWebView.postMessage(new ArrayBuffer(8))}catch(e){};window.ReactNativeWebView.postMessage("text-after-arraybuffer");true;',
            );
            await until(
              () => view.messages.includes('text-after-arraybuffer'),
              'text bridge after unsupported ArrayBuffer',
            );
            check(
              !view.messages.includes('[object ArrayBuffer]'),
              'non-string native message escaped the listener guard',
            );
          }
          await until(
            () =>
              ['/frame-same', '/frame-cross', '/frame-opaque'].every(path =>
                view.messages.some(
                  message =>
                    message.startsWith('ready:') &&
                    JSON.parse(message.slice(6)).path === path,
                ),
              ),
            'three real iframe messages',
          );
          for (const [path, sourceOrigin, isMainFrame] of [
            ['/frames', origin, true],
            ['/frame-same', origin, false],
            ['/frame-cross', 'http://localhost:8098', false],
            ['/frame-opaque', 'null', false],
          ] as const) {
            const events = view.messageEvents.filter(
              event =>
                event.data.startsWith('ready:') &&
                JSON.parse(event.data.slice(6)).path === path,
            );
            check(
              events.length === 1 &&
                events[0]?.sourceOrigin === sourceOrigin &&
                events[0]?.isMainFrame === isMainFrame,
              `${path} native origin/frame mismatch: ${JSON.stringify(events)}`,
            );
          }
          return 'main, same-origin, cross-origin and sandboxed opaque iframe messages carried native origin/frame identity';
        },
      ],
      [
        'message-origin-policy',
        async () => {
          const view = await mount('/frames', {
            allowedMessageOrigins: [origin],
          });
          await ready(view, '/frames');
          await until(
            () =>
              view.messages.some(
                message =>
                  message.startsWith('ready:') &&
                  JSON.parse(message.slice(6)).path === '/frame-same',
              ),
            'allowed same-origin iframe',
          );
          await until(() => view.events.includes('end'), 'policy page loaded');
          await delay(500);
          check(
            (await records()).some(item => item.path === '/frame-cross') &&
              (await records()).some(item => item.path === '/frame-opaque'),
            'denied frames were not loaded',
          );
          check(
            !view.messages.some(
              message =>
                message.startsWith('ready:') &&
                ['/frame-cross', '/frame-opaque'].includes(
                  JSON.parse(message.slice(6)).path,
                ),
            ),
            'cross-origin or opaque iframe bypassed message policy',
          );
          await unmount();
          const deny = await mount('/message-deny', {
            allowedMessageOrigins: [],
          });
          await until(() => deny.events.includes('end'), 'deny-all page load');
          await evaluate(
            deny,
            "window.ReactNativeWebView.postMessage('deny-all-probe');true;",
          );
          await delay(300);
          check(
            deny.messages.length === 0 && deny.errors.length === 0,
            'deny-all delivered a message or broke navigation',
          );
          if (Platform.OS === 'ios') {
            for (const idnOrigin of [
              'https://xn--bcher-kva.example',
              'https://xn--bcher-kva.example:8443',
            ]) {
              await unmount();
              const idn = await mount(
                '',
                { allowedMessageOrigins: [idnOrigin] },
                undefined,
                {
                  html: '<!doctype html><title>IDN sender</title><script>window.ReactNativeWebView.postMessage("idn-probe")</script>',
                  baseUrl: `${idnOrigin}/`,
                },
              );
              await until(
                () =>
                  idn.messageEvents.some(event => event.data === 'idn-probe'),
                'allowed IDNA sender',
              );
              const messages = idn.messageEvents.filter(
                event => event.data === 'idn-probe',
              );
              check(
                messages.length === 1 &&
                  messages[0]?.sourceOrigin === idnOrigin &&
                  messages[0]?.isMainFrame === true,
                `IDNA native sender: ${JSON.stringify(messages)}`,
              );
            }
          }
          return 'allowlist delivered main/same-origin only and rejected cross/opaque frames; [] rejected all; iOS also verified native IDNA sender identity at default and nondefault ports';
        },
      ],
      [
        'window-open-parent-unchanged',
        async () => {
          const view = await mount('/window-fixture');
          await ready(view);
          for (const [label, path] of [
            ['Open blank', '/popup-blank'],
            ['Open script', '/popup-script'],
          ] as const) {
            await interact('tap', label);
            await until(
              () => view.windows.includes(url(path)),
              `${label} native callback`,
            );
          }
          await delay(250);
          check(
            view.windows.length === 2,
            `new-window callbacks: ${JSON.stringify(view.windows)}`,
          );
          check(
            (await evaluate(view, 'location.pathname')) === '/window-fixture',
            'new window replaced parent',
          );
          check(
            !(await records()).some(item => item.path.startsWith('/popup-')),
            'intercepted popup made an HTTP request',
          );
          check(
            view.events.filter(event => event === 'load').length === 1,
            'new window reloaded its parent',
          );
          return 'target=_blank and gesture window.open each emitted once; no destination request or parent navigation';
        },
      ],
      [
        'background-resume',
        async () => {
          const view = await mount('/lifecycle');
          await ready(view);
          const start = appStates.current.length;
          const oldRef = ref(view);
          await evaluate(view, 'window.lifecycleMarker="preserved";true;');
          await interact('background-resume');
          await until(
            () => appStates.current.slice(start).includes('active'),
            'foreground AppState',
          );
          check(
            appStates.current
              .slice(start)
              .some(state => state === 'background' || state === 'inactive'),
            'OS did not background the app',
          );
          check(
            ref(view) === oldRef &&
              (await evaluate(view, 'window.lifecycleMarker')) === 'preserved',
            'resume replaced native ref or page state',
          );
          oldRef.postMessage('resume-probe');
          await until(
            () => view.messages.includes('echo:resume-probe'),
            'post-resume bridge',
          );
          check(
            (await records()).filter(item => item.path === '/lifecycle')
              .length === 1 && view.rendererEvents.length === 0,
            'resume reloaded or lost renderer',
          );
          return 'OS background/active transitions observed; same native ref and JS state survived, without reload; bridge echoed after resume';
        },
      ],
      [
        'file-chooser-cancel',
        async () => {
          const view = await mount('/upload-fixture');
          await ready(view);
          if (Platform.OS === 'ios') {
            // Keep the accessibility tap inside the native Choose File button.
            await evaluate(
              view,
              'document.getElementById("upload").style.width="80px";true;',
            );
          }
          await interact('chooser-cancel');
          await delay(300);
          check(
            (await evaluate(
              view,
              'document.getElementById("upload").files.length',
            )) === 0,
            'cancel selected a file',
          );
          check(
            !view.messages.some(message => message.startsWith('upload:{')),
            'cancel emitted uploaded bytes',
          );
          ref(view).postMessage('chooser-cancel-probe');
          await until(
            () => view.messages.includes('echo:chooser-cancel-probe'),
            'bridge after picker cancel',
          );
          return 'real OS chooser appeared and was cancelled; no file/bytes selected and WebView bridge remained responsive';
        },
      ],
      [
        'fullscreen-exit-unmount',
        async () => {
          const view = await mount('/fullscreen-fixture', {
            allowsInlineMediaPlayback: true,
          });
          await ready(view);
          if (Platform.OS === 'ios') await interact('tap', 'Prepare video');
          await until(
            () => view.messages.includes('video:ready'),
            'native video metadata',
          );
          await interact('tap', 'Fullscreen');
          await until(
            () => view.messages.includes('fullscreen:entered'),
            'fullscreen entry',
          );
          await interact('fullscreen-exit');
          await until(
            () => view.messages.includes('fullscreen:exited'),
            'fullscreen exit',
          );
          view.messages.length = 0;
          await interact('tap', 'Fullscreen');
          await until(
            () => view.messages.includes('fullscreen:entered'),
            'second fullscreen entry',
          );
          await unmount();
          const after = await mount('/fullscreen-after');
          await ready(after);
          await interact('tap', 'Navigate');
          await ready(after, '/target');
          check(
            view.errors.length === 0 && after.errors.length === 0,
            'fullscreen teardown broke the view',
          );
          return 'real media entered/exited fullscreen; unmount while fullscreen restored app UI and a fresh native link tap navigated';
        },
      ],
    );

    if (Platform.OS === 'android') {
      tests.push(
        [
          'android-blob-failures-replay',
          async () => {
            const view = await mount('/download-fixture');
            await ready(view);
            const spoof =
              '{"__nitro_blob__":{"requestId":"spoof","url":"blob:spoof","dataUrl":"data:text/plain;base64,QQ==","mimeType":"text/plain","size":1}}';
            await evaluate(
              view,
              `window.ReactNativeWebView.postMessage(${JSON.stringify(spoof)});true;`,
            );
            await until(
              () => view.messages.includes(spoof),
              'unsolicited blob envelope remains a message',
            );
            check(
              view.downloads.length === 0,
              'unsolicited envelope produced a download',
            );
            await evaluate(view, 'window.blobSize=8*1024*1024+1;true;');
            await interact('tap', 'Download blob');
            await until(
              () =>
                view.errors.some(
                  error => error.domain === 'NitroWebViewDownload',
                ),
              'oversized native reader error',
            );
            check(
              view.errors.length === 1 && view.downloads.length === 0,
              'oversized reader emitted success/duplicate error',
            );
            check(
              view.errors[0]?.description.includes('too-large'),
              `oversize error: ${JSON.stringify(view.errors)}`,
            );
            await evaluate(
              view,
              'window.blobSize=0;window.originalFetch=window.fetch;window.fetch=function(){return Promise.reject(new Error("fixture fetch failure"))};true;',
            );
            await interact('tap', 'Download blob');
            await until(
              () => view.errors.length === 2,
              'native blob fetch failure',
            );
            check(
              view.errors[1]?.domain === 'NitroWebViewDownload' &&
                view.errors[1]?.description.includes('fetch') &&
                view.downloads.length === 0,
              'reader fetch failure classification changed',
            );
            await evaluate(
              view,
              'window.fetch=window.originalFetch;var bridge=window.ReactNativeWebView;window.originalPost=bridge.postMessage.bind(bridge);bridge.postMessage=function(data){if(data.indexOf("{\\"__nitro_blob__\\":")===0)window.lastEnvelope=data;window.originalPost(data)};true;',
            );
            await interact('tap', 'Download blob');
            await until(
              () => view.downloads.length === 1,
              'reader recovery after failures',
            );
            const envelope = await evaluate(view, 'window.lastEnvelope');
            check(
              typeof envelope === 'string' && envelope.includes('requestId'),
              'actual native-correlated reader envelope was not observed',
            );
            await evaluate(
              view,
              `window.originalPost(${JSON.stringify(envelope)});true;`,
            );
            await until(
              () => view.messages.includes(envelope),
              'replayed envelope remains a message',
            );
            await delay(250);
            const finalCounts = {
              downloads: view.downloads.length,
              errors: view.errors.length,
            };
            check(
              finalCounts.downloads === 1 && finalCounts.errors === 2,
              'replay generated another download/error',
            );
            return 'real native reader rejected 8 MiB + 1 and fetch failure once each, recovered; unsolicited/replayed envelopes never created downloads';
          },
        ],
        [
          'android-file-upload',
          async () => {
            const view = await mount('/upload-fixture');
            await ready(view);
            await interact('chooser-upload');
            await until(
              () =>
                view.messages.some(message => message.startsWith('upload:{')),
              'OS-selected file FileReader bytes',
            );
            const message = view.messages.find(item =>
              item.startsWith('upload:{'),
            )!;
            const upload = JSON.parse(message.slice(7));
            check(
              upload.name === 'nitro-regression.txt' &&
                upload.size === 43 &&
                upload.text === fixtureText,
              `file upload bytes: ${message}`,
            );
            check(
              (await evaluate(
                view,
                'document.getElementById("upload").files.length',
              )) === 1,
              'OS URI did not reach file input',
            );
            return 'Android DocumentsUI selected the pushed text file; actual FileReader name, size and Unicode bytes matched';
          },
        ],
        [
          'android-capture-chooser-cancel',
          async () => {
            const view = await mount('/upload-fixture');
            await ready(view);
            await interact('capture-cancel');
            await delay(300);
            check(
              (await evaluate(
                view,
                'document.getElementById("capture").files.length',
              )) === 0,
              'cancelled camera returned its temporary capture URI',
            );
            check(
              !view.messages.some(message => message.startsWith('upload:{')),
              'capture cancellation returned bytes',
            );
            await interact('chooser-upload');
            await until(
              () =>
                view.messages.some(message => message.startsWith('upload:{')),
              'file selection after capture cancellation',
            );
            check(
              JSON.parse(
                view.messages
                  .find(message => message.startsWith('upload:{'))!
                  .slice(7),
              ).text === fixtureText,
              'stale capture URI replaced subsequent file selection',
            );
            return 'capture input offered/launched system camera; cancellation returned no temp URI; next OS file selection delivered correct bytes (no photo-success claim)';
          },
        ],
        [
          'android-permission-origin-deny',
          async () => {
            const view = await mount('/permission-fixture', {
              geolocationPermissionOrigins: [],
            });
            await ready(view);
            await interact('tap', 'Location');
            await until(
              () => view.messages.includes('location:denied:1'),
              'native origin policy denial',
            );
            check(
              !view.messages.some(message =>
                message.startsWith('location:allowed:'),
              ),
              'denied origin obtained location',
            );
            return 'actual navigator.geolocation request received PERMISSION_DENIED from native empty origin policy';
          },
        ],
        [
          'android-media-origin-deny',
          async () => {
            const allowed = await mount('/permission-fixture', {
              mediaCapturePermissionOrigins: [origin],
            });
            await ready(allowed);
            for (const kind of ['camera', 'microphone'] as const) {
              await pageDiagnostic(allowed, `before ${kind} tap`);
              await interact(
                'tap',
                kind === 'camera'
                  ? 'Camera permission'
                  : 'Microphone permission',
              );
              await pageDiagnostic(allowed, `after ${kind} tap`);
              await until(
                () =>
                  allowed.messages.some(message =>
                    message.startsWith(`media:${kind}:`),
                  ),
                `allowed media origin live ${kind} track`,
              );
              check(
                allowed.messages.includes(
                  `media:${kind}:allowed:${kind === 'camera' ? 'video' : 'audio'}:live`,
                ),
                `allowed media origin did not obtain a live ${kind} track: ${JSON.stringify(allowed.messages)}`,
              );
            }
            const view = await mount('/permission-fixture', {
              mediaCapturePermissionOrigins: [],
            });
            await ready(view);
            for (const kind of ['camera', 'microphone'] as const) {
              await interact(
                'tap',
                kind === 'camera'
                  ? 'Camera permission'
                  : 'Microphone permission',
              );
              await until(
                () =>
                  view.messages.includes(
                    `media:${kind}:denied:NotAllowedError`,
                  ),
                `${kind} native origin policy denial`,
              );
            }
            check(
              !view.messages.some(message => message.includes(':allowed:')),
              'denied media origin obtained a live track',
            );
            return `allowed origin obtained live camera and microphone tracks with the same OS grants as the denied origin; real camera and microphone getUserMedia calls from a denied origin both returned NotAllowedError; ${allowed.diagnostics.join('; ')}`;
          },
        ],
        [
          'android-permission-os-deny',
          async () => {
            const view = await mount('/permission-fixture', {
              geolocationPermissionOrigins: [origin],
            });
            await ready(view);
            await interact('permission-deny');
            await until(
              () => view.messages.includes('location:denied:1'),
              'OS runtime consent denial',
            );
            return 'allowed origin reached Android runtime location dialog; Don’t allow produced PERMISSION_DENIED';
          },
        ],
        [
          'android-permission-os-allow',
          async () => {
            const view = await mount('/permission-fixture', {
              geolocationPermissionOrigins: [origin],
            });
            await ready(view);
            await interact('permission-allow');
            await until(
              () =>
                view.messages.some(message =>
                  message.startsWith('location:allowed:'),
                ),
              'OS location grant and actual position',
              20000,
            );
            check(
              !view.messages.includes('location:denied:1'),
              'runtime grant was denied',
            );
            return 'allowed origin reached Android runtime dialog; While using the app delivered a real geolocation position';
          },
        ],
        [
          'android-renderer-shared-views',
          async () => {
            const first = create({ uri: url('/renderer-shared-a') });
            const second = create({ uri: url('/renderer-shared-b') });
            await show([first, second]);
            await Promise.all([ready(first), ready(second)]);
            const oldRefs = [ref(first), ref(second)];
            first.source = { uri: 'chrome://crash' };
            await show([first, second]);
            await until(
              () =>
                first.rendererEvents.length === 1 &&
                second.rendererEvents.length === 1,
              'both shared renderer exit callbacks',
              15000,
            );
            check(
              first.rendererEvents[0]?.didCrash === true &&
                second.rendererEvents[0]?.didCrash === true,
              'shared renderer exit classification changed',
            );
            await unmount();
            for (const oldRef of oldRefs)
              await rejects(
                oldRef.evaluateJavaScript('1'),
                'destroyed shared renderer evaluation',
              );
            await delay(300);
            check(
              (await records()).filter(item =>
                item.path.startsWith('/renderer-shared-'),
              ).length === 2,
              'shared renderer cleanup replayed a source',
            );
            check(
              first.rendererEvents.length === 1 &&
                second.rendererEvents.length === 1,
              'shared renderer exit duplicated',
            );
            const fresh = await mount('/renderer-shared-fresh');
            await ready(fresh);
            check(
              (await evaluate(fresh, '2+2')) === 4,
              'fresh WebView after multi-view exit failed',
            );
            return 'one real process crash notified both live WebViews exactly once; both old refs rejected; explicit fresh view recovered';
          },
        ],
      );
      tests.push([
        'android-incognito-rejection',
        async () => {
          const name = `reg_before_incognito_${runID}`;
          const before = await mount('/incognito-before');
          await ready(before);
          await bounded(
            ref(before).setCookie(origin, {
              name,
              value: 'preserved',
              path: '/',
            }),
            'seed preexisting cookie',
          );
          await unmount();
          const blocked = await mount('/incognito-blocked', {
            incognito: true,
          });
          await until(
            () =>
              blocked.errors.some(
                error => error.domain === 'NitroWebViewConfiguration',
              ),
            'incognito config error',
          );
          await delay(300);
          check(
            blocked.errors.length === 1 && blocked.errors[0]?.code === -1,
            'incognito config error duplicated or changed',
          );
          check(
            blocked.events.length === 0,
            'rejected incognito started loading',
          );
          check(
            !(await records()).some(
              request => request.path === '/incognito-blocked',
            ),
            'rejected incognito sent a request',
          );
          await unmount();
          const after = await mount('/incognito-after');
          await ready(after);
          const cookies = await bounded(
            ref(after).getCookies(origin),
            'read preserved cookies',
          );
          check(
            cookies.some(
              cookie => cookie.name === name && cookie.value === 'preserved',
            ),
            'incognito rejection deleted preexisting cookies',
          );
          await bounded(
            ref(after).setCookie(origin, {
              name,
              value: '',
              path: '/',
              expires: Date.now() - 1000,
            }),
            'remove fixture cookie',
          );
          return 'one config error, no rejected-source request; the preexisting cookie survived';
        },
      ]);
      tests.push([
        'android-renderer-recovery',
        async () => {
          const crashed = await mount('/renderer-before');
          await ready(crashed);
          const oldRef = ref(crashed);
          const before = await records();
          check(
            before.length === 1 && before[0]?.method === 'GET',
            'renderer fixture did not load exactly once with GET',
          );
          const probe: EvaluationProbe = { startedAt: Date.now() };
          crashed.evaluationProbe = probe;
          const pending = oldRef
            .evaluateJavaScript(
              '(()=>{const end=Date.now()+5000;while(Date.now()<end){};return "too late"})()',
            )
            .then(
              () => {
                probe.settledAt = Date.now();
                probe.rejected = false;
                return false;
              },
              () => {
                probe.settledAt = Date.now();
                probe.rejected = true;
                return true;
              },
            );
          await delay(50);
          crashed.source = { uri: 'chrome://crash' };
          await show([crashed]);
          await until(
            () => crashed.rendererEvents.length > 0,
            'actual Android renderer crash',
            15000,
          );
          check(
            crashed.rendererEvents.length === 1 &&
              crashed.rendererEvents[0]?.didCrash === true,
            'renderer crash did not emit exactly one didCrash=true event',
          );
          // Remove the already destroyed native child through Fabric too.
          await unmount();
          const rejected = await bounded(
            pending,
            'renderer evaluation cancellation',
          );
          check(
            probe.pendingAtRendererExit !== undefined,
            'evaluation status was not captured at the renderer callback',
          );
          check(
            !probe.pendingAtRendererExit || rejected,
            `evaluation pending at renderer callback later fulfilled: ${JSON.stringify(probe)}`,
          );
          oldRef.reload();
          oldRef.goBack();
          oldRef.goForward();
          oldRef.stopLoading();
          oldRef.postMessage('stale renderer ref');
          oldRef.injectJavaScript('document.title="stale renderer ref"');
          await rejects(
            oldRef.evaluateJavaScript('1 + 1'),
            'stale renderer evaluation',
          );
          await delay(300);
          check(
            (await records()).length === before.length,
            'renderer cleanup or stale methods automatically replayed a request',
          );
          const fresh = await mount('/renderer-retry');
          check(
            fresh.key !== crashed.key && ref(fresh) !== oldRef,
            'explicit retry did not create a fresh key and native ref',
          );
          await ready(fresh);
          const payload = `renderer-retry:${runID}`;
          ref(fresh).postMessage(payload);
          await until(
            () => fresh.messages.includes(`echo:${payload}`),
            'fresh renderer message roundtrip',
          );
          const after = await records();
          check(
            after.length === before.length + 1 &&
              after.filter(request => request.path === '/renderer-before')
                .length === 1 &&
              after.filter(
                request =>
                  request.path === '/renderer-retry' &&
                  request.method === 'GET',
              ).length === 1,
            'explicit renderer retry replayed the old source or loaded more than once',
          );
          check(
            crashed.rendererEvents.length === 1 &&
              fresh.rendererEvents.length === 0,
            'renderer exit duplicated or the fresh renderer failed',
          );
          const evaluationDetail = probe.pendingAtRendererExit
            ? 'evaluation pending at renderer callback rejected'
            : `busy evaluation ${rejected ? 'rejected' : 'fulfilled'} before renderer callback (${probe.settledAt! - probe.startedAt} ms)`;
          return `actual renderer crash emitted once; ${evaluationDetail}; stale evaluation rejected, Fabric removal survived, and only explicit fresh GET retry loaded and echoed`;
        },
      ]);
    }

    if (Platform.OS === 'ios') {
      tests.push(
        [
          'ios-callback-cleanup',
          async () => {
            const view = await mount('/callback-cleanup', {}, () => true);
            await ready(view);
            // Inspect the native object only here to verify the drop contract.
            const stale = ref(view);
            const retained = stale as unknown as Record<string, unknown>;
            const callbacks = [
              'onLoadStart',
              'onLoad',
              'onLoadEnd',
              'onLoadProgress',
              'onNavigationStateChange',
              'onMessage',
              'onError',
              'onFileDownload',
              'onHttpError',
              'onRenderProcessGone',
              'onScroll',
              'onShouldStartLoadWithRequest',
              'onOpenWindow',
            ];
            for (const name of callbacks)
              check(
                typeof retained[name] === 'function',
                `${name} was not installed`,
              );
            const events = view.events.length;
            await unmount();
            await until(
              () => callbacks.every(name => retained[name] == null),
              'native callback release while retaining hybridRef',
            );
            await rejects(stale.evaluateJavaScript('true'), 'dropped iOS ref');
            await delay(100);
            check(view.events.length === events, 'callback fired after drop');
            return 'all 13 native callbacks cleared while hybridRef stayed alive; stale evaluation rejected and no late event';
          },
        ],
        [
          'ios-evaluation-error',
          async () => {
            const view = await mount('/evaluation-error');
            await ready(view);
            await rejects(
              ref(view).evaluateJavaScript(
                'throw new Error("fixture-evaluation-error")',
              ),
              'native JS exception',
            );
            return 'actual WKWebView JavaScript exception rejected the evaluation Promise';
          },
        ],
        [
          'ios-navigation-stop-loading',
          async () => {
            let settle: ((allow: boolean) => void) | undefined;
            const view = await mount('/navigation-stop', {}, request => {
              if (!request.url.includes('/target')) return true;
              return new Promise<boolean>(resolve => {
                settle = resolve;
              });
            });
            await ready(view);
            click(view);
            await until(
              () => settle !== undefined,
              'unresolved navigation callback',
            );
            await delay(350);
            check(
              !(await records()).some(request => request.path === '/target'),
              'iOS unexpectedly timed out and allowed',
            );
            ref(view).stopLoading();
            await delay(150);
            settle?.(true);
            await delay(500);
            check(
              !(await records()).some(request => request.path === '/target'),
              'late allow restarted stopped navigation',
            );
            check(
              view.events.filter(event => event === 'load').length === 1,
              'stopped navigation emitted success',
            );
            return 'unresolved decision stayed pending past 250 ms; stopLoading ignored its late allow';
          },
        ],
        [
          'ios-storage-isolation',
          async () => {
            const a = create({ uri: url('/storage-a') });
            const b = create({ uri: url('/storage-b') }, { incognito: true });
            const c = create({ uri: url('/storage-c') }, { incognito: true });
            await show([a, b, c]);
            await Promise.all([ready(a), ready(b), ready(c)]);
            const cookieName = `reg_session_${runID}`;
            const storageKey = `reg-storage-${runID}`;
            for (const [view, value] of [
              [a, 'A'],
              [b, 'B'],
              [c, 'C'],
            ] as const) {
              await bounded(
                ref(view).setCookie(origin, {
                  name: cookieName,
                  value,
                  path: '/',
                }),
                'set isolated cookie',
              );
              await evaluate(
                view,
                `localStorage.setItem(${JSON.stringify(storageKey)},${JSON.stringify(value)});true;`,
              );
            }
            async function stored(view: Observation, value: string) {
              const cookies = await bounded(
                ref(view).getCookies(origin),
                'get isolated cookie',
              );
              check(
                cookies.find(cookie => cookie.name === cookieName)?.value ===
                  value,
                `${value} cookie store leaked or lost its value`,
              );
              check(
                (await evaluate(
                  view,
                  `localStorage.getItem(${JSON.stringify(storageKey)})`,
                )) === value,
                `${value} localStorage leaked or lost its value`,
              );
            }
            await stored(a, 'A');
            await stored(b, 'B');
            await stored(c, 'C');
            await bounded(ref(b).clearCookies(), 'clear private B cookies');
            await bounded(ref(b).clearCache(), 'clear private B cache');
            check(
              !(
                await bounded(
                  ref(b).getCookies(origin),
                  'read cleared private B',
                )
              ).some(cookie => cookie.name === cookieName),
              'B cookie clear did not complete',
            );
            check(
              (await evaluate(
                b,
                `localStorage.getItem(${JSON.stringify(storageKey)})`,
              )) === 'B',
              'cache clear erased B localStorage',
            );
            await stored(a, 'A');
            await stored(c, 'C');
            b.ref = null;
            await show([a, c]);
            await delay(150);
            const nextB = create(
              { uri: url('/storage-b-remount') },
              { incognito: true },
            );
            await show([a, nextB, c]);
            await ready(nextB);
            check(
              !(
                await bounded(ref(nextB).getCookies(origin), 'read remounted B')
              ).some(cookie => cookie.name === cookieName),
              'remounted private B recovered old cookies',
            );
            check(
              (await evaluate(
                nextB,
                `localStorage.getItem(${JSON.stringify(storageKey)})`,
              )) === null,
              'remounted private B recovered localStorage',
            );
            await stored(a, 'A');
            await stored(c, 'C');
            await bounded(
              ref(a).setCookie(origin, {
                name: cookieName,
                value: '',
                path: '/',
                expires: Date.now() - 1000,
              }),
              'remove persistent fixture cookie',
            );
            await evaluate(
              a,
              `localStorage.removeItem(${JSON.stringify(storageKey)});true;`,
            );
            return 'persistent A/private B/private C isolated cookies and storage; clearing/remounting B preserved A/C';
          },
        ],
        [
          'ios-shared-cookie-first-request',
          async () => {
            const baseline = await mount('/shared-baseline');
            await ready(baseline);
            await bounded(
              ref(baseline).setCookie(origin, {
                name: 'shared-import',
                value: '',
                path: '/',
                expires: Date.now() - 1000,
              }),
              'remove old WebKit fixture cookie',
            );
            check(
              !(
                await bounded(
                  ref(baseline).getCookies(origin),
                  'check clean WebKit fixture cookie',
                )
              ).some(cookie => cookie.name === 'shared-import'),
              'fixture cookie was already in WebKit',
            );
            await unmount();
            const seeded = await bounded(
              fetch(url('/seed'), { credentials: 'include' }),
              'RN shared-cookie seed',
            );
            check(seeded.ok, `cookie seed returned HTTP ${seeded.status}`);
            await seeded.json();
            const view = await mount('/shared-first', {
              sharedCookiesEnabled: true,
            });
            await ready(view);
            const requests = (await records()).filter(
              request => request.path === '/shared-first',
            );
            check(
              requests.length === 1 &&
                requests[0]?.cookieNames.includes('shared-import'),
              'first request did not contain the imported app cookie',
            );
            return 'RN fetch seeded app storage; the first WebKit request already contained shared-import';
          },
        ],
        [
          'ios-initial-setting-change',
          async () => {
            const view = await mount('/setting-before');
            await ready(view);
            view.settings = { ...view.settings, incognito: true };
            view.source = { uri: url('/setting-after') };
            await show([view]);
            await until(
              () =>
                view.errors.some(
                  error => error.domain === 'NitroWebViewConfiguration',
                ),
              'immutable setting error',
            );
            await delay(300);
            check(
              view.errors.length === 1 && view.errors[0]?.code === -1,
              'setting error duplicated or changed',
            );
            check(
              !(await records()).some(
                request => request.path === '/setting-after',
              ),
              'changed initial setting loaded its source',
            );
            check(
              view.events.filter(event => event === 'load').length === 1 &&
                view.events.filter(event => event === 'end').length === 1,
              'rejected source emitted load events',
            );
            return 'live incognito change emitted one config error and refused the new source';
          },
        ],
      );
    }

    async function describeCaseFailure(error: unknown): Promise<string> {
      await Promise.all(
        liveViews.current
          .filter(
            view =>
              view.ref &&
              view.settings.javaScriptEnabled &&
              view.rendererEvents.length === 0,
          )
          .map(view => pageDiagnostic(view, 'failure page')),
      );
      const observations = caseViews
        .map(
          view =>
            `events=${view.events.join(',')}; errors=${view.errors.map(item => `${item.domain}:${item.code}:${item.description.slice(0, 160)}`).join(',')}; http=${view.httpStatuses.join(',')}; messages=${view.messages.length}; renderer=${view.rendererEvents.map(item => String(item.didCrash)).join(',')}; states=${JSON.stringify(view.states.slice(-6))}; timeline=${JSON.stringify(view.timeline.slice(-12))}; decisions=${JSON.stringify(view.decisionTimings)}; evaluation=${JSON.stringify(view.evaluationProbe)}; diagnostics=${view.diagnostics.join('; ')}`,
        )
        .join(' | ');
      return `${String(error)}${observations ? ` (${observations})` : ''}`;
    }

    async function executeCase(
      name: string,
      test: () => Promise<string>,
    ): Promise<CaseResult> {
      caseIndex += 1;
      caseViews = [];
      setCurrent(name);
      const started = Date.now();
      try {
        return {
          name,
          ok: true,
          detail: await test(),
          durationMs: Date.now() - started,
        };
      } catch (error) {
        return {
          name,
          ok: false,
          detail: await describeCaseFailure(error),
          durationMs: Date.now() - started,
        };
      } finally {
        await unmount();
      }
    }

    async function executeCases() {
      for (const [name, test] of tests) {
        if (!active()) return;
        const result = await executeCase(name, test);
        if (!active()) return;
        completed.push(result);
        setResults([...completed]);
        await report(false);
      }
    }

    try {
      await fixture('/reset');
      await report(false);
      await executeCases();
    } catch (error) {
      completed.push({
        name: 'fixture-connection',
        ok: false,
        detail: String(error),
        durationMs: 0,
      });
      if (active()) setResults([...completed]);
    } finally {
      await unmount();
      if (active()) {
        const uploaded = await report(true);
        const failures = completed.filter(result => !result.ok).length;
        setSummary(
          `COMPLETE ${failures === 0 && uploaded ? 'PASS' : 'FAIL'} — ${completed.length - failures}/${completed.length}`,
        );
        setCurrent('Finished');
        setRunning(false);
      }
      inFlight.current = false;
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <Text style={styles.title}>Regression verification</Text>
        <Text>
          Fixture: {origin}. Android requires adb reverse on port 8098.
        </Text>
        <Button
          testID="regression-run"
          title="Run regression"
          disabled={running}
          onPress={() => {
            void run();
          }}
        />
        <Text testID="regression-progress" accessibilityLiveRegion="polite">
          {current}
        </Text>
        <Text
          testID="regression-final"
          accessibilityLiveRegion="polite"
          style={styles.summary}
        >
          {summary}
        </Text>
        {reportError !== '' && (
          <Text accessibilityRole="alert" style={styles.fail}>
            {reportError}
          </Text>
        )}
      </View>
      {views.length > 0 && (
        <View style={styles.stage}>
          {views.map(view => (
            <NitroWebView
              key={view.key}
              testID={`regression-webview-${view.key}`}
              style={styles.webview}
              {...view.settings}
              source={view.source}
              hybridRef={callback((nativeRef: NitroWebViewMethods) => {
                view.ref = nativeRef;
              })}
              onLoadProgress={callback(() => {})}
              onScroll={callback(() => {})}
              onLoadStart={callback((event: WebViewLoadEvent) => {
                view.events.push('start');
                view.timeline.push({
                  at: Date.now(),
                  event: 'start',
                  url: event.nativeEvent.url,
                });
              })}
              onLoad={callback((event: WebViewLoadEvent) => {
                view.events.push('load');
                view.timeline.push({
                  at: Date.now(),
                  event: 'load',
                  url: event.nativeEvent.url,
                });
              })}
              onLoadEnd={callback((event: WebViewLoadEvent) => {
                view.events.push('end');
                view.timeline.push({
                  at: Date.now(),
                  event: 'end',
                  url: event.nativeEvent.url,
                });
              })}
              onError={callback((event: NitroWebViewErrorEvent) => {
                view.errors.push(event.nativeEvent);
              })}
              onHttpError={callback(
                (event: { nativeEvent: { statusCode: number } }) => {
                  view.httpStatuses.push(event.nativeEvent.statusCode);
                },
              )}
              onMessage={callback((event: WebViewMessageEvent) => {
                view.messages.push(event.nativeEvent.data);
                view.messageEvents.push(event.nativeEvent);
              })}
              onFileDownload={callback((event: FileDownloadEvent) => {
                view.downloads.push(event.nativeEvent);
              })}
              onOpenWindow={callback((event: OpenWindowEvent) => {
                view.windows.push(event.nativeEvent.url);
              })}
              onRenderProcessGone={callback(
                (event: NitroWebViewRenderProcessGoneEvent) => {
                  view.rendererEvents.push(event.nativeEvent);
                  view.timeline.push({
                    at: Date.now(),
                    event: 'renderer-gone',
                  });
                  if (view.rendererEvents.length === 1 && view.evaluationProbe)
                    view.evaluationProbe.pendingAtRendererExit =
                      view.evaluationProbe.settledAt === undefined;
                },
              )}
              onNavigationStateChange={callback(
                (state: WebViewNavigationState) => {
                  view.states.push(state);
                },
              )}
              onShouldStartLoadWithRequest={
                view.decide
                  ? callback((request: ShouldStartLoadRequest) => {
                      view.decisions.push(request.url);
                      const timing: DecisionTiming = {
                        url: request.url,
                        invokedAt: Date.now(),
                      };
                      view.decisionTimings.push(timing);
                      const settled = (allowed: boolean) => {
                        timing.settledAt = Date.now();
                        timing.allowed = allowed;
                        return allowed;
                      };
                      const failed = (error: unknown): never => {
                        timing.settledAt = Date.now();
                        timing.error = String(error);
                        throw error;
                      };
                      try {
                        const result = view.decide!(request);
                        return typeof result === 'boolean'
                          ? settled(result)
                          : result.then(settled, failed);
                      } catch (error) {
                        return failed(error);
                      }
                    })
                  : undefined
              }
            />
          ))}
        </View>
      )}
      <ScrollView
        style={styles.results}
        contentContainerStyle={styles.resultContent}
      >
        {(running ? results.slice(-3) : results).map(result => (
          <View key={result.name} style={styles.result}>
            <Text
              testID={`regression-case-${result.name}`}
              style={result.ok ? styles.pass : styles.fail}
            >
              {result.ok ? 'PASS' : 'FAIL'} {result.name} ({result.durationMs}{' '}
              ms)
            </Text>
            <Text selectable>{result.detail}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.appBackground },
  controls: { padding: spacing.base, gap: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: color.textPrimary },
  summary: { fontWeight: '600', color: color.textPrimary },
  stage: { height: 180, flexDirection: 'row' },
  webview: { flex: 1 },
  results: { flex: 1 },
  resultContent: { padding: spacing.base },
  result: { paddingBottom: spacing.base },
  pass: { color: color.messageTitle, fontWeight: '600' },
  fail: { color: color.errorTitle, fontWeight: '600' },
});
