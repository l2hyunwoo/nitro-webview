import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Script } from 'node:vm';
import { createRegressionServer, fixtureText } from '../regression-server.mjs';

test('request timing excludes the delayed target response on one server clock', async () => {
  const server = createRegressionServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fetch(`${base}/navigation-start-marker?case=early-allow`);
    const target = fetch(`${base}/target?case=early-allow`);
    let requests;
    const deadline = performance.now() + 5000;
    while (true) {
      assert.ok(performance.now() < deadline, 'target request timed out');
      requests = await (await fetch(`${base}/requests`)).json();
      if (requests.length === 2) break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.ok(requests.every(request => Number.isFinite(request.receivedAt)));
    const requestDelay = requests[1].receivedAt - requests[0].receivedAt;
    assert.ok(
      requestDelay < 245,
      'an immediate request must fail the budget check',
    );
    await (await target).text();
    assert.ok(performance.now() - requests[1].receivedAt >= 290);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('fixture records real requests and redacts cookies and credentials', async () => {
  const server = createRegressionServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/post?case=body`, {
      method: 'POST',
      body: 'message=stable',
      headers: { Authorization: 'fixture-request', Cookie: 'secret=private' },
    });
    assert.match(await response.text(), /message=stable/);
    const redirect = await fetch(`${base}/redirect?case=history`);
    assert.equal(redirect.url, `${base}/target?case=history`);
    assert.equal((await fetch(`${base}/404`)).status, 404);
    const requests = await (await fetch(`${base}/requests`)).json();
    assert.deepEqual(
      requests.map(r => r.path),
      ['/post', '/redirect', '/target', '/404'],
    );
    assert.equal(requests[0].body, 'message=stable');
    assert.deepEqual(requests[0].cookieNames, ['secret']);
    assert.equal(requests[0].authorizationCount, 1);
    assert.equal(requests[0].authorizationMatches, true);
    assert.doesNotMatch(JSON.stringify(requests), /private|fixture-request/);
    const results = {
      complete: true,
      platform: 'test',
      cases: [{ name: 'fixture', ok: true }],
    };
    await fetch(`${base}/results`, {
      method: 'POST',
      body: JSON.stringify(results),
    });
    assert.deepEqual(await (await fetch(`${base}/results`)).json(), results);
    await fetch(`${base}/reset`);
    assert.deepEqual(await (await fetch(`${base}/requests`)).json(), []);
    assert.equal(await (await fetch(`${base}/results`)).json(), null);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('native fixture sends attachment bytes, playable media, and executable frame/UI pages', async () => {
  const server = createRegressionServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const attachment = await fetch(`${base}/attachment?case=download`);
    assert.equal(
      attachment.headers.get('content-type'),
      'application/octet-stream',
    );
    assert.equal(
      attachment.headers.get('content-disposition'),
      'attachment; filename="nitro-regression.txt"',
    );
    assert.equal(
      Number(attachment.headers.get('content-length')),
      Buffer.byteLength(fixtureText),
    );
    assert.equal(await attachment.text(), fixtureText);
    const media = await fetch(`${base}/fixture.mp4`);
    assert.equal(media.headers.get('content-type'), 'video/mp4');
    const bytes = Buffer.from(await media.arrayBuffer());
    assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
    assert.ok(bytes.length > 1000);
    const range = await fetch(`${base}/fixture.mp4`, {
      headers: { Range: 'bytes=0-1' },
    });
    assert.equal(range.status, 206);
    assert.equal(
      range.headers.get('content-range'),
      `bytes 0-1/${bytes.length}`,
    );
    assert.deepEqual(
      Buffer.from(await range.arrayBuffer()),
      bytes.subarray(0, 2),
    );
    for (const value of ['bytes=999999-', 'bytes=7-3', 'bytes=invalid'])
      assert.equal(
        (await fetch(`${base}/fixture.mp4`, { headers: { Range: value } }))
          .status,
        416,
      );
    for (const path of [
      '/download-fixture',
      '/window-fixture',
      '/upload-fixture',
      '/fullscreen-fixture',
      '/permission-fixture',
      '/frames',
      '/frame-opaque',
    ]) {
      const html = await (await fetch(`${base}${path}?case=native`)).text();
      new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
        filename: path,
      });
      if (path === '/frames') {
        assert.match(html, /http:\/\/localhost:8098\/frame-cross\?case=native/);
        assert.match(
          html,
          /src="\/frame-opaque\?case=native" sandbox="allow-scripts"/,
        );
      }
      if (path === '/upload-fixture')
        assert.match(html, /capture="environment"/);
      if (path === '/window-fixture') assert.match(html, /target="_blank"/);
      if (path === '/permission-fixture') {
        const handler = html.match(/onclick="([^"]+)">Location<\/button>/)[1];
        new Script(handler).runInNewContext({
          navigator: {
            geolocation: {
              getCurrentPosition(_success, _failure, options) {
                assert.equal(options.enableHighAccuracy, true);
                assert.equal(options.timeout, 15000);
                assert.equal(options.maximumAge, 0);
              },
            },
          },
        });
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('fullscreen fixture prepares video on gesture, prefers standard API, and reports failures without fake events', async () => {
  const server = createRegressionServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const html = await (
      await fetch(
        `http://127.0.0.1:${server.address().port}/fullscreen-fixture`,
      )
    ).text();
    assert.match(html, /onclick="prepareVideo\(\)">Prepare video<\/button>/);
    const script = new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
    for (const [enabled, standard, webkit, reject, expected] of [
      [true, true, true, false, ['standard']],
      [false, true, true, false, ['webkit']],
      [true, false, true, false, ['webkit']],
      [true, true, true, true, ['standard']],
      [false, false, false, false, []],
    ]) {
      const calls = [];
      const messages = [];
      const videoEvents = new Map();
      const video = {
        addEventListener: (name, callback) => videoEvents.set(name, callback),
        load: () => calls.push('load'),
        play: () => {
          calls.push('play');
          return reject
            ? Promise.reject({ name: 'NotAllowedError' })
            : Promise.resolve();
        },
      };
      if (standard)
        video.requestFullscreen = () => {
          calls.push('standard');
          return reject
            ? Promise.reject({ name: 'NotAllowedError' })
            : Promise.resolve();
        };
      if (webkit) video.webkitEnterFullscreen = () => calls.push('webkit');
      const context = {
        window: {
          addEventListener() {},
          ReactNativeWebView: { postMessage: value => messages.push(value) },
        },
        document: {
          fullscreenEnabled: enabled,
          addEventListener() {},
          getElementById: id =>
            id === 'video'
              ? video
              : id === 'marker'
                ? { textContent: '' }
                : null,
        },
      };
      script.runInNewContext(context);
      assert.deepEqual(calls, []);
      context.prepareVideo();
      await Promise.resolve();
      assert.deepEqual(calls, ['load', 'play']);
      assert.equal(messages.includes('video:ready'), false);
      if (reject) assert.ok(messages.includes('video:error:NotAllowedError'));
      videoEvents.get('loadedmetadata')();
      assert.ok(messages.includes('video:ready'));
      calls.length = 0;
      context.fullscreen();
      await Promise.resolve();
      assert.deepEqual(calls, expected);
      assert.equal(messages.includes('fullscreen:entered'), false);
      if (reject)
        assert.ok(messages.includes('fullscreen:error:NotAllowedError'));
      if (!standard && !webkit)
        assert.ok(messages.includes('fullscreen:error:unsupported'));
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('native handshake accepts only fixed actions and validates completion separately', async () => {
  const server = createRegressionServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, value) =>
    fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(value) });
  const read = async path => (await fetch(`${base}${path}`)).json();
  try {
    const action = { id: 'native-1', action: 'chooser-cancel' };
    assert.deepEqual(await (await post('/interaction', action)).json(), action);
    for (const value of [
      { ...action, action: 'shell' },
      { ...action, label: 'Delete' },
      { ...action, command: 'rm' },
      { id: 'tap', action: 'tap', label: 'Delete' },
    ]) {
      assert.equal((await post('/interaction', value)).status, 400);
      assert.deepEqual(await read('/interaction'), action);
    }
    const outcome = {
      id: action.id,
      ok: false,
      detail: 'OS chooser did not appear',
    };
    assert.deepEqual(
      await (await post('/interaction-result', outcome)).json(),
      outcome,
    );
    assert.equal(
      (await post('/interaction-result', { ...outcome, ok: 'true' })).status,
      400,
    );
    assert.deepEqual(await read('/interaction-result'), outcome);
    await fetch(`${base}/reset`);
    assert.equal(await read('/interaction-result'), null);
    assert.deepEqual(await read('/requests'), []);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('interaction handshake round trips, acknowledges, and resets without recording page requests', async () => {
  const server = createRegressionServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const read = async path => (await fetch(`${base}${path}`)).json();
  const post = async value =>
    fetch(`${base}/interaction`, {
      method: 'POST',
      body: JSON.stringify(value),
    });
  try {
    assert.equal(await read('/interaction'), null);
    const interaction = { id: 'history-gesture-1', label: 'Navigate' };
    assert.deepEqual(await (await post(interaction)).json(), interaction);
    assert.deepEqual(await read('/interaction'), interaction);
    assert.equal(await (await post(null)).json(), null);
    assert.equal(await read('/interaction'), null);
    await post(interaction);
    assert.equal((await post({ id: 'bad', label: 'Delete' })).status, 400);
    assert.deepEqual(await read('/interaction'), interaction);
    await fetch(`${base}/reset`);
    assert.equal(await read('/interaction'), null);
    assert.deepEqual(await read('/requests'), []);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
