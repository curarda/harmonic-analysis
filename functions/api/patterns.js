// GET /api/patterns?token=…  — owner-only. Aggregates the whole collected corpus
// and reports which common structural options the catalogue has NOT used yet.
// Token is compared to env.ADMIN_TOKEN (server-side secret). Not shipped to the browser.

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
function safeEqual(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let o = 0; for (let i = 0; i < a.length; i++) o |= a.charCodeAt(i) ^ b.charCodeAt(i); return o === 0; }

const REF_FORMS = ['aaba', 'aabb', 'abab', 'abac', 'abcb', 'abba', 'abca', 'aaab', 'abcd'];
const REF_SHAPES = ['ascending', 'descending', 'arch', 'valley', 'wavy', 'flat'];
const REF_MODES = ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian'];
const REF_CADENCES = ['Authentic', 'Plagal', 'Deceptive', 'Half'];
const normForm = (f) => (f || '').toLowerCase().replace(/[^a-z]/g, ''); // "a b′ a c" -> "abac"

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'storage not configured' }, 503);
  if (!env.ADMIN_TOKEN) return json({ error: 'admin token not set' }, 503);
  const url = new URL(request.url);
  if (!safeEqual(url.searchParams.get('token') || '', env.ADMIN_TOKEN)) return new Response('unauthorized', { status: 401 });

  const { results } = await env.DB.prepare('SELECT payload FROM analyses ORDER BY created_at DESC LIMIT 5000').all();
  const rows = (results || []).map((r) => { try { return JSON.parse(r.payload); } catch { return null; } }).filter(Boolean);

  const usedForms = new Set(), usedModes = new Set(), usedCadences = new Set(), usedKeys = new Set();
  const shapeTotals = {}; let leapSum = 0, stepSum = 0, dirSum = 0, profN = 0, withStructure = 0;
  let loM = 127, hiM = 0, bpmMin = 999, bpmMax = 0; const meters = new Set();
  let consSum = 0, consN = 0; const songs = [];

  for (const p of rows) {
    // per-song chord-tone rate (% of melody notes that are a tone of the chord under them)
    const cons = p.vertical && typeof p.vertical.consonancePct === 'number' ? p.vertical.consonancePct : null;
    if (cons != null) { consSum += cons; consN++; }
    songs.push({
      name: p.melName || p.chdName || '(untitled)',
      ts: p.ts || null,
      key: (p.key && p.key.name) || null,
      form: (p.structure && p.structure.mForm) || null,
      chordTonePct: cons,
    });
    if (p.structure) {
      withStructure++;
      if (p.structure.mForm) usedForms.add(normForm(p.structure.mForm));
      const sh = p.structure.shapes || {}; for (const k in sh) shapeTotals[k] = (shapeTotals[k] || 0) + sh[k];
    }
    if (p.mode && p.mode.name) { const m = REF_MODES.find((x) => p.mode.name.includes(x)); if (m) usedModes.add(m); }
    if (p.key && p.key.name) usedKeys.add(p.key.name);
    (p.chords || []).forEach((c) => { if (c.cad) { const cd = REF_CADENCES.find((x) => c.cad.includes(x)); if (cd) usedCadences.add(cd); } });
    if (p.profile) { leapSum += p.profile.leapRatio || 0; stepSum += p.profile.stepRatio || 0; dirSum += p.profile.dirRate || 0; profN++; }
    if (p.energy) { if (p.energy.loM < loM) loM = p.energy.loM; if (p.energy.hiM > hiM) hiM = p.energy.hiM; }
    if (p.bpm) { bpmMin = Math.min(bpmMin, p.bpm); bpmMax = Math.max(bpmMax, p.bpm); }
    if (p.timeSigNum) meters.add(p.timeSigNum + '/' + p.timeSigDen);
  }

  const shapeTotalCount = Object.values(shapeTotals).reduce((a, b) => a + b, 0) || 1;
  const gaps = {
    forms: REF_FORMS.filter((f) => !usedForms.has(f)),
    shapes: REF_SHAPES.filter((s) => (shapeTotals[s] || 0) / shapeTotalCount < 0.05),
    modes: REF_MODES.filter((m) => !usedModes.has(m)),
    cadences: REF_CADENCES.filter((c) => !usedCadences.has(c)),
  };

  // human suggestions from the gaps + tendencies
  const S = [];
  const avgLeap = profN ? leapSum / profN : 0, avgStep = profN ? stepSum / profN : 0, avgDir = profN ? dirSum / profN : 0;
  gaps.shapes.forEach((s) => S.push(`You rarely write a **${s}** main phrase — try a song built on one.`));
  if (gaps.forms.length) S.push(`Forms you haven't used: ${gaps.forms.map((f) => f.toUpperCase()).join(', ')}. e.g. try an **${gaps.forms[0].toUpperCase()}** shape.`);
  gaps.modes.forEach((m) => S.push(`You haven't written in **${m}** yet.`));
  gaps.cadences.forEach((c) => S.push(`No **${c.toLowerCase()} cadence** in your catalogue yet.`));
  if (profN >= 2 && avgLeap < 0.12) S.push(`Your melodies are almost all stepwise (avg ${Math.round(avgLeap * 100)}% leaps) — try a leap-driven one.`);
  if (profN >= 2 && avgStep < 0.35) S.push(`You favour leaps over steps — try a smooth, mostly-stepwise line.`);
  if (profN >= 2 && avgDir < 0.25) S.push(`Your phrases tend to move in one direction — try one that zig-zags (more direction changes).`);
  if (meters.size === 1) S.push(`Everything is in ${[...meters][0]} — try a different metre (3/4, 6/8, 7/8).`);

  return json({
    count: rows.length,
    analysed_with_structure: withStructure,
    used: {
      forms: [...usedForms].map((f) => f.toUpperCase()),
      shapes: shapeTotals,
      modes: [...usedModes],
      cadences: [...usedCadences],
      keys: [...usedKeys],
      range: hiM >= loM ? { low: loM, high: hiM } : null,
      tempo: bpmMax ? { min: bpmMin, max: bpmMax } : null,
      metres: [...meters],
      avg: { leapRatio: +avgLeap.toFixed(3), stepRatio: +avgStep.toFixed(3), dirRate: +avgDir.toFixed(3) },
      avgChordTonePct: consN ? Math.round(consSum / consN) : null,
    },
    gaps,
    suggestions: S,
    songs, // per-song chord-tone % (newest first)
  });
}
