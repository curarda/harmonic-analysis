// GET /api/export?token=…  — owner-only export of collected analyses.
// The token is compared against env.ADMIN_TOKEN, a server-side secret that is NEVER
// shipped to the browser. Without the right token this returns 401.
//
//   ?format=json   (default) → JSON array, newest first
//   ?format=csv              → CSV of the summary columns (no raw note data)
//   ?limit=500               → cap rows (default 500, max 5000)
//   ?since=<ms epoch>        → only rows created at/after this timestamp

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

// constant-time-ish compare to avoid trivial timing leaks
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'storage not configured' }, 503);
  if (!env.ADMIN_TOKEN) return json({ error: 'admin token not set' }, 503);

  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!safeEqual(token, env.ADMIN_TOKEN)) return new Response('unauthorized', { status: 401 });

  const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get('limit') || 500)));
  const since = Number(url.searchParams.get('since') || 0);
  const format = (url.searchParams.get('format') || 'json').toLowerCase();

  const { results } = await env.DB.prepare(
    `SELECT id, created_at, mel_name, chd_name, key_name, mode_name, bars, bpm, chord_count, consonance, payload
     FROM analyses WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`
  ).bind(since, limit).all();

  if (format === 'csv') {
    const cols = ['id', 'created_at', 'mel_name', 'chd_name', 'key_name', 'mode_name', 'bars', 'bpm', 'chord_count', 'consonance'];
    const esc = (v) => {
      let x = v == null ? '' : String(v);
      // neutralize spreadsheet formula injection: filenames are attacker-controlled,
      // so a value like =SUM()/+/-/@ would execute when the owner opens the CSV in Excel.
      if (/^[=+\-@\t\r]/.test(x)) x = "'" + x;
      return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
    };
    const lines = [cols.join(',')].concat((results || []).map((r) => cols.map((c) => esc(r[c])).join(',')));
    return new Response(lines.join('\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="analyses.csv"' }
    });
  }

  // JSON: parse the stored payload back into an object
  const rows = (results || []).map((r) => ({ ...r, payload: safeParse(r.payload) }));
  return json({ count: rows.length, rows });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
