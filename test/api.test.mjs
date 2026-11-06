// End-to-end test of the API functions against Netlify's local Blobs server (no network, no real data).
// Run: npm test
import { BlobsServer } from '@netlify/blobs/server';
import { setEnvironmentContext } from '@netlify/blobs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

// Netlify's real storage applies a conditional write atomically. The local test server checks the version tag
// and then writes in separate steps, so two writes can slip through together; one-at-a-time writes here
// match the real behaviour and let the "ten votes at once" check test our retry logic.
const put = BlobsServer.prototype.put;
let chain = Promise.resolve();
BlobsServer.prototype.put = function (req) { const run = chain.then(() => put.call(this, req)); chain = run.catch(() => {}); return run; };

const dir = mkdtempSync(join(tmpdir(), 'bc-blobs-'));
const server = new BlobsServer({ directory: dir, token: 'test-token', port: 0 });
const { port } = await server.start();
const url = `http://localhost:${port}`;
setEnvironmentContext({ siteID: 'test-site', token: 'test-token', edgeURL: url, uncachedEdgeURL: url });

const board = (await import('../netlify/functions/board.mjs')).default;
const checkins = (await import('../netlify/functions/checkins.mjs')).default;
const rally = (await import('../netlify/functions/rally.mjs')).default;
const mod = (await import('../netlify/functions/mod.mjs')).default;

