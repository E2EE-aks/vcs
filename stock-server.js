'use strict';
// Stocks tab: each user's NSE/BSE watchlist, kept in the Google Sheet properties (like the Websites tab).
// FULL TIME: this server watches prices all day and night, market open or closed (every 30 s while the market is open,
// every 2 min while it is closed, so 24h symbols like BTC-USD / GC=F / USDINR=X still alert at night). When a stock has moved
// by the chosen % since the last alert it sends a WhatsApp message from the user's linked WhatsApp (see wa-server.js)
// and a phone notification. Every alert is also logged (time, price, %) and shown as a marker on the candle chart.
// Prices come from Yahoo Finance (unofficial, free).
module.exports = function ({ warn, withWb, WA, PUSH }) {
  const P = () => globalThis.PropertiesService.getScriptProperties();
  const ACTIONS = new Set(['stocksGet', 'stocksSave', 'stocksTest', 'stocksChart']);
  const keyOf = uid => 'STOCKS_' + uid, IDX = 'STOCKS_USERS';
  const cfgs = new Map(), refs = new Map(), px = {}, sentDay = new Map(), hist = new Map(), ccache = new Map();
  let loaded = false;

  const toY = s => /[.^]/.test(s) ? s : s + '.NS';
  const inr = n => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ist = d => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d || new Date());
  const part = (p, t) => (p.find(x => x.type === t) || {}).value || '';
  function now() { const p = ist(); return { day: part(p, 'weekday'), m: (+part(p, 'hour')) * 60 + (+part(p, 'minute')), date: part(p, 'year') + '-' + part(p, 'month') + '-' + part(p, 'day'), hms: part(p, 'hour') + ':' + part(p, 'minute') + ':' + part(p, 'second') }; }
  function marketOpen() { if (process.env.STOCK_ALWAYS === '1') return true; const n = now(); return n.day !== 'Sat' && n.day !== 'Sun' && n.m >= 555 && n.m <= 930; }

  const clean = j => {
    j = j || {};
    const seen = new Set(), symbols = [];
    (Array.isArray(j.symbols) ? j.symbols : []).forEach(x => { const s = String(x || '').toUpperCase().replace(/[^A-Z0-9&.^-]/g, '').slice(0, 20); if (s && !seen.has(s) && symbols.length < 40) { seen.add(s); symbols.push(s); } });
    const thr = Math.min(20, Math.max(0.05, Number(j.thr) || 0.5));
    return { on: j.on === undefined ? true : !!j.on, to: String(j.to || '').replace(/[^\d]/g, '').slice(0, 15), thr, symbols, wa: j.wa === undefined ? true : !!j.wa, push: j.push === undefined ? true : !!j.push };
  };
  const blank = () => clean({});

  async function load() {
    if (loaded) return;
    const ids = await withWb(() => { try { return JSON.parse(P().getProperty(IDX) || '[]') || []; } catch (e) { return []; } });
    for (const uid of ids) {
      const c = await withWb(() => { try { return JSON.parse(P().getProperty(keyOf(uid)) || 'null'); } catch (e) { return null; } });
      if (c) cfgs.set(uid, clean(c));
    }
    loaded = true;
  }
  async function readOne(uid) { await load(); return cfgs.get(uid) || blank(); }

  async function quote(sym) {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(toY(sym)) + '?interval=1m&range=1d', { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = (await r.json()).chart.result[0].meta;
    return { p: m.regularMarketPrice, prev: m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, at: Date.now() };
  }


  // ---- candle chart data (Yahoo) ----
  const TF = { '1m': ['1m', '1d'], '5m': ['5m', '5d'], '15m': ['15m', '5d'], '1h': ['60m', '1mo'], '1d': ['1d', '6mo'] };
  async function candles(sym, tf) {
    const k = sym + '|' + tf, hit = ccache.get(k);
    if (hit && Date.now() - hit.t < 25000) return hit.d;
    const [iv, rg] = TF[tf] || TF['5m'];
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(toY(sym)) + '?interval=' + iv + '&range=' + rg, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const res = (await r.json()).chart.result[0], q = (res.indicators.quote || [{}])[0] || {}, ts = res.timestamp || [], out = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i];
      if (o == null || h == null || l == null || c == null) continue;
      out.push([ts[i], +o.toFixed(4), +h.toFixed(4), +l.toFixed(4), +c.toFixed(4), (q.volume && q.volume[i]) || 0]);
    }
    const d = { c: out, p: res.meta.regularMarketPrice, prev: res.meta.chartPreviousClose != null ? res.meta.chartPreviousClose : res.meta.previousClose };
    ccache.set(k, { t: Date.now(), d });
    if (ccache.size > 400) for (const key of [...ccache.keys()].slice(0, 100)) ccache.delete(key);
    return d;
  }
  function logAlert(uid, sym, ref, q, pct) {
    let a = hist.get(uid); if (!a) { a = []; hist.set(uid, a); }
    a.push({ s: sym, t: Date.now(), ref, p: q.p, pct: +pct.toFixed(3) });
    if (a.length > 300) a.splice(0, a.length - 300);
  }

  function message(sym, ref, q, pct) {
    const up = pct > 0, day = q.prev ? (q.p - q.prev) / q.prev * 100 : null;
    return (up ? '🟢 ▲ *' : '🔴 ▼ *') + sym + '* ' + (up ? 'up' : 'down') + ' ' + Math.abs(pct).toFixed(2) + '%\n💰 ₹' + inr(ref) + ' → ₹' + inr(q.p) +
      (day == null ? '' : '\n📊 Aaj: ' + (day >= 0 ? '+' : '') + day.toFixed(2) + '%') + '\n🕒 ' + now().hms + ' IST, ' + now().date + (marketOpen() ? '' : ' (market band)');
  }

  // true = delivered (or nothing to deliver to), false = a channel failed -> try again on the next check
  async function alertUser(uid, c, sym, ref, q, pct) {
    const text = message(sym, ref, q, pct);
    let ok = true;
    if (c.wa && c.to && WA.isOpen(uid)) {
      const d = now().date; let s = sentDay.get(uid); if (!s || s.d !== d) { s = { d, n: 0 }; sentDay.set(uid, s); }
      if (s.n < 100) {                                                              // safety cap so a wild day cannot spam your WhatsApp
        try { await WA.sendText(uid, c.to, text); s.n++; await new Promise(r => setTimeout(r, 2500)); }
        catch (e) { warn('Stocks WhatsApp alert', e && e.message); ok = false; }
      }
    }
    if (c.push && PUSH && PUSH.has(uid)) {
      try { await PUSH.send(uid, { title: (pct > 0 ? '▲ ' : '▼ ') + sym + ' ' + Math.abs(pct).toFixed(2) + '%', body: '₹' + inr(ref) + ' → ₹' + inr(q.p), channel: 'messages', tag: 'stk-' + sym, data: { kind: 'stock' } }); }
      catch (e) { warn('Stocks push', e && e.message); }
    }
    return ok;
  }

  let busy = false, tick = 0;
  async function watch() {
    if (busy) return; busy = true;
    try {
      await load();
      tick++;
      if (!marketOpen() && tick % 4) return;                                 // market closed: check every 2 min instead of 30 s (alerts stay ON full time)
      const users = [...cfgs.entries()].filter(([u, c]) => c.on && c.symbols.length);
      if (!users.length) return;
      const syms = [...new Set(users.flatMap(([u, c]) => c.symbols))].slice(0, 80);
      await Promise.all(syms.map(async s => { try { px[s] = await quote(s); } catch (e) {} }));
      for (const [uid, c] of users) {
        for (const s of c.symbols) {
          const q = px[s]; if (!q || !(q.p > 0)) continue;
          const k = uid + '|' + s, ref = refs.get(k);
          if (ref == null) { refs.set(k, q.p); continue; }                       // first price seen = starting point
          const pct = (q.p - ref) / ref * 100;
          if (Math.abs(pct) < c.thr) continue;
          if (await alertUser(uid, c, s, ref, q, pct)) { refs.set(k, q.p); logAlert(uid, s, ref, q, pct); }
        }
      }
    } catch (e) { warn('Stocks watcher', e && e.message); } finally { busy = false; }
  }
  { const t = setInterval(() => watch().catch(() => {}), 30000); if (t.unref) t.unref(); }

  async function route(req) {
    const uid = globalThis.checkToken_(req.token);
    if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    if (req.action === 'stocksSave') {
      await load();
      const c = clean(req.cfg), old = cfgs.get(uid);
      cfgs.set(uid, c);
      [...refs.keys()].forEach(k => { if (k.startsWith(uid + '|') && !c.symbols.includes(k.slice(uid.length + 1))) refs.delete(k); });
      if (old && c.thr !== old.thr) [...refs.keys()].forEach(k => { if (k.startsWith(uid + '|')) refs.delete(k); });
      await withWb(() => {
        const p = P(); p.setProperty(keyOf(uid), JSON.stringify(c));
        let ids = []; try { ids = JSON.parse(p.getProperty(IDX) || '[]') || []; } catch (e) {}
        if (!ids.includes(uid)) { ids.push(uid); p.setProperty(IDX, JSON.stringify(ids)); }
        return true;
      });
    }
    if (req.action === 'stocksTest') {
      const c = await readOne(uid);
      if (!c.to) globalThis.fail_('Pehle apna WhatsApp number daalo aur Save karo.', 'STOCKS');
      if (!WA.isOpen(uid)) globalThis.fail_('WhatsApp connected nahi hai. WhatsApp tab me QR scan karke connect karo.', 'STOCKS');
      try { await WA.sendText(uid, c.to, '✅ *Stocks alert ON*\nJab bhi aapka koi stock ' + c.thr + '% ya zyada upar/niche jayega, yahin message aayega.'); }
      catch (e) { globalThis.fail_('Message nahi gaya: ' + String((e && e.message) || e).slice(0, 120), 'STOCKS'); }
      return { ok: true };
    }
    if (req.action === 'stocksChart') {
      const c = await readOne(uid), tf = TF[req.tf] ? req.tf : '5m';
      const want = (Array.isArray(req.syms) && req.syms.length ? req.syms : c.symbols).map(x => String(x).toUpperCase()).filter(x => c.symbols.includes(x)).slice(0, 40);
      const data = {}; let i = 0;
      await Promise.all(Array.from({ length: Math.min(6, want.length) }, async () => {      // 6 at a time, so Yahoo is not hammered
        while (i < want.length) { const s = want[i++]; try { data[s] = await candles(s, tf); } catch (e) { data[s] = { c: [], err: String((e && e.message) || e).slice(0, 60) }; } }
      }));
      return { ok: true, tf, data, alerts: hist.get(uid) || [], market: marketOpen() };
    }
    const c = await readOne(uid), prices = {};
    await Promise.all(c.symbols.slice(0, 40).map(async s => {
      if (!px[s] || Date.now() - px[s].at > 60000) { try { px[s] = await quote(s); } catch (e) {} }
      if (px[s]) prices[s] = { p: px[s].p, prev: px[s].prev };
    }));
    return { ok: true, cfg: c, px: prices, waOk: WA.isOpen(uid), market: marketOpen(), alerts: (hist.get(uid) || []).slice(-50) };
  }
  return { actions: ACTIONS, route };
};
