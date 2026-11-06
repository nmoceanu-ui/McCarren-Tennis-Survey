// /api/mod — the moderator's view. Every call needs the moderator password (Netlify environment variable MOD_KEY)
// in the x-mod-key header.
//   GET  posts waiting, posts on the board, the leaderboard, private messages
//   POST {a:'approve'|'reject'|'remove'|'restore', id}   {a:'rally-remove', k}   {a:'msg-done'|'msg-open', id}
import { store, json, handle, body, update, read, checkModKey, sweepRateLimits, todayNY, HttpError } from '../lib/core.mjs';
import { isLive, publicPost } from '../lib/board.mjs';
import { pruneInbox } from '../lib/inbox.mjs';

export default handle(async req => {
  checkModKey(req);
  const st = store(), now = Date.now(), today = todayNY(now);
  if (req.method === 'GET') {
    const { posts } = await read(st, 'board', () => ({ posts: [] }));
    const { top } = await read(st, 'rally', () => ({ top: [] }));
    const { msgs } = await read(st, 'inbox', () => ({ msgs: [] }));
    sweepRateLimits(st).catch(() => {});
    const row = p => ({ ...publicPost(p), email: p.email || '', status: p.status, live: isLive(p, now, today) });
    return json({
      pending: posts.filter(p => p.status === 'pending').sort((a, b) => a.t - b.t).map(row),
      board: posts.filter(p => p.status === 'live' && isLive(p, now, today)).sort((a, b) => b.t - a.t).map(row),
      removed: posts.filter(p => p.status === 'removed' || p.status === 'rejected').sort((a, b) => b.t - a.t).slice(0, 30).map(row),
      rally: top.map(r => ({ k: r.k, ini: r.ini, best: r.best, t: r.t })),
      messages: pruneInbox(msgs, now).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.t - a.t).map(({ by, ...m }) => m),
      now
    });
  }
  const b = await body(req);
  if (b.a === 'rally-remove') {
    await update(st, 'rally', d => { d.top = d.top.filter(r => r.k !== b.k); }, () => ({ top: [] }));
    return json({ ok: true });
  }
  if (b.a === 'msg-done' || b.a === 'msg-open') {
    if (typeof b.id !== 'string') throw new HttpError(400, 'Bad request.');
    await update(st, 'inbox', d => {
      const m = d.msgs.find(x => x.id === b.id);
      if (!m) throw new HttpError(404, 'Message not found.');
      m.done = b.a === 'msg-done' ? now : false;
      d.msgs = pruneInbox(d.msgs, now);
    }, () => ({ msgs: [] }));
    return json({ ok: true });
  }
  const to = { approve: 'live', reject: 'rejected', remove: 'removed', restore: 'live' }[b.a];
  if (!to || typeof b.id !== 'string') throw new HttpError(400, 'Bad request.');
  await update(st, 'board', d => {
    const p = d.posts.find(x => x.id === b.id);
    if (!p) throw new HttpError(404, 'Post not found.');
    p.status = to;
    if (to === 'live' && !p.approved) { p.approved = now; if (p.type === 'report') p.last = now; }
  }, () => ({ posts: [] }));
  return json({ ok: true });
});

export const config = { path: '/api/mod' };
