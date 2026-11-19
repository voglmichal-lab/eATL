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
// a route that is not a SID: heading, straight ahead (with "when passing", turn and heading), or RWY HDG from 0.6.14
const isStr = r => /^STRAIGHT/.test(r || '');
const isHdg = r => r === 'RWY HDG' || /^HDG\d*$/.test(r || '') || isStr(r);
// instead of a STAR: direct to a point of the arrival route ("DCT WW673")
const isDct = r => /^DCT/.test(r || '');
function strParse(r) { const o = { p: null, t: '', h: null }; for (const x of String(r || '').split(' ').slice(1)) { if (/^P\d*$/.test(x)) o.p = x.slice(1); else if (x === 'L' || x === 'R') o.t = x; else if (/^HDG\d*$/.test(x)) o.h = x.slice(3) } return o }
const strMake = o => 'STRAIGHT' + (o.p !== null ? ' P' + o.p : '') + (o.t ? ' ' + o.t : '') + (o.h !== null ? ' HDG' + o.h : '');
const REM_DEF = ['BIRDS', 'GNSS RFI', 'WORKS', 'TWY _ CLSD', 'LVP'];

// dig = takes digits; skip = optional, reached through its key and shown only once used
const DEF = {
  atis: {
    info: { l: 'INFO', ph: 'D', h: 'Písmeno informace – „Delta“ je D.' },
    time: { l: 'ČAS', ph: '1320', dig: 1, h: 'Čas vysílání (UTC), čtyři číslice.' },
    app: { l: 'APP', ph: 'ILS', h: 'Typ přiblížení, varianta Z / Y / X, CAT II. Může zaznít před dráhou i po ní. Když nezazní, pište dál – číslice skočí do dalšího pole.' },
    rwy: { l: 'RWY', ph: '24', dig: 1, h: 'Dráha, dvě číslice. L, C nebo R přidáte tlačítkem.' },
    cond: { l: 'STAV RWY', ph: 'WET', dig: 1, skip: 1, h: 'Povrch ťukněte jednou, pro třetiny zvlášť jen když se liší. Číslice = RWYCC 0–6: 5 5 5 = 5/5/5.' },
    tl: { l: 'TL', ph: '70', dig: 1, h: 'Převodní hladina: 7 0 = FL70, 1 1 0 = FL110.' },
    wind: { l: 'VÍTR', ph: '25008', dig: 1, h: 'Směr a rychlost bez lomítka: 2 5 0 0 8. Gusting G, variable VRB, variable between V a šest číslic (2 4 0 3 2 0).' },
    vis: { l: 'VIS', ph: 'CAVOK', dig: 1, h: 'CAVOK nebo 9999 jedním ťuknutím. Kilometry (1 0) i metry (4 0 0 0). Nízká dohlednost: RVR.' },
    rvr: { l: 'RVR', ph: '550', dig: 1, skip: 1, h: 'RVR v metrech, třetiny dráhy oddělte lomítkem: 5 5 0 / 6 0 0 / 5 0 0.' },
    wx: { l: 'JEVY', ph: '−RA', skip: 1, h: '− = slabý (light), + = silný (heavy). Pak popis a jev: − SH RA = −SHRA, light shower rain. Pak rovnou oblačnost.' },
    cld: { l: 'OBLAČNOST', ph: 'FEW 20', dig: 1, w: 1, h: 'Druh a výška – ve stovkách (2 0) i ve stopách (2 0 0 0), obojí je 020. Další vrstva = další druh. Pak Další ›.' },
    tdp: { l: 'T / DP', ph: '12/5', dig: 1, h: 'Teplota a rosný bod bez lomítka: 1 2 5 = 12/05, 5 3 = 05/03. Pod nulou − 2 / − 5.' },
    qnh: { l: 'QNH', ph: '1013', dig: 1, h: 'QNH: 1 0 1 3, nebo 9 8 9.' },
    trend: { l: 'TREND', ph: 'NOSIG', dig: 1, skip: 1, w: 1, h: 'TEMPO / BECMG nahoře, pak jako v ATIS: vítr 2 5 0 1 7 (G 2 7), dohlednost, jevy, oblačnost. NOSIG jedním ťuknutím.' }
  },
  clr: {
    route: { l: 'SID / TRAŤ', ph: 'SID', dig: 1, w: 1, ghost: 'sid', fix: 'sidFix', h: 'SID: plán z OFP potvrdíte ✓, jiný = bod z OFP a číslo s písmenem. Bez SID: STRAIGHT (straight ahead), nebo HDG a tři číslice.' },
    alt: { l: 'VÝŠKA', ph: '5000', dig: 1, h: 'Jedna až tři číslice = FL (8 0 = FL80), čtyři a víc = stopy (5 0 0 0 = 5000 ft).' },
    sq: { l: 'SQUAWK', ph: '4521', dig: 1, h: 'Squawk, čtyři číslice 0–7.' },
    freq: { l: 'FREKVENCE', ph: '120.53', dig: 1, h: 'Odletová frekvence – úvodní 1 a tečku doplní aplikace: 2 0 5 3 = 120.53, 2 3 0 = 123.00. Když nezazněla, ťukněte Hotovo.' }
  },
  star: {
    route: { l: 'STAR', ph: 'STAR', dig: 1, w: 1, ghost: 'star', fix: 'starFix', h: 'Plán z OFP potvrdíte ✓. Jiný STAR: ťukněte bod a doplňte číslo a písmeno. Jen bod tratě (WW673): DCT a bod. Kurz: HDG a tři číslice.' },
    app: { l: 'APP', ph: 'ILS', ghost: 'arrApp', h: 'Typ přiblížení. Hodnotu z ATIS ARR potvrdíte ✓.' },
    rwy: { l: 'RWY', ph: '24', dig: 1, ghost: 'arrRwy', h: 'Dráha. Hodnotu z ATIS ARR potvrdíte ✓.' }
  },
  taxi: {
    rwy: { l: 'RWY', ph: '24', dig: 1, ghost: 'depRwy', h: 'Dráha: z ATIS DEP potvrdíte ✓, jinak dvě číslice (L, C, R písmenem).' },
    hp: { l: 'HOLDING POINT', ph: 'A1', dig: 1, skip: 1, h: 'Holding point nebo intersection: HP, pak písmeno a číslo (A 1).' },
    via: { l: 'VIA', ph: 'B A1', dig: 1, w: 1, h: '' }
  },
  taxiA: {
    via: { l: 'VIA', ph: 'B A1', dig: 1, w: 1, h: '' },
    stand: { l: 'STAND', ph: '12', dig: 1, h: 'Stání: STAND a číslo (1 2), nebo písmeno a číslo (A 5).' }
  }
};
DEF.taxi.via.h = DEF.taxiA.via.h = 'Pojezdové dráhy, jak zazní: B A 1 = B, A1 – písmeno začne další dráhu, číslice patří k ní. Dvě písmena (TA): T A SPOJIT. HOLD SHORT / CROSS a dráha: 3 3. EXIT a číslo: 1 5.';
const TYPE_NAME = { atis: 'ATIS (DEP i ARR)', clr: 'Odletová clearance', star: 'Příletová clearance', taxi: 'Taxi – odlet', taxiA: 'Taxi – přílet' };
const PRESETS = {
  icao: { atis: ['info', 'time', 'app', 'rwy', 'cond', 'tl', 'wind', 'vis', 'rvr', 'wx', 'cld', 'tdp', 'qnh', 'trend'], clr: ['route', 'alt', 'sq', 'freq'], star: ['route', 'app', 'rwy'], taxi: ['rwy', 'hp', 'via'], taxiA: ['via', 'stand'] },
  us: { atis: ['info', 'time', 'wind', 'vis', 'rvr', 'wx', 'cld', 'tdp', 'qnh', 'app', 'rwy', 'cond', 'tl', 'trend'], clr: ['route', 'alt', 'sq', 'freq'], star: ['route', 'app', 'rwy'], taxi: ['rwy', 'hp', 'via'], taxiA: ['via', 'stand'] }
};
const OFF_DEF = { atis: ['time'] };
const FIELDS = { atisDep: { type: 'atis', title: 'ATIS DEP' }, clr: { type: 'clr', title: 'ATC clearance' }, taxiDep: { type: 'taxi', title: 'TAXI DEP' }, atisArr: { type: 'atis', title: 'ATIS ARR' }, clrArr: { type: 'star', title: 'Příletová clearance' }, atisDiv: { type: 'atis', title: 'ATIS DIVERT' }, taxiArr: { type: 'taxiA', title: 'TAXI ARR' } };
const isTaxi = f => f.type === 'taxi' || f.type === 'taxiA';
// ghost values: where they come from (slot tag, chip caption)
const GHOST_TAG = { sid: ['plán', 'plán OFP'], star: ['plán', 'plán OFP'], arrApp: ['z ATIS', 'z ATIS ARR'], arrRwy: ['z ATIS', 'z ATIS ARR'], depRwy: ['z ATIS', 'z ATIS DEP'] };

