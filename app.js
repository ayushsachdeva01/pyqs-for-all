/* JEEwise — rewritten. Question JSON is loaded per chapter, only when needed. */
(() => {
  'use strict';

  /* ===================== Utilities ===================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const titleCase = s => String(s ?? '').replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function fmtTime(ms) {
    let s = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  const ICONS = {
    home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    left: '<polyline points="15 18 9 12 15 6"/>',
    right: '<polyline points="9 18 15 12 9 6"/>',
    down: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    up: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="6" y1="9" x2="6.01" y2="9"/><line x1="10" y1="9" x2="10.01" y2="9"/><line x1="14" y1="9" x2="14.01" y2="9"/><line x1="18" y1="9" x2="18.01" y2="9"/><line x1="7" y1="15" x2="17" y2="15"/>',
    retry: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    teacher: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><line x1="22" y1="10" x2="22" y2="16"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'
  };
  const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach(el => { if (!el.firstChild) el.innerHTML = icon(el.dataset.icon); });
  }

  /* ===================== Storage ===================== */
  const KEYS = {
    attempts: 'jeePractice_attempts_v3',
    bookmarks: 'jeePractice_bookmarks_v3',
    review: 'jeePractice_review_v3',
    sessions: 'jeePractice_sessions_v3',
    theme: 'jeePractice_theme_v3',
    active: 'jeewise_active_v4',
    exam: 'jeewise_exam_v4',
    lang: 'jeewise_lang_v4',
    prefs: 'jeewise_prefs_v4',
    meta: 'jeewise_qmeta_v4'
  };
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null || raw === '') return fallback;
        const v = JSON.parse(raw);
        return v ?? fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { toast('Could not save to this device (storage full or blocked).'); return false; }
    },
    del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
  };

  let attempts = [];
  let bookmarks = new Set();
  let reviews = new Set();
  let meta = { f: [], m: {}, c: {} };           // question id -> index into meta.f (the file that contains it)
  let prefs = { order: 'newest', length: 20, include: 'all' };

  function loadStorage() {
    const a = store.get(KEYS.attempts, []);
    attempts = Array.isArray(a) ? a.filter(x => x && x.questionId != null) : [];
    const b = store.get(KEYS.bookmarks, []);
    bookmarks = new Set(Array.isArray(b) ? b.map(String) : []);
    const r = store.get(KEYS.review, []);
    reviews = new Set(Array.isArray(r) ? r.map(String) : []);
    const m = store.get(KEYS.meta, null);
    if (m && Array.isArray(m.f) && m.m && typeof m.m === 'object') meta = m;
    if (!meta.c || typeof meta.c !== 'object') meta.c = {};
    const p = store.get(KEYS.prefs, null);
    if (p && typeof p === 'object') prefs = { ...prefs, ...p };
    store.del('jeePractice_sessions_v3__active'); // old, incompatible in-progress session format
  }

  let metaTimer;
  function saveMetaSoon() {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(() => store.set(KEYS.meta, meta), 600);
  }

  /* ===================== Data layer ===================== */
  const data = {
    files: [],              // manifest entries
    byPath: new Map(),
    cache: new Map(),       // path -> Question[]
    pending: new Map(),     // path -> Promise<Question[]>
    byId: new Map(),        // id -> Question (only for loaded files)
    ready: false
  };
  const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'];
  const SUBJECT_TAG = { Physics: 'PHY', Chemistry: 'CHE', Mathematics: 'MAT' };
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const QBASE = new URL('./questions/', document.baseURI);

  const examName = e => (e === 'jee-advanced' ? 'JEE Advanced' : 'JEE Main');

  async function loadManifest() {
    const res = await fetch(new URL('manifest.json', QBASE), { cache: 'no-cache' });
    if (!res.ok) throw new Error('manifest ' + res.status);
    const json = await res.json();
    const list = Array.isArray(json) ? json : json.files;
    if (!Array.isArray(list)) throw new Error('Invalid manifest');
    data.files = list.map(entry => {
      if (typeof entry === 'string') {
        const parts = entry.split('/');
        const fileName = parts[parts.length - 1];
        return {
          path: entry, subject: titleCase(parts[0] || 'Unknown'),
          exam: /advanced/i.test(parts[1] || '') ? 'jee-advanced' : 'jee-main',
          chapter: titleCase(fileName.replace(/_\d+q\.json$/i, '')),
          count: Number(fileName.match(/_(\d+)q\.json$/i)?.[1] || 0), group: 'Chapters', oos: null, bonus: null, topics: null, years: null
        };
      }
      const path = entry.path || entry.name;
      return {
        path, subject: titleCase(entry.subject || 'Unknown'),
        exam: entry.exam || (/advanced/i.test(path || '') ? 'jee-advanced' : 'jee-main'),
        chapter: entry.chapter || titleCase(String(path || '').split('/').pop().replace(/_\d+q\.json$/i, '')),
        count: Number(entry.count || 0), group: entry.group ? titleCase(entry.group) : 'Chapters',
        oos: entry.oos ?? null, bonus: entry.bonus ?? null,
        topics: Array.isArray(entry.topics) ? entry.topics : null, years: Array.isArray(entry.years) ? entry.years : null
      };
    }).filter(f => f.path);
    data.byPath = new Map(data.files.map(f => [f.path, f]));
    data.ready = true;
  }

  const filesFor = (exam, subject) => data.files.filter(f => f.exam === exam && (!subject || f.subject === subject));
  const fileForChapter = (exam, subject, chapter) => data.files.find(f => f.exam === exam && f.subject === subject && norm(f.chapter) === norm(chapter));
  const examSubjects = exam => SUBJECTS.filter(s => filesFor(exam, s).length).concat([...new Set(filesFor(exam).map(f => f.subject))].filter(s => !SUBJECTS.includes(s)));

  // Chapter-level flags. The manifest can carry them (see tools/build-manifest.js); otherwise they are
  // learned the first time a chapter is opened and remembered on this device.
  function chapInfo(f) {
    const c = meta.c[f.path];
    const count = f.count || c?.n || 0;
    const oos = f.oos != null ? Number(f.oos) : (c ? c.o : 0);
    const bonus = f.bonus != null ? Number(f.bonus) : (c ? c.b : 0);
    const group = f.group && f.group !== 'Chapters' ? f.group : (c?.g || 'Chapters');
    return { group, count, oos, bonus, allOos: count > 0 && oos >= count };
  }
  const inSyllabusFirst = files => files.map((f, i) => [f, i]).sort((a, b) => (chapInfo(a[0]).allOos - chapInfo(b[0]).allOos) || a[1] - b[1]).map(x => x[0]);
  function groupFiles(files) {
    const m = new Map();
    for (const f of files) { const g = chapInfo(f).group; if (!m.has(g)) m.set(g, []); m.get(g).push(f); }
    return [...m];
  }
  const chapTags = info => (info.allOos ? '<span class="chip oos">Out of syllabus</span>' : info.oos ? `<span class="chip oos">${info.oos} out of syllabus</span>` : '')
    + (info.bonus ? `<span class="chip bonus">${info.bonus} bonus</span>` : '');

  function parseSortKey(raw) {
    // Orders papers by real date: year, then month/day/shift parsed from the paper title.
    const year = Number(raw.year) || 0;
    const title = String(raw.paperTitle || raw.paperId || '');
    let key = year * 1e6;
    const m = title.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
    if (m) key += (MONTHS[m[2].toLowerCase()] || 0) * 1e4 + Number(m[1]) * 1e2;
    if (/morning|shift[\s-]*1/i.test(title)) key += 10; else if (/evening|shift[\s-]*2/i.test(title)) key += 20;
    const p = title.match(/paper[\s-]*(\d)/i);
    if (p) key += Number(p[1]);
    return key;
  }

  function langBlock(raw, lang) {
    const q = raw.question || {};
    return q[lang] || q.en || q.hi || (q.content != null ? q : {});
  }

  function kindOf(raw) {
    const d = langBlock(raw, 'en');
    if (!(d.options || []).length) return 'number';
    const t = String(raw.type || '').toLowerCase();
    if (t.includes('mcqm') || t.includes('multi') || (d.correct_options || []).length > 1) return 'multi';
    return 'single';
  }

  function makeQuestion(raw, file) {
    const q = {
      id: String(raw.question_id ?? raw.id),
      file: file.path,
      exam: raw.exam || file.exam,
      subject: file.subject,
      chapter: file.chapter,
      topic: titleCase(raw.topic || ''),
      year: Number(raw.year) || 0,
      diff: titleCase(raw.difficulty || 'Unknown'),
      kind: kindOf(raw),
      marks: Number.isFinite(Number(raw.marks)) ? Number(raw.marks) : 4,
      neg: Number.isFinite(Number(raw.negMarks)) ? Math.abs(Number(raw.negMarks)) : 0,
      paper: String(raw.paperTitle || ''),
      sortKey: parseSortKey(raw),
      group: titleCase(raw.chapterGroup || ''),
      examGroup: String(raw.examGroup || ''),
      paperId: String(raw.paperId || ''),
      bonus: raw.isBonus === true,
      oos: raw.isOutOfSyllabus === true,
      tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
      raw
    };
    return q;
  }

  function extractQuestions(payload) {
    if (Array.isArray(payload)) return payload.flatMap(extractQuestions);
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.questions)) return payload.questions;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results.flatMap(extractQuestions);
    if (payload.question_id || payload.id) return [payload];
    return [];
  }

  function registerFile(path, qs) {
    let idx = meta.f.indexOf(path);
    if (idx < 0) { meta.f.push(path); idx = meta.f.length - 1; }
    let changed = false;
    for (const q of qs) if (meta.m[q.id] !== idx) { meta.m[q.id] = idx; changed = true; }
    const info = { g: qs[0]?.group || '', n: qs.length, o: qs.filter(q => q.oos).length, b: qs.filter(q => q.bonus).length };
    const old = meta.c[path];
    if (!old || old.g !== info.g || old.n !== info.n || old.o !== info.o || old.b !== info.b) { meta.c[path] = info; changed = true; }
    if (changed) { saveMetaSoon(); statsDirty = true; }
  }

  function loadFile(path) {
    if (data.cache.has(path)) return Promise.resolve(data.cache.get(path));
    if (data.pending.has(path)) return data.pending.get(path);
    const file = data.byPath.get(path);
    if (!file) return Promise.reject(new Error('Unknown file ' + path));
    const p = fetch(new URL(path, QBASE))
      .then(res => { if (!res.ok) throw new Error(`${res.status} loading ${path}`); return res.json(); })
      .then(json => {
        const seen = new Set();
        const qs = [];
        for (const raw of extractQuestions(json)) {
          const id = String(raw.question_id ?? raw.id ?? '');
          if (!id || seen.has(id) || !raw.question) continue;
          seen.add(id);
          qs.push(makeQuestion(raw, file));
        }
        data.cache.set(path, qs);
        qs.forEach(q => data.byId.set(q.id, q));
        registerFile(path, qs);
        return qs;
      })
      .finally(() => data.pending.delete(path));
    data.pending.set(path, p);
    return p;
  }

  async function loadFiles(paths, onProgress) {
    const unique = [...new Set(paths)];
    let done = 0;
    const out = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < unique.length) {
        const path = unique[cursor++];
        try { out.push(...await loadFile(path)); }
        catch (err) { console.warn('Could not load', path, err); }
        onProgress?.(++done, unique.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, unique.length) }, worker));
    return out;
  }

  /* ===================== Per-question helpers ===================== */
  let lang = store.get(KEYS.lang, 'en');
  const qd = (q, l = lang) => langBlock(q.raw, l);
  const hasHindi = q => !!(q.raw.question && q.raw.question.hi && q.raw.question.en);
  const qOptions = q => (qd(q).options || []).map((o, i) => (o && typeof o === 'object'
    ? { id: String(o.identifier ?? String.fromCharCode(65 + i)), html: String(o.content ?? '') }
    : { id: String.fromCharCode(65 + i), html: String(o ?? '') }));
  const qCorrect = q => (langBlock(q.raw, 'en').correct_options || []).map(String);
  const qAnswer = q => String(langBlock(q.raw, 'en').answer ?? '').trim();

  const tpl = document.createElement('template');
  function plainText(html) { tpl.innerHTML = html || ''; return tpl.content.textContent || ''; }

  function sanitize(html) {
    const t = document.createElement('template');
    t.innerHTML = String(html ?? '');
    const blocked = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'APPLET', 'BASE', 'META', 'LINK', 'STYLE', 'FORM']);
    t.content.querySelectorAll('*').forEach(el => {
      if (blocked.has(el.tagName)) { el.remove(); return; }
      [...el.attributes].forEach(at => {
        const name = at.name.toLowerCase(), val = at.value.trim();
        if (name.startsWith('on') || name === 'srcdoc' || name === 'style' && /url\s*\(|expression\s*\(/i.test(val)) el.removeAttribute(at.name);
        else if (['href', 'src', 'xlink:href'].includes(name) && /^(javascript|vbscript|data:text\/html)/i.test(val)) el.removeAttribute(at.name);
      });
      if (el.tagName === 'IMG') el.setAttribute('loading', 'lazy');
    });
    return fixMath(t.innerHTML);
  }

  // The question data writes inline maths as $$…$$, which MathJax would draw as a centred block and
  // break the sentence. A $$…$$ that shares its paragraph with other text becomes inline; one that
  // stands alone stays a display equation.
  const BLOCK_TAG = /<\/?(?:p|div|br|li|tr|td|th|table|ul|ol|h[1-6]|blockquote)\b[^>]*>/i;
  const blank = s => !s.replace(/&nbsp;|\s/g, '');
  function fixMath(html) {
    if (!html.includes('$$')) return html;
    return html.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex, off, str) => {
      const before = str.slice(0, off).split(BLOCK_TAG).pop();
      const after = str.slice(off + m.length).split(BLOCK_TAG)[0];
      return blank(before) && blank(after) ? m : `\\(${tex}\\)`;
    });
  }

  function previewText(q) {
    let text = plainText(qd(q).content).replace(/\s+/g, ' ').trim().replace(/\$\$([\s\S]+?)\$\$/g, (m, t) => '$' + t + '$'); // list preview: always inline
    if (text.length > 220) {
      let cut = text.slice(0, 220);
      cut = cut.slice(0, Math.max(cut.lastIndexOf(' '), 120));
      if ((cut.match(/\$/g) || []).length % 2) cut = cut.slice(0, cut.lastIndexOf('$')).trimEnd(); // never cut inside $…$
      text = cut + '…';
    }
    return text;
  }
  const searchText = q => (q._s ??= `${plainText(qd(q, 'en').content)} ${q.topic} ${q.chapter} ${q.paper}`.toLowerCase());
  const paperShort = q => q.paper.replace(/^(jee\s*main|jee\s*advanced|iit[-\s]*jee)\s*/i, '').replace(/^\d{4}\s*/, '').trim();

  /* ---- grading ---- */
  function gradeAnswer(q, entry) {
    const marks = { right: q.marks, wrong: -q.neg };
    if (q.kind !== 'number') {
      const right = qCorrect(q).slice().sort();
      if (!right.length) return { gradable: false };
      const got = (entry.sel || []).map(String).sort();
      const correct = got.length === right.length && got.every((v, i) => v === right[i]);
      return { gradable: true, correct, score: correct ? marks.right : marks.wrong };
    }
    const expected = qAnswer(q);
    const typed = String(entry.val ?? '').trim();
    if (!expected) return { gradable: false };
    let correct = false;
    const range = expected.match(/^(-?\d+(?:\.\d+)?)\s*(?:to|-)\s*(-?\d+(?:\.\d+)?)$/i);
    const num = Number(typed.replace(/,/g, ''));
    if (range && typed !== '' && Number.isFinite(num)) {
      const lo = Math.min(Number(range[1]), Number(range[2])), hi = Math.max(Number(range[1]), Number(range[2]));
      correct = num >= lo - 1e-9 && num <= hi + 1e-9;
    } else if (typed !== '' && Number.isFinite(num) && Number.isFinite(Number(expected))) {
      const target = Number(expected);
      correct = Math.abs(num - target) <= Math.max(1e-6, Math.abs(target) * 1e-6);
    } else {
      correct = typed.toLowerCase() === expected.toLowerCase();
    }
    return { gradable: true, correct, score: correct ? marks.right : marks.wrong };
  }

  /* ===================== Progress statistics (no question data needed) ===================== */
  let statsDirty = true;
  let latest = new Map();      // questionId -> most recent attempt
  let chapStats = new Map();   // exam|subject|chapterKey -> {attempted, correct, wrong, time}

  function attemptExam(a) {
    if (a.exam) return a.exam;
    const idx = meta.m[String(a.questionId)];
    return idx != null ? data.byPath.get(meta.f[idx])?.exam || null : null;
  }

  function rebuildStats() {
    latest = new Map();
    for (const a of attempts) latest.set(String(a.questionId), a);
    chapStats = new Map();
    for (const a of latest.values()) {
      const exam = attemptExam(a);
      if (!exam) continue;
      const key = `${exam}|${a.subject}|${norm(a.chapter)}`;
      const s = chapStats.get(key) || { attempted: 0, correct: 0, wrong: 0, time: 0 };
      s.attempted++; a.correct ? s.correct++ : s.wrong++; s.time += Number(a.timeMs) || 0;
      chapStats.set(key, s);
    }
    statsDirty = false;
  }
  function chapterStats(exam, subject, chapter) {
    if (statsDirty) rebuildStats();
    return chapStats.get(`${exam}|${subject}|${norm(chapter)}`) || { attempted: 0, correct: 0, wrong: 0, time: 0 };
  }
  function subjectStats(exam, subject) {
    const total = { attempted: 0, correct: 0, wrong: 0, questions: 0, chapters: 0 };
    for (const f of filesFor(exam, subject)) {
      const s = chapterStats(exam, subject, f.chapter);
      total.attempted += s.attempted; total.correct += s.correct; total.wrong += s.wrong;
      total.questions += f.count; total.chapters++;
    }
    return total;
  }
  const latestOf = id => { if (statsDirty) rebuildStats(); return latest.get(String(id)); };
  function wrongIds(exam) {
    if (statsDirty) rebuildStats();
    return [...latest.values()].filter(a => !a.correct && attemptExam(a) === exam).map(a => String(a.questionId));
  }
  function filesForIds(ids) {
    const paths = new Set(), missing = [];
    for (const id of ids) {
      const idx = meta.m[String(id)];
      if (idx != null && data.byPath.has(meta.f[idx])) paths.add(meta.f[idx]); else missing.push(String(id));
    }
    return { paths: [...paths], missing };
  }

  function recordAttempt(q, entry) {
    attempts.push({
      questionId: q.id, correct: !!entry.correct, score: entry.score, timeMs: Math.round(entry.spent || 0),
      date: Date.now(), subject: q.subject, chapter: q.chapter, year: q.year, exam: q.exam
    });
    if (!store.set(KEYS.attempts, attempts)) { /* toast already shown */ }
    statsDirty = true;
  }

  // Old attempts were saved without an exam. Quietly resolve the few chapters you have practised.
  async function migrateLegacyAttempts() {
    const orphan = attempts.filter(a => !a.exam && meta.m[String(a.questionId)] == null);
    if (!orphan.length) return;
    const wanted = new Set();
    for (const a of orphan) {
      data.files.filter(f => f.subject === a.subject && norm(f.chapter) === norm(a.chapter)).forEach(f => wanted.add(f.path));
    }
    if (!wanted.size) return;
    await loadFiles([...wanted]);
    statsDirty = true;
    const hash = location.hash;
    if (!document.body.classList.contains('in-session') && (hash === '' || hash === '#/' || hash.startsWith('#/subject') || hash === '#/progress')) route();
  }

  /* ===================== Maths typesetting (lazy) ===================== */
  const mjWaiters = [];
  let mjChain = Promise.resolve();
  function doTypeset(els) {
    mjChain = mjChain.then(() => {
      const live = els.filter(e => e.isConnected);
      if (live.length && window.MathJax?.typesetPromise) return window.MathJax.typesetPromise(live);
    }).catch(err => console.warn('MathJax:', err));
    return mjChain;
  }
  function typeset(els) {
    els = (Array.isArray(els) ? els : [els]).filter(e => e && e.isConnected);
    if (!els.length || window.__mjFailed) return Promise.resolve();
    if (!window.__mjReady) return new Promise(res => mjWaiters.push({ els, res }));
    return doTypeset(els);
  }
  document.addEventListener('mj-ready', () => {
    mjWaiters.splice(0).forEach(({ els, res }) => (window.__mjFailed ? res() : doTypeset(els).then(res)));
  });
  function typesetReveal(el) {
    el.classList.add('mj-wait');
    const done = () => el.classList.remove('mj-wait');
    const t = setTimeout(done, 2500);
    typeset(el).then(() => { clearTimeout(t); done(); });
  }
  const mathIO = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { mathIO.unobserve(e.target); typeset(e.target); }
    }, { rootMargin: '500px' })
    : null;
  function observeMath(root) {
    $$('.mj:not([data-mj])', root).forEach(el => { el.dataset.mj = '1'; mathIO ? mathIO.observe(el) : typeset(el); });
  }

  /* ===================== App state & router ===================== */
  const app = { exam: store.get(KEYS.exam, 'jee-main'), subject: 'Physics', token: 0 };
  if (app.exam !== 'jee-advanced') app.exam = 'jee-main';
  const view = () => $('#view');
  const hrefs = {
    home: () => '#/', subject: s => `#/subject/${encodeURIComponent(s)}`,
    chapter: (s, c) => `#/chapter/${encodeURIComponent(s)}/${encodeURIComponent(c)}`,
    build: () => '#/build', saved: () => '#/saved', progress: () => '#/progress'
  };

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
    return { name: parts[0] || 'home', a: parts[1], b: parts[2] };
  }

  function renderNav(r) {
    const lib = r.name === 'subject' || r.name === 'chapter';
    const items = [
      { id: 'home', label: 'Home', icon: 'home', href: hrefs.home(), on: r.name === 'home' },
      { id: 'lib', label: 'Library', icon: 'book', href: hrefs.subject(app.subject), on: lib },
      { id: 'build', label: 'Practice', icon: 'target', href: hrefs.build(), on: r.name === 'build' },
      { id: 'saved', label: 'Saved', icon: 'star', href: hrefs.saved(), on: r.name === 'saved' },
      { id: 'progress', label: 'Progress', icon: 'chart', href: hrefs.progress(), on: r.name === 'progress' }
    ];
    const sideItems = items.concat([{ id: 'teacher', label: 'Teacher mode', icon: 'teacher', href: '#/teacher', on: r.name === 'teacher' }]);
    $('#sideNav').innerHTML = sideItems.map(i => `<a class="nav-item ${i.on ? 'active' : ''}" href="${i.href}">${icon(i.icon)}<span>${i.label}</span></a>`).join('');
    $('#tabBar').innerHTML = items.map(i => `<a class="${i.on ? 'active' : ''}" href="${i.href}" ${i.on ? 'aria-current="page"' : ''}>${icon(i.icon)}<span>${i.label}</span></a>`).join('');
    $$('#examSeg button').forEach(b => { const on = b.dataset.v === app.exam; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
  }

  function setView(html, { scroll = true } = {}) {
    const v = view();
    v.innerHTML = html;
    hydrateIcons(v);
    observeMath(v);
    if (scroll) window.scrollTo(0, 0);
  }

  function route() {
    const r = parseRoute();
    if (r.name === 'session') {
      if (!S) { location.replace('#/'); return; }
      showPractice();
      return;
    }
    if (S && !$('#practice').hidden) hidePractice();
    const token = ++app.token;
    renderNav(r);
    document.title = 'JEEwise';
    if (!data.ready) return;
    try {
      switch (r.name) {
        case 'subject': return pageSubject(r.a);
        case 'chapter': return pageChapter(r.a, r.b, token);
        case 'build': return pageBuild();
        case 'saved': return pageSaved(token);
        case 'progress': return pageProgress();
        case 'teacher':
          if (window.JWT) return window.JWT.page(token);
          window.addEventListener('load', () => route(), { once: true });
          return;
        default: return pageHome();
      }
    } catch (err) {
      console.error(err);
      setView(`<div class="empty"><strong>Something went wrong showing this page</strong><span>${esc(err.message)}</span><a class="btn" href="#/">Go home</a></div>`);
    }
  }

  function switchExam(exam) {
    if (exam === app.exam) return;
    app.exam = exam;
    store.set(KEYS.exam, exam);
    const r = parseRoute();
    if (r.name === 'chapter') { location.hash = hrefs.subject(r.a); return; }
    BUILD.sel.clear();
    route();
  }

  /* ===================== Pages ===================== */
  const rowStat = a => `<div class="stat"><b>${a[1]}</b><span>${a[0]}</span></div>`;

  function pageHome() {
    const exam = app.exam;
    const subs = examSubjects(exam);
    const totalQ = filesFor(exam).reduce((s, f) => s + f.count, 0);
    if (statsDirty) rebuildStats();
    const examAttempts = attempts.filter(a => attemptExam(a) === exam);
    const uniq = new Set(examAttempts.map(a => String(a.questionId))).size;
    const acc = examAttempts.length ? pct(examAttempts.filter(a => a.correct).length, examAttempts.length) + '%' : '—';
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const today = attempts.filter(a => a.date >= dayStart).length;
    const wrong = wrongIds(exam).length;
    const active = readActive();
    const answered = active ? Object.values(active.answers || {}).filter(a => a.status).length : 0;

    setView(`
      <div class="page-head"><div>
        <div class="eyebrow">${examName(exam)} · Previous year questions</div>
        <h1>What are we solving today?</h1>
        <p>${totalQ.toLocaleString()} questions across ${filesFor(exam).length} chapters. Chapters load only when you open them.</p>
      </div></div>
      ${active ? `<div class="resume">
        <div class="grow"><b>Continue where you left off</b>
          <span class="muted">${esc(active.title)} · ${answered} of ${active.ids.length} answered · ${examName(active.exam)}</span></div>
        <button class="btn primary" data-act="resume">${icon('play')} Resume</button>
        <button class="btn ghost" data-act="discard-active">Discard</button></div>` : ''}
      <div class="grid cols-3">${subs.map(s => {
        const st = subjectStats(exam, s);
        return `<a class="subject-card" href="${hrefs.subject(s)}">
          <div class="tag">${SUBJECT_TAG[s] || esc(s.slice(0, 3).toUpperCase())}</div>
          <div><h2>${esc(s)}</h2><div class="meta">${plural(st.questions, 'question')} · ${plural(st.chapters, 'chapter')}</div></div>
          <div><div class="bar" title="${st.correct} correct, ${st.wrong} wrong">
            <i class="g" style="width:${pct(st.correct, st.questions)}%"></i><i class="r" style="width:${pct(st.wrong, st.questions)}%"></i></div>
          <div class="meta" style="margin-top:6px">${st.attempted} attempted${st.attempted ? ` · ${pct(st.correct, st.attempted)}% accuracy` : ''}</div></div>
        </a>`;
      }).join('')}</div>
      <h2 class="section-title">Jump in</h2>
      <div class="action-row">
        <a class="action" href="${hrefs.build()}"><span class="ic">${icon('target')}</span><span><b>Custom practice</b><small>Pick chapters, length and order</small></span></a>
        <button class="action" data-act="practice-mistakes" ${wrong ? '' : 'disabled'}><span class="ic">${icon('retry')}</span><span><b>Retry mistakes</b><small>${wrong ? plural(wrong, 'question') + ' you got wrong' : 'Nothing wrong yet'}</small></span></button>
        <a class="action" href="${hrefs.saved()}"><span class="ic">${icon('star')}</span><span><b>Saved questions</b><small>${plural(bookmarks.size, 'bookmark')} · ${reviews.size} marked for review</small></span></a>
      </div>
      <h2 class="section-title">Your progress in ${examName(exam)}</h2>
      <div class="grid cols-4">${[['Attempted', uniq], ['Accuracy', acc], ['Answered today', today], ['Questions', totalQ.toLocaleString()]].map(rowStat).join('')}</div>`);
  }

  /* ---- Library: chapters of a subject ---- */
  const LIB = { q: '', filter: 'all', sort: 'default' };

  function pageSubject(subject) {
    const exam = app.exam;
    const subs = examSubjects(exam);
    if (!subject || !subs.includes(subject)) subject = subs[0];
    app.subject = subject;
    renderNav({ name: 'subject' });
    setView(`
      <div class="page-head"><div>
        <div class="eyebrow">Question library · ${examName(exam)}</div>
        <h1>${esc(subject)}</h1>
        <p>Pick a chapter. Only that chapter's questions are loaded.</p></div></div>
      <div class="tabs">${subs.map(s => `<a class="tab ${s === subject ? 'active' : ''}" href="${hrefs.subject(s)}">${esc(s)}<span class="n">${filesFor(exam, s).length}</span></a>`).join('')}</div>
      <div class="toolbar">
        <input class="input search" id="libSearch" type="search" placeholder="Search chapters or topics…" value="${esc(LIB.q)}" aria-label="Search chapters">
        <select class="select" id="libFilter" aria-label="Filter">
          ${[['all', 'All chapters'], ['syllabus', 'In syllabus only'], ['oos', 'Out of syllabus'], ['todo', 'Not started'], ['progress', 'In progress'], ['weak', 'Needs work (<60%)']].map(([v, l]) => `<option value="${v}" ${LIB.filter === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select class="select" id="libSort" aria-label="Sort">
          ${[['default', 'Default order'], ['questions', 'Most questions'], ['weak', 'Weakest first'], ['best', 'Best accuracy']].map(([v, l]) => `<option value="${v}" ${LIB.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div id="chapGrid"></div>`);
    renderChapterGrid();
  }

  function renderChapterGrid() {
    const exam = app.exam, subject = app.subject;
    let rows = inSyllabusFirst(filesFor(exam, subject)).map(f => {
      const s = chapterStats(exam, subject, f.chapter);
      return { f, s, acc: pct(s.correct, s.attempted), info: chapInfo(f) };
    });
    const q = LIB.q.trim().toLowerCase();
    if (q) rows = rows.filter(r => r.f.chapter.toLowerCase().includes(q) || r.info.group.toLowerCase().includes(q) || (r.f.topics || []).some(t => String(t.n).toLowerCase().includes(q)));
    if (LIB.filter === 'syllabus') rows = rows.filter(r => !r.info.allOos);
    if (LIB.filter === 'oos') rows = rows.filter(r => r.info.oos > 0);
    if (LIB.filter === 'todo') rows = rows.filter(r => !r.s.attempted);
    if (LIB.filter === 'progress') rows = rows.filter(r => r.s.attempted && r.s.attempted < r.f.count);
    if (LIB.filter === 'weak') rows = rows.filter(r => r.s.attempted >= 3 && r.acc < 60);
    if (LIB.sort === 'questions') rows.sort((a, b) => b.f.count - a.f.count);
    if (LIB.sort === 'weak') rows.sort((a, b) => (a.s.attempted ? a.acc : 101) - (b.s.attempted ? b.acc : 101));
    if (LIB.sort === 'best') rows.sort((a, b) => (b.s.attempted ? b.acc : -1) - (a.s.attempted ? a.acc : -1));
    const grid = $('#chapGrid');
    if (!grid) return;
    const card = ({ f, s, acc, info }) => `
      <a class="chapter-card ${info.allOos ? 'oos' : ''}" href="${hrefs.chapter(subject, f.chapter)}">
        <h3>${esc(f.chapter)}</h3>
        ${chapTags(info) ? `<div class="chap-tags">${chapTags(info)}</div>` : ''}
        ${f.topics?.length ? `<div class="chap-topics">${esc(f.topics.slice(0, 3).map(t => t.n).join(' · '))}${f.topics.length > 3 ? ` +${f.topics.length - 3} more` : ''}</div>` : ''}
        <div class="bar"><i class="g" style="width:${pct(s.correct, f.count)}%"></i><i class="r" style="width:${pct(s.wrong, f.count)}%"></i></div>
        <div class="row"><span>${plural(f.count, 'question')}${f.topics?.length ? ` · ${plural(f.topics.length, 'topic')}` : ''}${f.years ? ` · ${f.years[0] === f.years[1] ? f.years[0] : f.years[0] + '–' + f.years[1]}` : ''}</span><span>${s.attempted ? `${s.attempted} done · ${acc}%` : 'Not started'}</span></div>
      </a>`;
    // Sections follow the chapter groups (Mechanics, Electricity, …) in the order the manifest lists them.
    const order = [...new Set(filesFor(exam, subject).map(f => chapInfo(f).group))];
    const byGroup = new Map(order.map(g => [g, []]));
    rows.forEach(r => { if (!byGroup.has(r.info.group)) byGroup.set(r.info.group, []); byGroup.get(r.info.group).push(r); });
    const sections = [...byGroup].filter(([, list]) => list.length);
    const titled = sections.length > 1 || (sections[0] && sections[0][0] !== 'Chapters');
    grid.innerHTML = sections.map(([g, list]) => `
      ${titled ? `<h2 class="group-title">${esc(g)}<span>${plural(list.length, 'chapter')} · ${plural(list.reduce((n, r) => n + r.f.count, 0), 'question')}</span></h2>` : ''}
      <div class="grid cols-auto">${list.map(card).join('')}</div>`).join('')
      || '<div class="empty"><strong>No chapters match</strong><span>Try clearing the search or filter.</span></div>';
  }

  /* ---- Chapter detail ---- */
  let CP = null; // chapter page state

  const KIND_LABEL = { single: 'Single correct', multi: 'Multiple correct', number: 'Numerical' };
  const marksLabel = q => `+${q.marks} / −${q.neg}`;
  const sylLabel = q => (q.bonus ? 'Bonus' : q.oos ? 'Out of syllabus' : 'In syllabus');
  // [key, label, function that puts a question into a group]
  const GROUPS = [
    ['topic', 'Topic', q => q.topic || 'General'],
    ['year', 'Year', q => (q.year ? String(q.year) : 'Year n/a')],
    ['paper', 'Paper', q => q.paper || 'Paper n/a'],
    ['diff', 'Difficulty', q => q.diff],
    ['type', 'Question type', q => KIND_LABEL[q.kind]],
    ['marks', 'Marks', marksLabel],
    ['syllabus', 'Syllabus', sylLabel]
  ];
  const groupFn = k => GROUPS.find(g => g[0] === k)?.[2];
  const initialGroup = () => (prefs.group === 'none' || groupFn(prefs.group) ? prefs.group : 'topic');

  function orderGroups(list, key) {
    const fn = groupFn(key), m = new Map();
    for (const q of list) { const l = fn(q); (m.get(l) || m.set(l, []).get(l)).push(q); }
    const arr = [...m].map(([label, qs]) => ({ label, qs }));
    const rank = (a, l) => { const i = a.indexOf(l); return i < 0 ? 99 : i; };
    const dir = CP.order === 'oldest' ? 1 : -1;
    if (key === 'topic') arr.sort((a, b) => b.qs.length - a.qs.length || a.label.localeCompare(b.label));
    else if (key === 'year' || key === 'paper') arr.sort((a, b) => dir * (a.qs[0].sortKey - b.qs[0].sortKey));
    else if (key === 'diff') arr.sort((a, b) => rank(['Easy', 'Medium', 'Hard'], a.label) - rank(['Easy', 'Medium', 'Hard'], b.label));
    else if (key === 'type') arr.sort((a, b) => rank(Object.values(KIND_LABEL), a.label) - rank(Object.values(KIND_LABEL), b.label));
    else if (key === 'marks') arr.sort((a, b) => b.qs[0].marks - a.qs[0].marks || a.qs[0].neg - b.qs[0].neg);
    else if (key === 'syllabus') arr.sort((a, b) => rank(['In syllabus', 'Bonus', 'Out of syllabus'], a.label) - rank(['In syllabus', 'Bonus', 'Out of syllabus'], b.label));
    return arr;
  }

  async function pageChapter(subject, chapter, token) {
    const exam = app.exam;
    const file = fileForChapter(exam, subject, chapter);
    if (!file) {
      setView(`<a class="back" href="${hrefs.subject(subject)}">${icon('left')} ${esc(subject || 'Library')}</a><div class="empty"><strong>Chapter not found</strong><span>It may not exist in ${examName(exam)}.</span></div>`);
      return;
    }
    app.subject = file.subject;
    renderNav({ name: 'chapter' });
    const key = `${exam}|${file.path}`;
    if (!CP || CP.key !== key) CP = { key, file, qs: [], tab: 'all', search: '', year: '', diff: '', kind: '', status: '', paper: '', marks: '', syl: '', tag: '', group: initialGroup(), gsel: '', groups: [], baseCount: 0, order: 'newest', limit: 60, filtered: [] };
    if (!data.cache.has(file.path)) {
      setView(`<a class="back" href="${hrefs.subject(file.subject)}">${icon('left')} ${esc(file.subject)}</a>
        <div class="page-head"><div><div class="eyebrow">${esc(file.subject)} · ${examName(exam)}</div><h1>${esc(file.chapter)}</h1><p>Loading ${plural(file.count, 'question')}…</p></div></div>
        ${'<div class="skeleton"></div>'.repeat(5)}`);
    }
    let qs;
    try { qs = await loadFile(file.path); }
    catch (err) {
      if (token !== app.token) return;
      setView(`<a class="back" href="${hrefs.subject(file.subject)}">${icon('left')} ${esc(file.subject)}</a>
        <div class="empty"><strong>Couldn't load this chapter</strong><span>${esc(err.message)}. Check your connection and try again.</span><button class="btn primary" data-act="retry-route">Try again</button></div>`);
      return;
    }
    if (token !== app.token) return;
    CP.qs = qs;
    drawChapter();
  }

  function drawChapter() {
    const { file, qs } = CP;
    const years = [...new Set(qs.map(q => q.year).filter(Boolean))].sort((a, b) => b - a);
    const diffs = [...new Set(qs.map(q => q.diff))].sort();
    const kinds = Object.entries(KIND_LABEL).filter(([k]) => qs.some(q => q.kind === k));
    const papers = [...new Map(qs.filter(q => q.paper).map(q => [q.paper, q.sortKey]))].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const markSets = [...new Set(qs.map(marksLabel))];
    const tags = [...new Set(qs.flatMap(q => q.tags))].sort();
    const nBonus = qs.filter(q => q.bonus).length, nOos = qs.filter(q => q.oos).length;
    const allOos = qs.length > 0 && nOos === qs.length;
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
    setView(`
      <a class="back" href="${hrefs.subject(file.subject)}">${icon('left')} ${esc(file.subject)}</a>
      <div class="page-head"><div>
        <div class="eyebrow">${esc(file.subject)} · ${examName(app.exam)}${qs[0]?.group ? ' · ' + esc(qs[0].group) : ''}</div>
        <h1>${esc(file.chapter)}</h1>
        <p>${plural(qs.length, 'question')}${years.length ? ` · ${years[years.length - 1]}–${years[0]}` : ''}</p>
        ${allOos || nBonus || nOos ? `<div class="chap-tags">${allOos ? '<span class="chip oos">Out of syllabus</span>' : nOos ? `<span class="chip oos">${nOos} out of syllabus</span>` : ''}${nBonus ? `<span class="chip bonus">${nBonus} bonus</span>` : ''}</div>` : ''}</div>
        <button class="btn primary" data-act="chapter-practice">${icon('play')} Practice</button></div>
      ${allOos ? '<div class="notice oos-banner"><span class="grow"><b>This chapter is out of syllabus.</b><br><span class="muted">Every question here is outside the current syllabus.</span></span></div>' : ''}
      <div class="grid cols-4" id="cpStats"></div>
      <div class="tabs" style="margin-top:22px" id="cpTabs"></div>
      <div class="toolbar">
        <input class="input search" id="cpSearch" type="search" placeholder="Search in this chapter…" value="${esc(CP.search)}" aria-label="Search questions">
        <select class="select" data-cp="group" aria-label="Group by">${opt('none', 'No grouping', CP.group)}${GROUPS.map(g => opt(g[0], 'Group by ' + g[1].toLowerCase(), CP.group)).join('')}</select>
        <select class="select" data-cp="year" aria-label="Year">${opt('', 'All years', CP.year)}${years.map(y => opt(y, y, CP.year)).join('')}</select>
        ${papers.length > 1 ? `<select class="select" data-cp="paper" aria-label="Paper">${opt('', 'All papers', CP.paper)}${papers.map(p => opt(p, p, CP.paper)).join('')}</select>` : ''}
        <select class="select" data-cp="diff" aria-label="Difficulty">${opt('', 'Any difficulty', CP.diff)}${diffs.map(d => opt(d, d, CP.diff)).join('')}</select>
        <select class="select" data-cp="kind" aria-label="Question type">${opt('', 'Any type', CP.kind)}${kinds.map(([k, l]) => opt(k, l, CP.kind)).join('')}</select>
        ${markSets.length > 1 ? `<select class="select" data-cp="marks" aria-label="Marks">${opt('', 'Any marks', CP.marks)}${markSets.map(m => opt(m, m, CP.marks)).join('')}</select>` : ''}
        ${nBonus || nOos ? `<select class="select" data-cp="syl" aria-label="Syllabus">${[['', 'Any syllabus status'], ['in', 'In syllabus'], ['oos', 'Out of syllabus'], ['bonus', 'Bonus']].map(([v, l]) => opt(v, l, CP.syl)).join('')}</select>` : ''}
        ${tags.length ? `<select class="select" data-cp="tag" aria-label="Tag">${opt('', 'Any tag', CP.tag)}${tags.map(t => opt(t, t, CP.tag)).join('')}</select>` : ''}
        <select class="select" data-cp="status" aria-label="Status">${[['', 'Any status'], ['new', 'Unattempted'], ['ok', 'Correct'], ['bad', 'Wrong'], ['bookmarked', 'Bookmarked'], ['review', 'For review']].map(([v, l]) => opt(v, l, CP.status)).join('')}</select>
        <select class="select" data-cp="order" aria-label="Order">${opt('newest', 'Newest first', CP.order)}${opt('oldest', 'Oldest first', CP.order)}</select>
      </div>
      <div class="gstrip" id="cpGroups"></div>
      <div class="result-line"><span id="cpCount"></span><button class="btn ghost sm" data-act="cp-clear">Clear filters</button></div>
      <div id="cpList"></div>`);
    drawChapterMeta();
    drawChapterList();
  }

  function drawChapterMeta() {
    const qs = CP.qs;
    const done = qs.map(q => latestOf(q.id)).filter(Boolean);
    const wrong = done.filter(a => !a.correct).length;
    const avg = done.length ? fmtTime(done.reduce((s, a) => s + (Number(a.timeMs) || 0), 0) / done.length) : '—';
    $('#cpStats').innerHTML = [['Questions', qs.length], ['Attempted', done.length], ['Accuracy', done.length ? pct(done.length - wrong, done.length) + '%' : '—'], ['Avg time', avg]].map(rowStat).join('');
    $('#cpTabs').innerHTML = `
      <button class="tab ${CP.tab === 'all' ? 'active' : ''}" data-act="cp-tab" data-v="all">All questions<span class="n">${qs.length}</span></button>
      <button class="tab ${CP.tab === 'mistakes' ? 'active' : ''}" data-act="cp-tab" data-v="mistakes">Mistakes<span class="n">${wrong}</span></button>`;
  }

  // Everything except the group-chip selection.
  function chapterBase() {
    let list = CP.qs;
    if (CP.tab === 'mistakes') list = list.filter(q => { const a = latestOf(q.id); return a && !a.correct; });
    const s = CP.search.trim().toLowerCase();
    if (s) list = list.filter(q => searchText(q).includes(s));
    if (CP.year) list = list.filter(q => String(q.year) === CP.year);
    if (CP.paper) list = list.filter(q => q.paper === CP.paper);
    if (CP.diff) list = list.filter(q => q.diff === CP.diff);
    if (CP.kind) list = list.filter(q => q.kind === CP.kind);
    if (CP.marks) list = list.filter(q => marksLabel(q) === CP.marks);
    if (CP.syl) list = list.filter(q => (CP.syl === 'bonus' ? q.bonus : CP.syl === 'oos' ? q.oos : !q.oos));
    if (CP.tag) list = list.filter(q => q.tags.includes(CP.tag));
    if (CP.status) list = list.filter(q => statusMatch(q, CP.status));
    return ordered(list, CP.order);
  }

  function chapterFiltered() {
    const base = chapterBase();
    CP.baseCount = base.length;
    if (CP.group === 'none') { CP.groups = []; return base; }
    CP.groups = orderGroups(base, CP.group);
    if (CP.gsel && !CP.groups.some(g => g.label === CP.gsel)) CP.gsel = '';
    return (CP.gsel ? CP.groups.filter(g => g.label === CP.gsel) : CP.groups).flatMap(g => g.qs);
  }

  function statusMatch(q, st) {
    const a = latestOf(q.id);
    if (st === 'new') return !a;
    if (st === 'ok') return !!a && a.correct;
    if (st === 'bad') return !!a && !a.correct;
    if (st === 'bookmarked') return bookmarks.has(q.id);
    if (st === 'review') return reviews.has(q.id);
    return true;
  }

  function ordered(list, order) {
    const arr = [...list];
    if (order === 'random') {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    }
    const dir = order === 'oldest' ? 1 : -1;
    return arr.map((q, i) => [q, i]).sort((x, y) => dir * (x[0].sortKey - y[0].sortKey) || x[1] - y[1]).map(x => x[0]);
  }

  function qRow(q, i, hideTopic = false) {
    const a = latestOf(q.id);
    const st = a ? (a.correct ? ['ok', 'Correct'] : ['bad', 'Wrong']) : ['new', 'Unattempted'];
    const saved = bookmarks.has(q.id);
    return `<article class="qrow ${a ? (a.correct ? 'ok' : 'bad') : ''} ${q.oos ? 'is-oos' : ''}" data-act="open-q" data-id="${esc(q.id)}" tabindex="0" role="button">
      <div class="qnum">${i + 1}</div>
      <div class="qbody">
        <div class="qtext mj">${esc(previewText(q))}</div>
        <div class="qmeta">
          ${q.bonus ? '<span class="chip bonus">Bonus</span>' : ''}${q.oos ? '<span class="chip oos">Out of syllabus</span>' : ''}
          <span class="chip">${esc(q.year || 'Year n/a')}</span>
          ${paperShort(q) ? `<span class="chip">${esc(paperShort(q))}</span>` : ''}
          ${q.topic && !hideTopic ? `<span class="chip">${esc(q.topic)}</span>` : ''}
          <span class="chip ${q.diff.toLowerCase()}">${esc(q.diff)}</span>
          <span class="chip ${st[0]}">${st[1]}</span>
        </div>
      </div>
      <button class="icon-btn ${saved ? 'on' : ''}" data-act="bookmark" data-id="${esc(q.id)}" aria-label="${saved ? 'Remove bookmark' : 'Bookmark'}" aria-pressed="${saved}">${icon('star')}</button>
    </article>`;
  }

  function groupHead(label) {
    const g = CP.groups.find(x => x.label === label);
    if (!g) return '';
    const done = g.qs.map(q => latestOf(q.id)).filter(Boolean);
    const ok = done.filter(a => a.correct).length;
    return `<div class="ghead"><div><b>${esc(label)}</b><span>${plural(g.qs.length, 'question')}${done.length ? ` · ${done.length} done · ${pct(ok, done.length)}%` : ''}</span></div>
      <button class="btn ghost sm" data-act="cp-gpractice" data-g="${esc(label)}">${icon('play')} Practice</button></div>`;
  }

  // Question rows for filtered[start…], with a header whenever the group changes.
  function rowsHtml(slice, start) {
    const gk = CP.group === 'none' ? null : groupFn(CP.group);
    let prev = gk && start > 0 ? gk(CP.filtered[start - 1]) : undefined;
    return slice.map((q, i) => {
      let head = '';
      if (gk) { const g = gk(q); if (g !== prev) { head = groupHead(g); prev = g; } }
      return head + qRow(q, start + i, CP.group === 'topic');
    }).join('');
  }

  let listCtx = { qs: [], title: '', sourceKey: '' };

  function drawChapterList() {
    CP.filtered = chapterFiltered();
    listCtx = { qs: CP.filtered, title: CP.file.chapter, sourceKey: '' };
    const shown = CP.filtered.slice(0, CP.limit);
    const strip = $('#cpGroups');
    if (strip) {
      strip.innerHTML = CP.groups.length > 1
        ? `<button class="gchip ${CP.gsel === '' ? 'active' : ''}" data-act="cp-gsel" data-g="">All<span>${CP.baseCount}</span></button>`
          + CP.groups.map(g => `<button class="gchip ${CP.gsel === g.label ? 'active' : ''}" data-act="cp-gsel" data-g="${esc(g.label)}">${esc(g.label)}<span>${g.qs.length}</span></button>`).join('')
        : '';
    }
    $('#cpCount').textContent = CP.filtered.length === CP.qs.length || CP.tab === 'mistakes' && !CP.search
      ? plural(CP.filtered.length, 'question') : `${CP.filtered.length} of ${CP.qs.length} questions`;
    const list = $('#cpList');
    list.innerHTML = shown.length
      ? rowsHtml(shown, 0) + (CP.filtered.length > shown.length ? `<div style="text-align:center;margin-top:14px"><button class="btn" data-act="cp-more">Show ${Math.min(60, CP.filtered.length - shown.length)} more</button></div>` : '')
      : `<div class="empty"><strong>${CP.tab === 'mistakes' ? 'No mistakes here' : 'No questions match'}</strong><span>${CP.tab === 'mistakes' ? 'A question leaves this list once you get it right.' : 'Try clearing a filter.'}</span></div>`;
    hydrateIcons(list);
    observeMath(list);
  }

  /* ---- Custom practice builder ---- */
  const BUILD = { sel: new Set(), busy: false };

  function pickBtn(f) {
    const info = chapInfo(f), on = BUILD.sel.has(f.path);
    return `<button class="pick ${on ? 'on' : ''} ${info.allOos ? 'oos' : ''}" data-act="pick" data-path="${esc(f.path)}" aria-pressed="${on}">
      <span class="box">${icon('check')}</span><span class="name">${esc(f.chapter)}${info.allOos ? ' <i class="oos-tag">Out of syllabus</i>' : ''}</span><small>${f.count}</small></button>`;
  }

  function pageBuild() {
    const exam = app.exam;
    const subs = examSubjects(exam);
    for (const p of [...BUILD.sel]) if (data.byPath.get(p)?.exam !== exam) BUILD.sel.delete(p);
    setView(`
      <div class="page-head"><div>
        <div class="eyebrow">Custom practice · ${examName(exam)}</div>
        <h1>Build a session</h1>
        <p>Choose the chapters you want to mix. Then set the length and order.</p></div></div>
      ${subs.map(s => {
        const groups = groupFiles(inSyllabusFirst(filesFor(exam, s)));
        return `<section class="pick-group"><h3><span>${esc(s)}</span><button class="btn ghost sm" data-act="pick-subject" data-v="${esc(s)}">Select all / none</button></h3>
          ${groups.map(([g, files]) => `${groups.length > 1 || g !== 'Chapters' ? `<h4 class="group-title">${esc(g)}</h4>` : ''}<div class="grid cols-auto">${files.map(pickBtn).join('')}</div>`).join('')}</section>`;
      }).join('')}
      <div class="sticky-bar"><div id="buildSummary"></div><button class="btn primary" id="buildGo" data-act="build-go">Continue ${icon('right')}</button></div>`);
    drawBuildSummary();
  }

  function drawBuildSummary() {
    const sel = [...BUILD.sel].map(p => data.byPath.get(p)).filter(Boolean);
    const n = sel.reduce((s, f) => s + f.count, 0);
    const el = $('#buildSummary'), btn = $('#buildGo');
    if (!el) return;
    el.innerHTML = sel.length ? `<b>${plural(sel.length, 'chapter')}</b> <span class="muted">· ${plural(n, 'question')}</span>` : '<span class="muted">Select at least one chapter</span>';
    btn.disabled = !sel.length || BUILD.busy;
  }

  async function buildContinue() {
    const paths = [...BUILD.sel];
    if (!paths.length || BUILD.busy) return;
    BUILD.busy = true;
    const btn = $('#buildGo');
    try {
      const qs = await loadFiles(paths, (d, t) => { if (btn) btn.textContent = `Loading ${d}/${t}…`; });
      if (!qs.length) { toast('Could not load those chapters.'); return; }
      openSetup({ title: 'Custom practice', sourceKey: 'custom|' + app.exam + '|' + paths.slice().sort().join(','), pool: qs });
    } finally {
      BUILD.busy = false;
      if ($('#buildGo')) { $('#buildGo').innerHTML = `Continue ${icon('right')}`; drawBuildSummary(); }
    }
  }

  /* ---- Saved ---- */
  const SV = { tab: 'bookmarks', findingOld: false };

  async function pageSaved(token) {
    const exam = app.exam;
    const set = SV.tab === 'bookmarks' ? bookmarks : reviews;
    const ids = [...set];
    const { paths, missing } = filesForIds(ids);
    const need = paths.filter(p => data.byPath.get(p)?.exam === exam && !data.cache.has(p));
    if (need.length) {
      setView(`<div class="page-head"><div><div class="eyebrow">Saved</div><h1>Your saved questions</h1></div></div>${'<div class="skeleton"></div>'.repeat(3)}`);
      await loadFiles(need);
      if (token !== app.token) return;
    }
    const list = ids.map(id => data.byId.get(id)).filter(q => q && q.exam === exam);
    const unresolved = ids.filter(id => meta.m[id] == null).length;
    listCtx = { qs: list, title: SV.tab === 'bookmarks' ? 'Bookmarks' : 'Review later', sourceKey: `saved|${SV.tab}|${exam}` };
    setView(`
      <div class="page-head"><div>
        <div class="eyebrow">Saved · ${examName(exam)}</div><h1>Your saved questions</h1>
        <p>Bookmark questions to keep them handy, or flag them to review later.</p></div>
        <button class="btn primary" data-act="saved-practice" ${list.length ? '' : 'disabled'}>${icon('play')} Practice these</button></div>
      <div class="tabs">
        <button class="tab ${SV.tab === 'bookmarks' ? 'active' : ''}" data-act="sv-tab" data-v="bookmarks">Bookmarks<span class="n">${bookmarks.size}</span></button>
        <button class="tab ${SV.tab === 'review' ? 'active' : ''}" data-act="sv-tab" data-v="review">Review later<span class="n">${reviews.size}</span></button>
      </div>
      ${unresolved ? `<div class="notice"><span class="grow">${plural(unresolved, 'older saved question')} haven't been located yet.</span><button class="btn sm" data-act="find-old" ${SV.findingOld ? 'disabled' : ''}>${SV.findingOld ? 'Searching…' : 'Find them'}</button></div>` : ''}
      <div id="svList">${list.length ? list.map(qRow).join('') : `<div class="empty"><strong>Nothing here yet</strong><span>${SV.tab === 'bookmarks' ? 'Tap the star on any question to bookmark it.' : 'Use the flag button while practising to mark a question for review.'}</span></div>`}</div>`);
  }

  async function findOldSaved() {
    if (SV.findingOld) return;
    SV.findingOld = true;
    const btn = $('[data-act="find-old"]'); if (btn) btn.disabled = true;
    const todo = filesFor(app.exam).map(f => f.path).filter(p => !data.cache.has(p));
    await loadFiles(todo, (d, t) => { const b = $('[data-act="find-old"]'); if (b) b.textContent = `Searching ${d}/${t}…`; });
    SV.findingOld = false;
    route();
  }

  /* ---- Progress ---- */
  function pageProgress() {
    const exam = app.exam;
    if (statsDirty) rebuildStats();
    const mine = attempts.filter(a => attemptExam(a) === exam);
    const uniq = new Set(mine.map(a => String(a.questionId))).size;
    const acc = mine.length ? pct(mine.filter(a => a.correct).length, mine.length) : 0;
    const avg = mine.length ? fmtTime(mine.reduce((s, a) => s + (Number(a.timeMs) || 0), 0) / mine.length) : '—';
    const score = mine.reduce((s, a) => s + (Number.isFinite(Number(a.score)) ? Number(a.score) : 0), 0);

    const subjects = examSubjects(exam).map(s => ({ s, st: subjectStats(exam, s) }));
    const weak = filesFor(exam).map(f => ({ f, st: chapterStats(exam, f.subject, f.chapter) }))
      .filter(x => x.st.attempted >= 3).map(x => ({ ...x, acc: pct(x.st.correct, x.st.attempted) }))
      .filter(x => x.acc < 75).sort((a, b) => a.acc - b.acc).slice(0, 6);

    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ d, n: 0 }); }
    const startMs = days[0].d.getTime();
    attempts.forEach(a => { if (a.date >= startMs) { const idx = Math.floor((new Date(a.date).setHours(0, 0, 0, 0) - startMs) / 864e5); if (days[idx]) days[idx].n++; } });
    const maxDay = Math.max(1, ...days.map(d => d.n));
    const sessions = store.get(KEYS.sessions, []);
    const recent = (Array.isArray(sessions) ? sessions : []).slice(-8).reverse();

    setView(`
      <div class="page-head"><div><div class="eyebrow">Progress · ${examName(exam)}</div><h1>How you're doing</h1>
        <p>Accuracy, speed and the chapters that need more work.</p></div></div>
      ${mine.length ? '' : `<div class="empty" style="margin-bottom:18px"><strong>No attempts in ${examName(exam)} yet</strong><span>Solve a few questions and your stats will show up here.</span><a class="btn primary" href="${hrefs.build()}">Start practising</a></div>`}
      <div class="grid cols-4">${[['Questions attempted', uniq], ['Accuracy (all attempts)', mine.length ? acc + '%' : '—'], ['Avg time per question', avg], ['Total score', score]].map(rowStat).join('')}</div>
      <h2 class="section-title">By subject</h2>
      <div class="card row-bars">${subjects.map(({ s, st }) => `<div class="row-bar">
        <div class="top-line"><b>${esc(s)}</b><span class="muted">${st.attempted}/${st.questions} attempted${st.attempted ? ` · ${pct(st.correct, st.attempted)}% accuracy` : ''}</span></div>
        <div class="bar"><i class="g" style="width:${pct(st.correct, st.questions)}%"></i><i class="r" style="width:${pct(st.wrong, st.questions)}%"></i></div></div>`).join('')}</div>
      <h2 class="section-title">Last 14 days</h2>
      <div class="card"><div class="activity">${days.map(d => `<div class="col" title="${d.n} answered"><i style="height:${Math.max(3, Math.round(d.n / maxDay * 80))}px;opacity:${d.n ? 1 : .25}"></i><span>${d.d.getDate()}</span></div>`).join('')}</div></div>
      <div class="grid cols-2" style="margin-top:6px">
        <div><h2 class="section-title">Chapters to revisit</h2><div class="card">${weak.length ? weak.map(({ f, acc: a }) => `<a class="list-row" href="${hrefs.chapter(f.subject, f.chapter)}"><span><b>${esc(f.chapter)}</b><span class="muted">${esc(f.subject)}</span></span><span class="chip ${a < 50 ? 'bad' : 'warn'}">${a}%</span></a>`).join('') : '<span class="muted">Chapters with at least 3 answers and under 75% accuracy will appear here.</span>'}</div></div>
        <div><h2 class="section-title">Recent sessions</h2><div class="card">${recent.length ? recent.map(s => `<div class="list-row"><span><b>${esc(s.label || 'Practice')}</b><span class="muted">${fmtDate(s.date)}</span></span><span class="chip ${pct(s.correct, s.answered) >= 60 ? 'ok' : 'warn'}">${s.correct}/${s.answered}</span></div>`).join('') : '<span class="muted">Finish a session to see it here.</span>'}</div></div>
      </div>`);
  }

  /* ===================== Practice setup dialog ===================== */
  let SU = null;
  function openModal(html, onClose) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    root.hidden = false;
    root._onClose = onClose;
    hydrateIcons(root);
    const f = $('button, input, select', root.firstChild); f?.focus();
  }
  function closeModal() {
    const root = $('#modalRoot');
    if (root.hidden) return;
    root.hidden = true; root.innerHTML = '';
    root._onClose?.(); root._onClose = null;
    SU = null;
  }

  function suPool() {
    let list = SU.pool;
    if (SU.include === 'new') list = list.filter(q => !latestOf(q.id));
    if (SU.include === 'bad') list = list.filter(q => { const a = latestOf(q.id); return a && !a.correct; });
    if (SU.diff) list = list.filter(q => q.diff === SU.diff);
    if (SU.syl === 'in') list = list.filter(q => !q.oos);
    if (SU.syl === 'oos') list = list.filter(q => q.oos);
    if (SU.syl === 'bonus') list = list.filter(q => q.bonus);
    return list;
  }

  function openSetup({ title, sourceKey, pool }) {
    SU = { title, sourceKey, pool, include: 'all', diff: '', syl: '', order: prefs.order, length: prefs.length };
    drawSetup();
  }

  function drawSetup() {
    const root = $('#modalRoot');
    const counts = { all: SU.pool.length, new: SU.pool.filter(q => !latestOf(q.id)).length, bad: SU.pool.filter(q => { const a = latestOf(q.id); return a && !a.correct; }).length };
    const diffs = [...new Set(SU.pool.map(q => q.diff))].filter(d => d !== 'Unknown').sort((a, b) => ['Easy', 'Medium', 'Hard'].indexOf(a) - ['Easy', 'Medium', 'Hard'].indexOf(b));
    const avail = suPool();
    const n = avail.length;
    const eff = SU.length === 'all' ? n : Math.min(Number(SU.length) || 20, n);
    const years = avail.map(q => q.year).filter(Boolean);
    const saved = readActive();
    const hasSaved = saved && saved.sourceKey === SU.sourceKey && saved.exam === app.exam;
    const lens = [10, 20, 30, 50, 100].filter(v => v < n);
    const html = `
      <div class="modal-head"><div><div class="eyebrow">Practice setup</div><h2>${esc(SU.title)}</h2>
        <p>${plural(SU.pool.length, 'question')} available${years.length ? ` · ${Math.min(...years)}–${Math.max(...years)}` : ''}</p></div>
        <button class="icon-btn" data-act="close-modal" aria-label="Close">${icon('x')}</button></div>
      ${hasSaved ? `<div class="notice"><span class="grow"><b>Unfinished session</b><br><span class="muted">${Object.values(saved.answers || {}).filter(a => a.status).length} of ${saved.ids.length} answered</span></span>
        <button class="btn primary sm" data-act="resume">Resume</button></div>` : ''}
      <div class="field"><span class="label">Questions to include</span><div class="choices">
        ${[['all', 'All'], ['new', 'Unattempted'], ['bad', 'Previously wrong']].map(([v, l]) => `<button class="choice ${SU.include === v ? 'active' : ''}" data-act="su" data-k="include" data-v="${v}" ${counts[v] ? '' : 'disabled'}>${l} · ${counts[v]}</button>`).join('')}</div></div>
      ${diffs.length > 1 ? `<div class="field"><span class="label">Difficulty</span><div class="choices">
        <button class="choice ${SU.diff === '' ? 'active' : ''}" data-act="su" data-k="diff" data-v="">Any</button>
        ${diffs.map(d => `<button class="choice ${SU.diff === d ? 'active' : ''}" data-act="su" data-k="diff" data-v="${esc(d)}">${esc(d)} · ${SU.pool.filter(q => q.diff === d).length}</button>`).join('')}</div></div>` : ''}
      ${(() => {
        const c = { '': SU.pool.length, in: SU.pool.filter(q => !q.oos).length, oos: SU.pool.filter(q => q.oos).length, bonus: SU.pool.filter(q => q.bonus).length };
        if (!c.oos && !c.bonus) return '';
        return `<div class="field"><span class="label">Syllabus</span><div class="choices">${[['', 'All'], ['in', 'In syllabus'], ['oos', 'Out of syllabus'], ['bonus', 'Bonus']].filter(([v]) => v === '' || c[v])
          .map(([v, l]) => `<button class="choice ${SU.syl === v ? 'active' : ''}" data-act="su" data-k="syl" data-v="${v}">${l} · ${c[v]}</button>`).join('')}</div></div>`;
      })()}
      <div class="field"><span class="label">Session length</span><div class="choices">
        ${lens.map(v => `<button class="choice ${eff === v && SU.length !== 'all' ? 'active' : ''}" data-act="su" data-k="length" data-v="${v}">${v}</button>`).join('')}
        <button class="choice ${eff === n && (SU.length === 'all' || !lens.includes(eff)) ? 'active' : ''}" data-act="su" data-k="length" data-v="all" ${n ? '' : 'disabled'}>All · ${n}</button></div></div>
      <div class="field"><span class="label">Question order</span><div class="order-grid">
        ${[['newest', 'down', 'Newest first', 'Latest paper first'], ['oldest', 'up', 'Oldest first', 'Earliest paper first'], ['random', 'shuffle', 'Random', 'Shuffled']].map(([v, ic, l, s]) =>
          `<button class="order-card ${SU.order === v ? 'active' : ''}" data-act="su" data-k="order" data-v="${v}"><span class="i">${icon(ic)}</span><b>${l}</b><small>${s}</small></button>`).join('')}</div></div>
      <div class="modal-foot"><span class="muted">${hasSaved ? 'Starting a new session replaces the unfinished one.' : ''}</span>
        <button class="btn primary" data-act="su-start" ${n ? '' : 'disabled'}>Start ${plural(eff, 'question')} ${icon('right')}</button></div>`;
    if (root.hidden) openModal(html); else { root.firstChild.innerHTML = html; hydrateIcons(root); }
  }

  function startFromSetup() {
    if (!SU) return;
    const pool = suPool();
    if (!pool.length) return;
    prefs.order = SU.order; if (SU.length) prefs.length = SU.length; store.set(KEYS.prefs, prefs);
    let list = ordered(pool, SU.order);
    if (SU.length !== 'all') list = list.slice(0, Number(SU.length) || 20);
    const { title, sourceKey } = SU;
    closeModal();
    startSession({ title, sourceKey, qs: list });
  }

  function openShortcuts() {
    openModal(`<div class="modal-head"><div><h2>Keyboard shortcuts</h2><p>While practising</p></div><button class="icon-btn" data-act="close-modal" aria-label="Close">${icon('x')}</button></div>
      <div class="kbd-list">
        ${[['Select an option', '<kbd>1</kbd>–<kbd>5</kbd> or <kbd>A</kbd>–<kbd>E</kbd>'], ['Type a numerical answer', '<kbd>0</kbd>–<kbd>9</kbd>'], ['Submit / next question', '<kbd>Enter</kbd>'],
          ['Next / previous', '<kbd>→</kbd> <kbd>←</kbd>'], ['Show answer', '<kbd>S</kbd>'], ['Bookmark', '<kbd>M</kbd>'], ['Review later', '<kbd>R</kbd>'], ['Question list', '<kbd>G</kbd>'], ['Close dialogs', '<kbd>Esc</kbd>']]
          .map(([a, b]) => `<div class="kbd-row"><span>${a}</span><span>${b}</span></div>`).join('')}
      </div>`);
  }

  /* ===================== Practice session ===================== */
  let S = null;
  let tickTimer = null;

  const cur = () => S.qs[S.index];
  const ans = q => (S.answers[q.id] ||= { sel: [], val: '', status: '', spent: 0 });

  function readActive() {
    const a = store.get(KEYS.active, null);
    if (!a || !Array.isArray(a.ids) || !a.ids.length || !a.answers || typeof a.answers !== 'object') return null;
    return a;
  }
  function saveActive() {
    if (!S || S.ephemeral || S.finished) return;
    flushTime();
    store.set(KEYS.active, {
      v: 4, title: S.title, sourceKey: S.sourceKey, exam: S.exam, ids: S.ids,
      files: [...new Set(S.qs.map(q => q.file))], index: S.index, startedAt: S.startedAt, answers: S.answers
    });
  }
  function discardActive() { store.del(KEYS.active); }

  function flushTime() {
    if (!S || S.view !== 'question' || !S.tick) return;
    const e = ans(cur());
    const now = Date.now();
    if (!e.status) e.spent += now - S.tick;
    S.tick = document.hidden ? 0 : now;
  }

  function startSession({ title, sourceKey, qs, index = 0, ephemeral = false, answers = {}, startedAt }) {
    if (!qs.length) { toast('No questions to practise.'); return; }
    S = {
      title, sourceKey, qs, ids: qs.map(q => q.id), index: Math.max(0, Math.min(index, qs.length - 1)),
      ephemeral, answers, startedAt: startedAt || Date.now(), tick: 0, view: 'question',
      drawer: false, exam: app.exam, finished: false, pushed: false
    };
    if (!ephemeral) saveActive();
    if (parseRoute().name === 'session') { showPractice(); return; }
    S.pushed = true;
    location.hash = '#/session';
  }

  function showPractice() {
    const root = $('#practice');
    root.hidden = false;
    document.body.classList.add('in-session');
    document.body.style.overflow = 'hidden';
    if (S.view === 'question') S.tick = document.hidden ? 0 : Date.now();
    renderPractice();
    clearInterval(tickTimer);
    tickTimer = setInterval(updateTimer, 500);
  }

  function hidePractice() {
    if (!S) return;
    const answered = Object.values(S.answers).filter(a => a.status).length;
    if (S.view === 'question') saveActive();
    clearInterval(tickTimer);
    $('#practice').hidden = true;
    $('#practice').innerHTML = '';
    document.body.classList.remove('in-session');
    document.body.style.overflow = '';
    if (!S.ephemeral && !S.finished && answered) toast('Session saved — resume it from Home.');
    S = null;
  }

  function closePractice() {
    if (!S) return;
    if (S.pushed) history.back(); else location.hash = '#/';
  }

  function updateTimer() {
    if (!S || S.view !== 'question') return;
    const el = $('#pTimer'); if (!el) return;
    const e = ans(cur());
    el.textContent = fmtTime(e.spent + (!e.status && S.tick ? Date.now() - S.tick : 0));
  }

  const palClass = q => {
    const e = S.answers[q.id];
    if (!e) return '';
    if (e.status === 'submitted') return e.correct ? 's-ok' : 's-bad';
    if (e.status === 'revealed') return 's-rev';
    return (e.sel && e.sel.length) || String(e.val || '').trim() ? 's-sel' : '';
  };

  function renderPractice() {
    const root = $('#practice');
    if (S.view === 'summary') { renderSummary(root); return; }
    const q = cur(), e = ans(q), d = qd(q), opts = qOptions(q), n = S.qs.length;
    const locked = !!e.status;
    const answeredCount = Object.values(S.answers).filter(a => a.status).length;
    const correctIds = qCorrect(q);
    const explanation = d.explanation || langBlock(q.raw, 'en').explanation || '';
    const submitted = e.status === 'submitted';
    const saved = bookmarks.has(q.id), flagged = reviews.has(q.id);

    let result = '';
    if (submitted) {
      const shown = q.kind === 'number' ? qAnswer(q) : correctIds.join(', ');
      result = `<div class="result ${e.correct ? 'ok' : 'bad'}">
        <h3>${e.correct ? 'Correct' : 'Incorrect'} · ${e.score >= 0 ? '+' : '−'}${Math.abs(e.score)}</h3>
        <div>${q.kind === 'number' && !e.correct ? `Your answer: <b>${esc(e.val)}</b> · ` : ''}Correct answer: <b>${esc(shown)}</b> · Time ${fmtTime(e.spent)}</div>
        ${explanation ? `<div class="explain">${sanitize(explanation)}</div>` : ''}</div>`;
    } else if (e.status === 'revealed') {
      const shown = q.kind === 'number' ? qAnswer(q) : correctIds.join(', ');
      result = `<div class="result info"><h3>Answer revealed · not scored</h3>
        ${shown ? `<div>Correct answer: <b>${esc(shown)}</b></div>` : ''}
        ${explanation ? `<div class="explain">${sanitize(explanation)}</div>` : ''}</div>`;
    }

    const body = q.kind === 'number'
      ? `<input class="num-input" id="numInput" inputmode="decimal" autocomplete="off" placeholder="Your answer" value="${esc(e.val || '')}" ${locked ? 'disabled' : ''} aria-label="Your answer">`
      : `<div class="options" role="group" aria-label="Options">${opts.map(o => {
        const sel = (e.sel || []).includes(o.id);
        const right = locked && correctIds.includes(o.id);
        const wrong = submitted && sel && !correctIds.includes(o.id);
        return `<button class="opt ${sel && !locked ? 'sel' : ''} ${right ? 'right' : ''} ${wrong ? 'wrong' : ''}" data-act="p-opt" data-id="${esc(o.id)}" ${locked ? 'disabled' : ''}>
          <span class="key">${esc(o.id)}</span><span class="txt">${sanitize(o.html)}</span></button>`;
      }).join('')}</div>`;

    const callouts = (q.bonus ? '<div class="callout bonus-note"><b>Bonus question</b> — marked as bonus by the exam authority.</div>' : '')
      + (q.oos ? '<div class="callout oos-note"><b>Out of syllabus</b> — this question is outside the current syllabus.</div>' : '')
      + [d.direction, d.comprehension].filter(Boolean).map(h => `<div class="callout">${sanitize(h)}</div>`).join('');
    const canSubmit = q.kind === 'number' ? String(e.val || '').trim() !== '' : (e.sel || []).length > 0;
    const last = S.index === n - 1;

    root.innerHTML = `
      <header class="p-head">
        <button class="icon-btn" data-act="p-close" aria-label="Save and exit">${icon('left')}</button>
        <div class="p-title"><b>${esc(S.title)}</b><small>${esc(q.subject)} · ${esc(q.chapter)}</small></div>
        <span class="p-count">${S.index + 1} / ${n}</span>
        ${hasHindi(q) ? `<button class="btn sm ghost" data-act="p-lang" title="Language">${lang === 'hi' ? 'EN' : 'हिं'}</button>` : ''}
        <button class="icon-btn" data-act="p-drawer" aria-label="All questions (G)">${icon('grid')}</button>
        <button class="btn sm" data-act="p-end">End</button>
      </header>
      <div class="p-progress"><i style="width:${pct(answeredCount, n)}%"></i></div>
      <div class="p-scroll" id="pScroll"><main class="p-main" id="pMain">
        <div class="p-badges">
          ${q.bonus ? '<span class="chip bonus">Bonus</span>' : ''}${q.oos ? '<span class="chip oos">Out of syllabus</span>' : ''}
          <span class="chip new">${esc(examName(q.exam))}</span><span class="chip">${esc(q.year || 'Year n/a')}</span>
          ${q.topic ? `<span class="chip">${esc(q.topic)}</span>` : ''}
          <span class="chip ${q.diff.toLowerCase()}">${esc(q.diff)}</span>
          ${paperShort(q) ? `<span class="chip">${esc(paperShort(q))}</span>` : ''}
        </div>
        <div class="p-status"><span class="timer" id="pTimer">${fmtTime(e.spent)}</span><span class="plus">+${q.marks}</span><span class="minus">−${q.neg}</span>
          <span class="hint">${q.kind === 'multi' ? 'One or more options can be correct' : q.kind === 'number' ? 'Type your numerical answer' : 'Single correct option'}</span></div>
        ${callouts}
        <div class="prompt" id="pPrompt">${sanitize(d.content || 'Question text unavailable.')}</div>
        ${body}
        ${result}
      </main></div>
      <footer class="p-foot">
        <button class="btn" data-act="p-prev" ${S.index === 0 ? 'disabled' : ''} aria-label="Previous question">${icon('left')}<span class="lbl">Previous</span></button>
        <button class="icon-btn ${saved ? 'on' : ''}" data-act="p-bm" data-id="${esc(q.id)}" aria-label="Bookmark (M)" aria-pressed="${saved}">${icon('star')}</button>
        <button class="icon-btn flag ${flagged ? 'on' : ''}" data-act="p-review" aria-label="Review later (R)" aria-pressed="${flagged}">${icon('flag')}</button>
        <button class="btn show" data-act="p-show" ${locked ? 'disabled' : ''}>${icon('eye')}<span class="lbl">Show answer</span></button>
        <span class="spacer"></span>
        ${locked
          ? `<button class="btn primary" data-act="p-next">${last ? 'Finish' : 'Next'} ${icon('right')}</button>`
          : `<button class="btn" data-act="p-next" aria-label="Skip question"><span class="lbl">${last ? 'Finish' : 'Skip'}</span>${icon('right')}</button>
             <button class="btn primary" id="pSubmit" data-act="p-submit" ${canSubmit ? '' : 'disabled'}>Submit</button>`}
      </footer>
      <div class="drawer" id="pDrawer" ${S.drawer ? '' : 'hidden'} data-act="p-drawer-bg">
        <div class="drawer-panel">
          <div style="display:flex;justify-content:space-between;align-items:center"><h2>Questions</h2><button class="icon-btn" data-act="p-drawer" aria-label="Close">${icon('x')}</button></div>
          <div class="muted">${answeredCount} of ${n} answered</div>
          <div class="legend"><span><i style="background:var(--green)"></i>Correct</span><span><i style="background:var(--red)"></i>Wrong</span><span><i style="background:var(--amber)"></i>Revealed</span><span><i style="background:var(--blue)"></i>Picked</span><span><i style="background:var(--surface-3)"></i>Not answered</span></div>
          <div class="pal">${S.qs.map((x, i) => `<button class="${palClass(x)} ${i === S.index ? 'cur' : ''} ${x.bonus ? 'bonus' : ''}" data-act="p-go" data-i="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`).join('')}</div>
        </div>
      </div>`;
    hydrateIcons(root);
    typesetReveal($('#pMain'));
    if (submitted || e.status === 'revealed') requestAnimationFrame(() => $('.result')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    else $('#pScroll').scrollTop = 0;
  }

  function updateSubmit() {
    const q = cur(), e = ans(q), btn = $('#pSubmit');
    if (!btn) return;
    btn.disabled = q.kind === 'number' ? String(e.val || '').trim() === '' : !(e.sel || []).length;
  }

  function pickOption(id) {
    const q = cur(), e = ans(q);
    if (e.status || q.kind === 'number') return;
    if (q.kind === 'multi') e.sel = e.sel.includes(id) ? e.sel.filter(x => x !== id) : [...e.sel, id];
    else e.sel = [id];
    $$('.opt').forEach(b => b.classList.toggle('sel', e.sel.includes(b.dataset.id)));
    updateSubmit();
    saveActive();
  }

  function submitAnswer() {
    const q = cur(), e = ans(q);
    if (e.status) return;
    if (q.kind === 'number') { const inp = $('#numInput'); if (inp) e.val = inp.value; if (!String(e.val || '').trim()) return; }
    else if (!(e.sel || []).length) return;
    flushTime();
    const g = gradeAnswer(q, e);
    if (!g.gradable) { e.status = 'revealed'; }
    else { e.status = 'submitted'; e.correct = g.correct; e.score = g.score; recordAttempt(q, e); }
    S.tick = 0;
    saveActive();
    renderPractice();
  }

  function revealAnswer() {
    const q = cur(), e = ans(q);
    if (e.status) return;
    flushTime();
    e.status = 'revealed';
    S.tick = 0;
    saveActive();
    renderPractice();
  }

  function goTo(i) {
    if (!S || i < 0 || i >= S.qs.length) return;
    if (S.view === 'question') flushTime();
    S.view = 'question';
    S.index = i;
    S.drawer = false;
    S.tick = document.hidden ? 0 : Date.now();
    saveActive();
    renderPractice();
  }
  const nextQ = () => { if (S.index >= S.qs.length - 1) finishSession(); else goTo(S.index + 1); };
  const prevQ = () => { if (S.index > 0) goTo(S.index - 1); };

  function toggleSaved(kind, id) {
    const set = kind === 'bookmark' ? bookmarks : reviews;
    const key = kind === 'bookmark' ? KEYS.bookmarks : KEYS.review;
    const had = set.has(id);
    if (had) set.delete(id); else set.add(id);
    store.set(key, [...set]);
    toast(had ? (kind === 'bookmark' ? 'Bookmark removed' : 'Removed from review') : (kind === 'bookmark' ? 'Bookmarked' : 'Marked for review'));
    const on = !had;
    if (kind === 'bookmark') {
      $$(`[data-act="bookmark"][data-id="${CSS.escape(id)}"], [data-act="p-bm"][data-id="${CSS.escape(id)}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    } else if (S && S.view === 'question' && cur().id === id) {
      $('[data-act="p-review"]')?.classList.toggle('on', on);
    }
    if (!S && parseRoute().name === 'saved' && SV.tab === (kind === 'bookmark' ? 'bookmarks' : 'review') && had) {
      $(`.qrow[data-id="${CSS.escape(id)}"]`)?.remove();
      listCtx.qs = listCtx.qs.filter(q => q.id !== id);
      const tabN = $(`.tab[data-v="${SV.tab}"] .n`); if (tabN) tabN.textContent = set.size;
      if (!listCtx.qs.length) pageSaved(++app.token);
    }
  }

  function finishSession() {
    flushTime();
    const answers = Object.values(S.answers);
    const done = answers.filter(a => a.status === 'submitted');
    const correct = done.filter(a => a.correct).length;
    if (!S.finished) {
      S.finished = true;
      if (done.length) {
        const list = store.get(KEYS.sessions, []);
        const arr = Array.isArray(list) ? list : [];
        arr.push({
          date: Date.now(), total: S.qs.length, answered: done.length, correct,
          score: done.reduce((s, a) => s + (Number(a.score) || 0), 0), label: S.title, exam: S.exam,
          timeMs: done.reduce((s, a) => s + a.spent, 0)
        });
        store.set(KEYS.sessions, arr.slice(-200));
      }
      if (!S.ephemeral) discardActive();
    }
    S.view = 'summary';
    S.drawer = false;
    renderPractice();
  }

  function renderSummary(root) {
    const entries = S.qs.map(q => ({ q, e: S.answers[q.id] }));
    const done = entries.filter(x => x.e?.status === 'submitted');
    const right = done.filter(x => x.e.correct).length;
    const wrong = done.length - right;
    const skipped = S.qs.length - done.length;
    const score = done.reduce((s, x) => s + (Number(x.e.score) || 0), 0);
    const time = done.reduce((s, x) => s + x.e.spent, 0);
    const wrongQs = done.filter(x => !x.e.correct).map(x => x.q);
    root.innerHTML = `
      <header class="p-head"><button class="icon-btn" data-act="p-close" aria-label="Close">${icon('left')}</button>
        <div class="p-title"><b>${esc(S.title)}</b><small>Session summary</small></div></header>
      <div class="p-scroll"><div class="summary">
        <div class="eyebrow">Session complete</div>
        <div class="big">${done.length ? pct(right, done.length) + '%' : '—'}</div>
        <div class="muted">${done.length ? `${right} of ${done.length} answered correctly` : 'You did not submit any answers'}</div>
        <div class="grid cols-2">${[['Score', score], ['Time spent', fmtTime(time)], ['Wrong', wrong], ['Not answered', skipped]].map(rowStat).join('')}</div>
        <div class="muted" style="text-align:left;margin-bottom:8px">Tap a number to review that question</div>
        <div class="pal" style="margin-bottom:26px">${S.qs.map((x, i) => `<button class="${palClass(x)}" data-act="p-go" data-i="${i}">${i + 1}</button>`).join('')}</div>
        <div class="actions">
          ${wrongQs.length ? `<button class="btn" data-act="p-retry-wrong" data-ids="${esc(wrongQs.map(q => q.id).join(','))}">${icon('retry')} Retry ${plural(wrongQs.length, 'mistake')}</button>` : ''}
          <button class="btn primary" data-act="p-close">Done</button>
        </div>
      </div></div>`;
    hydrateIcons(root);
  }

  async function resumeActive() {
    const a = readActive();
    if (!a) return;
    closeModal();
    if (a.exam && a.exam !== app.exam) { app.exam = a.exam; store.set(KEYS.exam, a.exam); }
    await loadFiles((a.files || []).filter(p => data.byPath.has(p)));
    const qs = a.ids.map(id => data.byId.get(String(id))).filter(Boolean);
    if (!qs.length) { discardActive(); toast('Could not restore that session.'); route(); return; }
    startSession({ title: a.title, sourceKey: a.sourceKey, qs, index: Math.min(a.index || 0, qs.length - 1), answers: a.answers, startedAt: a.startedAt });
  }

  async function practiceMistakes() {
    const ids = wrongIds(app.exam);
    const { paths } = filesForIds(ids);
    await loadFiles(paths.filter(p => data.byPath.get(p).exam === app.exam));
    const pool = ids.map(id => data.byId.get(id)).filter(q => q && q.exam === app.exam);
    if (!pool.length) { toast('No mistakes to retry.'); return; }
    openSetup({ title: 'Retry mistakes', sourceKey: `mistakes|${app.exam}`, pool });
  }

  /* ===================== Events ===================== */
  function setTheme(next) {
    document.documentElement.dataset.theme = next;
    store.set(KEYS.theme, next);
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = next === 'light' ? '#f4f3fb' : '#0d0b1f';
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'p-drawer-bg' && e.target !== t) return; // only the dim backdrop itself closes the drawer
    switch (act) {
      case 'exam': switchExam(t.dataset.v); break;
      case 'theme': setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); break;
      case 'shortcuts': openShortcuts(); break;
      case 'close-modal': closeModal(); break;
      case 'retry-route': route(); break;
      case 'resume': resumeActive(); break;
      case 'discard-active': discardActive(); route(); toast('Unfinished session discarded.'); break;
      case 'practice-mistakes': practiceMistakes(); break;
      case 'chapter-practice': if (CP) openSetup({ title: CP.file.chapter, sourceKey: `chapter|${app.exam}|${CP.file.path}`, pool: CP.qs }); break;
      case 'cp-tab': CP.tab = t.dataset.v; CP.limit = 60; drawChapterMeta(); drawChapterList(); break;
      case 'cp-clear': Object.assign(CP, { search: '', year: '', diff: '', kind: '', status: '', paper: '', marks: '', syl: '', tag: '', gsel: '', limit: 60 }); drawChapter(); break;
      case 'cp-gsel': CP.gsel = t.dataset.g; CP.limit = 60; drawChapterList(); break;
      case 'cp-gpractice': {
        const g = CP.groups.find(x => x.label === t.dataset.g);
        if (g) openSetup({ title: `${CP.file.chapter} · ${g.label}`, sourceKey: `chapter|${app.exam}|${CP.file.path}|${CP.group}|${g.label}`, pool: g.qs });
        break;
      }
      case 'cp-more': {
        const before = Math.min(CP.limit, CP.filtered.length);
        CP.limit += 60;
        const rows = CP.filtered.slice(before, CP.limit);
        const list = $('#cpList');
        t.parentElement.remove();
        list.insertAdjacentHTML('beforeend', rowsHtml(rows, before) + (CP.filtered.length > CP.limit ? `<div style="text-align:center;margin-top:14px"><button class="btn" data-act="cp-more">Show ${Math.min(60, CP.filtered.length - CP.limit)} more</button></div>` : ''));
        hydrateIcons(list); observeMath(list);
        break;
      }
      case 'open-q': {
        const idx = listCtx.qs.findIndex(q => q.id === t.dataset.id);
        if (idx >= 0) startSession({ title: listCtx.title || 'Practice', sourceKey: '', qs: listCtx.qs, index: idx, ephemeral: true });
        break;
      }
      case 'bookmark': e.stopPropagation(); toggleSaved('bookmark', t.dataset.id); break;
      case 'pick': {
        const p = t.dataset.path;
        if (BUILD.sel.has(p)) BUILD.sel.delete(p); else BUILD.sel.add(p);
        t.classList.toggle('on', BUILD.sel.has(p)); t.setAttribute('aria-pressed', String(BUILD.sel.has(p)));
        drawBuildSummary(); break;
      }
      case 'pick-subject': {
        const files = filesFor(app.exam, t.dataset.v);
        const wanted = files.filter(f => !chapInfo(f).allOos);          // "select all" skips out-of-syllabus chapters
        const target = wanted.length ? wanted : files;
        const all = target.every(f => BUILD.sel.has(f.path));
        if (all) files.forEach(f => BUILD.sel.delete(f.path)); else target.forEach(f => BUILD.sel.add(f.path));
        $$('.pick', t.closest('.pick-group')).forEach(b => { const on = BUILD.sel.has(b.dataset.path); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        drawBuildSummary(); break;
      }
      case 'build-go': buildContinue(); break;
      case 'sv-tab': SV.tab = t.dataset.v; pageSaved(++app.token); break;
      case 'saved-practice': if (listCtx.qs.length) openSetup({ title: listCtx.title, sourceKey: listCtx.sourceKey, pool: listCtx.qs }); break;
      case 'find-old': findOldSaved(); break;
      case 'su': {
        const { k, v } = t.dataset;
        SU[k] = k === 'length' && v !== 'all' ? Number(v) : v;
        drawSetup(); break;
      }
      case 'su-start': startFromSetup(); break;
      /* practice */
      case 'p-close': closePractice(); break;
      case 'p-opt': pickOption(t.dataset.id); break;
      case 'p-submit': submitAnswer(); break;
      case 'p-show': revealAnswer(); break;
      case 'p-next': nextQ(); break;
      case 'p-prev': prevQ(); break;
      case 'p-go': goTo(Number(t.dataset.i)); break;
      case 'p-bm': toggleSaved('bookmark', cur().id); break;
      case 'p-review': toggleSaved('review', cur().id); break;
      case 'p-end': finishSession(); break;
      case 'p-lang': lang = lang === 'hi' ? 'en' : 'hi'; store.set(KEYS.lang, lang); flushTime(); renderPractice(); break;
      case 'p-drawer': case 'p-drawer-bg': S.drawer = !S.drawer; $('#pDrawer').hidden = !S.drawer; break;
      case 'p-retry-wrong': {
        const ids = (t.dataset.ids || '').split(',');
        const qs = ids.map(id => data.byId.get(id)).filter(Boolean);
        S.finished = true;
        startSession({ title: 'Retry mistakes', sourceKey: '', qs, ephemeral: true });
        break;
      }
    }
  });

  const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const onSearch = debounce(v => { CP.search = v; CP.limit = 60; drawChapterList(); });
  const onLibSearch = debounce(v => { LIB.q = v; renderChapterGrid(); });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'cpSearch' && CP) onSearch(t.value);
    else if (t.id === 'libSearch') onLibSearch(t.value);
    else if (t.id === 'numInput' && S) { ans(cur()).val = t.value; updateSubmit(); saveActive(); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset?.cp && CP) {
      CP[t.dataset.cp] = t.value; CP.limit = 60;
      if (t.dataset.cp === 'group') { CP.gsel = ''; prefs.group = t.value; store.set(KEYS.prefs, prefs); }
      drawChapterList();
    }
    else if (t.id === 'libFilter') { LIB.filter = t.value; renderChapterGrid(); }
    else if (t.id === 'libSort') { LIB.sort = t.value; renderChapterGrid(); }
  });

  document.addEventListener('keydown', e => {
    const modalOpen = !$('#modalRoot').hidden;
    if (e.key === 'Escape') {
      if (modalOpen) { closeModal(); e.preventDefault(); }
      else if (S?.drawer) { S.drawer = false; $('#pDrawer').hidden = true; e.preventDefault(); }
      return;
    }
    if (modalOpen) {
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = $$('button:not(:disabled), input, select', $('#modalRoot'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    const t = e.target;
    if (!S) {
      if ((e.key === 'Enter' || e.key === ' ') && t.classList?.contains('qrow')) { e.preventDefault(); t.click(); }
      if (e.key === '?' && !/input|textarea|select/i.test(t.tagName)) openShortcuts();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // never hijack browser shortcuts (Ctrl+R, Ctrl+F, …)
    const typing = t instanceof HTMLElement && (t.matches('input, textarea, select') || t.isContentEditable);
    if (typing) {
      if (e.key === 'Enter' && t.id === 'numInput') { e.preventDefault(); const q = cur(); if (ans(q).status) nextQ(); else submitAnswer(); }
      return;
    }
    const interactive = t instanceof HTMLElement && t.closest('button, a');
    if (S.view === 'summary') return;
    const q = cur(), en = ans(q);
    const key = e.key.toLowerCase();
    if (e.key === 'Enter') {
      if (interactive) return; // Enter on a focused button just presses that button
      e.preventDefault(); if (en.status) nextQ(); else submitAnswer(); return;
    }
    if (e.key === 'ArrowRight' || key === 'n') { e.preventDefault(); nextQ(); }
    else if (e.key === 'ArrowLeft' || key === 'p') { e.preventDefault(); prevQ(); }
    else if (key === 'm') { e.preventDefault(); toggleSaved('bookmark', q.id); }
    else if (key === 'r') { e.preventDefault(); toggleSaved('review', q.id); }
    else if (key === 's') { e.preventDefault(); revealAnswer(); }
    else if (key === 'g') { e.preventDefault(); S.drawer = !S.drawer; $('#pDrawer').hidden = !S.drawer; }
    else if (e.key === '?') { openShortcuts(); }
    else if (q.kind === 'number' && !en.status && /^[0-9.\-]$/.test(e.key)) {
      const inp = $('#numInput'); if (inp) { e.preventDefault(); inp.focus(); inp.setRangeText(e.key, inp.selectionStart ?? inp.value.length, inp.selectionEnd ?? inp.value.length, 'end'); inp.dispatchEvent(new Event('input', { bubbles: true })); }
    } else if (q.kind !== 'number' && !en.status) {
      let idx = -1;
      if (/^[1-9]$/.test(e.key)) idx = Number(e.key) - 1;
      else if (/^[a-e]$/.test(key)) idx = key.charCodeAt(0) - 97;
      const btn = $$('.opt')[idx];
      if (btn) { e.preventDefault(); pickOption(btn.dataset.id); }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!S || S.view !== 'question') return;
    if (document.hidden) { flushTime(); S.tick = 0; saveActive(); }
    else S.tick = Date.now();
  });
  window.addEventListener('pagehide', () => { if (S) saveActive(); });
  window.addEventListener('hashchange', route);
  $('#modalRoot').addEventListener('mousedown', e => { if (e.target.id === 'modalRoot') closeModal(); });

  /* ===================== Boot ===================== */
  function hideSplash() {
    const s = $('#splash');
    if (!s) return;
    s.classList.add('out');
    setTimeout(() => s.remove(), 300);
  }

  async function boot() {
    loadStorage();
    hydrateIcons();
    try {
      await loadManifest();
    } catch (err) {
      console.error(err);
      hideSplash();
      setView(`<div class="empty"><strong>Couldn't load the question library</strong><span>${esc(err.message)}. Make sure the <code>questions/</code> folder is next to index.html, and that you're opening the app through a web server.</span><button class="btn primary" onclick="location.reload()">Try again</button></div>`);
      return;
    }
    if (!examSubjects(app.exam).length) app.exam = app.exam === 'jee-main' ? 'jee-advanced' : 'jee-main';
    route();
    hideSplash();
    (window.requestIdleCallback || (f => setTimeout(f, 400)))(() => migrateLegacyAttempts().catch(() => {}));
  }

  /* Bridge for teacher.js (kept separate so this file stays focused on the student experience). */
  window.JW = {
    $, $$, esc, icon, hydrateIcons, toast, plural, titleCase, pct, store, app, data, SUBJECTS, examName, examSubjects,
    filesFor, chapInfo, loadFiles, filesForIds, qd, qOptions, qCorrect, qAnswer, langBlock, hasHindi, sanitize, plainText,
    previewText, searchText, paperShort, setView, ordered, latestOf, openModal, closeModal, observeMath, typeset,
    isCurrent: token => token === app.token,
    bookmarks: () => bookmarks, reviews: () => reviews, wrongIds: () => wrongIds(app.exam),
    getLang: () => lang, byId: id => data.byId.get(String(id))
  };

  boot();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}), { once: true });
  }
})();
