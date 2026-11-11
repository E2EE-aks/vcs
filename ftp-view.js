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
  try { TITLES.ftp = ['FTP', 'Phone ka file manager dusre phone me kholo']; } catch(e){}
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

  /* ---------- screen ---------- */
  function draw(){
    var root = $('#ftpRoot'); if (!root) return;
    var keep = { h:$('#fxHost') ? $('#fxHost').value : F.host, p:$('#fxPort') ? $('#fxPort').value : F.port, u:$('#fxUser') ? $('#fxUser').value : F.user, w:$('#fxPass') ? $('#fxPass').value : F.pass, c:$('#fxIn') ? $('#fxIn').value : '' };
    root.innerHTML =
      '<div class="fx-box"><h3>1 · Is phone ka link banao</h3>' +
        '<div class="fx-sub">Jis phone ki files dikhani hain, uski FTP-server app ON karo aur wahan dikhne wala IP address &amp; port yahan likho.</div>' +
        '<label>IP address</label><div class="fx-row"><div><input id="fxHost" inputmode="decimal" placeholder="192.168.1.5" autocomplete="off" autocapitalize="off" value="' + esc(keep.h) + '"></div><button class="fx-btn gr" id="fxAuto" type="button">Auto</button></div>' +
        '<div class="fx-row"><div class="p"><label>Port</label><input id="fxPort" inputmode="numeric" placeholder="2121" value="' + esc(keep.p) + '"></div>' +
        '<div><label>User <span style="font-weight:400">(optional)</span></label><input id="fxUser" autocomplete="off" autocapitalize="off" value="' + esc(keep.u) + '"></div></div>' +
        '<label>Password <span style="font-weight:400">(optional)</span></label><input id="fxPass" type="password" autocomplete="new-password" value="' + esc(keep.w) + '">' +
        '<div class="fx-act"><button class="fx-btn" id="fxMake" type="button">🔗 Link banao</button></div>' +
        (F.link ? '<div class="fx-link" id="fxLink">' + esc(show(F.link)) + '</div><div class="fx-act"><button class="fx-btn gr" id="fxCopy" type="button">📋 Copy</button><button class="fx-btn gr" id="fxShare" type="button">📤 Share</button><button class="fx-btn gr" id="fxUse" type="button">⬇ Niche box me daalo</button></div>' : '') +
      '</div>' +
      '<div class="fx-box"><h3>2 · Connect karo</h3>' +
        '<div class="fx-sub">Dusre phone par pehle phone ka link yahan paste karo aur <b>Connect</b> dabao — us phone ka file manager khul jaayega.</div>' +
        '<input id="fxIn" placeholder="ftp://192.168.1.5:2121" inputmode="url" autocomplete="off" autocapitalize="off" value="' + esc(keep.c) + '">' +
        '<div class="fx-act"><button class="fx-btn go" id="fxGo" type="button">🔌 Connect</button><button class="fx-btn gr" id="fxPaste" type="button">📋 Paste</button></div>' +
        '<div id="fxMsg" class="fx-msg' + (F.err ? ' e' : '') + '">' + esc(F.msg) + '</div>' +
        (F.saved.length ? '<label style="margin-top:16px">Pichhle links</label>' + F.saved.map(function(s, i){
          return '<div class="fx-it"><div class="t" data-o="' + i + '">' + esc(s.name) + '<small>Tap karke dubara connect karo</small></div><button class="fx-ib" data-d="' + i + '" aria-label="Delete">🗑️</button></div>';
        }).join('') : '') +
      '</div>' +
      '<div class="fx-box"><h3>Kaise kaam karta hai</h3><ol>' +
        '<li>Dono phone <b>ek hi WiFi / hotspot</b> par rakho.</li>' +
        '<li>Pehle phone par koi FTP-server app (Cx File Explorer › Network › Share via FTP, ya “FTP Server”) <b>Start</b> karo.</li>' +
        '<li>Wahan dikhne wala IP &amp; port upar daalke <b>Link banao</b>, link copy/share karo.</li>' +
        '<li>Dusre phone me link box me paste karke <b>Connect</b> dabao.</li>' +
      '</ol><div class="fx-sub" style="margin-top:8px">Note: browsers FTP khud nahi chala sakte, isliye ftp:// link phone ke file manager / FTP app se khulta hai. Agar server app http:// link deti hai to wo seedha naye tab me khulta hai.</div></div>';
  }
  function bind(){
    var root = $('#ftpRoot'); if (!root || root.__b) return; root.__b = 1;
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
