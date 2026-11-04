/* KS · "Clear cache" button next to every Log out button.
   Tap → the saved copy of the website (service-worker cache + browser copy of the app files) is deleted and the newest version is loaded.
   You stay signed in and your settings are kept — nothing in the browser's own data (login, theme, chat drafts…) is touched. */
(function(){
  'use strict';
  var st = document.createElement('style');
  st.textContent = '.cc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line,#e2e8f0);background:var(--soft,#f1f5f9);color:var(--ink,#1e293b);border-radius:12px;font-weight:700;cursor:pointer;flex:none;transition:.15s;font:inherit;font-weight:700}' +
    '.cc-btn:hover{background:var(--brand,#4f46e5);color:#fff;border-color:var(--brand,#4f46e5)}.cc-btn:active{transform:scale(.95)}' +
    '.cc-btn.icon{width:42px;height:42px;padding:0;font-size:19px}.cc-btn.txt{padding:7px 14px;font-size:calc(13.5px*var(--fs,1))}' +
    '.cc-btn.busy{pointer-events:none;opacity:.7}.cc-btn.busy .cc-i{display:inline-block;animation:spin .8s linear infinite}' +
    '.side-user .cc-btn.icon{width:40px;height:40px}';
  document.head.appendChild(st);

  var busy = false;
  function say(m, bad){ try { if (typeof toast === 'function') toast(m, bad); } catch (e) {} }

  async function clearIt(btns){
    if (busy) return; busy = true;
    btns.forEach(function(b){ b.classList.add('busy'); });
    say('Clearing cache…');
    try {
      /* 1) the browser's own copy of the app files: fetch them fresh */
      var urls = {};
      urls[location.pathname] = 1;
      [].forEach.call(document.querySelectorAll('script[src],link[rel="stylesheet"][href],link[rel="manifest"][href]'), function(n){
        var u = new URL(n.getAttribute('src') || n.getAttribute('href'), location.href); if (u.origin === location.origin) urls[u.pathname + u.search] = 1;
      });
      ['sw.js', 'manifest.json'].forEach(function(f){ urls[new URL(f, location.href).pathname] = 1; });
      await Promise.all(Object.keys(urls).map(function(u){ return fetch(u, { cache: 'reload' }).catch(function(){}); }));
      /* 2) the service worker's saved copies (the small "ks-prefs" notification settings are kept) */
      if (window.caches){ var ks = await caches.keys(); await Promise.all(ks.filter(function(k){ return k !== 'ks-prefs'; }).map(function(k){ return caches.delete(k); })); }
      /* 3) the service worker itself: removed now, it registers again (fresh) when the page reloads */
      if (navigator.serviceWorker){ var rg = await navigator.serviceWorker.getRegistrations(); await Promise.all(rg.map(function(r){ return r.unregister(); })); }
      say('Cache cleared — loading the latest version…');
    } catch (e) { say('Cache cleared (some parts could not be removed)', true); }
    setTimeout(function(){ location.reload(); }, 700);
  }

  function make(src){
    var icon = src.classList.contains('icon');
    var b = document.createElement('button'); b.type = 'button';
    b.className = 'cc-btn ' + (icon ? 'icon' : 'txt'); b.title = 'Clear cache — load the latest version'; b.setAttribute('aria-label', 'Clear cache');
    b.innerHTML = '<span class="cc-i" aria-hidden="true">🧹</span>' + (icon ? '' : '<span>Clear cache</span>');
    src.parentNode.insertBefore(b, src);          // right beside (before) Log out
    return b;
  }
  var pairs = ['logoutBtn', 'logoutBtn2', 'logoutBtn3'].map(function(id){ var s = document.getElementById(id); return s ? { s: s, b: make(s) } : null; }).filter(Boolean);
  if (!pairs.length) return;
  var all = pairs.map(function(p){ return p.b; });
  all.forEach(function(b){ b.addEventListener('click', function(){ clearIt(all); }); });

  /* each Clear-cache button is shown exactly when its Log-out button is shown */
  function sync(){ pairs.forEach(function(p){ var hide = getComputedStyle(p.s).display === 'none' || !!p.s.closest('.hidden'); p.b.style.display = hide ? 'none' : ''; }); }
  sync(); window.addEventListener('resize', sync);
  pairs.forEach(function(p){ new MutationObserver(sync).observe(p.s, { attributes: true, attributeFilter: ['style', 'class'] }); });
  var app = document.getElementById('app'); if (app) new MutationObserver(sync).observe(app, { attributes: true, attributeFilter: ['class'] });
  setInterval(sync, 1500);
})();
