'use strict';
/* Network Tools (More › Network Tools): Ping · Traceroute · DNS · WHOIS · Uptime monitor.
   Speed test runs in the browser (nettools-view.js) because it must measure the phone's own connection.
   Safety: every target is validated, internal/private addresses are blocked, commands run without a shell,
   and each user is rate-limited. */
const dns = require('dns'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');
const { domainToASCII } = require('url');

module.exports = function ({ warn, withWb, push }) {
  const P = () => globalThis.PropertiesService.getScriptProperties();
  const fail = (m, c) => globalThis.fail_(m, c || 'NET');
  const ACTIONS = new Set(['netPing', 'netTraceStart', 'netTracePoll', 'netTraceStop', 'netDns', 'netWhois',
    'monList', 'monAdd', 'monDel', 'monCheck']);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const withTimeout = (p, ms, dflt) => Promise.race([p, sleep(ms).then(() => dflt)]);

  /* ---------- per-user rate limit ---------- */
  const hits = new Map();
  function rate(uid, key, max) {
    const k = uid + '|' + key, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < 60000);
    if (a.length >= max) fail('Too many requests. Please wait a minute and try again.', 'RATE');
    a.push(now); hits.set(k, a);
  }
  { const t = setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(x => now - x < 60000)) hits.delete(k); }, 120000); if (t.unref) t.unref(); }

  /* ---------- target validation ---------- */
  function cleanHost(x) {
    let s = String(x || '').trim();
    if (!s) fail('Enter a host name or IP address.');
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[\/?#]/)[0].replace(/^[^@]*@/, '');
    if (s[0] === '[') s = s.slice(1, Math.max(1, s.indexOf(']')));
    else if (/^[^:]+:\d+$/.test(s)) s = s.split(':')[0];
    s = s.replace(/\.$/, '').toLowerCase();
    if (net.isIP(s)) return s;
    const a = domainToASCII(s);
    if (!a || a.length > 253 || !/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/.test(a)) fail('That is not a valid host name or IP address.');
    return a;
  }
  function privIp(ip) {
    ip = String(ip || '').toLowerCase();
    if (ip.startsWith('::ffff:') && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
    if (net.isIPv4(ip)) {
      const [a, b, c] = ip.split('.').map(Number);
      return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19));
    }
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
  }
  async function target(host) {
    const h = cleanHost(host);
    if (net.isIP(h)) { if (privIp(h)) fail('Private / internal addresses are blocked.', 'BLOCKED'); return { host: h, ip: h }; }
    let all;
    try { all = await withTimeout(dns.promises.lookup(h, { all: true }), 6000, null); } catch (e) { fail('Could not find “' + h + '” (DNS lookup failed).', 'DNS'); }
    if (!all || !all.length) fail('Could not find “' + h + '” (DNS lookup failed).', 'DNS');
    if (all.some(a => privIp(a.address))) fail('That name points to a private / internal address, which is blocked.', 'BLOCKED');
    const v4 = all.find(a => a.family === 4) || all[0];
    return { host: h, ip: v4.address };
  }

  /* ---------- run a command (no shell) ---------- */
  function exec(cmd, args, ms, onLine, onProc) {
    return new Promise((resolve, reject) => {
      let p, out = '', err = '', buf = '', dead = false;
      try { p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return reject(e); }
      if (onProc) onProc(p);
      const kill = setTimeout(() => { dead = true; try { p.kill('SIGKILL'); } catch (e) { /* gone */ } }, ms);
      p.stdout.on('data', d => {
        out += d; if (out.length > 200000) out = out.slice(-200000);
        if (onLine) { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { onLine(l); } catch (e) { /* ignore */ } } }
      });
      p.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-20000); });
      p.on('error', e => { clearTimeout(kill); reject(e); });
      p.on('close', code => { clearTimeout(kill); if (onLine && buf) { try { onLine(buf); } catch (e) { /* ignore */ } } resolve({ out, err, code, timedOut: dead }); });
    });
  }

  /* ---------- TCP helpers (used by ping fallback and the uptime monitor) ---------- */
  function tcpTime(ip, port, ms, refusedOk) {
    return new Promise(resolve => {
      const t0 = process.hrtime.bigint(); let done = false;
      const s = net.connect({ host: ip, port });
      const fin = (ok, why) => { if (done) return; done = true; try { s.destroy(); } catch (e) { /* ignore */ } resolve({ ok, ms: Number(process.hrtime.bigint() - t0) / 1e6, why: why || '' }); };
      s.setTimeout(ms, () => fin(false, 'timeout'));
      s.on('connect', () => fin(true));
      s.on('error', e => fin(!!refusedOk && e.code === 'ECONNREFUSED', e.code || 'error'));
    });
  }

  /* ================= PING ================= */
  const stat = a => a.length ? { min: Math.min(...a), avg: a.reduce((x, y) => x + y, 0) / a.length, max: Math.max(...a) } : { min: null, avg: null, max: null };
  const r2 = n => n == null ? null : Math.round(n * 100) / 100;
  async function ping(host) {
    const t = await target(host), res = { ok: true, host: t.host, ip: t.ip, sent: 4, method: 'icmp', replies: [] };
    let done = false;
    try {
      const r = await exec('ping', ['-c', '4', '-W', '2', '-n', t.ip], 15000);
      const lines = r.out.split('\n'), times = [];
      lines.forEach(l => { const m = /icmp_seq=(\d+).*time[=<]([\d.]+)\s*ms/i.exec(l) || /seq=(\d+).*time[=<]([\d.]+)\s*ms/i.exec(l); if (m) times[Math.max(0, +m[1] - 1)] = +m[2]; });
      const got = times.filter(x => x != null);
      if (got.length || /packets transmitted|packet loss/i.test(r.out)) {
        for (let i = 0; i < 4; i++) res.replies.push(times[i] == null ? null : r2(times[i]));
        done = true;
      }
    } catch (e) { if (e.code !== 'ENOENT') warn('ping', e && e.message); }
    if (!done) {                                   // no ping program on this server: measure with TCP connects instead
      res.method = 'tcp';
      let port = 443;
      for (let i = 0; i < 4; i++) {
        let r = await tcpTime(t.ip, port, 2500, true);
        if (!r.ok && i === 0 && port === 443) { port = 80; r = await tcpTime(t.ip, port, 2500, true); }
        res.replies.push(r.ok ? r2(r.ms) : null); if (i < 3) await sleep(250);
      }
      res.port = port;
    }
    const got = res.replies.filter(x => x != null), s = stat(got);
    res.received = got.length; res.loss = Math.round((4 - got.length) / 4 * 100);
    res.min = r2(s.min); res.avg = r2(s.avg); res.max = r2(s.max);
    res.jitter = got.length > 1 ? r2(got.slice(1).reduce((a, x, i) => a + Math.abs(x - got[i]), 0) / (got.length - 1)) : null;
    return res;
  }

  /* ================= enrichment: reverse DNS + country / ISP of every hop ================= */
  const geoC = new Map(), rdnsC = new Map(); let geoCool = 0;
  async function geoFill(ips) {
    const need = ips.filter(ip => !geoC.has(ip));
    need.filter(privIp).forEach(ip => geoC.set(ip, { priv: true }));
    const pub = need.filter(ip => !privIp(ip)).slice(0, 100);
    if (!pub.length || Date.now() < geoCool) return;
    try {
      const r = await fetch('http://ip-api.com/batch?fields=status,country,countryCode,regionName,city,isp,org,as,lat,lon,query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pub), signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error('geo ' + r.status);
      const j = await r.json();
      (Array.isArray(j) ? j : []).forEach(x => {
        if (x && x.query) geoC.set(x.query, x.status === 'success' ? { cc: x.countryCode, country: x.country, region: x.regionName, city: x.city, isp: x.isp || x.org, as: x.as, lat: x.lat, lon: x.lon } : {});
      });
    } catch (e) { geoCool = Date.now() + 30000; }
  }
  async function rdnsFill(ips) {
    await Promise.all(ips.filter(ip => !rdnsC.has(ip) && !privIp(ip)).map(async ip => {
      const n = await withTimeout(dns.promises.reverse(ip).then(a => a[0] || '', () => ''), 1500, null);
      if (n !== null) rdnsC.set(ip, n);
    }));
  }
  async function enrich(ips) { ips = [...new Set(ips)]; await Promise.all([geoFill(ips), rdnsFill(ips)]); }
  const node = ip => Object.assign({ ip, host: rdnsC.get(ip) || '' }, geoC.get(ip) || {});

  /* ================= TRACEROUTE ================= */
  const jobs = new Map();
  const IPRE = /(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]*:[0-9a-f:]+/gi;
  function mergeHop(job, n, ips, rtts, lost, flag, ptr) {
    let h = job.hops.find(x => x.n === n);
    if (!h) { h = { n, ips: [], rtts: [], lost: 0, flag: '', ptr: '' }; job.hops.push(h); job.hops.sort((a, b) => a.n - b.n); }
    ips.forEach(ip => { if (!h.ips.includes(ip)) h.ips.push(ip); });
    h.rtts.push(...rtts); h.lost += lost; if (flag) h.flag = flag; if (ptr) h.ptr = ptr;
  }
  function onTraceLine(job, line) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    const body = m ? m[2] : line;
    const ips = [...new Set((body.match(IPRE) || []).filter(x => net.isIP(x)))];
    const rtts = [...body.matchAll(/([\d.]+)\s*ms/g)].map(x => +x[1]);
    const lost = (body.match(/\*/g) || []).length, flag = (/\s(![A-Z]\d*)/.exec(body) || [])[1] || '';
    if (m) { job.last = +m[1]; mergeHop(job, +m[1], ips, rtts, lost, flag); }
    else if (job.last && (ips.length || rtts.length)) mergeHop(job, job.last, ips, rtts, lost, flag);   // continuation line of the same hop
  }
  function onTracepathLine(job, line) {
    const m = /^\s*(\d+)[?:]*\s+(.*)$/.exec(line); if (!m) return;
    const n = +m[1], body = m[2];
    if (/\[LOCALHOST\]|pmtu|Resume/i.test(body) && !/ms/.test(body)) return;
    const ips = [...new Set((body.match(IPRE) || []).filter(x => net.isIP(x)))];
    const rtts = [...body.matchAll(/([\d.]+)\s*ms/g)].map(x => +x[1]);
    if (/no reply/i.test(body)) return mergeHop(job, n, [], [], 1, '');
    mergeHop(job, n, ips, rtts, 0, '');
  }
  async function traceViaApi(job) {                // last resort when the server has neither traceroute nor tracepath
    job.method = 'mtr (online fallback)';
    const r = await fetch('https://api.hackertarget.com/mtr/?q=' + encodeURIComponent(job.ip), { signal: AbortSignal.timeout(45000) });
    const txt = await r.text();
    if (/error|limit|exceeded/i.test(txt) && !/\|--/.test(txt)) throw new Error('The online trace service said: ' + txt.trim().slice(0, 140));
    txt.split('\n').forEach(l => {
      const m = /^\s*(\d+)\.\|--\s+(\S+)\s+([\d.]+)%?\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(l); if (!m) return;
      const n = +m[1], host = m[2], loss = +m[3], avg = +m[6];
      if (host === '???' || loss >= 100) return mergeHop(job, n, [], [], 3, '');
      mergeHop(job, n, net.isIP(host) ? [host] : [], [avg], 0, '', net.isIP(host) ? '' : host);
    });
    if (!job.hops.length) throw new Error('The online trace service returned no hops.');
  }
  async function runTrace(job) {
    const v6 = net.isIPv6(job.ip);
    try {
      job.method = 'traceroute';
      const r = await exec('traceroute', [v6 ? '-6' : '-4', '-n', '-q', '3', '-w', '2', '-m', '30', job.ip], 70000, l => onTraceLine(job, l), p => { job.proc = p; });
      job.proc = null; if (r.timedOut) job.err = 'Stopped: the trace took too long.';
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      try {
        job.method = 'tracepath';
        await exec('tracepath', [v6 ? '-6' : '-4', '-n', '-m', '30', job.ip], 70000, l => onTracepathLine(job, l), p => { job.proc = p; });
      } catch (e2) {
        if (e2.code !== 'ENOENT') throw e2;
        await traceViaApi(job);
      }
    }
  }
  async function traceStart(uid, host) {
    rate(uid, 'trace', 8);
    const mine = [...jobs.values()].filter(j => !j.done && j.uid === uid).length, all = [...jobs.values()].filter(j => !j.done).length;
    if (mine >= 2 || all >= 8) fail('A trace is already running. Wait for it to finish or stop it.', 'BUSY');
    const t = await target(host), id = crypto.randomBytes(6).toString('hex');
    const job = { id, uid, host: t.host, ip: t.ip, hops: [], done: false, err: '', method: '', last: 0, started: Date.now(), polled: Date.now() };
    jobs.set(id, job);
    runTrace(job).catch(e => { job.err = (e && e.message) || 'Trace failed'; }).then(() => { job.done = true; job.ended = Date.now(); });
    return { ok: true, id, host: t.host, ip: t.ip };
  }
  async function tracePoll(uid, id) {
    const job = jobs.get(String(id || ''));
    if (!job || job.uid !== uid) fail('This trace has expired. Start it again.', 'NET');
    job.polled = Date.now();
    const ips = job.hops.flatMap(h => h.ips);
    await withTimeout(enrich(ips), 2500, null);
    const hops = job.hops.map(h => {
      const ok = h.rtts.filter(x => x != null);
      const nodes = h.ips.map(node); if (!nodes.length && h.ptr) nodes.push({ ip: '', host: h.ptr });
      return { n: h.n, nodes, lost: h.lost, flag: h.flag, min: r2(ok.length ? Math.min(...ok) : null), avg: r2(ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null), max: r2(ok.length ? Math.max(...ok) : null), timeout: !h.ips.length && !h.ptr };
    });
    const reached = job.hops.some(h => h.ips.includes(job.ip));
    return { ok: true, id: job.id, host: job.host, ip: job.ip, hops, done: job.done, reached, method: job.method, error: job.err, secs: Math.round(((job.ended || Date.now()) - job.started) / 100) / 10 };
  }
  function traceStop(uid, id) {
    const job = jobs.get(String(id || ''));
    if (job && job.uid === uid && !job.done) { job.err = 'Stopped.'; try { if (job.proc) job.proc.kill('SIGKILL'); } catch (e) { /* ignore */ } job.done = true; }
    return { ok: true };
  }
  { const t = setInterval(() => {
    const now = Date.now();
    for (const [id, j] of jobs) {
      if (!j.done && now - j.polled > 90000) { j.done = true; j.err = 'Stopped (screen closed).'; try { if (j.proc) j.proc.kill('SIGKILL'); } catch (e) { /* ignore */ } }
      if (now - (j.ended || j.started) > 600000) jobs.delete(id);
    }
  }, 30000); if (t.unref) t.unref(); }

  /* ================= DNS LOOKUP ================= */
  const SERVERS = { system: null, google: ['8.8.8.8', '8.8.4.4'], cloudflare: ['1.1.1.1', '1.0.0.1'], quad9: ['9.9.9.9'] };
  const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];
  async function dnsLookup(name, types, server) {
    const q = cleanHost(name);
    const rs = new dns.promises.Resolver({ timeout: 3500, tries: 1 });
    const sv = SERVERS[server]; if (sv) rs.setServers(sv);
    const t0 = Date.now();
    if (net.isIP(q)) {
      const names = await rs.reverse(q).catch(() => []);
      return { ok: true, query: q, server: server || 'system', ms: Date.now() - t0, records: names.length ? [{ type: 'PTR', items: names.map(v => ({ v })) }] : [], note: names.length ? '' : 'No reverse DNS (PTR) record for this IP.' };
    }
    const want = (Array.isArray(types) && types.length ? types : DNS_TYPES).filter(x => DNS_TYPES.includes(x));
    let nx = false; const records = [];
    await Promise.all(want.map(async ty => {
      try {
        let items = [];
        if (ty === 'A') items = (await rs.resolve4(q, { ttl: true })).map(x => ({ v: x.address, ttl: x.ttl }));
        else if (ty === 'AAAA') items = (await rs.resolve6(q, { ttl: true })).map(x => ({ v: x.address, ttl: x.ttl }));
        else if (ty === 'CNAME') items = (await rs.resolveCname(q)).map(v => ({ v }));
        else if (ty === 'MX') items = (await rs.resolveMx(q)).sort((a, b) => a.priority - b.priority).map(x => ({ v: x.priority + '  ' + x.exchange }));
        else if (ty === 'NS') items = (await rs.resolveNs(q)).map(v => ({ v }));
        else if (ty === 'TXT') items = (await rs.resolveTxt(q)).map(c => ({ v: c.join('') }));
        else if (ty === 'SOA') { const s = await rs.resolveSoa(q); items = [{ v: s.nsname + ' ' + s.hostmaster + '  serial ' + s.serial + ', refresh ' + s.refresh + ', retry ' + s.retry + ', expire ' + s.expire + ', min ' + s.minttl }]; }
        else if (ty === 'CAA') items = (await rs.resolveCaa(q)).map(x => { const k = Object.keys(x).find(z => z !== 'critical' && z !== 'contactemail' && z !== 'contactphone'); return { v: (x.critical || 0) + ' ' + (k || '') + ' "' + (x[k] || '') + '"' }; });
        if (items.length) records.push({ type: ty, items });
      } catch (e) { if (e.code === 'ENOTFOUND' && ty === 'A') nx = true; }
    }));
    records.sort((a, b) => DNS_TYPES.indexOf(a.type) - DNS_TYPES.indexOf(b.type));
    return { ok: true, query: q, server: server || 'system', ms: Date.now() - t0, records, note: !records.length ? (nx ? 'This domain does not exist (NXDOMAIN).' : 'No records found.') : '' };
  }

  /* ================= WHOIS (port 43, falls back to RDAP) ================= */
  function whoisAsk(server, q) {
    return new Promise(async (resolve, reject) => {
      if (!/^[a-z0-9.-]+$/i.test(server)) return reject(new Error('bad whois server'));
      try { const a = await dns.promises.lookup(server); if (privIp(a.address)) return reject(new Error('blocked')); } catch (e) { return reject(e); }
      let out = '', done = false;
      const s = net.connect({ host: server, port: 43 });
      const fin = e => { if (done) return; done = true; try { s.destroy(); } catch (x) { /* ignore */ } e && !out ? reject(e) : resolve(out); };
      s.setTimeout(9000, () => fin(new Error('timeout')));
      s.on('connect', () => s.write(q + '\r\n'));
      s.on('data', d => { out += d; if (out.length > 90000) fin(); });
      s.on('error', fin); s.on('close', () => fin());
    });
  }
  async function rdap(h) {
    const isIp = net.isIP(h), r = await fetch('https://rdap.org/' + (isIp ? 'ip/' : 'domain/') + encodeURIComponent(h), { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/rdap+json' } });
    if (!r.ok) throw new Error('RDAP ' + r.status);
    const j = await r.json(), L = [];
    const add = (k, v) => { if (v) L.push(k + ': ' + v); };
    add('Domain', j.ldhName); add('Name', j.name); add('Handle', j.handle); add('Country', j.country);
    if (j.startAddress) add('Range', j.startAddress + ' - ' + j.endAddress);
    (j.events || []).forEach(e => add(e.eventAction, e.eventDate));
    (j.status || []).forEach(s => add('Status', s));
    (j.nameservers || []).forEach(n => add('Name Server', n.ldhName));
    (j.entities || []).forEach(e => { const fn = ((e.vcardArray || [])[1] || []).find(x => x[0] === 'fn'); if (fn) add((e.roles || []).join('/') || 'Entity', fn[3]); });
    return L.join('\n');
  }
  const pick = (t, re) => { const m = re.exec(t); return m ? m[1].trim() : ''; };
  const pickAll = (t, re) => { const o = []; let m; const g = new RegExp(re.source, 'gim'); while ((m = g.exec(t))) o.push(m[1].trim().toLowerCase()); return [...new Set(o)]; };
  async function whois(host) {
    const h = cleanHost(host), isIp = net.isIP(h);
    if (isIp && privIp(h)) fail('Private / internal addresses are blocked.', 'BLOCKED');
    let text = '', server = '', via = 'whois';
    try {
      const key = isIp ? h : h.split('.').pop();
      const iana = await whoisAsk('whois.iana.org', key);
      server = pick(iana, /^\s*(?:whois|refer):\s*(\S+)/im);
      if (!server) throw new Error('no whois server');
      text = await whoisAsk(server, h);
      const ref = pick(text, /^\s*Registrar WHOIS Server:\s*(\S+)/im).replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
      if (ref && ref !== server && /^[a-z0-9.-]+$/.test(ref)) { try { const t2 = await whoisAsk(ref, h); if (t2 && t2.length > 80) { text = t2; server = ref; } } catch (e) { /* keep thin record */ } }
    } catch (e) {
      try { text = await rdap(h); via = 'rdap'; server = 'rdap.org'; } catch (e2) { fail('WHOIS lookup failed. ' + ((e2 && e2.message) || (e && e.message) || ''), 'WHOIS'); }
    }
    text = String(text).replace(/\r/g, '').trim().slice(0, 30000);
    const f = isIp
      ? { name: pick(text, /^\s*(?:NetName|netname|Name):\s*(.+)$/im), org: pick(text, /^\s*(?:OrgName|org-name|Organization|descr):\s*(.+)$/im), country: pick(text, /^\s*Country:\s*(.+)$/im), range: pick(text, /^\s*(?:NetRange|inetnum|Range):\s*(.+)$/im), cidr: pick(text, /^\s*CIDR:\s*(.+)$/im) }
      : { registrar: pick(text, /^\s*Registrar:\s*(.+)$/im), created: pick(text, /^\s*(?:Creation Date|Created On|Created|Registered on|Domain Registration Date|registration)[^:]*:\s*(.+)$/im), expires: pick(text, /^\s*(?:Registry Expiry Date|Registrar Registration Expiration Date|Expiry Date|Expires On|Expiration Date|paid-till|expiration)[^:]*:\s*(.+)$/im), updated: pick(text, /^\s*(?:Updated Date|Last Updated|Last Modified|Last Update|last changed)[^:]*:\s*(.+)$/im), status: pickAll(text, /^\s*(?:Domain )?Status:\s*(\S+)/).slice(0, 6), ns: pickAll(text, /^\s*Name Server:\s*(\S+)/).slice(0, 8) };
    if (!text) fail('No WHOIS data found for “' + h + '”.', 'WHOIS');
    return { ok: true, query: h, ip: !!isIp, server, via, fields: f, text };
  }

  /* ================= UPTIME MONITOR ================= */
  const KEY = uid => 'MONITORS_' + uid, MAX_MON = 15, INTERVALS = [1, 5, 15, 30, 60], HIST = 120;
  const reg = new Map();                                // uid -> [monitor] (kept in memory; the list is saved in the Google Sheet)
  let loaded = false, running = 0;
  const blank = () => ({ up: null, since: 0, lastAt: 0, ms: null, code: '', err: '', checks: 0, ups: 0, bad: 0, hist: [] });
  function loadAll() {
    if (loaded) return; loaded = true;
    let props = {}; try { props = P().getProperties(); } catch (e) { loaded = false; return; }
    for (const k of Object.keys(props)) {
      if (k.indexOf('MONITORS_') !== 0 || !props[k]) continue;
      try { const a = JSON.parse(props[k]); if (a && Array.isArray(a.list)) reg.set(k.slice(9), a.list.map(m => Object.assign(m, { st: Object.assign(blank(), m.st || {}, { hist: [] }) }))); } catch (e) { /* skip */ }
    }
  }
  function save(uid) {
    const list = (reg.get(uid) || []).map(m => ({ id: m.id, name: m.name, target: m.target, kind: m.kind, interval: m.interval, st: { up: m.st.up, since: m.st.since, checks: m.st.checks, ups: m.st.ups } }));
    return withWb(() => { P().setProperty(KEY(uid), JSON.stringify({ list, at: Date.now() })); return true; }).catch(e => warn('mon save', e && e.message));
  }
  function normTarget(kind, t) {
    t = String(t || '').trim();
    if (kind === 'tcp') {
      const m = /^\[?([^\]\s]+?)\]?:(\d{1,5})$/.exec(t.replace(/^[a-z]+:\/\//i, ''));
      if (!m || +m[2] < 1 || +m[2] > 65535) fail('Write it like  example.com:443', 'MON');
      return cleanHost(m[1]) + ':' + (+m[2]);
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = 'https://' + t;
    let u; try { u = new URL(t); } catch (e) { fail('That link is not valid.', 'MON'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') fail('Only http:// and https:// links can be monitored.', 'MON');
    cleanHost(u.hostname); return u.href.slice(0, 500);
  }
  async function probe(m) {
    const t0 = Date.now();
    if (m.kind === 'tcp') {
      const i = m.target.lastIndexOf(':'), tg = await target(m.target.slice(0, i)), r = await tcpTime(tg.ip, +m.target.slice(i + 1), 8000, false);
      return { ok: r.ok, ms: Math.round(r.ms), code: r.ok ? 'open' : r.why, err: r.ok ? '' : (r.why === 'timeout' ? 'Timed out' : 'Port closed / unreachable (' + r.why + ')') };
    }
    const u = new URL(m.target); await target(u.hostname);
    const r = await fetch(m.target, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'KS-Uptime/1.0' } });
    try { r.body && r.body.cancel(); } catch (e) { /* ignore */ }
    const ok = r.status < 400 || [401, 403, 405, 429].includes(r.status);
    return { ok, ms: Date.now() - t0, code: String(r.status), err: ok ? '' : 'HTTP ' + r.status };
  }
  async function checkMon(uid, m) {
    if (m.busy) return; m.busy = true; running++;
    try {
      let r; try { r = await probe(m); } catch (e) { r = { ok: false, ms: null, code: 'ERR', err: (e && e.message) || 'Failed' }; }
      if (!r.ok) { await sleep(4000); try { const r2x = await probe(m); if (r2x.ok) r = r2x; } catch (e) { /* keep first failure */ } }   // one quick retry before calling it down
      const s = m.st, was = s.up, now = Date.now();
      s.checks++; if (r.ok) s.ups++; s.lastAt = now; s.ms = r.ms; s.code = r.code; s.err = r.err;
      s.hist.push({ t: now, ok: r.ok ? 1 : 0, ms: r.ms }); if (s.hist.length > HIST) s.hist.shift();
      s.up = r.ok;
      if (was !== r.ok) {
        s.since = now; save(uid);
        if (was !== null && push && push.send) {
          push.send(uid, { title: r.ok ? '🟢 Back up: ' + m.name : '🔴 Down: ' + m.name, body: r.ok ? m.target + ' is reachable again.' : (r.err || 'Not reachable') + ' — ' + m.target, tag: 'mon-' + m.id, data: { kind: 'mon', view: 'nettools' } }).catch(() => {});
        }
      }
    } finally { m.busy = false; running--; }
  }
  function view(m) {
    const s = m.st;
    return { id: m.id, name: m.name, target: m.target, kind: m.kind, interval: m.interval, up: s.up, since: s.since, lastAt: s.lastAt, ms: s.ms, code: s.code, err: s.err, checks: s.checks, pct: s.checks ? Math.round(s.ups / s.checks * 1000) / 10 : null, hist: s.hist.slice(-48).map(x => [x.ok, x.ms]) };
  }
  { const t = setInterval(() => {
    loadAll(); const now = Date.now();
    for (const [uid, list] of reg) for (const m of list) {
      if (running >= 6) return;
      if (!m.busy && now - (m.st.lastAt || 0) >= m.interval * 60000) checkMon(uid, m).catch(e => warn('mon', e && e.message));
    }
  }, 20000); if (t.unref) t.unref(); }

  /* ================= router ================= */
  async function route(req) {
    const uid = globalThis.checkToken_(req.token);
    if (!uid) fail('Session expired. Please log in again.', 'AUTH');
    switch (req.action) {
      case 'netPing': rate(uid, 'ping', 20); return ping(req.host);
      case 'netTraceStart': return traceStart(uid, req.host);
      case 'netTracePoll': return tracePoll(uid, req.id);
      case 'netTraceStop': return traceStop(uid, req.id);
      case 'netDns': rate(uid, 'dns', 40); return dnsLookup(req.name, req.types, req.server);
      case 'netWhois': rate(uid, 'whois', 15); return whois(req.host);
      default: break;
    }
    loadAll();
    const list = reg.get(uid) || [];
    if (req.action === 'monList') {
      if (!reg.has(uid)) { try { const a = JSON.parse(P().getProperty(KEY(uid)) || 'null'); if (a && Array.isArray(a.list)) { a.list.forEach(m => { m.st = Object.assign(blank(), m.st || {}, { hist: [] }); }); reg.set(uid, a.list); } } catch (e) { /* none */ } }
      return { ok: true, list: (reg.get(uid) || []).map(view), max: MAX_MON, now: Date.now() };
    }
    if (req.action === 'monAdd') {
      const kind = req.kind === 'tcp' ? 'tcp' : 'http', name = String(req.name || '').trim().slice(0, 60);
      const tg = normTarget(kind, req.target);
      { const hh = kind === 'tcp' ? tg.slice(0, tg.lastIndexOf(':')) : new URL(tg).hostname.replace(/^\[|\]$/g, '');
        try { await target(hh); } catch (e) { if (e.code === 'BLOCKED') throw e; /* name not found yet: allowed, it will show as down */ } }
      const interval = INTERVALS.includes(+req.interval) ? +req.interval : 5;
      let m = req.id ? list.find(x => x.id === String(req.id)) : null;
      if (!m) { if (list.length >= MAX_MON) fail('You can monitor up to ' + MAX_MON + ' sites. Delete one first.', 'MON'); m = { id: crypto.randomBytes(5).toString('hex'), st: blank() }; list.push(m); reg.set(uid, list); }
      else if (m.target !== tg || m.kind !== kind) m.st = blank();
      Object.assign(m, { name: name || tg.replace(/^https?:\/\//, '').split('/')[0], target: tg, kind, interval });
      await save(uid); checkMon(uid, m).catch(() => {});
      return { ok: true, id: m.id };
    }
    if (req.action === 'monDel') { reg.set(uid, list.filter(m => m.id !== String(req.id || ''))); await save(uid); return { ok: true }; }
    if (req.action === 'monCheck') {
      rate(uid, 'moncheck', 30);
      const targets = req.id === 'all' ? list : list.filter(m => m.id === String(req.id || ''));
      await Promise.all(targets.slice(0, MAX_MON).map(m => checkMon(uid, m)));
      return { ok: true, list: list.map(view), now: Date.now() };
    }
    fail('Unknown request.');
  }
  return { actions: ACTIONS, route };
};
