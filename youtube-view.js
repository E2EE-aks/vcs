/* KS · YouTube tab (All Options › YouTube): search, trending, suggestions, full-screen player, mini player, Google sign-in.
   Search / trending / suggestions come from the server (yt-server.js, official YouTube Data API).  Videos play in YouTube's own
   embedded player.  "Sign in with Google" (read-only) adds your liked videos, playlists and "Because you liked…" picks.
   Downloading is not possible.  Needs on the server: YT_API_KEY (and YT_CLIENT_ID for sign-in). */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var LK = 'ks_yt_lib', TK = 'ks_yt_tok';
  var Y = { cfg:null, home:null, q:'', chip:'Home', res:null, busy:false, err:'', nokey:false, lib:[], tok:null, me:null, au:null, list:null,
            cur:null, queue:[], qi:0, pl:null, plReady:false, dock:null, tm:null, seq:0, sg:{}, gsi:false, menu:false };
  try { Y.lib = JSON.parse(localStorage.getItem(LK) || '[]') || []; } catch(e){ Y.lib = []; }
  try { var t = JSON.parse(localStorage.getItem(TK) || 'null'); if (t && t.exp > Date.now()) Y.tok = t.t; } catch(e){}
  function saveLib(){ try { localStorage.setItem(LK, JSON.stringify(Y.lib.slice(0, 200))); } catch(e){} }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function inLib(v){ return Y.lib.some(function(x){ return x.id === v.id; }); }
  try { TITLES.youtube = ['YouTube', 'Watch videos and listen to music']; } catch(e){}
  try { NAV_GRP.youtube = 'Workspace'; } catch(e){}
  async function quiet(action, payload){
    var j = await callServer(Object.assign({ action:action, token:S.token, asUser:S.as || undefined }, payload || {}));
    if (!j.ok){ var e = new Error(j.error || 'Request failed'); e.code = j.code; throw e; }
    return j;
  }

  var css = document.createElement('style');
  css.textContent = [
    '#ytRoot{--r:#ff0000;--bg:#0f0f0f;--mu:#aaa;--ch:#272727;background:var(--bg);color:#fff;border-radius:16px;padding:12px 12px 24px;margin:-4px 0 10px;min-height:60vh}',
    '#ytRoot .yt-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}',
    '#ytRoot .yt-logo{display:flex;align-items:center;gap:6px;font-weight:800;font-size:19px;letter-spacing:-.5px}',
    '#ytRoot .yt-logo i{background:var(--r);border-radius:7px;width:30px;height:21px;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:11px}',
    '#ytRoot .yt-acc{border:0;border-radius:999px;background:var(--ch);color:#3ea6ff;padding:7px 14px;font-weight:700;font-size:13px;cursor:pointer}',
    '#ytRoot .yt-av{width:34px;height:34px;border-radius:50%;background:#555 center/cover no-repeat;border:0;cursor:pointer;color:#fff;font-weight:800}',
    '#ytRoot .yt-menu{background:var(--ch);border-radius:12px;padding:12px;margin-bottom:10px;font-size:14px;display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '#ytRoot .yt-s{display:flex;align-items:center;gap:8px;background:var(--ch);border-radius:999px;padding:0 14px;height:42px;margin-bottom:10px}',
    '#ytRoot .yt-s input{flex:1;min-width:0;border:0;background:transparent;color:#fff;font-size:15px;outline:none;height:100%}',
    '#ytRoot .yt-s button{border:0;background:transparent;color:#fff;font-size:15px;cursor:pointer}',
    '#ytRoot .yt-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:10px}',
    '#ytRoot .yt-chip{flex:none;border:0;border-radius:8px;padding:7px 13px;font-size:13.5px;font-weight:600;background:var(--ch);color:#fff;cursor:pointer}',
    '#ytRoot .yt-chip.on{background:#fff;color:#000}',
    '#ytRoot h3{margin:16px 2px 10px;font-size:18px;font-weight:800}',
    '#ytRoot .yt-feed{display:grid;grid-template-columns:1fr;gap:18px}',
    '@media(min-width:700px){#ytRoot .yt-feed{grid-template-columns:repeat(3,1fr)}}',
    '.yt-card{cursor:pointer}',
    '.yt-th{position:relative;aspect-ratio:16/9;background:#222 center/cover no-repeat;border-radius:12px;overflow:hidden}',
    '.yt-du{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.8);border-radius:4px;padding:1px 5px;font-size:12px;font-weight:600;color:#fff}',
    '.yt-mt{display:flex;gap:10px;margin-top:9px}',
    '.yt-ci{flex:none;width:36px;height:36px;border-radius:50%;background:#3a3a3a;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff}',
    '.yt-tx{min-width:0;line-height:1.3}',
    '.yt-tx b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14.5px;font-weight:600;overflow-wrap:anywhere}',
    '.yt-tx small{display:block;color:#aaa;font-size:12.5px;margin-top:2px}',
    '#ytRoot .yt-h{display:flex;gap:12px;overflow-x:auto;margin:0 -12px;padding:0 12px 6px}',
    '#ytRoot .yt-h .yt-card{flex:none;width:200px}',
    '#ytRoot .yt-empty{color:var(--mu);text-align:center;padding:34px 8px;font-size:14px;line-height:1.6}',
    '#ytRoot .yt-note{background:var(--ch);border-radius:12px;padding:12px 14px;font-size:13px;color:#ddd;line-height:1.6;margin-top:12px}',
    '#ytRoot .yt-note code{background:#3a3a3a;border-radius:4px;padding:1px 5px;font-size:12px}',
    '#ytDock{position:fixed;right:8px;bottom:calc(var(--bb-gap,0px) + 8px);width:210px;z-index:60;background:#0f0f0f;color:#fff;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.6);overflow:hidden}',
    '#ytDock.hidden{display:none}',
    '#ytDock .yt-vid{aspect-ratio:16/9;width:100%;background:#000}#ytDock iframe{display:block;width:100%;height:100%;border:0}',
    '#ytDock .yt-mb{display:flex;align-items:center;gap:4px;padding:4px 4px 4px 8px;font-size:12px}',
    '#ytDock .yt-mb span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#ytDock button{border:0;background:transparent;color:#fff;cursor:pointer;font-size:16px;width:30px;height:30px}',
    '#ytDock .yt-fb,#ytDock .yt-ft{display:none}',
    '#ytDock.full{inset:0;width:auto;right:0;bottom:0;border-radius:0;z-index:99999;overflow-y:auto;box-shadow:none}',
    '#ytDock.full .yt-mb{display:none}',
    '#ytDock.full .yt-ft{display:flex;align-items:center;gap:6px;padding:max(8px,env(safe-area-inset-top)) 6px 6px;font-size:13px;font-weight:700}',
    '#ytDock.full .yt-ft button{width:40px;height:40px;font-size:24px}',
    '#ytDock.full .yt-fb{display:block;padding:12px 14px 30px}',
    '#ytDock .yt-fb h2{margin:0;font-size:18px;line-height:1.3;font-weight:700}',
    '#ytDock .yt-fb .yt-sub{color:#aaa;font-size:13px;margin:4px 0 12px}',
    '#ytDock .yt-act{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}',
    '#ytDock .yt-act a,#ytDock .yt-act button{width:auto;height:auto;border-radius:999px;background:#272727;color:#fff;padding:8px 14px;font-size:13.5px;font-weight:600;text-decoration:none}',
    '#ytDock .yt-fb h4{margin:6px 0 10px;font-size:16px}',
    '#ytDock .yt-up{display:flex;gap:10px;margin-bottom:12px;cursor:pointer}',
    '#ytDock .yt-up .yt-th{width:150px;flex:none;border-radius:8px}#ytDock .yt-up .yt-tx b{font-size:13.5px}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- formatting for items fetched with the Google sign-in token ---------- */
  function dur(iso){ var m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || ''); if (!m) return ''; var h = +m[1] || 0, mi = +m[2] || 0, s = +m[3] || 0; return (h ? h + ':' + ('0' + mi).slice(-2) : mi) + ':' + ('0' + s).slice(-2); }
  function short(n){ n = Number(n); if (!isFinite(n)) return ''; return n >= 1e7 ? (n / 1e7).toFixed(1).replace('.0', '') + ' Cr' : n >= 1e5 ? (n / 1e5).toFixed(1).replace('.0', '') + ' L' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'K' : String(n); }
  function ago(d){ var s = (Date.now() - new Date(d)) / 1000; if (!(s > 0)) return ''; var u = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]; for (var i = 0; i < u.length; i++) if (s >= u[i][0]){ var v = Math.floor(s / u[i][0]); return v + ' ' + u[i][1] + (v > 1 ? 's' : '') + ' ago'; } return 'just now'; }
  function vItem(v){ var sn = v.snippet || {}, th = sn.thumbnails || {}; return { id:v.id, title:sn.title, ch:sn.channelTitle, img:((th.medium || th.high || th.default) || {}).url || '', dur:v.contentDetails ? dur(v.contentDetails.duration) : '', views:v.statistics && v.statistics.viewCount ? short(v.statistics.viewCount) + ' views' : '', ago:ago(sn.publishedAt) }; }

  /* ---------- Google sign-in (read-only) ---------- */
  function loadGsi(cb){
    if (window.google && google.accounts && google.accounts.oauth2) return cb && cb();
    if (Y.gsi) return; Y.gsi = true;
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = function(){ if (cb) cb(); }; document.head.appendChild(s);
  }
  function signIn(){
    if (!Y.cfg || !Y.cfg.clientId){ Y.err = ''; Y.noid = true; return draw(); }
    loadGsi(function(){
      var tc = google.accounts.oauth2.initTokenClient({ client_id:Y.cfg.clientId, scope:'https://www.googleapis.com/auth/youtube.readonly',
        callback:function(r){
          if (!r || !r.access_token){ try { toast('Google login nahi hua'); } catch(e){} return; }
          Y.tok = r.access_token; try { localStorage.setItem(TK, JSON.stringify({ t:r.access_token, exp:Date.now() + (r.expires_in || 3600) * 1000 - 60000 })); } catch(e){}
          loadAuth();
        } });
      tc.requestAccessToken({ prompt:'' });
    });
  }
  function signOut(){
    var t = Y.tok; Y.tok = null; Y.me = null; Y.au = null; Y.menu = false; try { localStorage.removeItem(TK); } catch(e){}
    try { if (t && window.google && google.accounts) google.accounts.oauth2.revoke(t, function(){}); } catch(e){}
    draw();
  }
  async function g(path, q){
    var u = 'https://www.googleapis.com/youtube/v3/' + path + '?' + new URLSearchParams(q).toString();
    var r = await fetch(u, { headers:{ Authorization:'Bearer ' + Y.tok } });
    if (r.status === 401){ signOut(); try { toast('Google session khatam, dobara sign in karo'); } catch(e){} throw new Error('expired'); }
    var j = await r.json().catch(function(){ return {}; });
    if (!r.ok) throw new Error((j.error && j.error.message) || 'YouTube error ' + r.status);
    return j;
  }
  async function loadAuth(){
    if (!Y.tok) return;
    try {
      var me = await g('channels', { part:'snippet', mine:'true' }), c = me.items && me.items[0];
      Y.me = c ? { name:c.snippet.title, img:(c.snippet.thumbnails && c.snippet.thumbnails.default && c.snippet.thumbnails.default.url) || '' } : { name:'Google account', img:'' };
    } catch(e){ Y.me = Y.me || { name:'Google account', img:'' }; }
    Y.au = { liked:[], lists:[], rec:null }; draw();
    try { var l = await g('videos', { part:'snippet,contentDetails,statistics', myRating:'like', maxResults:20 }); Y.au.liked = (l.items || []).map(vItem); } catch(e){}
    try { var p = await g('playlists', { part:'snippet,contentDetails', mine:'true', maxResults:20 }); Y.au.lists = (p.items || []).map(function(x){ var th = x.snippet.thumbnails || {}; return { id:x.id, title:x.snippet.title, img:((th.medium || th.default) || {}).url || '', n:x.contentDetails && x.contentDetails.itemCount, pl:1 }; }); } catch(e){}
    draw();
    if (Y.au.liked[0]){
      var b = Y.au.liked[0];
      try { var r = await quiet('ytRelated', { id:b.id, title:b.title, ch:b.ch }); Y.au.rec = { title:'Because you liked “' + b.title + '”', items:r.items || [] }; draw(); } catch(e){}
    }
  }
  async function openList(pl){
    Y.busy = true; Y.list = { title:pl.title, items:[] }; draw();
    try {
      var it = await g('playlistItems', { part:'contentDetails', playlistId:pl.id, maxResults:50 });
      var ids = (it.items || []).map(function(x){ return x.contentDetails.videoId; }).join(',');
      var v = ids ? await g('videos', { part:'snippet,contentDetails,statistics', id:ids, maxResults:50 }) : { items:[] };
      Y.list.items = (v.items || []).map(vItem);
    } catch(e){ Y.err = e.message; }
    Y.busy = false; draw();
  }

  /* ---------- player (full screen + mini, one persistent YouTube iframe) ---------- */
  function ensurePlayerApi(cb){
    if (window.YT && YT.Player) return cb();
    var prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = function(){ if (prev) try { prev(); } catch(e){} cb(); };
    if (!document.getElementById('ytApi')){ var s = document.createElement('script'); s.id = 'ytApi'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s); }
  }
  function mkDock(){
    if (Y.dock) return Y.dock;
    var d = document.createElement('div'); d.id = 'ytDock'; d.className = 'hidden';
    d.innerHTML = '<div class="yt-ft"><button id="ytMin" aria-label="Minimise">⌄</button><span>Now playing</span></div>' +
      '<div class="yt-vid"><div id="ytPl"></div></div>' +
      '<div class="yt-mb"><span id="ytMt"></span><button id="ytEx" aria-label="Expand">⤢</button><button id="ytCl" aria-label="Close">✕</button></div>' +
      '<div class="yt-fb"><h2 id="ytTt"></h2><div class="yt-sub" id="ytSu"></div><div class="yt-act"><button id="ytSv">♡ Save</button><a id="ytOp" target="_blank" rel="noopener">Open in YouTube</a><button id="ytNx">⏭ Next</button></div><h4>Up next</h4><div id="ytUp"></div></div>';
    document.body.appendChild(d); Y.dock = d;
    $('#ytMin', d).onclick = function(){ full(false); }; $('#ytEx', d).onclick = function(){ full(true); }; $('#ytCl', d).onclick = closeDock;
    $('#ytMt', d).onclick = function(){ full(true); }; $('#ytNx', d).onclick = function(){ step(1); };
    $('#ytSv', d).onclick = function(){ var v = Y.cur; if (!v) return; if (inLib(v)) Y.lib = Y.lib.filter(function(x){ return x.id !== v.id; }); else Y.lib.unshift(v); saveLib(); dockUi(); draw(); };
    $('#ytUp', d).onclick = function(e){ var n = e.target.closest('[data-u]'); if (n){ var it = (Y.sg[Y.cur && Y.cur.id] || [])[+n.dataset.u]; if (it) play(it, Y.sg[Y.cur.id]); } };
    return d;
  }
  function full(on){ if (!Y.dock) return; Y.dock.classList.toggle('full', !!on); document.documentElement.style.overflow = on ? 'hidden' : ''; }
  function dockUi(){
    var d = Y.dock, v = Y.cur; if (!d || !v) return;
    $('#ytMt', d).textContent = v.title; $('#ytTt', d).textContent = v.title;
    $('#ytSu', d).textContent = [v.ch, v.views, v.ago].filter(Boolean).join(' · ');
    $('#ytOp', d).href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id);
    $('#ytSv', d).textContent = inLib(v) ? '♥ Saved' : '♡ Save';
    var up = Y.sg[v.id]; $('#ytUp', d).innerHTML = up ? up.map(function(x, i){ return '<div class="yt-up" data-u="' + i + '"><div class="yt-th" style="background-image:url(&quot;' + esc(x.img) + '&quot;)">' + (x.dur ? '<span class="yt-du">' + esc(x.dur) + '</span>' : '') + '</div><div class="yt-tx"><b>' + esc(x.title) + '</b><small>' + esc([x.ch, x.views].filter(Boolean).join(' · ')) + '</small></div></div>'; }).join('') : '<div style="color:#aaa;font-size:13px">Loading suggestions…</div>';
  }
  function suggest(v){
    if (Y.sg[v.id]) return;
    quiet('ytRelated', { id:v.id, title:v.title, ch:v.ch }).then(function(r){ Y.sg[v.id] = r.items || []; }).catch(function(){ Y.sg[v.id] = []; }).then(function(){ if (Y.cur && Y.cur.id === v.id) dockUi(); });
  }
  function play(v, list){
    var d = mkDock(); Y.cur = v;
    if (list){ Y.queue = list; Y.qi = Math.max(0, list.indexOf(v)); } else if (!Y.queue.length){ Y.queue = [v]; Y.qi = 0; }
    d.classList.remove('hidden'); full(true); dockUi(); suggest(v);
    ensurePlayerApi(function(){
      if (Y.pl && Y.plReady){ Y.pl.loadVideoById(v.id); return; }
      if (Y.pl) return;
      Y.pl = new YT.Player('ytPl', { videoId:v.id, width:'100%', height:'100%', playerVars:{ autoplay:1, playsinline:1, rel:0, modestbranding:1 },
        events:{ onReady:function(e){ Y.plReady = true; try { e.target.playVideo(); } catch(x){} },
                 onStateChange:function(e){ if (e.data === 0) step(1); },
                 onError:function(){ try { toast('Ye video yahan nahi chal sakta, agla chala rahe hain'); } catch(x){} step(1); } } });
    });
  }
  function step(n){
    var i = Y.qi + n, up = Y.cur && Y.sg[Y.cur.id];
    if (i >= 0 && i < Y.queue.length){ Y.qi = i; return play(Y.queue[i]); }
    if (n > 0 && up && up.length){ Y.queue = up; Y.qi = 0; play(up[0]); }
  }
  function closeDock(){
    try { if (Y.pl && Y.plReady) Y.pl.stopVideo(); } catch(e){}
    full(false); if (Y.dock) Y.dock.classList.add('hidden'); Y.cur = null;
  }

  /* ---------- data + page ---------- */
  var CHIPQ = { Music:'new songs', Bollywood:'bollywood songs', Punjabi:'punjabi songs', Live:'live' };
  var REG = {};
  function init(){
    if (Y.cfg) return;
    quiet('ytConfig').then(function(c){ Y.cfg = c; if (!c.hasKey) Y.nokey = true; else loadHome(); if (c.clientId && Y.tok){ loadAuth(); } if (c.clientId) loadGsi(); draw(); }).catch(function(e){ Y.err = e.message; draw(); });
  }
  function fail(e){ if (e.code === 'YT_NOKEY'){ Y.nokey = true; Y.err = ''; } else Y.err = e.message || 'Kuch gadbad hui'; }
  function loadHome(){
    if (Y.home || Y.busy) return; Y.busy = true; Y.err = ''; draw();
    quiet('ytHome').then(function(r){ Y.home = r.shelves || []; }).catch(fail).then(function(){ Y.busy = false; draw(); });
  }
  function runSearch(q){
    var my = ++Y.seq; q = String(q || '').trim(); if (!q){ Y.res = null; draw(); return; }
    Y.busy = true; Y.err = ''; draw();
    quiet('ytSearch', { q:q }).then(function(r){ if (my === Y.seq) Y.res = r.items || []; }).catch(function(e){ if (my === Y.seq) fail(e); }).then(function(){ if (my === Y.seq){ Y.busy = false; draw(); } });
  }
  function card(v, key){
    REG[v.id] = v;
    return '<div class="yt-card" data-v="' + esc(v.id) + '" data-l="' + key + '"><div class="yt-th" style="background-image:url(&quot;' + esc(v.img) + '&quot;)">' + (v.dur ? '<span class="yt-du">' + esc(v.dur) + '</span>' : '') + '</div>' +
      '<div class="yt-mt"><div class="yt-ci">' + esc((v.ch || '?').charAt(0).toUpperCase()) + '</div><div class="yt-tx"><b>' + esc(v.title) + '</b><small>' + esc([v.ch, v.views, v.ago].filter(Boolean).join(' · ')) + '</small></div></div></div>';
  }
  var LISTS = {};
  function feed(items, key){ LISTS[key] = items; return '<div class="yt-feed">' + items.map(function(v){ return card(v, key); }).join('') + '</div>'; }
  function draw(){
    var root = $('#ytRoot'); if (!root) return;
    var body = '', hasQ = Y.q.trim().length > 0, chips = ['Home', 'Music', 'Bollywood', 'Punjabi', 'Live'].concat(Y.lib.length ? ['Saved'] : []);
    if (Y.nokey){
      body = '<div class="yt-note"><b>YouTube chalane ke liye ek free API key chahiye.</b><br>1. console.cloud.google.com par project banao.<br>2. “YouTube Data API v3” ko Enable karo.<br>3. Credentials › Create credentials › API key.<br>4. Server ki environment me <code>YT_API_KEY</code> naam se wo key daalo aur restart karo.</div>';
    } else if (Y.noid){
      body = '<div class="yt-note">Google login ke liye server me <code>YT_CLIENT_ID</code> (Google OAuth Web client ID) daalna hoga. Uske bina bhi search aur videos chalte hain.<br><br><button class="yt-chip on" id="ytOk">Theek hai</button></div>';
    } else if (Y.err){
      body = '<div class="yt-empty">⚠️ ' + esc(Y.err) + '<br><br><button class="yt-chip on" id="ytRetry">Dobara try karo</button></div>';
    } else if (Y.list){
      body = '<h3>← <span id="ytBack" style="cursor:pointer">' + esc(Y.list.title) + '</span></h3>' + (Y.busy ? '<div class="yt-empty">Loading…</div>' : feed(Y.list.items, 'pl'));
    } else if (Y.chip === 'Saved'){
      body = Y.lib.length ? '<h3>Saved</h3>' + feed(Y.lib, 'lib') : '<div class="yt-empty">Kuch save nahi hai.</div>';
    } else if (hasQ || Y.chip !== 'Home'){
      body = Y.busy && !Y.res ? '<div class="yt-empty">Loading…</div>' : (Y.res && Y.res.length ? feed(Y.res, 'res') : '<div class="yt-empty">Kuch nahi mila.</div>');
    } else if (Y.home){
      var a = Y.au;
      if (a && a.rec && a.rec.items.length) body += '<h3>' + esc(a.rec.title) + '</h3>' + feed(a.rec.items, 'rec');
      if (a && a.lists.length) body += '<h3>Your playlists</h3><div class="yt-h">' + a.lists.map(function(p){ REG['pl:' + p.id] = p; return '<div class="yt-card" data-p="' + esc(p.id) + '"><div class="yt-th" style="background-image:url(&quot;' + esc(p.img) + '&quot;)"><span class="yt-du">' + esc(p.n || '') + ' videos</span></div><div class="yt-tx" style="margin-top:8px"><b>' + esc(p.title) + '</b></div></div>'; }).join('') + '</div>';
      if (a && a.liked.length) body += '<h3>Liked videos</h3>' + feed(a.liked, 'liked');
      Y.home.forEach(function(sh, i){ body += '<h3>' + esc(sh.title) + '</h3>' + feed(sh.items, 'h' + i); });
    } else body = '<div class="yt-empty">Loading…</div>';
    var acc = Y.me ? '<button class="yt-av" id="ytAv"' + (Y.me.img ? ' style="background-image:url(&quot;' + esc(Y.me.img) + '&quot;)"' : '') + '>' + (Y.me.img ? '' : esc(Y.me.name.charAt(0))) + '</button>' : '<button class="yt-acc" id="ytIn">👤 Sign in</button>';
    var keep = document.activeElement && document.activeElement.id === 'ytIn2';
    root.innerHTML = '<div class="yt-top"><div class="yt-logo"><i>▶</i>YouTube</div>' + acc + '</div>' +
      (Y.menu && Y.me ? '<div class="yt-menu"><span>' + esc(Y.me.name) + '</span><button class="yt-chip on" id="ytOut">Sign out</button></div>' : '') +
      '<div class="yt-s"><span>🔍</span><input id="ytIn2" placeholder="Search YouTube" value="' + esc(Y.q) + '" autocomplete="off" enterkeyhint="search">' + (Y.q ? '<button id="ytX" aria-label="Clear">✕</button>' : '') + '</div>' +
      '<div class="yt-chips">' + chips.map(function(c){ return '<button class="yt-chip' + (Y.chip === c && !hasQ ? ' on' : '') + '" data-c="' + c + '">' + c + '</button>'; }).join('') + '</div>' + body;
    if (keep){ var i = $('#ytIn2', root); i.focus(); try { i.setSelectionRange(Y.q.length, Y.q.length); } catch(e){} }
  }
  function bind(){
    var root = $('#ytRoot'); if (!root || root.__b) return; root.__b = 1;
    root.addEventListener('input', function(e){ if (e.target.id !== 'ytIn2') return; Y.q = e.target.value; Y.chip = 'Home'; Y.list = null; clearTimeout(Y.tm); Y.tm = setTimeout(function(){ runSearch(Y.q); }, 600); });
    root.addEventListener('keydown', function(e){ if (e.target.id === 'ytIn2' && e.key === 'Enter'){ clearTimeout(Y.tm); runSearch(Y.q); e.target.blur(); } });
    root.addEventListener('click', function(e){
      var t = e.target;
      if (t.closest('#ytIn')) return signIn();
      if (t.closest('#ytAv')){ Y.menu = !Y.menu; return draw(); }
      if (t.closest('#ytOut')) return signOut();
      if (t.closest('#ytOk')){ Y.noid = false; return draw(); }
      if (t.closest('#ytRetry')){ Y.err = ''; Y.cfg ? (Y.home ? runSearch(Y.q || CHIPQ[Y.chip]) : loadHome()) : init(); return; }
      if (t.closest('#ytX')){ Y.q = ''; Y.res = null; draw(); return; }
      if (t.closest('#ytBack')){ Y.list = null; draw(); return; }
      var c = t.closest('[data-c]'); if (c){ Y.chip = c.dataset.c; Y.q = ''; Y.list = null; Y.res = null; if (CHIPQ[Y.chip]) runSearch(CHIPQ[Y.chip]); else draw(); return; }
      var p = t.closest('[data-p]'); if (p){ var pl = REG['pl:' + p.dataset.p]; if (pl) openList(pl); return; }
      var n = t.closest('[data-v]'); if (!n) return; var v = REG[n.dataset.v]; if (!v) return;
      play(v, LISTS[n.dataset.l] || [v]);
    });
  }
  window.vYoutube = function(){ return '<div id="ytRoot"></div>'; };
  window.youtubeAfter = function(){ bind(); draw(); init(); };
  window.youtubeReset = function(){ closeDock(); Y.cfg = null; Y.home = null; Y.res = null; Y.q = ''; Y.err = ''; Y.me = null; Y.au = null; Y.tok = null; Y.list = null; try { localStorage.removeItem(TK); } catch(e){} };

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="youtube"]')) return;
    var anchor = nav.querySelector('[data-v="music"]') || nav.querySelector('[data-v="whatsapp"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'youtube'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '▶️').replace('Updates', 'YouTube'); });
    anchor.after(b);
  })();
})();
