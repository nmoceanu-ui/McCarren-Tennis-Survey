// Same-origin aggregate proxy. No Sheets credentials or respondent records.
// NETLIFY ENVIRONMENT VARIABLE: COUNTER_UPSTREAM = Apps Script /exec URL.
const audiences = ['residentsSelfReported', 'sportsVisitors', 'workStudy', 'otherVisitors', 'residenceNeedsReview'];
const opinions = ['Strongly support', 'Support', 'No opinion', 'Oppose', 'Strongly oppose'];
const integer = n => Number.isSafeInteger(n) && n >= 0;
function bucket(v) {
  if (!v || !integer(v.participants) || !integer(v.supporters) || v.supporters > v.participants) throw Error('Bad bucket');
  return { participants: v.participants, supporters: v.supporters };
}
export function sanitize(d) {
  if (d?.schemaVersion !== 1 || d.campaignId !== 'bctc-mccarren-2026'
      || !['provisional', 'closed-provisional', 'final'].includes(d.status)
      || !Number.isFinite(Date.parse(d.generatedAt)) || !Number.isFinite(Date.parse(d.closesAt))) throw Error('Bad schema');
  const c = bucket(d.counts);
  for (const key of audiences) c[key] = bucket(d.counts[key]);
  if (audiences.reduce((n, k) => n + c[k].participants, 0) !== c.participants
    || audiences.reduce((n, k) => n + c[k].supporters, 0) !== c.supporters) throw Error('Bad audience totals');
  c.modes = { online: bucket(d.counts.modes?.online), paper: bucket(d.counts.modes?.paper) };
  if (c.modes.online.participants + c.modes.paper.participants !== c.participants
    || c.modes.online.supporters + c.modes.paper.supporters !== c.supporters) throw Error('Bad mode totals');
  c.opinions = {};
  for (const key of opinions) {
    if (!integer(d.counts.opinions?.[key])) throw Error('Bad opinion');
    c.opinions[key] = d.counts.opinions[key];
  }
  if (Object.values(c.opinions).reduce((a,b) => a+b, 0) !== c.participants
    || c.opinions.Support + c.opinions['Strongly support'] !== c.supporters) throw Error('Bad opinion totals');
  const z = d.counts.selectedZipParticipants;
  if (!integer(z) || z > c.participants) throw Error('Bad ZIP count');
  c.selectedZipParticipants = z;
  // Explicit allow-list: never forward arbitrary upstream properties.
  return { schemaVersion: 1, campaignId: d.campaignId, generatedAt: d.generatedAt,
    closesAt: d.closesAt, status: d.status, counts: c };
}
export default async function handler(request) {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  try {
    const url = new URL(process.env.COUNTER_UPSTREAM);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !url.pathname.endsWith('/exec')) throw Error('Bad upstream');
    const upstream = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) throw Error('Upstream unavailable');
    const d = sanitize(await upstream.json());
    return Response.json(d, { headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=120',
      'X-Content-Type-Options': 'nosniff'
    } });
  } catch {
    // Never return upstream error bodies, URLs, credentials or sheet details.
    return Response.json({ error: 'counter_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
