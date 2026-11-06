/* KS · EP tab (English Practice): ek Hinglish sentence likho -> Present · Past · Future teeno form milte hain.
   Sab kuch phone/laptop me hi hota hai (internet ya server ki zaroorat nahi). Recent sentences is device par yaad rehte hain. */
(function(){
  'use strict';
  var $ = function(s, r){ return (r || document).querySelector(s); };

  /* ======================= Hinglish tense engine ======================= */
  var PRON = {            // subject -> { ne: past 'ne' form, aux: present 'hai', fut: future ending base, pl: plural verb agreement, label }
    main:{ ne:'maine', aux:'hoon', fut:'u', pl:false, p:1 },
    tum :{ ne:'tumne', aux:'ho',   fut:'o', pl:true,  p:2 },
    tu  :{ ne:'tune',  aux:'hai',  fut:'e', pl:false, p:2 },
    aap :{ ne:'aapne', aux:'hain', fut:'e', pl:true,  p:2, ng:true },
    wo  :{ ne:'usne',  aux:'hai',  fut:'e', pl:false, p:3 },
    yeh :{ ne:'isne',  aux:'hai',  fut:'e', pl:false, p:3 },
    hum :{ ne:'humne', aux:'hain', fut:'e', pl:true,  p:1, ng:true },
    ve  :{ ne:'unhone',aux:'hain', fut:'e', pl:true,  p:3, ng:true }
  };
  var ALIAS = { main:'main', mai:'main', mein:'main', mei:'main', maine:'main', mene:'main', mainey:'main',
    tum:'tum', tumne:'tum', tu:'tu', tune:'tu', aap:'aap', aapne:'aap', ap:'aap',
    wo:'wo', woh:'wo', vo:'wo', vah:'wo', usne:'wo', yeh:'yeh', ye:'yeh', yah:'yeh', isne:'yeh',
    hum:'hum', ham:'hum', humne:'hum', hamne:'hum', ve:'ve', unhone:'ve', we:'ve' };
  var NE_FORM = { maine:1, mene:1, mainey:1, tumne:1, tune:1, aapne:1, usne:1, isne:1, humne:1, hamne:1, unhone:1 };
  var AUXN = { hoon:'hoon', hu:'hoon', hun:'hoon', hai:'hai', he:'hai', hain:'hain', hein:'hain', ho:'ho', tha:'tha', thaa:'tha', thi:'thi', the:'the', hoga:'hoga', hogi:'hogi', honge:'honge', hounga:'hounga', hoonga:'hounga', hoongi:'hoongi', hoge:'hoge' };
  var ADV = ['aaj','kal','roz','abhi','subah','shaam','raat','hamesha','kabhi','har','pehle','phir','ab','tab','jab','kya','kyun','kaise','kab','kahan','parso','roj','dopahar','savere','din','hafte','mahine','saal','bahut','aksar'];
  var FEM_NOUN = ['roti','chai','kitab','gaadi','gadi','movie','film','chitthi','baat','cheez','bottle','photo','tasveer','kahani','dawai','dawa','sabzi','daal','lassi','pani','paani','coffee','cake','pizza','maggi','biryani','mithai','game','ladai','shopping','padhai','call','video','khabar','kapde'];
  var NOT_VERB_TA = ['chhota','chhoti','chhote','chota','choti','sasta','sasti','saste','accha','achha','pyaara','mehnga','kaata'];
  /* verbs that never take "ne" in the past (intransitive) */
  var INTRANS = ['ja','aa','so','ro','hans','baith','uth','chal','daud','ruk','gir','ho','rah','reh','nikal','pahunch','mar','jaag','kud','tair','utar','chadh','laut','bhaag','ud','ghoom','badal','jal','toot','pighal','muskura','kaam','thehar','rooth','sharma','ghabra','bhig','fisal','chamak','khil','simat','bach','thak','bigad'];
  var IRR_PAST = { ja:['gaya','gayi','gaye'], ho:['hua','hui','hue'], kar:['kiya','ki','kiye'], de:['diya','di','diye'], le:['liya','li','liye'], pi:['piya','pi','piye'], si:['siya','si','siye'], aa:['aaya','aayi','aaye'] };
  var PAST_LUT = {};   // known past forms -> stem
  (function(){
    var stems = ['kha','pi','ja','aa','kar','de','le','so','ro','dekh','sun','bol','likh','padh','khel','chal','baith','uth','mil','soch','samajh','pooch','puch','bata','bhej','laa','la','rakh','kholo','khol','band','dho','pak','pakad','seekh','sikh','bhool','yaad','pahunch','nikal','hans','gaa','daud','ruk','gir','mang','mangw','kamaa','kama','bana','banaa','suna','dikha','sikha','jeet','haar','tod','jod','kaat','cheen','bech','kharid','khareed','lag','paa','pa','ghoom','ghum','bhaag','jaag','utaar','chadh','laut','bhar','chhod','chhu','kah','keh','maar','mar','rah','reh','ho','paheno','pehen','soch','dhund','dhoond','lad','manaa','mana','jala','bujha','chala','padhaa','likhwa','karwa','dil','tair','kud','ud','dekhaa','thak','cheekh','chilla','hans','muskura','nach','naach','gunguna','ginn','gin','jaan','pehchaan','pehchan','dhoondh'];
    stems.forEach(function(s){
      var f = IRR_PAST[s] || (/[aeiou]$/.test(s) ? [s + 'ya', s + 'yi', s + 'ye'] : [s + 'a', s + 'i', s + 'e']);
      f.forEach(function(x, i){ if (!PAST_LUT[x]) PAST_LUT[x] = { stem:s, g:i === 1 ? 'f' : 'm', pl:i === 2 }; });
    });
  })();
  PAST_LUT['gayi'] = { stem:'ja', g:'f' }; PAST_LUT['gaya'] = { stem:'ja', g:'m' }; PAST_LUT['gaye'] = { stem:'ja', g:'m', pl:true };

  function vowelEnd(s){ return /[aeiou]$/.test(s); }
  function pastForm(stem, g, pl){
    if (IRR_PAST[stem]) return IRR_PAST[stem][g === 'f' ? 1 : (pl ? 2 : 0)];
    var v = vowelEnd(stem), y = v ? 'y' : '';
    return stem + (g === 'f' ? y + 'i' : (pl ? y + 'e' : y + 'a'));
  }
  function habit(stem, g, pl){ return stem + (g === 'f' ? 'ti' : (pl ? 'te' : 'ta')); }
  function futForm(stem, key, g){
    var P = PRON[key] || PRON.wo, st = stem;
    if (stem === 'ho') return key === 'main' ? (g === 'f' ? 'houngi' : 'hounga') : key === 'tum' ? (g === 'f' ? 'hogi' : 'hoge') : (P.pl ? (g === 'f' ? 'hongi' : 'honge') : (g === 'f' ? 'hogi' : 'hoga'));
    var end = key === 'main' ? (g === 'f' ? 'ungi' : 'unga') : key === 'tum' ? (g === 'f' ? 'ogi' : 'oge') : (P.pl ? (g === 'f' ? 'engi' : 'enge') : (g === 'f' ? 'egi' : 'ega'));
    if (stem === 'de' || stem === 'le') st = stem.charAt(0);
    else if (/[aeiou]$/.test(stem) && /^e/.test(end) && stem !== 'ho') st = stem + 'y';
    else if (stem === 'pi' || stem === 'si') st = stem + 'y';
    return st + end;
  }
  function copulaPast(key, g, name){ var P = PRON[key]; var pl = P ? P.pl : false; return key === 'main' || (!pl) ? (g === 'f' ? 'thi' : 'tha') : (g === 'f' ? 'thi' : 'the'); }
  function copulaFut(key, g){ return futForm('ho', key, g); }
  function auxPres(key){ return (PRON[key] || PRON.wo).aux; }
  function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function parse(raw, genderPick){
    var q = /\?\s*$/.test(raw) ? '?' : '', excl = /!\s*$/.test(raw) ? '!' : '';
    var toks = raw.toLowerCase().replace(/[.,!?;:()"“”]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!toks.length) return { err:'Pehle sentence likho.' };
    var t = toks.map(function(w){ return AUXN[w] ? AUXN[w] : (w === 'nhi' || w === 'nahin' || w === 'nahi' ? 'nahi' : w); });
    var n = t.length, i, hadNe = false, fem = genderPick === 'f';
    var vi = -1, kind = null, stem = '', aux = '', end = n;   // verb index, kind: habit|cont|fut|past|cop

    /* ---- find the verb group, scanning from the right ---- */
    var last = t[n - 1];
    var isAux = function(w){ return w === 'hoon' || w === 'hai' || w === 'hain' || w === 'ho' || w === 'tha' || w === 'thi' || w === 'the'; };
    var m;
    // continuous: <stem> raha|rahi|rahe [aux]
    for (i = n - 1; i >= 1; i--) {
      if ((t[i] === 'raha' || t[i] === 'rahi' || t[i] === 'rahe') && (i + 1 === n || (i + 2 === n && /^(hoon|hai|hain|ho|tha|thi|the|hoga|hogi|honge|hounga|hoge)$/.test(t[i + 1])))) {
        vi = i - 1; kind = 'cont'; stem = t[vi]; aux = i + 1 < n ? t[i + 1] : ''; end = i + 2 <= n ? n : n; if (t[i] === 'rahi') fem = genderPick ? fem : true; break;
      }
    }
    // habitual: <stem>ta|ti|te [aux]
    if (!kind) for (i = n - 1; i >= 0; i--) {
      m = /^(.+?)(ta|ti|te)$/.exec(t[i]);
      if (m && NOT_VERB_TA.indexOf(t[i]) < 0 && (i + 1 === n || (i + 2 === n && isAux(t[i + 1])))) {
        vi = i; kind = 'habit'; stem = m[1]; aux = i + 1 < n ? t[i + 1] : ''; if (m[2] === 'ti' && !genderPick) fem = true; break;
      }
    }
    // future: <stem>unga|ungi|oge|ogi|ega|egi|enge|engi
    if (!kind) for (i = n - 1; i >= 0; i--) {
      m = /^(.+?)y?(unga|ungi|oge|ogi|ega|egi|enge|engi)$/.exec(t[i]);
      if (m && i + 1 === n) {
        vi = i; kind = 'fut'; stem = m[1]; if (/i$/.test(m[2]) && !genderPick) fem = true;
        if (/^[dl]$/.test(stem)) stem = stem === 'd' ? 'de' : 'le';
        if (stem === 'a') stem = 'aa';
        var impl = /^u/.test(m[2]) ? 'main' : /^o/.test(m[2]) ? 'tum' : /^e(ga|gi)$/.test(m[2]) ? 'wo' : 'hum';
        t.__impl = impl; break;
      }
    }
    // past: known form, or <stem>a|i|e when the sentence has "ne"
    if (!kind) {
      var pi = n - 1, pa = '';
      if (isAux(t[pi]) && n > 1) { pa = t[pi]; pi--; }
      var w = t[pi], lut = PAST_LUT[w];
      if (!lut && n - (pa ? 2 : 1) >= 1 && (NE_FORM[t[0]] || t.indexOf('ne') >= 0 || (pa && /^(tha|thi|the)$/.test(pa)))) {
        var mm = /^(.+?)(ya|yi|ye|a|i|e)$/.exec(w);
        if (mm && w.length > 2) lut = { stem:mm[1], g:/i$/.test(mm[2]) ? 'f' : 'm', pl:/e$/.test(mm[2]) };
      }
      if (lut) { vi = pi; kind = 'past'; stem = lut.stem; aux = pa; t.__pg = lut.g; t.__ppl = !!lut.pl; end = pa ? pi + 2 : pi + 1; }
    }
    var STEMN = { pee:'pi', jaa:'ja', khaa:'kha', soo:'so', roo:'ro', lee:'le', dee:'de', aa:'aa', laa:'la', paa:'pa', gaa:'gaa', karr:'kar', reh:'reh' };
    if (kind && STEMN[stem]) stem = STEMN[stem];
    // copula: ... hoon|hai|ho|hain|tha|thi|the
    if (!kind && isAux(last)) { kind = 'cop'; vi = n - 1; aux = last; }
    if (!kind) return { err:'Verb pehchan nahi paya. Aise likho: “main roz school jata hoon”, “wo khana kha raha hai”, “hum kal movie dekhenge”.' };
    if (kind === 'cop') { if ((last === 'thi') && !genderPick) fem = true; }
    if (kind === 'past' && t.__pg === 'f' && !genderPick && !(NE_FORM[t[0]] || t.indexOf('ne') >= 0) && INTRANS.indexOf(stem) >= 0) fem = true;

    /* ---- subject ---- */
    var skey = null, sname = '', si = -1, ne = false;
    for (i = 0; i < Math.min(vi, 4); i++) {
      if (ALIAS[t[i]] && !(t[i] === 'ye' && t[i + 1] === 'log')) { skey = ALIAS[t[i]]; si = i; ne = !!NE_FORM[t[i]]; break; }
    }
    var nameIdx = -1;
    if (!skey) {
      // "Rahul ne ...", "Rahul school jata hai"
      for (i = 0; i < Math.min(vi, 3); i++) if (t[i + 1] === 'ne') { nameIdx = i; break; }
      if (nameIdx < 0) {
        var impl2 = t.__impl || (aux === 'hoon' ? 'main' : aux === 'ho' ? 'tum' : null);
        if (impl2 && !(vi > 0 && t[0].length > 0 && ADV.indexOf(t[0]) < 0 && false)) { skey = impl2; si = -1; }
        else { nameIdx = 0; while (nameIdx < vi - 1 && ADV.indexOf(t[nameIdx]) >= 0) nameIdx++; if (ADV.indexOf(t[nameIdx]) >= 0 || nameIdx >= vi) { skey = 'wo'; si = -1; nameIdx = -1; } }
      }
      if (nameIdx >= 0) { sname = cap(toks[nameIdx]); si = nameIdx; skey = 'name'; ne = t[nameIdx + 1] === 'ne'; }
    }
    var plural = skey === 'name' ? (aux === 'hain' || aux === 'the' || kind === 'fut' && /enge|engi/.test(t[vi])) : PRON[skey].pl;
    if ((skey === 'wo' || skey === 'yeh' || skey === 've') && t[si + 1] === 'log') { plural = true; skey = 've'; }
    var P = skey === 'name' ? { ne:sname + ' ne', aux:plural ? 'hain' : 'hai', pl:plural, p:3 } : PRON[skey];
    var fkey = skey === 'name' ? (plural ? 've' : 'wo') : skey;   // conjugation key
    // Name + log / "Rahul aur Amit" -> plural already via aux; fine.

    /* ---- rest of the sentence: words before the subject, words between subject and verb ---- */
    var skip = {}; if (si >= 0) { skip[si] = 1; if (t[si + 1] === 'ne') skip[si + 1] = 1; if (t[si + 1] === 'log' && skey === 've') skip[si + 1] = 1; }
    var vstart = kind === 'cop' ? n - 1 : (kind === 'cont' ? vi : vi);
    var vend = n;
    var pre = [], mid = [];
    for (i = 0; i < vstart; i++) {
      if (skip[i]) continue;
      if (si >= 0 && i < si) pre.push(toks[i]); else mid.push(toks[i]);
    }
    if (si < 0) { mid = pre.concat(mid); pre = []; }
    // keep leading adverb ("kal", "kya") before subject when subject was inferred from the verb
    var gender = fem ? 'f' : 'm';
    var femObj = mid.some(function(w){ return FEM_NOUN.indexOf(w.toLowerCase()) >= 0; });
    var join = function(a){ return a.filter(Boolean).join(' '); };
    var subjPlain = skey === 'name' ? sname : (si >= 0 ? cap0(skey, toks[si]) : (skey === 'main' ? 'main' : skey === 'tum' ? 'tum' : skey === 'wo' ? 'wo' : skey === 'hum' ? 'hum' : skey));
    function cap0(k, orig){ return k === 'main' ? 'main' : (NE_FORM[orig] ? (k === 'wo' ? 'wo' : k === 'yeh' ? 'yeh' : k === 'tu' ? 'tu' : k === 'aap' ? 'aap' : k === 'hum' ? 'hum' : k === 'tum' ? 'tum' : k === 've' ? 've' : 'main') : orig); }
    if (si >= 0 && !NE_FORM[toks[si]]) subjPlain = ({ mai:'main', mein:'main', mei:'main', ap:'aap', woh:'wo', vo:'wo', vah:'wo', ye:'yeh', yah:'yeh', ham:'hum', we:'ve' })[toks[si]] || toks[si];
    if (skey === 've' && t[si + 1] === 'log') subjPlain = toks[si] + ' log';
    var pastSubj = (P.ne && skey === 'name') ? sname + ' ne' : P.ne;
    var tr = INTRANS.indexOf(stem) < 0;      // takes "ne" in the simple past
    var out = {};
    var negMove = function(a){ return a; };

    var mk = function(subj, verbs){ return cap(join(pre.concat([subj], mid, verbs))) + (q || excl || '.'); };
    var mkPast = function(subj, verbs){ return cap(join(pre.concat([subj], mid, verbs))) + (q || excl || '.'); };

    if (kind === 'cop') {
      out.present = mk(subjPlain, [auxPres(fkey) === 'hai' && skey === 'name' ? (plural ? 'hain' : 'hai') : auxPres(fkey)]);
      out.past = mk(subjPlain, [copulaPast(fkey, gender)]);
      out.future = mk(subjPlain, [copulaFut(fkey, gender)]);
      out.tag = ['Simple', 'Simple', 'Simple'];
    } else if (kind === 'cont') {
      var rah = function(g, pl){ return g === 'f' ? 'rahi' : (pl ? 'rahe' : 'raha'); };
      var pl2 = plural && !(skey === 'aap' && false);
      var rv = rah(gender, pl2);
      var ax = skey === 'name' ? (plural ? 'hain' : 'hai') : auxPres(fkey);
      out.present = mk(subjPlain, [stem, rv, ax]);
      out.past = mk(subjPlain, [stem, rv, gender === 'f' ? 'thi' : (pl2 ? 'the' : 'tha')]);
      var h = futForm('ho', fkey, gender);
      out.future = mk(subjPlain, [stem, rv, h]);
      out.tag = ['Continuous', 'Continuous', 'Continuous'];
    } else {
      var g = gender, ptag = 'Simple';
      var presV = habit(stem, g, plural) + ' ' + (skey === 'name' ? (plural ? 'hain' : 'hai') : auxPres(fkey));
      var pastG = g, pastPl = plural;
      if (tr) { pastG = femObj ? 'f' : 'm'; pastPl = false; }
      var pastV = pastForm(stem, pastG, pastPl && !tr ? true : (!tr && plural));
      out.present = mk(subjPlain, [presV]);
      out.past = mkPast(tr ? pastSubj : subjPlain, [pastV]);
      out.future = mk(subjPlain, [futForm(stem, fkey, g)]);
      out.tag = ['Simple', 'Simple', 'Simple'];
      if (tr && skey === 'name' && !ne) out.past = mkPast(sname + ' ne', [pastV]);
    }
    out.note = (kind === 'past' || kind === 'habit' || kind === 'fut' || kind === 'cop' || kind === 'cont') ? '' : '';
    out.subject = skey === 'name' ? sname : fkey;
    out.verb = stem;
    return out;
  }
  window.epConvert = parse;   // for testing

  /* ======================= UI ======================= */
  var KEY = 'ks_ep_hist_v1';
  var E = { text:'', gender:'', res:null, err:'', hist:[], copied:'' };
  try { E.hist = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch(e){ E.hist = []; }
  function saveHist(){ try { localStorage.setItem(KEY, JSON.stringify(E.hist.slice(0, 15))); } catch(e){} }
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  try { TITLES.ep = ['EP', 'English Practice · ek sentence ke Present, Past aur Future form']; } catch(e){}
  try { NAV_GRP.ep = 'Overview'; } catch(e){}

  var css = document.createElement('style');
  css.textContent = [
    '#epRoot{max-width:860px;margin:0 auto;color:var(--ink,#1e293b)}',
    '#epRoot .ep-card{background:var(--card,#fff);border:1px solid var(--line,#e5e9f2);border-radius:var(--radius,16px);box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.06));padding:18px;margin-bottom:16px}',
    '#epRoot .ep-lb{display:block;font-size:calc(13px*var(--fs,1));font-weight:700;color:var(--muted,#64748b);margin-bottom:8px;letter-spacing:.2px}',
    '#epRoot textarea{width:100%;box-sizing:border-box;min-height:96px;resize:vertical;border:1.5px solid var(--line,#e5e9f2);border-radius:14px;padding:14px 16px;font:inherit;font-size:calc(17px*var(--fs,1));line-height:1.5;background:var(--card,#fff);color:inherit;outline:none}',
    '#epRoot textarea:focus{border-color:var(--brand,#4f46e5);box-shadow:0 0 0 3px var(--brand-soft,#eef0ff)}',
    '#epRoot .ep-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}',
    '#epRoot .ep-chip{border:1px solid var(--line,#e5e9f2);background:var(--card,#fff);color:inherit;border-radius:999px;padding:7px 14px;font-size:calc(13px*var(--fs,1));cursor:pointer;font-weight:600}',
    '#epRoot .ep-chip.on{background:var(--brand,#4f46e5);color:#fff;border-color:var(--brand,#4f46e5)}',
    '#epRoot .ep-ex{background:var(--brand-soft,#eef0ff);color:var(--brand-ink,#4f46e5);border-color:transparent;font-weight:500}',
    '#epRoot .ep-go{border:0;border-radius:12px;padding:0 22px;min-height:46px;font-weight:800;font-size:calc(15px*var(--fs,1));background:linear-gradient(135deg,var(--brand,#4f46e5),var(--brand-2,#7c3aed));color:#fff;cursor:pointer}',
    '#epRoot .ep-gh{border:1px solid var(--line,#e5e9f2);border-radius:12px;padding:0 16px;min-height:46px;font-weight:700;background:transparent;color:inherit;cursor:pointer}',
    '#epRoot .ep-err{background:var(--bad-soft,#fee2e2);color:var(--bad,#dc2626);border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:calc(14px*var(--fs,1));line-height:1.5}',
    '#epRoot .ep-grid{display:grid;gap:14px;grid-template-columns:1fr}',
    '@media(min-width:900px){#epRoot .ep-grid{grid-template-columns:1fr}}',
    '#epRoot .ep-res{border-radius:var(--radius,16px);border:1px solid var(--line,#e5e9f2);background:var(--card,#fff);box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.06));padding:16px 18px;display:flex;gap:14px;align-items:flex-start;border-left-width:6px}',
    '#epRoot .ep-res.pr{border-left-color:#16a34a}#epRoot .ep-res.pa{border-left-color:#d97706}#epRoot .ep-res.fu{border-left-color:#4f46e5}',
    '#epRoot .ep-hd{display:flex;align-items:center;gap:8px;font-size:calc(12.5px*var(--fs,1));font-weight:800;letter-spacing:.6px;text-transform:uppercase;margin-bottom:6px}',
    '#epRoot .pr .ep-hd{color:#16a34a}#epRoot .pa .ep-hd{color:#d97706}#epRoot .fu .ep-hd{color:#4f46e5}',
    '#epRoot .ep-tg{font-size:calc(11px*var(--fs,1));font-weight:700;text-transform:none;letter-spacing:0;background:var(--soft,#f1f5f9);color:var(--muted,#64748b);border-radius:999px;padding:2px 9px}',
    '#epRoot .ep-tx{font-size:calc(20px*var(--fs,1));line-height:1.45;font-weight:600;word-break:break-word}',
    '#epRoot .ep-cp{flex:none;border:1px solid var(--line,#e5e9f2);background:var(--soft,#f8fafc);color:inherit;border-radius:10px;padding:8px 12px;font-weight:700;font-size:calc(13px*var(--fs,1));cursor:pointer;margin-left:auto}',
    '#epRoot .ep-body{flex:1;min-width:0}',
    '#epRoot .ep-hist{display:flex;flex-direction:column;gap:6px}',
    '#epRoot .ep-h{display:flex;gap:8px;align-items:center;border:1px solid var(--line,#e5e9f2);border-radius:12px;padding:9px 12px;cursor:pointer;font-size:calc(14px*var(--fs,1));background:var(--card,#fff)}',
    '#epRoot .ep-h span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#epRoot .ep-h:hover{border-color:var(--brand,#4f46e5)}',
    '#epRoot .ep-tip{color:var(--muted,#64748b);font-size:calc(13px*var(--fs,1));line-height:1.6;margin-top:4px}',
    '@media(max-width:600px){#epRoot .ep-card{padding:14px}#epRoot .ep-res{padding:13px 14px;gap:10px;flex-wrap:wrap}#epRoot .ep-tx{font-size:calc(18px*var(--fs,1))}#epRoot .ep-cp{margin-left:0}}'
  ].join('\n');
  document.head.appendChild(css);

  var EXAMPLES = ['Main roz school jata hoon', 'Wo khana kha raha hai', 'Hum kal movie dekhenge', 'Maine chai pi', 'Tum kya karte ho?'];

  function resHtml(cls, title, tag, text){
    return '<div class="ep-res ' + cls + '"><div class="ep-body"><div class="ep-hd">' + title + '<span class="ep-tg">' + esc(tag) + '</span></div><div class="ep-tx">' + esc(text) + '</div></div>' +
      '<button class="ep-cp" data-cp="' + cls + '">' + (E.copied === cls ? '✓ Copied' : 'Copy') + '</button></div>';
  }
  function draw(){
    var root = $('#epRoot'); if (!root) return;
    var r = E.res;
    root.innerHTML =
      '<div class="ep-card"><label class="ep-lb" for="epIn">✍️ Apna sentence Hinglish me likho</label>' +
      '<textarea id="epIn" placeholder="Jaise: Main roz school jata hoon" autocomplete="off" autocapitalize="sentences" spellcheck="false">' + esc(E.text) + '</textarea>' +
      '<div class="ep-row"><span class="ep-lb" style="margin:0">Kaun?</span>' +
      [['', 'Auto'], ['m', 'Ladka'], ['f', 'Ladki']].map(function(g){ return '<button class="ep-chip' + (E.gender === g[0] ? ' on' : '') + '" data-g="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</div>' +
      '<div class="ep-row"><button class="ep-go" id="epGo">Convert ➜</button><button class="ep-gh" id="epClr">Clear</button></div>' +
      '<div class="ep-row" style="margin-top:14px">' + EXAMPLES.map(function(x, i){ return '<button class="ep-chip ep-ex" data-ex="' + i + '">' + esc(x) + '</button>'; }).join('') + '</div></div>' +
      (E.err ? '<div class="ep-err">' + esc(E.err) + '</div>' : '') +
      (r ? '<div class="ep-grid">' + resHtml('pr', '🟢 Present', r.tag[0], r.present) + resHtml('pa', '🟠 Past', r.tag[1], r.past) + resHtml('fu', '🔵 Future', r.tag[2], r.future) + '</div>' +
        '<div class="ep-row" style="margin:14px 0 18px"><button class="ep-gh" id="epAll">' + (E.copied === 'all' ? '✓ Copied' : '📋 Teeno copy karo') + '</button></div>' : '<div class="ep-tip">Sentence likho aur <b>Convert</b> dabao — Present, Past aur Future teeno ek saath dikhenge. Sentence me <b>aap, tum, main, wo, hum</b> ya kisi ka naam likh sakte ho. Ladki ke liye <b>Ladki</b> chip dabao.</div>') +
      (E.hist.length ? '<div class="ep-card" style="margin-top:6px"><label class="ep-lb">🕘 Pichle sentences</label><div class="ep-hist">' + E.hist.map(function(h, i){ return '<div class="ep-h" data-h="' + i + '"><span>' + esc(h) + '</span><button class="ep-chip" data-x="' + i + '" aria-label="Hatao">✕</button></div>'; }).join('') + '</div></div>' : '');
  }
  function run(keep){
    var ta = $('#epIn'); if (ta && !keep) E.text = ta.value;
    if (!E.text.trim()) { E.err = 'Pehle sentence likho.'; E.res = null; return draw(); }
    var r; try { r = parse(E.text.trim(), E.gender); } catch(e){ r = { err:'Is sentence ko samajh nahi paya. Thoda simple likh ke dekho.' }; }
    if (r.err) { E.err = r.err; E.res = null; } else {
      E.err = ''; E.res = r; E.copied = '';
      var t = E.text.trim(); E.hist = [t].concat(E.hist.filter(function(h){ return h !== t; })).slice(0, 15); saveHist();
    }
    draw();
  }
  function copy(text, key){
    var done = function(){ E.copied = key; draw(); setTimeout(function(){ E.copied = ''; draw(); }, 1400); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch(e){ fallback(); }
    function fallback(){ var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(e){} ta.remove(); done(); }
  }
  function bind(){
    var root = $('#epRoot'); if (!root || root.__b) return; root.__b = 1;
    root.addEventListener('input', function(e){ if (e.target.id === 'epIn') E.text = e.target.value; });
    root.addEventListener('keydown', function(e){ if (e.target.id === 'epIn' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } });
    root.addEventListener('click', function(e){
      var t = e.target, el;
      if ((el = t.closest('[data-g]'))) { E.gender = el.dataset.g; var ta = $('#epIn'); if (ta) E.text = ta.value; if (E.text.trim() && E.res) return run(true); return draw(); }
      if ((el = t.closest('[data-ex]'))) { E.text = EXAMPLES[+el.dataset.ex]; return run(true); }
      if (t.closest('#epGo')) return run();
      if (t.closest('#epClr')) { E.text = ''; E.res = null; E.err = ''; draw(); var i = $('#epIn'); if (i) i.focus(); return; }
      if ((el = t.closest('[data-cp]'))) { var m = { pr:'present', pa:'past', fu:'future' }[el.dataset.cp]; if (E.res) copy(E.res[m], el.dataset.cp); return; }
      if (t.closest('#epAll') && E.res) return copy('Present: ' + E.res.present + '\nPast: ' + E.res.past + '\nFuture: ' + E.res.future, 'all');
      if ((el = t.closest('[data-x]'))) { E.hist.splice(+el.dataset.x, 1); saveHist(); e.stopPropagation(); return draw(); }
      if ((el = t.closest('[data-h]'))) { E.text = E.hist[+el.dataset.h]; return run(true); }
    });
  }
  window.vEp = function(){ return '<div id="epRoot"></div>'; };
  window.epAfter = function(){ bind(); draw(); };

  (function addTab(){
    var nav = $('#nav'), src = nav && nav.querySelector('[data-v="updates"]'); if (!src || nav.querySelector('[data-v="ep"]')) return;
    var anchor = nav.querySelector('[data-v="timetable"]') || src, b = src.cloneNode(true);
    b.dataset.v = 'ep'; b.classList.remove('active', 'hidden');
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), tn = [];
    while (tw.nextNode()) if (tw.currentNode.nodeValue.trim()) tn.push(tw.currentNode);
    tn.forEach(function(n){ n.nodeValue = n.nodeValue.replace('⬇️', '🗣️').replace('Updates', 'EP'); });
    anchor.after(b);
  })();
})();
