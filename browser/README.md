# Browser client developer guide

For the project overview, installation, login security, and everyday usage, start
with the [main README](../README.md). This directory contains the working browser
wrapper and its tests.

## Start the server

From this directory:

```sh
npm start
```

Requires Node.js 22 or newer. Open **http://localhost:4173**. The client starts
automatically and fills the page below its header. There is no Launch button,
splash page, or Close client button. `HOST` and `PORT` default to `127.0.0.1`
and `4173`. On POSIX shells, a different local port can be selected with:

```sh
PORT=4174 npm start
```

In PowerShell, use `$env:PORT = '4174'` before `npm start`. Each different origin
has its own browser settings and remembered login. Serving `public/` as static
files alone is insufficient: the wrapper and asset routes require Node.

## Request and data flow

`server.mjs` serves a fixed allowlist of public files, `/client/`, runtime asset
routes, `/api/health`, and `/api/presence`. It fetches the official login HTML,
adds the browser integrations, and rewrites the known Unity resource URLs to
cached local endpoints. Arbitrary filesystem paths are not web routes.

`asset-cache.mjs` caches the public Unity framework, WebAssembly, data, and
Assets.zip under `.cache/public-assets/`. Concurrent downloads are combined.
After an hour, files are revalidated with ETag/Last-Modified when available.
Failed responses are not cached. Stop the server before removing that directory
to clear the shared cache. Login HTML and game traffic are not cached there.

Unity runs on the browsing device and connects directly to Graal over WSS. The
wrapper preserves WSS when launched from localhost HTTP. Node does not proxy
gameplay or authenticate Graal accounts. External hosting requires HTTPS;
`PUBLIC_ORIGIN` configures the public origin used for injected script URLs.
See [deployment notes](../deploy/README.md).

## Browser integrations

| File | Responsibility |
| --- | --- |
| `public/app.mjs` | Automatic iframe launch, header controls, reload/flush, status messages |
| `public/browser-login.js` | AES-256-GCM remembered-login storage in browser IndexedDB |
| `public/native-login.js` | Exact-build native login-field integration and Save password handling |
| `public/preferences.js` | Primary key bindings, allowlisted options backup, removal of native password config entries |
| `public/client-bridge.js` | Serialized filesystem synchronization, save scheduling, connection status |
| `public/game-keyboard.js` | F3/F7/F8 dispatch with repeat suppression and focus handling |
| `public/auto-join.js` | Verified native-control adapter and bounded auto-join sequence |
| `public/presence.mjs`, `presence.mjs` | Anonymous browser heartbeat and aggregate live count |

The local wrapper and launcher share an origin; their scripts are not isolated
from each other. Native login, window actions, auto join, and key-table integration
are enabled only for a framework/WebAssembly pair whose SHA-256 fingerprints
match the tested build. Do not remove that guard to accommodate an upstream
update. Verify the native layouts and methods before supporting a new build.
Unknown builds retain manual use where the official client supports it, but
integration features may be unavailable.

The official login page is checked against a normalized SHA-256 fingerprint,
and external JavaScript files are pinned to their tested hashes and served from
this origin. If Graal changes the page or those scripts, the wrapper fails closed
until the new upstream build is reviewed and its fingerprints are updated.

The primary-key adapter finds and validates the 11-action input table rather than
assuming a fixed table address. It saves only the key-code fields. Other native
adapters use build-specific pointers and function-table entries. The distinction
matters when reviewing changes for a new official build.

## Browser persistence

Remembered account/email, nickname, and password are encrypted together in
IndexedDB database `graal-browser-login-v1`. Each save generates a fresh
non-extractable AES-256-GCM key and random 12-byte IV. The key, ciphertext, IV,
and format version are written in one transaction. No login-storage operation
makes a network request, and there is no plaintext fallback.

`native-login.js` captures the native login commit when Start is pressed, not
general keyboard input. It restores only a matching account's encrypted browser
login and honors the Save password checkbox. Its startup read has a two-second
deadline; local storage operations have a five-second timeout. Forgetting a
login removes both the encrypted record and its key. A native password remains
in memory as needed for authentication, but the supported build’s separate
password-persistence path is disabled.

This is automatic browser-local remembering, not a master-password vault.
Same-origin scripts can use the key to decrypt; browser-profile access,
malicious extensions, and compromised served code remain risks. See the
[security explanation](../README.md#remembered-logins-and-security) before
making security claims about the integration.

Other state is separate:

- `kingdoms.primaryKeys.v1`: primary/left-hand movement and action bindings.
- `kingdoms.options.v1`: allowlisted volume and other options; excludes credentials.
- `kingdoms.autoJoin.v1`: optional auto-join preference.
- Unity’s mounted filesystem: game files in browser IndexedDB, flushed every 15 seconds, when hidden, and before launcher reload.

Filesystem synchronizations are serialized, including Unity's own startup reads
and flushes. Missing configuration files can be seeded from the options backup.
Closing a tab or killing the browser does not guarantee pending asynchronous
writes finish. Browser storage may be cleared or evicted. Secondary/right-hand
key bindings are not backed up.

## Auto join and presence

Auto join uses native named GUI controls, not screen-coordinate clicks or the
Windows `graal://` protocol. It makes at most one saved-login submission and one
Kingdoms selection per load, stops after two minutes, and never retries a failed
password or reconnects after logout. Without a saved password, manual login is
required before server selection can proceed.

Presence sends a heartbeat every 20 seconds. An anonymous HttpOnly, SameSite
cookie scoped to `/api/presence` groups tabs in the same browser. Entries expire
after two minutes without a heartbeat and reset on server restart. GET returns
only `{ "browsers": number }`; same-origin POST refreshes presence. The in-memory
map is capped at 10,000 entries. This feature stores no accounts, passwords, IP
addresses, or historical visits. Counts include loading/idle clients and are
not proof of authenticated game sessions.

## Verification

Install development dependencies and Chromium from this directory:

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
```

The regular suite tests route restrictions, caching, native bridge behavior,
browser encryption and tamper rejection, reload persistence, browser isolation,
forgetting, header layout, and presence. Tests that require the live game skip
unless enabled. Linux environments may also require Playwright's system browser
dependencies (`npx playwright install --with-deps chromium`).

Optional live tests download the official Unity build and connect to Graal:

```sh
npm run test:live
```

On Windows PowerShell, set `$env:LIVE_GRAAL = '1'` and run `npm run test:browser`
instead. Live login checks use dummy details and suppress WebSocket sends before
submitting them; they do not verify a paid account's access. They also exercise
native login restoration, forgetting, and duplicate-password suppression.
Run live checks only when network access and the official client are available.

For endpoint diagnostics:

```sh
npm run diagnose:connection
```

The cache, browser-test artifacts, and local deployment secrets are ignored by
Git. Never use real account passwords in tests, screenshots, logs, or fixtures.
