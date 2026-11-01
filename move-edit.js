/* AKS_VCS · Move & Edit
   Settings > Move & Edit lets you
     1) MOVE any Settings option (a whole card such as "Expense categories") or any single
        "Data & export" option (Attendance / Ledger / Work / All data, each with Excel + PDF)
        onto any page: Dashboard, Attendance, Expenses, Work, Time Table, ...
     2) RENAME every option (icon + name).
   Everything is saved on THIS device (localStorage key ks_move_v1). */
(function(){
  'use strict';
  var LS = 'ks_move_v1';
  var PAGES = ['dashboard', 'attendance', 'expenses', 'work', 'timetable', 'vcs', 'rack', 'passwords', 'links', 'lic', 'updates'];
  var NOMOVE = { move:1, vcsproc:1 };            // Move & Edit itself must stay in Settings; the live monitor only works inside Settings
  var BIND = { general:'set', security:'set', status:'set', activity:'set', theme:'theme', bio:'bio', drive:'drive', hist:'hist', trash:'trash', dchat:'dchat', login:'login' };
  var ORIG = null;

  /* ---------- saved config ---------- */
  function load(){ var c = {}; try { c = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) {} c.place = c.place || {}; c.name = c.name || {}; return c; }
  function save(c){ try { localStorage.setItem(LS, JSON.stringify(c)); } catch (e) { try { toast('Could not save on this device', true); } catch (x) {} } }
  var esc = function(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  var note = function(m, bad){ try { toast(m, bad); } catch (e) {} };
  var pageName = function(v){ return v === 'settings' ? 'Settings' : (typeof TITLES !== 'undefined' && TITLES[v] ? TITLES[v][0] : v); };
  var placeOf = function(id){ var p = load().place[id]; return p && p !== 'settings' ? p : 'settings'; };

  /* ---------- hooks used by app.js ---------- */
  window.mvName = function(id, t, s){ var o = load().name[id] || {}; return { t:o.t || t, s:o.s || s }; };
  window.mvKeep = function(id){ return placeOf(id) === 'settings'; };

  function origDefs(){ if (!ORIG){ ORIG = {}; for (var k in SET_DEF) ORIG[k] = SET_DEF[k].slice(); } return ORIG; }
  function keyed(grid){                       // same key detection as settingsHub()
    var found = {}, out = [];
    [].slice.call(grid.children).forEach(function(c, i){
      var t = ((c.querySelector('h3') || {}).textContent || '').trim();
      var m = SET_MATCH.find(function(x){ return t.indexOf(x[1]) > -1; });
      var k = m && !found[m[0]] ? m[0] : 'x' + i; found[k] = 1; out.push({ k:k, el:c });
    });
    return out;
  }
  function applyDefs(){                       // renamed tiles / headers for the Settings hub
    var O = origDefs(), c = load();
    for (var k in O){ var o = c.name['sec:' + k], d = O[k].slice(); if (o){ if (o.i) d[0] = o.i; if (o.t) d[1] = o.t; } SET_DEF[k] = d; }
  }
  window.mvFilter = function(grid){           // called by vSettings() before the hub is built
    applyDefs();
    keyed(grid).forEach(function(o){ if (!NOMOVE[o.k] && placeOf('sec:' + o.k) !== 'settings') o.el.remove(); });
  };
  function setH3(card, k){                    // put the new name in a card's heading
    var o = load().name['sec:' + k], h = card.querySelector('h3'); if (!o || !h) return;
    var txt = ((o.i ? o.i + ' ' : '') + (o.t || '')).trim() + ' ';
    var n = [].slice.call(h.childNodes).find(function(x){ return x.nodeType === 3 && x.textContent.trim(); });
    if (n) n.textContent = txt; else h.insertBefore(document.createTextNode(txt), h.firstChild);
  }
  window.mvCard = function(){                 // placeholder; filled in after render (it needs the full card list)
    return '<div class="card" id="mvCard"><h3>🧭 Move & Edit</h3><div id="mvBody" class="muted">Loading…</div></div>';
  };

  /* ---------- the Move & Edit screen ---------- */
  function pageOpts(sel){
    var h = '<option value="settings"' + (sel === 'settings' ? ' selected' : '') + '>⚙️ Settings (default)</option>';
    PAGES.forEach(function(v){ if (typeof TITLES !== 'undefined' && TITLES[v]) h += '<option value="' + v + '"' + (sel === v ? ' selected' : '') + '>' + esc(pageName(v)) + ' page</option>'; });
    return h;
  }
  function row(id, label, sub, movable){
    var pl = placeOf(id), ed = !!load().name[id];
    return '<div class="mv-row" data-id="' + esc(id) + '">' +
      '<input class="input mv-name" value="' + esc(label) + '" maxlength="48" aria-label="Name">' +
      (movable ? '<select class="select mv-pg" aria-label="Move to page">' + pageOpts(pl) + '</select>' : '<span class="muted mv-fix">Always in Settings</span>') +
      '<button type="button" class="btn ghost sm mv-rs" title="Reset name and place"' + ((ed || pl !== 'settings') ? '' : ' disabled') + '>↺</button>' +
      (sub ? '<small class="mv-sub">' + esc(sub) + '</small>' : '') + '</div>';
  }
  function fill(){
    var body = document.getElementById('mvBody'); if (!body) return;
    var O = origDefs(), c = load(), h = '';
    var secs = keyed(vSettingsGrid()).filter(function(o){ return !/^x\d+$/.test(o.k); });
    h += '<p class="muted" style="margin-bottom:12px">Choose the page where each option should appear, and rename it. The option disappears from Settings and shows at the top of that page. Saved on this phone.</p>';
    h += '<div class="sec-title">Export options <span class="muted" style="text-transform:none;letter-spacing:0">(from Data &amp; export)</span></div>';
    var ex = exportItems();
    h += ex.length ? ex.map(function(x){ var n = mvName('ex:' + x[0], x[1], x[2]); return row('ex:' + x[0], n.t, x[2], true); }).join('') : '<div class="muted" style="margin-bottom:8px">No export options available for your account.</div>';
    h += '<div class="sec-title" style="margin-top:16px">Settings options</div>';
    h += secs.map(function(o){
      var d = O[o.k] || ['•', o.k, ''], s = c.name['sec:' + o.k] || {};
      var label = ((s.i || d[0]) + ' ' + (s.t || d[1])).trim();
      return row('sec:' + o.k, label, d[2], !NOMOVE[o.k]);
    }).join('');
    h += '<div style="margin-top:14px"><button type="button" class="btn soft sm" id="mvResetAll">↺ Reset everything to default</button></div>';
    body.className = ''; body.innerHTML = h;
  }
  function splitIcon(v){                      // "🗓️ Attendance" -> icon + name
    v = String(v || '').trim(); var m = v.match(/^(\S+)\s+(.+)$/);
    if (m && !/[\p{L}\p{N}]/u.test(m[1])) return { i:m[1], t:m[2].trim() };
    return { i:'', t:v };
  }
  function commitName(id, val, defLabel){
    var c = load(), v = String(val || '').trim();
    if (!v || v === defLabel){ delete c.name[id]; }
    else if (id.indexOf('sec:') === 0){ var p = splitIcon(v); c.name[id] = { i:p.i, t:p.t }; }
    else c.name[id] = { t:v };
    save(c);
  }
  function defLabel(id){
    var O = origDefs();
    if (id.indexOf('sec:') === 0){ var d = O[id.slice(4)]; return d ? (d[0] + ' ' + d[1]) : ''; }
    var x = exportItems().find(function(y){ return 'ex:' + y[0] === id; }); return x ? x[1] : '';
  }
  document.addEventListener('change', function(e){
    var t = e.target; if (!t || !t.closest) return; var r = t.closest('.mv-row'); if (!r || !r.closest('#mvBody')) return;
    var id = r.dataset.id, c;
    if (t.classList.contains('mv-name')){
      commitName(id, t.value, defLabel(id)); note('Name saved ✓');
    } else if (t.classList.contains('mv-pg')){
      c = load(); if (t.value === 'settings') delete c.place[id]; else c.place[id] = t.value; save(c);
      note(t.value === 'settings' ? 'Moved back to Settings ✓' : 'Moved to ' + pageName(t.value) + ' page ✓');
    } else return;
    var rs = r.querySelector('.mv-rs'); if (rs){ var c2 = load(); rs.disabled = !(c2.name[id] || c2.place[id]); }
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.mv-rs'); var all = e.target.closest && e.target.closest('#mvResetAll');
    if (all){
      if (!confirm('Reset all names and put every option back in Settings?')) return;
      save({ place:{}, name:{} }); fill(); note('Everything reset ✓'); return;
    }
    if (!b || !b.closest('#mvBody')) return;
    var id = b.closest('.mv-row').dataset.id, c = load(); delete c.place[id]; delete c.name[id]; save(c); fill(); note('Reset ✓');
  });
  window.mvBack = function(id){ var c = load(); delete c.place[id]; save(c); render(); note('Moved back to Settings ✓'); };

  /* ---------- show moved options on their new page ---------- */
  function callBind(kind){
    try {
      var r;
      if (kind === 'set') r = bindSettings();
      else if (kind === 'theme') r = bindTheme();
      else if (kind === 'bio') r = bindBio();
      else if (kind === 'drive') r = bindDrive();
      else if (kind === 'hist') r = bindHist();
      else if (kind === 'trash') r = bindTrash();
      else if (kind === 'dchat') r = bindDchat();
      else if (kind === 'login' && window.lcBind) r = lcBind();
      if (r && r.catch) r.catch(function(){});
    } catch (e) { console.warn('Move & Edit bind', kind, e); }
  }
  function onPage(view){
    var c = load(), v = document.getElementById('view'); if (!v) return;
    var old = document.getElementById('mvMoved'); if (old) old.remove();
    var ids = Object.keys(c.place).filter(function(id){ return c.place[id] === view; });
    if (!ids.length) return;
    var html = '', exIds = ids.filter(function(i){ return i.indexOf('ex:') === 0; }), secIds = ids.filter(function(i){ return i.indexOf('sec:') === 0; });
    if (exIds.length){
      var items = exportItems().filter(function(x){ return exIds.indexOf('ex:' + x[0]) > -1; });
      if (items.length) html += '<div class="card mv-card"><div class="exgrid">' + items.map(function(x){
        return exportRow(x).replace('</div></div>', '<button type="button" class="btn ghost sm" title="Move back to Settings" onclick="mvBack(\'ex:' + x[0] + '\')">↩</button></div></div>');
      }).join('') + '</div></div>';
    }
    var cards = [];
    if (secIds.length){
      var grid = vSettingsGrid(), K = keyed(grid);
      secIds.forEach(function(id){
        var k = id.slice(4), o = K.find(function(z){ return z.k === k; }); if (!o || NOMOVE[k]) return;
        setH3(o.el, k); o.el.classList.add('mv-sec'); o.el.setAttribute('data-mvk', k);
        var tag = document.createElement('div'); tag.className = 'mv-tag';
        tag.innerHTML = '📌 Moved from Settings <button type="button" class="linkbtn" onclick="mvBack(\'' + id + '\')">↩ Move back</button>';
        o.el.insertBefore(tag, o.el.firstChild); cards.push(k);
      });
      cards.forEach(function(k){ html += K.find(function(z){ return z.k === k; }).el.outerHTML; });
    }
    if (!html) return;
    v.insertAdjacentHTML('afterbegin', '<div id="mvMoved">' + html + '</div>');
    var saved = S.setSec, did = {};
    cards.forEach(function(k){ var kind = BIND[k]; if (!kind || did[kind]) return; did[kind] = 1; S.setSec = k; callBind(kind); });
    S.setSec = saved;
    try { if (window.applyRO) applyRO(document.getElementById('mvMoved')); } catch (e) {}
  }
  function onSettings(){
    if (document.getElementById('mvCard')) fill();
    document.querySelectorAll('.set-detail [data-sec]').forEach(function(c){ setH3(c, c.dataset.sec); });
  }

  /* ---------- wrap render() ---------- */
  function install(){
    if (typeof window.render !== 'function' || window.render.__mv) return;
    var orig = window.render;
    var w = function(){
      var r = orig.apply(this, arguments);
      try { if (typeof S !== 'undefined' && S.d){ if (S.view === 'settings') onSettings(); else onPage(S.view); } } catch (e) { console.error('Move & Edit', e); }
      return r;
    };
    w.__mv = 1; window.render = w;
  }
  install();

  /* ---------- look ---------- */
  var st = document.createElement('style');
  st.textContent =
    '.mv-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;padding:10px;border:1px solid var(--line);border-radius:14px;background:var(--card)}' +
    '.mv-row .mv-name{flex:1 1 180px;min-width:0}' +
    '.mv-row .mv-pg{flex:1 1 170px;width:auto;min-width:0}' +
    '.mv-row .mv-fix{flex:1 1 170px;font-size:calc(13px*var(--fs))}' +
    '.mv-row .mv-sub{flex-basis:100%;color:var(--muted);font-size:calc(12px*var(--fs))}' +
    '#mvMoved{display:grid;gap:16px;margin-bottom:16px}' +
    '#mvMoved>.card{margin:0}' +
    '.mv-tag{display:flex;gap:10px;align-items:center;justify-content:space-between;font-size:calc(12px*var(--fs));color:var(--muted);margin-bottom:8px}' +
    '.mv-card .exitem .actions{display:flex;gap:6px;align-items:center}';
  document.head.appendChild(st);
})();
