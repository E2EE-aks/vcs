/* KS · Theme tab: Light / Dark / Auto in one tap, plus a quick ☀️/🌙 button in the top bar.
   The choice is saved on THIS device only. Admins can also press "Apply to all users". */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  try { TITLES.themetab = ['Theme', 'Light, Dark or Auto — choose how the app looks']; } catch(e){}
  try { NAV_GRP.themetab = 'System'; } catch(e){}

  var MODES = [
    { k:'light', ic:'☀️', n:'Light',  d:'Bright and clean' },
    { k:'dark',  ic:'🌙', n:'Dark',   d:'Easy on the eyes' },
    { k:'auto',  ic:'🌗', n:'Auto',   d:'Follows your phone setting' }
  ];
  var css = document.createElement('style');
  css.textContent = [
    '#thmRoot .thm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}',
    '#thmRoot .thm-opt{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 12px;border-radius:16px;border:2px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;text-align:center}',
    '#thmRoot .thm-opt .i{font-size:34px;line-height:1}',
    '#thmRoot .thm-opt b{font-size:16px}',
    '#thmRoot .thm-opt small{color:var(--muted);font-size:12.5px}',
    '#thmRoot .thm-opt.on{border-color:var(--brand);background:var(--brand-soft)}',
    '#thmRoot .thm-note{margin-top:14px;color:var(--muted);font-size:13px;line-height:1.55}',
    '#thmBtn{min-width:38px;padding-left:10px;padding-right:10px}'
  ].join('\n');
  document.head.appendChild(css);

  function isDark(){ return document.documentElement.dataset.mode === 'dark'; }
  function setMode(m){
    try {
      T.mode = m;
      store.set(TH_KEY, JSON.stringify(T), true);     // this device only (no push to other users)
      thApply();
    } catch(e){ try { toast('Could not change the theme', true); } catch(x){} }
    paint(); draw();
  }
  function draw(){
    var root = $('#thmRoot'); if (!root) return;
    var cur = 'light'; try { cur = T.mode; } catch(e){}
    var canAll = false; try { canAll = !!thCan() && !S.as; } catch(e){}
    root.innerHTML = '<div class="card"><h3>🎨 Theme</h3><p class="muted" style="margin:4px 0 14px">Tap one to change the whole app at once.</p>' +
      '<div class="thm-grid">' + MODES.map(function(o){
        return '<button type="button" class="thm-opt' + (cur === o.k ? ' on' : '') + '" data-m="' + o.k + '"><span class="i">' + o.ic + '</span><b>' + o.n + '</b><small>' + o.d + '</small></button>';
      }).join('') + '</div>' +
      '<div class="thm-note">Saved on this phone. ' + (canAll ? 'Want everybody to get this look?</div><div class="actions" style="margin-top:10px"><button type="button" class="btn" id="thmAll">📢 Apply to all users</button></div>' : 'Colours, fonts and layout are in Profile › Customize › Appearance & layout.</div>') +
      '</div>';
  }
  function bind(){
    var root = $('#thmRoot'); if (!root || root.dataset.b) return; root.dataset.b = '1';
    root.addEventListener('click', function(e){
      var o = e.target.closest('[data-m]'); if (o){ setMode(o.dataset.m); return; }
      if (e.target.closest('#thmAll')){ try { thPush(true); } catch(x){} }
    });
  }
  window.vThemetab = function(){ return '<div id="thmRoot"></div>'; };
  window.themetabAfter = function(){ bind(); draw(); };

  /* ---------- quick button in the top bar ---------- */
  function paint(){ var b = $('#thmBtn'); if (!b) return; var d = isDark(); b.textContent = d ? '☀️' : '🌙'; b.title = d ? 'Switch to Light mode' : 'Switch to Dark mode'; b.setAttribute('aria-label', b.title); }
  (function addBtn(){
    var act = $('.topbar .actions'); if (!act || $('#thmBtn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'thmBtn'; b.className = 'btn ghost sm';
    b.addEventListener('click', function(){ setMode(isDark() ? 'light' : 'dark'); });
    var ref = $('#refreshBtn'); if (ref) act.insertBefore(b, ref); else act.appendChild(b);
    paint();
    try { new MutationObserver(paint).observe(document.documentElement, { attributes:true, attributeFilter:['data-mode'] }); } catch(e){}
  })();

  /* ---------- side-menu tab (also listed in the bottom bar options) ---------- */
  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="profile"]') || (nav && nav.querySelector('[data-v="settings"]'));
    if (!src || nav.querySelector('[data-v="themetab"]')) return;
    var b = src.cloneNode(true);
    b.dataset.v = 'themetab'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ var v = n.nodeValue.trim(); n.nodeValue = n.nodeValue.replace(v, /^\p{Extended_Pictographic}/u.test(v) && v.length < 5 ? '🌗' : 'Theme'); });
    src.after(b);
  })();
})();
