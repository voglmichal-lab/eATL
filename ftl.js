/* eTechLog – flight time limitations (EASA ORO.FTL / CS FTL.1), computed from the flights in the ATL.
   Pure functions, no DOM: the app passes legs of one crew member and the operator settings.
   Covers: duty / FDP from report to on-block, max daily FDP (ORO.FTL.205 tables 2 and 3), acclimatisation
   (ORO.FTL.105 table 1), split duty (CS FTL.1.220), WOCL and disruptive schedules, minimum rest (ORO.FTL.235(a)(b)),
   cumulative limits (ORO.FTL.210). Not covered: FDP extensions, in-flight rest, standby, reduced rest,
   recurrent extended recovery rest – and any duty that is not a flight in the ATL. */
self.ETL_FTL = (function () {
  'use strict';
  const MIN = 60000, H = 60 * MIN, DAY = 24 * H;

  /* ---------- airport time zones: by ICAO prefix, exceptions first, then operator overrides ---------- */
  const TZ_EXACT = {
    LPAZ: 'Atlantic/Azores', LPPD: 'Atlantic/Azores', LPLA: 'Atlantic/Azores', LPHR: 'Atlantic/Azores', LPFL: 'Atlantic/Azores',
    LPCR: 'Atlantic/Azores', LPGR: 'Atlantic/Azores', LPPI: 'Atlantic/Azores', LPSJ: 'Atlantic/Azores',
    EKVG: 'Atlantic/Faroe', GEML: 'Africa/Ceuta', GECE: 'Africa/Ceuta', LXGB: 'Europe/Gibraltar'
  };
  const TZ_PREFIX = {
    LK: 'Europe/Prague', LZ: 'Europe/Bratislava', ED: 'Europe/Berlin', ET: 'Europe/Berlin', LO: 'Europe/Vienna', LS: 'Europe/Zurich',
    LF: 'Europe/Paris', LE: 'Europe/Madrid', GC: 'Atlantic/Canary', LP: 'Europe/Lisbon', LI: 'Europe/Rome', LM: 'Europe/Malta',
    EB: 'Europe/Brussels', EH: 'Europe/Amsterdam', EL: 'Europe/Luxembourg', EG: 'Europe/London', EI: 'Europe/Dublin',
    EK: 'Europe/Copenhagen', EN: 'Europe/Oslo', ES: 'Europe/Stockholm', EF: 'Europe/Helsinki', EE: 'Europe/Tallinn',
    EV: 'Europe/Riga', EY: 'Europe/Vilnius', EP: 'Europe/Warsaw', LH: 'Europe/Budapest', LJ: 'Europe/Ljubljana',
    LD: 'Europe/Zagreb', LQ: 'Europe/Sarajevo', LY: 'Europe/Belgrade', LW: 'Europe/Skopje', LA: 'Europe/Tirane',
    LB: 'Europe/Sofia', LR: 'Europe/Bucharest', LU: 'Europe/Chisinau', LG: 'Europe/Athens', LC: 'Asia/Nicosia',
    LT: 'Europe/Istanbul', LL: 'Asia/Jerusalem', LN: 'Europe/Monaco', LX: 'Europe/Gibraltar', BI: 'Atlantic/Reykjavik',
    UK: 'Europe/Kyiv', UM: 'Europe/Minsk', UU: 'Europe/Moscow', UL: 'Europe/Moscow', UG: 'Asia/Tbilisi', UD: 'Asia/Yerevan',
    UB: 'Asia/Baku', OJ: 'Asia/Amman', OL: 'Asia/Beirut', HE: 'Africa/Cairo', HL: 'Africa/Tripoli', DT: 'Africa/Tunis',
    DA: 'Africa/Algiers', GM: 'Africa/Casablanca', OM: 'Asia/Dubai', OT: 'Asia/Qatar', OB: 'Asia/Bahrain', OK: 'Asia/Kuwait',
    OE: 'Asia/Riyadh', OO: 'Asia/Muscat', OI: 'Asia/Tehran', VR: 'Indian/Maldives', GV: 'Atlantic/Cape_Verde',
    FA: 'Africa/Johannesburg', HK: 'Africa/Nairobi', BG: 'America/Nuuk'
  };
  const tzOk = {};
  function validTz(tz) { if (!tz) return false; if (tz in tzOk) return tzOk[tz]; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); tzOk[tz] = true } catch (e) { tzOk[tz] = false } return tzOk[tz] }
  function parseOverrides(txt) { const o = {}; String(txt || '').split(/[\n,;]+/).forEach(line => { const m = line.trim().match(/^([A-Z0-9]{2,4})\s*=\s*(\S+)$/i); if (m && validTz(m[2])) o[m[1].toUpperCase()] = m[2] }); return o }
  function tzOf(icao, over) { const c = String(icao || '').toUpperCase(); if (!c) return null; over = over || {};
    if (over[c]) return over[c]; if (TZ_EXACT[c]) return TZ_EXACT[c];
    for (let n = 3; n >= 1; n--) { const p = c.slice(0, n); if (over[p]) return over[p] }
    return TZ_PREFIX[c.slice(0, 2)] || null }

  /* ---------- local time helpers (DST-aware through Intl) ---------- */
  const fmts = {};
  function parts(tz, ms) {
    let f = fmts[tz]; if (!f) f = fmts[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute };
  }
  function offsetMin(tz, ms) { const p = parts(tz, ms); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / MIN) * MIN) / MIN) }
  function localMinOfDay(tz, ms) { const p = parts(tz, ms); return p.h * 60 + p.mi }
  function localDate(tz, ms) { const p = parts(tz, ms); return p.y + '-' + String(p.mo).padStart(2, '0') + '-' + String(p.d).padStart(2, '0') }
  function localHM(tz, ms) { const p = parts(tz, ms); return String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0') }
  // UTC instant of a local wall-clock time
  function localToUtc(tz, y, mo, d, h, mi) { const guess = Date.UTC(y, mo - 1, d, h, mi); return guess - offsetMin(tz, guess - offsetMin(tz, guess) * MIN) * MIN }
  // minutes of [a,b] that fall into the local window [fromMin, toMin) of each day
  function windowOverlap(tz, a, b, fromMin, toMin) {
    if (!(b > a)) return 0; let sum = 0;
    const start = parts(tz, a - DAY); let day = Date.UTC(start.y, start.mo - 1, start.d);
    for (let k = 0; k < 400; k++, day += DAY) {
      const dd = new Date(day); const y = dd.getUTCFullYear(), mo = dd.getUTCMonth() + 1, d = dd.getUTCDate();
      const ws = localToUtc(tz, y, mo, d, Math.floor(fromMin / 60), fromMin % 60), we = localToUtc(tz, y, mo, d, Math.floor(toMin / 60), toMin % 60);
      if (ws > b) break; sum += Math.max(0, Math.min(b, we) - Math.max(a, ws));
    }
    return Math.round(sum / MIN);
  }
  const WOCL = [120, 360];            // 02:00–05:59 (ORO.FTL.105(31))
  const NIGHT = [120, 300];           // night duty: encroaches 02:00–04:59 (ORO.FTL.105(8)(c))

  /* ---------- max daily FDP ---------- */
  // ORO.FTL.205(b)(1) table 2 – acclimatised: value for 1–2 sectors by start of FDP at reference time, −30 min per further sector, min 9:00
  function t2Base(m) {
    if (m >= 360 && m < 810) return 780;            // 0600–1329 13:00
    if (m >= 810 && m < 1020) return 765 - 15 * Math.floor((m - 810) / 30); // 1330 12:45 … 1630 11:15
    if (m >= 1020 || m < 300) return 660;           // 1700–0459 11:00
    if (m < 315) return 720; if (m < 330) return 735; if (m < 345) return 750; return 765; // 0500 12:00 … 0545 12:45
  }
  function maxFdpAccl(refMin, sectors) { return Math.max(540, t2Base(refMin) - 30 * Math.max(0, sectors - 2)) }
  // table 3 – unknown state of acclimatisation
  function maxFdpUnknown(sectors) { return Math.max(540, 660 - 30 * Math.max(0, sectors - 2)) }
  // ORO.FTL.105(1) table 1: B = acclimatised to the reference (departure) time zone, D = to the local one, X = unknown
  function acclState(diffH, elapsedH) {
    if (elapsedH < 48) return 'B';
    if (diffH < 4) return 'D';
    if (diffH <= 6) return elapsedH < 72 ? 'X' : 'D';
    if (diffH <= 9) return elapsedH < 96 ? 'X' : 'D';
    return elapsedH < 120 ? 'X' : 'D';
  }

  const LIMITS = { d7: 60 * 60, d14: 110 * 60, d28: 190 * 60, b28: 100 * 60, bYear: 900 * 60, b12m: 1000 * 60 };

  function legTimes(l) {
    const base = Date.parse(l.date + 'T00:00:00Z'); if (isNaN(base)) return null;
    const hm = s => { const m = String(s || '').match(/^(\d{1,2}):?(\d{2})$/); return m ? (+m[1]) * 60 + (+m[2]) : null };
    const seq = [hm(l.out), hm(l.off), hm(l.on), hm(l.in)]; if (seq[0] == null || seq[3] == null) return null;
    let prev = null, add = 0; const out = [];
    for (const t of seq) { if (t == null) { out.push(null); continue } if (prev != null && t < prev) add += 1440; prev = t; out.push(base + (t + add) * MIN) }
    return { outMs: out[0], offMs: out[1], onMs: out[2], inMs: out[3] };
  }
  function overlap(iv, a, b) { let s = 0; for (const [x, y] of iv) s += Math.max(0, Math.min(b, y) - Math.max(a, x)); return Math.round(s / MIN) }

  /* legs: [{legId,date,out,off,on,in,from,to,split:{acc}|null,...}] of one person (closed flights)
     o: {homeTz, homeBases:[ICAO], reportBase, reportAway, post, prePost, splitAllowed, tzOver:{}, now} */
  function compute(legsIn, o) {
    const homeBases = new Set((o.homeBases || []).map(x => String(x).toUpperCase()));
    const tz = icao => tzOf(icao, o.tzOver) ;
    const legs = legsIn.map(l => Object.assign({}, l, legTimes(l))).filter(l => l.outMs != null && l.inMs != null).sort((a, b) => a.outMs - b.outMs);
    const repOf = l => l.outMs - (homeBases.has(String(l.from).toUpperCase()) ? o.reportBase : o.reportAway) * MIN;
    // 1. group flights into duties: a gap shorter than the minimum rest is not a rest – the duty continues
    const duties = []; let cur = null;
    for (const l of legs) {
      const rep = repOf(l);
      if (cur) {
        const prev = cur.legs[cur.legs.length - 1]; const end = prev.inMs + o.post * MIN;
        const restMin = (rep - end) / MIN, dutyLen = (end - cur.reportMs) / MIN;
        const atHome = homeBases.has(String(prev.to).toUpperCase());
        const minRest = Math.max(atHome ? 720 : 600, dutyLen);
        if (l.outMs < prev.inMs) cur.overlaps.push({ a: prev.legId, b: l.legId, aReg: prev.reg, bReg: l.reg });
        if (restMin < minRest) { if (prev.split) cur.breaks.push({ a: prev, b: l }); else if (restMin >= 360) cur.shortRests.push({ min: Math.round(restMin), req: Math.round(minRest), atHome, after: prev.legId });
          cur.legs.push(l); continue }
        if (prev.split) cur.splitUnused = true;
        cur.restAfter = { min: Math.round(restMin), req: Math.round(minRest), atHome };
      }
      cur = { legs: [l], reportMs: rep, breaks: [], shortRests: [], overlaps: [] }; duties.push(cur);
    }
    // 2. evaluate each duty
    let refTz = o.homeTz, lastRefReport = null;
    duties.forEach((d, i) => {
      const first = d.legs[0], last = d.legs[d.legs.length - 1];
      d.fdpEndMs = last.inMs; d.endMs = last.inMs + o.post * MIN;
      d.fdp = Math.round((d.fdpEndMs - d.reportMs) / MIN); d.duty = Math.round((d.endMs - d.reportMs) / MIN);
      d.block = Math.round(d.legs.reduce((a, l) => a + (l.inMs - l.outMs), 0) / MIN); d.sectors = d.legs.length;
      d.flags = []; d.notes = [];
      // acclimatisation and reference time
      let tzR = tz(first.from); if (!tzR) { tzR = refTz; d.notes.push('Časové pásmo ' + first.from + ' neznámé – počítáno v čase ' + refTz + '.') }
      const diffH = Math.abs(offsetMin(tzR, d.reportMs) - offsetMin(refTz, d.reportMs)) / 60;
      if (diffH <= 2) { d.accl = 'A'; d.acclTz = tzR; lastRefReport = d.reportMs }
      else {
        const el = lastRefReport == null ? 0 : (d.reportMs - lastRefReport) / H; d.accl = acclState(diffH, el);
        if (d.accl === 'B') d.acclTz = refTz; else if (d.accl === 'D') { refTz = tzR; d.acclTz = tzR; lastRefReport = d.reportMs } else d.acclTz = refTz;
        d.notes.push(`Časový rozdíl ${diffH} h oproti aklimatizaci – stav ${d.accl} (ORO.FTL.105 tab. 1).`);
      }
      d.tz = d.acclTz; d.refMin = localMinOfDay(d.acclTz, d.reportMs);
      d.maxBase = d.accl === 'X' ? maxFdpUnknown(d.sectors) : maxFdpAccl(d.refMin, d.sectors);
      // split duty (CS FTL.1.220)
      d.ext = 0;
      if (d.breaks.length) {
        if (!o.splitAllowed) d.notes.push('Split duty označené u letu, ale provozní příručka ji nepovoluje (Nastavení) – nepočítá se.');
        else {
          const cand = d.breaks.map(b => {
            const gap = (b.b.outMs - b.a.inMs) / MIN, brk = Math.round(gap - o.prePost);
            const s = b.a.inMs + (o.prePost / 2) * MIN, e = b.b.outMs - (o.prePost / 2) * MIN;
            const wocl = windowOverlap(d.acclTz, s, e, WOCL[0], WOCL[1]); const acc = (b.a.split && b.a.split.acc) || 'suitable';
            const count = acc === 'suitable' ? brk : Math.max(0, Math.min(brk, 360) - wocl);
            return { after: b.a.legId, from: b.a.inMs, to: b.b.outMs, brk, acc, wocl, valid: brk >= 180, ext: brk >= 180 ? Math.floor(count / 2) : 0 };
          });
          const best = cand.filter(c => c.valid).sort((x, y) => y.ext - x.ext)[0];
          d.split = best || cand[0];
          if (best) d.ext = best.ext; else d.flags.push('split');
          if (cand.length > 1) d.notes.push('Víc přerušení označených jako split duty – počítá se jen jedno.');
        }
      }
      if (d.overlaps.length) { d.flags.push('overlap'); d.notes.push('Lety se časově překrývají (' + d.overlaps.map(x => (x.aReg || '') + '/' + (x.bReg || '')).join(', ') + ') – zkontrolujte posádku nebo časy; výpočet je nespolehlivý.') }
      // a long gap that is still shorter than the minimum rest: not a rest, the duty continues
      d.shortRests.forEach(x => { if (!d.flags.includes('rest')) d.flags.push('rest'); d.notes.push(`Mezi lety jen ${Math.floor(x.min / 60)}:${String(x.min % 60).padStart(2, '0')} – kratší než minimální odpočinek ${Math.floor(x.req / 60)}:${String(x.req % 60).padStart(2, '0')}${x.atHome ? ' (základna)' : ''}, proto se počítá jako jedna služba (ORO.FTL.235).`) });
      if (d.splitUnused) d.notes.push('Split duty označené u posledního letu, ale následoval odpočinek – nepoužito.');
      d.maxFdp = d.maxBase + d.ext;
      if (d.fdp > d.maxFdp) d.flags.push('fdp');
      // WOCL and disruptive schedules (local time of acclimatisation)
      d.wocl = windowOverlap(d.acclTz, d.reportMs, d.fdpEndMs, WOCL[0], WOCL[1]);
      const repLoc = d.refMin, endLoc = localMinOfDay(d.acclTz, d.endMs);
      d.tags = [];
      if (repLoc >= 300 && repLoc < 360) d.tags.push('early');
      if (endLoc >= 1380 || endLoc < 120) d.tags.push('late');
      if (windowOverlap(d.acclTz, d.reportMs, d.endMs, NIGHT[0], NIGHT[1]) > 0) d.tags.push('night');
      d.reportLocal = localHM(d.acclTz, d.reportMs); d.endLocal = localHM(d.acclTz, d.endMs); d.dateLocal = localDate(d.acclTz, d.reportMs);
      d.reportTzAirport = tzR;
      // rest after the previous duty
      if (i > 0) { const pr = duties[i - 1].restAfter; d.restBefore = pr; if (pr && pr.min < pr.req) d.flags.push('rest') }
      d.route = [first.from].concat(d.legs.map(l => l.to)).join('–');
    });
    // 3. cumulative limits (ORO.FTL.210) – at the end of every duty and now
    const dutyIv = duties.map(d => [d.reportMs, d.endMs]), blockIv = legs.map(l => [l.outMs, l.inMs]);
    const homeTz = o.homeTz;
    const at = t => {
      const p = parts(homeTz, t);
      const yStart = localToUtc(homeTz, p.y, 1, 1, 0, 0);
      let my = p.y, mm = p.mo - 11; while (mm < 1) { mm += 12; my-- }
      const mStart = localToUtc(homeTz, my, mm, 1, 0, 0);
      return { t, d7: overlap(dutyIv, t - 7 * DAY, t), d14: overlap(dutyIv, t - 14 * DAY, t), d28: overlap(dutyIv, t - 28 * DAY, t),
        b28: overlap(blockIv, t - 28 * DAY, t), bYear: overlap(blockIv, yStart, t), b12m: overlap(blockIv, mStart, t) };
    };
    const now = at(o.now);
    const peak = {}; const points = duties.map(d => at(d.endMs)).concat([now]);
    for (const k of Object.keys(LIMITS)) { let best = null; for (const pt of points) if (!best || pt[k] > best[k]) best = pt; peak[k] = best ? { v: best[k], t: best.t } : { v: 0, t: null } }
    duties.forEach(d => { const c = at(d.endMs); d.cum = c; for (const k of Object.keys(LIMITS)) if (c[k] > LIMITS[k]) { if (!d.flags.includes('cum')) d.flags.push('cum'); (d.cumOver = d.cumOver || []).push(k) } });
    return { duties, now, peak, legs: legs.length };
  }

  return { compute, tzOf, parseOverrides, validTz, offsetMin, localHM, localDate, maxFdpAccl, maxFdpUnknown, acclState, windowOverlap, LIMITS, legTimes };
})();
