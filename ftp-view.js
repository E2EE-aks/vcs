/* KS · FTP tab (All Options › FTP)
   Part 1 – "Link banao": is phone ka IP (+ port, user, password) daalo -> ftp://… link ban jaata hai (Copy / Share).
   Part 2 – "Connect": dusre phone par wo link niche ke box me paste karo -> Connect dabao -> pehle phone ka file manager khul jaata hai.
   Pehle phone par koi FTP-server app (Cx File Explorer, Solid Explorer, "FTP Server", …) ON honi chahiye; dono phone ek hi WiFi par.
   Saved connections sirf is phone me (localStorage) rehte hain. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var KEY = 'ks_ftp_v1';
  var F = { host:'', port:'2121', user:'', pass:'', link:'', msg:'', err:false, saved:[], busy:'' };
  try { var o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; F.saved = Array.isArray(o.saved) ? o.saved : []; F.host = o.host || ''; F.port = o.port || '2121'; F.user = o.user || ''; } catch(e){}
  function store(){ try { localStorage.setItem(KEY, JSON.stringify({ saved:F.saved.slice(0, 30), host:F.host, port:F.port, user:F.user })); } catch(e){} }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function toastMsg(m, bad){ try { toast(m, bad); } catch(e){} }
  try { TITLES.ftp = ['FTP', 'Ek phone ki files dusre phone me kholo']; } catch(e){}
  try { NAV_GRP.ftp = 'Workspace'; } catch(e){}

  var css = document.createElement('style');
  css.textContent = [
    '#ftpRoot{color:var(--ink,#1b1b1f)}',
    '#ftpRoot .fx-box{background:var(--card,#fff);border:1px solid var(--line,#e3e3ea);border-radius:14px;padding:14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.05)}',
    '#ftpRoot .fx-box h3{margin:0 0 4px;font-size:16px}',
    '#ftpRoot .fx-sub{font-size:12.5px;color:var(--muted,#77778a);line-height:1.5;margin-bottom:8px}',
    '#ftpRoot label{display:block;font-size:12.5px;font-weight:700;color:var(--label,#55555f);margin:10px 0 4px}',
    '#ftpRoot input{width:100%;box-sizing:border-box;border:1px solid var(--inputline,#d8d8de);border-radius:10px;padding:11px 12px;font-size:15px;background:var(--card,#fff);color:var(--ink,#1b1b1f)}',
    '#ftpRoot .fx-row{display:flex;gap:8px}#ftpRoot .fx-row>div{flex:1;min-width:0}#ftpRoot .fx-row>div.p{flex:0 0 90px}',
    '#ftpRoot .fx-btn{border:0;border-radius:12px;padding:0 16px;font-weight:700;font-size:14px;background:#5b3df5;color:#fff;cursor:pointer;min-height:42px}',
    '#ftpRoot .fx-btn.gr{background:#eceaf8;color:#3b2bb5}',
    '#ftpRoot .fx-btn.rd{background:#fde8e8;color:#c62828}',
    '#ftpRoot .fx-btn.go{background:#16a34a}',
    '#ftpRoot .fx-act{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}',
    '#ftpRoot .fx-link{margin-top:12px;padding:11px 12px;border-radius:10px;background:#f1f0fc;color:#3b2bb5;font-weight:700;font-size:14px;word-break:break-all;font-family:ui-monospace,Menlo,monospace}',
    '#ftpRoot .fx-msg{margin-top:10px;font-size:13px;line-height:1.5;color:#15803d}#ftpRoot .fx-msg.e{color:#c62828}',
    '#ftpRoot .fx-it{display:flex;align-items:center;gap:10px;border:1px solid var(--line,#e3e3ea);border-radius:12px;padding:8px 8px 8px 12px;margin-top:8px}',
    '#ftpRoot .fx-it .t{flex:1;min-width:0;cursor:pointer;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#ftpRoot .fx-it .t small{display:block;font-weight:400;color:var(--muted,#77778a);font-size:12px}',
    '#ftpRoot .fx-ib{flex:none;width:36px;height:36px;border:0;border-radius:10px;background:var(--soft2,#f1f1f6);font-size:15px;cursor:pointer}',
    '#ftpRoot ol{margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.7;color:var(--muted,#55555f)}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- link helpers ---------- */
  function validHost(h){ return /^(\d{1,3}\.){3}\d{1,3}$/.test(h) ? h.split('.').every(function(n){ return +n <= 255; }) : /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(h) && h.indexOf('.') > 0; }
  function buildLink(host, port, user, pass){
    host = String(host || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/[\/\s]+$/g, '');
    if (!validHost(host)) return { err:'Sahi IP address daalo (jaise 192.168.1.5)' };
    port = String(port || '').trim() || '21';
    if (!/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535) return { err:'Port 1 se 65535 ke beech ho' };
    var cred = user ? encodeURIComponent(user) + (pass ? ':' + encodeURIComponent(pass) : '') + '@' : '';
    return { url:'ftp://' + cred + host + (port === '21' ? '' : ':' + port) + '/' };
  }
  /* any pasted text -> a normal link we can open */
  function parse(txt){
    txt = String(txt || '').trim(); if (!txt) return { err:'Pehle link paste karo' };
    var m = txt.match(/^([a-z][a-z0-9+.-]*):\/\//i), proto = m ? m[1].toLowerCase() : '';
    if (!m){                                         // plain  192.168.1.5:2121  ->  ftp
      var b = txt.match(/^([^\s:\/]+)(?::(\d{1,5}))?$/);
      if (!b || !validHost(b[1])) return { err:'Link sahi nahi hai. Aisa likho: ftp://192.168.1.5:2121' };
      return { url:'ftp://' + b[1] + (b[2] ? ':' + b[2] : '') + '/', proto:'ftp' };
    }
    if (['ftp', 'ftps', 'sftp', 'http', 'https'].indexOf(proto) < 0) return { err:'Sirf ftp://, ftps://, sftp://, http:// ya https:// link chalega' };
    try { var u = new URL(txt); if (!u.hostname) throw 0; } catch(e){ return { err:'Link sahi nahi hai' }; }
    return { url:txt, proto:proto };
  }
  function show(u){ return String(u).replace(/^([a-z]+:\/\/)[^@\/]*@/i, '$1***@'); }      // hide the password on screen
  function copy(txt){
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt).then(function(){ return true; }, function(){ return fb(); });
    return Promise.resolve(fb());
    function fb(){ try { var t = document.createElement('textarea'); t.value = txt; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); var ok = document.execCommand('copy'); t.remove(); return ok; } catch(e){ return false; } }
  }
  function say(m, err){ F.msg = m; F.err = !!err; var el = $('#fxMsg'); if (el){ el.textContent = m; el.className = 'fx-msg' + (err ? ' e' : ''); } }

  /* best-effort: this phone's WiFi IP (some browsers hide it – then type it by hand) */
  function findIp(){
    return new Promise(function(res){
      try {
        var pc = new RTCPeerConnection({ iceServers:[] }), done = false;
        function fin(v){ if (done) return; done = true; try { pc.close(); } catch(e){} res(v || ''); }
        pc.createDataChannel('x');
        pc.onicecandidate = function(e){
          if (!e.candidate){ return fin(''); }
          var m = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(e.candidate.candidate);
          if (m && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(m[1])) fin(m[1]);
        };
        pc.createOffer().then(function(o){ return pc.setLocalDescription(o); }).catch(function(){ fin(''); });
        setTimeout(function(){ fin(''); }, 2500);
      } catch(e){ res(''); }
    });
  }

  /* ---------- connect ---------- */
  function openLink(url, proto){
    var a = document.createElement('a'); a.href = url; a.rel = 'noopener';
    if (proto === 'http' || proto === 'https'){ a.target = '_blank'; }
    a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
  }
  function remember(url){
    var d = show(url); F.saved = F.saved.filter(function(x){ return x.url !== url; });
    F.saved.unshift({ url:url, name:d, at:Date.now() }); store();
  }
  function connect(txt){
    var p = parse(txt); if (p.err) return say(p.err, true);
    remember(p.url);
    if (p.proto === 'http' || p.proto === 'https'){
      say('✓ Connect ho raha hai — doosre phone ka file manager naye tab me khul raha hai.');
      openLink(p.url, p.proto);
    } else {
      copy(p.url).then(function(ok){
        say('✓ Connect ho raha hai… phone poochhe to apna file manager (Cx File Explorer / Solid Explorer / FX) chuno. Agar kuch na khule: link copy ho chuka hai' + (ok ? '' : ' (copy nahi hua — upar se select karke copy karo)') + ' — file manager me Network › FTP › Add karke paste karo.');
        openLink(p.url, p.proto);
      });
    }
    draw();
  }

  /* =====================================================================
     A · Website se share  (phone ↔ phone, WebRTC)
     Host phone folder chunta hai -> 6-digit code -> dusra phone code daalta hai -> us folder ka file manager khulta hai.
     Files seedhe phone se phone jaati hain; server sirf handshake karta hai.
     Connection toote (network gaya, screen band …) to transfer PAUSE ho jaata hai, dono phone khud dobara jud jaate hain
     aur transfer wahin se RESUME hota hai jahan ruka tha. */
  var R = { role:'', st:'', stBad:false, code:'', key:'', ver:0, pc:null, dc:null, root:null, rootName:'', allowPut:true, cwd:'/', items:null, loading:false,
            q:[], cur:null, log:[], codeIn:'', poll:null, on:false, gen:0, ep:0, lastRx:0, hb:null, wl:null, lostT:null, pairT:null, paired:false, joining:false, wake:null,
            ups:{}, upDone:{}, curUp:'', hxT:0, saved:null, saveDir:null, saveName:'' };
  var CH = 65536, BLK = 2097152, HI = 8388608, LO = 2097152, GKEY = 'ks_ftp_rtc_v1';
  var HAS_DIR = typeof window.showDirectoryPicker === 'function', HAS_RTC = typeof window.RTCPeerConnection === 'function';
  try { var sv0 = JSON.parse(localStorage.getItem(GKEY) || 'null'); if (sv0 && sv0.code && sv0.key && Date.now() - sv0.at < 86400000) R.saved = sv0; } catch(e){}
  function saveGuest(){ try { R.saved = { code:R.code, key:R.key, at:Date.now() }; localStorage.setItem(GKEY, JSON.stringify(R.saved)); } catch(e){} }
  function newPc(){ return new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }, { urls:'stun:stun1.l.google.com:19302' }] }); }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function uid8(){ return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function gather(pc){
    return new Promise(function(res){
      if (pc.iceGatheringState === 'complete') return res();
      var t = setTimeout(done, 4500);
      function done(){ clearTimeout(t); pc.removeEventListener('icegatheringstatechange', ch); res(); }
      function ch(){ if (pc.iceGatheringState === 'complete') done(); }
      pc.addEventListener('icegatheringstatechange', ch);
    });
  }
  function sendJ(o){ var dc = R.dc; if (dc && dc.readyState === 'open'){ try { dc.send(JSON.stringify(o)); } catch(e){} } }
  function sendBin(dc, buf){
    return new Promise(function(res){
      (function go(){
        if (!dc || dc.readyState !== 'open') return res(false);
        if (dc.bufferedAmount > HI){
          dc.bufferedAmountLowThreshold = LO;
          var f = function(){ dc.removeEventListener('bufferedamountlow', f); dc.removeEventListener('close', f); go(); };
          dc.addEventListener('bufferedamountlow', f); dc.addEventListener('close', f); return;
        }
        try { dc.send(buf); res(true); } catch(e){ res(false); }
      })();
    });
  }
  function fmt(n){ n = +n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; }
  function setSt(m, bad){ R.st = m; R.stBad = !!bad; var el = $('#rtcSt'); if (el){ el.textContent = m; el.className = 'fx-msg' + (bad ? ' e' : ''); } }
  function logLine(m){ R.log.unshift(m); R.log = R.log.slice(0, 8); var el = $('#rtcLog'); if (el) el.innerHTML = R.log.map(esc).join('<br>'); }
  function hostProg(txt){ var n = Date.now(); if (n - R.hxT < 400) return; R.hxT = n; var el = $('#rtcHx'); if (el) el.textContent = txt; }

  /* keep the screen awake while connected (a sleeping screen is the main reason long video transfers die) */
  function wl(on){
    try {
      if (on){ if (navigator.wakeLock && !R.wl) navigator.wakeLock.request('screen').then(function(l){ R.wl = l; l.addEventListener('release', function(){ R.wl = null; }); }, function(){}); }
      else if (R.wl){ R.wl.release(); R.wl = null; }
    } catch(e){}
  }
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && R.role && R.on) wl(true); });

  function rtcReset(){
    R.ep++; clearInterval(R.poll); clearInterval(R.hb); clearTimeout(R.lostT); clearTimeout(R.pairT); wl(false);
    if (R.wake){ var w = R.wake; R.wake = null; w(); }
    if (R.role === 'host' && R.code){ try { callServer({ action:'rtcClose', token:S.token, code:R.code }); } catch(e){} }
    var dc = R.dc, pc = R.pc; R.dc = null; R.pc = null;
    try { if (dc) dc.close(); } catch(e){} try { if (pc) pc.close(); } catch(e){}
    Object.keys(R.ups).forEach(function(k){ try { R.ups[k].w.abort(); } catch(e){} });
    R.role = ''; R.st = ''; R.stBad = false; R.code = ''; R.key = ''; R.ver = 0; R.root = null; R.rootName = ''; R.cwd = '/'; R.items = null; R.loading = false;
    R.q = []; R.cur = null; R.log = []; R.on = false; R.paired = false; R.joining = false; R.ups = {}; R.upDone = {}; R.curUp = '';
  }

  /* ---------- connection watching + automatic re-connect ---------- */
  function watch(pc){
    pc.onconnectionstatechange = function(){
      if (R.pc !== pc) return;
      var s = pc.connectionState;
      if (s === 'connected') clearTimeout(R.lostT);
      else if (s === 'failed' || s === 'closed') lost();
      else if (s === 'disconnected'){ clearTimeout(R.lostT); R.lostT = setTimeout(function(){ if (R.pc === pc && pc.connectionState !== 'connected') lost(); }, 6000); }
    };
  }
  function startHb(){
    clearInterval(R.hb); R.lastRx = Date.now();
    R.hb = setInterval(function(){ sendJ({ t:'p' }); if (R.on && Date.now() - R.lastRx > 20000) lost(); }, 4000);
  }
  function lost(){
    if (!R.role || !R.pc) return;
    R.on = false; R.gen++; clearInterval(R.hb); clearTimeout(R.lostT); clearTimeout(R.pairT); R.loading = false; R.curUp = '';
    var dc = R.dc, pc = R.pc; R.dc = null; R.pc = null;
    try { if (dc) dc.close(); } catch(e){} try { if (pc) pc.close(); } catch(e){}
    if (R.cur && R.cur.state === 'run') R.cur.state = 'pause';
    if (R.paired) setSt(navigator.onLine === false ? '📵 Network nahi hai — transfer pause hai, network aate hi apne aap chalu hoga' : '⏸ Connection toota — dobara jud raha hai, transfer wahin se chalega…', true);
    rtcDraw();
    if (R.role === 'host') setTimeout(function(){ if (R.role === 'host' && !R.pc) hostOffer(); }, 800); else guestLoop();
  }
  window.addEventListener('offline', function(){ if (R.role && R.on) lost(); });
  window.addEventListener('online', function(){
    if (!R.role) return;
    if (R.wake){ var w = R.wake; R.wake = null; w(); }
    if (R.role === 'host' && !R.on && R.paired && R.pc) setTimeout(function(){ if (!R.on) lost(); }, 1200);
  });
  function haveNet(){ if (!HAS_RTC){ say('Ye browser phone-to-phone connection support nahi karta.', true); return false; } if (typeof S === 'undefined' || !S.token){ say('Pehle login karo.', true); return false; } return true; }

  /* ----- host ----- */
  function pickRoot(){
    if (!haveNet()) return;
    R.allowPut = !$('#rtcAllow') || $('#rtcAllow').checked;
    if (HAS_DIR){
      window.showDirectoryPicker({ mode:R.allowPut ? 'readwrite' : 'read' }).then(function(h){ startHost({ dir:h }, h.name || 'Folder'); }, function(e){ if (e && e.name !== 'AbortError') setSt('Folder nahi khul paya: ' + (e.message || e), true); });
    } else { var i = $('#rtcFiles'); if (i){ i.value = ''; i.click(); } }
  }
  function startHost(root, name){
    var allow = R.allowPut; rtcReset(); R.allowPut = allow; R.role = 'host'; R.root = root; R.rootName = name; setSt('Code ban raha hai…'); rtcDraw(); hostOffer();
  }
  function hostOffer(){
    var ep = R.ep; clearInterval(R.poll);
    var pc = newPc(); R.pc = pc; watch(pc);
    hostChannel(pc.createDataChannel('ks', { ordered:true }));
    pc.createOffer().then(function(o){ return pc.setLocalDescription(o); }).then(function(){ return gather(pc); })
      .then(function(){ return callServer({ action:'rtcHost', token:S.token, code:R.code, offer:JSON.stringify(pc.localDescription) }); })
      .then(function(j){
        if (ep !== R.ep || R.pc !== pc) return;
        if (!j || !j.ok){ var e = new Error((j && j.error) || 'Server se code nahi mila'); e.fatal = j && j.code === 'RTCGONE'; throw e; }
        R.code = j.code; if (!R.on) setSt(R.paired ? '⏸ Dusre phone ka wait… (wo apne aap dobara judega)' : 'Ye code dusre phone me daalo — 2 ghante tak chalega', !!R.paired); rtcDraw(); hostPoll(pc, ep);
      }).catch(function(e){
        if (ep !== R.ep || R.pc !== pc) return;
        try { pc.close(); } catch(x){} R.pc = null;
        if (e && e.fatal){ setSt('Code expire ho gaya — dobara Share karo', true); rtcDraw(); return; }
        setSt('📵 Network nahi hai — dobara koshish ho rahi hai…', true); rtcDraw();
        setTimeout(function(){ if (ep === R.ep && R.role === 'host' && !R.pc) hostOffer(); }, 3000);
      });
  }
  function hostPoll(pc, ep){
    R.poll = setInterval(function(){
      if (ep !== R.ep || R.pc !== pc){ clearInterval(R.poll); return; }
      callServer({ action:'rtcPoll', token:S.token, code:R.code }).then(function(a){
        if (ep !== R.ep || R.pc !== pc || !a || !a.ok) return;
        if (a.gone){ clearInterval(R.poll); setSt('Code expire ho gaya — dobara Share karo', true); rtcDraw(); return; }
        if (!a.answer) return;
        clearInterval(R.poll); R.paired = true; setSt('Judh raha hai…');
        pc.setRemoteDescription(JSON.parse(a.answer)).catch(function(e){ setSt('Judne me galti: ' + e.message, true); });
        clearTimeout(R.pairT); R.pairT = setTimeout(function(){ if (R.pc === pc && !R.on) lost(); }, 40000);
      }, function(){});
    }, 2000);
  }
  function hostChannel(dc){
    dc.binaryType = 'arraybuffer'; R.dc = dc;
    dc.onopen = function(){ if (R.dc !== dc) return; R.on = true; R.gen++; R.curUp = ''; clearTimeout(R.pairT); startHb(); wl(true); setSt('✓ Connected'); logLine('Dusra phone juda'); rtcDraw(); };
    dc.onclose = function(){ if (R.dc === dc) lost(); };
    dc.onmessage = function(e){ if (R.dc !== dc) return; R.lastRx = Date.now(); hostMsg(e.data, dc).catch(function(err){ var id = ''; try { id = JSON.parse(e.data).id || ''; } catch(x){} sendJ({ t:'err', id:id, msg:(err && err.message) || 'Galti' }); }); };
  }
  function parts(p){ var a = String(p || '/').split('/').filter(Boolean); if (a.some(function(x){ return x === '.' || x === '..'; })) throw new Error('Galat path'); return a; }
  async function dirAt(path){ var h = R.root.dir, a = parts(path); for (var i = 0; i < a.length; i++) h = await h.getDirectoryHandle(a[i]); return h; }
  function upWrite(u, d){ u.got += d.byteLength; u.chain = u.chain.then(function(){ return u.w.write(d); }).catch(function(e){ u.err = e; }); }
  async function hostMsg(d, dc){
    if (typeof d !== 'string'){ var u = R.ups[R.curUp]; if (u){ upWrite(u, d); hostProg('⬆ aa rahi: ' + u.name + ' — ' + fmt(u.got) + ' / ' + fmt(u.size)); } return; }
    var m = JSON.parse(d);
    if (m.t === 'p') return;
    if (m.t === 'ls'){
      var out = [];
      if (R.root.files){ if (parts(m.path).length) throw new Error('Folder nahi mila'); R.root.files.forEach(function(f){ out.push({ n:f.name, d:0, s:f.size }); }); }
      else {
        var dir = await dirAt(m.path), n = 0;
        for await (var ent of dir.entries()){
          if (++n > 2000) break;
          if (ent[1].kind === 'directory') out.push({ n:ent[0], d:1, s:0 });
          else { var sz = 0; try { sz = (await ent[1].getFile()).size; } catch(e){} out.push({ n:ent[0], d:0, s:sz }); }
        }
      }
      out.sort(function(a, b){ return (b.d - a.d) || a.n.toLowerCase().localeCompare(b.n.toLowerCase()); });
      for (var i = 0; i < Math.max(1, out.length); i += 80) sendJ({ t:'ls', path:m.path, items:out.slice(i, i + 80), more:i + 80 < out.length });
      return;
    }
    if (m.t === 'get'){
      var a = parts(m.path), name = a.pop(), file;
      if (R.root.files) file = R.root.files.filter(function(f){ return f.name === name; })[0];
      else { var dh = R.root.dir; for (var k = 0; k < a.length; k++) dh = await dh.getDirectoryHandle(a[k]); file = await (await dh.getFileHandle(name)).getFile(); }
      if (!file) throw new Error('File nahi mili');
      var off = Math.max(0, Math.min(+m.off || 0, file.size));
      sendJ({ t:'meta', id:m.id, name:file.name, size:file.size, off:off }); logLine((off ? '⏩ phir se bhej raha: ' : '⬇ bheja ja raha: ') + file.name);
      for (var o = off; o < file.size; o += BLK){
        var ab = await file.slice(o, Math.min(o + BLK, file.size)).arrayBuffer();
        for (var p = 0; p < ab.byteLength; p += CH){
          if (!(await sendBin(dc, new Uint8Array(ab, p, Math.min(CH, ab.byteLength - p)))) || R.dc !== dc) return;     // connection dropped: guest will ask again from where it stopped
        }
        hostProg('⬇ bheja: ' + file.name + ' — ' + fmt(Math.min(o + BLK, file.size)) + ' / ' + fmt(file.size));
      }
      if (R.dc === dc){ sendJ({ t:'end', id:m.id }); logLine('✓ bhej diya: ' + file.name); }
      return;
    }
    if (m.t === 'put'){
      if (!R.allowPut || R.root.files) throw new Error('Is phone par upload allow nahi hai');
      if (R.upDone[m.id]){ sendJ({ t:'ok', id:m.id, name:R.upDone[m.id] }); return; }
      var us = R.ups[m.id];
      if (us && us.size !== m.size){ try { await us.w.abort(); } catch(e){} delete R.ups[m.id]; us = null; }
      if (!us){
        var pa = parts(m.path), nm = String(m.name || '').replace(/[\/\\]/g, '_'); if (!nm || nm === '.' || nm === '..') throw new Error('File ka naam galat');
        var ph = R.root.dir; for (var q = 0; q < pa.length; q++) ph = await ph.getDirectoryHandle(pa[q]);
        var fh = await ph.getFileHandle(nm, { create:true }), w = await fh.createWritable();
        us = R.ups[m.id] = { w:w, got:0, size:m.size, chain:Promise.resolve(), name:nm, err:null }; logLine('⬆ aa rahi: ' + nm);
      } else logLine('⏩ upload wahin se chalu: ' + us.name);
      R.curUp = m.id; sendJ({ t:'putat', id:m.id, off:us.got }); return;
    }
    if (m.t === 'end'){
      var up = R.ups[m.id]; if (!up) throw new Error('Upload nahi mila');
      if (up.got < up.size){ R.curUp = m.id; sendJ({ t:'putat', id:m.id, off:up.got }); return; }
      await up.chain; if (up.err) throw up.err;
      await up.w.close(); delete R.ups[m.id]; R.upDone[m.id] = up.name; if (R.curUp === m.id) R.curUp = '';
      logLine('✓ mil gayi: ' + up.name); sendJ({ t:'ok', id:m.id, name:up.name }); return;
    }
  }

  /* ----- guest ----- */
  function guestJoin(code, key){
    if (!haveNet()) return; code = String(code || '').replace(/\D/g, '');
    if (code.length !== 6){ say('6 ank ka code daalo', true); return; }
    var k = key || (R.saved && R.saved.code === code ? R.saved.key : '');
    rtcReset(); R.role = 'guest'; R.code = code; R.key = k; R.paired = !!k; setSt('Judh raha hai…'); rtcDraw(); guestLoop();
  }
  function guestLoop(){
    if (R.role !== 'guest' || R.joining) return;
    R.joining = true; var ep = R.ep;
    (async function(){
      while (ep === R.ep && R.role === 'guest' && !R.on){
        try { if (await guestAttempt(ep)) break; }
        catch(e){
          if (ep !== R.ep) break;
          if (e && e.fatal){ if (R.paired){ setSt(e.message, true); } else { var m = e.message; R.role = ''; setSt(m, true); } rtcDraw(); break; }
          setSt('📵 Network nahi hai — dobara koshish ho rahi hai…', true); rtcDraw();
        }
        await new Promise(function(r){ R.wake = r; setTimeout(r, 2000); });
      }
      if (ep === R.ep) R.joining = false;
    })();
  }
  async function guestAttempt(ep){
    var j = await callServer({ action:'rtcJoin', token:S.token, code:R.code, key:R.key, ver:R.ver });
    if (ep !== R.ep) return true;
    if (!j || !j.ok){ var e = new Error((j && j.error) || 'Code galat hai'); e.fatal = !!(j && (j.code === 'RTCGONE' || j.code === 'RTCBAD')); throw e; }
    if (j.wait){ if (!R.on) setSt(R.paired ? '⏸ Host ka wait ho raha hai… (wo online aate hi jud jaayega)' : 'Judh raha hai…', !!R.paired); return false; }
    var pc = newPc(); R.pc = pc; watch(pc); pc.ondatachannel = function(ev){ guestChannel(ev.channel); };
    await pc.setRemoteDescription(JSON.parse(j.offer)); var an = await pc.createAnswer(); await pc.setLocalDescription(an); await gather(pc);
    if (ep !== R.ep || R.pc !== pc) return true;
    var r = await callServer({ action:'rtcAnswer', token:S.token, code:R.code, key:R.key, ver:j.ver, answer:JSON.stringify(pc.localDescription) });
    if (!r || !r.ok){ if (R.pc === pc){ R.pc = null; try { pc.close(); } catch(x){} } var e2 = new Error((r && r.error) || 'Answer nahi gaya'); e2.fatal = !!(r && r.code === 'RTCGONE' || r && r.code === 'RTCBAD'); if (r && r.code === 'RTCVER'){ R.ver = 0; } throw e2; }
    R.key = r.key || R.key; R.ver = j.ver; R.paired = true; saveGuest(); setSt('Connect ho raha hai…'); rtcDraw();
    for (var i = 0; i < 60 && ep === R.ep && !R.on && R.pc === pc; i++) await sleep(500);
    if (R.on) return true;
    if (R.pc === pc){ R.pc = null; try { pc.close(); } catch(x){} }
    return false;
  }
  function guestChannel(dc){
    dc.binaryType = 'arraybuffer'; R.dc = dc;
    dc.onopen = function(){
      if (R.dc !== dc) return; R.on = true; R.gen++; startHb(); wl(true); setSt('✓ Connected'); R.joining = false;
      ls(R.cwd); if (R.cur) startTask(R.cur); else pump(); rtcDraw();
    };
    dc.onclose = function(){ if (R.dc === dc) lost(); };
    dc.onmessage = function(e){ if (R.dc !== dc) return; R.lastRx = Date.now(); guestMsg(e.data); };
  }
  function ls(path){ R.cwd = path; R.items = []; R.loading = true; sendJ({ t:'ls', path:path }); rtcDraw(); }

  /* transfers: a queue; each task remembers how far it got, so after a reconnect it carries on from there */
  function addDl(path, name, size){ R.q.push({ k:'dl', id:uid8(), path:path, name:name, size:size || 0, got:0, blob:new Blob([]), pend:[], pb:0, state:'wait', sp:0, tt:0, tb:0, disk:!!R.saveDir, w:null, chain:null, err:null }); rtcDraw(); pump(); }
  /* badi file (GB me) seedhe phone ki storage me likhi jaati hai — memory me jama nahi hoti */
  async function openDisk(t){
    if (t.w) return;
    var base = t.name.replace(/[\/\\]/g, '_'), nm = base, n = 0;
    for (;;){ try { await R.saveDir.getFileHandle(nm); n++; var dot = base.lastIndexOf('.'); nm = dot > 0 ? base.slice(0, dot) + ' (' + n + ')' + base.slice(dot) : base + ' (' + n + ')'; } catch(e){ break; } }
    var fh = await R.saveDir.getFileHandle(nm, { create:true }); t.w = await fh.createWritable(); t.saved = nm; t.chain = Promise.resolve();
  }
  function pickSave(){
    if (!HAS_DIR) return;
    window.showDirectoryPicker({ mode:'readwrite', id:'ksdl' }).then(function(h){ R.saveDir = h; R.saveName = h.name || 'Folder'; rtcDraw(); }, function(){});
  }
  function addUp(file){ R.q.push({ k:'up', id:uid8(), file:file, name:file.name, size:file.size, dir:R.cwd, sent:0, got:0, state:'wait', sp:0, tt:0, tb:0 }); rtcDraw(); pump(); }
  function pump(){
    if (!R.on || R.cur) return;
    var t = R.q.filter(function(x){ return x.state === 'wait'; })[0]; if (!t) return;
    R.cur = t; startTask(t);
  }
  function startTask(t){
    t.state = 'run'; t.tt = Date.now(); t.tb = t.k === 'dl' ? t.got : (t.sent || 0);
    if (t.k === 'dl'){
      var g = R.gen, go = function(){ if (g === R.gen && R.cur === t) sendJ({ t:'get', id:t.id, path:t.path, off:t.got }); };
      if (t.disk) openDisk(t).then(go, function(e){ done(t, false, 'Folder me file nahi bani: ' + (e && e.message || e)); }); else go();
    }
    else sendJ({ t:'put', id:t.id, path:t.dir, name:t.name, size:t.size });
    rtcDraw();
  }
  function done(t, ok, msg){ t.state = ok ? 'done' : 'err'; t.msg = msg || ''; if (R.cur === t) R.cur = null; rtcDraw(); pump(); }
  function pos(t){ return t.k === 'dl' ? t.got : Math.max(0, Math.min(t.size, (t.sent || 0) - (R.dc ? R.dc.bufferedAmount : 0))); }
  function tick(t){
    var n = Date.now(), dt = n - t.tt; if (dt < 400) return;
    var p = pos(t), inst = (p - t.tb) / (dt / 1000); t.sp = t.sp ? t.sp * 0.6 + inst * 0.4 : inst; t.tt = n; t.tb = p;
    var bar = $('#xb-' + t.id), tx = $('#xt-' + t.id), pc = t.size ? Math.min(100, p / t.size * 100) : 0;
    if (bar) bar.style.width = pc.toFixed(1) + '%'; if (tx) tx.textContent = stText(t);
  }
  function stText(t){
    var p = pos(t), pc = t.size ? Math.floor(Math.min(100, p / t.size * 100)) : 0;
    if (t.state === 'done') return '✓ ' + fmt(t.size) + ' · ho gaya';
    if (t.state === 'err') return '⚠ ' + (t.msg || 'Galti');
    if (t.state === 'wait') return 'Line me hai…';
    if (t.state === 'pause') return '⏸ Pause · ' + pc + '% (' + fmt(p) + ' / ' + fmt(t.size) + ') — network aate hi chalega';
    return pc + '% · ' + fmt(p) + ' / ' + fmt(t.size) + (t.sp > 1024 ? ' · ' + fmt(t.sp) + '/s' : '');
  }
  function flushDl(t){ if (t.pend.length){ t.blob = new Blob([t.blob].concat(t.pend)); t.pend = []; t.pb = 0; } }
  function guestMsg(d){
    var t = R.cur;
    if (typeof d !== 'string'){ if (t && t.k === 'dl' && t.state === 'run' && t.disk){ var at = t.got; t.got += d.byteLength; t.chain = t.chain.then(function(){ return t.w.write({ type:'write', position:at, data:d }); }).catch(function(e){ t.err = e; }); tick(t); return; }
      if (t && t.k === 'dl' && t.state === 'run'){ t.pend.push(d); t.pb += d.byteLength; t.got += d.byteLength; if (t.pb >= 8388608) flushDl(t); tick(t); } return; }
    var m = JSON.parse(d);
    if (m.t === 'p') return;
    if (m.t === 'ls'){ if (m.path !== R.cwd) return; R.items = (R.items || []).concat(m.items || []); if (!m.more){ R.loading = false; } rtcDraw(); return; }
    if (m.t === 'meta'){ if (t && t.id === m.id){ t.size = m.size; t.name = m.name; if (m.off !== t.got){ t.got = m.off; if (!m.off){ t.blob = new Blob([]); t.pend = []; t.pb = 0; } } rtcDraw(); } return; }
    if (m.t === 'end'){
      if (t && t.k === 'dl' && t.id === m.id && t.disk){
        t.chain.then(function(){ if (t.err) throw t.err; return t.w.close(); }).then(function(){ t.name = t.saved || t.name; t.w = null; done(t, true); }, function(e){ done(t, false, 'Save nahi hui: ' + (e && e.message || e)); });
        return;
      }
      if (t && t.k === 'dl' && t.id === m.id){
        flushDl(t); var url = URL.createObjectURL(t.blob), a = document.createElement('a');
        a.href = url; a.download = t.name; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); t.blob = null; }, 120000); done(t, true);
      } return;
    }
    if (m.t === 'putat'){ if (t && t.k === 'up' && t.id === m.id){ upLoop(t, m.off || 0); } return; }
    if (m.t === 'ok'){ if (t && t.k === 'up' && t.id === m.id){ t.sent = t.size; var dd = t.dir; done(t, true); if (R.cwd === dd) ls(dd); } return; }
    if (m.t === 'err'){
      if (t && (!m.id || m.id === t.id)){ done(t, false, m.msg); return; }
      R.loading = false; rtcDraw(); return;
    }
  }
  async function upLoop(t, off){
    var g = R.gen, dc = R.dc, at = off; t.sent = off; t.tb = off; t.tt = Date.now();
    while (at < t.size){
      var ab = await t.file.slice(at, Math.min(at + BLK, t.size)).arrayBuffer();
      for (var i = 0; i < ab.byteLength; i += CH){
        var len = Math.min(CH, ab.byteLength - i);
        if (g !== R.gen || !(await sendBin(dc, new Uint8Array(ab, i, len)))) return;          // paused: resumes after reconnect
        t.sent += len; tick(t);
      }
      at += ab.byteLength;
    }
    if (g === R.gen) sendJ({ t:'end', id:t.id });
  }
  function join(a, b){ return (a === '/' ? '' : a) + '/' + b; }
  function up1(p){ var a = p.split('/').filter(Boolean); a.pop(); return '/' + a.join('/'); }

  function taskHtml(t){
    var pc = t.size ? Math.min(100, pos(t) / t.size * 100) : 0, col = t.state === 'err' ? '#c62828' : t.state === 'pause' ? '#b45309' : t.state === 'done' ? '#16a34a' : '#5b3df5';
    return '<div class="fx-it" style="display:block"><div style="display:flex;align-items:center;gap:8px"><div class="t" style="cursor:default">' + (t.k === 'dl' ? '⬇ ' : '⬆ ') + esc(t.name) + '<small id="xt-' + t.id + '">' + esc(stText(t)) + '</small></div>' +
      (t.state === 'err' ? '<button class="fx-ib" data-xr="' + t.id + '" aria-label="Retry">↻</button>' : '') +
      (t.state !== 'run' ? '<button class="fx-ib" data-xx="' + t.id + '" aria-label="Remove">✕</button>' : '') + '</div>' +
      '<div style="height:6px;border-radius:6px;background:#e8e8f0;margin-top:8px;overflow:hidden"><div id="xb-' + t.id + '" style="height:100%;width:' + pc.toFixed(1) + '%;background:' + col + ';transition:width .3s"></div></div></div>';
  }
  function rtcDraw(){
    var box = $('#fxRtc'); if (!box) return;
    var h = '<div class="fx-box"><h3>A · Website se share (bina koi app)</h3>';
    if (!HAS_RTC) h += '<div class="fx-msg e">Ye browser is feature ko support nahi karta. Chrome / Safari update karo.</div>';
    else if (!R.role){
      h += '<div class="fx-sub">Dono phone par yahi website kholo. Jis phone ki files dikhani hain wo <b>Share</b> dabaye, doosra phone code daalke <b>Judo</b> dabaye. Code 2 ghante tak chalta hai; ek baar judne ke baad network toote to bhi dono phone khud dobara jud jaate hain aur transfer wahin se chalta hai.</div>' +
        '<div class="fx-act" style="margin-top:4px"><button class="fx-btn" id="rtcShare" type="button">📤 Is phone ko share karo</button></div>' +
        '<label style="display:flex;gap:8px;align-items:center;font-weight:600;margin-top:10px"><input type="checkbox" id="rtcAllow" style="width:auto"' + (R.allowPut ? ' checked' : '') + '> Dusra phone yahan files upload bhi kar sake</label>' +
        (HAS_DIR ? '' : '<div class="fx-sub" style="margin-top:6px">Ye browser poora folder share nahi karta (iPhone) — aap sirf chuni hui files share kar paoge. Poora file manager Android Chrome se share hota hai.</div>') +
        '<label style="margin-top:16px">Ya dusre phone ka code daalo</label><div class="fx-row"><div><input id="rtcCode" inputmode="numeric" maxlength="6" placeholder="6 ank ka code" autocomplete="off" value="' + esc(R.codeIn) + '"></div><button class="fx-btn go" id="rtcJoin" type="button">🔌 Judo</button></div>' +
        (R.saved ? '<div class="fx-act"><button class="fx-btn gr" id="rtcResume" type="button">↻ Pichhla connection dobara jodo (' + esc(R.saved.code) + ')</button></div>' : '') +
        '<input id="rtcFiles" type="file" multiple hidden>';
      if (R.st) h += '<div id="rtcSt" class="fx-msg' + (R.stBad ? ' e' : '') + '">' + esc(R.st) + '</div>';
    } else if (R.role === 'host'){
      h += '<div class="fx-sub">Share ho raha hai: <b>' + esc(R.rootName) + '</b>' + (R.allowPut && !R.root.files ? ' · upload allowed' : ' · sirf dekhne / download') + '</div>' +
        (R.code ? '<div class="fx-link" style="' + (R.on ? 'font-size:18px' : 'font-size:30px') + ';text-align:center;letter-spacing:6px">' + esc(R.code) + '</div>' : '') +
        '<div id="rtcSt" class="fx-msg' + (R.stBad ? ' e' : '') + '">' + esc(R.st) + '</div><div id="rtcHx" class="fx-sub" style="margin-top:6px"></div><div id="rtcLog" class="fx-sub" style="margin-top:4px">' + R.log.map(esc).join('<br>') + '</div>' +
        '<div class="fx-act"><button class="fx-btn rd" id="rtcStop" type="button">⏹ Share band karo</button></div>' +
        '<div class="fx-sub" style="margin-top:8px">Jab tak ye screen khuli hai (screen on rakhne ki koshish ho rahi hai) tab tak dusra phone files dekh sakta hai. Network toote to ye khud dobara jud jaata hai.</div>';
    } else {
      h += '<div id="rtcSt" class="fx-msg' + (R.stBad ? ' e' : '') + '">' + esc(R.st) + '</div>';
      if (R.paired || R.on){
        h += '<div class="fx-act" style="align-items:center"><button class="fx-btn gr" id="rtcUp" type="button"' + (R.cwd === '/' || !R.on ? ' disabled' : '') + '>⬆ Peeche</button><div style="flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📁 ' + esc(R.cwd) + '</div></div>' +
          (R.loading && !(R.items || []).length ? '<div class="fx-sub" style="margin-top:10px">Khul raha hai…</div>' : '') +
          (R.items || []).map(function(x, i){
            return '<div class="fx-it"><div class="t" data-r="' + i + '">' + (x.d ? '📁 ' : '📄 ') + esc(x.n) + '<small>' + (x.d ? 'Folder' : fmt(x.s)) + '</small></div>' + (x.d ? '' : '<button class="fx-ib" data-g="' + i + '" aria-label="Download">⬇</button>') + '</div>';
          }).join('') +
          (R.items && !R.loading && !R.items.length ? '<div class="fx-sub" style="margin-top:10px">Ye folder khali hai.</div>' : '') +
          (HAS_DIR ? '<div class="fx-act"><button class="fx-btn gr" id="rtcSave" type="button">📂 ' + (R.saveDir ? 'Download folder: ' + esc(R.saveName) + ' (badlo)' : 'Download folder chuno (badi file / video ke liye)') + '</button></div>' : '<div class="fx-sub" style="margin-top:8px">Is browser me download memory me jama hoti hai — 1–2 GB se badi file ke liye Android Chrome use karo.</div>') +
          (R.q.length ? '<label style="margin-top:16px">Transfers</label>' + R.q.slice(-8).map(taskHtml).join('') : '') +
          '<div class="fx-act"><button class="fx-btn" id="rtcUpl" type="button"' + (R.on ? '' : ' disabled') + '>⬆ Yahan file upload karo</button><input id="rtcUpf" type="file" multiple hidden></div>';
      }
      h += '<div class="fx-act"><button class="fx-btn rd" id="rtcStop" type="button">⏹ Disconnect</button></div>';
    }
    box.innerHTML = h + '</div>';
  }
  function rtcBind(root){
    root.addEventListener('input', function(e){ if (e.target.id === 'rtcCode') R.codeIn = e.target.value; });
    root.addEventListener('change', function(e){
      if (e.target.id === 'rtcFiles' && e.target.files.length){ if (!haveNet()) return; R.allowPut = false; startHost({ files:[].slice.call(e.target.files) }, e.target.files.length + ' file(s)'); }
      if (e.target.id === 'rtcUpf'){ var fs = [].slice.call(e.target.files); e.target.value = ''; fs.forEach(addUp); }
    });
    root.addEventListener('keydown', function(e){ if (e.key === 'Enter' && e.target.id === 'rtcCode') guestJoin(e.target.value); });
    root.addEventListener('click', function(e){
      var t = e.target;
      if (t.closest('#rtcShare')) return pickRoot();
      if (t.closest('#rtcJoin')) return guestJoin($('#rtcCode').value);
      if (t.closest('#rtcResume')){ if (R.saved) guestJoin(R.saved.code, R.saved.key); return; }
      if (t.closest('#rtcStop')){ rtcReset(); rtcDraw(); return; }
      if (t.closest('#rtcSave')){ pickSave(); return; }
      if (t.closest('#rtcUp')){ if (R.on) ls(up1(R.cwd)); return; }
      if (t.closest('#rtcUpl')){ $('#rtcUpf').click(); return; }
      var xx = t.closest('[data-xx]'); if (xx){ R.q = R.q.filter(function(q){ return q.id !== xx.dataset.xx; }); rtcDraw(); return; }
      var xr = t.closest('[data-xr]'); if (xr){ var q = R.q.filter(function(z){ return z.id === xr.dataset.xr; })[0]; if (q){ q.state = 'wait'; rtcDraw(); pump(); } return; }
      var g = t.closest('[data-g]'); if (g){ var x = R.items[+g.dataset.g]; if (x) addDl(join(R.cwd, x.n), x.n, x.s); return; }
      var r = t.closest('[data-r]'); if (r){ var y = R.items[+r.dataset.r]; if (y && y.d){ if (R.on) ls(join(R.cwd, y.n)); } else if (y) addDl(join(R.cwd, y.n), y.n, y.s); return; }
    });
  }

  /* ---------- screen ---------- */
  function draw(){
    var root = $('#ftpRoot'); if (!root) return;
    var keep = { h:$('#fxHost') ? $('#fxHost').value : F.host, p:$('#fxPort') ? $('#fxPort').value : F.port, u:$('#fxUser') ? $('#fxUser').value : F.user, w:$('#fxPass') ? $('#fxPass').value : F.pass, c:$('#fxIn') ? $('#fxIn').value : '' };
    root.innerHTML = '<div id="fxRtc"></div>' +
      '<div class="fx-box"><h3>B · FTP app ke liye link banao</h3>' +
        '<div class="fx-sub">Jis phone ki files dikhani hain, uski FTP-server app ON karo aur wahan dikhne wala IP address &amp; port yahan likho.</div>' +
        '<label>IP address</label><div class="fx-row"><div><input id="fxHost" inputmode="decimal" placeholder="192.168.1.5" autocomplete="off" autocapitalize="off" value="' + esc(keep.h) + '"></div><button class="fx-btn gr" id="fxAuto" type="button">Auto</button></div>' +
        '<div class="fx-row"><div class="p"><label>Port</label><input id="fxPort" inputmode="numeric" placeholder="2121" value="' + esc(keep.p) + '"></div>' +
        '<div><label>User <span style="font-weight:400">(optional)</span></label><input id="fxUser" autocomplete="off" autocapitalize="off" value="' + esc(keep.u) + '"></div></div>' +
        '<label>Password <span style="font-weight:400">(optional)</span></label><input id="fxPass" type="password" autocomplete="new-password" value="' + esc(keep.w) + '">' +
        '<div class="fx-act"><button class="fx-btn" id="fxMake" type="button">🔗 Link banao</button></div>' +
        (F.link ? '<div class="fx-link" id="fxLink">' + esc(show(F.link)) + '</div><div class="fx-act"><button class="fx-btn gr" id="fxCopy" type="button">📋 Copy</button><button class="fx-btn gr" id="fxShare" type="button">📤 Share</button><button class="fx-btn gr" id="fxUse" type="button">⬇ Niche box me daalo</button></div>' : '') +
      '</div>' +
      '<div class="fx-box"><h3>C · FTP link se Connect karo</h3>' +
        '<div class="fx-sub">Dusre phone par pehle phone ka link yahan paste karo aur <b>Connect</b> dabao — us phone ka file manager khul jaayega.</div>' +
        '<input id="fxIn" placeholder="ftp://192.168.1.5:2121" inputmode="url" autocomplete="off" autocapitalize="off" value="' + esc(keep.c) + '">' +
        '<div class="fx-act"><button class="fx-btn go" id="fxGo" type="button">🔌 Connect</button><button class="fx-btn gr" id="fxPaste" type="button">📋 Paste</button></div>' +
        '<div id="fxMsg" class="fx-msg' + (F.err ? ' e' : '') + '">' + esc(F.msg) + '</div>' +
        (F.saved.length ? '<label style="margin-top:16px">Pichhle links</label>' + F.saved.map(function(s, i){
          return '<div class="fx-it"><div class="t" data-o="' + i + '">' + esc(s.name) + '<small>Tap karke dubara connect karo</small></div><button class="fx-ib" data-d="' + i + '" aria-label="Delete">🗑️</button></div>';
        }).join('') : '') +
      '</div>' +
      '<div class="fx-box"><h3>FTP app wala tareeka (B / C)</h3><ol>' +
        '<li>Dono phone <b>ek hi WiFi / hotspot</b> par rakho.</li>' +
        '<li>Pehle phone par koi FTP-server app (Cx File Explorer › Network › Share via FTP, ya “FTP Server”) <b>Start</b> karo.</li>' +
        '<li>Wahan dikhne wala IP &amp; port upar daalke <b>Link banao</b>, link copy/share karo.</li>' +
        '<li>Dusre phone me link box me paste karke <b>Connect</b> dabao.</li>' +
      '</ol><div class="fx-sub" style="margin-top:8px">Note: browsers FTP khud nahi chala sakte, isliye ftp:// link phone ke file manager / FTP app se khulta hai. Agar server app http:// link deti hai to wo seedha naye tab me khulta hai.</div></div>';
    rtcDraw();
  }
  function bind(){
    var root = $('#ftpRoot'); if (!root || root.__b) return; root.__b = 1;
    rtcBind(root);
    root.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ if (e.target.id === 'fxIn') connect(e.target.value); else if (/^fx(Host|Port|User|Pass)$/.test(e.target.id)) $('#fxMake', root).click(); } });
    root.addEventListener('click', function(e){
      var t = e.target;
      if (t.closest('#fxAuto')){ var b = $('#fxAuto'); b.textContent = '…'; findIp().then(function(ip){ b.textContent = 'Auto'; if (ip) $('#fxHost').value = ip; else say('IP apne aap nahi mila — FTP app me dikhne wala IP haath se likho.', true); }); return; }
      if (t.closest('#fxMake')){
        F.host = $('#fxHost').value; F.port = $('#fxPort').value; F.user = $('#fxUser').value; F.pass = $('#fxPass').value;
        var r = buildLink(F.host, F.port, F.user.trim(), F.pass); store();
        if (r.err){ F.link = ''; draw(); return say(r.err, true); }
        F.link = r.url; say(''); draw(); return;
      }
      if (t.closest('#fxCopy')){ copy(F.link).then(function(ok){ toastMsg(ok ? 'Link copy ho gaya' : 'Copy nahi hua', !ok); }); return; }
      if (t.closest('#fxShare')){ if (navigator.share) navigator.share({ title:'FTP link', text:F.link }).catch(function(){}); else copy(F.link).then(function(){ toastMsg('Link copy ho gaya'); }); return; }
      if (t.closest('#fxUse')){ $('#fxIn').value = F.link; $('#fxIn').focus(); return; }
      if (t.closest('#fxPaste')){ if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function(v){ $('#fxIn').value = (v || '').trim(); }, function(){ $('#fxIn').focus(); toastMsg('Box me long-press karke paste karo', true); }); else $('#fxIn').focus(); return; }
      if (t.closest('#fxGo')){ connect($('#fxIn').value); return; }
      var o = t.closest('[data-o]'); if (o){ var s = F.saved[+o.dataset.o]; if (s){ $('#fxIn').value = s.url; connect(s.url); } return; }
      var d = t.closest('[data-d]'); if (d){ F.saved.splice(+d.dataset.d, 1); store(); draw(); return; }
    });
  }
  window.vFtp = function(){ return '<div id="ftpRoot"></div>'; };
  window.ftpAfter = function(){ bind(); draw(); };

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="ftp"]')) return;
    var anchor = nav.querySelector('[data-v="websites"]') || nav.querySelector('[data-v="youtube"]') || nav.querySelector('[data-v="music"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'ftp'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '📡').replace('Updates', 'FTP'); });
    anchor.after(b);
  })();
})();
