/* KS · automatic fresh version (there is no "Clear cache" button any more).
   The saved copy of the website is cleared by itself - when the site is opened / reloaded / logged in, when you come back to it,
   and whenever you tap something (at most once every 15 s).  If a newer version of any app file is on the server, the page
   reloads itself once so the latest version runs.  Your login, settings and drafts are never touched (only caches are cleared),
   and WhatsApp / Telegram stay linked - they live on the server and are not affected by this. */
(function(){
  'use strict';
  var GAP = 15000, last = 0, busy = false, base = null, reloading = false;

  function files(){
    var urls = {}; urls[location.pathname] = 1;
    [].forEach.call(document.querySelectorAll('script[src],link[rel="stylesheet"][href],link[rel="manifest"][href]'), function(n){
      var u = new URL(n.getAttribute('src') || n.getAttribute('href'), location.href); if (u.origin === location.origin) urls[u.pathname + u.search] = 1;
    });
    urls[new URL('sw.js', location.href).pathname] = 1;
    return Object.keys(urls);
  }
  /* a fingerprint (ETag / date / size) of every app file, asked straight from the server */
  async function stamp(){
    var out = {};
    await Promise.all(files().map(function(u){
      return fetch(u, { method: 'HEAD', cache: 'no-store' }).then(function(r){
        if (r.ok) out[u] = [r.headers.get('etag') || '', r.headers.get('last-modified') || '', r.headers.get('content-length') || ''].join('|');
      }).catch(function(){});
    }));
    return out;
  }
  async function clearCaches(){
    if (window.caches){ var ks = await caches.keys(); await Promise.all(ks.filter(function(k){ return k !== 'ks-prefs'; }).map(function(k){ return caches.delete(k); })); }
    if (navigator.serviceWorker){ var rg = await navigator.serviceWorker.getRegistration(); if (rg) rg.update().catch(function(){}); }   // the service worker stays registered (push notifications keep working)
  }
  function typing(){ var a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value && a.type !== 'button'); }

  async function run(){
    var now = Date.now(); if (busy || reloading || now - last < GAP) return;
    busy = true; last = now;
    try {
      await clearCaches();
      var cur = await stamp(); if (!Object.keys(cur).length) return;          // offline
      if (!base){ base = cur; return; }
      var changed = Object.keys(cur).some(function(u){ return base[u] && cur[u] && base[u] !== cur[u]; });
      if (changed && !typing()){ reloading = true; location.reload(); }       // a new version is live -> load it (not while you are typing a message)
    } catch (e) {} finally { busy = false; }
  }

  setTimeout(run, 1200);                                                       // site opened / reloaded / logged in
  document.addEventListener('click', run, true);                               // any tap (tab, button, option)
  document.addEventListener('submit', run, true);                              // login
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) run(); });
  window.addEventListener('pageshow', run);
  window.addEventListener('online', run);
})();
