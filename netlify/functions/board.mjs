// /api/board
//   GET  the posts that are on the board now (approved, not expired)
//   POST {a:'post', d, p}   send a post; it waits for the moderator
//        {a:'vote', d, id}  Me too / Still true / I'm in (tap again to undo)
//        {a:'fixed', d, id} a reported problem is fixed
import { store, json, handle, body, update, read, limit, deviceKey, todayNY, HttpError } from '../lib/core.mjs';
import { makePost, isLive, publicPost, prune } from '../lib/board.mjs';
import { randomBytes } from 'node:crypto';

const init = () => ({ posts: [] });

export default handle(async (req, context) => {
  const st = store(), now = Date.now(), today = todayNY(now);
  if (req.method === 'GET') {
    const { posts } = await read(st, 'board', init);
    return json({ posts: posts.filter(p => isLive(p, now, today)).map(publicPost), now },
      200, { 'netlify-cdn-cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' });
  }
  const b = await body(req);
  const k = deviceKey(b.d);
  if (b.a === 'post') {
    const post = makePost(b.p, { id: randomBytes(6).toString('hex'), now, today });
    await limit(st, req, context, 'post', 6);
    post.by = k;
    await update(st, 'board', d => { d.posts = prune(d.posts, now, today); d.posts.push(post); }, init);
    return json({ ok: true, id: post.id });
  }
  if (b.a === 'vote' || b.a === 'fixed') {
    await limit(st, req, context, 'vote', 150);
    if (typeof b.id !== 'string' || !/^[0-9a-f]{12}$/.test(b.id)) throw new HttpError(400, 'Bad request.');
    const out = await update(st, 'board', d => {
      const p = d.posts.find(x => x.id === b.id);
      if (!p || !isLive(p, now, today)) throw new HttpError(404, 'That post is no longer on the board.');
      if (b.a === 'fixed') {
        if (p.type !== 'report') throw new HttpError(400, 'Bad request.');
        p.fixed = now; p.fixedBy = k;
        return { ok: true };
      }
      if (p.type === 'hitter') throw new HttpError(400, 'Bad request.');
      const i = p.v.indexOf(k);
      if (i >= 0) p.v.splice(i, 1);
      else { p.v.push(k); if (p.type === 'report') p.last = now; }
      return { ok: true, n: p.v.length, on: i < 0 };
    }, init);
    return json(out);
  }
  throw new HttpError(400, 'Bad request.');
});

export const config = { path: '/api/board' };
