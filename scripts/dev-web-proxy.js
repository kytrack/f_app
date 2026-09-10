/**
 * Dev-only reverse proxy for the web preview.
 * expo-sqlite on web needs SharedArrayBuffer, which browsers only enable when the
 * DOCUMENT is served with COOP/COEP headers. Metro's enhanceMiddleware covers bundles
 * but not the HTML served by expo-router's server middleware, so this proxy sits in
 * front of Metro (8081) on port 3000 and stamps the headers on every response.
 */
const http = require('node:http');
const net = require('node:net');

const UPSTREAM = { host: '127.0.0.1', port: Number(process.env.METRO_PORT ?? 8081) };
const PORT = Number(process.env.PORT ?? 3000);
const HEADERS = {
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const server = http.createServer((req, res) => {
  const up = http.request(
    { ...UPSTREAM, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${UPSTREAM.port}` } },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, { ...upRes.headers, ...HEADERS });
      upRes.pipe(res);
    },
  );
  up.on('error', (e) => {
    res.writeHead(502, HEADERS);
    res.end(`upstream error: ${e.message}`);
  });
  req.pipe(up);
});

// WebSocket upgrade (Metro HMR / dev tools): raw TCP pipe.
server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(UPSTREAM.port, UPSTREAM.host, () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(req.headers)) lines.push(`${k}: ${v}`);
    upstream.write(lines.join('\r\n') + '\r\n\r\n');
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, () => console.log(`web proxy http://localhost:${PORT} → metro :${UPSTREAM.port} (+COOP/COEP)`));
