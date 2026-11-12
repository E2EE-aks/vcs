'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { Readable } = require('stream');
const { Workbook, install } = require('./gas-shim');
const live = require('./live-monitor');

function makeApp(store, env) {
  live.patchFetch();                                   // every outgoing call (Calendar, Drive, GitHub ...) shows in VCS Processing
  store = live.wrapStore(store);                       // Google Sheets reads / saves too
  live.setIntegrations([
    { id: 'sheets', name: 'Google Sheets (database)', on: true },
    { id: 'calendar', name: 'Google Calendar', on: !!(env.CAL_CLIENT_ID && env.CAL_CLIENT_SECRET && env.PUBLIC_URL) },
    { id: 'drive', name: 'Google Drive (chat media)', on: !!(env.CAL_CLIENT_ID && env.CAL_CLIENT_SECRET) },
    { id: 'gmail', name: 'Gmail (Mail tab)', on: !!(env.CAL_CLIENT_ID && env.CAL_CLIENT_SECRET && env.PUBLIC_URL) },
    { id: 'github', name: 'GitHub (Deploy / Updates)', on: !!(env.GITHUB_REPO && env.GITHUB_TOKEN) },
    { id: 'mail', name: 'E-mail (Gmail SMTP)', on: !!(env.SMTP_USER && env.SMTP_PASS) },
    { id: 'turn', name: 'Call relay (TURN)', on: !!(env.ICE_SERVERS || (env.METERED_APP && env.METERED_API_KEY)) }
  ]);
  const wb = new Workbook(store);
  const warn = (...a) => { console.warn(...a); live.sys('warn', a.join(' ')); };
  const rt = { delay: 0, mails: [], cal: [] };
  install(wb, env, rt);
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), { filename: 'Code.gs' });

  // Sessions survive restarts: signed tokens instead of the Apps Script cache.
  const secret = env.TOKEN_SECRET || crypto.createHash('sha256').update('tok:' + (env.GOOGLE_PRIVATE_KEY || env.SHEET_ID || 'dev')).digest('hex');
  const sign = p => crypto.createHmac('sha256', secret).update(p).digest('hex');
  const revoked = new Set();
  // Token = uid | version | hard-expiry (10 years = never) | random | issued-at.  How long it really lasts is the user's own limit
  // (set by an admin, default 6 h) and is checked on every request, so changing the limit works at once on phones already signed in.
  globalThis.newToken_ = function (uid) {
    const now = Date.now();
    const p = uid + '|' + getVersion_(uid) + '|' + (now + 3650 * 86400000) + '|' + crypto.randomBytes(6).toString('hex') + '|' + now;
    return Buffer.from(p).toString('base64url') + '.' + sign(p);
  };
  globalThis.checkToken_ = function (t) {
    if (!t || String(t).indexOf('.') < 0) return '';
    const [b, s] = String(t).split('.');
    const p = Buffer.from(b, 'base64url').toString();
    const good = sign(p);
    if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return '';
    if (revoked.has(t)) return '';
    const [uid, ver, exp, , iss] = p.split('|');
    const issued = Number(iss) || (Number(exp) - TOKEN_TTL * 1000);          // tokens made before this update carried the old 6 h expiry
    // No automatic sign-out: a phone stays signed in until the user taps Log out (or an admin signs them out / blocks the account).
    return (Number(exp) > Date.now() && ver === getVersion_(uid)) ? uid : '';
  };

  // ---------- Google Calendar (per-user OAuth; refresh tokens encrypted in the sheet) ----------
  const REFRESH = Number(env.REFRESH_SECONDS || 20) * 1000;
  const calKey = crypto.createHash('sha256').update('cal:' + secret).digest();
  const enc = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', calKey, iv);
    const ct = Buffer.concat([c.update(String(t), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url'); };
  const dec = t => { try { const b = Buffer.from(String(t), 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', calKey, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); } catch (e) { return ''; } };
  const publicUrl = String(env.PUBLIC_URL || '').replace(/\/+$/, '');
  globalThis.CAL_CFG_ = { clientId: env.CAL_CLIENT_ID || '', redirect: publicUrl + '/oauth/google/callback',
    ready: !!(env.CAL_CLIENT_ID && env.CAL_CLIENT_SECRET && publicUrl) };
  globalThis.calState_ = uid => { const p = uid + '|' + (Date.now() + 600000) + '|' + crypto.randomBytes(6).toString('hex');
    return Buffer.from(p).toString('base64url') + '.' + sign('cal:' + p); };
  const calCheck = st => { const [b, g] = String(st || '').split('.'); if (!b || !g) return '';
    const p = Buffer.from(b, 'base64url').toString(), good = sign('cal:' + p);
    if (g.length !== good.length || !crypto.timingSafeEqual(Buffer.from(g), Buffer.from(good))) return '';
    const [uid, exp] = p.split('|'); return Number(exp) > Date.now() ? uid : ''; };
  const TZ = env.TZ || 'Asia/Kolkata', REMIND = Number(env.CAL_REMIND_MIN || 10);
  const accessCache = new Map();
  async function calAccess(uid, refresh) {
    const c = accessCache.get(uid); if (c && c.tok && c.exp > Date.now() + 30000) return c.tok;
    if (c && c.bad && c.bad > Date.now()) return '';
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.CAL_CLIENT_ID, client_secret: env.CAL_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }) });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) { warn('Calendar token refresh failed for', uid, j.error); accessCache.set(uid, { bad: Date.now() + 300000 }); return ''; }
    accessCache.set(uid, { tok: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }); return j.access_token;
  }
  const addMin = (date, slot, m) => { const [h, mi] = slot.split(':').map(Number); let t = h * 60 + mi + m, d = new Date(date + 'T00:00:00Z');
    if (t >= 1440) { t -= 1440; d = new Date(d.getTime() + 86400000); }
    return d.toISOString().slice(0, 10) + 'T' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0') + ':00'; };
  async function calDo(j) {
    const tok = await calAccess(j.uid, j.refresh); if (!tok) return;
    const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const id = 'kstt' + j.date.replace(/-/g, '') + j.slot.replace(':', '');
    const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
    const call = async (url, method, body) => { for (let i = 0; i < 3; i++) {
      const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await new Promise(x => setTimeout(x, 700 * (i + 1))); continue; }
      return r; } return { status: 0 }; };
    if (!j.cat) { await call(base + '/' + id, 'DELETE'); return; }
    const body = { summary: j.cat, status: 'confirmed', start: { dateTime: j.date + 'T' + j.slot + ':00', timeZone: TZ },
      end: { dateTime: addMin(j.date, j.slot, 30), timeZone: TZ }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: REMIND }] } };
    let r = await call(base + '/' + id, 'PUT', body);
    if (r.status === 404) { r = await call(base, 'POST', Object.assign({ id }, body)); if (r.status === 409) r = await call(base + '/' + id, 'PUT', body); }
  }
  let calChain = Promise.resolve();
  function calRun(jobs) {            // background, one by one - never blocks the app's own requests
    jobs.forEach(j => { calChain = calChain.then(() => calDo(j)).catch(e => warn('Calendar sync:', e.message)); });
  }
  globalThis.drvState_ = uid => { const p = uid + '|' + (Date.now() + 600000) + '|' + crypto.randomBytes(6).toString('hex');
    return Buffer.from(p).toString('base64url') + '.' + sign('drv:' + p); };
  const drvCheck = st => { const [b, g] = String(st || '').split('.'); if (!b || !g) return '';
    const p = Buffer.from(b, 'base64url').toString(), good = sign('drv:' + p);
    if (g.length !== good.length || !crypto.timingSafeEqual(Buffer.from(g), Buffer.from(good))) return '';
    const [uid, exp] = p.split('|'); return Number(exp) > Date.now() ? uid : ''; };
  globalThis.mediaSign_ = (id, uid, exp) => sign('media:' + id + '|' + uid + '|' + exp);
  let drvTok = null;
  const page = (code, msg, what) => ({ code, html: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:32px;max-width:480px;margin:auto"><h2>' +
    (code === 200 ? '✅ ' + (what || 'Google Calendar') + ' connected' : '⚠️ Could not connect') + '</h2><p>' + String(msg).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</p></body>' });
  async function runOauth(q) {
    if (q.error) return page(400, 'Google said: ' + q.error);
    let uid = calCheck(q.state), drv = false, mail = false;
    if (!uid){ uid = drvCheck(q.state); drv = !!uid; }
    if (!uid){ uid = mailCheck(q.state); mail = !!uid; }
    if (!uid) return page(400, 'This link expired. Go back to the app and click "Connect" again.');
    if (!globalThis.CAL_CFG_.ready) return page(400, 'Calendar sync is not configured on the server.');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: q.code || '', client_id: env.CAL_CLIENT_ID, client_secret: env.CAL_CLIENT_SECRET, redirect_uri: globalThis.CAL_CFG_.redirect, grant_type: 'authorization_code' }) });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) return page(400, j.error_description || j.error || 'Google did not return a token.');
    if (!j.refresh_token) return page(400, 'Google did not give offline access. Remove this app from myaccount.google.com/permissions and connect again.');
    let email = '';
    try { email = (await (await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + j.access_token } })).json()).email || ''; } catch (e) {}
    if (!wb.loadedAt || Date.now() - wb.loadedAt > REFRESH) await wb.load();
    const p = globalThis.PropertiesService.getScriptProperties();
    if (drv){
      p.setProperty('DRV_TOK', enc(j.refresh_token)); p.setProperty('DRV_META', JSON.stringify({ email, at: Date.now() })); p.setProperty('DRV_FOLDER', '');
      await wb.flush(); drvTok = null;
      return page(200, (email ? email + ' is' : 'Your Drive is') + ' now linked. Photos and videos sent in Chat will be saved in a folder called \"KS Chat Media\". Close this tab and go back to the app.', 'Google Drive');
    }
    if (mail){
      p.setProperty('MAIL_TOK_' + uid, enc(j.refresh_token)); p.setProperty('MAIL_META_' + uid, JSON.stringify({ email, at: Date.now() }));
      await wb.flush(); mailCache.delete(uid);
      return page(200, (email ? email + ' is' : 'Your Gmail is') + ' now linked. Close this tab and go back to the app — open the Mail tab.', 'Gmail');
    }
    p.setProperty('CAL_TOK_' + uid, enc(j.refresh_token));
    p.setProperty('CAL_META_' + uid, JSON.stringify({ email, at: Date.now() }));
    await wb.flush(); accessCache.delete(uid);
    return page(200, (email ? email + ' is' : 'Your account is') + ' now linked. Close this tab and go back to the app.');
  }

  // ---------- Gmail (per-user OAuth, READ-ONLY: scope gmail.readonly) ----------
  // Every user connects THEIR OWN Gmail; nobody (not even an admin) can read another person's mail. The refresh token is encrypted
  // in the sheet like the Calendar one. Mail text itself is never stored - it is fetched from Google each time it is opened.
  const MAIL_ACTIONS = new Set(['mailStatus', 'mailAuthUrl', 'mailDisconnect', 'mailList', 'mailGet']);
  globalThis.mailState_ = uid => { const p = uid + '|' + (Date.now() + 600000) + '|' + crypto.randomBytes(6).toString('hex');
    return Buffer.from(p).toString('base64url') + '.' + sign('mail:' + p); };
  const mailCheck = st => { const [b, g] = String(st || '').split('.'); if (!b || !g) return '';
    const p = Buffer.from(b, 'base64url').toString(), good = sign('mail:' + p);
    if (g.length !== good.length || !crypto.timingSafeEqual(Buffer.from(g), Buffer.from(good))) return '';
    const [uid, exp] = p.split('|'); return Number(exp) > Date.now() ? uid : ''; };
  const mailCache = new Map();
  const mailFail = (m, code) => globalThis.fail_(m, code || 'MAIL');
  async function mailAccess(uid, refresh) {
    const c = mailCache.get(uid); if (c && c.tok && c.exp > Date.now() + 30000) return c.tok;
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.CAL_CLIENT_ID, client_secret: env.CAL_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }) });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) { warn('Gmail token refresh failed for', uid, j.error); mailCache.delete(uid);
      mailFail(j.error === 'invalid_grant' ? 'Your Gmail link has expired or was removed. Tap “Connect Gmail” again.' : 'Could not sign in to Gmail (' + (j.error || r.status) + ').'); }
    mailCache.set(uid, { tok: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }); return j.access_token;
  }
  const mailRefreshOf = uid => dec(globalThis.PropertiesService.getScriptProperties().getProperty('MAIL_TOK_' + uid) || '');
  async function gmail(uid, path) {
    const refresh = mailRefreshOf(uid); if (!refresh) mailFail('Connect Gmail first.');
    const tok = await mailAccess(uid, refresh);
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, { headers: { Authorization: 'Bearer ' + tok } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = (j.error && j.error.message) || ('Gmail error ' + r.status);
      if (r.status === 401) mailCache.delete(uid);
      if (/has not been used|is disabled|accessNotConfigured/i.test(m + JSON.stringify(j.error || ''))) mailFail('The Gmail API is switched off in your Google Cloud project. Enable “Gmail API” there, then try again.');
      if (r.status === 403 && /insufficient|scope/i.test(m)) mailFail('This Gmail link has no permission to read mail. Tap “Disconnect”, then “Connect Gmail” again and allow reading mail.');
      mailFail(m);
    }
    return j;
  }
  const mailText = s => String(s || '').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const mailHdr = (m, n) => { const h = ((m.payload && m.payload.headers) || []).find(x => String(x.name).toLowerCase() === n.toLowerCase()); return h ? String(h.value) : ''; };
  const mailView = m => { const L = m.labelIds || [];
    return { id: m.id, from: mailHdr(m, 'From'), subject: mailHdr(m, 'Subject'), at: Number(m.internalDate) || 0, snippet: mailText(m.snippet), unread: L.includes('UNREAD'), starred: L.includes('STARRED') }; };
  const MAIL_FOLDERS = { inbox: ['INBOX'], unread: ['INBOX', 'UNREAD'], starred: ['STARRED'], sent: ['SENT'], spam: ['SPAM'], trash: ['TRASH'], all: [] };
  function mailBody(part, out) {
    if (!part) return;
    const t = String(part.mimeType || '').toLowerCase(), d = part.body && part.body.data;
    if (part.filename && part.body && (part.body.attachmentId || part.body.size)) out.files.push({ name: part.filename, size: Number(part.body.size) || 0, type: t });
    else if (d && t === 'text/html' && !out.html) out.html = Buffer.from(d, 'base64url').toString('utf8');
    else if (d && t === 'text/plain' && !out.text) out.text = Buffer.from(d, 'base64url').toString('utf8');
    (part.parts || []).forEach(p => mailBody(p, out));
  }
  async function mailRoute(req) {
    const a = req.action, uid = globalThis.checkToken_(req.token);
    if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    const P = globalThis.PropertiesService.getScriptProperties();
    const metaOf = () => { try { return JSON.parse(P.getProperty('MAIL_META_' + uid) || 'null'); } catch (e) { return null; } };
    if (a === 'mailStatus') { const m = metaOf(), ok = !!mailRefreshOf(uid); return { ok: true, configured: !!globalThis.CAL_CFG_.ready, connected: ok && !!m, email: m ? m.email : '', at: m ? m.at : 0 }; }
    if (a === 'mailAuthUrl') {
      const C = globalThis.CAL_CFG_; if (!C.ready) mailFail('Mail is not set up on the server yet (it needs CAL_CLIENT_ID, CAL_CLIENT_SECRET and PUBLIC_URL, the same as Calendar sync).');
      return { ok: true, url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + encodeURIComponent(C.clientId) + '&redirect_uri=' + encodeURIComponent(C.redirect) +
        '&response_type=code&access_type=offline&prompt=consent&include_granted_scopes=true&scope=' + encodeURIComponent('https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email') +
        '&state=' + encodeURIComponent(globalThis.mailState_(uid)) };
    }
    if (a === 'mailDisconnect') return withWb(() => { P.setProperty('MAIL_TOK_' + uid, ''); P.setProperty('MAIL_META_' + uid, ''); mailCache.delete(uid); return { ok: true }; });
    if (a === 'mailList') {
      const lab = MAIL_FOLDERS[String(req.folder || 'inbox')] || MAIL_FOLDERS.inbox, q = String(req.q || '').trim().slice(0, 200);
      let path = 'messages?maxResults=20' + lab.map(l => '&labelIds=' + l).join('') + (q ? '&q=' + encodeURIComponent(q) : '') + (req.pageToken ? '&pageToken=' + encodeURIComponent(String(req.pageToken)) : '');
      if (String(req.folder) === 'trash' || String(req.folder) === 'spam') path += '&includeSpamTrash=true';
      const list = await gmail(uid, path);
      const items = (await Promise.all((list.messages || []).map(m => gmail(uid, 'messages/' + m.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject').then(mailView).catch(() => null)))).filter(Boolean);
      return { ok: true, items, next: list.nextPageToken || '' };
    }
    if (a === 'mailGet') {
      const id = String(req.id || ''); if (!/^[\w-]{6,40}$/.test(id)) mailFail('Bad message.');
      const m = await gmail(uid, 'messages/' + id + '?format=full'), out = { html: '', text: '', files: [] };
      mailBody(m.payload, out);
      return { ok: true, mail: { id: m.id, from: mailHdr(m, 'From'), to: mailHdr(m, 'To'), cc: mailHdr(m, 'Cc'), subject: mailHdr(m, 'Subject'), at: Number(m.internalDate) || 0,
        html: out.html.slice(0, 400000), text: out.text.slice(0, 200000) || mailText(m.snippet), files: out.files.slice(0, 20), unread: (m.labelIds || []).includes('UNREAD') } };
    }
  }

  // ---------- Telegram (per-user account; see tg-server.js) ----------
  const TG = require('./tg-server')({ env, enc, dec, sign, warn, withWb: fn => withWb(fn), notify: (uid, m) => PUSH.send(uid, m) });   // notify = phone notification for a new Telegram message

  // ---------- WhatsApp (per-user account linked by QR code; see wa-server.js) ----------
  const WA = require('./wa-server')({ env, warn, sign, enc, dec, withWb: fn => withWb(fn), notify: (uid, m) => PUSH.send(uid, m) });   // notify = phone notification for a new WhatsApp message

  // ---------- Music tab: search + trending (see sp-server.js) ----------
  const SP = require('./sp-server')({ env, warn });
  const YT = require('./yt-server')({ env, warn });
  const PUSH = require('./fcm')({ env, warn, withWb: fn => withWb(fn) });                 // Android app notifications (see fcm.js)                       // YouTube tab (see yt-server.js)
  // ---------- Gmail: a notification when a new unread mail arrives (the server looks every minute, only for users who have notifications on) ----------
  const mailSeen = new Map();                                  // uid -> Set of mail ids already known
  const mailFrom = f => { const m = /^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/.exec(String(f || '')); return (m && m[1].trim()) || String(f || '').replace(/[<>"]/g, '').trim() || 'New mail'; };
  async function mailWatch() {
    let props = {}; try { props = globalThis.PropertiesService.getScriptProperties().getProperties(); } catch (e) { return; }
    for (const k of Object.keys(props)) {
      if (k.indexOf('MAIL_TOK_') !== 0 || !props[k]) continue;
      const uid = k.slice(9); if (!PUSH.has(uid)) continue;
      try {
        const list = await gmail(uid, 'messages?maxResults=8&labelIds=INBOX&labelIds=UNREAD'), ids = (list.messages || []).map(m => m.id), seen = mailSeen.get(uid);
        mailSeen.set(uid, new Set(ids)); if (!seen) continue;                      // first look: just remember what is there
        for (const id of ids.filter(x => !seen.has(x)).slice(0, 3)) {
          const m = await gmail(uid, 'messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject').then(mailView).catch(() => null); if (!m) continue;
          await PUSH.send(uid, { title: '📧 ' + mailFrom(m.from), body: m.subject || m.snippet || 'New mail', tag: 'mail-' + id, data: { kind: 'mail', view: 'mail' } });
        }
      } catch (e) { /* Gmail not reachable now: try again next minute */ }
    }
  }
  { const t = setInterval(() => mailWatch().catch(() => {}), 60000); if (t.unref) t.unref(); }

  // ---------- Fingerprint / Face / screen-lock unlock (WebAuthn passkeys) ----------
  // The phone's own biometric check happens on the device; the server only stores a PUBLIC key per device
  // and verifies a signature over a one-time challenge. No fingerprint or face data ever leaves the phone.
  const BIO_ACTIONS = new Set(['bioChallenge', 'bioRegister', 'bioLogin', 'bioList', 'bioRemove']);
  const challenges = new Map();                       // one-time challenges (in memory, 2 min)
  const bioFails = new Map();
  const b64u = b => Buffer.from(b).toString('base64url');
  const sha256 = b => crypto.createHash('sha256').update(b).digest();
  const bioKey = uid => 'BIO_' + uid;
  const bioIdx = id => 'BIOIDX_' + sha256(id).toString('hex').slice(0, 40);
  const bioRead = uid => { try { return JSON.parse(globalThis.PropertiesService.getScriptProperties().getProperty(bioKey(uid)) || '[]'); } catch (e) { return []; } };
  const bioWrite = (uid, list) => globalThis.PropertiesService.getScriptProperties().setProperty(bioKey(uid), JSON.stringify(list));
  const bioView = list => list.map(c => ({ id: c.cid.slice(0, 16), label: c.label, at: c.at, last: c.last || '' }));
  function newChallenge(kind, uid) {
    const now = Date.now(); for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k);
    const id = crypto.randomBytes(12).toString('hex'), ch = b64u(crypto.randomBytes(32));
    challenges.set(id, { ch, kind, uid: uid || '', exp: now + 120000 }); return { chId: id, challenge: ch };
  }
  function useChallenge(id, kind, uid) {              // single use
    const c = challenges.get(String(id || '')); challenges.delete(String(id || ''));
    if (!c || c.exp < Date.now() || c.kind !== kind || (uid && c.uid !== uid)) globalThis.fail_('This request expired. Please try again.', 'BIO');
    return c.ch;
  }
  function checkClientData(cdB64, type, challenge, origin) {
    let cd; try { cd = JSON.parse(Buffer.from(String(cdB64), 'base64url').toString('utf8')); } catch (e) { globalThis.fail_('Bad biometric response.', 'BIO'); }
    if (cd.type !== type || cd.challenge !== challenge) globalThis.fail_('Biometric check failed. Please try again.', 'BIO');
    const want = String(env.ALLOWED_ORIGIN || '');
    if (want && want !== '*' && cd.origin !== want.replace(/\/+$/, '')) globalThis.fail_('This website address is not allowed for biometric unlock.', 'BIO');
    if (origin && cd.origin !== origin) globalThis.fail_('Biometric was set up on a different website address.', 'BIO');
    return cd;
  }
  function bioRoute(req) {
    const a = req.action;
    if (a === 'bioChallenge') {                       // public: needed before login
      if (req.purpose === 'register') {
        const uid = globalThis.checkToken_(req.token); if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
        return Object.assign({ ok: true }, newChallenge('reg', uid), { userId: b64u(uid) });
      }
      return Object.assign({ ok: true }, newChallenge('get'));
    }
    if (a === 'bioLogin') return bioLogin(req);
    const uid = globalThis.checkToken_(req.token); if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    if (a === 'bioList') return { ok: true, list: bioView(bioRead(uid)) };
    if (a === 'bioRemove') {
      const list = bioRead(uid), keep = list.filter(c => c.cid.slice(0, 16) !== String(req.id));
      list.filter(c => !keep.includes(c)).forEach(c => globalThis.PropertiesService.getScriptProperties().deleteProperty(bioIdx(c.cid)));
      bioWrite(uid, keep); return { ok: true, list: bioView(keep) };
    }
    if (a === 'bioRegister') {
      const ch = useChallenge(req.chId, 'reg', uid);
      const cd = checkClientData(req.clientDataJSON, 'webauthn.create', ch, '');
      let pub; try { pub = crypto.createPublicKey({ key: Buffer.from(String(req.publicKey), 'base64url'), format: 'der', type: 'spki' }); } catch (e) { globalThis.fail_('This device did not return a usable key.', 'BIO'); }
      const cid = String(req.credId || ''); if (cid.length < 16 || cid.length > 1400) globalThis.fail_('Bad credential.', 'BIO');
      const P = globalThis.PropertiesService.getScriptProperties(), owner = P.getProperty(bioIdx(cid));
      if (owner && owner !== uid) globalThis.fail_('This device key is already linked to another account.', 'BIO');
      const list = bioRead(uid).filter(c => c.cid !== cid);
      if (list.length >= 5) globalThis.fail_('You can link up to 5 devices. Remove one first.', 'BIO');
      list.push({ cid, pub: pub.export({ type: 'spki', format: 'der' }).toString('base64url'), origin: cd.origin,
        label: String(req.label || 'This device').replace(/[\r\n\t<>]+/g, ' ').slice(0, 60), at: new Date().toISOString(), counter: 0 });
      bioWrite(uid, list); P.setProperty(bioIdx(cid), uid);
      return { ok: true, list: bioView(list) };
    }
  }
  function bioLogin(req) {
    const info = globalThis.cleanInfo_(req.client), P = globalThis.PropertiesService.getScriptProperties();
    const cid = String(req.credId || ''), uid = cid ? P.getProperty(bioIdx(cid)) : '';
    const ch = useChallenge(req.chId, 'get');
    const bad = why => { globalThis.logLogin_(null, uid || '(biometric)', 'Failed', 'Biometric: ' + why, info); const e = new Error('Biometric unlock failed. Use your password.'); e.code = 'BIO'; throw e; };
    const nf = bioFails.get(uid || cid) || 0; if (nf >= 8) globalThis.fail_('Too many failed attempts. Use your password.', 'LOCKED');
    if (!uid) bad('unknown device');
    const list = bioRead(uid), rec = list.find(c => c.cid === cid); if (!rec) bad('unknown device');
    let ok = false;
    try {
      const cd = checkClientData(req.clientDataJSON, 'webauthn.get', ch, rec.origin);
      const ad = Buffer.from(String(req.authenticatorData), 'base64url'), sig = Buffer.from(String(req.signature), 'base64url');
      const rpId = new URL(cd.origin).hostname;
      if (ad.length < 37 || !ad.subarray(0, 32).equals(sha256(rpId))) bad('wrong site');
      if (!(ad[32] & 1) || !(ad[32] & 4)) bad('no biometric/PIN check');     // user present + user verified
      const key = crypto.createPublicKey({ key: Buffer.from(rec.pub, 'base64url'), format: 'der', type: 'spki' });
      const data = Buffer.concat([ad, sha256(Buffer.from(String(req.clientDataJSON), 'base64url'))]);
      ok = crypto.verify(key.asymmetricKeyType === 'ed25519' ? null : 'sha256', data, key, sig);
      const cnt = ad.readUInt32BE(33); if (cnt && rec.counter && cnt <= rec.counter) ok = false;   // cloned-key guard
      if (ok && cnt) rec.counter = cnt;
    } catch (e) { if (e.code === 'BIO' || e.code === 'LOCKED') throw e; ok = false; }
    if (!ok) { bioFails.set(uid, nf + 1); bad('bad signature'); }
    bioFails.delete(uid);
    // same rules as a password login
    const acc = globalThis.getAccount_(uid, globalThis.readSettings_().values);
    if (!acc) bad('account removed');
    if (!acc.active) { globalThis.logLogin_(acc, acc.username, 'Blocked', 'Account disabled', info); globalThis.fail_('This account is disabled. Please contact the admin.', 'DISABLED'); }
    if (acc.needLoc && info.lat === '') { globalThis.logLogin_(acc, acc.username, 'Blocked', 'Location not shared', info); globalThis.fail_('Your admin requires location to sign in. Allow location access for this site and try again.', 'LOCREQ'); }
    rec.last = new Date().toISOString(); bioWrite(uid, list);
    if (acc.row) { const c = globalThis.getSheet_('USERS').getRange(acc.row, 11); c.setNumberFormat('@'); c.setValue(globalThis.nowStr_()); }
    globalThis.logLogin_(acc, acc.username, 'Success', 'Biometric', info);
    return { ok: true, token: globalThis.newToken_(acc.id), username: acc.username };
  }

  // ---------- Voice / video calls (WebRTC signalling over plain HTTPS polling, kept in memory) ----------
  // Audio and video never pass through this server: it only hands the "offer" / "answer" between the two phones.
  const CALL_ACTIONS = new Set(['callConfig', 'callStart', 'callPoll', 'callAnswer', 'callEnd']);
  const vcalls = new Map(), vbusy = new Map();          // callId -> call ; userId -> callId
  let iceCache = { at: 0, v: null };
  async function iceServers() {
    if (iceCache.v && Date.now() - iceCache.at < 600000) return iceCache.v;   // { servers, turn }
    let v = null;
    if (env.ICE_SERVERS) { try { v = JSON.parse(env.ICE_SERVERS); } catch (e) { v = null; } }
    else if (env.METERED_APP && env.METERED_API_KEY) {
      try { const r = await fetch('https://' + env.METERED_APP + '.metered.live/api/v1/turn/credentials?apiKey=' + encodeURIComponent(env.METERED_API_KEY)); v = await r.json(); } catch (e) { v = null; }
    }
    const hasTurn = Array.isArray(v) && v.length > 0;
    if (!hasTurn) v = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    iceCache = { at: Date.now(), v: { servers: v, turn: hasTurn } }; return iceCache.v;
  }
  function vcSweep() {
    const now = Date.now();
    for (const c of vcalls.values()) {
      if (c.state === 'ringing' && now - c.t0 > 45000) vcFinish(c, '', 'missed');
      else if (c.state === 'active' && now - Math.min(c.seen.from, c.seen.to) > 20000) vcFinish(c, '', 'lost');
      else if (c.state === 'ended' && now - c.endAt > 30000) vcalls.delete(c.id);
    }
  }
  function vcFinish(c, by, reason) {
    if (c.state === 'ended') return;
    c.state = 'ended'; c.endedBy = by; c.reason = reason; c.endAt = Date.now();
    if (vbusy.get(c.from) === c.id) vbusy.delete(c.from);
    if (vbusy.get(c.to) === c.id) vbusy.delete(c.to);
  }
  const vcSdp = o => { if (!o || typeof o !== 'object' || typeof o.sdp !== 'string' || o.sdp.length > 60000 || (o.type !== 'offer' && o.type !== 'answer')) globalThis.fail_('Bad call data.', 'CALL'); return { type: o.type, sdp: o.sdp }; };
  async function callRoute(req) {
    const uid = globalThis.checkToken_(req.token); if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    vcSweep(); const a = req.action, now = Date.now();
    if (a === 'callConfig') { const r = await iceServers(); return { ok: true, iceServers: r.servers, turn: r.turn }; }
    if (a === 'callStart') {
      const to = String(req.to || ''), kind = req.kind === 'video' ? 'video' : 'audio';
      const S0 = globalThis.readSettings_().values, peer = to && to !== uid ? globalThis.getAccount_(to, S0) : null;
      if (!peer || !peer.active || !peer.username || !globalThis.chatCanSee_(uid, to)) globalThis.fail_('That user was not found.', 'CALL');
      if (vbusy.has(uid)) globalThis.fail_('You are already in a call.', 'BUSY');
      if (vbusy.has(to)) globalThis.fail_((peer.name || peer.username) + ' is busy on another call.', 'BUSY');
      const me = globalThis.getAccount_(uid, S0), id = crypto.randomBytes(9).toString('hex');
      const c = { id, from: uid, to, fromName: (me && (me.name || me.username)) || 'Someone', kind, offer: vcSdp(req.offer), answer: null,
        state: 'ringing', t0: now, seen: { from: now, to: now }, endedBy: '', reason: '', endAt: 0 };
      vcalls.set(id, c); vbusy.set(uid, id); vbusy.set(to, id);
      PUSH.call(to, c).catch(() => {});                       // phone rings even when the app is closed
      return { ok: true, id };
    }
    if (a === 'callPoll') {
      const c = vcalls.get(String(req.cid || ''));
      if (req.cid) {                                       // I am in this call
        if (!c || (c.from !== uid && c.to !== uid)) return { ok: true, call: { state: 'ended', reason: 'gone' } };
        c.seen[c.from === uid ? 'from' : 'to'] = now;
        return { ok: true, call: { state: c.state, answer: c.from === uid ? c.answer : null, reason: c.reason, byMe: c.endedBy === uid } };
      }
      const cur = vcalls.get(vbusy.get(uid) || '');         // idle: is somebody calling me?
      if (cur && cur.to === uid && cur.state === 'ringing')
        return { ok: true, incoming: { id: cur.id, from: cur.from, fromName: cur.fromName, kind: cur.kind, offer: cur.offer, age: now - cur.t0 } };
      return { ok: true, incoming: null };
    }
    const c = vcalls.get(String(req.cid || ''));
    if (!c || (c.from !== uid && c.to !== uid)) globalThis.fail_('This call has ended.', 'CALL');
    if (a === 'callAnswer') {
      if (c.to !== uid || c.state !== 'ringing') globalThis.fail_('This call has ended.', 'CALL');
      c.answer = vcSdp(req.answer); c.state = 'active'; c.seen = { from: now, to: now };
      return { ok: true };
    }
    if (a === 'callEnd') {
      const why = String(req.reason || '');
      vcFinish(c, uid, c.state === 'ringing' ? (c.to === uid ? 'declined' : 'cancelled') : (why === 'failed' ? 'failed' : 'hangup'));
      return { ok: true };
    }
  }


  // ---------- Fast chat ticks: sent / delivered / seen (runs OUTSIDE the sheet queue, like call polling) ----------
  // The open chat asks this every ~1.5 s: new messages + "has the other person got / seen my messages?".
  // "Seen" is kept in memory the moment the other person's screen shows the chat, so the blue tick never waits behind slow sheet saves.
  const rtTyp = new Map();                               // 'typer>peer' -> last time the typer pressed a key
  const rtRead = new Map();                              // 'reader>peer' -> time of the newest message the reader has seen
  function chatLiveRoute(req) {
    const uid = globalThis.checkToken_(req.token); if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    try { globalThis.touchSeen_(uid); } catch (e) {}      // any request = online (this also gives the sender the double tick)
    const to = String(req.with || '').trim();
    if (!to || to === uid || globalThis.isChatGroupId_(to)) return { ok: true, skip: true };
    if (!globalThis.chatCanSee_(uid, to)) globalThis.fail_('That user was not found.', 'ERR');
    const now = Date.now(), after = Number(req.after) || 0;
    const rows = globalThis.chatRows_().filter(r => (r.from === uid && r.to === to) || (r.from === to && r.to === uid));
    let newestIn = 0; rows.forEach(r => { if (r.from === to && r.t > newestIn) newestIn = r.t; });
    if (req.read && newestIn > (rtRead.get(uid + '>' + to) || 0)) rtRead.set(uid + '>' + to, newestIn);   // "I am looking at this chat right now"
    let out = rows.filter(r => r.t > after);
    if (!after && out.length > 300) out = out.slice(-300);
    const peerRead = Math.max(Number(globalThis.readPtr_(to)[uid] || 0), rtRead.get(to + '>' + uid) || 0);
    const ms = globalThis.seenMap_([to])[to] || 0;
    return { ok: true, messages: out.map(r => ({ id: r.id, t: r.t, mine: r.from === uid, text: r.text })), peerRead, peerSeen: ms, now, presence: ms ? globalThis.presence_(ms, now) : null,
      typing: now - (rtTyp.get(to + '>' + uid) || 0) < 5000 };
  }
  function chatTypingRoute(req) {                        // "I am typing" signal from the open chat (kept in memory only)
    const uid = globalThis.checkToken_(req.token); if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    const to = String(req.with || '').trim();
    if (!to || to === uid || globalThis.isChatGroupId_(to) || !globalThis.chatCanSee_(uid, to)) return { ok: true };
    rtTyp.set(uid + '>' + to, Date.now());
    if (rtTyp.size > 2000) { const t = Date.now(); for (const [k, v] of rtTyp) if (t - v > 60000) rtTyp.delete(k); }
    return { ok: true };
  }

  // ---------- Ludo (2 to 4 players, kept in memory, the server is the referee: dice + rules run here) ----------
  // One-to-one: invite a single user. Group chat: the invite goes to EVERY member of the group; whoever accepts joins (max 4).
  // The host can start as soon as 2 people are in; the game also starts by itself when everybody has answered / the lobby is full / 90 s pass.
  const LUDO_ACTIONS = new Set(['ludoInvite', 'ludoPoll', 'ludoAccept', 'ludoStart', 'ludoRoll', 'ludoMove', 'ludoLeave']);
  const lgames = new Map(), lbusy = new Map();          // gameId -> game ; userId -> gameId
  const LU_SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);   // star + start squares (no capture)
  const LU_MAX = 4, LU_LOBBY_MS = 90000;
  const luColorsFor = n => n === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, n);   // 2 players sit in opposite corners
  const luAbs = (ci, pos) => (13 * ci + pos) % 52;
  function luMovable(g, pi) {
    const out = [];
    if (!g.roll) return out;
    g.tokens[pi].forEach((pos, t) => {
      if (pos === 56) return;
      if (pos === -1 ? g.roll === 6 : pos + g.roll <= 56) out.push(t);
    });
    return out;
  }
  const luAlive = g => g.players.map((p, i) => i).filter(i => !g.out[i]);
  function luFinish(g, reason, winner) {
    if (g.state === 'over') return;
    g.state = 'over'; g.reason = reason; g.endAt = Date.now(); if (winner !== undefined) g.winner = winner;
    for (const id of g.all) if (lbusy.get(id) === g.id) lbusy.delete(id);
  }
  function luNote(g, text) { g.ev++; g.msg = text; }
  function luPass(g) {                                   // next player who is still in the game
    const n = g.players.length; let t = g.turn;
    for (let i = 0; i < n; i++) { t = (t + 1) % n; if (!g.out[t]) break; }
    g.turn = t; g.roll = 0; g.sixes = 0;
  }
  function luStartGame(g) {
    for (const p of g.pending) if (lbusy.get(p.id) === g.id) lbusy.delete(p.id);   // late / silent invitees are dropped
    g.pending = [];
    const n = g.players.length, now = Date.now();
    g.colors = luColorsFor(n); g.tokens = g.players.map(() => [-1, -1, -1, -1]); g.out = g.players.map(() => false);
    g.seen = g.players.map(() => now); g.turn = 0; g.roll = 0; g.sixes = 0; g.state = 'playing';
    luNote(g, g.players[0].name + ' starts');
  }
  function luInviteCheck(g) {                            // called after somebody accepted / declined / left the lobby
    if (g.state !== 'invite') return;
    if (g.players.length >= LU_MAX) return luStartGame(g);
    if (!g.pending.length) { if (g.players.length >= 2) luStartGame(g); else luFinish(g, 'declined'); }
  }
  function luDrop(g, pi, reason) {                       // a player leaves (or goes offline) during the game
    if (g.state !== 'playing' || g.out[pi]) return;
    g.out[pi] = true; if (lbusy.get(g.players[pi].id) === g.id) lbusy.delete(g.players[pi].id);
    const alive = luAlive(g);
    if (alive.length <= 1) { luFinish(g, reason, alive.length ? alive[0] : -1); return; }
    luNote(g, g.players[pi].name + ' left the game');
    if (g.turn === pi) luPass(g);
  }
  function luSweep() {
    const now = Date.now();
    for (const g of lgames.values()) {
      if (g.state === 'invite' && now - g.t0 > LU_LOBBY_MS) { if (g.players.length >= 2) luStartGame(g); else luFinish(g, 'noanswer'); }
      else if (g.state === 'playing') {
        g.players.forEach((p, i) => { if (!g.out[i] && now - g.seen[i] > 120000) luDrop(g, i, 'left'); });
      } else if (g.state === 'over' && now - g.endAt > 60000) lgames.delete(g.id);
    }
  }
  function luView(g, uid) {
    const me = g.players.findIndex(p => p.id === uid);
    return { id: g.id, state: g.state, players: g.players.map(p => ({ id: p.id, name: p.name })), pend: g.pending.map(p => p.name), host: me === 0,
      group: g.group ? g.group.name : '', me, colors: g.colors || luColorsFor(Math.max(2, g.players.length)), out: g.out || [],
      tokens: g.tokens || [], turn: g.turn, roll: g.roll, movable: g.state === 'playing' && g.turn === me ? luMovable(g, me) : [],
      winner: g.winner, reason: g.reason, ev: g.ev, msg: g.msg, last: g.last, left: Math.max(0, Math.ceil((LU_LOBBY_MS - (Date.now() - g.t0)) / 1000)) };
  }
  const luGone = { ok: true, game: { state: 'over', reason: 'gone', me: -1, players: [], tokens: [], movable: [], pend: [], out: [] } };
  async function ludoRoute(req) {
    const uid = globalThis.checkToken_(req.token); if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    luSweep(); const a = req.action, now = Date.now();
    if (a === 'ludoInvite') {
      if (lbusy.has(uid)) globalThis.fail_('You are already in a Ludo game.', 'LUDO');
      const S0 = globalThis.readSettings_().values, me = globalThis.getAccount_(uid, S0);
      let invitees = [], group = null;
      if (req.group) {                                   // group chat: everybody in the group
        const gi = globalThis.chatGroupMembers_(String(req.group), uid);
        if (!gi) globalThis.fail_('Group not found.', 'LUDO');
        group = { id: gi.id, name: gi.name }; invitees = gi.members.filter(m => m.id !== uid);
        if (!invitees.length) globalThis.fail_('There is nobody else in this group.', 'LUDO');
      } else {                                           // one-to-one chat
        const to = String(req.to || ''), peer = to && to !== uid ? globalThis.getAccount_(to, S0) : null;
        if (!peer || !peer.active || !peer.username || !globalThis.chatCanSee_(uid, to)) globalThis.fail_('That user was not found.', 'LUDO');
        invitees = [{ id: to, name: peer.name || peer.username }];
      }
      const free = invitees.filter(m => !lbusy.has(m.id));
      if (!free.length) globalThis.fail_(invitees.length === 1 ? invitees[0].name + ' is busy in another Ludo game.' : 'Everybody in this group is busy in another Ludo game.', 'LUDO');
      const id = crypto.randomBytes(8).toString('hex');
      const g = { id, state: 'invite', group, players: [{ id: uid, name: (me && (me.name || me.username)) || 'Someone' }], pending: free.map(m => ({ id: m.id, name: m.name })),
        all: new Set([uid, ...free.map(m => m.id)]), colors: null, tokens: null, out: null, turn: 0, roll: 0, sixes: 0, winner: -1, reason: '', ev: 0, msg: '', last: null,
        t0: now, seen: [now], endAt: 0 };
      lgames.set(id, g); for (const x of g.all) lbusy.set(x, id);
      return { ok: true, id, invited: free.length, skipped: invitees.length - free.length };
    }
    if (a === 'ludoPoll') {
      if (req.gid) {
        const g = lgames.get(String(req.gid)); if (!g) return luGone;
        const pi = g.players.findIndex(p => p.id === uid); if (pi < 0) return luGone;
        if (g.seen) g.seen[pi] = now; return { ok: true, game: luView(g, uid) };
      }
      const cur = lgames.get(lbusy.get(uid) || '');
      if (cur && cur.state === 'invite' && cur.pending.some(p => p.id === uid))
        return { ok: true, incoming: { id: cur.id, fromName: cur.players[0].name, group: cur.group ? cur.group.name : '', total: cur.players.length + cur.pending.length } };
      return { ok: true, incoming: null };
    }
    const g = lgames.get(String(req.gid || ''));
    const pi = g ? g.players.findIndex(p => p.id === uid) : -1, pj = g ? g.pending.findIndex(p => p.id === uid) : -1;
    if (!g || (pi < 0 && pj < 0)) globalThis.fail_('This game has ended.', 'LUDO');
    if (a === 'ludoLeave') {
      if (g.state === 'invite') {
        if (pi === 0) luFinish(g, 'cancelled');
        else {
          if (pj >= 0) g.pending.splice(pj, 1); else g.players.splice(pi, 1);
          if (lbusy.get(uid) === g.id) lbusy.delete(uid);
          luInviteCheck(g);
        }
      } else if (g.state === 'playing' && pi >= 0) luDrop(g, pi, 'resigned');
      return { ok: true };
    }
    if (a === 'ludoAccept') {
      if (g.state !== 'invite' || pj < 0) globalThis.fail_('This invite is no longer open.', 'LUDO');
      const p = g.pending.splice(pj, 1)[0];
      if (g.players.length >= LU_MAX) { if (lbusy.get(uid) === g.id) lbusy.delete(uid); globalThis.fail_('This game is already full (4 players).', 'LUDO'); }
      g.players.push(p); luNote(g, p.name + ' joined'); luInviteCheck(g);
      return { ok: true };
    }
    if (a === 'ludoStart') {
      if (g.state !== 'invite' || pi !== 0) globalThis.fail_('Only the person who invited can start the game.', 'LUDO');
      if (g.players.length < 2) globalThis.fail_('Wait until at least one person joins.', 'LUDO');
      luStartGame(g); return { ok: true };
    }
    if (g.state !== 'playing' || pi < 0 || g.turn !== pi || g.out[pi]) globalThis.fail_('It is not your turn.', 'LUDO');
    if (a === 'ludoRoll') {
      if (g.roll) globalThis.fail_('Move a token first.', 'LUDO');
      const r = 1 + crypto.randomInt(6); g.last = { by: pi, v: r };
      if (r === 6 && g.sixes === 2) { luPass(g); luNote(g, 'Three sixes in a row - turn lost'); return { ok: true }; }
      g.roll = r; g.sixes = r === 6 ? g.sixes + 1 : 0;
      if (!luMovable(g, pi).length) { luPass(g); luNote(g, 'Rolled ' + r + ' - no move'); }
      else luNote(g, 'Rolled ' + r);
      return { ok: true };
    }
    if (a === 'ludoMove') {
      const t = Number(req.token_i), mv = luMovable(g, pi);
      if (!mv.includes(t)) globalThis.fail_('That token cannot move.', 'LUDO');
      const ci = g.colors[pi], roll = g.roll, from = g.tokens[pi][t];
      const to = from === -1 ? 0 : from + roll; g.tokens[pi][t] = to;
      let extra = roll === 6, text = 'Moved';
      if (to <= 50) {
        const ab = luAbs(ci, to);
        if (!LU_SAFE.has(ab)) {
          g.players.forEach((_, opp) => {
            if (opp === pi || g.out[opp]) return;
            const oc = g.colors[opp];
            g.tokens[opp].forEach((op, k) => { if (op >= 0 && op <= 50 && luAbs(oc, op) === ab) { g.tokens[opp][k] = -1; extra = true; text = 'Captured a token!'; } });
          });
        }
      } else if (to === 56) { extra = true; text = 'Token reached home!'; }
      g.roll = 0;
      if (g.tokens[pi].every(x => x === 56)) { luFinish(g, 'won', pi); luNote(g, g.players[pi].name + ' wins!'); return { ok: true }; }
      if (!extra) luPass(g);
      luNote(g, text); return { ok: true };
    }
  }

  // ---------- Deploy tab (main admin only): publish updated files to GitHub; Render auto-deploys from the branch ----------
  // Needs env vars on Render:  GITHUB_TOKEN (fine-grained token, Contents: read & write on ONE repo), GITHUB_REPO ("owner/name"), optional GITHUB_BRANCH (default main).
  const DEPLOY_ACTIONS = new Set(['deployStatus', 'deployFiles', 'deployUpload', 'deployHistory', 'deployRestore', 'deployProgress', 'deployDownload', 'deployZip', 'renderStatus', 'renderDeploy', 'verFiles', 'verBuild', 'verClone', 'verList', 'verTicket']);
  const GH = { repo: String(env.GITHUB_REPO || '').trim(), branch: String(env.GITHUB_BRANCH || 'main').trim(), token: String(env.GITHUB_TOKEN || '').trim() };
  const DEP_BACKEND = /^(server\.js|code\.gs|package\.json|google-store\.js|gas-shim\.js)$/i;   // changing these changes the server itself (only a warning in the app, never blocks)
  const DEP_MAX = 25 * 1024 * 1024, DEP_TOTAL = 60 * 1024 * 1024, DEP_FILES = 60, CLONE_MAX = 95 * 1024 * 1024;   // CLONE_MAX: apk/zip in clone-src/ (GitHub itself refuses files over 100 MB)   // generous limits: any file type (text or binary), many files
  const depBase = p => String(p).split('/').pop();
  function depPathOk(p) {
    p = String(p || '');
    return p.length > 0 && p.length < 240 && !/[\\:*?"<>|\x00-\x1f]/.test(p) && !p.startsWith('/') && !p.includes('..') && !p.includes('//')
      && p.split('/').every(s => s && s !== '.git' && s !== 'node_modules');
  }
  async function gh(method, url, body) {
    const r = await fetch('https://api.github.com/repos/' + GH.repo + url, { method,
      headers: { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'attendance-app-deploy', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const why = r.status === 401 ? 'GitHub rejected the token (expired or wrong). Make a new token and update GITHUB_TOKEN on Render.'
        : r.status === 404 ? 'GitHub could not find the repository, branch or file. Check GITHUB_REPO / GITHUB_BRANCH and that the token has access to that repository.'
        : r.status === 403 ? 'GitHub refused (the token needs "Contents: Read and write" permission, or the rate limit was hit).'
        : r.status === 422 ? 'GitHub could not save this change (' + (j.message || 'conflict') + '). Refresh the list and try again.'
        : 'GitHub error ' + r.status + ': ' + (j.message || '');
      globalThis.fail_(why, 'GITHUB');
    }
    return j;
  }
  const ghPath = p => p.split('/').map(encodeURIComponent).join('/');
  const gitBlobSha = buf => crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf])).digest('hex');
  function depCheckSyntax(path, buf) {          // returns a warning text (never blocks the upload)
    try {
      const text = buf.toString('utf8');
      if (/\.(js|gs)$/i.test(path)) new vm.Script(text.replace(/^#!.*/, ''), { filename: path });
      else if (/\.json$/i.test(path)) JSON.parse(text);
    } catch (e) { return path + ': ' + e.message; }
    return '';
  }
  const depCommits = list => (Array.isArray(list) ? list : []).map(c => ({ sha: c.sha, short: String(c.sha).slice(0, 7), msg: String((c.commit && c.commit.message) || '').split('\n')[0],
    by: c.commit && c.commit.author ? c.commit.author.name : '', at: c.commit && c.commit.author ? c.commit.author.date : '' }));
  // ONE commit for all the files (so Render redeploys once, with a consistent set of files)
  async function depCommit(files, message) {          // files: [{ path, buf: Buffer }]
    const br = encodeURIComponent(GH.branch);
    const ref = await gh('GET', '/git/ref/heads/' + br), head = ref.object.sha;
    const hc = await gh('GET', '/git/commits/' + head);
    const tree = await gh('GET', '/git/trees/' + hc.tree.sha + '?recursive=1');
    const cur = new Map((tree.tree || []).filter(x => x.type === 'blob').map(x => [x.path, x.sha]));
    const changed = files.filter(f => cur.get(f.path) !== gitBlobSha(f.buf));
    const skipped = files.filter(f => !changed.includes(f)).map(f => f.path);
    if (!changed.length) return { unchanged: true, skipped };
    const entries = [];
    for (const f of changed) {                      // every file goes up as a blob, so text and binary (images, zip, fonts …) work the same
      const bl = await gh('POST', '/git/blobs', { content: f.buf.toString('base64'), encoding: 'base64' });
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: bl.sha });
    }
    const nt = await gh('POST', '/git/trees', { base_tree: hc.tree.sha, tree: entries });
    const nc = await gh('POST', '/git/commits', { message, tree: nt.sha, parents: [head] });
    await gh('PATCH', '/git/refs/heads/' + br, { sha: nc.sha });
    return { sha: String(nc.sha).slice(0, 7), url: nc.html_url, changed: changed.map(f => ({ path: f.path, isNew: !cur.has(f.path) })), skipped };
  }

  // ---------- Version tab: build an Android APK from chosen repository files (GitHub Actions workflow .github/workflows/build-apk.yml) ----------
  const VER_WF = 'build-apk.yml';
  function verPathOk(p) {
    p = String(p || '');
    return p.length > 0 && p.length < 200 && /^[\w.\-\/]+$/.test(p) && !p.startsWith('/') && !p.includes('..') && !p.includes('//')
      && p.split('/').every(s => s && !s.startsWith('.') && s !== 'node_modules');
  }
  async function verGh(method, url, body) {
    try { return await gh(method, url, body); }
    catch (e) {
      if (e.code === 'GITHUB' && /could not find/i.test(e.message)) globalThis.fail_('The file .github/workflows/' + VER_WF + ' was not found on branch "' + GH.branch + '". Upload it to the repository first.', 'VERWF');
      if (e.code === 'GITHUB' && /refused/i.test(e.message)) globalThis.fail_('GitHub refused. Give the token “Actions: Read and write” and “Contents: Read and write” permission (Fine-grained token → Repository permissions).', 'GITHUB');
      throw e;
    }
  }
  async function verRoute(a, req) {
    if (a === 'verFiles') {
      const t = await gh('GET', '/git/trees/' + encodeURIComponent(GH.branch) + '?recursive=1');
      return { ok: true, truncated: !!t.truncated, files: (t.tree || []).filter(x => x.type === 'blob' && verPathOk(x.path)).map(x => ({ path: x.path, size: x.size || 0 })) };
    }
    if (a === 'verList') {
      const [rr, rl] = await Promise.all([verGh('GET', '/actions/workflows/' + VER_WF + '/runs?per_page=25'), gh('GET', '/releases?per_page=30')]);
      const rel = new Map((Array.isArray(rl) ? rl : []).filter(r => /^apk-\d+$/.test(r.tag_name)).map(r => [r.tag_name, r]));
      return { ok: true, builds: (rr.workflow_runs || []).map(r => {
        const x = rel.get('apk-' + r.run_number), as = x && (x.assets || []).find(q => /\.apk$/i.test(q.name));
        return { id: r.id, no: r.run_number, status: r.status, conclusion: r.conclusion, at: r.created_at, url: r.html_url, title: r.display_title || '',
          asset: as ? { id: as.id, name: as.name, size: as.size } : null };
      }) };
    }
    if (a === 'verBuild') {
      const files = Array.isArray(req.files) ? [...new Set(req.files.map(String))] : [];
      if (!files.length || files.length > 400) globalThis.fail_('Choose the files for the app first.', 'VER');
      if (!files.includes('index.html')) globalThis.fail_('index.html must be selected — it is the first screen of the app.', 'VER');
      const t = await gh('GET', '/git/trees/' + encodeURIComponent(GH.branch) + '?recursive=1');
      const have = new Set((t.tree || []).filter(x => x.type === 'blob' && verPathOk(x.path)).map(x => x.path));
      const gone = files.find(f => !have.has(f)); if (gone) globalThis.fail_('"' + gone + '" is not in the repository.', 'VER');
      const name = String(req.appName || '').trim(), id = String(req.appId || '').trim(), ver = String(req.version || '').trim();
      if (!/^[\w][\w .\-]{0,29}$/.test(name)) globalThis.fail_('App name: 1–30 letters, numbers, space, dot or dash.', 'VER');
      if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(id) || id.length > 60) globalThis.fail_('Package id must look like com.yourname.app', 'VER');
      if (!/^\d+(\.\d+){0,3}$/.test(ver)) globalThis.fail_('Version must look like 1.0 or 2.3.1', 'VER');
      const csv = files.join(',');
      if (csv.length > 30000) globalThis.fail_('Too many files selected.', 'VER');
      await verGh('POST', '/actions/workflows/' + VER_WF + '/dispatches', { ref: GH.branch, inputs: { files: csv, app_name: name, app_id: id, version: ver } });
      return { ok: true };
    }
    if (a === 'verClone') {                         // Cloner: one APK per name, each with its own package id so all can be installed side by side
      const zip = String(req.zip || '').trim(), apk = String(req.apk || '').trim();      // optional: an uploaded .zip or .apk in the repo is the app (no file list needed)
      if (zip && apk) globalThis.fail_('Choose either a zip or an apk, not both.', 'VER');
      const files = (zip || apk) ? ['index.html'] : (Array.isArray(req.files) ? [...new Set(req.files.map(String))] : []);
      if (!files.length || files.length > 400) globalThis.fail_('Choose the files for the app first.', 'VER');
      if (!files.includes('index.html')) globalThis.fail_('index.html must be selected — it is the first screen of the app.', 'VER');
      const t = await gh('GET', '/git/trees/' + encodeURIComponent(GH.branch) + '?recursive=1');
      const have = new Set((t.tree || []).filter(x => x.type === 'blob' && verPathOk(x.path)).map(x => x.path));
      if (apk) { if (!verPathOk(apk) || !/\.apk$/i.test(apk) || !have.has(apk)) globalThis.fail_('The uploaded apk was not found in the repository.', 'VER'); }
      else if (zip) { if (!verPathOk(zip) || !/\.zip$/i.test(zip) || !have.has(zip)) globalThis.fail_('The uploaded zip was not found in the repository.', 'VER'); }
      else { const gone = files.find(f => !have.has(f)); if (gone) globalThis.fail_('"' + gone + '" is not in the repository.', 'VER'); }
      const ver = String(req.version || '').trim();
      if (!/^\d+(\.\d+){0,3}$/.test(ver)) globalThis.fail_('Version must look like 1.0 or 2.3.1', 'VER');
      const base = String(req.baseId || '').trim().toLowerCase();                      // e.g. com.ks.clone
      if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(base) || base.length > 45) globalThis.fail_('Package prefix must look like com.ks.clone', 'VER');
      const items = (Array.isArray(req.items) ? req.items : []).slice(0, 20);
      if (!items.length) globalThis.fail_('Add at least one clone name.', 'VER');
      const names = items.map(x => String(x || '').trim());
      if (names.some(n => !/^[\w][\w .\-]{0,29}$/.test(n))) globalThis.fail_('Each name: 1–30 letters, numbers, space, dot or dash.', 'VER');
      const csv = files.join(',');
      if (csv.length > 30000) globalThis.fail_('Too many files selected.', 'VER');
      const start = Math.max(1, Math.min(999, parseInt(req.startNo, 10) || 1));
      let started = 0;
      for (let i = 0; i < names.length; i++) {
        const id = base + String(start + i).padStart(2, '0');                           // com.ks.clone + 01 → com.ks.clone01 (unique per clone)
        await verGh('POST', '/actions/workflows/' + VER_WF + '/dispatches', { ref: GH.branch, inputs: { files: csv, app_name: names[i], app_id: id, version: ver, zip, apk } });
        started++;
        await new Promise(r => setTimeout(r, 1500));                                      // be gentle with the GitHub API
      }
      return { ok: true, started };
    }
    if (a === 'verTicket') {
      const aid = String(req.asset || ''); if (!/^\d+$/.test(aid)) globalThis.fail_('Invalid file.', 'VER');
      const exp = Date.now() + 120000;
      return { ok: true, id: 'apk:' + aid, ticket: exp + '.' + updTicketSig('apk:' + aid, exp) };
    }
  }
  // ---------- Render: manual deploy + status. Env on Render: RENDER_API_KEY + RENDER_SERVICE_ID (status and deploy), or only RENDER_DEPLOY_HOOK (deploy button only) ----------
  const RD = { key: String(env.RENDER_API_KEY || '').trim(), svc: String(env.RENDER_SERVICE_ID || '').trim(), hook: String(env.RENDER_DEPLOY_HOOK || '').trim() };
  async function rdApi(method, url, body) {
    const r = await fetch('https://api.render.com/v1' + url, { method, headers: { Authorization: 'Bearer ' + RD.key, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) globalThis.fail_(r.status === 401 ? 'Render rejected the API key. Check RENDER_API_KEY.' : r.status === 404 ? 'Render could not find the service. Check RENDER_SERVICE_ID (looks like srv-xxxxxxxx).' : 'Render error ' + r.status + ': ' + (j.message || ''), 'RENDER');
    return j;
  }
  async function renderRoute(a, req, ghReady) {
    const canStatus = !!(RD.key && RD.svc), canDeploy = canStatus || !!RD.hook;
    if (a === 'renderStatus') {
      const out = { ok: true, canStatus, canDeploy, deploys: [], head: null };
      if (ghReady) { try { const c = await gh('GET', '/commits/' + encodeURIComponent(GH.branch)); out.head = { sha: c.sha, short: String(c.sha).slice(0, 7), msg: String((c.commit && c.commit.message) || '').split('\n')[0], at: c.commit && c.commit.author ? c.commit.author.date : '' }; } catch (e) { out.headErr = e.message; } }
      if (canStatus) {
        const l = await rdApi('GET', '/services/' + encodeURIComponent(RD.svc) + '/deploys?limit=6');
        out.deploys = (Array.isArray(l) ? l : []).map(x => x.deploy || x).map(d => ({ id: d.id, status: d.status, trigger: d.trigger || '', at: d.createdAt, done: d.finishedAt || '',
          sha: d.commit ? String(d.commit.id || '') : '', msg: d.commit ? String(d.commit.message || '').split('\n')[0] : '' }));
      }
      return out;
    }
    if (!canDeploy) globalThis.fail_('Render is not connected. Add RENDER_API_KEY + RENDER_SERVICE_ID (or RENDER_DEPLOY_HOOK) on Render first.', 'NORENDER');
    if (canStatus) { const d = await rdApi('POST', '/services/' + encodeURIComponent(RD.svc) + '/deploys', { clearCache: req.clearCache === true ? 'clear' : 'do_not_clear' }); return { ok: true, id: (d.deploy || d).id || '' }; }
    const r = await fetch(RD.hook, { method: 'POST' });
    if (!r.ok) globalThis.fail_('The Render deploy hook was refused (error ' + r.status + ').', 'RENDER');
    return { ok: true, id: '' };
  }
  async function deployRoute(req) {
    const uid = globalThis.checkToken_(req.token);
    if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    if (uid !== 'ADMIN') globalThis.fail_('Only the main admin can use Deploy.', 'PERM');
    const a = req.action, ready = !!(GH.repo && GH.token);
    if (a === 'deployStatus') return { ok: true, configured: ready, repo: GH.repo, branch: GH.branch };
    if (a === 'renderStatus' || a === 'renderDeploy') return renderRoute(a, req, ready);
    if (!ready) globalThis.fail_('GitHub is not connected yet. Add GITHUB_TOKEN and GITHUB_REPO on Render first.', 'NOGH');
    const S0 = globalThis.readSettings_().values, acc = globalThis.getAccount_('ADMIN', S0) || {};
    const ctx = { uid: 'ADMIN', username: acc.username || 'admin', name: acc.name || '' };
    if (a === 'deployFiles') {
      const t = await gh('GET', '/git/trees/' + encodeURIComponent(GH.branch) + '?recursive=1');
      const files = (t.tree || []).filter(x => x.type === 'blob' && depPathOk(x.path)).slice(0, 3000).map(x => ({ path: x.path, size: x.size || 0 }));
      const cm = await gh('GET', '/commits?sha=' + encodeURIComponent(GH.branch) + '&per_page=15');
      return { ok: true, files, commits: depCommits(cm) };
    }
    if (a === 'deployProgress') {                 // the same "x/3" checks GitHub shows next to a commit (Render's deploy is one of them)
      const c = await gh('GET', '/commits/' + encodeURIComponent(GH.branch));
      const items = []; let limited = false;
      try {
        const st = await gh('GET', '/commits/' + c.sha + '/status');
        (st.statuses || []).forEach(x => items.push({ name: String(x.context || 'Status'), state: x.state === 'success' ? 'ok' : x.state === 'pending' ? 'wait' : 'bad' }));
      } catch (e) { if (e.code === 'GITHUB') limited = true; else throw e; }
      try {
        const ck = await gh('GET', '/commits/' + c.sha + '/check-runs?per_page=50');
        (ck.check_runs || []).forEach(x => items.push({ name: String(x.name || 'Check'),
          state: x.status !== 'completed' ? 'wait' : (['success', 'neutral', 'skipped'].includes(x.conclusion) ? 'ok' : 'bad') }));
      } catch (e) { if (e.code === 'GITHUB') limited = true; else throw e; }
      const done = items.filter(x => x.state === 'ok').length, bad = items.some(x => x.state === 'bad');
      return { ok: true, sha: c.sha, short: String(c.sha).slice(0, 7), msg: String((c.commit && c.commit.message) || '').split('\n')[0],
        at: c.commit && c.commit.author ? c.commit.author.date : '', total: items.length, done, items, limited,
        state: bad ? 'failure' : (items.length && done === items.length ? 'success' : 'pending') };
    }
    if (a.startsWith('ver')) return verRoute(a, req);
    if (a === 'deployHistory') {
      const path = String(req.path || ''); if (!depPathOk(path)) globalThis.fail_('Invalid file.', 'DEPLOY');
      return { ok: true, commits: depCommits(await gh('GET', '/commits?sha=' + encodeURIComponent(GH.branch) + '&path=' + encodeURIComponent(path) + '&per_page=15')) };
    }
    if (a === 'deployUpload') {
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length || files.length > DEP_FILES) globalThis.fail_('Choose between 1 and ' + DEP_FILES + ' files.', 'DEPLOY');
      let total = 0; const seen = new Set(), bufs = [], warn = [];
      for (const f of files) {
        if (!f || !depPathOk(f.path)) globalThis.fail_('"' + (f && f.path) + '" is not a valid file path.', 'DEPLOY');
        if (seen.has(f.path)) globalThis.fail_('"' + f.path + '" was chosen twice.', 'DEPLOY'); seen.add(f.path);
        const buf = typeof f.b64 === 'string' ? Buffer.from(f.b64, 'base64') : Buffer.from(String(f.content || ''), 'utf8');
        total += buf.length;
        const big = /^clone-src\/[\w.\-]+\.(apk|zip)$/i.test(f.path) && files.length === 1;   // Cloner source: one file, up to CLONE_MAX
        if (big ? buf.length > CLONE_MAX : (buf.length > DEP_MAX || total > DEP_TOTAL)) globalThis.fail_('The files are too big for one upload (max ' + ((big ? CLONE_MAX : DEP_MAX) / 1048576) + ' MB' + (big ? '' : ' each, ' + (DEP_TOTAL / 1048576) + ' MB together') + ').', 'DEPLOY');
        const w = depCheckSyntax(f.path, buf); if (w) warn.push(w);
        bufs.push({ path: f.path, buf });
      }
      const msg = String(req.message || '').trim().slice(0, 120) || ('Update ' + bufs.map(f => depBase(f.path)).slice(0, 6).join(', ') + ' (from the app)');
      const r = await depCommit(bufs, msg);
      if (!r.unchanged) globalThis.logActivity_('deployUpload', ctx, { path: r.changed.map(x => x.path).join(', ') });
      return Object.assign({ ok: true, warnings: warn }, r);
    }
    if (a === 'deployRestore') {
      const path = String(req.path || ''), sha = String(req.sha || '');
      if (!depPathOk(path) || !/^[0-9a-f]{7,40}$/.test(sha)) globalThis.fail_('Invalid request.', 'DEPLOY');
      const old = await gh('GET', '/contents/' + ghPath(path) + '?ref=' + sha);
      if (!old || !old.content) globalThis.fail_('Could not read that version.', 'DEPLOY');
      const r = await depCommit([{ path, buf: Buffer.from(old.content, 'base64') }], 'Restore ' + depBase(path) + ' to ' + sha.slice(0, 7) + ' (from the app)');
      if (!r.unchanged) globalThis.logActivity_('deployRestore', ctx, { path });
      return Object.assign({ ok: true }, r);
    }
    if (a === 'deployDownload') {                  // one file of the website, sent back as base64 so the app can save it
      const path = String(req.path || ''); if (!depPathOk(path)) globalThis.fail_('Invalid file.', 'DEPLOY');
      const t = await gh('GET', '/git/trees/' + encodeURIComponent(GH.branch) + '?recursive=1');
      const hit = (t.tree || []).find(x => x.type === 'blob' && x.path === path);
      if (!hit) globalThis.fail_('"' + path + '" is not in the repository.', 'DEPLOY');
      const bl = await gh('GET', '/git/blobs/' + hit.sha);
      return { ok: true, name: depBase(path), path, b64: String(bl.content || '').replace(/\s/g, '') };
    }
    if (a === 'deployZip') {                       // the whole website (current branch) as a ZIP
      const r = await fetch('https://api.github.com/repos/' + GH.repo + '/zipball/' + encodeURIComponent(GH.branch), { redirect: 'follow',
        headers: { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'attendance-app-deploy' } });
      if (!r.ok) globalThis.fail_('GitHub could not make the ZIP (error ' + r.status + '). Check the token has Contents access.', 'GITHUB');
      const buf = Buffer.from(await r.arrayBuffer());
      return { ok: true, name: (GH.repo.split('/').pop() || 'website') + '-' + GH.branch + '.zip', b64: buf.toString('base64') };
    }
  }

  // ---------- Updates tab: the main admin uploads app-update files, every signed-in user can download them ----------
  // The files are stored in the GitHub repository on a SEPARATE branch (default "app-updates"), so uploading never makes Render redeploy.
  // The list (title, version, notes, file name ...) is kept in the sheet's "_App Properties" tab. Uses the same GITHUB_TOKEN / GITHUB_REPO as Deploy.
  const UPD_ACTIONS = new Set(['updList', 'updEdit', 'updDelete', 'updTicket']);
  const UPD_MAX = 40 * 1024 * 1024;                                  // biggest file (40 MB)
  const UPD_BRANCH = String(env.UPDATES_BRANCH || 'app-updates').trim();
  const UPD_KEY = 'APP_UPDATES';
  const updReady = () => !!(GH.repo && GH.token);
  const updRead = () => { try { const a = JSON.parse(globalThis.PropertiesService.getScriptProperties().getProperty(UPD_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const updFits = list => JSON.stringify(list).length <= 45000;       // one sheet cell holds 50,000 characters
  const updWrite = list => { if (!updFits(list)) globalThis.fail_('Too many updates are saved. Delete some old ones first.', 'UPD'); globalThis.PropertiesService.getScriptProperties().setProperty(UPD_KEY, JSON.stringify(list)); };
  const updClean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
  const updName = n => String(n || 'update').split(/[\\\/]/).pop().replace(/[^\w.\- ()]/g, '_').replace(/^\.+/, '').trim().slice(-100) || 'update';
  const updView = u => ({ id: u.id, title: u.title, version: u.version || '', notes: u.notes || '', name: u.name, size: u.size || 0, at: u.at });
  function updWho(token) {                                            // any valid, active user
    const uid = globalThis.checkToken_(token); if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    const acc = globalThis.getAccount_(uid, globalThis.readSettings_().values);
    if (!acc || !acc.active) globalThis.fail_('This account is disabled. Please contact the admin.', 'DISABLED');
    return uid;
  }
  const updAdmin = token => { const uid = updWho(token); if (uid !== 'ADMIN') globalThis.fail_('Only the main admin can change updates.', 'PERM'); return uid; };
  const updTicketSig = (id, exp) => sign('upd:' + id + '|' + exp);
  let updBranchOk = false;
  async function updEnsureBranch() {                                   // create the storage branch from the main branch the first time
    if (updBranchOk) return;
    try { await gh('GET', '/git/ref/heads/' + encodeURIComponent(UPD_BRANCH)); }
    catch (e) {
      if (e.code !== 'GITHUB') throw e;
      const base = await gh('GET', '/git/ref/heads/' + encodeURIComponent(GH.branch));
      await gh('POST', '/git/refs', { ref: 'refs/heads/' + UPD_BRANCH, sha: base.object.sha });
    }
    updBranchOk = true;
  }
  async function updRoute(req) {                                       // runs inside the normal request queue
    const a = req.action;
    if (a === 'updList') { updWho(req.token); return { ok: true, items: updRead().map(updView), canManage: globalThis.checkToken_(req.token) === 'ADMIN', ready: updReady(), max: UPD_MAX }; }
    if (a === 'updTicket') {                                           // short-lived download pass (2 minutes), so the session token never goes in a link
      updWho(req.token);
      const u = updRead().find(x => x.id === String(req.id || '')); if (!u) globalThis.fail_('This update was removed.', 'UPD');
      const exp = Date.now() + 120000;
      return { ok: true, ticket: exp + '.' + updTicketSig(u.id, exp) };
    }
    updAdmin(req.token);
    const list = updRead(), i = list.findIndex(x => x.id === String(req.id || '')), u = list[i];
    if (!u) globalThis.fail_('This update was not found. Refresh the list.', 'UPD');
    if (a === 'updEdit') {
      const title = updClean(req.title, 120); if (!title) globalThis.fail_('Please enter a title.', 'UPD');
      u.title = title; u.version = updClean(req.version, 40); u.notes = updClean(req.notes, 600);
      updWrite(list); return { ok: true, items: list.map(updView) };
    }
    if (a === 'updDelete') {
      if (updReady()) {
        try { await gh('DELETE', '/contents/' + ghPath(u.path), { message: 'Remove update: ' + u.name, sha: u.sha, branch: UPD_BRANCH }); }
        catch (e) { if (!(e.code === 'GITHUB' && /could not find/i.test(e.message))) throw e; }      // already gone on GitHub = fine
      }
      list.splice(i, 1); updWrite(list); return { ok: true, items: list.map(updView) };
    }
  }
  // Upload: the big GitHub transfer runs OUTSIDE the request queue, so chat / attendance never wait for it.
  async function updUpload(token, q, buf) {
    await withWb(() => {
      updAdmin(token);
      if (!updReady()) globalThis.fail_('GitHub is not connected yet. Add GITHUB_TOKEN and GITHUB_REPO on Render first.', 'NOGH');
      if (!buf.length) globalThis.fail_('The file is empty.', 'UPD');
      if (buf.length > UPD_MAX) globalThis.fail_('The file is too big (max ' + (UPD_MAX / 1048576) + ' MB).', 'UPD');
      const probe = updRead(); probe.unshift({ id: '0'.repeat(10), title: updClean(q.title, 120), version: updClean(q.version, 40), notes: updClean(q.notes, 600), name: updName(q.name), size: buf.length, at: new Date().toISOString(), path: 'updates/' + '0'.repeat(10) + '/' + updName(q.name), sha: '0'.repeat(40) });
      if (!updFits(probe)) globalThis.fail_('Too many updates are saved. Delete some old ones first.', 'UPD');
    });
    const name = updName(q.name), title = updClean(q.title, 120) || name, id = crypto.randomBytes(5).toString('hex'), path = 'updates/' + id + '/' + name;
    await updEnsureBranch();
    const put = await gh('PUT', '/contents/' + ghPath(path), { message: 'Add update: ' + title.slice(0, 80), content: buf.toString('base64'), branch: UPD_BRANCH });
    const item = { id, title, version: updClean(q.version, 40), notes: updClean(q.notes, 600), name, size: buf.length, at: new Date().toISOString(), path, sha: put.content.sha };
    try { return await withWb(() => { const list = updRead(); list.unshift(item); updWrite(list); return { ok: true, items: list.map(updView) }; }); }
    catch (e) { try { await gh('DELETE', '/contents/' + ghPath(path), { message: 'Undo failed upload', sha: item.sha, branch: UPD_BRANCH }); } catch (x) {} throw e; }
  }
  // Download: check the pass, then stream the file from GitHub straight to the user (never kept in memory).
  async function updOpen(q) {
    const id = String(q.id || ''), [exp, sig] = String(q.k || '').split('.'), good = updTicketSig(id, exp);
    if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)) || !(Number(exp) > Date.now()))
      return { code: 403, error: 'This download link expired. Go back to the app and tap Download again.' };
    if (/^apk:\d+$/.test(id)) {                                    // an APK built by the Version tab (GitHub release asset)
      if (!updReady()) return { code: 503, error: 'GitHub is not connected on the server.' };
      const m = await gh('GET', '/releases/assets/' + id.slice(4));
      const r = await fetch('https://api.github.com/repos/' + GH.repo + '/releases/assets/' + id.slice(4),
        { headers: { Authorization: 'Bearer ' + GH.token, Accept: 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'attendance-app-deploy' } });
      if (!r.ok || !r.body) return { code: 502, error: 'GitHub could not give this APK (error ' + r.status + ').' };
      return { code: 200, u: { name: String(m.name || 'app.apk').replace(/[^\w.\-]/g, '_'), size: m.size || 0 }, body: r.body };
    }
    const u = await withWb(() => updRead().find(x => x.id === id));
    if (!u) return { code: 404, error: 'This update was removed.' };
    if (!updReady()) return { code: 503, error: 'GitHub is not connected on the server.' };
    const r = await fetch('https://api.github.com/repos/' + GH.repo + '/contents/' + ghPath(u.path) + '?ref=' + encodeURIComponent(UPD_BRANCH),
      { headers: { Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'attendance-app-deploy' } });
    if (!r.ok || !r.body) return { code: 502, error: 'GitHub could not give this file (error ' + r.status + ').' };
    return { code: 200, u, body: r.body };
  }

  // ---------- Chat translate (English / Hindi / Indonesian) ----------
  // Apps Script's LanguageApp does not exist on this Node server, so translate by calling Google Translate directly.
  // Runs outside the sheet queue (like call polling), so chat never waits for it. Results are cached 6 hours.
  const TR_OK = { en: 1, hi: 1, id: 1 }, trCache = new Map();
  // Google blocks bursts (HTTP 429). So: at most 3 requests at a time, a short gap between them, a retry with back-off,
  // a second Google address as back-up, and a quiet period when Google says "slow down" (instead of hammering it).
  let trActive = 0; const trWait = [];
  const trSleep = ms => new Promise(r => setTimeout(r, ms));
  const trSlot = () => new Promise(res => { const go = () => { trActive++; res(); }; if (trActive < 3) go(); else trWait.push(go); });
  const trFree = () => { trActive--; const n = trWait.shift(); if (n) n(); };
  const trErr = r => { const e = new Error('translate HTTP ' + r.status); e.status = r.status; e.retryAfter = Number(r.headers.get('retry-after')) || 0; return e; };
  async function trGoogle(text, to) {
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl=' + to + '&q=' + encodeURIComponent(text),
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw trErr(r);
    const j = await r.json();
    return (Array.isArray(j[0]) ? j[0] : []).map(x => (x && x[0]) || '').join('');
  }
  async function trAlt(text, to) {          // back-up address, used only when the main one refuses
    const r = await fetch('https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' + to + '&q=' + encodeURIComponent(text),
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw trErr(r);
    const j = await r.json();
    if (j && Array.isArray(j.sentences)) return j.sentences.map(x => (x && x.trans) || '').join('');
    if (Array.isArray(j)) { const f = Array.isArray(j[0]) ? j[0][0] : j[0]; if (typeof f === 'string') return f; }
    throw new Error('unknown back-up format');
  }
  async function trMyMem(text, to) {      // free, no key; 3rd address (different company, so not blocked with Google)
    const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 480)) + '&langpair=Autodetect|' + to,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw trErr(r);
    const j = await r.json(), v = j && j.responseData && j.responseData.translatedText;
    if (!v || Number(j.responseStatus) !== 200 || /MYMEMORY WARNING|INVALID/i.test(v)) { const e = new Error('mymemory refused'); e.status = 429; throw e; }
    return String(v);
  }
  async function trLingva(text, to) {     // 4th address (open Google-Translate front-end)
    const r = await fetch('https://lingva.ml/api/v1/auto/' + to + '/' + encodeURIComponent(text.slice(0, 1000)), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw trErr(r);
    const j = await r.json();
    if (!j || typeof j.translation !== 'string') throw new Error('lingva bad reply');
    return j.translation;
  }
  async function trCloud(text, to) {      // official Google Cloud Translation API: no rate-limit problem. Used first when GOOGLE_TRANSLATE_KEY is set.
    const r = await fetch('https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(env.GOOGLE_TRANSLATE_KEY),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, target: to, format: 'text' }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw trErr(r);
    const j = await r.json(), v = j && j.data && j.data.translations && j.data.translations[0] && j.data.translations[0].translatedText;
    if (typeof v !== 'string') throw new Error('cloud bad reply');
    return v;
  }
  // Each address gets its own "cool-off": when one says 429 it is skipped for 20 s while the others are tried straight away.
  const trDead = {};
  async function trChain(text, to) {
    const list = [];
    if (env.GOOGLE_TRANSLATE_KEY) list.push(['cloud', trCloud]);
    list.push(['gtx', trGoogle], ['alt', trAlt], ['mymemory', trMyMem], ['lingva', trLingva]);
    let last = null, tried = 0;
    for (const [name, fn] of list) {
      if (Date.now() < (trDead[name] || 0)) continue;
      tried++;
      try { const v = await fn(text, to); if (v && v.trim()) return v; last = new Error(name + ' empty'); }
      catch (e) {
        last = e;
        if (e.status === 429 || e.status >= 500 || e.name === 'TimeoutError' || e.status === 403) trDead[name] = Date.now() + (Math.min(e.retryAfter || 0, 60) * 1000 || 20000);
      }
    }
    if (!tried) throw new Error('translate paused (every translate address is rate-limited)');
    throw last || new Error('translate failed');
  }
  async function trOne(text, to) {
    const key = to + '|' + crypto.createHash('md5').update(text).digest('base64');
    const hit = trCache.get(key); if (hit && hit.t > Date.now()) return hit.v;
    let v = '';
    await trSlot();
    try {
      try { v = await trChain(text, to); }
      catch (e) {                           // everything failed once: wait a moment and try one more time
        if (/paused/.test(e.message)) throw e;
        await trSleep(700 + Math.random() * 300);
        v = await trChain(text, to);
      }
      await trSleep(150);                   // small gap so the next request is not a burst
    } finally { trFree(); }
    if (!v) throw new Error('empty translation');
    if (trCache.size > 3000) trCache.clear();
    trCache.set(key, { v, t: Date.now() + 6 * 3600 * 1000 });
    return v;
  }
  async function trRoute(req) {
    if (!globalThis.checkToken_(req.token)) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    const to = String(req.to || '').toLowerCase();
    if (!TR_OK[to]) globalThis.fail_('Choose English, Hindi or Indonesian.');
    const texts = (Array.isArray(req.texts) ? req.texts : []).slice(0, 30).map(t => String(t == null ? '' : t).slice(0, 1800));
    let bad = 0, why = '';
    const out = await Promise.all(texts.map(async t => {
      if (!t.trim()) return '';
      try { return await trOne(t, to); } catch (e) { bad++; why = e.message; return null; }
    }));
    if (bad) warn('Translate failed for ' + bad + ' of ' + texts.length + ' messages: ' + why);   // one line, not one per message
    return { ok: true, translations: out };
  }
  const fastTr = body => {
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || r.action !== 'chatTranslate') return null;
    return Promise.resolve().then(() => trRoute(r)).catch(err => ({ ok: false, error: err.message || String(err), code: err.code || 'ERR' }));
  };

  // ---------- Chat photos & videos -> the main admin's Google Drive ----------
  // The main admin connects Drive once (Settings). Files go to a folder "KS Chat Media" (scope drive.file: this app only sees files it made itself).
  // A photo / video message is created ONLY through this route, so nobody can fake one. Viewing uses short-lived signed links (see chatMediaTicket_).
  const MEDIA_MAX = 45 * 1048576, MEDIA_RE = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|3gpp|x-m4v)|audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|m4a|wav|x-wav|3gpp))$/;
  const gp = () => globalThis.PropertiesService.getScriptProperties();
  async function drvAccess() {
    if (drvTok && drvTok.exp > Date.now() + 60000) return drvTok.v;
    const refresh = await withWb(() => dec(gp().getProperty('DRV_TOK') || ''));
    if (!refresh) throw new Error('Google Drive is not connected. Ask the main admin to connect it in Settings.');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.CAL_CLIENT_ID || '', client_secret: env.CAL_CLIENT_SECRET || '', refresh_token: refresh, grant_type: 'refresh_token' }) });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) throw new Error('Google Drive login failed (' + (j.error_description || j.error || r.status) + '). Ask the main admin to reconnect Drive in Settings.');
    drvTok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return drvTok.v;
  }
  async function drvFolder(tok) {
    const id = await withWb(() => gp().getProperty('DRV_FOLDER') || '');
    if (id) {
      const c = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,trashed', { headers: { Authorization: 'Bearer ' + tok } });
      const o = c.ok ? await c.json().catch(() => ({})) : {};
      if (o.id && !o.trashed) return id;
    }
    const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'KS Chat Media', mimeType: 'application/vnd.google-apps.folder' }) });
    const j = await r.json().catch(() => ({}));
    if (!j.id) throw new Error('Could not create the Drive folder: ' + ((j.error && j.error.message) || r.status));
    await withWb(() => gp().setProperty('DRV_FOLDER', j.id));
    return j.id;
  }
  async function mediaUpload(token, q, buf) {
    const uid = globalThis.checkToken_(token);
    if (!uid) { const e = new Error('Session expired. Please log in again.'); e.code = 'AUTH'; throw e; }
    const mime = String(q.mime || '').toLowerCase().split(';')[0], vid = mime.indexOf('video/') === 0, aud = mime.indexOf('audio/') === 0, to = String(q.to || ''), cid = String(q.cid || '');
    if (!MEDIA_RE.test(mime)) throw new Error('Only photos, videos and voice notes can be sent.');
    if (!buf.length) throw new Error('The file is empty.');
    if (!vid && !aud && buf.length > 15 * 1048576) throw new Error('This photo is too big (max 15 MB).');
    await withWb(() => globalThis.route_({ action: 'chatMediaCheck', token, to }));          // is this person allowed to write to this chat?
    let tok = await drvAccess(), folder = await drvFolder(tok);
    const nm = String(q.name || (vid ? 'video' : aud ? 'voice' : 'photo')).replace(/[^\w.\- ]+/g, '_').slice(0, 80);
    const meta = { name: new Date().toISOString().slice(0, 10) + '_' + uid + '_' + nm, parents: [folder], mimeType: mime, description: 'KS chat media sent by ' + uid };
    const bnd = 'ksb' + crypto.randomBytes(8).toString('hex');
    const body = Buffer.concat([Buffer.from('--' + bnd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + bnd + '\r\nContent-Type: ' + mime + '\r\n\r\n'), buf, Buffer.from('\r\n--' + bnd + '--')]);
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + bnd }, body });
    const j = await r.json().catch(() => ({}));
    if (!j.id) { if (r.status === 401) drvTok = null; throw new Error('Google Drive did not accept the file: ' + ((j.error && j.error.message) || r.status)); }
    const text = 'ksmedia:' + JSON.stringify({ i: j.id, k: vid ? 'vid' : aud ? 'aud' : 'img', n: nm, s: buf.length, d: aud ? Math.max(0, Math.min(3600, Math.round(Number(q.d) || 0))) : undefined, c: String(q.c || '').replace(/\s+/g, ' ').trim().slice(0, 300), o: (q.o === '1' && !aud && !globalThis.isChatGroupId_(to)) ? 1 : undefined });
    return withWb(() => { globalThis.MEDIA_OK_ = true; try { return globalThis.route_({ action: 'chatSend', token, to, cid, text }); } finally { globalThis.MEDIA_OK_ = false; } });
  }
  async function drvDelete(id) {                                       // a snap that was opened is removed from Drive
    const tok = await drvAccess();
    await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } });
  }
  async function mediaOpen(q, range) {
    const id = String(q.id || ''), uid = String(q.u || ''), exp = String(q.e || ''), k = String(q.k || '');
    if (!/^[A-Za-z0-9_-]{10,100}$/.test(id)) return { code: 400, error: 'Bad link.' };
    const good = globalThis.mediaSign_(id, uid, exp);
    if (k.length !== good.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(good)) || !(Number(exp) > Date.now())) return { code: 403, error: 'This link expired. Reload the chat.' };
    const tok = await drvAccess(), h = { Authorization: 'Bearer ' + tok, 'Accept-Encoding': 'identity' };
    if (range && /^bytes=\d*-\d*$/.test(range)) h.Range = range;
    const r = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media', { headers: h });
    if (!r.ok || !r.body) { if (r.status === 401) drvTok = null; return { code: r.status === 404 ? 404 : 502, error: 'Google Drive could not give this file (error ' + r.status + ').' }; }
    return { code: r.status, r };
  }

  let chain = Promise.resolve();
  function withWb(fn) {                                                // run fn in the request queue with fresh sheet data, save its changes
    const job = async () => {
      if (!wb.loadedAt || Date.now() - wb.loadedAt > REFRESH) await wb.load();
      else live.step('cache', 'Sheet data from server memory', 200, 0, 'loaded ' + Math.round((Date.now() - wb.loadedAt) / 1000) + 's ago');
      let out, err;
      try { out = await fn(); } catch (e) { err = e; }
      try { await wb.flush(); } catch (e) { if (!err) err = e; }
      if (err) throw err;
      return out;
    };
    const p = chain.then(job, job); chain = p.catch(() => {}); return p;
  }
  async function run(body) {
    if (!wb.loadedAt || Date.now() - wb.loadedAt > REFRESH) await wb.load();
    else live.step('cache', 'Sheet data from server memory', 200, 0, 'loaded ' + Math.round((Date.now() - wb.loadedAt) / 1000) + 's ago');
    rt.delay = 0; rt.mails = []; rt.cal = [];
    let req, res;
    try { req = JSON.parse(body); res = DEPLOY_ACTIONS.has(req.action) ? await deployRoute(req) : UPD_ACTIONS.has(req.action) ? await updRoute(req) : BIO_ACTIONS.has(req.action) ? bioRoute(req) : globalThis.route_(req); }
    catch (err) { res = { ok: false, error: err.message || String(err), code: err.code || 'ERR' }; }
    if (req && req.action === 'logout') revoked.add(req.token);
    try { await wb.flush(); } catch (e) { res = { ok: false, error: 'Could not save to the sheet: ' + e.message, code: 'ERR' }; }
    if (rt.cal.length && !(res && res.ok === false)) {          // attach each user's (decrypted) refresh token, then sync in the background
      const P = globalThis.PropertiesService.getScriptProperties(), tk = {};
      const jobs = rt.cal.map(j => { if (!(j.uid in tk)) tk[j.uid] = dec(P.getProperty('CAL_TOK_' + j.uid) || ''); return Object.assign({}, j, { refresh: tk[j.uid] }); }).filter(j => j.refresh);
      if (jobs.length) calRun(jobs);
    }
    for (const m of rt.mails) {
      try { await sendMail(m, env); }
      catch (e) { res = { ok: false, error: 'Could not send the e-mail: ' + e.message }; }
    }
    if (rt.delay) await new Promise(r => setTimeout(r, Math.min(rt.delay, 1500)));
    return res;
  }
  const fastCall = body => {                           // call polling never waits behind slow sheet saves
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !(CALL_ACTIONS.has(r.action) || LUDO_ACTIONS.has(r.action))) return null;
    return Promise.resolve().then(() => LUDO_ACTIONS.has(r.action) ? ludoRoute(r) : callRoute(r)).catch(err => ({ ok: false, error: err.message || String(err), code: err.code || 'ERR' }));
  };
  const errOut = err => ({ ok: false, error: err.message || String(err), code: err.code || 'ERR' });
  const fastLive = body => {                           // chat ticks never wait behind slow sheet saves
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || (r.action !== 'chatLive' && r.action !== 'chatTyping')) return null;
    return Promise.resolve().then(() => r.action === 'chatTyping' ? chatTypingRoute(r) : chatLiveRoute(r)).catch(errOut);
  };
  const fastMail = body => {                           // Gmail calls go to Google, so they never wait behind (or hold up) sheet saves
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !MAIL_ACTIONS.has(r.action)) return null;
    return Promise.resolve().then(() => mailRoute(r)).catch(errOut);
  };
  const fastTg = body => {                             // Telegram calls go to Telegram, so they never wait behind (or hold up) sheet saves
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !TG.actions.has(r.action)) return null;
    return Promise.resolve().then(() => TG.route(r)).catch(errOut);
  };
  const fastWa = body => {                             // WhatsApp calls go to WhatsApp, so they never wait behind (or hold up) sheet saves
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !WA.actions.has(r.action)) return null;
    return Promise.resolve().then(() => WA.route(r)).catch(errOut);
  };
  const fastSp = body => {                             // Music search never waits behind sheet saves
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !SP.actions.has(r.action)) return null;
    return Promise.resolve().then(() => SP.route(r)).catch(errOut);
  };
  const fastYt = body => {
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !YT.actions.has(r.action)) return null;
    return Promise.resolve().then(() => YT.route(r)).catch(errOut);
  };
  const SITES = require('./sites-server')({ warn, withWb: fn => withWb(fn) });        // Websites tab list, saved per user in the Google Sheet
  const fastSites = body => {
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !SITES.actions.has(r.action)) return null;
    return Promise.resolve().then(() => SITES.route(r)).catch(errOut);
  };
  const RTC = require('./rtc-server')({ warn });                                     // FTP tab: phone-to-phone handshake (see rtc-server.js)
  const fastRtc = body => {
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !RTC.actions.has(r.action)) return null;
    return Promise.resolve().then(() => RTC.route(r)).catch(errOut);
  };
  const fastPush = body => {
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !PUSH.actions.has(r.action)) return null;
    return Promise.resolve().then(() => PUSH.route(r)).catch(errOut);
  };
  const fastExp = body => {                         // a user whose 24 h trial is over: every action except reading / chat to an admin answers "choose a plan"
    let r; try { r = JSON.parse(body); } catch (e) { return null; }
    if (!r || !r.token || typeof globalThis.expiredGate_ !== 'function') return null;
    try { const uid = globalThis.checkToken_(r.token); if (uid) globalThis.expiredGate_(uid, r.action, r, wb.loadedAt ? 'sheet' : true); }
    catch (err) { return Promise.resolve({ ok: false, error: err.message || String(err), code: err.code || 'ERR' }); }
    return null;
  };
  const handle0 = body => {
    const tr = live.begin(body), fin = r => { live.end(tr, r); return r; }, crash = e => { live.end(tr, { ok: false, code: 'CRASH', error: e && e.message }, true); throw e; };
    const fast = live.within(tr, () => fastExp(body) || fastCall(body) || fastLive(body) || fastMail(body) || fastTg(body) || fastWa(body) || fastSp(body) || fastYt(body) || fastPush(body) || fastSites(body) || fastRtc(body) || fastTr(body));
    if (fast) { live.started(tr); return fast.then(fin, crash); }                         // fast lane: never waits behind sheet saves
    const job = () => live.within(tr, () => { live.started(tr); return run(body); });
    return (chain = chain.then(job, job)).then(fin, crash);
  };
  const handle = body => {                           // a new chat message also goes out as a phone notification
    const p = handle0(body);
    let r0 = null; try { r0 = JSON.parse(body); } catch (e) {}
    if (r0 && r0.action === 'chatSnapOpen') p.then(res => { if (res && res.ok && res.fileId) setTimeout(() => drvDelete(res.fileId).catch(e => warn('snap delete', e && e.message)), 200000); }, () => {});
    if (r0 && r0.action === 'chatSend') p.then(res => { if (res && res.ok) PUSH.chat(r0, res).catch(e => warn('push', e && e.message)); }, () => {});
    return p;
  };
  return { handle,
           waMax: WA.max, waUp: (t, q, b) => WA.upload(t, q, b).catch(errOut), waOpen: (q, r) => WA.media(q, r),
           tgMax: TG.max, tgUp: (t, q, b) => TG.upload(t, q, b).catch(errOut), tgOpen: (q, r) => TG.media(q, r),
           mediaMax: MEDIA_MAX, mediaRe: MEDIA_RE, mediaUp: (t, q, b) => mediaUpload(t, q, b).catch(errOut), mediaOpen: (q, r) => mediaOpen(q, r).catch(e => ({ code: 500, error: e.message || 'Error' })),
           updMax: UPD_MAX, upload: (token, q, buf) => updUpload(token, q, buf).catch(errOut), updOpen: q => updOpen(q).catch(e => ({ code: 500, error: e.message || 'Error' })),
           oauth: q => (chain = chain.then(() => runOauth(q), () => runOauth(q)).catch(e => page(500, e.message))) };
}

