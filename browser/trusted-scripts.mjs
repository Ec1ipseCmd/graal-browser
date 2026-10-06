import { createHash } from 'node:crypto';

export const trustedScripts = new Map([
  ['jquery', { url: 'https://ajax.googleapis.com/ajax/libs/jquery/1.5.2/jquery.min.js', sha256: '8f0a19ee8c606b35a10904951e0a27da1896eafe33c6e88cb7bcbe455f05a24a' }],
  ['jqueryui', { url: 'https://ajax.googleapis.com/ajax/libs/jqueryui/1.8/jquery-ui.min.js', sha256: '50ea31c0452a869e41485170ab3ca8d90a7824b99860f4c707c97ed728598a3f' }],
  ['howler', { url: 'https://worldsplay.graalonline.com/game/howler/howler.js', sha256: '2ba83055433210f778b3dbed65774220fc928b7af55a1ceaa54030e034741bd2' }],
  ['audio', { url: 'https://worldsplay.graalonline.com/audio.js', sha256: 'a9c51e9f0cdbc273e1756b6e714cb13c667d1d91734410fe5fc46812f09e3c79' }],
  ['progress', { url: 'https://worldsplay.graalonline.com/game/TemplateData/UnityProgress.js', sha256: '1e542a888b53f5e811ab967e08e95c629c18a3baa94d46d42fd859bd4dc13777' }],
  ['loader', { url: 'https://worldsplay.graalonline.com/game/Build-share/Worlds.loader.js', sha256: '3228efdfd6262559439006c293745866874b97bbccccbdf5526d34517aa79efb' }],
]);

const maximumSize = 8 * 1024 * 1024;
export async function fetchTrustedScript(id, fetcher = fetch) {
  const script = trustedScripts.get(id);
  if (!script) throw new Error('Unknown script');
  const response = await fetcher(script.url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok || new URL(response.url || script.url).href !== script.url) throw new Error('Trusted script unavailable');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximumSize || createHash('sha256').update(bytes).digest('hex') !== script.sha256) {
    throw new Error('Trusted script changed');
  }
  return bytes;
}
