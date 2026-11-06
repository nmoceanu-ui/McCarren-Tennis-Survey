// The board's rules, kept free of storage so they can be tested on their own.
import { HttpError } from './core.mjs';
import { rudeText } from './words.mjs';

export const DAY = 864e5;
export const NEEDS = ['lights', 'resurf', 'nets', 'drain', 'fence', 'booking', 'kids', 'other'];
export const PROBS = ['construction', 'nets', 'locked', 'flood', 'lightsout', 'closed', 'other'];
export const TYPES = ['request', 'report', 'hitter', 'event'];
export const PARTS = ['Morning', 'Afternoon', 'Evening', 'Any time'];
export const LEVELS = ['New to tennis', 'Beginner', 'Intermediate', 'Advanced', 'Any level'];
export const PLAY = ['Singles', 'Doubles', 'Just rallying', 'Any'];
export const WHO = ['Everyone', 'Kids and families', 'Beginners', 'Advanced players'];

const PHONE = /(\d[\s.()\-]*){10}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const LINK = /https?:\/\/|www\.|\.(com|net|org|io|co|ly|me|app|gg)\b/i;

const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '').slice(0, max);
const bad = msg => { throw new HttpError(400, msg); };

// Turns what the page sent into a stored post, or throws a message the page shows as is.
export function makePost(p, { id, now, today }) {
  if (!p || typeof p !== 'object') bad('Bad request.');
  const type = p.type;
  if (!TYPES.includes(type)) bad('Pick what you are posting.');
  const court = str(p.court, 80);
  if (!court) bad('Choose a court first.');
  const ci = Number.isInteger(p.ci) && p.ci >= -1 && p.ci < 300 ? p.ci : -1;
  const post = { id, type, court, ci, text: str(p.text, 280), name: str(p.name, 30), t: now, status: 'pending', v: [] };
  if (type === 'request') { if (!NEEDS.includes(p.need)) bad('Pick what the court needs.'); post.need = p.need; }
  if (type === 'report') { if (!PROBS.includes(p.prob)) bad("Pick what's wrong."); post.prob = p.prob; }
  if (type === 'hitter' || type === 'event') {
    if (typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) bad('Pick a day.');
    const max = new Date(Date.parse(today + 'T12:00:00Z') + 120 * DAY).toISOString().slice(0, 10);
    if (p.date < today || p.date > max) bad('Pick a day in the next four months.');
    if (p.adult !== true) bad('Hitter and event posts are for adults 18 and over.');
    if (!PARTS.includes(p.part)) bad('Pick a time of day.');
    post.date = p.date; post.part = p.part; post.contact = str(p.contact, 40);
  }
  if (type === 'hitter') {
    if (!LEVELS.includes(p.level) || !PLAY.includes(p.play)) bad('Pick your level and how you want to play.');
    post.level = p.level; post.play = p.play;
  }
  if (type === 'event') {
    post.title = str(p.title, 60);
    if (!post.title) bad('Give your event a name.');
    if (!WHO.includes(p.who)) bad("Pick who it's for.");
    post.who = p.who;
  }
  if (type === 'request' || type === 'report') {
    const email = str(p.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad("That email doesn't look right.");
    if (email) post.email = email;
  }
  const shown = [post.court, post.text, post.name, post.contact, post.title].filter(Boolean).join(' \n ');
  if (PHONE.test(shown)) bad('Please leave phone numbers off the board. A handle works.');
  if (EMAIL.test(shown)) bad('Please leave email addresses off the board. A handle works.');
  if (LINK.test(shown)) bad("Links can't go on the board.");
  if (rudeText(shown)) bad('Please keep it clean.');
  return post;
}

// Whether a post shows on the board right now.
export function isLive(p, now, today) {
  if (p.status !== 'live') return false;
  if (p.type === 'report') return !p.fixed && now - Math.max(p.t, p.last || 0) < 3 * DAY;
  if (p.type === 'hitter' || p.type === 'event') return !p.date || p.date >= today;
  return true;
}

// What anyone can see: no email, no vote list, no moderation fields.
export function publicPost(p) {
  const { email, v, status, by, fixedBy, approved, ...rest } = p;
  return { ...rest, n: (v || []).length };
}

// Keeps the document small: drops finished or removed posts after 60 days, and caps the total.
export function prune(posts, now, today) {
  const keep = posts.filter(p => p.status === 'pending' || isLive(p, now, today) || now - p.t < 60 * DAY);
  if (keep.length <= 600) return keep;
  const pending = keep.filter(p => p.status === 'pending');
  const rest = keep.filter(p => p.status !== 'pending').sort((a, b) => b.t - a.t).slice(0, Math.max(0, 600 - pending.length));
  return pending.concat(rest);
}
