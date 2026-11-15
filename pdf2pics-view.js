/* KS · PDF to Pics tab: take the pictures out of a PDF (also a password-protected one) and save them WITHOUT losing quality.
   The pictures are read exactly as stored in the PDF and saved as PNG (lossless). Everything happens on this phone - the PDF is never uploaded. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var V = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var LIB = { pdf:V + 'pdf.min.js', worker:V + 'pdf.worker.min.js', zip:'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js' };
  var X = { file:null, pw:'', fmt:'png', min:64, busy:false, msg:'', err:'', needPw:false, out:[], base:'pdf' };
  try { TITLES.pdf2pics = ['PDF to Pics', 'Save the pictures of a PDF in full quality']; } catch(e){}
  var esc = function(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  var say = function(m, bad){ try { toast(m, bad); } catch(e){} };
  var kb = function(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };

  var css = document.createElement('style');
  css.textContent = [
    '#pxRoot .px-box{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px;margin-bottom:12px;box-shadow:var(--shadow)}',
    '#pxRoot .px-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
    '#pxRoot label.px-l{display:block;font-size:12.5px;font-weight:700;color:var(--label);margin:10px 0 4px}',
    '#pxRoot .px-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:10px}',
    '#pxRoot .px-it{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--soft)}',
    '#pxRoot .px-it img{display:block;width:100%;height:120px;object-fit:contain;background:repeating-conic-gradient(var(--soft2) 0 25%,var(--card) 0 50%) 0 0/16px 16px}',
    '#pxRoot .px-it div{padding:6px 8px;font-size:12px;color:var(--muted);line-height:1.35}',
    '#pxRoot .px-it button{width:100%;border:0;border-top:1px solid var(--line);background:var(--card);color:var(--ink);padding:9px;font-weight:600;cursor:pointer}',
    '#pxRoot .px-err{color:var(--bad);font-size:13px;margin-top:8px}',
    '#pxRoot .px-empty{text-align:center;color:var(--muted);padding:20px 10px;font-size:14px;line-height:1.6}'
  ].join('\n');
  document.head.appendChild(css);

  function draw(){
    var r = $('#pxRoot'); if (!r) return;
    var b = X.busy, n = X.out.length;
    r.innerHTML =
      '<div class="px-box"><div class="px-row"><button class="btn" data-a="pick"' + (b ? ' disabled' : '') + '>📑 Choose PDF</button>' +
        '<span class="muted" style="font-size:13px;word-break:break-all">' + (X.file ? esc(X.file.name) + ' · ' + kb(X.file.size) : 'No PDF chosen') + '</span></div>' +
        '<input type="file" id="pxFile" accept="application/pdf,.pdf" style="display:none">' +
        '<label class="px-l">PDF password' + (X.needPw ? ' <span style="color:var(--bad)">(required)</span>' : ' (leave empty if it has none)') + '</label>' +
        '<input class="input" id="pxPw" type="password" autocomplete="off" placeholder="Password" value="' + esc(X.pw) + '">' +
        '<label class="px-l">Save pictures as</label>' +
        '<select class="select" id="pxFmt"><option value="png"' + (X.fmt === 'png' ? ' selected' : '') + '>PNG - exact, no quality loss (recommended)</option>' +
          '<option value="jpg"' + (X.fmt === 'jpg' ? ' selected' : '') + '>JPG 100% - smaller files, almost no loss</option></select>' +
        '<label class="px-l">Skip tiny pictures (icons, lines)</label>' +
        '<select class="select" id="pxMin">' + [[0, 'Save everything'], [64, 'Smaller than 64 px'], [150, 'Smaller than 150 px'], [300, 'Smaller than 300 px']].map(function(m){ return '<option value="' + m[0] + '"' + (X.min === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select>' +
        '<div style="margin-top:14px"><button class="btn block" data-a="go"' + (!X.file || b ? ' disabled' : '') + '>' + (b ? esc(X.msg || 'Working…') : '⬇ Get the pictures') + '</button></div>' +
        (X.err ? '<div class="px-err">' + esc(X.err) + '</div>' : '') + '</div>' +
      (n ? '<div class="px-box"><div class="px-row"><b>' + n + ' picture' + (n === 1 ? '' : 's') + ' found</b><span style="flex:1"></span>' +
        '<button class="btn" data-a="zip"' + (b ? ' disabled' : '') + '>💾 Save all (ZIP)</button></div><div class="px-grid">' +
        X.out.map(function(o, i){ return '<div class="px-it" data-i="' + i + '"><img src="' + o.url + '" alt=""><div>' + o.w + ' × ' + o.h + ' px · ' + kb(o.blob.size) + '<br>page ' + o.page + '</div><button data-a="one">💾 Save</button></div>'; }).join('') +
        '</div></div>' : (X.done ? '<div class="px-box"><div class="px-empty">No pictures found in this PDF.<br>(Pages that are only text, or scanned pages saved as one big picture per page, show up as pictures too.)</div></div>' : '')) +
      '<div class="muted" style="font-size:12px;margin:0 2px 10px">The PDF stays on this phone - nothing is uploaded. The first time, a PDF library is loaded from the internet.</div>';
  }

  function clearOut(){ X.out.forEach(function(o){ try { URL.revokeObjectURL(o.url); } catch(e){} }); X.out = []; X.done = false; }
  var workerUrl = null;
  async function libs(){
    await loadScript(LIB.pdf);
    var L = window.pdfjsLib; if (!L) throw new Error('Could not load the PDF library.');
    if (!workerUrl){
      try { var t = await (await fetch(LIB.worker)).text(); workerUrl = URL.createObjectURL(new Blob([t], { type:'text/javascript' })); }
      catch(e){ workerUrl = LIB.worker; }
    }
    L.GlobalWorkerOptions.workerSrc = workerUrl;
    return L;
  }
  function getObj(page, id){
    return new Promise(function(res){
      var done = false, t = setTimeout(function(){ if (!done){ done = true; res(null); } }, 15000);
      try { (/^g_/.test(id) ? page.commonObjs : page.objs).get(id, function(o){ if (!done){ done = true; clearTimeout(t); res(o); } }); }
      catch(e){ if (!done){ done = true; clearTimeout(t); res(null); } }
    });
  }
  function toCanvas(img){
    var w = img.width, h = img.height; if (!w || !h) return null;
    var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d');
    if (img.bitmap){ g.drawImage(img.bitmap, 0, 0); return c; }
    var d = img.data; if (!d) return null;
    var out = g.createImageData(w, h), o = out.data, i, j, k;
    var kind = img.kind || (d.length === w * h * 4 ? 3 : d.length === w * h * 3 ? 2 : 1);
    if (kind === 3){ o.set(d.subarray ? d.subarray(0, o.length) : d); }
    else if (kind === 2){ for (i = 0, j = 0; i < w * h; i++, j += 3){ o[i * 4] = d[j]; o[i * 4 + 1] = d[j + 1]; o[i * 4 + 2] = d[j + 2]; o[i * 4 + 3] = 255; } }
    else {                                                                   // 1 bit per pixel, a set bit = white
      var rb = (w + 7) >> 3;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++){ k = (d[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0; i = (y * w + x) * 4; o[i] = o[i + 1] = o[i + 2] = k; o[i + 3] = 255; }
    }
    g.putImageData(out, 0, 0); return c;
  }
  function toBlob(c, fmt){
    return new Promise(function(res){
      if (fmt === 'jpg'){                                                      // JPG has no transparency: put the picture on white
        var f = document.createElement('canvas'); f.width = c.width; f.height = c.height; var g = f.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, f.width, f.height); g.drawImage(c, 0, 0);
        f.toBlob(res, 'image/jpeg', 1);
      } else c.toBlob(res, 'image/png');
    });
  }
  async function run(){
    if (X.busy || !X.file) return;
    X.pw = String(($('#pxPw') || {}).value || X.pw || ''); X.busy = true; X.err = ''; X.msg = 'Opening the PDF…'; clearOut(); draw();
    try {
      var L = await libs(), buf = new Uint8Array(await X.file.arrayBuffer()), doc;
      try { doc = await L.getDocument({ data:buf, password:X.pw || undefined }).promise; }
      catch(e){
        if (e && e.name === 'PasswordException'){ X.needPw = true; throw new Error(e.code === 2 ? 'The password is wrong. Please check it and try again.' : 'This PDF has a password. Please type it above.'); }
        throw new Error('Could not open this PDF. ' + ((e && e.message) || ''));
      }
      X.needPw = false;
      var OPS = L.OPS, seen = {}, ext = X.fmt === 'jpg' ? 'jpg' : 'png', total = doc.numPages, cnt = 0;
      for (var p = 1; p <= total; p++){
        X.msg = 'Page ' + p + ' of ' + total + ' · ' + X.out.length + ' pictures'; var bt = $('[data-a="go"]'); if (bt) bt.textContent = X.msg;
        var page = await doc.getPage(p), ops = await page.getOperatorList();
        for (var i = 0; i < ops.fnArray.length; i++){
          var fn = ops.fnArray[i], a = ops.argsArray[i], img = null;
          if (fn === OPS.paintImageXObject){ var id = a[0]; if (seen[id]) continue; seen[id] = 1; img = await getObj(page, id); }
          else if (fn === OPS.paintInlineImageXObject){ img = a[0]; }
          else continue;
          if (!img || !img.width || !img.height || Math.max(img.width, img.height) < X.min) continue;
          var cv = toCanvas(img); if (!cv) continue;
          var blob = await toBlob(cv, X.fmt); cv.width = cv.height = 0; if (!blob) continue;
          cnt++; X.out.push({ blob:blob, url:URL.createObjectURL(blob), w:img.width, h:img.height, page:p, name:X.base + '-p' + p + '-' + cnt + '.' + ext });
        }
        if (page.cleanup) try { page.cleanup(); } catch(e){}
      }
      try { doc.destroy(); } catch(e){}
      X.done = true; say(X.out.length ? X.out.length + ' picture(s) found ✓' : 'No pictures found in this PDF', !X.out.length);
    } catch(e){ X.err = (e && e.message) || 'Something went wrong'; say(X.err, true); }
    X.busy = false; X.msg = ''; draw();
  }
  async function zipAll(){
    if (!X.out.length) return;
    try {
      await loadScript(LIB.zip); var z = new window.JSZip();
      X.out.forEach(function(o){ z.file(o.name, o.blob); });
      say('Making the ZIP…');
      saveBlob(X.base + '-pictures.zip', await z.generateAsync({ type:'blob', compression:'STORE' }));
    } catch(e){ say((e && e.message) || 'Could not make the ZIP', true); }
  }

  window.vPdf2pics = function(){ return '<div id="pxRoot"></div>'; };
  window.pdf2picsAfter = function(){
    var r = $('#pxRoot'); if (!r) return;
    r.onclick = function(e){
      var b = e.target.closest && e.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a;
      if (a === 'pick'){ var f = $('#pxFile'); if (f) f.click(); }
      else if (a === 'go') run();
      else if (a === 'zip') zipAll();
      else if (a === 'one'){ var it = b.closest('[data-i]'), o = it && X.out[+it.dataset.i]; if (o) saveBlob(o.name, o.blob); }
    };
    r.onchange = function(e){
      var t = e.target;
      if (t.id === 'pxFile'){
        var f = t.files && t.files[0]; t.value = ''; if (!f) return;
        if (!(/pdf/i.test(f.type) || /\.pdf$/i.test(f.name))){ say('Please choose a PDF file', true); return; }
        clearOut(); X.file = f; X.err = ''; X.needPw = false; X.base = f.name.replace(/\.pdf$/i, '').replace(/[\\\/:*?"<>|]+/g, '-').slice(0, 60) || 'pdf'; draw();
      }
      else if (t.id === 'pxFmt') X.fmt = t.value;
      else if (t.id === 'pxMin') X.min = +t.value;
    };
    r.oninput = function(e){ if (e.target.id === 'pxPw') X.pw = e.target.value; };
    draw();
  };

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="pdf2pics"]')) return;
    var anchor = nav.querySelector('[data-v="pic2pdf"]') || nav.querySelector('[data-v="websites"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'pdf2pics'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '📑').replace('Updates', 'PDF to Pics'); });
    anchor.after(b);
  })();
})();
