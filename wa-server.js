'use strict';
/* KS · WhatsApp tab (server side).
   Every user links THEIR OWN WhatsApp by scanning a QR code (WhatsApp ▸ Linked devices ▸ Link a device) -
   the same way WhatsApp Web works.  Library: Baileys (@whiskeysockets/baileys), an unofficial WhatsApp Web client.
   The login (auth keys) is kept in files under WA_DIR (default ./wa-sessions/<user id>).  On hosts with a temporary
   disk (e.g. Render free plan) those files vanish on every restart/redeploy - then the user simply scans the QR again.
   Attach a persistent disk and set WA_DIR to its path to stay logged in.
   Messages are kept in memory only (never written to the Google Sheet).  Only messages sent / received while the
   server is running are shown - WhatsApp does not give old history to linked devices through this library.
   Env (all optional): WA_DIR, WA_DEFAULT_CC (country code added to numbers typed without one, default 91). */
const fs = require('fs');
const path = require('path');

module.exports = function makeWhatsApp(o) {
  const { env, warn } = o;
  const DIR = path.resolve(env.WA_DIR || path.join(__dirname, 'wa-sessions'));
  const CC = String(env.WA_DEFAULT_CC || '91').replace(/\D/g, '') || '91';
  const ACTIONS = new Set(['waStatus', 'waStart', 'waLogout', 'waChats', 'waHistory', 'waSend']);
  const fail = (m, c) => globalThis.fail_(m, c || 'WA');
  const authUid = t => { const u = globalThis.checkToken_(t); if (!u) globalThis.fail_('Session expired. Please log in again.', 'AUTH'); return u; };
  const udir = uid => path.join(DIR, 'wa_' + String(uid).replace(/[^\w-]/g, '_'));
  const MAX_CHATS = 300, MAX_MSGS = 150;

  let lib = null, QR = null;
  function L() {
    if (lib) return lib;
    try { lib = require('@whiskeysockets/baileys'); }
    catch (e) { fail('WhatsApp support is not installed on the server. Add "@whiskeysockets/baileys", "qrcode" and "pino" to package.json, then redeploy.'); }
    return lib;
  }
  function qrLib() { if (!QR) { try { QR = require('qrcode'); } catch (e) { fail('The "qrcode" package is missing on the server. Add it to package.json and redeploy.'); } } return QR; }
  const quietLog = () => { try { return require('pino')({ level: 'silent' }); } catch (e) { const n = () => {}; const l = { level: 'silent', child: () => l, trace: n, debug: n, info: n, warn: n, error: n, fatal: n }; return l; } };

  /* per user: { sock, status: idle|starting|qr|open, qr, name, number, chats: Map, msgs: Map, wantOn, tries, lastSend } */
  const users = new Map();
  const st = uid => { let s = users.get(uid); if (!s) { s = { sock: null, status: 'idle', qr: '', name: '', number: '', chats: new Map(), msgs: new Map(), wantOn: false, tries: 0, lastSend: 0, gen: 0 }; users.set(uid, s); } return s; };
  const hasSaved = uid => { try { return fs.existsSync(path.join(udir(uid), 'creds.json')); } catch (e) { return false; } };
  const wipe = uid => { try { fs.rmSync(udir(uid), { recursive: true, force: true }); } catch (e) {} };

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
  function kindText(m) {
    const x = unwrap(m);
    if (x.conversation) return { kind: 'text', text: x.conversation };
    if (x.extendedTextMessage) return { kind: 'text', text: x.extendedTextMessage.text || '' };
    if (x.imageMessage) return { kind: 'photo', text: x.imageMessage.caption || '', label: '📷 Photo' };
    if (x.videoMessage) return { kind: 'video', text: x.videoMessage.caption || '', label: '🎥 Video' };
    if (x.audioMessage) return { kind: 'voice', text: '', label: x.audioMessage.ptt ? '🎤 Voice message' : '🎵 Audio' };
    if (x.documentMessage) return { kind: 'file', text: x.documentMessage.caption || '', label: '📎 ' + (x.documentMessage.fileName || 'File') };
    if (x.stickerMessage) return { kind: 'sticker', text: '', label: '🙂 Sticker' };
    if (x.locationMessage) return { kind: 'geo', text: '', label: '📍 Location' };
    if (x.contactMessage || x.contactsArrayMessage) return { kind: 'contact', text: '', label: '👤 Contact' };
    if (x.reactionMessage || x.protocolMessage || x.senderKeyDistributionMessage) return null;
    return { kind: 'other', text: '', label: '📎 Message' };
  }
  const tsOf = t => { const n = Number(t && t.toNumber ? t.toNumber() : t) || 0; return (n || Math.floor(Date.now() / 1000)) * 1000; };
  const isChat = jid => /@(s\.whatsapp\.net|g\.us|lid)$/.test(jid || '');
  const numOf = jid => '+' + String(jid || '').split('@')[0].split(':')[0];

  function chatOf(s, jid) {
    let c = s.chats.get(jid);
    if (!c) { c = { id: jid, name: '', at: 0, last: '', out: false, unread: 0, group: jid.endsWith('@g.us') }; s.chats.set(jid, c);
      if (s.chats.size > MAX_CHATS) { const old = [...s.chats.values()].sort((a, b) => a.at - b.at)[0]; if (old) { s.chats.delete(old.id); s.msgs.delete(old.id); } } }
    return c;
  }
  function addMsg(s, jid, wm, live) {
    if (!isChat(jid) || jid === 'status@broadcast') return null;
    const k = kindText(wm.message); if (!k) return null;
    const out = !!(wm.key && wm.key.fromMe), id = (wm.key && wm.key.id) || String(Math.random());
    const list = s.msgs.get(jid) || []; if (list.some(m => m.id === id)) return null;
    const m = { id, out, at: tsOf(wm.messageTimestamp), kind: k.kind, text: k.text || k.label || '', label: k.label || '', from: out ? '' : (wm.pushName || ''), status: out ? 'sent' : '' };
    list.push(m); list.sort((a, b) => a.at - b.at); if (list.length > MAX_MSGS) list.splice(0, list.length - MAX_MSGS); s.msgs.set(jid, list);
    const c = chatOf(s, jid);
    if (!c.name && !out && wm.pushName && !c.group) c.name = wm.pushName;
    if (m.at >= c.at) { c.at = m.at; c.last = k.kind === 'text' ? (k.text || '').slice(0, 80) : ((k.label || '') + (k.text ? ' ' + k.text.slice(0, 60) : '')); c.out = out; }
    if (!out && live) c.unread++;
    return m;
  }

  /* ---------- the WhatsApp connection ---------- */
  async function open(uid) {
    const s = st(uid); if (s.sock || s.status === 'starting') return s;
    const B = L(), makeWASocket = B.default || B.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = B;
    s.status = 'starting'; s.wantOn = true; const gen = ++s.gen;
    fs.mkdirSync(udir(uid), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(udir(uid));
    let version; try { version = (await fetchLatestBaileysVersion()).version; } catch (e) {}
    const sock = makeWASocket(Object.assign({ auth: state, printQRInTerminal: false, logger: quietLog(), markOnlineOnConnect: false, syncFullHistory: false,
      browser: Browsers && Browsers.appropriate ? Browsers.appropriate('Chrome') : ['KS', 'Chrome', '1.0'] }, version ? { version } : {}));
    s.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async u => {
      if (s.gen !== gen) return;
      const { connection, lastDisconnect, qr } = u;
      if (qr) { try { s.qr = await qrLib().toDataURL(qr, { margin: 1, width: 300 }); s.status = 'qr'; } catch (e) { warn('WhatsApp QR error', e && e.message); } }
      if (connection === 'open') {
        s.status = 'open'; s.qr = ''; s.tries = 0;
        const me = (sock.user || {}); s.name = me.name || me.verifiedName || ''; s.number = numOf(me.id || '');
      }
      if (connection === 'close') {
        s.sock = null; s.qr = '';
        const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
        if (code === DisconnectReason.loggedOut) { s.status = 'idle'; s.wantOn = false; s.chats.clear(); s.msgs.clear(); s.name = s.number = ''; wipe(uid); return; }
        s.status = 'idle';
        if (s.wantOn && s.tries < 6) { s.tries++; const wait = code === DisconnectReason.restartRequired ? 300 : Math.min(30000, 1500 * s.tries); setTimeout(() => { if (s.wantOn && !s.sock) open(uid).catch(e => warn('WhatsApp reconnect', e && e.message)); }, wait); }
      }
    });
    sock.ev.on('messaging-history.set', h => {
      (h.chats || []).forEach(c => { if (isChat(c.id)) { const x = chatOf(s, c.id); if (c.name) x.name = c.name; if (c.unreadCount > 0) x.unread = c.unreadCount; if (c.conversationTimestamp && !x.at) x.at = tsOf(c.conversationTimestamp); } });
      (h.contacts || []).forEach(c => { if (isChat(c.id) && (c.name || c.notify)) chatOf(s, c.id).name = chatOf(s, c.id).name || c.name || c.notify; });
      (h.messages || []).forEach(wm => addMsg(s, wm.key && wm.key.remoteJid, wm, false));
    });
    sock.ev.on('chats.upsert', cs => cs.forEach(c => { if (isChat(c.id)) { const x = chatOf(s, c.id); if (c.name) x.name = c.name; } }));
    sock.ev.on('contacts.upsert', cs => cs.forEach(c => { if (isChat(c.id) && (c.name || c.notify)) { const x = chatOf(s, c.id); x.name = c.name || x.name || c.notify; } }));
    sock.ev.on('contacts.update', cs => cs.forEach(c => { if (c.id && s.chats.has(c.id) && (c.name || c.notify)) s.chats.get(c.id).name = c.name || c.notify; }));
    sock.ev.on('messages.upsert', ev => (ev.messages || []).forEach(wm => addMsg(s, wm.key && wm.key.remoteJid, wm, ev.type === 'notify')));
    return s;
  }
  async function stop(uid, logout) {
    const s = st(uid); s.wantOn = false; s.gen++;
    const sock = s.sock; s.sock = null; s.qr = ''; s.status = 'idle';
    if (sock) { try { if (logout) await sock.logout(); else sock.end(undefined); } catch (e) { try { sock.end(undefined); } catch (x) {} } }
    if (logout) { s.chats.clear(); s.msgs.clear(); s.name = s.number = ''; wipe(uid); }
  }
  async function ready(uid) {                         // a connected socket, restoring a saved login after a server restart
    const s = st(uid);
    if (s.status === 'open' && s.sock) return s;
    if (!s.sock && hasSaved(uid)) { await open(uid); }
    return s;
  }
  const waitOpen = (s, ms) => new Promise(r => { const t0 = Date.now(); (function t() { if (s.status === 'open' || Date.now() - t0 > ms) return r(); setTimeout(t, 250); })(); });

  /* ---------- JSON actions ---------- */
  const chatView = c => ({ id: c.id, name: c.name || (c.group ? 'Group' : numOf(c.id)), number: c.group ? '' : numOf(c.id), group: !!c.group, unread: c.unread || 0, at: c.at, last: c.last, out: !!c.out });
  async function route(req) {
    const a = req.action, uid = authUid(req.token), s = st(uid);
    if (a === 'waStatus') {
      try { L(); } catch (e) { return { ok: true, configured: false, error: e.message }; }
      if (s.status === 'idle' && !s.sock && hasSaved(uid) && s.tries < 6) { open(uid).catch(e => warn('WhatsApp resume', e && e.message)); }
      return { ok: true, configured: true, status: s.status, qr: s.status === 'qr' ? s.qr : '', connected: s.status === 'open', name: s.name, number: s.number };
    }
    if (a === 'waStart') {
      L(); qrLib();
      if (s.status === 'open') return { ok: true, status: 'open' };
      s.tries = 0; if (!s.sock && s.status !== 'starting') await open(uid);
      return { ok: true, status: s.status };
    }
    if (a === 'waLogout') { await stop(uid, true); return { ok: true }; }
    const r = await ready(uid);
    if (r.status !== 'open' || !r.sock) { await waitOpen(r, 8000); if (r.status !== 'open' || !r.sock) fail('WhatsApp is not connected. Tap “Connect WhatsApp” and scan the QR code.'); }
    if (a === 'waChats') {
      const items = [...r.chats.values()].filter(c => c.at || c.last || c.name).sort((x, y) => y.at - x.at).slice(0, 150).map(chatView);
      return { ok: true, items };
    }
    if (a === 'waHistory') {
      const jid = toJid(req.chat), c = r.chats.get(jid); if (c) c.unread = 0;
      return { ok: true, chat: chatView(c || chatOf(r, jid)), items: (r.msgs.get(jid) || []).slice(-100) };
    }
    if (a === 'waSend') {
      const text = String(req.text || '').slice(0, 4000); if (!text.trim()) fail('Write a message first.');
      const jid = toJid(req.to || req.chat);
      const now = Date.now(); if (now - r.lastSend < 1200) fail('Please wait a second between messages (WhatsApp may block accounts that send too fast).'); r.lastSend = now;
      if (jid.endsWith('@s.whatsapp.net')) {
        let ex; try { ex = await r.sock.onWhatsApp(jid); } catch (e) { ex = null; }
        if (ex && ex.length && ex[0].exists === false) fail('This number is not on WhatsApp.');
      }
      let sent; try { sent = await r.sock.sendMessage(jid, { text }); } catch (e) { warn('WhatsApp send', e && e.message); fail('Could not send: ' + String((e && e.message) || e).slice(0, 120)); }
      const m = addMsg(r, jid, Object.assign({}, sent, { key: Object.assign({}, sent && sent.key, { fromMe: true }), message: { conversation: text }, messageTimestamp: Math.floor(Date.now() / 1000) }), false)
        || { id: (sent && sent.key && sent.key.id) || String(now), out: true, at: now, kind: 'text', text, label: '', from: '', status: 'sent' };
      return { ok: true, jid, chat: chatView(chatOf(r, jid)), msg: m };
    }
    fail('Unknown WhatsApp action.');
  }
  return { actions: ACTIONS, route };
};
