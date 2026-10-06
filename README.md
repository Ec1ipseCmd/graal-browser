# Graal Online Browser Client

Play through GraalOnline’s official Unity web client in a desktop browser, with
an optional shortcut into **Graal Kingdoms**. This project runs a small local web
server, opens the game directly, and adds browser-friendly controls, caching,
and remembered settings. You do not need to install the standalone Graal client.

This is an independent wrapper around the official web client, not a replacement
game server or a new implementation of Graal’s network protocol. An internet
connection and access to Graal’s services are required. Your account’s normal
access and subscription requirements still apply.

## What it adds

- Opens straight into the client, filling the browser window without a splash screen.
- **F3** opens Options, **F7** toggles the player list, and **F8** opens the server list.
- Remembers primary movement/action bindings and supported volume/options changes.
- Optionally remembers a login **encrypted in your browser only**.
- An **Auto join Kingdoms** checkbox can submit your remembered login and select Kingdoms after reload.
- Caches public client assets locally to reduce repeat downloads.
- Shows a live count of browser profiles with the website open.

## Run locally with Node.js

You need Git, Node.js **22 or newer** (Node 24 is used by the Docker image), and
a desktop browser with WebGL 2 and Web Crypto support. Development is tested
with Chromium; other browsers have not received the same coverage.

Clone the repository, then start the web server:

```sh
git clone https://github.com/Ec1ipseCmd/graal-browser.git
cd graal-browser/browser
npm start
```

Open **http://localhost:4173** in your browser. Keep the terminal running while
you play; press **Ctrl+C** there to stop the server. The runtime has no npm
package dependencies, so `npm install` is not required just to start it.
On **Windows with WSL2**, run those commands inside WSL and open
`http://localhost:4173` in your Windows browser on the same PC. You can also run
Node directly on Windows, macOS, or Linux. Keep using the same address and browser
profile: `localhost`, `127.0.0.1`, another port, and a public domain have separate
browser storage.

The game starts loading automatically. The first launch downloads the official
Unity client and assets and can take longer than subsequent launches. Select
**Member** in Graal’s login screen, enter your account details, press **Start**,
and choose **Kingdoms** from the server list.

## Run locally with Docker

With Docker installed and running, use these commands from the repository root:

```sh
docker build -t graal-browser ./browser
docker run -d --name graal-browser --restart unless-stopped -p 127.0.0.1:4173:4173 -v graal-public-cache:/app/.cache graal-browser
```

Open **http://localhost:4173**. The container restarts with Docker; the named
volume keeps its public asset cache across container replacements. Remembered
logins and personal game settings stay in your browser, not this volume.

```sh
docker logs --tail 50 graal-browser
docker stop graal-browser
docker start graal-browser
```

For a domain and Cloudflare Tunnel, see [hosting instructions](deploy/README.md).
The repository’s Compose/tunnel configuration belongs to the existing deployment;
configure your own hostname and tunnel before using it elsewhere. A tunnel is
not needed for local use.

## Remembered logins and security

On Graal’s login screen, leave **Save password** checked and press **Start** to
remember your account/email, nickname, and password. Uncheck it and press
**Start** to forget the saved login. One login is remembered per browser profile
and website origin. Details are remembered when submitted, not only after a
successful login.

The browser encrypts the login using **AES-256-GCM**, a fresh random IV, and a
new 256-bit Web Crypto key on each save. IndexedDB stores the encrypted record
and a **non-extractable key** together. There is no plaintext password in this
feature’s localStorage, cookies, or saved record, and no plaintext fallback if
browser encryption/storage is unavailable.

Remembered logins remain inside the browser profile’s IndexedDB. The wrapper
does not send them to its Node service; Graal receives login data only when the
official client submits it for authentication over its secure WebSocket
connection.

The security boundary is the browser:

