// Checks the word filter, and that the page's copy of the initials lists matches the API's.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { INI_ANY, INI_EXACT, rudeInitials, rudeText } from '../netlify/lib/words.mjs';

const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const list = name => page.match(new RegExp(`const ${name} = '([A-Z ]+)'\\.split`))[1].split(' ');
assert.deepEqual(list('ANY'), INI_ANY, 'page ANY list matches the API');
assert.deepEqual(list('EXACT'), INI_EXACT, 'page EXACT list matches the API');

for (const s of 'BASS SHOE COKE TITO NIGH SKYS MASS PASS CUFF FTW NKM NIKM AB JMX GAFF'.split(' ')) assert.equal(rudeInitials(s), false, s);
for (const s of 'FUCK KCUF XFUK FVCK CUNT SHIT TIHS ASS TITS HOE SEX COCK DICK FAG NIGA KKK NAZI WTF STFU FU BJ SS CUM BUTT PISS'.split(' ')) assert.equal(rudeInitials(s), true, s);
for (const t of ['Hello! The class courts need nets.', 'Shell of a court, needs work', 'Sussex Ave courts', 'Niggling injury, looking for a light hit', 'Cocktail party after the round robin']) assert.equal(rudeText(t), false, t);
for (const t of ['this is bullshit', 'F*** this, fucking nets', 'what the hell', 'ass', 'damn courts']) assert.equal(rudeText(t), true, t);
console.log('word filter checks passed');
