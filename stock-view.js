/* KS · Stocks tab: your NSE/BSE watchlist. When a stock moves up or down by the % you choose, the server sends you a WhatsApp message
   (from your linked WhatsApp) and a phone notification - full time (market open or closed), even when the app is closed.
   The list and settings are saved in your Google Sheet. The Candle chart view shows every watchlist stock with IST time and alert markers. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var KEY = 'ks_stocks_v1';
  var D = { cfg:{ on:true, to:'', thr:0.5, symbols:[], wa:true, push:true }, px:{}, waOk:null, market:null, loaded:false, err:'', msg:'', t:null, busy:false, loading:false,
    view:'list', tf:'5m', sel:'ALL', ch:null, n:60, off:0, cross:null, alerts:[], chErr:'' };
  try { var c0 = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c0) D.cfg = Object.assign(D.cfg, c0); } catch(e){}
  function haveSession(){ try { return typeof S !== 'undefined' && !!S.token && typeof callServer === 'function'; } catch(e){ return false; } }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function inr(n){ return Number(n).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  try { TITLES.stocks = ['Stocks', 'Watchlist + WhatsApp alerts']; } catch(e){}
  try { NAV_GRP.stocks = 'Workspace'; } catch(e){}

  var css = document.createElement('style');
  css.textContent = [
    '#skRoot{color:#1b1b1f}',
    '#skRoot .sk-box{background:#fff;border:1px solid #e3e3ea;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)}',
    '#skRoot label{display:block;font-size:12.5px;font-weight:700;color:#55555f;margin:10px 0 4px}',
    '#skRoot input[type=text],#skRoot input[type=tel],#skRoot input[type=number]{width:100%;box-sizing:border-box;border:1px solid #d8d8de;border-radius:10px;padding:11px 12px;font-size:15px;background:#fff;color:#1b1b1f}',
    '#skRoot .sk-row{display:flex;gap:8px;align-items:center}',
    '#skRoot .sk-btn{border:0;border-radius:12px;padding:0 16px;font-weight:700;font-size:14px;background:#5b3df5;color:#fff;cursor:pointer;min-height:42px;white-space:nowrap}',
    '#skRoot .sk-btn.gr{background:#eceaf8;color:#3b2bb5}',
    '#skRoot .sk-it{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #eee}',
    '#skRoot .sk-it:first-child{border-top:0}',
    '#skRoot .sk-nm{flex:1;min-width:0;font-weight:800}',
    '#skRoot .sk-nm small{display:block;font-weight:400;color:#77778a;font-size:12px}',
    '#skRoot .sk-px{font-weight:700;font-size:16px}',
    '#skRoot .sk-ch{min-width:78px;text-align:center;border-radius:8px;padding:4px 6px;font-size:13px;font-weight:700}',
    '#skRoot .up{background:#e3f4ec;color:#0e8a5f}#skRoot .dn{background:#fbe8e6;color:#c8372d}#skRoot .fl{background:#f1f1f6;color:#77778a}',
    '#skRoot .sk-x{flex:none;width:36px;height:36px;border:0;border-radius:10px;background:#f1f1f6;font-size:15px;cursor:pointer}',
    '#skRoot .sk-note{font-size:12.5px;color:#77778a;line-height:1.5;margin-top:8px}',
    '#skRoot .sk-warn{background:#fff6e0;color:#8a5a00;border-radius:10px;padding:9px 11px;font-size:13px;margin-bottom:12px}',
    '#skRoot .sk-empty{text-align:center;color:#77778a;padding:20px 8px;font-size:14px}',
    '#skRoot .sk-seg{display:flex;gap:6px;margin-bottom:12px}',
    '#skRoot .sk-seg button{flex:1;border:1px solid #d8d8de;background:#fff;border-radius:12px;padding:10px;font-weight:700;font-size:14px;color:#3b2bb5;cursor:pointer}',
    '#skRoot .sk-seg button.on{background:#5b3df5;color:#fff;border-color:#5b3df5}',
    '#skRoot .sk-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:6px;-webkit-overflow-scrolling:touch}',
    '#skRoot .sk-chips button{flex:none;border:1px solid #d8d8de;background:#fff;border-radius:999px;padding:6px 12px;font-weight:700;font-size:12.5px;color:#3b2bb5;cursor:pointer}',
    '#skRoot .sk-chips button.on{background:#eceaf8;border-color:#5b3df5}',
    '#skRoot .sk-pn{border-top:1px solid #eee;padding-top:2px}#skRoot .sk-pn:first-child{border-top:0}',
    '#skRoot .sk-pn canvas{display:block;width:100%}'
  ].join('\n');
  document.head.appendChild(css);

  function cache(){ try { localStorage.setItem(KEY, JSON.stringify(D.cfg)); } catch(e){} }
  function flush(){
    if (!haveSession() || D.busy){ if (D.busy) D.again = true; return; }
    D.busy = true; D.again = false;
    callServer({ action:'stocksSave', token:S.token, cfg:D.cfg }).then(function(j){
      if (!j || !j.ok) throw new Error((j && j.error) || 'Could not save');
      D.err = ''; D.px = j.px || D.px; D.waOk = j.waOk; D.market = j.market; D.loaded = true;
    }).catch(function(e){ D.err = (e && e.message) || 'Could not save to the server'; })
      .then(function(){ D.busy = false; if (D.again) flush(); else draw(); });
  }
  function save(){ cache(); clearTimeout(D.t); D.t = setTimeout(flush, 350); }
  function pull(){
    if (!haveSession() || D.loading) return; D.loading = true;
    callServer({ action:'stocksGet', token:S.token }).then(function(j){
      D.loading = false; if (!j || !j.ok) throw new Error((j && j.error) || 'Could not load');
      D.err = ''; D.px = j.px || {}; D.waOk = j.waOk; D.market = j.market; D.alerts = j.alerts || D.alerts;
      if (!D.t && !D.busy){
        var first = !D.loaded && !(j.cfg.symbols || []).length && D.cfg.symbols.length;    // first time: this phone's list moves to the sheet
        if (!first){ D.cfg = j.cfg; cache(); } else flush();
      }
      D.loaded = true;
      if (D.view === 'chart'){ renderChart(); reqCharts(); return; }
      var a = document.activeElement; if (!(a && a.tagName === 'INPUT' && $('#skRoot') && $('#skRoot').contains(a))) draw();
    }).catch(function(e){ D.loading = false; D.err = (e && e.message) || 'Could not reach the server'; draw(); });
  }

  function srcLine(q){
    if (!q || !q.p) return 'vs previous close';
    var h = 'vs prev close' + (q.t ? ' · price time ' + tmS(q.t) + ' IST' : '');
    if (q.by){ h += '<br>' + Object.keys(q.by).map(function(k){ return k + ' ₹' + inr(q.by[k]); }).join(' · ') + (q.n > 1 ? (q.spread > 0.3 ? ' · <span style="color:#c8372d;font-weight:700">⚠ ' + q.spread.toFixed(2) + '% farak</span>' : ' · <span style="color:#0e8a5f;font-weight:700">✓ match</span>') : ' · 1 source'); }
    if (q.errs){ var bad = Object.keys(q.errs).filter(function(k){ return q.errs[k] !== 'n/a'; }).map(function(k){ return k + ' ✗ ' + esc(q.errs[k]); }); if (bad.length) h += '<br><span style="color:#c8372d">' + bad.join(' · ') + '</span>'; }
    return h;
  }

  function draw(){
    var root = $('#skRoot'); if (!root) return;
    var c = D.cfg, h = '';
    if (D.err) h += '<div class="sk-warn">⚠ ' + esc(D.err) + '</div>';
    if (D.waOk === false) h += '<div class="sk-warn">WhatsApp abhi connected nahi hai. <b>WhatsApp</b> tab me QR scan karke connect karo, tabhi alert WhatsApp pe aayega.</div>';
    h += '<div class="sk-seg"><button data-sv="list" class="' + (D.view === 'list' ? 'on' : '') + '">📋 Watchlist</button><button data-sv="chart" class="' + (D.view === 'chart' ? 'on' : '') + '">🕯 Candle chart</button></div>';
    if (D.view === 'chart'){ root.innerHTML = h + chartShell(); mountChart(); return; }
    h += '<div class="sk-box"><div class="sk-row"><b style="flex:1">Alerts ' + (c.on ? 'ON' : 'OFF') + '</b><label style="margin:0"><input type="checkbox" id="skOn"' + (c.on ? ' checked' : '') + '> on</label></div>' +
      '<label>WhatsApp number (alert yahan aayega)</label><input type="tel" id="skTo" value="' + esc(c.to) + '" placeholder="919876543210" inputmode="numeric" autocomplete="off">' +
      '<label>Alert tab jab stock itne % hile (up ya down)</label><input type="number" id="skThr" value="' + esc(c.thr) + '" step="0.1" min="0.05" max="20" inputmode="decimal">' +
      '<div class="sk-row" style="margin-top:10px"><label style="margin:0"><input type="checkbox" id="skWa"' + (c.wa ? ' checked' : '') + '> WhatsApp</label><label style="margin:0"><input type="checkbox" id="skPush"' + (c.push ? ' checked' : '') + '> Phone notification</label></div>' +
      '<div class="sk-row" style="margin-top:12px"><button class="sk-btn gr" id="skTest">Send test on WhatsApp</button></div>' +
      '<div class="sk-note" id="skMsg">' + esc(D.msg || '') + '</div></div>';
    h += '<div class="sk-box"><div class="sk-row"><input type="text" id="skSym" placeholder="Symbol, e.g. RELIANCE, TCS.BO" autocapitalize="characters" autocomplete="off"><button class="sk-btn" id="skAdd">＋ Add</button></div>' +
      '<div class="sk-note">NSE ke liye sirf naam likho. BSE ke liye <b>.BO</b> lagao (TCS.BO). Index: ^NSEI, ^BSESN.</div><div style="margin-top:6px">';
    h += c.symbols.length ? c.symbols.map(function(s){
      var q = D.px[s], pr = '–', ch = '<span class="sk-ch fl">–</span>';
      if (q && q.p){ pr = '₹' + inr(q.p); var d = q.prev ? (q.p - q.prev) / q.prev * 100 : 0; ch = '<span class="sk-ch ' + (d > 0 ? 'up' : d < 0 ? 'dn' : 'fl') + '">' + (d >= 0 ? '▲ +' : '▼ ') + d.toFixed(2) + '%</span>'; }
      return '<div class="sk-it"><div class="sk-nm">' + esc(s) + '<small>' + srcLine(q) + '</small></div><div class="sk-px">' + pr + '</div>' + ch + '<button class="sk-x" data-r="' + esc(s) + '" aria-label="Remove ' + esc(s) + '">✕</button></div>';
    }).join('') : '<div class="sk-empty">Koi stock nahi hai. Upar symbol likhke add karo.</div>';
    h += '</div></div><div class="sk-note" style="padding:0 4px">Alerts full time ON hain (market open ya band). Market me server har 30 sec, band hone par har 2 min price check karta hai. NSE/BSE stock band market me hilta nahi, isliye alert tabhi aayega jab price badle; raat ko BTC-USD, GC=F, USDINR=X jaise 24h symbols ke alert aate rahenge. Yahoo aur NSE dono alag-alag apne price ke hisaab se alert bhejte hain (message me likha hota hai kis source se), saath me dono ka comparison bhi. ' + (D.market === false ? '<b>Market abhi band hai (alerts phir bhi ON).</b>' : '') + '</div>';
    root.innerHTML = h;
  }

  function addSym(){
    var el = $('#skSym'); if (!el) return;
    var s = el.value.trim().toUpperCase().replace(/[^A-Z0-9&.^-]/g, '');
    if (!s) return;
    if (D.cfg.symbols.indexOf(s) < 0 && D.cfg.symbols.length < 40) D.cfg.symbols.push(s);
    el.value = ''; save(); draw();
  }
  function bind(){
    var root = $('#skRoot'); if (!root || root.__b) return; root.__b = 1;
    root.addEventListener('click', function(e){
      var t = e.target;
      if (t.closest('#skAdd')) return addSym();
      var sv = t.closest('[data-sv]'); if (sv){ D.view = sv.dataset.sv; draw(); return; }
      var tfb = t.closest('[data-tf]'); if (tfb){ D.tf = tfb.dataset.tf; D.ch = null; D.off = 0; D.cross = null; draw(); return; }
      var csb = t.closest('[data-cs]'); if (csb){ D.sel = csb.dataset.cs; D.off = 0; D.cross = null; draw(); return; }
      var zb = t.closest('[data-z]'); if (zb){ var z = +zb.dataset.z; if (z < 0) D.n = Math.min(200, Math.round(D.n * 1.4)); else if (z > 0) D.n = Math.max(15, Math.round(D.n / 1.4)); else { D.off = 0; D.cross = null; } D.off = Math.min(D.off, maxOff()); paintAll(); return; }
      var r = t.closest('[data-r]'); if (r){ D.cfg.symbols = D.cfg.symbols.filter(function(x){ return x !== r.dataset.r; }); save(); draw(); return; }
      if (t.closest('#skTest')){
        if (!haveSession()) return;
        D.msg = 'Bhej raha hoon…'; draw();
        clearTimeout(D.t); D.t = null;
        var go = function(){ callServer({ action:'stocksTest', token:S.token }).then(function(j){ D.msg = (j && j.ok) ? '✓ Test message bhej diya. WhatsApp check karo.' : ((j && j.error) || 'Failed'); draw(); }).catch(function(x){ D.msg = '⚠ ' + ((x && x.message) || 'Failed'); draw(); }); };
        D.busy = true;
        callServer({ action:'stocksSave', token:S.token, cfg:D.cfg }).catch(function(){}).then(function(){ D.busy = false; go(); });
      }
    });
    root.addEventListener('keydown', function(e){ if (e.target.id === 'skSym' && e.key === 'Enter'){ e.preventDefault(); addSym(); } });
    root.addEventListener('change', function(e){
      var id = e.target.id;
      if (id === 'skOn') D.cfg.on = e.target.checked;
      else if (id === 'skTo') D.cfg.to = e.target.value.replace(/[^\d]/g, '');
      else if (id === 'skThr') D.cfg.thr = Math.min(20, Math.max(0.05, parseFloat(e.target.value) || 0.5));
      else if (id === 'skWa') D.cfg.wa = e.target.checked;
      else if (id === 'skPush') D.cfg.push = e.target.checked;
      else return;
      save(); draw();
    });
  }
  /* ---------- Candle chart: every watchlist stock, with IST time axis + alert markers ---------- */
  var TFS = ['1m', '5m', '15m', '1h', '1d'], TFSEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 };
  var IST = 'Asia/Kolkata';
  var fT = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false });
  var fTS = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  var fD = new Intl.DateTimeFormat('en-GB', { timeZone: IST, day: '2-digit', month: 'short' });
  function tmS(sec){ return fT.format(new Date(sec * 1000)); }
  function dtS(sec){ return fD.format(new Date(sec * 1000)); }
  var UP = '#0e8a5f', DN = '#c8372d', GRID = '#eeeef3', TXT = '#77778a', INK = '#1b1b1f';
  function panelSyms(){ return D.sel === 'ALL' ? D.cfg.symbols : [D.sel]; }
  function maxOff(){ var m = 0; panelSyms().forEach(function(s){ var d = D.ch && D.ch.data[s]; if (d && d.c) m = Math.max(m, d.c.length - Math.min(D.n, d.c.length)); }); return m; }

  function chartShell(){
    var h = '<div class="sk-box"><div class="sk-chips">' + TFS.map(function(t){ return '<button data-tf="' + t + '" class="' + (D.tf === t ? 'on' : '') + '">' + (t === '1d' ? '1D' : t) + '</button>'; }).join('') + '</div>' +
      '<div class="sk-chips"><button data-cs="ALL" class="' + (D.sel === 'ALL' ? 'on' : '') + '">Sab stocks</button>' +
      D.cfg.symbols.map(function(s){ return '<button data-cs="' + esc(s) + '" class="' + (D.sel === s ? 'on' : '') + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
      '<div class="sk-row" style="margin-bottom:6px"><button class="sk-btn gr" data-z="-1" style="min-height:34px;padding:0 12px">－</button><button class="sk-btn gr" data-z="1" style="min-height:34px;padding:0 12px">＋</button><button class="sk-btn gr" data-z="0" style="min-height:34px;padding:0 12px">⟲ Latest</button></div>' +
      '<div class="sk-note" style="margin:0 0 6px">Time upar aur neeche dono taraf IST me hai; sabse upar/neeche ka price uske time ke saath likha hai. Candle par tap/hover karo: Open/High/Low/Close dikhega. ▲▼ marker = jis time pe alert aaya (Y = Yahoo ka alert, N = NSE ka). Neeli dotted line = NSE ka price, candles Yahoo ke hain. Left-right drag se purane candles dekho.' + (D.market === false ? ' <b>Market band hai, last session ka chart dikh raha hai. Alerts phir bhi ON hain.</b>' : '') + '</div>' +
      '<div id="skChErr">' + (D.chErr ? '<div class="sk-warn">⚠ ' + esc(D.chErr) + '</div>' : '') + '</div>' +
      '<div id="skPanels"></div></div><div class="sk-box" id="skAlLog"></div>';
    return h;
  }

  var chBusy = false;
  function reqCharts(retried){
    if (!haveSession() || D.view !== 'chart' || !D.cfg.symbols.length) return;
    if (chBusy) return;
    chBusy = true;
    var tf = D.tf;
    callServer({ action:'stocksChart', token:S.token, tf:tf, syms:panelSyms() }).then(function(j){
      chBusy = false;
      if (!j || !j.ok) throw new Error((j && j.error) || 'Chart load nahi hua');
      D.chErr = ''; var er0 = $('#skChErr'); if (er0) er0.innerHTML = ''; D.market = j.market; D.alerts = j.alerts || D.alerts;
      if (tf === D.tf){
        D.ch = { tf:tf, data:Object.assign({}, D.ch && D.ch.tf === tf ? D.ch.data : {}, j.data) };
        renderChart();
      }
      if ((tf !== D.tf || panelSyms().some(function(s){ return !(D.ch && D.ch.data[s]); })) && !retried) reqCharts(true);
    }).catch(function(e){ chBusy = false; D.chErr = (e && e.message) || 'Chart load nahi hua'; var er = $('#skChErr'); if (er) er.innerHTML = '<div class="sk-warn">⚠ ' + esc(D.chErr) + '</div>'; });
  }

  function mountChart(){
    var box = $('#skPanels'); if (!box) return;
    var syms = panelSyms();
    if (!syms.length){ box.innerHTML = '<div class="sk-empty">Pehle Watchlist me stock add karo.</div>'; $('#skAlLog') && ($('#skAlLog').innerHTML = ''); return; }
    box.innerHTML = syms.map(function(s){ return '<div class="sk-pn"><canvas data-s="' + esc(s) + '"></canvas></div>'; }).join('');
    [].forEach.call(box.querySelectorAll('canvas'), bindCanvas);
    paintAll(); alertLog(); reqCharts();
  }
  function renderChart(){
    var box = $('#skPanels'); if (!box) return;
    if (box.querySelectorAll('canvas').length !== panelSyms().length) return mountChart();
    paintAll(); alertLog();
  }
  function paintAll(){ [].forEach.call(document.querySelectorAll('#skPanels canvas'), paintPanel); }

  function idxAtOrBefore(cs, t){ var lo = 0, hi = cs.length - 1, r = -1; while (lo <= hi){ var m = (lo + hi) >> 1; if (cs[m][0] <= t){ r = m; lo = m + 1; } else hi = m - 1; } return r; }

  function srcTag(a){ return a.src === 'nse' ? 'N ' : a.src === 'yahoo' ? 'Y ' : ''; }
  function paintPanel(cv){
    var sym = cv.dataset.s, d = D.ch && D.ch.data[sym], all = D.sel === 'ALL';
    var cs = (d && d.c) || [], W = (cv.parentNode && cv.parentNode.clientWidth) || 320, dpr = window.devicePixelRatio || 1;
    var H = cs.length ? (all ? 235 : 420) : 74;
    if (cv.__w !== W || cv.__h !== H || cv.__d !== dpr){ cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.__w = W; cv.__h = H; cv.__d = dpr; }
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.font = '800 14px system-ui,-apple-system,sans-serif'; g.fillStyle = INK; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillText(sym, 8, 17);
    var q0 = D.px[sym], symW = g.measureText(sym).width;
    if (q0 && q0.n){ g.font = '600 10.5px system-ui,-apple-system,sans-serif'; g.fillStyle = q0.spread > 0.3 ? DN : TXT; g.fillText((q0.spread > 0.3 || (q0.n < 2 && q0.errs && q0.errs.nse && q0.errs.nse !== 'n/a') ? '⚠ ' : '✓ ') + q0.n + (q0.n > 1 ? ' sources' : ' source') + (q0.errs && q0.errs.nse && q0.errs.nse !== 'n/a' ? ' (NSE ✗ ' + q0.errs.nse + ')' : '') + (d && d.src === 'twelvedata' ? ' · TD' : ''), 8 + symW + 8, 17); }
    // header: live price + change vs previous close
    var q = D.px[sym], last = cs.length ? cs[cs.length - 1][4] : null, pr = q && q.p ? q.p : last, pv = q && q.prev ? q.prev : (d && d.prev);
    if (pr){
      var dd = pv ? (pr - pv) / pv * 100 : 0, txt = '₹' + inr(pr) + '  ' + (dd >= 0 ? '▲ +' : '▼ ') + dd.toFixed(2) + '%';
      g.textAlign = 'right'; g.font = '700 13px system-ui,-apple-system,sans-serif'; g.fillStyle = dd > 0 ? UP : dd < 0 ? DN : TXT; g.fillText(txt, W - 6, 17);
    }
    if (!cs.length){
      g.textAlign = 'left'; g.font = '13px system-ui,-apple-system,sans-serif'; g.fillStyle = TXT;
      g.fillText(!d ? 'Chart load ho raha hai…' : (d.err ? 'Data nahi mila (' + d.err + ')' : 'Is timeframe ka data abhi nahi hai'), 8, 48);
      cv.__g = null; return;
    }
    var x0 = 6, x1 = W - 58, y0 = 46, y1 = H - 20, nvis = Math.min(D.n, cs.length), off = Math.min(D.off, cs.length - nvis), end = cs.length - off, start = end - nvis, cw = (x1 - x0) / nvis;
    var lo = Infinity, hi = -Infinity, i;
    for (i = start; i < end; i++){ if (cs[i][3] < lo) lo = cs[i][3]; if (cs[i][2] > hi) hi = cs[i][2]; }
    if (hi === lo){ hi *= 1.005; lo *= 0.995; }
    var padv = (hi - lo) * 0.12; hi += padv; lo -= padv;
    var Y = function(v){ return y1 - (v - lo) / (hi - lo) * (y1 - y0); };
    var X = function(k){ return x0 + (k - start + 0.5) * cw; };
    // grid + price axis
    g.font = '11px system-ui,-apple-system,sans-serif'; g.textAlign = 'left'; g.lineWidth = 1;
    for (i = 0; i <= 4; i++){ var v = lo + (hi - lo) * i / 4, y = Math.round(Y(v)) + 0.5; g.strokeStyle = GRID; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.fillStyle = TXT; g.fillText(inr(v), x1 + 4, y + 4); }
    // time axis + day separators
    var step = Math.max(1, Math.ceil(66 / cw)), intraday = D.tf !== '1d', lastLbl = -1e9;
    g.textAlign = 'center';
    for (i = start; i < end; i++){
      var newDay = intraday && i > 0 && dtS(cs[i][0]) !== dtS(cs[i - 1][0]), cx = X(i);
      if (newDay){ g.setLineDash([3, 3]); g.strokeStyle = '#cfcfdb'; g.beginPath(); g.moveTo(Math.round(cx - cw / 2) + 0.5, y0); g.lineTo(Math.round(cx - cw / 2) + 0.5, y1); g.stroke(); g.setLineDash([]); g.fillStyle = TXT; g.textAlign = 'left'; g.fillText(dtS(cs[i][0]), cx - cw / 2 + 3, y0 + 22); g.textAlign = 'center'; }
      if (i % step === 0 && cx - lastLbl > 56){
        lastLbl = cx; g.strokeStyle = GRID; g.beginPath(); g.moveTo(Math.round(cx) + 0.5, y1); g.lineTo(Math.round(cx) + 0.5, y1 + 4); g.stroke();
        var lbl = intraday ? (newDay ? dtS(cs[i][0]) + ' ' : '') + tmS(cs[i][0]) : dtS(cs[i][0]), lx = Math.min(Math.max(cx, x0 + 22), x1 - 22);
        g.fillStyle = TXT; g.fillText(lbl, lx, H - 5); g.fillText(lbl, lx, y0 - 6);                 // time shown on the top and the bottom edge
        g.beginPath(); g.moveTo(Math.round(cx) + 0.5, y0); g.lineTo(Math.round(cx) + 0.5, y0 - 4); g.stroke();
      }
    }
    // candles
    var bw = Math.max(1, Math.min(cw * 0.7, 14));
    for (i = start; i < end; i++){
      var c = cs[i], up = c[4] >= c[1], cx2 = X(i); g.strokeStyle = g.fillStyle = up ? UP : DN;
      g.beginPath(); g.moveTo(Math.round(cx2) + 0.5, Y(c[2])); g.lineTo(Math.round(cx2) + 0.5, Y(c[3])); g.stroke();
      var yt = Y(Math.max(c[1], c[4])), yb = Y(Math.min(c[1], c[4])); g.fillRect(cx2 - bw / 2, yt, bw, Math.max(1, yb - yt));
    }
    // highest high / lowest low of the visible candles, with the time they happened
    var iH = start, iL = start; for (i = start; i < end; i++){ if (cs[i][2] > cs[iH][2]) iH = i; if (cs[i][3] < cs[iL][3]) iL = i; }
    g.font = '700 10px system-ui,-apple-system,sans-serif'; g.fillStyle = INK; g.textAlign = 'center';
    var lab = function(k, v){ return inr(v) + ' · ' + (intraday ? tmS(cs[k][0]) : dtS(cs[k][0])); };
    var tw1 = g.measureText(lab(iH, cs[iH][2])).width / 2 + 2, tw2 = g.measureText(lab(iL, cs[iL][3])).width / 2 + 2;
    g.fillText(lab(iH, cs[iH][2]), Math.min(Math.max(X(iH), x0 + tw1), x1 - tw1), Math.max(Y(cs[iH][2]) - 4, y0 + 9));
    g.fillText(lab(iL, cs[iL][3]), Math.min(Math.max(X(iL), x0 + tw2), x1 - tw2), Math.min(Y(cs[iL][3]) + 12, y1 - 2));
    // last price line + tag
    var lc = cs[end - 1][4], ly = Y(lc), lup = lc >= cs[end - 1][1];
    g.setLineDash([4, 3]); g.strokeStyle = lup ? UP : DN; g.beginPath(); g.moveTo(x0, Math.round(ly) + 0.5); g.lineTo(x1, Math.round(ly) + 0.5); g.stroke(); g.setLineDash([]);
    g.fillStyle = lup ? UP : DN; g.fillRect(x1 + 1, ly - 8, 56, 16); g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = '700 11px system-ui,-apple-system,sans-serif'; g.fillText(inr(lc), x1 + 4, ly + 4);
    // NSE price (blue) next to the Yahoo candles, so both sources can be compared on the chart
    var qn = D.px[sym];
    if (off === 0 && qn && qn.by && qn.by.nse > 0 && qn.by.nse >= lo && qn.by.nse <= hi){
      var ny = Y(qn.by.nse), tagY = Math.abs(ny - ly) < 17 ? (ny >= ly ? ly + 17 : ly - 17) : ny;
      g.setLineDash([2, 3]); g.strokeStyle = '#2563eb'; g.beginPath(); g.moveTo(x0, Math.round(ny) + 0.5); g.lineTo(x1, Math.round(ny) + 0.5); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#2563eb'; g.fillRect(x1 + 1, tagY - 8, 56, 16); g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = '700 10px system-ui,-apple-system,sans-serif'; g.fillText('NSE ' + inr(qn.by.nse), x1 + 3, tagY + 4);
    }
    // alert markers (time of every alert)
    var sec = TFSEC[D.tf] || 300; g.font = '700 10px system-ui,-apple-system,sans-serif';
    (D.alerts || []).forEach(function(a){
      if (a.s !== sym) return;
      var t = a.t / 1000, k = idxAtOrBefore(cs, t);
      if (k < 0 || t - cs[k][0] > sec * 2 || k < start || k >= end) return;
      var ax = X(k), upA = a.pct > 0; g.fillStyle = upA ? UP : DN;
      g.beginPath();
      if (upA){ var ay = Y(cs[k][3]) + 5; g.moveTo(ax, ay); g.lineTo(ax - 5, ay + 9); g.lineTo(ax + 5, ay + 9); g.fill(); g.textAlign = 'center'; g.fillText(srcTag(a) + '+' + a.pct.toFixed(2) + '%', ax, Math.min(ay + 20, y1 - 1)); }
      else { var by = Y(cs[k][2]) - 5; g.moveTo(ax, by); g.lineTo(ax - 5, by - 9); g.lineTo(ax + 5, by - 9); g.fill(); g.textAlign = 'center'; g.fillText(srcTag(a) + a.pct.toFixed(2) + '%', ax, Math.max(by - 12, y0 + 10)); }
    });
    cv.__g = { start:start, end:end, cw:cw, x0:x0, x1:x1, cs:cs };
    // crosshair + tooltip (same time on every stock panel)
    if (D.cross != null){
      var k2 = idxAtOrBefore(cs, D.cross);
      if (k2 >= start && k2 < end && D.cross - cs[k2][0] < sec * 1.5){
        var cc = cs[k2], px2 = X(k2), prevC = k2 > 0 ? cs[k2 - 1][4] : cc[1], chg = prevC ? (cc[4] - prevC) / prevC * 100 : 0;
        g.strokeStyle = '#8a8a99'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(Math.round(px2) + 0.5, y0); g.lineTo(Math.round(px2) + 0.5, y1); g.stroke(); g.setLineDash([]);
        var l1 = (intraday ? dtS(cc[0]) + ' ' + tmS(cc[0]) + ' IST' : dtS(cc[0])) + '  ' + (chg >= 0 ? '▲ +' : '▼ ') + chg.toFixed(2) + '%', l2 = 'O ' + inr(cc[1]) + '   H ' + inr(cc[2]), l3 = 'L ' + inr(cc[3]) + '   C ' + inr(cc[4]);
        g.font = '600 11.5px system-ui,-apple-system,sans-serif'; var bwid = Math.max(g.measureText(l1).width, g.measureText(l2).width, g.measureText(l3).width) + 14, bx = px2 < (x0 + x1) / 2 ? Math.min(px2 + 10, x1 - bwid) : Math.max(px2 - 10 - bwid, x0);
        g.fillStyle = 'rgba(27,27,31,.92)'; g.fillRect(bx, y0 + 2, bwid, 52); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(l1, bx + 7, y0 + 17); g.fillStyle = '#d6d6e0'; g.fillText(l2, bx + 7, y0 + 32); g.fillText(l3, bx + 7, y0 + 47);
      }
    }
  }

  function bindCanvas(cv){
    cv.style.touchAction = 'pan-y';
    var drag = null;
    function setCross(e, toggle){
      var g = cv.__g; if (!g) return;
      var r = cv.getBoundingClientRect(), k = g.start + Math.floor((e.clientX - r.left - g.x0) / g.cw);
      if (k < g.start || k >= g.end) return;
      var t = g.cs[k][0];
      D.cross = (toggle && D.cross === t) ? null : t; paintAll();
    }
    cv.addEventListener('pointerdown', function(e){ try { cv.setPointerCapture(e.pointerId); } catch(x){} drag = { x:e.clientX, off:D.off, moved:false }; });
    cv.addEventListener('pointermove', function(e){
      var g = cv.__g; if (!g) return;
      if (drag){
        var dx = e.clientX - drag.x; if (Math.abs(dx) > 6) drag.moved = true;
        if (drag.moved){ D.off = Math.max(0, Math.min(maxOff(), drag.off + Math.round(dx / g.cw))); paintAll(); }
        return;
      }
      if (e.pointerType === 'mouse') setCross(e, false);
    });
    cv.addEventListener('pointerup', function(e){ if (drag && !drag.moved) setCross(e, e.pointerType !== 'mouse'); drag = null; });   // touch: tap again to hide, mouse: hover already shows it
    cv.addEventListener('pointercancel', function(){ drag = null; });
  }

  function alertLog(){
    var el = $('#skAlLog'); if (!el) return;
    var al = (D.alerts || []).filter(function(a){ return D.sel === 'ALL' || a.s === D.sel; }).slice(-40).reverse();
    var h = '<b>🔔 Alert log (kab kitne baje hila)</b>';
    h += al.length ? al.map(function(a){
      var s = a.t / 1000, up = a.pct > 0;
      return '<div class="sk-it"><div class="sk-nm">' + esc(a.s) + '<small>' + dtS(s) + ' · ' + fTS.format(new Date(a.t)) + ' IST · ' + (a.src === 'nse' ? 'NSE India' : a.src === 'yahoo' ? 'Yahoo' : esc(a.src || '')) + '</small></div><div class="sk-px" style="font-size:13px">₹' + inr(a.ref) + ' → ₹' + inr(a.p) + '</div><span class="sk-ch ' + (up ? 'up' : 'dn') + '">' + (up ? '▲ +' : '▼ ') + a.pct.toFixed(2) + '%</span></div>';
    }).join('') : '<div class="sk-empty">Abhi tak koi alert nahi aaya. Jaise hi koi stock ' + esc(D.cfg.thr) + '% hilega, yahan time ke saath dikhega (server restart par ye log reset hota hai).</div>';
    el.innerHTML = h;
  }
  window.addEventListener('resize', function(){ if (D.view === 'chart' && $('#skPanels')) paintAll(); });

  window.vStocks = function(){ return '<div id="skRoot"></div>'; };
  window.stocksAfter = function(){ bind(); draw(); pull(); };
  setInterval(function(){ if ($('#skRoot') && !document.hidden && !D.t && !D.busy) pull(); }, 30000);

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="stocks"]')) return;
    var anchor = nav.querySelector('[data-v="whatsapp"]') || nav.querySelector('[data-v="websites"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'stocks'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '📈').replace('Updates', 'Stocks'); });
    anchor.after(b);
  })();
})();
