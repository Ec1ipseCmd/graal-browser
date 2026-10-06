(() => {
  const notify = data => parent.postMessage({ source: 'kingdoms-client', ...data }, location.origin);
  const send = settings => notify({ settings });
  const NativeWebSocket = window.WebSocket;
  if (NativeWebSocket) window.WebSocket = class extends NativeWebSocket {
    constructor(...args) {
      super(...args);
      let host;
      try { host = new URL(args[0]).hostname; } catch { return; }
      if (!/(^|\.)(graalonline\.com|quattroplay\.com)$/.test(host)) return;
      this.addEventListener('error', () => notify({ connection: 'error', host }));
      this.addEventListener('open', () => notify({ connection: 'open', host }));
    }
  };
  let filesystem;
  let flush;
  let saveKeys = () => {};
  window.kingdomsAttachFS = FS => {
    filesystem = FS;
    // The official runtime also calls FS.syncfs on blur/pagehide. Serialize all
    // callers, including startup reads, rather than just our own save calls.
    const sync = FS.syncfs.bind(FS);
    const queue = [];
    let running = false;
    const next = () => {
      if (running || !queue.length) return;
      running = true;
      const { populate, callback } = queue.shift();
      let completed = false;
      const done = error => {
        if (completed) return;
        completed = true;
        try { callback(error); }
        finally { running = false; queueMicrotask(next); }
      };
      try { sync(populate, done); } catch (error) { done(error); }
    };
    FS.syncfs = (populate, callback) => {
      if (typeof populate === 'function') { callback = populate; populate = false; }
      queue.push({ populate: !!populate, callback: callback || (() => {}) });
      next();
    };
    try {
      window.kingdomsPreferences?.installConfig(FS, localStorage,
        () => setTimeout(() => window.kingdomsFlush().catch(() => send('Browser storage could not be saved')), 0), send);
    } catch { send('Browser preference storage unavailable'); }
  };
  // Persist the official client's mounted browser filesystem, including downloaded
  // game assets and settings. The native Save password checkbox controls encrypted browser login storage.
  window.kingdomsFlush = async () => {
    saveKeys();
    await window.kingdomsNativeLogin?.flush();
    if (!filesystem || !window.unityInstance) return;
    if (!flush) flush = new Promise((resolve, reject) => {
      filesystem.syncfs(false, error => error ? reject(error) : resolve());
    }).then(() => send('Browser file cache saved'))
      .finally(() => { flush = undefined; });
    return flush;
  };
  const save = () => window.kingdomsFlush().catch(() => send('Browser storage could not be saved'));
  window.addEventListener('pagehide', () => { try { saveKeys(); } catch { send('Browser preference storage could not be saved'); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  const ready = setInterval(() => {
    if (!window.unityInstance?.Module?.kingdomsFS) return;
    clearInterval(ready);
    send('Browser file caching active');
    setInterval(save, 15000);
  }, 250);
  // The input table exists once Graal dismisses its loading artwork. Check the
  // DOM while waiting; scan native memory just once, only for a known build.
  const keysReady = setInterval(() => {
    const module = window.unityInstance?.Module;
    if (!module || document.getElementById('imageContainer')?.style.display !== 'none') return;
    clearInterval(keysReady);
    try {
      const capture = window.kingdomsPreferences?.installPrimaryKeys(module, localStorage, send);
      if (!capture) return;
      saveKeys = capture;
      const captureSafely = () => { try { capture(); } catch { send('Browser preference storage could not be saved'); } };
      window.addEventListener('keyup', () => setTimeout(captureSafely, 100));
      window.addEventListener('mouseup', () => setTimeout(captureSafely, 100));
      setInterval(captureSafely, 1000);
      send('Options and primary keys save in this browser');
    } catch { send('Key preference saving unavailable'); }
  }, 500);
})();