const dev = n => n.toString(16).padStart(32, '0');
const call = async (fn, method, data, { ip = '1.1.1.1', key } = {}) => {
  const headers = { 'content-type': 'application/json', origin: 'https://example.netlify.app' };
  if (key) headers['x-mod-key'] = key;
  const req = new Request('https://example.netlify.app/api', { method, headers, body: method === 'POST' ? JSON.stringify(data) : undefined });
  const res = await fn(req, { ip });
  return { status: res.status, body: await res.json() };
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = n => new Date(Date.parse(today + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; console.log('ok', name); };

// board: posting waits for the moderator
let r = await call(board, 'GET');
ok('empty board', r.status === 200 && r.body.posts.length === 0);
r = await call(board, 'POST', { a: 'post', d: dev(1), p: { type: 'request', court: 'Cooper Park', ci: 1, need: 'resurf', text: 'Faded surface.', name: 'Ana', email: 'ana@example.com' } });
ok('request accepted', r.status === 200 && /^[0-9a-f]{12}$/.test(r.body.id));
const reqId = r.body.id;
r = await call(board, 'GET');
ok('pending post not public', r.body.posts.length === 0);

// moderator
r = await call(mod, 'GET');
ok('mod needs MOD_KEY set', r.status === 503);
process.env.MOD_KEY = 'test-moderator-pass';
r = await call(mod, 'GET', null, { key: 'wrong-password' });
ok('mod rejects wrong password', r.status === 401);
r = await call(mod, 'GET', null, { key: 'test-moderator-pass' });
ok('mod sees pending with email', r.status === 200 && r.body.pending.length === 1 && r.body.pending[0].email === 'ana@example.com');
r = await call(mod, 'POST', { a: 'approve', id: reqId }, { key: 'test-moderator-pass' });
ok('approve', r.status === 200);
r = await call(board, 'GET');
const pub = r.body.posts[0];
ok('approved post is public', r.body.posts.length === 1 && pub.court === 'Cooper Park');
ok('public post hides email, voters and author', !('email' in pub) && !('v' in pub) && !('by' in pub) && !('status' in pub) && pub.n === 0);

// votes, including ten at once from ten devices
r = await call(board, 'POST', { a: 'vote', d: dev(2), id: reqId });
ok('vote on', r.body.n === 1 && r.body.on === true);
r = await call(board, 'POST', { a: 'vote', d: dev(2), id: reqId });
ok('vote off', r.body.n === 0 && r.body.on === false);
// Like the page, try once more after a "busy" answer.
const vote = async i => { let x = await call(board, 'POST', { a: 'vote', d: dev(100 + i), id: reqId }, { ip: '9.9.9.' + i }); if (x.status === 503) x = await call(board, 'POST', { a: 'vote', d: dev(100 + i), id: reqId }, { ip: '9.9.9.' + i }); return x; };
const vres = await Promise.all(Array.from({ length: 10 }, (_, i) => vote(i)));
console.log(vres.map(x => x.status + ':' + (x.body.n ?? x.body.error)).join(' '));
r = await call(board, 'GET');
ok('ten simultaneous votes all count', r.body.posts[0].n === 10);

// what gets refused
const bad = async (p, msg) => { const x = await call(board, 'POST', { a: 'post', d: dev(3), p }, { ip: '2.2.2.2' }); ok(`refused: ${msg}`, x.status === 400 && x.body.error.includes(msg)); };
await bad({ type: 'request', court: 'Cooper Park', need: 'resurf', text: 'this is bullshit' }, 'keep it clean');
await bad({ type: 'request', court: 'Cooper Park', need: 'resurf', text: 'call me 718 555 1234' }, 'phone');
await bad({ type: 'request', court: 'Cooper Park', need: 'resurf', text: 'see www.spam.com' }, 'Links');
await bad({ type: 'hitter', court: 'Fort Greene Park', date: plus(2), part: 'Morning', level: 'Beginner', play: 'Singles' }, 'adults');
await bad({ type: 'hitter', court: 'Fort Greene Park', date: plus(-1), part: 'Morning', level: 'Beginner', play: 'Singles', adult: true }, 'next four months');
await bad({ type: 'event', court: 'Highland Park', date: plus(3), part: 'Morning', who: 'Everyone', adult: true, contact: 'me@mail.com', title: 'Round robin' }, 'email');
await bad({ type: 'request', court: '', need: 'resurf' }, 'court');
const shell = await call(board, 'POST', { a: 'post', d: dev(3), p: { type: 'request', court: 'Kelly Park Playground', need: 'nets', text: 'Hello! What the shell is going on with the nets at the class courts?' } }, { ip: '2.2.2.3' });
ok('innocent words with rude letters inside are fine (hello, shell, class)', shell.status === 200);

// hitter post goes up after approval, then report fixed
r = await call(board, 'POST', { a: 'post', d: dev(4), p: { type: 'hitter', court: 'Fort Greene Park', ci: 10, date: plus(2), part: 'Morning', level: 'Intermediate', play: 'Singles', adult: true, contact: '@hitter' } }, { ip: '3.3.3.3' });
ok('hitter accepted', r.status === 200);
const rep = await call(board, 'POST', { a: 'post', d: dev(4), p: { type: 'report', court: 'McCarren Park', ci: 0, prob: 'nets' } }, { ip: '3.3.3.3' });
await call(mod, 'POST', { a: 'approve', id: r.body.id }, { key: 'test-moderator-pass' });
await call(mod, 'POST', { a: 'approve', id: rep.body.id }, { key: 'test-moderator-pass' });
r = await call(board, 'GET');
ok('three posts live', r.body.posts.length === 3);
r = await call(board, 'POST', { a: 'fixed', d: dev(5), id: rep.body.id });
r = await call(board, 'GET');
ok('fixed report leaves the board', r.body.posts.length === 2 && !r.body.posts.some(p => p.type === 'report'));
r = await call(mod, 'POST', { a: 'remove', id: reqId }, { key: 'test-moderator-pass' });
r = await call(board, 'GET');
ok('moderator removes a post', r.body.posts.length === 1);

// rate limit: six posts an hour per visitor
let last;
for (let i = 0; i < 7; i++) last = await call(board, 'POST', { a: 'post', d: dev(6), p: { type: 'request', court: 'Linden Park', need: 'lights' } }, { ip: '4.4.4.4' });
ok('seventh post in an hour is refused', last.status === 429);

// check-ins
r = await call(checkins, 'POST', { d: dev(7), i: 0, free: 3, wait: 'some' });
ok('check in', r.status === 200);
r = await call(checkins, 'GET');
ok('check-in visible', r.body.checkins['0'].free === 3 && r.body.checkins['0'].wait === 'some');
r = await call(checkins, 'POST', { d: dev(7), i: 0, free: 99, wait: 'some' });
ok('silly check-in refused', r.status === 400);

// leaderboard
r = await call(rally, 'POST', { d: dev(8), ini: 'nkm', best: 12 });
ok('sign leaderboard', r.status === 200 && r.body.top[0].ini === 'NKM' && r.body.top[0].best === 12);
r = await call(rally, 'POST', { d: dev(9), ini: 'FUCK', best: 30 });
ok('rude initials refused', r.status === 400);
r = await call(rally, 'POST', { d: dev(9), ini: 'BASS', best: 30 });
ok('BASS allowed and ranks first', r.status === 200 && r.body.top[0].ini === 'BASS');
r = await call(rally, 'POST', { d: dev(8), ini: 'NKM', best: 5 });
ok('lower score keeps the best', r.body.top.find(x => x.ini === 'NKM').best === 12);
r = await call(rally, 'POST', { d: dev(8), ini: 'NKM', best: 40 });
ok('higher score moves up', r.body.top[0].ini === 'NKM' && r.body.top[0].best === 40);
r = await call(mod, 'GET', null, { key: 'test-moderator-pass' });
await call(mod, 'POST', { a: 'rally-remove', k: r.body.rally.find(x => x.ini === 'BASS').k }, { key: 'test-moderator-pass' });
r = await call(rally, 'GET');
ok('moderator removes a leaderboard row', r.body.top.length === 1);

// a sign-in whose Origin doesn't match the request host still works (it was refused on iPhone before)
const x = await rally(new Request('https://internal.example/api/rally', { method: 'POST', headers: { origin: 'https://brooklynchallenger.netlify.app', 'content-type': 'application/json' }, body: JSON.stringify({ d: dev(11), ini: 'NIKO', best: 7 }) }), { ip: '5.5.5.5' });
ok('leaderboard sign works whatever the Origin header says', x.status === 200);

await server.stop();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} checks passed`);
