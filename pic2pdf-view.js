/* KS · Pics to PDF tab: pick photos, put them in order, turn them into ONE PDF file. Everything happens on this phone - nothing is uploaded. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var P = { items:[], mode:'a4', margin:10, quality:.85, name:'', busy:false, msg:'', err:'' }, MAXN = 80, uid = 0;
  try { TITLES.pic2pdf = ['Pics to PDF', 'Turn your photos into one PDF file']; } catch(e){}
  var esc = function(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  var say = function(m, bad){ try { toast(m, bad); } catch(e){} };

  var css = document.createElement('style');
  css.textContent = [
    '#p2Root .p2-box{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px;margin-bottom:12px;box-shadow:var(--shadow)}',
    '#p2Root .p2-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
    '#p2Root .p2-it{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}',
    '#p2Root .p2-it:first-child{border-top:0}',
    '#p2Root .p2-th{flex:none;width:58px;height:58px;border-radius:10px;object-fit:cover;background:var(--soft2)}',
    '#p2Root .p2-nm{flex:1;min-width:0;line-height:1.3}',
    '#p2Root .p2-nm b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#p2Root .p2-nm small{color:var(--muted);font-size:12px}',
    '#p2Root .p2-ib{flex:none;width:36px;height:36px;border:1px solid var(--line);border-radius:10px;background:var(--soft);color:var(--ink);font-size:15px;cursor:pointer}',
    '#p2Root .p2-ib:disabled{opacity:.35}',
    '#p2Root label.p2-l{display:block;font-size:12.5px;font-weight:700;color:var(--label);margin:10px 0 4px}',
    '#p2Root .p2-empty{text-align:center;color:var(--muted);padding:26px 10px;font-size:14px;line-height:1.6}',
    '#p2Root .p2-err{color:var(--bad);font-size:13px;margin-top:8px}'
  ].join('\n');
  document.head.appendChild(css);

  function sizeOf(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function draw(){
    var r = $('#p2Root'); if (!r) return;
    var n = P.items.length, busy = P.busy;
    var list = n ? P.items.map(function(it, i){
      return '<div class="p2-it" data-i="' + i + '"><img class="p2-th" src="' + it.url + '" alt="" style="transform:rotate(' + it.rot + 'deg)">' +
        '<div class="p2-nm"><b>' + (i + 1) + '. ' + esc(it.file.name) + '</b><small>' + sizeOf(it.file.size) + (it.rot ? ' · rotated ' + it.rot + '°' : '') + '</small></div>' +
        '<button class="p2-ib" data-a="up" title="Move up"' + (i === 0 || busy ? ' disabled' : '') + '>↑</button>' +
        '<button class="p2-ib" data-a="dn" title="Move down"' + (i === n - 1 || busy ? ' disabled' : '') + '>↓</button>' +
        '<button class="p2-ib" data-a="rot" title="Rotate"' + (busy ? ' disabled' : '') + '>⟳</button>' +
        '<button class="p2-ib" data-a="del" title="Remove"' + (busy ? ' disabled' : '') + '>🗑</button></div>';
    }).join('') : '<div class="p2-empty">🖼️<br>No pictures yet.<br>Tap “Add pictures” and choose one or many photos.</div>';
    r.innerHTML =
      '<div class="p2-box"><div class="p2-row">' +
        '<button class="btn" data-a="pick"' + (busy ? ' disabled' : '') + '>➕ Add pictures</button>' +
        (n ? '<button class="btn ghost" data-a="clear"' + (busy ? ' disabled' : '') + '>Clear all</button>' : '') +
        '<span class="muted" style="font-size:13px">' + n + ' picture' + (n === 1 ? '' : 's') + '</span></div>' +
        '<input type="file" id="p2File" accept="image/*" multiple class="hidden" style="display:none">' +
        '<div style="margin-top:8px">' + list + '</div></div>' +
      '<div class="p2-box"><label class="p2-l" style="margin-top:0">PDF file name</label>' +
        '<input class="input" id="p2Name" placeholder="Pics-' + new Date().toISOString().slice(0, 10) + '" value="' + esc(P.name) + '">' +
        '<label class="p2-l">Page size</label>' +
        '<select class="select" id="p2Mode"><option value="a4"' + (P.mode === 'a4' ? ' selected' : '') + '>A4 page (picture fitted inside)</option>' +
          '<option value="fit"' + (P.mode === 'fit' ? ' selected' : '') + '>Same shape as the picture (no white border)</option></select>' +
        (P.mode === 'a4' ? '<label class="p2-l">Margin</label><select class="select" id="p2Mar">' + [[0, 'None'], [5, 'Small'], [10, 'Normal'], [20, 'Big']].map(function(m){ return '<option value="' + m[0] + '"' + (P.margin === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select>' : '') +
        '<label class="p2-l">Quality</label><select class="select" id="p2Q">' + [[.95, 'High (bigger file)'], [.85, 'Normal'], [.6, 'Small file']].map(function(m){ return '<option value="' + m[0] + '"' + (P.quality === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select>' +
        '<div style="margin-top:14px"><button class="btn block" data-a="make"' + (!n || busy ? ' disabled' : '') + '>' + (busy ? esc(P.msg || 'Working…') : '📄 Create PDF') + '</button></div>' +
        (P.err ? '<div class="p2-err">' + esc(P.err) + '</div>' : '') +
        '<div class="muted" style="font-size:12px;margin-top:10px">Your pictures stay on this phone. The PDF is saved in Downloads (Android app) or downloaded by the browser.</div></div>';
  }

  function add(files){
    var skipped = 0;
    Array.prototype.forEach.call(files || [], function(f){
      var ok = /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || '');
      if (!ok){ skipped++; return; }
      if (P.items.length >= MAXN){ skipped++; return; }
      P.items.push({ id:++uid, file:f, url:URL.createObjectURL(f), rot:0 });
    });
    P.err = skipped ? skipped + ' file(s) skipped (not a picture, or more than ' + MAXN + ' pictures).' : '';
    draw();
  }
  function remove(i){ var it = P.items[i]; if (it) { try { URL.revokeObjectURL(it.url); } catch(e){} } P.items.splice(i, 1); }

  function viaImg(file){
    return new Promise(function(res, rej){
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function(){ URL.revokeObjectURL(u); res(im); };
      im.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('Could not open “' + file.name + '”. Is it a normal photo (JPG / PNG)?')); };
      im.src = u;
    });
  }
  function loadImg(file){
    if (window.createImageBitmap){
      return createImageBitmap(file, { imageOrientation:'from-image' }).catch(function(){ return createImageBitmap(file); }).catch(function(){ return viaImg(file); });
    }
    return viaImg(file);
  }
  function toJpeg(it){
    return loadImg(it.file).then(function(im){
      var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, s = Math.min(1, 2400 / Math.max(w, h));
      var dw = Math.round(w * s), dh = Math.round(h * s), q = it.rot % 180 !== 0, c = document.createElement('canvas');
      c.width = q ? dh : dw; c.height = q ? dw : dh;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.translate(c.width / 2, c.height / 2); g.rotate(it.rot * Math.PI / 180); g.drawImage(im, -dw / 2, -dh / 2, dw, dh);
      if (im.close) try { im.close(); } catch(e){}
      return { data:c.toDataURL('image/jpeg', P.quality), w:c.width, h:c.height };
    });
  }
  function nameOk(){
    var n = String(($('#p2Name') || {}).value || P.name || '').trim().replace(/[\\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '').slice(0, 80);
    return (n || 'Pics-' + new Date().toISOString().slice(0, 10)) + '.pdf';
  }
  async function make(){
    if (P.busy || !P.items.length) return;
    P.name = String(($('#p2Name') || {}).value || ''); P.busy = true; P.err = ''; P.msg = 'Loading…'; draw();
    try {
      await loadScript(LIBS.jspdf);
      var J = window.jspdf.jsPDF, doc = null;
      for (var i = 0; i < P.items.length; i++){
        P.msg = 'Converting ' + (i + 1) + ' of ' + P.items.length + '…'; var b = $('[data-a="make"]'); if (b) b.textContent = P.msg;
        await new Promise(function(r){ setTimeout(r, 20); });
        var im = await toJpeg(P.items[i]), iw = im.w, ih = im.h, pw, ph, m = 0;
        if (P.mode === 'a4'){ pw = iw > ih ? 297 : 210; ph = iw > ih ? 210 : 297; m = P.margin; }
        else { pw = 210; ph = Math.min(5000, 210 * ih / iw); }
        var o = pw > ph ? 'l' : 'p', fmt = [Math.min(pw, ph), Math.max(pw, ph)];
        if (!doc) doc = new J({ orientation:o, unit:'mm', format:fmt, compress:true }); else doc.addPage(fmt, o);
        var sc = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih), dw = iw * sc, dh = ih * sc;
        doc.addImage(im.data, 'JPEG', (pw - dw) / 2, (ph - dh) / 2, dw, dh, undefined, 'FAST');
      }
      saveBlob(nameOk(), doc.output('blob'));
      say('PDF is ready ✓');
    } catch(e){ P.err = (e && e.message) || 'Could not create the PDF'; say(P.err, true); }
    P.busy = false; P.msg = ''; draw();
  }

  window.vPic2pdf = function(){ return '<div id="p2Root"></div>'; };
  window.pic2pdfAfter = function(){
    var r = $('#p2Root'); if (!r) return;
    r.onclick = function(e){
      var b = e.target.closest && e.target.closest('[data-a]'); if (!b || P.busy && b.dataset.a !== 'make') return;
      var a = b.dataset.a, row = b.closest('[data-i]'), i = row ? +row.dataset.i : -1, t;
      if (a === 'pick'){ var f = $('#p2File'); if (f) f.click(); return; }
      if (a === 'clear'){ P.items.slice().forEach(function(it){ try { URL.revokeObjectURL(it.url); } catch(x){} }); P.items = []; P.err = ''; }
      else if (a === 'up' && i > 0){ t = P.items[i]; P.items[i] = P.items[i - 1]; P.items[i - 1] = t; }
      else if (a === 'dn' && i >= 0 && i < P.items.length - 1){ t = P.items[i]; P.items[i] = P.items[i + 1]; P.items[i + 1] = t; }
      else if (a === 'rot' && i >= 0){ P.items[i].rot = (P.items[i].rot + 90) % 360; }
      else if (a === 'del' && i >= 0){ remove(i); }
      else if (a === 'make'){ make(); return; }
      draw();
    };
    r.onchange = function(e){
      var t = e.target;
      if (t.id === 'p2File'){ var fs = t.files; add(fs); t.value = ''; }
      else if (t.id === 'p2Mode'){ P.name = String(($('#p2Name') || {}).value || ''); P.mode = t.value; draw(); }
      else if (t.id === 'p2Mar'){ P.margin = +t.value; }
      else if (t.id === 'p2Q'){ P.quality = +t.value; }
    };
    r.oninput = function(e){ if (e.target.id === 'p2Name') P.name = e.target.value; };
    draw();
  };

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="pic2pdf"]')) return;
    var anchor = nav.querySelector('[data-v="websites"]') || nav.querySelector('[data-v="youtube"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'pic2pdf'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '🖼️').replace('Updates', 'Pics to PDF'); });
    anchor.after(b);
  })();
})();
