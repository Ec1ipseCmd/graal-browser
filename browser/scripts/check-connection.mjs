import tls from 'node:tls';

// Check the exact two secure gateways used by this Unity build. This sends no
// account details or game packets, and deliberately keeps certificate validation.
const targets = [
  { name: 'startup', host: 'orproxy.graalonline.com', port: 1259 },
  { name: 'login', host: 'orproxy.graalonline.com', port: 1253 },
  { name: 'website control', host: 'worldsplay.graalonline.com', port: 443 },
];
const results = await Promise.all(targets.map(target => new Promise(resolve => {
  const start = Date.now();
  let finished = false;
  const socket = tls.connect({ host: target.host, port: target.port, servername: target.host });
  const finish = (ok, reason) => {
    if (finished) return;
    finished = true;
    socket.destroy();
    resolve({ ...target, ok, reason, milliseconds: Date.now() - start });
  };
  socket.once('secureConnect', () => finish(true, 'TLS connection established'));
  socket.once('error', error => finish(false, error.code || error.message));
  socket.once('close', () => finish(false, 'Connection closed before TLS completed'));
  socket.setTimeout(8000, () => finish(false, 'Connection timed out'));
})));
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
process.exitCode = results.every(result => result.ok) ? 0 : 1;
