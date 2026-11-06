// /api/rally — the small "Top rallies" leaderboard under the hero game.
//   GET  the top five
//   POST {d, ini, best}  sign a rally; each device keeps one row, its best
import { store, json, handle, body, update, read, limit, deviceKey, HttpError } from '../lib/core.mjs';
import { rudeInitials } from '../lib/words.mjs';

const init = () => ({ top: [] });
const ok = r => /^[A-Z]{2,4}$/.test(r.ini) && !rudeInitials(r.ini) && Number.isInteger(r.best) && r.best > 0 && r.best < 1000;
const top5 = top => top.filter(ok).slice(0, 5).map(r => ({ k: r.k.slice(0, 12), ini: r.ini, best: r.best }));

export default handle(async (req, context) => {
  const st = store();
  if (req.method === 'GET') {
    return json({ top: top5((await read(st, 'rally', init)).top) }, 200,
      { 'netlify-cdn-cache-control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=20' });
  }
  const b = await body(req);
  const k = deviceKey(b.d);
  const ini = typeof b.ini === 'string' ? b.ini.toUpperCase() : '';
  const best = b.best;
  if (!/^[A-Z]{2,4}$/.test(ini)) throw new HttpError(400, 'Two to four letters.');
  if (rudeInitials(ini)) throw new HttpError(400, 'Those letters aren’t allowed. Try others.');
  if (!Number.isInteger(best) || best < 1 || best > 999) throw new HttpError(400, 'Bad request.');
  await limit(st, req, context, 'rally', 30);
  const out = await update(st, 'rally', d => {
    const mine = d.top.find(r => r.k === k);
    if (mine) { if (best > mine.best) { mine.best = best; mine.t = Date.now(); } mine.ini = ini; }
    else d.top.push({ k, ini, best, t: Date.now() });
    d.top.sort((a, b) => b.best - a.best || a.t - b.t);
    d.top = d.top.slice(0, 50);
    return top5(d.top);
  }, init);
  return json({ ok: true, top: out });
});

export const config = { path: '/api/rally' };
