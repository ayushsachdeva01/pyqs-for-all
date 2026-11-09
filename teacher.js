/* JEEwise — Teacher mode.
   Pick questions, export them as images in a ZIP (1 or 2 images per question), print worksheets,
   save question sets. Everything runs in the browser; nothing is uploaded anywhere. */
(() => {
  'use strict';
  const JW = window.JW;
  if (!JW) return;
  const { $, $$, esc, icon, hydrateIcons, toast, plural, store, app, data } = JW;

  /* ===================== Settings & storage ===================== */
  const K = { cfg: 'jewise_teacher_v1', sets: 'jewise_tsets_v1', pin: 'jewise_tpin_v1', used: 'jewise_tused_v1', unlock: 'jewise_tunlock' };
  const DEF = {
    mode: '2',            // '2' = question image + answer image, '1' = question with answer underneath
    lang: 'en', scale: 2, width: 900, format: 'png', theme: 'light',
    solutions: true, highlight: true, meta: true, marks: true, repeatQ: false,
    keySheet: true, csv: true, byChapter: false, split: false, naming: 'plain', order: 'selection',
    heading: '', footer: '', wsMode: 'paper', wsCols: 1, wsTitle: '', wsSchool: ''
  };
  let cfg = { ...DEF, ...(store.get(K.cfg, {}) || {}) };
  if (!cfg.namingV) { cfg.namingV = 2; cfg.naming = 'plain'; } // one-time: plain 1.png, 2.png is now the default
  const saveCfg = () => store.set(K.cfg, cfg);

  const T = {
    chapSel: new Set(), pool: [], picked: new Set(), loaded: false, loading: false,
    q: '', year: '', diff: '', kind: '', chap: '', used: '', sort: 'newest', limit: 80,
    mix: 'random', n: 10, skipUsed: false, srcTitle: ''
  };
  const usedMap = () => store.get(K.used, {}) || {};
  const markUsed = ids => { const u = usedMap(); const now = Date.now(); ids.forEach(id => { u[id] = now; }); store.set(K.used, u); };

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

  /* ===================== Image rendering engine =====================
     Each card is laid out inside a hidden iframe that has its own MathJax (SVG output, so every formula is
     self-contained vector art). The laid-out card is then wrapped in an SVG <foreignObject> and drawn to a canvas. */
  const R = { frame: null, ready: null, mathOk: true, imgCache: new Map(), imgFail: 0 };

  function frameDoc() {
    return `<!doctype html><html><head><meta charset="utf-8"><style id="cardcss"></style>
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

  async function inlineImages(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    const imgs = [...t.content.querySelectorAll('img')];
    await Promise.all(imgs.map(async img => {
      img.removeAttribute('loading'); img.removeAttribute('srcset'); img.removeAttribute('sizes');
      const raw = img.getAttribute('src') || '';
      if (!raw || raw.startsWith('data:')) return;
      let abs; try { abs = new URL(raw, document.baseURI).href; } catch { abs = null; }
      let out = abs ? R.imgCache.get(abs) : null;
      if (abs && out === undefined) {
        try {
          const res = await fetch(abs, { mode: 'cors' });
          if (!res.ok) throw new Error(res.status);
          out = await blobToDataUrl(await res.blob());
        } catch { out = null; }
        R.imgCache.set(abs, out);
      }
      if (out) img.setAttribute('src', out);
      else { R.imgFail++; const s = document.createElement('span'); s.className = 'imgmiss'; s.textContent = '[image could not be loaded]'; img.replaceWith(s); }
    }));
    return t.innerHTML;
  }

  const THEMES = {
    light: { bg: '#ffffff', fg: '#14122b', mute: '#6b678f', line: '#dcd8f0', soft: '#f4f2fd', accent: '#5b3df5', ok: '#0f9d63', okBg: '#e7f7ef', callout: '#f4f2fd' },
    dark: { bg: '#15122d', fg: '#eeeaff', mute: '#9b95c7', line: '#2e2860', soft: '#1d1942', accent: '#8f78ff', ok: '#2fd18b', okBg: 'rgba(47,209,139,.14)', callout: '#1d1942' }
  };

  function cardCss(W, th) {
    return `*{box-sizing:border-box}
.card{width:${W}px;padding:${Math.round(W * 0.04)}px ${Math.round(W * 0.045)}px ${Math.round(W * 0.03)}px;background:${th.bg};color:${th.fg};font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari","Helvetica Neue",Arial,sans-serif;font-size:${Math.round(W * 0.0255)}px;line-height:1.6;word-wrap:break-word;overflow-wrap:anywhere}
.hd{display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px;margin-bottom:22px;padding-bottom:16px;border-bottom:2px solid ${th.line}}
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
.opt .k{flex:none;width:1.75em;height:1.75em;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:${th.soft};font-weight:800;font-size:.85em;margin-top:.1em}
.opt .t{flex:1;min-width:0}
.opt.ok{border-color:${th.ok};background:${th.okBg}}
.opt.ok .k{background:${th.ok};color:#fff}
.hint{margin:6px 0 0;color:${th.mute};font-size:.7em;font-style:italic}
.ans{margin:22px 0 0;padding:16px 20px;border-radius:12px;background:${th.okBg};border:2px solid ${th.ok}}
.ans .lb{font-size:.68em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${th.ok}}
.ans .av{font-size:1.25em;font-weight:800;margin-top:2px}
.ans .ao{margin-top:8px;display:flex;gap:10px;align-items:flex-start}.ans .ao b{flex:none}
.sol{margin:22px 0 0;padding:16px 20px;border-radius:12px;background:${th.soft};border:1px solid ${th.line}}
.sol .lb{font-size:.68em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${th.accent};margin-bottom:6px}
.sol p{margin:0 0 .6em}.sol p:last-child{margin-bottom:0}
.ft{margin-top:26px;padding-top:12px;border-top:1px solid ${th.line};text-align:center;color:${th.mute};font-size:.62em;font-weight:600;letter-spacing:.02em}
.divider{margin:26px 0 0;border:0;border-top:2px dashed ${th.line}}
img{max-width:100%;height:auto;vertical-align:middle}
table{border-collapse:collapse;max-width:100%}td,th{border:1px solid ${th.line};padding:4px 10px}
.imgmiss{color:${th.mute};font-style:italic;font-size:.8em}
.key{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.kc{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;border:2px solid ${th.line};border-radius:10px;font-weight:700}
.kc b{color:${th.mute};font-weight:700;font-size:.85em}.kc span{color:${th.ok};font-weight:800}
.ttl{font-size:1.25em;font-weight:800;margin:0 0 4px}.sub{color:${th.mute};font-size:.75em;margin:0 0 18px}`;
  }

  /* ---- card content ---- */
  function metaLine(q) {
    return [JW.examName(q.exam), q.year || '', JW.paperShort(q), q.subject, q.chapter, q.diff !== 'Unknown' ? q.diff : ''].filter(Boolean).join(' · ');
  }
  const head = (q, n, label) => `<div class="hd"><span class="qn ${label ? 'ans' : ''}">Q${n}${label ? ' · ' + label : ''}</span>${cfg.meta ? `<span class="mt">${esc(metaLine(q))}</span>` : ''}<span class="sp"></span>${cfg.marks ? `<span class="mk">+${q.marks}${q.neg ? ` / −${q.neg}` : ''}</span>` : ''}${cfg.heading ? `<span class="hdg">${esc(cfg.heading)}</span>` : ''}</div>`;
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
  function answerHtml(q) {
    const ans = answerOf(q);
    if (!ans) return `<div class="ans"><div class="lb">Correct answer</div><div class="av">Not available for this question</div></div>`;
    let more = '';
    if (q.kind !== 'number') {
      const right = JW.qCorrect(q);
      more = optionsOf(q, cfg.lang).filter(o => right.includes(o.id)).map(o => `<div class="ao"><b>(${esc(o.id)})</b><div>${JW.sanitize(o.html)}</div></div>`).join('');
    }
    return `<div class="ans"><div class="lb">Correct answer</div><div class="av">${esc(q.kind === 'number' ? ans : '(' + ans.split(', ').join('), (') + ')')}</div>${more}</div>`;
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
      return `${head(q, n, 'Answer')}${rep}${answerHtml(q)}${solutionHtml(q)}${foot()}`;
    }
    return `${head(q, n)}${promptHtml(q)}${optionsHtml(q, cfg.highlight)}${answerHtml(q)}${solutionHtml(q)}${foot()}`; // combined
  }

  function keySheetHtml(qs) {
    const cells = qs.map((q, i) => `<div class="kc"><b>${i + 1}</b><span>${esc(answerOf(q) || '—')}</span></div>`).join('');
    return `<div class="hd"><span class="qn ans">Answer key</span><span class="sp"></span>${cfg.heading ? `<span class="hdg">${esc(cfg.heading)}</span>` : ''}</div>
      <div class="sub">${plural(qs.length, 'question')} · ${qs.reduce((s, q) => s + q.marks, 0)} marks</div><div class="key">${cells}</div>${foot()}`;
  }

  async function rasterize(inner) {
    await initRenderer();
    const w = R.frame.contentWindow, doc = R.frame.contentDocument;
    const W = cfg.width, th = THEMES[cfg.theme] || THEMES.light;
    R.frame.style.width = (W + 60) + 'px';
    doc.getElementById('cardcss').textContent = cardCss(W, th);
    const stage = doc.getElementById('stage');
    stage.innerHTML = `<div class="card">${await inlineImages(inner)}</div>`;
    if (R.mathOk) {
      try { w.MathJax.texReset?.(); w.MathJax.typesetClear?.(); await w.MathJax.typesetPromise([stage]); }
      catch (err) { console.warn('MathJax (export):', err); }
    }
    const imgs = [...stage.querySelectorAll('img')];
    await Promise.all(imgs.map(i => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())));
    await sleep(30);
    const card = stage.firstElementChild;
    const H = Math.ceil(card.getBoundingClientRect().height);
    const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n').replace(/\]\]>/g, ']] >');
    const xml = new w.XMLSerializer().serializeToString(card).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${css}]]></style>${xml}</div></foreignObject></svg>`;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('The browser could not draw this card.')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const sc = Math.max(0.5, Math.min(cfg.scale, 16000 / H, 16000 / W, Math.sqrt(90e6 / (W * H))));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * sc); canvas.height = Math.round(H * sc);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = th.bg.startsWith('#') ? th.bg : '#15122d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const type = cfg.format === 'jpg' ? 'image/jpeg' : 'image/png';
    return new Promise((res, rej) => {
      try { canvas.toBlob(b => (b ? res(b) : rej(new Error('The browser could not save the image.'))), type, 0.92); }
      catch (err) { rej(new Error('This browser blocks saving drawn images (' + err.name + '). Please use Chrome or Edge for image export.')); }
    });
  }
  const ext = () => (cfg.format === 'jpg' ? 'jpg' : 'png');

  /* ===================== Selection logic ===================== */
  function filtered() {
    let list = T.pool;
    const s = T.q.trim().toLowerCase();
    if (s) list = list.filter(q => JW.searchText(q).includes(s));
    if (T.year) list = list.filter(q => String(q.year) === T.year);
    if (T.diff) list = list.filter(q => q.diff === T.diff);
    if (T.kind) list = list.filter(q => q.kind === T.kind);
    if (T.chap) list = list.filter(q => q.file === T.chap);
    if (T.used) { const u = usedMap(); list = list.filter(q => (T.used === 'fresh') === !u[q.id]); }
    return JW.ordered(list, T.sort);
  }
  function selected() {
    const byId = new Map(T.pool.map(q => [q.id, q]));
    let list = [...T.picked].map(id => byId.get(id)).filter(Boolean);
    if (cfg.order === 'paper') list = JW.ordered(list, 'newest');
    else if (cfg.order === 'chapter') {
      const idx = new Map(); T.pool.forEach(q => { if (!idx.has(q.file)) idx.set(q.file, idx.size); });
      list = JW.ordered(list, 'newest').sort((a, b) => idx.get(a.file) - idx.get(b.file));
    } else if (cfg.order === 'random') list = shuffle(list);
    else if (cfg.order === 'diff') { const r = { Easy: 0, Medium: 1, Hard: 2 }; list = list.map((q, i) => [q, i]).sort((a, b) => (r[a[0].diff] ?? 3) - (r[b[0].diff] ?? 3) || a[1] - b[1]).map(x => x[0]); }
    return list;
  }

  function randomPick() {
    let list = filtered();
    if (T.skipUsed) { const u = usedMap(); list = list.filter(q => !u[q.id]); }
    list = list.filter(q => !T.picked.has(q.id));
    const want = Math.max(1, Math.min(Number(T.n) || 10, list.length));
    const ratios = { random: null, balanced: { Easy: .3, Medium: .5, Hard: .2 }, easy: { Easy: .6, Medium: .3, Hard: .1 }, hard: { Easy: .1, Medium: .3, Hard: .6 } }[T.mix];
    const chosen = [];
    if (ratios) {
      for (const d of Object.keys(ratios)) {
        const part = shuffle(list.filter(q => q.diff === d)).slice(0, Math.round(want * ratios[d]));
        chosen.push(...part);
      }
    }
    const have = new Set(chosen.map(q => q.id));
    chosen.push(...shuffle(list.filter(q => !have.has(q.id))).slice(0, Math.max(0, want - chosen.length)));
    chosen.slice(0, want).forEach(q => T.picked.add(q.id));
    return Math.min(want, chosen.length);
  }

  /* ===================== PIN lock ===================== */
  async function sha(s) {
    try {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return 'x' + h; }
  }
  const pinSet = () => !!store.get(K.pin, null);
  const unlocked = () => { try { return sessionStorage.getItem(K.unlock) === '1'; } catch { return true; } };
  const setUnlocked = v => { try { v ? sessionStorage.setItem(K.unlock, '1') : sessionStorage.removeItem(K.unlock); } catch { /* ignore */ } };

  function drawLock(msg = '') {
    JW.setView(`<div class="lock-card card"><span class="lock-ic">${icon('lock')}</span><h1>Teacher mode</h1>
      <p class="muted">Enter your teacher PIN to continue.</p>
      <input class="input" id="tPinIn" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" aria-label="Teacher PIN">
      <div class="lock-err">${esc(msg)}</div>
      <button class="btn primary block" data-t="unlock">Unlock</button></div>`);
    $('#tPinIn')?.focus();
  }
  async function tryUnlock() {
    const v = ($('#tPinIn')?.value || '').trim();
    const rec = store.get(K.pin, null);
    if (rec && (await sha(rec.salt + v)) === rec.hash) { setUnlocked(true); draw(); } else drawLock('That PIN is not correct.');
  }
  async function savePin() {
    const a = ($('#tPinNew')?.value || '').trim();
    if (a.length < 4) { toast('Use at least 4 digits or characters.'); return; }
    const salt = Math.random().toString(36).slice(2);
    store.set(K.pin, { salt, hash: await sha(salt + a) });
    setUnlocked(true); toast('Teacher PIN saved.'); drawExtras(); drawHeadActions();
  }

  /* ===================== Saved sets ===================== */
  const getSets = () => (store.get(K.sets, []) || []).filter(s => s && Array.isArray(s.ids));
  function saveSet() {
    const name = ($('#tSetName')?.value || '').trim() || `Set ${today()}`;
    const qs = [...T.picked].map(id => T.pool.find(q => q.id === id)).filter(Boolean);
    if (!qs.length) { toast('Pick some questions first.'); return; }
    const sets = getSets();
    sets.unshift({ id: Date.now().toString(36), name, exam: app.exam, ids: qs.map(q => q.id), files: [...new Set(qs.map(q => q.file))], date: Date.now() });
    store.set(K.sets, sets.slice(0, 60));
    toast(`Saved “${name}”.`); drawSources();
  }
  async function loadSet(id) {
    const s = getSets().find(x => x.id === id);
    if (!s) return;
    if (s.exam && s.exam !== app.exam) { toast(`That set is for ${JW.examName(s.exam)} — switch exam at the top first.`); return; }
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
      toast('Set imported.'); drawSources();
    } catch { toast('That file is not a JEEwise set.'); }
  }

  /* ===================== Loading a pool of questions ===================== */
  async function loadPool(paths, preselect, title) {
    if (T.loading) return;
    T.loading = true;
    const btn = $('#tLoad');
    try {
      const qs = await JW.loadFiles(paths, (d, t) => { if (btn) btn.textContent = `Loading ${d}/${t}…`; });
      if (!qs.length) { toast('Could not load those chapters.'); return; }
      T.pool = qs; T.loaded = true; T.srcTitle = title || '';
      T.picked = new Set(preselect ? preselect.filter(id => qs.some(q => q.id === id)) : []);
      Object.assign(T, { q: '', year: '', diff: '', kind: '', chap: '', used: '', limit: 80 });
      drawPick(); drawExport();
      $('#tPick')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally { T.loading = false; drawSources(); }
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

  /* ===================== Page ===================== */
  function page() {
    if (pinSet() && !unlocked()) { drawLock(); return; }
    draw();
  }

  function draw() {
    JW.setView(`
      <div class="page-head"><div>
        <div class="eyebrow">Teacher mode · ${esc(JW.examName(app.exam))}</div>
        <h1>Teacher toolkit</h1>
        <p>Pick questions from any chapters and download them as images in a ZIP, or print a ready worksheet.</p></div>
        <div class="head-actions" id="tHeadActions"></div></div>
      <div id="tSources"></div>
      <div id="tPick"></div>
      <div id="tExport"></div>
      <div id="tExtras"></div>`);
    drawHeadActions(); drawSources(); drawPick(); drawExport(); drawExtras();
  }

  function drawHeadActions() {
    const el = $('#tHeadActions'); if (!el) return;
    el.innerHTML = pinSet() ? `<button class="btn" data-t="lock">${icon('lock')} Lock</button>` : '';
    hydrateIcons(el);
  }

  function drawSources() {
    const el = $('#tSources'); if (!el) return;
    const exam = app.exam, subs = JW.examSubjects(exam);
    const sets = getSets().filter(s => !s.exam || s.exam === exam);
    const sel = [...T.chapSel].map(p => data.byPath.get(p)).filter(Boolean);
    const n = sel.reduce((s, f) => s + f.count, 0);
    for (const p of [...T.chapSel]) if (data.byPath.get(p)?.exam !== exam) T.chapSel.delete(p);
    el.innerHTML = `
      <section class="t-sec"><div class="t-h"><span class="t-n">1</span><div><h2>Choose where to pick from</h2><p class="muted">Select chapters, or start from something you saved earlier.</p></div></div>
        <div class="choices" style="margin-bottom:18px">
          <button class="choice" data-t="quick" data-v="bm">${icon('star')} Bookmarked · ${JW.bookmarks().size}</button>
          <button class="choice" data-t="quick" data-v="rv">${icon('flag')} Review later · ${JW.reviews().size}</button>
          <button class="choice" data-t="quick" data-v="wr">${icon('x')} Mistakes · ${JW.wrongIds().length}</button>
        </div>
        ${subs.map(s => {
          const files = JW.filesFor(exam, s);
          return `<div class="pick-group"><h3><span>${esc(s)}</span><button class="btn ghost sm" data-t="chap-all" data-v="${esc(s)}">Select all / none</button></h3>
            <div class="grid cols-auto">${files.map(f => `<button class="pick ${T.chapSel.has(f.path) ? 'on' : ''}" data-t="chap" data-path="${esc(f.path)}" aria-pressed="${T.chapSel.has(f.path)}">
              <span class="box">${icon('check')}</span><span class="name">${esc(f.chapter)}${JW.chapInfo(f).allOos ? ' <i class="oos-tag">Out of syllabus</i>' : ''}</span><small>${f.count}</small></button>`).join('')}</div></div>`;
        }).join('')}
        <div class="t-actions"><span class="muted">${sel.length ? `<b>${plural(sel.length, 'chapter')}</b> · ${plural(n, 'question')}` : 'No chapters selected'}</span>
          <button class="btn primary" id="tLoad" data-t="load" ${sel.length && !T.loading ? '' : 'disabled'}>Load questions ${icon('right')}</button></div>
        <div class="t-sets"><div class="t-sets-h"><b>Saved sets</b>
          <label class="btn sm ghost" style="cursor:pointer">${icon('download')} Import<input type="file" accept="application/json,.json" data-t="import" hidden></label></div>
          ${sets.length ? sets.map(s => `<div class="t-set"><div class="grow"><b>${esc(s.name)}</b><small class="muted"> · ${plural(s.ids.length, 'question')} · ${new Date(s.date).toLocaleDateString()}</small></div>
            <button class="btn sm" data-t="set-load" data-id="${esc(s.id)}">Open</button>
            <button class="icon-btn" data-t="set-export" data-id="${esc(s.id)}" aria-label="Download set file" title="Download set file">${icon('download')}</button>
            <button class="icon-btn" data-t="set-del" data-id="${esc(s.id)}" aria-label="Delete set" title="Delete set">${icon('trash')}</button></div>`).join('')
            : '<p class="muted" style="margin:8px 0 0">Nothing saved yet. After picking questions, give the set a name and save it.</p>'}</div>
      </section>`;
    hydrateIcons(el);
  }

  function drawPick() {
    const el = $('#tPick'); if (!el) return;
    if (!T.loaded) { el.innerHTML = ''; return; }
    const years = [...new Set(T.pool.map(q => q.year).filter(Boolean))].sort((a, b) => b - a);
    const diffs = [...new Set(T.pool.map(q => q.diff))].filter(d => d !== 'Unknown').sort((a, b) => ['Easy', 'Medium', 'Hard'].indexOf(a) - ['Easy', 'Medium', 'Hard'].indexOf(b));
    const chaps = [...new Set(T.pool.map(q => q.file))].map(p => data.byPath.get(p)).filter(Boolean);
    const o = (v, l, c) => `<option value="${esc(v)}" ${String(c) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
    el.innerHTML = `
      <section class="t-sec"><div class="t-h"><span class="t-n">2</span><div><h2>Pick questions</h2><p class="muted">${esc(T.srcTitle ? T.srcTitle + ' · ' : '')}${plural(T.pool.length, 'question')} loaded. Tap a row to add or remove it.</p></div></div>
        <div class="toolbar">
          <input class="input search" id="tSearch" type="search" placeholder="Search questions…" value="${esc(T.q)}" aria-label="Search">
          <select class="select" data-tf="year" aria-label="Year">${o('', 'All years', T.year)}${years.map(y => o(y, y, T.year)).join('')}</select>
          <select class="select" data-tf="diff" aria-label="Difficulty">${o('', 'Any difficulty', T.diff)}${diffs.map(d => o(d, d, T.diff)).join('')}</select>
          <select class="select" data-tf="kind" aria-label="Type">${o('', 'Any type', T.kind)}${[['single', 'Single correct'], ['multi', 'Multiple correct'], ['number', 'Numerical']].filter(([k]) => T.pool.some(q => q.kind === k)).map(([k, l]) => o(k, l, T.kind)).join('')}</select>
          ${chaps.length > 1 ? `<select class="select" data-tf="chap" aria-label="Chapter">${o('', 'All chapters', T.chap)}${chaps.map(f => o(f.path, f.chapter, T.chap)).join('')}</select>` : ''}
          <select class="select" data-tf="used" aria-label="Used before">${o('', 'Used or not', T.used)}${o('fresh', 'Not used yet', T.used)}${o('used', 'Used before', T.used)}</select>
          <select class="select" data-tf="sort" aria-label="Order">${o('newest', 'Newest first', T.sort)}${o('oldest', 'Oldest first', T.sort)}</select>
        </div>
        <div class="t-tools card">
          <div class="t-tools-row"><b>Quick pick</b>
            <input class="input t-num" id="tN" type="number" min="1" max="200" value="${esc(T.n)}" aria-label="How many">
            <select class="select t-mix" data-tf="mix" aria-label="Difficulty mix">${o('random', 'Random mix', T.mix)}${o('balanced', 'Balanced (30/50/20)', T.mix)}${o('easy', 'Easier', T.mix)}${o('hard', 'Harder', T.mix)}</select>
            <label class="t-check"><input type="checkbox" data-tf="skipUsed" ${T.skipUsed ? 'checked' : ''}> Skip used</label>
            <button class="btn sm primary" data-t="rand">${icon('shuffle')} Add</button></div>
          <div class="t-tools-row"><button class="btn sm" data-t="sel-all">Select all shown</button><button class="btn sm" data-t="sel-none">Clear</button><button class="btn sm" data-t="sel-inv">Invert</button></div>
        </div>
        <div class="result-line"><span id="tCount"></span><span id="tSummary" class="muted"></span></div>
        <div id="tList"></div>
      </section>`;
    hydrateIcons(el);
    drawList();
  }

  function drawList() {
    const list = $('#tList'); if (!list) return;
    const f = filtered(), shown = f.slice(0, T.limit), u = usedMap();
    $('#tCount').innerHTML = `<b>${T.picked.size}</b> selected · ${f.length === T.pool.length ? plural(f.length, 'question') : `${f.length} of ${T.pool.length} shown`}`;
    list.innerHTML = shown.length ? shown.map((q, i) => `
      <article class="trow ${T.picked.has(q.id) ? 'on' : ''}" data-t="toggle" data-id="${esc(q.id)}" tabindex="0" role="checkbox" aria-checked="${T.picked.has(q.id)}">
        <span class="tbox">${icon('check')}</span><div class="qnum">${i + 1}</div>
        <div class="qbody"><div class="qtext mj">${esc(JW.previewText(q))}</div>
          <div class="qmeta"><span class="chip">${esc(q.year || 'Year n/a')}</span><span class="chip ${q.diff.toLowerCase()}">${esc(q.diff)}</span>
            <span class="chip">${q.kind === 'number' ? 'Numerical' : q.kind === 'multi' ? 'Multi' : 'MCQ'}</span>
            ${T.chap === '' && new Set(T.pool.map(x => x.file)).size > 1 ? `<span class="chip">${esc(q.chapter)}</span>` : ''}
            ${u[q.id] ? '<span class="chip warn">Used before</span>' : ''}</div></div>
        <button class="icon-btn" data-t="preview" data-id="${esc(q.id)}" aria-label="Preview image" title="Preview image">${icon('eye')}</button>
      </article>`).join('') + (f.length > shown.length ? `<div style="text-align:center;margin-top:14px"><button class="btn" data-t="more">Show ${Math.min(80, f.length - shown.length)} more</button></div>` : '')
      : '<div class="empty"><strong>No questions match</strong><span>Try clearing a filter.</span></div>';
    hydrateIcons(list); JW.observeMath(list);
    drawSummary();
  }

  function drawSummary() {
    const qs = selected();
    const el = $('#tSummary'); if (!el) return;
    const d = ['Easy', 'Medium', 'Hard'].map(k => [k, qs.filter(q => q.diff === k).length]).filter(x => x[1]);
    el.textContent = qs.length ? `${qs.reduce((s, q) => s + q.marks, 0)} marks` + (d.length ? ' · ' + d.map(([k, n]) => `${n} ${k}`).join(' · ') : '') : '';
    const bar = $('#tBarInfo'); if (bar) bar.innerHTML = qs.length ? `<b>${plural(qs.length, 'question')}</b> <span class="muted">· ${el.textContent}</span>` : '<span class="muted">Pick at least one question</span>';
    $$('[data-needs-sel]').forEach(b => { b.disabled = !qs.length || b.dataset.busy === '1'; });
  }

  function drawExport() {
    const el = $('#tExport'); if (!el) return;
    if (!T.loaded) { el.innerHTML = ''; return; }
    const ch = (k, v, label, active = cfg[k] === v) => `<button class="choice ${active ? 'active' : ''}" data-t="cfg" data-k="${k}" data-v="${v}">${label}</button>`;
    const tg = (k, label, hint = '') => `<button class="choice ${cfg[k] ? 'active' : ''}" data-t="tog" data-k="${k}" ${hint ? `title="${esc(hint)}"` : ''}>${cfg[k] ? '✓ ' : ''}${label}</button>`;
    el.innerHTML = `
      <section class="t-sec"><div class="t-h"><span class="t-n">3</span><div><h2>Export</h2><p class="muted">Choose how each question becomes an image.</p></div></div>
        <div class="order-grid two">
          <button class="order-card ${cfg.mode === '2' ? 'active' : ''}" data-t="cfg" data-k="mode" data-v="2"><span class="i">${icon('image')}</span><b>2 images per question</b><small>One image with the question, one with the answer and solution</small></button>
          <button class="order-card ${cfg.mode === '1' ? 'active' : ''}" data-t="cfg" data-k="mode" data-v="1"><span class="i">${icon('image')}</span><b>1 image per question</b><small>The question with its answer written underneath</small></button>
        </div>
        <div class="t-opts">
          <div class="field"><span class="label">Include</span><div class="choices">
            ${tg('solutions', 'Solution / explanation')}${cfg.mode === '1' ? tg('highlight', 'Highlight correct option') : tg('repeatQ', 'Repeat question in answer image')}
            ${tg('meta', 'Exam · year · chapter')}${tg('marks', 'Marks')}${tg('keySheet', 'Answer key sheet')}${tg('csv', 'Answer key (CSV)')}</div></div>
          <div class="field"><span class="label">Image size</span><div class="choices">
            ${ch('width', 720, 'Phone')}${ch('width', 900, 'Standard')}${ch('width', 1200, 'Wide')}</div></div>
          <div class="field"><span class="label">Sharpness</span><div class="choices">
            ${ch('scale', 1, 'Small files')}${ch('scale', 2, 'Sharp')}${ch('scale', 3, 'Extra sharp')}
            <span class="t-gap"></span>${ch('format', 'png', 'PNG')}${ch('format', 'jpg', 'JPG')}</div></div>
          <div class="field"><span class="label">Look</span><div class="choices">${ch('theme', 'light', 'Light')}${ch('theme', 'dark', 'Dark')}
            ${anyHindi() ? `<span class="t-gap"></span>${ch('lang', 'en', 'English')}${ch('lang', 'hi', 'हिंदी')}` : ''}</div></div>
          <div class="field"><span class="label">Question order</span><div class="choices">
            ${ch('order', 'selection', 'As I picked')}${ch('order', 'paper', 'Newest first')}${ch('order', 'chapter', 'By chapter')}${ch('order', 'diff', 'Easy → Hard')}${ch('order', 'random', 'Shuffle')}</div></div>
          <div class="field"><span class="label">Files in the ZIP</span><div class="choices">
            ${ch('naming', 'plain', '1, 2, 3 (1.png)')}${ch('naming', 'num', '001')}${ch('naming', 'chapter', '001_chapter_year')}${ch('naming', 'id', 'Question ID')}
            <span class="t-gap"></span>${tg('byChapter', 'Folder per chapter')}${cfg.mode === '2' && cfg.naming !== 'plain' ? tg('split', 'Separate questions / answers folders') : ''}${cfg.mode === '2' && cfg.naming === 'plain' ? '<span class="muted">Questions and answers go in <b>questions/</b> and <b>answers/</b>, both numbered 1.png, 2.png…</span>' : ''}</div></div>
          <div class="field t-two">
            <label>Heading on every image<input class="input" data-tx="heading" maxlength="80" placeholder="e.g. Class 12 · Mr. Sharma · Unit Test 3" value="${esc(cfg.heading)}"></label>
            <label>Footer / watermark<input class="input" data-tx="footer" maxlength="80" placeholder="e.g. Sharma Physics Classes" value="${esc(cfg.footer)}"></label></div>
        </div>
        <div class="t-actions wrap">
          <button class="btn" data-t="preview-sel" data-needs-sel>${icon('eye')} Preview first image</button>
          <button class="btn primary" data-t="zip" data-needs-sel>${icon('download')} Download ZIP</button></div>

        <div class="t-print card"><div class="t-print-h"><b>${icon('print')} Print or save as PDF</b><span class="muted">A clean worksheet straight from the browser's print dialog.</span></div>
          <div class="choices">${ch('wsMode', 'paper', 'Student paper')}${ch('wsMode', 'withkey', 'Paper + answer key')}${ch('wsMode', 'teacher', 'Teacher copy (answers + solutions)')}</div>
          <div class="choices" style="margin-top:8px">${ch('wsCols', 1, '1 column')}${ch('wsCols', 2, '2 columns')}</div>
          <div class="field t-two" style="margin-top:12px">
            <label>School / institute<input class="input" data-tx="wsSchool" maxlength="80" value="${esc(cfg.wsSchool)}" placeholder="Optional"></label>
            <label>Paper title<input class="input" data-tx="wsTitle" maxlength="80" value="${esc(cfg.wsTitle)}" placeholder="e.g. Kinematics — Practice Test"></label></div>
          <button class="btn" data-t="print" data-needs-sel>${icon('print')} Print worksheet</button></div>

        <div class="t-print card"><div class="t-print-h"><b>${icon('save')} Save this selection</b><span class="muted">Reopen it later or share the file with another teacher.</span></div>
          <div class="t-save"><input class="input" id="tSetName" maxlength="60" placeholder="Name, e.g. Thermodynamics Test 1"><button class="btn" data-t="set-save" data-needs-sel>Save set</button></div></div>
      </section>
      <div class="sticky-bar"><div id="tBarInfo"></div><button class="btn primary" data-t="zip" data-needs-sel>${icon('download')} Download ZIP</button></div>`;
    hydrateIcons(el); drawSummary();
  }

  function drawExtras() {
    const el = $('#tExtras'); if (!el) return;
    el.innerHTML = `<section class="t-sec t-small"><div class="t-h"><span class="t-n">${icon('lock')}</span><div><h2>Teacher PIN</h2>
      <p class="muted">${pinSet() ? 'A PIN is set. Teacher mode asks for it each time the app is reopened.' : 'Optional. Keeps students out of this page on a shared phone or tablet.'}</p></div></div>
      <div class="t-save"><input class="input" id="tPinNew" type="password" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="${pinSet() ? 'New PIN' : 'Choose a PIN (4+ characters)'}">
      <button class="btn" data-t="pin-save">${pinSet() ? 'Change PIN' : 'Set PIN'}</button>${pinSet() ? '<button class="btn danger" data-t="pin-del">Remove PIN</button>' : ''}</div>
      <div class="t-used"><span class="muted">${plural(Object.keys(usedMap()).length, 'question')} marked as used in earlier exports.</span>
        <button class="btn ghost sm" data-t="used-clear">Reset used history</button></div></section>`;
  }

  /* ===================== Export: ZIP ===================== */
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

  async function exportZip() {
    if (running) return;
    const qs = selected();
    if (!qs.length) { toast('Pick at least one question.'); return; }
    running = progressModal('Creating your ZIP');
    const run = running;
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
        rows.push([n, q.id, JW.examName(q.exam), q.subject, q.chapter, q.topic, q.year, q.paper, q.diff, q.kind === 'number' ? 'Numerical' : q.kind === 'multi' ? 'Multiple correct' : 'Single correct', q.marks, q.neg, answerOf(q), qf, af]);
        await sleep(0);
      }
      run.update(qs.length, qs.length, 'Adding answer key…');
      if (cfg.keySheet) await zip.add(`answer_key.${ext()}`, await rasterize(keySheetHtml(qs)));
      if (cfg.csv) await zip.add('answer_key.csv', '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'));
      await zip.add('README.txt', [
        'Created with JEEwise — Teacher mode', `Date: ${today()}`, cfg.heading ? `Heading: ${cfg.heading}` : '',
        `Questions: ${qs.length}`, `Mode: ${cfg.mode === '2' ? '2 images per question (question + answer)' : '1 image per question (answer under question)'}`,
        `Total marks: ${qs.reduce((s, q) => s + q.marks, 0)}`
      ].filter(Boolean).join('\r\n'));
      const blob = zip.finish();
      const name = `jeewise-${slug(cfg.heading || T.srcTitle || 'questions')}-${today()}.zip`;
      download(blob, name);
      markUsed(qs.map(q => q.id));
      if (T.loaded) drawList();
      JW.closeModal();
      running = null;
      toast(`Downloaded ${name} · ${fmtBytes(blob.size)}${R.imgFail ? ` · ${R.imgFail} picture(s) couldn’t be included` : ''}`);
    } catch (err) {
      running = null;
      if (err.cancelled) { toast('Export cancelled.'); return; }
      console.error(err);
      JW.closeModal();
      JW.openModal(`<div class="modal-head"><div><h2>Export stopped</h2><p>${esc(err.message || 'Something went wrong.')}</p></div></div><div class="modal-foot"><span></span><button class="btn primary" data-act="close-modal">OK</button></div>`);
    } finally { running = null; disposeRenderer(); }
  }

  async function previewImage(q, n = 1) {
    if (running) return;
    const kind = cfg.mode === '2' ? 'question' : 'combined';
    JW.openModal(`<div class="modal-head"><div><div class="eyebrow">Preview</div><h2>Question ${n}</h2><p>How this will look in the ZIP.</p></div><button class="icon-btn" data-act="close-modal" aria-label="Close">${icon('x')}</button></div><div id="tPrev" class="t-prev"><div class="skeleton"></div></div>`);
    hydrateIcons($('#modalRoot'));
    try {
      const blobs = [await rasterize(cardHtml(kind, q, n))];
      if (cfg.mode === '2') blobs.push(await rasterize(cardHtml('answer', q, n)));
      const box = $('#tPrev');
      if (box) box.innerHTML = blobs.map((b, i) => `<figure><figcaption>${cfg.mode === '2' ? (i ? 'Answer image' : 'Question image') : 'Image'}</figcaption><img alt="Preview" src="${URL.createObjectURL(b)}"></figure>`).join('');
    } catch (err) {
      const box = $('#tPrev'); if (box) box.innerHTML = `<div class="empty"><strong>Preview failed</strong><span>${esc(err.message)}</span></div>`;
    } finally { disposeRenderer(); }
  }

  /* ===================== Export: print worksheet ===================== */
  async function printSheet() {
    const qs = selected();
    if (!qs.length) { toast('Pick at least one question.'); return; }
    const L = cfg.lang;
    const showAns = cfg.wsMode === 'teacher';
    const qHtml = (q, i) => {
      const d = JW.qd(q, L);
      const opts = q.kind === 'number' ? '' : `<div class="p-opts">${optionsOf(q, L).map(o => `<div class="p-opt ${showAns && JW.qCorrect(q).includes(o.id) ? 'ok' : ''}"><b>(${esc(o.id)})</b><div>${JW.sanitize(o.html)}</div></div>`).join('')}</div>`;
      const ex = showAns ? `<div class="p-ans"><b>Answer: ${esc(answerOf(q) || '—')}</b>${cfg.solutions && explainOf(q, L) ? `<div class="p-sol">${JW.sanitize(explainOf(q, L))}</div>` : ''}</div>` : '';
      const co = [d.direction, d.comprehension].filter(Boolean).map(h => `<div class="p-call">${JW.sanitize(h)}</div>`).join('');
      return `<div class="pq"><div class="pn">${i + 1}.</div><div class="pb">${co}<div class="pt">${JW.sanitize(d.content || '')}</div>${q.kind === 'number' ? '<div class="p-num">Answer: ________________</div>' : ''}${opts}${ex}</div><div class="pm">[${q.marks}]</div></div>`;
    };
    const total = qs.reduce((s, q) => s + q.marks, 0);
    const key = (cfg.wsMode === 'withkey') ? `<div class="p-key"><h2>Answer key</h2><div class="p-keygrid">${qs.map((q, i) => `<span><b>${i + 1}</b> ${esc(answerOf(q) || '—')}</span>`).join('')}</div></div>` : '';
    document.getElementById('printRoot')?.remove();
    const root = document.createElement('div');
    root.id = 'printRoot';
    root.className = cfg.wsCols === 2 ? 'cols2' : '';
    root.innerHTML = `<header class="p-top">${cfg.wsSchool ? `<div class="p-school">${esc(cfg.wsSchool)}</div>` : ''}<h1>${esc(cfg.wsTitle || cfg.heading || 'Practice worksheet')}</h1>
      <div class="p-info"><span>Questions: ${qs.length}</span><span>Total marks: ${total}</span>${showAns ? '<span><b>Teacher copy</b></span>' : ''}</div>
      ${showAns ? '' : '<div class="p-fill"><span>Name: ______________________</span><span>Class: __________</span><span>Date: __________</span></div>'}</header>
      <div class="p-body">${qs.map(qHtml).join('')}</div>${key}${cfg.footer ? `<footer class="p-foot">${esc(cfg.footer)}</footer>` : ''}`;
    document.body.appendChild(root);
    document.body.classList.add('t-printing');
    toast('Preparing worksheet…');
    await JW.typeset(root);
    const cleanup = () => { document.body.classList.remove('t-printing'); root.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    markUsed(qs.map(q => q.id));
    setTimeout(() => window.print(), 150);
  }

  /* ===================== Events ===================== */
  const here = () => location.hash.startsWith('#/teacher');

  document.addEventListener('click', async e => {
    if (!here()) return;
    const t = e.target.closest('[data-t]');
    if (!t) return;
    const act = t.dataset.t;
    switch (act) {
      case 'unlock': tryUnlock(); break;
      case 'lock': setUnlocked(false); drawLock(); break;
      case 'chap': {
        const p = t.dataset.path; T.chapSel.has(p) ? T.chapSel.delete(p) : T.chapSel.add(p);
        t.classList.toggle('on', T.chapSel.has(p)); t.setAttribute('aria-pressed', String(T.chapSel.has(p))); drawSourcesFooter(); break;
      }
      case 'chap-all': {
        const files = JW.filesFor(app.exam, t.dataset.v);
        const all = files.every(f => T.chapSel.has(f.path));
        files.forEach(f => (all ? T.chapSel.delete(f.path) : T.chapSel.add(f.path)));
        $$('.pick', t.closest('.pick-group')).forEach(b => { const on = T.chapSel.has(b.dataset.path); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        drawSourcesFooter(); break;
      }
      case 'load': loadPool([...T.chapSel], null, ''); break;
      case 'quick': loadQuick(t.dataset.v); break;
      case 'set-save': saveSet(); break;
      case 'set-load': loadSet(t.dataset.id); break;
      case 'set-export': exportSet(t.dataset.id); break;
      case 'set-del': store.set(K.sets, getSets().filter(s => s.id !== t.dataset.id)); drawSources(); break;
      case 'toggle': {
        const id = t.dataset.id; T.picked.has(id) ? T.picked.delete(id) : T.picked.add(id);
        t.classList.toggle('on', T.picked.has(id)); t.setAttribute('aria-checked', String(T.picked.has(id)));
        $('#tCount').firstElementChild.textContent = T.picked.size; drawSummary(); break;
      }
      case 'preview': { e.stopPropagation(); const q = JW.byId(t.dataset.id); if (q) previewImage(q, 1); break; }
      case 'preview-sel': { const qs = selected(); if (qs.length) previewImage(qs[0], 1); break; }
      case 'more': T.limit += 80; drawList(); break;
      case 'sel-all': filtered().forEach(q => T.picked.add(q.id)); drawList(); break;
      case 'sel-none': T.picked.clear(); drawList(); break;
      case 'sel-inv': filtered().forEach(q => (T.picked.has(q.id) ? T.picked.delete(q.id) : T.picked.add(q.id))); drawList(); break;
      case 'rand': { const n = randomPick(); toast(n ? `Added ${plural(n, 'question')}.` : 'No more questions match.'); drawList(); break; }
      case 'cfg': { const v = t.dataset.v; cfg[t.dataset.k] = ['width', 'scale', 'wsCols'].includes(t.dataset.k) ? Number(v) : v; saveCfg(); drawExport(); break; }
      case 'tog': cfg[t.dataset.k] = !cfg[t.dataset.k]; saveCfg(); drawExport(); break;
      case 'zip': exportZip(); break;
      case 'print': printSheet(); break;
      case 'cancel-run': JW.closeModal(); break;
      case 'pin-save': savePin(); break;
      case 'pin-del': store.del(K.pin); setUnlocked(false); toast('PIN removed.'); drawExtras(); drawHeadActions(); break;
      case 'used-clear': store.del(K.used); toast('Used history cleared.'); drawExtras(); if (T.loaded) drawList(); break;
    }
  });

  function drawSourcesFooter() {
    const sel = [...T.chapSel].map(p => data.byPath.get(p)).filter(Boolean);
    const n = sel.reduce((s, f) => s + f.count, 0);
    const row = $('#tSources .t-actions .muted'), btn = $('#tLoad');
    if (row) row.innerHTML = sel.length ? `<b>${plural(sel.length, 'chapter')}</b> · ${plural(n, 'question')}` : 'No chapters selected';
    if (btn) btn.disabled = !sel.length || T.loading;
  }

  const debounce = (fn, ms = 160) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
  const onSearch = debounce(v => { T.q = v; T.limit = 80; drawList(); });
  document.addEventListener('input', e => {
    if (!here()) return;
    const t = e.target;
    if (t.id === 'tSearch') onSearch(t.value);
    else if (t.id === 'tN') T.n = t.value;
    else if (t.dataset?.tx) { cfg[t.dataset.tx] = t.value; saveCfg(); }
  });
  document.addEventListener('change', e => {
    if (!here()) return;
    const t = e.target;
    if (t.dataset?.tf) {
      const k = t.dataset.tf;
      T[k] = t.type === 'checkbox' ? t.checked : t.value;
      T.limit = 80;
      if (['mix', 'skipUsed'].includes(k)) return;
      drawList();
    } else if (t.dataset?.t === 'import' && t.files?.[0]) { importSet(t.files[0]); t.value = ''; }
  });
  document.addEventListener('keydown', e => {
    if (!here()) return;
    const t = e.target;
    if (e.key === 'Enter' && t.id === 'tPinIn') { e.preventDefault(); tryUnlock(); }
    else if ((e.key === 'Enter' || e.key === ' ') && t.classList?.contains('trow')) { e.preventDefault(); t.click(); }
  });
  window.addEventListener('hashchange', () => { if (!here()) { document.getElementById('printRoot')?.remove(); document.body.classList.remove('t-printing'); } });

  window.JWT = { page };
})();
