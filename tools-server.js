'use strict';
// WhatsApp menu tools (see wa-tools.js):
//   svcStatus  - live status of every service the website uses (main admin only)
//   workGet / workSave - "Work record" list, kept per user in the Google Sheet (same way as the Websites tab)
module.exports = function ({ env, warn, withWb, WA, TG, drvAccess, sheetInfo }) {
  const P = () => globalThis.PropertiesService.getScriptProperties();
  const ACTIONS = new Set(['svcStatus', 'workGet', 'workSave']);
  const fail = (m, c) => globalThis.fail_(m, c);
  const has = k => !!String(env[k] || '').trim();

  /* ---------- service status ---------- */
  const timed = async fn => {
    const t0 = Date.now();
    try { const r = await fn(); return Object.assign({ ms: Date.now() - t0 }, r); }
    catch (e) { return { ok: false, ms: Date.now() - t0, err: (e && e.name === 'TimeoutError') ? 'Timed out' : String((e && e.message) || e).slice(0, 160) }; }
  };
  const httpOk = r => { if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 429 ? ' (rate-limited)' : '')); return r; };
  const sig = () => AbortSignal.timeout(6000);
  const UA = { 'User-Agent': 'Mozilla/5.0' };

  // Translation: one tiny test text through every translate address the chat uses
  const TR_PROBES = [
    ['Google (gtx)', async () => { const j = await (httpOk(await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl=hi&q=Hello', { headers: UA, signal: sig() }))).json(); return (Array.isArray(j[0]) ? j[0] : []).map(x => (x && x[0]) || '').join(''); }],
    ['Google (back-up)', async () => { const j = await (httpOk(await fetch('https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=hi&q=Hello', { headers: UA, signal: sig() }))).json(); if (j && Array.isArray(j.sentences)) return j.sentences.map(x => (x && x.trans) || '').join(''); if (Array.isArray(j)) { const f = Array.isArray(j[0]) ? j[0][0] : j[0]; if (typeof f === 'string') return f; } return ''; }],
    ['MyMemory', async () => { const j = await (httpOk(await fetch('https://api.mymemory.translated.net/get?q=Hello&langpair=Autodetect|hi', { signal: sig() }))).json(); const v = j && j.responseData && j.responseData.translatedText; if (!v || Number(j.responseStatus) !== 200 || /MYMEMORY WARNING|INVALID/i.test(v)) throw new Error('refused'); return String(v); }],
    ['Lingva', async () => { const j = await (httpOk(await fetch('https://lingva.ml/api/v1/auto/hi/Hello', { signal: sig() }))).json(); return j && typeof j.translation === 'string' ? j.translation : ''; }]
  ];
  if (has('GOOGLE_TRANSLATE_KEY')) TR_PROBES.unshift(['Google Cloud API', async () => { const j = await (httpOk(await fetch('https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(env.GOOGLE_TRANSLATE_KEY), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'Hello', target: 'hi', format: 'text' }), signal: sig() }))).json(); const v = j && j.data && j.data.translations && j.data.translations[0]; return v ? String(v.translatedText || '') : ''; }]);
  let trLast = { at: 0, items: null };
  async function translation(force) {
    const age = Date.now() - trLast.at;
    if (trLast.items && age < (force ? 20000 : 120000)) return trLast.items;     // Google blocks bursts, so the test runs at most every 2 min (every 20 s on Refresh)
    const items = await Promise.all(TR_PROBES.map(async ([name, fn]) => {
      const r = await timed(async () => { const v = await fn(); if (!v || !String(v).trim()) throw new Error('empty answer'); return { ok: true }; });
      return { name, state: r.ok ? 'up' : 'down', label: r.ok ? 'Working' : 'Failed', ms: r.ms, detail: r.ok ? '' : r.err };
    }));
    trLast = { at: Date.now(), items };
    return items;
  }

  const mk = (id, icon, name, state, label, detail, extra) => Object.assign({ id, icon, name, state, label, detail: detail || '' }, extra || {});
  const dur = s => { s = Math.round(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + 'd ' : '') + (h || d ? h + 'h ' : '') + m + 'm'; };

  async function status(req) {
    const conf = !!(has('CAL_CLIENT_ID') && has('CAL_CLIENT_SECRET'));
    const checks = await Promise.all([
      (async () => {                                                                                  // this server
        const mu = process.memoryUsage();
        return mk('server', '🖥️', 'Server (Render)', 'up', 'Running', 'Up ' + dur(process.uptime()) + ' · Node ' + process.version + ' · RAM ' + Math.round(mu.rss / 1048576) + ' MB');
      })(),
      (async () => {                                                                                  // Google Sheet = database
        let at = 0; try { at = Number((sheetInfo() || {}).loadedAt) || 0; } catch (e) { /* ignore */ }
        return at ? mk('sheets', '📗', 'Google Sheets (database)', 'up', 'Working', 'Data loaded ' + dur((Date.now() - at) / 1000) + ' ago')
          : mk('sheets', '📗', 'Google Sheets (database)', 'warn', 'Not loaded yet', 'The server has not read the sheet since it started.');
      })(),
      (async () => {                                                                                  // translation
        const items = await translation(!!req.force), ok = items.filter(x => x.state === 'up').length;
        const st = ok === items.length ? 'up' : ok ? 'warn' : 'down';
        return mk('translate', '🌐', 'Translation', st, ok === items.length ? 'Working' : ok ? 'Partly working' : 'Not working',
          ok + ' of ' + items.length + ' translate addresses answer' + (ok ? '' : ' — chat translate will fail'), { sub: items });
      })(),
      (async () => {                                                                                  // Google Drive link
        if (!conf) return mk('drive', '☁️', 'Google Drive (chat media)', 'off', 'Not set up', 'CAL_CLIENT_ID / CAL_CLIENT_SECRET are missing on the server.');
        let meta = null; try { meta = globalThis.drvMeta_ && globalThis.drvMeta_(); } catch (e) { /* ignore */ }
        if (!meta) return mk('drive', '☁️', 'Google Drive (chat media)', 'down', 'Link not connected', 'Settings → Google Drive → Connect. Chat photos / videos cannot be sent until then.');
        const r = await timed(async () => { await drvAccess(); return { ok: true }; });
        return r.ok ? mk('drive', '☁️', 'Google Drive (chat media)', 'up', 'Linked', (meta.email || 'Drive linked') + ' · login OK', { ms: r.ms })
          : mk('drive', '☁️', 'Google Drive (chat media)', 'down', 'Link broken', r.err + ' — reconnect Drive in Settings.', { ms: r.ms });
      })(),
      (async () => {                                                                                  // WhatsApp (this admin's own linked account)
        try {
          const r = await WA.route({ action: 'waStatus', token: req.token });
          if (r.configured === false) return mk('wa', '🟢', 'WhatsApp', 'off', 'Not set up', r.error || 'WhatsApp package is missing on the server.');
          if (r.connected) return mk('wa', '🟢', 'WhatsApp', 'up', 'Connected', [r.name, r.number].filter(Boolean).join(' · ') || 'Linked device is online');
          if (r.status === 'qr') return mk('wa', '🟢', 'WhatsApp', 'warn', 'Waiting for QR scan', 'Open WhatsApp and scan the QR code.');
          if (r.status === 'starting') return mk('wa', '🟢', 'WhatsApp', 'warn', 'Connecting…', 'The server is opening the WhatsApp connection.');
          return mk('wa', '🟢', 'WhatsApp', 'down', 'Not connected', r.error || 'Open WhatsApp and link your phone with the QR code.');
        } catch (e) { return mk('wa', '🟢', 'WhatsApp', 'down', 'Check failed', String((e && e.message) || e).slice(0, 160)); }
      })(),
      (async () => {                                                                                  // Telegram
        try {
          const r = await TG.route({ action: 'tgStatus', token: req.token });
          if (!r.configured) return mk('tg', '✈️', 'Telegram', 'off', 'Not set up', 'TG_API_ID / TG_API_HASH are missing on the server.');
          return r.connected ? mk('tg', '✈️', 'Telegram', 'up', 'Connected', [r.name, r.username && '@' + r.username].filter(Boolean).join(' · ') || 'Logged in')
            : mk('tg', '✈️', 'Telegram', 'down', 'Not connected', 'Open the Telegram tab and sign in.');
        } catch (e) { return mk('tg', '✈️', 'Telegram', 'down', 'Check failed', String((e && e.message) || e).slice(0, 160)); }
      })(),
      (async () => {                                                                                  // GitHub (Deploy / Updates / APK build) - live test
        if (!(has('GITHUB_REPO') && has('GITHUB_TOKEN'))) return mk('github', '🐙', 'GitHub (Deploy / APK build)', 'off', 'Not set up', 'GITHUB_REPO / GITHUB_TOKEN are missing on the server.');
        const r = await timed(async () => {
          const x = await fetch('https://api.github.com/repos/' + String(env.GITHUB_REPO).trim(), { headers: { Authorization: 'Bearer ' + String(env.GITHUB_TOKEN).trim(), Accept: 'application/vnd.github+json', 'User-Agent': 'ks-status' }, signal: sig() });
          if (x.status === 401) throw new Error('Token rejected (401)');
          if (x.status === 404) throw new Error('Repository not found or no access (404)');
          if (!x.ok) throw new Error('HTTP ' + x.status);
          return { ok: true };
        });
        return r.ok ? mk('github', '🐙', 'GitHub (Deploy / APK build)', 'up', 'Working', String(env.GITHUB_REPO).trim(), { ms: r.ms }) : mk('github', '🐙', 'GitHub (Deploy / APK build)', 'down', 'Not working', r.err, { ms: r.ms });
      })(),
      (async () => mk('cal', '📅', 'Google Calendar', conf && has('PUBLIC_URL') ? 'up' : 'off', conf && has('PUBLIC_URL') ? 'Set up' : 'Not set up', conf && has('PUBLIC_URL') ? 'Server settings found (each user links their own calendar).' : 'CAL_CLIENT_ID / CAL_CLIENT_SECRET / PUBLIC_URL are missing.'))(),
      (async () => mk('mail', '✉️', 'E-mail (Gmail SMTP)', has('SMTP_USER') && has('SMTP_PASS') ? 'up' : 'off', has('SMTP_USER') && has('SMTP_PASS') ? 'Set up' : 'Not set up', has('SMTP_USER') && has('SMTP_PASS') ? String(env.SMTP_USER).trim() : 'SMTP_USER / SMTP_PASS are missing.'))(),
      (async () => {
        let ok = false; if (has('FCM_SERVICE_ACCOUNT')) { try { const j = JSON.parse(String(env.FCM_SERVICE_ACCOUNT).trim()); ok = !!(j && j.client_email && j.private_key); } catch (e) { ok = false; } }
        return has('FCM_SERVICE_ACCOUNT') ? (ok ? mk('push', '🔔', 'Phone notifications (FCM)', 'up', 'Set up', 'Firebase key found.') : mk('push', '🔔', 'Phone notifications (FCM)', 'down', 'Key is invalid', 'FCM_SERVICE_ACCOUNT is not valid Firebase JSON.'))
          : mk('push', '🔔', 'Phone notifications (FCM)', 'off', 'Not set up', 'FCM_SERVICE_ACCOUNT is missing.');
      })(),
      (async () => { const on = !!(has('ICE_SERVERS') || (has('METERED_APP') && has('METERED_API_KEY'))); return mk('turn', '📞', 'Call relay (TURN)', on ? 'up' : 'off', on ? 'Set up' : 'Not set up', on ? 'Voice / video calls can pass through firewalls.' : 'Calls may fail on some networks (ICE_SERVERS or METERED_* missing).'); })()
    ]);
    const sum = { up: 0, warn: 0, down: 0, off: 0 }; checks.forEach(c => { sum[c.state] = (sum[c.state] || 0) + 1; });
    return { ok: true, at: Date.now(), items: checks, sum };
  }

  /* ---------- Work record (per user) ---------- */
  const keyOf = uid => 'WORKREC_' + uid;
  const read = uid => { try { const a = JSON.parse(P().getProperty(keyOf(uid)) || 'null'); return a && Array.isArray(a.list) ? a : { list: [], at: 0 }; } catch (e) { return { list: [], at: 0 }; } };
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = list => (Array.isArray(list) ? list : []).slice(0, 500).map(x => ({
    id: String((x && x.id) || '').replace(/[^\w-]/g, '').slice(0, 24) || rid(),
    title: String((x && x.title) || '').trim().slice(0, 120),
    note: String((x && x.note) || '').slice(0, 600),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String((x && x.date) || '')) ? x.date : '',
    done: !!(x && x.done),
    at: Number(x && x.at) || 0
  })).filter(x => x.title);

  async function route(req) {
    const uid = globalThis.checkToken_(req.token);
    if (!uid) fail('Session expired. Please log in again.', 'AUTH');
    if (req.action === 'svcStatus') {
      if (uid !== 'ADMIN') fail('Only the main admin can see the services status.', 'PERM');
      return status(req);
    }
    if (req.action === 'workGet') { const d = read(uid); return { ok: true, list: d.list, at: d.at }; }
    const list = clean(req.list), at = Date.now(), txt = JSON.stringify({ list, at });
    if (txt.length > 45000) fail('The work list is too long to save. Delete some old records.', 'WORK');
    await withWb(() => { P().setProperty(keyOf(uid), txt); return true; });
    return { ok: true, list, at };
  }
  /* used by the WhatsApp helper bot (help menu: Status / Work) - same data as the website's WhatsApp tools */
  globalThis.WA_TOOLS_ = {
    status: async () => { const token = await withWb(() => globalThis.newToken_('ADMIN')); return status({ token, force: 0 }); },
    workGet: async uid => read(uid).list,
    workSave: async (uid, list) => {
      const l = clean(list), txt = JSON.stringify({ list: l, at: Date.now() });
      if (txt.length > 45000) throw new Error('Work list bahut lambi ho gayi. Purane records delete karo.');
      await withWb(() => { P().setProperty(keyOf(uid), txt); return true; });
      return l;
    }
  };
  return { actions: ACTIONS, route };
};
