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
     Host phone folder chunta hai -> 6-digit code milta hai -> dusra phone code daalta hai -> us folder ka file manager khulta hai.
     Files seedhe phone se phone jaati hain; server sirf shuru ka handshake karta hai. */
  var R = { role:'', st:'', stBad:false, code:'', pc:null, dc:null, root:null, rootName:'', allowPut:true, cwd:'/', items:null, loading:false, dl:null, up:null, prog:'', log:[], codeIn:'', poll:null, on:false };
  var CH = 16384, HAS_DIR = typeof window.showDirectoryPicker === 'function', HAS_RTC = typeof window.RTCPeerConnection === 'function';
  function newPc(){ return new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] }); }
  function gather(pc){
    return new Promise(function(res){
      if (pc.iceGatheringState === 'complete') return res();
      var t = setTimeout(done, 4500);
      function done(){ clearTimeout(t); pc.removeEventListener('icegatheringstatechange', ch); res(); }
      function ch(){ if (pc.iceGatheringState === 'complete') done(); }
      pc.addEventListener('icegatheringstatechange', ch);
    });
  }
  function sendJ(o){ if (R.dc && R.dc.readyState === 'open') R.dc.send(JSON.stringify(o)); }
  function sendBin(buf){
    return new Promise(function(res){
      (function go(){
        var dc = R.dc; if (!dc || dc.readyState !== 'open') return res(false);
        if (dc.bufferedAmount > 1048576){ dc.bufferedAmountLowThreshold = 262144; var f = function(){ dc.removeEventListener('bufferedamountlow', f); go(); }; dc.addEventListener('bufferedamountlow', f); return; }
        try { dc.send(buf); res(true); } catch(e){ res(false); }
      })();
    });
  }
  function fmt(n){ n = +n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; }
  function setSt(m, bad){ R.st = m; R.stBad = !!bad; var el = $('#rtcSt'); if (el){ el.textContent = m; el.className = 'fx-msg' + (bad ? ' e' : ''); } }
  function setProg(m){ R.prog = m; var el = $('#rtcProg'); if (el) el.textContent = m; }
  function logLine(m){ R.log.unshift(m); R.log = R.log.slice(0, 8); var el = $('#rtcLog'); if (el) el.innerHTML = R.log.map(esc).join('<br>'); }
  function rtcReset(){
    clearInterval(R.poll); R.poll = null;
    if (R.code && R.role === 'host' && !R.on){ try { callServer({ action:'rtcClose', token:S.token, code:R.code }); } catch(e){} }
    try { if (R.dc) R.dc.close(); } catch(e){} try { if (R.pc) R.pc.close(); } catch(e){}
    R.role = ''; R.st = ''; R.stBad = false; R.code = ''; R.pc = null; R.dc = null; R.root = null; R.rootName = ''; R.cwd = '/'; R.items = null; R.loading = false; R.dl = null; R.up = null; R.prog = ''; R.log = []; R.on = false;
  }
  function watch(pc){
    pc.onconnectionstatechange = function(){
      var s = pc.connectionState;
      if (s === 'connected'){ R.on = true; clearInterval(R.poll); setSt('✓ Connected'); rtcDraw(); }
      else if ((s === 'failed' || s === 'disconnected' || s === 'closed') && R.pc === pc){
        R.on = false; setSt(s === 'failed' ? 'Connection nahi ban paya (dono phone ek hi WiFi par rakho) ' : 'Connection toot gaya', true); rtcDraw();
      }
    };
  }
  function haveNet(){ if (!HAS_RTC){ say('Ye browser phone-to-phone connection support nahi karta.', true); return false; } if (typeof S === 'undefined' || !S.token){ say('Pehle login karo.', true); return false; } return true; }

  /* ----- host: folder -> offer -> code ----- */
  function pickRoot(){
    if (!haveNet()) return;
    R.allowPut = !$('#rtcAllow') || $('#rtcAllow').checked;
    if (HAS_DIR){
      window.showDirectoryPicker({ mode:R.allowPut ? 'readwrite' : 'read' }).then(function(h){ startHost({ dir:h }, h.name || 'Folder'); }, function(e){ if (e && e.name !== 'AbortError') setSt('Folder nahi khul paya: ' + (e.message || e), true); });
    } else { var i = $('#rtcFiles'); if (i){ i.value = ''; i.click(); } }
  }
  function startHost(root, name){
    rtcReset(); R.role = 'host'; R.root = root; R.rootName = name; setSt('Code ban raha hai…'); rtcDraw();
    var pc = newPc(); R.pc = pc; watch(pc);
    var dc = pc.createDataChannel('ks'); hostChannel(dc);
    pc.createOffer().then(function(o){ return pc.setLocalDescription(o); }).then(function(){ return gather(pc); })
      .then(function(){ return callServer({ action:'rtcHost', token:S.token, offer:JSON.stringify(pc.localDescription) }); })
      .then(function(j){
        if (!j || !j.ok) throw new Error((j && j.error) || 'Server se code nahi mila');
        if (R.pc !== pc) return;
        R.code = j.code; setSt('Ye code dusre phone me daalo (10 minute chalega)'); rtcDraw();
        var t0 = Date.now();
        R.poll = setInterval(function(){
          if (Date.now() - t0 > 600000){ clearInterval(R.poll); setSt('Code expire ho gaya — dobara share karo', true); return; }
          callServer({ action:'rtcPoll', token:S.token, code:R.code }).then(function(a){
            if (R.pc !== pc || !a || !a.ok) return;
            if (a.gone){ clearInterval(R.poll); return; }
            if (a.answer){ clearInterval(R.poll); setSt('Judh raha hai…'); pc.setRemoteDescription(JSON.parse(a.answer)).catch(function(e){ setSt('Judne me galti: ' + e.message, true); }); }
          }, function(){});
        }, 1500);
      }).catch(function(e){ if (R.pc === pc){ setSt((e && e.message) || 'Galti hui', true); rtcDraw(); } });
  }
  function hostChannel(dc){
    dc.binaryType = 'arraybuffer'; R.dc = dc;
    dc.onopen = function(){ logLine('Dusra phone juda'); };
    dc.onclose = function(){ logLine('Dusra phone hat gaya'); };
    dc.onmessage = function(e){ hostMsg(e.data).catch(function(err){ sendJ({ t:'err', msg:(err && err.message) || 'Galti' }); }); };
  }
  function parts(p){ var a = String(p || '/').split('/').filter(Boolean); if (a.some(function(x){ return x === '.' || x === '..'; })) throw new Error('Galat path'); return a; }
  async function dirAt(path){ var h = R.root.dir; var a = parts(path); for (var i = 0; i < a.length; i++) h = await h.getDirectoryHandle(a[i]); return h; }
  async function hostMsg(d){
    if (typeof d !== 'string'){                                   // binary = a chunk of a file being uploaded to this phone
      var u = R.up; if (!u) return; u.got += d.byteLength; u.chain = u.chain.then(function(){ return u.w.write(d); }); return;
    }
    var m = JSON.parse(d);
    if (m.t === 'ls'){
      var out = [];
      if (R.root.files){ if (parts(m.path).length) throw new Error('Folder nahi mila'); R.root.files.forEach(function(f){ out.push({ n:f.name, d:0, s:f.size }); }); }
      else {
        var dir = await dirAt(m.path), n = 0;
        for await (var ent of dir.entries()){
          if (++n > 1000) break;
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
      sendJ({ t:'meta', name:file.name, size:file.size }); logLine('⬇ bheja ja raha: ' + file.name);
      for (var off = 0; off < file.size; off += CH){
        var buf = await file.slice(off, off + CH).arrayBuffer();
        if (!(await sendBin(buf))) return;
      }
      sendJ({ t:'end' }); logLine('✓ bhej diya: ' + file.name); return;
    }
    if (m.t === 'put'){
      if (!R.allowPut || R.root.files) throw new Error('Is phone par upload allow nahi hai');
      var pa = parts(m.path), nm = String(m.name || '').replace(/[\/\\]/g, '_'); if (!nm || nm === '.' || nm === '..') throw new Error('File ka naam galat');
      var ph = R.root.dir; for (var q = 0; q < pa.length; q++) ph = await ph.getDirectoryHandle(pa[q]);
      var fh = await ph.getFileHandle(nm, { create:true }), w = await fh.createWritable();
      R.up = { w:w, got:0, chain:Promise.resolve(), name:nm }; logLine('⬆ aa rahi: ' + nm); return;
    }
    if (m.t === 'end' && R.up){
      var up = R.up; R.up = null; await up.chain; await up.w.close(); logLine('✓ mil gayi: ' + up.name); sendJ({ t:'ok', name:up.name }); return;
    }
  }

  /* ----- guest: code -> answer -> browse ----- */
  function guestJoin(code){
    if (!haveNet()) return; code = String(code || '').replace(/\D/g, '');
    if (code.length !== 6){ say('6 ank ka code daalo', true); return; }
    rtcReset(); R.role = 'guest'; setSt('Judh raha hai…'); rtcDraw();
    var pc = newPc(); R.pc = pc; watch(pc);
    pc.ondatachannel = function(e){ guestChannel(e.channel); };
    callServer({ action:'rtcJoin', token:S.token, code:code }).then(function(j){
      if (!j || !j.ok) throw new Error((j && j.error) || 'Code galat hai');
      return pc.setRemoteDescription(JSON.parse(j.offer));
    }).then(function(){ return pc.createAnswer(); }).then(function(a){ return pc.setLocalDescription(a); }).then(function(){ return gather(pc); })
      .then(function(){ return callServer({ action:'rtcAnswer', token:S.token, code:code, answer:JSON.stringify(pc.localDescription) }); })
      .then(function(j){ if (!j || !j.ok) throw new Error((j && j.error) || 'Answer nahi gaya'); setSt('Connect ho raha hai…'); })
      .catch(function(e){ if (R.pc === pc){ setSt((e && e.message) || 'Galti hui', true); R.role = ''; try { pc.close(); } catch(x){} rtcDraw(); } });
  }
  function guestChannel(dc){
    dc.binaryType = 'arraybuffer'; R.dc = dc;
    dc.onopen = function(){ R.on = true; setSt('✓ Connected'); ls('/'); };
    dc.onclose = function(){ R.on = false; setSt('Connection toot gaya', true); rtcDraw(); };
    dc.onmessage = function(e){ guestMsg(e.data); };
  }
  function ls(path){ R.cwd = path; R.items = []; R.loading = true; sendJ({ t:'ls', path:path }); rtcDraw(); }
  function guestMsg(d){
    if (typeof d !== 'string'){ if (R.dl){ R.dl.parts.push(d); R.dl.got += d.byteLength; setProg('⬇ ' + R.dl.name + ' — ' + fmt(R.dl.got) + ' / ' + fmt(R.dl.size)); } return; }
    var m = JSON.parse(d);
    if (m.t === 'ls'){ if (m.path !== R.cwd) return; R.items = R.items.concat(m.items || []); if (!m.more) R.loading = false; rtcDraw(); }
    else if (m.t === 'meta'){ R.dl = { name:m.name, size:m.size, got:0, parts:[] }; setProg('⬇ ' + m.name + ' — 0 / ' + fmt(m.size)); }
    else if (m.t === 'end' && R.dl){
      var dl = R.dl; R.dl = null; var url = URL.createObjectURL(new Blob(dl.parts)), a = document.createElement('a');
      a.href = url; a.download = dl.name; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
      setProg('✓ Download ho gayi: ' + dl.name);
    }
    else if (m.t === 'ok'){ setProg('✓ Upload ho gayi: ' + m.name); ls(R.cwd); }
    else if (m.t === 'err'){ R.loading = false; R.dl = null; setProg('⚠ ' + m.msg); rtcDraw(); }
  }
  async function upload(file){
    if (!file || !R.on) return;
    sendJ({ t:'put', path:R.cwd, name:file.name, size:file.size });
    for (var off = 0; off < file.size; off += CH){
      var buf = await file.slice(off, off + CH).arrayBuffer(); if (!(await sendBin(buf))) return setProg('⚠ Upload beech me ruk gayi');
      if ((off / CH) % 40 === 0) setProg('⬆ ' + file.name + ' — ' + fmt(off) + ' / ' + fmt(file.size));
    }
    sendJ({ t:'end' }); setProg('Upload ho rahi… ' + file.name);
  }
  function join(a, b){ return (a === '/' ? '' : a) + '/' + b; }
  function up1(p){ var a = p.split('/').filter(Boolean); a.pop(); return '/' + a.join('/'); }

  function rtcDraw(){
    var box = $('#fxRtc'); if (!box) return;
    var h = '<div class="fx-box"><h3>A · Website se share (bina koi app)</h3>';
    if (!HAS_RTC) h += '<div class="fx-msg e">Ye browser is feature ko support nahi karta. Chrome / Safari update karo.</div>';
    else if (!R.role){
      h += '<div class="fx-sub">Dono phone par yahi website kholo. Jis phone ki files dikhani hain wo <b>Share</b> dabaye, doosra phone code daalke <b>Judo</b> dabaye.</div>' +
        '<div class="fx-act" style="margin-top:4px"><button class="fx-btn" id="rtcShare" type="button">📤 Is phone ko share karo</button></div>' +
        '<label style="display:flex;gap:8px;align-items:center;font-weight:600;margin-top:10px"><input type="checkbox" id="rtcAllow" style="width:auto"' + (R.allowPut ? ' checked' : '') + '> Dusra phone yahan files upload bhi kar sake</label>' +
        (HAS_DIR ? '' : '<div class="fx-sub" style="margin-top:6px">Ye browser poora folder share nahi karta (iPhone) — aap sirf chuni hui files share kar paoge. Poora file manager Android Chrome se share hota hai.</div>') +
        '<label style="margin-top:16px">Ya dusre phone ka code daalo</label><div class="fx-row"><div><input id="rtcCode" inputmode="numeric" maxlength="6" placeholder="6 ank ka code" autocomplete="off" value="' + esc(R.codeIn) + '"></div><button class="fx-btn go" id="rtcJoin" type="button">🔌 Judo</button></div>' +
        '<input id="rtcFiles" type="file" multiple hidden>';
      if (R.st) h += '<div id="rtcSt" class="fx-msg' + (R.stBad ? ' e' : '') + '">' + esc(R.st) + '</div>';
    } else if (R.role === 'host'){
      h += '<div class="fx-sub">Share ho raha hai: <b>' + esc(R.rootName) + '</b>' + (R.allowPut && !R.root.files ? ' · upload allowed' : ' · sirf dekhne / download') + '</div>' +
        (R.code && !R.on ? '<div class="fx-link" style="font-size:30px;text-align:center;letter-spacing:6px">' + esc(R.code) + '</div>' : '') +
        '<div id="rtcSt" class="fx-msg' + (R.stBad ? ' e' : '') + '">' + esc(R.st) + '</div><div id="rtcLog" class="fx-sub" style="margin-top:8px">' + R.log.map(esc).join('<br>') + '</div>' +
        '<div class="fx-act"><button class="fx-btn rd" id="rtcStop" type="button">⏹ Share band karo</button></div>' +
        (R.on ? '<div class="fx-sub" style="margin-top:8px">Jab tak ye screen khuli hai tab tak dusra phone files dekh sakta hai.</div>' : '');
    } else {
      h += '<div id="rtcSt" class="fx-msg' + (R.stBad ? ' e' : '') + '">' + esc(R.st) + '</div>';
      if (R.on){
        var crumbs = '📁 ' + esc(R.cwd);
        h += '<div class="fx-act" style="align-items:center"><button class="fx-btn gr" id="rtcUp" type="button"' + (R.cwd === '/' ? ' disabled' : '') + '>⬆ Peeche</button><div style="flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + crumbs + '</div></div>' +
          (R.loading && !(R.items || []).length ? '<div class="fx-sub" style="margin-top:10px">Khul raha hai…</div>' : '') +
          (R.items || []).map(function(x, i){
            return '<div class="fx-it"><div class="t" data-r="' + i + '">' + (x.d ? '📁 ' : '📄 ') + esc(x.n) + '<small>' + (x.d ? 'Folder' : fmt(x.s)) + '</small></div>' + (x.d ? '' : '<button class="fx-ib" data-g="' + i + '" aria-label="Download">⬇</button>') + '</div>';
          }).join('') +
          (R.items && !R.loading && !R.items.length ? '<div class="fx-sub" style="margin-top:10px">Ye folder khali hai.</div>' : '') +
          '<div id="rtcProg" class="fx-msg" style="color:var(--ink,#333)">' + esc(R.prog) + '</div>' +
          '<div class="fx-act"><button class="fx-btn" id="rtcUpl" type="button">⬆ Yahan file upload karo</button><input id="rtcUpf" type="file" multiple hidden></div>';
      }
      h += '<div class="fx-act"><button class="fx-btn rd" id="rtcStop" type="button">⏹ Disconnect</button></div>';
    }
    box.innerHTML = h + '</div>';
  }
  function rtcBind(root){
    root.addEventListener('input', function(e){ if (e.target.id === 'rtcCode') R.codeIn = e.target.value; });
    root.addEventListener('change', function(e){
      if (e.target.id === 'rtcFiles' && e.target.files.length){ if (!haveNet()) return; R.allowPut = false; startHost({ files:[].slice.call(e.target.files) }, e.target.files.length + ' file(s)'); }
      if (e.target.id === 'rtcUpf'){ var fs = [].slice.call(e.target.files); e.target.value = ''; fs.reduce(function(p, f){ return p.then(function(){ return upload(f); }); }, Promise.resolve()); }
    });
    root.addEventListener('keydown', function(e){ if (e.key === 'Enter' && e.target.id === 'rtcCode') guestJoin(e.target.value); });
    root.addEventListener('click', function(e){
      var t = e.target;
      if (t.closest('#rtcShare')) return pickRoot();
      if (t.closest('#rtcJoin')) return guestJoin($('#rtcCode').value);
      if (t.closest('#rtcStop')){ rtcReset(); rtcDraw(); return; }
      if (t.closest('#rtcUp')){ ls(up1(R.cwd)); return; }
      if (t.closest('#rtcUpl')){ $('#rtcUpf').click(); return; }
      var g = t.closest('[data-g]'); if (g){ var x = R.items[+g.dataset.g]; if (x){ sendJ({ t:'get', path:join(R.cwd, x.n) }); setProg('⬇ ' + x.n + ' — shuru…'); } return; }
      var r = t.closest('[data-r]'); if (r){ var y = R.items[+r.dataset.r]; if (y && y.d) ls(join(R.cwd, y.n)); else if (y){ sendJ({ t:'get', path:join(R.cwd, y.n) }); setProg('⬇ ' + y.n + ' — shuru…'); } return; }
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
