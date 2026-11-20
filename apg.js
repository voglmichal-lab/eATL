/* eTechLog – APG weight & balance report reader.
   APG sends its W&B report as a picture in a PDF (no text inside), so the report is read like a pilot reads it:
   1. the page is drawn as an image (PDF page, or a screenshot / photo of the report),
   2. the table lines are found and every cell is cut out (grey header cells are brightened to white),
   3. the text is recognised offline (Tesseract OCR, files in vendor/ocr, loaded only when a report is imported),
   4. every value is taken by its row name and column name ("Weight" × "Departure"), never by its position,
      so a report with rows in another order is still read correctly.
   A PDF that does contain text (another export) is read directly, without OCR.
   Nothing is filled in here: the result goes to the app, which shows it to the crew for confirmation. */
self.ETL_APG = (function () {
  'use strict';
  const OCR_DIR = 'vendor/ocr/';
  const WIDTH = 2448;          // page drawn about 2× the size of APG's own image – small digits read reliably

  // ---------- 1. the page as an image ----------
  async function pageCanvas(file, pdfjs) {
    const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name || '');
    if (isPdf) {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pg = await doc.getPage(1); const v1 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: WIDTH / v1.width });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const cx = cv.getContext('2d', { willReadFrequently: true }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: cx, viewport: vp }).promise;
      // a PDF with real text: words straight from the PDF, in image coordinates
      let words = null; try {
        const tc = await pg.getTextContent(); const its = tc.items.filter(i => i.str && i.str.trim());
        if (its.length >= 30) {
          words = [];
          for (const it of its) {
            const fs = Math.hypot(it.transform[2], it.transform[3]) || 8;
            for (const m of it.str.matchAll(/\S+/g)) {
              const share = it.str.length ? (it.width || fs * 0.5 * it.str.length) / it.str.length : fs * 0.5;
              const x = it.transform[4] + m.index * share, y = it.transform[5];
              const [ax, ay] = vp.convertToViewportPoint(x, y + fs * 0.8), [bx, by] = vp.convertToViewportPoint(x + m[0].length * share, y - fs * 0.15);
              words.push({ t: m[0], x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by), c: 99 });
            }
          }
        }
      } catch (e) { words = null }
      return { cv, words };
    }
    // a screenshot or photo of the report
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Obrázek se nepodařilo otevřít.')); i.src = url });
      if (img.naturalWidth < 1000) throw new Error("Obrázek reportu má příliš malé rozlišení – nahrajte PDF z APG nebo snímek celé obrazovky."); const s = Math.min(3, WIDTH / img.naturalWidth); const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
      const cx = cv.getContext('2d', { willReadFrequently: true }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, cv.width, cv.height); return { cv, words: null };
    } finally { URL.revokeObjectURL(url) }
  }

  // ---------- 2. table lines and cells ----------
  function gray(cv) {
    const { width: W, height: H } = cv; const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const g = new Uint8ClampedArray(W * H); for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000; return g;
  }
  function findCells(g, W, H) {
    const DARK = 110, LH = Math.round(W * 0.04), LV = Math.round(H * 0.012);
    const line = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { let s = -1; for (let x = 0; x <= W; x++) { const dk = x < W && g[y * W + x] < DARK; if (dk && s < 0) s = x; else if (!dk && s >= 0) { if (x - s >= LH) line.fill(1, y * W + s, y * W + x); s = -1 } } }
    for (let x = 0; x < W; x++) { let s = -1; for (let y = 0; y <= H; y++) { const dk = y < H && g[y * W + x] < DARK; if (dk && s < 0) s = y; else if (!dk && s >= 0) { if (y - s >= LV) for (let k = s; k < y; k++) line[k * W + x] = 1; s = -1 } } }
    // thicken the lines a little (anti-aliased edges), 2 px each way
    const th = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (line[y * W + x]) { for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const b = yy * W; for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) th[b + xx] = 1 } } }
    // areas enclosed by lines = cells (4-connected fill)
    const lab = new Uint8Array(W * H); const cells = []; const st = new Int32Array(W * H); let id = 0;
    const minH = H * 0.0075, maxH = H * 0.045, minW = W * 0.02, maxW = W * 0.4;
    for (let p0 = 0; p0 < W * H; p0++) {
      if (th[p0] || lab[p0]) continue; id++; let sp = 0; st[sp++] = p0; lab[p0] = 1; let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
      while (sp) {
        const p = st[--sp]; const x = p % W, y = (p - x) / W; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && !th[p - 1] && !lab[p - 1]) { lab[p - 1] = 1; st[sp++] = p - 1 }
        if (x < W - 1 && !th[p + 1] && !lab[p + 1]) { lab[p + 1] = 1; st[sp++] = p + 1 }
        if (y > 0 && !th[p - W] && !lab[p - W]) { lab[p - W] = 1; st[sp++] = p - W }
        if (y < H - 1 && !th[p + W] && !lab[p + W]) { lab[p + W] = 1; st[sp++] = p + W }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (h > minH && h < maxH && w > minW && w < maxW && n > w * h * 0.9) cells.push({ x0, y0, x1: x1 + 1, y1: y1 + 1 });
    }
    return { cells, th };
  }
  // the picture for OCR: lines removed, every cell's background brought to white (grey header cells)
  function cleanCanvas(cv, g, th, cells) {
    const { width: W, height: H } = cv; const out = new Uint8ClampedArray(g);
    for (let i = 0; i < out.length; i++) if (th[i]) out[i] = 255;
    for (const c of cells) {
      const hist = new Uint32Array(256); let n = 0;
      for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) { hist[out[y * W + x]]++; n++ }
      let acc = 0, bg = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n / 2) { bg = v; break } }
      if (bg < 250 && bg > 60) for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) { const i = y * W + x; out[i] = Math.min(255, out[i] * 255 / bg) }
    }
    const o = document.createElement('canvas'); o.width = W; o.height = H; const cx = o.getContext('2d'); const im = cx.createImageData(W, H);
    for (let i = 0, j = 0; i < out.length; i++, j += 4) { im.data[j] = im.data[j + 1] = im.data[j + 2] = out[i]; im.data[j + 3] = 255 }
    cx.putImageData(im, 0, 0); return o;
  }

  // ---------- 3. OCR ----------
  let worker = null;
  const abs = p => new URL(p, document.baseURI).href;
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Čtečku textu se nepodařilo načíst. Otevřete aplikaci se signálem, aby se stáhla do zařízení.')); document.head.appendChild(s) }) }
  async function getWorker(progress) {
    if (worker) return worker;
    if (!self.Tesseract) await loadScript(OCR_DIR + 'tesseract.min.js');
    const w = await self.Tesseract.createWorker('eng', 1, {
      workerPath: abs(OCR_DIR + 'worker.min.js'), corePath: abs(OCR_DIR), langPath: abs(OCR_DIR), gzip: true, workerBlobURL: false,
      logger: m => { if (progress && m && typeof m.progress === 'number') progress(m.status, m.progress) }, errorHandler: () => { }
    });
    await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
    worker = w; return w;
  }
  async function ocrWords(cv, progress) {
    const w = await getWorker(progress);
    const r = await w.recognize(cv, {}, { blocks: true, text: false });
    const words = [];
    for (const b of r.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const wd of l.words || []) {
      const t = (wd.text || '').trim(); if (t) words.push({ t, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1, c: wd.confidence })
    }
    return words;
  }

  // ---------- 4. reading the tables ----------
  const N = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c } return p[n] }
  // a cell's text is this name (OCR may get one letter wrong in a longer name; V1/V2 have their usual misreadings)
  const SHORT = { VI: 'V1', VL: 'V1', V7: 'V1', VZ: 'V2', 'V2': 'V2', 'V1': 'V1', VR: 'VR' };
  function is(cellText, name) { const a = N(cellText), b = N(name); if (!a) return false; if (a === b) return true; if (b.length <= 2) return SHORT[a] === b; return b.length >= 4 && lev(a, b) <= 1 }
  function model(cells, words) {
    for (const c of cells) c.w = [];
    const rest = [];
    for (const w of words) {
      const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2; const c = cells.find(c => cx >= c.x0 && cx < c.x1 && cy >= c.y0 && cy < c.y1);
      (c ? c.w : rest).push(w);
    }
    for (const c of cells) { c.w.sort((a, b) => (Math.abs(a.y0 - b.y0) > (a.y1 - a.y0) * 0.6 ? a.y0 - b.y0 : a.x0 - b.x0)); c.t = c.w.map(w => w.t).join(' '); c.c = c.w.length ? Math.min(...c.w.map(w => w.c)) : 0 }
    const tol = 10, gap = 18;
    const right = c => cells.find(d => d !== c && Math.abs(d.y0 - c.y0) < tol && Math.abs(d.y1 - c.y1) < tol && d.x0 - c.x1 >= -2 && d.x0 - c.x1 < gap);
    const up = c => cells.find(d => d !== c && Math.abs(d.x0 - c.x0) < tol && Math.abs(d.x1 - c.x1) < tol && c.y0 - d.y1 >= -2 && c.y0 - d.y1 < gap);
    const row = c => { const r = [c]; let d = c; while ((d = right(d)) && r.length < 12) r.push(d); return r };
    const top = c => { let d = c, n = 0; while (n++ < 60) { const u = up(d); if (!u) return d; d = u } return d };
    // value of the row "label" in the column "col" of the same table
    function cell(label, col) {
      for (const L of cells) {
        if (!is(L.t, label)) continue; const hdr = row(top(L)); const r = row(L);
        const i = hdr.findIndex((h, k) => k > 0 && (typeof col === 'string' ? is(h.t, col) : col.test(N(h.t)))); if (i > 0 && r[i]) return r[i];
      }
      return null;
    }
    // lines of free text (outside the tables)
    const lines = []; rest.sort((a, b) => a.y0 - b.y0);
    for (const w of rest) { const h = w.y1 - w.y0; const l = lines.find(l => Math.abs((l.y0 + l.y1) / 2 - (w.y0 + w.y1) / 2) < h * 0.5 && w.x0 < l.x1 + h * 3 && w.x1 > l.x0 - h * 3); if (l) { l.w.push(w); l.x0 = Math.min(l.x0, w.x0); l.x1 = Math.max(l.x1, w.x1); l.y0 = Math.min(l.y0, w.y0); l.y1 = Math.max(l.y1, w.y1) } else lines.push({ w: [w], x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 }) }
    for (const l of lines) { l.w.sort((a, b) => a.x0 - b.x0); l.t = l.w.map(w => w.t).join(' ') }
    lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    // the text under a heading ("Departure Options"): following lines in the same column, close together
    function under(re) {
      const h = lines.find(l => re.test(N(l.t))); if (!h) return null; const lh = h.y1 - h.y0; const out = []; let last = h;
      for (const l of lines) { if (l === h || l.y0 <= h.y0) continue; if (Math.abs(l.x0 - h.x0) > lh * 2.5) continue; if (l.y0 - last.y1 > lh * 1.4) break; if (/OPTIONS$/.test(N(l.t))) break; out.push(l.t); last = l }
      return out.join(' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim() || null;
    }
    return { cell, lines, under };
  }
  const inRange = (v, kind) => v != null && +v >= RANGE[kind][0] && +v <= RANGE[kind][1];
  const RANGE = { w: [3000, 250000], spd: [50, 260], pwr: [40, 110], dist: [300, 20000], grad: [0, 40], flap: [0, 45] };
  function numOf(t, dec) { const s = String(t || '').replace(/(\d),(\d{3})\b/g, '$1$2'); const m = dec ? /\d+(?:[.,]\d+)?/.exec(s) : /\d+/.exec(s); return m ? m[0].replace(',', '.') : null }
  function read(cells, words) {
    const M = model(cells, words); const F = {}; const warn = [];
    const put = (key, label, col, kind, dec) => {
      const c = M.cell(label, col); if (!c || !c.t) { F[key] = { v: null, raw: '', why: 'nenalezeno' }; return }
      const v = numOf(c.t, dec); const [lo, hi] = RANGE[kind]; const ok = v != null && +v >= lo && +v <= hi;
      F[key] = { v: ok ? v : null, raw: c.t, conf: Math.round(c.c), why: ok ? '' : 'nečitelné', kind, dec: !!dec, cell: c };
    };
    const DEP = 'Departure', ARR = 'Arrival', EMR = /^EMERG/;
    put('to_w', 'Weight', DEP, 'w'); put('v1', 'V1', DEP, 'spd'); put('vr', 'VR', DEP, 'spd'); put('v2', 'V2', DEP, 'spd');
    put('vfto', 'VFTO', DEP, 'spd'); put('to_pwr', 'Power', DEP, 'pwr', true); put('to_dist', 'TO Dist', DEP, 'dist'); put('to_flaps', 'Flap', DEP, 'flap');
    put('ld_w', 'Weight', ARR, 'w'); put('vref', 'VREF', ARR, 'spd'); put('vapp', 'VAPP', ARR, 'spd'); put('vfs', 'VFS', ARR, 'spd');
    put('ld_dist', 'LD Dist', ARR, 'dist'); put('ld167', 'REQD FL', ARR, 'dist'); put('magrad', 'MA Grad', ARR, 'grad', true);
    put('emr_vref', 'VREF', EMR, 'spd'); put('emr_vapp', 'VAPP', EMR, 'spd');
    const txt = (l, c) => { const x = M.cell(l, c); return x && x.t ? x.t.trim() : '' };
    const meta = {
      dep: N(txt('ICAO', DEP)).slice(0, 4), arr: N(txt('ICAO', ARR)).slice(0, 4), rwyDep: txt('Runway', DEP), rwyArr: txt('Runway', ARR),
      flapArr: txt('Flap', ARR), emrW: numOf(txt('Weight', EMR)),
      reg: '', title: '', generated: ''
    };
    const tl = M.lines.find(l => /\//.test(l.t) && l.y0 < (cells.length ? Math.min(...cells.map(c => c.y0)) : 1e9));
    if (tl) { meta.title = tl.t.trim(); meta.reg = N(tl.t.split('/')[0]); meta.titleBox = { x0: tl.x0, y0: tl.y0, x1: tl.x1, y1: tl.y1 } }
    const gl = M.lines.find(l => /^GENERATED/.test(N(l.t))); if (gl) meta.generated = gl.t.replace(/^\s*generated\s*/i, '').trim();
    const opts = { dep: M.under(/^DEPARTUREOPTIONS$/), arr: M.under(/^ARRIVALOPTIONS$/), emr: M.under(/^EMERGENCYRETURNOPTIONS$/) };
    // the report's own sanity: V1 ≤ VR ≤ V2, VREF ≤ VAPP
    const n = k => F[k] && F[k].v != null ? +F[k].v : null;
    if (n('v1') != null && n('vr') != null && n('v1') > n('vr')) warn.push('V1 je vyšší než VR – zkontrolujte.');
    if (n('vr') != null && n('v2') != null && n('vr') > n('v2')) warn.push('VR je vyšší než V2 – zkontrolujte.');
    if (n('vref') != null && n('vapp') != null && n('vref') > n('vapp')) warn.push('VREF je vyšší než VAPP – zkontrolujte.');
    if (n('emr_vref') != null && n('emr_vapp') != null && n('emr_vref') > n('emr_vapp')) warn.push('EMR VREF je vyšší než EMR VAPP – zkontrolujte.');
    if (n('ld_w') != null && n('to_w') != null && n('ld_w') > n('to_w')) warn.push('Přistávací hmotnost je vyšší než vzletová – zkontrolujte.');
    return { fields: F, meta, opts, warn };
  }

  // ---------- every value read again on its own ----------
  // A whole-page read can merge equal digits ("111" → "11"). Each value cell is therefore read again alone, larger,
  // as a single line of digits – twice, at two sizes. A value counts as sure only when two readings agree;
  // otherwise the crew sees it marked and checks it against the cut-out of the report shown next to it.
  function crop(src, c, scale, pad) {
    const m = 3, w = c.x1 - c.x0 - 2 * m, h = c.y1 - c.y0 - 2 * m; const o = document.createElement('canvas');
    o.width = Math.round(w * scale) + 2 * pad; o.height = Math.round(h * scale) + 2 * pad; const cx = o.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, o.width, o.height); cx.imageSmoothingQuality = 'high'; cx.drawImage(src, c.x0 + m, c.y0 + m, w, h, pad, pad, w * scale, h * scale); return o;
  }
  // the same cut-out with the characters moved apart: plain "1"s set close together ("111") are read as one
  function spaced(src, gap) {
    const W = src.width, H = src.height; const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const ink = new Array(W).fill(false); let y0 = H, y1 = 0;
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (d[(y * W + x) * 4] < 150) { ink[x] = true; if (y < y0) y0 = y; if (y > y1) y1 = y }
    const runs = []; for (let x = 0; x < W; x++) { if (ink[x] && (x === 0 || !ink[x - 1])) runs.push([x, x]); if (ink[x]) runs[runs.length - 1][1] = x }
    if (!runs.length) return src; const th = Math.max(8, y1 - y0 + 1), add = Math.round(th * (gap || 0.35)), pad = 24;
    let w = pad * 2; runs.forEach((r, i) => { w += r[1] - r[0] + 1; if (i) w += (r[0] - runs[i - 1][1]) + add });
    const o = document.createElement('canvas'); o.width = w; o.height = H; const cx = o.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, H);
    let x = pad; runs.forEach((r, i) => { if (i) x += (r[0] - runs[i - 1][1]) + add; const rw = r[1] - r[0] + 1; cx.drawImage(src, r[0], 0, rw, H, x, 0, rw, H); x += rw });
    return o;
  }
  // b is a with only "1"s and "."s left out ("11.4" read as "1.4" or "14")
  function slip(b, a) { let i = 0; for (const ch of a) { if (i < b.length && b[i] === ch) i++; else if (ch !== '1' && ch !== '.') return false } return i === b.length && b !== a }
  async function reread(F, clean, orig) {
    const w = await getWorker();
    await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789.,/()lbftDEGRSN ' });
    try {
      for (const k of Object.keys(F)) {
        const f = F[k]; if (!f.cell) continue; const votes = [];
        // two readings of the spaced-out cut-out (two sizes) must agree. Plain readings (the whole page, the cut-out as it
        // is) must not contradict them – except by the one known slip of plain reading: a "1" or "." left out.
        const R = [];
        for (const [sc, gp] of [[2, 0.35], [3, 0.5], [3, 0]]) { const c0 = crop(clean, f.cell, sc, 24), cc = gp ? spaced(c0, gp) : c0; if (self.APG_DEBUG) self.APG_DEBUG[k + sc + (gp ? 's' : 'p')] = cc.toDataURL(); const r = await w.recognize(cc); const t = (r.data.text || '').trim(); f['r' + sc + (gp ? 's' : 'p')] = t; const v = numOf(t, f.dec); R.push(inRange(v, f.kind) ? v : null) }
        const first = numOf(f.raw, f.dec), plain = [R[2], inRange(first, f.kind) ? first : null].filter(v => v != null);
        if (R[0] != null && R[0] === R[1] && plain.every(v => v === R[0] || slip(v, R[0]))) { f.v = R[0]; f.sure = true }
        else { const c = [R[0], R[1]].filter(v => v != null); f.v = c[0] || plain[0] || null; f.sure = false }
        f.why = f.v == null ? 'nečitelné' : f.sure ? '' : 'ověřte';
      }
    } finally { await w.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '' }) }
  }
  // the aircraft from the big bold title ("OKXLS / Cessna Citation XLS+ / PW545C"), read again as one line
  async function rereadTitle(meta, clean) {
    const b = meta.titleBox; delete meta.titleBox; if (!b) return; const h = b.y1 - b.y0, w = await getWorker();
    const box = { x0: Math.max(0, b.x0 - h), y0: Math.max(0, b.y0 - h * 0.4), x1: Math.min(clean.width, b.x1 + h), y1: Math.min(clean.height, b.y1 + h * 0.4) };
    await w.setParameters({ tessedit_pageseg_mode: '7' });
    try { const r = await w.recognize(crop(clean, box, 1, 20)); const t = (r.data.text || '').trim(); if (/\//.test(t)) { meta.title = t; meta.reg = N(t.split('/')[0]) } }
    finally { await w.setParameters({ tessedit_pageseg_mode: '11' }) }
  }
  function cutouts(F, orig) {
    for (const k of Object.keys(F)) { const f = F[k]; if (f.cell) { try { f.img = crop(orig, f.cell, 0.7, 2).toDataURL('image/png') } catch (e) { } } delete f.cell }
  }

  // ---------- the whole import ----------
  async function readReport(file, pdfjs, progress) {
    const t0 = Date.now(); const st = (s, p) => { try { progress && progress(s, p) } catch (e) { } };
    st('page', 0);
    const { cv, words: pdfWords } = await pageCanvas(file, pdfjs);
    const W = cv.width, H = cv.height; if (W < 1400) throw new Error('Obrázek reportu má příliš malé rozlišení – nahrajte PDF z APG nebo snímek celé obrazovky.');
    const g = gray(cv);
    st('tables', 0);
    const { cells, th } = findCells(g, W, H);
    if (cells.length < 20) throw new Error('V souboru není W&B report z APG (nenašel jsem jeho tabulky).');
    let words = pdfWords, how = 'text', clean = null;
    if (!words) { how = 'ocr'; clean = cleanCanvas(cv, g, th, cells); words = await ocrWords(clean, (s, p) => st(/recogn/i.test(s) ? 'ocr' : 'load', p)) }
    const r = read(cells, words);
    if (clean) { st('check', 0); await reread(r.fields, clean, cv); await rereadTitle(r.meta, cv) } else for (const f of Object.values(r.fields)) { f.sure = f.v != null; f.why = f.v == null ? (f.why || 'nenalezeno') : '' }
    cutouts(r.fields, cv);
    r.how = how; r.ms = Date.now() - t0; r.size = [W, H]; r.cells = cells.length;
    const got = Object.values(r.fields).filter(f => f.v != null).length;
    if (!got) throw new Error('V souboru není W&B report z APG (nenašel jsem jeho tabulky).');
    return r;
  }
  return { readReport, _: { findCells, read, model, is, numOf, N } };
})();