function presetCfg(p) { const o = { rem: REM_DEF.slice() }; for (const t in PRESETS[p]) o[t] = PRESETS[p][t].map(k => ({ k, on: !(OFF_DEF[t] || []).includes(k) })); return o }
function sanitize(c) {
  c = c && typeof c === 'object' ? c : {};
  const o = { rem: Array.isArray(c.rem) ? c.rem.filter(x => typeof x === 'string' && x.trim()).map(x => x === 'TWY CLSD' ? 'TWY _ CLSD' : x).slice(0, 12) : REM_DEF.slice() };
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
  if (type === 'clr') return { route: '', alt: '', sq: '', freq: '' };
  if (type === 'taxi') return { rwy: '', hp: '', via: [] };
  if (type === 'taxiA') return { via: [], stand: '' };
  return { route: '', app: '', rwy: '' };   // arrival clearance: no altitude
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
  if (p.v !== null && (p.v || live)) o += ' ' + (p.v.length > 3 ? p.v.slice(0, 3) + 'V' + p.v.slice(3) : p.v + (p.v.length === 3 ? 'V' : ''));
  return live ? o : o.trim();
}
const cldH = (h, live) => live ? h : h.length >= 4 ? pad(Math.round(parseInt(h, 10) / 100), 3) : pad(h, 3);
function fmtCld(a, live) { return (a || []).map(c => c.t === 'NSC' ? 'NSC' : c.t + (c.h ? cldH(c.h, live) : '') + (c.x || '')).join(' ') }
function fmtVis(v, live) { if (!v || live || !/^\d{1,2}$/.test(v)) return v || ''; const n = parseInt(v, 10); return n >= 10 ? '9999' : pad(n * 1000, 4) }
function fmtTdp(r, live) { if (!r) return ''; return r.split('/').map(p => { if (p === '') return ''; const neg = p.startsWith('-'); const n = p.replace('-', ''); return (neg ? '−' : '') + (live || !n ? n : pad(n, 2)) }).join('/') }
const collapse = s => s.length > 1 && s.every(x => x === s[0]) ? [s[0]] : s;
function fmtCond(c) { if (!c) return ''; return [c.cc && 'RWYCC ' + c.cc.split('').join('/'), collapse(c.s || []).join('/')].filter(Boolean).join(' ') }
function fmtRoute(r) {
  r = r || ''; if (/^HDG\d+$/.test(r)) return 'HDG ' + r.slice(3); if (isDct(r)) return r.trim(); if (!isStr(r)) return r;
  const o = strParse(r), a = [];
  if (o.p !== null) a.push('PASSING ' + (o.p ? o.p + ' FT' : '…')); if (o.t) a.push(o.t === 'L' ? 'TURN LEFT' : 'TURN RIGHT'); if (o.h !== null) a.push('HDG ' + (o.h || '…'));
  return 'STRAIGHT AHEAD' + (a.length ? ', ' + a.join(' ') : '');
}
// a cleared altitude of up to three digits is a flight level (110 = FL110), four and more are feet (5000 ft)
const fmtAlt = (v, live) => !v ? '' : v.startsWith('FL') ? v : /^\d{1,3}$/.test(v) ? (live ? v : 'FL' + v) : v + ' ft';
// VHF frequencies are 118.000–136.975, so the leading 1 may be left out: 2 0 5 3 = 120.53, 2 3 0 = 123.00.
// Typed with the 1 it stays as it is – 1 then 1/2/3 means the 1 was typed, 2/3 or 1 then 8/9 means it was not.
const freqNorm = d => (d = String(d || ''), /^[23]/.test(d) || /^1[89]/.test(d) ? '1' + d : d);
const freqPre = n => n.length <= 6 && (n === '' || (n[0] === '1' && (n.length < 2 || '123'.includes(n[1])) && (n.length < 3 || (n[1] === '1' ? '89'.includes(n[2]) : n[1] === '3' ? n[2] <= '6' : true))));
function fmtFreq(d, live) { const n = freqNorm(d); if (n.length < 3) return n; const dec = n.slice(3); return n.slice(0, 3) + (dec || !live ? '.' + (live ? dec : dec.padEnd(2, '0')) : '') }
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
// TEMPO / BECMG groups read like the ATIS itself: the first number of a group with five digits is the wind
// (2 5 0 1 7 G 2 7 = 250/17G27), four digits or kilometres the visibility, digits after a cloud type its height
const TREND_KW = ['TEMPO', 'BECMG', 'NOSIG'];
function fmtTrend(a, live) {
  a = a || []; const out = []; let i = 0, first = true, prevT = null;
  const run = j => { let s = ''; while (j < a.length && /^\d$/.test(a[j])) s += a[j++]; return [s, j] };
  while (i < a.length) {
    const t = a[i];
    if (TREND_KW.includes(t)) { out.push(t); first = true; prevT = t; i++; continue }
    if (t === 'VRB' || /^\d$/.test(t)) {
      const vrb = t === 'VRB'; let [s, j] = run(vrb ? i + 1 : i);
      if (!vrb && CT.includes(prevT)) { out[out.length - 1] += cldH(s, live); prevT = 'H'; i = j; continue }
      if (vrb || (first && s.length >= 5 && +s.slice(0, 3) <= 360)) {
        let w = vrb ? 'VRB' + s.slice(0, 2) : s.slice(0, 5), rest = vrb ? s.slice(2) : s.slice(5);
        if (!rest && a[j] === 'G') { const [g, j2] = run(j + 1); w += 'G' + g.slice(0, 2); rest = g.slice(2); j = j2 }
        out.push(fmtWind(w, live && !rest && j >= a.length)); first = false; prevT = 'W';
        if (rest) { out.push(fmtVis(rest, live && j >= a.length)); prevT = 'VIS' }
        i = j; continue;
      }
      out.push(fmtVis(s, live && j >= a.length)); first = false; prevT = 'VIS'; i = j; continue;
    }
    const last = out.length ? out[out.length - 1] : null;
    if (last !== null && (prefixOnly(last) || (PRECIP.includes(t) && PRECIP.includes(prevT)) || ((t === 'CB' || t === 'TCU') && prevT === 'H'))) out[out.length - 1] = last + t; else out.push(t);
    first = false; prevT = t; i++;
  }
  return out.join(' ');
}
// taxi route: taxiways in order, HOLD SHORT / CROSS / BACKTRACK with the runway or taxiway they belong to
const VKW = { HS: 'HOLD SHORT', CROSS: 'CROSS', BKTRK: 'BACKTRACK', EXIT: 'EXIT' };
const isRwyI = x => /^RWY/.test(x || '');
function fmtVia(a) {
  const seg = []; let prev = null;
  for (const x of (a || [])) {
    const t = VKW[x] || (isRwyI(x) ? 'RWY ' + x.slice(3) : x);
    if (prev && (prev === 'HS' || prev === 'CROSS' || prev === 'EXIT' || (prev === 'BKTRK' && isRwyI(x)))) seg[seg.length - 1] += ' ' + t; else seg.push(t);
    prev = x;
  }
  return seg.join(', ').trim();
}
function fmtSlot(k, v, live) {
  switch (k) {
    case 'wind': return fmtWind(v, live); case 'cld': return fmtCld(v, live); case 'vis': return fmtVis(v, live); case 'tdp': return fmtTdp(v, live);
    case 'cond': return fmtCond(v); case 'route': return fmtRoute(v); case 'alt': return fmtAlt(v, live); case 'freq': return fmtFreq(v, live);
    case 'wx': return atomsStr(v); case 'trend': return fmtTrend(v, live); case 'via': return fmtVia(v); default: return v || '';
  }
}
function outSlot(k, v) {
  const s = fmtSlot(k, v, false); if (!s) return '';
  return k === 'info' ? 'INFO ' + s : k === 'time' ? s + 'Z' : k === 'rwy' ? 'RWY ' + s : k === 'tl' ? 'TL' + s : k === 'qnh' ? 'Q' + s : k === 'rvr' ? 'RVR ' + s : k === 'sq' ? 'SQ ' + s
    : k === 'hp' ? 'HP ' + s : k === 'via' ? 'VIA ' + s : k === 'stand' ? 'STAND ' + s : s;
}
function lineOf(type, v, note, cfg) { const a = slotsOf(type, cfg).map(s => outSlot(s.k, v[s.k])); if (note) a.push(note); return a.filter(Boolean).join(' · ') }

