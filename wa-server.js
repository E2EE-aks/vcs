'use strict';
/* KS · WhatsApp tab (server side) - works like WhatsApp Web.
   Every user links THEIR OWN WhatsApp by scanning a QR code (WhatsApp ▸ Linked devices ▸ Link a device).
   Library: Baileys (@whiskeysockets/baileys), an unofficial WhatsApp Web client.
   The linked device announces itself as a desktop app, so WhatsApp sends the chat list, contacts and recent
   message history right after the first scan.  Everything is kept under WA_DIR/<user id>/ :
     creds + keys (the login)  and  store.json (chat list + messages, without media).
   On hosts with a temporary disk (Render free plan) these files vanish on restart/redeploy - then the user scans
   the QR again.  Attach a persistent disk and set WA_DIR to its path to stay logged in.
   Photos / videos / voice notes / files are downloaded live from WhatsApp when you open them (never saved).
   Nothing is copied into the Google Sheet.
   Env (all optional): WA_DIR, WA_DEFAULT_CC (country code for numbers typed without one, default 91). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function makeWhatsApp(o) {
  const { env, warn, sign, withWb, enc, dec } = o;
  const deployFiles = o.deploy;                              // (files, message) -> commit on GitHub (set by server.js); Render then deploys the website
  const DIR = path.resolve(env.WA_DIR || path.join(__dirname, 'wa-sessions'));
  const CC = String(env.WA_DEFAULT_CC || '91').replace(/\D/g, '') || '91';
  const ACTIONS = new Set(['waStatus', 'waStart', 'waLogout', 'waChats', 'waHistory', 'waSend', 'waContacts', 'waMore', 'waGroup', 'waSyncContacts', 'waStatuses', 'waBlue', 'waBlueAll', 'licWaGet', 'licWaSet', 'licWaTest', 'waForward', 'waBotGet', 'waBotSet', 'waBotPeople']);
  const MAX = 30 * 1048576;                                   // biggest file we send or open
  const fail = (m, c) => globalThis.fail_(m, c || 'WA');
  const authUid = t => { const u = globalThis.checkToken_(t); if (!u) globalThis.fail_('Session expired. Please log in again.', 'AUTH'); return u; };
  const udir = uid => path.join(DIR, 'wa_' + String(uid).replace(/[^\w-]/g, '_'));
  const MAX_CHATS = 400, MAX_MSGS = 200, MAX_RAW = 600;

  let lib = null, QR = null;
  function L() {
    if (lib) return lib;
    try { lib = require('@whiskeysockets/baileys'); }
    catch (e) { fail('WhatsApp support is not installed on the server. Add "@whiskeysockets/baileys", "qrcode" and "pino" to package.json, then redeploy.'); }
    return lib;
  }
  function libVer() { try { return require('@whiskeysockets/baileys/package.json').version; } catch (e) { try { return require(path.join(path.dirname(require.resolve('@whiskeysockets/baileys')), '..', 'package.json')).version; } catch (x) { return '?'; } } }
  function qrLib() { if (!QR) { try { QR = require('qrcode'); } catch (e) { fail('The "qrcode" package is missing on the server. Add it to package.json and redeploy.'); } } return QR; }
  const quietLog = () => { try { return require('pino')({ level: 'silent' }); } catch (e) { const n = () => {}; const l = { level: 'silent', child: () => l, trace: n, debug: n, info: n, warn: n, error: n, fatal: n }; return l; } };

  /* per user: sock, status (idle|starting|qr|open), qr, name, number, chats Map, msgs Map, raw Map (media only, in memory) */
  const users = new Map();
  const st = uid => { let s = users.get(uid); if (!s) { s = { sock: null, status: 'idle', qr: '', name: '', number: '', chats: new Map(), msgs: new Map(), raw: new Map(), wantOn: false, tries: 0, lastSend: 0, gen: 0, saveT: null, loaded: false, pics: new Map(), media: new Map(), err: '', vi: 0, contacts: new Map(), blueMap: new Map(), hideAll: true, lid: new Map(), stat: new Map(), hist: { chats: 0, msgs: 0 } }; users.set(uid, s); } return s; };
  const hasSaved = uid => { try { const c = JSON.parse(fs.readFileSync(path.join(udir(uid), 'creds.json'), 'utf8')); return !!(c && c.me); } catch (e) { return false; } };   // only a really linked login counts (half-finished QR logins are ignored)
  const wipe = uid => { try { fs.rmSync(udir(uid), { recursive: true, force: true }); } catch (e) {} };

  /* ---------- the WhatsApp login survives a redeploy / restart ----------
     On Render's free plan the disk is wiped on every deploy, so the login files would vanish and you would be logged out.
     Fix: a copy of the login (creds + keys + a slim chat list) is kept ENCRYPTED in the sheet properties (like Telegram's session)
     and put back automatically when the files are missing.  It is deleted only when YOU log out (or WhatsApp itself logs this device out). */
  const zlib = require('zlib');
  const PROPS = () => globalThis.PropertiesService.getScriptProperties();
  const BK_CHUNK = 40000, BK_MAX = 40;                      // sheet cells hold 50 000 characters; at most 40 cells per user
  const bkPre = uid => 'WA_BK_' + String(uid).replace(/[^\w-]/g, '_') + '_';
  function slimStore(txt) {                                  // keep the chat list small enough for the sheet
    try {
      const j = JSON.parse(txt), msgs = {}, top = (j.chats || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 60);
      top.forEach(c => { const l = (j.msgs || {})[c.id]; if (l) msgs[c.id] = l.slice(-15).map(m => { const x = Object.assign({}, m); delete x.thumb; return x; }); });
      return JSON.stringify({ chats: j.chats || [], contacts: j.contacts || [], lids: j.lids || {}, blueMap: j.blueMap || {}, hideAll: j.hideAll, msgs });
    } catch (e) { return ''; }
  }
  function packFiles(uid, withStore) {
    const d = udir(uid), files = {};
    let names; try { names = fs.readdirSync(d); } catch (e) { return ''; }
    names.forEach(n => {
      try {
        if (/^session-/.test(n)) return;                       // per-contact encryption sessions are NOT saved: a restored old one makes the other phone show "Waiting for this message"; WhatsApp builds a fresh one automatically
        let c = fs.readFileSync(path.join(d, n), 'utf8');
        if (n === 'store.json') { if (!withStore) return; c = slimStore(c); if (!c) return; }
        files[n] = c;
      } catch (e) {}
    });
    if (!files['creds.json']) return '';
    return zlib.gzipSync(Buffer.from(JSON.stringify(files), 'utf8')).toString('base64');
  }
  async function backup(uid) {
    const s = st(uid);
    if (!withWb || !enc || !hasSaved(uid) || s.bkBusy) return;
    s.bkBusy = true;
    try {
      let raw = packFiles(uid, true);
      if (Math.ceil(raw.length * 1.4 / BK_CHUNK) > BK_MAX) raw = packFiles(uid, false);      // too big -> keep the login only
      if (!raw || raw === s.bkLast) return;
      const blob = enc(raw), chunks = []; for (let i = 0; i < blob.length; i += BK_CHUNK) chunks.push(blob.slice(i, i + BK_CHUNK));
      if (chunks.length > BK_MAX) { warn('WhatsApp backup too big', chunks.length); return; }
      await withWb(() => {
        if (!hasSaved(uid)) return;                           // logged out meanwhile -> do not bring the backup back
        const P = PROPS(), k = bkPre(uid), old = Number(P.getProperty(k + 'n') || 0);
        chunks.forEach((c, i) => P.setProperty(k + i, c));
        for (let i = chunks.length; i < old; i++) P.setProperty(k + i, '');
        P.setProperty(k + 'n', String(chunks.length));
      });
      s.bkLast = raw;
    } catch (e) { warn('WhatsApp backup', e && e.message); }
    finally { s.bkBusy = false; }
  }
  function scheduleBackup(uid, ms) {
    const s = st(uid); if (s.bkT || !withWb) return;
    s.bkT = setTimeout(() => { s.bkT = null; backup(uid); }, ms);
  }
  async function forgetBackup(uid) {
    const s = st(uid); s.bkLast = ''; if (s.bkT) { clearTimeout(s.bkT); s.bkT = null; }
    if (!withWb) return;
    try { await withWb(() => { const P = PROPS(), k = bkPre(uid), n = Number(P.getProperty(k + 'n') || 0); if (!n) return; for (let i = 0; i < n; i++) P.setProperty(k + i, ''); P.setProperty(k + 'n', '0'); }); }
    catch (e) { warn('WhatsApp backup delete', e && e.message); }
  }
  function restore(uid) {                                    // files missing (fresh deploy)? put the saved login back
    if (!withWb || !dec || hasSaved(uid)) return Promise.resolve(false);
    const s = st(uid); if (s.restoring) return s.restoring;
    s.restoring = (async () => {
      try {
        const raw = await withWb(() => { const P = PROPS(), k = bkPre(uid), n = Number(P.getProperty(k + 'n') || 0); let b = ''; for (let i = 0; i < n; i++) b += P.getProperty(k + i) || ''; return b; });
        if (!raw) return false;
        const gz = dec(raw); if (!gz) return false;
        const files = JSON.parse(zlib.gunzipSync(Buffer.from(gz, 'base64')).toString('utf8'));
        fs.mkdirSync(udir(uid), { recursive: true });
        Object.keys(files).forEach(n => { if (/[\\/]|\.\./.test(n) || /^session-/.test(n)) return; fs.writeFileSync(path.join(udir(uid), n), files[n]); });
        return hasSaved(uid);
      } catch (e) { warn('WhatsApp restore', e && e.message); return false; }
      finally { s.restoring = null; }
    })();
    return s.restoring;
  }

  /* ---------- the chat list + messages survive a server restart (store.json, no media inside) ---------- */
  function loadStore(uid, s) {
    if (s.loaded) return; s.loaded = true;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(udir(uid), 'store.json'), 'utf8'));
      (j.chats || []).forEach(c => s.chats.set(c.id, c));
      (j.contacts || []).forEach(c => s.contacts.set(c.id, c));
      Object.keys(j.lids || {}).forEach(k => s.lid.set(k, j.lids[k]));
      Object.keys(j.blueMap || {}).forEach(k => s.blueMap.set(k, !!j.blueMap[k]));
      if (j.hideAll === false) s.hideAll = false;
      Object.keys(j.msgs || {}).forEach(k => s.msgs.set(k, j.msgs[k]));
    } catch (e) {}
  }
  function saveSoon(uid, s) {
    if (s.saveT) return;
    s.saveT = setTimeout(() => {
      s.saveT = null;
      try {
        const msgs = {}; s.msgs.forEach((v, k) => { msgs[k] = v.slice(-80).map(m => { const x = Object.assign({}, m); delete x.thumb; return x; }); });
        fs.mkdirSync(udir(uid), { recursive: true });
        fs.writeFileSync(path.join(udir(uid), 'store.json'), JSON.stringify({ chats: [...s.chats.values()], contacts: [...s.contacts.values()], lids: Object.fromEntries(s.lid), blueMap: Object.fromEntries(s.blueMap), hideAll: s.hideAll, msgs }));
      } catch (e) {}
    }, 4000);
  }

  /* ---------- helpers ---------- */
  const digits = s => String(s || '').replace(/\D/g, '');
  function toJid(to) {
    const t = String(to || '').trim();
    if (/@(s\.whatsapp\.net|g\.us|lid)$/.test(t)) return t;
    let d = digits(t); if (!d) fail('Enter a phone number.');
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = CC + d.slice(1);
    else if (d.length <= 10) d = CC + d;
    if (d.length < 8 || d.length > 15) fail('That phone number does not look right. Use the country code, e.g. +91…');
    return d + '@s.whatsapp.net';
  }
  const unwrap = m => { let x = m || {}; for (let i = 0; i < 4; i++) { const n = x.ephemeralMessage || x.viewOnceMessage || x.viewOnceMessageV2 || x.documentWithCaptionMessage || x.editedMessage; if (n && n.message) x = n.message; else break; } return x; };
  const b64 = b => { try { return b && b.length ? Buffer.from(b).toString('base64') : ''; } catch (e) { return ''; } };
  function kindText(m) {
    const x = unwrap(m);
    if (x.conversation) return { kind: 'text', text: x.conversation };
    if (x.extendedTextMessage) return { kind: 'text', text: x.extendedTextMessage.text || '' };
    if (x.imageMessage) return { kind: 'photo', text: x.imageMessage.caption || '', label: '📷 Photo', thumb: b64(x.imageMessage.jpegThumbnail), mime: x.imageMessage.mimetype, media: 1 };
    if (x.videoMessage) return { kind: x.videoMessage.gifPlayback ? 'gif' : 'video', text: x.videoMessage.caption || '', label: '🎥 Video', thumb: b64(x.videoMessage.jpegThumbnail), mime: x.videoMessage.mimetype, media: 1, dur: x.videoMessage.seconds };
    if (x.audioMessage) return { kind: x.audioMessage.ptt ? 'voice' : 'audio', text: '', label: x.audioMessage.ptt ? '🎤 Voice message' : '🎵 Audio', mime: x.audioMessage.mimetype, media: 1, dur: x.audioMessage.seconds };
    if (x.documentMessage) return { kind: 'file', text: x.documentMessage.caption || '', label: '📎 ' + (x.documentMessage.fileName || 'File'), name: x.documentMessage.fileName || 'file', mime: x.documentMessage.mimetype, size: Number(x.documentMessage.fileLength) || 0, media: 1 };
    if (x.stickerMessage) return { kind: 'sticker', text: '', label: '🙂 Sticker', mime: x.stickerMessage.mimetype || 'image/webp', media: 1 };
    if (x.locationMessage) return { kind: 'geo', text: '📍 Location', label: '📍 Location', lat: x.locationMessage.degreesLatitude, lon: x.locationMessage.degreesLongitude };
    if (x.contactMessage) return { kind: 'contact', text: '👤 ' + (x.contactMessage.displayName || 'Contact'), label: '👤 Contact' };
    if (x.contactsArrayMessage) return { kind: 'contact', text: '👤 Contacts', label: '👤 Contacts' };
    if (x.pollCreationMessage || x.pollCreationMessageV3) return { kind: 'text', text: '📊 ' + ((x.pollCreationMessage || x.pollCreationMessageV3).name || 'Poll'), label: '📊 Poll' };
    if (x.reactionMessage || x.protocolMessage || x.senderKeyDistributionMessage || x.messageContextInfo && Object.keys(x).length === 1) return null;
    return { kind: 'other', text: '', label: '💬 Message' };
  }
  const tsOf = t => { const n = Number(t && t.toNumber ? t.toNumber() : t) || 0; return (n || Math.floor(Date.now() / 1000)) * 1000; };
  const isChat = jid => /@(s\.whatsapp\.net|g\.us|lid)$/.test(jid || '');
  const numOf = jid => /@lid$/.test(jid || '') ? '' : '+' + String(jid || '').split('@')[0].split(':')[0];
  const ST = { 0: 'error', 1: 'sending', 2: 'sent', 3: 'delivered', 4: 'read', 5: 'read' };

  function chatOf(s, jid) {
    let c = s.chats.get(jid);
    if (!c) { c = { id: jid, name: '', at: 0, last: '', out: false, unread: 0, group: jid.endsWith('@g.us') }; s.chats.set(jid, c);
      if (s.chats.size > MAX_CHATS) { const old = [...s.chats.values()].sort((a, b) => a.at - b.at)[0]; if (old && old.id !== jid) { s.chats.delete(old.id); s.msgs.delete(old.id); } } }
    return c;
  }
  /* WhatsApp now hides phone numbers behind "@lid" ids. Chats are keyed by the @lid, the address book by the phone number.
     We learn which lid belongs to which number (from contacts, history, messages) so names and numbers show correctly. */
  const isPn = j => /@s\.whatsapp\.net$/.test(j || '');
  const isLid = j => /@lid$/.test(j || '');
  const bareJid = j => String(j || '').replace(/:\d+@/, '@');
  function learn(s, a, b) {
    a = bareJid(a); b = bareJid(b);
    if (isLid(a) && isPn(b)) s.lid.set(a, b); else if (isPn(a) && isLid(b)) s.lid.set(b, a);
  }
  /* blue tick (read receipt): s.hideAll = hidden for EVERYONE (home page switch); s.blueMap = per-contact override (true = show to this person, false = hide) */
  const blueKey = (s, jid) => pnOf(s, jid) || bareJid(jid);
  const blueShow = (s, jid) => { const k = blueKey(s, jid); return s.blueMap.has(k) ? s.blueMap.get(k) : !s.hideAll; };
  const pnOf = (s, jid) => isPn(jid) ? bareJid(jid) : (isLid(jid) ? (s.lid.get(bareJid(jid)) || '') : '');
  function addContact(s, c) {                           // the phone's address book (for the Select contact screen)
    if (!c || !c.id) return;
    learn(s, c.id, c.phoneNumber); learn(s, c.id, c.jid); learn(s, c.id, c.lid); learn(s, c.lid, c.phoneNumber);
    const id = bareJid(pnOf(s, c.id) || c.id); if (!isPn(id) && !isLid(id)) return;
    const o = s.contacts.get(id) || { id, name: '', pn: '' };
    if (c.name || c.verifiedName) o.name = c.name || c.verifiedName; if (c.notify) o.pn = c.notify;
    s.contacts.set(id, o);
  }
  async function resolveLids(s) {                       // ask WhatsApp's own lid table for numbers we have not learned yet
    try {
      const lm = s.sock && s.sock.signalRepository && s.sock.signalRepository.lidMapping; if (!lm || !lm.getPNForLID) return;
      const todo = new Set(); s.chats.forEach(c => { if (isLid(c.id) && !s.lid.has(bareJid(c.id))) todo.add(c.id); }); s.contacts.forEach(c => { if (isLid(c.id) && !s.lid.has(bareJid(c.id))) todo.add(c.id); });
      await Promise.all([...todo].slice(0, 150).map(async l => { try { const p = await Promise.race([lm.getPNForLID(l), new Promise(r => setTimeout(() => r(null), 3000))]); if (p) learn(s, l, /@/.test(p) ? p : p + '@s.whatsapp.net'); } catch (e) {} }));
    } catch (e) {}
  }
  const setName = (c, n) => { if (n && String(n).trim()) c.name = String(n).trim(); };
  /* ---------- contacts' status updates (24 h) - kept in memory only; photos / videos are downloaded live when opened ---------- */
  const STAT_TTL = 24 * 3600e3, STAT_MAX = 500;
  const hex = n => (n === undefined || n === null || n === '') ? '' : '#' + ((Number(n) & 0xFFFFFF) >>> 0).toString(16).padStart(6, '0');
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/3gpp': '3gp', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac' };
  const extOf = mime => EXT[String(mime || '').split(';')[0].trim().toLowerCase()] || 'bin';
  function purgeStat(s) { const now = Date.now(); s.stat.forEach((g, k) => { g.items = g.items.filter(i => now - i.at < STAT_TTL); if (!g.items.length) s.stat.delete(k); }); }
  function addStatus(s, wm) {
    try {
      if (!wm || !wm.message || !wm.key || wm.key.fromMe) return;
      const part = wm.key.participant || wm.participant; if (!part) return;
      learn(s, part, wm.key.participantAlt); learn(s, part, wm.key.participantPn);
      const jid = bareJid(part), x = unwrap(wm.message), pm = x.protocolMessage;
      if (pm && pm.key && pm.key.id && (pm.type === 0 || pm.type === 'REVOKE')) {                    // the contact deleted a status
        const g = s.stat.get(jid); if (g) { g.items = g.items.filter(i => i.id !== pm.key.id); if (!g.items.length) s.stat.delete(jid); } return;
      }
      const k = kindText(wm.message); if (!k || !/^(text|photo|video|gif|voice|audio)$/.test(k.kind)) return;
      const at = tsOf(wm.messageTimestamp); if (Date.now() - at > STAT_TTL) return;
      let g = s.stat.get(jid); if (!g) { g = { id: jid, push: '', items: [] }; s.stat.set(jid, g); }
      if (wm.pushName) g.push = wm.pushName;
      if (g.items.some(i => i.id === wm.key.id)) return;
      const it = { id: wm.key.id, at, kind: k.kind, text: k.text || '', mime: k.mime || '', thumb: k.thumb || '', media: k.media ? 1 : 0, wm };
      if (k.dur) it.dur = k.dur;
      if (k.kind === 'text') { const e = x.extendedTextMessage || {}; it.bg = hex(e.backgroundArgb); it.fg = hex(e.textArgb); }
      g.items.push(it); g.items.sort((a, b) => a.at - b.at);
      let n = 0; s.stat.forEach(q => { n += q.items.length; });
      if (n > STAT_MAX) purgeStat(s);
      if (n > STAT_MAX) { const old = [...s.stat.values()].sort((a, b) => a.items[0].at - b.items[0].at)[0]; if (old) s.stat.delete(old.id); }
    } catch (e) {}
  }
  function statusView(uid, r) {
    purgeStat(r);
    const by = new Map();
    r.stat.forEach(g => {
      const pn = pnOf(r, g.id), key = pn || g.id; let o = by.get(key);
      if (!o) { o = { id: key, jid: g.id, pn, push: '', items: [] }; by.set(key, o); }
      o.push = o.push || g.push;
      g.items.forEach(i => {
        const v = { id: i.id, at: i.at, kind: i.kind, text: i.text };
        ['mime', 'dur', 'bg', 'fg'].forEach(f => { if (i[f]) v[f] = i[f]; });
        if (i.thumb) v.thumb = i.thumb;
        if (i.media) { v.url = link(uid, g.id, i.id, 's'); v.dl = v.url + '&dl=1'; }
        o.items.push(v);
      });
    });
    return [...by.values()].map(o => {
      o.items.sort((a, b) => a.at - b.at);
      const ct = (o.pn && r.contacts.get(o.pn)) || r.contacts.get(o.jid), ch = r.chats.get(o.jid) || (o.pn && r.chats.get(o.pn)), num = o.pn ? '+' + o.pn.split('@')[0] : numOf(o.jid);
      return { id: o.id, name: (ch && ch.name) || (ct && (ct.name || ct.pn)) || o.push || num || 'WhatsApp contact', number: num, av: link(uid, o.jid, 0, 'a'), at: o.items[o.items.length - 1].at, items: o.items };
    }).sort((a, b) => b.at - a.at);
  }

  /* "Delete for everyone" by the OTHER person: we keep the message (text / photo / video) on our side and only flag it as deleted,
     so the screen can show "this person deleted this message". Your own deletes are not touched. */
  function markDeleted(uid, s, key, jidHint) {
    try {
      if (!key || !key.id) return;
      let list = null, m = null;
      const tryList = j => { const l = j && s.msgs.get(j); const f = l && l.find(x => x.id === key.id); if (f) { list = j; m = f; } };
      tryList(jidHint); tryList(key.remoteJid);
      if (!m) for (const j of s.msgs.keys()) { tryList(j); if (m) break; }
      if (!m || m.out || m.deleted) return;
      m.deleted = true; m.delAt = Date.now();
      if (m.media) keepMedia(s, list, m);
      saveSoon(uid, s);
    } catch (e) { warn('WhatsApp keep-deleted', e && e.message); }
  }
  async function keepMedia(s, jid, m) {                   // save the file now, before WhatsApp removes it, so it still opens later
    try {
      const key = jid + '|' + m.id, wm = s.raw.get(key);
      if (!wm || s.media.has(key) || s.status !== 'open' || !s.sock) return;
      const B = L(), x = unwrap(wm.message), part = x.imageMessage || x.videoMessage || x.audioMessage || x.documentMessage || x.stickerMessage || {};
      if ((Number(part.fileLength) || 0) > MAX) return;
      const buf = await B.downloadMediaMessage(wm, 'buffer', {}, { logger: quietLog(), reuploadRequest: s.sock.updateMediaMessage });
      if (buf && buf.length) { s.media.set(key, { buf, mime: part.mimetype || 'application/octet-stream', name: part.fileName || 'file' }); if (s.media.size > 40) s.media.delete(s.media.keys().next().value); }
    } catch (e) {}
  }
  const isRevoke = pm => !!(pm && pm.key && pm.key.id && (pm.type === 0 || pm.type === 'REVOKE'));

  /* ---------- edited messages: keep every earlier version so the app can show what changed (old words red, new words green) ---------- */
  function findEdit(o, d) {                                 // a protocolMessage "edit" can be wrapped in several ways - search all of them
    d = d || 0; if (!o || typeof o !== 'object' || d > 7 || o instanceof Uint8Array || Buffer.isBuffer(o)) return null;
    if (o.editedMessage && typeof o.editedMessage === 'object' && o.key && o.key.id && (o.type === undefined || o.type === 14 || o.type === 'MESSAGE_EDIT'))
      return { key: o.key, msg: o.editedMessage.message && !o.editedMessage.conversation ? o.editedMessage.message : o.editedMessage, ts: Number(o.timestampMs) || 0 };
    for (const k of Object.keys(o)) { const r = findEdit(o[k], d + 1); if (r) return r; }
    return null;
  }
  const editInfo = message => findEdit(message);
  const shapeOf = (o, d) => {                               // short list of the field names of an unknown message (to see what WhatsApp sent)
    d = d || 0; if (!o || typeof o !== 'object' || d > 4 || o instanceof Uint8Array || Buffer.isBuffer(o)) return '';
    return Object.keys(o).filter(k => o[k] != null && k !== 'messageContextInfo').map(k => { const v = shapeOf(o[k], d + 1); return v ? k + '>(' + v + ')' : k; }).join(',');
  };
  function applyEdit(uid, s, key, jidHint, newMsg, ts) {
    try {
      if (!key || !key.id || !newMsg) return;
      let list = null, m = null;
      const tryList = j => { const l = j && s.msgs.get(j); const f = l && l.find(x => x.id === key.id); if (f) { list = j; m = f; } };
      tryList(jidHint); tryList(key.remoteJid);
      if (!m) for (const j of s.msgs.keys()) { tryList(j); if (m) break; }
      if (!m) return;
      const k = kindText(newMsg); if (!k) return;
      const nt = String(k.text || ''); if (nt === (m.text || '')) return;      // same edit seen twice
      (m.hist || (m.hist = [])).push(m.text || ''); if (m.hist.length > 12) m.hist.shift();
      m.text = nt; m.editAt = ts || Date.now();
      const l = s.msgs.get(list), c = s.chats.get(list); if (c && l && l[l.length - 1] === m && m.kind === 'text') c.last = nt.slice(0, 80);
      saveSoon(uid, s);
    } catch (e) { warn('WhatsApp keep-edit', e && e.message); }
  }

  /* ---------- encrypted edits: WhatsApp now sends "edit" as an encrypted message; it opens with the secret key of the ORIGINAL message ---------- */
  const secOf = message => {                               // messageSecret of a message (saved so a later edit can be opened)
    try { const x = unwrap(message), c = (message && message.messageContextInfo) || x.messageContextInfo; const b = c && c.messageSecret; return b && b.length ? Buffer.from(b).toString('base64') : ''; } catch (e) { return ''; }
  };
  const nj = j => String(j || '').replace(/:\d+@/, '@');
  const uniq = a => [...new Set(a.filter(Boolean))];
  function openEdit(s, jid, wm, sem) {                     // -> the new message content, or null
    const tk = sem.targetMessageKey || {}, orig = (s.msgs.get(jid) || []).find(x => x.id === tk.id);
    if (!orig || !orig.sec || !sem.encPayload || !sem.encIv) return null;
    const secret = Buffer.from(orig.sec, 'base64'), iv = Buffer.from(sem.encIv), ct = Buffer.from(sem.encPayload), me = (s.sock && s.sock.user) || {}, mine = uniq([nj(me.id), nj(me.lid)]), k = wm.key || {}, ok = orig.key || {};
    const authors = orig.out ? mine : uniq([nj(ok.participant), nj(ok.remoteJid), nj(tk.participant), nj(tk.remoteJid), nj(jid), nj(k.participantAlt), nj(k.remoteJidAlt)]);
    const mods = k.fromMe ? mine : uniq([nj(k.participant), nj(k.remoteJid), nj(k.participantAlt), nj(k.remoteJidAlt), nj(jid)]);
    const k0 = crypto.createHmac('sha256', Buffer.alloc(32)).update(secret).digest();
    for (const uc of ['Message Edit', 'Msg Edit', 'Edit', 'MessageEdit', 'Message edit', 'Event Edit']) for (const a of authors) for (const b of mods) {
      try {
        const key = crypto.createHmac('sha256', k0).update(Buffer.concat([Buffer.from(tk.id), Buffer.from(a), Buffer.from(b), Buffer.from(uc), Buffer.from([1])])).digest();
        const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAAD(Buffer.from(tk.id + '\0' + b)); d.setAuthTag(ct.slice(-16));
        const plain = Buffer.concat([d.update(ct.slice(0, -16)), d.final()]);
        const msg = lib.proto.Message.decode(plain), e = findEdit(msg);
        return e ? e.msg : msg;
      } catch (e) { /* wrong guess - try the next one */ }
    }
    return null;
  }
  function editSecret(uid, s, jid, wm, sem) {
    const tk = sem.targetMessageKey || {};
    try {
      const nm = openEdit(s, jid, wm, sem);
      if (nm && kindText(nm)) { applyEdit(uid, s, { id: tk.id, remoteJid: jid }, jid, nm, tsOf(wm.messageTimestamp) * 1000); return; }
      const orig = (s.msgs.get(jid) || []).find(x => x.id === tk.id);                // could not read the new text: at least mark it as edited
      if (orig) { orig.edN = (orig.edN || 0) + 1; orig.editAt = Date.now(); saveSoon(uid, s); }
      warn('WhatsApp edit not readable', orig ? (orig.sec ? 'key did not fit' : 'original has no secret') : 'original message not stored');
    } catch (e) { warn('WhatsApp edit', e && e.message); }
  }

  function addMsg(uid, s, jid, wm, live) {
    if (jid === 'status@broadcast') { addStatus(s, wm); return null; }
    if (!isChat(jid) || jid === 'status@broadcast' || !wm || !wm.message) return null;
    if (wm.key) { learn(s, jid, wm.key.remoteJidAlt); learn(s, jid, wm.key.senderPn); learn(s, wm.key.participant, wm.key.participantAlt); learn(s, wm.key.participant, wm.key.participantPn); }
    { const pm = unwrap(wm.message).protocolMessage; if (isRevoke(pm)) { if (!(wm.key && wm.key.fromMe)) markDeleted(uid, s, pm.key, jid); return null; } }   // someone deleted a message: keep it, just flag it
    { const ed = editInfo(wm.message); if (ed) { applyEdit(uid, s, ed.key, jid, ed.msg, ed.ts); return null; } }
    { const sem = unwrap(wm.message).secretEncryptedMessage || wm.message.secretEncryptedMessage; if (sem) { if (sem.secretEncType !== 1 && sem.secretEncType !== 'EVENT_EDIT') editSecret(uid, s, jid, wm, sem); return null; } }
    const k = kindText(wm.message); if (!k) return null;
    const out = !!(wm.key && wm.key.fromMe), id = (wm.key && wm.key.id) || crypto.randomBytes(6).toString('hex');
    const list = s.msgs.get(jid) || []; if (list.some(m => m.id === id)) return null;
    const m = { id, out, at: tsOf(wm.messageTimestamp), kind: k.kind, text: k.text || '', label: k.label || '', from: out ? '' : (wm.pushName || ''), status: out ? (ST[wm.status] || 'sent') : '' };
    { const sc = secOf(wm.message); if (sc) m.sec = sc; }
    if (k.kind === 'other') { m.dbg = shapeOf(wm.message).slice(0, 200); warn('WhatsApp unknown message', m.dbg); }
    ['thumb', 'mime', 'name', 'size', 'dur', 'lat', 'lon'].forEach(f => { if (k[f] !== undefined && k[f] !== '') m[f] = k[f]; });
    if (k.media) { m.media = 1; s.raw.set(jid + '|' + id, wm); if (s.raw.size > MAX_RAW) s.raw.delete(s.raw.keys().next().value); }
    if (wm.key) m.key = { id: wm.key.id, fromMe: !!wm.key.fromMe, remoteJid: wm.key.remoteJid, participant: wm.key.participant };
    list.push(m); list.sort((a, b) => a.at - b.at); if (list.length > MAX_MSGS) list.splice(0, list.length - MAX_MSGS); s.msgs.set(jid, list);
    const c = chatOf(s, jid);
    if (!c.name && !out && wm.pushName && !c.group) c.pn = wm.pushName;
    if (m.at >= c.at) { c.at = m.at; c.last = k.kind === 'text' ? (k.text || '').slice(0, 80) : ((k.label || '') + (k.text && k.kind !== 'geo' && k.kind !== 'contact' ? ' ' + k.text.slice(0, 60) : '')); c.out = out; }
    if (!out && live) c.unread = (c.unread || 0) + 1;
    saveSoon(uid, s);
    return m;
  }


  /* ---------- WhatsApp helper bot: expense / attendance by chat ----------
     When a message arrives from one of the numbers in WA_BOT_FROM (comma separated, default below) the linked WhatsApp replies with a menu:
       1 = Expense  (amount + note, then pick a category)      2 = Attendance  (1 = Present, 2 = Absent -> marked for today)
     Works only for the main admin's linked WhatsApp.  "0" / "menu" / "cancel" starts again.  A half-finished chat is forgotten after 10 minutes. */
  const BOT_DEFAULT = String(env.WA_BOT_FROM || '96706492422').split(',').map(x => x.replace(/\D/g, '')).filter(Boolean);   // used until you save your own list in the app
  let botCfg = null;                                                   // { on, nums:[digits], bind:{ number: {acc, emp, label} } } - edited in the app (Deploy tab > WhatsApp helper)
  const botNorm = j => {
    j = j || {};
    const nums = [...new Set((Array.isArray(j.nums) ? j.nums : BOT_DEFAULT).map(x => String(x).replace(/\D/g, '')).filter(x => x.length >= 8 && x.length <= 15))].slice(0, 20);
    const bind = {}; nums.forEach(n => { const b = j.bind && j.bind[n]; if (b && b.acc) bind[n] = { acc: String(b.acc).slice(0, 60), emp: String(b.emp || '').slice(0, 60), label: String(b.label || '').slice(0, 90) }; });
    return { on: j.on === undefined ? true : (j.on !== false && j.on !== 'false'), nums, bind };
  };
  async function botGet() {
    if (botCfg) return botCfg;
    let j = null; try { const raw = await withWb(() => PROPS().getProperty('WA_BOT_CFG') || ''); if (raw) j = JSON.parse(raw); } catch (e) {}
    return (botCfg = botNorm(j));
  }
  const BOT_TTL = 10 * 60 * 1000;
  const botState = new Map(), botQ = new Map(), botSeen = new Map();
  const botMatch = (pn, list) => { const d = digits(pn); if (!d) return ''; return list.find(c => d === c || d === CC + c || d.endsWith(c)) || ''; };   // -> the saved number that matches, or ''
  const botDup = (wm, text) => {                                       // WhatsApp can hand us the same message twice: answer it only once
    const now = Date.now(), k1 = 'i' + String((wm.key && wm.key.id) || ''), k2 = 't' + wm.key.remoteJid + '|' + String(wm.messageTimestamp || '') + '|' + text;
    const k3 = 'x' + wm.key.remoteJid + '|' + text, quick = text && botSeen.has(k3) && now - botSeen.get(k3) < 3000;   // same words in the same chat within 3 s = the same message arriving twice
    const dup = (wm.key && wm.key.id && botSeen.has(k1)) || (wm.messageTimestamp && botSeen.has(k2)) || quick;
    botSeen.set(k1, now); botSeen.set(k2, now); if (text) botSeen.set(k3, now);
    if (botSeen.size > 600) { botSeen.forEach((v, k) => { if (now - v > 120000) botSeen.delete(k); }); if (botSeen.size > 600) botSeen.clear(); }
    return !!dup;
  };
  const botToday = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value])); return { date: p.year + '-' + p.month + '-' + p.day, y: Number(p.year), m: Number(p.month), d: Number(p.day) }; };
  const BOT_MENU = '👋 *Kya record karna hai?*\n\n1️⃣  Expense\n2️⃣  Attendance\n3️⃣  Bill PDF\n4️⃣  VCS (website update)\n5️⃣  Rack Mapping (item kis rack/row me hai)\n\n_Number bhejo: 1, 2, 3, 4 ya 5_';
  /* run fn as the account this number belongs to, with fresh sheet data (changes are saved).
     sec = 'att' | 'exp': that account must have that right (edit = true -> needs EDIT access, otherwise view is enough) */
  const botRun = (fn, acc, sec, edit) => withWb(() => {
    const set = globalThis.readSettings_().values, a = globalThis.getAccount_(acc || 'ADMIN', set);
    if (!a || a.active === false) throw new Error('Is number ka account nahi mila ya band hai.');
    if (sec) { const lv = (a.perms || {})[sec]; if (!(lv === 'edit' || (!edit && lv === 'view'))) throw new Error('Is account ko ' + (sec === 'att' ? 'attendance' : sec === 'rack' ? 'rack mapping' : 'expense') + (edit ? ' edit karne' : ' dekhne') + ' ki permission nahi hai.'); }
    globalThis.buildCtx_(a.id);
    return fn(a);
  });
  const botErr = e => String((e && e.message) || e).slice(0, 150);

  /* a small PDF writer (no library needed): title + table of expenses + total */
  function botPdf(o) {
    const esc = x => String(x == null ? '' : x).replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?').replace(/([\\()])/g, '\\$1');
    const cut = (x, n) => { x = String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 2) + '..' : x; };
    const T = (x, y, sz, b, s) => 'BT /F' + (b ? 2 : 1) + ' ' + sz + ' Tf ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Td (' + esc(s) + ') Tj ET\n';
    const wAmt = s => { let w = 0; for (const ch of String(s)) w += (ch === ',' || ch === '.' || ch === ' ') ? 2.78 : 5.56; return w; };
    const money = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const W = 595, H = 842, M = 40, R = 555, pages = []; let c = '', y = 0;
    const tableHead = () => { c += T(M, y, 10, 1, 'Date') + T(105, y, 10, 1, 'Category') + T(235, y, 10, 1, 'Note') + T(R - wAmt('Amount (Rs.)') * 1.0, y, 10, 1, 'Amount (Rs.)'); y -= 6; c += M + ' ' + y.toFixed(1) + ' m ' + R + ' ' + y.toFixed(1) + ' l S\n'; y -= 14; };
    const newPage = first => {
      if (c) pages.push(c); c = ''; y = H - 50;
      if (first) { c += T(M, y, 18, 1, o.title); y -= 22; c += T(M, y, 10, 0, 'Name: ' + o.who); y -= 14; c += T(M, y, 10, 0, 'Period: ' + o.period); y -= 14; c += T(M, y, 10, 0, 'Generated: ' + o.when); y -= 24; }
      tableHead();
    };
    newPage(true);
    let total = 0;
    o.rows.forEach(r => {
      if (y < 70) newPage(false);
      const a = money(r.amount); total += Number(r.amount) || 0;
      c += T(M, y, 10, 0, r.date) + T(105, y, 10, 0, cut(r.category, 22)) + T(235, y, 10, 0, cut(r.note, 40)) + T(R - wAmt(a), y, 10, 0, a); y -= 16;
    });
    if (y < 90) newPage(false);
    y -= 4; c += M + ' ' + y.toFixed(1) + ' m ' + R + ' ' + y.toFixed(1) + ' l S\n'; y -= 18;
    c += T(M, y, 12, 1, 'Total: Rs. ' + money(total) + '    (' + o.rows.length + ' entries)');
    pages.push(c);
    const objs = [null, '<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
    const kids = [];
    pages.forEach((pc, i) => {
      const po = 5 + 2 * i, co = 6 + 2 * i, body = pc + T(M, 28, 8, 0, 'Page ' + (i + 1) + ' of ' + pages.length);
      kids.push(po + ' 0 R');
      objs[po] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + co + ' 0 R >>';
      objs[co] = '<< /Length ' + Buffer.byteLength(body, 'latin1') + ' >>\nstream\n' + body + 'endstream';
    });
    objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>';
    let out = '%PDF-1.4\n'; const offs = [];
    for (let k = 1; k < objs.length; k++) { offs[k] = Buffer.byteLength(out, 'latin1'); out += k + ' 0 obj\n' + objs[k] + '\nendobj\n'; }
    const xo = Buffer.byteLength(out, 'latin1');
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n' + offs.slice(1).map(x => String(x).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xo + '\n%%EOF\n';
    return Buffer.from(out, 'latin1');
  }

  /* option 4 (VCS): files sent in the chat are committed to GitHub in ONE commit; Render then redeploys the website */
  const VCS_WAIT = 15000;                                               // seconds of quiet after the last file -> upload
  async function botVcsFlush(s, jid, cur) {
    if (botState.get(jid) !== cur || cur.step !== 'vcsFile' || cur.busy) return;
    if (cur.timer) { clearTimeout(cur.timer); cur.timer = null; }
    const files = cur.files || []; if (!files.length) return;
    cur.busy = true;
    const say = async t => { await new Promise(r => setTimeout(r, 500)); return s.sock.sendMessage(jid, { text: t }); };
    await say('⏳ ' + files.length + ' file GitHub pe upload ho rahi hai…');
    try {
      const r = await deployFiles(files.map(f => ({ path: f.path, buf: f.buf })), 'Update ' + files.map(f => f.path.split('/').pop()).slice(0, 6).join(', ') + ' (from WhatsApp)');
      botState.delete(jid);
      if (r.unchanged) return say('ℹ️ Ye file(s) GitHub par pehle se bilkul same hain — kuch badla nahi, isliye deploy nahi hoga.\n\n_Dobara kuch karna ho to *help* bhejo._');
      return say('✅ *GitHub pe upload ho gaya*\n📄 ' + r.changed.map(x => x.path + (x.isNew ? ' (new)' : '')).join(', ') + (r.sha ? '\n🔖 Commit ' + r.sha : '')
        + (r.skipped && r.skipped.length ? '\n➖ Same thi, chhodi: ' + r.skipped.join(', ') : '')
        + '\n\n🚀 Render ab deploy karega — website 1-3 minute me live ho jayegi.\n\n_Dobara kuch karna ho to *help* bhejo._');
    } catch (e) { botState.delete(jid); return say('❌ Upload nahi hua: ' + botErr(e) + '\n\n_Dobara koshish ke liye *help* bhejo._'); }
  }
  async function botVcsFile(s, jid, cur, wm, low) {                      // one message while waiting for files
    const say = async t => { await new Promise(r => setTimeout(r, 500)); return s.sock.sendMessage(jid, { text: t }); };
    if (['done', 'ok', 'upload'].includes(low)) { if (!(cur.files || []).length) return say('📎 Pehle file bhejo (Document ke roop me).'); return botVcsFlush(s, jid, cur); }
    const k = wm && wm.message ? kindText(wm.message) : null;
    if (!k || k.kind !== 'file') return say('📎 File ko *Document* ke roop me bhejo (📎 → Document).\n\n_(0 = cancel)_');
    if ((k.size || 0) > 25 * 1048576) return say('❌ *' + k.name + '* 25 MB se badi hai.');
    let name = String(k.name || '').replace(/\s*\(\d+\)(\.[^.\/]+)?$/, '$1');   // "app (1).js" -> "app.js"
    const cap = String(k.text || '').trim(), path = /^[\w.\-\/]+\.\w+$/.test(cap) && !cap.startsWith('/') ? cap : name;   // caption like public/app.js = folder
    if (!/^[\w.\-\/]+$/.test(path)) return say('❌ File ka naam sahi nahi (*' + path + '*). Naam me space ya khaas chinh na ho — ya caption me sahi path likho.');
    let buf; try { buf = await L().downloadMediaMessage(wm, 'buffer', {}, { logger: quietLog(), reuploadRequest: s.sock.updateMediaMessage }); } catch (e) { return say('❌ File download nahi hui, dobara bhejo.'); }
    if (!buf || !buf.length) return say('❌ File khali mili, dobara bhejo.');
    if (/\.(js|gs|json)$/i.test(path)) {                                 // a broken script would break the live website: refuse it here
      try { const txt = buf.toString('utf8'); if (/\.json$/i.test(path)) JSON.parse(txt); else new (require('vm').Script)(txt.replace(/^#!.*/, ''), { filename: path }); }
      catch (e) { return say('❌ *' + path + '* me syntax error hai, upload nahi ki:\n' + botErr(e) + '\n\nSahi file dobara bhejo.'); }
    }
    cur.files = (cur.files || []).filter(f => f.path !== path); cur.files.push({ path, buf });
    if (cur.timer) clearTimeout(cur.timer);
    cur.timer = setTimeout(() => { botQ.set(jid, (botQ.get(jid) || Promise.resolve()).then(() => botVcsFlush(s, jid, cur)).catch(e => warn('WhatsApp bot', e && e.message))); }, VCS_WAIT);
    return say('📎 *' + path + '* mil gayi (' + cur.files.length + ' file)\nAur file bhejo, ya *done* likho. Warna ' + (VCS_WAIT / 1000) + ' second me apne aap upload ho jayegi.');
  }

  const BOT_HI = /^help$/;                                              // ONLY the word "help" opens the menu
  async function botStep(s, jid, text, num, wm) {
    const to = jid;                                                     // answer in the very same chat the message came from
    const say = async t => { await new Promise(r => setTimeout(r, 700)); return s.sock.sendMessage(to, { text: t }); };
    const t = String(text || '').trim(), low = t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    let cur = botState.get(jid); if (cur && Date.now() - cur.at > BOT_TTL) { cur = null; botState.delete(jid); }
    const ask = (c, m) => { c.prompt = m; return say(m); };            // remember the question, so a wrong answer just repeats it
    const menu = () => { const c = { step: 'menu', at: Date.now() }; botState.set(jid, c); return ask(c, BOT_MENU); };
    if (BOT_HI.test(low)) return menu();
    if (!cur) return;                                                   // not in a chat and not "help" -> stay silent
    if (['0', 'cancel', 'stop'].includes(low)) { if (cur.timer) clearTimeout(cur.timer); botState.delete(jid); return say('❎ Cancel ho gaya. Dobara shuru karne ke liye *help* bhejo.'); }
    cur.at = Date.now();
    const cfg = await botGet(), bd = (cfg.bind || {})[num] || {}, acc = bd.acc || 'ADMIN', wantEmp = bd.emp || '';   // this number belongs to ONE account (+ one employee): it can only touch that data
    const again = () => cur.step === 'menu' ? say('🙏 Number *1* (Expense), *2* (Attendance), *3* (Bill PDF), *4* (VCS) ya *5* (Rack) bhejo. Cancel: *0*') : undefined;   // wrong answer inside a step: stay quiet (no "samajh nahi aaya" reply), the question above is still open
    const stop = (e, pre) => { botState.delete(jid); return say('❌ ' + pre + botErr(e)); };
    if (cur.step === 'vcsFile') return botVcsFile(s, jid, cur, wm, low);
    if (cur.step === 'menu') {
      if (low === '4') {
        if (acc !== 'ADMIN') return say('❌ Ye option sirf main admin ke number ke liye hai.');
        if (typeof deployFiles !== 'function') { botState.delete(jid); return say('❌ GitHub deploy yahan jura nahi hai.'); }
        cur.step = 'vcsFile'; cur.files = [];
        return ask(cur, '🌐 *VCS — website update*\n\nFile ko *Document* ke roop me bhejo (📎 → Document). Ek ya kai file bhej sakte ho — sab ek hi baar me GitHub pe jayengi aur website live hogi.\n\n_Folder me daalni ho to file ke caption me path likho, jaise_ *public/app.js*\n\n_(0 = cancel)_');
      }
      if (low === '1') {
        try { await botRun(() => true, acc, 'exp', true); } catch (e) { return stop(e, ''); }
        cur.step = 'expAmt'; return ask(cur, '💸 *Expense*\n\nAmount aur note bhejo.\nJaise: *150 chai*\n\n_(0 = cancel)_');
      }
      if (low === '2') {
        let e; try { e = await botRun(() => { const l = globalThis.readEmployees_(), x = l.find(y => y.id === wantEmp) || l[0]; return x ? { id: x.id, name: x.name } : null; }, acc, 'att', true); } catch (er) { return stop(er, ''); }
        if (!e) { botState.delete(jid); return say('❌ Attendance me koi employee nahi mila.'); }
        cur.emp = e.id; cur.empName = e.name; cur.step = 'attSt';
        return ask(cur, '🗓️ *' + (e.name || 'Attendance') + '*\n\n1️⃣  Present\n2️⃣  Absent\n\n_(0 = cancel)_');
      }
      if (low === '5') {
        try { await botRun(() => true, acc, 'rack', false); } catch (e) { return stop(e, ''); }
        cur.step = 'rackQ';
        return ask(cur, '📦 *Rack Mapping*\n\nINS number bhejo — main bataunga wo kis *rack* aur *row* me hai.\nJaise: *103* (reply: Right 3 · B)\n\n_(0 = cancel)_');
      }
      if (low === '3') {
        const n0 = botToday(), MN0 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const since = (n0.y - 1) + '-' + String(n0.m).padStart(2, '0');            // last 12 months only (this month + the 11 before it)
        let ms; try { ms = await botRun(() => { const inc = new Set(globalThis.readCategories_().filter(c => c.type === 'Income').map(c => c.name)); return [...new Set(globalThis.readExpenses_().filter(e => !inc.has(e.category) && /^\d{4}-\d{2}/.test(e.date)).map(e => e.date.slice(0, 7)))].filter(k => k > since).sort().reverse(); }, acc, 'exp', false); } catch (e) { return stop(e, ''); }
        if (!ms.length) { botState.delete(jid); return say('🧾 Pichhle 1 saal me koi expense record nahi hai.\n\n_Dobara kuch karna ho to *help* bhejo._'); }
        cur.months = ms; cur.step = 'billPer';
        return ask(cur, '🧾 *Bill PDF* — kaun sa mahina?\n\n' + ms.map((k, i) => (i + 1) + '. ' + MN0[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4)).join('\n') + '\n\n_(0 = cancel)_');
      }
      return again();
    }
    if (cur.step === 'rackQ') {
      const norm = x => String(x == null ? '' : x).trim().toLowerCase().replace(/^ins[\s.\-:#_]*/, '').replace(/[^a-z0-9]/g, ''), qc = norm(t), ql = t.toLowerCase().replace(/\s+/g, ' ').trim(); if (!qc) return;
      let list; try {
        list = await botRun(() => {                                       // same data as the Rack Mapping screen: every rack (Left 1-11, Right 1-15, Front 1-3) x row x field
          const cfg = globalThis.readRackCfg_(), fields = cfg.fields || [], insF = fields.filter(f => /\bins\b/i.test(f)), out = [];
          const SIDES = [['Left', 0, 11], ['Right', 20, 15], ['Front', 40, 3]];
          SIDES.forEach(([side, base, cnt]) => { for (let n = 1; n <= cnt; n++) {
            const key = String(base + n), rows = cfg.rows[key] || cfg.rows['*'] || ['a', 'b', 'c', 'd'];
            let o = cfg.data[key] || {}; if (Object.keys(o).some(k => typeof o[k] !== 'object')) { o = { [rows[0]]: o }; }
            Object.keys(o).forEach(r => { const v = o[r] || {};
              const toks = []; insF.forEach(f => String(v[f] || '').split(/[,;\/&\n]+/).forEach(x => { x = x.trim(); if (x) toks.push(x); }));
              const bits = fields.filter(f => !insF.includes(f) && String(v[f] || '').trim()).map(f => f + ': ' + String(v[f]).trim());
              if (toks.length || bits.length) out.push({ side, n, row: String(r).toUpperCase(), toks, bits });
            });
          } });
          return out;
        }, acc, 'rack', false);
      } catch (e) { return stop(e, 'Rack dekh nahi paya: '); }
      let hit = list.filter(x => x.toks.some(k => norm(k) === qc));                                       // exact INS number
      if (!hit.length && qc.length >= 2) hit = list.filter(x => x.toks.some(k => norm(k).includes(qc)));   // part of an INS number
      if (!hit.length) hit = list.filter(x => x.bits.some(b => b.toLowerCase().includes(ql)));          // any other typed value (scheme, carton ...)
      hit.sort((a, b) => ['Left', 'Right', 'Front'].indexOf(a.side) - ['Left', 'Right', 'Front'].indexOf(b.side) || a.n - b.n || a.row.localeCompare(b.row));
      if (!hit.length) return say('🔎 INS *' + t.slice(0, 40) + '* kisi rack me nahi mila.\n\nDusra number bhejo, ya *0* = cancel.');
      const lines = hit.slice(0, 12).map(x => '📦 *' + x.side + ' ' + x.n + ' · ' + x.row + '*   _(Rack ' + x.side + ' ' + x.n + ', Row ' + x.row + ')_' + (x.toks.length ? '\n🔢 INS ' + x.toks.join(', ') : '') + (x.bits.length ? '\n' + x.bits.join(' · ') : ''));
      return say('🔎 *' + t.slice(0, 40) + '*  →  ' + hit.length + ' jagah\n\n' + lines.join('\n\n') + (hit.length > 12 ? '\n\n_…aur ' + (hit.length - 12) + ' jagah._' : '') + '\n\n_Aur dekhna ho to dusra INS number bhejo. *0* = band._');
    }
    if (cur.step === 'attSt') {
      const code = low === '1' || low === 'present' || low === 'p' ? 'P' : low === '2' || low === 'absent' || low === 'a' ? 'A' : '';
      if (!code) return again();
      const n = botToday();
      try {
        await botRun(() => {
          const yr = globalThis.publicSettings_(globalThis.readSettings_()).year;
          if (yr && Number(yr) !== n.y) throw new Error('Attendance register ' + yr + ' ka hai, aaj ' + n.y + ' hai.');
          return globalThis.setAttendance_({ emp: cur.emp, entries: [{ month: n.m, day: n.d, code }] });
        }, acc, 'att', true);
      } catch (e) { return stop(e, 'Attendance mark nahi hui: '); }
      botState.delete(jid);
      return say((code === 'P' ? '✅ *Present*' : '❌ *Absent*') + ' mark ho gaya\n👤 ' + (cur.empName || '') + '\n📅 ' + n.d + '-' + String(n.m).padStart(2, '0') + '-' + n.y + '\n\n_Dobara kuch record karna ho to *help* bhejo._');
    }
    if (cur.step === 'expAmt') {
      const m = /(\d+(?:[.,]\d+)?)/.exec(t); if (!m) return;
      const amount = Number(m[1].replace(',', '.')); if (!(amount > 0)) return say('Amount 0 se zyada hona chahiye.');
      let ct; try { ct = await botRun(a => { const l = globalThis.readCategories_(); return { who: String(a.name || a.username || ''), exp: l.filter(c => c.type !== 'Income').map(c => c.name), inc: l.filter(c => c.type === 'Income').map(c => c.name) }; }, acc, 'exp', true); } catch (e) { return stop(e, ''); }   // this user's own categories only
      const cats = ct.exp.concat(ct.inc);
      if (!cats.length) { botState.delete(jid); return say('❌ Koi category nahi mili. Pehle app me category banao.'); }
      cur.amount = amount; cur.note = t.replace(m[0], '').replace(/\s+/g, ' ').trim(); cur.cats = cats; cur.inc = new Set(ct.inc); cur.step = 'expCat';
      const lines = (arr, off) => arr.map((c, i) => (off + i + 1) + '. ' + c).join('\n');
      return ask(cur, '💸 ₹' + amount + (cur.note ? ' · ' + cur.note : '') + (ct.who ? '\n👤 ' + ct.who : '') + '\n\n*Category chuno (number bhejo):*' + (ct.exp.length ? '\n\n*Expense*\n' + lines(ct.exp, 0) : '') + (ct.inc.length ? '\n\n*Income*\n' + lines(ct.inc, ct.exp.length) : '') + '\n\n_(0 = cancel)_');
    }
    if (cur.step === 'expCat') {
      const c = cur.cats[parseInt(low, 10) - 1] || cur.cats.find(x => low && String(x).toLowerCase() === low) || cur.cats.find(x => low.length > 1 && String(x).toLowerCase().includes(low)); if (!c) return again();
      const n = botToday();
      try { await botRun(() => globalThis.addExpense_({ date: n.date, category: c, amount: cur.amount, note: cur.note }), acc, 'exp', true); }
      catch (e) { return stop(e, 'Expense save nahi hua: '); }
      botState.delete(jid);
      return say('✅ *' + (cur.inc && cur.inc.has(c) ? 'Income' : 'Expense') + ' save ho gaya*\n💰 ₹' + cur.amount + '\n🏷️ ' + c + (cur.note ? '\n📝 ' + cur.note : '') + '\n📅 ' + n.date + '\n\n_Dobara kuch record karna ho to *help* bhejo._');
    }
    if (cur.step === 'billPer') {
      const mk = /^\d+$/.test(low) ? (cur.months || [])[parseInt(low, 10) - 1] : ''; if (!mk) return again();          // only the months that were listed
      const n = botToday(), pad = x => String(x).padStart(2, '0'), MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const from = mk + '-01', till = mk + '-31', label = MN[Number(mk.slice(5, 7)) - 1] + ' ' + mk.slice(0, 4);
      let data;
      try {
        data = await botRun(a => {
          const inc = new Set(globalThis.readCategories_().filter(c => c.type === 'Income').map(c => c.name));
          const rows = globalThis.readExpenses_().filter(e => e.date >= from && e.date <= till && !inc.has(e.category)).sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
          const emp = wantEmp ? globalThis.readEmployees_().find(y => y.id === wantEmp) : null;
          return { rows, who: (emp && emp.name) || a.name || a.username || 'User' };
        }, acc, 'exp', false);
      } catch (e) { return stop(e, 'Bill nahi ban saka: '); }
      botState.delete(jid);
      if (!data.rows.length) return say('🧾 ' + label + ' me koi expense nahi mila.\n\n_Dobara kuch karna ho to *help* bhejo._');
      const when = pad(n.d) + '-' + pad(n.m) + '-' + n.y;
      let buf; try { buf = botPdf({ title: 'Expense Bill', who: data.who, period: label, when, rows: data.rows }); } catch (e) { return say('❌ PDF nahi ban saka: ' + botErr(e)); }
      await new Promise(r => setTimeout(r, 700));
      const tot = data.rows.reduce((x, r) => x + (Number(r.amount) || 0), 0);
      return s.sock.sendMessage(to, { document: buf, mimetype: 'application/pdf', fileName: 'Expense-Bill-' + label.replace(/\s+/g, '-') + '.pdf', caption: '🧾 *Expense Bill* — ' + label + '\n💰 Total: ₹' + tot.toLocaleString('en-IN') + ' (' + data.rows.length + ' entries)\n\n_Dobara kuch karna ho to *help* bhejo._' });
    }
    botState.delete(jid);
  }
  function botIn(uid, s, wm) {                                         // called for every live message; ignores everything except the allowed numbers
    try {
      if (uid !== 'ADMIN' || !wm || !wm.key || wm.key.fromMe || !wm.message || !s.sock || s.status !== 'open') return;
      const jid = wm.key.remoteJid; if (!/@(s\.whatsapp\.net|lid)$/.test(jid || '')) return;
      if (Date.now() - tsOf(wm.messageTimestamp) > 120000) return;          // old message (history sync) - never answer those
      botGet().then(c => {
        const num = c.on && c.nums.length ? botMatch(pnOf(s, jid), c.nums) : ''; if (!num) return;
        const k = kindText(wm.message), text = k && k.kind === 'text' ? (k.text || '') : '';
        if (botDup(wm, text || (k && k.kind !== 'text' ? '#' + String(wm.key.id || '') : ''))) return;                                   // the same message again -> no second answer
        const prev = botQ.get(jid) || Promise.resolve();                // one message at a time per chat
        botQ.set(jid, prev.then(() => botStep(s, jid, text, num, wm)).catch(e => warn('WhatsApp bot', e && e.message)));
      }).catch(e => warn('WhatsApp bot', e && e.message));
    } catch (e) { warn('WhatsApp bot', e && e.message); }
  }

  /* ---------- the WhatsApp connection ---------- */
  async function open(uid) {
    const s = st(uid); if (s.sock || s.status === 'starting') return s;
    s.status = 'starting'; s.wantOn = true; const gen = ++s.gen;
    try { return await open2(uid, s, gen); }
    catch (e) {                                           // never stay stuck on "Getting the QR code…"
      warn('WhatsApp start failed', e && e.message);
      if (s.gen === gen) { s.sock = null; s.status = 'idle'; s.wantOn = false; s.err = 'WhatsApp could not start: ' + String((e && e.message) || e).slice(0, 140); }
      return s;
    }
  }
  async function open2(uid, s, gen) {
    const B = L(), makeWASocket = B.default || B.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = B;
    fs.mkdirSync(udir(uid), { recursive: true }); loadStore(uid, s);
    const { state, saveCreds } = await useMultiFileAuthState(udir(uid));
    let version; try { version = (await Promise.race([fetchLatestBaileysVersion(), new Promise((_, no) => setTimeout(() => no(new Error('version timeout')), 8000))])).version; } catch (e) {}
    /* 3 ways to connect, tried in turn when WhatsApp closes the connection (428 / 405 / timeouts) */
    const vi = (s.vi || 0) % 3;
    const browser = vi === 0 ? (Browsers && Browsers.macOS ? Browsers.macOS('Desktop') : ['Mac OS', 'Desktop', '14.4.1'])       // "Desktop" = WhatsApp sends the full chat list + history
      : vi === 1 ? (Browsers && Browsers.ubuntu ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'])
      : (Browsers && Browsers.appropriate ? Browsers.appropriate('Chrome') : ['Mac OS', 'Chrome', '14.4.1']);
    const useVer = vi !== 1 && version;                                                      // variant 1 uses the library's own built-in version
    const sock = makeWASocket(Object.assign({ auth: state, printQRInTerminal: false, logger: quietLog(), markOnlineOnConnect: false, syncFullHistory: vi === 0, shouldSyncHistoryMessage: () => true, browser,
      connectTimeoutMs: 45000, defaultQueryTimeoutMs: 60000, keepAliveIntervalMs: 25000,
      getMessage: async key => { const m = key && s.sent && s.sent.get(key.id); return m || undefined; } }, useVer ? { version } : {}));      // WhatsApp asks "send this again" when a phone could not open a message: answer it from what we sent
    s.sock = sock;
    { s.sent = s.sent || new Map(); const raw = sock.sendMessage.bind(sock);
      sock.sendMessage = async function () { const r = await raw.apply(null, arguments); try { if (r && r.key && r.key.id && r.message) { s.sent.set(r.key.id, r.message); if (s.sent.size > 800) s.sent.delete(s.sent.keys().next().value); } } catch (e) {} return r; }; }
    const wd = setTimeout(() => { if (s.gen === gen && s.status === 'starting') { s.err = 'WhatsApp did not answer in time. Tap “Show QR code” to try again.'; try { sock.end(undefined); } catch (e) {} } }, 30000);   // no QR in 30 s -> give up with a message
    sock.ev.on('creds.update', () => { Promise.resolve(saveCreds()).catch(() => {}).then(() => scheduleBackup(uid, 5000)); });   // keep the sheet copy of the login up to date
    sock.ev.on('connection.update', async u => {
      if (s.gen !== gen) return;
      const { connection, lastDisconnect, qr } = u;
      if (qr) { try { s.qr = await qrLib().toDataURL(qr, { margin: 1, width: 320 }); s.status = 'qr'; s.err = ''; clearTimeout(wd); } catch (e) { warn('WhatsApp QR error', e && e.message); s.err = 'Could not draw the QR code: ' + String((e && e.message) || e).slice(0, 100); } }
      if (connection === 'open') {
        clearTimeout(wd); s.err = ''; scheduleBackup(uid, 8000);
        setTimeout(() => { if (s.gen === gen && s.status === 'open' && s.contacts.size < 8) syncContacts(s); }, 20000);   // few contacts so far -> ask the phone for them
        s.status = 'open'; s.qr = ''; s.tries = 0;
        const me = (sock.user || {}); s.name = me.name || me.verifiedName || ''; s.number = numOf(me.id || '');
        setTimeout(() => { if (s.gen === gen && s.status === 'open') { resolveLids(s).then(() => saveSoon(uid, s)); } }, 6000);
        /* people who do not have your number saved see your WhatsApp *profile name* — keep it "VCS" (change with env WA_PROFILE_NAME; set it to "-" to leave the name alone) */
        const wantName = String(env.WA_PROFILE_NAME == null ? 'VCS' : env.WA_PROFILE_NAME).trim();
        if (uid === 'ADMIN' && wantName && wantName !== '-' && typeof sock.updateProfileName === 'function' && s.name !== wantName) {
          setTimeout(() => { if (s.gen === gen && s.status === 'open') sock.updateProfileName(wantName).then(() => { s.name = wantName; }).catch(e => warn('WhatsApp profile name', e && e.message)); }, 4000);
        }
        try { const g = await sock.groupFetchAllParticipating(); Object.keys(g || {}).forEach(id => { const c = chatOf(s, id); setName(c, g[id].subject); }); saveSoon(uid, s); } catch (e) {}
      }
      if (connection === 'close') {
        clearTimeout(wd);
        s.sock = null; s.qr = '';
        const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
        if (code === DisconnectReason.loggedOut) { s.status = 'idle'; s.wantOn = false; s.chats.clear(); s.msgs.clear(); s.raw.clear(); s.pics.clear(); s.stat.clear(); s.media.clear(); s.name = s.number = ''; s.loaded = false; wipe(uid); forgetBackup(uid); return; }
        s.status = 'idle';
        const why = lastDisconnect && lastDisconnect.error && lastDisconnect.error.message ? String(lastDisconnect.error.message).slice(0, 80) : '';
        if (code !== DisconnectReason.restartRequired) { s.vi = (s.vi || 0) + 1; s.err = 'WhatsApp closed the connection (code ' + (code || '?') + (why ? ': ' + why : '') + ') · Baileys ' + libVer() + ' · Node ' + process.version + (s.tries >= 2 ? ' · trying another way…' : ''); warn('WhatsApp close', code, why); }
        if (s.wantOn && s.tries >= 6) { s.wantOn = false; s.err = (s.err || 'Could not get a QR code.') + ' — gave up after 6 tries. Tap “Show QR code” to try again.'; }
        if (s.wantOn && s.tries < 6) { s.tries++; const wait = code === DisconnectReason.restartRequired ? 300 : Math.min(30000, 2500 * s.tries); setTimeout(() => { if (s.wantOn && !s.sock) open(uid).catch(e => warn('WhatsApp reconnect', e && e.message)); }, wait); }
      }
    });
    sock.ev.on('messaging-history.set', h => {
      s.hist.chats += (h.chats || []).length; s.hist.msgs += (h.messages || []).length;
      (h.lidPnMappings || []).forEach(m => learn(s, m.lid, m.pn));
      (h.chats || []).forEach(c => { learn(s, c.id, c.pnJid); learn(s, c.id, c.lidJid); if (isChat(c.id)) { const x = chatOf(s, c.id); setName(x, c.name); if (c.unreadCount > 0) x.unread = c.unreadCount; if (c.conversationTimestamp && !x.at) x.at = tsOf(c.conversationTimestamp); } });
      (h.contacts || []).forEach(c => { addContact(s, c); if (isChat(c.id) && (c.name || c.notify)) { const x = chatOf(s, c.id); if (c.name) x.name = c.name; else if (!x.name) x.pn = c.notify; } });
      (h.messages || []).forEach(wm => addMsg(uid, s, wm.key && wm.key.remoteJid, wm, false));
      saveSoon(uid, s);
    });
    try { sock.ev.on('lid-mapping.update', u => { if (u && u.lid && u.pn) { learn(s, u.lid, u.pn); saveSoon(uid, s); } }); } catch (e) {}
    sock.ev.on('chats.upsert', cs => { cs.forEach(c => { if (isChat(c.id)) setName(chatOf(s, c.id), c.name); }); saveSoon(uid, s); });
    sock.ev.on('chats.update', cs => cs.forEach(c => { const x = c.id && s.chats.get(c.id); if (x && c.unreadCount !== undefined && c.unreadCount !== null) x.unread = Math.max(0, c.unreadCount); }));
    sock.ev.on('contacts.upsert', cs => { cs.forEach(c => { addContact(s, c); if (isChat(c.id) && (c.name || c.notify)) { const x = chatOf(s, c.id); if (c.name) x.name = c.name; else if (!x.name) x.pn = c.notify; } }); saveSoon(uid, s); });
    sock.ev.on('contacts.update', cs => cs.forEach(c => { addContact(s, c); const x = c.id && s.chats.get(c.id); if (x && (c.name || c.notify)) { if (c.name) x.name = c.name; else if (!x.name) x.pn = c.notify; } }));
    sock.ev.on('groups.update', gs => gs.forEach(g => { const x = g.id && s.chats.get(g.id); if (x && g.subject) x.name = g.subject; }));
    sock.ev.on('messages.upsert', ev => (ev.messages || []).forEach(wm => { addMsg(uid, s, wm.key && wm.key.remoteJid, wm, ev.type === 'notify'); if (ev.type === 'notify') botIn(uid, s, wm); }));
    sock.ev.on('call', calls => (calls || []).forEach(cl => {        // incoming / missed WhatsApp calls show up in the chat like on WhatsApp Web
      try {
        const jid = cl.chatId && isChat(cl.chatId) ? cl.chatId : cl.from; if (!isChat(jid)) return;
        const mid = 'call_' + cl.id, list = s.msgs.get(jid) || [], v = cl.isVideo ? 'video' : 'voice';
        const label = cl.status === 'timeout' ? '📵 Missed ' + v + ' call' : cl.status === 'reject' ? '📵 ' + v[0].toUpperCase() + v.slice(1) + ' call declined' : cl.status === 'accept' ? (cl.isVideo ? '🎥' : '📞') + ' ' + v[0].toUpperCase() + v.slice(1) + ' call' : (cl.isVideo ? '🎥' : '📞') + ' Incoming ' + v + ' call';
        let m = list.find(x => x.id === mid);
        if (!m) { m = { id: mid, out: false, at: tsOf(cl.date), kind: 'call', text: '', label, status: '' }; list.push(m); list.sort((a, b) => a.at - b.at); s.msgs.set(jid, list); const c = chatOf(s, jid); if (m.at >= c.at) { c.at = m.at; c.last = label; c.out = false; } if (cl.status === 'offer' || cl.status === 'ringing') c.unread = (c.unread || 0) + 1; }
        else { m.label = label; const c = s.chats.get(jid); if (c && c.at === m.at) c.last = label; }
        saveSoon(uid, s);
      } catch (e) {}
    }));
    /* delivered / read ticks. The update can arrive under the number id while we stored the chat under the @lid (or the other way round),
       so the message is looked up by its id across every chat of that person - otherwise it stays on one tick forever. */
    const findMsg = (key) => {
      if (!key || !key.id) return null;
      learn(s, key.remoteJid, key.remoteJidAlt);
      const j = bareJid(key.remoteJid), pn = pnOf(s, j), tries = [key.remoteJid, j, key.remoteJidAlt, pn];
      if (pn) s.lid.forEach((v, k) => { if (v === pn) tries.push(k); });
      for (const t of tries) { const l = t && s.msgs.get(t); const m = l && l.find(x => x.id === key.id); if (m) return m; }
      for (const l of s.msgs.values()) { const m = l.find(x => x.id === key.id); if (m) return m; }    // last resort: by message id only
      return null;
    };
    const RANK = { error: 0, sending: 1, sent: 2, delivered: 3, read: 4 };
    const bump = (m, st2) => { if (m && m.out && st2 && (RANK[st2] || 0) >= (RANK[m.status] || 0)) m.status = st2; };
    sock.ev.on('messages.update', ups => ups.forEach(u => {
      if (u.update && u.update.message && u.key) {                                   // the sender edited a message
        const em = u.update.message.editedMessage && u.update.message.editedMessage.message, ed = editInfo(u.update.message);
        if (ed) { applyEdit(uid, s, ed.key, u.key.remoteJid, ed.msg, ed.ts); return; }
        if (em) { applyEdit(uid, s, u.key, u.key.remoteJid, em, (Number(u.update.messageTimestamp) || 0) * 1000); return; }
      }
      if (u.update && (u.update.messageStubType === 1 || u.update.messageStubType === 'REVOKE') && u.key && !u.key.fromMe) { markDeleted(uid, s, u.key, u.key.remoteJid); return; }   // deleted for everyone by the other person
      if (!u.update || u.update.status === undefined || u.update.status === null) return;
      bump(findMsg(u.key), ST[u.update.status]);
    }));
    sock.ev.on('message-receipt.update', rs => rs.forEach(r => {
      const m = findMsg(r.key); if (!m || !r.receipt) return;
      bump(m, (r.receipt.readTimestamp || r.receipt.type === 'read' || r.receipt.type === 'read-self') ? 'read' : 'delivered');
    }));
    return s;
  }
  async function stop(uid, logout) {
    const s = st(uid); s.wantOn = false; s.gen++;
    const sock = s.sock; s.sock = null; s.qr = ''; s.status = 'idle';
    if (sock) { try { if (logout) await sock.logout(); else sock.end(undefined); } catch (e) { try { sock.end(undefined); } catch (x) {} } }
    if (logout) { s.chats.clear(); s.msgs.clear(); s.raw.clear(); s.pics.clear(); s.stat.clear(); s.media.clear(); s.name = s.number = ''; s.loaded = false; if (s.saveT) { clearTimeout(s.saveT); s.saveT = null; } wipe(uid); await forgetBackup(uid); }
  }
  async function ready(uid) {                         // a connected socket, restoring a saved login after a server restart
    const s = st(uid);
    if (s.status === 'open' && s.sock) return s;
    if (!s.sock && !hasSaved(uid)) await restore(uid);
    if (!s.sock && hasSaved(uid)) { await open(uid); }
    return s;
  }
  async function syncContacts(s) {                      // ask the phone to send the whole address book again (WhatsApp app-state sync)
    try { if (s.sock && s.sock.resyncAppState) await s.sock.resyncAppState(['critical_block', 'critical_unblock_low', 'regular_high', 'regular_low', 'regular'], true); } catch (e) { warn('WhatsApp contact sync', e && e.message); }
  }
  const waitOpen = (s, ms) => new Promise(r => { const t0 = Date.now(); (function t() { if (s.status === 'open' || Date.now() - t0 > ms) return r(); setTimeout(t, 250); })(); });
  async function connected(uid) {
    const r = await ready(uid);
    if (r.status !== 'open' || !r.sock) { await waitOpen(r, 8000); if (r.status !== 'open' || !r.sock) fail('WhatsApp is not connected. Tap “Connect WhatsApp” and scan the QR code.'); }
    return r;
  }

  /* ---------- shaping for the browser ---------- */
  const link = (uid, jid, id, kind) => { const p = [uid, jid, id, kind, Date.now() + 6 * 3600e3].join('|'); return '/wa/media?s=' + Buffer.from(p).toString('base64url') + '.' + sign('wam:' + p); };
  const chatView = (uid, c) => {
    const s = st(uid), pn = pnOf(s, c.id), ct = (pn && s.contacts.get(pn)) || s.contacts.get(c.id), num = c.group ? '' : (pn ? '+' + pn.split('@')[0] : numOf(c.id));
    return ({ id: c.id, name: c.name || (ct && (ct.name || ct.pn)) || c.pn || (c.group ? 'Group' : num || 'WhatsApp contact'), number: num, group: !!c.group, unread: c.unread || 0, at: c.at, last: c.last, out: !!c.out, blue: blueShow(s, c.id), av: link(uid, c.id, 0, 'a') });
  };
  const msgView = (uid, jid, m) => { const x = Object.assign({}, m); delete x.key; delete x.sec; if (m.media) x.url = link(uid, jid, m.id, 'm'); return x; };

  /* ---------- JSON actions ---------- */
  async function route(req) {
    const a = req.action, uid = authUid(req.token), s = st(uid);
    if (a === 'waStatus') {
      try { L(); } catch (e) { return { ok: true, configured: false, error: e.message }; }
      if (s.status === 'idle' && !s.sock && !hasSaved(uid)) await restore(uid);               // fresh deploy: bring the saved login back
      if (s.status === 'idle' && !s.sock && hasSaved(uid) && s.tries < 6) { open(uid).catch(e => warn('WhatsApp resume', e && e.message)); }
      return { ok: true, configured: true, status: s.status, qr: s.status === 'qr' ? s.qr : '', connected: s.status === 'open', name: s.name, number: s.number, error: s.status === 'idle' && !s.wantOn ? s.err : '' };
    }
    if (a === 'waStart') {
      L(); qrLib();
      if (s.status === 'open') return { ok: true, status: 'open' };
      s.tries = 0; s.err = ''; if (req.full) s.vi = 0;                         // re-link: use the "Desktop" identity so WhatsApp sends the full old history
      if (!s.sock && s.status !== 'starting') { if (!hasSaved(uid)) await restore(uid); if (!hasSaved(uid)) wipe(uid); await open(uid); }   // a half-finished old login is thrown away so a fresh QR appears
      const t0 = Date.now(); while (Date.now() - t0 < 9000 && (s.status === 'starting' || (s.status === 'idle' && s.wantOn))) await new Promise(r => setTimeout(r, 250));   // wait for the first QR
      return { ok: true, status: s.status, qr: s.status === 'qr' ? s.qr : '', error: s.status === 'idle' && !s.wantOn ? s.err : '' };
    }
    if (a === 'waLogout') { await stop(uid, true); return { ok: true }; }
    if (a === 'licWaGet') { if (uid !== 'ADMIN') fail('Only the main admin can use this.'); return { ok: true, cfg: await licCfg(), connected: !!(s.status === 'open' && s.sock) }; }
    if (a === 'licWaSet') {
      if (uid !== 'ADMIN') fail('Only the main admin can change this.');
      const to = String(req.to || '').replace(/[^\d+]/g, ''); toJid(to);                                    // checks the number looks right
      const c = licNorm({ on: req.on !== false && req.on !== 'false', to });
      await withWb(() => { PROPS().setProperty('LIC_WA_CFG', JSON.stringify(c)); });
      licC = c; return { ok: true, cfg: c };
    }
    if (a === 'waBotGet') { if (uid !== 'ADMIN') fail('Only the main admin can use this.'); return { ok: true, cfg: await botGet(), connected: !!(s.status === 'open' && s.sock) }; }
    if (a === 'waBotPeople') {                                           // who can a number be tied to: every account + its employees
      if (uid !== 'ADMIN') fail('Only the main admin can use this.');
      const people = await withWb(() => {
        const set = globalThis.readSettings_().values, out = [];
        [globalThis.getAccount_('ADMIN', set)].concat(globalThis.readUsers_().filter(u => u.active)).forEach(a => {
          try { globalThis.buildCtx_(a.id); const nm = String(a.name || a.username || a.id), em = globalThis.readEmployees_(); em.forEach(e => out.push({ acc: a.id, accName: nm, emp: e.id, empName: String(e.name || '') })); if (!em.length) out.push({ acc: a.id, accName: nm, emp: '', empName: '' }); } catch (e) {}   // an account with no employee must be listed too (else its number can never be tied to it and falls back to the admin's data)
        });
        return out;
      });
      return { ok: true, people };
    }
    if (a === 'waBotSet') {
      if (uid !== 'ADMIN') fail('Only the main admin can change this.');
      const raw = (Array.isArray(req.nums) ? req.nums : String(req.nums || '').split(/[\s,;]+/)).map(x => String(x).replace(/\D/g, '')).filter(Boolean);
      raw.forEach(x => { if (x.length < 8 || x.length > 15) fail('"' + x + '" does not look like a phone number. Use the digits only, e.g. 9876543210 or 919876543210.'); });
      const c = botNorm({ on: req.on, nums: raw, bind: req.bind && typeof req.bind === 'object' ? req.bind : {} });
      await withWb(() => { PROPS().setProperty('WA_BOT_CFG', JSON.stringify(c)); });
      botCfg = c; return { ok: true, cfg: c };
    }
    if (a === 'licWaTest') {
      if (uid !== 'ADMIN') fail('Only the main admin can use this.');
      const c = await licCfg(); await sendText(uid, c.to, '✅ *LIC alert test*\n\nYeh test message hai. Premium due (7, 3, 1 din pehle + due date par) aur policy expire / deactivate hone par aise hi alert aayega.');
      return { ok: true, to: c.to };
    }
    const r = await connected(uid);
    if (a === 'waChats') {
      await resolveLids(r);
      const by = new Map();                                // one row per person, even if WhatsApp kept both an @lid chat and a number chat
      [...r.chats.values()].filter(c => c.at || c.last || c.name || c.pn).forEach(c => {
        const key = c.group ? c.id : (pnOf(r, c.id) || c.id), o = by.get(key);
        if (!o) by.set(key, Object.assign({}, c)); else { const n = c.at > o.at ? Object.assign({}, c) : o; const w = c.at > o.at ? o : c; n.name = n.name || w.name; n.pn = n.pn || w.pn; n.unread = (n.unread || 0) + (w.unread || 0); by.set(key, n); }
      });
      const items = [...by.values()].sort((x, y) => y.at - x.at).slice(0, 400).map(c => chatView(uid, c));
      return { ok: true, hideAll: r.hideAll, hist: r.hist, stN: statusView(uid, r).length, items, me: { name: r.name, number: r.number, av: link(uid, 'me', 0, 'a') } };
    }
    if (a === 'waStatuses') { await resolveLids(r); return { ok: true, items: statusView(uid, r) }; }
    if (a === 'waContacts') {
      await resolveLids(r);
      const m = new Map(), add = (id, name) => { const pn = pnOf(r, id), key = pn || id, o = m.get(key) || { id: pn || id, name: '', number: pn ? '+' + pn.split('@')[0] : numOf(id) }; if (name && !o.name) o.name = name; m.set(key, o); };
      r.contacts.forEach(c => add(c.id, c.name || c.pn || ''));
      r.chats.forEach(c => { if (!c.group) add(c.id, c.name || c.pn || ''); });   // people you chatted with are contacts too
      const items = [...m.values()].filter(c => (c.name || c.number)).sort((x, y) => (x.name || '~' + x.number).toLowerCase() < (y.name || '~' + y.number).toLowerCase() ? -1 : 1).slice(0, 5000).map(c => Object.assign(c, { av: link(uid, c.id, 0, 'a') }));
      return { ok: true, items };
    }
    if (a === 'waSyncContacts') { await syncContacts(r); try { const g = await r.sock.groupFetchAllParticipating(); Object.keys(g || {}).forEach(id => setName(chatOf(r, id), g[id].subject)); } catch (e) {} return { ok: true }; }
    if (a === 'waGroup') {
      const name = String(req.name || '').trim().slice(0, 100), ids = (Array.isArray(req.members) ? req.members : []).slice(0, 200).map(toJid);
      if (!name) fail('Enter a group name.'); if (!ids.length) fail('Pick at least one contact.');
      let g; try { g = await r.sock.groupCreate(name, ids); } catch (e) { fail('Could not create the group: ' + String((e && e.message) || e).slice(0, 100)); }
      const c = chatOf(r, g.id); c.name = name; c.group = true; c.at = Date.now(); c.last = 'You created this group'; c.out = true; saveSoon(uid, r);
      return { ok: true, chat: chatView(uid, c) };
    }
    if (a === 'waMore') {                                 // ask the phone for older messages of this chat
      const jid = toJid(req.chat), first = (r.msgs.get(jid) || []).find(m => m.key);
      if (!first) fail('No older message to continue from. Use ↻ Re-link to sync your full history.');
      try { await r.sock.fetchMessageHistory(50, first.key, Math.floor(first.at / 1000)); } catch (e) { fail('WhatsApp did not accept the request: ' + String((e && e.message) || e).slice(0, 100)); }
      return { ok: true };
    }
    if (a === 'waHistory') {
      const jid = toJid(req.chat), c = r.chats.get(jid), pn = pnOf(r, jid);
      const jids = [jid]; if (pn) { if (pn !== jid) jids.push(pn); r.lid.forEach((v, k) => { if (v === pn && k !== jid) jids.push(k); }); }
      const seen = new Set(), all = [];
      jids.forEach(j => (r.msgs.get(j) || []).forEach(m => { if (!seen.has(m.id)) { seen.add(m.id); all.push(msgView(uid, j, m)); } }));
      all.sort((x, y) => x.at - y.at);
      const list = r.msgs.get(jid) || [];
      jids.forEach(j => { const cc = r.chats.get(j); if (cc && cc.unread) { cc.unread = 0; const l = r.msgs.get(j) || []; const last = [...l].reverse().find(m => !m.out && m.key); try { if (last && blueShow(r, j)) r.sock.readMessages([last.key]).catch(() => {}); } catch (e) {} } });
      return { ok: true, chat: chatView(uid, c || chatOf(r, jid)), items: all.slice(-200) };
    }
    if (a === 'waBlueAll') {                               // home page switch: hide (or show) blue tick for ALL contacts at once
      r.hideAll = !!req.hide; r.blueMap.clear(); saveSoon(uid, r);
      return { ok: true, hideAll: r.hideAll };
    }
    if (a === 'waBlue') {                                  // show / hide blue tick for one contact
      const jid = toJid(req.chat), k = blueKey(r, jid), on = !!req.on;
      r.blueMap.set(k, on);
      if (on) {                                             // turning ON: tell this person about the messages you already saw
        const jids = [jid]; const pn = pnOf(r, jid); if (pn && pn !== jid) jids.push(pn); r.lid.forEach((v, kk) => { if (v === pn && kk !== jid) jids.push(kk); });
        jids.forEach(j => { const l = r.msgs.get(j) || []; const last = [...l].reverse().find(m => !m.out && m.key); try { if (last) r.sock.readMessages([last.key]).catch(() => {}); } catch (e) {} });
      }
      saveSoon(uid, r);
      return { ok: true, blue: blueShow(r, jid) };
    }
    if (a === 'waSend') {
      const text = String(req.text || '').slice(0, 4000); if (!text.trim()) fail('Write a message first.');
      const jid = toJid(req.to || req.chat);
      await sendGuard(r, jid);
      let sent; try { sent = await r.sock.sendMessage(jid, { text }); } catch (e) { warn('WhatsApp send', e && e.message); fail('Could not send: ' + String((e && e.message) || e).slice(0, 120)); }
      const m = addMsg(uid, r, jid, Object.assign({}, sent, { key: Object.assign({}, sent && sent.key, { fromMe: true }), message: { conversation: text }, messageTimestamp: Math.floor(Date.now() / 1000), status: 2 }), false);
      return { ok: true, jid, chat: chatView(uid, chatOf(r, jid)), msg: m ? msgView(uid, jid, m) : { id: String(Date.now()), out: true, at: Date.now(), kind: 'text', text, status: 'sent' } };
    }
    if (a === 'waForward') {                              // send any message of any chat (group or person) on to other chats / numbers
      const from = String(req.from || ''), ids = [].concat(req.ids || req.id || []).map(String).slice(0, 10), tos = [].concat(req.to || []).map(String).filter(Boolean).slice(0, 10);
      if (!from || !ids.length || !tos.length) fail('Pick a message and at least one chat to send it to.');
      const list = r.msgs.get(from) || []; let ok = 0, bad = 0, why = '', first = true;
      for (const id of ids) {
        const m = list.find(x => x.id === id); if (!m) { bad++; why = 'That message is no longer loaded - open the chat again.'; continue; }
        for (const to of tos) {
          try {
            const jid = toJid(to);
            if (!first) await new Promise(x => setTimeout(x, 1150)); first = false;
            await sendGuard(r, jid);
            const raw = r.raw.get(from + '|' + id);
            let content;
            if (m.media) { if (!raw) fail('This file is not available any more. Open the chat again, then forward.'); content = { forward: raw }; }
            else { const t = String(m.text || m.label || '').trim(); if (!t) fail('Nothing to forward.'); content = { text: t }; }
            const sent = await r.sock.sendMessage(jid, content);
            addMsg(uid, r, jid, Object.assign({}, sent, { key: Object.assign({}, sent && sent.key, { fromMe: true }), message: (sent && sent.message) || { conversation: content.text || '' }, messageTimestamp: Math.floor(Date.now() / 1000), status: 2 }), false);
            ok++;
          } catch (e) { bad++; why = String((e && e.message) || e).slice(0, 140); warn('WhatsApp forward', why); }
        }
      }
      if (!ok) fail(why || 'Could not forward.');
      return { ok: true, sent: ok, failed: bad, error: bad ? why : '' };
    }
    fail('Unknown WhatsApp action.');
  }
  async function sendGuard(r, jid) {
    const now = Date.now(); if (now - r.lastSend < 1000) fail('Please wait a second between messages (WhatsApp may block accounts that send too fast).'); r.lastSend = now;
    if (jid.endsWith('@s.whatsapp.net')) {
      let ex; try { ex = await r.sock.onWhatsApp(jid); } catch (e) { ex = null; }
      if (ex && ex.length && ex[0].exists === false) fail('This number is not on WhatsApp.');
    }
  }

  /* ---------- binary: send a photo / video / voice / file ---------- */
  async function upload(token, q, buf) {
    const uid = authUid(token);
    if (!buf || !buf.length) fail('Empty file.');
    const r = await connected(uid), jid = toJid(q.c), mime = String(q.m || 'application/octet-stream'), name = String(q.n || 'file').replace(/[\\/]/g, '_').slice(0, 120) || 'file', cap = String(q.cap || '').slice(0, 1024);
    await sendGuard(r, jid);
    let content;
    if (q.as !== 'file' && /^image\/(jpeg|png|webp|gif)$/.test(mime)) content = { image: buf, caption: cap, mimetype: mime };
    else if (q.as !== 'file' && /^video\//.test(mime)) content = { video: buf, caption: cap, mimetype: mime };
    else if (q.as === 'voice' || /^audio\//.test(mime) && q.as !== 'file') content = { audio: buf, mimetype: mime, ptt: q.as === 'voice' };
    else content = { document: buf, fileName: name, mimetype: mime, caption: cap || undefined };
    let sent; try { sent = await r.sock.sendMessage(jid, content); } catch (e) { warn('WhatsApp upload', e && e.message); fail('Could not send: ' + String((e && e.message) || e).slice(0, 120)); }
    const k = content.image ? 'imageMessage' : content.video ? 'videoMessage' : content.audio ? 'audioMessage' : 'documentMessage';
    const msg = { [k]: { caption: cap, mimetype: mime, fileName: name, fileLength: buf.length, ptt: !!content.ptt, jpegThumbnail: sent && sent.message && sent.message[k] && sent.message[k].jpegThumbnail } };
    const m = addMsg(uid, r, jid, { key: Object.assign({}, sent && sent.key, { fromMe: true }), message: msg, messageTimestamp: Math.floor(Date.now() / 1000), status: 2 }, false);
    if (m && sent && sent.message) r.raw.set(jid + '|' + m.id, sent);
    return { ok: true, jid, chat: chatView(uid, chatOf(r, jid)), msg: m ? msgView(uid, jid, m) : null };
  }

  /* ---------- binary: stream profile pictures and media to the browser (signed, expiring links) ---------- */
  const text = (code, s) => ({ code, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: s });
  const SAFE = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|3gpp)|audio\/(mpeg|ogg|mp4|x-m4a|wav|webm|aac|amr))/;
  async function fetchPic(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }); if (!res.ok) throw new Error('pic ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  }
  async function media(q, range) {
    const [b, g] = String(q.s || '').split('.'); if (!b || !g) return text(403, 'Bad link');
    const p = Buffer.from(b, 'base64url').toString(), good = sign('wam:' + p);
    if (g.length !== good.length || !crypto.timingSafeEqual(Buffer.from(g), Buffer.from(good))) return text(403, 'Bad link');
    const [uid, jid, id, kind, exp] = p.split('|'); if (Number(exp) < Date.now()) return text(403, 'This link expired. Reload the chat.');
    const s = st(uid); let c;
    if (kind === 'a') {                                                  // profile picture (cached, also remembers "has none")
      const key = jid; c = s.pics.get(key);
      if (c === undefined) {
        c = null; const was = s.status === 'open';
        try {
          if (s.status === 'open' && s.sock) {
            const target = jid === 'me' ? (s.sock.user && s.sock.user.id) : jid;
            const u = target && await s.sock.profilePictureUrl(target, 'preview');
            if (u) c = { buf: await fetchPic(u), mime: 'image/jpeg', name: 'avatar.jpg' };
          }
        } catch (e) { c = null; }
        if (was || c) s.pics.set(key, c); if (s.pics.size > 800) s.pics.delete(s.pics.keys().next().value);
      }
      if (!c) return text(404, 'No photo');
    } else {
      const isSt = kind === 's', key = (isSt ? 'st|' : '') + jid + '|' + id; c = s.media.get(key);
      if (!c) {
        let wm; if (isSt) { const g = s.stat.get(jid), it = g && g.items.find(i => i.id === id); wm = it && it.wm; } else wm = s.raw.get(key);
        if (!wm && isSt) return text(404, 'This status has expired or is no longer available.');
        if (!wm) return text(404, 'This file is no longer available. Open the chat again after the message arrives.');
        try {
          if (s.status !== 'open' || !s.sock) return text(503, 'WhatsApp is not connected.');
          const B = L(), x = unwrap(wm.message), part = x.imageMessage || x.videoMessage || x.audioMessage || x.documentMessage || x.stickerMessage || {};
          if ((Number(part.fileLength) || 0) > MAX) return text(413, 'Too big to open here (over ' + (MAX / 1048576) + ' MB). Open it on your phone.');
          const buf = await B.downloadMediaMessage(wm, 'buffer', {}, { logger: quietLog(), reuploadRequest: s.sock.updateMediaMessage });
          if (!buf || !buf.length) return text(404, 'No media');
          c = { buf, mime: part.mimetype || 'application/octet-stream', name: part.fileName || (isSt ? 'WA-status-' + String(id).slice(0, 10) + '.' + extOf(part.mimetype) : 'file') };
          s.media.set(key, c); if (s.media.size > 40) s.media.delete(s.media.keys().next().value);
        } catch (e) { warn('WhatsApp media failed', e && e.message); return text(500, 'Could not load this file.'); }
      }
    }
    const size = c.buf.length, ok = SAFE.test(c.mime);
    const h = { 'Content-Type': ok ? c.mime.split(';')[0] : 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=21600', 'X-Content-Type-Options': 'nosniff' };
    if (q.dl || !ok) h['Content-Disposition'] = 'attachment; filename="' + String(c.name).replace(/[^\w.\- ]/g, '_') + '"';
    const rg = /^bytes=(\d*)-(\d*)$/.exec(String(range || ''));
    if (rg && (rg[1] || rg[2])) {
      const a0 = rg[1] ? Number(rg[1]) : Math.max(0, size - Number(rg[2])), e = rg[1] && rg[2] ? Math.min(Number(rg[2]), size - 1) : size - 1;
      if (a0 > e || a0 >= size) return { code: 416, headers: { 'Content-Range': 'bytes */' + size }, body: '' };
      h['Content-Range'] = 'bytes ' + a0 + '-' + e + '/' + size; h['Content-Length'] = e - a0 + 1;
      return { code: 206, headers: h, body: c.buf.subarray(a0, e + 1) };
    }
    h['Content-Length'] = size; return { code: 200, headers: h, body: c.buf };
  }

  /* ---------- LIC WhatsApp alert settings (number, time, days before) - edited in the LIC tab, saved in the sheet properties ---------- */
  let licC = null;
  const licNorm = j => {
    j = j || {}; const d = { on: true, to: String(env.LIC_WA_TO || '9621755459'), at: /^\d\d:\d\d$/.test(String(env.LIC_WA_AT || '')) ? String(env.LIC_WA_AT) : '08:00', before: String(env.LIC_WA_BEFORE || '0').split(',').map(x => parseInt(x, 10)) };
    const bf = (Array.isArray(j.before) ? j.before : d.before).map(x => parseInt(x, 10)).filter(x => x >= 0 && x <= 30);
    return { on: j.on === undefined ? d.on : !!j.on, to: String(j.to || d.to).replace(/[^\d+]/g, ''), at: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(j.at || '')) ? String(j.at) : d.at, before: [...new Set(bf.length ? bf : [0])].sort((a, b) => b - a) };
  };
  async function licCfg() {
    if (licC) return licC;
    let j = {}; try { j = JSON.parse(await withWb(() => PROPS().getProperty('LIC_WA_CFG') || '') || '{}'); } catch (e) {}
    return (licC = licNorm(j));
  }
  /* server-side alert: send a text from this user's linked WhatsApp to any number (used by the LIC due-date watcher in server.js) */
  async function sendText(uid, to, text) {
    const r = await connected(uid), jid = toJid(to);
    await sendGuard(r, jid);
    await r.sock.sendMessage(jid, { text: String(text || '').slice(0, 4000) });
    return true;
  }
  function isOpen(uid) { const s = users.get(uid); return !!(s && s.status === 'open' && s.sock); }

  /* every few minutes: copy changed login keys to the sheet; on a deploy (SIGTERM) do a last copy before the process ends */
  setInterval(() => { users.forEach((s, uid) => { if (s.status === 'open') backup(uid); }); }, 3 * 60 * 1000).unref();
  let bye = false;
  process.once('SIGTERM', () => {
    if (bye) return; bye = true;
    const ids = [...users.keys()].filter(u => hasSaved(u));
    Promise.race([Promise.all(ids.map(u => backup(u))), new Promise(r => setTimeout(r, 9000))]).catch(() => {}).then(() => process.exit(0));
  });
  return { actions: ACTIONS, route, upload, media, max: MAX, sendText, isOpen, licCfg };
};
