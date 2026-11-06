// Private messages ("Message us"): rules kept free of storage so they can be tested on their own.
import { HttpError } from './core.mjs';

export const DAY = 864e5;
export const ABOUT = ['help', 'park', 'partner', 'other'];

const str = (v, max) => (typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim() : '').slice(0, max);
const bad = msg => { throw new HttpError(400, msg); };

export function makeMessage(m, { id, now }) {
  if (!m || typeof m !== 'object') bad('Bad request.');
  if (!ABOUT.includes(m.about)) bad("Pick what it's about.");
  const text = str(m.text, 1200);
  if (text.length < 2) bad('Write your message first.');
  const email = str(m.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad("That email doesn't look right.");
  const msg = { id, about: m.about, text, name: str(m.name, 40), t: now, done: false };
  if (email) msg.email = email;
  return msg;
}

// Keeps the inbox small: messages marked done are deleted (with any email in them) after 30 days;
// open messages stay until the moderator marks them done. Capped at 400.
export function pruneInbox(msgs, now) {
  const keep = (msgs || []).filter(m => !m.done || now - m.done < 30 * DAY);
  return keep.length <= 400 ? keep : keep.sort((a, b) => b.t - a.t).slice(0, 400);
}
