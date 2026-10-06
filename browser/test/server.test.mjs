import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { createApp } from '../server.mjs';

async function fixture(t, options) {
  const app = createApp(options).listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise(resolve => { app.closeAllConnections(); app.close(resolve); }));
  return `http://127.0.0.1:${app.address().port}`;
}

test('serves launcher with narrowly scoped official-client frame policy', async t => {
  const origin = await fixture(t);
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /frame-src 'self' https:\/\/worldsplay\.graalonline\.com;/);
  assert.match(response.headers.get('content-security-policy'), /form-action 'none'/);
  assert.match(response.headers.get('content-security-policy'), /object-src 'none'/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await response.text(), /id="screen"/);
});

test('does not expose private files or accept credential writes', async t => {
  const origin = await fixture(t);
  for (const file of ['/server.mjs', '/package.json', '/.cache/private-data.bin', '/artifacts/test-session.json', '/api/session', '/novnc/core/rfb.js', '/%2e%2e%2fserver.mjs']) {
    assert.equal((await fetch(origin + file)).status, 404);
  }
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await fetch(origin + '/', { method })).status, 405);
});

test('native login bridge loads from this origin before Unity starts', async t => {
  const origin = await fixture(t, {upstreamFetch:async()=>new Response('<head></head><script>script.onload = () => { createUnityInstance(); };</script>')});
  const body = await (await fetch(origin+'/client/')).text();
  assert.ok(body.includes(`<script src="${origin}/browser-login.js"></script><script src="${origin}/native-login.js"></script>`));
  assert.ok(body.includes('script.onload = async () => { await window.kingdomsNativeLogin?.ready;'));
  const main = await (await fetch(origin)).text();
  assert.doesNotMatch(main,/login-dialog|id="saved-login"/);
});

test('health and static assets work without Docker or external services', async t => {
  const origin = await fixture(t);
  assert.deepEqual(await (await fetch(origin + '/api/health')).json(), { ok: true, client: 'https://worldsplay.graalonline.com/' });
  assert.equal((await fetch(origin + '/app.mjs')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(origin + '/style.css', { method: 'HEAD' })).status, 200);
});

test('malformed request URLs return 400 without stopping the server', async t => {
  const origin = await fixture(t);
  const { port } = new URL(origin);
  const response = await new Promise((resolve, reject) => {
    const socket = net.connect(Number(port), '127.0.0.1');
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => { data += chunk; });
    socket.on('error', reject);
    socket.on('end', () => resolve(data));
    socket.on('connect', () => socket.end('GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'));
  });
  assert.match(response, /^HTTP\/1\.1 400/);
  assert.equal((await fetch(origin + '/api/health')).status, 200);
});


test('wrapper replaces the broken hotkeys dependency and permits blob audio', async t => {
  const html = `<head><script src="https://unpkg.com/hotkeys-js/dist/hotkeys.min.js"></script><script type="text/javascript">hotkeys('f3', function(event){event.preventDefault()});</script><script>window.otherScript=true</script></head>`;
  const origin = await fixture(t, { upstreamFetch: async () => new Response(html) });
  const response = await fetch(origin + '/client/');
  const body = await response.text();
  assert.match(body, /game-keyboard\.js/);
  assert.doesNotMatch(body, /unpkg|hotkeys\(/);
  assert.match(body, /window.otherScript=true/);
  assert.match(response.headers.get('content-security-policy'), /connect-src [^;]*blob:/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self' blob: 'unsafe-eval'/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /script-src[^;]*https:|script-src[^;]*unsafe-inline/);
  assert.equal((await fetch(origin + '/trusted-scripts/jquery')).status, 502);
  assert.equal((await fetch(origin + '/favicon.ico')).status, 200);
});