async function sendMail(m, env) {
  if (!env.SMTP_USER || !env.SMTP_PASS) throw new Error('SMTP_USER / SMTP_PASS are not set on the server.');
  const nodemailer = require('nodemailer'), t0 = Date.now();
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  try { await t.sendMail({ from: '"' + (m.name || 'Attendance App') + '" <' + env.SMTP_USER + '>', to: m.to, subject: m.subject, text: m.body }); live.step('mail', 'Send e-mail (Gmail SMTP)', 250, Date.now() - t0, 'subject: ' + String(m.subject || '').slice(0, 60)); }
  catch (e) { live.step('mail', 'Send e-mail (Gmail SMTP)', 0, Date.now() - t0, e.message, true); throw e; }
}

function start(app, env) {
  const origins = String(env.ALLOWED_ORIGIN || '*').split(',').map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
  const anyOrigin = !origins.length || origins.includes('*');
  const corsFor = rq => {                                      // the website address(es) in ALLOWED_ORIGIN, plus the Android app (it runs on https://localhost)
    const ro = String((rq.headers && rq.headers.origin) || '');
    const o = anyOrigin ? '*' : (ro && (origins.includes(ro) || /^(https?|capacitor|ionic):\/\/localhost(:\d+)?$/.test(ro))) ? ro : origins[0];
    return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  };
  return http.createServer((rq, rs) => live.http(rq, rs, () => {
    const cors = corsFor(rq);
    const send = (code, obj) => {
      const body = Buffer.from(JSON.stringify(obj)), h = Object.assign({ 'Content-Type': 'application/json', 'Vary': 'Accept-Encoding' }, cors);
      if (body.length > 1024 && /\bgzip\b/.test(String(rq.headers['accept-encoding'] || ''))){    // smaller replies = faster on mobile data
        try { const z = require('zlib').gzipSync(body, { level: 5 }); h['Content-Encoding'] = 'gzip'; h['Content-Length'] = z.length; rs.writeHead(code, h); return rs.end(z); } catch (e) {}
      }
      rs.writeHead(code, h); rs.end(body);
    };
    if (rq.method === 'OPTIONS') { rs.writeHead(204, cors); return rs.end(); }
    const url = new URL(rq.url, 'http://x');
    if (rq.method === 'GET' && url.pathname === '/live/stream') return live.stream(rq, rs, cors, String(rq.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (rq.method === 'GET' && url.pathname === '/updates/download' && app.updOpen) {      // stream an update file to the user
      return app.updOpen(Object.fromEntries(url.searchParams)).then(o => {
        if (o.code !== 200) { rs.writeHead(o.code, { 'Content-Type': 'text/html; charset=utf-8' }); return rs.end('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:32px;max-width:480px;margin:auto"><h2>⚠️ Download failed</h2><p>' + String(o.error).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</p></body>'); }
        const h = { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + o.u.name + '"; filename*=UTF-8\'\'' + encodeURIComponent(o.u.name), 'Cache-Control': 'private, no-store' };
        if (o.u.size) h['Content-Length'] = String(o.u.size);
        rs.writeHead(200, h);
        const src = Readable.fromWeb(o.body); src.on('error', () => rs.destroy()); rs.on('close', () => src.destroy()); src.pipe(rs);
      });
    }
    if (rq.method === 'POST' && url.pathname === '/updates/upload' && app.upload) {        // raw file body, session token in the Authorization header
      const token = String(rq.headers.authorization || '').replace(/^Bearer\s+/i, ''), chunks = []; let n = 0, big = false;
      rq.on('data', c => { n += c.length; if (n > app.updMax) { big = true; chunks.length = 0; } else if (!big) chunks.push(c); });
      rq.on('end', async () => send(200, big ? { ok: false, error: 'The file is too big (max ' + (app.updMax / 1048576) + ' MB).', code: 'UPD' } : await app.upload(token, Object.fromEntries(url.searchParams), Buffer.concat(chunks))));
      return;
    }
    if (rq.method === 'GET' && url.pathname === '/chat/media' && app.mediaOpen) {           // stream a chat photo / video from Drive (signed link, Range for video seeking)
      const sp = url.searchParams;
      return app.mediaOpen(Object.fromEntries(sp), rq.headers.range).then(o => {
        if (!o.r) { rs.writeHead(o.code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return rs.end(String(o.error)); }
        const ct = String(o.r.headers.get('content-type') || '').toLowerCase().split(';')[0], okType = app.mediaRe.test(ct);
        const h = { 'Content-Type': okType ? ct : 'application/octet-stream', 'Cache-Control': 'private, max-age=21600', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Cross-Origin-Resource-Policy': 'cross-origin' };
        ['content-length', 'content-range'].forEach(n => { const v = o.r.headers.get(n); if (v) h[n] = v; });
        if (sp.get('dl') || !okType) h['Content-Disposition'] = 'attachment; filename="' + String(sp.get('n') || 'file').replace(/[^\w.\- ]/g, '_') + '"';
        rs.writeHead(o.code, h);
        const src = Readable.fromWeb(o.r.body); src.on('error', () => rs.destroy()); rs.on('close', () => src.destroy()); src.pipe(rs);
      }).catch(() => { rs.writeHead(500); rs.end('Error'); });
    }
    if (rq.method === 'POST' && url.pathname === '/chat/media/upload' && app.mediaUp) {     // raw photo / video body, session token in the Authorization header
      const token = String(rq.headers.authorization || '').replace(/^Bearer\s+/i, ''), chunks = []; let n = 0, big = false;
      rq.on('data', c => { n += c.length; if (n > app.mediaMax) { big = true; chunks.length = 0; } else if (!big) chunks.push(c); });
      rq.on('end', async () => send(200, big ? { ok: false, error: 'The file is too big (max ' + (app.mediaMax / 1048576) + ' MB).', code: 'MEDIA' } : await app.mediaUp(token, Object.fromEntries(url.searchParams), Buffer.concat(chunks))));
      return;
    }
    if (rq.method === 'GET' && url.pathname === '/wa/media' && app.waOpen) {                // WhatsApp profile photo / photo / video / voice / file (signed link, Range for seeking)
      return app.waOpen(Object.fromEntries(url.searchParams), rq.headers.range).then(o => {
        rs.writeHead(o.code, Object.assign({ 'Cross-Origin-Resource-Policy': 'cross-origin' }, o.headers)); rs.end(o.body);
      }).catch(() => { rs.writeHead(500); rs.end('Error'); });
    }
    if (rq.method === 'POST' && url.pathname === '/wa/upload' && app.waUp) {                // send a photo / video / voice / file on WhatsApp (raw body, session token in the Authorization header)
      const token = String(rq.headers.authorization || '').replace(/^Bearer\s+/i, ''), chunks = []; let n = 0, big = false;
      rq.on('data', c => { n += c.length; if (n > app.waMax) { big = true; chunks.length = 0; } else if (!big) chunks.push(c); });
      rq.on('end', async () => send(200, big ? { ok: false, error: 'The file is too big (max ' + (app.waMax / 1048576) + ' MB).', code: 'WA' } : await app.waUp(token, Object.fromEntries(url.searchParams), Buffer.concat(chunks))));
      return;
    }
    if (rq.method === 'GET' && url.pathname === '/tg/media' && app.tgOpen) {                // Telegram photo / video / file (signed link, Range for video seeking)
      return app.tgOpen(Object.fromEntries(url.searchParams), rq.headers.range).then(o => {
        rs.writeHead(o.code, Object.assign({ 'Cross-Origin-Resource-Policy': 'cross-origin' }, o.headers)); rs.end(o.body);
      }).catch(() => { rs.writeHead(500); rs.end('Error'); });
    }
    if (rq.method === 'POST' && url.pathname === '/tg/upload' && app.tgUp) {                // send a photo / video / file to Telegram (raw body, session token in the Authorization header)
      const token = String(rq.headers.authorization || '').replace(/^Bearer\s+/i, ''), chunks = []; let n = 0, big = false;
      rq.on('data', c => { n += c.length; if (n > app.tgMax) { big = true; chunks.length = 0; } else if (!big) chunks.push(c); });
      rq.on('end', async () => send(200, big ? { ok: false, error: 'The file is too big (max ' + (app.tgMax / 1048576) + ' MB).', code: 'TG' } : await app.tgUp(token, Object.fromEntries(url.searchParams), Buffer.concat(chunks))));
      return;
    }
    if (rq.method === 'GET' && rq.url.startsWith('/oauth/google/callback') && app.oauth) {
      const q = Object.fromEntries(new URL(rq.url, 'http://x').searchParams);
      return app.oauth(q).then(o => { rs.writeHead(o.code, { 'Content-Type': 'text/html; charset=utf-8' }); rs.end(o.html); });
    }
    if (rq.method === 'GET') return send(200, { ok: true, app: 'Attendance & Expense Tracker API', time: new Date().toISOString() });
    let body = '';
    let lim = 2e6;
    rq.on('data', c => { body += c; if (lim === 2e6 && /"action"\s*:\s*"deployUpload"/.test(body.slice(0, 800))) lim = 135e6; if (body.length > lim) rq.destroy(); });   // look only at the START of the body: the first network chunk is usually bigger than 800 bytes, so the old check never matched and every upload over 2 MB was cut off
    rq.on('end', async () => { let out; try { out = await app.handle(body); } catch (e) { out = { ok: false, error: 'Server error: ' + (e && e.message || e), code: 'CRASH' }; } send(200, out); });
  }));
}
module.exports = { makeApp, start };

if (require.main === module) {
  const env = process.env;
  let email = env.GOOGLE_CLIENT_EMAIL, key = env.GOOGLE_PRIVATE_KEY;
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) { const j = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON); email = j.client_email; key = j.private_key; }
  if (!email || !key || !env.SHEET_ID) { console.error('Set GOOGLE_SERVICE_ACCOUNT_JSON and SHEET_ID.'); process.exit(1); }
  const { GoogleStore } = require('./google-store');
  const app = makeApp(new GoogleStore({ email, key, sheetId: env.SHEET_ID }), Object.assign({}, env, { GOOGLE_PRIVATE_KEY: key }));
  start(app, env).listen(env.PORT || 3000, () => console.log('API running on port ' + (env.PORT || 3000)));
}