// ---------- OFP context ----------
// planned procedures: the nav log names the SID on the leg out of the departure (KOK7S) and the STAR on the leg into the
// destination (BISBA3X). When the last leg only says "STAR", there is no STAR plan – on a short flight the SID must not
// be taken for it (LOWW–LKPR: LANUX6B). The fix is the name without number and letter, or the point before the destination.
function plan(o) {
  const W = (o.wpts || []).filter(p => !p.rvsm), last = W.length - 1;
  const sid = (W.slice(1, Math.min(4, last)).find(p => ROUTE_RE.test(p.awy || '')) || {}).awy || '';
  const star = last > 1 && ROUTE_RE.test(W[last].awy || '') && W[last].awy !== sid ? W[last].awy : '';
  const named = p => p && /^[A-Z]{2,5}$/.test(p.wpt || '') && !/^TO[CD]$/.test(p.wpt);
  const toks = String(o.route || '').split(/\s+/).map(t => t.split('/')[0]).filter(t => /^[A-Z]{2,5}$/.test(t) && t !== 'DCT');
  const entry = (W.slice(1, last).reverse().find(named) || {}).wpt || '';
  const fix = n => n ? n.replace(/\d[A-Z]$/, '') : '';
  return { sid, sidFix: fix(sid) || toks[0] || '', star, starFix: fix(star) || entry || toks[toks.length - 1] || '' };
}
// destination ATIS and arrival clearance stay with the destination; a divert gets its own ATIS
const aptOf = (o, key) => key === 'atisDep' || key === 'clr' || key === 'taxiDep' ? (o.dep || '') : key === 'atisDiv' || key === 'taxiArr' ? (API.arrApt(o) || '') : (o.des || '');
function load(o, key) {
  const t = FIELDS[key].type; let st = null;
  try { st = JSON.parse(API.ofpVal(o, 'k_' + key) || 'null') } catch (e) { st = null }
  const e = empty(t, key === 'clr' ? o.des : ''), text = String(API.ofpVal(o, key) || '');
  // the keyed values count only while the stored line is theirs; a line written elsewhere (an older version, by hand) wins and becomes the note
  if (!st || typeof st !== 'object' || !st.v || st.line !== text) return { v: e, note: text, saved: false, text, prev: [] };
  const v = Object.assign(e, st.v);
  if (t === 'atis') { if (!v.cond || typeof v.cond !== 'object') v.cond = noCond(); for (const a of ['wx', 'cld', 'trend']) if (!Array.isArray(v[a])) v[a] = [] }
  if ((t === 'taxi' || t === 'taxiA') && !Array.isArray(v.via)) v.via = [];
  return { v, note: String(st.note || ''), saved: true, text, prev: Array.isArray(st.prev) ? st.prev.slice(-5) : [] };
}
function save(o, key, st) {
  const line = lineOf(FIELDS[key].type, st.v, (st.note || '').trim());
  API.ofpSet(o.ofpId, 'k_' + key, JSON.stringify(Object.assign({ v: st.v, note: st.note || '', line }, st.prev && st.prev.length ? { prev: st.prev.slice(-5) } : {})));
  API.ofpSet(o.ofpId, key, line);
}
function ghostVal(f, k) {
  const g = DEF[f.type][k] && DEF[f.type][k].ghost; if (!g) return '';
  if (g === 'sid' || g === 'star') return plan(f.o)[g];
  if (g === 'depRwy') return load(f.o, 'atisDep').v.rwy;
  const a = load(f.o, 'atisArr').v; return g === 'arrApp' ? a.app : a.rwy;
}
const fixVal = (f, k) => { const x = DEF[f.type][k] && DEF[f.type][k].fix; return x ? plan(f.o)[x] : '' };
// earlier entries from all OFPs at the same airport, newest first
function history(f, k) {
  const apt = aptOf(f.o, f.key), out = [];
  const keys = f.type === 'atis' || k === 'rwy' ? ['atisDep', 'atisArr', 'atisDiv', 'clrArr', 'taxiDep'] : f.type === 'clr' ? ['clr'] : f.type === 'star' ? ['clrArr'] : f.type === 'taxi' ? ['taxiDep'] : ['taxiArr'];
  const list = API.ofps().filter(x => x.ofpId !== f.o.ofpId).sort((a, b) => String(b.date || '') + (b.std || '') > String(a.date || '') + (a.std || '') ? 1 : -1);
  const seen = new Set();
  for (const x of list) for (const kk of keys) {
    if (aptOf(x, kk) !== apt) continue; const raw = x.fill && x.fill['k_' + kk]; if (!raw) continue;
    let st; try { st = JSON.parse(raw) } catch (e) { continue }
    const val = st && st.v && st.v[k];
    if (Array.isArray(val)) { if (!val.length || !val.every(x => typeof x === 'string')) continue }   // a taxi route
    else if (typeof val !== 'string' || !val || isHdg(val) || (k === 'rwy' && !/^\d{2}[LCR]?$/.test(val)) || (k === 'route' && !ROUTE_RE.test(val) && !/^DCT [A-Z0-9]{2,7}$/.test(val))) continue;
    const id = JSON.stringify(val); if (!seen.has(id)) { seen.add(id); out.push(val) } if (out.length >= 6) return out;
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
const freshOf = (f, i) => hasVal(f, i) && !['cond', 'wx', 'trend', 'via'].includes(f.L[i].k);
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
function clearSlot(f, k) { f.v[k] = k === 'cld' || k === 'wx' || k === 'trend' || k === 'via' ? [] : k === 'cond' ? noCond() : '' }
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
    case 'tr': trendKey(f, val); break;
    case 'chip': f.v[k] = val; ACT.fresh = false; adv(f); break;
    case 'chipj': try { const x = JSON.parse(val); if (Array.isArray(x)) f.v[k] = x } catch (e) { } ACT.fresh = false; break;
    case 'gh': { const g = ghostVal(f, k); if (g) { f.v[k] = g; ACT.fresh = false; adv(f) } break }
    case 'pre': f.v.route = val; ACT.fresh = false; HINT = 'Doplňte číslo a písmeno procedury, např. 7 S.'; break;
    case 'clean': { const info = f.v.info; Object.assign(f.v, empty(f.type, f.type === 'clr' ? f.o.des : ''), { info }); ACT.newAtis = null; ACT.s = 0; ACT.fresh = false; adv(f); break }
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
  if (k === 'via') { const a = v.via, last = a[a.length - 1]; if (!a.length) { back1(f); return } if (VKW[last] || last.length <= 1 || last === 'RWY') a.pop(); else a[a.length - 1] = last.slice(0, -1); return }
  if (k === 'route' && isDct(v.route)) { v.route = v.route.length > 4 ? v.route.slice(0, -1) : ''; return }
  if (k === 'app') { const p = appParts(v.app); if (!v.app) { back1(f); return } if (p.c) p.c = false; else if (p.x) p.x = ''; else p.b = ''; v.app = appStr(p); return }
  if (k === 'route' && isStr(v.route)) {
    const o = strParse(v.route);
    if (o.h !== null) o.h = o.h ? o.h.slice(0, -1) : null; else if (o.t) o.t = ''; else if (o.p !== null) o.p = o.p ? o.p.slice(0, -1) : null; else { v.route = ''; return }
    v.route = strMake(o); return;
  }
  const s = v[k] || ''; if (!s) { back1(f); return }
  v[k] = k === 'info' || ['CAVOK', 'VRB', 'FL', 'RWY HDG', 'HDG'].includes(s) ? '' : s.slice(0, -1);
}
function letter(f, k, L) {
  const v = f.v, fresh = ACT.fresh; ACT.fresh = false;
  if (isTaxi(f)) { taxiLetter(f, k, L, fresh); return }
  if (k === 'info') {
    const others = f.L.some((s, i) => s.k !== 'info' && hasVal(f, i));
    if (f.type === 'atis' && v.info && L !== v.info && others && f.prev) {
      const last = f.prev[f.prev.length - 1], snap = JSON.stringify(Object.assign({}, v, { info: '' }));
      // a mistyped letter right after the switch is replaced, not archived
      if (!(last && JSON.stringify(Object.assign({}, last.v, { info: '' })) === snap)) f.prev.push({ info: v.info, v: JSON.parse(JSON.stringify(v)), line: lineOf(f.type, v, '') });
      const from = f.prev[f.prev.length - 1].info; v.info = L; ACT.newAtis = from;
      HINT = `Nový ATIS ${L}: hodnoty z ${from} zůstaly. Přepište, co se změnilo – ťuknutím na pole nebo Další ›.`;
      adv(f); return;
    }
    v.info = L; adv(f); return;
  }
  if (k === 'route') {
    if (isDct(v.route) && !fresh) { const p = v.route.slice(4); if (p.length < 7) v.route = 'DCT ' + p + L; return }
    if (fresh || isHdg(v.route) || isDct(v.route)) v.route = ''; if (v.route.length < 9) v.route += L; if (ROUTE_RE.test(v.route)) adv(f);
  }
}
// ---------- taxi: runway, holding point / stand and the taxiways in the order they are spoken ----------
const viaTail = /^[A-Z]{1,2}\d?$/;   // a taxiway that can still take a digit (A, TA, B1)
function viaLetter(f, L) {
  const a = f.v.via, last = a[a.length - 1];
  if (last && /^RWY\d{2}$/.test(last) && 'LCR'.includes(L)) { a[a.length - 1] = last + L; return }
  a.push(L);
}
function taxiLetter(f, k, L, fresh) {
  const v = f.v;
  // runway suffix: the cursor stays on the runway after its two digits for L / C / R
  if (k === 'rwy' && /^\d{2}$/.test(v.rwy) && 'LCR'.includes(L) && !fresh) { v.rwy += L; return }
  if (k === 'hp' || k === 'stand') { if (fresh) v[k] = ''; if (/^[A-Z]?$/.test(v[k])) { v[k] += L; return } }
  if (k !== 'via') focusK(f, 'via');
  viaLetter(f, L);
}
// a digit in the route belongs to the taxiway or runway it follows; with nothing to join it is the runway (departure) or the stand (arrival)
function viaDigit(f, d) {
  const a = f.v.via, last = a[a.length - 1];
  if (last && isRwyI(last)) { if (/^RWY\d?$/.test(last)) { a[a.length - 1] = last + d; return true } return false }
  if (last === 'EXIT') { a.push(d); return true }
  if (last && VKW[last]) { a.push('RWY' + d); return true }
  if (last && /^\d$/.test(last)) { a[a.length - 1] = last + d; return true }   // exit 15
  if (last && viaTail.test(last)) { a[a.length - 1] = last + d; return true }
  return false;
}
function taxiToken(f, k, val) {
  const v = f.v, a = v.via, last = a[a.length - 1];
  switch (val) {
    case 'RWY':
      if (f.type === 'taxiA' || (k === 'via' && VKW[last])) { focusK(f, 'via'); a.push('RWY'); return }
      if (focusK(f, 'rwy')) ACT.fresh = hasVal(f, ACT.s); return;
    case 'HP': case 'STAND': { const key = val === 'HP' ? 'hp' : 'stand'; if (focusK(f, key)) ACT.fresh = hasVal(f, ACT.s); return }
    case 'VIA': focusK(f, 'via'); return;
    case 'HS': case 'CROSS': case 'BKTRK': case 'EXIT': focusK(f, 'via'); a.push(val); return;
    case 'SPOJIT': {
      focusK(f, 'via'); const b = a[a.length - 2];
      if (a.length >= 2 && /^[A-Z]$/.test(b) && /^[A-Z]\d{0,2}$/.test(last)) a.splice(-2, 2, b + last); else HINT = 'SPOJIT udělá ze dvou písmen jednu dráhu: T A → TA.';
      return;
    }
  }
}
// which digit may come next: directions 000–360, runway 01–36, ATIS time 0000–2359, QNH 930–1069, TL from 1
const dirOk = (p, d) => p.length === 0 ? d <= 3 : p.length === 1 ? (p !== '3' || d <= 6) : p.length === 2 ? (p !== '36' || d === 0) : false;
const rwyOk = (p, n) => p === '' ? n <= 3 : p === '0' ? n >= 1 : p === '3' ? n <= 6 : true;
function okDigit(v, k, d, fresh) {
  if (!/^\d$/.test(d)) return true; const n = +d;
  const val = x => fresh ? '' : (v[x] || '');
  switch (k) {
    case 'rwy': { const p = /[LCR]$/.test(val('rwy')) || val('rwy').length >= 2 ? '' : val('rwy'); return rwyOk(p, n) }
    case 'via': {
      const a = v.via || [], last = a[a.length - 1];
      if (last && isRwyI(last)) return /^RWY\d?$/.test(last) && rwyOk(last.slice(3), n);
      if (last === 'EXIT' || (last && /^\d$/.test(last))) return true;
      if (last && VKW[last]) return n <= 3;
      if (last && viaTail.test(last)) return true;
      if ('stand' in v) return true;   // arrival: goes to the stand
      return rwyOk(/^\d$/.test(v.rwy || '') ? v.rwy : '', n);   // departure: goes to the runway
    }
    case 'hp': return viaTail.test(val('hp'));
    case 'stand': return /^[A-Z]{0,2}\d{0,2}$/.test(val('stand'));
    case 'wind': {
      const p = windParts(val('wind'));
      if (p.v !== null) { if (p.v.length >= 6) return false; const g = p.v.slice(p.v.length - p.v.length % 3); return dirOk(g, n) }
      if (p.g !== null || p.dir === 'VRB') return true;
      const all = p.dir + p.spd; if (all.length >= 5) return dirOk('', n); return all.length < 3 ? dirOk(p.dir, n) : true;
    }
    case 'route': { const r = val('route'); if (isStr(r)) { const o = strParse(r); return o.h !== null ? o.h.length < 3 && dirOk(o.h, n) : true } return /^HDG\d{0,2}$/.test(r) ? dirOk(r.slice(3), n) : true }
    case 'time': { const t = val('time').length >= 4 ? '' : val('time'); return t.length === 0 ? n <= 2 : t.length === 1 ? (t !== '2' || n <= 3) : t.length === 2 ? n <= 5 : true }
    case 'qnh': { const q = val('qnh'), full = q.length >= (q[0] === '9' ? 3 : 4), x = full ? '' : q; return x === '' ? (n === 9 || n === 1) : x === '1' ? n === 0 : x === '10' ? n <= 6 : x === '9' ? n >= 3 : true }
    case 'tl': { const t = val('tl'), full = t.length >= (t[0] === '1' ? 3 : 2); return (full || t === '') ? n >= 1 : true }
    case 'sq': return n <= 7;
    case 'freq': { const r = freqNorm(val('freq')).length >= 6 ? '' : val('freq'); return freqPre(freqNorm(r + d)) }
    case 'cond': return n <= 6;
  }
  return true;
}
const DIG_HINT = { rwy: 'Dráha je 01 až 36.', wind: 'Směr větru je 000 až 360.', route: 'Kurz je 001 až 360.', time: 'Čas je 0000 až 2359.', qnh: 'QNH začíná 9 (930–999) nebo 10 (1000–1069).', tl: 'Převodní hladina nezačíná nulou.', freq: 'Frekvence je 118.000–136.975 (úvodní 1 není třeba).' };
// the slot a digit would go to (fields without digits pass it on)
function digTarget(f) { if (f.L[ACT.s] && f.L[ACT.s].dig) return ACT.s; return nextDig(f, ACT.s) }
function digit(f, k, d) {
  { const j = digTarget(f); if (j >= 0 && /^\d$/.test(d) && !okDigit(f.v, f.L[j].k, d, j === ACT.s ? ACT.fresh : freshOf(f, j))) { HINT = DIG_HINT[f.L[j].k] || null; return } }
  if (!f.L[ACT.s].dig) { if (d === '/' || d === '-') return; const j = nextDig(f, ACT.s); if (j < 0) return; setSlot(f, j); k = f.L[j].k }
  const v = f.v, fresh = ACT.fresh; ACT.fresh = false;
  if (d === '-' && k !== 'tdp') return; if (d === '/' && k !== 'tdp' && k !== 'rvr') return;
  if (fresh && !['cld', 'cond', 'trend'].includes(k)) clearSlot(f, k);
  switch (k) {
    case 'time': if (v.time.length >= 4) v.time = ''; v.time += d; if (v.time.length === 4) adv(f); return;
    case 'rwy': if (/[LCR]$/.test(v.rwy) || v.rwy.length >= 2) v.rwy = ''; v.rwy += d; if (v.rwy.length === 2 && !isTaxi(f)) adv(f); return;
    case 'via': if (!viaDigit(f, d)) { const t = f.type === 'taxi' ? 'rwy' : 'stand', j = idxOf(f, t); if (j < 0) return; setSlot(f, j); digit(f, t, d) } return;
    case 'hp': if (v.hp.length < 4) v.hp += d; return;
    case 'stand': if (v.stand.length < 5) v.stand += d; return;
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
      // no SID / STAR starts with a digit: digits at an empty route are the altitude (departure) or the runway (arrival); the plan stays offered
      if (!v.route) { const t = idxOf(f, 'alt') >= 0 ? 'alt' : 'rwy', j = idxOf(f, t); if (j >= 0) { setSlot(f, j); digit(f, t, d) } return }
      if (isStr(v.route)) {
        const o = strParse(v.route);
        if (o.h !== null) { if (o.h.length < 3) { o.h += d; v.route = strMake(o); if (o.h.length === 3) adv(f) } }
        else if (o.p !== null) { if (o.p.length < 5) { o.p += d; v.route = strMake(o) } }
        else { adv(f); if (f.L[ACT.s].k !== 'route') digit(f, f.L[ACT.s].k, d) }   // "continue straight ahead, climb 5000"
        return;
      }
      if (isDct(v.route)) { const p = v.route.slice(4); if (p.length < 7) v.route = 'DCT ' + p + d; return }
      if (/^HDG\d{0,2}$/.test(v.route)) { v.route += d; if (v.route.length === 6) adv(f); return }
      if (v.route.length < 9) v.route += d; return;
    case 'alt': { if (fresh) v.alt = ''; const fl = v.alt.startsWith('FL'), n = v.alt.replace('FL', ''); if (n.length < (fl ? 3 : 5)) { v.alt += d; if (!fl && n.length + 1 === 4) adv(f) } return }
    case 'sq': if (+d > 7) return; if (v.sq.length >= 4) v.sq = ''; v.sq += d; if (v.sq.length === 4) adv(f); return;
    case 'freq': if (freqNorm(v.freq).length >= 6) v.freq = ''; v.freq += d; return;
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
  if (val === 'STRAIGHT') { v.route = 'STRAIGHT'; return }
  if (val === 'PASSING' || val === 'LEFT' || val === 'RIGHT') { const o = isStr(v.route) && !fresh ? strParse(v.route) : strParse(''); if (val === 'PASSING') { if (o.p === null) o.p = '' } else o.t = val === 'LEFT' ? 'L' : 'R'; v.route = strMake(o); return }
  if (val === 'HDG') { if (isStr(v.route) && !fresh) { const o = strParse(v.route); if (o.h === null) o.h = ''; v.route = strMake(o) } else v.route = 'HDG'; return }
  if (val === 'SID') { v.route = ''; return }
  if (val === 'DCT') { v.route = 'DCT '; HINT = 'Bod, na který vás pošlou: písmena a číslice (W W 6 7 3).'; return }
  if (isTaxi(f)) { taxiToken(f, k, val); return }
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

// trend keypad: TEMPO / BECMG start a group, the rest is pushed as typed (fmtTrend reads it)
function trendKey(f, val) {
  const v = f.v; ACT.fresh = false; focusK(f, 'trend');
  if (val === 'NOSIG') { v.trend = ['NOSIG']; completeK(f, 'trend'); return }
  if (val === 'TEMPO' || val === 'BECMG') { if (!v.trend.length || v.trend[0] === 'NOSIG') v.trend = [val]; else v.trend.push(val); return }
  if (v.trend[0] === 'NOSIG') v.trend = [];
  if (val === 'G') {
    let n = 0, j = v.trend.length - 1; while (j >= 0 && /^\d$/.test(v.trend[j])) { n++; j-- }
    if (!(n >= 5 || (v.trend[j] === 'VRB' && n >= 1))) { HINT = 'Poryvy patří za vítr: nejdřív směr a rychlost (2 5 0 1 7), pak G.'; return }
  }
  v.trend.push(val);
}

// ---------- DOM ----------
const domId = (o, key) => 'atf-' + String(o.ofpId).replace(/[^A-Za-z0-9]/g, '_') + '-' + key;
function ctxOf(oid, key) {
  const o = API.ofpOf(oid); if (!o || o.closed || o.void) return null;
  const st = load(o, key); return { o, key, type: FIELDS[key].type, v: st.v, st, prev: st.prev, L: slotsOf(FIELDS[key].type) };
}
function slotHTML(f, i, s) {
  const on = !!(ACT && ACT.oid === f.o.ofpId && ACT.key === f.key && ACT.s === i), val = fmtSlot(s.k, f.v[s.k], on);
  const g = !val && s.ghost ? ghostVal(f, s.k) : '';
  const wrap = s.k === 'via' || s.k === 'trend' ? ' svwrap' : '';
  let inner = val ? `<span class="sv${wrap}">${esc(val)}</span>` : g ? `<span><span class="gh">${esc(fmtSlot(s.k, g, false))}</span><span class="gtag">${GHOST_TAG[s.ghost][0]}</span></span>` : `<span class="pl">${esc(s.ph)}</span>`;
  if (!val && s.k === 'cld' && f.v.vis === 'CAVOK') inner = '<span class="sv dim">v CAVOK</span>';
  const last = f.type === 'atis' && f.prev && f.prev.length ? f.prev[f.prev.length - 1] : null;
  const same = !!(last && val && s.k !== 'info' && last.info !== f.v.info && last.v && JSON.stringify(last.v[s.k]) === JSON.stringify(f.v[s.k]));
  if (same) inner = `<span><span class="sv${wrap}">${esc(val)}</span><span class="gtag">= ${esc(last.info)}</span></span>`;
  return `<button type="button" class="ak-slot${s.w ? ' wide' : ''}${g ? ' ghost' : ''}${same ? ' carry' : ''}${on ? ' on' : ''}${on && ACT.fresh ? ' fresh' : ''}" data-ak-slot="${i}" data-ak-f="${f.key}" data-ak-o="${esc(f.o.ofpId)}" aria-pressed="${on}"><span class="sl">${esc(s.l)}</span>${inner}</button>`;
}
function slotsHTML(f) { return f.L.map((s, i) => (!s.skip || hasVal(f, i) || (ACT && ACT.oid === f.o.ofpId && ACT.key === f.key && ACT.s === i)) ? slotHTML(f, i, s) : '').join('') }
function outHTML(f) {
  const line = f.st.text;
  return `<span class="label">Do OFP</span><span class="mono">${line ? esc(line) : '<span class="muted">–</span>'}</span>`;
}
function remsHTML(f) {
  const r = userCfg().rem; if (!r.length) return '';
  return '<span class="label">Rychle do poznámky</span>' + r.map(x => `<button type="button" class="ak-rem" data-ak-rem="${esc(x)}" data-ak-f="${f.key}" data-ak-o="${esc(f.o.ofpId)}">${esc(x.replace(/_/g, '…'))}</button>`).join('');
}
// earlier ATIS of this flight (a new letter keeps the values; the old line stays here)
function prevHTML(f) {
  if (f.type !== 'atis' || !f.prev || !f.prev.length) return '';
  return '<span class="label">Předchozí</span>' + f.prev.slice(-2).reverse().map(p => `<span class="mono">${esc(p.line)}</span>`).join('');
}
// the field inside the OFP view; locked (closed / voided) OFPs show only the stored line
function field(o, key, locked) {
  const F0 = FIELDS[key]; if (!F0) return '';
  const apt = aptOf(o, key), id = domId(o, key);
  const head = `<div class="atf-h"><span class="label">${esc(F0.title)}</span><span class="mono muted">${esc(apt)}${F0.type === 'clr' && o.des ? ' → ' + esc(o.des) : ''}</span>${F0.type === 'atis' && !(locked || o.closed || o.void) ? `<span class="sp"></span><button type="button" class="btn sm" data-ak-new="${key}" data-ak-o="${esc(o.ofpId)}">Nový ATIS</button>` : ''}</div>`;
  if (locked || o.closed || o.void) return `<div class="atf">${head}<p class="mono atf-ro">${esc(API.ofpVal(o, key) || '–')}</p></div>`;
  const st = load(o, key), f = { o, key, type: F0.type, v: st.v, st, prev: st.prev, L: slotsOf(F0.type) };
  return `<div class="atf" id="${id}">${head}
    <div class="ak-slots" id="${id}-sl" role="group" aria-label="${esc(F0.title)}">${slotsHTML(f)}</div>
    <div class="atf-note" data-keep><input type="text" id="${id}-nt" data-ak-note="${key}" data-ak-o="${esc(o.ofpId)}" value="${esc(st.note)}" placeholder="Poznámka klávesnicí iPadu, jen výjimečně" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Poznámka ${esc(F0.title)}"></div>
    ${F0.type === 'atis' ? `<div class="ak-rems" id="${id}-rm">${remsHTML(f)}</div>` : ''}
    <div class="atf-out" id="${id}-out">${outHTML(f)}</div>
    ${F0.type === 'atis' ? `<div class="atf-prev" id="${id}-pv">${prevHTML(f)}</div>` : ''}</div>`;
}
function refreshField(oid, key) {
  const f = ctxOf(oid, key); if (!f) return; const id = domId(f.o, key);
  const sl = document.getElementById(id + '-sl'); if (sl) sl.innerHTML = slotsHTML(f);
  const out = document.getElementById(id + '-out'); if (out) out.innerHTML = outHTML(f);
  const pv = document.getElementById(id + '-pv'); if (pv) pv.innerHTML = prevHTML(f);
  const nt = document.getElementById(id + '-nt'); if (nt && document.activeElement !== nt && nt.value !== f.st.note) nt.value = f.st.note;
}

// keypad blocks: [label, caption, (unused), spans two columns]
const RWY_TOK = [['ILS', ''], ['RNP', ''], ['LOC', 'localizer'], ['VOR', ''], ['NDB', ''], ['VISUAL', 'visual'], ['CIRCL', 'circling'], ['CAT II', 'ILS CAT II'],
  ['Z', 'varianta'], ['Y', 'varianta'], ['X', 'varianta'], null, ['L', 'left'], ['C', 'centre'], ['R', 'right']];
const MET_TOK = [['VRB', 'variable'], ['G', 'gusting'], ['V', 'var. between'], ['CAVOK', ''], ['9999', '10 km +'],
  ['FEW', 'few'], ['SCT', 'scattered'], ['BKN', 'broken'], ['OVC', 'overcast'], ['NSC', 'no sig. cloud'],
  ['CB', ''], ['TCU', ''], ['VV', 'vert. vis'], ['TEMPO', ''], ['BECMG', ''],
  // the last row: NOSIG and the keys that open another keypad (outlined, with an arrow) – they do not write a value themselves
  ['NOSIG', ''], ['RVR', 'runway vis. ›', null, 0, 'nav'], ['JEVY', 'déšť, mlha… ›', null, 0, 'nav'], ['STAV RWY', 'kontaminace · RWYCC ›', null, 1, 'nav']];
const WX_TOK = [['−', 'light'], ['+', 'heavy'], ['VC', 'vicinity'], ['SH', 'showers'], ['TS', 'thunderstorm'], ['RA', 'rain'], ['SN', 'snow'], ['DZ', 'drizzle'], ['FZ', 'freezing'], ['GR', 'hail'], ['BR', 'mist'], ['FG', 'fog'], ['HZ', 'haze'], ['PL', 'ice pellets'], null];
const CLD_ROW = [['FEW', 'few'], ['SCT', 'scattered'], ['BKN', 'broken'], ['OVC', 'overcast'], ['NSC', 'no sig. cloud']];
// trend: wind first (VRB, G), then visibility, weather and cloud – TEMPO / BECMG / NOSIG sit in the chips above
const TREND_TOK = [['VRB', 'variable'], ['G', 'gusting'], ['CAVOK', ''], ['9999', '10 km +'], ['NSW', 'no sig. wx'],
  ['−', 'light'], ['+', 'heavy'], ['VC', 'vicinity'], ['SH', 'showers'], ['TS', 'thunderstorm'],
  ['RA', 'rain'], ['SN', 'snow'], ['DZ', 'drizzle'], ['FZ', 'freezing'], ['GR', 'hail'],
  ['BR', 'mist'], ['FG', 'fog'], ['HZ', 'haze'], ['TCU', ''], ['NSC', 'no sig. cloud'],
  ['FEW', 'few'], ['SCT', 'scattered'], ['BKN', 'broken'], ['OVC', 'overcast'], ['CB', '']];
const TURN_TOK = [['STRAIGHT', 'straight ahead', null, 1], ['PASSING', 'when passing', null, 1], ['LEFT', 'turn left'], ['RIGHT', 'turn right'], ['HDG', 'heading'], ['SID', 'zpět na písmena']];
const COND_TOK = [['DRY', 'dry'], ['WET', 'wet'], ['FROST', 'frost'], ['SLUSH', 'slush'], ['ST WATER', 'standing water'], ['DRY SNOW', 'dry snow'], ['WET SNOW', 'wet snow'], ['COMP SNOW', 'compacted snow'], ['ICE', 'ice'], ['WET ICE', 'wet ice'], null, null];
function keyBtn(code, label, cls, small, dis) { return `<button type="button" class="ak-key${cls ? ' ' + cls : ''}" data-ak="${esc(code)}"${dis ? ' disabled' : ''}>${label}${small ? `<small>${esc(small)}</small>` : ''}</button>` }
// a lit key shows what is set now (G = the wind has gusts), not which keys belong to the field
function grid(list, ON, prefix) { return list.map(x => x ? keyBtn((prefix || 'tok:') + x[0], esc(x[0]), 't' + (ON && ON.has(x[0]) ? ' on' : '') + (x[3] ? ' s2' : '') + (x[4] ? ' ' + x[4] : '') + (x[0].length > 5 ? ' sm' : ''), x[1]) : '<span></span>').join('') }
function onSet(f, k, kind) {
  const v = f.v, S = new Set();
  if (kind === 'rwy') { const p = appParts(v.app); if (p.b) S.add(p.b); if (p.x) S.add(p.x); if (p.c) S.add('CAT II'); const m = /^\d{2}([LCR])$/.exec(v.rwy || ''); if (m) S.add(m[1]) }
  if (kind === 'met' || kind === 'wx') {
    if (v.wind) { const w = windParts(v.wind); if (w.dir === 'VRB') S.add('VRB'); if (w.g !== null) S.add('G'); if (w.v !== null) S.add('V') }
    if (v.vis === 'CAVOK' || v.vis === '9999') S.add(v.vis);
    const c = v.cld[v.cld.length - 1]; if (c) { S.add(c.t); if (c.x) S.add(c.x) }
    if (TREND_KW.includes(v.trend[0])) S.add(v.trend[0]);
    if (kind === 'wx') for (const a of v.wx) S.add(a);
  }
  if (kind === 'cond') for (const x of v.cond.s) S.add(x);
  if (kind === 'trend') { const t = v.trend; let j = t.length - 1; while (j >= 0 && !TREND_KW.includes(t[j])) S.add(t[j--]); if (j >= 0) S.add(t[j]) }
  if (kind === 'turn' && isStr(v.route)) { const o = strParse(v.route); S.add('STRAIGHT'); if (o.p !== null) S.add('PASSING'); if (o.t) S.add(o.t === 'L' ? 'LEFT' : 'RIGHT'); if (o.h !== null) S.add('HDG') }
  return S;
}
function ctxKind(f, k) {
  if (isTaxi(f)) return 'taxi';
  if (f.type === 'atis') { if (k === 'info') return 'abc'; if (k === 'app' || k === 'rwy' || k === 'tl') return 'rwy'; if (k === 'cond') return 'cond'; if (k === 'trend') return 'trend'; if (k === 'wx') return 'wx'; if (k === 'time') return 'read'; return 'met' }
  if (k === 'route') return f.type === 'clr' && isStr(f.v.route) ? 'turn' : 'abc'; if (f.type === 'star' && (k === 'app' || k === 'rwy')) return 'rwy'; return 'read';
}
const chipLabel = (k, v) => k === 'rwy' ? 'RWY ' + v : k === 'tl' ? 'TL' + v : k === 'alt' ? fmtAlt(v) : k === 'freq' ? fmtFreq(v) : k === 'via' ? fmtVia(v) : k === 'stand' ? 'STAND ' + v : k === 'hp' ? 'HP ' + v : fmtRoute(v);
function dockEl() {
  let d = document.getElementById('akdock');
  if (!d) {
    d = document.createElement('div'); d.id = 'akdock'; d.className = 'ak-dock'; d.hidden = true;
    d.innerHTML = '<div class="ak-in"><button type="button" class="ak-x" data-ak="x" aria-label="Zavřít klávesnici" title="Zavřít klávesnici">×</button><div class="ak-top"><span class="ak-title" id="ak-title"></span><span class="ak-hint" id="ak-hint"></span><div class="ak-chips" id="ak-chips"></div></div><div class="ak-grid"><div class="ak-ctx" id="ak-ctx"></div><div class="ak-dig" id="ak-dig"></div><div class="ak-act" id="ak-act"></div></div></div>';
    document.body.appendChild(d);
  }
  return d;
}
function hideDock() { const d = document.getElementById('akdock'); if (d && !d.hidden) { d.hidden = true; document.body.style.paddingBottom = '' } VIS = null }
const letters = (code, on) => Object.keys(PHON).map(x => keyBtn(code + x, x, 't' + (on === x ? ' on' : ''), PHON[x])).join('');
function renderDock() {
  if (ACT && ACT.mode === 'atc') { renderAtc(); return }
  if (ACT && ACT.mode === 'num') { renderNum(); return }
  const f = ACT && ctxOf(ACT.oid, ACT.key);
  const sheetOpen = !!document.querySelector('#sheet:not([hidden])');
  if (!f || !document.getElementById(domId(f.o, f.key)) || sheetOpen) { if (!f || !document.getElementById(domId(f.o, f.key))) ACT = null; hideDock(); return }
  if (ACT.mode === 'note') { renderNote(f); return }
  if (ACT.s < 0 || ACT.s >= f.L.length) ACT.s = 0;
  const s = f.L[ACT.s], k = s.k, d = dockEl(), kind = ctxKind(f, k), ON = onSet(f, k, kind);
  d.querySelector('#ak-title').textContent = FIELDS[f.key].title + ' · ' + s.l;
  const hint = d.querySelector('#ak-hint'); hint.textContent = HINT || s.h; hint.classList.toggle('warn', !!HINT);
  let ch = ''; const g = s.ghost ? ghostVal(f, k) : '';
  if (g && f.v[k] !== g) ch += `<button type="button" class="ak-chip ok" data-ak="gh:">✓ ${esc(fmtSlot(k, g, false))}<small>${GHOST_TAG[s.ghost][1]}</small></button>`;
  const fx = fixVal(f, k);
  if (fx && !isHdg(f.v[k]) && !isDct(f.v[k]) && !String(f.v[k] || '').startsWith(fx)) ch += `<button type="button" class="ak-chip pre" data-ak="pre:${esc(fx)}">${esc(fx)}…<small>bod z OFP</small></button>`;
  if (kind === 'trend') ch += TREND_KW.map(x => `<button type="button" class="ak-chip${ON.has(x) ? ' on' : ''}" data-ak="tr:${x}">${x}</button>`).join('');
  if ((['rwy', 'tl', 'route', 'alt', 'freq', 'stand', 'hp'].includes(k) || (k === 'via' && !f.v.via.length)) && !(f.type === 'clr' && k === 'rwy')) {
    const hs = history(f, k).filter(x => x !== g);
    if (hs.length) ch += `<span class="ak-cl">Dříve na ${esc(aptOf(f.o, f.key))}:</span>` + hs.map(x => `<button type="button" class="ak-chip" data-ak="${Array.isArray(x) ? 'chipj:' + esc(JSON.stringify(x)) : 'chip:' + esc(x)}">${esc(chipLabel(k, x))}</button>`).join('');
  }
  if (ACT.newAtis && f.type === 'atis') ch = `<button type="button" class="ak-chip pre" data-ak="clean:">Celý jiný<small>smazat hodnoty z ${esc(ACT.newAtis)}</small></button>` + ch;
  d.querySelector('#ak-chips').innerHTML = ch;
  const ctx = d.querySelector('#ak-ctx');
  if (kind === 'abc') {
    const r = f.v.route || '';
    const extra = k === 'route' ? [f.type === 'clr' ? keyBtn('tok:STRAIGHT', 'STRAIGHT', 't sm', 'straight ahead') : keyBtn('tok:DCT', 'DCT', 't kdct' + (isDct(r) ? ' on' : ''), 'direct to bod'), keyBtn('tok:HDG', 'HDG', 't' + (/^HDG/.test(r) ? ' on' : ''), 'kurz + číslo')] : ['<span></span>', '<span></span>'];
    ctx.className = 'ak-ctx abc'; ctx.innerHTML = letters('let:', k === 'info' ? f.v.info : null) + extra.join('');
  } else if (kind === 'taxi') {
    const dep = f.type === 'taxi';
    ctx.className = 'ak-ctx abc r5';
    // SPOJIT and EXIT sit next to the 0 (the − and / keys are not used for taxi), so they are not lost among the letters
    ctx.innerHTML = letters('let:', null) + keyBtn('tok:CROSS', 'CROSS', 't sm', 'cross') + keyBtn('tok:BKTRK', 'BKTRK', 't sm', 'backtrack')
      + keyBtn('tok:EXIT', 'EXIT', 't s2', 'exit 15') + (dep ? keyBtn('tok:HP', 'HP', 't s2' + (k === 'hp' ? ' on' : ''), 'holding point') : keyBtn('tok:STAND', 'STAND', 't s2' + (k === 'stand' ? ' on' : ''), 'stání'))
      + keyBtn('tok:HS', 'HOLD SHORT', 't s3', 'hold short of');
  }
  else if (kind === 'rwy') { ctx.className = 'ak-ctx c4'; ctx.innerHTML = grid(RWY_TOK, ON) + (f.type === 'atis' ? keyBtn('tok:STAV RWY', 'STAV RWY', 't sm nav', 'kontaminace ›') : '<span></span>') }
  else if (kind === 'cond') { ctx.className = 'ak-ctx c4'; ctx.innerHTML = grid(COND_TOK, ON, 'rc:') }
  else if (kind === 'turn') { ctx.className = 'ak-ctx c4'; ctx.innerHTML = grid(TURN_TOK, ON); if (!HINT) hint.textContent = 'Straight ahead: PASSING a výška, LEFT / RIGHT, HDG a tři číslice. Pak Další ›.' }
  else if (kind === 'met') { ctx.className = 'ak-ctx c5'; ctx.innerHTML = grid(MET_TOK, ON) }
  else if (kind === 'wx') { ctx.className = 'ak-ctx c5'; ctx.innerHTML = grid(WX_TOK, ON, 'wx:') + grid(CLD_ROW, ON) }
  else if (kind === 'trend') { ctx.className = 'ak-ctx c5 r5'; ctx.innerHTML = grid(TREND_TOK, ON, 'tr:') }
  else { ctx.className = 'ak-ctx read'; ctx.innerHTML = `<div class="ak-readout"><span class="sl">${esc(s.l)}</span><span class="rv">${esc(fmtSlot(k, f.v[k], true) || '–')}</span></div>` + (k === 'alt' ? `<div class="ak-rrow">${keyBtn('tok:FL', 'FL', 't' + (String(f.v.alt).startsWith('FL') ? ' on' : ''), 'flight level')}</div>` : '') }
  const tdp = k === 'tdp', slash = tdp || k === 'rvr', tj = digTarget(f);
  const ok = n => tj >= 0 && okDigit(f.v, f.L[tj].k, n, tj === ACT.s ? ACT.fresh : freshOf(f, tj));
  d.querySelector('#ak-dig').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => keyBtn('d:' + n, n, '', null, !ok(n))).join('')
    + (kind === 'taxi' ? keyBtn('tok:SPOJIT', 'SPOJIT', 't join', 'T A → TA') + keyBtn('d:0', '0', '', null, !ok('0')) + keyBtn('tok:RWY', 'RWY', 't' + (k === 'rwy' ? ' on' : ''), 'runway')
      : keyBtn('d:-', '−', '', null, !tdp) + keyBtn('d:0', '0', '', null, !ok('0')) + keyBtn('d:/', '/', '', null, !slash));
  d.querySelector('#ak-act').innerHTML = keyBtn('bk', '⌫', 'bk', 'smazat') + keyBtn('next', 'Další ›', 't nx') + keyBtn('done', 'Hotovo', 't okk');
  const was = d.hidden; d.hidden = false;
  requestAnimationFrame(() => { document.body.style.paddingBottom = (d.offsetHeight + 16) + 'px'; if (was || VIS !== f.key + f.o.ofpId) { VIS = f.key + f.o.ofpId; ensureVisible(domId(f.o, f.key)) } });
}
// the note on the eTechLog keypad: letters, digits and a space (TWY _ CLSD puts the cursor where the taxiway goes)
function renderNote(f) {
  const d = dockEl(), note = f.st.note, pos = Math.max(0, Math.min(ACT.pos == null ? note.length : ACT.pos, note.length));
  d.querySelector('#ak-title').textContent = FIELDS[f.key].title + ' · POZNÁMKA';
  const hint = d.querySelector('#ak-hint'); hint.classList.remove('warn');
  hint.innerHTML = `<span class="ak-noteread">${esc(note.slice(0, pos))}<span class="ak-caret"></span>${esc(note.slice(pos))}</span>`;
  d.querySelector('#ak-chips').innerHTML = '';
  const ctx = d.querySelector('#ak-ctx'); ctx.className = 'ak-ctx abc';
  ctx.innerHTML = Object.keys(PHON).map(x => keyBtn('nt:' + x, x, 't', PHON[x])).join('') + keyBtn('nt:/', '/', 't') + keyBtn('nt:,', ',', 't');
  d.querySelector('#ak-dig').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => keyBtn('nt:' + n, n)).join('') + keyBtn('nt:-', '−') + keyBtn('nt:0', '0') + keyBtn('nt:.', '.');
  d.querySelector('#ak-act').innerHTML = keyBtn('bk', '⌫', 'bk', 'smazat') + keyBtn('nt: ', 'Mezera', 't nx') + keyBtn('done', 'Hotovo', 't okk');
  const was = d.hidden; d.hidden = false;
  requestAnimationFrame(() => { document.body.style.paddingBottom = (d.offsetHeight + 16) + 'px'; if (was || VIS !== 'n' + f.key + f.o.ofpId) { VIS = 'n' + f.key + f.o.ofpId; ensureVisible(domId(f.o, f.key)) } });
}
function openNote(oid, key, tpl) {
  const f = ctxOf(oid, key); if (!f) return;
  let note = f.st.note.trim(), pos;
  if (tpl) { const pre = note ? note + ', ' : '', t = tpl.replace(/_/g, ''); pos = pre.length + tpl.indexOf('_'); note = pre + t } else pos = note.length;
  const prevAct = ACT && !(ACT.oid === oid && ACT.key === key) ? ACT : null;
  ACT = { oid, key, s: -1, fresh: false, mode: 'note', pos }; HINT = null;
  save(f.o, key, { v: f.v, note, prev: f.prev });
  leave(prevAct);
  refreshField(oid, key); renderDock();
}
function notePress(f, code) {
  let note = f.st.note, pos = Math.max(0, Math.min(ACT.pos == null ? note.length : ACT.pos, note.length));
  if (code === 'done') { note = note.replace(/ {2,}/g, ' ').replace(/ ,/g, ',').trim(); save(f.o, f.key, { v: f.v, note, prev: f.prev }); close(); return }
  if (code === 'bk') { if (pos > 0) { note = note.slice(0, pos - 1) + note.slice(pos); pos-- } }
  else if (code.startsWith('nt:')) { const ch = code.slice(3); note = note.slice(0, pos) + ch + note.slice(pos); pos += ch.length }
  ACT.pos = pos; save(f.o, f.key, { v: f.v, note, prev: f.prev }); refreshField(f.o.ofpId, f.key); renderDock();
}
function ensureVisible(id) {
  const el = document.getElementById(id), d = document.getElementById('akdock'); if (!el || !d) return;
  const r = el.getBoundingClientRect(), lim = innerHeight - d.offsetHeight - 12, top = 130;
  let dy = 0; if (r.bottom > lim) dy = r.bottom - lim; if (r.top - dy < top) dy = r.top - top;
  if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'smooth' });
}
function open(oid, key, i) {
  const f = ctxOf(oid, key); if (!f) return;
  const prev = ACT && ACT.oid === oid && ACT.key === key && ACT.mode !== 'atc' ? null : ACT;
  ACT = { oid, key, s: 0, fresh: false }; setSlot(f, i == null ? firstEmpty(f) : i); HINT = null;
  leave(prev);
  refreshField(oid, key); renderDock();
}
function close() { const p = ACT; ACT = null; HINT = null; hideDock(); leave(p) }
// the field the keypad leaves: an unfinished ATC instruction is written, the field shows its new state
function leave(p) { if (!p) return; if (p.mode === 'num') { numMark(p, false); return } if (p.mode === 'atc') { atcCommit(p); atcRefresh(p) } else refreshField(p.oid, p.key) }
function press(code) {
  if (!ACT) return; HINT = null;
  // × closes the keypad; what is typed stays, only an ATC instruction not yet added is dropped
  if (code === 'x') { if (ACT.mode === 'atc') ACT.cur = ''; close(); return }
  if (ACT.mode === 'atc') { atcPress(code); return }
  if (ACT.mode === 'num') { numPress(code); return }
  const f = ctxOf(ACT.oid, ACT.key); if (!f) { close(); return }
  if (ACT.mode === 'note') { notePress(f, code); return }
  if (code === 'done') { close(); return }
  if (code === 'next') { const j = nextIdx(f); if (j < 0) { close(); return } setSlot(f, j); refreshField(f.o.ofpId, f.key); renderDock(); return }
  apply(f, code);
  save(f.o, f.key, { v: f.v, note: f.st.note, prev: f.prev });
  refreshField(f.o.ofpId, f.key); renderDock();
}

