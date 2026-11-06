// Word filter shared by the API. The page carries the same lists (index.html, "word filter") so people get
// the message before they press Post; test/words.test.mjs checks the two copies match.

// Leaderboard initials (2 to 4 letters).
// ANY: the worst words, blocked anywhere in the letters; the four-letter ones also backwards (KCUF).
// EXACT: milder short words that hide inside normal ones (BASS, SHOE, COKE), blocked only as the whole entry.
export const INI_ANY = 'FUCK FUK FUC FCK FUQ FUX FVCK FCUK PHUK PHUC CUNT COCK DICK SHIT TWAT WANK SLUT WHOR JIZ FAG SPIC KIKE GOOK COON PUSY PSSY RTRD STFU GTFO WTF BICH BTCH BICT NIGA NIGG NIGR NGR NGGR KKK NAZI XXX'.split(' ');
export const INI_EXACT = 'FU FK BJ HJ SS SX KY ASS ASSS ASSH TIT TITS HOE HOES SEX SEXY SXY SEXX CUM CUMS JAP JAPS WOP WOPS DIK COK CNT SHT SLT KYS SMD DTF NIG NIGS NGA SUK SUCK PUSS POOP HELL DAMN CRAP BUTT BOOB ANAL ANUS ARSE HOMO RAPE TARD THOT MILF DILF PISS PORN PRN'.split(' ');

export function rudeInitials(s) {
  const r = [...s].reverse().join('');
  return INI_EXACT.includes(s) || INI_ANY.some(w => s.includes(w) || (w.length === 4 && r.includes(w)));
}

// Free text on the board (posts, names, handles). Checked word by word.
// STEMS: blocked anywhere inside a word (fucking, bullshit). WORDS: blocked only as a whole word.
export const TEXT_STEMS = 'fuck fuk shit cunt nigger nigga faggot bitch pussy twat wank whore slut retard motherf cocksuck dickhead asshole jizz douche'.split(' ');
export const TEXT_WORDS = 'ass asses arse dick dicks cock cocks fag fags coon coons spic spics gook gooks kike kikes chink chinks tit tits titty titties boob boobs cum porn rape raped rapist nazi nazis kkk hoe hoes damn crap piss pissed hell tard wtf stfu gtfo fu fk milf thot dildo sex sexy nude nudes xxx wop jap japs dyke tranny homo slag prick bastard skank hooker'.split(' ');

export function rudeText(s) {
  const words = String(s || '').toLowerCase().match(/[a-z]+/g) || [];
  return words.some(w => TEXT_WORDS.includes(w) || TEXT_STEMS.some(t => w.includes(t)));
}
