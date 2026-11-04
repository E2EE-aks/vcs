/* KS · Websites tab (All Options › Websites): your own list of website shortcuts.
   Tap a name to open the site; ＋ adds a link; ✏️ edits; 🗑 deletes.  The list is saved in your Google Sheet (per user) and kept on this phone for fast start. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var KEY = 'ks_sites_v1';
  var W = { list:[], form:null, q:'' };   // form: null | { i:-1|index, name, url, err }
  try { W.list = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch(e){ W.list = []; }
  /* The list lives in the Google Sheet (per user), so every phone shows the same websites. This phone keeps a copy for fast / offline start. */
  var sv = { t:null, busy:false, again:false, loaded:false, loading:false, err:'' };
  function cache(){ try { localStorage.setItem(KEY, JSON.stringify(W.list)); } catch(e){} }
  function haveSession(){ try { return typeof S !== 'undefined' && !!S.token && typeof callServer === 'function'; } catch(e){ return false; } }
  function flush(){
    if (!haveSession()) return;
    if (sv.busy){ sv.again = true; return; }
    sv.busy = true; sv.again = false;
    callServer({ action:'websitesSave', token:S.token, list:W.list }).then(function(j){
      if (!j || !j.ok) throw new Error((j && j.error) || 'Could not save'); sv.err = '';
    }).catch(function(e){ sv.err = (e && e.message) || 'Could not save to the server'; try { toast('Websites could not be saved to Google Sheet: ' + sv.err, true); } catch(x){} })
      .then(function(){ sv.busy = false; if (sv.again) flush(); status(); });
  }
  function save(){ cache(); status(); clearTimeout(sv.t); sv.t = setTimeout(flush, 300); }
  function status(){ var el = $('#wsSt'); if (!el) return; el.textContent = sv.err ? '⚠ Not saved to Google Sheet — ' + sv.err : (sv.busy || sv.t ? 'Saving…' : (sv.loaded ? '✓ Saved in your Google Sheet · same on every phone' : '')); el.style.color = sv.err ? '#c62828' : '#77778a'; }
  function pull(){
    if (!haveSession() || sv.loading) return; sv.loading = true;
    callServer({ action:'websitesGet', token:S.token }).then(function(j){
      sv.loading = false; if (!j || !j.ok) throw new Error((j && j.error) || 'Could not load');
      sv.loaded = true; sv.err = '';
      if (sv.t || sv.busy) return status();                                      // I just changed something: keep mine
      var mig = ''; try { mig = localStorage.getItem(KEY + '_moved') || ''; } catch(e){}
      if ((j.list || []).length || mig){ W.list = j.list || []; cache(); }
      else if (W.list.length){ try { localStorage.setItem(KEY + '_moved', '1'); } catch(e){} flush(); }   // first time: this phone's old list moves to the Google Sheet
      else { try { localStorage.setItem(KEY + '_moved', '1'); } catch(e){} }
      if (!W.form) draw(); else status();
    }).catch(function(e){ sv.loading = false; sv.err = (e && e.message) || 'Could not reach the server'; status(); });
  }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  try { TITLES.websites = ['Websites', 'Your saved website links']; } catch(e){}
  try { NAV_GRP.websites = 'Workspace'; } catch(e){}

  var css = document.createElement('style');
  css.textContent = [
    '#wsRoot{color:#1b1b1f}',
    '#wsRoot .ws-top{display:flex;gap:8px;margin-bottom:12px}',
    '#wsRoot .ws-top input{flex:1;min-width:0;border:1px solid #d8d8de;border-radius:12px;padding:11px 14px;font-size:15px;background:#fff;color:#1b1b1f}',
    '#wsRoot .ws-btn{border:0;border-radius:12px;padding:0 16px;font-weight:700;font-size:14px;background:#5b3df5;color:#fff;cursor:pointer;min-height:42px}',
    '#wsRoot .ws-btn.gr{background:#eceaf8;color:#3b2bb5}',
    '#wsRoot .ws-btn.rd{background:#fde8e8;color:#c62828}',
    '#wsRoot .ws-box{background:#fff;border:1px solid #e3e3ea;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)}',
    '#wsRoot .ws-box label{display:block;font-size:12.5px;font-weight:700;color:#55555f;margin:8px 0 4px}',
    '#wsRoot .ws-box input{width:100%;box-sizing:border-box;border:1px solid #d8d8de;border-radius:10px;padding:11px 12px;font-size:15px;background:#fff;color:#1b1b1f}',
    '#wsRoot .ws-err{color:#c62828;font-size:13px;margin-top:8px}',
    '#wsRoot .ws-act{display:flex;gap:8px;margin-top:12px}',
    '#wsRoot .ws-it{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e3e3ea;border-radius:14px;padding:10px 10px 10px 12px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.04)}',
    '#wsRoot .ws-ic{flex:none;width:42px;height:42px;border-radius:12px;background:#eceaf8;color:#3b2bb5;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px}',
    '#wsRoot .ws-nm{flex:1;min-width:0;cursor:pointer;line-height:1.3}',
    '#wsRoot .ws-nm b{display:block;font-size:15.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#wsRoot .ws-nm small{display:block;color:#77778a;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#wsRoot .ws-ib{flex:none;width:38px;height:38px;border:0;border-radius:10px;background:#f1f1f6;font-size:16px;cursor:pointer}',
    '#wsRoot .ws-empty{text-align:center;color:#77778a;padding:34px 10px;font-size:14px;line-height:1.6}'
  ].join('\n');
  document.head.appendChild(css);

  function norm(u){
    u = String(u || '').trim(); if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    try { var x = new URL(u); if (x.protocol !== 'http:' && x.protocol !== 'https:') return ''; if (!x.hostname || x.hostname.indexOf('.') < 0) return ''; return x.href; } catch(e){ return ''; }
  }
  function host(u){ try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return u; } }

  function draw(){
    var root = $('#wsRoot'); if (!root) return;
    var q = W.q.trim().toLowerCase(), shown = W.list.map(function(s, i){ return { s:s, i:i }; }).filter(function(x){ return !q || (x.s.name + ' ' + x.s.url).toLowerCase().indexOf(q) >= 0; });
    var f = W.form;
    root.innerHTML =
      '<div id="wsSt" style="font-size:12px;margin:0 2px 8px"></div><div class="ws-top">' + (W.list.length > 4 ? '<input id="wsQ" placeholder="Search websites" value="' + esc(W.q) + '" autocomplete="off">' : '<div style="flex:1"></div>') + '<button class="ws-btn" id="wsAdd">＋ Add</button></div>' +
      (f ? '<div class="ws-box"><b>' + (f.i >= 0 ? 'Edit website' : 'Add website') + '</b>' +
        '<label>Website name</label><input id="wsN" value="' + esc(f.name) + '" placeholder="e.g. My Bank" autocomplete="off">' +
        '<label>Link</label><input id="wsU" value="' + esc(f.url) + '" placeholder="https://example.com" inputmode="url" autocapitalize="off" autocomplete="off">' +
        (f.err ? '<div class="ws-err">' + esc(f.err) + '</div>' : '') +
        '<div class="ws-act"><button class="ws-btn" id="wsSave">Save</button><button class="ws-btn gr" id="wsCan">Cancel</button></div></div>' : '') +
      (shown.length ? shown.map(function(x){
        return '<div class="ws-it"><div class="ws-ic">' + esc((x.s.name || '?').charAt(0).toUpperCase()) + '</div>' +
          '<div class="ws-nm" data-o="' + x.i + '"><b>' + esc(x.s.name) + '</b><small>' + esc(host(x.s.url)) + '</small></div>' +
          '<button class="ws-ib" data-e="' + x.i + '" aria-label="Edit">✏️</button><button class="ws-ib" data-d="' + x.i + '" aria-label="Delete">🗑️</button></div>';
      }).join('') : '<div class="ws-empty">' + (W.list.length ? 'Kuch nahi mila.' : 'Abhi koi website nahi hai.<br>Upar <b>＋ Add</b> dabake pehla link jodo.') + '</div>');
    status();
    var qi = $('#wsQ', root); if (qi && W.keepQ){ qi.focus(); try { qi.setSelectionRange(W.q.length, W.q.length); } catch(e){} }
  }
  function bind(){
    var root = $('#wsRoot'); if (!root || root.__b) return; root.__b = 1;
    root.addEventListener('input', function(e){ if (e.target.id === 'wsQ'){ W.q = e.target.value; W.keepQ = true; draw(); } });
    root.addEventListener('keydown', function(e){ if ((e.target.id === 'wsN' || e.target.id === 'wsU') && e.key === 'Enter') $('#wsSave', root).click(); });
    root.addEventListener('click', function(e){
      var t = e.target; W.keepQ = false;
      if (t.closest('#wsAdd')){ W.form = { i:-1, name:'', url:'', err:'' }; draw(); var n = $('#wsN'); if (n) n.focus(); return; }
      if (t.closest('#wsCan')){ W.form = null; draw(); return; }
      if (t.closest('#wsSave')){
        var name = $('#wsN', root).value.trim(), url = norm($('#wsU', root).value);
        if (!name){ W.form.name = ''; W.form.url = $('#wsU', root).value; W.form.err = 'Website ka naam likho'; return draw(); }
        if (!url){ W.form.name = name; W.form.url = $('#wsU', root).value; W.form.err = 'Sahi link daalo (jaise example.com)'; return draw(); }
        if (W.form.i >= 0) W.list[W.form.i] = { name:name, url:url }; else W.list.unshift({ name:name, url:url });
        save(); W.form = null; draw(); return;
      }
      var o = t.closest('[data-o]'); if (o){ var s = W.list[+o.dataset.o]; if (s) window.open(s.url, '_blank', 'noopener'); return; }
      var ed = t.closest('[data-e]'); if (ed){ var s2 = W.list[+ed.dataset.e]; if (s2){ W.form = { i:+ed.dataset.e, name:s2.name, url:s2.url, err:'' }; draw(); window.scrollTo(0, 0); } return; }
      var de = t.closest('[data-d]'); if (de){ var s3 = W.list[+de.dataset.d]; if (s3 && confirm('“' + s3.name + '” delete karein?')){ W.list.splice(+de.dataset.d, 1); save(); draw(); } return; }
    });
  }
  window.vWebsites = function(){ return '<div id="wsRoot"></div>'; };
  window.websitesAfter = function(){ bind(); draw(); pull(); };
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && $('#wsRoot')) pull(); });
  setInterval(function(){ if ($('#wsRoot') && !document.hidden && !W.form) pull(); }, 20000);   // another phone changed the list

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="websites"]')) return;
    var anchor = nav.querySelector('[data-v="youtube"]') || nav.querySelector('[data-v="music"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'websites'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '🌐').replace('Updates', 'Websites'); });
    anchor.after(b);
  })();
})();
