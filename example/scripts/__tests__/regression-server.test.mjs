import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRegressionServer } from '../regression-server.mjs';

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
