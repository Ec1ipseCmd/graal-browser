import http from 'node:http';
import { createPresence } from './presence.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { AssetCache } from './asset-cache.mjs';
import { configuredOrigin, requestOrigin } from './request-origin.mjs';
import { fetchTrustedScript, trustedScripts } from './trusted-scripts.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/presence.mjs', ['presence.mjs', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']],
  ['/client-bridge.js', ['client-bridge.js', 'text/javascript']],
  ['/preferences.js', ['preferences.js', 'text/javascript']],
  ['/auto-join.js', ['auto-join.js', 'text/javascript']],
  ['/browser-login.js', ['browser-login.js', 'text/javascript']],
  ['/native-login.js', ['native-login.js', 'text/javascript']],
  ['/game-keyboard.js', ['game-keyboard.js', 'text/javascript']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/favicon.ico', ['favicon.svg', 'image/svg+xml']],
]);

export function createApp({ upstreamFetch = fetch, publicOrigin = process.env.PUBLIC_ORIGIN } = {}) {
  publicOrigin = configuredOrigin(publicOrigin);
  const cache = new AssetCache(path.join(root, '.cache/public-assets'), upstreamFetch);
  const presence = createPresence();
  let checkedWasm;
  const knownKeyLayout = async framework => {
    if (createHash('sha256').update(framework).digest('hex') !== '6191e5d17a724fe697403dba64ce62ba788c7e29bf07cbdfbf32e7211e593ccb') return false;
    const file = (await cache.get('wasm')).path;
    const info = await stat(file);
    if (checkedWasm?.mtime !== info.mtimeMs) {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      checkedWasm = { mtime: info.mtimeMs, hash: hash.digest('hex') };
    }
    return checkedWasm.hash === '55e809dff1ec7ef6c1fc4d103de3e0beca4f48cc9a498bec37ed160b341e939a';
  };
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src 'self' https://worldsplay.graalonline.com; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (status, content, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : content);
    };
    let origin;
    try { origin = requestOrigin(req,publicOrigin); }
    catch { return send(421,JSON.stringify({error:'Unexpected host.'})); }
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { return send(400, JSON.stringify({ error: 'Invalid request URL.' })); }
    if (url.pathname === '/api/presence') return presence(req, res, send, origin);
    if (!['GET', 'HEAD'].includes(req.method)) return send(405, JSON.stringify({ error: 'Method not allowed.' }));
    const trustedScriptId = url.pathname.match(/^\/trusted-scripts\/([a-z]+)$/)?.[1];
    if (trustedScriptId) {
      try {
        const bytes = await fetchTrustedScript(trustedScriptId, upstreamFetch);
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400, immutable' });
        res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch { send(502, 'Verified Graal script unavailable', 'text/plain'); }
      return;
    }
    const assets = {
      '/runtime/Worlds.wasm.unityweb': 'wasm',
      '/runtime/Worlds.data.unityweb': 'data',
      '/runtime/Assets.zip': 'assets',
    };
    if (assets[url.pathname]) {
      try {
        const asset = await cache.get(assets[url.pathname]);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=3600', 'X-Asset-Cache': asset.hit ? 'HIT' : 'MISS' });
        if (req.method === 'HEAD') res.end();
        else await pipeline(createReadStream(asset.path), res);
      } catch { if (!res.headersSent) send(502, 'Graal asset unavailable', 'text/plain'); else res.destroy(); }
      return;
    }
    if (url.pathname === '/client/' || url.pathname === '/runtime-framework.js') {
      try {
        const base = 'https://worldsplay.graalonline.com/';
        let content;
        if (url.pathname === '/client/') {
          const upstream = await upstreamFetch(base, { signal: AbortSignal.timeout(30000) });
          if (!upstream.ok) throw new Error('Upstream unavailable');
          content = await upstream.text();
          if (upstreamFetch === fetch) {
            const normalized = content
              .replace(/var phpcookie = "[a-f0-9]+";/, 'var phpcookie = "COOKIE";')
              .replace(/var phpipaddress = "[0-9.]+";/, 'var phpipaddress = "IP";');
            let challenges = 0;
            const verified = normalized.replace(/\s*<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>/, () => { challenges++; return ''; });
            if (challenges !== 1 || createHash('sha256').update(verified).digest('hex') !== '2178f645bf71f2f878d704c6fd53b777f6a15b6e38a47cdd458ae5aa9873c69f') throw new Error('Official login page changed');
            content = content.replace(/\s*<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>/, '');
          }
        } else content = await readFile((await cache.get('framework')).path, 'utf8');
        if (url.pathname === '/client/') {
          content = content.replace('<head>', `<head><base href="${base}"><script src="${origin}/preferences.js"></script><script src="${origin}/browser-login.js"></script><script src="${origin}/native-login.js"></script><script src="${origin}/client-bridge.js"></script><script src="${origin}/auto-join.js"></script>`);
          // Replace this page's three shortcut registrations and their broken CDN
          // dependency together. Keep all unrelated upstream scripts intact.
          content = content.replace(/<script\s+src="https:\/\/unpkg\.com\/hotkeys-js\/dist\/hotkeys\.min\.js"><\/script>\s*<script[^>]*>\s*hotkeys\([\s\S]*?<\/script>/, `<script src="${origin}/game-keyboard.js"></script>`);
          content = content.replace(/(<script\b[^>]*\bsrc=)(['"])([^'"]+)\2([^>]*>)/gi, (tag, prefix, quote, rawUrl, suffix) => {
            const resolved = new URL(rawUrl, base).href;
            if (new URL(resolved).origin === origin) return tag;
            const match = [...trustedScripts].find(([, script]) => script.url === resolved);
            if (!match) throw new Error('Unrecognized official script');
            return `${prefix}${quote}${origin}/trusted-scripts/${match[0]}${quote}${suffix}`;
          });
          content = content.replace('frameworkUrl: buildUrl + "/Worlds.framework.js.unityweb?v=701500"', `frameworkUrl: "${origin}/runtime-framework.js"`);
          content = content.replace('dataUrl: buildUrl + "/Worlds.data.unityweb?v=701500"', `dataUrl: "${origin}/runtime/Worlds.data.unityweb"`);
          content = content.replace('codeUrl: buildUrl + "/Worlds.wasm.unityweb?v=701500"', `codeUrl: "${origin}/runtime/Worlds.wasm.unityweb"`);
          content = content.replace('var loaderUrl = buildUrl + "/Worlds.loader.js";', `var loaderUrl = "${origin}/trusted-scripts/loader";`);
          content = content.replaceAll('https://worldsplay.graalonline.com/game/Assets.zip', `${origin}/runtime/Assets.zip`);
          // Browser login restoration has a two-second startup deadline.
          // Finish it before native preference reads, including on a warm cache.
          content = content.replace('script.onload = () => {', 'script.onload = async () => { await window.kingdomsNativeLogin?.ready;');
          const inlineHashes = [...content.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
            .map(([, script]) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`);
          res.setHeader('Content-Security-Policy', `default-src 'self' https: data: blob:; script-src 'self' blob: 'unsafe-eval' ${inlineHashes.join(' ')}; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' https: wss: blob:; frame-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri https://worldsplay.graalonline.com; form-action 'none'`);
          return send(200, content, 'text/html');
        }
        const hook = 'Module["FS_createPath"]=FS.createPath;';
        if (!content.includes(hook)) throw new Error('Upstream runtime changed');
        const layout = await knownKeyLayout(content) ? 'Module["kingdomsKeyLayout"]="worlds-701500-55e809df";' : '';
        if (layout) {
          for (const [name, args, indices] of [['vii', 'index,a1,a2', 'index===23988||index===61253'], ['iii', 'index,a1,a2', 'index===23997'], ['vi', 'index,a1', 'index===61877']]) {
            const signature = `function invoke_${name}(${args}){`;
            if (!content.includes(signature)) throw new Error('Upstream login bridge changed');
            content = content.replace(signature, signature + `if((${indices})&&window.kingdomsNativeLogin?.before(Module,index,a1,${name === 'vi' ? '0' : 'a2'}))return;`);
          }
        }
        content = content.replace(hook, hook + layout + 'Module["kingdomsFS"]=FS;if(window.kingdomsAttachFS)window.kingdomsAttachFS(FS);');
        // Preserve the official HTTPS client's encrypted transport on localhost HTTP.
        content = content.replace('window["location"]["protocol"].replace("http","ws")+"//"', '"wss://"');
        return send(200, content, 'text/javascript');
      } catch { return send(502, 'Graal could not load. Please reload to try again.', 'text/plain'); }
    }
    if (url.pathname === '/api/health') return send(200, JSON.stringify({ ok: true, client: 'https://worldsplay.graalonline.com/' }));
    const file = files.get(url.pathname);
    if (!file) return send(404, JSON.stringify({ error: 'Not found.' }));
    try { send(200, await readFile(path.join(root, 'public', file[0])), file[1]); }
    catch { send(500, JSON.stringify({ error: 'Could not load the application.' })); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  const server = createApp();
  server.listen(port, host, () => console.log(`Graal Online browser: http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
