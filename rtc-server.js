'use strict';
// FTP tab › "Website se share": only the handshake (WebRTC offer / answer) passes through here, kept in memory.
// The files themselves go straight from phone to phone and never touch this server.
// A code stays valid for 2 hours until the second phone joins; after that the pair keeps its room for 24 hours, so a dropped
// connection (network lost, screen off …) re-joins by itself with a fresh offer / answer and resumes the transfer.
const crypto = require('crypto');
module.exports = function ({ warn }) {
  const ACTIONS = new Set(['rtcHost', 'rtcPoll', 'rtcJoin', 'rtcAnswer', 'rtcClose']);
  const TTL_OPEN = 2 * 3600 * 1000, TTL_PAIRED = 24 * 3600 * 1000, MAX_ROOMS = 300, MAX_SDP = 40000, TRY_WINDOW = 10 * 60 * 1000;
  const rooms = new Map();          // code -> { uid, offer, ver, answer, aver, key, at }
  const tries = new Map();          // uid -> { n, at }   (wrong-code / wrong-key attempts)
  const sweep = () => { const now = Date.now(); for (const [c, r] of rooms) if (now - r.at > (r.key ? TTL_PAIRED : TTL_OPEN)) rooms.delete(c); for (const [u, t] of tries) if (now - t.at > TRY_WINDOW) tries.delete(u); };
  const newCode = () => { for (let i = 0; i < 20; i++) { const c = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); if (!rooms.has(c)) return c; } return ''; };
  const sdp = v => { const s = typeof v === 'string' ? v : ''; if (!s || s.length > MAX_SDP) globalThis.fail_('Invalid connection data.', 'RTC'); return s; };
  const gone = () => globalThis.fail_('Code galat hai ya expire ho gaya. Host se dobara Share karwao.', 'RTCGONE');
  const wrongTry = uid => { const t = tries.get(uid) || { n: 0, at: Date.now() }; t.n++; tries.set(uid, t); };
  const locked = uid => { const t = tries.get(uid); if (t && t.n >= 10) globalThis.fail_('Bahut galat code. 10 minute baad try karo.', 'RTCBAD'); };
  async function route(req) {
    const uid = globalThis.checkToken_(req.token);
    if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    sweep();
    const code = String(req.code || '').replace(/\D/g, '').slice(0, 6), now = Date.now();
    if (req.action === 'rtcHost') {
      if (code) {                                           // the host's connection dropped: new offer, same code
        const r = rooms.get(code); if (!r || r.uid !== uid) gone();
        r.offer = sdp(req.offer); r.ver++; r.answer = ''; r.at = now; return { ok: true, code, ver: r.ver };
      }
      if (rooms.size >= MAX_ROOMS) globalThis.fail_('Server busy, try again in a minute.', 'RTC');
      const c = newCode(); if (!c) globalThis.fail_('Try again.', 'RTC');
      rooms.set(c, { uid, offer: sdp(req.offer), ver: 1, answer: '', aver: 0, key: '', at: now });
      return { ok: true, code: c, ver: 1 };
    }
    if (req.action === 'rtcClose') { const r = rooms.get(code); if (r && r.uid === uid) rooms.delete(code); return { ok: true }; }
    if (req.action === 'rtcPoll') {
      const r = rooms.get(code); if (!r || r.uid !== uid) return { ok: true, gone: true };
      r.at = now; const a = r.answer; r.answer = ''; return { ok: true, answer: a };
    }
    // join / answer: first time anyone with the code may join; after that only the phone that holds the key
    locked(uid);
    const r = rooms.get(code); if (!r) { wrongTry(uid); gone(); }
    if (r.key && String(req.key || '') !== r.key) { wrongTry(uid); globalThis.fail_('Ye connection kisi aur phone ke saath juda hai.', 'RTCBAD'); }
    if (req.action === 'rtcJoin') {
      if (r.aver === r.ver || r.ver <= (Number(req.ver) || 0)) return { ok: true, wait: true };     // already answered / nothing new yet
      return { ok: true, offer: r.offer, ver: r.ver };
    }
    // rtcAnswer
    if (Number(req.ver) !== r.ver || r.aver === r.ver) globalThis.fail_('Host ne naya offer bana diya, dobara koshish ho rahi hai.', 'RTCVER');
    r.answer = sdp(req.answer); r.aver = r.ver; r.at = now;
    if (!r.key) r.key = crypto.randomBytes(12).toString('hex');
    return { ok: true, key: r.key };
  }
  return { actions: ACTIONS, route };
};
