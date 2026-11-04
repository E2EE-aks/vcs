/* KS · Network Tools (More › Network Tools): Ping · Traceroute · DNS · WHOIS · Speed test · Uptime monitor.
   Ping / Traceroute / DNS / WHOIS / Uptime run on the app server (so they show the path FROM the server).
   Speed test runs in this phone's browser and measures this phone's own internet connection. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var KEY = 'ks_nt_v1';
  var TABS = [['ping', '🏓', 'Ping'], ['trace', '🧭', 'Traceroute'], ['dns', '🔎', 'DNS'], ['whois', '📇', 'WHOIS'], ['speed', '⚡', 'Speed'], ['mon', '📡', 'Uptime']];
  var N = { tab: 'ping', host: '', dnsSrv: 'system', speedHist: [], trace: { id: '', busy: false, timer: 0, data: null, err: '' }, speed: { busy: false }, mon: { list: [], max: 15, loaded: false, form: false, err: '', timer: 0 } };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); if (sv.tab) N.tab = sv.tab; if (sv.host) N.host = sv.host; if (sv.dnsSrv) N.dnsSrv = sv.dnsSrv; if (Array.isArray(sv.speedHist)) N.speedHist = sv.speedHist.slice(0, 5); } catch(e){}
  function persist(){ try { localStorage.setItem(KEY, JSON.stringify({ tab: N.tab, host: N.host, dnsSrv: N.dnsSrv, speedHist: N.speedHist })); } catch(e){} }
  try { TITLES.nettools = ['Network Tools', 'Ping · Traceroute · DNS · WHOIS · Speed · Uptime']; } catch(e){}
  try { NAV_GRP.nettools = 'Tools'; } catch(e){}

  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function api(a, p){
    if (typeof S === 'undefined' || !S.token || typeof callServer !== 'function') return Promise.reject(new Error('Please log in again.'));
    return callServer(Object.assign({ action: a, token: S.token }, p || {})).then(function(j){
      if (!j || !j.ok){ var e = new Error((j && j.error) || 'Request failed'); e.code = j && j.code; throw e; } return j;
    });
  }
  function flag(cc){ if (!cc || cc.length !== 2) return '🌐'; try { return String.fromCodePoint.apply(null, cc.toUpperCase().split('').map(function(c){ return 127397 + c.charCodeAt(0); })); } catch(e){ return '🌐'; } }
  function ms(n){ return n == null ? '—' : (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + ' ms'; }
  function tone(n){ return n == null ? 'var(--muted)' : n < 60 ? 'var(--good)' : n < 180 ? 'var(--warn)' : 'var(--bad)'; }
  function ago(t){ if (!t) return 'not checked yet'; var s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; }
  function dur(t){ if (!t) return ''; var s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h ' + Math.round(s % 3600 / 60) + 'm' : Math.floor(s / 86400) + 'd ' + Math.round(s % 86400 / 3600) + 'h'; }

  var css = document.createElement('style');
  css.textContent = [
    '#ntRoot .nt-tabs{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin:0 -2px;scrollbar-width:none}',
    '#ntRoot .nt-tabs::-webkit-scrollbar{display:none}',
    '#ntRoot .nt-tab{flex:none;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:8px 14px;font-weight:600;font-size:13.5px;white-space:nowrap}',
    '#ntRoot .nt-tab.on{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}',
    '#ntRoot .nt-row{display:flex;gap:8px;margin-bottom:12px}',
    '#ntRoot .nt-row .input{flex:1;min-width:0}',
    '#ntRoot .nt-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}',
    '#ntRoot .nt-note{font-size:12.5px;color:var(--muted);margin:0 2px 12px;line-height:1.5}',
    '#ntRoot .nt-err{background:var(--bad-soft);color:var(--bad);border-radius:12px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}',
    '#ntRoot .nt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px;margin-bottom:12px}',
    '#ntRoot .nt-st{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center}',
    '#ntRoot .nt-st b{display:block;font-size:18px;font-variant-numeric:tabular-nums}',
    '#ntRoot .nt-st small{color:var(--muted);font-size:11.5px}',
    '#ntRoot .nt-rep{display:flex;justify-content:space-between;font-size:13.5px;padding:6px 0;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}',
    '#ntRoot .nt-route{font-size:15px;line-height:1.9;word-break:break-word}',
    '#ntRoot .nt-hop{display:flex;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:8px;animation:viewIn .25s}',
    '#ntRoot .nt-n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--brand-soft);color:var(--brand);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;margin-top:2px}',
    '#ntRoot .nt-b{flex:1;min-width:0}',
    '#ntRoot .nt-node{margin-bottom:6px}#ntRoot .nt-node:last-child{margin-bottom:0}',
    '#ntRoot .nt-node b{font-size:14.5px;word-break:break-all}',
    '#ntRoot .nt-node .h{display:block;font-size:12px;color:var(--muted);word-break:break-all}',
    '#ntRoot .nt-geo{font-size:12.5px;margin-top:2px;line-height:1.4}',
    '#ntRoot .nt-geo i{font-style:normal;color:var(--muted)}',
    '#ntRoot .nt-ms{flex:none;text-align:right;font-weight:800;font-size:14px;font-variant-numeric:tabular-nums}',
    '#ntRoot .nt-ms small{display:block;font-weight:500;color:var(--muted);font-size:11px}',
    '#ntRoot .nt-to{color:var(--muted);font-size:13.5px;padding:3px 0}',
    '#ntRoot .nt-dns b.t{display:inline-block;min-width:54px;color:var(--brand)}',
    '#ntRoot .nt-dns .r{padding:6px 0;border-top:1px solid var(--line);font-size:13.5px;word-break:break-all;display:flex;gap:10px;justify-content:space-between}',
    '#ntRoot .nt-dns .r small{color:var(--muted);flex:none}',
    '#ntRoot pre{white-space:pre-wrap;word-break:break-all;font-size:12px;line-height:1.5;max-height:380px;overflow:auto;background:var(--soft);border-radius:10px;padding:10px;margin-top:8px}',
    '#ntRoot .nt-kv{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid var(--line);font-size:13.5px}',
    '#ntRoot .nt-kv span{color:var(--muted);flex:none}#ntRoot .nt-kv b{text-align:right;word-break:break-word}',
    '#ntRoot .nt-big{font-size:54px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;line-height:1.1;margin:6px 0 0}',
    '#ntRoot .nt-bar{height:8px;border-radius:99px;background:var(--soft2);overflow:hidden;margin:12px 0 4px}',
    '#ntRoot .nt-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--brand),var(--brand-2));transition:width .25s}',
    '#ntRoot .nt-mon{display:flex;gap:12px;align-items:flex-start}',
    '#ntRoot .nt-dot{flex:none;width:12px;height:12px;border-radius:50%;margin-top:5px;background:var(--muted)}',
    '#ntRoot .nt-dot.up{background:var(--good);box-shadow:0 0 0 4px var(--good-soft)}#ntRoot .nt-dot.dn{background:var(--bad);box-shadow:0 0 0 4px var(--bad-soft)}',
    '#ntRoot .nt-spark{display:flex;gap:2px;align-items:flex-end;height:22px;margin-top:8px;overflow:hidden}',
    '#ntRoot .nt-spark i{flex:1;max-width:6px;min-width:2px;border-radius:2px;background:var(--good);opacity:.85}#ntRoot .nt-spark i.x{background:var(--bad);opacity:1;height:100%!important}',
    '#ntRoot .nt-fx{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}',
    '#ntRoot label.l{display:block;font-size:12.5px;font-weight:700;color:var(--label);margin:8px 0 4px}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- shell ---------- */
  window.vNettools = function(){ return '<div id="ntRoot"></div>'; };
  window.nettoolsAfter = function(){ shell(); };
  function shell(){
    var root = $('#ntRoot'); if (!root) return;
    root.innerHTML = '<div class="nt-tabs">' + TABS.map(function(t){ return '<button type="button" class="nt-tab' + (N.tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + ' ' + t[2] + '</button>'; }).join('') + '</div><div id="ntBody"></div>';
    if (!root.__b){ root.__b = 1; root.addEventListener('click', onClick); root.addEventListener('keydown', function(e){ if (e.key === 'Enter' && e.target.id === 'ntHost'){ var g = $('#ntGo'); if (g) g.click(); } }); root.addEventListener('input', function(e){ if (e.target.id === 'ntHost'){ N.host = e.target.value; persist(); } }); root.addEventListener('change', function(e){ if (e.target.id === 'ntSrv'){ N.dnsSrv = e.target.value; persist(); } }); }
    tab(N.tab);
  }
  function tab(t){
    N.tab = t; persist();
    [].forEach.call(document.querySelectorAll('#ntRoot .nt-tab'), function(b){ b.classList.toggle('on', b.dataset.t === t); });
    var body = $('#ntBody'); if (!body) return;
    clearInterval(N.mon.timer); N.mon.timer = 0;
    var inp = function(ph, btn, extra){ return '<div class="nt-row"><input class="input" id="ntHost" value="' + esc(N.host) + '" placeholder="' + ph + '" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="url">' + (extra || '') + '<button type="button" class="btn" id="ntGo">' + btn + '</button></div>'; };
    if (t === 'ping') body.innerHTML = inp('google.com or 8.8.8.8', 'Ping') + '<div class="nt-note">Ping is sent from the app server to the host, 4 times.</div><div id="ntOut"></div>';
    else if (t === 'trace') body.innerHTML = inp('google.com or 8.8.8.8', 'Trace') + '<div class="nt-note">Shows every server (hop) the request passes through — from the app server to the destination — with its IP, place, ISP and delay.</div><div id="ntOut"></div>';
    else if (t === 'dns') body.innerHTML = inp('example.com', 'Lookup', '<select class="select" id="ntSrv" style="flex:none;width:auto;max-width:112px"><option value="system">Default</option><option value="google">Google</option><option value="cloudflare">Cloudflare</option><option value="quad9">Quad9</option></select>') + '<div class="nt-note">A, AAAA, CNAME, MX, NS, TXT, SOA and CAA records. Enter an IP address to find its reverse DNS name.</div><div id="ntOut"></div>';
    else if (t === 'whois') body.innerHTML = inp('example.com or an IP', 'WHOIS') + '<div class="nt-note">Who registered a domain or owns an IP address, and when it expires.</div><div id="ntOut"></div>';
    else if (t === 'speed') { body.innerHTML = '<div id="ntOut"></div>'; speedDraw(); }
    else { body.innerHTML = '<div id="ntOut"></div>'; monLoad(); N.mon.timer = setInterval(function(){ if ($('#ntRoot') && N.tab === 'mon' && !document.hidden && !N.mon.form) monLoad(true); }, 20000); }
    var sel = $('#ntSrv'); if (sel) sel.value = N.dnsSrv;
    if (t === 'trace'){ if (N.trace.data) traceDraw(); if (N.trace.busy) busy(false, 'Stop'); }
  }
  function out(html){ var o = $('#ntOut'); if (o) o.innerHTML = html; }
  function busy(b, label){ var g = $('#ntGo'); if (!g) return; g.disabled = !!b; if (label) g.textContent = label; }
  function hostVal(){ var h = ($('#ntHost') || {}).value || ''; h = h.trim(); N.host = h; persist(); return h; }
  function errBox(m){ return '<div class="nt-err">' + esc(m) + '</div>'; }

  function onClick(e){
    var t = e.target, b;
    if ((b = t.closest('[data-t]'))){ tab(b.dataset.t); return; }
    if (t.closest('#ntGo')){
      if (N.tab === 'ping') doPing(); else if (N.tab === 'trace') (N.trace.busy ? traceStop() : traceStart()); else if (N.tab === 'dns') doDns(); else if (N.tab === 'whois') doWhois();
      return;
    }
    if (t.closest('#spGo')){ speedRun(); return; }
    if (t.closest('#mAdd')){ N.mon.form = { id: '' }; monDraw(); return; }
    if (t.closest('#mCan')){ N.mon.form = false; monDraw(); return; }
    if (t.closest('#mSave')){ monSave(); return; }
    if (t.closest('#mAll')){ monCheck('all'); return; }
    if ((b = t.closest('[data-mc]'))){ monCheck(b.dataset.mc); return; }
    if ((b = t.closest('[data-md]'))){ var m = N.mon.list.filter(function(x){ return x.id === b.dataset.md; })[0]; if (m && confirm('Stop monitoring “' + m.name + '”?')){ api('monDel', { id: m.id }).then(function(){ monLoad(); }).catch(function(er){ N.mon.err = er.message; monDraw(); }); } return; }
    if ((b = t.closest('[data-me]'))){ var m2 = N.mon.list.filter(function(x){ return x.id === b.dataset.me; })[0]; if (m2){ N.mon.form = m2; monDraw(); } return; }
  }

  /* ================= PING ================= */
  function doPing(){
    var h = hostVal(); if (!h) return out(errBox('Enter a host name or IP address.'));
    busy(true, 'Pinging…'); out('<div class="nt-note">Pinging ' + esc(h) + '…</div>');
    api('netPing', { host: h }).then(function(r){
      var good = r.received > 0;
      out('<div class="nt-card"><b>' + esc(r.host) + '</b> <span class="muted">· ' + esc(r.ip) + '</span><div style="margin-top:4px;font-weight:700;color:' + (good ? 'var(--good)' : 'var(--bad)') + '">' + (good ? '✓ Reachable' : '✕ No reply') + '</div></div>' +
        '<div class="nt-grid"><div class="nt-st"><b style="color:' + tone(r.avg) + '">' + ms(r.avg) + '</b><small>Average</small></div><div class="nt-st"><b>' + ms(r.min) + '</b><small>Min</small></div><div class="nt-st"><b>' + ms(r.max) + '</b><small>Max</small></div><div class="nt-st"><b style="color:' + (r.loss ? 'var(--bad)' : 'var(--good)') + '">' + r.loss + '%</b><small>Packet loss</small></div><div class="nt-st"><b>' + ms(r.jitter) + '</b><small>Jitter</small></div></div>' +
        '<div class="nt-card" style="padding:6px 14px">' + r.replies.map(function(x, i){ return '<div class="nt-rep"' + (i ? '' : ' style="border-top:0"') + '><span>Reply ' + (i + 1) + '</span><b style="color:' + (x == null ? 'var(--bad)' : tone(x)) + '">' + (x == null ? 'Timed out' : ms(x)) + '</b></div>'; }).join('') + '</div>' +
        (r.method === 'tcp' ? '<div class="nt-note">This server has no ICMP ping program, so the time to open a TCP connection (port ' + esc(r.port) + ') is shown instead. It is a very close match for the real ping.</div>' : ''));
    }).catch(function(er){ out(errBox(er.message)); }).then(function(){ busy(false, 'Ping'); });
  }

  /* ================= TRACEROUTE ================= */
  function traceStart(){
    var h = hostVal(); if (!h) return out(errBox('Enter a host name or IP address.'));
    var T = N.trace; clearTimeout(T.timer); T.data = null; T.err = ''; T.busy = true; T.id = '';
    busy(false, 'Stop'); out('<div class="nt-note">Starting trace to ' + esc(h) + '…</div>');
    api('netTraceStart', { host: h }).then(function(r){ T.id = r.id; poll(); }).catch(function(er){ T.busy = false; busy(false, 'Trace'); out(errBox(er.message)); });
  }
  function traceStop(){ var T = N.trace; if (T.id) api('netTraceStop', { id: T.id }).catch(function(){}); }
  function poll(){
    var T = N.trace; clearTimeout(T.timer);
    if (!$('#ntRoot')){ traceStop(); T.busy = false; return; }          // left the page: stop the trace on the server
    api('netTracePoll', { id: T.id }).then(function(r){
      T.data = r; if ($('#ntOut') && N.tab === 'trace') traceDraw();
      if (r.done){ T.busy = false; busy(false, 'Trace'); } else T.timer = setTimeout(poll, 1500);
    }).catch(function(er){ T.busy = false; busy(false, 'Trace'); out(errBox(er.message)); });
  }
  function geoLine(n){
    if (n.priv) return '<div class="nt-geo">🏠 <i>Private network (the server’s own network)</i></div>';
    if (!n.cc && !n.country && !n.isp) return '';
    var place = [n.city, n.country].filter(Boolean).join(', ');
    return '<div class="nt-geo">' + flag(n.cc) + ' ' + esc(place || '—') + (n.isp ? ' <i>· ' + esc(n.isp) + '</i>' : '') + (n.as ? ' <i>· ' + esc(String(n.as).split(' ')[0]) + '</i>' : '') + '</div>';
  }
  function traceDraw(){
    var r = N.trace.data; if (!r) return;
    var seq = [], last = '';
    r.hops.forEach(function(h){ h.nodes.forEach(function(n){ if (n.cc && n.cc !== last){ seq.push(flag(n.cc) + ' ' + (n.country || n.cc)); last = n.cc; } }); });
    var status = !r.done ? '⏳ Tracing… ' + r.hops.length + ' hops so far' : (r.reached ? '✓ Reached the destination in ' + r.hops.length + ' hops' : '⚠ Finished — destination did not answer (' + r.hops.length + ' hops)');
    var html = '<div class="nt-card"><b>' + esc(r.host) + '</b> <span class="muted">· ' + esc(r.ip) + '</span><div style="margin-top:4px;font-weight:700;color:' + (r.done && !r.reached ? 'var(--warn)' : r.done ? 'var(--good)' : 'var(--brand)') + '">' + status + '</div>' +
      '<div class="nt-note" style="margin:6px 0 0">' + esc(r.method || '') + ' · ' + r.secs + ' s · from the app server</div>' +
      (seq.length ? '<div class="nt-route" style="margin-top:8px">🖥️ Server → ' + seq.map(esc).join(' → ') + '</div>' : '') + '</div>';
    if (r.error) html += errBox(r.error);
    html += r.hops.map(function(h){
      var body = h.nodes.length ? h.nodes.map(function(n){ return '<div class="nt-node"><b>' + esc(n.ip || n.host) + '</b>' + (n.host && n.ip ? '<span class="h">' + esc(n.host) + '</span>' : '') + geoLine(n) + '</div>'; }).join('') : '<div class="nt-to">* * *  Request timed out (this router does not reply to traces)</div>';
      return '<div class="nt-hop"><div class="nt-n">' + h.n + '</div><div class="nt-b">' + body + (h.flag ? '<div class="nt-geo"><i>' + esc(h.flag) + '</i></div>' : '') + '</div>' +
        '<div class="nt-ms" style="color:' + tone(h.avg) + '">' + (h.avg == null ? '—' : ms(h.avg)) + (h.min != null && h.max != null && h.max !== h.min ? '<small>' + ms(h.min) + ' – ' + ms(h.max) + '</small>' : '') + (h.lost && h.avg != null ? '<small style="color:var(--bad)">' + h.lost + ' lost</small>' : '') + '</div></div>';
    }).join('');
    if (!r.done) html += '<div class="nt-note" style="text-align:center">⏳ Waiting for the next hop…</div>';
    out(html);
  }

  /* ================= DNS ================= */
  function doDns(){
    var h = hostVal(); if (!h) return out(errBox('Enter a domain name or IP address.'));
    busy(true, 'Looking…'); out('<div class="nt-note">Looking up ' + esc(h) + '…</div>');
    api('netDns', { name: h, server: N.dnsSrv }).then(function(r){
      var html = '<div class="nt-card"><b>' + esc(r.query) + '</b><div class="nt-note" style="margin:4px 0 0">via ' + esc(r.server === 'system' ? 'default resolver' : r.server) + ' · ' + r.ms + ' ms</div></div>';
      if (r.note) html += '<div class="nt-card muted">' + esc(r.note) + '</div>';
      html += r.records.map(function(g){ return '<div class="nt-card nt-dns"><b class="t">' + esc(g.type) + '</b> <span class="muted">' + g.items.length + ' record' + (g.items.length > 1 ? 's' : '') + '</span>' + g.items.map(function(x){ return '<div class="r"><span>' + esc(x.v) + '</span>' + (x.ttl != null ? '<small>TTL ' + x.ttl + 's</small>' : '') + '</div>'; }).join('') + '</div>'; }).join('');
      out(html);
    }).catch(function(er){ out(errBox(er.message)); }).then(function(){ busy(false, 'Lookup'); });
  }

  /* ================= WHOIS ================= */
  function doWhois(){
    var h = hostVal(); if (!h) return out(errBox('Enter a domain name or IP address.'));
    busy(true, 'Searching…'); out('<div class="nt-note">Asking the WHOIS servers about ' + esc(h) + '…</div>');
    api('netWhois', { host: h }).then(function(r){
      var f = r.fields || {}, rows = r.ip
        ? [['Network', f.name], ['Owner', f.org], ['Country', f.country], ['Range', f.range], ['CIDR', f.cidr]]
        : [['Registrar', f.registrar], ['Created', f.created], ['Expires', f.expires], ['Updated', f.updated], ['Status', (f.status || []).join(', ')], ['Name servers', (f.ns || []).join(', ')]];
      rows = rows.filter(function(x){ return x[1]; });
      out('<div class="nt-card"><b>' + esc(r.query) + '</b><div class="nt-note" style="margin:4px 0 8px">source: ' + esc(r.server) + (r.via === 'rdap' ? ' (RDAP)' : '') + '</div>' +
        (rows.length ? rows.map(function(x){ return '<div class="nt-kv"><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') : '<div class="muted">No summary fields found — see the full record below.</div>') +
        '<details style="margin-top:10px"><summary style="font-weight:700;cursor:pointer">Full WHOIS record</summary><pre>' + esc(r.text) + '</pre></details></div>');
    }).catch(function(er){ out(errBox(er.message)); }).then(function(){ busy(false, 'WHOIS'); });
  }

  /* ================= SPEED TEST (runs on this phone, against Cloudflare) ================= */
  var CF = 'https://speed.cloudflare.com';
  function rnd(){ return Math.random().toString(36).slice(2); }
  function speedDraw(extra){
    var h = N.speedHist.map(function(x){ return '<div class="nt-rep"><span>' + new Date(x.t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + '</span><b>⬇ ' + x.d + ' · ⬆ ' + x.u + ' Mbps · ' + x.p + ' ms</b></div>'; }).join('');
    out('<div class="nt-card" style="text-align:center"><div id="spLbl" class="muted" style="font-weight:600">' + (extra && extra.lbl || 'Measure this phone’s internet speed') + '</div>' +
      '<div class="nt-big" id="spNum">' + (extra && extra.num != null ? extra.num : '—') + '</div><div class="muted" id="spUnit">' + (extra && extra.unit || 'Mbps') + '</div><div class="nt-bar"><i id="spBar"></i></div>' +
      '<div class="nt-grid" style="margin:12px 0"><div class="nt-st"><b id="spP">' + (extra && extra.p != null ? extra.p : '—') + '</b><small>Ping ms</small></div><div class="nt-st"><b id="spJ">' + (extra && extra.j != null ? extra.j : '—') + '</b><small>Jitter ms</small></div><div class="nt-st"><b id="spD">' + (extra && extra.d != null ? extra.d : '—') + '</b><small>⬇ Download</small></div><div class="nt-st"><b id="spU">' + (extra && extra.u != null ? extra.u : '—') + '</b><small>⬆ Upload</small></div></div>' +
      '<button type="button" class="btn block" id="spGo"' + (N.speed.busy ? ' disabled' : '') + '>' + (N.speed.busy ? 'Testing…' : '⚡ Start test') + '</button></div>' +
      '<div class="nt-note">Uses about 30–60 MB of data. Test server: Cloudflare. Works on Wi-Fi and mobile data.</div>' + (h ? '<div class="nt-card" style="padding:6px 14px"><div class="muted" style="font-size:12px;padding-top:6px">Recent tests</div>' + h + '</div>' : ''));
  }
  function sp(id, v){ var e = $('#' + id); if (e) e.textContent = v; }
  function spBar(p){ var e = $('#spBar'); if (e) e.style.width = Math.max(0, Math.min(100, p)) + '%'; }
  function median(a){ a = a.slice().sort(function(x, y){ return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }
  async function speedRun(){
    if (N.speed.busy) return; N.speed.busy = true; var res = { p: 0, j: 0, d: 0, u: 0 };
    var go = $('#spGo'); if (go){ go.disabled = true; go.textContent = 'Testing…'; }
    ['spP', 'spJ', 'spD', 'spU'].forEach(function(i){ sp(i, '—'); }); sp('spNum', '—'); spBar(0);
    try {
      sp('spLbl', 'Checking latency…'); sp('spUnit', 'ms');
      var t = [];
      for (var i = 0; i < 9; i++){ var a = performance.now(); var r0 = await fetch(CF + '/__down?bytes=0&r=' + rnd(), { cache: 'no-store' }); await r0.arrayBuffer(); t.push(performance.now() - a); sp('spNum', Math.round(t[t.length - 1])); spBar(i * 2.2); }
      t = t.slice(1); res.p = Math.round(median(t)); res.j = Math.round(t.slice(1).reduce(function(s, x, k){ return s + Math.abs(x - t[k]); }, 0) / Math.max(1, t.length - 1));
      sp('spP', res.p); sp('spJ', res.j);

      sp('spLbl', '⬇ Download'); sp('spUnit', 'Mbps');
      var total = 0, stop = false, ctrl = new AbortController(), t0 = performance.now(), base = 0, tb = 0;
      var dl = function(){ return (async function(){ while (!stop){ try { var r = await fetch(CF + '/__down?bytes=25000000&r=' + rnd(), { cache: 'no-store', signal: ctrl.signal }); var rd = r.body.getReader(); for (;;){ var x = await rd.read(); if (x.done || stop) break; total += x.value.length; } } catch (e) { if (stop) return; throw e; } } })(); };
      var workers = [dl(), dl(), dl(), dl()], tick = setInterval(function(){
        var el = (performance.now() - t0) / 1000;
        if (!tb && el >= 1){ tb = el; base = total; }                                  // skip the slow-start second
        var mb = tb && el > tb + 0.2 ? (total - base) * 8 / (el - tb) / 1e6 : total * 8 / Math.max(el, .2) / 1e6;
        res.d = mb; sp('spNum', mb.toFixed(1)); spBar(20 + el / 8 * 40);
        if (el >= 8){ stop = true; try { ctrl.abort(); } catch (e) {} }
      }, 250);
      try { await Promise.all(workers); } catch (e) { if (!stop){ stop = true; try { ctrl.abort(); } catch (x) {} throw e; } } finally { clearInterval(tick); }
      res.d = Math.round(res.d * 10) / 10; sp('spD', res.d);

      sp('spLbl', '⬆ Upload'); sp('spNum', '—');
      var blob = new Blob([new Uint8Array(2 * 1024 * 1024)]), sent = 0, stop2 = false, u0 = performance.now(), ub = 0, tu = 0;
      var ul = function(){ return (async function(){ while (!stop2){ try { await fetch(CF + '/__up?r=' + rnd(), { method: 'POST', body: blob, cache: 'no-store' }); sent += blob.size; } catch (e) { stop2 = true; throw e; } } })(); };
      var uw = [ul(), ul(), ul()], tick2 = setInterval(function(){
        var el = (performance.now() - u0) / 1000, mb = sent * 8 / Math.max(el, .5) / 1e6;
        res.u = mb; sp('spNum', mb.toFixed(1)); spBar(60 + el / 7 * 40); if (el >= 7) stop2 = true;
      }, 300);
      try { await Promise.all(uw); } finally { clearInterval(tick2); }
      var uel = (performance.now() - u0) / 1000; res.u = Math.round(sent * 8 / uel / 1e6 * 10) / 10; sp('spU', res.u);
      spBar(100); sp('spLbl', '✓ Done — download speed'); sp('spNum', res.d.toFixed(1));
      N.speedHist.unshift({ t: Date.now(), d: res.d, u: res.u, p: res.p }); N.speedHist = N.speedHist.slice(0, 5); persist();
      N.speed.busy = false; if ($('#spGo') && N.tab === 'speed') speedDraw({ lbl: '✓ Done — download speed', num: res.d.toFixed(1), p: res.p, j: res.j, d: res.d, u: res.u });
    } catch (e) {
      N.speed.busy = false;
      if ($('#ntOut') && N.tab === 'speed'){ speedDraw({ lbl: '' }); var o = $('#ntOut'); o.insertAdjacentHTML('afterbegin', errBox('Speed test could not reach the test server. Check your internet connection and try again.')); }
    }
  }

  /* ================= UPTIME MONITOR ================= */
  function monLoad(quiet){
    api('monList').then(function(r){ N.mon.list = r.list || []; N.mon.max = r.max || 15; N.mon.loaded = true; N.mon.err = ''; if (N.tab === 'mon' && !N.mon.form) monDraw(); })
      .catch(function(er){ N.mon.err = er.message; if (!quiet && N.tab === 'mon') monDraw(); });
  }
  function monCheck(id){
    var all = $('#mAll'); if (all && id === 'all'){ all.disabled = true; all.textContent = 'Checking…'; }
    var btn = id !== 'all' ? $('[data-mc="' + id + '"]') : null; if (btn){ btn.disabled = true; btn.textContent = '…'; }
    api('monCheck', { id: id }).then(function(r){ N.mon.list = r.list || N.mon.list; N.mon.err = ''; }).catch(function(er){ N.mon.err = er.message; }).then(function(){ if (N.tab === 'mon') monDraw(); });
  }
  function monSave(){
    var f = N.mon.form, name = ($('#mName') || {}).value || '', target = (($('#mTarget') || {}).value || '').trim(), kind = ($('#mKind') || {}).value || 'http', iv = +(($('#mIv') || {}).value || 5);
    if (!target){ N.mon.err = 'Enter the website link (or host:port).'; return monDraw(); }
    var b = $('#mSave'); if (b){ b.disabled = true; b.textContent = 'Saving…'; }
    api('monAdd', { id: f && f.id || undefined, name: name, target: target, kind: kind, interval: iv }).then(function(){ N.mon.form = false; N.mon.err = ''; monLoad(); })
      .catch(function(er){ N.mon.err = er.message; monDraw(); });
  }
  function spark(h){
    if (!h || !h.length) return '';
    var mx = Math.max.apply(null, h.map(function(x){ return x[1] || 0; }).concat([1]));
    return '<div class="nt-spark">' + h.map(function(x){ return x[0] ? '<i title="' + ms(x[1]) + '" style="height:' + Math.max(18, Math.round((x[1] || 0) / mx * 100)) + '%"></i>' : '<i class="x" title="down"></i>'; }).join('') + '</div>';
  }
  function monDraw(){
    var M = N.mon, f = M.form, html = '';
    if (M.err) html += errBox(M.err);
    html += '<div class="nt-row"><button type="button" class="btn" id="mAdd" style="flex:1"' + (M.list.length >= M.max ? ' disabled' : '') + '>＋ Add site</button>' + (M.list.length ? '<button type="button" class="btn ghost" id="mAll">↻ Check all</button>' : '') + '</div>';
    if (f){
      html += '<div class="nt-card"><b>' + (f.id ? 'Edit monitor' : 'Add monitor') + '</b>' +
        '<label class="l">Name <span class="muted">(optional)</span></label><input class="input" id="mName" maxlength="60" value="' + esc(f.name || '') + '" placeholder="e.g. My website">' +
        '<label class="l">Link or host:port</label><input class="input" id="mTarget" value="' + esc(f.target || '') + '" placeholder="https://example.com  or  example.com:443" autocapitalize="off" autocomplete="off" inputmode="url">' +
        '<div class="nt-fx"><div><label class="l">Check type</label><select class="select" id="mKind"><option value="http"' + (f.kind !== 'tcp' ? ' selected' : '') + '>Website (HTTP)</option><option value="tcp"' + (f.kind === 'tcp' ? ' selected' : '') + '>Port (TCP)</option></select></div>' +
        '<div><label class="l">Check every</label><select class="select" id="mIv">' + [1, 5, 15, 30, 60].map(function(v){ return '<option value="' + v + '"' + ((f.interval || 5) === v ? ' selected' : '') + '>' + (v === 60 ? '1 hour' : v + ' min') + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="nt-row" style="margin:10px 0 0"><button type="button" class="btn" id="mSave" style="flex:1">Save</button><button type="button" class="btn ghost" id="mCan">Cancel</button></div></div>';
    }
    if (!M.loaded && !M.err) html += '<div class="nt-note">Loading…</div>';
    else if (!M.list.length && !f) html += '<div class="nt-card muted" style="text-align:center;line-height:1.6">No site is being monitored yet.<br>Tap <b>＋ Add site</b> — you get a phone alert when it goes down or comes back.</div>';
    html += M.list.map(function(m){
      var cls = m.up === true ? 'up' : m.up === false ? 'dn' : '', st = m.up === true ? '<b style="color:var(--good)">Up</b>' : m.up === false ? '<b style="color:var(--bad)">Down</b>' : '<b class="muted">Checking…</b>';
      return '<div class="nt-card"><div class="nt-mon"><div class="nt-dot ' + cls + '"></div><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px"><b style="word-break:break-word">' + esc(m.name) + '</b>' + st + '</div>' +
        '<div class="muted" style="font-size:12.5px;word-break:break-all">' + esc(m.target) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;margin-top:6px"><span>⏱ <b style="color:' + tone(m.ms) + '">' + ms(m.ms) + '</b></span>' + (m.pct != null ? '<span>📈 <b>' + m.pct + '%</b> uptime</span>' : '') + (m.code ? '<span>' + esc(m.kind === 'tcp' ? m.code : 'HTTP ' + m.code) + '</span>' : '') + (m.since && m.up != null ? '<span>' + (m.up ? 'up' : 'down') + ' for ' + dur(m.since) + '</span>' : '') + '<span class="muted">checked ' + ago(m.lastAt) + ' · every ' + m.interval + ' min</span></div>' +
        (m.up === false && m.err ? '<div style="color:var(--bad);font-size:12.5px;margin-top:4px">' + esc(m.err) + '</div>' : '') + spark(m.hist) +
        '<div class="nt-row" style="margin:10px 0 0"><button type="button" class="btn ghost" data-mc="' + esc(m.id) + '" style="flex:1;padding:7px">↻ Check now</button><button type="button" class="btn ghost" data-me="' + esc(m.id) + '" style="padding:7px 12px" aria-label="Edit">✏️</button><button type="button" class="btn ghost" data-md="' + esc(m.id) + '" style="padding:7px 12px" aria-label="Delete">🗑️</button></div></div></div></div>';
    }).join('');
    if (M.list.length) html += '<div class="nt-note">Checks run on the app server. If it goes down twice in a row you get a notification (Android app) when it recovers too.</div>';
    out(html);
  }

  /* ---------- side-menu entry (appears under “More”) ---------- */
  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="nettools"]')) return;
    var anchor = nav.querySelector('[data-v="websites"]') || nav.querySelector('[data-v="youtube"]') || nav.querySelector('[data-v="music"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'nettools'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '🛰️').replace('Updates', 'Network Tools'); });
    anchor.after(b);
  })();
})();
