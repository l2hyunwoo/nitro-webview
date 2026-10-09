import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRegressionServer } from '../regression-server.mjs';

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