// ---------- ATC instructions in flight: nav log notes on the same keypad, each one stamped with the UTC time ----------
// stored like the notes of 0.6.13 ("a · b · c" under w<i>_note), so the PDF and an older version show them unchanged
const NOTE_SEP = ' · ';
const ATC_W = ['CLB', 'DES', 'HDG', 'DCT', 'LEFT', 'RIGHT', 'SPD', 'FREQ', 'QNH', 'SQ', 'HOLD', 'EXPECT', 'MAINT', 'OWN NAV'];
const ATC_TOK = [['CLB', 'climb'], ['DES', 'descend'], ['FL', 'flight level'], ['HDG', 'heading'], ['DCT', 'direct to', null, 0, 'kdct'],
  ['LEFT', 'turn left'], ['RIGHT', 'turn right'], ['SPD', 'speed kt'], ['M.', 'mach'], ['FREQ', 'contact', null, 0, 'kfreq'],
  ['QNH', ''], ['SQ', 'squawk'], ['HOLD', 'holding'], ['EXPECT', ''], ['MAINT', 'maintain']];
const nbId = (oid, key) => 'nb-' + String(oid).replace(/[^A-Za-z0-9]/g, '_') + '-' + key;
const atcParts = t => String(t || '').split(NOTE_SEP).map(x => x.trim()).filter(Boolean);
const utcHM = () => new Date().toISOString().slice(11, 16);
const spc = s => s && !s.endsWith(' ') ? s + ' ' : s;
// spacing as written on paper: CLB FL360, HDG 250, DCT WW673, FREQ 133.355 (dot after three digits), M.78
function atcType(s, c) {
  const lw = s.slice(s.lastIndexOf(' ') + 1), word = ATC_W.includes(lw) || / ?OWN NAV$/.test(s);
  if (c === ' ') return spc(s);
  if (c === 'FL' || c === 'M.' || ATC_W.includes(c)) return spc(s) + c;
  if (/^\d$/.test(c)) {
    const fm = /(^| )FREQ ?([\d.]*)$/.exec(s);
    if (fm) { const n = freqNorm(fm[2].replace('.', '') + c); if (!freqPre(n)) return s; return s.slice(0, s.length - fm[0].length) + fm[1] + 'FREQ ' + (n.length > 3 ? n.slice(0, 3) + '.' + n.slice(3) : n) }
    if (!s || s.endsWith(' ')) return s + c;
    if (/(FL|M\.)$/.test(s) || /[\d.]$/.test(s)) return s + c;
    return word ? s + ' ' + c : s + c;
  }
  if (/^[A-Z]$/.test(c)) { if (!s || s.endsWith(' ')) return s + c; return word || /^(FL)?[\d.]+$/.test(lw) || /^M\.\d*$/.test(lw) ? s + ' ' + c : s + c }
  if (c === '.' || c === '/') return s + c;
  return s;
}
function atcBack(s) { const m = /(^| )(OWN NAV|CLB|DES|HDG|DCT|LEFT|RIGHT|SPD|FREQ|QNH|SQ|HOLD|EXPECT|MAINT|FL|M\.)$/.exec(s); return m ? s.slice(0, m.index) : s.slice(0, -1) }
function atcCommit(p) {
  const t = String(p.cur || '').replace(/·/g, ' ').replace(/\s+/g, ' ').trim().replace(/(^| )FREQ (\d{3})(?:\.(\d*))?(?= |$)/g, (x, a, m, dec) => a + 'FREQ ' + m + '.' + (dec || '').padEnd(2, '0')); if (!t) return false;
  const o = API.ofpOf(p.oid); if (!o || o.closed || o.void) return false;
  const parts = atcParts(API.ofpVal(o, p.key)); parts.push(utcHM() + ' ' + t);
  API.ofpSet(p.oid, p.key, parts.join(NOTE_SEP)); p.cur = ''; p.abc = false;
  if (API.atcDone) API.atcDone(p.oid, p.key, t);
  return true;
}
function atcRefresh(p) { const o = API.ofpOf(p.oid), el = document.getElementById(nbId(p.oid, p.key)); if (o && el && API.noteBtn) el.outerHTML = API.noteBtn(o, p.key, p.wpt, false) }
function openAtc(oid, key, label, pts, wpt) {
  const o = API.ofpOf(oid); if (!o || o.closed || o.void) return;
  const p = ACT; ACT = { mode: 'atc', oid, key, label: label || wpt || '', wpt: wpt || label || '', pts: Array.isArray(pts) ? pts : [], cur: '', abc: false }; HINT = null;
  leave(p); renderDock();
}
function atcPress(code) {
  const o = API.ofpOf(ACT.oid); if (!o) { close(); return }
  if (code === 'done') { close(); return }
  if (code === 'add') { if (!atcCommit(ACT)) HINT = 'Nejdřív instrukce, pak Přidat ›.' }
  else if (code === 'bk') ACT.cur = atcBack(ACT.cur);
  else if (code === 'abc:') ACT.abc = !ACT.abc;
  else if (code === 'ipad:') { const p = ACT; close(); if (API.noteSheet) API.noteSheet(p.oid, p.key, p.wpt); return }
  else if (code.startsWith('ad:')) { const parts = atcParts(API.ofpVal(o, ACT.key)); parts.splice(+code.slice(3), 1); API.ofpSet(ACT.oid, ACT.key, parts.join(NOTE_SEP)) }
  else if (code.startsWith('pt:')) { ACT.cur = ACT.cur.replace(/(^| )DCT( [A-Z0-9]*)?$/, '$1DCT ' + code.slice(3)); ACT.abc = false }
  else if (code.startsWith('at:')) { const c = code.slice(3), was = ACT.cur; ACT.cur = atcType(ACT.cur, c); if (c === 'DCT') ACT.abc = true; if (ACT.cur === was && /^\d$/.test(c)) HINT = DIG_HINT.freq }
  atcRefresh(ACT); renderDock();
}
function renderAtc() {
  const o = API.ofpOf(ACT.oid), id = nbId(ACT.oid, ACT.key), el = document.getElementById(id);
  const sheetOpen = !!document.querySelector('#sheet:not([hidden])');
  if (!o || o.closed || o.void || !el || sheetOpen) { if (!o || o.closed || o.void || !el) ACT = null; hideDock(); return }
  el.classList.add('editing');
  const d = dockEl(), cur = ACT.cur;
  d.querySelector('#ak-title').textContent = 'ATC · ' + ACT.label;
  const hint = d.querySelector('#ak-hint'); hint.classList.toggle('warn', !!HINT);
  hint.innerHTML = cur ? `<span class="ak-noteread">${esc(cur)}<span class="ak-caret"></span></span>` : esc(HINT || 'Jak zazní: CLB / DES a výška (FL a číslo), HDG a kurz, DCT a bod… Přidat › zapíše s časem UTC, další instrukce hned za ní.');
  const parts = atcParts(API.ofpVal(o, ACT.key));
  let ch = (API.noteSheet ? '<button type="button" class="ak-chip pre" data-ak="ipad:">Text z iPadu<small>volný text</small></button>' : '') + (parts.length ? '<span class="ak-cl">Zapsáno:</span>' : '') + parts.map((x, i) => `<span class="ak-ent">${esc(x)}<button type="button" data-ak="ad:${i}" aria-label="Smazat ${esc(x)}">×</button></span>`).join('');
  if (/(^| )DCT( [A-Z0-9]*)?$/.test(cur) && ACT.pts.length) ch = '<span class="ak-cl">Body tratě:</span>' + ACT.pts.map(x => `<button type="button" class="ak-chip" data-ak="pt:${esc(x)}">${esc(x)}</button>`).join('');
  d.querySelector('#ak-chips').innerHTML = ch;
  const ctx = d.querySelector('#ak-ctx');
  if (ACT.abc) { ctx.className = 'ak-ctx abc'; ctx.innerHTML = letters('at:', null) + keyBtn('abc:', '‹ INSTR.', 't sm', 'tlačítka') + keyBtn('at: ', 'MEZERA', 't sm') }
  else { ctx.className = 'ak-ctx c5'; ctx.innerHTML = grid(ATC_TOK, null, 'at:') + keyBtn('abc:', 'ABC', 't s2', 'písmena: bod, text') + keyBtn('at: ', 'MEZERA', 't sm s2') + keyBtn('at:OWN NAV', 'OWN NAV', 't sm', 'resume own') }
  d.querySelector('#ak-dig').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => keyBtn('at:' + n, n)).join('') + keyBtn('at:.', '.') + keyBtn('at:0', '0') + keyBtn('at:/', '/');
  d.querySelector('#ak-act').innerHTML = keyBtn('bk', '⌫', 'bk', 'smazat') + keyBtn('add', 'Přidat ›', 't nx', 's časem UTC') + keyBtn('done', 'Hotovo', 't okk');
  const was = d.hidden; d.hidden = false;
  requestAnimationFrame(() => { document.body.style.paddingBottom = (d.offsetHeight + 16) + 'px'; if (was || VIS !== id) { VIS = id; ensureVisible(id) } });
}

