/* KS · Attendance reminder (Android app): a notification every day at the time you choose, with two buttons - ✅ Present and ❌ Absent.
   Tap a button and today is marked. If today is already marked, no reminder is sent that day.
   The reminders are scheduled on the phone itself (they ring even when the app is closed); the app re-plans the next 14 days every time it is opened. */
(function(){
  'use strict';
  var C = window.Capacitor;
  var native = !!C && (C.isNativePlatform ? C.isNativePlatform() : (C.getPlatform ? C.getPlatform() !== 'web' : false));
  var LN = native && C.Plugins ? C.Plugins.LocalNotifications : null;
  var BASE = 7100, DAYS = 14, PK = 'ks_attrem_pending', CH = 'att_reminder';
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var say = function(m, bad){ try { toast(m, bad); } catch(e){} };
  var lastSig = '', info = '', busy = false;

  function key(){ var u = ''; try { u = (S.me && (S.me.username || S.me.id || S.me.name)) || ''; } catch(e){} return 'ks_attrem_cfg_' + String(u); }
  function load(){
    var c = null; try { c = JSON.parse(localStorage.getItem(key()) || 'null'); } catch(e){}
    c = c || {}; return { on:!!c.on, time:/^\d\d:\d\d$/.test(c.time || '') ? c.time : '09:00', days:Array.isArray(c.days) ? c.days : [1, 2, 3, 4, 5, 6] };
  }
  function store(c){ try { localStorage.setItem(key(), JSON.stringify(c)); } catch(e){} }
  var ready = function(){ try { return typeof S !== 'undefined' && !!S.token && !!S.d && !!S.d.settings; } catch(e){ return false; } };
  function marked(y, m, d){ try { return +S.d.settings.year === y && !!((S.d.attendance || {})[m] || {})[d]; } catch(e){ return false; } }
  function t12(t){ var h = +t.slice(0, 2), mi = t.slice(3); return (h % 12 || 12) + ':' + mi + ' ' + (h < 12 ? 'AM' : 'PM'); }

  async function allowed(ask){
    try { var p = await LN.checkPermissions(); if (p.display !== 'granted' && ask) p = await LN.requestPermissions(); return p.display === 'granted'; } catch(e){ return false; }
  }
  async function plan(ask){
    if (!LN || busy) return; busy = true;
    try {
      var ids = []; for (var i = 0; i <= DAYS; i++) ids.push({ id:BASE + i });
      try { await LN.cancel({ notifications:ids }); } catch(e){}
      var c = load(); info = '';
      if (!c.on || !ready() || !(typeof can === 'function' ? can('att') : true)) return;
      if (!(await allowed(ask))){ info = 'Notifications are blocked for this app. Allow them in the phone settings (App info → Notifications).'; return; }
      try { await LN.createChannel({ id:CH, name:'Attendance reminder', description:'Daily reminder to mark attendance', importance:4, visibility:1, vibration:true, lights:true }); } catch(e){}
      try { await LN.registerActionTypes({ types:[{ id:'ATT', actions:[{ id:'P', title:'✅ Present' }, { id:'A', title:'❌ Absent' }] }] }); } catch(e){}
      var hh = +c.time.slice(0, 2), mm = +c.time.slice(3), now = new Date(), list = [], first = null;
      for (var o = 0; o < DAYS; o++){
        var dt = new Date(); dt.setDate(dt.getDate() + o); dt.setHours(hh, mm, 0, 0);
        if (dt <= now || c.days.indexOf(dt.getDay()) < 0) continue;
        var y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
        if (marked(y, m, d)) continue;
        if (!first) first = dt;
        list.push({ id:BASE + o, title:'Attendance reminder', body:'Mark today (' + WD[dt.getDay()] + ', ' + d + ' ' + MN[m - 1] + '): tap ✅ Present or ❌ Absent.', channelId:CH, actionTypeId:'ATT', extra:{ y:y, m:m, d:d }, schedule:{ at:dt, allowWhileIdle:true } });
      }
      if (list.length) await LN.schedule({ notifications:list });
      info = first ? 'Next reminder: ' + WD[first.getDay()] + ' ' + first.getDate() + ' ' + MN[first.getMonth()] + ', ' + t12(c.time) : (c.days.length ? 'No reminder needed right now.' : 'Choose at least one day.');
    } catch(e){ info = 'Could not set the reminder: ' + ((e && e.message) || e); }
    finally { busy = false; var el = $('#arInfo'); if (el) el.textContent = info; }
  }
  function sig(){
    var n = new Date(), c = load();
    return JSON.stringify([c, n.toDateString(), ready() && marked(n.getFullYear(), n.getMonth() + 1, n.getDate())]);
  }

  /* a button on the notification was tapped -> mark that day as soon as the app has loaded */
  if (LN){
    try {
      LN.addListener('localNotificationActionPerformed', function(ev){
        var id = ev && ev.actionId, x = (ev && ev.notification && ev.notification.extra) || {};
        if ((id === 'P' || id === 'A') && x.y){ try { localStorage.setItem(PK, JSON.stringify({ y:x.y, m:x.m, d:x.d, code:id, at:Date.now() })); } catch(e){} }
        else if (x.y){ try { localStorage.setItem(PK, JSON.stringify({ open:1, at:Date.now() })); } catch(e){} }
      });
    } catch(e){}
  }
  var working = false;
  async function pending(){
    var p = null; try { p = JSON.parse(localStorage.getItem(PK) || 'null'); } catch(e){}
    if (!p) return;
    if (Date.now() - (p.at || 0) > 48 * 3600 * 1000){ try { localStorage.removeItem(PK); } catch(e){} return; }
    if (!ready() || working) return;
    working = true;
    try { localStorage.removeItem(PK); } catch(e){}
    try {
      if (p.open){ if (typeof go === 'function') go('attendance'); return; }
      if (+S.d.settings.year !== +p.y){ say('Attendance year in Settings is ' + S.d.settings.year + ', so ' + p.d + ' ' + MN[p.m - 1] + ' ' + p.y + ' could not be marked.', true); return; }
      if (typeof can === 'function' && !can('att')) return;
      if (!(S.d.statuses || []).some(function(s){ return s.code === p.code; })){ say('Status “' + p.code + '” does not exist in Settings.', true); return; }
      if (typeof setAtt === 'function') await setAtt([{ month:+p.m, day:+p.d, code:p.code }]);
      say('Marked ' + (p.code === 'P' ? 'Present' : 'Absent') + ' for ' + p.d + ' ' + MN[p.m - 1] + ' ✓');
    } catch(e){}
    finally { working = false; }
  }
  setInterval(function(){
    pending();
    if (!LN || !ready()) return;
    var s = sig(); if (s !== lastSig){ lastSig = s; plan(false); }
  }, 2000);

  /* ---------- the card on the Attendance tab ---------- */
  window.attRemCard = function(){
    var c = load();
    if (!LN) return '<div class="card" style="margin-top:16px"><h3>⏰ Attendance reminder</h3><div class="muted" style="font-size:13px">Daily reminders with ✅ Present / ❌ Absent buttons work in the <b>Android app</b>. Open this page in the app to set one.</div></div>';
    return '<div class="card" id="arCard" style="margin-top:16px"><h3>⏰ Attendance reminder</h3>' +
      '<label style="display:flex;align-items:center;gap:10px;font-weight:600"><input type="checkbox" id="arOn"' + (c.on ? ' checked' : '') + ' style="width:20px;height:20px"> Remind me every day</label>' +
      '<div style="margin-top:12px"><label style="font-size:12.5px;font-weight:700;color:var(--label)">Reminder time</label>' +
      '<input class="input" type="time" id="arTime" value="' + c.time + '" style="margin-top:4px"></div>' +
      '<div style="margin-top:12px"><label style="font-size:12.5px;font-weight:700;color:var(--label)">Days</label><div class="chips" id="arDays" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' +
      [1, 2, 3, 4, 5, 6, 0].map(function(d){ var on = c.days.indexOf(d) >= 0; return '<button type="button" class="btn sm ' + (on ? '' : 'ghost') + '" data-d="' + d + '">' + WD[d] + '</button>'; }).join('') + '</div></div>' +
      '<div class="muted" id="arInfo" style="font-size:13px;margin-top:12px">' + (info || '') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn soft sm" id="arTest">🔔 Send a test now</button><button class="btn ghost sm" id="arExact">⏱ Allow exact time</button></div>' +
      '<div class="muted" style="font-size:12px;margin-top:10px">The notification shows two buttons. Tap ✅ Present or ❌ Absent and today is marked. If today is already marked, no reminder comes that day.</div></div>';
  };
  window.attRemBind = function(){
    var card = $('#arCard'); if (!card || !LN) return;
    var save = function(ask){ var c = load(); c.on = $('#arOn').checked; c.time = $('#arTime').value || '09:00'; store(c); lastSig = sig(); plan(!!ask); };
    $('#arOn').onchange = function(){ save(true); };
    $('#arTime').onchange = function(){ save(true); };
    card.querySelectorAll('[data-d]').forEach(function(b){
      b.onclick = function(){
        var c = load(), d = +b.dataset.d, i = c.days.indexOf(d); if (i >= 0) c.days.splice(i, 1); else c.days.push(d);
        store(c); b.classList.toggle('ghost', c.days.indexOf(d) < 0); lastSig = sig(); plan(false);
      };
    });
    $('#arTest').onclick = async function(){
      if (!(await allowed(true))){ say('Please allow notifications for this app first.', true); return; }
      try {
        await LN.createChannel({ id:CH, name:'Attendance reminder', description:'Daily reminder to mark attendance', importance:4, visibility:1, vibration:true, lights:true });
        await LN.registerActionTypes({ types:[{ id:'ATT', actions:[{ id:'P', title:'✅ Present' }, { id:'A', title:'❌ Absent' }] }] });
        var n = new Date(), at = new Date(Date.now() + 5000);
        await LN.schedule({ notifications:[{ id:BASE + 90, title:'Attendance reminder (test)', body:'Tap ✅ Present or ❌ Absent to mark today.', channelId:CH, actionTypeId:'ATT', extra:{ y:n.getFullYear(), m:n.getMonth() + 1, d:n.getDate() }, schedule:{ at:at, allowWhileIdle:true } }] });
        say('Test notification comes in 5 seconds - you can close the app now');
      } catch(e){ say('Could not send the test: ' + ((e && e.message) || e), true); }
    };
    $('#arExact').onclick = async function(){
      try {
        var r = LN.checkExactNotificationSetting ? await LN.checkExactNotificationSetting() : { exact_alarm:'granted' };
        if (r.exact_alarm === 'granted') say('Exact time is already allowed ✓'); else if (LN.changeExactNotificationSetting) await LN.changeExactNotificationSetting();
      } catch(e){ say('Could not open the setting', true); }
    };
    var el = $('#arInfo'); if (el && !info) plan(false);
  };
})();
