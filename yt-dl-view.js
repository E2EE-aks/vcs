/* KS · YT Download tab (Tools › YT Download) — every logged-in user.
   YouTube link -> Video (360p–1080p) ya Audio MP3 (64–320 kbps) -> server download karta hai -> file isi phone me save hoti hai.
   Server: yt-server.js (ytDlStart / ytDlStatus, GET /yt/file).  Engine + cookies same as the WhatsApp helper (dl-server.js). */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  try { TITLES.ytdl = ['YT Download', 'YouTube video / song download karo']; } catch(e){}
  try { NAV_GRP.ytdl = 'Workspace'; } catch(e){}

  var VQ = ['360p', '480p', '720p', '1080p'], AQ = ['64 kbps', '128 kbps', '192 kbps', '320 kbps'];
  var G = { url: '', kind: 'video', qi: 1, job: '', state: '', msg: '', name: '', size: 0, err: '', busy: false, max: 90, pct: 0 }, POLL = null;
  try { var sv = JSON.parse(localStorage.getItem('ks_ytdl_v1') || '{}'); if (sv.kind) G.kind = sv.kind === 'audio' ? 'audio' : 'video'; if (sv.qi >= 0 && sv.qi < 4) G.qi = sv.qi; } catch(e){}

  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function save(){ try { localStorage.setItem('ks_ytdl_v1', JSON.stringify({ kind: G.kind, qi: G.qi })); } catch(e){} }
  async function call(action, payload){
    var j = await callServer(Object.assign({ action: action, token: S.token, asUser: S.as || undefined }, payload || {}));
    if (!j.ok){ var e = new Error(j.error || 'Request failed'); e.code = j.code; throw e; }
    return j;
  }
  function root(){ return $('#ytdlRoot'); }
  function mb(b){ return (b / 1048576).toFixed(1) + ' MB'; }

  function draw(){
    var r = root(); if (!r) return;
    var qs = G.kind === 'audio' ? AQ : VQ, working = G.state === 'queue' || G.state === 'run' || G.busy;
    var opts = qs.map(function(q, i){ return '<option value="' + i + '"' + (i === G.qi ? ' selected' : '') + '>' + q + '</option>'; }).join('');
    var st = '';
    if (G.err) st = '<div class="muted" style="color:#c62828;margin-top:10px;white-space:pre-wrap">❌ ' + esc(G.err) + '</div>';
    else if (G.state === 'queue' || G.state === 'run') st = '<div class="muted" style="margin-top:10px">⏳ ' + esc(G.msg || 'Download ho raha hai…') +
      (G.state === 'run' ? '<div style="margin-top:8px;height:12px;border-radius:6px;background:rgba(128,128,128,.25);overflow:hidden"><div style="height:100%;width:' + G.pct + '%;background:#2e7d32;transition:width .5s"></div></div><div style="margin-top:4px;font-weight:600;font-size:15px">' + G.pct + '%</div>' : '') + '<br><small>Is screen se hat sakte ho, download chalta rahega (tab me wapas aakar dekho).</small></div>';
    else if (G.state === 'done') st = '<div style="margin-top:10px;color:#2e7d32">✅ <b>' + esc(G.name) + '</b> (' + mb(G.size) + ')<div style="margin-top:8px"><button class="btn" id="ytdlSave">⬇️ Phone me save karo</button></div></div>';
    r.innerHTML = '<div class="card"><h3 style="margin:0 0 6px">YT Download</h3>' +
      '<div class="muted" style="margin-bottom:10px">YouTube ka link daalo. Video ya MP3 chuno, quality chuno, aur Download dabao. Limit ' + G.max + ' MB.</div>' +
      '<input id="ytdlUrl" type="url" inputmode="url" placeholder="https://youtu.be/…" value="' + esc(G.url) + '" style="width:100%;box-sizing:border-box;margin-bottom:10px"' + (working ? ' disabled' : '') + '>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<select id="ytdlKind"' + (working ? ' disabled' : '') + '><option value="video"' + (G.kind === 'video' ? ' selected' : '') + '>🎬 Video (MP4)</option><option value="audio"' + (G.kind === 'audio' ? ' selected' : '') + '>🎵 Song (MP3)</option></select>' +
      '<select id="ytdlQ"' + (working ? ' disabled' : '') + '>' + opts + '</select>' +
      '<button class="btn" id="ytdlGo"' + (working ? ' disabled' : '') + '>' + (working ? 'Ho raha hai…' : 'Download') + '</button></div>' + st + '</div>';
    var u = $('#ytdlUrl'); if (u) u.oninput = function(){ G.url = u.value; };
    var k = $('#ytdlKind'); if (k) k.onchange = function(){ G.kind = k.value; save(); draw(); };
    var q = $('#ytdlQ'); if (q) q.onchange = function(){ G.qi = Number(q.value); save(); };
    var go = $('#ytdlGo'); if (go) go.onclick = start;
    var sb = $('#ytdlSave'); if (sb) sb.onclick = fetchFile;
  }

  async function start(){
    G.err = ''; G.state = ''; G.busy = true; draw();
    try {
      var j = await call('ytDlStart', { url: G.url.trim(), kind: G.kind, qi: G.qi });
      G.job = j.id; G.pct = 0; G.state = 'queue'; G.msg = 'Line me hai…'; G.busy = false; draw(); poll();
    } catch(e){ G.busy = false; G.err = e.message; draw(); }
  }
  function poll(){
    clearInterval(POLL);
    POLL = setInterval(async function(){
      if (!G.job || (G.state !== 'queue' && G.state !== 'run')){ clearInterval(POLL); return; }
      try {
        var j = await call('ytDlStatus', { id: G.job });
        G.state = j.state; G.msg = j.msg || ''; if (j.pct > G.pct) G.pct = j.pct;
        if (j.state === 'queue' && j.ahead) G.msg = 'Line me hai (aage ' + j.ahead + ' download)…';
        if (j.state === 'done'){ G.pct = 100; G.name = j.name; G.size = j.size; clearInterval(POLL); }
        if (j.state === 'error'){ G.err = j.msg || 'Download nahi hua.'; G.state = ''; G.job = ''; clearInterval(POLL); }
        if (S.view === 'ytdl') draw();
      } catch(e){ if (e.code === 'YTDL'){ G.err = e.message; G.state = ''; G.job = ''; clearInterval(POLL); if (S.view === 'ytdl') draw(); } }
    }, 2000);
  }
  async function fetchFile(){
    try {
      var j = await call('ytDlStatus', { id: G.job });
      if (j.state !== 'done') throw new Error('File abhi taiyar nahi hai.');
      ksFileDownload(API_URL + '/yt/file?id=' + encodeURIComponent(G.job) + '&k=' + encodeURIComponent(j.ticket), j.name || G.name);
      try { toast('Download started'); } catch(e){}
    } catch(e){ G.err = e.message; G.state = ''; draw(); }
  }

  window.vYtdl = function(){ return '<div id="ytdlRoot"></div>'; };
  window.ytdlAfter = function(){
    draw();
    call('ytDlConfig').then(function(c){ if (c && c.maxMb && c.maxMb !== G.max){ G.max = c.maxMb; draw(); } }).catch(function(){});
    if (G.job && (G.state === 'queue' || G.state === 'run')) poll();
  };

  /* ---------- side-menu tab (same trick as the AI tab) ---------- */
  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="ytdl"]')) return;
    var anchor = nav.querySelector('[data-v="youtube"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'ytdl'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '📥').replace('Updates', 'YT Download'); });
    anchor.after(b);
  })();
})();
