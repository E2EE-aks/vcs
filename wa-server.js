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
  const { env, warn, sign } = o;
  const DIR = path.resolve(env.WA_DIR || path.join(__dirname, 'wa-sessions'));
  const CC = String(env.WA_DEFAULT_CC || '91').replace(/\D/g, '') || '91';
  const ACTIONS = new Set(['waStatus', 'waStart', 'waLogout', 'waChats', 'waHistory', 'waSend', 'waContacts', 'waMore', 'waGroup', 'waSyncContacts', 'waStatuses']);
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
  const st = uid => { let s = users.get(uid); if (!s) { s = { sock: null, status: 'idle', qr: '', name: '', number: '', chats: new Map(), msgs: new Map(), raw: new Map(), wantOn: false, tries: 0, lastSend: 0, gen: 0, saveT: null, loaded: false, pics: new Map(), media: new Map(), err: '', vi: 0, contacts: new Map(), lid: new Map(), stat: new Map(), hist: { chats: 0, msgs: 0 } }; users.set(uid, s); } return s; };
  const hasSaved = uid => { try { const c = JSON.parse(fs.readFileSync(path.join(udir(uid), 'creds.json'), 'utf8')); return !!(c && c.me); } catch (e) { return false; } };   // only a really linked login counts (half-finished QR logins are ignored)
  const wipe = uid => { try { fs.rmSync(udir(uid), { recursive: true, force: true }); } catch (e) {} };

  /* ---------- the chat list + messages survive a server restart (store.json, no media inside) ---------- */
  function loadStore(uid, s) {
    if (s.loaded) return; s.loaded = true;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(udir(uid), 'store.json'), 'utf8'));
      (j.chats || []).forEach(c => s.chats.set(c.id, c));
      (j.contacts || []).forEach(c => s.contacts.set(c.id, c));
      Object.keys(j.lids || {}).forEach(k => s.lid.set(k, j.lids[k]));
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
        fs.writeFileSync(path.join(udir(uid), 'store.json'), JSON.stringify({ chats: [...s.chats.values()], contacts: [...s.contacts.values()], lids: Object.fromEntries(s.lid), msgs }));
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

  function addMsg(uid, s, jid, wm, live) {
    if (jid === 'status@broadcast') { addStatus(s, wm); return null; }
    if (!isChat(jid) || jid === 'status@broadcast' || !wm || !wm.message) return null;
    if (wm.key) { learn(s, jid, wm.key.remoteJidAlt); learn(s, jid, wm.key.senderPn); learn(s, wm.key.participant, wm.key.participantAlt); learn(s, wm.key.participant, wm.key.participantPn); }
    const k = kindText(wm.message); if (!k) return null;
    const out = !!(wm.key && wm.key.fromMe), id = (wm.key && wm.key.id) || crypto.randomBytes(6).toString('hex');
    const list = s.msgs.get(jid) || []; if (list.some(m => m.id === id)) return null;
    const m = { id, out, at: tsOf(wm.messageTimestamp), kind: k.kind, text: k.text || '', label: k.label || '', from: out ? '' : (wm.pushName || ''), status: out ? (ST[wm.status] || 'sent') : '' };
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
      getMessage: async () => undefined }, useVer ? { version } : {}));
    s.sock = sock;
    const wd = setTimeout(() => { if (s.gen === gen && s.status === 'starting') { s.err = 'WhatsApp did not answer in time. Tap “Show QR code” to try again.'; try { sock.end(undefined); } catch (e) {} } }, 30000);   // no QR in 30 s -> give up with a message
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async u => {
      if (s.gen !== gen) return;
      const { connection, lastDisconnect, qr } = u;
      if (qr) { try { s.qr = await qrLib().toDataURL(qr, { margin: 1, width: 320 }); s.status = 'qr'; s.err = ''; clearTimeout(wd); } catch (e) { warn('WhatsApp QR error', e && e.message); s.err = 'Could not draw the QR code: ' + String((e && e.message) || e).slice(0, 100); } }
      if (connection === 'open') {
        clearTimeout(wd); s.err = '';
        setTimeout(() => { if (s.gen === gen && s.status === 'open' && s.contacts.size < 8) syncContacts(s); }, 20000);   // few contacts so far -> ask the phone for them
        s.status = 'open'; s.qr = ''; s.tries = 0;
        const me = (sock.user || {}); s.name = me.name || me.verifiedName || ''; s.number = numOf(me.id || '');
        setTimeout(() => { if (s.gen === gen && s.status === 'open') { resolveLids(s).then(() => saveSoon(uid, s)); } }, 6000);
        try { const g = await sock.groupFetchAllParticipating(); Object.keys(g || {}).forEach(id => { const c = chatOf(s, id); setName(c, g[id].subject); }); saveSoon(uid, s); } catch (e) {}
      }
      if (connection === 'close') {
        clearTimeout(wd);
        s.sock = null; s.qr = '';
        const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
        if (code === DisconnectReason.loggedOut) { s.status = 'idle'; s.wantOn = false; s.chats.clear(); s.msgs.clear(); s.raw.clear(); s.pics.clear(); s.stat.clear(); s.media.clear(); s.name = s.number = ''; s.loaded = false; wipe(uid); return; }
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
    sock.ev.on('messages.upsert', ev => (ev.messages || []).forEach(wm => addMsg(uid, s, wm.key && wm.key.remoteJid, wm, ev.type === 'notify')));
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
    if (logout) { s.chats.clear(); s.msgs.clear(); s.raw.clear(); s.pics.clear(); s.stat.clear(); s.media.clear(); s.name = s.number = ''; s.loaded = false; if (s.saveT) { clearTimeout(s.saveT); s.saveT = null; } wipe(uid); }
  }
  async function ready(uid) {                         // a connected socket, restoring a saved login after a server restart
    const s = st(uid);
    if (s.status === 'open' && s.sock) return s;
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
    return ({ id: c.id, name: c.name || (ct && (ct.name || ct.pn)) || c.pn || (c.group ? 'Group' : num || 'WhatsApp contact'), number: num, group: !!c.group, unread: c.unread || 0, at: c.at, last: c.last, out: !!c.out, av: link(uid, c.id, 0, 'a') });
  };
  const msgView = (uid, jid, m) => { const x = Object.assign({}, m); delete x.key; if (m.media) x.url = link(uid, jid, m.id, 'm'); return x; };

  /* ---------- JSON actions ---------- */
  async function route(req) {
    const a = req.action, uid = authUid(req.token), s = st(uid);
    if (a === 'waStatus') {
      try { L(); } catch (e) { return { ok: true, configured: false, error: e.message }; }
      if (s.status === 'idle' && !s.sock && hasSaved(uid) && s.tries < 6) { open(uid).catch(e => warn('WhatsApp resume', e && e.message)); }
      return { ok: true, configured: true, status: s.status, qr: s.status === 'qr' ? s.qr : '', connected: s.status === 'open', name: s.name, number: s.number, error: s.status === 'idle' && !s.wantOn ? s.err : '' };
    }
    if (a === 'waStart') {
      L(); qrLib();
      if (s.status === 'open') return { ok: true, status: 'open' };
      s.tries = 0; s.err = ''; if (req.full) s.vi = 0;                         // re-link: use the "Desktop" identity so WhatsApp sends the full old history
      if (!s.sock && s.status !== 'starting') { if (!hasSaved(uid)) wipe(uid); await open(uid); }   // a half-finished old login is thrown away so a fresh QR appears
      const t0 = Date.now(); while (Date.now() - t0 < 9000 && (s.status === 'starting' || (s.status === 'idle' && s.wantOn))) await new Promise(r => setTimeout(r, 250));   // wait for the first QR
      return { ok: true, status: s.status, qr: s.status === 'qr' ? s.qr : '', error: s.status === 'idle' && !s.wantOn ? s.err : '' };
    }
    if (a === 'waLogout') { await stop(uid, true); return { ok: true }; }
    const r = await connected(uid);
    if (a === 'waChats') {
      await resolveLids(r);
      const by = new Map();                                // one row per person, even if WhatsApp kept both an @lid chat and a number chat
      [...r.chats.values()].filter(c => c.at || c.last || c.name || c.pn).forEach(c => {
        const key = c.group ? c.id : (pnOf(r, c.id) || c.id), o = by.get(key);
        if (!o) by.set(key, Object.assign({}, c)); else { const n = c.at > o.at ? Object.assign({}, c) : o; const w = c.at > o.at ? o : c; n.name = n.name || w.name; n.pn = n.pn || w.pn; n.unread = (n.unread || 0) + (w.unread || 0); by.set(key, n); }
      });
      const items = [...by.values()].sort((x, y) => y.at - x.at).slice(0, 400).map(c => chatView(uid, c));
      return { ok: true, hist: r.hist, stN: statusView(uid, r).length, items, me: { name: r.name, number: r.number, av: link(uid, 'me', 0, 'a') } };
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
      jids.forEach(j => { const cc = r.chats.get(j); if (cc && cc.unread) { cc.unread = 0; const l = r.msgs.get(j) || []; const last = [...l].reverse().find(m => !m.out && m.key); try { if (last) r.sock.readMessages([last.key]).catch(() => {}); } catch (e) {} } });
      return { ok: true, chat: chatView(uid, c || chatOf(r, jid)), items: all.slice(-200) };
    }
    if (a === 'waSend') {
      const text = String(req.text || '').slice(0, 4000); if (!text.trim()) fail('Write a message first.');
      const jid = toJid(req.to || req.chat);
      await sendGuard(r, jid);
      let sent; try { sent = await r.sock.sendMessage(jid, { text }); } catch (e) { warn('WhatsApp send', e && e.message); fail('Could not send: ' + String((e && e.message) || e).slice(0, 120)); }
      const m = addMsg(uid, r, jid, Object.assign({}, sent, { key: Object.assign({}, sent && sent.key, { fromMe: true }), message: { conversation: text }, messageTimestamp: Math.floor(Date.now() / 1000), status: 2 }), false);
      return { ok: true, jid, chat: chatView(uid, chatOf(r, jid)), msg: m ? msgView(uid, jid, m) : { id: String(Date.now()), out: true, at: Date.now(), kind: 'text', text, status: 'sent' } };
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

  return { actions: ACTIONS, route, upload, media, max: MAX };
};