// ---------- numbers only: performance fields (TO / LD weight, V-speeds, distances, flaps) ----------
// The iPad has no keyboard with digits only; these fields (inputmode="none", class npad) get the eTechLog keypad instead.
// The value goes into the field itself (input event), so saving and the limit check stay as for typing.
const numEl = p => { const c = document.querySelector(`[data-ofp="${CSS.escape(p.ofp)}"]`); return c && c.querySelector(`input.npad[data-of="${CSS.escape(p.of)}"]`) };
function numMark(p, on) { const el = numEl(p), f = el && el.closest('.fld'); if (f) f.classList.toggle('npad-on', on) }
function openNum(el) {
  if (el.readOnly || el.disabled) return; const c = el.closest('[data-ofp]'); if (!c || !el.dataset.of) return;
  const p = ACT; if (p && p.mode === 'num' && p.of === el.dataset.of && p.ofp === c.dataset.ofp) return;
  ACT = { mode: 'num', ofp: c.dataset.ofp, of: el.dataset.of, fresh: !!el.value }; HINT = null; leave(p); numMark(ACT, true); renderDock();
}
function numSet(el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) }
function numPress(code) {
  const el = numEl(ACT); if (!el) { close(); return }
  if (code === 'done') { close(); try { el.blur() } catch (e) { } return }
  if (code === 'next') {
    // next field in page order, whichever keyboard it uses (Power, MA grad: iPad keyboard); a prefilled flaps field is jumped over
    const nx = API && API.nextField ? API.nextField(el) : null;
    if (nx) { const p = ACT; ACT = null; numMark(p, false); nx.focus(); if (nx.matches('input.npad')) openNum(nx); else hideDock() } else { close(); try { el.blur() } catch (e) { } } return;
  }
  if (code === 'bk') { numSet(el, ACT.fresh ? '' : el.value.slice(0, -1)); ACT.fresh = false }
  else if (code.startsWith('n:')) { const d = code.slice(2); numSet(el, (ACT.fresh ? '' : el.value) + d); ACT.fresh = false }
  renderNum();
}
function renderNum() {
  const el = numEl(ACT); const sheetOpen = !!document.querySelector('#sheet:not([hidden])');
  if (!el || el.readOnly || el.disabled || sheetOpen) { if (!el || el.readOnly || el.disabled) { const p = ACT; ACT = null; leave(p) } hideDock(); return }
  numMark(ACT, true);
  const d = dockEl(), f = el.closest('.fld'), lab = f ? (f.querySelector('span') || f).childNodes[0].textContent.trim() : ACT.of;
  d.querySelector('#ak-title').textContent = lab;
  const mx = el.dataset.max ? +el.dataset.max : null, over = mx != null && el.value !== '' && +el.value > mx;
  const hint = d.querySelector('#ak-hint'); hint.classList.toggle('warn', over);
  hint.textContent = over ? `Víc než maximum ${mx}.` : (ACT.fresh && el.value ? 'První číslice nahradí hodnotu. ' : '') + 'Další › = další pole, Hotovo zavře.' + (mx != null ? ` Max ${mx}.` : '');
  d.querySelector('#ak-chips').innerHTML = '';
  const ctx = d.querySelector('#ak-ctx'); ctx.className = 'ak-ctx read';
  ctx.innerHTML = `<div class="ak-readout"><span class="sl">${esc(lab)}</span><span class="rv">${esc(el.value || '–')}</span></div>`;
  d.querySelector('#ak-dig').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => keyBtn('n:' + n, n)).join('') + '<span></span>' + keyBtn('n:0', '0') + '<span></span>';
  d.querySelector('#ak-act').innerHTML = keyBtn('bk', '⌫', 'bk', 'smazat') + keyBtn('next', 'Další ›', 't nx') + keyBtn('done', 'Hotovo', 't okk');
  const was = d.hidden; d.hidden = false; const key = 'num' + ACT.of;
  requestAnimationFrame(() => { document.body.style.paddingBottom = (d.offsetHeight + 16) + 'px'; if (was || VIS !== key) { VIS = key; const r = el.getBoundingClientRect(), lim = innerHeight - d.offsetHeight - 12; if (r.bottom > lim || r.top < 130) window.scrollBy({ top: r.bottom > lim ? r.bottom - lim : r.top - 130, behavior: 'smooth' }) } });
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
    <label class="fld"><span>Rychlé poznámky k ATIS (oddělte čárkou; _ = doplníte na klávesnici, např. TWY _ CLSD)</span><input type="text" id="ak-rem" value="${esc(c.rem.join(', '))}" autocomplete="off" spellcheck="false" autocapitalize="characters"></label>`;
}
function cfgEditor() { DRAFT = userCfg(); return `<div id="ak-cfgbox">${cfgInner()}</div>` }
function cfgRedraw(focusSel) { const b = document.getElementById('ak-cfgbox'); if (!b) return; const rem = document.getElementById('ak-rem'); if (rem) DRAFT.rem = remList(rem.value); b.innerHTML = cfgInner(); if (focusSel) { const x = b.querySelector(focusSel); if (x && !x.disabled) x.focus() } }
const remList = s => String(s || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 12);
function cfgResult() { const rem = document.getElementById('ak-rem'); if (rem) DRAFT.rem = remList(rem.value); return sanitize(DRAFT) }

// ---------- events ----------
function bind(api) {
  API = api;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ak],[data-ak-slot],[data-ak-rem],[data-ak-new],[data-ak-mv],[data-ak-preset]'); if (!b || b.disabled) return;
    if (b.dataset.ak != null) { press(b.dataset.ak); return }
    if (b.dataset.akSlot != null) { open(b.dataset.akO, b.dataset.akF, +b.dataset.akSlot); return }
    if (b.dataset.akRem != null) {
      if (b.dataset.akRem.includes('_')) { openNote(b.dataset.akO, b.dataset.akF, b.dataset.akRem); return }
      const f = ctxOf(b.dataset.akO, b.dataset.akF); if (!f) return;
      const note = (f.st.note.trim() ? f.st.note.trim() + ', ' : '') + b.dataset.akRem; save(f.o, f.key, { v: f.v, note, prev: f.prev });
      refreshField(f.o.ofpId, f.key); return;
    }
    if (b.dataset.akNew != null) {
      const f = ctxOf(b.dataset.akO, b.dataset.akNew); if (!f) return; const i = idxOf(f, 'info'); if (i < 0) return;
      open(b.dataset.akO, b.dataset.akNew, i); HINT = f.v.info ? `Písmeno nového ATIS. Hodnoty z ${f.v.info} zůstanou – přepíšete jen to, co se změnilo.` : null; renderDock(); return;
    }
    if (b.dataset.akPreset) { const rem = DRAFT.rem; DRAFT = presetCfg(b.dataset.akPreset); DRAFT.rem = rem; cfgRedraw(); return }
    if (b.dataset.akMv) { const [t, k, dd] = b.dataset.akMv.split('|'), L = DRAFT[t], i = L.findIndex(c => c.k === k), j = i + (+dd); if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; cfgRedraw(`[data-ak-mv="${t}|${k}|${dd}"]`) }
  });
  document.addEventListener('change', e => { const c = e.target.closest && e.target.closest('[data-ak-cfg]'); if (!c || !DRAFT) return; const [t, k] = c.dataset.akCfg.split('|'); const it = DRAFT[t].find(x => x.k === k); if (it) { it.on = c.checked; cfgRedraw() } });
  document.addEventListener('input', e => {
    const n = e.target.closest && e.target.closest('[data-ak-note]'); if (!n) return;
    const f = ctxOf(n.dataset.akO, n.dataset.akNote); if (!f) return; save(f.o, f.key, { v: f.v, note: n.value, prev: f.prev });
    const out = document.getElementById(domId(f.o, f.key) + '-out'); if (out) out.innerHTML = outHTML(ctxOf(f.o.ofpId, f.key));
  });
  // typing anywhere else (the note, another OFP field) puts the keypad away
  document.addEventListener('focusin', e => { const t = e.target; if (t && t.matches && t.matches('input.npad')) { openNum(t); return } if (ACT && t.matches && t.matches('input,textarea,select') && !t.closest('#akdock')) close() });
  document.addEventListener('keydown', e => {
    if (!ACT || e.metaKey || e.ctrlKey || e.altKey) return; if (e.target.closest && e.target.closest('input,textarea,select')) return;
    const d = document.getElementById('akdock'); if (!d || d.hidden) return;
    const key = e.key;
    if (ACT.mode === 'num') { if (/^[0-9]$/.test(key)) press('n:' + key); else if (key === 'Backspace') press('bk'); else if (key === 'Enter' || key === 'Tab') press('next'); else if (key === 'Escape') press('done'); else return; e.preventDefault(); return }
    if (ACT.mode === 'atc') { if (/^[a-zA-Z0-9]$/.test(key)) press('at:' + key.toUpperCase()); else if (key === ' ' || key === '.' || key === '/') press('at:' + key); else if (key === 'Backspace') press('bk'); else if (key === 'Enter') press('add'); else if (key === 'Escape') press('done'); else return; e.preventDefault(); return }
    const f = ctxOf(ACT.oid, ACT.key); if (!f) return;
    if (ACT.mode === 'note') { if (key.length === 1 && /[A-Za-z0-9 \/,.\-]/.test(key)) press('nt:' + key.toUpperCase()); else if (key === 'Backspace') press('bk'); else if (key === 'Enter' || key === 'Escape') press('done'); else return; e.preventDefault(); return }
    const k = f.L[ACT.s].k;
    if (/^[0-9]$/.test(key)) press('d:' + key); else if (key === 'Backspace') press('bk'); else if (key === 'Enter' || key === 'Tab') press('next'); else if (key === 'Escape') press('done');
    else if (key === '/' || key === '-') press('d:' + key); else if (/^[a-zA-Z]$/.test(key) && (['info', 'route'].includes(k) || isTaxi(f))) press('let:' + key.toUpperCase()); else return;
    e.preventDefault();
  });
  const sh = document.getElementById('sheet'); if (sh && typeof MutationObserver !== 'undefined') new MutationObserver(() => renderDock()).observe(sh, { attributes: true, attributeFilter: ['hidden'] });
}
// after every app render: keep the keypad on its field, or put it away when the field is gone
function after() { if (ACT) renderDock(); else hideDock() }

return {
  bind, field, after, cfgEditor, cfgResult, lineOf, plan, FIELDS, openAtc, nbId, openNum,
  // for tests
  _: { DEF, PRESETS, presetCfg, sanitize, empty, slotsOf, fmtSlot, outSlot, atomsStr, apply, setSlot, firstEmpty, nextIdx, fmtRoute, okDigit, fmtTrend, fmtVia, atcType, atcBack, atcCommit, fmtFreq, get ACT() { return ACT }, set ACT(x) { ACT = x }, get HINT() { return HINT } }
};
})();
