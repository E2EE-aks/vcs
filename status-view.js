/* KS · Status Saver tab (All Options › Status Saver)
   WhatsApp ke dekhe hue status (photo / video) phone ke folder  Android/media/com.whatsapp/WhatsApp/Media/.Statuses  me hote hain.
   Yahan folder ek baar chuno -> saare status grid me dikhte hain -> tap karke dekho, Save / Share karo, ya poora ek folder me copy karo.
   Koi file server par upload nahi hoti; sab kuch phone ke andar hi rehta hai. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var HAS_DIR = typeof window.showDirectoryPicker === 'function';
  var S_ = { items:[], src:'', filter:'all', sel:{}, busy:'', msg:'', msgErr:false, saved:false, view:-1 };

  try { TITLES.statuses = ['Status Saver', 'WhatsApp status — gallery me save karo']; } catch(e){}
  try { NAV_GRP.statuses = 'Workspace'; } catch(e){}

  /* ---------- tiny IndexedDB (to remember the folder you picked) ---------- */
  function idb(){
    return new Promise(function(res, rej){
      try {
        var r = indexedDB.open('ks_status_v1', 1);
        r.onupgradeneeded = function(){ r.result.createObjectStore('kv'); };
        r.onsuccess = function(){ res(r.result); };
        r.onerror = function(){ rej(r.error); };
      } catch(e){ rej(e); }
    });
  }
  function kvGet(k){ return idb().then(function(db){ return new Promise(function(res){ var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function(){ res(q.result); }; q.onerror = function(){ res(null); }; }); }).catch(function(){ return null; }); }
  function kvSet(k, v){ return idb().then(function(db){ return new Promise(function(res){ var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = function(){ res(true); }; t.onerror = function(){ res(false); }; }); }).catch(function(){ return false; }); }

  /* ---------- helpers ---------- */
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function isMedia(n){ return /\.(jpe?g|png|webp|gif|mp4|3gp|mkv|mov)$/i.test(n); }
  function isVid(n){ return /\.(mp4|3gp|mkv|mov)$/i.test(n); }
  function mime(n){
    var e = (n.split('.').pop() || '').toLowerCase();
    return { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', mp4:'video/mp4', '3gp':'video/3gpp', mkv:'video/x-matroska', mov:'video/quicktime' }[e] || 'application/octet-stream';
  }
  function fmtSize(b){ return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function fmtTime(t){
    var d = new Date(t), n = new Date(), p = function(x){ return (x < 10 ? '0' : '') + x; };
    var same = d.toDateString() === n.toDateString();
    return (same ? 'Aaj ' : p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ') + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function say(m, err){ S_.msg = m || ''; S_.msgErr = !!err; var el = $('#stMsg'); if (el){ el.textContent = S_.msg; el.style.color = err ? '#c62828' : '#2e7d32'; el.style.display = S_.msg ? 'block' : 'none'; } }
  function outName(it){ return 'WA-Status-' + it.name.replace(/^\.+/, ''); }

  /* ---------- reading the folder ---------- */
  var HOP = /^(android|media|com\.whatsapp(\.w4b)?|whatsapp( business)?|\.?statuses)$/i;
  function findStatusDir(dir, depth){
    if (/^\.?statuses$/i.test(dir.name)) return Promise.resolve(dir);
    if (depth > 6) return Promise.resolve(null);
    return dir.getDirectoryHandle('.Statuses').catch(function(){ return null; }).then(function(d){
      if (d) return d;
      var subs = [];
      return (async function(){
        for await (var e of dir.entries()){ if (e[1].kind === 'directory' && HOP.test(e[0])) subs.push(e[1]); }
        for (var i = 0; i < subs.length; i++){ var f = await findStatusDir(subs[i], depth + 1); if (f) return f; }
        return null;
      })();
    });
  }
  function clearItems(){ S_.items.forEach(function(it){ try { URL.revokeObjectURL(it.url); } catch(e){} }); S_.items = []; S_.sel = {}; }
  function setFiles(files, src){
    clearItems();
    files.forEach(function(f){
      if (!isMedia(f.name)) return;
      S_.items.push({ name:f.name, file:f, url:URL.createObjectURL(f), vid:isVid(f.name) || /^video\//.test(f.type || ''), t:f.lastModified || 0, size:f.size });
    });
    S_.items.sort(function(a, b){ return b.t - a.t; });
    S_.src = src || '';
  }
  async function loadHandle(h){
    S_.busy = 'Status dhoondh raha hoon…'; draw();
    try {
      var dir = await findStatusDir(h, 0), root = dir || h, files = [];
      for await (var e of root.entries()){
        if (e[1].kind === 'file' && isMedia(e[0])){ try { files.push(await e[1].getFile()); } catch(x){} }
      }
      setFiles(files, root.name);
      S_.busy = '';
      say(files.length ? files.length + ' status mile (“' + root.name + '” folder se).' : (dir ? 'Folder mil gaya par usme koi status nahi hai. Pehle WhatsApp me status dekho, phir yahan Refresh karo.' : '“' + h.name + '” me .Statuses folder nahi mila. Seedha .Statuses folder chuno.'), !files.length);
    } catch(err){
      S_.busy = ''; say('Folder nahi khul paya: ' + ((err && err.message) || err), true);
    }
    draw();
  }
  async function pickFolder(){
    try {
      var h = await window.showDirectoryPicker({ id:'wastatus', mode:'read' });
      kvSet('dir', h); S_.saved = true;
      await loadHandle(h);
    } catch(err){
      if (err && err.name === 'AbortError') return;
      say('Ye folder Chrome ne block kiya (' + ((err && err.message) || err) + '). Neeche “Files chuno” try karo.', true); draw();
    }
  }
  async function reopen(){
    var h = await kvGet('dir');
    if (!h){ S_.saved = false; say('Pehle koi folder chuno.', true); return draw(); }
    try {
      var p = await h.queryPermission({ mode:'read' });
      if (p !== 'granted') p = await h.requestPermission({ mode:'read' });
      if (p !== 'granted'){ say('Folder ki permission nahi mili. Dobara folder chuno.', true); return draw(); }
      await loadHandle(h);
    } catch(err){ say('Pichla folder nahi khul paya. Dobara chuno.', true); draw(); }
  }
  function pickFiles(){
    var inp = $('#stFiles'); if (inp){ inp.value = ''; inp.click(); }
  }

  /* ---------- saving ---------- */
  function dl(it){
    var a = document.createElement('a'); a.href = it.url; a.download = outName(it); a.style.display = 'none';
    document.body.appendChild(a); a.click(); setTimeout(function(){ a.remove(); }, 500);
  }
  function share(it){
    var f = new File([it.file], outName(it), { type: mime(it.name) });
    if (navigator.canShare && navigator.canShare({ files:[f] })){
      navigator.share({ files:[f] }).catch(function(e){ if (!e || e.name !== 'AbortError') say('Share nahi ho paya.', true); });
    } else say('Is browser me Share files support nahi hai. Save dabao.', true);
  }
  function targets(){
    var ks = Object.keys(S_.sel).filter(function(k){ return S_.sel[k]; });
    var list = ks.length ? ks.map(function(k){ return S_.items[+k]; }) : visible().map(function(x){ return x.it; });
    return list.filter(Boolean);
  }
  async function copyToFolder(){
    var list = targets(); if (!list.length) return say('Pehle status load karo.', true);
    if (!HAS_DIR){ return saveEach(list); }
    var dest;
    try { dest = await window.showDirectoryPicker({ id:'wasave', mode:'readwrite' }); }
    catch(err){ if (err && err.name === 'AbortError') return; say('Ye folder Chrome ne block kiya. Doosra folder chuno (jaise Pictures me naya folder).', true); return; }
    var ok = 0, bad = 0;
    for (var i = 0; i < list.length; i++){
      S_.busy = 'Copy ho raha hai… ' + (i + 1) + '/' + list.length; var b = $('#stBusy'); if (b) b.textContent = S_.busy;
      try {
        var fh = await dest.getFileHandle(outName(list[i]), { create:true }), w = await fh.createWritable();
        await w.write(list[i].file); await w.close(); ok++;
      } catch(e){ bad++; }
    }
    S_.busy = ''; draw();
    say(ok + ' file “' + dest.name + '” folder me copy ho gayi' + (bad ? ', ' + bad + ' nahi hui (is folder me likhne ki permission nahi). Doosra folder try karo.' : '.'), !!bad && !ok);
  }
  function saveEach(list){
    var i = 0; say(list.length + ' file save ho rahi hain (Downloads me). Agar Chrome “multiple downloads” puche to Allow karo.');
    (function next(){ if (i >= list.length) return; dl(list[i++]); setTimeout(next, 600); })();
  }

  /* ---------- viewer ---------- */
  function visible(){
    return S_.items.map(function(it, i){ return { it:it, i:i }; }).filter(function(x){
      return S_.filter === 'all' || (S_.filter === 'vid' ? x.it.vid : !x.it.vid);
    });
  }
  function openViewer(i){
    var it = S_.items[i]; if (!it) return; S_.view = i;
    var v = $('#stView'); if (!v){ v = document.createElement('div'); v.id = 'stView'; document.body.appendChild(v); }
    v.innerHTML = '<div class="sv-top"><button data-vx aria-label="Close">✕</button><span>' + esc(fmtTime(it.t)) + ' · ' + esc(fmtSize(it.size)) + '</span></div>' +
      '<div class="sv-media">' + (it.vid ? '<video src="' + it.url + '" controls autoplay playsinline loop></video>' : '<img src="' + it.url + '" alt="">') + '</div>' +
      '<div class="sv-bar"><button data-vs>⬇️ Save</button><button data-vh>📤 Share</button></div>';
    v.style.display = 'flex';
  }
  function closeViewer(){ var v = $('#stView'); if (v){ var m = v.querySelector('video'); if (m) m.pause(); v.style.display = 'none'; v.innerHTML = ''; } S_.view = -1; }
  document.addEventListener('click', function(e){
    var v = $('#stView'); if (!v || !v.contains(e.target)) return;
    if (e.target.closest('[data-vx]')) closeViewer();
    else if (e.target.closest('[data-vs]')){ var it = S_.items[S_.view]; if (it) dl(it); }
    else if (e.target.closest('[data-vh]')){ var it2 = S_.items[S_.view]; if (it2) share(it2); }
  });

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '#stRoot{color:#1b1b1f}',
    '#stRoot .st-box{background:#fff;border:1px solid #e3e3ea;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)}',
    '#stRoot .st-box h4{margin:0 0 6px;font-size:15px}',
    '#stRoot .st-box p,#stRoot .st-box li{font-size:13px;line-height:1.55;color:#55555f;margin:4px 0}',
    '#stRoot .st-box ol{margin:6px 0 0 18px;padding:0}',
    '#stRoot code{background:#f1f1f6;border-radius:6px;padding:1px 6px;font-size:12px;word-break:break-all}',
    '#stRoot .st-btn{border:0;border-radius:12px;padding:0 14px;font-weight:700;font-size:14px;background:#5b3df5;color:#fff;cursor:pointer;min-height:42px}',
    '#stRoot .st-btn.gr{background:#eceaf8;color:#3b2bb5}',
    '#stRoot .st-btn[disabled]{opacity:.5}',
    '#stRoot .st-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '#stRoot .st-tabs{display:flex;gap:6px;margin:0 0 10px}',
    '#stRoot .st-tabs button{flex:1;border:1px solid #d8d8de;border-radius:10px;background:#fff;padding:8px 0;font-size:13.5px;font-weight:700;color:#55555f;cursor:pointer}',
    '#stRoot .st-tabs button.on{background:#5b3df5;border-color:#5b3df5;color:#fff}',
    '#stRoot .st-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
    '#stRoot .st-t{position:relative;aspect-ratio:9/16;background:#111;border-radius:10px;overflow:hidden;cursor:pointer}',
    '#stRoot .st-t img,#stRoot .st-t video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}',
    '#stRoot .st-v{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.6);color:#fff;border-radius:8px;font-size:11px;padding:2px 6px}',
    '#stRoot .st-c{position:absolute;right:4px;top:4px;width:34px;height:34px;display:flex;align-items:center;justify-content:center}',
    '#stRoot .st-c input{width:20px;height:20px;accent-color:#5b3df5}',
    '#stRoot .st-t.on{outline:3px solid #5b3df5;outline-offset:-3px}',
    '#stMsg{font-size:13px;margin:0 2px 10px;display:none;line-height:1.5}',
    '#stView{position:fixed;inset:0;z-index:99999;background:#000;display:none;flex-direction:column}',
    '#stView .sv-top{display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;color:#fff;font-size:13px}',
    '#stView .sv-top button{border:0;background:rgba(255,255,255,.15);color:#fff;border-radius:50%;width:38px;height:38px;font-size:16px}',
    '#stView .sv-media{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}',
    '#stView .sv-media img,#stView .sv-media video{max-width:100%;max-height:100%}',
    '#stView .sv-bar{display:flex;gap:10px;padding:12px 12px calc(14px + env(safe-area-inset-bottom,0px))}',
    '#stView .sv-bar button{flex:1;border:0;border-radius:12px;background:#5b3df5;color:#fff;font-weight:700;font-size:15px;min-height:46px}',
    '[data-mode="dark"] #stRoot{color:#eee}',
    '[data-mode="dark"] #stRoot .st-box,[data-mode="dark"] #stRoot .st-tabs button{background:#1e1e26;border-color:#33333f;color:#ddd}',
    '[data-mode="dark"] #stRoot .st-box p,[data-mode="dark"] #stRoot .st-box li{color:#b5b5c2}',
    '[data-mode="dark"] #stRoot code{background:#2b2b36}',
    '[data-mode="dark"] #stRoot .st-tabs button.on{background:#5b3df5;color:#fff}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- drawing ---------- */
  function draw(){
    var root = $('#stRoot'); if (!root) return;
    var vis = visible(), nSel = Object.keys(S_.sel).filter(function(k){ return S_.sel[k]; }).length;
    var nP = S_.items.filter(function(x){ return !x.vid; }).length, nV = S_.items.length - nP;
    root.innerHTML =
      '<div class="st-box"><h4>📥 WhatsApp Status Saver</h4>' +
        '<p>Pehle WhatsApp me status <b>dekho</b> (tabhi wo phone me aata hai), phir yahan folder chuno:</p>' +
        '<p><code>Android › media › com.whatsapp › WhatsApp › Media › .Statuses</code></p>' +
        '<p style="font-size:12px">WhatsApp Business ho to <code>com.whatsapp.w4b</code>. Folder ek baar chunne ke baad “Pichla folder” se seedha khulega.</p>' +
        '<div class="st-row">' +
          (HAS_DIR ? '<button class="st-btn" id="stPick">📂 Status folder chuno</button>' : '') +
          (HAS_DIR && S_.saved ? '<button class="st-btn gr" id="stReopen">🔄 Pichla folder / Refresh</button>' : '') +
          '<button class="st-btn gr" id="stPickFiles">🖼️ Files chuno</button>' +
        '</div>' +
        (HAS_DIR ? '' : '<p style="color:#c62828">Is browser me folder-picker nahi hai — “Files chuno” use karo (ya Chrome me kholo).</p>') +
        '<input type="file" id="stFiles" accept="image/*,video/*" multiple style="display:none"></div>' +
      '<div id="stMsg"></div>' +
      (S_.busy ? '<div class="st-box" id="stBusy" style="text-align:center;font-weight:700">' + esc(S_.busy) + '</div>' : '') +
      (S_.items.length ? (
        '<div class="st-tabs"><button data-f="all" class="' + (S_.filter === 'all' ? 'on' : '') + '">Sab (' + S_.items.length + ')</button>' +
          '<button data-f="img" class="' + (S_.filter === 'img' ? 'on' : '') + '">Photos (' + nP + ')</button>' +
          '<button data-f="vid" class="' + (S_.filter === 'vid' ? 'on' : '') + '">Videos (' + nV + ')</button></div>' +
        '<div class="st-row" style="margin:0 0 10px"><button class="st-btn gr" id="stAll">' + (nSel === vis.length && vis.length ? 'Select hatao' : 'Sab select') + '</button>' +
          '<button class="st-btn" id="stCopy">📁 Folder me copy (' + (nSel || vis.length) + ')</button>' +
          '<button class="st-btn gr" id="stDl">⬇️ Download (' + (nSel || vis.length) + ')</button></div>' +
        '<div class="st-grid">' + vis.map(function(x){
          var it = x.it, on = !!S_.sel[x.i];
          return '<div class="st-t' + (on ? ' on' : '') + '" data-o="' + x.i + '">' +
            (it.vid ? '<video src="' + it.url + '#t=0.1" preload="metadata" muted playsinline></video><span class="st-v">▶ Video</span>' : '<img loading="lazy" src="' + it.url + '" alt="">') +
            '<label class="st-c"><input type="checkbox" data-c="' + x.i + '"' + (on ? ' checked' : '') + '></label></div>';
        }).join('') + '</div>'
      ) : '<div class="st-box" style="text-align:center;color:#77778a">Abhi koi status load nahi hua.</div>');
    var m = $('#stMsg', root); if (m && S_.msg){ m.textContent = S_.msg; m.style.color = S_.msgErr ? '#c62828' : '#2e7d32'; m.style.display = 'block'; }
  }
  function bind(){
    var root = $('#stRoot'); if (!root || root.__b) return; root.__b = 1;
    root.addEventListener('change', function(e){
      if (e.target.id === 'stFiles'){
        var fs = [].slice.call(e.target.files || []); if (!fs.length) return;
        setFiles(fs, 'chuni hui files'); say(S_.items.length + ' file load hui.'); draw(); return;
      }
      var c = e.target.closest && e.target.closest('[data-c]'); if (c){ S_.sel[c.dataset.c] = c.checked; draw(); }
    });
    root.addEventListener('click', function(e){
      var t = e.target;
      if (t.closest('#stPick')) return pickFolder();
      if (t.closest('#stReopen')) return reopen();
      if (t.closest('#stPickFiles')) return pickFiles();
      if (t.closest('#stCopy')) return copyToFolder();
      if (t.closest('#stDl')){ var l = targets(); return l.length ? saveEach(l) : say('Pehle status load karo.', true); }
      if (t.closest('#stAll')){
        var vis = visible(), all = vis.length && vis.every(function(x){ return S_.sel[x.i]; });
        vis.forEach(function(x){ S_.sel[x.i] = !all; }); return draw();
      }
      var f = t.closest('[data-f]'); if (f){ S_.filter = f.dataset.f; return draw(); }
      if (t.closest('.st-c')) return;                       // checkbox handled by 'change'
      var o = t.closest('[data-o]'); if (o) openViewer(+o.dataset.o);
    });
  }
  window.vStatuses = function(){ return '<div id="stRoot"></div>'; };
  window.statusesAfter = function(){
    bind(); draw();
    if (HAS_DIR) kvGet('dir').then(function(h){ if (h && !S_.saved){ S_.saved = true; if ($('#stRoot')) draw(); } });
  };

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="statuses"]')) return;
    var anchor = nav.querySelector('[data-v="websites"]') || nav.querySelector('[data-v="youtube"]') || nav.querySelector('[data-v="music"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'statuses'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '📥').replace('Updates', 'Status Saver'); });
    anchor.after(b);
  })();
})();
