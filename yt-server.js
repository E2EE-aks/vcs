'use strict';
/* KS · YouTube tab (server side): search, trending and "up next" suggestions through the official YouTube Data API v3.
   Env: YT_API_KEY (needed), YT_CLIENT_ID (Google OAuth Web client id - only for the "Sign in with Google" button),
        MUSIC_COUNTRY (default IN).  Results are cached so the daily free quota (10,000 units; a search costs 100) lasts.
   Playback happens in the browser through YouTube's own embedded player. Nothing is downloaded or stored. */
module.exports = function makeYouTube(o) {
  const { env, warn } = o;
  const ACTIONS = new Set(['ytConfig', 'ytHome', 'ytSearch', 'ytRelated']);
  const CC = String(env.MUSIC_COUNTRY || 'IN').toUpperCase().slice(0, 2);
  const KEY = env.YT_API_KEY || '';
  const authUid = t => { const u = globalThis.checkToken_(t); if (!u) globalThis.fail_('Session expired. Please log in again.', 'AUTH'); return u; };
  const cache = new Map();
  const memo = async (k, ttl, fn) => { const c = cache.get(k); if (c && c.t > Date.now()) return c.v; const v = await fn(); cache.set(k, { t: Date.now() + ttl, v }); if (cache.size > 300) cache.delete(cache.keys().next().value); return v; };
  const Y = async (p, q) => {
    const u = new URL('https://www.googleapis.com/youtube/v3/' + p); Object.keys(q).forEach(k => u.searchParams.set(k, q[k])); u.searchParams.set('key', KEY);
    const r = await fetch(u, { signal: AbortSignal.timeout(12000) }); const j = await r.json().catch(() => ({}));
    if (!r.ok) { const m = (j.error && j.error.message) || ('YouTube error ' + r.status); const e = new Error(/quota/i.test(m) ? 'YouTube ka aaj ka free quota khatam ho gaya. Kal dobara chalega.' : m); throw e; }
    return j;
  };
  const dur = iso => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || ''); if (!m) return ''; const h = +m[1] || 0, mi = +m[2] || 0, s = +m[3] || 0; return (h ? h + ':' + String(mi).padStart(2, '0') : mi) + ':' + String(s).padStart(2, '0'); };
  const short = n => { n = Number(n); if (!isFinite(n)) return ''; return n >= 1e7 ? (n / 1e7).toFixed(1).replace('.0', '') + ' Cr' : n >= 1e5 ? (n / 1e5).toFixed(1).replace('.0', '') + ' L' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'K' : String(n); };
  const ago = d => { const s = (Date.now() - new Date(d)) / 1000; if (!(s > 0)) return ''; const u = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]; for (const [n, w] of u) if (s >= n) { const v = Math.floor(s / n); return v + ' ' + w + (v > 1 ? 's' : '') + ' ago'; } return 'just now'; };
  const item = v => v && v.id && v.snippet && {
    id: typeof v.id === 'string' ? v.id : v.id.videoId, title: v.snippet.title, ch: v.snippet.channelTitle,
    img: (v.snippet.thumbnails && ((v.snippet.thumbnails.medium || v.snippet.thumbnails.high || v.snippet.thumbnails.default) || {}).url) || '',
    dur: v.contentDetails ? dur(v.contentDetails.duration) : '', views: v.statistics && v.statistics.viewCount ? short(v.statistics.viewCount) + ' views' : '', ago: ago(v.snippet.publishedAt)
  };
  const clean = a => a.filter(x => x && x.id);
  async function enrich(ids) {
    if (!ids.length) return [];
    const j = await Y('videos', { part: 'snippet,contentDetails,statistics', id: ids.join(','), maxResults: 50 });
    const by = {}; (j.items || []).forEach(v => { by[v.id] = v; });
    return clean(ids.map(i => by[i] && item(by[i])));
  }
  async function popular(cat) {
    const q = { part: 'snippet,contentDetails,statistics', chart: 'mostPopular', regionCode: CC, maxResults: 20 }; if (cat) q.videoCategoryId = cat;
    return clean(((await Y('videos', q)).items || []).map(item));
  }
  async function search(q, extra) {
    const j = await Y('search', Object.assign({ part: 'snippet', type: 'video', maxResults: 20, regionCode: CC, safeSearch: 'moderate', q }, extra || {}));
    return enrich(clean((j.items || []).map(x => ({ id: x.id && x.id.videoId }))).map(x => x.id));
  }
  async function route(req) {
    authUid(req.token);
    if (req.action === 'ytConfig') return { ok: true, hasKey: !!KEY, clientId: env.YT_CLIENT_ID || '' };
    if (!KEY) return { ok: false, code: 'YT_NOKEY', error: 'YouTube API key abhi server me nahi lagi hai.' };
    try {
      if (req.action === 'ytHome') {
        const [t, m] = await Promise.all([memo('pop', 1800000, () => popular('')), memo('pop10', 1800000, () => popular('10'))]);
        return { ok: true, shelves: [{ title: 'Trending', items: t }, { title: 'Trending music', items: m }].filter(s => s.items.length) };
      }
      if (req.action === 'ytSearch') {
        const q = String(req.q || '').trim().slice(0, 100); if (!q) return { ok: true, items: [] };
        return { ok: true, items: await memo('s:' + q.toLowerCase(), 1800000, () => search(q)) };
      }
      if (req.action === 'ytRelated') {
        const id = String(req.id || '').replace(/[^\w-]/g, '').slice(0, 20);
        const t = String(req.title || '').replace(/\(.*?\)|\[.*?\]|official|video|lyrical|lyrics|full song|hd|4k/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
        const q = (t + ' ' + String(req.ch || '').slice(0, 40)).trim(); if (!q) return { ok: true, items: [] };
        const items = await memo('r:' + id, 21600000, () => search(q));
        return { ok: true, items: items.filter(x => x.id !== id).slice(0, 15) };
      }
    } catch (e) { warn('YouTube', e && e.message); return { ok: false, error: e.message }; }
    return { ok: false, error: 'Unknown action' };
  }
  return { actions: ACTIONS, route };
};
