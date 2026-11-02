/* KS · Music tab (All Options › Music) - Spotify-style layout.
   Real Spotify playback through Spotify's official embed player (full songs when logged in to Spotify in this browser,
   30-second previews otherwise). Add any Spotify link (song / album / playlist / podcast); it is saved on this phone.
   A mini player stays at the bottom while you use other tabs. Downloading is not possible (Spotify DRM). */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var KEY = 'ks_music_v1';
  var M = { lib:[], f:'all', cur:null, ctrl:null, api:null, paused:true, pos:0, dur:0, dock:null, pend:null };
  var SEED = [{ uri:'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M', type:'playlist', id:'37i9dQZF1DXcBWIGoYBM5M', title:'Today\u2019s Top Hits', img:'' }];
  try { M.lib = JSON.parse(localStorage.getItem(KEY) || 'null') || SEED.slice(); } catch(e){ M.lib = SEED.slice(); }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(M.lib)); } catch(e){} }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  try { TITLES.music = ['Music', 'Play your Spotify songs, albums and playlists']; } catch(e){}
  try { NAV_GRP.music = 'Workspace'; } catch(e){}

  var css = document.createElement('style');
  css.textContent = [
    '#spRoot{--sp-g:#1db954;--sp-bg:#121212;--sp-card:#181818;--sp-hov:#2a2a2a;--sp-tx:#fff;--sp-mu:#b3b3b3;background:linear-gradient(180deg,#1f3a2a 0,var(--sp-bg) 260px);color:var(--sp-tx);border-radius:16px;padding:16px 14px 20px;margin:-4px 0 10px}',
    '#spRoot h2{margin:0 0 12px;font-size:22px;font-weight:800}',
    '#spRoot .sp-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:12px}',
    '#spRoot .sp-chip{flex:none;border:0;border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;background:#2a2a2a;color:#fff;cursor:pointer}',
    '#spRoot .sp-chip.on{background:var(--sp-g);color:#000}',
    '#spRoot .sp-add{display:flex;gap:8px;margin-bottom:14px}',
    '#spRoot .sp-add input{flex:1;min-width:0;border:0;border-radius:999px;padding:11px 16px;background:#2a2a2a;color:#fff;font-size:14px;outline:none}',
    '#spRoot .sp-add input::placeholder{color:#8a8a8a}',
    '#spRoot .sp-btn{flex:none;border:0;border-radius:999px;padding:0 16px;font-weight:700;background:var(--sp-g);color:#000;cursor:pointer;font-size:14px}',
    '#spRoot .sp-lnk{display:inline-block;color:var(--sp-mu);font-size:12.5px;margin:0 0 14px;text-decoration:underline}',
    '#spRoot .sp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
    '@media(min-width:700px){#spRoot .sp-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}',
    '#spRoot .sp-tile{position:relative;display:flex;flex-direction:column;background:var(--sp-card);border-radius:10px;overflow:hidden;cursor:pointer;transition:background .15s}',
    '#spRoot .sp-tile:hover,#spRoot .sp-tile.on{background:var(--sp-hov)}',
    '#spRoot .sp-art{aspect-ratio:1;background:#333 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:34px}',
    '#spRoot .sp-t{padding:8px 10px 10px;min-width:0}',
    '#spRoot .sp-t b{display:block;font-size:13.5px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}',
    '#spRoot .sp-t small{color:var(--sp-mu);font-size:12px;text-transform:capitalize}',
    '#spRoot .sp-play{position:absolute;right:8px;bottom:56px;width:40px;height:40px;border-radius:50%;border:0;background:var(--sp-g);color:#000;font-size:16px;box-shadow:0 6px 14px rgba(0,0,0,.45);cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '#spRoot .sp-x{position:absolute;left:6px;top:6px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.6);color:#fff;font-size:13px;cursor:pointer}',
    '#spRoot .sp-empty{color:var(--sp-mu);padding:30px 6px;text-align:center;font-size:14px}',
    '#spDock{position:fixed;left:8px;right:8px;bottom:calc(var(--bb-gap,0px) + 6px);max-width:640px;margin:0 auto;z-index:60;background:#181818;color:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden}',
    '#spDock.hidden{display:none}',
    '#spDock .sp-row{display:flex;align-items:center;gap:10px;padding:8px 10px}',
    '#spDock .sp-cov{flex:none;width:44px;height:44px;border-radius:6px;background:#333 center/cover no-repeat}',
    '#spDock .sp-nm{flex:1;min-width:0;line-height:1.25}',
    '#spDock .sp-nm b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#spDock .sp-nm small{color:#1db954;font-size:11.5px}',
    '#spDock .sp-pp{flex:none;width:42px;height:42px;border-radius:50%;border:0;background:#fff;color:#000;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '#spDock .sp-cl{flex:none;width:32px;height:32px;border:0;background:transparent;color:#b3b3b3;font-size:18px;cursor:pointer}',
    '#spDock .sp-bar{height:3px;background:#4d4d4d;margin:0 10px 4px;border-radius:2px;cursor:pointer}',
    '#spDock .sp-bar i{display:block;height:100%;width:0;background:#fff;border-radius:2px}',
    '#spDock .sp-emb{height:80px}',
    '#spDock .sp-emb iframe{display:block;width:100%;height:80px;border:0}'
  ].join('\n');
  document.head.appendChild(css);

  function parse(t){
    t = String(t || '').trim(); var m;
    if ((m = t.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/))) return { type:m[1], id:m[2] };
    if ((m = t.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)$/))) return { type:m[1], id:m[2] };
    return null;
  }
  var ICO = { track:'🎵', album:'💿', playlist:'🎶', artist:'🎤', episode:'🎙️', show:'🎙️' };
  function meta(it){
    fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/' + it.type + '/' + it.id))
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ if (!j) return; it.title = j.title || it.title; it.img = j.thumbnail_url || ''; save(); if (M.cur && M.cur.uri === it.uri) dockMeta(); draw(); })
      .catch(function(){});
  }
  M.lib.forEach(function(it){ if (!it.img) meta(it); });

  /* ---------- Spotify embed controller (kept alive in the bottom dock) ---------- */
  function ensureApi(cb){
    if (M.api) return cb(M.api);
    M.pend = cb;
    if (window.__spApi){ return; }
    window.__spApi = 1;
    window.onSpotifyIframeApiReady = function(api){ M.api = api; var f = M.pend; M.pend = null; if (f) f(api); };
    var s = document.createElement('script'); s.src = 'https://open.spotify.com/embed/iframe-api/v1'; s.async = true; document.body.appendChild(s);
  }
  function mkDock(){
    if (M.dock) return M.dock;
    var d = document.createElement('div'); d.id = 'spDock'; d.className = 'hidden';
    d.innerHTML = '<div class="sp-row"><div class="sp-cov" id="spCov"></div><div class="sp-nm"><b id="spNm">—</b><small>Spotify</small></div>' +
      '<button class="sp-pp" id="spPP" aria-label="Play / Pause">▶</button><button class="sp-cl" id="spCl" aria-label="Close">✕</button></div>' +
      '<div class="sp-bar" id="spBar"><i id="spFill"></i></div><div class="sp-emb"><div id="spEmb"></div></div>';
    document.body.appendChild(d); M.dock = d;
    $('#spPP', d).onclick = function(){ if (M.ctrl) M.ctrl.togglePlay(); };
    $('#spCl', d).onclick = closeDock;
    $('#spBar', d).onclick = function(e){ if (!M.ctrl || !M.dur) return; var r = this.getBoundingClientRect(); M.ctrl.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * M.dur / 1000); };
    return d;
  }
  function dockMeta(){
    if (!M.cur || !M.dock) return;
    $('#spNm', M.dock).textContent = M.cur.title || 'Spotify';
    $('#spCov', M.dock).style.backgroundImage = M.cur.img ? 'url("' + M.cur.img + '")' : '';
  }
  function dockState(){
    if (!M.dock) return;
    $('#spPP', M.dock).textContent = M.paused ? '▶' : '⏸';
    $('#spFill', M.dock).style.width = (M.dur ? Math.min(100, M.pos / M.dur * 100) : 0) + '%';
    draw();
  }
  function closeDock(){
    try { if (M.ctrl) M.ctrl.pause(); } catch(e){}
    if (M.dock) M.dock.classList.add('hidden');
    document.body.style.paddingBottom = ''; M.cur = null; M.paused = true; draw();
  }
  function play(it){
    var d = mkDock(); M.cur = it; M.paused = false; M.pos = 0; M.dur = 0;
    d.classList.remove('hidden'); dockMeta(); dockState();
    document.body.style.paddingBottom = '150px';
    ensureApi(function(api){
      if (M.ctrl){ M.ctrl.loadUri(it.uri); setTimeout(function(){ try { M.ctrl.play(); } catch(e){} }, 400); return; }
      api.createController($('#spEmb', d), { uri:it.uri, width:'100%', height:80 }, function(c){
        M.ctrl = c;
        c.addListener('ready', function(){ try { c.play(); } catch(e){} });
        c.addListener('playback_update', function(e){
          var s = e && e.data || {}; M.paused = !!s.isPaused; M.pos = s.position || 0; M.dur = s.duration || 0; dockState();
        });
      });
    });
  }

  /* ---------- page ---------- */
  function visible(){ return M.lib.filter(function(it){ return M.f === 'all' || (M.f === 'songs' ? (it.type === 'track' || it.type === 'episode') : M.f === 'playlists' ? it.type === 'playlist' : M.f === 'albums' ? (it.type === 'album' || it.type === 'artist') : true); }); }
  function draw(){
    var root = $('#spRoot'); if (!root) return;
    var list = visible(), chips = [['all','All'], ['playlists','Playlists'], ['albums','Albums'], ['songs','Songs']];
    root.innerHTML = '<h2>' + (new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening') + '</h2>' +
      '<div class="sp-chips">' + chips.map(function(c){ return '<button class="sp-chip' + (M.f === c[0] ? ' on' : '') + '" data-f="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="sp-add"><input id="spIn" placeholder="Paste a Spotify link (song, album, playlist)…" inputmode="url" autocomplete="off"><button class="sp-btn" id="spAdd">Add</button></div>' +
      '<a class="sp-lnk" href="https://open.spotify.com/search" target="_blank" rel="noopener">🔍 Find music on Spotify → copy link → paste above</a>' +
      (list.length ? '<div class="sp-grid">' + list.map(function(it, i){
        var on = M.cur && M.cur.uri === it.uri, idx = M.lib.indexOf(it);
        return '<div class="sp-tile' + (on ? ' on' : '') + '" data-i="' + idx + '"><button class="sp-x" data-x="' + idx + '" aria-label="Remove">✕</button>' +
          '<div class="sp-art"' + (it.img ? ' style="background-image:url(&quot;' + esc(it.img) + '&quot;)"' : '') + '>' + (it.img ? '' : (ICO[it.type] || '🎵')) + '</div>' +
          '<div class="sp-t"><b>' + esc(it.title || it.type) + '</b><small>' + esc(it.type) + '</small></div>' +
          '<button class="sp-play" data-p="' + idx + '">' + (on && !M.paused ? '⏸' : '▶') + '</button></div>';
      }).join('') + '</div>' : '<div class="sp-empty">Kuch nahi hai yahan. Upar Spotify ka link paste karke Add dabao.</div>');
    var inp = $('#spIn', root);
    function add(){
      var p = parse(inp.value); if (!p){ try { toast('Valid Spotify link daalo'); } catch(e){} return; }
      var uri = 'spotify:' + p.type + ':' + p.id;
      if (!M.lib.some(function(x){ return x.uri === uri; })){ var it = { uri:uri, type:p.type, id:p.id, title:'', img:'' }; M.lib.unshift(it); save(); meta(it); }
      inp.value = ''; draw();
    }
    $('#spAdd', root).onclick = add; inp.onkeydown = function(e){ if (e.key === 'Enter') add(); };
    root.onclick = function(e){
      var f = e.target.closest('[data-f]'); if (f){ M.f = f.dataset.f; return draw(); }
      var x = e.target.closest('[data-x]'); if (x){ e.stopPropagation(); M.lib.splice(+x.dataset.x, 1); save(); return draw(); }
      var t = e.target.closest('.sp-tile'); if (!t) return;
      var it = M.lib[+t.dataset.i]; if (!it) return;
      if (M.cur && M.cur.uri === it.uri && M.ctrl){ M.ctrl.togglePlay(); } else play(it);
    };
  }
  window.vMusic = function(){ return '<div id="spRoot"></div>'; };
  window.musicAfter = function(){ draw(); };
  window.musicReset = function(){ closeDock(); };

  /* ---------- the “Music” tab in the menu (side menu + All Options) ---------- */
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
