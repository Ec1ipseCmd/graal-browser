// This adapter is deliberately limited to the fingerprinted Unity build. It
// identifies the complete native primary-key table, never hardcoded addresses.
const KEY_LAYOUT = 'worlds-701500-55e809df';
const DEFAULT_KEYS = [38, 37, 40, 39, 68, 83, 65, 77, 9, 81, 80];
function validKeys(keys) {
  return Array.isArray(keys) && keys.length === 11 && keys.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
}
function tableValid(heap, table) {
  return table.nodes.length === 11 && table.nodes.every((node, index) =>
    node >= 256 && node + 22 < heap.length && heap[table.array + index] === node * 4 &&
    heap[node + 16] === table.owner && heap[node + 17] === 0 &&
    heap[node + 18] === index && heap[node + 19] === 0 &&
    heap[node + 20] <= 255 && heap[node + 21] === 0);
}
function findPrimaryKeys(heap) {
  const found = new Map();
  for (let i = 0; i < heap.length - 11; i++) {
    const pointer = heap[i];
    if (pointer < 1024 || pointer % 4 || pointer + 88 >= heap.byteLength) continue;
    const first = pointer / 4;
    if (heap[first + 18] !== 0 || heap[first + 19] !== 0 || heap[first + 20] !== 38 || heap[first + 21] !== 0) continue;
    const owner = heap[first + 16];
    if (owner < 1024 || owner >= heap.byteLength) continue;
    const nodes = Array.from(heap.subarray(i, i + 11), p => p / 4);
    if (!nodes.every(Number.isInteger)) continue;
    const table = { array: i, owner, nodes };
    if (tableValid(heap, table) && nodes.every((n, j) => heap[n + 20] === DEFAULT_KEYS[j])) found.set(nodes.join(','), table);
  }
  // An ambiguous or changed native layout must never be modified.
  return found.size === 1 ? [...found.values()][0] : null;
}
function applyPrimaryKeys(heap, table, keys) {
  if (!validKeys(keys) || !tableValid(heap, table)) return false;
  for (let i = 0; i < 11; i++) heap[table.nodes[i] + 20] = keys[i];
  return true;
}
function installPrimaryKeys(module, storage, report) {
  if (module.kingdomsKeyLayout !== KEY_LAYOUT) { report('Key saving unavailable for this client build'); return null; }
  const table = findPrimaryKeys(module.HEAPU32);
  if (!table) { report('Key saving unavailable: client input layout changed'); return null; }
  const key = 'kingdoms.primaryKeys.v1';
  let previous;
  try {
    const saved = JSON.parse(storage.getItem(key) || 'null');
    if (validKeys(saved)) applyPrimaryKeys(module.HEAPU32, table, saved);
    previous = JSON.stringify(table.nodes.map(n => module.HEAPU32[n + 20]));
  } catch { report('Browser preference storage unavailable'); }
  return () => {
    if (!tableValid(module.HEAPU32, table)) return false;
    const value = JSON.stringify(table.nodes.map(n => module.HEAPU32[n + 20]));
    if (value !== previous) {
      storage.setItem(key, value);
      previous = value;
      report('Primary keys saved in this browser');
    }
    return true;
  };
}

const configKey = 'kingdoms.options.v1';
const withoutPasswords = text => text.split(/\r?\n/).filter(line => !/^\s*(?:password(?:_new)?|.+:pass_new)\s*=/i.test(line)).join('\n');
const settings = /^(?:reversestereo|midivolume|mp3volume|radiovolume|sfxvolume|voicevolume|language|font|fontsize|utf8fontfile|lighteffectsenabled|weathereffectsenabled|particleeffectsenabled|dontsavepms|nomassmessages|notoalls|loadbuddiesfromserver|globalpms|buddytracking|displaytrayicon|limitnicknames|nicknamelimit|defaultguistyle|externalguistyle|screenshotformat)$/;
function configLines(text) {
  return text.split(/\r?\n/).filter(line => {
    const i = line.indexOf('=');
    return i > 0 && settings.test(line.slice(0, i)) && line.length < 256;
  });
}
function installConfig(FS, storage, dirty, report) {
  const originalOpen = FS.open, originalClose = FS.close;
  const restored = new Set();
  let busy = false;
  let saved = [];
  try { const value = JSON.parse(storage.getItem(configKey) || '[]'); if (Array.isArray(value)) saved = configLines(value.filter(x => typeof x === 'string').join('\n')); } catch {}
  const isConfig = path => typeof path === 'string' && /\/game_config\.txt$/.test(path);
  // A fresh IDBFS has no config file. Seed it before the native existence check,
  // otherwise Graal selects in-memory defaults without ever opening it to read.
  if (FS.lookupPath) {
    const lookup = FS.lookupPath;
    FS.lookupPath = function(path, ...args) {
      if (!busy && saved.length && isConfig(path)) {
        busy = true;
        try {
          try { lookup.call(this, path, ...args); }
          catch { FS.writeFile(path, saved.join('\n') + '\n'); }
        } catch { /* Parent directory may not have been created yet. */ }
        finally { busy = false; }
      }
      return lookup.call(this, path, ...args);
    };
  }
  FS.open = function(path, flags, ...args) {
    // Native config reads use numeric flags. Ignore IDBFS's own string-mode
    // reads while it snapshots/restores files during startup.
    const reading = typeof flags === 'number' && (flags & 3) === 0;
    if (!busy && isConfig(path) && reading && !restored.has(path)) {
      restored.add(path);
      busy = true;
      try {
        const original = FS.readFile(path, { encoding: 'utf8' });
        let current = withoutPasswords(original);
        if (saved.length) {
          const names = new Set(saved.map(line => line.split('=')[0]));
          current = current.split(/\r?\n/).filter(line => line && !names.has(line.split('=')[0])).concat(saved).join('\n') + '\n';
        }
        if (current !== original) { FS.writeFile(path, current); dirty(); }

      } catch { report('Could not restore saved options'); }
      finally { busy = false; }
    }
    return originalOpen.call(this, path, flags, ...args);
  };
  FS.close = function(stream) {
    const path = stream?.path;
    const writing = stream && (stream.flags & 3) !== 0;
    const result = originalClose.call(this, stream);
    if (!busy && writing && isConfig(path)) {
      busy = true;
      try {
        const original = FS.readFile(path, { encoding: 'utf8' });
        const current = withoutPasswords(original);
        if (current !== original) FS.writeFile(path, current);
        const lines = configLines(current);
        if (lines.length) {
          storage.setItem(configKey, JSON.stringify(lines));
          saved = lines;
          report('Options saved in this browser');
        }
        dirty();
      } catch { report('Browser preference storage could not be saved'); }
      finally { busy = false; }
    }
    return result;
  };
}

globalThis.kingdomsPreferences = { KEY_LAYOUT, DEFAULT_KEYS, validKeys, tableValid, findPrimaryKeys, applyPrimaryKeys, installPrimaryKeys, installConfig };
