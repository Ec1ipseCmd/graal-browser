import { startPresence } from './presence.mjs';
const $ = id => document.getElementById(id);
let frame;
// Keep window shortcuts usable after clicking a header control as well.
for (const type of ['keydown', 'keyup']) {
  window.addEventListener(type, event => frame?.contentWindow.kingdomsKeyboard?.handle(event), true);
}
let connectionFailed = false;
let loginStorageError = '';
function status(text) { $('status').textContent = text; }
function error(text = '') {
  $('error').textContent = loginStorageError || text;
  $('error').hidden = !($('error').textContent);
}
function launch() {
  connectionFailed = false;
  error();
  frame?.remove();
  status('Loading Graal…');
  const next = document.createElement('iframe');
  next.title = 'Official GraalOnline Worlds client';
  next.src = '/client/';
  next.allow = 'autoplay; fullscreen; clipboard-read; clipboard-write';
  next.referrerPolicy = 'no-referrer';
  next.addEventListener('load', () => {
    if (frame !== next) return;
    status('Official client open');
    next.focus();
  });
  frame = next;
  $('screen').append(next);
}
async function flushGame() {
  try { await frame?.contentWindow.kingdomsFlush?.(); }
  catch { error('Browser storage could not be saved. Check available disk space and browser permissions.'); throw new Error('Save failed'); }
}
$('reload').addEventListener('click', async () => {
  if (confirm('Reload Graal? This disconnects the current game session.')) {
    try { await flushGame(); launch(); } catch {}
  }
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('screen').requestFullscreen();
    frame?.focus();
  } catch { error('Full screen is unavailable in this browser.'); }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
});
window.addEventListener('offline', () => error('Your browser is offline. Restore your internet connection, then reload Graal.'));
window.addEventListener('online', () => error());

const autoJoinKey = 'kingdoms.autoJoin.v1';
try { $('auto-join').checked = localStorage.getItem(autoJoinKey) === 'true'; } catch {}
$('auto-join').addEventListener('change', () => {
  try { localStorage.setItem(autoJoinKey, String($('auto-join').checked)); }
  catch { error('Auto join could not be saved in this browser.'); $('auto-join').checked = false; return; }
  frame?.contentWindow.postMessage({source:'kingdoms-launcher',autoJoin:$('auto-join').checked},location.origin);
  frame?.focus();
});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame?.contentWindow || event.data?.source !== 'kingdoms-client') return;
  if (typeof event.data.loginStorageError === 'string') {
    loginStorageError = event.data.loginStorageError;
    error();
  }
  if (typeof event.data.autoJoin === 'string') { $('auto-join-status').textContent = event.data.autoJoin; $('auto-join').title = event.data.autoJoin; }
  if (event.data.connection === 'error') {
    connectionFailed = true;
    status('Graal connection failed');
  } else if (event.data.connection === 'open' && connectionFailed) {
    connectionFailed = false;
    error();
    status('Graal connection opened', true);
  }
});

launch();
startPresence($('presence'));
