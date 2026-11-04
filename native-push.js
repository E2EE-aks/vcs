/* KS · Android app only: notifications for new messages and incoming calls (Capacitor + Firebase Cloud Messaging).
   In a normal browser this file does nothing. window.KS_FCM is set by the APK build (true when Firebase is configured). */
(function(){
  'use strict';
  var C = window.Capacitor;
  var native = !!C && (C.isNativePlatform ? C.isNativePlatform() : (C.getPlatform ? C.getPlatform() !== 'web' : false));
  if (!native) return;
  var P = C.Plugins || {}, PN = P.PushNotifications, LN = P.LocalNotifications;
  var FCM = window.KS_FCM === true, tokenNow = '', doneFor = '', pendingTap = null, asked = false;

  /* channels: Android needs them to make a sound / pop up on the screen */
  function channels(){
    try {
      if (PN && PN.createChannel){
        PN.createChannel({ id:'messages', name:'Messages', description:'New chat messages', importance:4, visibility:1, vibration:true, lights:true });
        PN.createChannel({ id:'calls', name:'Calls', description:'Incoming voice and video calls', importance:5, visibility:1, vibration:true, lights:true });
      }
    } catch(e){}
  }
  async function perm(){
    try {
      var r = PN ? await PN.checkPermissions() : { receive:'denied' };
      if (r.receive === 'prompt' || r.receive === 'prompt-with-rationale') r = await PN.requestPermissions();
      return r.receive === 'granted';
    } catch(e){ return false; }
  }
  async function register(){
    if (!FCM || !PN) return;
    if (!(await perm())) return;
    try { await PN.register(); } catch(e){}
  }
  async function sendToken(){
    if (!tokenNow || typeof S === 'undefined' || !S.token || !S.d) return;
    var key = S.token + '|' + tokenNow; if (doneFor === key) return;
    try {
      var j = await callServer({ action:'pushRegister', token:S.token, fcm:tokenNow });
      if (j && j.ok) doneFor = key;
    } catch(e){}
  }
  window.ksPushOff = async function(){                                  // called when the user logs out: this phone stops getting that user's alerts
    try { if (tokenNow && S.token) await callServer({ action:'pushUnregister', token:S.token, fcm:tokenNow }); } catch(e){}
    doneFor = '';
  };

  if (PN){
    PN.addListener('registration', function(t){ tokenNow = t && t.value || ''; sendToken(); });
    PN.addListener('registrationError', function(){});
    PN.addListener('pushNotificationReceived', function(){});           // app is open: the app's own sounds / ringing already handle it
    PN.addListener('pushNotificationActionPerformed', function(ev){      // the notification was tapped
      pendingTap = (ev && ev.notification && ev.notification.data) || {};
    });
  }

  /* messages while the app is alive but hidden, when Firebase is not configured (otherwise Firebase shows them) */
  window.ksNativeNotify = async function(title, body, tag){
    if (FCM || !LN) return;
    try {
      var p = await LN.checkPermissions(); if (p.display !== 'granted') p = await LN.requestPermissions(); if (p.display !== 'granted') return;
      await LN.schedule({ notifications:[{ id: Math.floor(Math.random() * 2147483000), title:String(title || ''), body:String(body || ''), channelId:'messages' }] });
    } catch(e){}
  };

  channels();
  setInterval(function(){
    if (typeof S === 'undefined' || !S.token || !S.d) return;
    if (!asked){ asked = true; register(); }                              // after the first login: ask for notification permission once
    sendToken();
    if (pendingTap){
      var d = pendingTap; pendingTap = null;
      try {
        if (d.kind === 'msg' && d.with && typeof go === 'function'){ go('chat'); setTimeout(function(){ try { chatOpen(d.with); } catch(e){} }, 500); }
      } catch(e){}
    }
  }, 2500);
})();
