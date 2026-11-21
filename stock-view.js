/* KS · Stocks tab: your NSE/BSE watchlist. When a stock moves up or down by the % you choose, the server sends you a WhatsApp message
   (from your linked WhatsApp) and a phone notification - even when the app is closed. The list and settings are saved in your Google Sheet. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var KEY = 'ks_stocks_v1';
  var D = { cfg:{ on:true, to:'', thr:0.5, symbols:[], wa:true, push:true }, px:{}, waOk:null, market:null, loaded:false, err:'', msg:'', t:null, busy:false, loading:false };
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
    '#skRoot .sk-empty{text-align:center;color:#77778a;padding:20px 8px;font-size:14px}'
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
      D.err = ''; D.px = j.px || {}; D.waOk = j.waOk; D.market = j.market;
      if (!D.t && !D.busy){
        var first = !D.loaded && !(j.cfg.symbols || []).length && D.cfg.symbols.length;    // first time: this phone's list moves to the sheet
        if (!first){ D.cfg = j.cfg; cache(); } else flush();
      }
      D.loaded = true;
      var a = document.activeElement; if (!(a && a.tagName === 'INPUT' && $('#skRoot') && $('#skRoot').contains(a))) draw();
    }).catch(function(e){ D.loading = false; D.err = (e && e.message) || 'Could not reach the server'; draw(); });
  }

  function draw(){
    var root = $('#skRoot'); if (!root) return;
    var c = D.cfg, h = '';
    if (D.err) h += '<div class="sk-warn">⚠ ' + esc(D.err) + '</div>';
    if (D.waOk === false) h += '<div class="sk-warn">WhatsApp abhi connected nahi hai. <b>WhatsApp</b> tab me QR scan karke connect karo, tabhi alert WhatsApp pe aayega.</div>';
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
      return '<div class="sk-it"><div class="sk-nm">' + esc(s) + '<small>vs previous close</small></div><div class="sk-px">' + pr + '</div>' + ch + '<button class="sk-x" data-r="' + esc(s) + '" aria-label="Remove ' + esc(s) + '">✕</button></div>';
    }).join('') : '<div class="sk-empty">Koi stock nahi hai. Upar symbol likhke add karo.</div>';
    h += '</div></div><div class="sk-note" style="padding:0 4px">Alert market hours me (Mon–Fri, 9:15–3:30 IST) aata hai. Server har 30 second me price check karta hai. Prices Yahoo Finance se aate hain, thode late ho sakte hain. ' + (D.market === false ? '<b>Market abhi band hai.</b>' : '') + '</div>';
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
  window.vStocks = function(){ return '<div id="skRoot"></div>'; };
  window.stocksAfter = function(){ bind(); draw(); pull(); };
  setInterval(function(){ if ($('#skRoot') && !document.hidden && !D.t && !D.busy) pull(); }, 30000);

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="stocks"]')) return;
    var anchor = nav.querySelector('[data-v="websites"]') || nav.querySelector('[data-v="youtube"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'stocks'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '📈').replace('Updates', 'Stocks'); });
    anchor.after(b);
  })();
})();
