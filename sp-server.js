'use strict';
/* KS · Music tab (server side): search + trending for the Spotify-style Music tab.
   - If SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are set (free, from developer.spotify.com/dashboard), results come from Spotify
     (songs, albums, playlists, new releases). Tapping one plays it through Spotify's official embed player.
   - Without those keys (or if Spotify refuses) it falls back to Apple's public iTunes catalogue (no key needed):
     search + trending charts, with 30-second previews and cover art.  Nothing is downloaded or stored. */
module.exports = function makeMusic(o) {
  const { env, warn } = o;
  const ACTIONS = new Set(['spHome', 'spSearch']);
  const CC = String(env.MUSIC_COUNTRY || 'IN').toUpperCase().slice(0, 2);
  const authUid = t => { const u = globalThis.checkToken_(t); if (!u) globalThis.fail_('Session expired. Please log in again.', 'AUTH'); return u; };
  const hasSp = () => !!(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET);
  const J = async (url, opt) => { const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(12000) }, opt || {})); if (!r.ok) throw new Error(url.split('?')[0] + ' ' + r.status); return r.json(); };
  const big = u => String(u || '').replace(/\/\d+x\d+(bb)?\./, '/400x400bb.');

  let tok = null, tokExp = 0;
  async function spTok() {
    if (tok && Date.now() < tokExp) return tok;
    const j = await J('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(env.SPOTIFY_CLIENT_ID + ':' + env.SPOTIFY_CLIENT_SECRET).toString('base64') }, body: 'grant_type=client_credentials' });
    tok = j.access_token; tokExp = Date.now() + (j.expires_in - 60) * 1000; return tok;
  }
  const sp = async p => J('https://api.spotify.com/v1' + p, { headers: { Authorization: 'Bearer ' + await spTok() } });
  const img = a => (a && a[0] && a[0].url) || '';
  const spTrack = t => t && t.id && { kind: 'track', src: 'sp', id: t.id, uri: 'spotify:track:' + t.id, title: t.name, sub: (t.artists || []).map(a => a.name).join(', '), img: img(t.album && t.album.images) };
  const spAlbum = a => a && a.id && { kind: 'album', src: 'sp', id: a.id, uri: 'spotify:album:' + a.id, title: a.name, sub: (a.artists || []).map(x => x.name).join(', '), img: img(a.images) };
  const spList = p => p && p.id && { kind: 'playlist', src: 'sp', id: p.id, uri: 'spotify:playlist:' + p.id, title: p.name, sub: (p.owner && p.owner.display_name) || 'Playlist', img: img(p.images) };
  const clean = a => a.filter(Boolean);

  const itTrack = t => t && t.trackId && t.previewUrl && { kind: 'track', src: 'it', id: String(t.trackId), preview: t.previewUrl, title: t.trackName, sub: t.artistName, img: big(t.artworkUrl100) };
  async function itSearch(q, n) { const j = await J('https://itunes.apple.com/search?media=music&entity=song&country=' + CC + '&limit=' + n + '&term=' + encodeURIComponent(q)); return clean((j.results || []).map(itTrack)); }
  async function itChart() {
    try {
      const j = await J('https://rss.applemarketingtools.com/api/v2/' + CC.toLowerCase() + '/music/most-played/25/songs.json');
      const ids = (j.feed.results || []).map(r => r.id).join(',');
      if (ids) { const l = await J('https://itunes.apple.com/lookup?country=' + CC + '&id=' + ids); const by = {}; (l.results || []).forEach(t => { by[String(t.trackId)] = t; });
        const out = clean((j.feed.results || []).map(r => itTrack(by[String(r.id)]))); if (out.length) return out; }
    } catch (e) { warn('Music chart', e && e.message); }
    return itSearch('top hits', 25);
  }

  async function home() {
    if (hasSp()) {
      try {
        const [nr, pl1, pl2, pl3] = await Promise.all([
          sp('/browse/new-releases?country=' + CC + '&limit=12').catch(() => null),
          sp('/search?type=playlist&limit=10&market=' + CC + '&q=' + encodeURIComponent('Top Hits Hindi')),
          sp('/search?type=playlist&limit=10&market=' + CC + '&q=' + encodeURIComponent('Bollywood')),
          sp('/search?type=playlist&limit=10&market=' + CC + '&q=' + encodeURIComponent('Punjabi'))]);
        const shelves = [
          { title: 'Trending playlists', items: clean(pl1.playlists.items.map(spList)) },
          { title: 'Bollywood', items: clean(pl2.playlists.items.map(spList)) },
          { title: 'Punjabi', items: clean(pl3.playlists.items.map(spList)) }];
        if (nr && nr.albums) shelves.unshift({ title: 'New releases', items: clean(nr.albums.items.map(spAlbum)) });
        const ok = shelves.filter(s => s.items.length); if (ok.length) return { ok: true, source: 'spotify', shelves: ok };
      } catch (e) { warn('Spotify home failed, using iTunes', e && e.message); }
    }
    const [c, h, p] = await Promise.all([itChart(), itSearch('bollywood hits', 20).catch(() => []), itSearch('punjabi hits', 20).catch(() => [])]);
    return { ok: true, source: 'preview', shelves: [{ title: 'Trending now', items: c }, { title: 'Bollywood', items: h }, { title: 'Punjabi', items: p }].filter(s => s.items.length) };
  }
  async function search(q) {
    q = String(q || '').trim().slice(0, 100); if (!q) return { ok: true, source: 'none', shelves: [] };
    if (hasSp()) {
      try {
        const j = await sp('/search?type=track,album,playlist&limit=10&market=' + CC + '&q=' + encodeURIComponent(q));
        const shelves = [
          { title: 'Songs', items: clean(((j.tracks || {}).items || []).map(spTrack)) },
          { title: 'Albums', items: clean(((j.albums || {}).items || []).map(spAlbum)) },
          { title: 'Playlists', items: clean(((j.playlists || {}).items || []).map(spList)) }].filter(s => s.items.length);
        if (shelves.length) return { ok: true, source: 'spotify', shelves };
      } catch (e) { warn('Spotify search failed, using iTunes', e && e.message); }
    }
    const items = await itSearch(q, 30);
    return { ok: true, source: 'preview', shelves: items.length ? [{ title: 'Songs', items }] : [] };
  }
  async function route(req) {
    authUid(req.token);
    if (req.action === 'spHome') return home();
    if (req.action === 'spSearch') return search(req.q);
    return { ok: false, error: 'Unknown action' };
  }
  return { actions: ACTIONS, route };
};
