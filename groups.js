/* KS · Group menu: bottom bar = 6 groups (+ Admin for admins). Tap a group -> small sub-tabs on top, the old tabs run inside.
   Pure add-on: reads the existing side menu (#nav) and S / go / DEP from app.js. The old floating bar (bottom-bar.js) stays loaded
   but hidden (groups.css) — its colours / sizes / "My layout" still drive this bar through the same CSS variables. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var app = $('#app'), nav = $('#nav'), main = $('main'); if (!app || !nav || !main) return;

  /* ---------- the groups (edit here to change the menu) ---------- */
  var GROUPS = [
    { id: 'today', lb: 'Aaj',   ic: 'sun',    items: [['dashboard', 'Dashboard'], ['everyday', 'Everyday Task'], ['timetable', 'Time Table'], ['attendance', 'Attendance']] },
    { id: 'work',  lb: 'Kaam',  ic: 'case',   items: [['work', 'Work'], ['vcs', 'VCS Complaint'], ['rack', 'Rack Mapping']] },
    { id: 'money', lb: 'Paisa', ic: 'wallet', items: [['expenses', 'Expenses'], ['lic', 'LIC'], ['pay', 'Plans & Payments']] },
    { id: 'talk',  lb: 'Baat',  ic: 'chat',   items: [['chat', 'Chat'], ['mail', 'Mail'], ['whatsapp', 'WhatsApp'], ['stocks', 'Stocks'], ['aitab', 'AI'], ['telegram', 'Telegram']] },
    { id: 'vault', lb: 'Vault', ic: 'lock',   items: [['passwords', 'Passwords'], ['links', 'Links'], ['websites', 'Websites']] },
    { id: 'tools', lb: 'Tools', ic: 'grid',   items: [['pic2pdf', 'Pic2PDF'], ['pdf2pics', 'PDF2Pics'], ['ftp', 'FTP'], ['statuses', 'Status Saver'], ['music', 'Music'], ['youtube', 'YouTube']] },
    { id: 'admin', lb: 'Admin', ic: 'shield', admin: true, items: [['logins', 'Logins'], ['deploy', 'Deploy'], ['updates', 'Updates'], ['version', 'Version'], ['config', 'Config'], ['settings', 'Settings']] }
  ];
  var SV = function(p){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var ICON = {
    sun: SV('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>'),
    case: SV('<rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18"/>'),
    wallet: SV('<rect x="3" y="6.5" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M16 15h2"/>'),
    chat: SV('<path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.3A7.5 7.5 0 1 1 20.5 11.5z"/><path d="M9 10.5h6M9 13.5h4"/>'),
    lock: SV('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>'),
    grid: SV('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
    shield: SV('<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>')
  };
  function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- what can this user open? ---------- */
  function me(){ try { return S.me || null; } catch (e) { return null; } }
  function navBtn(id){ return nav.querySelector('button[data-v="' + id + '"]'); }
  function avail(id){
    var m = me(); if (!m) return false;
    var b = navBtn(id); if (!b) return false;
    if (b.classList.contains('th-off')) return false;                      // hidden by the user in Appearance › menu
    if (m.primary && (id === 'version' || id === 'updates')) return true;   // for the main admin these two live inside Deploy (nav buttons are hidden)
    return !b.classList.contains('hidden');
  }
  function itemsOf(g){ return g.items.filter(function(it){ return avail(it[0]); }); }
  function visibleGroups(){
    var m = me(); if (!m) return [];
    return GROUPS.filter(function(g){ return (!g.admin || m.role === 'admin') && itemsOf(g).length; });
  }
  function curItem(){
    var v = ''; try { v = S.view || ''; if (v === 'deploy') v = DEP.tab || 'deploy'; } catch (e) {}
    return v;
  }
  function groupOf(id){ for (var i = 0; i < GROUPS.length; i++) for (var j = 0; j < GROUPS[i].items.length; j++) if (GROUPS[i].items[j][0] === id) return GROUPS[i]; return null; }

  /* ---------- last tab used in each group ---------- */
  var LK = 'ks_grp_last';
  function lastMap(){ try { var o = JSON.parse(localStorage.getItem(LK) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function remember(g, id){ try { var o = lastMap(); if (o[g] === id) return; o[g] = id; localStorage.setItem(LK, JSON.stringify(o)); } catch (e) {} }

  /* ---------- go ---------- */
  function openItem(id){
    var m = me(); if (!m) return;
    var g = groupOf(id); if (g) remember(g.id, id);
    if (id === 'deploy'){ try { DEP.tab = 'deploy'; } catch (e) {} go('deploy'); }
    else if ((id === 'version' || id === 'updates') && m.primary){ go('deploy'); if (typeof depTab === 'function') depTab(id); }
    else go(id);
    setTimeout(function(){ if (window.grpRedraw) grpRedraw(); }, 0);
  }
  function openGroup(gid){
    var g = GROUPS.filter(function(x){ return x.id === gid; })[0]; if (!g) return;
    var list = itemsOf(g); if (!list.length) return;
    var cur = curItem();
    if (list.some(function(it){ return it[0] === cur; })){ window.scrollTo(0, 0); return; }   // already inside this group
    var last = lastMap()[gid], pick = list.filter(function(it){ return it[0] === last; })[0] || list[0];
    openItem(pick[0]);
  }

  /* ---------- the bars ---------- */
  var bar = document.createElement('nav'); bar.id = 'grpBar'; bar.setAttribute('aria-label', 'Main');
  var tabs = document.createElement('div'); tabs.id = 'grpTabs'; tabs.className = 'hidden'; tabs.setAttribute('role', 'tablist');
  var top = document.createElement('div'); top.id = 'grpTop';          // sticky header: global search + sub-tabs
  top.appendChild(tabs);
  document.body.appendChild(bar);
  main.insertBefore(top, main.firstChild);

  function chatBadge(){
    var cb = $('#chatBadge'); if (!cb || cb.classList.contains('hidden')) return '';
    var t = cb.textContent.trim(); return t && t !== '0' ? '<em>' + esc(t) + '</em>' : '';
  }
  function iconHtml(id){
    var b = navBtn(id), i = b && b.querySelector('.ico'); if (!i) return '•';
    return i.querySelector('img') ? i.innerHTML : esc(i.textContent || '•');
  }
  var lastBar = '', lastTabs = '';
  function draw(){
    var gs = visibleGroups(), cur = curItem(), cg = groupOf(cur), h = '', badge = chatBadge();
    gs.forEach(function(g, k){
      h += '<button type="button" style="--k:' + k + '" data-g="' + g.id + '" class="' + (cg && cg.id === g.id ? 'on' : '') + '"><span class="bi">' + ICON[g.ic] + (g.id === 'talk' ? badge : '') + '</span><small>' + esc(g.lb) + '</small></button>';
    });
    if (h !== lastBar){ bar.innerHTML = h; lastBar = h; }
    bar.dataset.n = gs.length;

    var th = '', list = (cg && gs.indexOf(cg) > -1) ? itemsOf(cg) : [];
    if (list.length > 1) list.forEach(function(it){
      th += '<button type="button" role="tab" data-t="' + it[0] + '" class="' + (it[0] === cur ? 'on' : '') + '" aria-selected="' + (it[0] === cur) + '"><span class="ti">' + iconHtml(it[0]) + '</span>' + esc(it[1]) + (it[0] === 'chat' ? chatBadge() : '') + '</button>';
    });
    if (th !== lastTabs){
      var keep = tabs.scrollLeft; tabs.innerHTML = th; lastTabs = th; tabs.scrollLeft = keep;
    }
    tabs.classList.toggle('hidden', !th);
    var on = tabs.querySelector('button.on');
    if (on && tabs.dataset.seen !== cur){ tabs.dataset.seen = cur; try { on.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {} }
    document.body.classList.toggle('has-grptabs', !!th);
    syncVars(); drawMe();
  }

  /* the old bar's design (size / font / colours, "My layout") keeps working: copy its CSS variables */
  function syncVars(){
    var old = $('#btmBar'); if (!old) return;
    ['--bb-s', '--bb-fs', '--bb-ic', '--bb-r', '--bb-bg', '--bb-tx', '--bb-on'].forEach(function(k){
      var v = old.style.getPropertyValue(k); if (v) bar.style.setProperty(k, v); else bar.style.removeProperty(k);
    });
    bar.classList.toggle('nolab', old.classList.contains('nolab'));
    var on = old.style.getPropertyValue('--bb-on');
    if (on) tabs.style.setProperty('--bb-on', on); else tabs.style.removeProperty('--bb-on');
  }

  /* ---------- Profile: round picture button in the top bar (long-press = switch user) ---------- */
  var meBtn = document.createElement('button'); meBtn.type = 'button'; meBtn.id = 'grpMe'; meBtn.setAttribute('aria-label', 'Profile');
  var meHtml = '';
  function placeMe(){
    var act = $('.topbar .actions'); if (act && meBtn.parentNode !== act) act.insertBefore(meBtn, act.firstChild);
  }
  function drawMe(){
    placeMe();
    var m = me() || {}, src = '', nm = (m.name || m.username || 'U').trim().charAt(0).toUpperCase() || 'U';
    try { if (m.id && typeof avSrc === 'function') src = avSrc(m.id) || ''; } catch (e) {}
    var h = src ? '<span style="background-image:url(&quot;' + esc(src) + '&quot;)"></span>' : '<span>' + esc(nm) + '</span>';
    if (h !== meHtml){ meBtn.innerHTML = h; meHtml = h; }
    var v = ''; try { v = S.view; } catch (e) {}
    meBtn.classList.toggle('on', v === 'profile');
  }
  var lp = null, lpFired = false;
  meBtn.addEventListener('pointerdown', function(){
    lpFired = false; clearTimeout(lp);
    lp = setTimeout(function(){ lpFired = true; try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) {} if (window.bbSwitch) bbSwitch(); }, 520);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(n){ meBtn.addEventListener(n, function(){ clearTimeout(lp); }); });
  meBtn.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  meBtn.addEventListener('click', function(){ if (lpFired){ lpFired = false; return; } if (typeof go === 'function') go('profile'); });

  bar.addEventListener('click', function(e){ var b = e.target.closest('[data-g]'); if (b) openGroup(b.dataset.g); });
  tabs.addEventListener('click', function(e){ var b = e.target.closest('[data-t]'); if (b) openItem(b.dataset.t); });

  /* redraw when the menu, the page or the chat badge changes */
  var t = 0, run = function(){ cancelAnimationFrame(t); t = requestAnimationFrame(draw); };
  new MutationObserver(run).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'], childList: true });
  var cb = $('#chatBadge'); if (cb) new MutationObserver(run).observe(cb, { attributes: true, childList: true, characterData: true, subtree: true });
  var v = $('#view'); if (v) new MutationObserver(run).observe(v, { childList: true });
  var old = $('#btmBar'); if (old) new MutationObserver(run).observe(old, { attributes: true, attributeFilter: ['style', 'class'] });
  new MutationObserver(run).observe(app, { attributes: true, attributeFilter: ['class'] });
  window.grpRedraw = run;
  window.grpOpen = openItem;                                              // used by the global search
  window.grpPages = function(){ var o = []; visibleGroups().forEach(function(g){ itemsOf(g).forEach(function(it){ o.push({ id: it[0], lb: it[1], g: g.lb }); }); }); return o; };
  draw();
})();
