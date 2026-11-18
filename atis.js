/* eTechLog – ATIS and ATC clearance entered with the eTechLog keypad instead of the iPad keyboard.
   Every field is stored in the OFP twice: the readable line under its old key (atisDep, clr, atisArr and the new clrArr)
   – the PDF, the step check and version 0.6.13 (after a rollback) read only that – and the keyed values as JSON
   under k_<key>. Order and choice of fields are each pilot's own setting (Můj účet → user.prefs).
   Keys know their field, so the ATIS can be written in whatever order it is spoken; digits go where the cursor is. */
self.ETL_ATIS = (function () {
'use strict';
let API = null;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (s, n) => String(s).padStart(n, '0');
const PHON = { A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu' };
const APP_BASE = ['ILS', 'RNP', 'LOC', 'VOR', 'NDB', 'VISUAL', 'CIRCL'];
const CT = ['FEW', 'SCT', 'BKN', 'OVC', 'VV'];
const PRECIP = ['RA', 'SN', 'DZ', 'GR', 'PL'];
const ROUTE_RE = /^[A-Z]{2,5}\d[A-Z]$/;
const isHdg = r => r === 'RWY HDG' || /^HDG\d*$/.test(r || '');
const REM_DEF = ['BIRDS', 'GNSS RFI', 'WORKS', 'TWY CLSD', 'LVP'];

// dig = takes digits; skip = optional, reached through its key and shown only once used
const DEF = {
  atis: {
    info: { l: 'INFO', ph: 'D', h: 'Písmeno informace – „Delta“ je D.' },
    time: { l: 'ČAS', ph: '1320', dig: 1, h: 'Čas vysílání (UTC), čtyři číslice.' },
    app: { l: 'APP', ph: 'ILS', h: 'Typ přiblížení, varianta Z / Y / X, CAT II. Může zaznít před dráhou i po ní. Když nezazní, pište dál – číslice skočí do dalšího pole.' },
    rwy: { l: 'RWY', ph: '24', dig: 1, h: 'Dráha, dvě číslice. L, C nebo R přidáte tlačítkem.' },
    cond: { l: 'STAV RWY', ph: 'WET', dig: 1, skip: 1, h: 'Povrch ťukněte jednou, pro třetiny zvlášť jen když se liší. Číslice = RWYCC 0–6: 5 5 5 = 5/5/5.' },
    tl: { l: 'TL', ph: '70', dig: 1, h: 'Převodní hladina: 7 0 = FL70, 1 1 0 = FL110.' },
    wind: { l: 'VÍTR', ph: '25008', dig: 1, h: 'Směr a rychlost bez lomítka: 2 5 0 0 8. Nárazy G, proměnlivý VRB, rozmezí V a šest číslic (2 4 0 3 2 0).' },
    vis: { l: 'VIS', ph: 'CAVOK', dig: 1, h: 'CAVOK nebo 9999 jedním ťuknutím. Kilometry (1 0) i metry (4 0 0 0). Nízká dohlednost: RVR.' },
    rvr: { l: 'RVR', ph: '550', dig: 1, skip: 1, h: 'RVR v metrech, třetiny dráhy oddělte lomítkem: 5 5 0 / 6 0 0 / 5 0 0.' },
    wx: { l: 'JEVY', ph: '−RA', skip: 1, h: '− = slabý (light), + = silný (heavy). Pak popis a jev: − SH RA = −SHRA, light shower rain. Pak rovnou oblačnost.' },
    cld: { l: 'OBLAČNOST', ph: 'FEW 20', dig: 1, w: 1, h: 'Druh a výška – ve stovkách (2 0) i ve stopách (2 0 0 0), obojí je 020. Další vrstva = další druh. Pak Další ›.' },
    tdp: { l: 'T / DP', ph: '12/5', dig: 1, h: 'Teplota a rosný bod bez lomítka: 1 2 5 = 12/05, 5 3 = 05/03. Pod nulou − 2 / − 5.' },
    qnh: { l: 'QNH', ph: '1013', dig: 1, h: 'QNH: 1 0 1 3, nebo 9 8 9.' },
    trend: { l: 'TREND', ph: 'NOSIG', dig: 1, skip: 1, h: 'NOSIG jedním ťuknutím, nebo TEMPO / BECMG a jev.' }
  },
  clr: {
    lim: { l: 'LIMIT', ph: 'ICAO', h: 'Clearance limit. Je předvyplněný z OFP, přepíšete ho písmeny.' },
    route: { l: 'SID / HDG', ph: 'SID', dig: 1, w: 1, ghost: 'sid', fix: 'sidFix', h: 'Plán z OFP potvrdíte ✓. Jiný SID: ťukněte bod a doplňte číslo a písmeno. Kurz po odletu: HDG a tři číslice.' },
    alt: { l: 'VÝŠKA', ph: '5000', dig: 1, h: 'Počáteční výška ve stopách, nebo FL a číslo.' },
    sq: { l: 'SQUAWK', ph: '4521', dig: 1, h: 'Squawk, čtyři číslice 0–7.' },
    freq: { l: 'FREKVENCE', ph: '120.53', dig: 1, h: 'Odletová frekvence, tečku doplní aplikace. Když nezazněla, ťukněte Hotovo.' }
  },
  star: {
    route: { l: 'STAR', ph: 'STAR', dig: 1, w: 1, ghost: 'star', fix: 'starFix', h: 'Plán z OFP potvrdíte ✓. Jiný STAR: ťukněte bod a doplňte číslo a písmeno. Kurz: HDG a tři číslice.' },
    alt: { l: 'VÝŠKA', ph: 'FL110', dig: 1, h: 'Sestup: FL a číslo, nebo výška ve stopách.' },
    app: { l: 'APP', ph: 'ILS', ghost: 'arrApp', h: 'Typ přiblížení. Hodnotu z ATIS ARR potvrdíte ✓.' },
    rwy: { l: 'RWY', ph: '24', dig: 1, ghost: 'arrRwy', h: 'Dráha. Hodnotu z ATIS ARR potvrdíte ✓.' }
  }
};
const TYPE_NAME = { atis: 'ATIS (DEP i ARR)', clr: 'Odletová clearance', star: 'Příletová clearance' };
const PRESETS = {
  icao: { atis: ['info', 'time', 'app', 'rwy', 'cond', 'tl', 'wind', 'vis', 'rvr', 'wx', 'cld', 'tdp', 'qnh', 'trend'], clr: ['lim', 'route', 'alt', 'sq', 'freq'], star: ['route', 'alt', 'app', 'rwy'] },
  us: { atis: ['info', 'time', 'wind', 'vis', 'rvr', 'wx', 'cld', 'tdp', 'qnh', 'app', 'rwy', 'cond', 'tl', 'trend'], clr: ['lim', 'route', 'alt', 'sq', 'freq'], star: ['route', 'alt', 'app', 'rwy'] }
};
const OFF_DEF = { atis: ['time'] };
const FIELDS = { atisDep: { type: 'atis', title: 'ATIS DEP' }, clr: { type: 'clr', title: 'ATC clearance' }, atisArr: { type: 'atis', title: 'ATIS ARR' }, clrArr: { type: 'star', title: 'Příletová clearance' } };

function presetCfg(p) { const o = { rem: REM_DEF.slice() }; for (const t in PRESETS[p]) o[t] = PRESETS[p][t].map(k => ({ k, on: !(OFF_DEF[t] || []).includes(k) })); return o }
function sanitize(c) {
  c = c && typeof c === 'object' ? c : {};
  const o = { rem: Array.isArray(c.rem) ? c.rem.filter(x => typeof x === 'string' && x.trim()).slice(0, 12) : REM_DEF.slice() };
  for (const t of Object.keys(DEF)) {
    const seen = new Set();
    o[t] = (Array.isArray(c[t]) ? c[t] : []).filter(x => x && DEF[t][x.k] && !seen.has(x.k) && seen.add(x.k)).map(x => ({ k: x.k, on: x.on !== false }));
    for (const k of PRESETS.icao[t]) if (!seen.has(k)) o[t].push({ k, on: !(OFF_DEF[t] || []).includes(k) });
  }
  return o;
}
function userCfg() { const p = API && API.prefs(); return p && p.atis ? sanitize(p.atis) : presetCfg('icao') }
// all fields in the pilot's order; switched-off ones behave like optional fields: shown and kept only when another pilot filled them
const slotsOf = (type, cfg) => (cfg || userCfg())[type].map(c => Object.assign({ k: c.k }, DEF[type][c.k], c.on ? {} : { skip: 1, off: 1 }));

const noCond = () => ({ cc: '', s: [], last: '' });
function empty(type, dest) {
  if (type === 'atis') return { info: '', time: '', app: '', rwy: '', cond: noCond(), tl: '', wind: '', vis: '', rvr: '', wx: [], cld: [], tdp: '', qnh: '', trend: [] };
  if (type === 'clr') return { lim: dest || '', route: '', alt: '', sq: '', freq: '' };
  return { route: '', alt: '', app: '', rwy: '' };
}

// ---------- formatting (stored values stay as typed; the line is normalized) ----------
function windParts(r) {
  let s = r || '', vrb = false, v = null, g = null;
  if (s.startsWith('VRB')) { vrb = true; s = s.slice(3) }
  const vi = s.indexOf('V'); if (vi >= 0) { v = s.slice(vi + 1); s = s.slice(0, vi) }
  const gi = s.indexOf('G'); if (gi >= 0) { g = s.slice(gi + 1); s = s.slice(0, gi) }
  return { dir: vrb ? 'VRB' : s.slice(0, 3), spd: vrb ? s : s.slice(3), g, v };
}
function fmtWind(r, live) {
  if (!r) return ''; const p = windParts(r); let o = p.dir;
  if (p.spd || p.g !== null || p.v !== null) o += '/' + (live ? p.spd : pad(p.spd || '0', 2)); else if (live && p.dir.length === 3) o += '/';
  if (p.g !== null) o += 'G' + p.g;
  if (p.v !== null) o += ' ' + (p.v.length > 3 ? p.v.slice(0, 3) + 'V' + p.v.slice(3) : p.v + (p.v.length === 3 ? 'V' : ''));
  return o;
}
const cldH = (h, live) => live ? h : h.length >= 4 ? pad(Math.round(parseInt(h, 10) / 100), 3) : pad(h, 3);
function fmtCld(a, live) { return (a || []).map(c => c.t === 'NSC' ? 'NSC' : c.t + (c.h ? cldH(c.h, live) : '') + (c.x || '')).join(' ') }
function fmtVis(v, live) { if (!v || live || !/^\d{1,2}$/.test(v)) return v || ''; const n = parseInt(v, 10); return n >= 10 ? '9999' : pad(n * 1000, 4) }
function fmtTdp(r, live) { if (!r) return ''; return r.split('/').map(p => { if (p === '') return ''; const neg = p.startsWith('-'); const n = p.replace('-', ''); return (neg ? '−' : '') + (live || !n ? n : pad(n, 2)) }).join('/') }
const collapse = s => s.length > 1 && s.every(x => x === s[0]) ? [s[0]] : s;
function fmtCond(c) { if (!c) return ''; return [c.cc && 'RWYCC ' + c.cc.split('').join('/'), collapse(c.s || []).join('/')].filter(Boolean).join(' ') }
const fmtRoute = r => (r = r || '', /^HDG\d+$/.test(r) ? 'HDG ' + r.slice(3) : r);
const fmtAlt = v => !v ? '' : v.startsWith('FL') ? v : v + ' ft';
const fmtFreq = d => (d = d || '', d.length > 3 ? d.slice(0, 3) + '.' + d.slice(3) : d);
const prefixOnly = g => !!g && /^[−+]?(VC)?(SH|TS|FZ)?$/.test(g);
function atomsStr(a) {
  const out = []; let prev = null;
  for (const t of (a || [])) {
    const isD = /^\d$/.test(t), last = out.length ? out[out.length - 1] : null;
    const glue = last !== null && ((isD && (/\d$/.test(last) || CT.includes(prev))) || (!isD && (prefixOnly(last) || (PRECIP.includes(t) && PRECIP.includes(prev)))));
    if (glue) out[out.length - 1] = last + t; else out.push(t); prev = t;
  }
  return out.join(' ');
}
function fmtSlot(k, v, live) {
  switch (k) {
    case 'wind': return fmtWind(v, live); case 'cld': return fmtCld(v, live); case 'vis': return fmtVis(v, live); case 'tdp': return fmtTdp(v, live);
    case 'cond': return fmtCond(v); case 'route': return fmtRoute(v); case 'alt': return fmtAlt(v); case 'freq': return fmtFreq(v);
    case 'wx': case 'trend': return atomsStr(v); default: return v || '';
  }
}
function outSlot(k, v) {
  const s = fmtSlot(k, v, false); if (!s) return '';
  return k === 'info' ? 'INFO ' + s : k === 'time' ? s + 'Z' : k === 'rwy' ? 'RWY ' + s : k === 'tl' ? 'TL' + s : k === 'qnh' ? 'Q' + s : k === 'rvr' ? 'RVR ' + s : k === 'sq' ? 'SQ ' + s : s;
}
function lineOf(type, v, note, cfg) { const a = slotsOf(type, cfg).map(s => outSlot(s.k, v[s.k])); if (note) a.push(note); return a.filter(Boolean).join(' · ') }

// ---------- OFP context ----------
// planned procedures: the nav log names the SID on its first leg and the STAR on its last (KOK7S, BISBA3X); the fix is the name without number and letter
function plan(o) {
  const W = (o.wpts || []).filter(p => !p.rvsm);
  const sid = (W.slice(0, 4).find(p => ROUTE_RE.test(p.awy || '')) || {}).awy || '';
  const star = (W.slice(-5).reverse().find(p => ROUTE_RE.test(p.awy || '')) || {}).awy || '';
  const toks = String(o.route || '').split(/\s+/).map(t => t.split('/')[0]).filter(t => /^[A-Z]{2,5}$/.test(t) && t !== 'DCT');
  const fix = n => n ? n.replace(/\d[A-Z]$/, '') : '';
  return { sid, sidFix: fix(sid) || toks[0] || '', star, starFix: fix(star) || toks[toks.length - 1] || '' };
}
const aptOf = (o, key) => key === 'atisDep' || key === 'clr' ? (o.dep || '') : (API.arrApt(o) || '');
function load(o, key) {
  const t = FIELDS[key].type; let st = null;
  try { st = JSON.parse(API.ofpVal(o, 'k_' + key) || 'null') } catch (e) { st = null }
  const e = empty(t, key === 'clr' ? o.des : ''), text = String(API.ofpVal(o, key) || '');
  // the keyed values count only while the stored line is theirs; a line written elsewhere (an older version, by hand) wins and becomes the note
  if (!st || typeof st !== 'object' || !st.v || st.line !== text) return { v: e, note: text, saved: false, text };
  const v = Object.assign(e, st.v);
  if (t === 'atis') { if (!v.cond || typeof v.cond !== 'object') v.cond = noCond(); for (const a of ['wx', 'cld', 'trend']) if (!Array.isArray(v[a])) v[a] = [] }
  return { v, note: String(st.note || ''), saved: true, text };
}
function save(o, key, st) {
  const line = lineOf(FIELDS[key].type, st.v, (st.note || '').trim());
  API.ofpSet(o.ofpId, 'k_' + key, JSON.stringify({ v: st.v, note: st.note || '', line }));
  API.ofpSet(o.ofpId, key, line);
}
function ghostVal(f, k) {
  const g = DEF[f.type][k] && DEF[f.type][k].ghost; if (!g) return '';
  if (g === 'sid' || g === 'star') return plan(f.o)[g];
  const a = load(f.o, 'atisArr').v; return g === 'arrApp' ? a.app : a.rwy;
}
const fixVal = (f, k) => { const x = DEF[f.type][k] && DEF[f.type][k].fix; return x ? plan(f.o)[x] : '' };
// earlier entries from all OFPs at the same airport, newest first
function history(f, k) {
  const apt = aptOf(f.o, f.key), out = [];
  const keys = f.type === 'atis' || k === 'rwy' ? ['atisDep', 'atisArr', 'clrArr'] : f.type === 'clr' ? ['clr'] : ['clrArr'];
  const list = API.ofps().filter(x => x.ofpId !== f.o.ofpId).sort((a, b) => String(b.date || '') + (b.std || '') > String(a.date || '') + (a.std || '') ? 1 : -1);
  for (const x of list) for (const kk of keys) {
    if (aptOf(x, kk) !== apt) continue; const raw = x.fill && x.fill['k_' + kk]; if (!raw) continue;
    let st; try { st = JSON.parse(raw) } catch (e) { continue }
    const val = st && st.v && st.v[k];
    if (typeof val !== 'string' || !val || isHdg(val) || (k === 'rwy' && !/^\d{2}[LCR]?$/.test(val)) || (k === 'route' && !ROUTE_RE.test(val))) continue;
    if (!out.includes(val)) out.push(val); if (out.length >= 6) return out;
  }
  return out;
}

// ---------- cursor ----------
let ACT = null, HINT = null, VIS = null;
const idxOf = (f, k) => f.L.findIndex(s => s.k === k);
function hasVal(f, i) {
  const s = f.L[i]; if (!s) return false; const k = s.k, v = f.v[k];
  if (k === 'cond') return !!(v && (v.cc || v.s.length)); if (k === 'cld') return v.length > 0 || f.v.vis === 'CAVOK';
  return Array.isArray(v) ? v.length > 0 : !!v;
}
const freshOf = (f, i) => hasVal(f, i) && !['cond', 'wx', 'trend'].includes(f.L[i].k);
function setSlot(f, i) { ACT.s = i; ACT.fresh = freshOf(f, i) }
function focusK(f, k) { const i = idxOf(f, k); if (i >= 0) { ACT.s = i; ACT.fresh = false } return i >= 0 }
// a finished field: an empty APP right after the runway first (the approach may follow it), then the next empty field
function advFrom(f, i) {
  const L = f.L;
  if (L[i] && L[i].k === 'rwy') { const a = idxOf(f, 'app'); if (a >= 0 && !hasVal(f, a)) { setSlot(f, a); return } }
  for (let j = i + 1; j < L.length; j++) if (!L[j].skip && !hasVal(f, j)) { setSlot(f, j); return }
  for (let j = i + 1; j < L.length; j++) if (!L[j].skip) { setSlot(f, j); return }
}
const adv = f => advFrom(f, ACT.s);
// a key that completes a field: forward in the spoken order the cursor continues after it, a late item leaves it in place
function completeK(f, k) { const i = idxOf(f, k); if (i >= 0 && i >= ACT.s) advFrom(f, i) }
function nextDig(f, i) { const L = f.L; for (let j = i + 1; j < L.length; j++) if (L[j].dig && !L[j].skip && !hasVal(f, j)) return j; for (let j = i + 1; j < L.length; j++) if (L[j].dig && !L[j].skip) return j; return -1 }
function nextIdx(f) { for (let j = ACT.s + 1; j < f.L.length; j++) if (!f.L[j].skip) return j; return -1 }
function firstEmpty(f) { const i = f.L.findIndex((s, j) => !s.skip && !hasVal(f, j)); return i < 0 ? 0 : i }
function clearSlot(f, k) { f.v[k] = k === 'cld' || k === 'wx' || k === 'trend' ? [] : k === 'cond' ? noCond() : '' }
function back1(f) { let j = ACT.s - 1; while (j > 0 && f.L[j].skip && !hasVal(f, j)) j--; if (j >= 0) { ACT.s = j; ACT.fresh = false } }
const appParts = s => { const m = String(s || '').match(/^(\S+)(?: ([XYZ]))?( CAT II)?$/); return m ? { b: m[1], x: m[2] || '', c: !!m[3] } : { b: '', x: '', c: false } };
const appStr = p => p.b ? p.b + (p.x ? ' ' + p.x : '') + (p.c ? ' CAT II' : '') : '';

// ---------- keys (pure: change f.v and ACT) ----------
function apply(f, code) {
  const k = f.L[ACT.s].k;
  if (code === 'bk') { backspace(f, k); return }
  const i = code.indexOf(':'), t = code.slice(0, i), val = code.slice(i + 1);
  switch (t) {
    case 'let': letter(f, k, val); break;
    case 'd': digit(f, k, val); break;
    case 'tok': token(f, k, val); break;
    case 'rc': { const c = f.v.cond; if (c.s.length < 3) c.s.push(val); else HINT = 'Stav dráhy má nejvýš tři třetiny. Opravíte ho ⌫.'; c.last = 's'; ACT.fresh = false; break }
    case 'wx': { if (ACT.fresh && k === 'wx') f.v.wx = []; ACT.fresh = false; (k === 'trend' ? f.v.trend : f.v.wx).push(val); break }
    case 'chip': f.v[k] = val; ACT.fresh = false; adv(f); break;
    case 'gh': { const g = ghostVal(f, k); if (g) { f.v[k] = g; ACT.fresh = false; adv(f) } break }
    case 'pre': f.v.route = val; ACT.fresh = false; HINT = 'Doplňte číslo a písmeno procedury, např. 7 S.'; break;
  }
}
function backspace(f, k) {
  if (ACT.fresh) { clearSlot(f, k); ACT.fresh = false; return }
  const v = f.v;
  if (k === 'cld') { const c = v.cld[v.cld.length - 1]; if (!c) { back1(f); return } if (c.x) c.x = ''; else if (c.h) c.h = c.h.slice(0, -1); else v.cld.pop(); return }
  if (k === 'cond') {
    const c = v.cond, rm = w => { if (w === 'cc' && c.cc) { c.cc = c.cc.slice(0, -1); return true } if (w === 's' && c.s.length) { c.s.pop(); return true } return false };
    const first = c.last === 'cc' ? 'cc' : 's'; if (!rm(first) && !rm(first === 'cc' ? 's' : 'cc')) back1(f); return;
  }
  if (k === 'wx' || k === 'trend') { if (v[k].length) v[k].pop(); else back1(f); return }
  if (k === 'app') { const p = appParts(v.app); if (!v.app) { back1(f); return } if (p.c) p.c = false; else if (p.x) p.x = ''; else p.b = ''; v.app = appStr(p); return }
  const s = v[k] || ''; if (!s) { back1(f); return }
  v[k] = k === 'info' || ['CAVOK', 'VRB', 'FL', 'RWY HDG', 'HDG'].includes(s) ? '' : s.slice(0, -1);
}
function letter(f, k, L) {
  const v = f.v, fresh = ACT.fresh; ACT.fresh = false;
  if (k === 'info') { v.info = L; adv(f); return }
  if (k === 'lim') { if (fresh || v.lim.length >= 4) v.lim = ''; v.lim += L; if (v.lim.length === 4) adv(f); return }
  if (k === 'route') { if (fresh || isHdg(v.route)) v.route = ''; if (v.route.length < 9) v.route += L; if (ROUTE_RE.test(v.route)) adv(f) }
}
function digit(f, k, d) {
  if (!f.L[ACT.s].dig) { if (d === '/' || d === '-') return; const j = nextDig(f, ACT.s); if (j < 0) return; setSlot(f, j); k = f.L[j].k }
  const v = f.v, fresh = ACT.fresh; ACT.fresh = false;
  if (d === '-' && k !== 'tdp') return; if (d === '/' && k !== 'tdp' && k !== 'rvr') return;
  if (fresh && !['cld', 'cond', 'trend'].includes(k)) clearSlot(f, k);
  switch (k) {
    case 'time': if (v.time.length >= 4) v.time = ''; v.time += d; if (v.time.length === 4) adv(f); return;
    case 'rwy': if (/[LCR]$/.test(v.rwy) || v.rwy.length >= 2) v.rwy = ''; v.rwy += d; if (v.rwy.length === 2) adv(f); return;
    case 'cond': { if (+d > 6) return; const c = v.cond; if (c.cc.length < 3) c.cc += d; c.last = 'cc'; return }
    case 'tl': { const n = () => v.tl[0] === '1' ? 3 : 2; if (v.tl.length >= n()) v.tl = ''; v.tl += d; if (v.tl.length === n()) adv(f); return }
    case 'wind': {
      const p = windParts(v.wind);
      if (p.v !== null) { if (p.v.length < 6) { v.wind += d; if (p.v.length + 1 === 6) adv(f) } return }
      if (p.g !== null) { if (p.g.length < 2) { v.wind += d; if (p.g.length + 1 === 2) adv(f) } return }
      if (p.dir === 'VRB') { if (p.spd.length < 2) { v.wind += d; if (p.spd.length + 1 === 2) adv(f) } return }
      const n = (p.dir + p.spd).length; if (n < 5) { v.wind += d; if (n + 1 === 5) adv(f) } return;
    }
    case 'vis': if (v.vis === 'CAVOK' || v.vis === '9999' || v.vis.length >= 4) v.vis = ''; v.vis += d; if (v.vis.length === 4) adv(f); return;
    case 'rvr': { const parts = v.rvr.split('/'), cur = parts[parts.length - 1]; if (d === '/') { if (cur && parts.length < 3) v.rvr += '/'; return } if (cur.length < 4) v.rvr += d; return }
    case 'cld': { const c = v.cld[v.cld.length - 1]; if (!c || c.t === 'NSC') { HINT = 'Nejdřív druh oblačnosti: FEW, SCT, BKN nebo OVC.'; return } if (fresh) c.h = ''; if (c.h.length < 5) c.h += d; return }
    case 'tdp': {
      const parts = v.tdp.split('/'), cur = parts[parts.length - 1], cd = cur.replace('-', '');
      if (d === '/') { if (parts.length === 1 && cd) v.tdp += '/'; return }
      if (d === '-') { if (cur === '') v.tdp += '-'; return }
      if (parts.length === 1 && cd.length === 2) { v.tdp += '/' + d; return }
      // one-digit values without a slash: no temperature above 45 (or below −40) and no dew point above the temperature
      if (cd.length === 1) {
        const cand = parseInt(cd + d, 10), neg = cur.startsWith('-');
        if (parts.length === 1 && cand > (neg ? 40 : 45)) { v.tdp += '/' + d; return }
        if (parts.length === 2) { const t = parseInt(parts[0], 10); if (neg ? cand > 40 : (!isNaN(t) && cand > t)) { adv(f); if (f.L[ACT.s].k !== 'tdp') digit(f, f.L[ACT.s].k, d); return } }
      }
      if (cd.length < 2) { v.tdp += d; if (parts.length === 2 && cd.length + 1 === 2) adv(f) } return;
    }
    case 'qnh': { const n = () => v.qnh[0] === '9' ? 3 : 4; if (v.qnh.length >= n()) v.qnh = ''; v.qnh += d; if (v.qnh.length === n()) adv(f); return }
    case 'trend': v.trend.push(d); return;
    case 'route': if (fresh || v.route === 'RWY HDG') v.route = '';
      if (/^HDG\d{0,2}$/.test(v.route)) { v.route += d; if (v.route.length === 6) adv(f); return }
      if (v.route.length < 9) v.route += d; return;
    case 'alt': { if (fresh) v.alt = ''; const fl = v.alt.startsWith('FL'), n = v.alt.replace('FL', ''); if (n.length < (fl ? 3 : 5)) { v.alt += d; if (!fl && n.length + 1 === 4) adv(f) } return }
    case 'sq': if (+d > 7) return; if (v.sq.length >= 4) v.sq = ''; v.sq += d; if (v.sq.length === 4) adv(f); return;
    case 'freq': if (v.freq.length >= 6) v.freq = ''; v.freq += d; return;
  }
}
function token(f, k, val) {
  const v = f.v, fresh = ACT.fresh; ACT.fresh = false;
  if (APP_BASE.includes(val)) {
    const p = appParts(v.app); v.app = appStr(p.b === val ? p : { b: val, x: '', c: false });
    // approach first ("ILS approach, runway 24"): stay for the runway when it is still empty
    const r = idxOf(f, 'rwy'), a = idxOf(f, 'app');
    if (r >= 0 && !hasVal(f, r) && a >= 0 && a >= ACT.s && a < r) { setSlot(f, r); return }
    completeK(f, 'app'); return;
  }
  if (val === 'Z' || val === 'Y' || val === 'X' || val === 'CAT II') {
    const p = appParts(v.app);
    if (val === 'CAT II') { if (!p.b) p.b = 'ILS'; p.c = !p.c } else { if (!p.b) { HINT = 'Nejdřív typ přiblížení, pak varianta.'; return } p.x = p.x === val ? '' : val }
    v.app = appStr(p); return;
  }
  if (val === 'L' || val === 'C' || val === 'R') {
    if (/^\d{2}$/.test(v.rwy)) v.rwy += val; else if (/^\d{2}[LCR]$/.test(v.rwy)) v.rwy = v.rwy.slice(0, 2) + val;
    else { focusK(f, 'rwy'); HINT = 'Nejdřív číslo dráhy, pak L, C nebo R.'; return }
    if (k === 'rwy') adv(f); return;
  }
  if (val === 'FL') { const n = (fresh ? '' : v.alt.replace('FL', '')).slice(0, 3); v.alt = v.alt.startsWith('FL') && !fresh ? n : 'FL' + n; return }
  if (val === 'RWY HDG') { v.route = 'RWY HDG'; adv(f); return }
  if (val === 'HDG') { v.route = 'HDG'; return }
  if (f.type !== 'atis') return;
  const inTrend = k === 'trend';
  switch (val) {
    case 'STAV RWY': focusK(f, 'cond'); return;
    case 'RVR': if (focusK(f, 'rvr')) ACT.fresh = hasVal(f, ACT.s); return;
    case 'JEVY': if (focusK(f, 'wx')) ACT.fresh = hasVal(f, ACT.s); return;
    case 'VRB': v.wind = 'VRB'; focusK(f, 'wind'); return;
    case 'G': case 'V': { const p = windParts(v.wind); if (!p.spd || p.v !== null || (val === 'G' && p.g !== null)) { focusK(f, 'wind'); if (!p.spd) HINT = 'Nejdřív směr a rychlost větru.'; return } v.wind += val; focusK(f, 'wind'); return }
    case 'CAVOK': v.vis = 'CAVOK'; v.cld = []; v.rvr = ''; v.wx = []; completeK(f, 'vis'); return;
    case '9999': v.vis = '9999'; completeK(f, 'vis'); return;
    case 'NOSIG': v.trend = ['NOSIG']; completeK(f, 'trend'); return;
    case 'TEMPO': case 'BECMG': v.trend = [val]; focusK(f, 'trend'); return;
    case 'NSC': if (inTrend) { v.trend.push('NSC'); return } v.cld = [{ t: 'NSC', h: '', x: '' }]; if (v.vis === 'CAVOK') v.vis = ''; completeK(f, 'cld'); return;
    case 'CB': case 'TCU': { if (inTrend) { v.trend.push(val); return } const c = v.cld[v.cld.length - 1]; if (c && c.t !== 'NSC') c.x = c.x === val ? '' : val; else HINT = 'CB a TCU patří za vrstvu oblačnosti.'; return }
    default:
      if (!CT.includes(val)) return;
      if (inTrend) { v.trend.push(val); return }
      if (k !== 'cld' ? v.cld.length > 0 && v.vis !== 'CAVOK' : fresh) v.cld = [];
      v.cld = v.cld.filter(c => c.t !== 'NSC'); if (v.vis === 'CAVOK') v.vis = ''; v.cld.push({ t: val, h: '', x: '' }); focusK(f, 'cld');
  }
}

// ---------- DOM ----------
const domId = (o, key) => 'atf-' + String(o.ofpId).replace(/[^A-Za-z0-9]/g, '_') + '-' + key;
function ctxOf(oid, key) {
  const o = API.ofpOf(oid); if (!o || o.closed || o.void) return null;
  const st = load(o, key); return { o, key, type: FIELDS[key].type, v: st.v, st, L: slotsOf(FIELDS[key].type) };
}
function slotHTML(f, i, s) {
  const on = !!(ACT && ACT.oid === f.o.ofpId && ACT.key === f.key && ACT.s === i), val = fmtSlot(s.k, f.v[s.k], on);
  const g = !val && s.ghost ? ghostVal(f, s.k) : '';
  let inner = val ? `<span class="sv">${esc(val)}</span>` : g ? `<span><span class="gh">${esc(fmtSlot(s.k, g, false))}</span><span class="gtag">${s.ghost === 'sid' || s.ghost === 'star' ? 'plán' : 'z ATIS'}</span></span>` : `<span class="pl">${esc(s.k === 'lim' ? (f.o.des || s.ph) : s.ph)}</span>`;
  if (!val && s.k === 'cld' && f.v.vis === 'CAVOK') inner = '<span class="sv dim">v CAVOK</span>';
  return `<button type="button" class="ak-slot${s.w ? ' wide' : ''}${g ? ' ghost' : ''}${on ? ' on' : ''}${on && ACT.fresh ? ' fresh' : ''}" data-ak-slot="${i}" data-ak-f="${f.key}" data-ak-o="${esc(f.o.ofpId)}" aria-pressed="${on}"><span class="sl">${esc(s.l)}</span>${inner}</button>`;
}
function slotsHTML(f) { return f.L.map((s, i) => (!s.skip || hasVal(f, i) || (ACT && ACT.oid === f.o.ofpId && ACT.key === f.key && ACT.s === i)) ? slotHTML(f, i, s) : '').join('') }
function outHTML(f) {
  const line = f.st.text;
  return `<span class="label">Do OFP</span><span class="mono">${line ? esc(line) : '<span class="muted">–</span>'}</span>`;
}
function remsHTML(f) {
  const r = userCfg().rem; if (!r.length) return '';
  return '<span class="label">Rychle do poznámky</span>' + r.map(x => `<button type="button" class="ak-rem" data-ak-rem="${esc(x)}" data-ak-f="${f.key}" data-ak-o="${esc(f.o.ofpId)}">${esc(x)}</button>`).join('');
}
// the field inside the OFP view; locked (closed / voided) OFPs show only the stored line
function field(o, key, locked) {
  const F0 = FIELDS[key]; if (!F0) return '';
  const apt = aptOf(o, key), id = domId(o, key);
  const head = `<div class="atf-h"><span class="label">${esc(F0.title)}</span><span class="mono muted">${esc(apt)}${F0.type === 'clr' && o.des ? ' → ' + esc(o.des) : ''}</span></div>`;
  if (locked || o.closed || o.void) return `<div class="atf">${head}<p class="mono atf-ro">${esc(API.ofpVal(o, key) || '–')}</p></div>`;
  const st = load(o, key), f = { o, key, type: F0.type, v: st.v, st, L: slotsOf(F0.type) };
  return `<div class="atf" id="${id}">${head}
    <div class="ak-slots" id="${id}-sl" role="group" aria-label="${esc(F0.title)}">${slotsHTML(f)}</div>
    <div class="atf-note" data-keep><input type="text" id="${id}-nt" data-ak-note="${key}" data-ak-o="${esc(o.ofpId)}" value="${esc(st.note)}" placeholder="Poznámka klávesnicí iPadu, jen výjimečně" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Poznámka ${esc(F0.title)}"></div>
    ${F0.type === 'atis' ? `<div class="ak-rems" id="${id}-rm">${remsHTML(f)}</div>` : ''}
    <div class="atf-out" id="${id}-out">${outHTML(f)}</div></div>`;
}
function refreshField(oid, key) {
  const f = ctxOf(oid, key); if (!f) return; const id = domId(f.o, key);
  const sl = document.getElementById(id + '-sl'); if (sl) sl.innerHTML = slotsHTML(f);
  const out = document.getElementById(id + '-out'); if (out) out.innerHTML = outHTML(f);
}

// keypad blocks: [label, caption, target field, spans two columns]
const RWY_TOK = [['ILS', '', 'app'], ['RNP', '', 'app'], ['LOC', 'localizer', 'app'], ['VOR', '', 'app'], ['NDB', '', 'app'], ['VISUAL', 'visual', 'app'], ['CIRCL', 'circling', 'app'], ['CAT II', 'ILS CAT II', 'app'],
  ['Z', 'varianta', 'app'], ['Y', 'varianta', 'app'], ['X', 'varianta', 'app'], null, ['L', 'left', 'rwy'], ['C', 'centre', 'rwy'], ['R', 'right', 'rwy']];
const MET_TOK = [['VRB', 'variable', 'wind'], ['G', 'gusting', 'wind'], ['V', 'rozmezí', 'wind'], ['CAVOK', '', 'vis'], ['9999', '10 km +', 'vis'],
  ['FEW', 'few', 'cld'], ['SCT', 'scattered', 'cld'], ['BKN', 'broken', 'cld'], ['OVC', 'overcast', 'cld'], ['NSC', 'no sig. cloud', 'cld'],
  ['CB', '', 'cld'], ['TCU', '', 'cld'], ['VV', 'vert. vis', 'cld'], ['RVR', 'runway vis.', 'rvr'], ['JEVY', 'déšť, mlha…', 'wx'],
  ['NOSIG', '', 'trend'], ['TEMPO', '', 'trend'], ['BECMG', '', 'trend'], ['STAV RWY', 'kontaminace · RWYCC', 'cond', 1]];
const WX_TOK = [['−', 'light'], ['+', 'heavy'], ['VC', 'vicinity'], ['SH', 'showers'], ['TS', 'thunderstorm'], ['RA', 'rain'], ['SN', 'snow'], ['DZ', 'drizzle'], ['FZ', 'freezing'], ['GR', 'hail'], ['BR', 'mist'], ['FG', 'fog'], ['HZ', 'haze'], ['PL', 'ice pellets'], null];
const CLD_ROW = [['FEW', 'few', 'cld'], ['SCT', 'scattered', 'cld'], ['BKN', 'broken', 'cld'], ['OVC', 'overcast', 'cld'], ['NSC', 'no sig. cloud', 'cld']];
const COND_TOK = [['DRY', 'dry'], ['WET', 'wet'], ['FROST', 'frost'], ['SLUSH', 'slush'], ['ST WATER', 'standing water'], ['DRY SNOW', 'dry snow'], ['WET SNOW', 'wet snow'], ['COMP SNOW', 'compacted snow'], ['ICE', 'ice'], ['WET ICE', 'wet ice'], null, null];
function keyBtn(code, label, cls, small, dis) { return `<button type="button" class="ak-key${cls ? ' ' + cls : ''}" data-ak="${esc(code)}"${dis ? ' disabled' : ''}>${label}${small ? `<small>${esc(small)}</small>` : ''}</button>` }
function grid(list, k, prefix) { return list.map(x => x ? keyBtn((prefix || 'tok:') + x[0], esc(x[0]), 't' + (x[2] && x[2] === k ? ' hl' : '') + (x[3] ? ' s2' : '') + (x[0].length > 5 ? ' sm' : ''), x[1]) : '<span></span>').join('') }
function ctxKind(f, k) {
  if (f.type === 'atis') { if (k === 'info') return 'abc'; if (k === 'app' || k === 'rwy' || k === 'tl') return 'rwy'; if (k === 'cond') return 'cond'; if (k === 'wx' || k === 'trend') return 'wx'; if (k === 'time') return 'read'; return 'met' }
  if (k === 'lim' || k === 'route') return 'abc'; if (f.type === 'star' && (k === 'app' || k === 'rwy')) return 'rwy'; return 'read';
}
const chipLabel = (k, v) => k === 'rwy' ? 'RWY ' + v : k === 'tl' ? 'TL' + v : k === 'alt' ? fmtAlt(v) : k === 'freq' ? fmtFreq(v) : fmtRoute(v);
function dockEl() {
  let d = document.getElementById('akdock');
  if (!d) {
    d = document.createElement('div'); d.id = 'akdock'; d.className = 'ak-dock'; d.hidden = true;
    d.innerHTML = '<div class="ak-in"><div class="ak-top"><span class="ak-title" id="ak-title"></span><span class="ak-hint" id="ak-hint"></span><div class="ak-chips" id="ak-chips"></div></div><div class="ak-grid"><div class="ak-ctx" id="ak-ctx"></div><div class="ak-dig" id="ak-dig"></div><div class="ak-act" id="ak-act"></div></div></div>';
    document.body.appendChild(d);
  }
  return d;
}
function hideDock() { const d = document.getElementById('akdock'); if (d && !d.hidden) { d.hidden = true; document.body.style.paddingBottom = '' } VIS = null }
function renderDock() {
  const f = ACT && ctxOf(ACT.oid, ACT.key);
  const sheetOpen = !!document.querySelector('#sheet:not([hidden])');
  if (!f || !document.getElementById(domId(f.o, f.key)) || sheetOpen) { if (!f || !document.getElementById(domId(f.o, f.key))) ACT = null; hideDock(); return }
  if (ACT.s >= f.L.length) ACT.s = 0;
  const s = f.L[ACT.s], k = s.k, d = dockEl();
  d.querySelector('#ak-title').textContent = FIELDS[f.key].title + ' · ' + s.l;
  const hint = d.querySelector('#ak-hint'); hint.textContent = HINT || s.h; hint.classList.toggle('warn', !!HINT);
  let ch = ''; const g = s.ghost ? ghostVal(f, k) : '';
  if (g && f.v[k] !== g) ch += `<button type="button" class="ak-chip ok" data-ak="gh:">✓ ${esc(fmtSlot(k, g, false))}<small>${s.ghost === 'sid' || s.ghost === 'star' ? 'plán OFP' : 'z ATIS ARR'}</small></button>`;
  const fx = fixVal(f, k);
  if (fx && !isHdg(f.v[k]) && !String(f.v[k] || '').startsWith(fx)) ch += `<button type="button" class="ak-chip pre" data-ak="pre:${esc(fx)}">${esc(fx)}…<small>bod z OFP</small></button>`;
  if (['rwy', 'tl', 'route', 'alt', 'freq'].includes(k) && !(f.type === 'clr' && k === 'rwy')) {
    const hs = history(f, k).filter(x => x !== g);
    if (hs.length) ch += `<span class="ak-cl">Dříve na ${esc(aptOf(f.o, f.key))}:</span>` + hs.map(x => `<button type="button" class="ak-chip" data-ak="chip:${esc(x)}">${esc(chipLabel(k, x))}</button>`).join('');
  }
  d.querySelector('#ak-chips').innerHTML = ch;
  const ctx = d.querySelector('#ak-ctx'), kind = ctxKind(f, k);
  if (kind === 'abc') {
    const extra = k === 'route' ? [keyBtn('tok:HDG', 'HDG', 't sm', 'kurz + číslo'), f.type === 'clr' ? keyBtn('tok:RWY HDG', 'RWY HDG', 't sm') : '<span></span>'] : ['<span></span>', '<span></span>'];
    ctx.className = 'ak-ctx abc'; ctx.innerHTML = Object.keys(PHON).map(x => keyBtn('let:' + x, x, 't', PHON[x])).join('') + extra.join('');
  } else if (kind === 'rwy') { ctx.className = 'ak-ctx c4'; ctx.innerHTML = grid(RWY_TOK, k) + (f.type === 'atis' ? keyBtn('tok:STAV RWY', 'STAV RWY', 't sm' + (k === 'cond' ? ' hl' : ''), 'kontaminace') : '<span></span>') }
  else if (kind === 'cond') { ctx.className = 'ak-ctx c4'; ctx.innerHTML = grid(COND_TOK, k, 'rc:') }
  else if (kind === 'met') { ctx.className = 'ak-ctx c5'; ctx.innerHTML = grid(MET_TOK, k) }
  else if (kind === 'wx') { ctx.className = 'ak-ctx c5'; ctx.innerHTML = grid(WX_TOK, k, 'wx:') + grid(CLD_ROW, k) }
  else { ctx.className = 'ak-ctx read'; ctx.innerHTML = `<div class="ak-readout"><span class="sl">${esc(s.l)}</span><span class="rv">${esc(fmtSlot(k, f.v[k], true) || '–')}</span></div>` + (k === 'alt' ? `<div class="ak-rrow">${keyBtn('tok:FL', 'FL', 't' + (String(f.v.alt).startsWith('FL') ? ' hl' : ''), 'flight level')}</div>` : '') }
  const noDig = k === 'lim', tdp = k === 'tdp', slash = tdp || k === 'rvr', max = k === 'sq' ? 7 : k === 'cond' ? 6 : 9;
  d.querySelector('#ak-dig').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => keyBtn('d:' + n, n, '', null, noDig || +n > max)).join('') + keyBtn('d:-', '−', '', null, !tdp) + keyBtn('d:0', '0', '', null, noDig) + keyBtn('d:/', '/', '', null, !slash);
  d.querySelector('#ak-act').innerHTML = keyBtn('bk', '⌫', 'bk', 'smazat') + keyBtn('next', 'Další ›', 't nx') + keyBtn('done', 'Hotovo', 't okk');
  const was = d.hidden; d.hidden = false;
  requestAnimationFrame(() => { document.body.style.paddingBottom = (d.offsetHeight + 16) + 'px'; if (was || VIS !== f.key + f.o.ofpId) { VIS = f.key + f.o.ofpId; ensureVisible(domId(f.o, f.key)) } });
}
function ensureVisible(id) {
  const el = document.getElementById(id), d = document.getElementById('akdock'); if (!el || !d) return;
  const r = el.getBoundingClientRect(), lim = innerHeight - d.offsetHeight - 12, top = 130;
  let dy = 0; if (r.bottom > lim) dy = r.bottom - lim; if (r.top - dy < top) dy = r.top - top;
  if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'smooth' });
}
function open(oid, key, i) {
  const f = ctxOf(oid, key); if (!f) return;
  const prev = ACT && ACT.oid === oid && ACT.key === key ? null : ACT;
  ACT = { oid, key, s: 0, fresh: false }; setSlot(f, i == null ? firstEmpty(f) : i); HINT = null;
  if (prev) refreshField(prev.oid, prev.key);
  refreshField(oid, key); renderDock();
}
function close() { const p = ACT; ACT = null; HINT = null; hideDock(); if (p) refreshField(p.oid, p.key) }
function press(code) {
  if (!ACT) return; const f = ctxOf(ACT.oid, ACT.key); if (!f) { close(); return }
  HINT = null;
  if (code === 'done') { close(); return }
  if (code === 'next') { const j = nextIdx(f); if (j < 0) { close(); return } setSlot(f, j); refreshField(f.o.ofpId, f.key); renderDock(); return }
  apply(f, code);
  save(f.o, f.key, { v: f.v, note: f.st.note });
  refreshField(f.o.ofpId, f.key); renderDock();
}

