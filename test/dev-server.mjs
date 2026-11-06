// Local preview: serves public/ and runs the API functions against Netlify's local Blobs server.
// Run: MOD_KEY=some-password node test/dev-server.mjs [port]   then open http://localhost:8888
import { BlobsServer } from '@netlify/blobs/server';
import { setEnvironmentContext } from '@netlify/blobs';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';

// The local Blobs server's conditional writes are not atomic; one write at a time matches Netlify's behaviour.
const put = BlobsServer.prototype.put;
let chain = Promise.resolve();
BlobsServer.prototype.put = function (req) { const run = chain.then(() => put.call(this, req)); chain = run.catch(() => {}); return run; };

const blobs = new BlobsServer({ directory: mkdtempSync(join(tmpdir(), 'bc-dev-')), token: 'dev', port: 0 });
const { port: bport } = await blobs.start();
setEnvironmentContext({ siteID: 'dev', token: 'dev', edgeURL: `http://localhost:${bport}`, uncachedEdgeURL: `http://localhost:${bport}` });

const routes = {};
for (const name of ['board', 'checkins', 'rally', 'mod']) {
  const mod = await import(`../netlify/functions/${name}.mjs`);
  routes[mod.config.path] = mod.default;
}
const root = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.js': 'text/javascript' };
const port = +(process.argv[2] || 8888);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const fn = routes[url.pathname];
  if (fn) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
    const out = await fn(request, { ip: req.socket.remoteAddress });
    res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(await out.arrayBuffer()));
    return;
  }
  let p = join(root, decodeURIComponent(url.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p) && existsSync(p + '.html')) p += '.html';
  if (!p.startsWith(root) || !existsSync(p)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(port, () => console.log(`http://localhost:${port}`));
