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

  const usSyms = new Set();                                        // plain tickers (NVDA, AAPL...) that Yahoo only knows WITHOUT the .NS suffix
  const CRYPTO = /^[A-Z0-9]{2,10}-(USD|USDT|EUR|GBP|INR|BTC)$/;
  const toY = s => (/[.^=]/.test(s) || CRYPTO.test(s) || usSyms.has(s)) ? s : s + '.NS';
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
    const once = async y => {
      let err;
      for (const h of ['query1', 'query2']) {
        try {
          const r = await fetch('https://' + h + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(y) + '?interval=' + iv + '&range=' + rg, { headers: { 'user-agent': UA }, signal: TMO(8000) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const res = (await r.json()).chart.result[0];
          if (!res) throw new Error('no data');
          return res;
        } catch (e) { err = e; }
      }
      throw err;
    };
    const y = toY(sym);
    try { return await once(y); }
    catch (e) {
      // "NVDA.NS" does not exist -> it is a US (or other) ticker: try it as typed
      if (y !== sym && /HTTP 404|no data/.test(String(e && e.message))) {
        const r = await once(sym); usSyms.add(sym); return r;
      }
      throw e;
    }
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
  let nseDownTill = 0;
  async function srcNse(sym, fresh) {
    if (Date.now() < nseDownTill) throw new Error('n/a');                  // NSE is blocking this server right now: Yahoo alone is used
    try { return await srcNse0(sym, fresh); }
    catch (e) {
      const m = String((e && e.message) || e);
      if (/fetch failed|timeout|aborted|HTTP 40[13]|ECONN|ENOTFOUND/i.test(m)) { nseDownTill = Date.now() + 10 * 60 * 1000; throw new Error('n/a'); }
      throw e;
    }
  }
  async function srcNse0(sym, fresh) {
    if (usSyms.has(sym) || !/^[A-Z0-9&-]{1,20}$/.test(sym) || /^(BTC|ETH)-/.test(sym)) throw new Error('n/a');   // NSE equities only (not .BO, ^index, =X, crypto)
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
  // ---- Upstox (free "Analytics Token", valid 1 year, read-only, no static IP) - only active when env UPSTOX_TOKEN is set ----
  const upKeys = new Map();                                                       // NSE symbol -> instrument_key (or '' = not found), cached
  const nseName = sym => { const b = String(sym).replace(/\.NS$/, ''); return (/[.^=]/.test(b) || CRYPTO.test(b) || usSyms.has(sym) || !/^[A-Z0-9&-]{1,20}$/.test(b)) ? '' : b; };
  async function upKey(b) {
    const hit = upKeys.get(b); if (hit && hit.at > Date.now()) return hit.k;
    const r = await fetch('https://api.upstox.com/v2/instruments/search?query=' + encodeURIComponent(b) + '&exchanges=NSE&segments=EQ&records=10', { headers: { accept: 'application/json', authorization: 'Bearer ' + process.env.UPSTOX_TOKEN }, signal: TMO(8000) });
    if (r.status === 401 || r.status === 403) throw new Error('Upstox token invalid / expired');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), row = (j.data || []).find(x => x.segment === 'NSE_EQ' && String(x.trading_symbol).toUpperCase() === b);
    const k = row ? row.instrument_key : '';
    upKeys.set(b, { k, at: Date.now() + (k ? 7 * 864e5 : 6 * 36e5) });             // found: keep 7 days; not found (e.g. a US stock): ask again after 6 h
    return k;
  }
  const upHit = new Map();
  async function srcUpstox(sym, fresh) {
    if (!process.env.UPSTOX_TOKEN) throw new Error('n/a');
    const b = nseName(sym); if (!b) throw new Error('n/a');
    const h = upHit.get(b); if (h && !fresh && Date.now() - h.at < 8000) return h.v;
    const k = await upKey(b); if (!k) throw new Error('n/a');
    const r = await fetch('https://api.upstox.com/v3/market-quote/ltp?instrument_key=' + encodeURIComponent(k), { headers: { accept: 'application/json', authorization: 'Bearer ' + process.env.UPSTOX_TOKEN }, signal: TMO(8000) });
    if (r.status === 401 || r.status === 403) throw new Error('Upstox token invalid / expired');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), vals = Object.values(j.data || {}), d = vals.find(x => x && x.instrument_token === k) || vals[0];
    if (!d || !(+d.last_price > 0)) throw new Error('no price');
    const v = { p: +d.last_price, prev: +d.cp || undefined, t: Math.floor(Date.now() / 1000) };
    upHit.set(b, { at: Date.now(), v });
    return v;
  }

  // ---- Angel One SmartAPI - only active when env ANGEL_API_KEY + ANGEL_CLIENT + ANGEL_PIN + ANGEL_TOTP_SECRET are set.
  //      It logs in by itself (TOTP code is generated here), so nobody has to log in every day. ----
  const crypto = require('crypto');
  const b32 = s => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '', out = []; String(s).toUpperCase().replace(/[^A-Z2-7]/g, '').split('').forEach(c => { bits += A.indexOf(c).toString(2).padStart(5, '0'); }); for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
  const totp = secret => {
    const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const h = crypto.createHmac('sha1', b32(secret)).update(ctr).digest(), o = h[h.length - 1] & 15;
    return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
  };
  const angelOn = () => !!(process.env.ANGEL_API_KEY && process.env.ANGEL_CLIENT && process.env.ANGEL_PIN && process.env.ANGEL_TOTP_SECRET);
  const angelH = jwt => Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json', 'X-UserType': 'USER', 'X-SourceID': 'WEB', 'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '127.0.0.1', 'X-MACAddress': '00:00:00:00:00:00', 'X-PrivateKey': process.env.ANGEL_API_KEY }, jwt ? { Authorization: 'Bearer ' + jwt } : {});
  const ANGEL = 'https://apiconnect.angelone.in';
  let angelJwt = { v: '', at: 0 }, angelLogin = null, angelDownTill = 0;
  async function angelAuth() {
    if (angelJwt.v && Date.now() - angelJwt.at < 5 * 3600 * 1000) return angelJwt.v;           // re-login every 5 h
    if (angelLogin) return angelLogin;
    angelLogin = (async () => {
      const r = await fetch(ANGEL + '/rest/auth/angelbroking/user/v1/loginByPassword', { method: 'POST', headers: angelH(''), body: JSON.stringify({ clientcode: process.env.ANGEL_CLIENT, password: process.env.ANGEL_PIN, totp: totp(process.env.ANGEL_TOTP_SECRET) }), signal: TMO(10000) });
      const j = await r.json().catch(() => ({}));
      if (!j.status || !j.data || !j.data.jwtToken) { angelDownTill = Date.now() + 10 * 60 * 1000; throw new Error(String(j.message || 'Angel login failed').slice(0, 40)); }
      angelJwt = { v: j.data.jwtToken, at: Date.now() }; return angelJwt.v;
    })().finally(() => { angelLogin = null; });
    return angelLogin;
  }
  const angelTok = new Map();                                                     // NSE symbol -> symbol token ('' = not found)
  async function angelToken(b, jwt) {
    const hit = angelTok.get(b); if (hit && hit.at > Date.now()) return hit.k;
    const r = await fetch(ANGEL + '/rest/secure/angelbroking/order/v1/searchScrip', { method: 'POST', headers: angelH(jwt), body: JSON.stringify({ exchange: 'NSE', searchscrip: b }), signal: TMO(8000) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) { angelJwt.at = 0; throw new Error('Angel session expired'); }
    const row = (Array.isArray(j.data) ? j.data : []).find(x => String(x.tradingsymbol).toUpperCase() === b + '-EQ');
    const k = row ? String(row.symboltoken) : '';
    angelTok.set(b, { k, at: Date.now() + (k ? 7 * 864e5 : 6 * 36e5) });
    return k;
  }
  const angelHit = new Map();
  async function srcAngel(sym, fresh) {
    if (!angelOn() || Date.now() < angelDownTill) throw new Error('n/a');
    const b = nseName(sym); if (!b) throw new Error('n/a');
    const h = angelHit.get(b); if (h && !fresh && Date.now() - h.at < 8000) return h.v;
    const jwt = await angelAuth(), k = await angelToken(b, jwt); if (!k) throw new Error('n/a');
    const r = await fetch(ANGEL + '/rest/secure/angelbroking/market/v1/quote/', { method: 'POST', headers: angelH(jwt), body: JSON.stringify({ mode: 'FULL', exchangeTokens: { NSE: [k] } }), signal: TMO(8000) });
    if (r.status === 401 || r.status === 403) { angelJwt.at = 0; throw new Error('Angel session expired'); }
    const j = await r.json().catch(() => ({})), d = j && j.data && Array.isArray(j.data.fetched) ? j.data.fetched[0] : null;
    if (!d || !(+d.ltp > 0)) throw new Error('no price');
    const v = { p: +d.ltp, prev: +d.close || undefined, t: Math.floor(Date.now() / 1000) };
    angelHit.set(b, { at: Date.now(), v });
    return v;
  }
  // ---- Google Finance page (no key, no account). A 3rd opinion next to Yahoo / NSE and a real backup when Yahoo fails.
  //      Reads the public quote page; if Google changes the page or blocks this server it just goes quiet for 10 minutes. ----
  const gfNum = x => parseFloat(String(x).replace(/[^0-9.]/g, ''));
  const gfCode = new Map(), gfHit = new Map(); let gfDownTill = 0;                    // gfCode: symbol -> 'TATASTEEL:NSE' / 'NVDA:NASDAQ' once found
  async function gfPage(code) {
    const r = await fetch('https://www.google.com/finance/quote/' + encodeURIComponent(code) + '?hl=en', { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', cookie: 'CONSENT=YES+cb' }, signal: TMO(8000) });
    if (r.status === 429 || /\/sorry\/|consent\.google/.test(r.url || '')) { gfDownTill = Date.now() + 10 * 60 * 1000; throw new Error('n/a'); }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const h = await r.text();
    const m = h.match(/data-last-price="([\d.,]+)"/) || h.match(/class="YMlKec fxKbKc">[^\d<]*([\d.,]+)</);
    if (!m || !(gfNum(m[1]) > 0)) throw new Error('no price');
    const pm = h.match(/data-previous-close="([\d.,]+)"/) || h.match(/Previous close<\/div>[\s\S]{0,500}?class="P6K39c">[^\d<]*([\d.,]+)</);
    return { p: gfNum(m[1]), prev: pm ? gfNum(pm[1]) : undefined };
  }
  async function srcGoogle(sym, fresh) {
    if (Date.now() < gfDownTill) throw new Error('n/a');
    const b = String(sym).replace(/\.NS$/, '');
    if (/[.^=]/.test(b) || CRYPTO.test(b) || !/^[A-Z0-9&-]{1,20}$/.test(b)) throw new Error('n/a');
    const h = gfHit.get(b); if (h && !fresh && Date.now() - h.at < 8000) return h.v;
    const known = gfCode.get(b);
    const tries = known ? [known] : (usSyms.has(b) ? [b + ':NASDAQ', b + ':NYSE', b + ':NYSEARCA'] : [b + ':NSE', b + ':NASDAQ', b + ':NYSE', b + ':NYSEARCA']);
    let err;
    for (const c of tries) {
      try { const v = await gfPage(c); gfCode.set(b, c); gfHit.set(b, { at: Date.now(), v }); return v; }
      catch (e) { err = e; if (/n\/a/.test(String(e && e.message))) throw e; if (known) break; }
    }
    throw err || new Error('no price');
  }

  const brokerWarn = {};
  async function quote(sym, full) {
    const list = [['yahoo', srcYahoo], ['nse', srcNse], ['google', srcGoogle]]; if (process.env.UPSTOX_TOKEN) list.push(['upstox', srcUpstox]); if (angelOn()) list.push(['angel', srcAngel]); if (full) list.push(['twelvedata', srcTd]);
    const res = await Promise.allSettled(list.map(x => x[1](sym, full))), ok = [], by = {}, all = {}, errs = {};
    res.forEach((r, i) => { if (r.status === 'fulfilled' && r.value && r.value.p > 0) { ok.push(Object.assign({ n: list[i][0] }, r.value)); by[list[i][0]] = r.value.p; all[list[i][0]] = r.value; }
      else errs[list[i][0]] = r.status === 'rejected' ? String((r.reason && r.reason.message) || r.reason).slice(0, 40) : 'no price'; });
    ['upstox', 'angel'].forEach(k => { if (errs[k] && errs[k] !== 'n/a' && errs[k] !== 'no price' && Date.now() - (brokerWarn[k] || 0) > 3600000) { brokerWarn[k] = Date.now(); warn('Stocks ' + k + ' source failed', errs[k]); } });   // visible in server logs (the screen no longer shows source errors)
    if (!ok.length) throw new Error('no source');
    const broker = ok.find(x => x.n === 'upstox') || ok.find(x => x.n === 'angel');                  // broker feed = real-time exchange price: use it first
    const pick = broker || (ok.length >= 3 ? ok.slice().sort((a, b) => a.p - b.p)[1] : ok.length === 2 ? ((ok[1].t || 0) > (ok[0].t || 0) ? ok[1] : ok[0]) : ok[0]);
    const lo = Math.min.apply(null, ok.map(x => x.p)), hi = Math.max.apply(null, ok.map(x => x.p));
    const prev = pick.prev || (ok.find(x => x.prev) || {}).prev;
    return { p: pick.p, prev, t: pick.t || 0, at: Date.now(), src: pick.n, n: ok.length, spread: pick.p ? (hi - lo) / pick.p * 100 : 0, by, all, errs };
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

  const SRCNAME = { yahoo: 'Yahoo Finance', nse: 'NSE India', google: 'Google Finance', upstox: 'Upstox', angel: 'Angel One', twelvedata: 'Twelve Data' };
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
      if (px[s]) prices[s] = { p: px[s].p, prev: px[s].prev, t: px[s].t, n: px[s].n, src: px[s].src, spread: px[s].spread, by: px[s].by, errs: px[s].errs };
    }));
    return { ok: true, cfg: c, px: prices, waOk: WA.isOpen(uid), market: marketOpen(), alerts: (hist.get(uid) || []).slice(-50) };
  }
  return { actions: ACTIONS, route };
};
