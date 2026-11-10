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
  var legacyPlace = Object.keys(cfg.place).length ? JSON.parse(JSON.stringify(cfg.place)) : null;   // old shared placement (first user only)
  cfg.place = {};
  /* Design (size, colours, icons) = ONE for everybody, set by the admin. Placement of options (Bar / More / Profile / Left / Right) = each user's OWN,
     saved in that user's account on the server (and on this phone), so it is the same after every login. */
  function stripPlace(c){ var o = {}; Object.keys(c).forEach(function(k){ if (k !== 'place') o[k] = c[k]; }); return o; }
  function saveCfg(){ try { localStorage.setItem(KEY, JSON.stringify(stripPlace(cfg))); } catch (e) {} try { if (window.thPush) thPush(); } catch (e) {} }
  var curUid = null, plT = null;
  function uid(){ try { return (S.me && S.me.id && !S.me.viewing) ? String(S.me.id) : ''; } catch (e) { return ''; } }
  function plKey(u){ return 'ks_bb_pl_' + u; }
  function pushPlace(){
    clearTimeout(plT);
    plT = setTimeout(function(){
      try { if (typeof callServer === 'function' && S.token && curUid) callServer({ action: 'saveMyMenu', token: S.token, menu: JSON.stringify(cfg.place) }).catch(function(){}); } catch (e) {}
    }, 800);
  }
  function savePlace(){ if (!curUid) return; try { localStorage.setItem(plKey(curUid), JSON.stringify(cfg.place)); } catch (e) {} pushPlace(); }
  function syncUser(){
    var u = uid(); if (u === curUid) return; curUid = u;
    if (!u){ cfg.place = {}; return; }
    var p = null; try { p = JSON.parse(localStorage.getItem(plKey(u)) || 'null'); } catch (e) {}
    if (!p || typeof p !== 'object'){ p = legacyPlace || {}; legacyPlace = null; }
    cfg.place = p;
    try {
      if (typeof callServer === 'function' && S.token) callServer({ action: 'getMyMenu', token: S.token }).then(function(r){
        if (u !== curUid || !r || !r.ok) return;
        if (r.menu){ var m = null; try { m = JSON.parse(r.menu); } catch (e) {} if (m && typeof m === 'object'){ cfg.place = m; try { localStorage.setItem(plKey(u), r.menu); } catch (e) {} lastHtml = ''; draw(); } }
        else if (Object.keys(cfg.place).length) pushPlace();
      }).catch(function(){});
    } catch (e) {}
  }

  /* ---------- where every option lives: bar | more | profile | deleted ---------- */
  var LOCK = ['dashboard', 'profile'];                 // always on the bar
  var NODEL = ['dashboard', 'profile'];                // can't be deleted
  var HIDE = ['settings'];                             // removed from every menu (its options now live as separate items)
  var MAXBAR = 6, MAXSIDE = 10, MAXSBS = 6;
  var DEFPLACE = { dashboard: 'bar', profile: 'bar', chat: 'bar', telegram: 'bar', whatsapp: 'bar', mail: 'bar', settings: 'profile', vcs: 'profile', version: 'profile', logins: 'profile', deploy: 'profile', updates: 'profile' };
  var ARROWS = { chev: ['›', '‹'], dbl: ['»', '«'], tri: ['▶', '◀'], menu: ['☰', '☰'] };
  function normSb(x){ return { id: x.id, name: String(x.name == null ? '' : x.name).slice(0, 14), side: x.side === 'right' ? 'right' : 'left', arrow: ARROWS[x.arrow] ? x.arrow : 'chev', top: isFinite(+x.top) ? Math.max(5, Math.min(80, +x.top)) : 34 }; }
  function sbList(){                                   // the side bars: Left + Right always, plus the ones the user added
    var l = Array.isArray(cfg.place._sbs) ? cfg.place._sbs.filter(function(x){ return x && /^[a-z0-9]{2,12}$/.test(String(x.id)); }).map(normSb) : [];
    [['left', '‹ Left'], ['right', 'Right ›']].forEach(function(d, n){ if (!l.some(function(x){ return x.id === d[0]; })) l.splice(n, 0, { id: d[0], name: d[1], side: d[0], arrow: 'chev', top: 34 }); });
    return l.slice(0, MAXSBS);
  }
  function sbGet(id){ if (!id || id === 'bar' || id === 'more' || id === 'profile' || id === 'deleted') return null; return sbList().filter(function(x){ return x.id === id; })[0] || null; }
  function place(id){
    if (LOCK.indexOf(id) > -1) return 'bar';
    var p = cfg.place[id];
    if (p === 'deleted' && NODEL.indexOf(id) > -1) p = '';
    if (p === 'bar' || p === 'more' || p === 'profile' || p === 'deleted') return p;
    if (p && sbGet(p)) return p;
    return DEFPLACE[id] || (id.indexOf('set:') === 0 ? 'profile' : 'more');
  }
  window.bbPlace = place;
  /* settings options (Appearance, Employees, Users…) are menu options too — they come from app.js (ksSetList) */
  var setCache = { key: '', list: [] };
  function setOpts(){
    var key = ''; try { key = S.me ? [S.me.id, S.me.role, JSON.stringify(S.me.perms || {})].join('|') : ''; } catch (e) {}
    if (!key || typeof ksSetList !== 'function') return [];
    if (setCache.key !== key || !setCache.list.length){ try { setCache.list = ksSetList() || []; setCache.key = key; } catch (e) { setCache.list = []; } }
    return setCache.list;
  }
  function extraOpts(){ try { return (typeof ksExtraList === 'function' && ksExtraList()) || []; } catch (e) { return []; } }
  function optInfo(id){
    if (id.indexOf('x:') === 0){ var x = extraOpts().filter(function(o){ return o.id === id; })[0]; return x ? { id: id, ic: x.ic, lb: x.lb } : null; }
    if (id.indexOf('set:') === 0){ var o = setOpts().filter(function(x){ return x.id === id; })[0]; return o ? { id: id, ic: o.ic, lb: o.lb } : null; }
    var b = navBtn(id); return usable(b) ? info(b) : null;
  }
  function optIds(){
    var ids = []; [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){ if (HIDE.indexOf(b.dataset.v) < 0) ids.push(b.dataset.v); });
    setOpts().forEach(function(o){ ids.push(o.id); }); extraOpts().forEach(function(o){ ids.push(o.id); }); return ids;
  }
  function barIds(){
    var ids = [];
    FIXED.forEach(function(f){ if (place(f[0]) === 'bar') ids.push(f[0]); });
    optIds().forEach(function(id){ if (ids.indexOf(id) < 0 && place(id) === 'bar') ids.push(id); });
    return ids;
  }
  function sideIds(sid){ return optIds().filter(function(id){ return place(id) === sid && optInfo(id); }); }
  function curId(){ var cur = ''; try { cur = S.view || ''; if (cur === 'livechat') cur = 'x:live'; if (cur === 'profile' && S.setSec && optInfo('set:' + S.setSec) && place('set:' + S.setSec) !== 'profile') cur = 'set:' + S.setSec; } catch (e) {} return cur; }
  function navTo(id){ if (id.indexOf('x:') === 0){ if (typeof ksOpenX === 'function') ksOpenX(id.slice(2)); } else if (id.indexOf('set:') === 0){ if (typeof ksOpenSet === 'function') ksOpenSet(id.slice(4)); } else if (typeof go === 'function') go(id); }
  function applyPlace(){ [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){ b.classList.toggle('ks-del', place(b.dataset.v) === 'deleted'); }); }

  var bar = document.createElement('nav'); bar.id = 'btmBar'; bar.className = 'hidden'; bar.setAttribute('aria-label', 'Main');
  var sheet = document.createElement('div'); sheet.id = 'btmSheet'; sheet.className = 'hidden';
  document.body.appendChild(bar); document.body.appendChild(sheet);

  /* ---------- Side bars (Left / Right + the ones you add): slide out with an arrow ---------- */
  var sides = {}, vOff = true;
  function syncSideEls(){
    var keep = {};
    sbList().forEach(function(sb){
      keep[sb.id] = 1;
      if (!sides[sb.id]){
        var el = document.createElement('div'); el.className = 'sbx hidden'; el.id = 'sb-' + sb.id;
        el.addEventListener('click', sideTap); document.body.appendChild(el); sides[sb.id] = { el: el, open: false, html: '' };
      }
      var S0 = sides[sb.id]; S0.sb = sb; S0.el.dataset.side = sb.side; S0.el.style.setProperty('--sbtop', sb.top + '%');
    });
    Object.keys(sides).forEach(function(k){ if (!keep[k]){ sides[k].el.remove(); delete sides[k]; } });
  }
  function arrowOf(sb, open){ var a = ARROWS[sb.arrow] || ARROWS.chev; return (sb.side === 'left') === !!open ? a[1] : a[0]; }
  function drawSides(){
    syncSideEls();
    var cur = curId();
    Object.keys(sides).forEach(function(k){
      var S0 = sides[k], sb = S0.sb, ids = sideIds(k), h = '';
      ids.forEach(function(id){
        var i = optInfo(id), badge = '';
        if (id === 'chat'){ var cb = $('#chatBadge'); if (cb && !cb.classList.contains('hidden') && cb.textContent.trim() && cb.textContent.trim() !== '0') badge = '<em>' + esc(cb.textContent.trim()) + '</em>'; }
        h += '<button type="button" data-go="' + esc(id) + '"><span class="bi">' + iconFor(id, i.ic) + badge + '</span><small>' + esc(i.lb) + '</small></button>';
      });
      var html = ids.length ? '<div class="sb-panel">' + h + '</div><button type="button" class="sb-arrow" data-sbt="' + esc(k) + '" aria-label="' + esc(sb.name || 'Side bar') + '">' + arrowOf(sb, S0.open) + '</button>' : '';
      if (html !== S0.html){ S0.el.innerHTML = html; S0.html = html; }
      S0.el.classList.toggle('empty', !ids.length);
      S0.el.classList.toggle('open', S0.open && ids.length > 0);
      S0.el.classList.toggle('hidden', vOff);
      [].forEach.call(S0.el.querySelectorAll('[data-go]'), function(b){ b.classList.toggle('on', b.dataset.go === cur); });
    });
  }
  function toggleSide(id, on){
    Object.keys(sides).forEach(function(k){ sides[k].open = (k === id) ? (on === undefined ? !sides[k].open : on) : false; });
    drawSides();
  }
  function closeSides(){ var any = Object.keys(sides).some(function(k){ return sides[k].open; }); if (any) toggleSide('', false); }
  function sideTap(e){
    e.stopPropagation(); var t = e.target, a = t.closest('[data-sbt]');
    if (a){ toggleSide(a.dataset.sbt); return; }
    var g = t.closest('[data-go]'); if (!g) return;
    closeSides(); openSheet(false); navTo(g.dataset.go);
  }
  /* swipe the open side bar toward its edge to close it; the phone Back button / edge swipe closes it too (ksBack calls bbCloseTop) */
  (function(){
    var sx = 0, sy = 0, on = null;
    document.addEventListener('touchstart', function(e){ var el = e.target.closest && e.target.closest('.sbx.open'); on = el || null; if (el){ sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
    document.addEventListener('touchend', function(e){
      if (!on) return; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy, el = on; on = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if ((el.dataset.side === 'left' && dx < 0) || (el.dataset.side === 'right' && dx > 0)) closeSides();
    }, { passive: true });
  })();
  window.bbCloseTop = function(){
    if (Object.keys(sides).some(function(k){ return sides[k].open; })){ closeSides(); return true; }
    if (sheet && !sheet.classList.contains('hidden')){ openSheet(false); return true; }
    return false;
  };
  document.addEventListener('click', function(e){
    if (Object.keys(sides).some(function(k){ return sides[k].open; }) && !(e.target.closest && e.target.closest('.sbx'))) closeSides();
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
    syncUser();
    var h = '';
    applyPlace();
    barIds().forEach(function(id){
      var i = optInfo(id); if (!i) return;
      var badge = '';
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
    var cur = curId();
    var inSide = !!sbGet(place(cur));
    var inFixed = barIds().indexOf(cur) > -1, inProf = cur === 'profile' || (!inFixed && place(cur) === 'profile');
    [].forEach.call(bar.querySelectorAll('[data-go]'), function(b){ b.classList.toggle('on', b.dataset.go === 'profile' ? inProf : b.dataset.go === cur); });
    var a = $('#btmAll'); if (a) a.classList.toggle('on', !!cur && !inFixed && !inProf && !inSide);
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
    optIds().forEach(function(id){
      if (place(id) !== 'more') return; var i = optInfo(id); if (!i) return;
      h += '<button type="button" style="--i:' + (n++) + '" data-go="' + esc(i.id) + '"><span>' + esc(i.ic) + '</span><small>' + esc(i.lb) + '</small></button>';
    });
    if (!n) h += '<div class="mg-none" style="grid-column:1/-1">Nothing here. Tap ✎ to move options into More.</div>';
    sheet.innerHTML = h + '</div></div>';
  }
  function drawManage(){
    var rows = '', setRows = '', toolRows = '', del = '', nBar = 0, sbs = sbList();
    var segOpts = [['bar', 'Bar'], ['more', 'More'], ['profile', 'Profile']].concat(sbs.map(function(x){ return [x.id, x.name || 'Side bar']; }));
    var seg = function(id, p){ return segOpts.map(function(o){ return '<button type="button" class="' + (p === o[0] ? 'on' : '') + '" data-mv="' + esc(id) + '|' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join(''); };
    var addRow = function(i){
      var p = place(i.id);
      if (p === 'deleted'){ del += '<div class="mg-r"><span class="mg-i">' + esc(i.ic) + '</span><b>' + esc(i.lb) + '</b><button type="button" class="mg-rs" data-res="' + esc(i.id) + '">↩ Restore</button></div>'; return; }
      if (p === 'bar') nBar++;
      var r = '<div class="mg-r"><span class="mg-i">' + esc(i.ic) + '</span><b>' + esc(i.lb) + '</b>' +
        (LOCK.indexOf(i.id) > -1 ? '<span class="mg-lock">always on bar</span>' : '<span class="mg-seg">' + seg(i.id, p) + '</span>') +
        (NODEL.indexOf(i.id) > -1 ? '<span class="mg-d0"></span>' : '<button type="button" class="mg-d" data-del="' + esc(i.id) + '" aria-label="Delete">🗑</button>') + '</div>';
      if (i.id.indexOf('set:') === 0) setRows += r; else if (i.id.indexOf('x:') === 0) toolRows += r; else rows += r;
    };
    [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){
      if (b.classList.contains('hidden') || b.classList.contains('th-off') || HIDE.indexOf(b.dataset.v) > -1) return;
      addRow(info(b));
    });
    setOpts().forEach(function(o){ addRow({ id: o.id, ic: o.ic, lb: o.lb }); });
    extraOpts().forEach(function(o){ addRow({ id: o.id, ic: o.ic, lb: o.lb }); });
    var sbh = '<div class="bs-sub">Side bars</div><div class="mg-l">' + sbs.map(function(x){
      return '<div class="mg-r"><span class="mg-i">' + (x.side === 'left' ? '‹' : '›') + '</span><b>' + esc(x.name || 'Side bar') + '</b><small class="mg-n">' + sideIds(x.id).length + ' options · ' + x.side + '</small><button type="button" class="mg-d" data-sbedit="' + esc(x.id) + '" aria-label="Customize side bar" title="Customize">✎</button></div>';
    }).join('') + (sbs.length < MAXSBS ? '<button type="button" class="btn block" data-sbadd="1">＋ Add side bar</button>' : '') + '</div>';
    sheet.innerHTML = '<div class="bs-card"><div class="bs-h"><b>Manage menu</b><span class="bs-hb"><button type="button" data-back="1" aria-label="Back to More" title="Back">‹</button><button type="button" data-x="1" aria-label="Close">✕</button></span></div>' +
      '<p class="muted" style="font-size:12.5px;margin:0 0 10px">Choose where each option lives: <b>Bar</b> (bottom bar, max ' + MAXBAR + ' — now ' + nBar + '), <b>More</b>, <b>Profile</b> or a <b>side bar</b> (opens with the arrow on the screen edge). Tap ✎ on a side bar to customize it. 🗑 deletes an option (you can restore it below). Your choices are saved in your own account.</p>' +
      sbh + '<div class="bs-sub">Options</div><div class="mg-l">' + rows + '</div>' +
      (toolRows ? '<div class="bs-sub">Chat tools</div><div class="mg-l">' + toolRows + '</div>' : '') +
      (setRows ? '<div class="bs-sub">Settings options</div><div class="mg-l">' + setRows + '</div>' : '') +
      (del ? '<div class="bs-sub">Deleted</div><div class="mg-l">' + del + '</div>' : '') + '</div>';
  }
  var editSb = '';
  function drawSbEdit(){
    var sb = sbGet(editSb); if (!sb){ drawManage(); return; }
    var opt = function(v, l, cur){ return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>'; };
    var builtin = sb.id === 'left' || sb.id === 'right';
    sheet.innerHTML = '<div class="bs-card"><div class="bs-h"><b>Customize side bar</b><span class="bs-hb"><button type="button" data-backm="1" aria-label="Back" title="Back">‹</button><button type="button" data-x="1" aria-label="Close">✕</button></span></div>' +
      '<div class="sbf"><label>Name</label><input class="input" data-sbf="name" maxlength="14" value="' + esc(sb.name) + '"></div>' +
      '<div class="sbf"><label>Side of the screen</label><select class="select" data-sbf="side">' + opt('left', 'Left', sb.side) + opt('right', 'Right', sb.side) + '</select></div>' +
      '<div class="sbf"><label>Arrow icon</label><select class="select" data-sbf="arrow">' + opt('chev', 'Arrow  ‹ ›', sb.arrow) + opt('dbl', 'Double arrow  « »', sb.arrow) + opt('tri', 'Triangle  ◀ ▶', sb.arrow) + opt('menu', 'Menu  ☰', sb.arrow) + '</select></div>' +
      '<div class="sbf"><label>Arrow &amp; bar height <b id="sbTopV">' + sb.top + '%</b></label><input type="range" data-sbf="top" min="5" max="80" value="' + sb.top + '"></div>' +
      '<p class="muted" style="font-size:12px;margin:8px 0">Options in this side bar: ' + sideIds(sb.id).length + '. Move options here from Manage menu.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn ghost" data-sbreset="' + esc(sb.id) + '">' + (builtin ? '↺ Reset this side bar' : '🗑 Delete this side bar') + '</button></div></div>';
  }
  function sbMut(fn){
    var l = sbList().map(function(x){ return JSON.parse(JSON.stringify(x)); }); fn(l);
    cfg.place._sbs = l; savePlace(); drawSides();
  }
  function onSbf(e){
    var t = e.target, k = t && t.getAttribute && t.getAttribute('data-sbf'); if (!k || !editSb) return;
    sbMut(function(l){
      var sb = l.filter(function(x){ return x.id === editSb; })[0]; if (!sb) return;
      if (k === 'top'){ sb.top = +t.value; var lab = document.getElementById('sbTopV'); if (lab) lab.textContent = t.value + '%'; }
      else if (k === 'name') sb.name = t.value.slice(0, 14);
      else sb[k] = t.value;
    });
  }
  sheet.addEventListener('input', onSbf); sheet.addEventListener('change', onSbf);
  function redrawManage(){ var c = sheet.querySelector('.bs-card'), t = c ? c.scrollTop : 0; drawManage(); c = sheet.querySelector('.bs-card'); if (c) c.scrollTop = t; }
  function say(m){ try { if (typeof toast === 'function') toast(m); } catch (e) {} }
  function commit(){
    saveCfg(); savePlace(); applyPlace(); lastHtml = ''; draw(); requestAnimationFrame(gap);
    if (!sheet.classList.contains('hidden')) redrawManage();
    try { if (typeof S !== 'undefined' && S.view === 'profile') refreshView(); } catch (e) {}
  }
  function setPlace(id, to){
    var def = DEFPLACE[id] || (id.indexOf('set:') === 0 ? 'profile' : 'more');
    if (LOCK.indexOf(id) > -1) return;
    if (to === 'bar' && place(id) !== 'bar'){
      var n = barIds().filter(function(x){ return x !== id && optInfo(x); }).length;
      if (n >= MAXBAR){ say('Bottom bar is full (max ' + MAXBAR + '). Move another option out of the bar first.'); return; }
    }
    if (sbGet(to) && place(id) !== to){
      var m = sideIds(to).filter(function(x){ return x !== id; }).length;
      if (m >= MAXSIDE){ say('This side bar is full (max ' + MAXSIDE + ').'); return; }
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
    if (on){ openedAt = Date.now(); if (kind === 'switch') drawSwitch(); else if (kind === 'manage') drawManage(); else if (kind === 'sbedit') drawSbEdit(); else drawSheet(); }
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
    if (t.closest('[data-backm]')){ openSheet(true, 'manage'); return; }
    if (t.closest('[data-sbadd]')){
      var nid = 'sb' + Date.now().toString(36).slice(-6), nn = sbList().length - 1;
      sbMut(function(l){ l.push({ id: nid, name: 'Side bar ' + nn, side: 'left', arrow: 'chev', top: 55 }); });
      editSb = nid; openSheet(true, 'sbedit'); return;
    }
    var se = t.closest('[data-sbedit]'); if (se){ editSb = se.dataset.sbedit; openSheet(true, 'sbedit'); return; }
    var sr = t.closest('[data-sbreset]'); if (sr){
      var rid = sr.dataset.sbreset;
      if (rid === 'left' || rid === 'right') sbMut(function(l){ l.forEach(function(x, n){ if (x.id === rid) l[n] = { id: rid, name: rid === 'left' ? '‹ Left' : 'Right ›', side: rid, arrow: 'chev', top: 34 }; }); });
      else {
        sbMut(function(l){ for (var n = l.length - 1; n >= 0; n--) if (l[n].id === rid) l.splice(n, 1); });
        Object.keys(cfg.place).forEach(function(k){ if (cfg.place[k] === rid) delete cfg.place[k]; });
        savePlace(); lastHtml = ''; draw(); say('Side bar deleted');
      }
      if (rid === 'left' || rid === 'right') openSheet(true, 'sbedit'); else openSheet(true, 'manage');
      return;
    }
    if (t.closest('[data-back]')){ openSheet(true); return; }
    var sw = t.closest('[data-sw]'); if (sw){ switchTo(sw.dataset.sw); return; }
    var ax = t.closest('[data-acx]'); if (ax){ saveAccts(accts().filter(function(x){ return x.id !== ax.dataset.acx; })); drawSwitch(); return; }
    if (t.closest('[data-addacc]')){ openSheet(false); if (typeof forceLogout === 'function') forceLogout(); return; }
    if (t.closest('[data-all]')){ openSheet(sheet.classList.contains('hidden')); return; }
    var g = t.closest('[data-go]'); if (!g) return;
    if (lpFired && g.dataset.go === 'profile'){ lpFired = false; return; }
    openSheet(false); navTo(g.dataset.go);
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
    vOff = off; Object.keys(sides).forEach(function(k){ sides[k].el.classList.toggle('hidden', off); });
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
  window.bbGet = function(){ try { var r = localStorage.getItem(KEY) || ''; if (!r) return ''; return JSON.stringify(stripPlace(JSON.parse(r) || {})); } catch (e) { return ''; } };
  window.bbSet = function(j){                       // design sent by the admin
    try { if (j) localStorage.setItem(KEY, JSON.stringify(stripPlace(JSON.parse(j) || {}))); else localStorage.removeItem(KEY); } catch (e) {}
    try { var pl = cfg.place; cfg = loadCfg(); cfg.place = pl; applyCfg(); lastHtml = ''; draw(); } catch (e) {}
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
    if (e.target.closest && e.target.closest('[data-bbfull]')){ var pl0 = cfg.place; cfg = JSON.parse(JSON.stringify(DEF)); cfg.place = pl0; saveCfg(); applyCfg(); lastHtml = ''; draw(); refreshView(); }
  });

  window.addEventListener('resize', function(){ requestAnimationFrame(function(){ gap(); moveInd(true); }); });
  applyCfg(); draw(); vis();
})();
