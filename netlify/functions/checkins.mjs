// /api/checkins
//   GET  check-ins from the last hour, by court site number
//   POST {d, i, free, wait}  "I'm here: this many courts free, this many groups waiting"
import { store, json, handle, body, update, read, limit, deviceKey, HttpError } from '../lib/core.mjs';

const HOUR = 36e5;
const WAITS = ['none', 'some', 'lots'];
const fresh = (all, now) => Object.fromEntries(Object.entries(all).filter(([, c]) => now - c.t < HOUR));

export default handle(async (req, context) => {
  const st = store(), now = Date.now();
  if (req.method === 'GET') {
    return json({ checkins: fresh(await read(st, 'checkins', () => ({})), now), now },
      200, { 'netlify-cdn-cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' });
  }
  const b = await body(req);
  deviceKey(b.d);
  const { i, free, wait } = b;
  if (!Number.isInteger(i) || i < 0 || i >= 300 || !Number.isInteger(free) || free < 0 || free > 40 || !WAITS.includes(wait)) throw new HttpError(400, 'Bad request.');
  await limit(st, req, context, 'checkin', 20);
  const c = { free, wait, t: now };
  await update(st, 'checkins', d => { for (const k of Object.keys(d)) if (now - d[k].t >= HOUR) delete d[k]; d[i] = c; }, () => ({}));
  return json({ ok: true, checkin: c });
});

export const config = { path: '/api/checkins' };
