'use strict';
/* KS · Telegram tab (server side).
   Every user links THEIR OWN Telegram account (phone + code, + 2-step password if set) through Telegram's official
   client API (MTProto, library "telegram" = GramJS).  The login session is stored ENCRYPTED in the sheet properties
   (TG_SES_<uid>), exactly like the Gmail token.  Message text / photos / videos are fetched live from Telegram,
   never copied into the sheet.  Needs env: TG_API_ID and TG_API_HASH (create them at https://my.telegram.org).
   Voice / video CALLS are not possible through this API - the app only shows the call log and opens the Telegram app. */
const crypto = require('crypto');

module.exports = function makeTelegram(o) {
  const { env, enc, dec, sign, withWb, warn } = o;
  const API_ID = Number(env.TG_API_ID || 0), API_HASH = String(env.TG_API_HASH || '');
  const configured = !!(API_ID && API_HASH);
  const MAX = 50 * 1048576;                                   // biggest photo / video / file we send or preview
  const ACTIONS = new Set(['tgStatus', 'tgSendCode', 'tgSignIn', 'tgPassword', 'tgLogout', 'tgChats', 'tgHistory', 'tgSend', 'tgDelete', 'tgEdit', 'tgRead']);
  const P = () => globalThis.PropertiesService.getScriptProperties();
  const fail = (m, c) => globalThis.fail_(m, c || 'TG');
  const authUid = t => { const u = globalThis.checkToken_(t); if (!u) globalThis.fail_('Session expired. Please log in again.', 'AUTH'); return u; };

  let lib = null;
  function L() {
    if (lib) return lib;
    try {
      const t = require('telegram');
      lib = { TelegramClient: t.TelegramClient, Api: t.Api, StringSession: require('telegram/sessions').StringSession,
        CustomFile: require('telegram/client/uploads').CustomFile, bigInt: require('big-integer') };
    } catch (e) { fail('Telegram support is not installed on the server. Add "telegram" and "big-integer" to package.json, then redeploy.'); }
    return lib;
  }

  const clients = new Map();      // uid -> Promise<{ client, ents }>
  const logins = new Map();       // uid -> { client, phone, hash, exp }   (a login that is still in progress)
  const cache = new Map();        // signed-media cache  key -> { buf, mime, name }
  let cacheBytes = 0;
  const remember = (k, v) => { cache.set(k, v); cacheBytes += v.buf.length;
    for (const [kk, vv] of cache) { if (cacheBytes <= 120 * 1048576 && cache.size <= 80) break; cache.delete(kk); cacheBytes -= vv.buf.length; } };

  const meta = uid => { try { return JSON.parse(P().getProperty('TG_META_' + uid) || 'null'); } catch (e) { return null; } };
  function forget(uid) {
    const p = clients.get(uid); clients.delete(uid);
    if (p) p.then(r => r.client.disconnect()).catch(() => {});
    withWb(() => { P().setProperty('TG_SES_' + uid, ''); P().setProperty('TG_META_' + uid, ''); }).catch(() => {});
  }
  function tgErr(e, uid) {
    if (e && (e.code === 'AUTH' || e.code === 'TG')) throw e;
    const m = String((e && (e.errorMessage || e.message)) || e);
    if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|USER_DEACTIVATED|AUTH_KEY_DUPLICATED|SESSION_EXPIRED/.test(m)) { forget(uid); fail('Telegram signed this session out. Tap “Connect Telegram” again.'); }
    if (/FLOOD/.test(m)) fail('Telegram asks you to wait ' + (e.seconds || 'a little') + ' seconds. Try again shortly.');
    const map = { PHONE_NUMBER_INVALID: 'That phone number is not valid. Use the country code, e.g. +91…', PHONE_CODE_INVALID: 'That code is wrong.',
      PHONE_CODE_EXPIRED: 'That code has expired. Ask for a new one.', PASSWORD_HASH_INVALID: 'Wrong two-step password.', PHONE_NUMBER_BANNED: 'Telegram has blocked this number.',
      CHAT_WRITE_FORBIDDEN: 'You cannot write in this chat.', MESSAGE_EMPTY: 'Nothing to send.', MESSAGE_TOO_LONG: 'That message is too long.', MSG_ID_INVALID: 'That message no longer exists.',
      CHAT_ADMIN_REQUIRED: 'Only admins can do that here.', USER_IS_BLOCKED: 'You blocked this person (or they blocked you).' };
    for (const k of Object.keys(map)) if (m.includes(k)) fail(map[k]);
    warn('Telegram error for', uid, m);
    fail('Telegram error: ' + m.slice(0, 160));
  }
  const guard = (uid, fn) => Promise.resolve().then(fn).catch(e => tgErr(e, uid));

  function newClient(ses) {
    const { TelegramClient, StringSession } = L();
    const c = new TelegramClient(new StringSession(ses || ''), API_ID, API_HASH, { connectionRetries: 3, deviceModel: 'KS Web', appVersion: '1.0' });
    try { c.setLogLevel('error'); } catch (e) {}
    return c;
  }
  async function warm(client, ents) {                         // also fills GramJS's entity cache, which sending needs
    const ds = await client.getDialogs({ limit: 100 });
    ds.forEach(d => { if (d.entity) ents.set(String(d.id), d.entity); });
    return ds;
  }
  async function getClient(uid) {
    const cur = clients.get(uid);
    if (cur) { try { const r = await cur; if (r.client.connected) return r; } catch (e) {} if (clients.get(uid) === cur) clients.delete(uid); }
    const ses = dec(P().getProperty('TG_SES_' + uid) || '');
    if (!ses) fail('Connect Telegram first.');
    const p = (async () => {
      const client = newClient(ses); await client.connect();
      if (!(await client.checkAuthorization())) { forget(uid); fail('Your Telegram session ended. Tap “Connect Telegram” again.'); }
      const ents = new Map(); await warm(client, ents); return { client, ents };
    })();
    clients.set(uid, p);
    try { return await p; } catch (e) { if (clients.get(uid) === p) clients.delete(uid); throw e; }
  }
  async function entOf(r, id) {
    id = String(id || ''); if (!/^-?\d{3,20}$/.test(id)) fail('Bad chat.');
    let e = r.ents.get(id);
    if (!e) { await warm(r.client, r.ents); e = r.ents.get(id); }
    if (!e) { try { e = await r.client.getEntity(L().bigInt(id)); } catch (x) {} }
    if (!e) fail('Chat not found.');
    return e;
  }

  /* ---------- shaping Telegram objects for the browser ---------- */
  const mediaUrl = (uid, chat, id, kind) => { const p = [uid, chat, id, kind, Date.now() + 6 * 3600e3].join('|');
    return '/tg/media?s=' + Buffer.from(p).toString('base64url') + '.' + sign('tgm:' + p); };
  const fmtDur = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const nameOf = s => !s ? '' : (s.firstName !== undefined ? [s.firstName, s.lastName].filter(Boolean).join(' ') : (s.title || ''));
  function kindOf(m) {
    if (m.action) return m.action.className === 'MessageActionPhoneCall' ? 'call' : 'service';
    if (m.photo) return 'photo';
    if (m.sticker) return 'sticker';
    if (m.voice) return 'voice';
    if (m.videoNote || m.video || m.gif) return 'video';
    if (m.audio) return 'audio';
    if (m.document) return 'file';
    if (m.geo) return 'geo';
    if (m.contact) return 'contact';
    if (m.poll) return 'poll';
    return m.media ? 'other' : 'text';
  }
  const LABEL = { photo: '📷 Photo', video: '🎥 Video', voice: '🎤 Voice message', audio: '🎵 Audio', sticker: '🙂 Sticker', file: '📎 File', geo: '📍 Location', contact: '👤 Contact', poll: '📊 Poll', other: '📎 Media' };
  function view(uid, chat, m) {
    const k = kindOf(m), f = m.file || null;
    const o = { id: m.id, out: !!m.out, at: (m.date || 0) * 1000, kind: k, text: m.message || '', from: nameOf(m.sender), edited: !!m.editDate,
      reply: (m.replyTo && m.replyTo.replyToMsgId) || 0, fwd: !!m.fwdFrom };
    if (k === 'call') {
      const a = m.action, dur = a.duration || 0, rs = (a.reason && a.reason.className) || '', miss = /Missed|Busy/.test(rs) || !dur;
      o.text = (a.video ? '🎥 Video call' : '📞 Voice call') + (miss ? (m.out ? ' · not answered' : ' · missed') : ' · ' + fmtDur(dur));
    } else if (k === 'service') {
      o.text = 'ℹ️ ' + String(m.action.className || '').replace(/^MessageAction/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    } else if (k === 'geo') { o.lat = m.geo.lat; o.lon = m.geo.long;
    } else if (k === 'contact') { o.text = '👤 ' + [m.contact.firstName, m.contact.lastName].filter(Boolean).join(' ') + (m.contact.phoneNumber ? ' · +' + String(m.contact.phoneNumber).replace(/^\+/, '') : '');
    } else if (k === 'poll') { const q = m.poll.poll && m.poll.poll.question; o.text = '📊 ' + (typeof q === 'string' ? q : (q && q.text) || 'Poll');
    } else if (k !== 'text') {
      if (f) { o.name = f.name || ''; o.size = Number(f.size) || 0; o.mime = f.mimeType || ''; o.dur = Number(f.duration) || 0; }
      if (k === 'sticker') { const at = ((m.sticker && m.sticker.attributes) || []).find(x => x.className === 'DocumentAttributeSticker'); o.emoji = (at && at.alt) || '🙂'; }
      o.url = mediaUrl(uid, chat, m.id, 'm');
    }
    return o;
  }
  const previewOf = m => !m ? '' : (m.message ? String(m.message).slice(0, 80) : (() => { const k = kindOf(m); if (k === 'call') return view('', '', m).text; return LABEL[k] || (k === 'service' ? view('', '', m).text : ''); })());
  const dview = (uid, d) => { const e = d.entity || {}, id = String(d.id);
    return { id, name: d.title || d.name || 'Telegram', unread: d.unreadCount || 0, pin: !!d.pinned, kind: d.isUser ? (e.bot ? 'bot' : 'user') : d.isGroup ? 'group' : d.isChannel ? 'channel' : 'other',
      at: (d.date || 0) * 1000, last: previewOf(d.message), out: !!(d.message && d.message.out), av: mediaUrl(uid, id, 0, 'a'), username: e.username || '' }; };

  /* ---------- JSON actions ---------- */
  async function finish(uid, lg) {
    logins.delete(uid);
    const me = await lg.client.getMe();
    const m = { name: [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username || 'Telegram', username: me.username || '', at: Date.now() };
    const ses = lg.client.session.save();
    await withWb(() => { P().setProperty('TG_SES_' + uid, enc(ses)); P().setProperty('TG_META_' + uid, JSON.stringify(m)); });
    const ents = new Map(), p = warm(lg.client, ents).then(() => ({ client: lg.client, ents }));
    clients.set(uid, p); p.catch(() => { if (clients.get(uid) === p) clients.delete(uid); });
    return { ok: true, connected: true, name: m.name, username: m.username };
  }
  async function route(req) {
    const a = req.action, uid = authUid(req.token);
    if (a === 'tgStatus') { const m = meta(uid); return { ok: true, configured, connected: !!m && !!P().getProperty('TG_SES_' + uid), name: m ? m.name : '', username: m ? m.username : '' }; }
    if (!configured) fail('Telegram is not set up on the server yet. Add TG_API_ID and TG_API_HASH (from my.telegram.org) in Render → Environment.');
    return guard(uid, async () => {
      const { Api } = L();
      if (a === 'tgSendCode') {
        const phone = String(req.phone || '').replace(/[^\d+]/g, '');
        if (!/^\+?\d{7,15}$/.test(phone)) fail('Enter your phone number with the country code, e.g. +91…');
        const old = logins.get(uid); if (old) old.client.disconnect().catch(() => {});
        const client = newClient(''); await client.connect();
        const r = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
        logins.set(uid, { client, phone, hash: r.phoneCodeHash, exp: Date.now() + 600000 });
        return { ok: true, viaApp: !!r.isCodeViaApp };
      }
      if (a === 'tgSignIn' || a === 'tgPassword') {
        const lg = logins.get(uid); if (!lg || lg.exp < Date.now()) fail('This sign-in expired. Start again with your phone number.');
        if (a === 'tgSignIn') {
          const code = String(req.code || '').replace(/\D/g, ''); if (!code) fail('Enter the code Telegram sent you.');
          let res;
          try { res = await lg.client.invoke(new Api.auth.SignIn({ phoneNumber: lg.phone, phoneCodeHash: lg.hash, phoneCode: code })); }
          catch (e) { if (e && e.errorMessage === 'SESSION_PASSWORD_NEEDED') return { ok: true, need2fa: true }; throw e; }
          if (res && res.className === 'auth.AuthorizationSignUpRequired') fail('This number has no Telegram account yet. Create it in the Telegram app first.');
        } else {
          await lg.client.signInWithPassword({ apiId: API_ID, apiHash: API_HASH }, { password: async () => String(req.password || ''), onError: async e => { throw e; } });
        }
        return finish(uid, lg);
      }
      if (a === 'tgLogout') {
        const p = clients.get(uid); try { const r = p && await p; if (r) await r.client.invoke(new Api.auth.LogOut()); } catch (e) {}
        const lg = logins.get(uid); if (lg) { lg.client.disconnect().catch(() => {}); logins.delete(uid); }
        forget(uid); return { ok: true };
      }
      const r = await getClient(uid);
      if (a === 'tgChats') { const ds = await warm(r.client, r.ents); return { ok: true, items: ds.map(d => dview(uid, d)) }; }
      const ent = await entOf(r, req.chat), chat = String(req.chat);
      if (a === 'tgHistory') {
        const opts = { limit: Math.min(Math.max(Number(req.limit) || 40, 1), 60) };
        if (req.beforeId) opts.offsetId = Number(req.beforeId);
        if (req.afterId) opts.minId = Number(req.afterId);
        const ms = await r.client.getMessages(ent, opts);
        if (req.read) r.client.markAsRead(ent).catch(() => {});
        return { ok: true, items: Array.from(ms).reverse().map(m => view(uid, chat, m)),
          chat: { id: chat, name: nameOf(ent) || ent.username || 'Telegram', username: ent.username || '', userId: ent.className === 'User' ? String(ent.id) : '', kind: ent.className === 'User' ? 'user' : 'group' } };
      }
      if (a === 'tgRead') { await r.client.markAsRead(ent); return { ok: true }; }
      if (a === 'tgSend') {
        const text = String(req.text || '').slice(0, 4096); if (!text.trim()) fail('Nothing to send.');
        const m = await r.client.sendMessage(ent, { message: text, replyTo: Number(req.reply) || undefined });
        return { ok: true, msg: view(uid, chat, m) };
      }
      if (a === 'tgEdit') { const text = String(req.text || '').slice(0, 4096); if (!text.trim()) fail('Nothing to send.'); await r.client.editMessage(ent, { message: Number(req.id), text }); return { ok: true }; }
      if (a === 'tgDelete') { await r.client.deleteMessages(ent, [Number(req.id)], { revoke: true }); return { ok: true }; }
    });
  }

  /* ---------- binary: send a photo / video / file, and stream media to the browser ---------- */
  async function upload(token, q, buf) {
    const uid = authUid(token);
    if (!configured) fail('Telegram is not set up on the server yet.');
    if (!buf || !buf.length) fail('Empty file.');
    return guard(uid, async () => {
      const { CustomFile } = L(), r = await getClient(uid), ent = await entOf(r, q.c);
      const name = String(q.n || 'file').replace(/[\\/]/g, '_').slice(0, 120) || 'file', mime = String(q.m || '');
      const m = await r.client.sendFile(ent, { file: new CustomFile(name, buf.length, '', buf), caption: String(q.cap || '').slice(0, 1024),
        forceDocument: q.as === 'file', supportsStreaming: /^video\//.test(mime), replyTo: Number(q.reply) || undefined });
      return { ok: true, msg: view(uid, String(q.c), m) };
    });
  }
  const text = (code, s) => ({ code, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: s });
  const SAFE = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|ogg|mp4|x-m4a|wav|webm|aac))$/;
  async function media(q, range) {
    const [b, g] = String(q.s || '').split('.'); if (!b || !g) return text(403, 'Bad link');
    const p = Buffer.from(b, 'base64url').toString(), good = sign('tgm:' + p);
    if (g.length !== good.length || !crypto.timingSafeEqual(Buffer.from(g), Buffer.from(good))) return text(403, 'Bad link');
    const [uid, chat, id, kind, exp] = p.split('|'); if (Number(exp) < Date.now()) return text(403, 'This link expired. Reload the chat.');
    const key = [uid, chat, id, kind].join('|'); let c = cache.get(key);
    if (!c) {
      try {
        const r = await getClient(uid), ent = await entOf(r, chat);
        if (kind === 'a') {
          const buf = await r.client.downloadProfilePhoto(ent, { isBig: false });
          if (!buf || !buf.length) return text(404, 'No photo');
          c = { buf, mime: 'image/jpeg', name: 'avatar.jpg' };
        } else {
          const [m] = Array.from(await r.client.getMessages(ent, { ids: [Number(id)] }));
          if (!m || !m.media) return text(404, 'No media');
          const f = m.file || {};
          if ((Number(f.size) || 0) > MAX) return text(413, 'Too big to open here (over ' + (MAX / 1048576) + ' MB). Open it in Telegram.');
          const buf = await r.client.downloadMedia(m, {});
          if (!buf || !buf.length) return text(404, 'No media');
          c = { buf, mime: f.mimeType || (m.photo ? 'image/jpeg' : 'application/octet-stream'), name: f.name || ('file' + (f.ext || '')) };
        }
        remember(key, c);
      } catch (e) { warn('Telegram media failed', e && (e.errorMessage || e.message)); return text(500, 'Could not load this file.'); }
    }
    const size = c.buf.length, ok = SAFE.test(c.mime);
    const h = { 'Content-Type': ok ? c.mime : 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=21600', 'X-Content-Type-Options': 'nosniff' };
    if (q.dl || !ok) h['Content-Disposition'] = 'attachment; filename="' + String(c.name).replace(/[^\w.\- ]/g, '_') + '"';
    const rg = /^bytes=(\d*)-(\d*)$/.exec(String(range || ''));
    if (rg && (rg[1] || rg[2])) {
      const s = rg[1] ? Number(rg[1]) : Math.max(0, size - Number(rg[2])), e = rg[1] && rg[2] ? Math.min(Number(rg[2]), size - 1) : size - 1;
      if (s > e || s >= size) return { code: 416, headers: { 'Content-Range': 'bytes */' + size }, body: '' };
      h['Content-Range'] = 'bytes ' + s + '-' + e + '/' + size; h['Content-Length'] = e - s + 1;
      return { code: 206, headers: h, body: c.buf.subarray(s, e + 1) };
    }
    h['Content-Length'] = size; return { code: 200, headers: h, body: c.buf };
  }

  return { actions: ACTIONS, route, upload, media, max: MAX };
};