- A different browser, device, profile, or website origin cannot retrieve this browser’s remembered login by knowing the account name or email.
- Clearing site data removes the record and key. Private browsing or storage eviction can also discard them; the website cannot recover them.
- Someone using your unlocked browser profile may use the remembered login. This feature does not ask for a separate unlock password.
- Non-extractable means the key cannot be exported through Web Crypto. Scripts running on this website can still use it to decrypt. Malicious website code, a compromised browser, or a malicious extension can compromise a password. Encryption here is not protection against those threats.
- A password must briefly exist in memory to populate Graal’s login field and authenticate. The integration disables the supported client build’s duplicate native password-saving path and removes password entries from its configuration file.

Use HTTPS when hosting remotely. Local `http://localhost:4173` supports the
browser features used here; ordinary HTTP on a LAN address is not a substitute
for HTTPS. See the [Web Crypto key documentation](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/extractable)
for what non-extractable keys do and do not provide.

## How it works

1. Node serves the launcher and a same-origin wrapper around the official Graal web page.
2. The wrapper loads Unity/WebAssembly and runs the game **in the browser**. The Node server does not render or stream the game.
3. Public Unity files are fetched from Graal and cached by the local server. The browser connects directly to Graal’s game services using WSS.
4. Small JavaScript adapters restore browser settings, integrate remembered logins, and dispatch the supported window shortcuts and auto-join actions.
5. Sensitive native integrations run only when the framework and WebAssembly fingerprints match the verified build. An upstream update can disable those integrations until they are checked again.

| Data | Location and lifetime |
| --- | --- |
| Remembered login and encryption key | Browser IndexedDB; removed when forgotten or site data is cleared |
| Primary keys, supported options, auto-join preference | Browser localStorage; scoped to that browser and origin |
| Game files in Unity’s mounted filesystem | Browser IndexedDB; periodically flushed |
| Public Unity assets | `browser/.cache/public-assets/`, or the Docker cache volume; safe to download again |
| Live visitor count | Temporary server memory and an anonymous browser cookie; no account association |

The live count refreshes every 20 seconds, counts tabs in the same browser once,
and expires a browser after two minutes without a heartbeat. It counts open
website clients, including loading/idle clients, **not authenticated players or
Kingdoms’ total population**. It is not historical usage analytics.

## Settings and limitations

Change primary movement/action bindings in Graal’s blue **Options → Keys** window.
The left-hand/primary bindings are backed up; secondary/right-hand bindings are
not covered. Supported volume/options are also retained. **Reload** flushes
browser saves before restarting the client. **Full screen** uses the browser’s
fullscreen mode; otherwise the game fills the page beneath the header.

**Auto join Kingdoms** is off by default. Enable it and reload to use this
browser’s saved login and select `graal2002`. Without a saved login, sign in
manually first. It makes one login attempt and one server selection per load;
it does not retry failed passwords or reconnect after logout.

This remains an experimental integration with an externally maintained client.
Caching does not make Graal playable offline. Login and game-server availability
are controlled by Graal. Native features may stop working after an official
client update. Clearing browser data also clears saved preferences.

## Troubleshooting

- **The page will not open:** keep Node running, check its printed address, and make sure port 4173 is available. With Docker, check `docker logs graal-browser`.
- **It stalls during loading:** inspect the browser console/network panel for failed downloads or WebSocket connections. Run `npm run diagnose:connection` from `browser/` for endpoint diagnostics. A loaded page does not prove Graal’s connection service is reachable.
- **Login or settings are not remembered:** use the same browser profile and exact URL, allow site storage, and check Save password. An unsupported official client build can disable the native adapters.
- **High CPU use:** Unity runs on your browsing PC. Check browser graphics acceleration and avoid running multiple game tabs; restarting the Node server does not move rendering to the server.
- **A shortcut does nothing:** click inside the client after it finishes loading. Some keyboards require **Fn** with function keys. Check whether an official client update has disabled native integration.

## Development and project layout

- [`browser/`](browser/README.md): Node launcher, JavaScript integration, and tests.
- [`deploy/`](deploy/README.md): Docker/Cloudflare deployment notes.

For development, run `npm ci` inside `browser/`, then `npm test`. Browser tests
also require `npx playwright install chromium`; see the [developer guide](browser/README.md)
for the complete commands and optional live tests.

This project is not affiliated with or endorsed by GraalOnline or its owners.
GraalOnline’s client, trademarks, and assets belong to their respective owners.
