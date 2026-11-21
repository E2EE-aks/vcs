/* KS · fresh version AFTER A DEPLOY ONLY.
   The saved copy of the website is cleared exactly once when a new deploy has gone live (the last Render deploy of an upload).
   It is NOT cleared on login, on button taps, on tab switches or on every reload any more.
   How: the server keeps a small "deploy stamp" that changes only when the last deploy finishes (GET /deploy-stamp).
   When a browser sees a stamp different from the one it saved, it clears its caches once and reloads once.
   Login, settings and drafts are never touched, WhatsApp / Telegram stay linked (they live on the server). */
(function(){
  'use strict';
  var KEY = 'ks_deploy_stamp', busy = false, reloading = false;

  function apiBase(){ try { return typeof API_URL !== 'undefined' ? API_URL : ''; } catch (e) { return ''; } }
  function getSaved(){ try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setSaved(v){ try { localStorage.setItem(KEY, v); } catch (e) {} }
  function keepView(){                                              // so the reload brings the user back to the SAME screen (not the dashboard)
    try { if (typeof S !== 'undefined' && S.view) localStorage.setItem('ks_keep_view', JSON.stringify({ v: S.view, tab: (typeof DEP !== 'undefined' && DEP.tab) || '', t: Date.now() })); } catch (e) {}
  }
  function typing(){ var a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value && a.type !== 'button'); }

  async function clearCaches(){
    if (window.caches){ var ks = await caches.keys(); await Promise.all(ks.filter(function(k){ return k !== 'ks-prefs'; }).map(function(k){ return caches.delete(k); })); }
    if (navigator.serviceWorker){ var rg = await navigator.serviceWorker.getRegistration(); if (rg) await rg.update().catch(function(){}); }   // the service worker stays registered (push notifications keep working)
  }

  /* only LOOKS at the stamp (no clearing); clears only when the stamp has changed = a deploy has finished */
  async function check(){
    if (busy || reloading) return;
    busy = true;
    try {
      var base = apiBase(); if (!base) return;
      var r = await fetch(base.replace(/\/+$/, '') + '/deploy-stamp', { cache: 'no-store' });
      var j = await r.json(); if (!j || !j.ok) return;
      var now = String(j.stamp || ''), saved = getSaved();
      if (saved === null){ setSaved(now); return; }                 // first visit on this device: nothing old to clear
      if (saved === now) return;                                    // no new deploy -> do nothing
      if (typing()) return;                                         // try again later; never while you type a message
      await clearCaches();
      setSaved(now);
      reloading = true; keepView(); location.reload();              // load the new version once
    } catch (e) {} finally { busy = false; }
  }
  window.ksDeployDone = async function(stamp){                      // called by the admin's own browser right after the last deploy is live
    try { await clearCaches(); if (stamp) setSaved(String(stamp)); } catch (e) {}
    reloading = true; keepView(); location.reload();
  };

  /* ---- build check: looks at the server's index.html (it lists every file + its ?v= number).
     If it differs from the copy this device runs, a new version is live -> clear the saved copy and reload once.
     Works even when the update was pushed straight to GitHub / Render (no Deploy-tab stamp needed). ---- */
  var BKEY = 'ks_build_sig', bbusy = false, bsig = '';
  function hash(t){ var h = 5381; for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h >>> 0); }
  function sigOf(t){ var m = t.match(/(?:src|href)="[^"]+\?v=\d+"/g) || []; return hash(m.join('|') + '#' + t.length); }
  async function checkBuild(){
    if (bbusy || reloading) return;
    bbusy = true;
    try {
      var r = await fetch(new URL('index.html', location.href).href + '?_ksv=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      var now = sigOf(await r.text()), saved = ''; try { saved = localStorage.getItem(BKEY) || ''; } catch (e) {}
      if (!saved){ try { localStorage.setItem(BKEY, now); } catch (e) {} return; }   // first run: remember this build
      if (saved === now) return;                                                   // same build -> nothing to do
      if (typing()) return;                                                        // never while you type; tries again soon
      try { localStorage.setItem(BKEY, now); } catch (e) {}
      await clearCaches();
      reloading = true; keepView(); location.reload();
    } catch (e) {} finally { bbusy = false; }
  }
  function both(){ check(); checkBuild(); }
  setTimeout(checkBuild, 2500);
  setInterval(function(){ if (!document.hidden) checkBuild(); }, 180000);          // every 3 minutes while the app is open
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) checkBuild(); });
  window.addEventListener('online', checkBuild);

  setTimeout(check, 1500);                                          // site opened / reloaded
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) check(); });   // coming back to the site (a harmless look, clears only if a deploy finished)
  window.addEventListener('online', check);
})();
