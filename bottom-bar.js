/* KS · Bottom bar (phones): Dashboard · Chat · VCS · All Options.
   Pure add-on: reads the existing side menu (#nav), so labels/icons/hidden items always match it. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var app = $('#app'), nav = $('#nav'); if (!app || !nav) return;
  var FIXED = [['dashboard', 'Dashboard'], ['profile', 'Profile'], ['chat', 'Chat']];
  var SV = function(p){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var ICON = {
    dashboard: SV('<rect x="3.5" y="3.5" width="7" height="8" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="14.5" width="7" height="6" rx="2"/>'),
    chat: SV('<path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.3A7.5 7.5 0 1 1 20.5 11.5z"/><path d="M9 10.5h6M9 13.5h4"/>'),
    vcs: SV('<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 17.5h4"/>'),
    all: SV('<circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>')
  };
  function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function navBtn(v){ return nav.querySelector('button[data-v="' + v + '"]'); }
  function info(b){
    var ic = b.querySelector('.ico'), txt = '';
    [].forEach.call(b.childNodes, function(n){ if (n.nodeType === 3) txt += n.nodeValue; });
    return { id: b.dataset.v, ic: ic ? ic.textContent : '•', lb: txt.trim() || b.dataset.v };
  }
  function usable(b){ return b && !b.classList.contains('hidden') && !b.classList.contains('th-off'); }

  var bar = document.createElement('nav'); bar.id = 'btmBar'; bar.className = 'hidden'; bar.setAttribute('aria-label', 'Main');
  var sheet = document.createElement('div'); sheet.id = 'btmSheet'; sheet.className = 'hidden';
  document.body.appendChild(bar); document.body.appendChild(sheet);

  function avatarIcon(){
    var me = {}, src = '', nm = 'U';
    try { me = S.me || {}; nm = (me.name || me.username || 'U').trim().charAt(0).toUpperCase() || 'U'; if (me.id && typeof avSrc === 'function') src = avSrc(me.id) || ''; } catch (e) {}
    return '<span class="bav"' + (src ? ' style="background-image:url(&quot;' + esc(src) + '&quot;)"' : '') + '>' + (src ? '' : esc(nm)) + '</span>';
  }
  var lastHtml = '';
  function draw(){
    var h = '';
    FIXED.forEach(function(f){
      var b = navBtn(f[0]); if (!usable(b)) return;
      var i = info(b), badge = '';
      if (f[0] === 'chat'){ var cb = $('#chatBadge'); if (cb && !cb.classList.contains('hidden') && cb.textContent.trim() && cb.textContent.trim() !== '0') badge = '<em>' + esc(cb.textContent.trim()) + '</em>'; }
      h += '<button type="button" data-go="' + f[0] + '"><span class="bi">' + (f[0] === 'profile' ? avatarIcon() : ICON[f[0]]) + badge + '</span><small>' + esc(i.lb) + '</small></button>';
    });
    h += '<button type="button" data-all="1" id="btmAll"><span class="bi">' + ICON.all + '</span><small>All Options</small></button>';
    if (h !== lastHtml){ bar.innerHTML = h; lastHtml = h; }
    mark();
  }
  function mark(){
    var cur = ''; try { cur = S.view || ''; } catch (e) {}
    var inFixed = FIXED.some(function(f){ return f[0] === cur; });
    [].forEach.call(bar.querySelectorAll('[data-go]'), function(b){ b.classList.toggle('on', b.dataset.go === cur); });
    var a = $('#btmAll'); if (a) a.classList.toggle('on', !!cur && !inFixed);
  }
  function drawSheet(){
    var h = '<div class="bs-card"><div class="bs-h"><b>All Options</b><button type="button" data-x="1" aria-label="Close">✕</button></div><div class="bs-g">';
    [].forEach.call(nav.querySelectorAll('button[data-v]'), function(b){
      if (!usable(b)) return; var i = info(b);
      h += '<button type="button" data-go="' + esc(i.id) + '"><span>' + esc(i.ic) + '</span><small>' + esc(i.lb) + '</small></button>';
    });
    sheet.innerHTML = h + '</div></div>';
  }
  function openSheet(on){ if (on){ drawSheet(); } sheet.classList.toggle('hidden', !on); document.body.classList.toggle('btm-sheet', !!on); }

  function onTap(e){
    var t = e.target;
    if (t === sheet || t.closest('[data-x]')){ openSheet(false); return; }
    if (t.closest('[data-all]')){ openSheet(sheet.classList.contains('hidden')); return; }
    var g = t.closest('[data-go]'); if (!g) return;
    openSheet(false); if (typeof go === 'function') go(g.dataset.go);
  }
  bar.addEventListener('click', onTap); sheet.addEventListener('click', onTap);

  var kb = false;
  function vis(){
    var b = document.body, off = app.classList.contains('hidden') || b.classList.contains('vc-open') || b.classList.contains('menu-open') ||
      b.classList.contains('chat-conv') || !!$('.chat.in-conv') || kb;
    bar.classList.toggle('hidden', off);
    b.classList.toggle('has-btm', !off);
    if (app.classList.contains('hidden')) openSheet(false);
  }
  if (window.visualViewport){
    var base = window.innerHeight;
    visualViewport.addEventListener('resize', function(){
      if (visualViewport.height > base) base = visualViewport.height;
      kb = visualViewport.height < base * 0.75; vis();
    });
  }
  new MutationObserver(function(){ draw(); vis(); }).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'], childList: true, characterData: true });
  var cb = $('#chatBadge'); if (cb) new MutationObserver(draw).observe(cb, { attributes: true, childList: true, characterData: true, subtree: true });
  new MutationObserver(vis).observe(app, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(vis).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  var v = $('#view'); if (v) new MutationObserver(function(){ vis(); draw(); }).observe(v, { childList: true });
  draw(); vis();
})();
