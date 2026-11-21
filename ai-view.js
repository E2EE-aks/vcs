/* KS · AI tab (All Options › AI): enter your own API key and chat with AI.
   Supports Claude (Anthropic), ChatGPT (OpenAI) and Gemini (Google).
   The API key is saved ONLY on this phone/browser (localStorage). It is never sent to the KS server or Google Sheet —
   the browser talks straight to the AI company. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };
  try { TITLES.aitab = ['AI', 'Enter your API key and chat with AI']; } catch(e){}
  try { NAV_GRP.aitab = 'Workspace'; } catch(e){}

  var KEY = 'ks_ai_v1', HIST = 'ks_ai_hist_v1';
  var PROV = {
    anthropic: { n:'Claude (Anthropic)', model:'claude-sonnet-5-5', hint:'Key starts with sk-ant-… (console.anthropic.com)' },
    openai:    { n:'ChatGPT (OpenAI)',   model:'gpt-4o-mini',       hint:'Key starts with sk-… (platform.openai.com)' },
    gemini:    { n:'Gemini (Google)',    model:'gemini-2.0-flash',  hint:'Key starts with AIza… (aistudio.google.com)' }
  };
  var C = { provider:'anthropic', key:'', model:'', system:'' };   // settings (this device only)
  var M = [];                                                     // chat: [{role:'user'|'assistant', text}]
  var st = { busy:false, edit:false, err:'', ctl:null };
  try { var s0 = JSON.parse(localStorage.getItem(KEY) || '{}'); if (s0 && typeof s0 === 'object') for (var k in C) if (typeof s0[k] === 'string') C[k] = s0[k]; } catch(e){}
  try { M = JSON.parse(localStorage.getItem(HIST) || '[]') || []; } catch(e){ M = []; }
  if (!PROV[C.provider]) C.provider = 'anthropic';
  st.edit = !C.key;

  function saveCfg(){ try { localStorage.setItem(KEY, JSON.stringify(C)); } catch(e){} }
  function saveHist(){ try { localStorage.setItem(HIST, JSON.stringify(M.slice(-40))); } catch(e){} }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function mask(k){ return k.length > 10 ? k.slice(0, 6) + '••••••' + k.slice(-4) : '••••••'; }
  function model(){ return (C.model || '').trim() || PROV[C.provider].model; }

  var css = document.createElement('style');
  css.textContent = [
    '#aiRoot .ai-card{margin-bottom:12px}',
    '#aiRoot .ai-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
    '#aiRoot .ai-field{margin-top:10px}',
    '#aiRoot .ai-field label{display:block;font-size:12.5px;color:var(--muted);margin-bottom:4px}',
    '#aiRoot .ai-log{display:flex;flex-direction:column;gap:10px;max-height:56vh;overflow:auto;padding:4px 2px;margin-bottom:10px}',
    '#aiRoot .ai-m{max-width:88%;padding:10px 13px;border-radius:14px;line-height:1.5;font-size:14.5px;word-break:break-word;white-space:pre-wrap}',
    '#aiRoot .ai-m.u{align-self:flex-end;background:var(--brand);color:#fff;border-bottom-right-radius:4px}',
    '#aiRoot .ai-m.a{align-self:flex-start;background:var(--card);border:1px solid var(--line);color:var(--ink);border-bottom-left-radius:4px}',
    '#aiRoot .ai-m.e{align-self:flex-start;background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.4);color:var(--ink)}',
    '#aiRoot .ai-m pre{white-space:pre-wrap;background:rgba(127,127,127,.15);padding:8px 10px;border-radius:8px;margin:6px 0;font-size:13px;overflow:auto}',
    '#aiRoot .ai-empty{text-align:center;color:var(--muted);padding:26px 8px;font-size:14px}',
    '#aiRoot .ai-send{display:flex;gap:8px;align-items:flex-end}',
    '#aiRoot .ai-send textarea{flex:1;min-height:44px;max-height:140px;resize:vertical}',
    '#aiRoot .ai-note{margin-top:10px;color:var(--muted);font-size:12.5px;line-height:1.55}',
    '#aiRoot .ai-dots::after{content:"…";animation:aiBlink 1s infinite}',
    '@keyframes aiBlink{50%{opacity:.2}}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- the actual API calls (browser -> AI company) ---------- */
  function ask(){
    var p = C.provider, key = C.key.trim(), mdl = model(), sys = (C.system || '').trim();
    var hist = M.filter(function(m){ return m.role === 'user' || m.role === 'assistant'; }).slice(-30);
    st.ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var opt = { method:'POST', signal: st.ctl ? st.ctl.signal : undefined }, url, body;

    if (p === 'anthropic'){
      url = 'https://api.anthropic.com/v1/messages';
      opt.headers = { 'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' };
      body = { model:mdl, max_tokens:2048, messages: hist.map(function(m){ return { role:m.role, content:m.text }; }) };
      if (sys) body.system = sys;
    } else if (p === 'openai'){
      url = 'https://api.openai.com/v1/chat/completions';
      opt.headers = { 'content-type':'application/json', 'authorization':'Bearer ' + key };
      var msgs = hist.map(function(m){ return { role:m.role, content:m.text }; });
      if (sys) msgs.unshift({ role:'system', content:sys });
      body = { model:mdl, messages:msgs };
    } else {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(mdl) + ':generateContent';
      opt.headers = { 'content-type':'application/json', 'x-goog-api-key':key };
      body = { contents: hist.map(function(m){ return { role: m.role === 'assistant' ? 'model' : 'user', parts:[{ text:m.text }] }; }) };
      if (sys) body.systemInstruction = { parts:[{ text:sys }] };
    }
    opt.body = JSON.stringify(body);

    return fetch(url, opt).then(function(r){
      return r.text().then(function(t){
        var j = null; try { j = JSON.parse(t); } catch(e){}
        if (!r.ok){
          var msg = j && (j.error && (j.error.message || j.error) || j.message) || t.slice(0, 200) || ('HTTP ' + r.status);
          if (typeof msg !== 'string') msg = JSON.stringify(msg);
          if (r.status === 401 || r.status === 403) msg = 'API key rejected (' + r.status + '). Check the key. — ' + msg;
          throw new Error(msg);
        }
        var out = '';
        if (p === 'anthropic') out = (j.content || []).map(function(b){ return b && b.type === 'text' ? b.text : ''; }).join('');
        else if (p === 'openai') out = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
        else out = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || []).map(function(x){ return x.text || ''; }).join('');
        if (!out) throw new Error('The AI sent an empty reply.');
        return out;
      });
    });
  }

  function send(){
    if (st.busy) return;
    var ta = $('#aiIn'); if (!ta) return;
    var text = ta.value.trim(); if (!text) return;
    if (!C.key.trim()){ st.edit = true; st.err = 'First enter your API key.'; draw(); return; }
    M.push({ role:'user', text:text }); saveHist();
    ta.value = ''; st.busy = true; st.err = ''; log(true);
    ask().then(function(out){ M.push({ role:'assistant', text:out }); saveHist(); })
      .catch(function(e){
        if (e && e.name === 'AbortError') return;
        var m = (e && e.message) || 'Request failed';
        if (/failed to fetch|networkerror|load failed/i.test(m)) m = 'Could not reach the AI service. Check your internet connection (or the key/model name).';
        M.push({ role:'error', text:m });
      })
      .then(function(){ st.busy = false; st.ctl = null; log(); });
  }

  /* ---------- drawing ---------- */
  function fmt(t){   // safe: escape everything first, then turn ```code``` into <pre>
    var parts = String(t).split('```');
    return parts.map(function(s, i){
      if (i % 2) return '<pre>' + esc(s.replace(/^[a-zA-Z0-9+#-]*\n/, '')) + '</pre>';
      return esc(s);
    }).join('');
  }
  function logHtml(busy){
    if (!M.length && !busy) return '<div class="ai-empty">🤖 Ask anything — the answer comes from your own AI API key.</div>';
    return M.map(function(m){
      var c = m.role === 'user' ? 'u' : (m.role === 'error' ? 'e' : 'a');
      return '<div class="ai-m ' + c + '">' + (m.role === 'error' ? '⚠ ' + esc(m.text) : fmt(m.text)) + '</div>';
    }).join('') + (busy ? '<div class="ai-m a"><span class="ai-dots">Thinking</span></div>' : '');
  }
  function log(busy){
    var el = $('#aiLog'); if (!el) return;
    el.innerHTML = logHtml(busy || st.busy); el.scrollTop = el.scrollHeight;
    var b = $('#aiSend'); if (b){ b.disabled = st.busy; b.textContent = st.busy ? '…' : 'Send'; }
  }
  function draw(){
    var root = $('#aiRoot'); if (!root) return;
    var p = PROV[C.provider];
    var cfg;
    if (st.edit || !C.key){
      cfg = '<div class="card ai-card"><h3>🔑 AI settings</h3>' +
        (st.err ? '<div class="err" style="margin:8px 0">' + esc(st.err) + '</div>' : '') +
        '<div class="ai-field"><label for="aiProv">AI provider</label><select class="select" id="aiProv" style="width:100%">' +
          Object.keys(PROV).map(function(k){ return '<option value="' + k + '"' + (k === C.provider ? ' selected' : '') + '>' + PROV[k].n + '</option>'; }).join('') + '</select></div>' +
        '<div class="ai-field"><label for="aiKey">API key</label><input class="input" id="aiKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste your API key here" value="' + esc(C.key) + '"><div class="muted" style="font-size:12px;margin-top:4px">' + esc(p.hint) + '</div></div>' +
        '<div class="ai-field"><label for="aiModel">Model <span class="muted">(empty = ' + esc(p.model) + ')</span></label><input class="input" id="aiModel" autocomplete="off" autocapitalize="off" placeholder="' + esc(p.model) + '" value="' + esc(C.model) + '"></div>' +
        '<div class="ai-field"><label for="aiSys">Instructions for the AI <span class="muted">(optional)</span></label><textarea class="input" id="aiSys" rows="2" placeholder="e.g. Reply in Hinglish, keep answers short.">' + esc(C.system) + '</textarea></div>' +
        '<div class="ai-row" style="margin-top:12px"><button type="button" class="btn" id="aiSave">Save key</button>' +
          (C.key ? '<button type="button" class="btn ghost" id="aiCancel">Cancel</button><button type="button" class="btn ghost" id="aiDel">Remove key</button>' : '') + '</div>' +
        '<div class="ai-note">🔒 The key is saved only on this device and goes straight to ' + esc(p.n) + ' — it is not stored on the KS server or in Google Sheet. API usage is charged to your own account.</div></div>';
    } else {
      cfg = '<div class="card ai-card"><div class="ai-row" style="justify-content:space-between"><div style="min-width:0"><b>' + esc(p.n) + '</b><div class="muted" style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis">' + esc(model()) + ' · key ' + esc(mask(C.key.trim())) + '</div></div>' +
        '<div class="ai-row"><button type="button" class="btn ghost sm" id="aiEdit">⚙️ Key / model</button><button type="button" class="btn ghost sm" id="aiClear">🗑 Clear chat</button></div></div></div>';
    }
    root.innerHTML = cfg +
      '<div class="card ai-card"><div class="ai-log" id="aiLog"></div>' +
      '<div class="ai-send"><textarea class="input" id="aiIn" rows="1" placeholder="Type your message…" ' + (C.key ? '' : 'disabled') + '></textarea><button type="button" class="btn" id="aiSend">Send</button></div></div>';
    log();
  }

  function bind(){
    var root = $('#aiRoot'); if (!root || root.dataset.b) return; root.dataset.b = '1';
    root.addEventListener('click', function(e){
      var t = e.target.closest('button'); if (!t) return;
      if (t.id === 'aiSend') return send();
      if (t.id === 'aiEdit'){ st.edit = true; st.err = ''; return draw(); }
      if (t.id === 'aiCancel'){ st.edit = false; st.err = ''; return draw(); }
      if (t.id === 'aiClear'){ M = []; saveHist(); return log(); }
      if (t.id === 'aiDel'){
        if (!confirm('Remove the saved API key from this device?')) return;
        C.key = ''; saveCfg(); st.edit = true; st.err = ''; return draw();
      }
      if (t.id === 'aiSave'){
        var key = ($('#aiKey').value || '').trim();
        if (key.length < 12){ st.err = 'That does not look like a full API key.'; return draw2(); }
        C.provider = $('#aiProv').value; C.key = key; C.model = ($('#aiModel').value || '').trim(); C.system = ($('#aiSys').value || '').trim();
        saveCfg(); st.edit = false; st.err = '';
        try { toast('API key saved on this device'); } catch(x){}
        draw();
      }
    });
    root.addEventListener('change', function(e){
      if (e.target.id === 'aiProv'){ C.provider = e.target.value; var mo = $('#aiModel'); if (mo && !mo.value.trim()) mo.placeholder = PROV[C.provider].model; draw2(); }
    });
    root.addEventListener('keydown', function(e){
      if (e.target.id === 'aiIn' && e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); send(); }
    });
  }
  function draw2(){   // redraw the settings form but keep what was typed
    var v = { key:($('#aiKey') || {}).value, model:($('#aiModel') || {}).value, sys:($('#aiSys') || {}).value, prov:($('#aiProv') || {}).value };
    if (v.prov) C.provider = v.prov;
    var keep = { key:C.key, model:C.model, system:C.system };
    if (v.key != null) C.key = v.key; if (v.model != null) C.model = v.model; if (v.sys != null) C.system = v.sys;
    var wasSaved = keep;
    draw();
    // typed-but-unsaved values stay visible in the form; restore the saved ones in memory
    C.key = wasSaved.key; C.model = wasSaved.model; C.system = wasSaved.system;
  }

  window.vAitab = function(){ return '<div id="aiRoot"></div>'; };
  window.aitabAfter = function(){ bind(); draw(); };

  /* ---------- side-menu tab (also listed in the bottom bar options) ---------- */
  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="aitab"]')) return;
    var anchor = nav.querySelector('[data-v="websites"]') || nav.querySelector('[data-v="youtube"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'aitab'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '🤖').replace('Updates', 'AI'); });
    anchor.after(b);
  })();
})();
