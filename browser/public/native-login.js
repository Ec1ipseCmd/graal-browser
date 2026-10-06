(() => {
  // These call-table entries and the remember flag belong only to the exact
  // framework/WASM pair fingerprinted by the server. No keyboard interception.
  const layout = 'worlds-701500-55e809df';
  let saved = null, pendingKey = '', account = '', nickname = '';
  let generation = 0, queue = Promise.resolve();
  const report = settings => parent.postMessage({source:'kingdoms-client',settings},location.origin);
  const storageStatus = error => parent.postMessage({source:'kingdoms-client',loginStorageError:error},location.origin);
  const loading = Promise.resolve().then(() => window.graalBrowserLogin.load());
  const ready = new Promise(resolve => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; resolve(); }, 2000);
    loading.then(value => { if (!generation && !expired) saved = value; }).catch(() => report('Encrypted login storage unavailable in this browser'))
      .finally(() => { clearTimeout(timer); resolve(); });
  });
  function read(module, object) {
    const heap = module.HEAPU32, bytes = module.HEAPU8;
    if (!Number.isInteger(object) || object < 4 || object % 4 || object + 4 > bytes.length) return '';
    const pointer = heap[object / 4];
    if (!pointer) return '';
    if (pointer % 4 || pointer + 8 > bytes.length) throw new Error('Invalid native string');
    const length = heap[pointer / 4];
    if (length > 8192 || pointer + 8 + length > bytes.length) throw new Error('Invalid native string length');
    return new TextDecoder('utf-8', {fatal:true}).decode(bytes.subarray(pointer + 8, pointer + 8 + length));
  }
  function assign(module, object, text) {
    const bytes = new TextEncoder().encode(text);
    const raw = module.asm.malloc(bytes.length + 1);
    if (!raw) throw new Error('Native allocation failed');
    try {
      module.HEAPU8.set(bytes, raw); module.HEAPU8[raw + bytes.length] = 0;
      // Result slots for the native getters are uninitialized; constructing the
      // same Graal string type gives its normal destructor ownership of it.
      module.HEAPU32[object / 4] = 0;
      module.dynCall_iii(13612, object, raw);
    } finally { module.asm.free(raw); }
  }
  function persist(credentials) {
    generation++; saved = credentials;
    queue = queue.catch(() => {}).then(async () => {
      if (credentials) await window.graalBrowserLogin.save(credentials);
      else await window.graalBrowserLogin.forget();
      storageStatus('');
      report(credentials ? 'Login encrypted and remembered in this browser' : 'Saved password removed');
    });
    // Observe failures without converting the queue to success: flush/reload must
    // also fail until a later save/delete succeeds. Never include secret values.
    queue.catch(() => storageStatus(credentials
      ? 'Your login could not be saved in this browser. Check site storage permissions and available space, then try again.'
      : 'Your saved password could not be deleted and may still be stored in this browser. Try again, or clear this site’s data in browser settings.'));
  }
  function before(module, index, a, b) {
    if (module.kingdomsKeyLayout !== layout) return false;
    try {
      if (index === 23988) {
        pendingKey = read(module, b);
        // Restore missing identity fields through Graal's own getters too.
        const text = pendingKey === 'accountname_new' ? saved?.username : pendingKey === 'nickname_new' ? saved?.nickname : null;
        if (text) { assign(module, a, text); if (pendingKey === 'accountname_new') account = text; return true; }
      } else if (index === 61253) {
        const key = pendingKey; pendingKey = '';
        if (key === 'password_new' || key.endsWith(':pass_new')) {
          const matches = saved && !module.HEAPU8[12848692] &&
            (key === saved.username + ':pass_new' || key === 'password_new' && account === saved.username);
          // Never fall back to a duplicate password from the native preferences.
          assign(module, a, matches ? saved.password : ''); return true;
        }
      } else if (index === 23997) {
        const key = read(module, a);
        if (key === 'accountname_new') account = read(module, b);
        if (key === 'nickname_new') nickname = read(module, b);
      } else if (index === 61877) {
        // Graal calls this when Start commits the native login form. Respect its
        // existing Save password checkbox; never press Start on the user's behalf.
        if (module.HEAPU8[12848692]) persist(null);
        else {
          const password = read(module, a);
          if (account && password) persist({username:account,password,nickname});
        }
        // Preserve Graal's in-memory login update but disable its separate native
        // password persistence for this call. The encrypted browser store above
        // is the only remembering mechanism. Always restore the checkbox flag.
        const rememberFlag = module.HEAPU8[12848692];
        module.HEAPU8[12848692] = 1;
        try { module.dynCall_vi(61877, a); }
        finally { module.HEAPU8[12848692] = rememberFlag; }
        return true;
      }
    } catch { report('Login remembering unavailable for this client'); }
    return false;
  }
  window.kingdomsNativeLogin = {before,ready,hasSavedLogin:() => !!(saved?.username && saved?.password),flush:() => queue};
})();
