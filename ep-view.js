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
  var ADJW = ['thaka','thaki','thake','bada','badi','bade','naya','nayi','naye','purana','purani','khush','udaas','bimar','busy','free','ready','late','theek','achha','accha','acha','bura','tez','garam','thanda','sundar'];
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


  /* ======================= English translation (rules + small dictionary) ======================= */
  var EV = { kha:['eat','ate'], pi:['drink','drank'], ja:['go','went'], aa:['come','came'], kar:['do','did'], de:['give','gave'], le:['take','took'], so:['sleep','slept'], ro:['cry','cried'], hans:['laugh','laughed'],
    dekh:['see','saw'], sun:['hear','heard'], bol:['say','said'], likh:['write','wrote'], padh:['read','read'], khel:['play','played'], chal:['walk','walked'], baith:['sit','sat','sitting'], uth:['get up','got up'],
    mil:['meet','met'], soch:['think','thought'], samajh:['understand','understood'], pooch:['ask','asked'], puch:['ask','asked'], bata:['tell','told'], bhej:['send','sent'], la:['bring','brought'], laa:['bring','brought'],
    rakh:['keep','kept'], khol:['open','opened'], seekh:['learn','learned'], sikh:['learn','learned'], bhool:['forget','forgot'], pahunch:['reach','reached'], nikal:['leave','left'], gaa:['sing','sang'], daud:['run','ran','running'],
    ruk:['stop','stopped','stopping'], gir:['fall','fell'], mang:['ask for','asked for'], kama:['earn','earned'], bana:['make','made'], banaa:['make','made'], jeet:['win','won','winning'], haar:['lose','lost'], tod:['break','broke'],
    bech:['sell','sold'], kharid:['buy','bought'], khareed:['buy','bought'], pa:['get','got','getting'], ghoom:['roam','roamed'], ghum:['roam','roamed'], bhaag:['run','ran','running'], jaag:['wake up','woke up'], dho:['wash','washed'],
    pak:['cook','cooked'], naach:['dance','danced'], nach:['dance','danced'], rah:['live','lived'], reh:['live','lived'], chaah:['want','wanted'], jaan:['know','knew'], dhoond:['find','found'], dhund:['find','found'], mar:['die','died'],
    dikha:['show','showed'], suna:['tell','told'], sikha:['teach','taught'], kah:['say','said'], keh:['say','said'], maar:['hit','hit','hitting'], chhod:['leave','left'], bhar:['fill','filled'], pehen:['wear','wore'], paheno:['wear','wore'],
    lad:['fight','fought'], muskura:['smile','smiled'], thak:['get tired','got tired'], utar:['get down','got down'], chadh:['climb','climbed'], laut:['return','returned'], jala:['burn','burned'], ud:['fly','flew'], tair:['swim','swam','swimming'], kud:['jump','jumped'], gin:['count','counted'], ginn:['count','counted'], ho:['be','was'] };
  var LOAN = ['school','college','office','movie','cricket','market','phone','mobile','bus','train','football','game','match','tv','video','internet','computer','laptop','shopping','bank','station','park','hospital','book','pen','class','exam','test','party','gym','mall','shop','taxi','auto','bike','car','ok','sir','madam','email','message','whatsapp','facebook','youtube','instagram','coffee','pizza','burger','maggi','biryani','cake','juice','lunch','dinner','breakfast','tea','bag','cap','shirt','song','music','film','doctor','teacher','student','friend','family','city','village','road','temple','garden','room','hotel','restaurant','canteen','library','lab','kitchen','bed','water','milk'];
  var EW = { roz:'daily', roj:'daily', aaj:'today', abhi:'now', ab:'now', subah:'in the morning', savere:'in the morning', shaam:'in the evening', raat:'at night', dopahar:'in the afternoon', parso:'the day after tomorrow', phir:'then', pehle:'first', jaldi:'quickly', dheere:'slowly', hamesha:'always', aksar:'often', kabhi:'sometimes', bahut:'very', thoda:'a little', zyada:'a lot', kam:'less', sirf:'only', bhi:'also', aur:'and', ya:'or', lekin:'but', par_:'but',
    ek:'a', do_:'two', teen:'three', har:'every', din:'day', hafte:'week', mahine:'month', saal:'year', ghanta:'hour', ghante:'hours', minute:'minute',
    khana:'food', paani:'water', pani:'water', chai:'tea', doodh:'milk', roti:'roti', chawal:'rice', daal:'dal', sabzi:'vegetables', fal:'fruit', phal:'fruit', nashta:'breakfast', mithai:'sweets', anda:'egg', ande:'eggs',
    kitab:'book', kitaab:'book', kitabein:'books', copy:'notebook', kalam:'pen', ghar:'home', kaam:'work', dost:'friend', doston:'friends', mummy:'mother', maa:'mother', papa:'father', bhai:'brother', behen:'sister', bahan:'sister', dada:'grandfather', dadi:'grandmother', nana:'maternal grandfather', nani:'maternal grandmother', beta:'son', beti:'daughter', bachcha:'child', bachche:'children', naam:'name', gaana:'song', gaane:'songs', paisa:'money', paise:'money', kapde:'clothes', gaadi:'car', bazaar:'market', dukaan:'shop', raasta:'road', sheher:'city', gaon:'village', kamra:'room', darwaza:'door', khidki:'window', khabar:'news', baat:'talk', baatein:'things', cheez:'thing', kahani:'story', sawal:'question', jawab:'answer', padhai:'studies', mehnat:'hard work', tasveer:'picture', photo:'photo', dawai:'medicine', dawa:'medicine', ladka:'boy', ladki:'girl', aadmi:'man', aurat:'woman', log:'people', sab:'everyone', sabhi:'everyone', kuch:'something', koi:'someone', yahan:'here', wahan:'there', kahan:'where', kab:'when', kyun:'why', kaise:'how', kitna:'how much', kya:'what', kaun:'who',
    achha:'good', accha:'good', acha:'good', bura:'bad', bada:'big', badi:'big', chhota:'small', chhoti:'small', naya:'new', nayi:'new', purana:'old', khush:'happy', udaas:'sad', bimar:'sick', thaka:'tired', thaki:'tired', mazedaar:'fun', tez:'fast', pyaara:'lovely', sundar:'beautiful', garam:'hot', thanda:'cold', busy:'busy', free:'free', ready:'ready', late:'late', theek:'fine', sahi:'right', galat:'wrong', mushkil:'difficult', aasaan:'easy',
    mera:'my', meri:'my', mere:'my', tumhara:'your', tumhari:'your', tumhare:'your', tera:'your', teri:'your', aapka:'your', aapki:'your', aapke:'your', uska:'his', uski:'his', uske:'his', hamara:'our', hamari:'our', hamare:'our', unka:'their', unki:'their', unke:'their', apna:'own', apni:'own', apne:'own',
    mujhe:'me', mujhko:'me', tumhe:'you', tumko:'you', aapko:'you', usko:'him', use:'him', unko:'them', humko:'us', hume:'us', hamein:'us', usse:'him', mujhse:'me', tumse:'you', isko:'this', yeh_:'this' };
  EW['par'] = 'on'; EW['do'] = 'two'; 
  var PREP = { mein:'in', me:'in', par:'on', se:'from', tak:'until', ko:'' };
  var COMPOUND = { saath:'with', liye:'for', baad:'after', pehle:'before', upar:'above', neeche:'below', andar:'inside', bahar:'outside', paas:'near', beech:'between', bina:'without' };
  var PLACE_THE = ['market','shop','bank','station','park','hospital','temple','mall','gym','library','canteen','restaurant','hotel','garden','city','village','road','room','bazaar'];
  var PLACE_BARE = ['school','college','office','work','home','class','bed','town'];
  var TIMEW = ['roz','roj','aaj','abhi','ab','subah','savere','shaam','raat','dopahar','parso','kal','phir','jaldi','daily'];
  var FREQ = ['hamesha','aksar','kabhi'];

  function enIng(b){ var w = b.split(' '), f = w[0], r = w.slice(1).join(' ');
    var g = /ie$/.test(f) ? f.slice(0, -2) + 'ying' : (/[^e]e$/.test(f) ? f.slice(0, -1) + 'ing' : f + 'ing'); return r ? g + ' ' + r : g; }
  function enS(b){ var w = b.split(' '), f = w[0], r = w.slice(1).join(' ');
    var x = /(s|sh|ch|x|z|o)$/.test(f) ? f + 'es' : (/[^aeiou]y$/.test(f) ? f.slice(0, -1) + 'ies' : f + 's'); return r ? x + ' ' + r : x; }
  function enPast(b){ var w = b.split(' '), f = w[0], r = w.slice(1).join(' ');
    var x = /e$/.test(f) ? f + 'd' : (/[^aeiou]y$/.test(f) ? f.slice(0, -1) + 'ied' : f + 'ed'); return r ? x + ' ' + r : x; }

  function english(c){
    var words = c.pre.concat(c.mid).map(function(w){ return w.toLowerCase(); });
    var q = c.q === '?', neg = false, yn = false, wh = '', unknown = [];
    if (q && c.pre.length && c.pre[0].toLowerCase() === 'kya') { yn = true; words.shift(); }
    words = words.filter(function(w){ if (w === 'nahi' || w === 'nahin' || w === 'nhi') { neg = true; return false; } return true; });
    var objs = [], times = [], freq = '', i, w, tmp;
    var ctx = words.join(' ');
    var vb = EV[c.stem] || null;
    if (!vb && c.kind !== 'cop' && c.stem !== 'ho') return null;
    var base = vb ? vb[0] : 'be', past = vb && vb[1] ? vb[1] : 'was';
    if (c.stem === 'dekh' && /\b(movie|film|tv|video|match|serial|cartoon|show|series|picture)\b/.test(ctx)) { base = 'watch'; past = 'watched'; }
    if (c.stem === 'sun' && /\b(gaana|gaane|song|songs|music|radio)\b/.test(ctx)) { base = 'listen to'; past = 'listened to'; }
    if (c.stem === 'padh' && /\b(padhai)\b/.test(ctx)) { base = 'study'; past = 'studied'; }
    if (c.stem === 'bol' && /\b(english|hindi|angrezi)\b/.test(ctx)) { base = 'speak'; past = 'spoke'; }
    if (c.stem === 'kar' && /\b(padhai)\b/.test(ctx)) { base = 'do'; }
    var ing = vb && vb[2] ? vb[2] : enIng(base);
    var POSS = { main:'my', tum:'your', tu:'your', aap:'your', hum:'our', ve:'their', wo:(c.fem ? 'her' : 'his'), yeh:(c.fem ? 'her' : 'his'), name:(c.fem ? 'her' : 'his') }[c.skey] || 'his';
    var tr = function(wd){
      if (wd === 'apna' || wd === 'apni' || wd === 'apne') return POSS;
      var key = wd;
      if (EW[key] !== undefined && key !== 'kal') return EW[key];
      if (LOAN.indexOf(key) >= 0) return key;
      if (/^\d+$/.test(key)) return key;
      unknown.push(wd); return wd;
    };
    var kalIdx = -1;
    for (i = 0; i < words.length; i++) {
      w = words[i];
      if (w === 'ka' || w === 'ki' || w === 'ke') {
        var nx = words[i + 1];
        if (w === 'ke' && COMPOUND[nx]) { var pv = objs.pop(); objs.push(COMPOUND[nx] + ' ' + (pv || '')); i++; continue; }
        var pv2 = objs.pop(); objs.push((pv2 || '') + "'s"); continue;
      }
      if (PREP[w] !== undefined && objs.length) {
        var last = objs.pop();
        if (w === 'ko') { objs.push(last); continue; }
        if (w === 'mein' || w === 'me') { objs.push(/home$/.test(last) ? 'at ' + last : 'in ' + last); continue; }
        objs.push(PREP[w] + ' ' + last); continue;
      }
      if (w === 'kal') { times.push({ kal:1 }); continue; }
      if (w === 'kya' || w === 'kab' || w === 'kahan' || w === 'kyun' || w === 'kaise' || w === 'kitna' || w === 'kaun') { wh = EW[w]; continue; }
      if (w === 'hamesha' || w === 'aksar') { freq = EW[w]; continue; }
      if (w === 'kabhi') { if (neg) { freq = 'ever'; } else freq = 'sometimes'; continue; }
      if (TIMEW.indexOf(w) >= 0) { times.push(EW[w] || w); continue; }
      if (w === 'ko') continue;
      var t = tr(w); if (t === '') continue;
      // possessive "'s" glue
      if (objs.length && /'s$/.test(objs[objs.length - 1])) { objs[objs.length - 1] = objs[objs.length - 1] + ' ' + t; continue; }
      objs.push(t);
    }
    var MODS = ['my','your','his','her','our','their','a','every','good','bad','big','small','new','old','fast','hot','cold','beautiful','lovely','fun','easy','difficult','very','two','three','a little','a lot'];
    for (i = objs.length - 2; i >= 0; i--) {
      if (MODS.indexOf(objs[i]) >= 0 || /'s$/.test(objs[i])) objs.splice(i, 2, objs[i] + ' ' + objs[i + 1]);
    }
    var PRE_RE = /^(in|on|at|from|to|with|for|after|before|until|near|inside|outside|between|without|above|below) /;
    var DET = ['my','your','his','her','our','their','a','an','the','this','that','every','two','three','some'];
    var COUNT = ['movie','film','book','song','car','picture','photo','story','pen','notebook','road','friend','letter','game','match','shop','bike','bus','train','phone','mobile','laptop','question','room','door','window','boy','girl','man','woman','child','doctor','teacher','student','city','village'];
    var art = function(str){
      var m = PRE_RE.exec(str), pre = m ? m[0] : '', np = str.slice(pre.length), ws = np.split(' ');
      var lastW = ws[ws.length - 1].replace(/'s$/, '');
      if (COUNT.indexOf(lastW) >= 0 && DET.indexOf(ws[0]) < 0 && !/'s/.test(np) && ws[ws.length - 1] === lastW) np = (/^[aeiou]/.test(np) ? 'an ' : 'a ') + np;
      return pre + np;
    };
    if (['ja', 'aa', 'pahunch'].indexOf(c.stem) >= 0) {
      for (i = 0; i < objs.length; i++) {
        if (PRE_RE.test(objs[i])) continue;
        var ws2 = objs[i].split(' '), lw = ws2[ws2.length - 1];
        var hasDet = DET.indexOf(ws2[0]) >= 0 || /'s/.test(objs[i]);
        if (lw === 'home' && !hasDet) break;
        if (PLACE_THE.indexOf(lw) >= 0) { objs[i] = 'to ' + (hasDet ? '' : 'the ') + objs[i]; break; }
        if (PLACE_BARE.indexOf(lw) >= 0) { objs[i] = 'to ' + objs[i]; break; }
        if (lw === 'home') { objs[i] = 'to ' + objs[i]; break; }
      }
    }
    objs = objs.map(art);
    objs = objs.filter(function(o){ return !PRE_RE.test(o); }).concat(objs.filter(function(o){ return PRE_RE.test(o); }));   // bare objects first, then "with/to/in ..."
    // subject
    var S, p3 = false, am = false, are = false;
    switch (c.skey) {
      case 'main': S = 'I'; am = true; break;
      case 'tum': case 'tu': case 'aap': S = 'you'; are = true; break;
      case 'hum': S = 'we'; are = true; break;
      case 've': S = 'they'; are = true; break;
      case 'name': S = c.sname; p3 = !c.plural; are = !!c.plural; break;
      default: S = c.fem ? 'she' : 'he'; p3 = true;
    }
    var is = p3 && !am && !are;
    var be = function(past){ return past ? (am || is ? 'was' : (S === 'I' ? 'was' : 'were')) : (am ? 'am' : (is ? 'is' : 'are')); };
    var dox = p3 ? 'does' : 'do';
    var kalW = function(tense){ return tense === 'past' ? 'yesterday' : 'tomorrow'; };
    var endWords = function(tense){ var a = []; times.forEach(function(t){ a.push(typeof t === 'object' ? kalW(tense) : t); }); var rk = function(x){ return (x === 'quickly' || x === 'slowly') ? 0 : (x === 'daily' ? 2 : 1); }; return a.map(function(x, k){ return [x, k]; }).sort(function(u, v){ return rk(u[0]) - rk(v[0]) || u[1] - v[1]; }).map(function(u){ return u[0]; }); };
    var build = function(tense){
      var cop = c.kind === 'cop', cont = c.kind === 'cont', aux = '', main = '', affOnly = '';
      if (cop) { if (tense === 'present') aux = be(false); else if (tense === 'past') aux = be(true); else { aux = 'will'; main = 'be'; } }
      else if (cont) { if (tense === 'present') { aux = be(false); main = ing; } else if (tense === 'past') { aux = be(true); main = ing; } else { aux = 'will'; main = 'be ' + ing; } }
      else if (tense === 'present') { aux = dox; main = base; affOnly = p3 ? enS(base) : base; }
      else if (tense === 'past') { aux = 'did'; main = base; affOnly = past; }
      else { aux = 'will'; main = base; }
      var tail = objs.concat(endWords(tense)).join(' '), out;
      var fr = freq;
      if (q || yn || wh) {
        out = (wh ? wh + ' ' : '') + aux + ' ' + S + (fr ? ' ' + fr : '') + (main ? ' ' + main : '') + (tail ? ' ' + tail : '');
        if (neg) out = out.replace(aux + ' ' + S, aux + ' ' + S + ' not');
        out = out.charAt(0).toUpperCase() + out.slice(1);
      } else if (neg) {
        out = S + ' ' + aux + ' not' + (fr ? ' ' + fr : '') + (main ? ' ' + main : '') + (tail ? ' ' + tail : '');
      } else if (affOnly) {
        out = S + (fr ? ' ' + fr : '') + ' ' + affOnly + (tail ? ' ' + tail : '');
      } else {
        out = S + ' ' + aux + (fr ? ' ' + fr : '') + (main ? ' ' + main : '') + (tail ? ' ' + tail : '');
      }
      out = out.replace(/\s+/g, ' ').trim();
      if (S === c.sname) out = out.charAt(0).toUpperCase() + out.slice(1);
      out = out.charAt(0).toUpperCase() + out.slice(1);
      return out + (q || yn || wh ? '?' : (c.excl || '.'));
    };
    var uniq = unknown.filter(function(u, k){ return unknown.indexOf(u) === k; });
    return { present:build('present'), past:build('past'), future:build('future'), unknown:uniq };
  }

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
      if (ADJW.indexOf(w) >= 0) lut = null;
      else if (!lut && n - (pa ? 2 : 1) >= 1 && (NE_FORM[t[0]] || t.indexOf('ne') >= 0 || (pa && /^(tha|thi|the)$/.test(pa)))) {
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
    try { out.en = english({ kind:kind, stem:stem, skey:skey, sname:sname, fem:fem, plural:plural, pre:pre, mid:mid, q:q, excl:excl }); } catch(e){ out.en = null; }
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
    '#epRoot .ep-en{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line,#e5e9f2);font-size:calc(17px*var(--fs,1));line-height:1.45;color:var(--ink,#1e293b);word-break:break-word}',
    '#epRoot .ep-en span{display:block;font-size:calc(11px*var(--fs,1));font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--muted,#64748b);margin-bottom:2px}',
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

  function resHtml(cls, title, tag, text, en){
    return '<div class="ep-res ' + cls + '"><div class="ep-body"><div class="ep-hd">' + title + '<span class="ep-tg">' + esc(tag) + '</span></div><div class="ep-tx">' + esc(text) + '</div>' +
      (en ? '<div class="ep-en"><span>🇬🇧 English</span>' + esc(en) + '</div>' : '') + '</div>' +
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
      (r ? '<div class="ep-grid">' + resHtml('pr', '🟢 Present', r.tag[0], r.present, r.en && r.en.present) + resHtml('pa', '🟠 Past', r.tag[1], r.past, r.en && r.en.past) + resHtml('fu', '🔵 Future', r.tag[2], r.future, r.en && r.en.future) + '</div>' +
        (r.en && r.en.unknown && r.en.unknown.length ? '<div class="ep-tip">ℹ️ Ye words dictionary me nahi mile, isliye English me waise hi rakhe hain: <b>' + esc(r.en.unknown.join(', ')) + '</b></div>' : (!r.en ? '<div class="ep-tip">ℹ️ Is verb ka English abhi dictionary me nahi hai.</div>' : '')) +
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
      if ((el = t.closest('[data-cp]'))) { var m = { pr:'present', pa:'past', fu:'future' }[el.dataset.cp]; if (E.res) copy(E.res[m] + (E.res.en ? '\n' + E.res.en[m] : ''), el.dataset.cp); return; }
      if (t.closest('#epAll') && E.res) return copy(['present', 'past', 'future'].map(function(m){ return cap(m) + ': ' + E.res[m] + (E.res.en ? '\n   ' + E.res.en[m] : ''); }).join('\n'), 'all');
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
