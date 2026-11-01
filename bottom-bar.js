/* KS · Bottom bar (phones): Dashboard · Profile · Chat · All Options.
   - All Options lists the remaining side-menu items (Profile/Settings/VCS/Version live inside Profile)
   - long-press Profile = switch user (accounts that signed in on this phone)
   - Profile › Bottom bar = size, font, colours, icons (saved on this phone)
   Pure add-on: reads the existing side menu (#nav) and S/go/render from app.js. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var app = $('#app'), nav = $('#nav'); if (!app || !nav) return;
  var FIXED = [['dashboard', 'Dashboard'], ['profile', 'Profile'], ['chat', 'Chat']];
  var PROF = ['profile', 'settings', 'vcs', 'version', 'logins', 'deploy', 'updates'];                       // pages that belong to Profile
  var EXC = ['dashboard', 'chat', 'profile', 'settings', 'vcs', 'version', 'logins', 'deploy', 'updates'];   // not listed in All Options
  var SV = function(p){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var ICON = {
    dashboard: SV('<rect x="3.5" y="3.5" width="7" height="8" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="14.5" width="7" height="6" rx="2"/>'),
    chat: SV('<path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.3A7.5 7.5 0 1 1 20.5 11.5z"/><path d="M9 10.5h6M9 13.5h4"/>'),
    all: SV('<circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>')
  };
  function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function navBtn(v){ return nav.querySelector('button[data-v="' + v + '"]'); }
  function info(b){
    var ic = b.querySelector('.ico'), txt = '';
    [].forEach.call(b.childNodes, function(n){ if (n.nodeType === 3) txt += n.nodeValue; });
    return { id: b.dataset.v, ic: ic ? ic.textContent : '•', lb: txt.trim() || b.dataset.v };
  }
  function usable(b){ return b && !b.classList.contains('hidden') && !b.classList.contains('th-off'); }

  /* ---------- customisation (saved on this phone) ---------- */
  var KEY = 'ks_bb_v1', DEF = { scale: 100, fs: 12, ic: 26, r: 30, bg: '', tx: '', on: '', labels: 1, pos: 'bottom', anim: 'pop', icons: {} };
  function loadCfg(){
    var c = {}; try { c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
    var o = {}; Object.keys(DEF).forEach(function(k){ o[k] = c[k] !== undefined ? c[k] : DEF[k]; });
    o.icons = (c.icons && typeof c.icons === 'object') ? c.icons : {}; return o;
  }
  var cfg = loadCfg();
  function saveCfg(){ try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  var bar = document.createElement('nav'); bar.id = 'btmBar'; bar.className = 'hidden'; bar.setAttribute('aria-label', 'Main');
  var sheet = document.createElement('div'); sheet.id = 'btmSheet'; sheet.className = 'hidden';
  document.body.appendChild(bar); document.body.appendChild(sheet);

  function vert(){ return cfg.pos === 'left' || cfg.pos === 'right'; }
  function gap(){ document.body.style.setProperty('--bb-gap', (vert() ? (bar.offsetWidth || 78) + 22 : (bar.offsetHeight || 64) + 36) + 'px'); }
  function moveInd(instant){
    var ind = bar.querySelector('.bb-ind'), on = bar.querySelector('button.on'); if (!ind) return;
    if (!on || !bar.offsetWidth){ ind.style.opacity = 0; return; }
    if (instant) ind.style.transition = 'none';
    ind.style.opacity = 1; ind.style.left = on.offsetLeft + 'px'; ind.style.top = on.offsetTop + 'px'; ind.style.width = on.offsetWidth + 'px'; ind.style.height = on.offsetHeight + 'px';
    if (instant){ void ind.offsetWidth; ind.style.transition = ''; }
  }
  function applyCfg(){
    var s = bar.style;
    s.setProperty('--bb-s', cfg.scale / 100); s.setProperty('--bb-fs', cfg.fs + 'px'); s.setProperty('--bb-ic', cfg.ic + 'px'); s.setProperty('--bb-r', cfg.r + 'px');
    ['bg', 'tx', 'on'].forEach(function(k){ if (cfg[k]) s.setProperty('--bb-' + k, cfg[k]); else s.removeProperty('--bb-' + k); });
    bar.classList.toggle('nolab', !cfg.labels);
    bar.dataset.pos = cfg.pos; bar.dataset.anim = cfg.anim; document.body.dataset.bbpos = cfg.pos;
    requestAnimationFrame(function(){ gap(); moveInd(true); });
  }

  function avatarIcon(){
    var me = {}, src = '', nm = 'U';
    try { me = S.me || {}; nm = (me.name || me.username || 'U').trim().charAt(0).toUpperCase() || 'U'; if (me.id && typeof avSrc === 'function') src = avSrc(me.id) || ''; } catch (e) {}
    return '<span class="bav"' + (src ? ' style="background-image:url(&quot;' + esc(src) + '&quot;)"' : '') + '>' + (src ? '' : esc(nm)) + '</span>';
  }
  function iconFor(id){
    var o = (cfg.icons[id] || '').trim();
    if (o) return '<span class="bemo">' + esc(o) + '</span>';
    return id === 'profile' ? avatarIcon() : ICON[id];
  }
  var lastHtml = '';
  function draw(){
    var h = '';
    FIXED.forEach(function(f){
      var b = navBtn(f[0]); if (!usable(b)) return;
      var i = info(b), badge = '';
      if (f[0] === 'chat'){ var cb = $('#chatBadge'); if (cb && !cb.classList.contains('hidden') && cb.textContent.trim() && cb.textContent.trim() !== '0') badge = '<em>' + esc(cb.textContent.trim()) + '</em>'; }
      h += '<button type="button" data-go="' + f[0] + '"><span class="bi">' + iconFor(f[0]) + badge + '</span><small>' + esc(i.lb) + '</small></button>';
    });
    h = '<i class="bb-ind"></i>' + h;
    h += '<button type="button" data-all="1" id="btmAll"><span class="bi">' + iconFor('all') + '</span><small>All Options</small></button>';
    var fresh = h !== lastHtml;
    if (fresh){ bar.innerHTML = h; lastHtml = h; }
    mark(); remember(); moveInd(fresh);
  }
  function mark(){
    var cur = ''; try { cur = S.view || ''; } catch (e) {}
    var inFixed = FIXED.some(function(f){ return f[0] === cur; }), inProf = PROF.indexOf(cur) > -1;
    [].forEach.call(bar.querySelectorAll('[data-go]'), function(b){ b.classList.toggle('on', b.dataset.go === 'profile' ? inProf : b.dataset.go === cur); });
    var a = $('#btmAll'); if (a) a.classList.toggle('on', !!cur && !inFixed && !inProf);
  }

  /* ---------- accounts on this phone (for Switch user) ---------- */
  var AK = 'ks_accts_v1';
  function accts(){ try { var a = JSON.parse(localStorage.getItem(AK) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveAccts(a){ try { localStorage.setItem(AK, JSON.stringify(a)); } catch (e) {} }
  function curAcct(){
    try { if (S.token && S.me && S.me.id && !S.me.viewing) return { id: S.me.id, name: S.me.name || S.me.username || 'User', username: S.me.username || '', token: S.token }; } catch (e) {}
    return null;
  }
  function remember(){
    var c = curAcct(); if (!c) return;
    var a = accts(), i = -1; a.forEach(function(x, n){ if (x.id === c.id) i = n; });
    if (i > -1){ if (JSON.stringify(a[i]) === JSON.stringify(c)) return; a[i] = c; } else a.push(c);
    saveAccts(a);
  }
  window.ksAcctDrop = function(){ var c = curAcct(); if (c) saveAccts(accts().filter(function(x){ return x.id !== c.id; })); };   // called by Log out

  var openedAt = 0;
  function drawSheet(){
    var h = '<div class="bs-card"><div class="bs-h"><b>All Options</b><button type="button" data-x="1" aria-label="Close">✕</button></div><div class="bs-g">';
    var n = 0;
    [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){
      if (!usable(b) || EXC.indexOf(b.dataset.v) > -1) return; var i = info(b);
      h += '<button type="button" style="--i:' + (n++) + '" data-go="' + esc(i.id) + '"><span>' + esc(i.ic) + '</span><small>' + esc(i.lb) + '</small></button>';
    });
    sheet.innerHTML = h + '</div></div>';
  }
  function drawSwitch(){
    remember();
    var cur = curAcct(), list = accts();
    var h = '<div class="bs-card"><div class="bs-h"><b>Switch user</b><button type="button" data-x="1" aria-label="Close">✕</button></div><div class="ac-l">';
    list.forEach(function(a){
      var me = cur && a.id === cur.id, src = ''; try { src = (typeof avSrc === 'function' && avSrc(a.id)) || ''; } catch (e) {}
      h += '<div class="ac-r' + (me ? ' cur' : '') + '" ' + (me ? '' : 'data-sw="' + esc(a.id) + '"') + '><span class="ac-av"' + (src ? ' style="background-image:url(&quot;' + esc(src) + '&quot;)"' : '') + '>' + (src ? '' : esc((a.name || '?').trim().charAt(0).toUpperCase())) + '</span>' +
        '<span class="ac-t"><b>' + esc(a.name) + '</b><small>' + (a.username ? '@' + esc(a.username) : '') + '</small></span>' +
        (me ? '<span class="ac-ok">✓ Current</span>' : '<button type="button" class="ac-x" data-acx="' + esc(a.id) + '" aria-label="Remove">✕</button>') + '</div>';
    });
    h += '</div><button type="button" class="btn block" data-addacc="1">＋ Add another account</button>' +
      '<p class="muted" style="font-size:12px;margin-top:10px">Accounts appear here after they sign in on this phone. Tap one to switch. “Log out” removes that account from this list.</p></div>';
    sheet.innerHTML = h;
  }
  function openSheet(on, kind){
    if (on){ openedAt = Date.now(); if (kind === 'switch') drawSwitch(); else drawSheet(); }
    sheet.classList.toggle('hidden', !on); document.body.classList.toggle('btm-sheet', !!on);
  }
  function switchTo(id){
    var a = accts().filter(function(x){ return x.id === id; })[0]; if (!a) return;
    try { if (typeof store !== 'undefined' && typeof TK !== 'undefined') store.set(TK, a.token, true); else return; } catch (e) { return; }
    location.reload();
  }

  var lpFired = false;
  function onTap(e){
    var t = e.target;
    if (Date.now() - openedAt < 450 && t === sheet) return;
    if (t === sheet || t.closest('[data-x]')){ openSheet(false); return; }
    var sw = t.closest('[data-sw]'); if (sw){ switchTo(sw.dataset.sw); return; }
    var ax = t.closest('[data-acx]'); if (ax){ saveAccts(accts().filter(function(x){ return x.id !== ax.dataset.acx; })); drawSwitch(); return; }
    if (t.closest('[data-addacc]')){ openSheet(false); if (typeof forceLogout === 'function') forceLogout(); return; }
    if (t.closest('[data-all]')){ openSheet(sheet.classList.contains('hidden')); return; }
    var g = t.closest('[data-go]'); if (!g) return;
    if (lpFired && g.dataset.go === 'profile'){ lpFired = false; return; }
    openSheet(false); if (typeof go === 'function') go(g.dataset.go);
  }
  bar.addEventListener('click', onTap); sheet.addEventListener('click', onTap);
  bar.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  var lpT = null;
  function lpCancel(){ clearTimeout(lpT); }
  bar.addEventListener('pointerdown', function(e){
    if (!e.target.closest('[data-go="profile"]')) return;
    lpFired = false; clearTimeout(lpT);
    lpT = setTimeout(function(){ lpFired = true; try { if (navigator.vibrate) navigator.vibrate(25); } catch (x) {} openSheet(true, 'switch'); }, 520);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(n){ bar.addEventListener(n, lpCancel); });

  var kb = false;
  function vis(){
    var b = document.body, off = app.classList.contains('hidden') || b.classList.contains('vc-open') || b.classList.contains('menu-open') ||
      b.classList.contains('chat-conv') || !!$('.chat.in-conv') || kb;
    bar.classList.toggle('hidden', off);
    b.classList.toggle('has-btm', !off);
    if (!off){ gap(); requestAnimationFrame(function(){ moveInd(true); }); }
    if (app.classList.contains('hidden')) openSheet(false);
  }
  if (window.visualViewport){
    var base = window.innerHeight;
    visualViewport.addEventListener('resize', function(){
      if (visualViewport.height > base) base = visualViewport.height;
      kb = visualViewport.height < base * 0.75; vis();
    });
  }
  new MutationObserver(function(){ draw(); vis(); }).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'], childList: true, characterData: true });
  var cb = $('#chatBadge'); if (cb) new MutationObserver(draw).observe(cb, { attributes: true, childList: true, characterData: true, subtree: true });
  new MutationObserver(vis).observe(app, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(vis).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  var v = $('#view'); if (v) new MutationObserver(function(){ vis(); draw(); }).observe(v, { childList: true });

  /* ---------- Profile › Bottom bar card ---------- */
  function cssHex(name, fb){ var x = ''; try { x = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) {} return /^#[0-9a-f]{6}$/i.test(x) ? x : fb; }
  window.bbCard = function(){
    var c = cfg;
    var rng = function(k, l, min, max, unit){ return '<div class="bb-row"><label>' + l + ' <b id="bbv-' + k + '">' + c[k] + unit + '</b></label><input type="range" data-bb="' + k + '" min="' + min + '" max="' + max + '" value="' + c[k] + '"></div>'; };
    var col = function(k, l, d){ return '<div class="bb-row bb-colr"><label>' + l + (c[k] ? '' : ' <span class="muted">(auto)</span>') + '</label><span><input type="color" data-bb="' + k + '" value="' + (c[k] || d) + '"><button type="button" class="btn ghost sm" data-bbreset="' + k + '">Auto</button></span></div>'; };
    var ico = function(id, l){ return '<div class="bb-row bb-colr"><label>' + l + '</label><input class="input bb-emo" data-bbicon="' + id + '" maxlength="4" placeholder="default" value="' + esc(c.icons[id] || '') + '"></div>'; };
    return '<div class="card" id="bbCard"><h3>🧭 Bottom bar</h3>' +
      '<p class="muted" style="margin-bottom:12px">Changes show on the bar at once and are saved on this phone. The bar is used on phones and tablets.</p>' +
      rng('scale', 'Bar size', 80, 140, '%') + rng('ic', 'Icon size', 18, 40, 'px') + rng('fs', 'Font size', 9, 17, 'px') + rng('r', 'Roundness', 0, 36, 'px') +
      '<div class="bb-row bb-colr"><label>Position</label><select class="select bb-sel" data-bbs="pos">' + [['bottom', 'Bottom'], ['top', 'Top'], ['left', 'Left side'], ['right', 'Right side']].map(function(o){ return '<option value="' + o[0] + '"' + (c.pos === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="bb-row bb-colr"><label>Animation</label><select class="select bb-sel" data-bbs="anim">' + [['pop', 'Pop'], ['bounce', 'Bounce'], ['wiggle', 'Wiggle'], ['none', 'Off']].map(function(o){ return '<option value="' + o[0] + '"' + (c.anim === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<label class="tog" style="margin:6px 0 10px"><input type="checkbox" data-bb="labels" ' + (c.labels ? 'checked' : '') + '> Show names under icons</label>' +
      col('bg', 'Bar colour', cssHex('--card', '#ffffff')) + col('tx', 'Text &amp; icon colour', cssHex('--ink', '#1e293b')) + col('on', 'Selected colour', cssHex('--brand', '#4f46e5')) +
      '<div class="bb-sub">Icons <span class="muted">— type one emoji, leave blank for the default</span></div>' +
      ico('dashboard', 'Dashboard') + ico('profile', 'Profile') + ico('chat', 'Chat') + ico('all', 'All Options') +
      '<div style="margin-top:12px"><button type="button" class="btn ghost" data-bbfull="1">↺ Reset bottom bar</button></div></div>';
  };
  function refreshView(){ if (typeof render === 'function') { try { render(); } catch (e) {} } }
  function onSel(e){
    var t = e.target, sk = t && t.getAttribute && t.getAttribute('data-bbs');
    if (sk){ cfg[sk] = t.value; saveCfg(); applyCfg(); }
  }
  document.addEventListener('change', onSel);
  document.addEventListener('input', function(e){
    var t = e.target; if (!t || !t.closest) return;
    onSel(e);
    var k = t.getAttribute && t.getAttribute('data-bb');
    if (k){
      cfg[k] = t.type === 'checkbox' ? (t.checked ? 1 : 0) : (t.type === 'range' ? +t.value : t.value);
      var lab = document.getElementById('bbv-' + k); if (lab) lab.textContent = t.value + (k === 'scale' ? '%' : 'px');
      saveCfg(); applyCfg(); return;
    }
    var ic = t.getAttribute && t.getAttribute('data-bbicon');
    if (ic){ var val = t.value.trim(); if (val) cfg.icons[ic] = val; else delete cfg.icons[ic]; saveCfg(); draw(); requestAnimationFrame(gap); }
  });
  document.addEventListener('click', function(e){
    var r = e.target.closest && e.target.closest('[data-bbreset]');
    if (r){ cfg[r.dataset.bbreset] = ''; saveCfg(); applyCfg(); refreshView(); return; }
    if (e.target.closest && e.target.closest('[data-bbfull]')){ cfg = JSON.parse(JSON.stringify(DEF)); saveCfg(); applyCfg(); lastHtml = ''; draw(); refreshView(); }
  });

  window.addEventListener('resize', function(){ requestAnimationFrame(function(){ gap(); moveInd(true); }); });
  applyCfg(); draw(); vis();
})();
