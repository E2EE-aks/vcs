/* KS · WhatsApp tab  (All Options › WhatsApp) - looks and works like WhatsApp Web.
   Link your own WhatsApp with a QR code (WhatsApp ▸ Linked devices ▸ Link a device).  Then: chat list with search,
   profile photos, unread counts, full conversations (text, photos, videos, voice notes, files), delivery ticks,
   send text / photos / videos / files, start a chat with any number.  Talks to the server's wa-server.js. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var G = { st:null, chats:[], me:null, q:'', open:null, msgs:[], err:'', busy:false, starting:false, loaded:false, sigL:'', sigM:'', newOpen:false, emoji:false, contacts:null, cq:'', f:'all', hist:null, grp:{ on:false, sel:{} } };
  var POLL = null;

  try { TITLES.whatsapp = ['WhatsApp', 'Your WhatsApp, linked with a QR code — chat with anyone']; } catch(e){}

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '#waRoot{--wa-g:#25d366;--wa-d:#128c7e;--wa-bg:#efeae2;--wa-out:#d9fdd3}',
    'html[data-mode=dark] #waRoot{--wa-bg:#0b141a;--wa-out:#005c4b}',
    '#waRoot .wa-app{display:grid;grid-template-columns:minmax(300px,380px) 1fr;grid-template-rows:minmax(0,1fr);height:calc(100dvh - 135px - var(--bb-gap,0px));min-height:420px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card,#fff)}',
    '#waRoot .wa-side{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;border-right:1px solid var(--line)}',
    '#waRoot .wa-main{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--wa-bg)}',
    '#waRoot .wa-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}',
    '#waRoot .wa-top .wa-me{flex:1;min-width:0;line-height:1.25}',
    '#waRoot .wa-top .wa-me b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#waRoot .wa-top .wa-me small{opacity:.65;font-size:12px}',
    '#waRoot .wa-ic{flex:none;width:36px;height:36px;border-radius:50%;border:0;background:transparent;font-size:18px;cursor:pointer;color:inherit}',
    '#waRoot .wa-ic:hover{background:rgba(127,127,127,.15)}',
    '#waRoot .wa-srch{padding:8px 12px;border-bottom:1px solid var(--line)}',
    '#waRoot .wa-srch input{width:100%;border-radius:10px}',
    '#waRoot .wa-new{padding:10px 12px;border-bottom:1px solid var(--line);background:rgba(37,211,102,.08)}',
    '#waRoot .wa-new .row{display:flex;gap:6px;margin-top:6px}',
    '#waRoot .wa-list{flex:1 1 0;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y}',
    '#waRoot .wa-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);cursor:pointer}',
    '#waRoot .wa-row:hover{background:rgba(127,127,127,.09)}',
    '#waRoot .wa-row.on{background:rgba(37,211,102,.14)}',
    '#waRoot .wa-av{position:relative;flex:none;width:46px;height:46px;border-radius:50%;background:#6a7f8a;color:#fff;font-weight:700;font-size:19px;display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '#waRoot .wa-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
    '#waRoot .wa-av.sm{width:38px;height:38px;font-size:16px}',
    '#waRoot .wa-mid{flex:1;min-width:0}',
    '#waRoot .wa-mid b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#waRoot .wa-mid small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.7}',
    '#waRoot .wa-end{flex:none;text-align:right;font-size:12px;opacity:.9}',
    '#waRoot .wa-end em{display:inline-block;margin-top:4px;min-width:20px;padding:1px 6px;border-radius:10px;background:var(--wa-g);color:#fff;font-style:normal;font-weight:700}',
    '#waRoot .wa-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px;padding:20px;opacity:.75}',
    '#waRoot .wa-head{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--card,#fff);border-bottom:1px solid var(--line)}',
    '#waRoot .wa-back{display:none}',
    '#waRoot .wa-msgs{flex:1 1 0;min-height:0;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;overflow-y:auto;padding:12px 8%;display:flex;flex-direction:column;gap:3px}',
    '#waRoot .wa-b{position:relative;max-width:75%;padding:6px 9px 4px;border-radius:9px;word-break:break-word;white-space:pre-wrap;line-height:1.38;background:var(--card,#fff);color:inherit;box-shadow:0 1px 1px rgba(0,0,0,.13)}',
    'html[data-mode=dark] #waRoot .wa-b{background:#202c33;color:#e9edef}',
    '#waRoot .wa-b.out{align-self:flex-end;background:var(--wa-out);color:#111}',
    'html[data-mode=dark] #waRoot .wa-b.out{color:#e9edef}',
    '#waRoot .wa-b.in{align-self:flex-start}',
    '#waRoot .wa-b .wa-who{display:block;font-size:12.5px;font-weight:700;color:var(--wa-d);margin-bottom:2px}',
    '#waRoot .wa-b .wa-t{float:right;margin:6px 0 0 10px;font-size:11px;opacity:.65;white-space:nowrap}',
    '#waRoot .wa-b .wa-t i{font-style:normal;margin-left:3px;letter-spacing:-2px}',
    '#waRoot .wa-b .wa-t i.rd{color:#34b7f1;opacity:1}',
    '#waRoot .wa-b img.wa-pic,#waRoot .wa-b video{display:block;max-width:100%;max-height:320px;border-radius:7px;margin-bottom:3px;background:#000}',
    '#waRoot .wa-b img.wa-st{width:140px;height:140px;object-fit:contain;background:none}',
    '#waRoot .wa-b audio{display:block;width:240px;max-width:100%}',
    '#waRoot .wa-b a.wa-file{display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:3px;border-radius:7px;background:rgba(127,127,127,.15);color:inherit;text-decoration:none}',
    '#waRoot .wa-day{align-self:center;font-size:12px;opacity:.85;padding:3px 11px;border-radius:8px;background:var(--card,#fff);box-shadow:0 1px 1px rgba(0,0,0,.1);margin:8px 0}',
    '#waRoot .wa-comp{display:flex;align-items:flex-end;gap:6px;padding:8px 10px;background:var(--card,#fff);border-top:1px solid var(--line);position:relative}',
    '#waRoot .wa-comp textarea{flex:1;resize:none;max-height:120px;min-height:40px;border-radius:20px;padding:9px 14px}',
    '#waRoot .wa-send{flex:none;width:42px;height:42px;border-radius:50%;border:0;background:var(--wa-g);color:#fff;font-size:18px;cursor:pointer}',
    '#waRoot .wa-emo{position:absolute;left:8px;bottom:58px;width:min(320px,92%);display:grid;grid-template-columns:repeat(8,1fr);gap:2px;padding:8px;border:1px solid var(--line);border-radius:12px;background:var(--card,#fff);box-shadow:0 6px 24px rgba(0,0,0,.2);z-index:5}',
    '#waRoot .wa-emo button{border:0;background:none;font-size:22px;cursor:pointer;border-radius:6px;padding:3px}',
    '#waRoot .wa-emo button:hover{background:rgba(127,127,127,.18)}',
    '#waRoot .wa-chips{display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line)}',
    '#waRoot .wa-chips button{border:0;border-radius:16px;padding:5px 13px;background:rgba(127,127,127,.15);color:inherit;font-size:13px;cursor:pointer}',
    '#waRoot .wa-chips button.on{background:rgba(37,211,102,.25);color:var(--wa-d);font-weight:700}',
    '#waRoot .wa-clist{max-height:min(46vh,340px);overflow-y:auto;overscroll-behavior:contain;margin-top:8px;border-radius:10px;background:var(--card,#fff)}',
    '#waRoot .wa-clist .wa-row{padding:7px 10px}',
    '#waRoot .wa-clist .wa-sec{padding:5px 12px;font-size:12px;font-weight:700;color:var(--wa-d);opacity:.9}',
    '#waRoot .wa-side{position:relative}',
    '#waRoot .wa-new{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;padding:0;border:0;background:var(--card,#fff)}',
    '#waRoot .wa-new .wa-pkh{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--wa-d);color:#fff}',
    '#waRoot .wa-new .wa-pkh .wa-ic{color:#fff}',
    '#waRoot .wa-new .wa-pkh small{opacity:.85}',
    '#waRoot .wa-new .wa-clist{flex:1 1 0;min-height:0;max-height:none;margin:0;border-radius:0;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y}',
    '#waRoot .wa-fab{position:absolute;right:16px;bottom:16px;width:54px;height:54px;border-radius:16px;border:0;background:var(--wa-g);color:#fff;font-size:24px;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer;z-index:4}',
    '#waRoot .wa-more{align-self:center;margin:4px 0 8px}',
    '#waRoot .wa-title{font-size:23px;font-weight:800;color:var(--wa-g)}',
    '#waRoot .wa-plus{flex:none;height:40px;padding:0 14px;border-radius:12px;border:0;background:var(--wa-g);color:#0b141a;font-weight:800;font-size:16px;cursor:pointer}',
    '#waRoot .wa-menu{position:absolute;top:58px;right:10px;z-index:9;min-width:230px;padding:6px;border:1px solid var(--line);border-radius:14px;background:var(--card,#fff);box-shadow:0 8px 28px rgba(0,0,0,.3);display:flex;flex-direction:column}',
    '#waRoot .wa-menu.hidden{display:none}',
    '#waRoot .wa-menu button{border:0;background:none;color:inherit;text-align:left;padding:10px 12px;border-radius:8px;font-size:15px;cursor:pointer}',
    '#waRoot .wa-menu button:hover{background:rgba(127,127,127,.15)}',
    '#waRoot .wa-menu button.bad{color:#e5484d}',
    '#waRoot .wa-menu .wa-mrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--line);margin-bottom:4px}',
    '#waRoot .wa-srch input{border-radius:22px;background:rgba(127,127,127,.14);border:0;padding:10px 16px}',
    '#waRoot .wa-act{display:flex;align-items:center;gap:14px;padding:10px 14px;cursor:pointer}',
    '#waRoot .wa-act:hover{background:rgba(127,127,127,.09)}',
    '#waRoot .wa-act .wa-av{background:var(--wa-g);color:#0b141a}',
    '#waRoot .wa-gbar{position:sticky;bottom:0;padding:10px;background:var(--card,#fff);border-top:1px solid var(--line)}',
    '#waRoot .wa-chk{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid #8696a0;display:flex;align-items:center;justify-content:center;font-size:13px;color:#0b141a}',
    '#waRoot .wa-chk.on{background:var(--wa-g);border-color:var(--wa-g)}',
    '#waRoot .wa-sys{align-self:center;max-width:80%;text-align:center;font-size:12.5px;padding:4px 12px;border-radius:8px;background:var(--card,#fff);box-shadow:0 1px 1px rgba(0,0,0,.1);opacity:.95}',
    '#waRoot .wa-sys.miss{color:#d33}',
    /* login screen, like WhatsApp Web */
    '#waRoot .wa-login{display:grid;grid-template-columns:1.2fr 1fr;gap:28px;align-items:center;padding:26px;border:1px solid var(--line);border-radius:14px;background:var(--card,#fff)}',
    '#waRoot .wa-login h2{margin:0 0 14px;font-size:26px;font-weight:400}',
    '#waRoot .wa-login ol{margin:0 0 0 20px;line-height:2;font-size:16px}',
    '#waRoot .wa-qrwrap{display:flex;flex-direction:column;align-items:center;gap:10px}',
    '#waRoot .wa-qrwrap img,#waRoot .wa-qrph{width:290px;max-width:78vw;aspect-ratio:1;background:#fff;padding:10px;border-radius:12px;border:1px solid var(--line)}',
    '#waRoot .wa-qrph{display:flex;align-items:center;justify-content:center;opacity:.8;text-align:center;padding:20px;color:#444}',
    '@media(max-width:860px){',
    '#waRoot{position:fixed;left:0;right:0;top:0;bottom:calc(var(--bb-gap,0px) - 4px);z-index:100;background:var(--bg,#fff);padding-top:env(safe-area-inset-top,0px)}',
    'body.wa-conv #waRoot{bottom:0;top:var(--vvt,0px);height:var(--vvh,100dvh);padding-top:0}',
    'body.wa-conv #btmBar{display:none!important}',
    '#waRoot .wa-app{height:100%!important;min-height:0;border:0;border-radius:0}',
    '#waRoot .wa-login{margin:12px;overflow-y:auto;max-height:calc(100% - 24px)}',
    '#waRoot .wa-comp{padding-bottom:calc(8px + env(safe-area-inset-bottom,0px))}',
    '}',
    '@media(max-width:820px){',
    '#waRoot .wa-app{grid-template-columns:1fr;height:calc(100dvh - 120px - var(--bb-gap,0px))}',
    '#waRoot .wa-app .wa-main{display:none}',
    '#waRoot .wa-app.open .wa-side{display:none}',
    '#waRoot .wa-app.open .wa-main{display:flex}',
    '#waRoot .wa-back{display:inline-block}',
    '#waRoot .wa-msgs{padding:10px 8px}',
    '#waRoot .wa-b{max-width:88%}',
    '#waRoot .wa-login{grid-template-columns:1fr;padding:16px}',
    '#waRoot .wa-login h2{font-size:21px}',
    '}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- helpers ---------- */
  var enc = encodeURIComponent;
  function url(u){ return API_URL + u; }
  function title(c){ return c.name || c.number || 'WhatsApp'; }
  function ini(n){ var c = String(n || '?').replace(/^[+\s]+/, '').charAt(0) || '?'; return esc(c.toUpperCase()); }
  function avatar(c, cls){ return '<span class="wa-av ' + (cls || '') + '">' + ini(title(c)) + (c.av ? '<img loading="lazy" src="' + esc(url(c.av)) + '" alt="" onerror="this.remove()">' : '') + '</span>'; }
  function when(t){ if (!t) return ''; var d = new Date(t), n = new Date();
    try { return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }); } catch(e){ return ''; } }
  function hm(t){ try { return new Date(t).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }); } catch(e){ return ''; } }
  function dayName(t){ var d = new Date(t), n = new Date(), y = new Date(Date.now() - 86400000);
    if (d.toDateString() === n.toDateString()) return 'Today'; if (d.toDateString() === y.toDateString()) return 'Yesterday';
    try { return d.toLocaleDateString('en-IN', { day:'numeric', month:'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }); } catch(e){ return ''; } }
  function size(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  /* background calls must not flash the app's loading bar, so they skip api() */
  async function quiet(action, payload){
    var j = await callServer(Object.assign({ action: action, token: S.token, asUser: S.as || undefined }, payload || {}));
    if (!j.ok){ var e = new Error(j.error || 'Request failed'); e.code = j.code; throw e; }
    return j;
  }
  function root(){ return $('#waRoot'); }
  function link(t){ return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#027eb5">$1</a>'); }

  /* ---------- entry points used by app.js ---------- */
  window.vWhatsapp = function(){ return '<div id="waRoot"><div class="card"><div class="empty-state">Loading…</div></div></div>'; };
  window.waAfter = function(){ G.sigL = G.sigM = ''; draw(); };
  window.waReset = function(){ document.body.classList.remove('wa-conv'); clearInterval(POLL); POLL = null; G = { st:null, chats:[], me:null, q:'', open:null, msgs:[], err:'', busy:false, starting:false, loaded:false, sigL:'', sigM:'', newOpen:false, emoji:false, contacts:null, cq:'', f:'all', hist:null, grp:{ on:false, sel:{} } }; };
  window.waInit = async function(){
    try { G.st = await quiet('waStatus'); G.err = ''; }
    catch(e){ if (e.code === 'AUTH'){ return handleErr(e); } G.err = e.message || 'Could not reach the server'; G.st = G.st || { configured:true, connected:false, status:'idle' }; }
    if (S.view === 'whatsapp') draw();
    if (G.st.connected && !G.loaded) chats(true);
    clearInterval(POLL); POLL = setInterval(tick, 2500);
  };
  async function tick(){
    if (S.view !== 'whatsapp'){ clearInterval(POLL); POLL = null; return; }
    if (document.hidden) return;
    try {
      var prev = G.st && G.st.status, st = await quiet('waStatus'), was0 = G.starting, err0 = G.err; G.st = st;
      if (st.status === 'qr' || st.connected){ G.err = ''; }
      else if (st.status === 'idle'){
        if (st.error){ G.err = st.error; G.starting = false; }
        else if (G.starting && Date.now() - (G.t0 || 0) > 25000){ G.starting = false; G.err = 'The QR code could not be loaded. Tap “Show QR code” to try again.'; }
      }
      if (!st.connected && (was0 !== G.starting || err0 !== G.err)) draw();
      if (st.connected){
        if (prev !== 'open'){ G.loaded = false; G.starting = false; G.sigL = G.sigM = ''; draw(); chats(true); toast('WhatsApp connected ✓'); }
        else { await chats(true); if (G.open) await poll(); }
      } else if (st.status === 'qr' || st.status === 'starting' || prev !== st.status){ draw(); }
    } catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') handleErr(e); }
  }

  /* ---------- drawing ---------- */
  function draw(){
    var r = root(); if (!r) return; var st = G.st;
    if (!st){ r.innerHTML = '<div class="card"><div class="empty-state">Loading…</div></div>'; return; }
    if (st.configured === false){ r.innerHTML = '<div class="card"><h3>🟢 WhatsApp is not set up yet</h3><p class="muted">' + esc(st.error || 'The server needs the WhatsApp package.') + '</p><p class="muted">Make sure package.json lists <b>@whiskeysockets/baileys</b>, <b>qrcode</b> and <b>pino</b>, then redeploy the server.</p></div>'; return; }
    if (!st.connected){ var lh = loginHtml(); if (G.loginSig !== lh || !$('#waLogin')){ G.loginSig = lh; r.innerHTML = lh; } return; }
    G.loginSig = ''; if (!$('#waApp')) r.innerHTML = shellHtml();
    paintSide(true); paintMain(true);
  }
  function loginHtml(){
    var st = G.st, qr = st.status === 'qr' && st.qr, working = G.starting || st.status === 'starting' || st.status === 'qr', box;
    if (qr) box = '<img src="' + esc(st.qr) + '" alt="WhatsApp QR code"><small class="muted">The code refreshes by itself. Keep this page open.</small>';
    else if (working) box = '<div class="wa-qrph">Getting the QR code…</div>';
    else box = '<div class="wa-qrph"><button class="btn" onclick="waStart()">🟢 Show QR code</button></div>';
    return '<div class="wa-login" id="waLogin"><div><h2>🟢 Use WhatsApp here</h2><ol><li>Open <b>WhatsApp</b> on your phone</li><li>Android: tap <b>⋮ ▸ Linked devices</b><br>iPhone: <b>Settings ▸ Linked devices</b></li><li>Tap <b>Link a device</b></li><li>Point your phone at this screen to scan the QR code</li></ol>' +
      (G.err ? '<p style="color:var(--bad);margin-top:12px">' + esc(G.err) + '</p>' : '') +
      '<p class="muted" style="margin-top:16px;font-size:13px;line-height:1.6">🔒 It is your own account — nobody else sees your chats. Nothing is copied into the Google Sheet. Your chats, contacts and recent messages appear here right after you scan.</p>' +
      (working ? '<div class="actions" style="margin-top:10px"><button class="btn ghost sm" onclick="waRetry()">↻ New QR</button> <button class="btn ghost sm" onclick="waCancel()">Cancel</button></div>' : '') + '</div><div class="wa-qrwrap">' + box + '</div></div>';
  }
  function shellHtml(){
    return '<div class="wa-app' + (G.open ? ' open' : '') + '" id="waApp"><div class="wa-side">' +
      '<div class="wa-top"><div class="wa-me"><b class="wa-title">WhatsApp</b></div><button class="wa-plus" title="New chat" onclick="waNewToggle()">💬＋</button><button class="wa-ic" title="Menu" onclick="waMenu(event)">⋮</button></div>' +
      '<div class="wa-menu hidden" id="waMenu"><div class="wa-mrow"><span class="wa-av sm" id="waMeAv"></span><div class="wa-mid"><b id="waMeNm"></b><small id="waMeNo"></small></div></div>' +
      '<button onclick="waMenuGo(\'new\')">💬 New chat</button><button onclick="waMenuGo(\'grp\')">👥 New group</button><button onclick="waMenuGo(\'sync\')">↻ Sync contacts</button><button onclick="waMenuGo(\'refresh\')">⟳ Refresh chats</button><button onclick="waMenuGo(\'relink\')">🔗 Re-link (sync old chats)</button><button onclick="waMenuGo(\'web\')">🌐 Open WhatsApp Web (new tab)</button><button class="bad" onclick="waMenuGo(\'out\')">⏻ Disconnect</button></div>' +
      '<div id="waNewBox"></div><div class="wa-srch"><input class="input" id="waSearch" placeholder="🔍  Search or start a new chat" oninput="waFilter(this.value)"></div>' +
      '<div class="wa-chips" id="waChips"></div><div class="wa-list" id="waList"></div></div><div class="wa-main" id="waMain"></div></div>';
  }
  function paintSide(force){
    var app = $('#waApp'); if (!app) return;
    app.classList.toggle('open', !!G.open);
    var me = G.me || {}, st = G.st || {}, nm = me.name || st.name || 'WhatsApp', no = me.number || st.number || '';
    var a = $('#waMeAv'); if (a && a.dataset.k !== nm + '|' + (me.av || '')){ a.dataset.k = nm + '|' + (me.av || ''); a.innerHTML = ini(nm) + (me.av ? '<img src="' + esc(url(me.av)) + '" alt="" onerror="this.remove()">' : ''); }
    var n1 = $('#waMeNm'), n2 = $('#waMeNo'); if (n1) n1.textContent = nm; if (n2) n2.textContent = no;
    var nb = $('#waNewBox'); if (nb){ var want = G.newOpen ? 1 : 0; if (nb.dataset.o !== String(want)){ nb.dataset.o = String(want);
      nb.innerHTML = want ? '<div class="wa-new"><div class="wa-pkh"><button class="wa-ic" onclick="waNewToggle()">←</button><div class="wa-mid"><b id="waPkT">New chat</b><small id="waCcount"></small></div><button class="wa-ic" title="Sync contacts" onclick="waSyncC()">↻</button></div><div class="wa-srch"><input class="input" id="waCq" placeholder="Search name, number or @username" oninput="waCFilter(this.value)" onkeydown="if(event.key===\'Enter\')waNewGo()"></div><div class="wa-clist" id="waClist"></div></div>' : '';
      if (want){ var i = $('#waCq'); if (i) i.focus(); paintContacts(); if (!G.contacts) loadContacts(); } } }
    var un = G.chats.reduce(function(n, c){ return n + (c.unread ? 1 : 0); }, 0), ch = $('#waChips');
    if (ch && ch.dataset.k !== G.f + '|' + un){ ch.dataset.k = G.f + '|' + un;
      ch.innerHTML = [['all','All'],['unread','Unread' + (un ? ' ' + un : '')],['groups','Groups']].map(function(x){ return '<button class="' + (G.f === x[0] ? 'on' : '') + '" onclick="waChip(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join(''); }
    var sig = (G.hist ? G.hist.chats + '/' + G.hist.msgs : '') + '|' + G.f + '|' + G.q + '|' + (G.open ? G.open.id : '') + '|' + G.chats.map(function(c){ return c.id + c.at + c.unread + c.last + c.name; }).join(',');
    if (!force && sig === G.sigL) return; G.sigL = sig;
    var el = $('#waList'); if (!el) return; var top = el.scrollTop, q = G.q.toLowerCase();
    var rows = G.chats.filter(function(c){ return (G.f === 'unread' ? c.unread : G.f === 'groups' ? c.group : true) && (!q || (title(c) + ' ' + c.number).toLowerCase().indexOf(q) > -1); }).map(function(c){
      return '<div class="wa-row' + (G.open && G.open.id === c.id ? ' on' : '') + '" data-id="' + esc(c.id) + '" onclick="waOpen(this.dataset.id)">' + avatar(c) +
        '<div class="wa-mid"><b>' + esc(title(c)) + '</b><small>' + (c.out ? 'You: ' : '') + esc(c.last) + '</small></div>' +
        '<div class="wa-end">' + esc(when(c.at)) + (c.unread ? '<br><em>' + c.unread + '</em>' : '') + '</div></div>'; }).join('');
    var emp = !G.loaded ? 'Loading chats…' : (G.q || G.f !== 'all') ? 'No chat matches.<br>Tap 💬 to start a new chat.' : 'No chats yet.' + (G.hist ? '<br><small>WhatsApp has sent ' + G.hist.chats + ' chats and ' + G.hist.msgs + ' messages so far.</small>' : '') + '<br>Old chats come only when a device is linked. Tap below to link again and sync them.<br><button class="btn sm" style="margin-top:8px" onclick="waRelink()">↻ Re-link to sync old chats</button><br><small>You can still tap 💬 and message any contact.</small>';
    el.innerHTML = rows || '<div class="wa-empty">' + emp + '</div>';
    el.scrollTop = top;
  }
  function fx(){ var on = !!(G.open && S.view === 'whatsapp' && window.innerWidth <= 860 && root()); document.body.classList.toggle('wa-conv', on); }
  setInterval(function(){ if (document.body.classList.contains('wa-conv') && (!root() || S.view !== 'whatsapp' || !G.open)) document.body.classList.remove('wa-conv'); }, 400);
  window.addEventListener('resize', fx);
  function paintMain(force){
    fx(); var m = $('#waMain'); if (!m) return;
    if (!G.open){ if (m.dataset.k !== 'empty' || force){ m.dataset.k = 'empty'; m.innerHTML = '<div class="wa-empty"><div style="font-size:56px">🟢</div><h3 style="margin:0">WhatsApp</h3><div>Pick a chat on the left, or tap 💬 to message any number.</div></div>'; } return; }
    var c = G.open;
    if (m.dataset.k !== 'c:' + c.id || force){
      m.dataset.k = 'c:' + c.id; G.sigM = '';
      m.innerHTML = '<div class="wa-head"><button class="wa-ic wa-back" onclick="waBack()">←</button>' + avatar(c, 'sm') +
        '<div class="wa-mid"><b>' + esc(title(c)) + '</b><small class="muted">' + esc(c.number || (c.group ? 'Group' : '')) + '</small></div><button class="wa-ic" title="Video call" onclick="waCall(1)">🎥</button><button class="wa-ic" title="Voice call" onclick="waCall(0)">📞</button></div>' +
        '<div class="wa-msgs" id="waMsgs"></div>' +
        '<div class="wa-comp">' + (G.emoji ? emojiHtml() : '') + '<button class="wa-ic" title="Emoji" onclick="waEmoji()">😊</button><button class="wa-ic" title="Photo / video" onclick="waPick(0)">📷</button><button class="wa-ic" title="Document / file" onclick="waPick(1)">📎</button>' +
        '<textarea class="input" id="waIn" rows="1" placeholder="Type a message" oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,120)+\'px\'" onkeydown="waKey(event)"></textarea>' +
        '<button class="wa-send" title="Send" onclick="waSend()">➤</button></div><input type="file" id="waFile" class="hidden" onchange="waUpload(this)">';
    }
    paintMsgs(force);
  }
  var EMO = '😀 😂 🤣 😊 😍 😘 😎 🤔 😢 😭 😡 👍 👎 🙏 👏 💪 🎉 🔥 ❤️ 💯 ✅ ❌ ⭐ 🙌 😉 😅 🤝 👋 🙂 😴 🤗 😇 📞 📍 💰 🕐 📦 🛠️ ✔️ ⚠️'.split(' ');
  function emojiHtml(){ return '<div class="wa-emo">' + EMO.map(function(e){ return '<button type="button" onclick="waAddEmoji(this.textContent)">' + e + '</button>'; }).join('') + '</div>'; }
  window.waEmoji = function(){ G.emoji = !G.emoji; var c = $('.wa-comp'); if (!c) return; var e = $('.wa-emo', c); if (e) e.remove(); if (G.emoji) c.insertAdjacentHTML('afterbegin', emojiHtml()); };
  window.waAddEmoji = function(e){ var i = $('#waIn'); if (!i) return; i.value += e; i.focus(); };
  function tick1(m){ if (!m.out) return ''; var s = m.status || 'sent'; return '<i class="' + (s === 'read' ? 'rd' : '') + '">' + (s === 'sending' ? '🕓' : s === 'sent' ? '✓' : s === 'error' ? '❗' : '✓✓') + '</i>'; }
  function bubble(m){
    if (m.kind === 'call') return '<div class="wa-sys' + (/Missed|declined/.test(m.label || '') ? ' miss' : '') + '">' + esc(m.label || 'Call') + ' · ' + esc(hm(m.at)) + '</div>';
    var u = m.url ? url(m.url) : '', h = '', th = m.thumb ? 'data:image/jpeg;base64,' + m.thumb : '';
    if (m.kind === 'photo') h += '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img class="wa-pic" loading="lazy" src="' + esc(u) + '" alt="photo" onerror="' + (th ? 'this.onerror=null;this.src=\'' + th + '\'' : 'this.remove()') + '"></a>';
    else if (m.kind === 'sticker') h += '<img class="wa-pic wa-st" loading="lazy" src="' + esc(u) + '" alt="sticker" onerror="this.remove()">';
    else if (m.kind === 'video' || m.kind === 'gif') h += '<video controls preload="none" playsinline' + (th ? ' poster="' + th + '"' : '') + ' src="' + esc(u) + '"></video>';
    else if (m.kind === 'voice' || m.kind === 'audio') h += '<audio controls preload="none" src="' + esc(u) + '"></audio>';
    else if (m.kind === 'file') h += '<a class="wa-file" href="' + esc(u + '&dl=1') + '" target="_blank" rel="noopener"><span style="font-size:24px">📄</span><span style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.name || 'File') + '</b><small>' + (m.size ? size(m.size) + ' · ' : '') + 'Tap to download</small></span></a>';
    else if (m.kind === 'geo') h += '<a href="https://www.google.com/maps?q=' + esc(m.lat + ',' + m.lon) + '" target="_blank" rel="noopener" style="color:#027eb5">📍 Open location in Maps</a><br>';
    var cap = m.kind === 'file' || m.kind === 'photo' || m.kind === 'video' || m.kind === 'gif' || m.kind === 'voice' || m.kind === 'audio' || m.kind === 'sticker' || m.kind === 'geo' ? (m.text && m.text !== m.label && m.kind !== 'geo' ? m.text : '') : (m.text || m.label || '');
    return '<div class="wa-b ' + (m.out ? 'out' : 'in') + '">' + (m.from && !m.out && G.open && G.open.group ? '<span class="wa-who">' + esc(m.from) + '</span>' : '') + h + link(cap) + '<span class="wa-t">' + esc(hm(m.at)) + tick1(m) + '</span><div style="clear:both"></div></div>';
  }
  function paintMsgs(bottom){
    var el = $('#waMsgs'); if (!el) return;
    var sig = G.msgs.map(function(m){ return m.id + (m.status || ''); }).join(','); if (sig === G.sigM && !bottom) return; G.sigM = sig;
    var near = el.scrollHeight - el.scrollTop - el.clientHeight < 90, h = '', day = '';
    G.msgs.forEach(function(m){ var d = dayName(m.at); if (d !== day){ day = d; h += '<div class="wa-day">' + esc(d) + '</div>'; } h += bubble(m); });
    var more = '<div class="wa-more"><button class="btn ghost sm" onclick="waMore()">⬆ Load older messages</button></div>';
    el.innerHTML = more + (h || '<div class="wa-day">No messages yet. Say hello 👋</div>');
    if (bottom || near) el.scrollTop = el.scrollHeight;
  }

  /* ---------- connect / disconnect ---------- */
  window.waStart = async function(full){
    G.err = ''; G.starting = true; G.t0 = Date.now(); draw();
    try { var r = await quiet('waStart', { full: full === true }); G.st = Object.assign({}, G.st, { status: r.status, connected: r.status === 'open', qr: r.qr || '' });
      if (r.status === 'idle'){ G.starting = false; G.err = r.error || 'The QR code could not be loaded. Tap “Show QR code” to try again.'; } draw(); }
    catch(e){ G.starting = false; if (e.code === 'AUTH' || e.code === 'PAYDUE') return handleErr(e); G.err = e.message || 'Could not start'; draw(); }
  };
  window.waCancel = async function(){ try { await quiet('waLogout'); } catch(e){} G.starting = false; G.st = { configured:true, connected:false, status:'idle' }; draw(); };
  window.waRetry = async function(){ try { await quiet('waLogout'); } catch(e){} G.st = { configured:true, connected:false, status:'idle' }; waStart(); };
  window.waRelink = async function(){
    if (!await confirmBox('Re-link WhatsApp?', 'This logs this device out and shows a new QR code. Scan it again and WhatsApp sends your old chats and messages. Nothing is deleted from your phone.', 'Re-link', false)) return;
    try { await quiet('waLogout'); } catch(e){} waReset(); G.st = { configured:true, connected:false, status:'idle' }; POLL = setInterval(tick, 2500); waStart(true);
  };
  window.waMore = async function(){
    var c = G.open; if (!c) return;
    try { await quiet('waMore', { chat:c.id }); toast('Asked WhatsApp for older messages… they appear in a few seconds'); setTimeout(poll, 3000); setTimeout(poll, 8000); setTimeout(poll, 15000); }
    catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') return handleErr(e); toast(e.message || 'Could not load older messages', true); }
  };
  window.waLogout = async function(){
    if (!await confirmBox('Disconnect WhatsApp?', 'This unlinks the device from your WhatsApp. Your chats stay safe on your phone.', 'Disconnect', true)) return;
    try { await api('waLogout'); waReset(); G.st = { configured:true, connected:false, status:'idle' }; draw(); POLL = setInterval(tick, 2500); toast('WhatsApp disconnected'); } catch(e){ handleErr(e); }
  };

  /* ---------- chats ---------- */
  async function chats(silent){
    try { var r = silent ? await quiet('waChats') : await api('waChats'); G.chats = r.items; G.hist = r.hist || G.hist; G.me = r.me || G.me; G.loaded = true; G.err = ''; }
    catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') return handleErr(e); if (!silent) G.err = e.message || 'Could not load chats'; G.loaded = true; }
    if (S.view === 'whatsapp' && G.st && G.st.connected){ if ($('#waApp')) paintSide(); else draw(); }
  }
  window.waRefresh = function(){ G.sigL = ''; chats(); };
  window.waFilter = function(v){ G.q = String(v || ''); paintSide(true); };
  window.waNewToggle = function(){ G.newOpen = !G.newOpen; G.cq = ''; G.grp = { on:false, sel:{} }; paintSide(true); };
  window.waNewGo = async function(jid){
    var i = $('#waCq'), n = typeof jid === 'string' && jid ? jid : (i ? i.value.trim() : ''); if (!n) return toast('Pick a contact or enter a number', true);
    if (typeof jid !== 'string' && n.replace(/\D/g, '').length < 5){ var f = contactMatches(n); if (f.length === 1) n = f[0].id; else return toast('Pick a contact from the list, or type a phone number', true); }
    try { var r = await api('waHistory', { chat:n }); G.newOpen = false; G.cq = ''; if (!G.chats.some(function(c){ return c.id === r.chat.id; })) G.chats.unshift(r.chat);
      G.open = Object.assign({}, r.chat); G.msgs = r.items; G.sigL = ''; paintSide(true); paintMain(true); var t = $('#waIn'); if (t) t.focus(); } catch(e){ handleErr(e); }
  };
  function contactMatches(q){ q = String(q || '').toLowerCase().trim(); var d = q.replace(/\D/g, '');
    return (G.contacts || []).filter(function(c){ return !q || (c.name || '').toLowerCase().indexOf(q) > -1 || (d && (c.number || '').replace(/\D/g, '').indexOf(d) > -1); }); }
  function loadContacts(){ return quiet('waContacts').then(function(r){ G.contacts = r.items || []; paintContacts(); if (G.contacts.length < 8 && !G.autoSync){ G.autoSync = 1; waSyncC(); } }).catch(function(){ if (!G.contacts) G.contacts = []; paintContacts(); }); }
  function act(k, ic, t){ return '<div class="wa-act" onclick="waAct(\'' + k + '\')"><span class="wa-av sm">' + ic + '</span><b>' + t + '</b></div>'; }
  function paintContacts(){
    var el = $('#waClist'); if (!el) return;
    var g = !!(G.grp && G.grp.on), pt = $('#waPkT'); if (pt) pt.textContent = g ? 'New group' : 'New chat';
    if (!G.contacts){ el.innerHTML = '<div class="wa-empty" style="padding:14px">Loading contacts…</div>'; return; }
    var top = el.scrollTop, q = G.cq, d = q.replace(/\D/g, ''), all = contactMatches(q), list = all.slice(0, 3000), h = '', last = '', cc = $('#waCcount'), n = Object.keys(G.grp.sel).length;
    if (cc) cc.textContent = g ? (n + ' selected') : (G.contacts.length ? G.contacts.length + ' contacts' : '');
    if (!g && !q){
      h += act('grp', '👥', 'New group') + act('num', '👤', 'New contact (type a number above)');
      var m = G.me || {}, mn = String(m.number || (G.st && G.st.number) || '').replace(/\D/g, '');
      if (mn) h += '<div class="wa-row" data-id="' + esc(mn + '@s.whatsapp.net') + '" onclick="waNewGo(this.dataset.id)">' + avatar({ name:m.name || 'You', av:m.av || '' }, 'sm') + '<div class="wa-mid"><b>' + esc(m.name || 'You') + ' (You)</b><small>Message yourself</small></div></div>';
      h += '<div class="wa-sec">Contacts on WhatsApp</div>';
    }
    if (!g && d.length >= 8) h += '<div class="wa-row" data-id="' + esc(d) + '" onclick="waNewGo(this.dataset.id)"><span class="wa-av sm">＋</span><div class="wa-mid"><b>Chat with +' + esc(d) + '</b><small>Send a message to this number</small></div></div>';
    list.forEach(function(c){ var L = (c.name || '#').charAt(0).toUpperCase(); if (!/[A-Z]/.test(L)) L = '#'; if (L !== last){ last = L; h += '<div class="wa-sec">' + esc(L) + '</div>'; }
      h += '<div class="wa-row" data-id="' + esc(c.id) + '" onclick="' + (g ? 'waGSel' : 'waNewGo') + '(this.dataset.id)">' + avatar({ name:c.name, number:c.number, av:c.av || '' }, 'sm') + '<div class="wa-mid"><b>' + esc(c.name || c.number) + '</b><small>' + esc(c.number || 'WhatsApp contact') + '</small></div>' + (g ? '<span class="wa-chk' + (G.grp.sel[c.id] ? ' on' : '') + '">' + (G.grp.sel[c.id] ? '✓' : '') + '</span>' : '') + '</div>'; });
    if (!h) h = '<div class="wa-empty" style="padding:14px">' + (G.contacts.length ? 'No contact matches. Type a full number to chat with it.' : 'No contacts yet. Tap ↻ at the top to load them from your phone — they appear in a few seconds. You can still type a number above.') + '</div>';
    if (g) h += '<div class="wa-gbar"><button class="btn" style="width:100%" onclick="waGMake()">✓ Create group' + (n ? ' (' + n + ')' : '') + '</button></div>';
    el.innerHTML = h; el.scrollTop = top;
  }
  window.waAct = function(k){ if (k === 'grp'){ G.grp = { on:true, sel:{} }; paintContacts(); } else { var i = $('#waCq'); if (i) i.focus(); toast('Type the full number, e.g. 98765 43210'); } };
  window.waGSel = function(id){ if (G.grp.sel[id]) delete G.grp.sel[id]; else G.grp.sel[id] = 1; paintContacts(); };
  window.waGMake = async function(){
    var ids = Object.keys(G.grp.sel); if (!ids.length) return toast('Pick at least one contact', true);
    var name = window.prompt('Group name'); if (!name || !name.trim()) return;
    try { var r = await api('waGroup', { name:name.trim(), members:ids }); G.newOpen = false; G.grp = { on:false, sel:{} }; G.cq = ''; if (!G.chats.some(function(c){ return c.id === r.chat.id; })) G.chats.unshift(r.chat); G.sigL = ''; paintSide(true); waOpen(r.chat.id); toast('Group created ✓'); } catch(e){ handleErr(e); }
  };
  window.waSyncC = async function(){
    try { await quiet('waSyncContacts'); toast('Loading contacts from your phone…'); [3000, 8000, 16000].forEach(function(t){ setTimeout(loadContacts, t); }); }
    catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') return handleErr(e); toast(e.message || 'Could not sync contacts', true); }
  };
  window.waMenu = function(e){ if (e) e.stopPropagation(); var m = $('#waMenu'); if (m) m.classList.toggle('hidden'); };
  document.addEventListener('click', function(){ var m = $('#waMenu'); if (m) m.classList.add('hidden'); });
  window.waMenuGo = function(k){ var m = $('#waMenu'); if (m) m.classList.add('hidden');
    if (k === 'new'){ if (!G.newOpen) waNewToggle(); } else if (k === 'grp'){ G.newOpen = true; G.grp = { on:true, sel:{} }; paintSide(true); paintContacts(); }
    else if (k === 'sync') waSyncC(); else if (k === 'refresh') waRefresh(); else if (k === 'relink') waRelink(); else if (k === 'out') waLogout(); else if (k === 'web') window.open('https://web.whatsapp.com/', '_blank', 'noopener'); };
  window.waCFilter = function(v){ G.cq = String(v || ''); paintContacts(); };
  window.waChip = function(f){ G.f = f; G.sigL = ''; paintSide(true); };
  window.waCall = async function(video){
    var c = G.open; if (!c) return; var num = String(c.number || '').replace(/\D/g, '');
    if (!num) return toast('Calls work only with one person’s number, not groups', true);
    if (await confirmBox((video ? 'Video call ' : 'Voice call ') + title(c) + '?', 'WhatsApp does not allow calls from a linked device like this web app. This opens the chat in the WhatsApp app on your phone, where you can tap the ' + (video ? 'video' : 'call') + ' icon. Incoming and missed calls still show here.', 'Open WhatsApp', false)) window.open('https://wa.me/' + num, '_blank');
  };
  window.waOpen = async function(id){
    var c = G.chats.filter(function(x){ return x.id === id; })[0]; if (!c) return;
    G.open = Object.assign({}, c); G.msgs = []; G.sigL = ''; paintSide(true); paintMain(true);
    try { var r = await api('waHistory', { chat:id }); if (!G.open || G.open.id !== id) return; G.msgs = r.items; Object.assign(G.open, r.chat); c.unread = 0; G.sigL = ''; paintSide(true); paintMain(true); var t = $('#waIn'); if (t && !/Mobi|Android/i.test(navigator.userAgent)) t.focus(); }
    catch(e){ G.open = null; handleErr(e); paintSide(true); paintMain(true); }
  };
  window.waBack = function(){ G.open = null; G.emoji = false; G.sigL = ''; paintSide(true); paintMain(true); };
  async function poll(){
    var c = G.open; if (!c || G.busy) return;
    try { var r = await quiet('waHistory', { chat:c.id }); if (G.open !== c) return; G.msgs = r.items; paintMsgs(false); } catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') handleErr(e); }
  }

  /* ---------- sending ---------- */
  window.waKey = function(e){ if (e.key === 'Enter' && !e.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)){ e.preventDefault(); waSend(); } };
  window.waSend = async function(){
    var i = $('#waIn'), c = G.open; if (!i || !c) return; var t = i.value.trim(); if (!t) return;
    i.value = ''; i.style.height = 'auto'; G.busy = true;
    try { var r = await api('waSend', { chat:c.id, text:t }); if (G.open === c){ G.msgs.push(r.msg); paintMsgs(true); } G.sigL = ''; chats(true); }
    catch(e){ i.value = t; handleErr(e); }
    G.busy = false;
  };
  window.waPick = function(asFile){ var f = $('#waFile'); if (!f) return; f.dataset.as = asFile ? 'file' : 'media'; f.accept = asFile ? '' : 'image/*,video/*'; f.click(); };
  window.waUpload = async function(inp){
    var f = inp.files && inp.files[0], c = G.open, as = inp.dataset.as || 'media'; inp.value = ''; if (!f || !c) return;
    if (f.size > 30 * 1048576) return toast('File is too big (max 30 MB)', true);
    var i = $('#waIn'), cap = i ? i.value.trim() : ''; if (i){ i.value = ''; i.style.height = 'auto'; }
    G.busy = true; toast('Sending ' + f.name + '…');
    try {
      var r = await fetch(url('/wa/upload?c=' + enc(c.id) + '&n=' + enc(f.name) + '&m=' + enc(f.type || '') + '&as=' + as + '&cap=' + enc(cap)),
        { method:'POST', headers:{ Authorization:'Bearer ' + S.token, 'Content-Type':'application/octet-stream' }, body:f });
      var j = await r.json(); if (!j.ok){ var e = new Error(j.error || 'Could not send'); e.code = j.code; throw e; }
      if (G.open === c && j.msg){ G.msgs.push(j.msg); paintMsgs(true); } G.sigL = ''; chats(true); toast('Sent ✓');
    } catch(e){ if (cap && i) i.value = cap; handleErr(e); }
    G.busy = false;
  };

  /* ---------- the “WhatsApp” tab in the menu (side menu + All Options), right below Telegram / Mail / Chat ---------- */
  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="whatsapp"]')) return;
    var anchor = nav.querySelector('[data-v="telegram"]') || nav.querySelector('[data-v="mail"]') || nav.querySelector('[data-v="chat"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'whatsapp'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '🟢').replace('Updates', 'WhatsApp'); });
    anchor.after(b);
  })();
})();
