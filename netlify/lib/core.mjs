// Shared helpers for the API functions: storage (Netlify Blobs), JSON responses, rate limits, dates.
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const store = () => getStore({ name: 'bc', consistency: 'strong' });

export const sha = s => createHash('sha256').update(String(s)).digest('hex');

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

// Wraps a handler: known errors become { error } with their status; anything else is a plain 500.
export const handle = fn => async (req, context) => {
  try { return await fn(req, context); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong. Try again in a minute.' }, 500);
  }
};

// Reads a small JSON body from a same-site POST.
export async function body(req) {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(req.url).host) throw new HttpError(403, 'Not allowed.');
  const text = await req.text();
  if (text.length > 6000) throw new HttpError(413, 'That is too long.');
  try { const d = JSON.parse(text); if (d && typeof d === 'object') return d; } catch {}
  throw new HttpError(400, 'Bad request.');
}

// Read-modify-write on one JSON document, retried if someone else wrote it in between.
// fn changes `data` in place and returns whatever the caller needs back.
export async function update(st, key, fn, init) {
  for (let i = 0; i < 12; i++) {
    let cur = await st.getWithMetadata(key, { type: 'json' });
    if (cur && !cur.etag) {
      // Some servers leave the version tag off reads; take it from a listing first, then re-read the data,
      // so the data is never older than the tag (a write in between just makes the save below retry).
      const { blobs } = await st.list({ prefix: key });
      const etag = (blobs.find(b => b.key === key) || {}).etag;
      cur = await st.getWithMetadata(key, { type: 'json' });
      if (cur) cur.etag = etag;
      if (cur && !etag) throw new HttpError(503, 'Busy right now. Try again.');
    }
    const data = cur ? cur.data : init();
    const out = await fn(data);
    const res = cur ? await st.setJSON(key, data, { onlyIfMatch: cur.etag }) : await st.setJSON(key, data, { onlyIfNew: true });
    if (!res || res.modified !== false) return out;
    await new Promise(r => setTimeout(r, Math.random() * Math.min(1200, 60 * 2 ** i)));
  }
  throw new HttpError(503, 'Busy right now. Try again.');
}

export async function read(st, key, init) {
  const d = await st.get(key, { type: 'json' });
  return d ?? init();
}

// Per-visitor limit per hour. The IP is only ever stored as a salted hash, in a tiny document per visitor per hour
// that the moderator page sweeps away after two hours.
export async function limit(st, req, context, kind, max) {
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const hour = Math.floor(Date.now() / 36e5);
  const h = sha(`bc-rate|${kind}|${ip}`).slice(0, 16);
  const n = await update(st, `rl/${hour}/${kind}/${h}`, d => (d.n = (d.n || 0) + 1), () => ({}));
  if (n > max) throw new HttpError(429, 'Too many tries. Try again later.');
}

export async function sweepRateLimits(st) {
  const hour = Math.floor(Date.now() / 36e5);
  const { blobs } = await st.list({ prefix: 'rl/' });
  await Promise.all(blobs.filter(b => +b.key.split('/')[1] < hour - 1).map(b => st.delete(b.key)));
}

// A visitor's device id (32 hex, made by the page) is only stored as a hash.
export function deviceKey(d) {
  if (typeof d !== 'string' || !/^[0-9a-f]{32}$/.test(d)) throw new HttpError(400, 'Bad request.');
  return sha('bc|' + d).slice(0, 16);
}

// Today's date in New York, as YYYY-MM-DD.
export const todayNY = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

export function checkModKey(req) {
  const key = (globalThis.Netlify ? Netlify.env.get('MOD_KEY') : process.env.MOD_KEY) || '';
  if (key.length < 8) throw new HttpError(503, 'The moderator password is not set up yet.');
  const given = req.headers.get('x-mod-key') || '';
  const a = createHash('sha256').update(given).digest(), b = createHash('sha256').update(key).digest();
  if (!timingSafeEqual(a, b)) throw new HttpError(401, 'Wrong password.');
}
