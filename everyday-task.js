/* KS · Everyday Task tab
   + dabao -> task ka naam, date, time aur Roz / Har hafte / Har saal / Sirf ek baar chuno.
   Reminder time par notification aati hai (Android app me ✅ Yes / ❌ No buttons ke saath, app band ho tab bhi).
   App khula ho to popup aata hai. Har din ka jawab (kiya / nahi kiya) server par record hota hai -> History me dikhta hai.
   Data: Code.gs ke 3 naye actions (evGet, evSaveTasks, evMark). */
(function(){
  'use strict';
  var C = window.Capacitor;
  var native = !!C && (C.isNativePlatform ? C.isNativePlatform() : (C.getPlatform ? C.getPlatform() !== 'web' : false));
  var LN = native && C.Plugins ? C.Plugins.LocalNotifications : null;
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var BASE = 810000, DAYS = 14, CH = 'ev_task', IDK = 'ks_evt_ids', PK = 'ks_evt_pending';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var esc = function(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  var say = function(m, bad){ try { toast(m, bad); } catch(e){} };
  var D = { tasks:[], hist:{}, loaded:false, loading:false, err:'', user:'' };
  var info = '', planBusy = false, pendBusy = false, shown = {}, lastDay = '', lastSig = '';

  try { TITLES.everyday = ['Everyday Task', 'Roz ke kaam — reminder, Yes / No aur record']; } catch(e){}
  try { NAV_GRP.everyday = 'Overview'; } catch(e){}

  /* ---------- dates ---------- */
  function p2(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function fromYmd(s){ var a = String(s).split('-'); return new Date(+a[0], +a[1] - 1, +a[2], 12, 0, 0); }
  function todayS(){ return ymd(new Date()); }
  function wdOf(s){ return fromYmd(s).getDay(); }
  function addDays(d, n){ var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function pretty(s){ var d = fromYmd(s); return WD[d.getDay()] + ', ' + d.getDate() + ' ' + MN[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); }
  function t12(t){ var h = +t.slice(0, 2), mi = t.slice(3, 5); return (h % 12 || 12) + ':' + mi + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function months(){ var out = [], n = new Date(); for (var i = 0; i < 4; i++){ var d = new Date(n.getFullYear(), n.getMonth() - i, 1); out.push(d.getFullYear() + p2(d.getMonth() + 1)); } return out; }

  /* ---------- task rules ---------- */
  function occurs(t, ds){
    if (!t || !t.date || ds < t.date) return false;
    if (t.rep === 'once') return ds === t.date;
    if (t.rep === 'weekly') return (t.days || []).indexOf(wdOf(ds)) >= 0;
    if (t.rep === 'yearly') return ds.slice(5) === t.date.slice(5);
    return true;
  }
  function repText(t){
    var tm = ' · ' + t12(t.time);
    if (t.rep === 'once') return 'Sirf ek baar · ' + pretty(t.date) + tm;
    if (t.rep === 'weekly') return 'Har hafte: ' + (t.days || []).slice().sort().map(function(d){ return WD[d]; }).join(', ') + tm;
    if (t.rep === 'yearly'){ var d = fromYmd(t.date); return 'Har saal: ' + d.getDate() + ' ' + MN[d.getMonth()] + tm; }
    return 'Roz' + tm;
  }
  function st(ds, id){ return ((D.hist[ds] || {})[id]) || ''; }
  function find(id){ for (var i = 0; i < D.tasks.length; i++) if (D.tasks[i].id === id) return D.tasks[i]; return null; }

  /* ---------- server ---------- */
  function ready(){ try { return typeof S !== 'undefined' && !!S.token && !!S.d; } catch(e){ return false; } }
  function userKey(){ try { return String((S.me && (S.me.username || S.me.id || S.me.name)) || '') + '|' + String(S.as || ''); } catch(e){ return ''; } }
  function onView(){ try { return S.view === 'everyday'; } catch(e){ return false; } }
  function load(){
    if (D.loading || !ready()) return Promise.resolve();
    D.loading = true; D.err = ''; var uk = userKey();
    return api('evGet', { months:months() }).then(function(r){
      var t = []; try { t = JSON.parse(r.tasks || '[]'); if (!Array.isArray(t)) t = []; } catch(e){ t = []; }
      var h = {};
      Object.keys(r.hist || {}).forEach(function(k){ try { var o = JSON.parse(r.hist[k] || '{}'); Object.keys(o).forEach(function(d){ h[d] = o[d]; }); } catch(e){} });
      D.tasks = t; D.hist = h; D.loaded = true; D.user = uk;
    }).catch(function(e){ D.err = (e && e.message) || 'Load nahi ho paya'; }).then(function(){ D.loading = false; draw(); plan(false); });
  }
  function saveTasks(){ return api('evSaveTasks', { tasks:JSON.stringify(D.tasks) }); }
  function setLocal(ds, id, v){ var o = D.hist[ds] || (D.hist[ds] = {}); if (v) o[id] = v; else delete o[id]; if (!Object.keys(o).length) delete D.hist[ds]; }
  function mark(id, ds, v){
    var had = st(ds, id); setLocal(ds, id, v); draw(); drawHist();
    return api('evMark', { date:ds, id:id, v:v }).then(function(){ plan(false); }).catch(function(e){ setLocal(ds, id, had); draw(); drawHist(); try { handleErr(e); } catch(x){} });
  }

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '#evRoot .ev-head{display:flex;align-items:center;justify-content:space-between;gap:12px}',
    '#evRoot .ev-head h3{margin:0}',
    '.ev-plus{width:48px;height:48px;border-radius:50%;border:0;background:var(--brand);color:var(--on-brand);font-size:30px;line-height:1;cursor:pointer;box-shadow:var(--shadow);flex:none}',
    '.ev-row{display:flex;align-items:center;gap:10px;padding:11px 0;border-top:1px solid var(--line);flex-wrap:wrap}',
    '.ev-row.late{background:var(--warn-soft);margin:0 -8px;padding:11px 8px;border-radius:10px}',
    '.ev-t{font-weight:800;min-width:66px;font-variant-numeric:tabular-nums}',
    '.ev-m{flex:1;min-width:130px;display:flex;flex-direction:column;gap:2px}',
    '.ev-m small{color:var(--muted)}',
    '.ev-a{display:flex;gap:6px}',
    '.ev-b{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:9px;padding:6px 11px;font-weight:700;cursor:pointer;font-size:calc(13px*var(--fs))}',
    '.ev-b.y.on{background:var(--good-soft);color:var(--good);border-color:var(--good)}',
    '.ev-b.n.on{background:var(--bad-soft);color:var(--bad);border-color:var(--bad)}',
    '.ev-dots{display:flex;gap:4px;margin-top:6px}',
    '.ev-d{width:20px;height:20px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;background:var(--soft2);color:var(--muted)}',
    '.ev-d.y{background:var(--good-soft);color:var(--good)}.ev-d.n{background:var(--bad-soft);color:var(--bad)}.ev-d.off{background:transparent;border:1px dashed var(--line)}',
    '.ev-tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
    '.ev-days{display:flex;gap:6px;flex-wrap:wrap}',
    '.ev-hsum{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px}',
    '.ev-hrow{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid var(--line)}',
    '.ev-hrow .d{flex:1;font-weight:600}',
    '.ev-hscroll{max-height:56vh;overflow:auto}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- the tab ---------- */
  function todayRows(){ var ds = todayS(); return D.tasks.filter(function(t){ return occurs(t, ds); }).sort(function(a, b){ return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; }); }
  function yn(id, ds, cur, attr){
    return '<span class="ev-a"><button type="button" class="ev-b y' + (cur === 'Y' ? ' on' : '') + '" ' + attr + '="Y" data-id="' + esc(id) + '" data-ds="' + ds + '">✅ Yes</button>' +
      '<button type="button" class="ev-b n' + (cur === 'N' ? ' on' : '') + '" ' + attr + '="N" data-id="' + esc(id) + '" data-ds="' + ds + '">❌ No</button></span>';
  }
  function dots(t){
    var out = '';
    for (var i = 6; i >= 0; i--){
      var ds = ymd(addDays(new Date(), -i));
      if (!occurs(t, ds)){ out += '<span class="ev-d off"></span>'; continue; }
      var s = st(ds, t.id);
      out += '<span class="ev-d ' + (s === 'Y' ? 'y' : s === 'N' ? 'n' : '') + '" title="' + esc(pretty(ds)) + '">' + (s === 'Y' ? '✓' : s === 'N' ? '✕' : '') + '</span>';
    }
    return out;
  }
  function draw(){
    var root = $('#evRoot'); if (!root) return;
    var ds = todayS(), now = new Date(), hm = p2(now.getHours()) + ':' + p2(now.getMinutes());
    var head = '<div class="card" style="margin-bottom:16px"><div class="ev-head"><div><h3>✅ Everyday Task</h3><div class="muted" style="font-size:calc(13px*var(--fs))">Naya task jodne ke liye + dabao</div></div>' +
      '<button type="button" class="ev-plus" id="evAdd" aria-label="Add task">+</button></div></div>';
    if (!D.loaded){ root.innerHTML = head + '<div class="card muted" style="text-align:center">' + (D.err ? '⚠️ ' + esc(D.err) + ' <button class="btn sm soft" id="evRetry">Retry</button>' : 'Loading…') + '</div>'; return; }
    var rows = todayRows();
    var todayCard = '<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:4px">📅 Aaj — ' + esc(pretty(ds)) + '</h3>' +
      (rows.length ? rows.map(function(t){
        var cur = st(ds, t.id), late = !cur && t.time <= hm;
        return '<div class="ev-row' + (late ? ' late' : '') + '"><div class="ev-t">' + t12(t.time) + '</div><div class="ev-m"><b>' + esc(t.name) + '</b><small>' + esc(repText(t)) + (late ? ' · ⏰ time ho gaya' : '') + '</small></div>' + yn(t.id, ds, cur, 'data-m') + '</div>';
      }).join('') : '<div class="muted" style="padding:10px 0">Aaj ke liye koi task nahi hai.</div>') + '</div>';
    var all = '<div class="card"><h3 style="margin-bottom:4px">🗂️ Mere tasks (' + D.tasks.length + ')</h3>' +
      (D.tasks.length ? D.tasks.slice().sort(function(a, b){ return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; }).map(function(t){
        var c = counts(t);
        return '<div class="ev-row" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + esc(t.name) + '</b><span class="muted" style="font-size:calc(12.5px*var(--fs))">✅ ' + c.y + ' · ❌ ' + c.n + '</span></div>' +
          '<div class="muted" style="font-size:calc(13px*var(--fs))">' + esc(repText(t)) + '</div><div class="ev-dots" title="Pichhle 7 din">' + dots(t) + '</div>' +
          '<div class="ev-tools"><button type="button" class="btn soft sm" data-h="' + esc(t.id) + '">📜 History</button><button type="button" class="btn ghost sm" data-e="' + esc(t.id) + '">✏️ Edit</button><button type="button" class="btn ghost sm" data-x="' + esc(t.id) + '">🗑️ Delete</button></div></div>';
      }).join('') : '<div class="muted" style="padding:10px 0">Abhi koi task nahi. Upar + dabakar pehla task jodo.</div>') + '</div>';
    var note = '<div class="muted" id="evInfo" style="font-size:12.5px;margin:12px 4px">' + esc(info || (LN ? '' : 'Notification (✅ Yes / ❌ No buttons ke saath) Android app me aati hai. Browser me app khula ho tab popup aayega.')) + '</div>';
    root.innerHTML = head + todayCard + all + note;
  }
  function counts(t){
    var y = 0, n = 0, u = 0, today = todayS();
    for (var i = 0; i < 90; i++){ var ds = ymd(addDays(new Date(), -i)); if (!occurs(t, ds)) continue; var s = st(ds, t.id); if (s === 'Y') y++; else if (s === 'N') n++; else if (ds < today) u++; }
    return { y:y, n:n, u:u };
  }
  function bindRoot(){
    var root = $('#evRoot'); if (!root || root.__b) return; root.__b = 1;
    root.addEventListener('click', function(e){
      var t = e.target, b;
      if (t.closest('#evAdd')) return form('');
      if (t.closest('#evRetry')){ D.err = ''; return load(); }
      if ((b = t.closest('[data-m]'))){ var cur = st(b.dataset.ds, b.dataset.id), v = b.dataset.m; return mark(b.dataset.id, b.dataset.ds, cur === v ? '' : v); }
      if ((b = t.closest('[data-h]'))) return history(b.dataset.h);
      if ((b = t.closest('[data-e]'))) return form(b.dataset.e);
      if ((b = t.closest('[data-x]'))) return del(b.dataset.x);
    });
  }

  /* ---------- add / edit ---------- */
  function form(id){
    var x = id ? find(id) : null;
    if (id && !x) return;
    var nh = new Date(Date.now() + 3600000);
    var date = x ? x.date : todayS(), time = x ? x.time : p2(nh.getHours()) + ':00', rep = x ? x.rep : 'daily';
    var days = x && x.days && x.days.length ? x.days.slice() : [wdOf(date)];
    var w = openModal('<h3>' + (x ? 'Task edit karo' : '➕ Naya task') + '</h3><p class="sub" id="evSub"></p>' +
      '<form id="evF" autocomplete="off">' +
        '<div class="field"><label>Task ka naam</label><input class="input" name="name" maxlength="120" placeholder="e.g. Dawai leni hai, Walk, Pooja" value="' + esc(x ? x.name : '') + '"></div>' +
        '<div class="field"><label>Repeat</label><select class="select" name="rep">' +
          [['daily', '🔁 Roz (Daily)'], ['weekly', '📆 Har hafte (Weekly)'], ['yearly', '🎂 Har saal (Yearly)'], ['once', '🎯 Sirf ek baar (manual date & time)']].map(function(o){ return '<option value="' + o[0] + '"' + (o[0] === rep ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
        '<div class="row2"><div class="field"><label id="evDL">Date</label><input class="input" type="date" name="date" value="' + date + '"></div>' +
          '<div class="field"><label>Time</label><input class="input" type="time" name="time" value="' + time + '"></div></div>' +
        '<div class="field" id="evDW"><label>Kaun se din</label><div class="ev-days" id="evDays">' +
          [1, 2, 3, 4, 5, 6, 0].map(function(d){ return '<button type="button" class="btn sm ' + (days.indexOf(d) >= 0 ? '' : 'ghost') + '" data-d="' + d + '">' + WD[d] + '</button>'; }).join('') + '</div></div>' +
        '<div class="foot"><button type="button" class="btn ghost" data-no>Cancel</button><button type="submit" class="btn">Save</button></div>' +
      '</form>');
    var f = $('#evF', w), sub = $('#evSub', w);
    function sync(){
      var r = f.elements['rep'].value;
      $('#evDW', w).style.display = r === 'weekly' ? '' : 'none';
      $('#evDL', w).textContent = r === 'once' ? 'Target date' : 'Shuru hone ki date';
      sub.textContent = { daily:'Har din is time par reminder aayega.', weekly:'Chune hue dino par, is time par reminder aayega.', yearly:'Har saal isi date (din-mahina) par reminder aayega.', once:'Sirf isi date aur time par ek baar reminder aayega.' }[r];
    }
    f.elements['rep'].onchange = sync; sync();
    $('#evDays', w).onclick = function(e){
      var b = e.target.closest('[data-d]'); if (!b) return; var d = +b.dataset.d, i = days.indexOf(d);
      if (i >= 0) days.splice(i, 1); else days.push(d);
      b.classList.toggle('ghost', days.indexOf(d) < 0);
    };
    $('[data-no]', w).onclick = function(){ w.remove(); };
    f.onsubmit = function(e){
      e.preventDefault();
      var E = f.elements, name = E['name'].value.trim(), r = E['rep'].value, dt = E['date'].value, tm = E['time'].value;
      if (!name) return say('Task ka naam likho.', true);
      if (!dt) return say('Date chuno.', true);
      if (!/^\d\d:\d\d$/.test(tm)) return say('Time chuno.', true);
      if (r === 'weekly' && !days.length) return say('Kam se kam ek din chuno.', true);
      if (D.tasks.length >= 150 && !x) return say('Bahut zyada tasks ho gaye (max 150).', true);
      var t;
      if (x){ t = x; t.name = name; t.rep = r; t.date = dt; t.time = tm; }
      else {
        var n = 0; D.tasks.forEach(function(q){ if ((q.n || 0) > n) n = q.n; });
        t = { id:'t' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36), n:n + 1, name:name, rep:r, date:dt, time:tm, c:Date.now() };
        D.tasks.push(t);
      }
      if (r === 'weekly') t.days = days.slice().sort(); else delete t.days;
      var btn = $('button[type=submit]', f); btn.disabled = true;
      saveTasks().then(function(){ w.remove(); say(x ? 'Task update ho gaya ✓' : 'Task add ho gaya ✓'); draw(); plan(true); })
        .catch(function(er){ btn.disabled = false; try { handleErr(er); } catch(z){} load(); });
    };
    setTimeout(function(){ try { f.elements['name'].focus(); } catch(e){} }, 60);
  }
  function del(id){
    var t = find(id); if (!t) return;
    confirmBox('Task delete karo?', '“' + t.name + '” hata diya jayega (iski History bhi nahi dikhegi).', 'Delete', true).then(function(ok){
      if (!ok) return;
      D.tasks = D.tasks.filter(function(q){ return q.id !== id; }); draw();
      saveTasks().then(function(){ say('Task delete ho gaya'); plan(false); }).catch(function(e){ try { handleErr(e); } catch(z){} load(); });
    });
  }

  /* ---------- history ---------- */
  var H = { id:'' };
  function history(id){
    var t = find(id); if (!t) return; H.id = id;
    var w = openModal('<div id="evH"></div>');
    w.addEventListener('click', function(e){
      var b = e.target.closest('[data-hv]'); if (!b) return;
      var cur = st(b.dataset.ds, b.dataset.id), v = b.dataset.hv; mark(b.dataset.id, b.dataset.ds, cur === v ? '' : v);
    });
    w.addEventListener('click', function(e){ if (e.target.closest('[data-hx]')){ H.id = ''; w.remove(); } });
    drawHist();
  }
  function drawHist(){
    var el = $('#evH'); if (!el) { H.id = ''; return; }
    var t = find(H.id); if (!t){ H.id = ''; return; }
    var rows = [], y = 0, n = 0, u = 0, today = todayS();
    for (var i = 0; i < 90; i++){
      var ds = ymd(addDays(new Date(), -i)); if (!occurs(t, ds)) continue;
      var s = st(ds, t.id); rows.push({ ds:ds, s:s });
      if (s === 'Y') y++; else if (s === 'N') n++; else if (ds < today) u++;
    }
    el.innerHTML = '<h3>📜 ' + esc(t.name) + '</h3><p class="sub" style="margin-bottom:6px">' + esc(repText(t)) + ' · pichhle 90 din</p>' +
      '<div class="ev-hsum"><span class="chip">✅ Kiya: ' + y + '</span><span class="chip">❌ Nahi kiya: ' + n + '</span><span class="chip">⏳ Jawab nahi: ' + u + '</span></div>' +
      '<div class="ev-hscroll">' + (rows.length ? rows.map(function(r){
        return '<div class="ev-hrow"><div class="d">' + esc(pretty(r.ds)) + (r.ds === today ? ' <span class="muted">(aaj)</span>' : '') + '</div>' + yn(t.id, r.ds, r.s, 'data-hv') + '</div>';
      }).join('') : '<div class="muted" style="padding:12px 0">Abhi koi din record me nahi hai.</div>') + '</div>' +
      '<div class="foot"><button class="btn ghost" data-hx>Close</button></div>';
  }

  /* ---------- popup when the app is open ---------- */
  function popup(t, ds){
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch(e){}
    var w = openModal('<h3>⏰ ' + esc(t.name) + '</h3><p class="sub">Kya ye kaam ho gaya? <b>' + esc(t12(t.time)) + '</b></p>' +
      '<div class="foot" style="justify-content:center"><button class="btn" data-v="Y">✅ Yes</button><button class="btn danger" data-v="N">❌ No</button><button class="btn ghost" data-v="">Baad me</button></div>');
    w.addEventListener('click', function(e){
      var b = e.target.closest('[data-v]'); if (!b) return; w.remove();
      if (b.dataset.v) mark(t.id, ds, b.dataset.v);
      else { var k = ds + '|' + t.id; setTimeout(function(){ delete shown[k]; }, 10 * 60 * 1000); }
    });
  }
  function dueCheck(){
    if (!ready() || !D.loaded || document.hidden || document.querySelector('.overlay')) return;
    var now = new Date(), ds = ymd(now), mins = now.getHours() * 60 + now.getMinutes();
    var list = todayRows();
    for (var i = 0; i < list.length; i++){
      var t = list[i], tm = +t.time.slice(0, 2) * 60 + +t.time.slice(3, 5), k = ds + '|' + t.id;
      if (tm > mins || mins - tm > 720 || st(ds, t.id) || shown[k]) continue;
      shown[k] = 1; popup(t, ds); return;
    }
  }

  /* ---------- notifications (Android app) ---------- */
  async function allowed(ask){
    try { var p = await LN.checkPermissions(); if (p.display !== 'granted' && ask) p = await LN.requestPermissions(); return p.display === 'granted'; } catch(e){ return false; }
  }
  async function plan(ask){
    if (!LN || planBusy) return; planBusy = true;
    try {
      var old = []; try { old = JSON.parse(localStorage.getItem(IDK) || '[]'); } catch(e){}
      if (old.length){ try { await LN.cancel({ notifications:old.map(function(i){ return { id:i }; }) }); } catch(e){} }
      try { localStorage.setItem(IDK, '[]'); } catch(e){}
      if (!D.loaded || !ready()) return;
      if (!D.tasks.length){ info = ''; return; }
      if (!(await allowed(ask))){ info = 'Notifications band hain. Phone settings → App info → Notifications me allow karo.'; return; }
      try { await LN.createChannel({ id:CH, name:'Everyday Task', description:'Reminder for your everyday tasks', importance:4, visibility:1, vibration:true, lights:true }); } catch(e){}
      try { await LN.registerActionTypes({ types:[{ id:'EVT', actions:[{ id:'Y', title:'✅ Yes' }, { id:'N', title:'❌ No' }] }] }); } catch(e){}
      var now = new Date(), list = [];
      for (var o = 0; o < DAYS; o++){
        var day = addDays(now, o), ds = ymd(day);
        D.tasks.forEach(function(t){
          if (!occurs(t, ds) || st(ds, t.id)) return;
          var dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +t.time.slice(0, 2), +t.time.slice(3, 5), 0, 0);
          if (dt <= now) return;
          list.push({ id:BASE + (t.n || 1) * 20 + o, title:'⏰ ' + t.name, body:'Kya ye kaam ho gaya? (' + pretty(ds) + ', ' + t12(t.time) + ') — ✅ Yes ya ❌ No dabao.',
            channelId:CH, actionTypeId:'EVT', schedule:{ at:dt, allowWhileIdle:true }, extra:{ evt:1, id:t.id, ds:ds } });
        });
      }
      list.sort(function(a, b){ return a.schedule.at - b.schedule.at; }); list = list.slice(0, 400);
      if (list.length){
        await LN.schedule({ notifications:list });
        try { localStorage.setItem(IDK, JSON.stringify(list.map(function(n){ return n.id; }))); } catch(e){}
        var f = list[0], a = f.schedule.at; info = 'Agla reminder: ' + WD[a.getDay()] + ' ' + a.getDate() + ' ' + MN[a.getMonth()] + ', ' + t12(p2(a.getHours()) + ':' + p2(a.getMinutes())) + ' — ' + f.title.replace('⏰ ', '');
      } else info = 'Abhi koi reminder baaki nahi hai.';
    } catch(e){ info = 'Reminder set nahi ho paya: ' + ((e && e.message) || e); }
    finally { planBusy = false; var el = $('#evInfo'); if (el) el.textContent = info; }
  }
  if (LN){
    try {
      LN.addListener('localNotificationActionPerformed', function(ev){
        var x = (ev && ev.notification && ev.notification.extra) || {}; if (!x.evt) return;
        var p = []; try { p = JSON.parse(localStorage.getItem(PK) || '[]'); } catch(e){}
        if (ev.actionId === 'Y' || ev.actionId === 'N') p.push({ id:x.id, ds:x.ds, v:ev.actionId, at:Date.now() });
        else p.push({ open:1, at:Date.now() });
        try { localStorage.setItem(PK, JSON.stringify(p.slice(-50))); } catch(e){}
      });
    } catch(e){}
  }
  function pend(){
    if (!ready() || !D.loaded || pendBusy) return;
    var p = []; try { p = JSON.parse(localStorage.getItem(PK) || '[]'); } catch(e){}
    if (!p.length) return;
    pendBusy = true; try { localStorage.removeItem(PK); } catch(e){}
    var open = false, got = 0, chain = Promise.resolve();
    p.forEach(function(x){
      if (Date.now() - (x.at || 0) > 72 * 3600 * 1000) return;
      if (x.open){ open = true; return; }
      if (!find(x.id)) return;
      got++; chain = chain.then(function(){ return mark(x.id, x.ds, x.v); });
    });
    chain.then(function(){ pendBusy = false; if (got) say('Task record ho gaya ✓'); if (open && typeof go === 'function') go('everyday'); });
  }

  /* ---------- timers ---------- */
  var tick = 0;
  setInterval(function(){
    tick++;
    if (!ready()){ if (D.loaded || D.tasks.length){ D.tasks = []; D.hist = {}; D.loaded = false; D.user = ''; shown = {}; } return; }
    if (D.loaded && D.user !== userKey()){ D.tasks = []; D.hist = {}; D.loaded = false; shown = {}; }
    if (!D.loaded && !D.loading && !D.err) load();
    pend();
    var d = todayS();
    if (d !== lastDay){ lastDay = d; if (D.loaded){ draw(); plan(false); } }
    if (tick % 10 === 0) dueCheck();
  }, 2000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && ready() && D.loaded && !D.loading){ D.loaded = false; load(); } });

  window.vEveryday = function(){ return '<div id="evRoot"></div>'; };
  window.everydayAfter = function(){ bindRoot(); draw(); if (!D.loaded && !D.loading){ D.err = ''; load(); } };
  window.__evt = { occurs:occurs, repText:repText, ymd:ymd };

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="everyday"]')) return;
    var anchor = nav.querySelector('[data-v="timetable"]') || nav.querySelector('[data-v="work"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'everyday'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '✅').replace('Updates', 'Everyday Task'); });
    anchor.after(b);
  })();
})();
