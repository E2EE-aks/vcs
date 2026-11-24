/* KS · Geo-fence attendance: when the phone is within 1000 m of the office, today is marked Present automatically
   and the notification "Present marked by geo fencing 🎉" is shown.
   - Android app (new APK): the phone itself watches the fence, so it works even when the app is closed
     (needs location = "Allow all the time").
   - Any other case (browser / old APK): the app checks the position every minute while it is open.
   The server (action geoMark) checks the distance again and only fills a day that is still empty. */
(function(){
  'use strict';
  var OFFICE = { name:'Goel Sinks India Pvt. Ltd., Rohini', lat:28.7216228, lng:77.0984359, radius:1000 };
  var C = window.Capacitor;
  var native = !!C && (C.isNativePlatform ? C.isNativePlatform() : (C.getPlatform ? C.getPlatform() !== 'web' : false));
  var KG = null;
  try { if (native) KG = (C.Plugins && C.Plugins.KsGeo) || (C.registerPlugin ? C.registerPlugin('KsGeo') : null); } catch(e){ KG = null; }
  var LN = native && C.Plugins ? C.Plugins.LocalNotifications : null;
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var say = function(m, bad){ try { toast(m, bad); } catch(e){} };
  var info = '', lastSig = '', busy = false, checking = false, nativeOk = null, st = { loc:false, bg:false };

  function key(){ var u = ''; try { u = (S.me && (S.me.username || S.me.id || S.me.name)) || ''; } catch(e){} return 'ks_geoatt_cfg_' + String(u); }
  function load(){ var c = null; try { c = JSON.parse(localStorage.getItem(key()) || 'null'); } catch(e){} return { on:!!(c && c.on), done:(c && c.done) || '' }; }
  function store(c){ try { localStorage.setItem(key(), JSON.stringify(c)); } catch(e){} }
  var ready = function(){ try { return typeof S !== 'undefined' && !!S.token && !!S.d && !!S.d.settings; } catch(e){ return false; } };
  function todayKey(){ var n = new Date(); return n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate(); }
  function markedToday(){ try { var n = new Date(); return +S.d.settings.year === n.getFullYear() && !!((S.d.attendance || {})[n.getMonth() + 1] || {})[n.getDate()]; } catch(e){ return false; } }
  function meters(a, b, c, d){
    var R = 6371000, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function celebrate(){
    say('Present marked by geo fencing 🎉');
    if (LN){
      (async function(){
        try {
          var p = await LN.checkPermissions(); if (p.display !== 'granted') return;
          await LN.schedule({ notifications:[{ id:7399, title:'Present marked by geo fencing 🎉', body:'You are at the office - today\'s attendance is marked Present.', schedule:{ at:new Date(Date.now() + 500) } }] });
        } catch(e){}
      })();
    }
  }

  /* ----- native: hand the fence + login to the phone ----- */
  async function plan(ask){
    if (!KG || busy) return; busy = true;
    try {
      var c = load();
      if (c.on && ready() && (typeof can !== 'function' || can('att'))){
        if (ask){ try { st = await KG.askPermission(); } catch(e){ info = 'Location permission was not given.'; } }
        else { try { st = await KG.status(); } catch(e){} }
        await KG.set({ on:true, lat:OFFICE.lat, lng:OFFICE.lng, radius:OFFICE.radius, api:(typeof API_URL !== 'undefined' ? API_URL : ''), token:String(S.token || ''), asUser:String(S.as || ''), emp:String(S.emp || '') });
        nativeOk = true;
        if (!st.loc) info = 'Allow location for this app (phone Settings → Apps → Permissions → Location).';
        else if (!st.bg) info = 'Set Location to “Allow all the time” so it also works when the app is closed.';
        else info = 'Geo-fence is on: within ' + OFFICE.radius + ' m of the office you are marked Present automatically.';
      } else {
        await KG.set({ on:false });
        info = '';
      }
    } catch(e){ nativeOk = false; KG = null; info = ''; }          // plugin missing in this APK: the in-app check below does the job
    finally { busy = false; var el = $('#gaInfo'); if (el) el.textContent = info; }
  }

  /* ----- app open: look at the position every minute ----- */
  function check(manual){
    var c = load();
    if (!c.on || checking || !ready() || (typeof can === 'function' && !can('att'))) return;
    if (!manual && (markedToday() || c.done === todayKey())) return;
    if (!navigator.geolocation){ if (manual) say('This device has no location access.', true); return; }
    checking = true;
    navigator.geolocation.getCurrentPosition(async function(pos){
      try {
        var la = pos.coords.latitude, lo = pos.coords.longitude, ac = pos.coords.accuracy || 0;
        var dist = meters(la, lo, OFFICE.lat, OFFICE.lng);
        var el = $('#gaDist'); if (el) el.textContent = 'You are about ' + (dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m') + ' from the office.';
        if (dist - Math.min(ac, 150) > OFFICE.radius){ if (manual) say('You are outside the ' + OFFICE.radius + ' m office area.', true); return; }
        if (markedToday()){ if (manual) say('Today is already marked.'); return; }
        var r = await api('geoMark', { lat:la, lng:lo, acc:ac, emp:S.emp });
        if (r.marked){
          var n = new Date(), m = n.getMonth() + 1, d = n.getDate();
          if (!S.d.attendance[m]) S.d.attendance[m] = {};
          S.d.attendance[m][d] = 'P';
          try { S.d.attAll[S.emp] = S.d.attendance; } catch(e){}
          store({ on:true, done:todayKey() }); celebrate();
          try { render(); } catch(e){}
        } else if (r.already){ store({ on:true, done:todayKey() }); if (manual) say('Today is already marked (' + r.code + ').'); }
        else if (r.yearMismatch){ if (manual) say('Attendance year in Settings is ' + r.year + '.', true); }
      } catch(e){ if (manual) say((e && e.message) || 'Could not check the location', true); }
      finally { checking = false; }
    }, function(err){
      checking = false;
      if (manual) say(err && err.code === 1 ? 'Location is blocked. Allow it for this app / site.' : 'Could not get your location. Switch on GPS and try again.', true);
    }, { enableHighAccuracy:true, timeout:20000, maximumAge:60000 });
  }

  function sig(){ var c = load(); return JSON.stringify([c.on, ready() ? String(S.token || '').slice(-12) + '|' + String(S.emp || '') + '|' + String(S.as || '') : '', todayKey()]); }
  setInterval(function(){
    if (!ready()) return;
    var s = sig(); if (s !== lastSig){ lastSig = s; if (KG) plan(false); }
    check(false);
  }, 60000);
  setTimeout(function(){ if (ready()){ lastSig = sig(); if (KG) plan(false); check(false); } }, 6000);

  /* ----- the card on the Attendance tab ----- */
  window.geoAttCard = function(){
    var c = load();
    return '<div class="card" id="gaCard" style="margin-top:16px"><h3>📍 Geo-fence attendance</h3>' +
      '<label style="display:flex;align-items:center;gap:10px;font-weight:600"><input type="checkbox" id="gaOn"' + (c.on ? ' checked' : '') + ' style="width:20px;height:20px"> Mark me Present automatically at the office</label>' +
      '<div class="muted" style="font-size:13px;margin-top:10px">Office: <b>' + OFFICE.name + '</b><br>Area: within <b>' + OFFICE.radius + ' m</b> (' + OFFICE.lat + ', ' + OFFICE.lng + ')</div>' +
      '<div class="muted" id="gaInfo" style="font-size:13px;margin-top:10px">' + (c.on ? info : '') + '</div>' +
      '<div class="muted" id="gaDist" style="font-size:13px;margin-top:6px"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn soft sm" id="gaNow">📡 Check my location now</button>' + (KG ? '<button class="btn ghost sm" id="gaPerm">🔓 Allow location all the time</button>' : '') + '</div>' +
      '<div class="muted" style="font-size:12px;margin-top:10px">When you reach the office the day is marked <b>P</b> and you get “Present marked by geo fencing 🎉”. A day that is already marked is never changed.' + (KG ? '' : ' (In the browser this works while the page is open; the Android app also works when closed.)') + '</div></div>';
  };
  window.geoAttBind = function(){
    var card = $('#gaCard'); if (!card) return;
    $('#gaOn').onchange = function(){
      var c = load(); c.on = this.checked; store(c); lastSig = sig();
      if (c.on) say('Geo-fence attendance is on');
      if (KG) plan(c.on); else check(true);
      var el = $('#gaInfo'); if (el) el.textContent = c.on ? info : '';
    };
    $('#gaNow').onclick = function(){ if (!load().on){ say('Switch the option on first', true); return; } check(true); };
    var p = $('#gaPerm'); if (p) p.onclick = function(){ plan(true); };
    if (KG && load().on) plan(false);
  };
})();
