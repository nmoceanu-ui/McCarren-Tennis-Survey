// /api/message — private messages to Brooklyn Challenger ("Message us"). Only the moderator page shows them;
// nothing here is ever public.
//   POST {d, m: {about, text, name?, email?}}
import { store, json, handle, body, update, limit, deviceKey, HttpError } from '../lib/core.mjs';
import { makeMessage, pruneInbox } from '../lib/inbox.mjs';
import { randomBytes } from 'node:crypto';

export default handle(async (req, context) => {
  const b = await body(req);
  const k = deviceKey(b.d);
  const now = Date.now();
  const m = makeMessage(b.m, { id: randomBytes(6).toString('hex'), now });
  await limit(store(), req, context, 'msg', 5);
  m.by = k;
  await update(store(), 'inbox', d => { d.msgs = pruneInbox(d.msgs, now); d.msgs.push(m); }, () => ({ msgs: [] }));
  return json({ ok: true });
});

export const config = { path: '/api/message' };
