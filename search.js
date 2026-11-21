/* KS · Global search. A search box at the top; type anything -> results grouped by type; tap = that item opens.
   Read-only add-on: it only READS S.d / S.chat and then uses the normal screens (go, chatOpen …). Passwords: only the website title is searched / shown. */
(function(){
  'use strict';
  var top = document.getElementById('grpTop'); if (!top) return;
  var $ = function(s, r){ return (r || document).querySelector(s); };
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function navOk(v){ var b = $('#nav button[data-v="' + v + '"]'); return !!b && !b.classList.contains('hidden'); }   // same rules as the menu (permissions, AdGuard for Links …)
  function haveData(){ try { return !!(S && S.d && S.me); } catch (e) { return false; } }
  function T(q){ return String(q || '').toLowerCase().split(/\s+/).filter(Boolean); }
  function hit(h, t){ h = String(h || '').toLowerCase(); return t.every(function(k){ return h.indexOf(k) > -1; }); }
  function rank(title, t){ title = String(title || '').toLowerCase(); return title.indexOf(t[0]) === 0 ? 0 : title.indexOf(t[0]) > -1 ? 1 : 2; }
  function safe(fn, d){ try { return fn(); } catch (e) { return d; } }

  /* after the screen opens, scroll to the item and flash it */
  function flash(find){
    var n = 0; (function tryIt(){
      var el = safe(find, null);
      if (el){ try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} el.classList.add('gs-flash'); setTimeout(function(){ el.classList.remove('gs-flash'); }, 2200); return; }
      if (++n < 6) setTimeout(tryIt, 120);
    })();
  }
  function byAttr(sel, attr, id, up){
    var all = document.querySelectorAll(sel), r = null;
    [].forEach.call(all, function(e){ if (!r && (e.getAttribute(attr) || '').indexOf(id) > -1) r = e; });
    return r && up ? (r.closest(up) || r) : r;
  }

  /* ---------- what can be searched ---------- */
  var TYPES = [
    { k: 'page', lb: 'Pages', ic: '🧭', find: function(t){
        return (window.grpPages ? grpPages() : []).filter(function(p){ return hit(p.lb + ' ' + p.g, t); }).map(function(p){
          return { title: p.lb, sub: p.g, open: function(){ grpOpen(p.id); } }; });
    } },
    { k: 'cust', lb: 'Customers / Ledger', ic: '👤', gate: 'expenses', find: function(t){
        return (S.d.ledgerAccounts || []).filter(function(a){ return hit([a.name, a.type, a.phone, a.mobile, a.note].join(' '), t); }).map(function(a){
          return { title: a.name || 'Account', sub: a.type || 'Ledger', open: function(){ S.exp.tab = 'lg'; S.exp.acc = a.id; go('expenses'); } }; });
    } },
    { k: 'lic', lb: 'LIC policies', ic: '🛡️', gate: 'lic', find: function(t){
        return (S.d.lic || []).filter(function(x){ return safe(function(){ var h = licHay(x); return t.every(function(k){ return h.hay.indexOf(k) > -1; }); }, false); }).map(function(x){
          return { title: x.name || x.policyNo || 'Policy', sub: [x.policyNo, x.phone].filter(Boolean).join(' · '), open: function(){
            S.lic.q = x.policyNo || x.name || ''; S.lic.g = ''; S.lic.s = ''; S.lic.t = ''; S.lic.open = {}; S.lic.open[x.id] = true; go('lic');
            flash(function(){ return byAttr('details.lic-acc', 'data-id', x.id); });
          } }; });
    } },
    { k: 'vcs', lb: 'Complaints', ic: '📋', gate: 'vcs', find: function(t){
        return (S.d.vcs || []).filter(function(x){ return hit([x.title, x.details, x.log, x.toName, x.byName, x.status].join(' '), t); }).map(function(x){
          return { title: x.title || 'Complaint', sub: [(VCS_ICON[x.status] || '') + ' ' + x.status, x.toName ? '→ ' + x.toName : ''].filter(Boolean).join(' · '), open: function(){
            if (x.status === 'Closed') vcsState().openPrev = true;
            go('vcs');
            flash(function(){ return byAttr('[data-vcs][data-id], [onclick*="vcsReopen"]', x.status === 'Closed' ? 'onclick' : 'data-id', x.id, '.card'); });
          } }; });
    } },
    { k: 'exp', lb: 'Expenses', ic: '💸', gate: 'expenses', find: function(t){
        return (S.d.expenses || []).filter(function(x){ return hit([x.note, x.category, x.amount, x.date, safe(function(){ return fmtDateNice(x.date); }, '')].join(' '), t); })
          .sort(function(a, b){ return String(b.date).localeCompare(String(a.date)); }).map(function(x){
          var inc = safe(function(){ return catType(x.category) === 'Income'; }, false);
          return { title: x.note || x.category || 'Entry', sub: [safe(function(){ return fmtDateNice(x.date); }, x.date), x.category, (inc ? '+' : '−') + safe(function(){ return fm(x.amount); }, x.amount)].join(' · '), open: function(){
            S.exp.tab = 'tx'; S.exp.cat = 'all'; S.exp.q = ''; S.exp.month = +String(x.date).slice(5, 7) || 'all'; go('expenses');
            flash(function(){ return byAttr('tr button[onclick*="entryForm"]', 'onclick', "'" + x.id + "'", 'tr'); });
          } }; });
    } },
    { k: 'work', lb: 'Work', ic: '🛠️', gate: 'work', find: function(t){
        return (S.d.work || []).filter(function(x){ return hit([x.name, x.product, x.number, x.sticker, x.desc, x.date].join(' '), t); })
          .sort(function(a, b){ return String(b.date).localeCompare(String(a.date)); }).map(function(x){
          return { title: x.name || x.product || 'Work entry', sub: [x.date, x.product, x.number].filter(Boolean).join(' · '), open: function(){
            S.wf = defaultWf(); S.wf.only = false; S.wf.q = x.name || x.product || x.number || x.sticker || ''; S.wy = +String(x.date).slice(0, 4) || S.wy; go('work');
          } }; });
    } },
    { k: 'link', lb: 'Links', ic: '🔗', gate: 'links', find: function(t){
        return (S.d.links || []).filter(function(x){ return hit([x.name, x.link, x.type].join(' '), t); }).map(function(x){
          return { title: x.name || x.link || 'Link', sub: [x.type, x.link].filter(Boolean).join(' · '), open: function(){ S.link.q = x.name || x.link || ''; S.link.type = 'all'; go('links'); } }; });
    } },
    { k: 'pw', lb: 'Passwords (title only)', ic: '🔑', gate: 'passwords', find: function(t){
        return (S.d.passwords || []).filter(function(x){ return hit(x.url, t); }).map(function(x){      // ONLY the title (website) — never the user ID or password
          return { title: x.url || 'Login', sub: '', open: function(){ S.pw.q = x.url || ''; go('passwords'); } }; });
    } },
    { k: 'chat', lb: 'Chat', ic: '💬', gate: 'chat', find: function(t){
        var c = S.chat || {}, out = [];
        (c.users || []).forEach(function(u){ if (hit([u.name, u.username].join(' '), t)) out.push({ title: u.name || u.username, sub: u.username ? '@' + u.username : '', open: function(){ go('chat'); chatOpen(u.id); } }); });
        (c.groups || []).forEach(function(g){ if (hit(g.name, t)) out.push({ title: '👥 ' + (g.name || 'Group'), sub: 'Group', open: function(){ go('chat'); chatOpen(g.id); } }); });
        return out;
    } }
  ];

  /* ---------- UI ---------- */
  var pill = document.createElement('button'); pill.type = 'button'; pill.id = 'gsPill'; pill.setAttribute('aria-label', 'Search');
  pill.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg><span>Search customer, complaint, expense, link…</span>';
  top.insertBefore(pill, top.firstChild);

  var ov = document.createElement('div'); ov.id = 'gsOv'; ov.className = 'hidden';
  ov.innerHTML = '<div class="gs-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg>' +
    '<input id="gsQ" type="search" placeholder="Search anything…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"><button type="button" class="gs-x" aria-label="Close">✕</button></div><div class="gs-body" id="gsBody"></div>';
  document.body.appendChild(ov);
  var inp = $('#gsQ', ov), body = $('#gsBody', ov), results = [], expanded = {}, LIMIT = 5;

  var RK = 'ks_gs_recent';
  function recents(){ try { var a = JSON.parse(localStorage.getItem(RK) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveRecent(q){
    q = (q || '').trim(); if (!q) return;
    try { var a = recents().filter(function(x){ return x !== q; }); a.unshift(q); localStorage.setItem(RK, JSON.stringify(a.slice(0, 6))); } catch (e) {}
  }
  function hl(text, t){
    var s = esc(text); if (!t.length) return s;
    t.slice().sort(function(a, b){ return b.length - a.length; }).forEach(function(k){
      var re = new RegExp('(' + esc(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![^<]*>)', 'ig'); s = s.replace(re, '<mark>$1</mark>');
    });
    return s;
  }
  function run(){
    var q = inp.value, t = T(q);
    if (!t.length){ results = []; var rc = recents();
      body.innerHTML = '<div class="gs-hint">Type a name, complaint, task, expense, link or a chat name.<br><small>Passwords: only the website title is searched — never the password.</small></div>' +
        (rc.length ? '<div class="gs-h">Recent</div><div class="gs-rec">' + rc.map(function(r){ return '<button type="button" data-rc="' + esc(r) + '">🕘 ' + esc(r) + '</button>'; }).join('') + '</div>' : '');
      return; }
    if (!haveData()){ body.innerHTML = '<div class="gs-hint">Data is still loading…</div>'; return; }
    results = []; var h = '', total = 0;
    TYPES.forEach(function(ty){
      if (ty.gate && !navOk(ty.gate)) return;
      var list = safe(function(){ return ty.find(t); }, []);
      if (!list.length) return;
      list.sort(function(a, b){ return rank(a.title, t) - rank(b.title, t); });
      total += list.length;
      var all = !!expanded[ty.k], shown = all ? list : list.slice(0, LIMIT);
      h += '<div class="gs-h"><span>' + ty.ic + ' ' + esc(ty.lb) + '</span><b>' + list.length + '</b></div><div class="gs-card">';
      shown.forEach(function(r){
        var i = results.push(r) - 1;
        h += '<button type="button" class="gs-r" data-i="' + i + '"><span class="gs-t">' + hl(r.title, t) + '</span>' + (r.sub ? '<small>' + hl(r.sub, t) + '</small>' : '') + '<i aria-hidden="true">›</i></button>';
      });
      if (!all && list.length > LIMIT) h += '<button type="button" class="gs-more" data-more="' + ty.k + '">Show all ' + list.length + '</button>';
      h += '</div>';
    });
    body.innerHTML = h || '<div class="gs-hint">Nothing found for “' + esc(q.trim()) + '”.</div>';
  }
  var tm = 0; inp.addEventListener('input', function(){ clearTimeout(tm); expanded = {}; tm = setTimeout(run, 90); });

  var isOpen = false;
  function openSearch(){
    if (isOpen) return; isOpen = true; ov.classList.remove('hidden'); document.body.classList.add('gs-open');
    inp.value = ''; expanded = {}; run(); setTimeout(function(){ try { inp.focus(); } catch (e) {} }, 30);
  }
  function closeSearch(){ if (!isOpen) return; isOpen = false; ov.classList.add('hidden'); document.body.classList.remove('gs-open'); try { inp.blur(); } catch (e) {} }
  pill.addEventListener('click', openSearch);
  ov.addEventListener('click', function(e){
    var t = e.target;
    if (t.closest('.gs-x')){ closeSearch(); return; }
    var m = t.closest('[data-more]'); if (m){ expanded[m.dataset.more] = 1; run(); return; }
    var rc = t.closest('[data-rc]'); if (rc){ inp.value = rc.dataset.rc; run(); inp.focus(); return; }
    var r = t.closest('[data-i]'); if (r){ pick(results[+r.dataset.i]); }
  });
  function pick(r){ if (!r) return; saveRecent(inp.value); closeSearch(); setTimeout(function(){ try { r.open(); } catch (e) { try { toast('Could not open this item', true); } catch (x) {} } }, 30); }
  inp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); pick(results[0]); } else if (e.key === 'Escape') closeSearch(); });

  /* phone Back button / edge swipe closes the search first */
  var prev = window.bbCloseTop;
  window.bbCloseTop = function(){ if (isOpen){ closeSearch(); return true; } return prev ? prev() : false; };
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && isOpen) closeSearch();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !$('#app').classList.contains('hidden')){ e.preventDefault(); openSearch(); }
  });
  window.gsOpen = openSearch;
})();
