/* JEEwise — Teacher mode (4 simple steps).
   1 Chapters → 2 Pick questions → 3 Customise → 4 Export.
   Exports: a worksheet PDF (real file, not the print dialog) and/or slide images in a ZIP.
   Everything runs in the browser; nothing is uploaded anywhere. */
(() => {
  'use strict';
  const JW = window.JW;
  if (!JW) return;
  const { $, $$, esc, icon, hydrateIcons, toast, plural, store, app, data } = JW;

  /* ===================== Settings & storage ===================== */
  const K = { cfg: 'jewise_teacher_v1', sets: 'jewise_tsets_v1', used: 'jewise_tused_v1', log: 'jewise_tlog_v1' };
  const DEF = {
    setName: '', output: '',
    // slides
    mode: '2', lang: 'en', scale: 2, width: 900, format: 'png', theme: 'light',
    solutions: true, highlight: true, meta: true, marks: true, repeatQ: false,
    keySheet: true, csv: true, byChapter: false, split: false, naming: 'plain', order: 'selection',
    // branding
    heading: '', footer: '', school: '', logo: '', logoSlides: true, logoSheet: true, logoPos: 'right', logoSize: 'm',
    // worksheet
    wsMode: 'paper', wsCols: 2, wsFont: 'm', wsNameLine: true, wsTime: '', wsNote: '', wsSolutions: true,
    // tracking
    autoUsed: true
  };
  const stored = store.get(K.cfg, {}) || {};
  let cfg = { ...DEF, ...stored };
  if (stored.wsSchool && !stored.school) cfg.school = stored.wsSchool;      // older versions
  if (stored.wsTitle && !stored.setName) cfg.setName = stored.wsTitle;
  if (!cfg.namingV) { cfg.namingV = 2; cfg.naming = 'plain'; }
  if (![1, 2].includes(Number(cfg.wsCols))) cfg.wsCols = 2;
  cfg.wsCols = Number(cfg.wsCols);
  try { store.del('jewise_tpin_v1'); sessionStorage.removeItem('jewise_tunlock'); } catch { /* the PIN feature was removed */ }
  const saveCfg = () => { try { store.set(K.cfg, cfg); return true; } catch { return false; } };

  const T = {
    step: 1, subj: '', chapQ: '', chapSel: new Set(),
    pool: [], picked: new Set(), loaded: false, loading: false, srcTitle: '',
    q: '', year: '', diff: '', kind: '', chap: '', used: '', sort: 'newest', limit: 40,
    group: 'topic', gsel: '', collapsed: new Set(), showAns: false, open: new Set(),
    mix: 'random', n: 10, skipUsed: false, shufKey: null, shufList: []
  };

  /* Used-question tracking: every export is logged so the teacher can always see what has been handed out. */
  const usedMap = () => store.get(K.used, {}) || {};
  const logList = () => (store.get(K.log, []) || []).filter(x => x && x.t);
  function markUsed(ids, kind, name) {
    const u = usedMap(), now = Date.now();
    ids.forEach(id => { u[id] = now; });
    store.set(K.used, u);
    const log = logList(); log.unshift({ t: now, kind, n: ids.length, name }); store.set(K.log, log.slice(0, 30));
  }
  const ago = ts => { const d = Math.floor((Date.now() - ts) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(ts).toLocaleDateString(); };

  /* ===================== Small helpers ===================== */
  const slug = s => String(s ?? '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s-]+/g, '_').toLowerCase().slice(0, 40) || 'x';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtBytes = n => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const optionsOf = (q, l) => (JW.qd(q, l).options || []).map((o, i) => (o && typeof o === 'object'
    ? { id: String(o.identifier ?? String.fromCharCode(65 + i)), html: String(o.content ?? '') }
    : { id: String.fromCharCode(65 + i), html: String(o ?? '') }));
  const answerOf = q => (q.kind === 'number' ? JW.qAnswer(q) : JW.qCorrect(q).join(', '));
  const explainOf = (q, l) => JW.qd(q, l).explanation || JW.qd(q, 'en').explanation || '';
  const anyHindi = () => T.pool.some(q => JW.hasHindi(q));
  const kindLabel = q => (q.kind === 'number' ? 'Numerical' : q.kind === 'multi' ? 'Multiple correct' : 'Single correct');

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* ===================== ZIP writer (store only — images are already compressed) ===================== */
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  class ZipBuilder {
    constructor() { this.parts = []; this.central = []; this.offset = 0; this.count = 0; this.enc = new TextEncoder(); }
    async add(name, content) {
      const blob = content instanceof Blob ? content : new Blob([content]);
      const u8 = new Uint8Array(await blob.arrayBuffer());
      const crc = crc32(u8), size = u8.length, nameB = this.enc.encode(name);
      const d = new Date();
      const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, nameB.length, true);
      ch.setUint32(42, this.offset, true);
      this.parts.push(lh.buffer, nameB, blob);
      this.central.push(ch.buffer, nameB);
      this.offset += 30 + nameB.length + size;
      this.count++;
    }
    finish() {
      const cdSize = this.central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true); end.setUint16(8, this.count, true); end.setUint16(10, this.count, true);
      end.setUint32(12, cdSize, true); end.setUint32(16, this.offset, true);
      return new Blob([...this.parts, ...this.central, end.buffer], { type: 'application/zip' });
    }
  }


  /* ===================== PDF writer (one JPEG page image per A4 page) ===================== */
  async function makePdf(pages) {
    const enc = new TextEncoder(), parts = [], off = [];
    let pos = 0;
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.size ?? b.length; };
    const begin = id => { off[id] = pos; push(`${id} 0 obj\n`); };
    const PWp = 595.28, PHp = 841.89, n = pages.length;
    push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
    begin(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    begin(2); push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>\nendobj\n`);
    pages.forEach((p, i) => {
      const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
      const content = `q ${PWp} 0 0 ${PHp} 0 0 cm /Im0 Do Q`;
      begin(pid); push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PWp} ${PHp}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>\nendobj\n`);
      begin(cid); push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
      begin(iid); push(`<< /Type /XObject /Subtype /Image /Width ${p.cw} /Height ${p.ch} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.blob.size} >>\nstream\n`);
      push(p.blob); push('\nendstream\nendobj\n');
    });
    const total = 3 + n * 3, xref = pos;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let id = 1; id < total; id++) x += String(off[id]).padStart(10, '0') + ' 00000 n \n';
    push(x); push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* ===================== Image rendering engine =====================
     Cards and worksheet pages are laid out inside a hidden iframe that has its own MathJax (SVG output, so every
     formula is self-contained vector art). The laid-out element is wrapped in an SVG <foreignObject> and drawn to a canvas. */
  const R = { frame: null, ready: null, mathOk: true, imgCache: new Map(), imgFail: 0 };

  function frameDoc() {
    return `<!doctype html><html><head><meta charset="utf-8"><style id="cardcss"></style><style id="pagecss"></style>
<script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$'],['\\\\[','\\\\]']]},svg:{fontCache:'none'},options:{skipHtmlTags:['script','noscript','style','textarea','pre','code']},startup:{typeset:false}};<\/script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js" onerror="window.__mjFail=true"><\/script>
</head><body style="margin:0"><div id="stage"></div></body></html>`;
  }


  function initRenderer() {
    if (R.ready) return R.ready;
    R.ready = new Promise(resolve => {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1300px;height:900px;border:0;visibility:hidden;pointer-events:none';
      f.onload = async () => {
        const w = f.contentWindow;
        const t0 = Date.now();
        while (Date.now() - t0 < 20000 && !w.__mjFail && !(w.MathJax && w.MathJax.startup && w.MathJax.startup.promise)) await sleep(80);
        try { if (w.MathJax?.startup?.promise) await w.MathJax.startup.promise; else R.mathOk = false; } catch { R.mathOk = false; }
        if (!w.MathJax?.typesetPromise) R.mathOk = false;
        resolve();
      };
      f.srcdoc = frameDoc();
      document.body.appendChild(f);
      R.frame = f;
    });
    return R.ready;
  }
  function disposeRenderer() { R.frame?.remove(); R.frame = null; R.ready = null; R.mathOk = true; }


  const blobToDataUrl = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });

  /* Question figures usually live on another site that doesn't send CORS headers, so a plain fetch() is blocked.
     Try, in order: direct; direct without referrer (hot-link protection); then public image/CORS proxies. */
  async function fetchImageData(abs) {
    const enc = encodeURIComponent(abs);
    const tries = [
      [abs, { mode: 'cors', referrerPolicy: 'no-referrer' }],
      [abs, { mode: 'cors' }],
      ['https://wsrv.nl/?url=' + enc + '&output=png', { mode: 'cors' }],
      ['https://images.weserv.nl/?url=' + enc + '&output=png', { mode: 'cors' }],
      ['https://corsproxy.io/?url=' + enc, { mode: 'cors' }],
      ['https://api.allorigins.win/raw?url=' + enc, { mode: 'cors' }]
    ];
    for (const [u, o] of tries) {
      try {
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(u, { ...o, signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const b = await res.blob();
        if (!b.size || (b.type && !/^image\//i.test(b.type) && !/svg/i.test(b.type))) continue;
        return await blobToDataUrl(b);
      } catch { /* try the next route */ }
    }
    return null;
  }

  /* Black-and-white, higher-contrast, size-capped copy of an image (used for the printed worksheet). */
  const grayCache = new Map();
  async function toGray(dataUrl) {
    if (grayCache.has(dataUrl)) return grayCache.get(dataUrl);
    let out = dataUrl;
    try {
      const im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = dataUrl; });
      const nw = im.naturalWidth || 400, nh = im.naturalHeight || 300;
      // small source pictures are enlarged smoothly first, so the final page doesn't show blocky pixels
      const k = nw < 1100 ? 1100 / nw : Math.min(1, 1500 / nw);
      const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h), a = d.data;
      const lo = 60, hi = 185;
      for (let i = 0; i < a.length; i += 4) {
        const r = a[i], g = a[i + 1], bl = a[i + 2];
        // coloured lines (blue etc.) have a low minimum channel, pale tints and watermarks a high one
        const l = Math.min(r, g, bl) * 0.6 + (0.299 * r + 0.587 * g + 0.114 * bl) * 0.4;
        let v = (l - lo) / (hi - lo); v = v < 0 ? 0 : v > 1 ? 1 : v;
        v = v * v * (3 - 2 * v);                    // smooth curve keeps anti-aliased edges soft instead of jagged
        a[i] = a[i + 1] = a[i + 2] = Math.round(v * 255); a[i + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      out = c.toDataURL('image/png');
    } catch { /* keep original */ }
    grayCache.set(dataUrl, out);
    return out;
  }

  async function inlineImages(html, gray) {
    const t = document.createElement('template');
    t.innerHTML = html;
    const imgs = [...t.content.querySelectorAll('img')];
    await Promise.all(imgs.map(async img => {
      img.removeAttribute('loading'); img.removeAttribute('srcset'); img.removeAttribute('sizes');
      if (gray && !img.classList.contains('logo')) ['width', 'height', 'style'].forEach(a => img.removeAttribute(a));   // let the worksheet CSS decide the size
      const raw = img.getAttribute('src') || '';
      if (!raw || raw.startsWith('data:')) return;
      let abs; try { abs = new URL(raw, document.baseURI).href; } catch { abs = null; }
      let out = abs ? R.imgCache.get(abs) : null;
      if (abs && out === undefined) {
        out = await fetchImageData(abs);
        R.imgCache.set(abs, out);
      }
      if (out && gray && !img.classList.contains('logo')) out = await toGray(out);
      if (out) img.setAttribute('src', out);
      else { R.imgFail++; const s = document.createElement('span'); s.className = 'imgmiss'; s.textContent = '[image could not be loaded]'; img.replaceWith(s); }
    }));
    return t.innerHTML;
  }


  const THEMES = {
    light: { bg: '#ffffff', fg: '#14122b', mute: '#6b678f', line: '#dcd8f0', soft: '#f4f2fd', accent: '#5b3df5', ok: '#0f9d63', okBg: '#e7f7ef', callout: '#f4f2fd' },
    dark: { bg: '#15122d', fg: '#eeeaff', mute: '#9b95c7', line: '#2e2860', soft: '#1d1942', accent: '#8f78ff', ok: '#2fd18b', okBg: 'rgba(47,209,139,.14)', callout: '#1d1942' }
  };


  const logoPx = W => W * ({ s: 0.045, m: 0.065, l: 0.09 }[cfg.logoSize] || 0.065);

  function cardCss(W, th) {
    return `*{box-sizing:border-box}
.card{width:${W}px;padding:${Math.round(W * 0.04)}px ${Math.round(W * 0.045)}px ${Math.round(W * 0.03)}px;background:${th.bg};color:${th.fg};font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari","Helvetica Neue",Arial,sans-serif;font-size:${Math.round(W * 0.0255)}px;line-height:1.6;word-wrap:break-word;overflow-wrap:anywhere}
.hd{display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px;margin-bottom:22px;padding-bottom:16px;border-bottom:2px solid ${th.line}}
.logo{height:${Math.round(logoPx(W))}px;width:auto;max-width:34%;object-fit:contain;flex:none}
.qn{display:inline-block;padding:3px 16px;border-radius:999px;background:${th.accent};color:#fff;font-weight:800;font-size:.9em;letter-spacing:.02em}
.qn.ans{background:${th.ok}}
.mt{color:${th.mute};font-size:.72em;font-weight:600}
.sp{flex:1}
.hdg{color:${th.mute};font-size:.72em;font-weight:700;text-align:right}
.mk{font-size:.72em;font-weight:800;color:${th.mute}}
.callout{margin:0 0 16px;padding:12px 16px;border-radius:10px;background:${th.callout};border-left:5px solid ${th.accent};font-size:.92em}
.prompt{margin:0 0 20px}
.prompt p{margin:0 0 .7em}.prompt p:last-child{margin-bottom:0}
.opt{display:flex;gap:14px;align-items:flex-start;margin:0 0 12px;padding:12px 16px;border:2px solid ${th.line};border-radius:12px}
.k{flex:none;width:1.75em;height:1.75em;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:${th.soft};font-weight:800;font-size:.85em;margin-top:.1em}
.opt .t{flex:1;min-width:0}
.opt.ok{border-color:${th.ok};background:${th.okBg}}
.opt.ok .k{background:${th.ok};color:#fff}
.hint{margin:6px 0 0;color:${th.mute};font-size:.7em;font-style:italic}
.ans{margin:22px 0 0;padding:16px 20px;border-radius:12px;background:${th.okBg};border:2px solid ${th.ok}}
.ans .lb{font-size:.68em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${th.ok}}
.ans .av{font-size:1.25em;font-weight:800;margin-top:2px}
.ans .ao{margin-top:10px;display:flex;gap:12px;align-items:center}
.ans .ao .k{background:${th.ok};color:#fff;margin-top:0}
.ans .ao .t{flex:1;min-width:0;font-size:1.05em;font-weight:600}
.sol{margin:22px 0 0;padding:16px 20px;border-radius:12px;background:${th.soft};border:1px solid ${th.line}}
.sol .lb{font-size:.68em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${th.accent};margin-bottom:6px}
.sol p{margin:0 0 .6em}.sol p:last-child{margin-bottom:0}
.ft{margin-top:26px;padding-top:12px;border-top:1px solid ${th.line};text-align:center;color:${th.mute};font-size:.62em;font-weight:600;letter-spacing:.02em}
img{max-width:100%;height:auto;vertical-align:middle}
img.logo{vertical-align:middle}
table{border-collapse:collapse;max-width:100%}td,th{border:1px solid ${th.line};padding:4px 10px}
.imgmiss{color:${th.mute};font-style:italic;font-size:.8em}
.key{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.kc{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;border:2px solid ${th.line};border-radius:10px;font-weight:700}
.kc b{color:${th.mute};font-weight:700;font-size:.85em}.kc span{color:${th.ok};font-weight:800}
.sub{color:${th.mute};font-size:.75em;margin:0 0 18px}`;
  }

  /* ---- slide card content ---- */
  function metaLine(q) {
    return [JW.examName(q.exam), q.year || '', JW.paperShort(q), q.subject, q.chapter, q.diff !== 'Unknown' ? q.diff : ''].filter(Boolean).join(' · ');
  }
  const logoTag = on => (cfg.logo && on ? `<img class="logo" src="${cfg.logo}" alt="">` : '');
  const head = (q, n, label) => {
    const lg = logoTag(cfg.logoSlides);
    return `<div class="hd">${cfg.logoPos === 'left' ? lg : ''}<span class="qn ${label ? 'ans' : ''}">Q${n}${label ? ' · ' + label : ''}</span>${cfg.meta ? `<span class="mt">${esc(metaLine(q))}</span>` : ''}<span class="sp"></span>${cfg.marks ? `<span class="mk">+${q.marks}${q.neg ? ` / −${q.neg}` : ''}</span>` : ''}${cfg.heading ? `<span class="hdg">${esc(cfg.heading)}</span>` : ''}${cfg.logoPos !== 'left' ? lg : ''}</div>`;
  };
  const foot = () => (cfg.footer ? `<div class="ft">${esc(cfg.footer)}</div>` : '');

  function promptHtml(q) {
    const d = JW.qd(q, cfg.lang);
    const co = [d.direction, d.comprehension].filter(Boolean).map(h => `<div class="callout">${JW.sanitize(h)}</div>`).join('');
    return `${co}<div class="prompt">${JW.sanitize(d.content || 'Question text unavailable.')}</div>`;
  }
  function optionsHtml(q, reveal) {
    if (q.kind === 'number') return cfg.meta ? '<div class="hint">Numerical answer type</div>' : '';
    const right = JW.qCorrect(q);
    const list = optionsOf(q, cfg.lang).map(o => `<div class="opt ${reveal && right.includes(o.id) ? 'ok' : ''}"><span class="k">${esc(o.id)}</span><div class="t">${JW.sanitize(o.html)}</div></div>`).join('');
    const hint = cfg.meta ? `<div class="hint">${q.kind === 'multi' ? 'One or more options may be correct' : 'Single correct option'}</div>` : '';
    return list + hint;
  }
  /* The answer box shows each correct option ONCE (letter badge + its text). When the options above already highlight the
     answer, the box shows just the letter(s). */
  function answerHtml(q, compact) {
    const ans = answerOf(q);
    if (!ans) return `<div class="ans"><div class="lb">Correct answer</div><div class="av">Not available for this question</div></div>`;
    if (q.kind === 'number') return `<div class="ans"><div class="lb">Correct answer</div><div class="av">${esc(ans)}</div></div>`;
    const right = JW.qCorrect(q);
    const rows = optionsOf(q, cfg.lang).filter(o => right.includes(o.id));
    if (!rows.length) return `<div class="ans"><div class="lb">Correct answer</div><div class="av">${esc(ans)}</div></div>`;
    if (compact) return `<div class="ans"><div class="lb">Correct answer</div><div class="av">${rows.map(o => `(${esc(o.id)})`).join(', ')}</div></div>`;
    return `<div class="ans"><div class="lb">Correct answer</div>${rows.map(o => `<div class="ao"><span class="k">${esc(o.id)}</span><div class="t">${JW.sanitize(o.html)}</div></div>`).join('')}</div>`;
  }
  function solutionHtml(q) {
    if (!cfg.solutions) return '';
    const ex = explainOf(q, cfg.lang);
    return ex ? `<div class="sol"><div class="lb">Solution</div>${JW.sanitize(ex)}</div>` : '';
  }

  function cardHtml(kind, q, n) {
    if (kind === 'question') return `${head(q, n)}${promptHtml(q)}${optionsHtml(q, false)}${foot()}`;
    if (kind === 'answer') {
      const rep = cfg.repeatQ ? `${promptHtml(q)}${optionsHtml(q, true)}` : '';
      return `${head(q, n, 'Answer')}${rep}${answerHtml(q, cfg.repeatQ)}${solutionHtml(q)}${foot()}`;
    }
    return `${head(q, n)}${promptHtml(q)}${optionsHtml(q, cfg.highlight)}${answerHtml(q, cfg.highlight)}${solutionHtml(q)}${foot()}`; // combined
  }

  function keySheetHtml(qs) {
    const cells = qs.map((q, i) => `<div class="kc"><b>${i + 1}</b><span>${esc(answerOf(q) || '—')}</span></div>`).join('');
    const lg = logoTag(cfg.logoSlides);
    return `<div class="hd">${cfg.logoPos === 'left' ? lg : ''}<span class="qn ans">Answer key</span><span class="sp"></span>${cfg.heading ? `<span class="hdg">${esc(cfg.heading)}</span>` : ''}${cfg.logoPos !== 'left' ? lg : ''}</div>
      <div class="sub">${plural(qs.length, 'question')} · ${qs.reduce((s, q) => s + q.marks, 0)} marks</div><div class="key">${cells}</div>${foot()}`;
  }

  /* Draws an element that lives in the render iframe onto a canvas and returns it as an image blob. */
  async function shoot(el, W, H, { scale, bg, type }) {
    const w = R.frame.contentWindow, doc = R.frame.contentDocument;
    const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n').replace(/\]\]>/g, ']] >');
    const xml = new w.XMLSerializer().serializeToString(el).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${css}]]></style>${xml}</div></foreignObject></svg>`;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('The browser could not draw this page.')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const sc = Math.max(0.5, Math.min(scale, 16000 / H, 16000 / W, Math.sqrt(90e6 / (W * H))));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * sc); canvas.height = Math.round(H * sc);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res, rej) => {
      try { canvas.toBlob(b => (b ? res(b) : rej(new Error('The browser could not save the image.'))), type, 0.92); }
      catch (err) { rej(new Error('This browser blocks saving drawn images (' + err.name + '). Please use Chrome or Edge.')); }
    });
    return { blob, cw: canvas.width, ch: canvas.height };
  }

  async function typesetStage(stage) {
    const w = R.frame.contentWindow;
    if (!R.mathOk) return;
    try { w.MathJax.texReset?.(); w.MathJax.typesetClear?.(); await w.MathJax.typesetPromise([stage]); }
    catch (err) { console.warn('MathJax (export):', err); }
  }

  async function rasterize(inner) {
    await initRenderer();
    const doc = R.frame.contentDocument;
    const W = cfg.width, th = THEMES[cfg.theme] || THEMES.light;
    R.frame.style.width = (W + 60) + 'px';
    doc.getElementById('cardcss').textContent = cardCss(W, th);
    doc.getElementById('pagecss').textContent = '';
    const stage = doc.getElementById('stage');
    stage.innerHTML = `<div class="card">${await inlineImages(inner)}</div>`;
    await typesetStage(stage);
    await Promise.all([...stage.querySelectorAll('img')].map(i => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())));
    await sleep(30);
    const card = stage.firstElementChild;
    const H = Math.ceil(card.getBoundingClientRect().height);
    const r = await shoot(card, W, H, { scale: cfg.scale, bg: th.bg.startsWith('#') ? th.bg : '#15122d', type: cfg.format === 'jpg' ? 'image/jpeg' : 'image/png' });
    return r.blob;
  }
  const ext = () => (cfg.format === 'jpg' ? 'jpg' : 'png');

  /* ===================== Worksheet (A4 PDF) =====================
     Questions are measured, then flowed into columns and pages. Small serif text, options side by side when they are short. */
  const PW = 794, PH = 1123, PADX = 28, PADT = 22, PADB = 32, GAP = 18;
  const FONT = { s: 10.5, m: 11.8, l: 13.5 };

  function pageCss(fs) {
    const imgH = cfg.wsCols === 1 ? 105 : 78, optH = cfg.wsCols === 1 ? 50 : 38, imgW = cfg.wsCols === 1 ? 45 : 58;
    return `*{box-sizing:border-box}
