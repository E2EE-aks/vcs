'use strict';
// FTP tab › "Website se share": only the first handshake (WebRTC offer / answer) passes through here, kept in memory for 10 minutes.
// The files themselves go straight from phone to phone and never touch this server.
const crypto = require('crypto');
module.exports = function ({ warn }) {
  const ACTIONS = new Set(['rtcHost', 'rtcPoll', 'rtcJoin', 'rtcAnswer', 'rtcClose']);
  const TTL = 10 * 60 * 1000, MAX_ROOMS = 300, MAX_SDP = 40000;
  const rooms = new Map();          // code -> { uid, offer, answer, at }
  const tries = new Map();          // uid -> { n, at }   (wrong-code attempts)
  const sweep = () => { const now = Date.now(); for (const [c, r] of rooms) if (now - r.at > TTL) rooms.delete(c); for (const [u, t] of tries) if (now - t.at > TTL) tries.delete(u); };
  const newCode = () => { for (let i = 0; i < 20; i++) { const c = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); if (!rooms.has(c)) return c; } return ''; };
  const sdp = v => { const s = typeof v === 'string' ? v : ''; if (!s || s.length > MAX_SDP) globalThis.fail_('Invalid connection data.', 'RTC'); return s; };
  async function route(req) {
    const uid = globalThis.checkToken_(req.token);
    if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    sweep();
    const code = String(req.code || '').replace(/\D/g, '').slice(0, 6);
    if (req.action === 'rtcHost') {
      if (rooms.size >= MAX_ROOMS) globalThis.fail_('Server busy, try again in a minute.', 'RTC');
      const c = newCode(); if (!c) globalThis.fail_('Try again.', 'RTC');
      rooms.set(c, { uid, offer: sdp(req.offer), answer: '', at: Date.now() });
      return { ok: true, code: c };
    }
    if (req.action === 'rtcJoin') {
      const t = tries.get(uid) || { n: 0, at: Date.now() };
      if (t.n >= 10) globalThis.fail_('Too many wrong codes. Wait 10 minutes.', 'RTC');
      const r = rooms.get(code);
      if (!r || r.answer) { t.n++; tries.set(uid, t); globalThis.fail_('Code galat hai ya expire ho gaya.', 'RTC'); }
      return { ok: true, offer: r.offer };
    }
    const r = rooms.get(code);
    if (req.action === 'rtcAnswer') {
      if (!r || r.answer) globalThis.fail_('Code galat hai ya expire ho gaya.', 'RTC');
      r.answer = sdp(req.answer); return { ok: true };
    }
    if (req.action === 'rtcPoll') {
      if (!r || r.uid !== uid) return { ok: true, gone: true };
      if (!r.answer) return { ok: true, answer: '' };
      rooms.delete(code); return { ok: true, answer: r.answer };
    }
    if (r && r.uid === uid) rooms.delete(code);          // rtcClose
    return { ok: true };
  }
  return { actions: ACTIONS, route };
};
