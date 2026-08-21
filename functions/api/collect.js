// POST /api/collect  — receives one analysis and stores it in D1.
// No secrets in this file. The database is a Cloudflare binding (env.DB) configured
// in the Pages project; nothing sensitive is ever sent to the browser.

const MAX_BYTES = 600_000;          // reject oversized payloads (~600 KB)

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

const s = (v) => (typeof v === 'string' ? v.slice(0, 300) : null);
const i = (v) => (Number.isFinite(v) ? Math.trunc(v) : null);

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return json({ error: 'storage not configured' }, 503);

    // same-origin guard: require an Origin header that matches our host.
    // Browsers always send Origin on POST; header-less bots/curl are rejected here.
    // (Not a substitute for a rate-limit rule against a determined attacker — see README.)
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    let originOk = false;
    try { originOk = !!origin && new URL(origin).host === host; } catch { originOk = false; }
    if (!originOk) return json({ error: 'bad origin' }, 403);

    // size guard (header first, then actual)
    const clen = Number(request.headers.get('content-length') || 0);
    if (clen > MAX_BYTES) return json({ error: 'too large' }, 413);
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: 'too large' }, 413);

    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
    if (!body || body.v !== 1 || !body.key || !body.key.name) return json({ error: 'bad payload' }, 400);

    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO analyses
        (id, created_at, mel_name, chd_name, key_name, mode_name, bars, bpm, chord_count, consonance, payload)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, now,
      s(body.melName), s(body.chdName),
      s(body.key.name), s(body.mode && body.mode.name),
      i(body.bars), i(body.bpm),
      i(body.chords && body.chords.length),
      i(body.vertical && body.vertical.consonancePct),
      text
    ).run();

    return json({ ok: true, id });
  } catch (e) {
    return json({ error: 'server error' }, 500);
  }
}
// (Non-POST methods automatically receive 405 — only onRequestPost is defined.)
