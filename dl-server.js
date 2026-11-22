'use strict';
/* YouTube video / audio downloader used by the WhatsApp helper bot (menu: "YouTube Video / Audio download").
   Engine: yt-dlp (a standalone program, downloaded once to the server's temp folder and refreshed every 3 days).
   ffmpeg comes from the "ffmpeg-static" package (needed to join video+audio and to make MP3); without it only ready-made MP4 / M4A files are possible.
   Env (all optional):  DL_MAX_MB (default 90)  ·  YTDLP_BIN (path of your own yt-dlp)  ·  YT_COOKIES (cookies.txt text, helps when YouTube blocks the server)  */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

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

  async function ensureBin() {
    if (env.YTDLP_BIN) return BIN;
    fs.mkdirSync(DIR, { recursive: true });
    try { if (Date.now() - fs.statSync(BIN).mtimeMs < 3 * 86400000) return BIN; } catch (e) {}
    if (!binP) binP = (async () => {
      const r = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux', { redirect: 'follow', signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error('yt-dlp download nahi hua (HTTP ' + r.status + ')');
      const tmp = BIN + '.part'; fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer())); fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, BIN);
    })().finally(() => { binP = null; });
    try { await binP; } catch (e) { if (!fs.existsSync(BIN)) throw e; warn('yt-dlp update', e && e.message); }   // an older copy is still fine
    return BIN;
  }

  const VIDEO_Q = [360, 480, 720, 1080], AUDIO_Q = [64, 128, 192, 320];
  const qualities = kind => (kind === 'audio' ? AUDIO_Q : VIDEO_Q);
  const qLabel = (kind, q) => kind === 'audio' ? q + ' kbps' : q + 'p';

  function args(kind, q, url, work) {
    const a = ['--no-playlist', '--no-warnings', '--no-simulate', '--restrict-filenames', '--max-filesize', MAX_MB + 'M',
      '-o', path.join(work, '%(title).70B.%(ext)s'), '--print', 'after_move:filepath'];
    if (kind === 'audio') {
      if (ffmpeg) a.push('-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', q + 'K');
      else a.push('-f', 'bestaudio[ext=m4a]/bestaudio');
    } else if (ffmpeg) a.push('-f', 'bv*[height<=' + q + '][ext=mp4]+ba[ext=m4a]/bv*[height<=' + q + ']+ba/b[height<=' + q + ']/b', '--merge-output-format', 'mp4');
    else a.push('-f', 'b[height<=' + q + '][ext=mp4]/b[height<=' + q + ']/b[ext=mp4]/b');
    if (ffmpeg) a.push('--ffmpeg-location', ffmpeg);
    if (String(env.YT_COOKIES || '').trim()) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(COOK, String(env.YT_COOKIES).replace(/\\n/g, '\n')); a.push('--cookies', COOK); }
    a.push(url);
    return a;
  }

  const nice = msg => {
    msg = String(msg || '');
    if (/confirm you.?re not a bot|Sign in to confirm/i.test(msg)) return 'YouTube ne server ko bot samajh kar roka (bot check). Server par YT_COOKIES set karna padega.';
    if (/Private video|members-only|Sign in/i.test(msg)) return 'Ye video private / members-only hai.';
    if (/not available|unavailable|removed|copyright/i.test(msg)) return 'Ye video available nahi hai (hata diya gaya ya is desh me band hai).';
    if (/larger than max-filesize|File is larger/i.test(msg)) return 'File ' + MAX_MB + ' MB se badi hai. Kam quality chuno.';
    if (/Requested format is not available/i.test(msg)) return 'Ye quality is video me nahi hai. Kam quality chuno.';
    return msg.replace(/\s+/g, ' ').slice(0, 140) || 'Download fail ho gaya.';
  };

  /* -> { file, name, size, dir }.  The caller sends the file and then calls done(dir). */
  async function run(kind, q, url) {
    if (busy) throw new Error('Ek download pehle se chal raha hai. Thodi der baad try karo.');
    busy = true;
    let work = '';
    try {
      const bin = await ensureBin();
      fs.mkdirSync(DIR, { recursive: true }); work = fs.mkdtempSync(path.join(DIR, 'j-'));
      const out = await new Promise((res, rej) => {
        const p = cp.spawn(bin, args(kind, q, url, work), { stdio: ['ignore', 'pipe', 'pipe'] });
        let so = '', se = '';
        const kill = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} rej(new Error('Download bahut der laga raha tha, band kar diya.')); }, 12 * 60000);
        p.stdout.on('data', d => { so += d; }); p.stderr.on('data', d => { se += d; if (se.length > 20000) se = se.slice(-20000); });
        p.on('error', e => { clearTimeout(kill); rej(e); });
        p.on('close', code => { clearTimeout(kill); code === 0 ? res(so) : rej(new Error(nice(se.split('\n').filter(x => /ERROR/i.test(x)).pop() || se))); });
      });
      const file = out.split('\n').map(x => x.trim()).filter(Boolean).pop();
      if (!file || !fs.existsSync(file)) throw new Error('Download hua par file nahi mili.');
      return { file, name: path.basename(file), size: fs.statSync(file).size, dir: work };
    } catch (e) { if (work) done(work); throw e; }
    finally { busy = false; }
  }
  function done(dir) { try { if (dir && dir.startsWith(DIR)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

  return { link, run, done, qualities, qLabel, maxMb: MAX_MB, hasFfmpeg: !!ffmpeg };
};
