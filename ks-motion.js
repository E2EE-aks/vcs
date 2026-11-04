/* KS · Motion layer (JS): tap ring on every tap, sparks when marking Present/Absent, and a one-time page entrance that never replays on refresh.
   Pure add-on. Does nothing when Animations are Off or the phone asks for reduced motion. */
(function(){
  'use strict';
  var still = function(){
    return (document.body && document.body.dataset.motion === 'off') ||
      (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  var HIT = 'button, a, [onclick], .tg-item, .set-tile, .set-gt, .chip, .mark, .th-mi, .bs-g button, .lg-chips li';
  var COL = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#60a5fa'];

  function ring(x, y){
    var d = document.createElement('span'); d.className = 'ks-tap'; d.style.left = x + 'px'; d.style.top = y + 'px';
    document.body.appendChild(d); setTimeout(function(){ d.remove(); }, 600);
  }
  function sparks(x, y){
    for (var i = 0; i < 9; i++){
      var s = document.createElement('i'), a = (Math.PI * 2 * i) / 9 + Math.random() * .5, r = 34 + Math.random() * 34;
      s.className = 'ks-spark'; s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(a) * r + 'px'); s.style.setProperty('--dy', Math.sin(a) * r + 'px'); s.style.setProperty('--c', COL[i % COL.length]);
      document.body.appendChild(s); (function(n){ setTimeout(function(){ n.remove(); }, 700); })(s);
    }
  }
  document.addEventListener('pointerdown', function(e){
    if (still() || !e.target.closest) return;
    var t = e.target.closest(HIT); if (!t || t.disabled) return;
    ring(e.clientX, e.clientY);
    if (t.classList.contains('mark')) sparks(e.clientX, e.clientY);
  }, { passive: true });

  /* page entrance only when the page (not just its data) changes */
  var view = document.getElementById('view'); if (!view) return;
  var last = '', t = null;
  function key(){ try { return (S.view || '') + '|' + (S.setSec || '') + '|' + (S.as || ''); } catch (e) { return ''; } }
  new MutationObserver(function(){
    var k = key(); if (k === last) return; last = k;
    if (still()) return;
    view.classList.remove('ks-fx'); void view.offsetWidth; view.classList.add('ks-fx');
    clearTimeout(t); t = setTimeout(function(){ view.classList.remove('ks-fx'); }, 1400);
  }).observe(view, { childList: true });
})();
