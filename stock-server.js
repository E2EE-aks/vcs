'use strict';
// Stocks tab: each user's NSE/BSE watchlist, kept in the Google Sheet properties (like the Websites tab).
// FULL TIME: this server watches prices all day and night, market open or closed (every 30 s while the market is open,
// every 2 min while it is closed, so 24h symbols like BTC-USD / GC=F / USDINR=X still alert at night). When a stock has moved
// by the chosen % since the last alert it sends a WhatsApp message from the user's linked WhatsApp (see wa-server.js)
// and a phone notification. Every alert is also logged (time, price, %) and shown as a marker on the candle chart.
// Prices are cross-checked across several sources (Yahoo, NSE website, optional Twelve Data) - see 'price sources' below.
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

  // ---- price sources: independent feeds, cross-checked ----
  //   yahoo       Yahoo Finance (query1, falls back to query2)             no key
  //   nse         NSE India website quote API (NSE equities only)          no key
  //   twelvedata  Twelve Data (NSE/BSE)  only if env TWELVEDATA_KEY is set; used to CONFIRM an alert before it is sent and as chart fallback
  // Normal polling uses yahoo + nse. The moment a stock crosses the alert %, every source is asked again and the alert is sent
  // only if the confirmed price still crosses it. With 3 sources the median is used, with 2 the fresher one, and a mismatch is flagged.
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
  const TMO = ms => AbortSignal.timeout(ms);
  async function yahooChart(sym, iv, rg) {
    let err;
    for (const h of ['query1', 'query2']) {
      try {
        const r = await fetch('https://' + h + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(toY(sym)) + '?interval=' + iv + '&range=' + rg, { headers: { 'user-agent': UA }, signal: TMO(8000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return (await r.json()).chart.result[0];
      } catch (e) { err = e; }
    }
    throw err;
  }
  async function srcYahoo(sym) {
    const m = (await yahooChart(sym, '1m', '1d')).meta;
    return { p: m.regularMarketPrice, prev: m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, t: m.regularMarketTime || 0 };
  }
  const NSEH = { 'user-agent': UA, accept: 'application/json,text/plain,*/*', 'accept-language': 'en-US,en;q=0.9' };
  let nseCk = { v: '', at: 0 };
  const nseBad = new Map(), nseHit = new Map();
  async function nseCookie() {
    if (nseCk.v && Date.now() - nseCk.at < 240000) return nseCk.v;
    const r = await fetch('https://www.nseindia.com/', { headers: Object.assign({}, NSEH, { accept: 'text/html' }), signal: TMO(8000) });
    const sc = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
    nseCk = { v: sc.map(c => c.split(';')[0]).join('; '), at: Date.now() };
    return nseCk.v;
  }
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  function nseTime(x) {                                                          // "21-Nov-2026 15:29:58" (IST) -> epoch seconds
    const m = /^(\d{2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(x || '')); if (!m || !(m[2] in MON)) return 0;
    return Math.round((Date.UTC(+m[3], MON[m[2]], +m[1], +m[4], +m[5], +m[6]) - 19800000) / 1000);
  }
  async function srcNse(sym, fresh) {
    if (!/^[A-Z0-9&-]{1,20}$/.test(sym) || /^(BTC|ETH)-/.test(sym)) throw new Error('n/a');   // NSE equities only (not .BO, ^index, =X, crypto)
    if ((nseBad.get(sym) || 0) > Date.now()) throw new Error('n/a');
    const hit = nseHit.get(sym); if (hit && !fresh && Date.now() - hit.at < 20000) return hit.v;       // be gentle with NSE: one call per symbol per 20 s
    const ck = await nseCookie();
    const r = await fetch('https://www.nseindia.com/api/quote-equity?symbol=' + encodeURIComponent(sym), { headers: Object.assign({}, NSEH, { cookie: ck, referer: 'https://www.nseindia.com/get-quotes/equity?symbol=' + encodeURIComponent(sym) }), signal: TMO(8000) });
    if (r.status === 401 || r.status === 403) { nseCk.at = 0; throw new Error('HTTP ' + r.status); }
    if (r.status === 404) { nseBad.set(sym, Date.now() + 1800000); throw new Error('n/a'); }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), pi = j.priceInfo || {};
    if (!(pi.lastPrice > 0)) { nseBad.set(sym, Date.now() + 1800000); throw new Error('n/a'); }
    const v = { p: +pi.lastPrice, prev: +pi.previousClose || undefined, t: nseTime((j.metadata || {}).lastUpdateTime) };
    nseHit.set(sym, { at: Date.now(), v });
    return v;
  }
  const tdBase = sym => { const b = sym.replace(/\.(NS|BO)$/, ''); if (/[\^=]/.test(b) || /^(BTC|ETH)-/.test(b)) throw new Error('n/a'); return { b, ex: /\.BO$/.test(sym) ? 'BSE' : 'NSE' }; };
  async function srcTd(sym) {
    const key = process.env.TWELVEDATA_KEY; if (!key) throw new Error('n/a');
    const { b, ex } = tdBase(sym);
    const r = await fetch('https://api.twelvedata.com/quote?symbol=' + encodeURIComponent(b) + '&exchange=' + ex + '&apikey=' + encodeURIComponent(key), { signal: TMO(8000) });
    const j = await r.json();
    if (j.status === 'error' || !(+j.close > 0)) throw new Error(String(j.message || 'bad').slice(0, 60));
    return { p: +j.close, prev: +j.previous_close || undefined, t: +j.timestamp || 0 };
  }
  async function quote(sym, full) {
    const list = [['yahoo', srcYahoo], ['nse', srcNse]]; if (full) list.push(['twelvedata', srcTd]);
    const res = await Promise.allSettled(list.map(x => x[1](sym, full))), ok = [], by = {}, all = {};
    res.forEach((r, i) => { if (r.status === 'fulfilled' && r.value && r.value.p > 0) { ok.push(Object.assign({ n: list[i][0] }, r.value)); by[list[i][0]] = r.value.p; all[list[i][0]] = r.value; } });
    if (!ok.length) throw new Error('no source');
    const pick = ok.length >= 3 ? ok.slice().sort((a, b) => a.p - b.p)[1] : ok.length === 2 ? ((ok[1].t || 0) > (ok[0].t || 0) ? ok[1] : ok[0]) : ok[0];
    const lo = Math.min.apply(null, ok.map(x => x.p)), hi = Math.max.apply(null, ok.map(x => x.p));
    const prev = pick.prev || (ok.find(x => x.prev) || {}).prev;
    return { p: pick.p, prev, t: pick.t || 0, at: Date.now(), src: pick.n, n: ok.length, spread: pick.p ? (hi - lo) / pick.p * 100 : 0, by, all };
  }

  // ---- candle chart data (Yahoo, Twelve Data as fallback) ----
  const TF = { '1m': ['1m', '1d'], '5m': ['5m', '5d'], '15m': ['15m', '5d'], '1h': ['60m', '1mo'], '1d': ['1d', '6mo'] };
  const TDI = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '1d': '1day' };
  async function tdCandles(sym, tf) {
    const { b, ex } = tdBase(sym);
    const r = await fetch('https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(b) + '&exchange=' + ex + '&interval=' + (TDI[tf] || '5min') + '&outputsize=200&timezone=UTC&apikey=' + encodeURIComponent(process.env.TWELVEDATA_KEY), { signal: TMO(10000) });
    const j = await r.json();
    if (j.status === 'error' || !Array.isArray(j.values)) throw new Error(String(j.message || 'bad').slice(0, 60));
    return j.values.slice().reverse().map(v => [Math.floor(Date.parse(String(v.datetime).replace(' ', 'T') + 'Z') / 1000), +v.open, +v.high, +v.low, +v.close, +v.volume || 0]).filter(x => x[0] > 0 && x[1] > 0);
  }
  async function candles(sym, tf) {
    const k = sym + '|' + tf, hit = ccache.get(k);
    if (hit && Date.now() - hit.t < 25000) return hit.d;
    const [iv, rg] = TF[tf] || TF['5m'];
    let out = [], meta = {}, src = 'yahoo', yerr;
    try {
      const res = await yahooChart(sym, iv, rg), q = (res.indicators.quote || [{}])[0] || {}, ts = res.timestamp || [];
      meta = res.meta || {};
      for (let i = 0; i < ts.length; i++) {
        const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i];
        if (o == null || h == null || l == null || c == null) continue;
        out.push([ts[i], +o.toFixed(4), +h.toFixed(4), +l.toFixed(4), +c.toFixed(4), (q.volume && q.volume[i]) || 0]);
      }
    } catch (e) { yerr = e; }
    if (!out.length && process.env.TWELVEDATA_KEY) { try { out = await tdCandles(sym, tf); src = 'twelvedata'; } catch (e) { yerr = yerr || e; } }
    if (!out.length && yerr) throw yerr;
    const d = { c: out, src, p: meta.regularMarketPrice, prev: meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose };
    ccache.set(k, { t: Date.now(), d });
    if (ccache.size > 400) for (const key of [...ccache.keys()].slice(0, 100)) ccache.delete(key);
    return d;
  }
  function logAlert(uid, sym, ref, q, pct, src) {
    let a = hist.get(uid); if (!a) { a = []; hist.set(uid, a); }
    a.push({ s: sym, t: Date.now(), ref, p: q.p, pct: +pct.toFixed(3), src: src || '' });
    if (a.length > 300) a.splice(0, a.length - 300);
  }

  const SRCNAME = { yahoo: 'Yahoo Finance', nse: 'NSE India', twelvedata: 'Twelve Data' };
  const hms = t => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(t * 1000));
  // q = the alerting source's reading (q.p, q.prev, q.t) + q.src (its name) + q.all (every source's reading) for the comparison block
  function message(sym, ref, q, pct) {
    const up = pct > 0, day = q.prev ? (q.p - q.prev) / q.prev * 100 : null, names = Object.keys(q.all || {});
    let cmp = '';
    if (names.length > 1) {
      const ps = names.map(n => q.all[n].p), lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps), sp = lo ? (hi - lo) / lo * 100 : 0;
      cmp = '\n\n⚖️ *Comparison*\n' + names.map(n => (n === q.src ? '👉 ' : '▫️ ') + SRCNAME[n] + ': ₹' + inr(q.all[n].p) + (q.all[n].t ? ' (' + hms(q.all[n].t) + ')' : '')).join('\n') +
        '\nFarak: ' + sp.toFixed(2) + '% ' + (sp > 0.3 ? '⚠️' : '✅');
    }
    return (up ? '🟢 ▲ *' : '🔴 ▼ *') + sym + '* ' + (up ? 'up' : 'down') + ' ' + Math.abs(pct).toFixed(2) + '%\n📡 Source: *' + (SRCNAME[q.src] || q.src) + '*\n💰 ₹' + inr(ref) + ' → ₹' + inr(q.p) +
      (day == null ? '' : '\n📊 Aaj: ' + (day >= 0 ? '+' : '') + day.toFixed(2) + '%') + cmp + '\n\n🕒 ' + now().hms + ' IST, ' + now().date + (marketOpen() ? '' : ' (market band)') + (q.t ? '\n🏷️ Price time: ' + hms(q.t) + ' IST' : '');
  }

  // true = delivered (or nothing to deliver to), false = a channel failed -> try again on the next check
  async function alertUser(uid, c, sym, ref, q, pct) {
    const text = message(sym, ref, q, pct);
    let ok = true;
    if (c.wa && c.to && WA.isOpen(uid)) {
      const d = now().date; let s = sentDay.get(uid); if (!s || s.d !== d) { s = { d, n: 0 }; sentDay.set(uid, s); }
      if (s.n < 200) {                                                              // safety cap so a wild day cannot spam your WhatsApp
        try { await WA.sendText(uid, c.to, text); s.n++; await new Promise(r => setTimeout(r, 2500)); }
        catch (e) { warn('Stocks WhatsApp alert', e && e.message); ok = false; }
      }
    }
    if (c.push && PUSH && PUSH.has(uid)) {
      try { await PUSH.send(uid, { title: (pct > 0 ? '▲ ' : '▼ ') + sym + ' ' + Math.abs(pct).toFixed(2) + '% (' + (SRCNAME[q.src] || q.src) + ')', body: '₹' + inr(ref) + ' → ₹' + inr(q.p), channel: 'messages', tag: 'stk-' + sym + '-' + q.src, data: { kind: 'stock' } }); }
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
          const q = px[s]; if (!q || !q.all) continue;
          for (const name of Object.keys(q.all)) {                                   // every source alerts on its OWN price move, labelled with its name
            const r = q.all[name]; if (!(r.p > 0)) continue;
            const k = uid + '|' + s + '|' + name, ref = refs.get(k);
            if (ref == null) { refs.set(k, r.p); continue; }                         // first price seen = starting point
            const pct = (r.p - ref) / ref * 100;
            if (Math.abs(pct) < c.thr) continue;
            const qs = Object.assign({}, q, { p: r.p, prev: r.prev || q.prev, t: r.t, src: name });
            if (await alertUser(uid, c, s, ref, qs, pct)) { refs.set(k, r.p); logAlert(uid, s, ref, qs, pct, name); }
          }
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
      [...refs.keys()].forEach(k => { if (k.startsWith(uid + '|') && !c.symbols.includes(k.split('|')[1])) refs.delete(k); });
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
      if (px[s]) prices[s] = { p: px[s].p, prev: px[s].prev, t: px[s].t, n: px[s].n, src: px[s].src, spread: px[s].spread, by: px[s].by };
    }));
    return { ok: true, cfg: c, px: prices, waOk: WA.isOpen(uid), market: marketOpen(), alerts: (hist.get(uid) || []).slice(-50) };
  }
  return { actions: ACTIONS, route };
};
