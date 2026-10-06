import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AssetCache } from '../asset-cache.mjs';
async function directory(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'graal-cache-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test('public asset downloads are deduplicated and reused across cache instances', async t => {
  let calls = 0;
  const dir = await directory(t);
  const fetcher = async () => { calls++; return new Response('asset', { headers: {etag:'"v1"'} }); };
  const cache = new AssetCache(dir, fetcher);
  const [a,b] = await Promise.all([cache.get('data'),cache.get('data')]);
  assert.equal(a.path,b.path);
  assert.equal(await readFile(a.path,'utf8'),'asset');
  assert.equal((await new AssetCache(dir,fetcher).get('data')).hit,true);
  assert.equal(calls,1);
  await assert.rejects(cache.get('login'));
});
test('expired assets revalidate and failed responses are not cached', async t => {
  let calls = 0;
  const cache = new AssetCache(await directory(t), async (url,options) => {
    calls++;
    if(calls === 1) return new Response('unavailable',{status:503});
    if(calls === 2) return new Response('asset',{headers:{etag:'"v1"'}});
    assert.equal(options.headers['If-None-Match'],'"v1"');
    return new Response(null,{status:304});
  },0);
  await assert.rejects(cache.get('assets'));
  assert.equal((await cache.get('assets')).hit,false);
  assert.equal((await cache.get('assets')).hit,true);
  assert.equal(calls,3);
});
