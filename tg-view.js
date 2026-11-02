/* KS · Telegram tab  (All Options › Telegram)
   Your own Telegram account: chat list, messages, send text / photo / video / files, reply, delete.
   Talks to the server's tg-server.js.  Voice / video CALLS cannot be made through Telegram's API,
   so call history is shown and the call button opens the chat in the Telegram app. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var G = { st:null, chats:[], q:'', open:null, msgs:[], err:'', step:'phone', phone:'', reply:null, more:true, loaded:false, chatT:0, busy:false };
  var POLL = null;

  try { TITLES.telegram = ['Telegram', 'Your Telegram chats — read, reply, send photos and videos']; } catch(e){}

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '#tgRoot .tg-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);cursor:pointer}',
    '#tgRoot .tg-row:active{background:rgba(127,127,127,.12)}',
    '#tgRoot .tg-av{position:relative;flex:none;width:46px;height:46px;border-radius:50%;background:#2aabee;color:#fff;font-weight:700;font-size:19px;display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '#tgRoot .tg-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
    '#tgRoot .tg-av.sm{width:38px;height:38px;font-size:16px}',
    '#tgRoot .tg-mid{flex:1;min-width:0}',
    '#tgRoot .tg-mid b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#tgRoot .tg-mid small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.7}',
    '#tgRoot .tg-end{flex:none;text-align:right;font-size:12px;opacity:.9}',
    '#tgRoot .tg-end em{display:inline-block;margin-top:4px;min-width:20px;padding:1px 6px;border-radius:10px;background:#2aabee;color:#fff;font-style:normal;font-weight:700}',
    '#tgRoot .tg-conv{display:flex;flex-direction:column;height:calc(100dvh - 150px - var(--bb-gap,0px));min-height:360px}',
    '#tgRoot .tg-head{display:flex;align-items:center;gap:10px;padding:8px 6px}',
    '#tgRoot .tg-head .tg-mid b{font-size:16px}',
    '#tgRoot .tg-msgs{flex:1;overflow-y:auto;padding:10px 8px;display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);border-radius:12px;background:rgba(127,127,127,.06)}',
    '#tgRoot .tg-b{max-width:82%;padding:7px 10px;border-radius:14px;word-break:break-word;white-space:pre-wrap;line-height:1.4;background:var(--card,#fff);border:1px solid var(--line)}',
    '#tgRoot .tg-b.out{align-self:flex-end;background:#d7f0ff;color:#0b2a3a;border-color:#b5e0f7}',
    '#tgRoot .tg-b.in{align-self:flex-start}',
    '#tgRoot .tg-b .tg-who{display:block;font-size:12px;font-weight:700;color:#2aabee;margin-bottom:2px}',
    '#tgRoot .tg-b .tg-q{display:block;font-size:12px;opacity:.7;border-left:3px solid #2aabee;padding-left:6px;margin-bottom:4px}',
    '#tgRoot .tg-b .tg-t{display:block;font-size:11px;opacity:.6;text-align:right;margin-top:3px}',
    '#tgRoot .tg-b .tg-act{display:inline-flex;gap:10px;float:left;margin-top:3px;opacity:.5;font-size:13px}',
    '#tgRoot .tg-b .tg-act a{cursor:pointer}',
    '#tgRoot .tg-img{display:block;max-width:100%;max-height:340px;border-radius:10px;margin-bottom:4px}',
    '#tgRoot .tg-st{width:130px;height:130px;object-fit:contain}',
    '#tgRoot .tg-b audio{max-width:100%;display:block}',
    '#tgRoot .tg-day{align-self:center;font-size:12px;opacity:.65;padding:2px 10px;border-radius:10px;background:rgba(127,127,127,.15);margin:6px 0}',
    '#tgRoot .tg-sys{align-self:center;font-size:12.5px;opacity:.8;padding:3px 10px;border-radius:10px;background:rgba(127,127,127,.15);text-align:center}',
    '#tgRoot .tg-call{align-self:center}',
    '#tgRoot .tg-comp{display:flex;align-items:flex-end;gap:6px;padding-top:8px}',
    '#tgRoot .tg-comp textarea{flex:1;resize:none;max-height:120px;min-height:42px}',
    '#tgRoot .tg-ib{flex:none;width:42px;height:42px;border-radius:50%;border:1px solid var(--line);background:transparent;font-size:19px;cursor:pointer}',
    '#tgRoot .tg-send{background:#2aabee;color:#fff;border-color:#2aabee}',
    '#tgRoot .tg-replybar{font-size:12.5px;padding:6px 10px;border-left:3px solid #2aabee;background:rgba(42,171,238,.1);border-radius:6px;margin-top:6px;display:flex;justify-content:space-between;gap:8px}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- helpers ---------- */
  var enc = encodeURIComponent;
  function ini(n){ return esc((String(n || '?').trim().charAt(0) || '?').toUpperCase()); }
  function url(u){ return API_URL + u; }
  function avatar(c, cls){ return '<span class="tg-av ' + (cls || '') + '">' + ini(c.name) + (c.av ? '<img loading="lazy" src="' + esc(url(c.av)) + '" alt="" onerror="this.remove()">' : '') + '</span>'; }
  function when(t){ if (!t) return ''; var d = new Date(t), n = new Date();
    try { return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }); } catch(e){ return ''; } }
  function dayName(t){ var d = new Date(t), n = new Date(), y = new Date(Date.now() - 86400000);
    if (d.toDateString() === n.toDateString()) return 'Today'; if (d.toDateString() === y.toDateString()) return 'Yesterday';
    try { return d.toLocaleDateString('en-IN', { day:'numeric', month:'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }); } catch(e){ return ''; } }
  function size(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  /* background calls (chat polling) must not flash the app's loading bar, so they skip api() */
  async function quiet(action, payload){
    var j = await callServer(Object.assign({ action: action, token: S.token, asUser: S.as || undefined }, payload || {}));
    if (!j.ok){ var e = new Error(j.error || 'Request failed'); e.code = j.code; throw e; }
    return j;
  }
  function root(){ return $('#tgRoot'); }

  /* ---------- entry points used by app.js ---------- */
  window.vTelegram = function(){ return '<div id="tgRoot"><div class="card"><div class="empty-state">Loading…</div></div></div>'; };
  window.tgAfter = function(){ draw(); };
  window.tgReset = function(){ clearInterval(POLL); POLL = null; G = { st:null, chats:[], q:'', open:null, msgs:[], err:'', step:'phone', phone:'', reply:null, more:true, loaded:false, chatT:0, busy:false }; };
  window.tgInit = async function(){
    if (!G.st){ try { G.st = await quiet('tgStatus'); } catch(e){ if (e.code === 'AUTH'){ return handleErr(e); } G.err = e.message || 'Could not reach the server'; G.st = { configured:true, connected:false }; } }
    if (S.view === 'telegram') draw();
    if (G.st.connected && !G.loaded) chats();
    clearInterval(POLL); POLL = setInterval(tick, 4000);
  };
  function tick(){
    if (S.view !== 'telegram' || document.hidden || !G.st || !G.st.connected) return;
    if (G.open) poll(); else if (Date.now() - G.chatT > 9000) chats(true);
  }

  /* ---------- drawing ---------- */
  function draw(){
    var r = root(); if (!r) return; var st = G.st;
    if (!st){ r.innerHTML = '<div class="card"><div class="empty-state">Loading…</div></div>'; return; }
    if (!st.configured){ r.innerHTML = '<div class="card"><h3>✈️ Telegram is not set up yet</h3><p class="muted">The server needs two keys from Telegram: <b>TG_API_ID</b> and <b>TG_API_HASH</b>. Create them (free) at <b>my.telegram.org → API development tools</b>, then add them in Render → Environment and redeploy.</p></div>'; return; }
    if (!st.connected){ r.innerHTML = connectHtml(); return; }
    if (G.open){ r.innerHTML = convHtml(); paintMsgs(true); paintReply(); } else { r.innerHTML = listHtml(); paintList(); }
  }
  function connectHtml(){
    var body;
    if (G.step === 'code') body = '<div class="field"><label>Code from Telegram</label><input class="input" id="tgCode" inputmode="numeric" autocomplete="one-time-code" placeholder="12345"></div><p class="muted" style="font-size:13px">Telegram sends it as a message inside your Telegram app (chat “Telegram”), or by SMS.</p><div class="actions"><button class="btn" onclick="tgSignIn()">Verify</button><button class="btn ghost" onclick="tgStep(\'phone\')">← Change number</button></div>';
    else if (G.step === 'pw') body = '<div class="field"><label>Two-step verification password</label><input class="input" id="tgPw" type="password" autocomplete="current-password"></div><div class="actions"><button class="btn" onclick="tgPassword()">Unlock</button></div>';
    else body = '<div class="field"><label>Phone number (with country code)</label><input class="input" id="tgPhone" type="tel" autocomplete="tel" placeholder="+91 98765 43210" value="' + esc(G.phone) + '"></div><div class="actions"><button class="btn" onclick="tgSendCode()">Send code</button></div>';
    return '<div class="card"><h3>✈️ Connect your Telegram</h3><p class="muted" style="margin-bottom:12px">Sign in once and all your Telegram chats show here — read, reply, send photos, videos and files.</p>' + body +
      '<ul class="muted" style="margin:14px 0 0 18px;line-height:1.7;font-size:13px"><li>It is your own account — nobody else (not even an admin) can see your chats.</li><li>Messages are never copied into the Google Sheet.</li><li>Voice / video calls cannot be made here (Telegram does not allow it) — the call button opens the Telegram app.</li></ul></div>';
  }
  function listHtml(){
    return '<div class="card" style="margin-bottom:12px"><div class="actions"><input class="input" id="tgSearch" style="flex:1;min-width:140px" placeholder="Search chats" value="' + esc(G.q) + '" oninput="tgFilter(this.value)">' +
      '<button class="btn soft sm" onclick="tgRefresh()">↻</button><button class="btn ghost sm" onclick="tgLogout()">Disconnect</button></div>' +
      (G.st.name ? '<div class="muted" style="font-size:12px;margin-top:6px">Signed in as ' + esc(G.st.name) + (G.st.username ? ' · @' + esc(G.st.username) : '') + '</div>' : '') +
      (G.err ? '<p style="color:var(--bad);margin-top:8px">' + esc(G.err) + '</p>' : '') + '</div><div class="card" style="padding:0" id="tgList"></div>';
  }
  function paintList(){
    var el = $('#tgList'); if (!el) return; var q = G.q.toLowerCase();
    var rows = G.chats.filter(function(c){ return !q || (c.name + ' ' + c.username).toLowerCase().indexOf(q) > -1; }).map(function(c){
      return '<div class="tg-row" data-id="' + esc(c.id) + '" onclick="tgOpen(this.dataset.id)">' + avatar(c) +
        '<div class="tg-mid"><b>' + (c.pin ? '📌 ' : '') + esc(c.name) + '</b><small>' + (c.out ? 'You: ' : '') + esc(c.last) + '</small></div>' +
        '<div class="tg-end">' + esc(when(c.at)) + (c.unread ? '<br><em>' + c.unread + '</em>' : '') + '</div></div>'; }).join('');
    el.innerHTML = rows || '<div class="empty-state">' + (G.loaded ? (G.q ? 'No chat matches.' : 'No chats yet.') : 'Loading chats…') + '</div>';
  }
  function convHtml(){
    var c = G.open, ph = c.userId ? 'tg://user?id=' + c.userId : (c.username ? 'https://t.me/' + c.username : '');
    return '<div class="tg-conv"><div class="tg-head"><button class="btn ghost sm" onclick="tgBack()">←</button>' + avatar(c, 'sm') +
      '<div class="tg-mid"><b>' + esc(c.name) + '</b><small class="muted">' + (c.username ? '@' + esc(c.username) : esc(c.kind || '')) + '</small></div>' +
      (ph ? '<a class="btn soft sm" href="' + esc(ph) + '" title="Calls open in the Telegram app">📞 Call</a>' : '') + '</div>' +
      '<div class="tg-msgs" id="tgMsgs"></div><div id="tgReply"></div>' +
      '<div class="tg-comp"><button class="tg-ib" title="Photo / video" onclick="tgPick(0)">📷</button><button class="tg-ib" title="File" onclick="tgPick(1)">📎</button>' +
      '<textarea class="input" id="tgIn" rows="1" placeholder="Message" oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,120)+\'px\'" onkeydown="tgKey(event)"></textarea>' +
      '<button class="tg-ib tg-send" title="Send" onclick="tgSend()">➤</button></div><input type="file" id="tgFile" class="hidden" onchange="tgUpload(this)"></div>';
  }
  function bubble(m){
    if (m.kind === 'service') return '<div class="tg-sys">' + esc(m.text) + '</div>';
    if (m.kind === 'call') return '<div class="tg-sys tg-call">' + esc(m.text) + ' · ' + esc(when(m.at)) + '</div>';
    var h = '', u = m.url ? url(m.url) : '';
    if (m.kind === 'photo') h += '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img class="tg-img" loading="lazy" src="' + esc(u) + '" alt="photo"></a>';
    else if (m.kind === 'video') h += '<video class="tg-img" controls preload="metadata" playsinline src="' + esc(u) + '"></video>';
    else if (m.kind === 'voice' || m.kind === 'audio') h += '<audio controls preload="none" src="' + esc(u) + '"></audio>' + (m.name ? '<small>' + esc(m.name) + '</small>' : '');
    else if (m.kind === 'sticker') h += '<img class="tg-st" loading="lazy" src="' + esc(u) + '" alt="' + esc(m.emoji) + '" onerror="this.outerHTML=\'<span style=&quot;font-size:54px&quot;>' + esc(m.emoji) + '</span>\'">';
    else if (m.kind === 'file' || m.kind === 'other') h += '<a href="' + esc(u + '&dl=1') + '" target="_blank" rel="noopener">📄 ' + esc(m.name || 'File') + (m.size ? ' · ' + size(m.size) : '') + '</a>';
    else if (m.kind === 'geo') h += '<a href="https://maps.google.com/?q=' + esc(m.lat) + ',' + esc(m.lon) + '" target="_blank" rel="noopener">📍 Location</a>';
    var rep = m.reply ? G.msgs.filter(function(x){ return x.id === m.reply; })[0] : null;
    return '<div class="tg-b ' + (m.out ? 'out' : 'in') + '" data-id="' + m.id + '">' +
      (!m.out && m.from && G.open && G.open.kind !== 'user' ? '<span class="tg-who">' + esc(m.from) + '</span>' : '') +
      (m.reply ? '<span class="tg-q">↩ ' + esc(rep ? (rep.text || rep.name || '…').slice(0, 70) : 'Reply') + '</span>' : '') +
      h + (m.text ? esc(m.text) : '') +
      '<span class="tg-t"><span class="tg-act"><a onclick="tgReplyTo(' + m.id + ')">↩</a>' + (m.out ? '<a onclick="tgDel(' + m.id + ')">🗑</a>' : '') + '</span>' + (m.edited ? 'edited · ' : '') + esc(when(m.at)) + '</span></div>';
  }
  function paintMsgs(stick){
    var el = $('#tgMsgs'); if (!el) return;
    var atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 80, h = '', last = '';
    if (G.more && G.msgs.length >= 40) h += '<button class="btn soft sm" style="align-self:center" onclick="tgOlder()">Load older</button>';
    G.msgs.forEach(function(m){ var d = new Date(m.at).toDateString(); if (d !== last){ last = d; h += '<div class="tg-day">' + esc(dayName(m.at)) + '</div>'; } h += bubble(m); });
    el.innerHTML = h || '<div class="empty-state">No messages yet.</div>';
    if (stick || atEnd) el.scrollTop = el.scrollHeight;
  }
  function paintReply(){
    var el = $('#tgReply'); if (!el) return;
    var m = G.reply ? G.msgs.filter(function(x){ return x.id === G.reply; })[0] : null;
    el.innerHTML = m ? '<div class="tg-replybar"><span>↩ ' + esc((m.text || m.name || 'Message').slice(0, 80)) + '</span><a onclick="tgReplyTo(0)" style="cursor:pointer">✕</a></div>' : '';
  }

  /* ---------- connect / disconnect ---------- */
  window.tgStep = function(s){ G.step = s; draw(); };
  window.tgSendCode = async function(){
    var p = ($('#tgPhone').value || '').trim(); G.phone = p; if (!p) return toast('Enter your phone number', true);
    try { await api('tgSendCode', { phone: p }); G.step = 'code'; draw(); toast('Code sent — check your Telegram app'); } catch(e){ handleErr(e); }
  };
  async function connected(r){ G.st = { configured:true, connected:true, name:r.name, username:r.username }; G.step = 'phone'; G.loaded = false; G.chats = []; draw(); chats(); toast('Telegram connected'); }
  window.tgSignIn = async function(){
    var c = ($('#tgCode').value || '').trim(); if (!c) return toast('Enter the code', true);
    try { var r = await api('tgSignIn', { code: c }); if (r.need2fa){ G.step = 'pw'; draw(); } else connected(r); } catch(e){ handleErr(e); }
  };
  window.tgPassword = async function(){
    var p = $('#tgPw').value || ''; if (!p) return toast('Enter your password', true);
    try { connected(await api('tgPassword', { password: p })); } catch(e){ handleErr(e); }
  };
  window.tgLogout = async function(){
    if (!await confirmBox('Disconnect Telegram?', 'Your chats stay safe in Telegram. This app will just stop showing them.', 'Disconnect', true)) return;
    try { await api('tgLogout'); var keep = G.st; tgReset(); G.st = { configured: keep.configured, connected:false }; draw(); toast('Telegram disconnected'); } catch(e){ handleErr(e); }
  };

  /* ---------- chats ---------- */
  async function chats(silent){
    G.chatT = Date.now();
    try { var r = silent ? await quiet('tgChats') : await api('tgChats'); G.chats = r.items; G.loaded = true; G.err = ''; }
    catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') return handleErr(e); if (!silent) G.err = e.message || 'Could not load chats'; G.loaded = true; if (e.message && /Connect Telegram|signed this session/.test(e.message)){ G.st.connected = false; } }
    if (S.view === 'telegram' && !G.open) draw();
  }
  window.tgRefresh = function(){ chats(); };
  window.tgFilter = function(v){ G.q = String(v || ''); paintList(); };
  window.tgOpen = async function(id){
    var c = G.chats.filter(function(x){ return x.id === id; })[0]; if (!c) return;
    G.open = Object.assign({}, c); G.msgs = []; G.more = true; G.reply = null; draw();
    try { var r = await api('tgHistory', { chat:id, limit:40, read:1 }); G.msgs = r.items; Object.assign(G.open, r.chat, { av: c.av }); c.unread = 0; draw(); }
    catch(e){ G.open = null; handleErr(e); draw(); }
  };
  window.tgBack = function(){ G.open = null; G.reply = null; draw(); chats(true); };
  async function poll(){
    var c = G.open; if (!c || G.busy) return; var last = G.msgs.length ? G.msgs[G.msgs.length - 1].id : 0;
    try {
      var r = await quiet('tgHistory', { chat:c.id, afterId:last, limit:40, read:1 });
      if (G.open !== c || !r.items.length) return;
      var have = {}; G.msgs.forEach(function(m){ have[m.id] = 1; });
      var add = r.items.filter(function(m){ return !have[m.id]; }); if (!add.length) return;
      G.msgs = G.msgs.concat(add); paintMsgs(false);
    } catch(e){ if (e.code === 'AUTH' || e.code === 'PAYDUE') handleErr(e); }
  }
  window.tgOlder = async function(){
    var c = G.open; if (!c || !G.msgs.length) return; var el = $('#tgMsgs'), prev = el ? el.scrollHeight : 0;
    try {
      var r = await api('tgHistory', { chat:c.id, beforeId:G.msgs[0].id, limit:40 });
      if (r.items.length < 40) G.more = false;
      G.msgs = r.items.concat(G.msgs); paintMsgs(false); el = $('#tgMsgs'); if (el) el.scrollTop = el.scrollHeight - prev;
    } catch(e){ handleErr(e); }
  };

  /* ---------- sending ---------- */
  window.tgKey = function(e){ if (e.key === 'Enter' && !e.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)){ e.preventDefault(); tgSend(); } };
  window.tgReplyTo = function(id){ G.reply = id || null; paintReply(); var i = $('#tgIn'); if (i && id) i.focus(); };
  window.tgSend = async function(){
    var i = $('#tgIn'), c = G.open; if (!i || !c) return; var t = i.value.trim(); if (!t) return;
    var rid = G.reply || 0; i.value = ''; i.style.height = 'auto'; G.reply = null; paintReply(); G.busy = true;
    try { var r = await api('tgSend', { chat:c.id, text:t, reply:rid }); if (G.open === c){ G.msgs.push(r.msg); paintMsgs(true); } }
    catch(e){ i.value = t; handleErr(e); }
    G.busy = false;
  };
  window.tgPick = function(asFile){ var f = $('#tgFile'); if (!f) return; f.dataset.as = asFile ? 'file' : 'media'; f.accept = asFile ? '' : 'image/*,video/*'; f.click(); };
  window.tgUpload = async function(inp){
    var f = inp.files && inp.files[0], c = G.open, as = inp.dataset.as || 'media'; inp.value = ''; if (!f || !c) return;
    if (f.size > 50 * 1048576) return toast('File is too big (max 50 MB)', true);
    var i = $('#tgIn'), cap = i ? i.value.trim() : ''; if (i){ i.value = ''; i.style.height = 'auto'; }
    var rid = G.reply || 0; G.reply = null; paintReply(); G.busy = true; toast('Sending ' + f.name + '…');
    try {
      var r = await fetch(url('/tg/upload?c=' + enc(c.id) + '&n=' + enc(f.name) + '&m=' + enc(f.type || '') + '&as=' + as + '&reply=' + rid + '&cap=' + enc(cap)),
        { method:'POST', headers:{ Authorization:'Bearer ' + S.token, 'Content-Type':'application/octet-stream' }, body:f });
      var j = await r.json(); if (!j.ok){ var e = new Error(j.error || 'Could not send'); e.code = j.code; throw e; }
      if (G.open === c){ G.msgs.push(j.msg); paintMsgs(true); } toast('Sent ✓');
    } catch(e){ if (cap && i) i.value = cap; handleErr(e); }
    G.busy = false;
  };
  window.tgDel = async function(id){
    var c = G.open; if (!c) return;
    if (!await confirmBox('Delete this message?', 'It will be deleted for everyone in this chat.', 'Delete', true)) return;
    try { await api('tgDelete', { chat:c.id, id:id }); G.msgs = G.msgs.filter(function(m){ return m.id !== id; }); paintMsgs(false); } catch(e){ handleErr(e); }
  };

  /* ---------- the “Telegram” tab in the menu (side menu + All Options), right below Mail / Chat ---------- */
  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="telegram"]')) return;
    var anchor = nav.querySelector('[data-v="mail"]') || nav.querySelector('[data-v="chat"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'telegram'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '✈️').replace('Updates', 'Telegram'); });
    anchor.after(b);
  })();
})();
