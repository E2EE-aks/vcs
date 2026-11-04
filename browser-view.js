/* KS · Browser tab (All Options › Browser): private in-app browser with AdGuard DNS filtering.
   Android app: opens a native browser screen (KsBrowser plugin) — every site it loads is checked through AdGuard DNS over HTTPS, so ads / trackers / malware are blocked.
   Normal web browser / PWA: opens the link in a new tab and shows how to turn on AdGuard DNS in the phone's Private DNS setting. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var HK = 'ks_browser_hist_v1', DK = 'ks_browser_dns_v1', SK = 'ks_sites_v1';
  var MODES = [
    { id:'default', host:'dns.adguard-dns.com',    name:'AdGuard · Block ads & trackers' },
    { id:'family',  host:'family.adguard-dns.com', name:'AdGuard Family · + adult sites' },
    { id:'off',     host:'',                       name:'DNS filter off' }
  ];
  var B = { q:'', mode:'default', hist:[], note:'' };
  try { B.hist = JSON.parse(localStorage.getItem(HK) || '[]') || []; } catch(e){ B.hist = []; }
  try { var m = localStorage.getItem(DK); if (MODES.some(function(x){ return x.id === m; })) B.mode = m; } catch(e){}

  function plugin(){ var C = window.Capacitor; try { if (C && C.Plugins && C.Plugins.KsBrowser && (!C.isNativePlatform || C.isNativePlatform())) return C.Plugins.KsBrowser; } catch(e){} return null; }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function host(u){ try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return u; } }
  function modeHost(){ for (var i = 0; i < MODES.length; i++) if (MODES[i].id === B.mode) return MODES[i].host; return ''; }
  function sites(){ try { var a = JSON.parse(localStorage.getItem(SK) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function target(q){
    q = String(q || '').trim(); if (!q) return '';
    if (/^https?:\/\/\S+$/i.test(q)) return q;
    if (!/\s/.test(q) && q.indexOf('.') > 0) return 'https://' + q;
    return 'https://duckduckgo.com/?q=' + encodeURIComponent(q);
  }
  function remember(u){
    B.hist = [u].concat(B.hist.filter(function(x){ return x !== u; })).slice(0, 30);
    try { localStorage.setItem(HK, JSON.stringify(B.hist)); } catch(e){}
  }
  function go(raw){
    var u = target(raw); if (!u) return;
    remember(u);
    var p = plugin();
    if (p){ p.open({ url:u, dns:modeHost() }).catch(function(){ B.note = 'Browser could not be opened.'; draw(); }); }
    else window.open(u, '_blank', 'noopener');
    draw();
  }

  try { TITLES.browser = ['Browser', 'Private browser with AdGuard DNS']; } catch(e){}
  try { NAV_GRP.browser = 'Workspace'; } catch(e){}

  var css = document.createElement('style');
  css.textContent = [
    '#brRoot{color:#1b1b1f}',
    '#brRoot .br-box{background:#fff;border:1px solid #e3e3ea;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)}',
    '#brRoot .br-hd{font-weight:800;font-size:15px;margin-bottom:8px}',
    '#brRoot .br-top{display:flex;gap:8px}',
    '#brRoot .br-top input{flex:1;min-width:0;border:1px solid #d8d8de;border-radius:12px;padding:12px 14px;font-size:15px;background:#fff;color:#1b1b1f}',
    '#brRoot .br-btn{border:0;border-radius:12px;padding:0 16px;font-weight:700;font-size:14px;background:#5b3df5;color:#fff;cursor:pointer;min-height:44px}',
    '#brRoot .br-btn.gr{background:#eceaf8;color:#3b2bb5}',
    '#brRoot .br-st{display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.5;color:#55555f}',
    '#brRoot .br-dot{flex:none;width:10px;height:10px;border-radius:50%;background:#2e9e5b}',
    '#brRoot .br-dot.off{background:#c98a00}',
    '#brRoot .br-modes{display:flex;flex-direction:column;gap:8px}',
    '#brRoot .br-m{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid #d8d8de;border-radius:12px;cursor:pointer;font-size:14px;background:#fff}',
    '#brRoot .br-m.on{border-color:#5b3df5;background:#eceaf8;font-weight:700}',
    '#brRoot .br-grid{display:flex;flex-wrap:wrap;gap:8px}',
    '#brRoot .br-chip{display:flex;align-items:center;gap:8px;padding:8px 12px 8px 8px;border:1px solid #e3e3ea;border-radius:999px;background:#fff;cursor:pointer;font-size:13.5px;max-width:100%}',
    '#brRoot .br-chip i{flex:none;width:26px;height:26px;border-radius:50%;background:#eceaf8;color:#3b2bb5;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:13px}',
    '#brRoot .br-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#brRoot .br-h{display:flex;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid #f0f0f4;cursor:pointer;font-size:13.5px}',
    '#brRoot .br-h small{display:block;color:#77778a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#brRoot .br-h div{min-width:0;flex:1}',
    '#brRoot .br-help{font-size:13px;line-height:1.65;color:#44444e}',
    '#brRoot .br-help code{background:#f1f1f6;border-radius:6px;padding:2px 6px;font-size:12.5px;word-break:break-all}',
    '#brRoot .br-note{color:#c62828;font-size:13px;margin-top:8px}'
  ].join('\n');
  document.head.appendChild(css);

  function draw(){
    var root = $('#brRoot'); if (!root) return;
    var native = !!plugin(), on = modeHost() !== '', ws = sites().slice(0, 12), h = B.hist.slice(0, 8);
    var stTxt = native
      ? (on ? 'AdGuard DNS filter is <b>ON</b> in the in-app browser.' : 'DNS filter is <b>OFF</b> — sites load without blocking.')
      : 'Web version: the link opens in a normal browser tab. Full AdGuard filtering works in the <b>Android app</b>.';
    root.innerHTML =
      '<div class="br-box"><div class="br-top"><input id="brQ" value="' + esc(B.q) + '" placeholder="Search or type a website" inputmode="url" autocapitalize="off" autocomplete="off" enterkeyhint="go"><button class="br-btn" id="brGo">Go</button></div>' +
        '<div class="br-st" style="margin-top:10px"><span class="br-dot' + (native && on ? '' : ' off') + '"></span><span>' + stTxt + '</span></div>' +
        (B.note ? '<div class="br-note">' + esc(B.note) + '</div>' : '') + '</div>' +
      '<div class="br-box"><div class="br-hd">🛡️ DNS protection</div><div class="br-modes">' +
        MODES.map(function(m){ return '<div class="br-m' + (m.id === B.mode ? ' on' : '') + '" data-m="' + m.id + '"><span>' + (m.id === B.mode ? '◉' : '○') + '</span><span>' + esc(m.name) + '</span></div>'; }).join('') +
      '</div></div>' +
      (ws.length ? '<div class="br-box"><div class="br-hd">⭐ My websites</div><div class="br-grid">' +
        ws.map(function(s, i){ return '<div class="br-chip" data-w="' + i + '"><i>' + esc((s.name || '?').charAt(0).toUpperCase()) + '</i><span>' + esc(s.name) + '</span></div>'; }).join('') + '</div></div>' : '') +
      (h.length ? '<div class="br-box"><div class="br-hd" style="display:flex;justify-content:space-between;align-items:center">🕘 Recent<button class="br-btn gr" id="brClr" style="min-height:34px;padding:0 12px;font-size:12.5px">Clear</button></div>' +
        h.map(function(u, i){ return '<div class="br-h" data-h="' + i + '"><div><b>' + esc(host(u)) + '</b><small>' + esc(u) + '</small></div></div>'; }).join('') + '</div>' : '') +
      '<div class="br-box"><div class="br-hd">🌐 Whole phone ad-block (optional)</div><div class="br-help">' +
        'To block ads in <b>every app</b>, set Android <b>Private DNS</b>:<br>Settings › Network › Private DNS › “Private DNS provider hostname” › <code>' + esc(modeHost() || 'dns.adguard-dns.com') + '</code>' +
        '<div style="display:flex;gap:8px;margin-top:10px"><button class="br-btn gr" id="brCp">Copy hostname</button>' + (native ? '<button class="br-btn gr" id="brSet">Open network settings</button>' : '') + '</div></div></div>';
    var q = $('#brQ', root); if (q && B.keep){ q.focus(); try { q.setSelectionRange(B.q.length, B.q.length); } catch(e){} }
  }

  function bind(){
    var root = $('#brRoot'); if (!root || root.__b) return; root.__b = 1;
    root.addEventListener('input', function(e){ if (e.target.id === 'brQ') B.q = e.target.value; });
    root.addEventListener('keydown', function(e){ if (e.target.id === 'brQ' && e.key === 'Enter'){ e.preventDefault(); go(B.q); } });
    root.addEventListener('click', function(e){
      var t = e.target; B.keep = false; B.note = '';
      if (t.closest('#brGo')){ go($('#brQ', root).value); return; }
      var m = t.closest('[data-m]'); if (m){ B.mode = m.dataset.m; try { localStorage.setItem(DK, B.mode); } catch(x){} draw(); return; }
      var w = t.closest('[data-w]'); if (w){ var s = sites()[+w.dataset.w]; if (s) go(s.url); return; }
      var h = t.closest('[data-h]'); if (h){ var u = B.hist[+h.dataset.h]; if (u) go(u); return; }
      if (t.closest('#brClr')){ B.hist = []; try { localStorage.removeItem(HK); } catch(x){} draw(); return; }
      if (t.closest('#brCp')){
        var hn = modeHost() || 'dns.adguard-dns.com';
        try { navigator.clipboard.writeText(hn).then(function(){ try { toast('Copied: ' + hn); } catch(x){} }); } catch(x){ B.note = hn; draw(); }
        return;
      }
      if (t.closest('#brSet')){ var p = plugin(); if (p) p.openNetworkSettings().catch(function(){}); return; }
    });
  }

  window.vBrowser = function(){ return '<div id="brRoot"></div>'; };
  window.browserAfter = function(){ bind(); draw(); };

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="browser"]')) return;
    var anchor = nav.querySelector('[data-v="websites"]') || nav.querySelector('[data-v="youtube"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'browser'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '🧭').replace('Updates', 'Browser'); });
    anchor.after(b);
  })();
})();
