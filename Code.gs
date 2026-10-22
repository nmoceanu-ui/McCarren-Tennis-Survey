/* BCTC aggregate counter. Google Apps Script V8. No respondent data is returned.
 * Configure exact Sheet column titles below. One earliest eligible response/email.
 * Email uniqueness and ZIP format are NOT identity or residence verification.
 */
const CFG = {
  sheet: 'Form Responses 1',
  campaignId: 'bctc-mccarren-2026',
  opens: '2026-10-24T00:00:00-04:00',
  closes: '2026-11-10T21:00:00-05:00',
  headers: {
    time: 'Timestamp', email: 'Email', zip: 'ZIP code where you live',
    connection: 'Your connection to North Brooklyn',
    opinion: 'Should NYC Parks include new public tennis courts in the lot design?',
    activities: 'What do you play?',
    // Add these two administrator-only columns to the response Sheet, not the Form.
    source: 'Collection mode', exclude: 'Exclude reason'
  },
  // Reporting filter only. This list does NOT define Community District 1.
  selectedZips: ['11211', '11222', '11249', '11206', '11237'],
  connections: ['I live here', 'I work or study here',
    'I come here to play tennis, pickleball or padel', 'I visit for other reasons'],
  opinions: ['Strongly support', 'Support', 'No opinion', 'Oppose', 'Strongly oppose']
};

function text_(v) { return String(v == null ? '' : v).trim(); }
function normalizeEmail_(v) { return text_(v).toLowerCase(); }

// Pure function, tested locally with synthetic records. All raw records remain private.
function aggregate_(values, now) {
  const headers = values[0].map(text_);
  const idx = {};
  Object.keys(CFG.headers).forEach(k => {
    const title = CFG.headers[k];
    if (headers.filter(h => h === title).length !== 1) {
      throw new Error('Missing or duplicate configured column: ' + title);
    }
    idx[k] = headers.indexOf(title);
  });
  const start = Date.parse(CFG.opens), end = Date.parse(CFG.closes);
  const earliest = new Map();
  let eligibleRows = 0, excluded = 0, invalid = 0, outOfWindow = 0;
  values.slice(1).forEach((r, index) => {
    if (r.every(v => text_(v) === '')) return;
    if (text_(r[idx.exclude])) { excluded++; return; }
    const t = r[idx.time] instanceof Date ? r[idx.time].getTime() : NaN;
    const email = normalizeEmail_(r[idx.email]);
    // Google Sheets may store a leading-zero ZIP as a number.
    const rawZip = r[idx.zip];
    const zip = typeof rawZip === 'number' && Number.isInteger(rawZip)
      ? String(rawZip).padStart(5, '0') : text_(rawZip);
    const connection = text_(r[idx.connection]);
    const opinion = text_(r[idx.opinion]);
    const source = text_(r[idx.source]).toLowerCase() || 'online';
    if (!Number.isFinite(t) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !/^\d{5}$/.test(zip) || !CFG.connections.includes(connection)
      || !CFG.opinions.includes(opinion) || !text_(r[idx.activities])
      || !['online', 'paper'].includes(source)) { invalid++; return; }
    if (t < start || t >= end || t > now.getTime()) { outOfWindow++; return; }
    eligibleRows++;
    const old = earliest.get(email);
    if (!old || t < old.t) earliest.set(email, { t, zip, connection, opinion, source, row: index + 2 });
  });
  const bucket = () => ({ participants: 0, supporters: 0 });
  const counts = {
    participants: 0, supporters: 0,
    residentsSelfReported: bucket(), sportsVisitors: bucket(),
    workStudy: bucket(), otherVisitors: bucket(), residenceNeedsReview: bucket(),
    // Overlapping marginal, not a sixth audience category.
    selectedZipParticipants: 0,
    modes: { online: bucket(), paper: bucket() },
    opinions: Object.fromEntries(CFG.opinions.map(x => [x, 0]))
  };
  earliest.forEach(r => {
    const support = r.opinion === 'Support' || r.opinion === 'Strongly support';
    const selectedZip = CFG.selectedZips.includes(r.zip);
    let key = 'otherVisitors';
    if (r.connection === CFG.connections[0]) key = selectedZip ? 'residentsSelfReported' : 'residenceNeedsReview';
    else if (r.connection === CFG.connections[1]) key = 'workStudy';
    else if (r.connection === CFG.connections[2]) key = 'sportsVisitors';
    counts.participants++;
    if (support) counts.supporters++;
    counts[key].participants++;
    counts.modes[r.source].participants++;
    if (support) { counts[key].supporters++; counts.modes[r.source].supporters++; }
    if (selectedZip) counts.selectedZipParticipants++;
    counts.opinions[r.opinion]++;
  });
  return {
    public: {
      schemaVersion: 1, campaignId: CFG.campaignId,
      generatedAt: now.toISOString(), closesAt: new Date(end).toISOString(),
      status: now.getTime() >= end ? 'closed-provisional' : 'provisional', counts
    },
    audit: { eligibleRows, duplicates: eligibleRows - earliest.size, excluded, invalid, outOfWindow }
  };
}

function rebuildCounter() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('FINALIZED') === 'true') return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const id = p.getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Set SPREADSHEET_ID in Script Properties.');
    const sheet = SpreadsheetApp.openById(id).getSheetByName(CFG.sheet);
    if (!sheet) throw new Error('Response sheet not found.');
    const result = aggregate_(sheet.getDataRange().getValues(), new Date());
    p.setProperty('PUBLIC_SNAPSHOT', JSON.stringify(result.public));
    p.setProperty('PRIVATE_AUDIT', JSON.stringify(result.audit));
  } finally { lock.releaseLock(); }
}

function doGet() {
  const json = PropertiesService.getScriptProperties().getProperty('PUBLIC_SNAPSHOT');
  return ContentService.createTextOutput(json || JSON.stringify({ error: 'not_ready' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function installCounterTrigger() {
  // Only removes this counter's triggers, never other project triggers.
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'rebuildCounter')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rebuildCounter').timeBased().everyMinutes(5).create();
  rebuildCounter();
}

// Run manually only after closure, reconciliation and export of the private audit.
function finalizeCounter() {
  if (Date.now() < Date.parse(CFG.closes)) throw new Error('Survey is still open.');
  rebuildCounter();
  const p = PropertiesService.getScriptProperties();
  const s = JSON.parse(p.getProperty('PUBLIC_SNAPSHOT'));
  s.status = 'final'; s.finalizedAt = new Date().toISOString();
  p.setProperty('PUBLIC_SNAPSHOT', JSON.stringify(s));
  p.setProperty('FINALIZED', 'true');
}
