// Add to your page with <script src="/counter.js" defer></script>.
(() => {
  const DIRECT_COUNTER_URL = 'https://script.google.com/macros/s/AKfycbyDLrjiBOtzKYRDXPgv0ocFSoTcgqbfw7C4ejBtEiHyKUc4F2eBhs9uA6ydk0U7m6GC/exec';
  const key = 'bctc-counter-2026-v1';
  let last = null, busy = false;
  const $ = id => document.getElementById(id);
  if (!$('counter-total')) return;
  const count = n => Number.isSafeInteger(n) && n >= 0;
  function valid(d) {
    return d?.schemaVersion === 1 && d.campaignId === 'bctc-mccarren-2026'
      && Number.isFinite(Date.parse(d.generatedAt))
      && ['provisional', 'closed-provisional', 'final'].includes(d.status)
      && ['participants','supporters'].every(k => count(d.counts?.[k]))
      && d.counts.supporters <= d.counts.participants
      && ['residentsSelfReported','sportsVisitors','workStudy','otherVisitors','residenceNeedsReview'].every(k => count(d.counts?.[k]?.participants));
  }
  function render(d, failed = false) {
    const c = d.counts, fmt = n => n.toLocaleString();
    $('counter-total').textContent = fmt(c.participants);
    $('counter-supporters').textContent = fmt(c.supporters);
    $('counter-residents').textContent = fmt(c.residentsSelfReported.participants);
    $('counter-visitors').textContent = fmt(c.sportsVisitors.participants);
    $('counter-other').textContent = fmt(c.workStudy.participants + c.otherVisitors.participants + c.residenceNeedsReview.participants);
    const date = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(new Date(d.generatedAt));
    const old = Date.now() - Date.parse(d.generatedAt) > 15 * 60 * 1000;
    const label = d.status === 'final' ? 'Final results' : d.status === 'closed-provisional' ? 'Survey closed; review in progress' : 'Provisional count';
    $('counter-status').textContent = `${label}. Updated ${date}.${failed || (old && d.status !== 'final') ? ' Showing the last available count; updates are delayed.' : ''}`;
  }
  try {
    const cached = JSON.parse(localStorage.getItem(key));
    if (valid(cached)) { last = cached; render(cached, true); }
  } catch { /* Storage unavailable or malformed: continue without it. */ }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      // The Apps Script endpoint answers anonymous GETs with Access-Control-Allow-Origin: *, so the page can read it
      // directly from any host. The Netlify function is tried first when the site runs on Netlify (adds caching).
      const sources = [DIRECT_COUNTER_URL];
      if (location.hostname.endsWith('netlify.app') || location.hostname.endsWith('netlify.com')) sources.unshift('/.netlify/functions/counter');
      let d = null;
      for (const url of sources) {
        try {
          const r = await fetch(url, { credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(10000) });
          if (!r.ok) continue;
          d = await r.json(); break;
        } catch { /* try the next source */ }
      }
      if (!d) throw Error('Unavailable');
      if (!valid(d)) throw Error('Invalid counter');
      if (last && Date.parse(d.generatedAt) < Date.parse(last.generatedAt)) { render(last, true); return; }
      last = d; render(d);
      try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* Optional cache only. */ }
    } catch {
      if (last) render(last, true);
      else $('counter-status').textContent = 'The response count is temporarily unavailable. You can still take the survey.';
    } finally { busy = false; }
  }
  refresh();
  setInterval(refresh, 180000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
