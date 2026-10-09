import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { callback, NitroWebView } from 'nitro-webview';
import type {
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
const delay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

type CaseResult = {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
};
type RequestRecord = {
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
>;
type Decision = (request: ShouldStartLoadRequest) => boolean | Promise<boolean>;
type Observation = {
  key: number;
  source: WebViewSource;
  settings: Settings;
  decide?: Decision;
  ref: NitroWebViewMethods | null;
  events: string[];
  messages: string[];
  errors: NitroWebViewErrorEvent['nativeEvent'][];
  httpStatuses: number[];
  states: WebViewNavigationState[];
  decisions: string[];
  rendererEvents: NitroWebViewRenderProcessGoneEvent['nativeEvent'][];
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
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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
      return {
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
        errors: [],
        httpStatuses: [],
        states: [],
        decisions: [],
        rendererEvents: [],
      };
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

    async function ready(view: Observation, path?: string) {
      await until(
        () =>
          view.messages.some(message => {
            if (!message.startsWith('ready:')) return false;
            return (
              path === undefined || JSON.parse(message.slice(6)).path === path
            );
          }),
        `page ready ${path ?? ''}`,
      );
      await until(() => {
        if (!view.events.includes('end')) return false;
        if (path === undefined) return true;
        const state = view.states.at(-1);
        return (
          state !== undefined &&
          new URL(state.url).pathname === path &&
          !state.loading
        );
      }, 'onLoadEnd');
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

    function click(view: Observation) {
      ref(view).injectJavaScript(
        "document.getElementById('nav').click();true;",
      );
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
          await ready(view);
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
          click(view);
          await until(
            () => view.decisions.some(target => target.includes('/target')),
            'navigation callback',
          );
          const allowed = verdict || (pause > 250 && Platform.OS === 'android');
          if (allowed) await ready(view, '/target');
          else await delay(pause + 250);
          const requests = (await records()).filter(
            request => request.path === '/target',
          );
          check(
            requests.length === (allowed ? 1 : 0),
            `target requests: ${requests.length}, expected ${allowed ? 1 : 0}`,
          );
          if (!allowed)
            check(
              view.events.filter(event => event === 'load').length === 1,
              'cancelled navigation emitted success',
            );
          return `${pause} ms callback; ${allowed ? 'one target request' : 'no target request'} on ${Platform.OS}`;
        },
      ]);
    }

    tests.push(
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
          click(view);
          await ready(view, '/target');
          await until(
            () => view.states.at(-1)?.canGoBack === true,
            'back history',
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
          ref(view).goForward();
          await until(() => {
            const state = view.states.at(-1);
            return (
              state?.url.includes('/target?') === true &&
              !state.loading &&
              state.canGoBack
            );
          }, 'history goForward');
          const final = await records();
          check(
            final.every(request => request.method === 'GET'),
            'history unexpectedly issued a non-GET request',
          );
          return `back/forward restored both URLs; fixture recorded ${final.length} GET requests`;
        },
      ],
    );

    if (Platform.OS === 'android') {
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
          const pending = oldRef
            .evaluateJavaScript(
              '(()=>{const end=Date.now()+5000;while(Date.now()<end){};return "too late"})()',
            )
            .then(
              () => false,
              () => true,
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
          check(
            await bounded(pending, 'renderer evaluation cancellation'),
            'pending evaluation fulfilled after renderer exit',
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
          return 'actual renderer crash emitted once; pending/stale evaluation rejected, Fabric removal survived, and only explicit fresh GET retry loaded and echoed';
        },
      ]);
    }

    if (Platform.OS === 'ios') {
      tests.push(
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

    try {
      await fixture('/reset');
      await report(false);
      for (const [name, test] of tests) {
        if (!active()) return;
        caseIndex += 1;
        setCurrent(name);
        const started = Date.now();
        let result: CaseResult;
        try {
          result = {
            name,
            ok: true,
            detail: await test(),
            durationMs: Date.now() - started,
          };
        } catch (error) {
          const observations = liveViews.current
            .map(
              view =>
                `events=${view.events.join(',')}; errors=${view.errors.map(item => `${item.domain}:${item.code}:${item.description.slice(0, 160)}`).join(',')}; http=${view.httpStatuses.join(',')}; messages=${view.messages.length}; renderer=${view.rendererEvents.map(item => String(item.didCrash)).join(',')}`,
            )
            .join(' | ');
          result = {
            name,
            ok: false,
            detail: `${String(error)}${observations ? ` (${observations})` : ''}`,
            durationMs: Date.now() - started,
          };
        } finally {
          await unmount();
        }
        if (!active()) return;
        completed.push(result);
        setResults([...completed]);
        await report(false);
      }
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
              onLoadStart={callback((_event: WebViewLoadEvent) => {
                view.events.push('start');
              })}
              onLoad={callback((_event: WebViewLoadEvent) => {
                view.events.push('load');
              })}
              onLoadEnd={callback((_event: WebViewLoadEvent) => {
                view.events.push('end');
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
              })}
              onRenderProcessGone={callback(
                (event: NitroWebViewRenderProcessGoneEvent) => {
                  view.rendererEvents.push(event.nativeEvent);
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
                      return view.decide!(request);
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
        {results.map(result => (
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
