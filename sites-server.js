
'use strict';
// Websites tab: each user's list of website shortcuts, kept in the Google Sheet (the Settings sheet's properties), so every phone sees the same list.
module.exports = function ({ warn, withWb }) {
  const P = () => globalThis.PropertiesService.getScriptProperties();
  const ACTIONS = new Set(['websitesGet', 'websitesSave']);
  const keyOf = uid => 'WEBSITES_' + uid;
  const read = uid => { try { const a = JSON.parse(P().getProperty(keyOf(uid)) || 'null'); return a && Array.isArray(a.list) ? a : { list: [], at: 0 }; } catch (e) { return { list: [], at: 0 }; } };
  const clean = list => (Array.isArray(list) ? list : []).slice(0, 300).map(x => ({ name: String((x && x.name) || '').slice(0, 120), url: String((x && x.url) || '').slice(0, 600) }))
    .filter(x => x.name && /^https?:\/\//i.test(x.url));
  async function route(req) {
    const uid = globalThis.checkToken_(req.token);
    if (!uid) globalThis.fail_('Session expired. Please log in again.', 'AUTH');
    if (req.action === 'websitesGet') { const d = read(uid); return { ok: true, list: d.list, at: d.at }; }
    const list = clean(req.list), at = Date.now(), txt = JSON.stringify({ list, at });
    if (txt.length > 45000) globalThis.fail_('The website list is too long to save.', 'SITES');
    await withWb(() => { P().setProperty(keyOf(uid), txt); return true; });
    return { ok: true, list, at };
  }
  return { actions: ACTIONS, route };
};