// ---------- per-pilot settings (Můj účet) ----------
let DRAFT = null;
function cfgInner() {
  const c = DRAFT;
  return `<div class="ak-presets"><span class="label">Předvolby</span><button type="button" class="btn sm" data-ak-preset="icao">ICAO / Evropa</button><button type="button" class="btn sm" data-ak-preset="us">USA – počasí před dráhou</button></div>
    <div class="ak-cfg">${Object.keys(DEF).map(t => `<div><p class="label">${TYPE_NAME[t]}</p><ol>${c[t].map((x, i) => {
      const d = DEF[t][x.k];
      return `<li class="ak-crow${x.on ? '' : ' off'}"><label><input type="checkbox" data-ak-cfg="${t}|${x.k}"${x.on ? ' checked' : ''}>${esc(d.l)}</label><span class="muted">${d.skip ? 'přes tlačítko' : ''}</span><span class="sp"></span><button type="button" class="ak-mv" data-ak-mv="${t}|${x.k}|-1" aria-label="${esc(d.l)} výš"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ak-mv" data-ak-mv="${t}|${x.k}|1" aria-label="${esc(d.l)} níž"${i === c[t].length - 1 ? ' disabled' : ''}>↓</button></li>`;
    }).join('')}</ol></div>`).join('')}</div>
    <label class="fld"><span>Rychlé poznámky k ATIS (oddělte čárkou)</span><input type="text" id="ak-rem" value="${esc(c.rem.join(', '))}" autocomplete="off" spellcheck="false" autocapitalize="characters"></label>`;
}
function cfgEditor() { DRAFT = userCfg(); return `<div id="ak-cfgbox">${cfgInner()}</div>` }
function cfgRedraw(focusSel) { const b = document.getElementById('ak-cfgbox'); if (!b) return; const rem = document.getElementById('ak-rem'); if (rem) DRAFT.rem = remList(rem.value); b.innerHTML = cfgInner(); if (focusSel) { const x = b.querySelector(focusSel); if (x && !x.disabled) x.focus() } }
const remList = s => String(s || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 12);
function cfgResult() { const rem = document.getElementById('ak-rem'); if (rem) DRAFT.rem = remList(rem.value); return sanitize(DRAFT) }

