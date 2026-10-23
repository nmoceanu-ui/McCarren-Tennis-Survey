import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { sanitize } from './netlify/functions/counter.mjs';
const context = vm.createContext({ Date, Map, console });
vm.runInContext(fs.readFileSync(new URL('./Code.gs', import.meta.url), 'utf8') + '\nglobalThis.testConfig = CFG;', context);
const h = [...Object.values(context.testConfig.headers), context.testConfig.youthHeader];
const row = (email, zip, connection, opinion, source='', exclude='', time='2026-10-25T12:00:00-04:00', youth='') =>
  [new Date(time), email, zip, connection, opinion, 'Tennis', source, exclude, youth];
const rows = [h,
  row(' A@Example.com ', '11211', 'I live here', 'Support'),
  row('a@example.com', '11211', 'I live here', 'Oppose', '', '', '2026-10-26T12:00:00-04:00'),
  row('visitor@example.com', '10001', 'I come here to play tennis, pickleball or padel', 'Strongly support', '', '', '2026-10-25T12:00:00-04:00', 'Yes'),
  row('partial@example.com', '11206', 'I live here', 'No opinion', 'paper'),
  row('outside@example.com', '10001', 'I live here', 'Oppose'),
  row('worker@example.com', '11222', 'I work or study here', 'Strongly oppose', '', '', '2026-10-25T12:00:00-04:00', 'Not sure'),
  row('other@example.com', 2138, 'I visit for other reasons', 'Support', '', '', '2026-10-25T12:00:00-04:00', 'Yes'),
  row('queens@example.com', '11375', 'None of these', 'Support', '', '', '2026-10-25T12:00:00-04:00', 'No'),
  row('bad-email', '11211', 'I live here', 'Support'),
  row('excluded@example.com', '11211', 'I live here', 'Support', '', 'test entry'),
  row('late@example.com', '11211', 'I live here', 'Support', '', '', '2026-11-10T21:00:00-05:00'),
  row('future@example.com', '11211', 'I live here', 'Support', '', '', '2026-11-09T12:00:00-05:00')
];
const r = context.aggregate_(rows, new Date('2026-10-30T12:00:00-04:00'));
assert.equal(r.public.counts.participants, 7);
assert.equal(r.public.counts.otherVisitors.participants, 2);   // 'None of these' joins other participants
assert.equal(r.public.counts.supporters, 4);
assert.equal(r.public.counts.residentsSelfReported.participants, 2);
assert.equal(r.public.counts.sportsVisitors.participants, 1);
assert.equal(r.public.counts.residenceNeedsReview.participants, 1);
assert.equal(r.public.counts.selectedZipParticipants, 3);
assert.equal(r.public.counts.modes.paper.participants, 1);
assert.equal(r.audit.duplicates, 1);
assert.deepEqual({ ...r.public.counts.youth }, { yes: 2, no: 1, notSure: 1 });
const noYouthCol = context.aggregate_(rows.map(x => x.slice(0, -1)), new Date('2026-10-30T12:00:00-04:00'));
assert.equal(noYouthCol.public.counts.participants, 7);   // the optional column may be absent
assert.equal(noYouthCol.public.counts.youth.yes, 0);
assert.equal(r.audit.invalid, 1);
assert.equal(r.audit.excluded, 1);
assert.equal(r.audit.outOfWindow, 2);
assert(!JSON.stringify(r.public).includes('@'));
const out = sanitize({ ...r.public, email: 'do-not-forward@example.com' });
assert(!('email' in out));
assert.deepEqual(out.counts.youth, { yes: 2, no: 1, notSure: 1 });
assert.throws(() => sanitize({ ...r.public, counts: { ...r.public.counts, youth: { yes: 99, no: 0, notSure: 0 } } }));
const { youth, ...noYouth } = r.public.counts; assert(!('youth' in sanitize({ ...r.public, counts: noYouth }).counts));
assert.throws(() => sanitize({ ...r.public, counts: { ...r.public.counts, participants: 999 } }));
assert.throws(() => context.aggregate_([['wrong headers']], new Date()));
const closed = context.aggregate_(rows, new Date('2026-11-11T12:00:00-05:00'));
assert.equal(closed.public.status, 'closed-provisional');
assert.equal(closed.public.counts.participants, 8); // Nov 9 row now eligible; closing-time row remains excluded.
console.log('PASS: youth tally (optional column), deduplication, earliest-response policy, support denominator, audience partition, ZIP filter, paper mode, invalid/excluded/future/late entries, privacy allow-list, schema failure, closure.');
