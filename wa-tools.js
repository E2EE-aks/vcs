/* KS · WhatsApp menu tools  (WhatsApp ▸ ••• menu)
   📡 Status  - every service of your website: Server, Google Sheet, Translation, Google Drive link, WhatsApp, Telegram, GitHub ... up / down / connected
   📱 APK     - build the Android app (.apk) from all website files, then download it: the Android app saves it in the phone's Downloads folder
   🛠️ Work    - your own work record list: ＋ Add, ✏️ Edit, 🗑️ Delete (saved in your Google Sheet, same on every phone - like the Websites tab)
   Opened with waTools('status' | 'apk' | 'work').  Talks to tools-server.js (svcStatus, workGet, workSave) and to the existing Version-tab actions (verFiles, verBuild, verList, verTicket). */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function call(action, extra){
    return callServer(Object.assign({ action:action, token:S.token }, extra || {})).then(function(j){
      if (!j || !j.ok){ var e = new Error((j && j.error) || 'Request failed'); e.code = j && j.code; throw e; }
      return j;
    });
  }
  function authErr(e){ if (e && (e.code === 'AUTH' || e.code === 'PAYDUE' || e.code === 'EXPIRED')){ try { handleErr(e); } catch(x){} return true; } return false; }
  function when(ms){ if (!ms) return ''; var d = new Date(ms); return d.toLocaleDateString([], { day:'numeric', month:'short' }) + ' ' + d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
  function rid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function todayISO(){ var n = new Date(); return new Date(n - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

  var T = { open:false, tab:'status' };
  var ST = { data:null, err:'', busy:false, timer:null };
  var A = { ready:null, err:'', denied:false, builds:[], busy:false, track:null, msg:'', timer:null, name:'KS', id:'com.ks.app', ver:'1.0', inc:true, loaded:false, ticks:0 };
  var W = { list:[], form:null, q:'', f:'all', del:'', loaded:false, loading:false, err:'', t:null, busy:false, again:false };
  var WKEY = 'ks_workrec_v1', AKEY = 'ks_wa_apk_track', CKEY = 'ks_ver_cfg';
  try { W.list = JSON.parse(localStorage.getItem(WKEY) || '[]') || []; } catch(e){ W.list = []; }
  try { var cfg = JSON.parse(localStorage.getItem(CKEY) || 'null'); if (cfg){ if (cfg.name) A.name = String(cfg.name); if (cfg.id) A.id = String(cfg.id); if (cfg.ver) A.ver = String(cfg.ver); } } catch(e){}
  try { A.track = JSON.parse(localStorage.getItem(AKEY) || 'null'); } catch(e){ A.track = null; }

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.kwt{position:fixed;inset:0;z-index:250;background:rgba(15,23,42,.55);display:flex;align-items:stretch;justify-content:center;animation:fade .15s}',
    '.kwt-box{display:flex;flex-direction:column;width:100%;max-width:760px;background:var(--bg,#f3f5fa);color:var(--ink,#1e293b);padding-top:env(safe-area-inset-top,0px)}',
    '@media(min-width:800px){.kwt{padding:3vh 0}.kwt-box{border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4);padding-top:0}}',
    '.kwt-h{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--card,#fff);border-bottom:1px solid var(--line,#e5e9f2)}',
    '.kwt-h b{flex:1;font-size:calc(17px*var(--fs,1))}',
    '.kwt-x{flex:none;width:38px;height:38px;border-radius:50%;border:0;background:rgba(127,127,127,.15);color:inherit;font-size:17px;cursor:pointer}',
    '.kwt-tabs{display:flex;gap:6px;padding:8px 10px;background:var(--card,#fff);border-bottom:1px solid var(--line,#e5e9f2)}',
    '.kwt-tabs button{flex:1;border:0;border-radius:10px;padding:9px 6px;font-weight:700;font-size:calc(13.5px*var(--fs,1));background:rgba(127,127,127,.13);color:inherit;cursor:pointer}',
    '.kwt-tabs button.on{background:var(--brand,#4f46e5);color:var(--on-brand,#fff)}',
    '.kwt-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:12px 12px calc(20px + env(safe-area-inset-bottom,0px))}',
    '.kwt .card{background:var(--card,#fff);border:1px solid var(--line,#e5e9f2);border-radius:14px;padding:14px;margin-bottom:12px}',
    '.kwt-muted{color:var(--muted,#64748b)}',
    '.kwt-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.kwt-sp{flex:1}',
    '.kwt-btn{border:0;border-radius:11px;padding:0 16px;min-height:42px;font-weight:700;font-size:calc(14px*var(--fs,1));background:var(--brand,#4f46e5);color:var(--on-brand,#fff);cursor:pointer}',
    '.kwt-btn.sm{min-height:34px;padding:0 12px;font-size:calc(13px*var(--fs,1))}',
    '.kwt-btn.gr{background:rgba(127,127,127,.16);color:inherit}',
    '.kwt-btn.rd{background:#dc2626;color:#fff}',
    '.kwt-btn[disabled]{opacity:.55;cursor:default}',
    '.kwt label{display:block;font-size:calc(12.5px*var(--fs,1));font-weight:700;color:var(--muted,#64748b);margin:10px 0 4px}',
    '.kwt input[type=text],.kwt input[type=date],.kwt textarea{width:100%;box-sizing:border-box;border:1px solid var(--line,#d8d8de);border-radius:10px;padding:11px 12px;font:inherit;background:var(--card,#fff);color:var(--ink,#1e293b)}',
    '.kwt textarea{min-height:84px;resize:vertical}',
    '.kwt-err{color:#dc2626;font-size:calc(13px*var(--fs,1));margin-top:8px}',
    /* status */
    '.kwt-sum{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0}',
    '.kwt-chip{border-radius:20px;padding:5px 11px;font-size:calc(12.5px*var(--fs,1));font-weight:700;background:rgba(127,127,127,.14)}',
    '.kwt-ban{border-radius:12px;padding:11px 13px;font-weight:700}',
    '.kwt-ban.ok{background:#dcfce7;color:#166534}.kwt-ban.bad{background:#fee2e2;color:#991b1b}',
    'html[data-mode=dark] .kwt-ban.ok{background:#14532d;color:#bbf7d0}html[data-mode=dark] .kwt-ban.bad{background:#7f1d1d;color:#fecaca}',
    '.kwt-c{background:var(--card,#fff);border:1px solid var(--line,#e5e9f2);border-left:5px solid #94a3b8;border-radius:12px;padding:11px 12px;margin-bottom:10px}',
    '.kwt-c.s-up{border-left-color:#16a34a}.kwt-c.s-warn{border-left-color:#f59e0b}.kwt-c.s-down{border-left-color:#dc2626}.kwt-c.s-off{border-left-color:#94a3b8}',
    '.kwt-ch{display:flex;align-items:center;gap:10px}',
    '.kwt-ic{flex:none;font-size:22px;width:30px;text-align:center}',
    '.kwt-ct{flex:1;min-width:0;line-height:1.3}',
    '.kwt-ct b{display:block}',
    '.kwt-ct small{display:block;color:var(--muted,#64748b);font-size:calc(12.5px*var(--fs,1));word-break:break-word}',
    '.kwt-pill{flex:none;border-radius:20px;padding:4px 10px;font-size:calc(12px*var(--fs,1));font-weight:800;white-space:nowrap}',
    '.kwt-pill.s-up{background:#dcfce7;color:#166534}.kwt-pill.s-warn{background:#fef3c7;color:#92400e}.kwt-pill.s-down{background:#fee2e2;color:#991b1b}.kwt-pill.s-off{background:#e2e8f0;color:#475569}',
    'html[data-mode=dark] .kwt-pill.s-up{background:#14532d;color:#bbf7d0}html[data-mode=dark] .kwt-pill.s-warn{background:#78350f;color:#fde68a}html[data-mode=dark] .kwt-pill.s-down{background:#7f1d1d;color:#fecaca}html[data-mode=dark] .kwt-pill.s-off{background:#334155;color:#cbd5e1}',
    '.kwt-sub{display:flex;align-items:center;gap:8px;margin-top:7px;padding-top:7px;border-top:1px dashed var(--line,#e5e9f2);font-size:calc(13px*var(--fs,1))}',
    '.kwt-sub em{margin-left:auto;font-style:normal;color:var(--muted,#64748b);font-size:calc(12px*var(--fs,1));text-align:right}',
    '.kwt-d{flex:none;width:10px;height:10px;border-radius:50%;background:#94a3b8}.kwt-d.s-up{background:#16a34a}.kwt-d.s-warn{background:#f59e0b}.kwt-d.s-down{background:#dc2626}',
    /* apk */
    '.kwt-bar{height:8px;border-radius:6px;background:rgba(127,127,127,.2);overflow:hidden;margin-top:10px}',
    '.kwt-bar i{display:block;height:100%;width:40%;background:var(--brand,#4f46e5);border-radius:6px;animation:kwtbar 1.4s ease-in-out infinite}',
    '@keyframes kwtbar{0%{margin-left:-40%}100%{margin-left:100%}}',
    '.kwt-b{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line,#e5e9f2)}',
    '.kwt-b:first-of-type{border-top:0}',
    '.kwt-b .m{flex:1;min-width:150px;line-height:1.3}.kwt-b .m small{display:block;color:var(--muted,#64748b)}',
    /* work */
    '.kwt-w{display:flex;align-items:flex-start;gap:10px;background:var(--card,#fff);border:1px solid var(--line,#e5e9f2);border-radius:12px;padding:10px;margin-bottom:10px}',
    '.kwt-w .ck{flex:none;width:28px;height:28px;border-radius:8px;border:2px solid #94a3b8;background:none;color:#fff;font-size:15px;cursor:pointer;margin-top:2px}',
    '.kwt-w.done .ck{background:#16a34a;border-color:#16a34a}',
    '.kwt-w .t{flex:1;min-width:0;line-height:1.35}',
    '.kwt-w .t b{display:block;word-break:break-word}',
    '.kwt-w.done .t b{text-decoration:line-through;opacity:.6}',
    '.kwt-w .t small{display:block;color:var(--muted,#64748b);white-space:pre-wrap;word-break:break-word}',
    '.kwt-w .ib{flex:none;width:36px;height:36px;border:0;border-radius:9px;background:rgba(127,127,127,.14);font-size:15px;cursor:pointer}',
    '.kwt-w .cf{width:100%;margin-top:8px;padding:9px;border-radius:9px;background:rgba(220,38,38,.12)}',
    '.kwt-empty{text-align:center;color:var(--muted,#64748b);padding:30px 10px;line-height:1.6}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- shell ---------- */
  var TABS = [['status', '📡 Status'], ['apk', '📱 APK'], ['work', '🛠️ Work']];
  function shell(){
    var o = document.createElement('div'); o.id = 'kwt'; o.className = 'kwt';
    o.innerHTML = '<div class="kwt-box"><div class="kwt-h"><b id="kwtTitle"></b><button class="kwt-x" id="kwtX" aria-label="Close">✕</button></div>' +
      '<div class="kwt-tabs" id="kwtTabs"></div><div class="kwt-body" id="kwtBody"></div></div>';
    o.addEventListener('mousedown', function(e){ if (e.target === o) close(); });
    document.body.appendChild(o);
    $('#kwtX', o).onclick = close;
    $('#kwtTabs', o).onclick = function(e){ var b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); };
    $('#kwtBody', o).addEventListener('click', onClick);
    $('#kwtBody', o).addEventListener('input', onInput);
    $('#kwtBody', o).addEventListener('keydown', function(e){ if (e.key === 'Enter' && e.target.id === 'wkT') workSaveForm(); });
    return o;
  }
  function open(tab){
    if (!$('#kwt')) shell();
    T.open = true; show(tab || T.tab);
  }
  function close(){
    T.open = false; clearInterval(ST.timer); clearInterval(A.timer); ST.timer = A.timer = null;
    var o = $('#kwt'); if (o) o.remove();
  }
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && T.open) close(); });
  function show(tab){
    T.tab = tab; clearInterval(ST.timer); clearInterval(A.timer); ST.timer = A.timer = null;
    var o = $('#kwt'); if (!o) return;
    $('#kwtTitle', o).textContent = '🧰 WhatsApp tools';
    $('#kwtTabs', o).innerHTML = TABS.map(function(x){ return '<button data-t="' + x[0] + '" class="' + (x[0] === tab ? 'on' : '') + '">' + x[1] + '</button>'; }).join('');
    $('#kwtBody', o).scrollTop = 0;
    if (tab === 'status') statusOpen(); else if (tab === 'apk') apkOpen(); else workOpen();
  }
  function body(html){ var b = $('#kwtBody'); if (!b) return; var y = b.scrollTop; b.innerHTML = html; b.scrollTop = y; }
  function onClick(e){
    var t = e.target.closest('[data-a]'); if (!t) return;
    var a = t.dataset.a;
    if (a === 'stRef') statusLoad(true);
    else if (a === 'apkGo') apkGenerate();
    else if (a === 'apkRef') apkRefreshUi();
    else if (a === 'apkDl') apkDownload(t.dataset.id, t.dataset.n);
    else if (a === 'wkAdd'){ W.form = { id:'', title:'', note:'', date:todayISO(), done:false, err:'' }; W.del = ''; paintWork(); var x = $('#wkT'); if (x) x.focus(); }
    else if (a === 'wkCan'){ W.form = null; paintWork(); }
    else if (a === 'wkSave') workSaveForm();
    else if (a === 'wkTog') workToggle(t.dataset.id);
    else if (a === 'wkEd'){ var it = W.list.filter(function(x){ return x.id === t.dataset.id; })[0]; if (it){ W.form = { id:it.id, title:it.title, note:it.note || '', date:it.date || '', done:!!it.done, err:'' }; W.del = ''; paintWork(); var b = $('#kwtBody'); if (b) b.scrollTop = 0; } }
    else if (a === 'wkDel'){ W.del = t.dataset.id; paintWork(); }
    else if (a === 'wkDelNo'){ W.del = ''; paintWork(); }
    else if (a === 'wkDelYes'){ W.list = W.list.filter(function(x){ return x.id !== t.dataset.id; }); W.del = ''; workStore(); paintWork(); toast('🗑 Deleted'); }
    else if (a === 'wkF'){ W.f = t.dataset.f; paintWork(); }
  }
  function onInput(e){ if (e.target.id === 'wkQ'){ W.q = e.target.value; paintWork(true); } }

  /* =====================================================================
     📡 STATUS
     ===================================================================== */
  var STATE_TXT = { up:'🟢', warn:'🟠', down:'🔴', off:'⚪' };
  function statusOpen(){
    paintStatus(); statusLoad(false);
    ST.timer = setInterval(function(){ if (!T.open || T.tab !== 'status') return clearInterval(ST.timer); if (!document.hidden) statusLoad(false); }, 30000);
  }
  function statusLoad(force){
    if (ST.busy) return; ST.busy = true; paintStatus();
    call('svcStatus', { force: force ? 1 : 0 }).then(function(j){ ST.data = j; ST.err = ''; })
      .catch(function(e){ if (authErr(e)) return; ST.err = e.code === 'PERM' ? '🔒 ' + e.message : (e.message || 'Could not reach the server'); })
      .then(function(){ ST.busy = false; if (T.open && T.tab === 'status') paintStatus(); });
  }
  function paintStatus(){
    var d = ST.data, h = '';
    h += '<div class="kwt-row" style="margin-bottom:10px"><b style="font-size:calc(16px*var(--fs,1))">Services status</b><span class="kwt-sp"></span><button class="kwt-btn sm" data-a="stRef" ' + (ST.busy ? 'disabled' : '') + '>' + (ST.busy ? '⏳ Checking…' : '↻ Refresh') + '</button></div>';
    if (ST.err) h += '<div class="kwt-ban bad" style="margin-bottom:10px">' + esc(ST.err) + '</div>';
    if (!d){ h += ST.err ? '' : '<div class="kwt-empty">Checking all services…<br><small>Translation, Google Drive, WhatsApp, Telegram, GitHub …</small></div>'; body(h); return; }
    var s = d.sum || {}, bad = (s.down || 0) + (s.warn || 0);
    h += '<div class="kwt-ban ' + (bad ? 'bad' : 'ok') + '">' + (bad ? '⚠️ ' + bad + ' service' + (bad === 1 ? '' : 's') + ' need attention' : '✅ Everything that is set up is working') + '</div>' +
      '<div class="kwt-sum"><span class="kwt-chip">🟢 ' + (s.up || 0) + ' working</span><span class="kwt-chip">🟠 ' + (s.warn || 0) + ' partly</span><span class="kwt-chip">🔴 ' + (s.down || 0) + ' down / not connected</span><span class="kwt-chip">⚪ ' + (s.off || 0) + ' not set up</span></div>' +
      '<div class="kwt-muted" style="font-size:calc(12px*var(--fs,1));margin:8px 2px 12px">Checked ' + esc(new Date(d.at).toLocaleTimeString()) + ' · updates by itself every 30 seconds</div>';
    h += (d.items || []).map(function(c){
      return '<div class="kwt-c s-' + esc(c.state) + '"><div class="kwt-ch"><span class="kwt-ic">' + esc(c.icon || '•') + '</span><div class="kwt-ct"><b>' + esc(c.name) + '</b>' + (c.detail ? '<small>' + esc(c.detail) + '</small>' : '') + '</div>' +
        '<span class="kwt-pill s-' + esc(c.state) + '">' + (STATE_TXT[c.state] || '') + ' ' + esc(c.label) + (c.ms ? ' · ' + c.ms + ' ms' : '') + '</span></div>' +
        (c.sub || []).map(function(x){ return '<div class="kwt-sub"><span class="kwt-d s-' + esc(x.state) + '"></span><span>' + esc(x.name) + '</span><em>' + esc(x.label) + (x.ms ? ' · ' + x.ms + ' ms' : '') + (x.detail ? '<br>' + esc(x.detail) : '') + '</em></div>'; }).join('') + '</div>';
    }).join('');
    body(h);
  }

  /* =====================================================================
     📱 APK  (builds on GitHub with the existing Version-tab actions)
     ===================================================================== */
  function webFile(p){
    if (typeof verWebFile === 'function') return verWebFile(p);
    return /\.(html|js|css|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|webmanifest|mp3|wav|mp4)$/i.test(p) && !/^(server\.js|code\.gs|gas-shim\.js|google-store\.js|package(-lock)?\.json|readme\.md)$/i.test(p) && !/^(test|docs|\.github)\//i.test(p);
  }
  function bump(v){ var p = String(v || '1.0').split('.').map(function(x){ return parseInt(x, 10) || 0; }); p[p.length - 1]++; return p.join('.'); }
  function saveCfg(){
    try { localStorage.setItem(CKEY, JSON.stringify({ name:A.name, id:A.id, ver:A.ver })); } catch(e){}
    try { if (typeof VER !== 'undefined'){ VER.name = A.name; VER.id = A.id; VER.ver = A.ver; } } catch(e){}
  }
  function saveTrack(){ try { if (A.track) localStorage.setItem(AKEY, JSON.stringify(A.track)); else localStorage.removeItem(AKEY); } catch(e){} }
  function apkOpen(){
    paintApk();
    call('deployStatus').then(function(st){
      A.ready = !!st.configured; A.err = ''; A.denied = false;
      return A.ready ? apkList() : null;
    }).catch(function(e){ if (authErr(e)) return; A.denied = e.code === 'PERM'; A.err = e.message || 'Could not reach the server'; })
      .then(function(){ A.loaded = true; if (T.open && T.tab === 'apk'){ apkTrack(); paintApk(); apkWatch(); } });
  }
  function apkList(){ return call('verList').then(function(l){ A.builds = l.builds || []; }); }
  function apkRefreshUi(){ apkList().then(function(){ apkTrack(); paintApk(); apkWatch(); }).catch(function(e){ if (!authErr(e)){ A.err = e.message; paintApk(); } }); }
  function running(){ return A.builds.some(function(b){ return b.status !== 'completed'; }); }
  function apkWatch(){
    clearInterval(A.timer); A.timer = null; A.ticks = 0;
    if (!T.open || T.tab !== 'apk' || !(A.track || running())) return;
    A.timer = setInterval(function(){
      if (!T.open || T.tab !== 'apk' || ++A.ticks > 200) return clearInterval(A.timer);
      apkList().then(function(){ apkTrack(); paintApk(); if (!(A.track || running())) clearInterval(A.timer); }).catch(function(){ /* server restarting: try again next time */ });
    }, 8000);
  }
  /* look at the build we started: waiting / building / failed / ready */
  function apkTrack(){
    var tr = A.track; if (!tr) return;
    var b = A.builds.filter(function(x){ return x.id > tr.base; }).sort(function(x, y){ return x.id - y.id; })[0];
    if (!b){ A.msg = '⏳ Waiting for the build to start on GitHub…'; if (Date.now() - tr.at > 5 * 60000){ A.err = '❌ The build did not start on GitHub. Open Deploy → Version and check.'; A.track = null; saveTrack(); A.msg = ''; } return; }
    if (b.status !== 'completed'){ A.msg = '🔨 Building the APK… about 5–8 minutes. You can close this window — the build keeps running.'; return; }
    if (b.conclusion !== 'success'){ A.err = '❌ Build failed — open the log: ' + b.url; A.track = null; saveTrack(); A.msg = ''; return; }
    if (!b.asset){ tr.miss = (tr.miss || 0) + 1; if (tr.miss > 12){ A.err = '❌ The build finished but has no .apk file.'; A.track = null; saveTrack(); A.msg = ''; } return; }
    A.track = null; saveTrack(); A.msg = '';
    A.readyId = b.id; toast('✅ APK is ready — tap Download');
  }
  function apkGenerate(){
    if (A.busy) return;
    var nm = ($('#apkN') || {}).value, id = ($('#apkI') || {}).value, vr = ($('#apkV') || {}).value, ic = $('#apkInc');
    if (nm != null) A.name = nm; if (id != null) A.id = id; if (vr != null) A.ver = vr; if (ic) A.inc = !!ic.checked;
    A.busy = true; A.err = ''; A.msg = '📦 Selecting all website files…'; paintApk();
    var files, base, ver;
    call('verFiles').then(function(r){
      files = (r.files || []).map(function(f){ return f.path; }).filter(webFile);
      if (files.indexOf('index.html') < 0) throw new Error('index.html is not in the repository');
      return call('verList');
    }).then(function(l){
      A.builds = l.builds || [];
      if (running()) throw new Error('A build is already running — wait until it finishes.');
      base = Math.max.apply(null, [0].concat(A.builds.map(function(b){ return b.id; })));
      ver = A.inc ? bump(A.ver) : String(A.ver).trim();
      A.msg = '🚀 Starting the build on GitHub…'; paintApk();
      return call('verBuild', { files:files, appName:String(A.name).trim(), appId:String(A.id).trim(), version:String(ver).trim() });
    }).then(function(){
      A.ver = ver; saveCfg(); A.track = { base:base, at:Date.now() }; saveTrack(); A.msg = '🔨 Build started on GitHub…';
      toast('APK build started — about 5–8 minutes');
    }).catch(function(e){ if (authErr(e)) return; A.err = '❌ ' + (e.message || 'Could not start the build'); A.msg = ''; })
      .then(function(){ A.busy = false; if (T.open && T.tab === 'apk'){ paintApk(); apkWatch(); } });
  }
  function apkDownload(assetId, name){
    call('verTicket', { asset:String(assetId) }).then(function(r){
      var nm = String(name || 'app.apk'); if (!/\.apk$/i.test(nm)) nm += '.apk';
      var url = API_URL + '/updates/download?id=' + encodeURIComponent(r.id) + '&k=' + encodeURIComponent(r.ticket);
      if (typeof ksFileDownload === 'function') ksFileDownload(url, nm);
      else { var a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
      toast(window.KsDl && window.KsDl.download ? '⬇ Downloading ' + nm + ' — it will be saved in your Downloads folder' : '⬇ Download started');
    }).catch(function(e){ if (!authErr(e)) toast(e.message || 'Could not start the download', true); });
  }
  function paintApk(){
    var h = '';
    if (A.denied){ body('<div class="card"><b>🔒 Only the main admin can generate the APK.</b></div>'); return; }
    if (A.loaded && A.ready === false){ body('<div class="card"><h3 style="margin:0 0 6px">📱 Connect GitHub first</h3><div class="kwt-muted">Open the <b>Deploy</b> tab and connect GitHub (GITHUB_TOKEN + GITHUB_REPO on Render). The token also needs <b>Actions: Read and write</b>.</div></div>'); return; }
    var latest = A.builds.filter(function(b){ return b.status === 'completed' && b.conclusion === 'success' && b.asset; })[0];
    h += '<div class="card"><div class="kwt-row"><b style="font-size:calc(16px*var(--fs,1))">📱 Generate Android app (.apk)</b></div>' +
      '<div class="kwt-muted" style="margin:6px 0 4px;font-size:calc(13px*var(--fs,1))">All website files are packed into one Android app on GitHub (about 5–8 minutes). When it is ready, tap <b>Download</b> — in the Android app the file goes straight into your phone’s <b>Downloads</b> folder.</div>' +
      '<label>App name</label><input type="text" id="apkN" maxlength="30" value="' + esc(A.name) + '" autocomplete="off">' +
      '<label>Package id</label><input type="text" id="apkI" maxlength="60" value="' + esc(A.id) + '" autocapitalize="off" autocomplete="off">' +
      '<label>Version</label><input type="text" id="apkV" maxlength="12" value="' + esc(A.ver) + '" autocomplete="off">' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:600;color:inherit;margin-top:12px"><input type="checkbox" id="apkInc" ' + (A.inc ? 'checked' : '') + ' style="width:18px;height:18px"> Raise the version by 1 on every build</label>' +
      '<div class="kwt-row" style="margin-top:12px"><button class="kwt-btn" data-a="apkGo" ' + (A.busy || A.track || running() ? 'disabled' : '') + '>🔨 Generate APK</button>' +
      (latest ? '<button class="kwt-btn gr" data-a="apkDl" data-id="' + esc(latest.asset.id) + '" data-n="' + esc(latest.asset.name) + '">⬇ Download latest</button>' : '') + '</div>' +
      (A.msg ? '<div style="margin-top:12px;font-weight:700">' + esc(A.msg) + '</div><div class="kwt-bar"><i></i></div>' : (running() && !A.track ? '<div style="margin-top:12px;font-weight:700">🔨 A build is running on GitHub…</div><div class="kwt-bar"><i></i></div>' : '')) +
      (A.err ? '<div class="kwt-err">' + esc(A.err) + '</div>' : '') + '</div>';
    h += '<div class="card"><div class="kwt-row" style="margin-bottom:4px"><b>📦 Recent builds</b><span class="kwt-sp"></span><button class="kwt-btn gr sm" data-a="apkRef">↻ Refresh</button></div>' +
      (!A.loaded ? '<div class="kwt-muted" style="padding:10px 0">Loading…</div>' : A.builds.length ? A.builds.slice(0, 6).map(function(b){
        var run = b.status !== 'completed', ok = b.conclusion === 'success';
        return '<div class="kwt-b"><div class="m"><b style="word-break:break-word">' + esc(b.title || ('Build #' + b.no)) + '</b><small>' + esc(when(Date.parse(b.at))) + ' · ' + (run ? '⏳ Building…' : ok ? '✅ Ready' + (b.asset ? ' · ' + (b.asset.size >= 1048576 ? (b.asset.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b.asset.size / 1024)) + ' KB') : '') : '❌ Failed') + '</small></div>' +
          (b.asset ? '<button class="kwt-btn sm" data-a="apkDl" data-id="' + esc(b.asset.id) + '" data-n="' + esc(b.asset.name) + '">⬇ Download</button>' : '') + '</div>';
      }).join('') : '<div class="kwt-muted" style="padding:10px 0">No builds yet.</div>') + '</div>';
    body(h);
  }

  /* =====================================================================
     🛠️ WORK RECORD   (Add / Edit / Delete — like the Websites tab)
     ===================================================================== */
  function workCache(){ try { localStorage.setItem(WKEY, JSON.stringify(W.list)); } catch(e){} }
  function workStore(){ workCache(); clearTimeout(W.t); W.t = setTimeout(workFlush, 300); paintWorkStatus(); }
  function workFlush(){
    if (W.busy){ W.again = true; return; }
    W.busy = true; W.again = false; W.t = null;
    call('workSave', { list:W.list }).then(function(){ W.err = ''; })
      .catch(function(e){ if (authErr(e)) return; W.err = e.message || 'Could not save'; try { toast('Work could not be saved: ' + W.err, true); } catch(x){} })
      .then(function(){ W.busy = false; if (W.again) workFlush(); paintWorkStatus(); });
  }
  function workOpen(){
    paintWork();
    if (W.loading) return; W.loading = true;
    call('workGet').then(function(j){
      W.loaded = true; W.err = '';
      if (W.t || W.busy) return;                                         // I just changed something: keep mine
      var moved = ''; try { moved = localStorage.getItem(WKEY + '_moved') || ''; } catch(e){}
      if ((j.list || []).length || moved){ W.list = j.list || []; workCache(); }
      else if (W.list.length){ try { localStorage.setItem(WKEY + '_moved', '1'); } catch(e){} workFlush(); }   // first time: this phone's list moves to the Google Sheet
      else { try { localStorage.setItem(WKEY + '_moved', '1'); } catch(e){} }
    }).catch(function(e){ if (!authErr(e)) W.err = e.message || 'Could not reach the server'; })
      .then(function(){ W.loading = false; if (T.open && T.tab === 'work' && !W.form) paintWork(); else paintWorkStatus(); });
  }
  function paintWorkStatus(){
    var el = $('#wkSt'); if (!el) return;
    el.textContent = W.err ? '⚠ Not saved to Google Sheet — ' + W.err : (W.busy || W.t ? 'Saving…' : (W.loaded ? '✓ Saved in your Google Sheet · same on every phone' : ''));
    el.style.color = W.err ? '#dc2626' : '';
  }
  function workSorted(){
    return W.list.slice().sort(function(a, b){ return (a.done ? 1 : 0) - (b.done ? 1 : 0) || String(b.date || '').localeCompare(String(a.date || '')) || (b.at || 0) - (a.at || 0); });
  }
  function workToggle(id){
    var it = W.list.filter(function(x){ return x.id === id; })[0]; if (!it) return;
    it.done = !it.done; it.at = Date.now(); workStore(); paintWork();
  }
  function workSaveForm(){
    var f = W.form; if (!f) return;
    var title = ($('#wkT') || {}).value || '', note = ($('#wkN') || {}).value || '', date = ($('#wkD') || {}).value || '';
    title = title.trim();
    if (!title){ f.title = ''; f.note = note; f.date = date; f.err = 'Work ka naam / title likho'; return paintWork(); }
    if (f.id){ var it = W.list.filter(function(x){ return x.id === f.id; })[0]; if (it){ it.title = title.slice(0, 120); it.note = note.slice(0, 600); it.date = date; it.at = Date.now(); } }
    else W.list.unshift({ id:rid(), title:title.slice(0, 120), note:note.slice(0, 600), date:date, done:false, at:Date.now() });
    W.form = null; workStore(); paintWork(); toast('✓ Saved');
  }
  function paintWork(keepQ){
    var q = W.q.trim().toLowerCase(), f = W.form, all = workSorted();
    var nDone = W.list.filter(function(x){ return x.done; }).length, nPend = W.list.length - nDone;
    var shown = all.filter(function(x){ return (W.f === 'all' || (W.f === 'done' ? x.done : !x.done)) && (!q || (x.title + ' ' + (x.note || '') + ' ' + (x.date || '')).toLowerCase().indexOf(q) >= 0); });
    var h = '<div id="wkSt" class="kwt-muted" style="font-size:calc(12px*var(--fs,1));margin:0 2px 8px"></div>' +
      '<div class="kwt-row" style="margin-bottom:10px">' + (W.list.length > 4 ? '<input type="text" id="wkQ" placeholder="Search work" value="' + esc(W.q) + '" autocomplete="off" style="flex:1;min-width:0">' : '<span class="kwt-sp"></span>') + '<button class="kwt-btn" data-a="wkAdd">＋ Add</button></div>';
    if (W.list.length) h += '<div class="kwt-row" style="margin-bottom:10px">' + [['all', 'All ' + W.list.length], ['pend', '⏳ Pending ' + nPend], ['done', '✅ Done ' + nDone]].map(function(x){ return '<button class="kwt-btn sm ' + (W.f === x[0] ? '' : 'gr') + '" data-a="wkF" data-f="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (f) h += '<div class="card"><b>' + (f.id ? 'Edit work' : 'Add work') + '</b>' +
      '<label>Work / title</label><input type="text" id="wkT" maxlength="120" value="' + esc(f.title) + '" placeholder="e.g. Router config at Sharma shop" autocomplete="off">' +
      '<label>Date</label><input type="date" id="wkD" value="' + esc(f.date) + '">' +
      '<label>Details <span class="kwt-muted">(optional)</span></label><textarea id="wkN" maxlength="600" placeholder="Kya kaam kiya, kitna paisa, kiske liye…">' + esc(f.note) + '</textarea>' +
      (f.err ? '<div class="kwt-err">' + esc(f.err) + '</div>' : '') +
      '<div class="kwt-row" style="margin-top:12px"><button class="kwt-btn" data-a="wkSave">' + (f.id ? 'Update' : 'Save') + '</button><button class="kwt-btn gr" data-a="wkCan">Cancel</button></div></div>';
    h += shown.length ? shown.map(function(x){
      return '<div class="kwt-w ' + (x.done ? 'done' : '') + '" style="flex-wrap:wrap"><button class="ck" data-a="wkTog" data-id="' + esc(x.id) + '" aria-label="Mark done">' + (x.done ? '✓' : '') + '</button>' +
        '<div class="t"><b>' + esc(x.title) + '</b><small>' + esc(x.date ? new Date(x.date + 'T00:00:00').toLocaleDateString([], { day:'numeric', month:'short', year:'numeric' }) : 'No date') + '</small>' + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</div>' +
        '<button class="ib" data-a="wkEd" data-id="' + esc(x.id) + '" aria-label="Edit">✏️</button><button class="ib" data-a="wkDel" data-id="' + esc(x.id) + '" aria-label="Delete">🗑️</button>' +
        (W.del === x.id ? '<div class="cf"><b>Delete “' + esc(x.title) + '”?</b><div class="kwt-row" style="margin-top:8px"><button class="kwt-btn rd sm" data-a="wkDelYes" data-id="' + esc(x.id) + '">Yes, delete</button><button class="kwt-btn gr sm" data-a="wkDelNo">Cancel</button></div></div>' : '') + '</div>';
    }).join('') : '<div class="kwt-empty">' + (W.list.length ? 'Kuch nahi mila.' : 'Abhi koi work record nahi hai.<br>Upar <b>＋ Add</b> dabake pehla work jodo.') + '</div>';
    var y = ($('#kwtBody') || {}).scrollTop; body(h); paintWorkStatus();
    if (keepQ){ var qi = $('#wkQ'); if (qi){ qi.focus(); try { qi.setSelectionRange(W.q.length, W.q.length); } catch(e){} } }
  }

  window.waTools = open;
  window.waToolsClose = close;
  /* a build started earlier is still tracked after a reload: nothing to do until the window is opened */
})();