.pg{width:${PW}px;height:${PH}px;padding:${PADT}px ${PADX}px ${PADB}px;background:#fff;color:#000;font-family:Georgia,"Times New Roman","Noto Serif","Noto Serif Devanagari",serif;font-size:${fs}px;line-height:1.3;position:relative;overflow:hidden;overflow-wrap:anywhere}
.pg.meas{height:auto;padding:0;overflow:visible;display:flow-root;position:absolute;left:-9999px;top:0}
.ph{display:flex;align-items:center;gap:12px;padding-bottom:4px;border-bottom:1.5px solid #000;margin-bottom:5px}
.ph .logo{height:38px;width:auto;max-width:130px;object-fit:contain;flex:none;filter:grayscale(1)}
.ph .mid{flex:1;text-align:center;min-width:0}
.ph .sch{font-weight:700;letter-spacing:.05em;text-transform:uppercase;font-size:.9em}
.ph h1{font-size:1.5em;margin:0;line-height:1.15;font-weight:700}
.ph .inf{font-size:.85em;color:#000;margin-top:1px;display:flex;justify-content:center;flex-wrap:wrap;gap:0 14px}
.pf{display:flex;gap:20px;font-size:.95em;margin:0 0 5px}
.pf span{display:flex;gap:6px;align-items:flex-end;flex:1}.pf span.w{flex:2}
.pf i{flex:1;border-bottom:1px solid #000;height:1em}
.pnote{font-size:.85em;font-style:italic;margin:0 0 5px}
.cols{display:flex;gap:${GAP}px;overflow:hidden}
.col{flex:1;min-width:0;position:relative}
.col+.col::before{content:"";position:absolute;left:-${GAP / 2}px;top:0;bottom:0;border-left:1px solid #000}
.pq{display:flex;gap:5px;margin:0 0 3px}.pq.e{margin-bottom:13px}
.pn{flex:none;font-weight:700;min-width:1.6em}
.pb{flex:1;min-width:0}
.pm{flex:none;font-size:.78em;white-space:nowrap;padding-top:.15em}
.pb p{margin:0}.pb>div>p+p{margin-top:.25em}
.pcall{border-left:2px solid #000;padding-left:6px;font-size:.95em}
.po{display:grid;gap:1px 10px}
.po.o1{grid-template-columns:1fr}.po.o2{grid-template-columns:repeat(2,minmax(0,1fr))}.po.o3{grid-template-columns:repeat(3,minmax(0,1fr))}.po.o4{grid-template-columns:repeat(4,minmax(0,1fr))}
.o{display:flex;gap:3px;align-items:baseline;min-width:0;padding:0 2px}
.o b{flex:none}
.o>div{min-width:0}.o p{margin:0}
.o.ok{border:1.3px solid #000;border-radius:3px;font-weight:700}
.pnum{margin-top:3px}
.pans{padding:1px 5px;border:1px solid #000;border-radius:3px;font-size:.95em}
.psol{color:#000}
.pkey{border:1px solid #000;border-radius:3px;padding:4px 6px}
.pkey .t{font-weight:700;margin-bottom:2px;letter-spacing:.04em;text-transform:uppercase;font-size:.88em}
.pkg{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:0 8px;font-size:.95em}
.pkg b{margin-right:3px}
.pfoot{position:absolute;left:${PADX}px;right:${PADX}px;bottom:10px;display:flex;justify-content:space-between;gap:12px;font-size:.75em;color:#000;border-top:1px solid #000;padding-top:2px}
.pg img{display:block;max-width:${imgW}% !important;max-height:${imgH}px;width:auto !important;height:auto !important;margin:2px auto;object-fit:contain}
.pg .o img,.pg .po img{max-width:100% !important;max-height:${optH}px !important;margin:1px 0}
.pg p img,.pg span img{display:inline-block;vertical-align:middle;margin:0 2px}
.pt{display:flow-root}
.pg img.fig{float:right;margin:1px 0 2px 8px;max-width:46% !important;max-height:${imgH + 16}px !important}
.pg img.logo{max-width:130px !important;max-height:none !important;margin:0}
table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #000;padding:1px 4px}
.imgmiss{font-style:italic}`;
  }

  /* How many options sit side by side: short ones go 4 (or 3/2) across, longer ones 2 across, long ones stacked. */
  function optLayout(opts, cols) {
    const lens = opts.map(o => (/<img/i.test(o.html) ? 60 : JW.plainText(o.html).replace(/\\(?:frac|left|right|text|mathrm|,|;|!|cdot)/g, '').replace(/[$\s{}]/g, '').length));
    const mx = Math.max(0, ...lens);
    const [a, b] = cols === 1 ? [22, 58] : [12, 30];
    if (mx <= a && opts.length <= 4 && opts.length >= 2) return 'o' + opts.length;
    return mx <= b && opts.length >= 2 ? 'o2' : 'o1';
  }

  /* Splits HTML into small blocks (paragraphs, figures, tables) so a question can break across columns and pages. */
  function splitBlocks(html) {
    const t = document.createElement('template'); t.innerHTML = html || '';
    const out = []; let run = '';
    const flush = () => { if (run.trim()) out.push('<p>' + run + '</p>'); run = ''; };
    t.content.childNodes.forEach(n => {
      if (n.nodeType === 3) { run += esc(n.textContent); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (['P', 'DIV', 'TABLE', 'UL', 'OL', 'FIGURE', 'PRE', 'BLOCKQUOTE'].includes(tag)) { flush(); out.push(n.outerHTML); }
      else if (tag === 'BR') { run += '<br>'; }
      else if (tag === 'IMG' && !run.trim()) { flush(); out.push(n.outerHTML); }
      else run += n.outerHTML;
    });
    flush();
    return out;
  }

  /* Option layout for the printed paper: images and short text sit side by side so nothing is stretched. */
  function sheetOptLayout(os, cols) {
    const n = os.length;
    if (n < 2 || n > 4) return 'o1';
    if (os.some(o => /<img/i.test(o.html))) return n === 4 && cols === 1 ? 'o4' : 'o2';
    // measure the visible size of each option: LaTeX commands count as nothing, fractions as their parts
    const len = o => JW.plainText(o.html).replace(/\\[a-zA-Z]+/g, '').replace(/[$\s{}^_]/g, '').length;
    const mx = Math.max(...os.map(len));
    const [a, b] = cols === 1 ? [20, 52] : [9, 24];
    if (mx <= a) return 'o' + n;
    return mx <= b ? 'o2' : 'o1';
  }

  function sheetQuestionBlocks(q, i, showAns) {
    const L = cfg.lang, d = JW.qd(q, L), cols = cfg.wsCols;
    const right = JW.qCorrect(q);
    const os = q.kind === 'number' ? [] : optionsOf(q, L);
    const blocks = [];
    [d.direction, d.comprehension].filter(Boolean).forEach(h => splitBlocks(JW.sanitize(h)).forEach(b => blocks.push(`<div class="pcall">${b}</div>`)));
    /* A lone figure goes inline with the question text (floated to the right), so the question and its diagram share the same lines. */
    const isFig = b => /^\s*(?:<p>\s*)?<img\b[^>]*>\s*(?:<\/p>)?\s*$/i.test(b);
    const floatFig = b => { const t = document.createElement('template'); t.innerHTML = b; const im = t.content.querySelector('img'); im.classList.add('fig'); return im.outerHTML; };
    const body = []; let pend = '';
    splitBlocks(JW.sanitize(d.content || '')).forEach(b => {
      if (isFig(b)) {
        if (body.length && !body[body.length - 1].includes('class="fig"') && !/class="[^"]*\bfig\b/.test(body[body.length - 1])) body[body.length - 1] = floatFig(b) + body[body.length - 1];
        else if (!body.length && !pend) pend = floatFig(b);
        else body.push(b);
      } else { body.push(pend + b); pend = ''; }
    });
    if (pend) body.push(pend);
    body.forEach(b => blocks.push(`<div class="pt">${b}</div>`));
    if (!blocks.length) blocks.push('<div class="pt"></div>');
    const hasBlank = /_{2,}|\\underline|\\_|<u>\s*(?:&nbsp;|\s)*<\/u>/i.test(d.content || '');
    if (q.kind === 'number' && !showAns && !hasBlank) blocks[blocks.length - 1] += '<div class="pnum">Answer: ____________</div>';
    if (os.length) {
      const lay = sheetOptLayout(os, cols), per = +(lay.slice(1)) || 1;
      const cell = o => `<div class="o ${showAns && right.includes(o.id) ? 'ok' : ''}"><b>(${esc(o.id)})</b><div>${JW.sanitize(o.html)}</div></div>`;
      const rows = [];
      for (let k = 0; k < os.length; k += per) rows.push(`<div class="po ${lay}">${os.slice(k, k + per).map(cell).join('')}</div>`);
      blocks[blocks.length - 1] += rows.shift();   // keep the question's last line with its first row of options
      rows.forEach(r => blocks.push(r));
    }
    if (showAns) {
      const sol = cfg.wsSolutions ? splitBlocks(JW.sanitize(explainOf(q, L))) : [];
      blocks.push(`<div class="pans"><b>Answer: ${esc(answerOf(q) || '—')}</b></div>`);
      sol.forEach(b => blocks.push(`<div class="psol">${b}</div>`));
    }
    return blocks.map((b, k) => {
      const last = k === blocks.length - 1;
      return `<div class="pq${last ? ' e' : ''}"><div class="pn">${k === 0 ? (i + 1) + '.' : ''}</div><div class="pb">${b}</div><div class="pm">${k === 0 ? '[' + q.marks + ']' : ''}</div></div>`;
    }).join('');
  }

  function sheetHeaderHtml(qs, total, teacher) {
    const lg = logoTag(cfg.logoSheet);
    const title = cfg.setName || cfg.heading || 'Practice worksheet';
    const inf = [`Questions: ${qs.length}`, `Total marks: ${total}`, cfg.wsTime ? `Time: ${esc(cfg.wsTime)}` : '', teacher ? '<b>Teacher copy</b>' : ''].filter(Boolean);
    return `<div class="ph">${cfg.logoPos === 'left' ? lg : ''}<div class="mid">${cfg.school ? `<div class="sch">${esc(cfg.school)}</div>` : ''}<h1>${esc(title)}</h1><div class="inf">${inf.map(x => `<span>${x}</span>`).join('')}</div></div>${cfg.logoPos !== 'left' ? lg : ''}</div>`
      + (!teacher && cfg.wsNameLine ? '<div class="pf"><span class="w">Name<i></i></span><span>Class<i></i></span></div>' : '')
      + (cfg.wsNote ? `<div class="pnote">${esc(cfg.wsNote)}</div>` : '');
  }

  /* Lays the questions out and returns one image per A4 page. */
  async function sheetPages(qs, run) {
    const teacher = cfg.wsMode === 'teacher';
    const sig = JSON.stringify([cfg, qs.map(q => q.id)]);
    if (S.cache && S.cache.sig === sig) return S.cache.pages;
    await initRenderer();
    if (!R.mathOk) toast('Maths could not be loaded — formulas may appear as plain text.');
    const doc = R.frame.contentDocument;
    const cols = cfg.wsCols, fs = FONT[cfg.wsFont] || FONT.m;
    R.frame.style.width = (PW + 60) + 'px';
    doc.getElementById('cardcss').textContent = '';
    doc.getElementById('pagecss').textContent = pageCss(fs);
    const stage = doc.getElementById('stage');
    const inner = PW - 2 * PADX, colW = (inner - (cols - 1) * GAP) / cols;
    const total = qs.reduce((s, q) => s + q.marks, 0);
    const key = cfg.wsMode === 'withkey'
      ? `<div class="pkey"><div class="t">Answer key</div><div class="pkg">${qs.map((q, i) => `<span><b>${i + 1}.</b>${esc(answerOf(q) || '—')}</span>`).join('')}</div></div>` : '';
    run?.update(0, 1, 'Laying out the questions…');
    const bodyHtml = await inlineImages(qs.map((q, i) => sheetQuestionBlocks(q, i, teacher)).join('') + key, true);
    const headHtml = await inlineImages(sheetHeaderHtml(qs, total, teacher), false);
    stage.innerHTML = `<div class="pg meas" id="mBody" style="width:${colW}px">${bodyHtml}</div><div class="pg meas" id="mHead" style="width:${inner}px">${headHtml}</div>`;
    await typesetStage(stage);
    await Promise.all([...stage.querySelectorAll('img')].map(i => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())));
    await sleep(40);
    const items = [...doc.getElementById('mBody').children];
    const hs = items.map(e => Math.ceil(e.getBoundingClientRect().height) + (e.classList.contains('pq') ? (e.classList.contains('e') ? 13 : 3) : 4));
    const headH = Math.ceil(doc.getElementById('mHead').getBoundingClientRect().height) + 4;
    const availRest = PH - PADT - PADB, availFirst = availRest - headH;

    const layout = [{ cols: Array.from({ length: cols }, () => []), avail: availFirst }];
    let c = 0, y = 0;
    const marg = e => (e.classList.contains('pq') ? (e.classList.contains('e') ? 13 : 3) : 4);
    /* A block with a figure that doesn't fit the room left in the column: shrink the figure to fit instead of leaving a hole. */
    const shrinkToFit = (i, room) => {
      const el = items[i], img = el.querySelector('img:not(.logo)');
      if (!img || room < 50) return false;
      const hImg = img.getBoundingClientRect().height, newH = Math.floor(hImg - (hs[i] - room) - 1);
      if (newH < 40) return false;
      const was = hs[i];
      img.style.setProperty('max-height', newH + 'px', 'important');
      hs[i] = Math.ceil(el.getBoundingClientRect().height) + marg(el);
      if (hs[i] <= room) return true;
      img.style.removeProperty('max-height'); hs[i] = was; return false;
    };
    items.forEach((_, i) => {
      let pg = layout[layout.length - 1];
      if (y + hs[i] > pg.avail && shrinkToFit(i, pg.avail - y)) { /* fits now */ }
      else if (y > 0 && y + hs[i] > pg.avail) {
        c++; y = 0;
        if (c >= cols) { c = 0; pg = { cols: Array.from({ length: cols }, () => []), avail: availRest }; layout.push(pg); }
      }
      pg.cols[c].push(i); y += hs[i];
    });

    const th = { scale: ({ 1: 1.6, 2: 2.5, 3: 3.4 })[cfg.scale] || 2.5, bg: '#ffffff', type: 'image/jpeg' };
    const pages = [];
    for (let p = 0; p < layout.length; p++) {
      if (run?.cancelled) throw Object.assign(new Error('cancelled'), { cancelled: true });
      run?.update(p, layout.length, `Drawing page ${p + 1} of ${layout.length}…`);
      const pgEl = doc.createElement('div');
      pgEl.className = 'pg';
      pgEl.innerHTML = (p === 0 ? doc.getElementById('mHead').innerHTML : '') + `<div class="cols" style="height:${layout[p].avail}px"></div>`
        + `<div class="pfoot"><span>${esc(cfg.footer || '')}</span><span>Page ${p + 1} of ${layout.length}</span></div>`;
      const colsEl = pgEl.querySelector('.cols');
      layout[p].cols.forEach(list => {
        const col = doc.createElement('div'); col.className = 'col';
        list.forEach(i => col.appendChild(items[i].cloneNode(true)));
        colsEl.appendChild(col);
      });
      stage.appendChild(pgEl);
      await sleep(10);
      pages.push(await shoot(pgEl, PW, PH, th));
      pgEl.remove();
      await sleep(0);
    }
    S.cache = { sig, pages };
    return pages;
  }

  /* ===================== Selection logic ===================== */
  const S = { cache: null };
  const KIND_LABEL = { single: 'Single correct', multi: 'Multiple correct', number: 'Numerical' };
  const GROUPS = [
    ['topic', 'Topic', q => q.topic || 'General'],
    ['chapter', 'Chapter', q => q.chapter],
    ['year', 'Year', q => (q.year ? String(q.year) : 'Year n/a')],
    ['paper', 'Paper', q => q.paper || 'Paper n/a'],
    ['diff', 'Difficulty', q => q.diff],
    ['type', 'Type', q => KIND_LABEL[q.kind]],
    ['marks', 'Marks', q => `+${q.marks} / −${q.neg}`],
    ['syllabus', 'Syllabus', q => (q.bonus ? 'Bonus' : q.oos ? 'Out of syllabus' : 'In syllabus')]
  ];
  const gfn = k => GROUPS.find(g => g[0] === k)?.[2];
  const multiChap = () => new Set(T.pool.map(q => q.file)).size > 1;

  function filtered(skipGroup) {
    let list = T.pool;
    const s = T.q.trim().toLowerCase();
    if (s) list = list.filter(q => JW.searchText(q).includes(s));
    if (T.year) list = list.filter(q => String(q.year) === T.year);
    if (T.diff) list = list.filter(q => q.diff === T.diff);
    if (T.kind) list = list.filter(q => q.kind === T.kind);
    if (T.chap) list = list.filter(q => q.file === T.chap);
    if (T.used) { const u = usedMap(); list = list.filter(q => (T.used === 'fresh') === !u[q.id]); }
    if (!skipGroup && T.gsel && gfn(T.group)) list = list.filter(q => gfn(T.group)(q) === T.gsel);
    return JW.ordered(list, T.sort);
  }

  function orderGroups(list, key) {
    const fn = gfn(key), m = new Map();
    for (const q of list) { const l = fn(q); (m.get(l) || m.set(l, []).get(l)).push(q); }
    const arr = [...m].map(([label, qs]) => ({ label, qs }));
    const rank = (a, l) => { const i = a.indexOf(l); return i < 0 ? 99 : i; };
    const dir = T.sort === 'oldest' ? 1 : -1;
    if (key === 'topic') arr.sort((a, b) => b.qs.length - a.qs.length || a.label.localeCompare(b.label));
    else if (key === 'chapter') { const idx = new Map(); T.pool.forEach(q => { if (!idx.has(q.chapter)) idx.set(q.chapter, idx.size); }); arr.sort((a, b) => idx.get(a.label) - idx.get(b.label)); }
    else if (key === 'year' || key === 'paper') arr.sort((a, b) => dir * (a.qs[0].sortKey - b.qs[0].sortKey));
    else if (key === 'diff') arr.sort((a, b) => rank(['Easy', 'Medium', 'Hard'], a.label) - rank(['Easy', 'Medium', 'Hard'], b.label));
    else if (key === 'type') arr.sort((a, b) => rank(Object.values(KIND_LABEL), a.label) - rank(Object.values(KIND_LABEL), b.label));
    else if (key === 'marks') arr.sort((a, b) => b.qs[0].marks - a.qs[0].marks || a.qs[0].neg - b.qs[0].neg);
    else if (key === 'syllabus') arr.sort((a, b) => rank(['In syllabus', 'Bonus', 'Out of syllabus'], a.label) - rank(['In syllabus', 'Bonus', 'Out of syllabus'], b.label));
    return arr;
  }

  function selected() {
    const byId = new Map(T.pool.map(q => [q.id, q]));
    let list = [...T.picked].map(id => byId.get(id)).filter(Boolean);
    if (cfg.order === 'paper') list = JW.ordered(list, 'newest');
    else if (cfg.order === 'chapter') {
      const idx = new Map(); T.pool.forEach(q => { if (!idx.has(q.file)) idx.set(q.file, idx.size); });
      list = JW.ordered(list, 'newest').sort((a, b) => idx.get(a.file) - idx.get(b.file));
    } else if (cfg.order === 'random') {
      const key = [...T.picked].join('|');
      if (T.shufKey !== key) { T.shufList = shuffle([...T.picked]); T.shufKey = key; }
      list = T.shufList.map(id => byId.get(id)).filter(Boolean);
    } else if (cfg.order === 'diff') { const r = { Easy: 0, Medium: 1, Hard: 2 }; list = list.map((q, i) => [q, i]).sort((a, b) => (r[a[0].diff] ?? 3) - (r[b[0].diff] ?? 3) || a[1] - b[1]).map(x => x[0]); }
    return list;
  }
  const selSummary = qs => {
    const d = ['Easy', 'Medium', 'Hard'].map(k => [k, qs.filter(q => q.diff === k).length]).filter(x => x[1]);
    return `${qs.reduce((s, q) => s + q.marks, 0)} marks` + (d.length ? ' · ' + d.map(([k, n]) => `${n} ${k}`).join(' · ') : '');
  };

  function randomPick() {
    let list = filtered();
    if (T.skipUsed) { const u = usedMap(); list = list.filter(q => !u[q.id]); }
    list = list.filter(q => !T.picked.has(q.id));
    const want = Math.max(1, Math.min(Number(T.n) || 10, list.length));
    const ratios = { random: null, balanced: { Easy: .3, Medium: .5, Hard: .2 }, easy: { Easy: .6, Medium: .3, Hard: .1 }, hard: { Easy: .1, Medium: .3, Hard: .6 } }[T.mix];
    const chosen = [];
    if (ratios) {
      for (const d of Object.keys(ratios)) chosen.push(...shuffle(list.filter(q => q.diff === d)).slice(0, Math.round(want * ratios[d])));
    }
    const have = new Set(chosen.map(q => q.id));
    chosen.push(...shuffle(list.filter(q => !have.has(q.id))).slice(0, Math.max(0, want - chosen.length)));
    chosen.slice(0, want).forEach(q => T.picked.add(q.id));
    return Math.min(want, chosen.length);
  }

  /* ===================== Saved sets ===================== */
  const getSets = () => (store.get(K.sets, []) || []).filter(s => s && Array.isArray(s.ids));
  function saveSet() {
    const name = ($('#tSetName')?.value || cfg.setName || '').trim() || `Set ${today()}`;
    const qs = [...T.picked].map(id => T.pool.find(q => q.id === id)).filter(Boolean);
    if (!qs.length) { toast('Pick some questions first.'); return; }
    const sets = getSets();
    sets.unshift({ id: Date.now().toString(36), name, exam: app.exam, ids: qs.map(q => q.id), files: [...new Set(qs.map(q => q.file))], date: Date.now() });
    store.set(K.sets, sets.slice(0, 60));
    toast(`Saved “${name}”.`);
  }
  async function loadSet(id) {
    const s = getSets().find(x => x.id === id);
    if (!s) return;
    if (s.exam && s.exam !== app.exam) { toast(`That set is for ${JW.examName(s.exam)} — switch exam at the top first.`); return; }
    if (!cfg.setName) { cfg.setName = s.name; saveCfg(); }
    await loadPool(s.files.filter(p => data.byPath.has(p)), s.ids, s.name);
  }
  function exportSet(id) {
    const s = getSets().find(x => x.id === id);
    if (s) download(new Blob([JSON.stringify({ jeewise: 1, ...s }, null, 1)], { type: 'application/json' }), `jeewise-set-${slug(s.name)}.json`);
  }
  async function importSet(file) {
    try {
      const j = JSON.parse(await file.text());
      if (!j || !Array.isArray(j.ids) || !Array.isArray(j.files)) throw new Error('bad');
      const sets = getSets();
      sets.unshift({ id: Date.now().toString(36), name: String(j.name || 'Imported set').slice(0, 80), exam: j.exam || app.exam, ids: j.ids.map(String), files: j.files.map(String), date: Date.now() });
      store.set(K.sets, sets.slice(0, 60));
      toast('Set imported.'); draw(true);
    } catch { toast('That file is not a JEEwise set.'); }
  }

  /* ===================== Loading a pool of questions ===================== */
  function resetPool() { T.pool = []; T.picked = new Set(); T.loaded = false; T.step = 1; S.cache = null; }

  async function loadPool(paths, preselect, title) {
    if (T.loading) return;
    T.loading = true; drawBar();
    try {
      const qs = await JW.loadFiles(paths, (d, t) => { const b = $('#tLoadBtn'); if (b) b.textContent = `Loading ${d}/${t}…`; });
      if (!qs.length) { toast('Could not load those chapters.'); return; }
      T.pool = qs; T.loaded = true; T.srcTitle = title || ''; S.cache = null;
      T.picked = new Set(preselect ? preselect.filter(id => qs.some(q => q.id === id)) : []);
      Object.assign(T, { q: '', year: '', diff: '', kind: '', chap: '', used: '', limit: 40, gsel: '', collapsed: new Set() });
      T.group = multiChap() ? 'chapter' : 'topic';
      go(2);
    } finally { T.loading = false; drawBar(); }
  }

  async function loadQuick(which) {
    const ids = which === 'bm' ? [...JW.bookmarks()] : which === 'rv' ? [...JW.reviews()] : JW.wrongIds();
    const { paths } = JW.filesForIds(ids);
    const ok = paths.filter(p => data.byPath.get(p)?.exam === app.exam);
    if (!ok.length) { toast('Nothing here yet for this exam.'); return; }
    await JW.loadFiles(ok);
    const qs = ids.map(id => JW.byId(id)).filter(q => q && q.exam === app.exam);
    if (!qs.length) { toast('Nothing here yet for this exam.'); return; }
    await loadPool(ok, qs.map(q => q.id), which === 'bm' ? 'Bookmarked questions' : which === 'rv' ? 'Review later' : 'Mistakes');
  }

  /* ===================== Navigation ===================== */
  const STEPS = [['Chapters', 'Where from'], ['Questions', 'Pick'], ['Customise', 'Make it yours'], ['Export', 'Download']];
  const STEP_HEAD = [
    null,
    ['Choose chapters', 'Tick the chapters to take questions from. You pick the exact questions in the next step.'],
    ['Pick questions', 'Full questions are shown so you can choose exactly the ones you like. Tap a card to add or remove it.'],
    ['Customise', 'Only the first block really matters — everything below it is optional polish.'],
    ['Export', 'Download a worksheet PDF, slide images, or both. We keep count of what you have already used.']
  ];
  const maxStep = () => (!T.loaded ? 1 : T.picked.size ? (cfg.output ? 4 : 3) : 2);
  function go(s) { const h = '#/teacher/' + s; if (location.hash === h) page(); else location.hash = h; }

  function page() {
    if (T.loaded && T.pool[0] && T.pool[0].exam !== app.exam) resetPool();
    const m = location.hash.match(/^#\/teacher\/(\d)/);
    let s = m ? Number(m[1]) : (T.loaded ? T.step : 1);
    s = Math.max(1, Math.min(s, maxStep()));
    T.step = s;
    draw();
  }

  /* ===================== Page shell ===================== */
  const det = (k, title, sub, body, def = false) => `<details class="t-det" data-k="${k}" ${(k in T.od ? T.od[k] : def) ? 'open' : ''}><summary><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span><i class="chev"></i></summary><div class="t-det-b">${body}</div></details>`;
  T.od = {};

  function stepperHtml() {
    const max = maxStep();
    return `<ol class="t-steps" aria-label="Steps">${STEPS.map(([l, s], i) => {
      const n = i + 1, cls = n === T.step ? 'cur' : n < T.step ? 'done' : '';
      return `<li><button class="t-step ${cls}" data-t="goto" data-v="${n}" ${n <= max ? '' : 'disabled'} ${n === T.step ? 'aria-current="step"' : ''}><span class="n">${n < T.step ? icon('check') : n}</span><span class="l"><b>${l}</b><small>${s}</small></span></button></li>`;
    }).join('')}</ol>`;
  }

  function draw(keep) {
    const [title, sub] = STEP_HEAD[T.step];
    const body = [null, step1Html, step2Html, step3Html, step4Html][T.step]();
    JW.setView(`
      <div class="page-head"><div>
        <div class="eyebrow">Teacher mode · ${esc(JW.examName(app.exam))}</div>
        <h1>${title}</h1><p>${sub}</p></div></div>
      ${stepperHtml()}
      <div id="tBody">${body}</div>
      ${T.step < 4 ? '<div class="sticky-bar t-bar" id="tBar"></div>' : ''}`, { scroll: !keep });
    if (T.step === 1) { drawTabs(); drawChapArea(); }
    if (T.step === 2) { drawList(); }
    if (T.step === 3) JW.observeMath($('#tBody'));
    drawBar();
    hydrateIcons($('#view'));
  }

  function drawBar() {
    const el = $('#tBar'); if (!el) return;
    const qs = selected();
    if (T.step === 1) {
      const sel = [...T.chapSel].map(p => data.byPath.get(p)).filter(Boolean);
      const n = sel.reduce((s, f) => s + f.count, 0);
      el.innerHTML = `<div>${sel.length ? `<b>${plural(sel.length, 'chapter')}</b> <span class="muted">· ${plural(n, 'question')}</span>` : '<span class="muted">Select at least one chapter</span>'}</div>
        <button class="btn primary" id="tLoadBtn" data-t="load" ${sel.length && !T.loading ? '' : 'disabled'}>Load questions ${icon('right')}</button>`;
    } else {
      const info = qs.length ? `<b>${plural(qs.length, 'question')} selected</b> <span class="muted">· ${selSummary(qs)}</span>` : '<span class="muted">Tap questions to select them</span>';
      el.innerHTML = `<div class="t-bar-info">${info}</div><div class="t-bar-btns"><button class="btn" data-t="back">${icon('left')} Back</button>
        <button class="btn primary" data-t="next" ${qs.length && (T.step !== 3 || cfg.output) ? '' : 'disabled'}>${T.step === 2 ? 'Next: Customise' : 'Next: Export'} ${icon('right')}</button></div>`;
    }
    hydrateIcons(el);
  }

  /* ===================== Step 1 — chapters ===================== */
  const groupFiles = files => (JW.groupFiles ? JW.groupFiles(files) : [['Chapters', files]]);
  const inSylFirst = files => (JW.inSyllabusFirst ? JW.inSyllabusFirst(files) : files);

  function step1Html() {
    const exam = app.exam, subs = JW.examSubjects(exam);
    for (const p of [...T.chapSel]) if (data.byPath.get(p)?.exam !== exam) T.chapSel.delete(p);
    if (!T.subj || !subs.includes(T.subj)) T.subj = subs[0] || '';
    const sets = getSets().filter(s => !s.exam || s.exam === exam);
    const quick = (v, ic, label, n, desc) => `<button class="t-qk" data-t="quick" data-v="${v}" ${n ? '' : 'disabled'}><span class="i">${icon(ic)}</span><b>${label} <em>${n}</em></b><small>${desc}</small></button>`;
    return `
      <section class="t-blk"><h2 class="t-h2">Quick start <small>optional</small></h2>
        <div class="t-qks">
          ${quick('bm', 'star', 'Bookmarked', JW.bookmarks().size, 'Questions you starred')}
          ${quick('rv', 'flag', 'Review later', JW.reviews().size, 'Questions you flagged')}
          ${quick('wr', 'x', 'Mistakes', JW.wrongIds().length, 'Ones you got wrong')}
        </div>
        ${det('sets', 'Saved sets', sets.length ? plural(sets.length, 'set') : 'None yet', `
          ${sets.length ? sets.map(s => `<div class="t-set"><div class="grow"><b>${esc(s.name)}</b><small class="muted"> · ${plural(s.ids.length, 'question')} · ${new Date(s.date).toLocaleDateString()}</small></div>
            <button class="btn sm" data-t="set-load" data-id="${esc(s.id)}">Open</button>
            <button class="icon-btn" data-t="set-export" data-id="${esc(s.id)}" aria-label="Download set file" title="Download set file">${icon('download')}</button>
            <button class="icon-btn" data-t="set-del" data-id="${esc(s.id)}" aria-label="Delete set" title="Delete set">${icon('trash')}</button></div>`).join('')
            : '<p class="muted" style="margin:0 0 10px">After picking questions you can save them as a set (step 4) and reopen them here.</p>'}
          <label class="btn sm ghost" style="cursor:pointer">${icon('download')} Import a set file<input type="file" accept="application/json,.json" data-t="import" hidden></label>`, sets.length > 0)}
      </section>
      <section class="t-blk"><h2 class="t-h2">Chapters</h2>
        <div class="tabs" id="tTabs"></div>
        <div class="toolbar"><input class="input search" id="tChapSearch" type="search" placeholder="Search chapters or topics…" value="${esc(T.chapQ)}" aria-label="Search chapters"></div>
        <div id="tChapArea"></div>
      </section>`;
  }

  function drawTabs() {
    const el = $('#tTabs'); if (!el) return;
    el.innerHTML = JW.examSubjects(app.exam).map(s => {
      const files = JW.filesFor(app.exam, s), n = files.filter(f => T.chapSel.has(f.path)).length;
      return `<button class="tab ${s === T.subj ? 'active' : ''}" data-t="subj" data-v="${esc(s)}">${esc(s)}<span class="n">${n ? n + ' ✓' : files.length}</span></button>`;
    }).join('');
  }

  function visibleGroups() {
    let files = inSylFirst(JW.filesFor(app.exam, T.subj));
    const q = T.chapQ.trim().toLowerCase();
    if (q) files = files.filter(f => f.chapter.toLowerCase().includes(q) || (f.topics || []).some(t => String(t.n).toLowerCase().includes(q)));
    return groupFiles(files);
  }

  function pickBtn(f) {
    const info = JW.chapInfo(f), on = T.chapSel.has(f.path);
    return `<button class="pick ${on ? 'on' : ''} ${info.allOos ? 'oos' : ''}" data-t="chap" data-path="${esc(f.path)}" aria-pressed="${on}">
      <span class="box">${icon('check')}</span><span class="name">${esc(f.chapter)}${info.allOos ? ' <i class="oos-tag">Out of syllabus</i>' : ''}</span><small>${f.count}</small></button>`;
  }

  function drawChapArea() {
    const el = $('#tChapArea'); if (!el) return;
    const groups = visibleGroups();
    el.innerHTML = groups.length ? groups.map(([g, files]) => {
      const named = groups.length > 1 || g !== 'Chapters';
      const all = files.every(f => T.chapSel.has(f.path));
      return `<div class="t-grp"><div class="t-gh"><div><b>${named ? esc(g) : 'All chapters'}</b><span>${plural(files.length, 'chapter')} · ${plural(files.reduce((s, f) => s + f.count, 0), 'question')}</span></div>
        <button class="btn ghost sm" data-t="grp-all" data-g="${esc(g)}">${all ? 'Clear' : 'Select all'}</button></div>
        <div class="grid cols-auto">${files.map(pickBtn).join('')}</div></div>`;
    }).join('') : '<div class="empty"><strong>No chapters match</strong><span>Try a different search.</span></div>';
    hydrateIcons(el);
  }

  /* ===================== Step 2 — pick questions ===================== */
  function step2Html() {
    const years = [...new Set(T.pool.map(q => q.year).filter(Boolean))].sort((a, b) => b - a);
    const diffs = [...new Set(T.pool.map(q => q.diff))].filter(d => d !== 'Unknown').sort((a, b) => ['Easy', 'Medium', 'Hard'].indexOf(a) - ['Easy', 'Medium', 'Hard'].indexOf(b));
    const chaps = [...new Set(T.pool.map(q => q.file))].map(p => data.byPath.get(p)).filter(Boolean);
    const o = (v, l, c) => `<option value="${esc(v)}" ${String(c) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
    const u = usedMap(), usedN = T.pool.filter(q => u[q.id]).length;
    const gkeys = GROUPS.filter(g => g[0] !== 'chapter' || multiChap());
    return `
      <p class="t-src">${esc(T.srcTitle ? T.srcTitle + ' · ' : '')}<b>${plural(T.pool.length, 'question')}</b> loaded${usedN ? ` · <span class="warn-t">${usedN} used before</span>` : ''}</p>
      <div class="t-card">
        <div class="toolbar" style="margin:0">
          <input class="input search" id="tSearch" type="search" placeholder="Search questions…" value="${esc(T.q)}" aria-label="Search">
          <select class="select" data-tf="year" aria-label="Year">${o('', 'All years', T.year)}${years.map(y => o(y, y, T.year)).join('')}</select>
          <select class="select" data-tf="diff" aria-label="Difficulty">${o('', 'Any difficulty', T.diff)}${diffs.map(d => o(d, d, T.diff)).join('')}</select>
          <select class="select" data-tf="kind" aria-label="Type">${o('', 'Any type', T.kind)}${[['single', 'Single correct'], ['multi', 'Multiple correct'], ['number', 'Numerical']].filter(([k]) => T.pool.some(q => q.kind === k)).map(([k, l]) => o(k, l, T.kind)).join('')}</select>
          ${chaps.length > 1 ? `<select class="select" data-tf="chap" aria-label="Chapter">${o('', 'All chapters', T.chap)}${chaps.map(f => o(f.path, f.chapter, T.chap)).join('')}</select>` : ''}
          <select class="select" data-tf="used" aria-label="Used before">${o('', 'Used or not', T.used)}${o('fresh', 'Not used yet', T.used)}${o('used', 'Used before', T.used)}</select>
          <select class="select" data-tf="sort" aria-label="Order">${o('newest', 'Newest first', T.sort)}${o('oldest', 'Oldest first', T.sort)}</select>
        </div>
        <div class="t-gb"><span class="muted">Group by</span><div class="t-seg">${gkeys.map(([k, l]) => `<button class="${T.group === k ? 'active' : ''}" data-t="group" data-v="${k}">${l}</button>`).join('')}<button class="${T.group === 'none' ? 'active' : ''}" data-t="group" data-v="none">None</button></div></div>
      </div>
      ${det('auto', 'Let me pick for you', 'Random questions from what is shown below', `
        <div class="t-tools-row">
          <input class="input t-num" id="tN" type="number" min="1" max="200" value="${esc(T.n)}" aria-label="How many">
          <select class="select t-mix" data-tf="mix" aria-label="Difficulty mix">${o('random', 'Random mix', T.mix)}${o('balanced', 'Balanced (30/50/20)', T.mix)}${o('easy', 'Easier', T.mix)}${o('hard', 'Harder', T.mix)}</select>
          <label class="t-check"><input type="checkbox" data-tf="skipUsed" ${T.skipUsed ? 'checked' : ''}> Skip used</label>
          <button class="btn sm primary" data-t="rand">${icon('shuffle')} Add</button></div>`)}
      <div class="t-tools-row t-listbar">
        <button class="btn sm" data-t="sel-all">Select all shown</button><button class="btn sm" data-t="sel-none">Clear</button><button class="btn sm" data-t="sel-inv">Invert</button>
        <label class="t-check" style="margin-left:auto"><input type="checkbox" data-tf="showAns" ${T.showAns ? 'checked' : ''}> Show answers</label></div>
      <div class="result-line"><span id="tCount"></span></div>
      <div class="gstrip" id="tGStrip"></div>
      <div id="tList"></div>`;
  }

  function tqCard(q, i, ord, u, mc) {
    const L = cfg.lang, d = JW.qd(q, L), right = JW.qCorrect(q);
    const co = [d.direction, d.comprehension].filter(Boolean).map(h => `<div class="tq-call">${JW.sanitize(h)}</div>`).join('');
    const os = q.kind === 'number' ? [] : optionsOf(q, L);
    const opts = os.length ? `<div class="tq-opts ${optLayout(os, 1)}">${os.map(op => `<div class="tq-o ${T.showAns && right.includes(op.id) ? 'ok' : ''}"><b>${esc(op.id)}</b><div>${JW.sanitize(op.html)}</div></div>`).join('')}</div>` : '';
    const ans = T.showAns ? `<div class="tq-ans">Answer: <b>${esc(answerOf(q) || '—')}</b></div>` : '';
    const on = T.picked.has(q.id);
    return `<article class="tq ${on ? 'on' : ''}" data-t="toggle" data-id="${esc(q.id)}" tabindex="0" role="checkbox" aria-checked="${on}">
      <div class="tq-side"><span class="tbox">${icon('check')}</span><small class="tq-ord">${on ? '#' + ord.get(q.id) : ''}</small></div>
      <div class="tq-main">
        <div class="qmeta"><span class="tq-i">${i}</span>${q.bonus ? '<span class="chip bonus">Bonus</span>' : ''}${q.oos ? '<span class="chip oos">Out of syllabus</span>' : ''}
          <span class="chip">${esc(q.year || 'Year n/a')}</span>${JW.paperShort(q) ? `<span class="chip">${esc(JW.paperShort(q))}</span>` : ''}
          <span class="chip ${q.diff.toLowerCase()}">${esc(q.diff)}</span><span class="chip">${esc(kindLabel(q))}</span><span class="chip">+${q.marks}${q.neg ? ` / −${q.neg}` : ''}</span>
          ${T.group !== 'topic' && q.topic ? `<span class="chip">${esc(q.topic)}</span>` : ''}${mc && T.group !== 'chapter' ? `<span class="chip">${esc(q.chapter)}</span>` : ''}
          ${u[q.id] ? `<span class="chip warn">Used ${ago(u[q.id])}</span>` : ''}</div>
        <div class="mj tq-body">${co}<div class="tq-q">${JW.sanitize(d.content || 'Question text unavailable.')}</div>${opts}${ans}</div>
      </div></article>`;
  }

  function tgHead(g) {
    const sel = g.qs.filter(q => T.picked.has(q.id)).length, col = T.collapsed.has(g.label);
    return `<div class="tg-head"><button class="tg-t ${col ? 'shut' : ''}" data-t="gcollapse" data-g="${esc(g.label)}" aria-expanded="${!col}"><i class="chev"></i><span><b>${esc(g.label)}</b><small>${plural(g.qs.length, 'question')}${sel ? ` · ${sel} selected` : ''}</small></span></button>
      <button class="btn ghost sm" data-t="gsel-all" data-g="${esc(g.label)}">${sel === g.qs.length ? 'Clear group' : 'Select group'}</button></div>`;
  }

  function drawList() {
    const list = $('#tList'); if (!list) return;
    const all = filtered(true), f = filtered(), u = usedMap(), mc = multiChap();
    const ord = new Map([...T.picked].map((id, i) => [id, i + 1]));
    const gk = T.group !== 'none' && gfn(T.group) ? T.group : null;
    const strip = $('#tGStrip');
    if (strip) {
      const gs = gk ? orderGroups(all, gk) : [];
      strip.innerHTML = gs.length > 1 ? `<button class="gchip ${T.gsel === '' ? 'active' : ''}" data-t="gfilter" data-g="">All<span>${all.length}</span></button>`
        + gs.map(g => `<button class="gchip ${T.gsel === g.label ? 'active' : ''}" data-t="gfilter" data-g="${esc(g.label)}">${esc(g.label)}<span>${g.qs.length}</span></button>`).join('') : '';
    }
    const groups = gk ? orderGroups(f, gk) : [{ label: null, qs: f }];
    let budget = T.limit, idx = 0, html = '', hidden = 0;
    for (const g of groups) {
      if (budget <= 0) { hidden += g.qs.length; continue; }
      if (g.label !== null) html += tgHead(g);
      if (g.label !== null && T.collapsed.has(g.label)) { idx += g.qs.length; continue; }
      const take = g.qs.slice(0, budget);
      budget -= take.length;
      html += take.map(q => tqCard(q, ++idx, ord, u, mc)).join('');
      hidden += g.qs.length - take.length; idx += g.qs.length - take.length;
    }
    $('#tCount').innerHTML = `<b>${T.picked.size}</b> selected · ${f.length === T.pool.length ? plural(f.length, 'question') : `${f.length} of ${T.pool.length} shown`}`;
    list.innerHTML = f.length ? html + (hidden > 0 ? `<div style="text-align:center;margin-top:14px"><button class="btn" data-t="more">Show ${Math.min(40, hidden)} more</button></div>` : '')
      : '<div class="empty"><strong>No questions match</strong><span>Try clearing a filter.</span></div>';
    hydrateIcons(list); JW.observeMath(list);
    drawBar();
  }

  function refreshOrd() {
    const ord = new Map([...T.picked].map((id, i) => [id, i + 1]));
    $$('.tq').forEach(el => {
      const on = T.picked.has(el.dataset.id);
      el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on));
      const o = el.querySelector('.tq-ord'); if (o) o.textContent = on ? '#' + ord.get(el.dataset.id) : '';
    });
    $('#tCount')?.firstElementChild && ($('#tCount').firstElementChild.textContent = T.picked.size);
    $$('.tg-head').forEach(h => {
      const g = h.querySelector('[data-g]')?.dataset.g, gk = gfn(T.group);
      if (g == null || !gk) return;
      const qs = filtered().filter(q => gk(q) === g), sel = qs.filter(q => T.picked.has(q.id)).length;
      const sm = h.querySelector('small'); if (sm) sm.textContent = `${plural(qs.length, 'question')}${sel ? ` · ${sel} selected` : ''}`;
      const b = h.querySelector('[data-t="gsel-all"]'); if (b) b.textContent = sel === qs.length ? 'Clear group' : 'Select group';
    });
    drawBar();
  }

  /* ===================== Step 3 — customise ===================== */
  const orow = (label, desc, ctl) => `<div class="t-or"><div class="t-ot"><b>${label}</b><small>${desc}</small></div><div class="t-oc">${ctl}</div></div>`;
  const sw = k => `<button class="t-sw ${cfg[k] ? 'on' : ''}" role="switch" aria-checked="${!!cfg[k]}" aria-label="Toggle" data-t="tog" data-k="${k}"><i></i></button>`;
  const seg = (k, opts) => `<div class="t-seg">${opts.map(([v, l]) => `<button class="${String(cfg[k]) === String(v) ? 'active' : ''}" data-t="cfg" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const card = (k, v, ic, title, desc) => `<button class="order-card ${String(cfg[k]) === String(v) ? 'active' : ''}" data-t="cfg" data-k="${k}" data-v="${v}"><span class="i">${icon(ic)}</span><b>${title}</b><small>${desc}</small></button>`;
  const txt = (k, ph, max = 80) => `<input class="input" data-tx="${k}" maxlength="${max}" placeholder="${esc(ph)}" value="${esc(cfg[k])}">`;

  function step3Html() {
    const qs = selected(), byOrder = cfg.order === 'selection';
    const review = qs.map((q, i) => `<div class="t-rv"><span class="n">${i + 1}</span><div class="t mj">${esc(JW.previewText(q))}</div>
      ${byOrder ? `<button class="icon-btn" data-t="mv" data-d="-1" data-id="${esc(q.id)}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
      <button class="icon-btn" data-t="mv" data-d="1" data-id="${esc(q.id)}" aria-label="Move down" ${i === qs.length - 1 ? 'disabled' : ''}>${icon('down')}</button>` : ''}
      <button class="icon-btn" data-t="rm" data-id="${esc(q.id)}" aria-label="Remove question" title="Remove">${icon('x')}</button></div>`).join('');
    return `
      <section class="t-blk t-must"><h2 class="t-h2">The basics <small>worth a look</small></h2>
        <div class="field"><span class="label">Name of this test or set</span>
          ${txt('setName', 'e.g. Properties of Matter — Unit Test 1', 60)}
          <p class="t-help">Shown as the worksheet title, used in file names, and used when you save the set.</p></div>
        <div class="field"><span class="label">What do you want to make?</span>
          <div class="order-grid two t-what">
            ${card('output', 'worksheet', 'print', 'Worksheet (PDF)', 'A printable A4 paper for students. Student paper, with answer key, or teacher copy.')}
            ${card('output', 'slides', 'image', 'Slides (images)', 'Question and answer images in a ZIP, ready for a projector, slides or WhatsApp.')}
          </div>
          ${cfg.output ? '' : '<p class="t-help t-askhint">Pick one to continue — you can come back and make the other later.</p>'}</div>
        ${cfg.output === 'slides' ? `<div class="field"><span class="label">Images per question</span>
          <div class="order-grid two">
            ${card('mode', '2', 'image', '2 images', 'One image with the question, a second with the answer and solution. Best for teaching.')}
            ${card('mode', '1', 'image', '1 image', 'The question with its answer written underneath. Best for quick answer keys.')}
          </div></div>` : ''}
        ${cfg.output === 'worksheet' ? `<div class="field"><span class="label">Which copy?</span>
          <div class="order-grid">
            ${card('wsMode', 'paper', 'print', 'Student paper', 'Questions only, with a space for name and class.')}
            ${card('wsMode', 'withkey', 'print', 'Paper + answer key', 'Student paper with a small answer key at the end.')}
            ${card('wsMode', 'teacher', 'print', 'Teacher copy', 'Correct options marked, with the answer and solution.')}
          </div></div>` : ''}
        ${cfg.output ? `<div class="field" style="margin-bottom:0"><span class="label">Question order</span>
          <div class="choices">${[['selection', 'As I picked'], ['paper', 'Newest first'], ['chapter', 'By chapter'], ['diff', 'Easy → Hard'], ['random', 'Shuffle']].map(([v, l]) => `<button class="choice ${cfg.order === v ? 'active' : ''}" data-t="cfg" data-k="order" data-v="${v}">${l}</button>`).join('')}</div>
          <p class="t-help">Question numbers stay the same in the files you download.</p></div>` : ''}
      </section>

      ${!cfg.output ? '' : `<section class="t-blk"><h2 class="t-h2">Your branding <small>optional</small></h2>
        ${orow('Logo', 'Your school or coaching logo. Added to every slide and the worksheet header. PNG, JPG or SVG.', `<div class="t-logo">
          ${cfg.logo ? `<img src="${cfg.logo}" alt="Your logo"><button class="btn sm ghost danger" data-t="logo-del">Remove</button>` : ''}
          <label class="btn sm" style="cursor:pointer">${icon('image')} ${cfg.logo ? 'Change' : 'Upload logo'}<input type="file" accept="image/*" data-t="logo" hidden></label></div>`)}
        ${cfg.logo && cfg.output === 'slides' ? orow('Show logo on slides', 'Appears in the top corner of every question and answer image.', sw('logoSlides')) : ''}
        ${cfg.logo && cfg.output === 'worksheet' ? orow('Show logo on worksheet', 'Appears in the header of the worksheet PDF.', sw('logoSheet')) : ''}
        ${cfg.logo ? orow('Logo position', 'Which corner the logo sits in.', seg('logoPos', [['left', 'Left'], ['right', 'Right']])) : ''}
        ${cfg.logo ? orow('Logo size', 'Small keeps more room for the question.', seg('logoSize', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])) : ''}
        ${cfg.output === 'worksheet' ? orow('School / institute name', 'Printed at the top of the worksheet.', txt('school', 'e.g. Sharma Physics Classes')) : ''}
        ${cfg.output === 'slides' ? orow('Heading on slides', 'A short line in the top corner of every slide.', txt('heading', 'e.g. Class 12 · Unit Test 3')) : ''}
        ${orow('Footer', cfg.output === 'slides' ? 'Small text at the bottom of every slide.' : 'Small text at the bottom of every worksheet page.', txt('footer', 'e.g. Sharma Physics Classes'))}
      </section>`}

      ${!cfg.output ? '' : `<section class="t-blk"><h2 class="t-h2">Your selection <small>${plural(qs.length, 'question')} · ${selSummary(qs)}</small></h2>
        ${byOrder ? '' : '<p class="t-help" style="margin:-6px 0 10px">Questions are being ordered automatically. Choose “As I picked” above to move them up or down yourself.</p>'}
        <div class="t-rvl">${review || '<p class="muted">No questions selected.</p>'}</div></section>`}

      ${!cfg.output ? '' : `<section class="t-blk"><h2 class="t-h2">Fine-tuning <small>optional — the defaults are good</small></h2>
        ${cfg.output === 'worksheet' ? det('ws', 'Worksheet layout', 'Columns, text size, name line, time', `
          ${orow('Columns', 'Two columns fit the most questions on a page.', seg('wsCols', [[1, '1 column'], [2, '2 columns']]))}
          ${orow('Text size', 'Smaller text means fewer pages.', seg('wsFont', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]))}
          ${orow('Name and class line', 'A blank line for students to write their name and class.', sw('wsNameLine'))}
          ${orow('Time allowed', 'Shown in the worksheet header.', txt('wsTime', 'e.g. 45 minutes', 30))}
          ${orow('Instructions', 'One short line under the header.', txt('wsNote', 'e.g. All questions are compulsory.', 120))}
          ${cfg.wsMode === 'teacher' ? orow('Solutions in teacher copy', 'Turn off to show only the answers.', sw('wsSolutions')) : ''}`) : ''}
        ${cfg.output === 'slides' ? det('sl', 'Slide images', 'What each image shows, size and quality', `
          ${orow('Solution / explanation', 'Adds the worked solution to the answer.', sw('solutions'))}
          ${cfg.mode === '1' ? orow('Highlight the correct option', 'Colours the right option green in the question.', sw('highlight')) : orow('Repeat the question in the answer image', 'Useful if the answer image is shared on its own.', sw('repeatQ'))}
          ${orow('Exam · year · chapter line', 'A small line of details above each question.', sw('meta'))}
          ${orow('Marks', 'Shows +4 / −1 on each image.', sw('marks'))}
          ${orow('Image size', 'Phone fits a vertical screen, Wide suits a projector.', seg('width', [[720, 'Phone'], [900, 'Standard'], [1200, 'Wide']]))}
          ${orow('Sharpness', 'Sharper images look better when projected but take more space.', seg('scale', [[1, 'Small files'], [2, 'Sharp'], [3, 'Extra sharp']]))}
          ${orow('File type', 'PNG is crisper; JPG is smaller.', seg('format', [['png', 'PNG'], ['jpg', 'JPG']]))}
          ${orow('Look', 'Light suits printing, dark suits a classroom screen.', seg('theme', [['light', 'Light'], ['dark', 'Dark']]))}
          ${anyHindi() ? orow('Language', 'Language of the questions and answers.', seg('lang', [['en', 'English'], ['hi', 'हिंदी']])) : ''}`) : ''}
        ${cfg.output === 'slides' ? det('zp', 'Inside the ZIP', 'File names, folders, answer key', `
          ${orow('File names', 'How each image file is named.', seg('naming', [['plain', '1.png'], ['num', '001'], ['chapter', '001_chapter'], ['id', 'Question ID']]))}
          ${orow('Folder per chapter', 'Puts the images of each chapter in its own folder.', sw('byChapter'))}
          ${cfg.mode === '2' && cfg.naming !== 'plain' ? orow('Separate questions / answers folders', 'Keeps question images and answer images apart.', sw('split')) : ''}
          ${orow('Answer key image', 'One extra image listing all answers.', sw('keySheet'))}
          ${orow('Answer key spreadsheet (CSV)', 'Opens in Excel or Sheets with details of every question.', sw('csv'))}`) : ''}
      </section>`}`;
  }

  /* ===================== Step 4 — export ===================== */
  function step4Html() {
    const qs = selected(), u = usedMap();
    const usedQ = qs.filter(q => u[q.id]), fresh = qs.length - usedQ.length;
    const log = logList().slice(0, 6);
    const wsLabel = { paper: 'Student paper', withkey: 'Paper + answer key', teacher: 'Teacher copy' }[cfg.wsMode];
    const imgs = qs.length * (cfg.mode === '2' ? 2 : 1) + (cfg.keySheet ? 1 : 0);
    return `
      <section class="t-blk"><div class="t-sum">
        <div><b>${plural(qs.length, 'question')}</b><span>${selSummary(qs)}</span></div>
        <div class="t-track ${usedQ.length ? 'warn' : 'ok'}"><b>${fresh} new</b><span>${usedQ.length ? `${usedQ.length} used before` : 'none used before'}</span></div>
        <button class="btn sm ghost" data-t="goto" data-v="3">${icon('left')} Edit settings</button></div>
        ${usedQ.length ? `<div class="t-note">${usedQ.length === 1 ? '1 of these questions was' : `${usedQ.length} of these questions were`} already handed out in an earlier export.
          <button class="btn sm" data-t="drop-used">Remove used questions</button></div>` : ''}
      </section>

      ${cfg.output === 'slides' ? `<section class="t-hero">
          <span class="t-hero-i">${icon('image')}</span>
          <div class="t-hero-t"><h2>Slide images</h2>
            <p>${plural(imgs, 'image')} in a ZIP file · ${cfg.mode === '2' ? 'a question image and an answer image for each question' : 'each question with its answer underneath'}${cfg.keySheet ? ' · plus an answer key' : ''}.</p></div>
          <div class="t-hero-b"><button class="btn lg" data-t="prev-zip">${icon('eye')} Preview</button>
            <button class="btn lg primary" data-t="zip">${icon('download')} Download ZIP</button></div></section>`
        : `<section class="t-hero">
          <span class="t-hero-i">${icon('print')}</span>
          <div class="t-hero-t"><h2>Worksheet PDF</h2>
            <p>A4 · ${cfg.wsCols === 1 ? '1 column' : '2 columns'} · ${wsLabel} · ${plural(qs.length, 'question')}.</p></div>
          <div class="t-hero-b"><button class="btn lg" data-t="prev-pdf">${icon('eye')} Preview</button>
            <button class="btn lg primary" data-t="pdf">${icon('download')} Download PDF</button></div></section>`}
      <p class="t-switch">Need the other one? <button class="linkbtn" data-t="switch-out">Make ${cfg.output === 'slides' ? 'a worksheet' : 'slides'} instead</button></p>

      <section class="t-blk"><h2 class="t-h2">Keeping track <small>so you never repeat questions</small></h2>
        ${orow('Remember downloaded questions as “used”', 'After each download these questions get a “Used” tag in step 2. A question is counted once, even if you download it again.', sw('autoUsed'))}
        <div class="t-hist"><div class="t-hist-h"><b>${plural(Object.keys(u).length, 'question')} used so far</b>
          <button class="btn ghost sm" data-t="used-clear">Reset used history</button></div>
          ${log.length ? log.map(x => `<div class="t-hl"><span class="chip">${x.kind === 'pdf' ? 'PDF' : 'ZIP'}</span><span class="grow">${esc(x.name || 'Untitled')}</span><small class="muted">${plural(x.n, 'question')} · ${ago(x.t)}</small></div>`).join('')
            : '<p class="muted" style="margin:6px 0 0">Nothing downloaded yet. Your downloads will be listed here.</p>'}</div>
      </section>

      <section class="t-blk"><h2 class="t-h2">Save this set <small>reopen it later or share the file</small></h2>
        <div class="t-save"><input class="input" id="tSetName" maxlength="60" placeholder="Name, e.g. Thermodynamics Test 1" value="${esc(cfg.setName)}"><button class="btn" data-t="set-save">${icon('save')} Save set</button></div></section>

      <div class="t-foot"><button class="btn" data-t="back">${icon('left')} Back</button><button class="btn ghost" data-t="restart">Start a new set</button></div>`;
  }

  /* ===================== Exports ===================== */
  let running = null;

  function progressModal(title) {
    const run = { cancelled: false };
    JW.openModal(`<div class="modal-head"><div><div class="eyebrow">Teacher mode</div><h2>${esc(title)}</h2><p id="tpMsg">Getting ready…</p></div></div>
      <div class="t-prog"><i id="tpBar" style="width:0%"></i></div>
      <div class="modal-foot"><span class="muted" id="tpSub"></span><button class="btn" data-t="cancel-run">Cancel</button></div>`, () => { run.cancelled = true; });
    run.update = (done, total, msg) => {
      const b = $('#tpBar'); if (b) b.style.width = Math.round((done / Math.max(1, total)) * 100) + '%';
      const m = $('#tpMsg'); if (m && msg) m.textContent = msg;
      const s = $('#tpSub'); if (s) s.textContent = `${done} of ${total}`;
    };
    return run;
  }

  function pathFor(q, n, kind) {
    const split = cfg.mode === '2' && (cfg.split || cfg.naming === 'plain');
    const base = cfg.naming === 'plain' ? String(n) : cfg.naming === 'id' ? slug(q.id) : cfg.naming === 'chapter' ? `${String(n).padStart(3, '0')}_${slug(q.chapter)}${q.year ? '_' + q.year : ''}` : String(n).padStart(3, '0');
    const dir = [cfg.byChapter ? `${slug(q.subject)}/${slug(q.chapter)}` : '', split ? (kind === 'answer' ? 'answers' : 'questions') : ''].filter(Boolean).join('/');
    const file = cfg.mode === '2' && !split ? `${base}_${kind}.${ext()}` : `${base}.${ext()}`;
    return (dir ? dir + '/' : '') + file;
  }

  const baseName = () => slug(cfg.setName || T.srcTitle || 'questions');

  function finishExport(qs, kind, name, size) {
    let note = '';
    if (cfg.autoUsed) { markUsed(qs.map(q => q.id), kind, cfg.setName || T.srcTitle || 'Untitled'); note = ` · ${plural(qs.length, 'question')} marked as used`; }
    JW.closeModal();
    toast(`Downloaded ${name} · ${fmtBytes(size)}${note}${R.imgFail ? ` · ${R.imgFail} picture(s) couldn’t be included` : ''}`);
    if (T.step === 4) draw(true);
  }

  function failModal(err) {
    console.error(err);
    JW.closeModal();
    JW.openModal(`<div class="modal-head"><div><h2>Export stopped</h2><p>${esc(err.message || 'Something went wrong.')}</p></div></div><div class="modal-foot"><span></span><button class="btn primary" data-act="close-modal">OK</button></div>`);
  }

  async function exportZip() {
    if (running) return;
    const qs = selected();
    if (!qs.length) { toast('Pick at least one question.'); return; }
    const run = running = progressModal('Creating your ZIP');
    R.imgFail = 0;
    const zip = new ZipBuilder();
    const rows = [['No', 'Question ID', 'Exam', 'Subject', 'Chapter', 'Topic', 'Year', 'Paper', 'Difficulty', 'Type', 'Marks', 'Negative', 'Correct answer', 'Question file', 'Answer file']];
    try {
      run.update(0, qs.length, 'Loading the renderer…');
      await initRenderer();
      if (!R.mathOk) toast('Maths could not be loaded — formulas may appear as plain text.');
      for (let i = 0; i < qs.length; i++) {
        if (run.cancelled) throw Object.assign(new Error('cancelled'), { cancelled: true });
        const q = qs[i], n = i + 1;
        run.update(i, qs.length, `Drawing question ${n} of ${qs.length}…`);
        let qf = '', af = '';
        if (cfg.mode === '2') {
          qf = pathFor(q, n, 'question'); af = pathFor(q, n, 'answer');
          await zip.add(qf, await rasterize(cardHtml('question', q, n)));
          await zip.add(af, await rasterize(cardHtml('answer', q, n)));
        } else {
          qf = af = pathFor(q, n, 'combined');
          await zip.add(qf, await rasterize(cardHtml('combined', q, n)));
        }
        rows.push([n, q.id, JW.examName(q.exam), q.subject, q.chapter, q.topic, q.year, q.paper, q.diff, kindLabel(q), q.marks, q.neg, answerOf(q), qf, af]);
        await sleep(0);
      }
      run.update(qs.length, qs.length, 'Adding answer key…');
      if (cfg.keySheet) await zip.add(`answer_key.${ext()}`, await rasterize(keySheetHtml(qs)));
      if (cfg.csv) await zip.add('answer_key.csv', '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'));
      await zip.add('README.txt', [
        'Created with JEEwise — Teacher mode', `Date: ${today()}`, cfg.setName ? `Set: ${cfg.setName}` : '',
        `Questions: ${qs.length}`, `Mode: ${cfg.mode === '2' ? '2 images per question (question + answer)' : '1 image per question (answer under question)'}`,
        `Total marks: ${qs.reduce((s, q) => s + q.marks, 0)}`
      ].filter(Boolean).join('\r\n'));
      const blob = zip.finish();
      const name = `${baseName()}-slides-${today()}.zip`;
      download(blob, name);
      running = null;
      finishExport(qs, 'zip', name, blob.size);
    } catch (err) {
      running = null;
      if (err.cancelled) { toast('Export cancelled.'); return; }
      failModal(err);
    } finally { running = null; disposeRenderer(); }
  }

  async function exportPdf() {
    if (running) return;
    const qs = selected();
    if (!qs.length) { toast('Pick at least one question.'); return; }
    const run = running = progressModal('Creating your worksheet PDF');
    R.imgFail = 0;
    try {
      const pages = await sheetPages(qs, run);
      run.update(pages.length, pages.length, 'Saving the PDF…');
      const blob = await makePdf(pages);
      const name = `${baseName()}-worksheet${cfg.wsMode === 'teacher' ? '-teacher-copy' : ''}-${today()}.pdf`;
      download(blob, name);
      running = null;
      finishExport(qs, 'pdf', name, blob.size);
    } catch (err) {
      running = null;
      if (err.cancelled) { toast('Export cancelled.'); return; }
      failModal(err);
    } finally { running = null; disposeRenderer(); }
  }

  const previewShell = (title, sub) => JW.openModal(`<div class="modal-head"><div><div class="eyebrow">Preview</div><h2>${title}</h2><p>${sub}</p></div><button class="icon-btn" data-act="close-modal" aria-label="Close">${icon('x')}</button></div><div id="tPrev" class="t-prev"><div class="skeleton"></div><p class="muted" id="tPrevMsg" style="margin:0"></p></div>`);

  async function previewImage() {
    if (running) return;
    const qs = selected(); if (!qs.length) return;
    const q = qs[0], kind = cfg.mode === '2' ? 'question' : 'combined';
    previewShell('Slide preview', 'The first question, as it will look in the ZIP.');
    hydrateIcons($('#modalRoot'));
    try {
      const blobs = [await rasterize(cardHtml(kind, q, 1))];
      if (cfg.mode === '2') blobs.push(await rasterize(cardHtml('answer', q, 1)));
      const box = $('#tPrev');
      if (box) box.innerHTML = blobs.map((b, i) => `<figure><figcaption>${cfg.mode === '2' ? (i ? 'Answer image' : 'Question image') : 'Image'}</figcaption><img alt="Preview" src="${URL.createObjectURL(b)}"></figure>`).join('');
    } catch (err) {
      const box = $('#tPrev'); if (box) box.innerHTML = `<div class="empty"><strong>Preview failed</strong><span>${esc(err.message)}</span></div>`;
    } finally { disposeRenderer(); }
  }

  async function previewSheet() {
    if (running) return;
    const qs = selected(); if (!qs.length) return;
    previewShell('Worksheet preview', 'Exactly how the PDF pages will look.');
    hydrateIcons($('#modalRoot'));
    try {
      const pages = await sheetPages(qs, { update: (d, t, m) => { const e = $('#tPrevMsg'); if (e && m) e.textContent = m; } });
      const box = $('#tPrev');
      if (box) box.innerHTML = pages.map((p, i) => `<figure><figcaption>Page ${i + 1} of ${pages.length}</figcaption><img alt="Page ${i + 1}" src="${URL.createObjectURL(p.blob)}"></figure>`).join('');
    } catch (err) {
      const box = $('#tPrev'); if (box) box.innerHTML = `<div class="empty"><strong>Preview failed</strong><span>${esc(err.message)}</span></div>`;
    } finally { disposeRenderer(); }
  }

  /* ===================== Logo ===================== */
  function loadLogo(file) {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const iw = img.naturalWidth || 300, ih = img.naturalHeight || 300;
      const sc = Math.min(1, 400 / Math.max(iw, ih));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(iw * sc)); c.height = Math.max(1, Math.round(ih * sc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      try { cfg.logo = c.toDataURL('image/png'); } catch { toast('Could not read that image.'); return; }
      cfg.logoSlides = true; cfg.logoSheet = true;
      if (!saveCfg()) toast('Logo added, but it is too large to remember for next time.'); else toast('Logo added.');
      S.cache = null; draw(true);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read that image.'); };
    img.src = url;
  }

  /* ===================== Events ===================== */
  const here = () => location.hash.startsWith('#/teacher');
  const NUM_KEYS = ['width', 'scale', 'wsCols'];

  document.addEventListener('click', async e => {
    if (!here()) return;
    const t = e.target.closest('[data-t]');
    if (!t) return;
    const act = t.dataset.t;
    switch (act) {
      case 'goto': go(Number(t.dataset.v)); break;
      case 'back': go(Math.max(1, T.step - 1)); break;
      case 'next': go(Math.min(4, T.step + 1)); break;
      case 'restart': cfg.output = ''; saveCfg(); T.picked.clear(); T.chapSel.clear(); resetPool(); go(1); break;
      case 'subj': T.subj = t.dataset.v; drawTabs(); drawChapArea(); break;
      case 'chap': {
        const p = t.dataset.path; T.chapSel.has(p) ? T.chapSel.delete(p) : T.chapSel.add(p);
        t.classList.toggle('on', T.chapSel.has(p)); t.setAttribute('aria-pressed', String(T.chapSel.has(p))); drawTabs(); drawBar(); break;
      }
      case 'grp-all': {
        const g = visibleGroups().find(x => x[0] === t.dataset.g); if (!g) break;
        const all = g[1].every(f => T.chapSel.has(f.path));
        g[1].forEach(f => (all ? T.chapSel.delete(f.path) : T.chapSel.add(f.path)));
        drawChapArea(); drawTabs(); drawBar(); break;
      }
      case 'load': loadPool([...T.chapSel], null, ''); break;
      case 'quick': loadQuick(t.dataset.v); break;
      case 'set-load': loadSet(t.dataset.id); break;
      case 'set-export': exportSet(t.dataset.id); break;
      case 'set-del': store.set(K.sets, getSets().filter(s => s.id !== t.dataset.id)); draw(true); break;
      case 'set-save': saveSet(); break;
      case 'toggle': {
        const id = t.dataset.id; T.picked.has(id) ? T.picked.delete(id) : T.picked.add(id);
        S.cache = null; refreshOrd(); break;
      }
      case 'gcollapse': { const g = t.dataset.g; T.collapsed.has(g) ? T.collapsed.delete(g) : T.collapsed.add(g); drawList(); break; }
      case 'gsel-all': {
        const gk = gfn(T.group); if (!gk) break;
        const qs = filtered().filter(q => gk(q) === t.dataset.g), all = qs.every(q => T.picked.has(q.id));
        qs.forEach(q => (all ? T.picked.delete(q.id) : T.picked.add(q.id))); S.cache = null; refreshOrd(); break;
      }
      case 'gfilter': T.gsel = t.dataset.g; T.limit = 40; drawList(); break;
      case 'group': T.group = t.dataset.v; T.gsel = ''; T.collapsed.clear(); T.limit = 40; draw(true); break;
      case 'more': T.limit += 40; drawList(); break;
      case 'sel-all': filtered().forEach(q => T.picked.add(q.id)); S.cache = null; drawList(); break;
      case 'sel-none': T.picked.clear(); S.cache = null; drawList(); break;
      case 'sel-inv': filtered().forEach(q => (T.picked.has(q.id) ? T.picked.delete(q.id) : T.picked.add(q.id))); S.cache = null; drawList(); break;
      case 'rand': { const n = randomPick(); S.cache = null; toast(n ? `Added ${plural(n, 'question')}.` : 'No more questions match.'); drawList(); break; }
      case 'mv': {
        const arr = [...T.picked], i = arr.indexOf(t.dataset.id), j = i + Number(t.dataset.d);
        if (i < 0 || j < 0 || j >= arr.length) break;
        [arr[i], arr[j]] = [arr[j], arr[i]]; T.picked = new Set(arr); S.cache = null; draw(true); break;
      }
      case 'rm': {
        T.picked.delete(t.dataset.id); S.cache = null;
        if (!T.picked.size) { go(2); break; }
        draw(true); break;
      }
      case 'drop-used': {
        const u = usedMap(); const n = [...T.picked].filter(id => u[id]).length;
        [...T.picked].forEach(id => { if (u[id]) T.picked.delete(id); }); S.cache = null;
        toast(`Removed ${plural(n, 'used question')}.`);
        if (!T.picked.size) go(2); else draw(true); break;
      }
      case 'cfg': {
        const k = t.dataset.k, v = t.dataset.v;
        cfg[k] = NUM_KEYS.includes(k) ? Number(v) : v;
        if (k === 'order' && v === 'random') T.shufKey = null;
        saveCfg(); S.cache = null; draw(true); break;
      }
      case 'tog': cfg[t.dataset.k] = !cfg[t.dataset.k]; saveCfg(); S.cache = null; draw(true); break;
      case 'logo-del': cfg.logo = ''; saveCfg(); S.cache = null; draw(true); break;
      case 'switch-out': go(3); break;
      case 'zip': exportZip(); break;
      case 'pdf': exportPdf(); break;
      case 'prev-zip': previewImage(); break;
      case 'prev-pdf': previewSheet(); break;
      case 'cancel-run': JW.closeModal(); break;
      case 'used-clear': store.del(K.used); store.del(K.log); toast('Used history cleared.'); draw(true); break;
    }
  });

  const debounce = (fn, ms = 160) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
  const onSearch = debounce(v => { T.q = v; T.limit = 40; T.gsel = ''; drawList(); });
  const onChapSearch = debounce(v => { T.chapQ = v; drawChapArea(); });
  document.addEventListener('input', e => {
    if (!here()) return;
    const t = e.target;
    if (t.id === 'tSearch') onSearch(t.value);
    else if (t.id === 'tChapSearch') onChapSearch(t.value);
    else if (t.id === 'tN') T.n = t.value;
    else if (t.dataset?.tx) { cfg[t.dataset.tx] = t.value; S.cache = null; saveCfg(); }
  });
  document.addEventListener('change', e => {
    if (!here()) return;
    const t = e.target;
    if (t.dataset?.tf) {
      const k = t.dataset.tf;
      T[k] = t.type === 'checkbox' ? t.checked : t.value;
      T.limit = 40; T.gsel = '';
      if (['mix', 'skipUsed'].includes(k)) return;
      drawList();
    } else if (t.dataset?.t === 'import' && t.files?.[0]) { importSet(t.files[0]); t.value = ''; }
    else if (t.dataset?.t === 'logo' && t.files?.[0]) { loadLogo(t.files[0]); t.value = ''; }
  });
  document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('details.t-det')) T.od[d.dataset.k] = d.open; }, true);
  document.addEventListener('keydown', e => {
    if (!here()) return;
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t.classList?.contains('tq')) { e.preventDefault(); t.click(); }
  });

  window.JWT = { page };
})();
