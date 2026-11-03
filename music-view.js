/* KS · Music tab (All Options › Music) - Spotify-style: search, trending shelves, tap to play, mini player, library.
   Search + trending come from the server (sp-server.js): Spotify when SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are set,
   otherwise Apple's public catalogue (30-second previews).  Spotify items play through Spotify's official embed player.
   The mini player keeps playing while you use other tabs.  Downloading is not possible. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var KEY = 'ks_music_v2';
  var M = { q:'', tab:'all', home:null, res:null, src:'', busy:false, err:'', lib:[], cur:null, queue:[], qi:0, mode:'', ctrl:null, api:null, pend:null, au:null, paused:true, pos:0, dur:0, dock:null, tm:null, seq:0 };
  try { M.lib = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch(e){ M.lib = []; }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(M.lib.slice(0, 300))); } catch(e){} }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function kid(it){ return (it.src || 'sp') + ':' + it.kind + ':' + it.id; }
  function inLib(it){ return M.lib.some(function(x){ return kid(x) === kid(it); }); }
  try { TITLES.music = ['Music', 'Search and play songs, albums and playlists']; } catch(e){}
  try { NAV_GRP.music = 'Workspace'; } catch(e){}
  async function quiet(action, payload){
    var j = await callServer(Object.assign({ action:action, token:S.token, asUser:S.as || undefined }, payload || {}));
    if (!j.ok){ var e = new Error(j.error || 'Request failed'); e.code = j.code; throw e; }
    return j;
  }

  var css = document.createElement('style');
  css.textContent = [
    '#spRoot{--g:#1db954;--bg:#121212;--card:#181818;--hov:#2a2a2a;--mu:#b3b3b3;background:linear-gradient(180deg,#1f3a2a 0,var(--bg) 280px);color:#fff;border-radius:16px;padding:16px 14px 24px;margin:-4px 0 10px;min-height:60vh}',
    '#spRoot h2{margin:0 0 12px;font-size:22px;font-weight:800}',
    '#spRoot h3{margin:20px 0 10px;font-size:18px;font-weight:800}',
    '#spRoot .sp-s{display:flex;align-items:center;gap:10px;background:#fff;color:#000;border-radius:999px;padding:0 14px;height:46px;margin-bottom:12px}',
    '#spRoot .sp-s input{flex:1;min-width:0;border:0;background:transparent;font-size:15px;font-weight:600;color:#000;outline:none;height:100%}',
    '#spRoot .sp-s input::placeholder{color:#6a6a6a}',
    '#spRoot .sp-s button{border:0;background:transparent;font-size:16px;color:#000;cursor:pointer}',
    '#spRoot .sp-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}',
    '#spRoot .sp-chip{flex:none;border:0;border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;background:#2a2a2a;color:#fff;cursor:pointer}',
    '#spRoot .sp-chip.on{background:var(--g);color:#000}',
    '#spRoot .sp-note{background:#242424;border-radius:10px;padding:10px 12px;font-size:12.5px;color:var(--mu);margin-top:14px;line-height:1.5}',
    '#spRoot .sp-note code{background:#333;border-radius:4px;padding:1px 5px;color:#fff;font-size:11.5px}',
    '#spRoot .sp-h{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;margin:0 -14px;padding-left:14px;padding-right:14px}',
    '#spRoot .sp-c{flex:none;width:140px;cursor:pointer;position:relative}',
    '#spRoot .sp-c .sp-art{width:140px;height:140px;border-radius:8px}',
    '#spRoot .sp-c b{display:block;font-size:13.5px;margin-top:8px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}',
    '#spRoot .sp-c small{display:block;color:var(--mu);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#spRoot .sp-art{background:#333 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:30px;flex:none}',
    '#spRoot .sp-r{display:flex;align-items:center;gap:12px;padding:6px 4px;border-radius:8px;cursor:pointer}',
    '#spRoot .sp-r:hover,#spRoot .sp-r.on{background:var(--hov)}',
    '#spRoot .sp-r .sp-art{width:50px;height:50px;border-radius:5px;font-size:20px}',
    '#spRoot .sp-r .sp-n{flex:1;min-width:0;line-height:1.3}',
    '#spRoot .sp-r .sp-n b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#spRoot .sp-r.on .sp-n b{color:var(--g)}',
    '#spRoot .sp-r .sp-n small{color:var(--mu);font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#spRoot .sp-rk{flex:none;width:18px;text-align:center;color:var(--mu);font-size:13px}',
    '#spRoot .sp-ib{flex:none;border:0;background:transparent;color:var(--mu);font-size:20px;width:36px;height:36px;cursor:pointer}',
    '#spRoot .sp-ib.on{color:var(--g)}',
    '#spRoot .sp-go{flex:none;width:38px;height:38px;border-radius:50%;border:0;background:var(--g);color:#000;font-size:15px;cursor:pointer}',
    '#spRoot .sp-empty{color:var(--mu);text-align:center;padding:36px 8px;font-size:14px}',
    '#spRoot details{margin-top:18px;color:var(--mu);font-size:13px}',
    '#spRoot details input{width:100%;box-sizing:border-box;margin-top:8px;border:0;border-radius:8px;padding:10px 12px;background:#2a2a2a;color:#fff;font-size:14px}',
    '#spDock{position:fixed;left:8px;right:8px;bottom:calc(var(--bb-gap,0px) + 6px);max-width:640px;margin:0 auto;z-index:60;background:#282828;color:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.55);overflow:hidden}',
    '#spDock.hidden{display:none}',
    '#spDock .sp-row{display:flex;align-items:center;gap:8px;padding:8px 8px 6px 10px}',
    '#spDock .sp-cov{flex:none;width:44px;height:44px;border-radius:6px;background:#444 center/cover no-repeat}',
    '#spDock .sp-nm{flex:1;min-width:0;line-height:1.25}',
    '#spDock .sp-nm b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#spDock .sp-nm small{color:#b3b3b3;font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#spDock button{flex:none;border:0;background:transparent;color:#fff;cursor:pointer;font-size:18px;width:34px;height:36px}',
    '#spDock .sp-pp{width:42px;height:42px;border-radius:50%;background:#fff;color:#000;font-size:17px}',
    '#spDock .sp-bar{height:4px;background:#5a5a5a;margin:2px 10px 8px;border-radius:2px;cursor:pointer}',
    '#spDock .sp-bar i{display:block;height:100%;width:0;background:#fff;border-radius:2px}',
    '#spDock .sp-emb{height:80px}#spDock .sp-emb.off{height:0;overflow:hidden}',
    '#spDock .sp-emb iframe{display:block;width:100%;height:80px;border:0}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- playback ---------- */
  function ensureApi(cb){
    if (M.api) return cb(M.api);
    M.pend = cb; if (window.__spApi) return; window.__spApi = 1;
    window.onSpotifyIframeApiReady = function(api){ M.api = api; var f = M.pend; M.pend = null; if (f) f(api); };
    var s = document.createElement('script'); s.src = 'https://open.spotify.com/embed/iframe-api/v1'; s.async = true; document.body.appendChild(s);
  }
  function mkDock(){
    if (M.dock) return M.dock;
    var d = document.createElement('div'); d.id = 'spDock'; d.className = 'hidden';
    d.innerHTML = '<div class="sp-row"><div class="sp-cov" id="spCov"></div><div class="sp-nm"><b id="spNm">—</b><small id="spSb"></small></div>' +
      '<button id="spPv" aria-label="Previous">⏮</button><button class="sp-pp" id="spPP" aria-label="Play / Pause">▶</button><button id="spNx" aria-label="Next">⏭</button><button id="spCl" aria-label="Close">✕</button></div>' +
      '<div class="sp-bar" id="spBar"><i id="spFill"></i></div><div class="sp-emb off" id="spEw"><div id="spEmb"></div></div>';
    document.body.appendChild(d); M.dock = d;
    $('#spPP', d).onclick = toggle; $('#spCl', d).onclick = closeDock;
    $('#spPv', d).onclick = function(){ step(-1); }; $('#spNx', d).onclick = function(){ step(1); };
    $('#spBar', d).onclick = function(e){
      if (!M.dur) return; var r = this.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      if (M.mode === 'it' && M.au) M.au.currentTime = f * M.dur; else if (M.ctrl) M.ctrl.seek(f * M.dur / 1000);
    };
    return d;
  }
  function toggle(){ if (M.mode === 'it' && M.au){ M.au.paused ? M.au.play().catch(function(){}) : M.au.pause(); } else if (M.ctrl) M.ctrl.togglePlay(); }
  function dockUi(){
    var d = M.dock; if (!d || !M.cur) return;
    $('#spNm', d).textContent = M.cur.title || 'Spotify'; $('#spSb', d).textContent = M.cur.sub || '';
    $('#spCov', d).style.backgroundImage = M.cur.img ? 'url("' + M.cur.img + '")' : '';
    $('#spPP', d).textContent = M.paused ? '▶' : '⏸';
    $('#spFill', d).style.width = (M.dur ? Math.min(100, M.pos / M.dur * 100) : 0) + '%';
    $('#spEw', d).classList.toggle('off', M.mode !== 'sp');
  }
  function mark(){ var root = $('#spRoot'); if (!root) return; [].forEach.call(root.querySelectorAll('[data-k]'), function(n){ n.classList.toggle('on', !!M.cur && n.dataset.k === kid(M.cur) && n.classList.contains('sp-r')); }); [].forEach.call(root.querySelectorAll('.sp-go'), function(n){ var cur = M.cur && n.dataset.k === kid(M.cur); n.textContent = cur && !M.paused ? '⏸' : '▶'; }); }
  function stopOther(m){
    if (m !== 'it' && M.au){ try { M.au.pause(); } catch(e){} }
    if (m !== 'sp' && M.ctrl){ try { M.ctrl.pause(); } catch(e){} }
  }
  function playItem(it, list){
    var d = mkDock(); M.cur = it; M.paused = false; M.pos = 0; M.dur = 0;
    if (list){ M.queue = list.filter(function(x){ return x.kind === 'track' || x.src === 'it'; }); M.qi = M.queue.indexOf(it); if (M.qi < 0){ M.queue = [it]; M.qi = 0; } }
    d.classList.remove('hidden'); document.body.style.paddingBottom = '170px';
    if (it.src === 'it'){
      M.mode = 'it'; stopOther('it');
      if (!M.au){
        M.au = new Audio(); M.au.preload = 'auto';
        M.au.addEventListener('timeupdate', function(){ M.pos = M.au.currentTime * 1000; M.dur = (M.au.duration || 30) * 1000; dockUi(); });
        M.au.addEventListener('play', function(){ M.paused = false; dockUi(); mark(); });
        M.au.addEventListener('pause', function(){ M.paused = true; dockUi(); mark(); });
        M.au.addEventListener('ended', function(){ step(1); });
      }
      M.au.src = it.preview; M.au.play().catch(function(){}); dockUi(); mark(); return;
    }
    M.mode = 'sp'; stopOther('sp'); dockUi(); mark();
    ensureApi(function(api){
      if (M.ctrl){ M.ctrl.loadUri(it.uri); setTimeout(function(){ try { M.ctrl.play(); } catch(e){} }, 500); return; }
      api.createController($('#spEmb', d), { uri:it.uri, width:'100%', height:80 }, function(c){
        M.ctrl = c;
        c.addListener('ready', function(){ try { c.play(); } catch(e){} });
        c.addListener('playback_update', function(e){ var s = e && e.data || {}; if (M.mode !== 'sp') return; M.paused = !!s.isPaused; M.pos = s.position || 0; M.dur = s.duration || 0; dockUi(); mark(); });
      });
    });
  }
  function step(n){
    if (!M.queue.length) return;
    var i = M.qi + n; if (i < 0) i = 0; if (i >= M.queue.length){ M.paused = true; dockUi(); mark(); return; }
    M.qi = i; playItem(M.queue[i]);
  }
  function closeDock(){
    stopOther(''); if (M.dock) M.dock.classList.add('hidden');
    document.body.style.paddingBottom = ''; M.cur = null; M.paused = true; M.mode = ''; mark();
  }

  /* ---------- data ---------- */
  function loadHome(){
    if (M.home || M.busy) return; M.busy = true; M.err = ''; draw();
    quiet('spHome').then(function(r){ M.home = r.shelves || []; M.src = r.source; })
      .catch(function(e){ M.err = e.message || 'Could not load music'; })
      .then(function(){ M.busy = false; draw(); });
  }
  function doSearch(){
    var q = M.q.trim(), my = ++M.seq;
    if (!q){ M.res = null; draw(); return; }
    M.busy = true; M.err = ''; draw();
    quiet('spSearch', { q:q }).then(function(r){ if (my !== M.seq) return; M.res = r.shelves || []; M.src = r.source; })
      .catch(function(e){ if (my === M.seq) M.err = e.message || 'Search failed'; })
      .then(function(){ if (my === M.seq){ M.busy = false; draw(); } });
  }
  function parse(t){
    t = String(t || '').trim(); var m;
    if ((m = t.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/))) return { kind:m[1], id:m[2] };
    if ((m = t.match(/^spotify:(track|album|playlist):([A-Za-z0-9]+)$/))) return { kind:m[1], id:m[2] };
    return null;
  }

  /* ---------- page ---------- */
  var ICO = { track:'🎵', album:'💿', playlist:'🎶' };
  function art(it, cls){ return '<div class="sp-art' + (cls ? ' ' + cls : '') + '"' + (it.img ? ' style="background-image:url(&quot;' + esc(it.img) + '&quot;)"' : '') + '>' + (it.img ? '' : ICO[it.kind] || '🎵') + '</div>'; }
  var REG = {};
  function reg(it){ var k = kid(it); REG[k] = it; return k; }
  function rowH(it, i, list, rank){
    var k = reg(it);
    return '<div class="sp-r" data-k="' + esc(k) + '" data-l="' + list + '">' + (rank ? '<span class="sp-rk">' + (i + 1) + '</span>' : '') + art(it) +
      '<div class="sp-n"><b>' + esc(it.title) + '</b><small>' + esc(it.sub || it.kind) + '</small></div>' +
      '<button class="sp-ib' + (inLib(it) ? ' on' : '') + '" data-h="' + esc(k) + '" aria-label="Save">' + (inLib(it) ? '♥' : '♡') + '</button></div>';
  }
  function cardH(it, list){
    var k = reg(it);
    return '<div class="sp-c" data-k="' + esc(k) + '" data-l="' + list + '">' + art(it) + '<b>' + esc(it.title) + '</b><small>' + esc(it.sub || it.kind) + '</small></div>';
  }
  var LISTS = {};
  function shelfH(sh, key, rank){
    LISTS[key] = sh.items; var tr = sh.items.every(function(x){ return x.kind === 'track'; });
    if (tr) return '<h3>' + esc(sh.title) + '</h3>' + sh.items.slice(0, rank ? 12 : 30).map(function(it, i){ return rowH(it, i, key, rank); }).join('');
    return '<h3>' + esc(sh.title) + '</h3><div class="sp-h">' + sh.items.map(function(it){ return cardH(it, key); }).join('') + '</div>';
  }
  function draw(){
    var root = $('#spRoot'); if (!root) return;
    var hr = new Date().getHours(), body = '', q = M.q.trim();
    if (M.tab === 'lib'){
      LISTS.lib = M.lib;
      body = M.lib.length ? '<h3>Your Library</h3>' + M.lib.map(function(it, i){ return rowH(it, i, 'lib', false); }).join('') : '<div class="sp-empty">Library khali hai. Kisi bhi gaane par ♡ dabao to yahan save ho jayega.</div>';
    } else if (M.err){
      body = '<div class="sp-empty">⚠️ ' + esc(M.err) + '<br><br><button class="sp-chip on" id="spRetry">Dobara try karo</button></div>';
    } else if (M.busy && !(q ? M.res : M.home)){
      body = '<div class="sp-empty">Loading…</div>';
    } else if (q){
      body = M.res && M.res.length ? M.res.map(function(sh, i){ return shelfH(sh, 'r' + i, false); }).join('') : (M.busy ? '<div class="sp-empty">Searching…</div>' : '<div class="sp-empty">“' + esc(q) + '” ke liye kuch nahi mila.</div>');
    } else if (M.home){
      body = M.home.map(function(sh, i){ return shelfH(sh, 'h' + i, i === 0); }).join('');
    }
    var note = M.src === 'preview' ? '<div class="sp-note">ℹ️ Abhi ye 30 second ka preview chala raha hai. Poora Spotify (pure gaane, playlists, albums) chalane ke liye server me <code>SPOTIFY_CLIENT_ID</code> aur <code>SPOTIFY_CLIENT_SECRET</code> daalo (free, developer.spotify.com/dashboard).</div>' : '';
    var keep = document.activeElement && document.activeElement.id === 'spIn';
    root.innerHTML = '<h2>' + (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + '</h2>' +
      '<div class="sp-s"><span>🔍</span><input id="spIn" placeholder="What do you want to listen to?" value="' + esc(M.q) + '" autocomplete="off" enterkeyhint="search">' + (M.q ? '<button id="spX" aria-label="Clear">✕</button>' : '') + '</div>' +
      '<div class="sp-chips">' + [['all', 'All'], ['lib', 'Your Library']].map(function(c){ return '<button class="sp-chip' + (M.tab === c[0] ? ' on' : '') + '" data-t="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      body + note +
      '<details><summary>＋ Spotify link se add karo</summary><input id="spLink" placeholder="Paste Spotify song / album / playlist link" inputmode="url"></details>';
    if (keep){ var i = $('#spIn', root); i.focus(); try { i.setSelectionRange(M.q.length, M.q.length); } catch(e){} }
    mark();
  }
  function bind(){
    var root = $('#spRoot'); if (!root || root.__b) return; root.__b = 1;
    root.addEventListener('input', function(e){
      if (e.target.id !== 'spIn') return; M.q = e.target.value; M.tab = 'all'; clearTimeout(M.tm); M.tm = setTimeout(doSearch, 450);
    });
    root.addEventListener('keydown', function(e){
      if (e.target.id === 'spIn' && e.key === 'Enter'){ clearTimeout(M.tm); doSearch(); e.target.blur(); }
      if (e.target.id === 'spLink' && e.key === 'Enter') addLink(e.target.value);
    });
    root.addEventListener('change', function(e){ if (e.target.id === 'spLink') addLink(e.target.value); });
    root.addEventListener('click', function(e){
      var t = e.target;
      if (t.closest('#spX')){ M.q = ''; M.res = null; draw(); return; }
      if (t.closest('#spRetry')){ M.err = ''; M.home = null; M.q ? doSearch() : loadHome(); return; }
      var c = t.closest('[data-t]'); if (c){ M.tab = c.dataset.t; draw(); return; }
      var h = t.closest('[data-h]'); if (h){ e.stopPropagation(); var it = REG[h.dataset.h]; if (!it) return;
        if (inLib(it)) M.lib = M.lib.filter(function(x){ return kid(x) !== kid(it); }); else M.lib.unshift(it); save(); draw(); return; }
      var n = t.closest('[data-k]'); if (!n) return; var item = REG[n.dataset.k]; if (!item) return;
      if (M.cur && kid(M.cur) === kid(item)) return toggle();
      playItem(item, LISTS[n.dataset.l] || [item]);
    });
  }
  function addLink(v){
    var p = parse(v); if (!p){ try { toast('Valid Spotify link daalo'); } catch(e){} return; }
    var it = { kind:p.kind, src:'sp', id:p.id, uri:'spotify:' + p.kind + ':' + p.id, title:'Spotify ' + p.kind, sub:'', img:'' };
    if (!inLib(it)){ M.lib.unshift(it); save(); }
    fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/' + p.kind + '/' + p.id)).then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ if (j){ it.title = j.title || it.title; it.img = j.thumbnail_url || ''; save(); draw(); } }).catch(function(){});
    M.tab = 'lib'; draw(); playItem(it, [it]);
  }
  window.vMusic = function(){ return '<div id="spRoot"></div>'; };
  window.musicAfter = function(){ bind(); draw(); loadHome(); };
  window.musicReset = function(){ closeDock(); M.home = null; M.res = null; M.q = ''; M.err = ''; };

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="music"]')) return;
    var anchor = nav.querySelector('[data-v="whatsapp"]') || nav.querySelector('[data-v="telegram"]') || nav.querySelector('[data-v="mail"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'music'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '🎧').replace('Updates', 'Music'); });
    anchor.after(b);
  })();
})();
