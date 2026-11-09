'use strict';
// Push notifications for the Android app (Firebase Cloud Messaging, HTTP v1): a new chat message and an incoming call.
// Needs ONE server setting:  FCM_SERVICE_ACCOUNT = the whole JSON of a Firebase service-account key (Project settings > Service accounts > Generate new private key).
// Without it nothing is sent and everything else keeps working.
const crypto = require('crypto');

module.exports = function ({ env, warn, withWb }) {
  const P = () => globalThis.PropertiesService.getScriptProperties();
  let sa = null, tok = { v: '', exp: 0 };
  function account() {
    if (sa !== null) return sa || null;
    let raw = String(env.FCM_SERVICE_ACCOUNT || '').trim();
    try { if (raw && raw[0] !== '{') raw = Buffer.from(raw, 'base64').toString('utf8'); sa = raw ? JSON.parse(raw) : false; }
    catch (e) { sa = false; warn('FCM_SERVICE_ACCOUNT is not valid JSON'); }
    if (sa && !(sa.client_email && sa.private_key && sa.project_id)) sa = false;
    return sa || null;
  }
  const b64u = x => Buffer.from(x).toString('base64url');
  async function accessToken() {
    if (tok.v && Date.now() < tok.exp) return tok.v;
    const a = account(), now = Math.floor(Date.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64u(JSON.stringify({ iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(a.private_key, 'base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + sig });
    const j = await r.json();
    if (!j.access_token) throw new Error('FCM sign-in failed: ' + (j.error_description || j.error || r.status));
    tok = { v: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 120000 };
    return tok.v;
  }

  // ---- device tokens, kept per user in the script properties (max 5 phones per user) ----
  const keyOf = uid => 'FCM_' + uid;
  const tokens = uid => { try { const a = JSON.parse(P().getProperty(keyOf(uid)) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const saveTokens = (uid, a) => withWb(() => { P().setProperty(keyOf(uid), JSON.stringify(a.slice(-5))); return true; });

  const ACTIONS = new Set(['pushRegister', 'pushUnregister', 'pushStatus']);
  async function route(req) {
    const uid = globalThis.checkToken_(req.token);
    if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    if (req.action === 'pushStatus') return { ok: true, ready: !!account() };
    const t = String(req.fcm || '');
    if (t.length < 20 || t.length > 400) globalThis.fail_('Bad device token.', 'PUSH');
    const a = tokens(uid).filter(x => x.t !== t);
    if (req.action === 'pushRegister') a.push({ t, at: Date.now() });
    await saveTokens(uid, a);
    return { ok: true, ready: !!account() };
  }

  // m = { title, body, channel, tag, ttl, call, data }
  async function send(uid, m) {
    if (!account()) return;
    const list = tokens(uid); if (!list.length) return;
    const at = await accessToken(), dead = new Set();
    await Promise.all(list.map(async x => {
      const data = {}; Object.keys(m.data || {}).forEach(k => { data[k] = String(m.data[k]); });
      const body = { message: { token: x.t, notification: { title: String(m.title || '').slice(0, 80), body: String(m.body || '').slice(0, 160) }, data,
        android: { priority: 'HIGH', ttl: (m.ttl || 900) + 's', notification: { channel_id: m.channel || 'messages', tag: m.tag || undefined, sound: 'default',
          notification_priority: m.call ? 'PRIORITY_MAX' : 'PRIORITY_HIGH' } } } };
      try {
        const r = await fetch('https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(account().project_id) + '/messages:send',
          { method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) {
          const t = await r.text();
          if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(t)) dead.add(x.t); else warn('FCM send failed', r.status, t.slice(0, 200));
        }
      } catch (e) { warn('FCM send error', e.message); }
    }));
    if (dead.size) await saveTokens(uid, list.filter(x => !dead.has(x.t)));
  }

  // new chat message -> everybody in that chat except the sender
  async function chat(req, res) {
    if (!account() || !res || !res.ok || !res.message) return;
    const from = globalThis.checkToken_(req.token); if (!from) return;
    const to = String(req.to || '').trim(), S0 = globalThis.readSettings_().values;
    const me = globalThis.getAccount_(from, S0), nm = (me && (me.name || me.username)) || 'New message';
    const text = String(res.message.text || ''), prev = typeof globalThis.chatPreview_ === 'function' ? globalThis.chatPreview_(text) : text.slice(0, 80);
    if (globalThis.isChatGroupId_(to)) {
      const g = globalThis.chatGroupMembers_(to, from); if (!g) return;
      await Promise.all(g.members.filter(m => m.id !== from).map(m => send(m.id, { title: g.name + ' · ' + nm, body: prev, channel: 'messages', tag: 'chat-' + to, data: { kind: 'msg', with: to } })));
    } else {
      await send(to, { title: nm, body: prev, channel: 'messages', tag: 'chat-' + from, data: { kind: 'msg', with: from } });
    }
    // keyword alert -> phone notification to the main admin (the in-app message is written by chatSend_ in Code.gs)
    try {
      if (me && me.role !== 'admin' && to !== 'ADMIN' && text.indexOf('ksmedia:') !== 0 && typeof globalThis.kwMatch_ === 'function') {
        const hit = globalThis.kwMatch_(text);
        if (hit.length) await send('ADMIN', { title: '🔔 VCS Management', body: nm + ' sent: ' + hit.join(', '), channel: 'messages', tag: 'kw-' + from, data: { kind: 'msg', with: 'VCSMGMT' } });
      }
    } catch (e) { warn('kw push', e && e.message); }
  }
  // incoming voice / video call -> the person being called (rings for ~40 seconds)
  const call = (to, c) => send(to, { title: c.kind === 'video' ? '📹 Incoming video call' : '📞 Incoming call', body: c.fromName || 'Someone', channel: 'calls',
    tag: 'call-' + c.id, ttl: 40, call: true, data: { kind: 'call', callId: c.id, with: c.from } });

  return { actions: ACTIONS, route, send, chat, call, ready: () => !!account() };
};
