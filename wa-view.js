/* KS · WhatsApp tab  (All Options › WhatsApp)
   Link your own WhatsApp by scanning a QR code (WhatsApp ▸ Linked devices ▸ Link a device), then send and read
   messages here.  Talks to the server's wa-server.js.  Only messages from the moment of linking are shown. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var G = { st:null, chats:[], q:'', open:null, msgs:[], err:'', busy:false, starting:false, loaded:false };
  var POLL = null;

  try { TITLES.whatsapp = ['WhatsApp', 'Link your WhatsApp with a QR code and message anyone']; } catch(e){}

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '#waRoot .wa-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);cursor:pointer}',
    '#waRoot .wa-row:active{background:rgba(127,127,127,.12)}',
    '#waRoot .wa-av{flex:none;width:44px;height:44px;border-radius:50%;background:#25d366;color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center}',
    '#waRoot .wa-av.sm{width:36px;height:36px;font-size:15px}',
    '#waRoot .wa-mid{flex:1;min-width:0}',
    '#waRoot .wa-mid b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#waRoot .wa-mid small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.7}',
    '#waRoot .wa-end{flex:none;text-align:right;font-size:12px}',
    '#waRoot .wa-end em{display:inline-block;margin-top:4px;min-width:20px;padding:1px 6px;border-radius:10px;background:#25d366;color:#fff;font-style:normal;font-weight:700}',
    '#waRoot .wa-qrbox{display:flex;flex-direction:column;align-items:center;gap:10px;margin:10px 0}',
    '#waRoot .wa-qrbox img{width:280px;max-width:80vw;height:auto;background:#fff;padding:10px;border-radius:12px;border:1px solid var(--line)}',
    '#waRoot .wa-qrph{width:280px;max-width:80vw;height:280px;display:flex;align-items:center;justify-content:center;border-radius:12px;border:1px dashed var(--line);opacity:.8}',
    '#waRoot ol.wa-steps{margin:10px 0 0 20px;line-height:1.8;font-size:14px}',
    '#waRoot .wa-conv{display:flex;flex-direction:column;height:calc(100dvh - 150px - var(--bb-gap,0px));min-height:360px}',
    '#waRoot .wa-head{display:flex;align-items:center;gap:10px;padding:8px 6px}',
    '#waRoot .wa-msgs{flex:1;overflow-y:auto;padding:10px 8px;display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);border-radius:12px;background:rgba(37,211,102,.06)}',
    '#waRoot .wa-b{max-width:82%;padding:7px 10px;border-radius:12px;word-break:break-word;white-space:pre-wrap;line-height:1.4;background:var(--card,#fff);border:1px solid var(--line)}',
    '#waRoot .wa-b.out{align-self:flex-end;background:#d9fdd3;color:#0b2a14;border-color:#b6ebab}',
    '#waRoot .wa-b.in{align-self:flex-start}',
    '#waRoot .wa-b .wa-who{display:block;font-size:12px;font-weight:700;color:#128c7e;margin-bottom:2px}',
    '#waRoot .wa-b .wa-t{display:block;font-size:11px;opacity:.6;text-align:right;margin-top:3px}',
    '#waRoot .wa-day{align-self:center;font-size:12px;opacity:.65;padding:2px 10px;border-radius:10px;background:rgba(127,127,127,.15);margin:6px 0}',
    '#waRoot .wa-comp{display:flex;align-items:flex-end;gap:6px;padding-top:8px}',
    '#waRoot .wa-comp textarea{flex:1;resize:none;max-height:120px;min-height:42px}',
    '#waRoot .wa-send{flex:none;width:42px;height:42px;border-radius:50%;border:1px solid #25d366;background:#25d366;color:#fff;font-size:19px;cursor:pointer}',
    '#waRoot .wa-new{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}',
    '#waRoot .wa-new .field{margin:0;flex:1;min-width:140px}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- helpers ---------- */
  function ini(n){ var c = String(n || '?').replace(/^\+/, '').trim().charAt(0) || '?'; return esc(c.toUpperCase()); }
  function when(t){ if (!t) return ''; var d = new Date(t), n = new Date();
    try { return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }); } catch(e){ return ''; } }
  function dayName(t){ var d = new Date(t), n = new Date(), y = new Date(Date.now() - 86400000);
    if (d.toDateString() === n.toDateString()) return 'Today'; if (d.toDateString() === y.toDateString()) return 'Yesterday';
    try { return d.toLocaleDateString('en-IN', { day:'numeric', month:'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }); } catch(e){ return ''; } }
  /* background calls must not flash the app's loading bar, so they skip api() */
  async function quiet(action, payload){
    var j = await callServer(Object.assign({ action: action, token: S.token, asUser: S.as || undefined }, payload || {}));
    if (!j.ok){ var e = new Error(j.error || 'Request failed'); e.code = j.code; throw e; }
    return j;
  }
  function root(){ return $('#waRoot'); }
  function title(c){ return c.name || c.number || 'WhatsApp'; }

  /* ---------- entry points used by app.js ---------- */
  window.vWhatsapp = function(){ return '<div id="waRoot"><div class="card"><div class="empty-state">Loading…</div></div></div>'; };
  window.waAfter = function(){ draw(); };
  window.waReset = function(){ clearInterval(POLL); POLL = null; G = { st:null, chats:[], q:'', open:null, msgs:[], err:'', busy:false, starting:false, loaded:false }; };
  window.waInit = async function(){
    try { G.st = await quiet('waStatus'); G.err = ''; }
    catch(e){ if (e.code === 'AUTH'){ return handleErr(e); } G.err = e.message || 'Could not reach the server'; G.st = G.st || { configured:true, connected:false, status:'idle' }; }
    if (S.view === 'whatsapp') draw();
    if (G.st.connected && !G.loaded) chats(true);
    clearInterval(POLL); POLL = setInterval(tick, 2500);
  };
  async function tick(){
    if (S.view !== 'whatsapp' || document.hidden){ if (S.view !== 'whatsapp'){ clearInterval(POLL); POLL = null; } return; }
    try {
      var prev = G.st && G.st.status, st = await quiet('waStatus'); G.st = st;
      if (st.connected){
        if (prev !== 'open'){ G.loaded = false; G.starting = false; draw(); chats(true); toast('WhatsApp connected ✓'); }
        else if (G.open){ await poll(); } else { await chats(true); }
      } else if (st.status === 'qr' || st.status === 'starting' || prev !== st.status){
        if (!G.open || !st.connected) draw();
      }
    } catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') handleErr(e); }
  }

  /* ---------- drawing ---------- */
  function draw(){
    var r = root(); if (!r) return; var st = G.st;
    if (!st){ r.innerHTML = '<div class="card"><div class="empty-state">Loading…</div></div>'; return; }
    if (st.configured === false){ r.innerHTML = '<div class="card"><h3>🟢 WhatsApp is not set up yet</h3><p class="muted">' + esc(st.error || 'The server needs the WhatsApp package.') + '</p><p class="muted">Add <b>@whiskeysockets/baileys</b>, <b>qrcode</b> and <b>pino</b> to package.json (already done in the files you received), then redeploy the server.</p></div>'; return; }
    if (!st.connected){ r.innerHTML = connectHtml(); return; }
    if (G.open){ var keep = $('#waIn') ? $('#waIn').value : ''; r.innerHTML = convHtml(); if (keep){ $('#waIn').value = keep; } paintMsgs(true); } else { var q = $('#waSearch'), had = q && document.activeElement === q; r.innerHTML = listHtml(); paintList(); if (had){ var n = $('#waSearch'); if (n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } } }
  }
  function connectHtml(){
    var st = G.st, qr = st.status === 'qr' && st.qr, working = G.starting || st.status === 'starting' || st.status === 'qr';
    var box = '';
    if (qr) box = '<div class="wa-qrbox"><img src="' + esc(st.qr) + '" alt="WhatsApp QR code"><small class="muted">Scan this QR code with your phone. It refreshes by itself.</small></div>';
    else if (working) box = '<div class="wa-qrbox"><div class="wa-qrph">Getting the QR code…</div></div>';
    else box = '<div class="actions" style="margin:6px 0"><button class="btn" onclick="waStart()">🟢 Connect WhatsApp</button></div>';
    return '<div class="card"><h3>🟢 Connect your WhatsApp</h3><p class="muted">Link your WhatsApp once with a QR code (just like WhatsApp Web), then message anyone from here.</p>' + box +
      (G.err ? '<p style="color:var(--bad)">' + esc(G.err) + '</p>' : '') +
      '<ol class="wa-steps muted"><li>Open <b>WhatsApp</b> on your phone</li><li>Android: tap <b>⋮ ▸ Linked devices</b> · iPhone: <b>Settings ▸ Linked devices</b></li><li>Tap <b>Link a device</b> and scan the QR code above</li></ol>' +
      (working ? '<div class="actions" style="margin-top:12px"><button class="btn ghost sm" onclick="waCancel()">Cancel</button></div>' : '') +
      '<ul class="muted" style="margin:14px 0 0 18px;line-height:1.7;font-size:13px"><li>It is your own account — nobody else (not even an admin) sees your chats.</li><li>Messages are never copied into the Google Sheet.</li><li>Only messages from the time you link are shown here. Send messages at a normal pace — very fast bulk sending can get a WhatsApp number blocked.</li></ul></div>';
  }
  function listHtml(){
    return '<div class="card" style="margin-bottom:12px"><h3 style="margin:0 0 8px">✉️ New message</h3><div class="wa-new">' +
      '<div class="field"><label>Phone number</label><input class="input" id="waTo" type="tel" placeholder="98765 43210 or +91…" autocomplete="off"></div>' +
      '<div class="field" style="flex:2;min-width:200px"><label>Message</label><input class="input" id="waMsg" placeholder="Type a message" onkeydown="if(event.key===\'Enter\'){event.preventDefault();waQuick()}"></div>' +
      '<button class="btn" onclick="waQuick()">Send</button></div>' +
      '<div class="muted" style="font-size:12px;margin-top:6px">No country code = India (+91).</div></div>' +
      '<div class="card" style="margin-bottom:12px"><div class="actions"><input class="input" id="waSearch" style="flex:1;min-width:140px" placeholder="Search chats" value="' + esc(G.q) + '" oninput="waFilter(this.value)">' +
      '<button class="btn soft sm" onclick="waRefresh()">↻</button><button class="btn ghost sm" onclick="waLogout()">Disconnect</button></div>' +
      '<div class="muted" style="font-size:12px;margin-top:6px">Linked: ' + esc((G.st.name || 'WhatsApp') + (G.st.number ? ' · ' + G.st.number : '')) + '</div>' +
      (G.err ? '<p style="color:var(--bad);margin-top:8px">' + esc(G.err) + '</p>' : '') + '</div><div class="card" style="padding:0" id="waList"></div>';
  }
  function paintList(){
    var el = $('#waList'); if (!el) return; var q = G.q.toLowerCase();
    var rows = G.chats.filter(function(c){ return !q || (c.name + ' ' + c.number).toLowerCase().indexOf(q) > -1; }).map(function(c){
      return '<div class="wa-row" data-id="' + esc(c.id) + '" onclick="waOpen(this.dataset.id)"><span class="wa-av">' + ini(title(c)) + '</span>' +
        '<div class="wa-mid"><b>' + esc(title(c)) + '</b><small>' + (c.out ? 'You: ' : '') + esc(c.last) + '</small></div>' +
        '<div class="wa-end">' + esc(when(c.at)) + (c.unread ? '<br><em>' + c.unread + '</em>' : '') + '</div></div>'; }).join('');
    el.innerHTML = rows || '<div class="empty-state">' + (G.q ? 'No chat matches.' : 'No chats yet — messages sent or received from now on show up here.') + '</div>';
  }
  function convHtml(){
    var c = G.open;
    return '<div class="wa-conv"><div class="wa-head"><button class="btn ghost sm" onclick="waBack()">←</button><span class="wa-av sm">' + ini(title(c)) + '</span>' +
      '<div class="wa-mid"><b>' + esc(title(c)) + '</b><small class="muted">' + esc(c.number || (c.group ? 'Group' : '')) + '</small></div></div>' +
      '<div class="wa-msgs" id="waMsgs"></div>' +
      '<div class="wa-comp"><textarea class="input" id="waIn" rows="1" placeholder="Message" oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,120)+\'px\'" onkeydown="waKey(event)"></textarea>' +
      '<button class="wa-send" title="Send" onclick="waSend()">➤</button></div></div>';
  }
  function bubble(m){
    return '<div class="wa-b ' + (m.out ? 'out' : 'in') + '">' + (m.from && !m.out && G.open && G.open.group ? '<span class="wa-who">' + esc(m.from) + '</span>' : '') +
      (m.kind !== 'text' && m.label ? '<span>' + esc(m.label) + '</span>' + (m.text && m.text !== m.label ? '<br>' : '') : '') +
      (m.kind === 'text' || (m.text && m.text !== m.label) ? esc(m.text) : '') + '<span class="wa-t">' + esc(when(m.at)) + '</span></div>';
  }
  function paintMsgs(bottom){
    var el = $('#waMsgs'); if (!el) return; var near = el.scrollHeight - el.scrollTop - el.clientHeight < 80, h = '', day = '';
    G.msgs.forEach(function(m){ var d = dayName(m.at); if (d !== day){ day = d; h += '<div class="wa-day">' + esc(d) + '</div>'; } h += bubble(m); });
    el.innerHTML = h || '<div class="wa-day">No messages yet. Say hello 👋</div>';
    if (bottom || near) el.scrollTop = el.scrollHeight;
  }

  /* ---------- connect / disconnect ---------- */
  window.waStart = async function(){
    G.err = ''; G.starting = true; draw();
    try { var r = await quiet('waStart'); G.st = Object.assign({}, G.st, { status: r.status, connected: r.status === 'open' }); draw(); }
    catch(e){ G.starting = false; if (e.code === 'AUTH' || e.code === 'PAYDUE') return handleErr(e); G.err = e.message || 'Could not start'; draw(); }
  };
  window.waCancel = async function(){ try { await quiet('waLogout'); } catch(e){} G.starting = false; G.st = { configured:true, connected:false, status:'idle' }; draw(); };
  window.waLogout = async function(){
    if (!await confirmBox('Disconnect WhatsApp?', 'This unlinks the device. Your chats stay safe on your phone.', 'Disconnect', true)) return;
    try { await api('waLogout'); waReset(); G.st = { configured:true, connected:false, status:'idle' }; draw(); POLL = setInterval(tick, 2500); toast('WhatsApp disconnected'); } catch(e){ handleErr(e); }
  };

  /* ---------- chats ---------- */
  async function chats(silent){
    try { var r = silent ? await quiet('waChats') : await api('waChats'); G.chats = r.items; G.loaded = true; G.err = ''; }
    catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') return handleErr(e); if (!silent) G.err = e.message || 'Could not load chats'; G.loaded = true; }
    if (S.view === 'whatsapp' && !G.open && G.st && G.st.connected){ if ($('#waList')) paintList(); else draw(); }
  }
  window.waRefresh = function(){ chats(); };
  window.waFilter = function(v){ G.q = String(v || ''); paintList(); };
  window.waOpen = async function(id){
    var c = G.chats.filter(function(x){ return x.id === id; })[0]; if (!c) return;
    G.open = Object.assign({}, c); G.msgs = []; draw();
    try { var r = await api('waHistory', { chat:id }); G.msgs = r.items; Object.assign(G.open, r.chat); c.unread = 0; draw(); }
    catch(e){ G.open = null; handleErr(e); draw(); }
  };
  window.waBack = function(){ G.open = null; draw(); chats(true); };
  async function poll(){
    var c = G.open; if (!c || G.busy) return;
    try {
      var r = await quiet('waHistory', { chat:c.id }); if (G.open !== c) return;
      if (r.items.length === G.msgs.length && (!r.items.length || r.items[r.items.length - 1].id === G.msgs[G.msgs.length - 1].id)) return;
      G.msgs = r.items; paintMsgs(false);
    } catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') handleErr(e); }
  }

  /* ---------- sending ---------- */
  window.waKey = function(e){ if (e.key === 'Enter' && !e.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)){ e.preventDefault(); waSend(); } };
  window.waSend = async function(){
    var i = $('#waIn'), c = G.open; if (!i || !c) return; var t = i.value.trim(); if (!t) return;
    i.value = ''; i.style.height = 'auto'; G.busy = true;
    try { var r = await api('waSend', { chat:c.id, text:t }); if (G.open === c){ G.msgs.push(r.msg); paintMsgs(true); } }
    catch(e){ i.value = t; handleErr(e); }
    G.busy = false;
  };
  window.waQuick = async function(){
    var to = $('#waTo'), m = $('#waMsg'); if (!to || !m) return;
    var n = to.value.trim(), t = m.value.trim(); if (!n) return toast('Enter a phone number', true); if (!t) return toast('Write a message', true);
    G.busy = true;
    try {
      var r = await api('waSend', { to:n, text:t }); m.value = ''; toast('Sent ✓');
      await chats(true); var c = G.chats.filter(function(x){ return x.id === r.jid; })[0] || r.chat;
      if (c && !G.chats.some(function(x){ return x.id === c.id; })) G.chats.unshift(c);
      waOpen(r.jid);
    } catch(e){ handleErr(e); }
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
