/* KS · Bottom bar (phones): Dashboard · Profile · Chat · More.
   - More lists the remaining side-menu items (Profile/Settings/VCS/Version live inside Profile)
   - long-press Profile = switch user (accounts that signed in on this phone)
   - Profile › Bottom bar = size, font, colours, icons (saved on this phone)
   Pure add-on: reads the existing side menu (#nav) and S/go/render from app.js. */
/* v10: Profile › Manage menu — move any option between Bottom bar / More / Profile, or delete (and restore) it. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var app = $('#app'), nav = $('#nav'); if (!app || !nav) return;
  var FIXED = [['dashboard', 'Dashboard'], ['profile', 'Profile'], ['chat', 'Chat'], ['telegram', 'Telegram'], ['whatsapp', 'WhatsApp'], ['mail', 'Mail']];
  var PROF = ['profile', 'settings', 'vcs', 'version', 'logins', 'deploy', 'updates'];                       // pages that belong to Profile
  var EXC = ['dashboard', 'chat', 'telegram', 'whatsapp', 'mail', 'profile', 'settings', 'vcs', 'version', 'logins', 'deploy', 'updates'];   // not listed in More
  var SV = function(p){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var ICON = {
    dashboard: SV('<rect x="3.5" y="3.5" width="7" height="8" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="14.5" width="7" height="6" rx="2"/>'),
    chat: SV('<path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.3A7.5 7.5 0 1 1 20.5 11.5z"/><path d="M9 10.5h6M9 13.5h4"/>'),
    telegram: SV('<path d="M21 4 3 11.2l5.6 2L10.5 20l3.2-4 4.6 3.4L21 4z"/><path d="m8.6 13.2 9-6.4"/>'),
    whatsapp: SV('<path d="M20 11.6A8 8 0 0 1 8 18.5L4 19.8l1.3-3.8A8 8 0 1 1 20 11.6z"/><path d="M9.2 8.8c.2 2.6 2.7 5.1 5.4 5.5l1.1-1.2-1.9-1-.9.6c-.9-.4-1.7-1.2-2.1-2.1l.6-.9-1-1.9-1.2 1z"/>'),
    mail: SV('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.8 7.5 8.2 6 8.2-6"/>'),
    all: SV('<circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>')
  };
  function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function navBtn(v){ return nav.querySelector('button[data-v="' + v + '"]'); }
  function info(b){
    var ic = b.querySelector('.ico'), txt = '';
    [].forEach.call(b.childNodes, function(n){ if (n.nodeType === 3) txt += n.nodeValue; });
    return { id: b.dataset.v, ic: ic ? ic.textContent : '•', lb: txt.trim() || b.dataset.v };
  }
  function usable(b){ return b && !b.classList.contains('hidden') && !b.classList.contains('th-off') && !b.classList.contains('ks-del'); }

  /* ---------- customisation (saved on this phone) ---------- */
  var KEY = 'ks_bb_v1', DEF = { scale: 100, fs: 12, ic: 26, r: 30, bg: '', tx: '', on: '', labels: 1, pos: 'bottom', anim: 'pop', icons: {}, place: {} };
  function loadCfg(){
    var c = {}; try { c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
    var o = {}; Object.keys(DEF).forEach(function(k){ o[k] = c[k] !== undefined ? c[k] : DEF[k]; });
    o.icons = (c.icons && typeof c.icons === 'object') ? c.icons : {};
    o.place = (c.place && typeof c.place === 'object') ? c.place : {}; return o;
  }
  var cfg = loadCfg();
  function saveCfg(){ try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} try { if (window.thPush) thPush(); } catch (e) {} }

  /* ---------- where every option lives: bar | more | profile | deleted ---------- */
  var LOCK = ['dashboard', 'profile'];                 // always on the bar
  var NODEL = ['dashboard', 'profile', 'settings'];    // can't be deleted
  var MAXBAR = 6, MAXSIDE = 10;
  var DEFPLACE = { dashboard: 'bar', profile: 'bar', chat: 'bar', telegram: 'bar', whatsapp: 'bar', mail: 'bar', settings: 'profile', vcs: 'profile', version: 'profile', logins: 'profile', deploy: 'profile', updates: 'profile' };
  function place(id){
    if (LOCK.indexOf(id) > -1) return 'bar';
    var p = cfg.place[id];
    if (p === 'deleted' && NODEL.indexOf(id) > -1) p = '';
    if (p === 'bar' || p === 'more' || p === 'profile' || p === 'left' || p === 'right' || p === 'deleted') return p;
    return DEFPLACE[id] || 'more';
  }
  window.bbPlace = place;
  function barIds(){
    var ids = [];
    FIXED.forEach(function(f){ if (place(f[0]) === 'bar') ids.push(f[0]); });
    [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){ var id = b.dataset.v; if (ids.indexOf(id) < 0 && place(id) === 'bar') ids.push(id); });
    return ids;
  }
  function applyPlace(){ [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){ b.classList.toggle('ks-del', place(b.dataset.v) === 'deleted'); }); }

  var bar = document.createElement('nav'); bar.id = 'btmBar'; bar.className = 'hidden'; bar.setAttribute('aria-label', 'Main');
  var sheet = document.createElement('div'); sheet.id = 'btmSheet'; sheet.className = 'hidden';
  document.body.appendChild(bar); document.body.appendChild(sheet);

  /* ---------- Left / Right side bars (slide out with an arrow) ---------- */
  var sides = {};
  ['left', 'right'].forEach(function(sd){
    var el = document.createElement('div'); el.className = 'sbx hidden'; el.dataset.side = sd; el.id = 'sb-' + sd;
    document.body.appendChild(el); sides[sd] = { el: el, open: false, html: '' };
  });
  function sideIds(sd){
    var ids = [];
    [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){ var id = b.dataset.v; if (place(id) === sd && usable(b)) ids.push(id); });
    return ids;
  }
  function arrowOf(sd){ var o = sides[sd].open; return (sd === 'left') === o ? '‹' : '›'; }
  function drawSides(){
    ['left', 'right'].forEach(function(sd){
      var S0 = sides[sd], ids = sideIds(sd), h = '';
      ids.forEach(function(id){
        var b = navBtn(id), i = info(b), badge = '';
        if (id === 'chat'){ var cb = $('#chatBadge'); if (cb && !cb.classList.contains('hidden') && cb.textContent.trim() && cb.textContent.trim() !== '0') badge = '<em>' + esc(cb.textContent.trim()) + '</em>'; }
        h += '<button type="button" data-go="' + esc(id) + '"><span class="bi">' + iconFor(id, i.ic) + badge + '</span><small>' + esc(i.lb) + '</small></button>';
      });
      var html = ids.length ? '<div class="sb-panel">' + h + '</div><button type="button" class="sb-arrow" data-sbt="' + sd + '" aria-label="' + (sd === 'left' ? 'Left' : 'Right') + ' bar">' + arrowOf(sd) + '</button>' : '';
      if (html !== S0.html){ S0.el.innerHTML = html; S0.html = html; }
      S0.el.classList.toggle('empty', !ids.length);
      S0.el.classList.toggle('open', S0.open && ids.length > 0);
      var cur = ''; try { cur = S.view || ''; } catch (e) {}
      [].forEach.call(S0.el.querySelectorAll('[data-go]'), function(b){ b.classList.toggle('on', b.dataset.go === cur); });
    });
  }
  function toggleSide(sd, on){
    ['left', 'right'].forEach(function(k){ sides[k].open = (k === sd) ? (on === undefined ? !sides[k].open : on) : false; });
    sides.left.html = sides.right.html = ''; drawSides();
  }
  function closeSides(){ if (sides.left.open || sides.right.open) toggleSide('', false); }
  function sideTap(e){
    e.stopPropagation(); var t = e.target, a = t.closest('[data-sbt]');
    if (a){ toggleSide(a.dataset.sbt); return; }
    var g = t.closest('[data-go]'); if (!g) return;
    closeSides(); openSheet(false); if (typeof go === 'function') go(g.dataset.go);
  }
  ['left', 'right'].forEach(function(sd){ sides[sd].el.addEventListener('click', sideTap); });
  document.addEventListener('click', function(e){
    if ((sides.left.open || sides.right.open) && !(e.target.closest && e.target.closest('.sbx'))) closeSides();
  });

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
  function iconFor(id, emo){
    var o = (cfg.icons[id] || '').trim();
    if (o) return '<span class="bemo">' + esc(o) + '</span>';
    if (id === 'profile') return avatarIcon();
    return ICON[id] || '<span class="bemo">' + esc(emo || '•') + '</span>';
  }
  var lastHtml = '';
  function draw(){
    var h = '';
    applyPlace();
    barIds().forEach(function(id){
      var b = navBtn(id); if (!usable(b)) return;
      var i = info(b), badge = '';
      if (id === 'chat'){ var cb = $('#chatBadge'); if (cb && !cb.classList.contains('hidden') && cb.textContent.trim() && cb.textContent.trim() !== '0') badge = '<em>' + esc(cb.textContent.trim()) + '</em>'; }
      h += '<button type="button" data-go="' + id + '"><span class="bi">' + iconFor(id, i.ic) + badge + '</span><small>' + esc(i.lb) + '</small></button>';
    });
    h = '<i class="bb-ind"></i>' + h;
    drawSides();
    h += '<button type="button" data-all="1" id="btmAll"><span class="bi">' + iconFor('all') + '</span><small>More</small></button>';
    var fresh = h !== lastHtml;
    if (fresh){ bar.innerHTML = h; lastHtml = h; }
    mark(); remember(); moveInd(fresh);
  }
  function mark(){
    var cur = ''; try { cur = S.view || ''; } catch (e) {}
    var inFixed = barIds().indexOf(cur) > -1, inProf = cur === 'profile' || (!inFixed && place(cur) === 'profile');
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
    var h = '<div class="bs-card"><div class="bs-h"><b>More</b><span class="bs-hb"><button type="button" class="bs-ed" data-manage="1" aria-label="Manage menu" title="Manage menu">✎</button><button type="button" data-x="1" aria-label="Close">✕</button></span></div><div class="bs-g">';
    var n = 0;
    [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){
      if (!usable(b) || place(b.dataset.v) !== 'more') return; var i = info(b);
      h += '<button type="button" style="--i:' + (n++) + '" data-go="' + esc(i.id) + '"><span>' + esc(i.ic) + '</span><small>' + esc(i.lb) + '</small></button>';
    });
    if (!n) h += '<div class="mg-none" style="grid-column:1/-1">Nothing here. Tap ✎ to move options into More.</div>';
    sheet.innerHTML = h + '</div></div>';
  }
  function drawManage(){
    var rows = '', del = '', nBar = 0;
    var seg = function(id, p){ return [['bar', 'Bar'], ['more', 'More'], ['profile', 'Profile'], ['left', '‹ Left'], ['right', 'Right ›']].map(function(o){ return '<button type="button" class="' + (p === o[0] ? 'on' : '') + '" data-mv="' + esc(id) + '|' + o[0] + '">' + o[1] + '</button>'; }).join(''); };
    [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){
      if (b.classList.contains('hidden') || b.classList.contains('th-off')) return;
      var i = info(b), p = place(i.id);
      if (p === 'deleted'){ del += '<div class="mg-r"><span class="mg-i">' + esc(i.ic) + '</span><b>' + esc(i.lb) + '</b><button type="button" class="mg-rs" data-res="' + esc(i.id) + '">↩ Restore</button></div>'; return; }
      if (p === 'bar') nBar++;
      rows += '<div class="mg-r"><span class="mg-i">' + esc(i.ic) + '</span><b>' + esc(i.lb) + '</b>' +
        (LOCK.indexOf(i.id) > -1 ? '<span class="mg-lock">always on bar</span>' : '<span class="mg-seg">' + seg(i.id, p) + '</span>') +
        (NODEL.indexOf(i.id) > -1 ? '<span class="mg-d0"></span>' : '<button type="button" class="mg-d" data-del="' + esc(i.id) + '" aria-label="Delete">🗑</button>') + '</div>';
    });
    sheet.innerHTML = '<div class="bs-card"><div class="bs-h"><b>Manage menu</b><span class="bs-hb"><button type="button" data-back="1" aria-label="Back to More" title="Back">‹</button><button type="button" data-x="1" aria-label="Close">✕</button></span></div>' +
      '<p class="muted" style="font-size:12.5px;margin:0 0 10px">Choose where each option lives: <b>Bar</b> (bottom bar, max ' + MAXBAR + ' — now ' + nBar + '), <b>More</b>, <b>Profile</b>, <b>‹ Left</b> bar or <b>Right ›</b> bar (open with the arrow on the screen edge). 🗑 deletes an option (you can restore it below).</p>' +
      '<div class="mg-l">' + rows + '</div>' + (del ? '<div class="bs-sub">Deleted</div><div class="mg-l">' + del + '</div>' : '') + '</div>';
  }
  function redrawManage(){ var c = sheet.querySelector('.bs-card'), t = c ? c.scrollTop : 0; drawManage(); c = sheet.querySelector('.bs-card'); if (c) c.scrollTop = t; }
  function say(m){ try { if (typeof toast === 'function') toast(m); } catch (e) {} }
  function commit(){
    saveCfg(); sides.left.html = sides.right.html = ''; applyPlace(); lastHtml = ''; draw(); requestAnimationFrame(gap);
    if (!sheet.classList.contains('hidden')) redrawManage();
    try { if (typeof S !== 'undefined' && S.view === 'profile') refreshView(); } catch (e) {}
  }
  function setPlace(id, to){
    var def = DEFPLACE[id] || 'more';
    if (LOCK.indexOf(id) > -1) return;
    if (to === 'bar' && place(id) !== 'bar'){
      var n = barIds().filter(function(x){ return x !== id && usable(navBtn(x)); }).length;
      if (n >= MAXBAR){ say('Bottom bar is full (max ' + MAXBAR + '). Move another option out of the bar first.'); return; }
    }
    if ((to === 'left' || to === 'right') && place(id) !== to){
      var m = sideIds(to).filter(function(x){ return x !== id; }).length;
      if (m >= MAXSIDE){ say((to === 'left' ? 'Left' : 'Right') + ' bar is full (max ' + MAXSIDE + ').'); return; }
    }
    if (to === def) delete cfg.place[id]; else cfg.place[id] = to;
    commit();
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
    if (on){ openedAt = Date.now(); if (kind === 'switch') drawSwitch(); else if (kind === 'manage') drawManage(); else drawSheet(); }
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
    var mv = t.closest('[data-mv]'); if (mv){ var q = mv.dataset.mv.split('|'); setPlace(q[0], q[1]); return; }
    var dl = t.closest('[data-del]'); if (dl){
      if (dl.dataset.arm !== '1'){ dl.dataset.arm = '1'; dl.textContent = 'Delete?'; dl.classList.add('arm'); setTimeout(function(){ if (dl.isConnected){ dl.dataset.arm = ''; dl.textContent = '🗑'; dl.classList.remove('arm'); } }, 2500); return; }
      var did = dl.dataset.del; cfg.place[did] = 'deleted'; commit(); say('Option deleted — restore it from Manage menu › Deleted'); return;
    }
    var rs = t.closest('[data-res]'); if (rs){ delete cfg.place[rs.dataset.res]; commit(); return; }
    if (t.closest('[data-manage]')){ openSheet(true, 'manage'); return; }
    if (t.closest('[data-back]')){ openSheet(true); return; }
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
    ['left', 'right'].forEach(function(k){ sides[k].el.classList.toggle('hidden', off); });
    if (off) closeSides();
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
  window.bbGet = function(){ try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  window.bbSet = function(j){                       // design sent by the admin
    try { if (j) localStorage.setItem(KEY, j); else localStorage.removeItem(KEY); } catch (e) {}
    try { cfg = loadCfg(); applyCfg(); lastHtml = ''; draw(); } catch (e) {}
  };
  window.bbManage = function(){ openSheet(true, 'manage'); };
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
      ico('dashboard', 'Dashboard') + ico('profile', 'Profile') + ico('chat', 'Chat') + ico('all', 'More') +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" onclick="bbManage()">🧩 Manage menu (move / delete)</button><button type="button" class="btn ghost" data-bbfull="1">↺ Reset bottom bar</button></div></div>';
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
