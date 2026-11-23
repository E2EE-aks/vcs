'use strict';
/* YouTube video / audio downloader used by the WhatsApp helper bot (menu: "YouTube Video / Audio download").
   Engine: yt-dlp (a standalone program, downloaded once to the server's temp folder and refreshed every 3 days).
   ffmpeg comes from the "ffmpeg-static" package (needed to join video+audio and to make MP3); without it only ready-made MP4 / M4A files are possible.
   When YouTube says "confirm you're not a bot" (it does that to most cloud servers) we retry with other YouTube clients, then use cookies.
   Cookies: the admin sends a cookies.txt in the WhatsApp chat (saved by o.store) or sets YT_COOKIES.  Proxy: DL_PROXY (e.g. http://user:pass@host:port).
   Env (all optional):  DL_MAX_MB (default 90)  ·  YTDLP_BIN  ·  YT_COOKIES  ·  DL_PROXY  */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), zlib = require('zlib');

module.exports = function (o) {
  const env = o.env || {}, warn = o.warn || (() => {});
  const DIR = path.join(os.tmpdir(), 'ks-dl'), BIN = env.YTDLP_BIN || path.join(DIR, 'yt-dlp'), COOK = path.join(DIR, 'cookies.txt');
  const MAX_MB = Number(env.DL_MAX_MB) || 90;
  let ffmpeg = ''; try { ffmpeg = require('ffmpeg-static') || ''; } catch (e) {}
  let busy = false, binP = null;

  /* the first YouTube link inside a message (watch / shorts / live / youtu.be) -> a clean https link, or '' */
  function link(text) {
    const m = String(text || '').match(/(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|live\/)|youtu\.be\/)[\w-]{6,}[^\s]*/i);
    if (!m) return '';
    return /^https?:\/\//i.test(m[0]) ? m[0] : 'https://' + m[0];
  }

  /* what the user typed -> something yt-dlp can download: a YouTube link, a Spotify SONG link (-> song + artist -> YouTube search),
     or just a song name (-> YouTube search, first result).  Spotify itself cannot be downloaded (DRM); we only read the song's name from its public page. */
  const unent = t => String(t).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'");
  async function resolve(text) {
    const t = String(text || '').trim(), yt = link(t); if (yt) return yt;
    const sp = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)/i.exec(t);
    if (sp) {
      if (sp[1].toLowerCase() !== 'track') throw new Error('Album / playlist ka link nahi chalega. Ek *song* ka Spotify link ya naam bhejo.');
      let html = ''; try { const r = await fetch('https://open.spotify.com/track/' + sp[2], { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(12000) }); html = await r.text(); } catch (e) {}
      const title = unent((/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || ''), m = /^(.*?)\s+-\s+(?:song|single|track)[^|]*?\s+by\s+(.*?)\s*\|\s*Spotify/i.exec(title);
      if (m) return 'ytsearch1:' + (m[1] + ' ' + m[2]).replace(/\s+/g, ' ').slice(0, 120);
      const og = unent((/property="og:title"\s+content="([^"]*)"/i.exec(html) || [])[1] || ''); if (og) return 'ytsearch1:' + og.slice(0, 120);
      throw new Error('Spotify link se song ka naam nahi mila. Song ka *naam* likhkar bhejo.');
    }
    if (/https?:\/\//i.test(t)) return '';
    const name = t.replace(/\s+/g, ' ').trim(); if (name.length < 2 || name.length > 120) return '';
    return 'ytsearch1:' + name;
  }

  async function ensureBin() {
    if (env.YTDLP_BIN) return BIN;
    fs.mkdirSync(DIR, { recursive: true });
    try { if (Date.now() - fs.statSync(BIN).mtimeMs < 86400000) return BIN; } catch (e) {}
    if (!binP) binP = (async () => {
      let r = null, err = '';                                          // nightly build first (YouTube fixes land there days before the stable one), stable as a fallback
      for (const u of ['https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp_linux', 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux']) {
        try { r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(120000) }); if (r.ok) break; err = 'HTTP ' + r.status; } catch (e) { err = e && e.message; r = null; }
      }
      if (!r || !r.ok) throw new Error('yt-dlp download nahi hua (' + err + ')');
      const tmp = BIN + '.part'; fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer())); fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, BIN);
    })().finally(() => { binP = null; });
    try { await binP; } catch (e) { if (!fs.existsSync(BIN)) throw e; warn('yt-dlp update', e && e.message); }   // an older copy is still fine
    return BIN;
  }

  const VIDEO_Q = [360, 480, 720, 1080], AUDIO_Q = [64, 128, 192, 320];
  const qualities = kind => (kind === 'audio' ? AUDIO_Q : VIDEO_Q);
  const qLabel = (kind, q) => kind === 'audio' ? q + ' kbps' : q + 'p';

  let jsOk = true, ckCache = null;
  function args(kind, q, url, work, client, hasCk) {
    const a = ['--no-playlist', '--no-warnings', '--no-simulate', '--restrict-filenames', '--max-filesize', MAX_MB + 'M',
      '-o', path.join(work, '%(title).70B.%(ext)s'), '--print', 'after_move:filepath'];
    if (kind === 'audio') {
      if (ffmpeg) a.push('-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', q + 'K');
      else a.push('-f', 'bestaudio[ext=m4a]/bestaudio');
    } else if (ffmpeg) a.push('-f', 'bv*[height<=' + q + '][ext=mp4]+ba[ext=m4a]/bv*[height<=' + q + ']+ba/b[height<=' + q + ']/b', '--merge-output-format', 'mp4');
    else a.push('-f', 'b[height<=' + q + '][ext=mp4]/b[height<=' + q + ']/b[ext=mp4]/b');
    if (ffmpeg) a.push('--ffmpeg-location', ffmpeg);
    if (hasCk) a.push('--cookies', COOK);
    if (client) a.push('--extractor-args', 'youtube:player_client=' + client);
    if (jsOk) a.push('--js-runtimes', 'node:' + process.execPath);          // YouTube's signature puzzle needs a JavaScript engine - Node is already here
    if (env.DL_PROXY) a.push('--proxy', env.DL_PROXY);
    a.push('--newline', '--progress', '--progress-template', 'download:KSP %(progress.filename)s %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s');   // one line per update -> % bar
    a.push('--retries', '2', url);
    return a;
  }

  const nice = (msg, hasCk) => {
    msg = String(msg || '');
    if (/confirm you.?re not a bot|Sign in to confirm/i.test(msg)) return hasCk
      ? 'YouTube ne cookies bhi reject kar di (purani / expire ho gayi). *Incognito window* me YouTube login karo → cookies.txt export karo → turant window band karo → Menu → YouTube download → *3* se nayi cookies.txt bhejo.'
      : 'YouTube ne server ko bot samajh kar roka (bot check). Menu → YouTube download → *3* se cookies.txt bhejo.';
    if (/Private video|members-only|Sign in/i.test(msg)) return 'Ye video private / members-only hai.';
    if (/not available|unavailable|removed|copyright/i.test(msg)) return 'Ye video available nahi hai (hata diya gaya ya is desh me band hai).';
    if (/larger than max-filesize|File is larger/i.test(msg)) return 'File ' + MAX_MB + ' MB se badi hai. Kam quality chuno.';
    if (/Requested format is not available/i.test(msg)) return 'Ye quality is video me nahi hai. Kam quality chuno.';
    return msg.replace(/\s+/g, ' ').slice(0, 140) || 'Download fail ho gaya.';
  };

  /* ---------- cookies: sent by the admin in WhatsApp (kept in o.store) or taken from YT_COOKIES ---------- */
  const looksLikeCookies = t => { const rows = String(t).split('\n').filter(l => l.split('\t').length >= 7 && !l.startsWith('# ')); return rows.length >= 3 && /youtube\.com|google\.com/i.test(t); };
  async function cookies() {
    if (ckCache !== null) return ckCache;
    let t = ''; try { const b = o.store && await o.store.get(); if (b) t = zlib.gunzipSync(Buffer.from(b, 'base64')).toString('utf8'); } catch (e) { warn('YouTube cookies read', e && e.message); }
    if (!t && String(env.YT_COOKIES || '').trim()) t = String(env.YT_COOKIES).replace(/\\n/g, '\n');
    return (ckCache = t);
  }
  async function setCookies(text) {                                    // -> number of cookies saved; throws a readable error when the file is wrong
    const t = String(text || '').replace(/\r\n?/g, '\n').trim() + '\n';
    if (!looksLikeCookies(t)) throw new Error('Ye cookies.txt (Netscape format) nahi lag rahi, ya usme youtube.com / google.com ki cookies nahi hain.');
    const b = zlib.gzipSync(Buffer.from(t, 'utf8')).toString('base64');
    if (b.length > 45000) throw new Error('Cookies file bahut badi hai. Sirf youtube.com / google.com ki cookies export karo.');
    if (!o.store) throw new Error('Cookies save karne ki jagah nahi mili.');
    await o.store.set(b); ckCache = t;
    return t.split('\n').filter(l => l.split('\t').length >= 7 && !l.startsWith('# ')).length;
  }
  const hasCookies = async () => !!(await cookies());

  /* progress: yt-dlp prints "KSP <file> <done> <total> <estimate>" lines.  A video needs 2 downloads (video + audio) -> each counts half; the last few % are the joining / MP3 step. */
  function progressor(kind, cb) {
    let cur = '', stage = -1, best = 0; const stages = kind === 'video' && ffmpeg ? 2 : 1;
    return line => {
      const m = /^KSP (\S+) (\S+) (\S+) (\S+)\s*$/.exec(line); if (!m || !cb) return false;
      if (m[1] !== cur) { cur = m[1]; stage = Math.min(stage + 1, stages - 1); }
      const d = Number(m[2]), t = Number(m[3]) || Number(m[4]);
      if (d >= 0 && t > 0) { const f = Math.min(1, d / t), pct = Math.floor(((stage + f) / stages) * 95); if (pct > best) { best = pct; try { cb(pct); } catch (e) {} } }
      return true;
    };
  }
  function once(bin, kind, q, url, work, client, hasCk, onPct) {       // one yt-dlp run -> its output, or an Error (e.raw = what yt-dlp complained about)
    return new Promise((res, rej) => {
      const p = cp.spawn(bin, args(kind, q, url, work, client, hasCk), { stdio: ['ignore', 'pipe', 'pipe'] });
      const prog = progressor(kind, onPct); let so = '', se = '', buf = '';
      const kill = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} rej(new Error('Download bahut der laga raha tha, band kar diya.')); }, 12 * 60000);
      p.stdout.on('data', d => { buf += d; const L = buf.split('\n'); buf = L.pop(); L.forEach(l => { if (!prog(l)) so += l + '\n'; }); });
      p.stderr.on('data', d => { String(d).split('\n').forEach(l => prog(l)); se += d; if (se.length > 20000) se = se.slice(-20000); });
      p.on('error', e => { clearTimeout(kill); rej(e); });
      p.on('close', code => {
        clearTimeout(kill); if (buf && !prog(buf)) so += buf; if (code === 0) return res(so);
        const raw = se.split('\n').filter(x => /ERROR/i.test(x)).pop() || se, e = new Error(nice(raw, hasCk)); e.raw = raw; rej(e);
      });
    });
  }

  /* -> { file, name, size, dir }.  The caller sends the file and then calls done(dir). */
  async function run(kind, q, url, onPct) {
    if (busy) throw new Error('Ek download pehle se chal raha hai. Thodi der baad try karo.');
    busy = true;
    let work = '';
    try {
      const bin = await ensureBin(), ck = await cookies();
      fs.mkdirSync(DIR, { recursive: true }); work = fs.mkdtempSync(path.join(DIR, 'j-'));
      if (ck) fs.writeFileSync(COOK, ck);
      // default first, then other YouTube "devices". With cookies only the web-type clients can use them (android_vr / ios / tv ignore cookies and just fail).
      const clients = ck ? ['', 'web_safari', 'mweb', 'web_embedded', 'tv'] : ['', 'android_vr', 'tv', 'web_safari', 'mweb', 'web_embedded', 'ios'];
      const retry = raw => /not a bot|Sign in to confirm|does not support cookies|Requested format is not available|player response|Unsupported client|Failed to extract|HTTP Error 403|nsig/i.test(raw || '');
      let out = '', last = null;
      for (let i = 0; i < clients.length && !out; i++) {
        try {
          try { out = await once(bin, kind, q, url, work, clients[i], !!ck, onPct); }
          catch (e) { if (jsOk && /no such option.*js-runtimes|unrecognized arguments.*js-runtimes/i.test(e.raw || '')) { jsOk = false; out = await once(bin, kind, q, url, work, clients[i], !!ck, onPct); } else throw e; }
        } catch (e) { if (!retry(e.raw)) throw e; if (!last || /not a bot|Sign in to confirm/i.test(e.raw || '')) last = e; }   // a bot check / client problem is worth another client; keep the bot-check text as the reason
      }
      if (!out) throw last || new Error('Download fail ho gaya.');
      const file = out.split('\n').map(x => x.trim()).filter(Boolean).pop();
      if (!file || !fs.existsSync(file)) throw new Error('Download hua par file nahi mili.');
      return { file, name: path.basename(file), size: fs.statSync(file).size, dir: work };
    } catch (e) { if (work) done(work); throw e; }
    finally { busy = false; }
  }

  /* ---------- Instagram Reel / post video (same engine; Instagram often wants login cookies -> admin can send an Instagram cookies.txt) ---------- */
  const IG_COOK = path.join(DIR, 'cookies-ig.txt'); let igCk = null;
  function igLink(text) {                                              // the first Instagram reel / post / tv link in a message -> clean https link (no tracking query), or ''
    const m = String(text || '').match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/[\w-]{5,}/i);
    if (!m) return '';
    return (/^https?:\/\//i.test(m[0]) ? m[0] : 'https://' + m[0]).replace(/^http:/i, 'https:');
  }
  async function igCookies() {
    if (igCk !== null) return igCk;
    let t = ''; try { const b = o.storeIg && await o.storeIg.get(); if (b) t = zlib.gunzipSync(Buffer.from(b, 'base64')).toString('utf8'); } catch (e) { warn('Instagram cookies read', e && e.message); }
    if (!t && String(env.IG_COOKIES || '').trim()) t = String(env.IG_COOKIES).replace(/\\n/g, '\n');
    return (igCk = t);
  }
  async function setIgCookies(text) {
    const t = String(text || '').replace(/\r\n?/g, '\n').trim() + '\n';
    const rows = t.split('\n').filter(l => l.split('\t').length >= 7 && !l.startsWith('# '));
    if (rows.length < 3 || !/instagram\.com/i.test(t)) throw new Error('Ye cookies.txt (Netscape format) nahi lag rahi, ya usme instagram.com ki cookies nahi hain.');
    const b = zlib.gzipSync(Buffer.from(t, 'utf8')).toString('base64');
    if (b.length > 45000) throw new Error('Cookies file bahut badi hai. Sirf instagram.com ki cookies export karo.');
    if (!o.storeIg) throw new Error('Cookies save karne ki jagah nahi mili.');
    await o.storeIg.set(b); igCk = t; return rows.length;
  }
  const igNice = (msg, hasCk) => {
    msg = String(msg || '');
    if (/login required|rate-limit|empty media response|requested content is not available|Restricted Video|checkpoint|sign in/i.test(msg)) return hasCk
      ? 'Instagram ne cookies ke saath bhi roka (cookies expire ho gayi ya reel private hai). Admin se nayi Instagram cookies.txt dalwao (menu → Instagram → *3*).'
      : 'Instagram is reel ke liye login maang raha hai. Admin menu → Instagram Reel download → *3* se Instagram cookies.txt bhejo. (Private account ki reel nahi chalegi.)';
    if (/larger than max-filesize|File is larger/i.test(msg)) return 'File ' + MAX_MB + ' MB se badi hai.';
    if (/no video|There is no video|Unsupported URL/i.test(msg)) return 'Is link me video nahi mila. Reel / video post ka link bhejo.';
    if (/not available|unavailable|removed|404/i.test(msg)) return 'Ye reel available nahi hai (hata di gayi ya private hai).';
    return msg.replace(/\s+/g, ' ').slice(0, 140) || 'Download fail ho gaya.';
  };
  function igOnce(bin, url, work, hasCk, onPct) {
    return new Promise((res, rej) => {
      const a = ['--no-playlist', '--no-warnings', '--no-simulate', '--restrict-filenames', '--max-filesize', MAX_MB + 'M', '-o', path.join(work, '%(id)s.%(ext)s'), '--print', 'after_move:filepath'];
      if (ffmpeg) a.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4', '--ffmpeg-location', ffmpeg); else a.push('-f', 'b[ext=mp4]/b');
      if (hasCk) a.push('--cookies', IG_COOK);
      if (env.DL_PROXY) a.push('--proxy', env.DL_PROXY);
      a.push('--newline', '--progress', '--progress-template', 'download:KSP %(progress.filename)s %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s', '--retries', '2', url);
      const p = cp.spawn(bin, a, { stdio: ['ignore', 'pipe', 'pipe'] }), prog = progressor('video', onPct); let so = '', se = '', buf = '';
      const kill = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} rej(new Error('Download bahut der laga raha tha, band kar diya.')); }, 8 * 60000);
      p.stdout.on('data', d => { buf += d; const L = buf.split('\n'); buf = L.pop(); L.forEach(l => { if (!prog(l)) so += l + '\n'; }); });
      p.stderr.on('data', d => { String(d).split('\n').forEach(l => prog(l)); se += d; if (se.length > 20000) se = se.slice(-20000); });
      p.on('error', e => { clearTimeout(kill); rej(e); });
      p.on('close', code => { clearTimeout(kill); if (buf && !prog(buf)) so += buf; if (code === 0) return res(so); rej(new Error(igNice(se.split('\n').filter(x => /ERROR/i.test(x)).pop() || se, hasCk))); });
    });
  }
  async function runIg(url, onPct) {                                   // -> { file, name, size, dir }; caller sends it, then done(dir)
    if (busy) throw new Error('Ek download pehle se chal raha hai. Thodi der baad try karo.');
    busy = true; let work = '';
    try {
      const bin = await ensureBin(), ck = await igCookies();
      fs.mkdirSync(DIR, { recursive: true }); work = fs.mkdtempSync(path.join(DIR, 'j-'));
      if (ck) fs.writeFileSync(IG_COOK, ck);
      const out = await igOnce(bin, url, work, !!ck, onPct);
      const file = out.split('\n').map(x => x.trim()).filter(Boolean).pop();
      if (!file || !fs.existsSync(file)) throw new Error('Download hua par file nahi mili.');
      return { file, name: path.basename(file), size: fs.statSync(file).size, dir: work };
    } catch (e) { if (work) done(work); throw e; }
    finally { busy = false; }
  }
  function done(dir) { try { if (dir && dir.startsWith(DIR)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

  return { link, resolve, run, done, igLink, runIg, setIgCookies, qualities, qLabel, setCookies, hasCookies, maxMb: MAX_MB, hasFfmpeg: !!ffmpeg };
};