// ---------- events ----------
function bind(api) {
  API = api;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ak],[data-ak-slot],[data-ak-rem],[data-ak-mv],[data-ak-preset]'); if (!b || b.disabled) return;
    if (b.dataset.ak != null) { press(b.dataset.ak); return }
    if (b.dataset.akSlot != null) { open(b.dataset.akO, b.dataset.akF, +b.dataset.akSlot); return }
    if (b.dataset.akRem != null) {
      const f = ctxOf(b.dataset.akO, b.dataset.akF); if (!f) return;
      const note = (f.st.note.trim() ? f.st.note.trim() + ', ' : '') + b.dataset.akRem; save(f.o, f.key, { v: f.v, note });
      const nt = document.getElementById(domId(f.o, f.key) + '-nt'); if (nt) nt.value = note; refreshField(f.o.ofpId, f.key); return;
    }
    if (b.dataset.akPreset) { const rem = DRAFT.rem; DRAFT = presetCfg(b.dataset.akPreset); DRAFT.rem = rem; cfgRedraw(); return }
    if (b.dataset.akMv) { const [t, k, dd] = b.dataset.akMv.split('|'), L = DRAFT[t], i = L.findIndex(c => c.k === k), j = i + (+dd); if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; cfgRedraw(`[data-ak-mv="${t}|${k}|${dd}"]`) }
  });
  document.addEventListener('change', e => { const c = e.target.closest && e.target.closest('[data-ak-cfg]'); if (!c || !DRAFT) return; const [t, k] = c.dataset.akCfg.split('|'); const it = DRAFT[t].find(x => x.k === k); if (it) { it.on = c.checked; cfgRedraw() } });
  document.addEventListener('input', e => {
    const n = e.target.closest && e.target.closest('[data-ak-note]'); if (!n) return;
    const f = ctxOf(n.dataset.akO, n.dataset.akNote); if (!f) return; save(f.o, f.key, { v: f.v, note: n.value });
    const out = document.getElementById(domId(f.o, f.key) + '-out'); if (out) out.innerHTML = outHTML(ctxOf(f.o.ofpId, f.key));
  });
  // typing anywhere else (the note, another OFP field) puts the keypad away
  document.addEventListener('focusin', e => { if (ACT && e.target.matches && e.target.matches('input,textarea,select') && !e.target.closest('#akdock')) close() });
  document.addEventListener('keydown', e => {
    if (!ACT || e.metaKey || e.ctrlKey || e.altKey) return; if (e.target.closest && e.target.closest('input,textarea,select')) return;
    const d = document.getElementById('akdock'); if (!d || d.hidden) return;
    const f = ctxOf(ACT.oid, ACT.key); if (!f) return; const k = f.L[ACT.s].k, key = e.key;
    if (/^[0-9]$/.test(key)) press('d:' + key); else if (key === 'Backspace') press('bk'); else if (key === 'Enter' || key === 'Tab') press('next'); else if (key === 'Escape') press('done');
    else if (key === '/' || key === '-') press('d:' + key); else if (/^[a-zA-Z]$/.test(key) && ['info', 'lim', 'route'].includes(k)) press('let:' + key.toUpperCase()); else return;
    e.preventDefault();
  });
  const sh = document.getElementById('sheet'); if (sh && typeof MutationObserver !== 'undefined') new MutationObserver(() => renderDock()).observe(sh, { attributes: true, attributeFilter: ['hidden'] });
}
// after every app render: keep the keypad on its field, or put it away when the field is gone
function after() { if (ACT) renderDock(); else hideDock() }

return {
  bind, field, after, cfgEditor, cfgResult, lineOf, plan, FIELDS,
  // for tests
  _: { DEF, PRESETS, presetCfg, sanitize, empty, slotsOf, fmtSlot, outSlot, atomsStr, apply, setSlot, firstEmpty, nextIdx, get ACT() { return ACT }, set ACT(x) { ACT = x }, get HINT() { return HINT } }
};
})();
