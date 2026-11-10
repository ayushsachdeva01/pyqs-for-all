/* JEEwise — Exam mode.
   · Full-length papers (grouped by paperId) in a real CBT-style interface: timer, subject tabs, sections,
     question palette with the five NTA statuses, optional strict mode (full screen + proctoring rules).
   · Paper maker: custom JEE Main-pattern, JEE Advanced-style (random) or your own counts, from any chapters/difficulty.
   · Results, per-question review, saved papers. Everything stays in this browser.
   Needs exam-index.json (built by build_question_manifest.py) for speed; without it the app builds the list itself. */
(() => {
  'use strict';
  const JW = window.JW;
  if (!JW) return;
  const { $, $$, esc, icon, hydrateIcons, toast, plural, store, app, data } = JW;

  const K = { active: 'jewise_exam_active_v1', results: 'jewise_exam_results_v1', papers: 'jewise_exam_papers_v1', cfg: 'jewise_exam_cfg_v1' };
  const SUBJ = JW.SUBJECTS;
  const MAIN = 'jee-main', ADV = 'jee-advanced';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  const clock = ms => { let s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60; return [h, m, s].map(v => String(v).padStart(2, '0')).join(':'); };
  const nice = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const examLabel = e => (e === ADV ? 'JEE Advanced' : e === MAIN ? 'JEE Main' : 'Custom');
  const cfgDef = { name: '', strict: false, fs: true, maxViol: 3, lang: '' };
  const cfg = { ...cfgDef, ...(store.get(K.cfg, {}) || {}) };
  const saveCfg = () => store.set(K.cfg, cfg);

  /* ===================== Question kinds, sections, marking ===================== */
  const KIND = { s: 'Single correct', m: 'One or more correct', x: 'Matrix match', n: 'Numerical value' };
  const secOfKind = k => (k === 'n' ? 'num' : 'mcq');
  function kindCode(q) {
    if (q.kind === 'number') return 'n';
    if (/matrix|match/i.test(`${q.raw.type || ''} ${q.raw.questionType || ''}`)) return 'x';
    return q.kind === 'multi' ? 'm' : 's';
  }
  const secName = (key, pattern) => (key === 'num' ? 'Numerical value' : pattern === 'main' ? 'Single correct (MCQ)' : 'Single / Multiple correct / Matrix match');

  // info = { k: s|m|x|n, exam, marks (-1 = not in data), neg (-1 = not in data) }
  function markOf(info, pattern) {
    const k = info.k;
    if (pattern === 'main') return { plus: 4, minus: k === 'n' ? 0 : 1, partial: false };
    const adv = info.exam === ADV;
    const plus = info.marks >= 0 ? info.marks : (adv ? (k === 's' || k === 'x' ? 3 : 4) : 4);
    const minus = info.neg >= 0 ? info.neg : (k === 'n' ? 0 : adv && k === 'm' ? 2 : 1);
    return { plus, minus, partial: adv && k === 'm' };
  }
  const infoOfQ = q => ({
    k: kindCode(q), exam: q.exam,
    marks: q.raw.marks != null && q.raw.marks !== '' && Number.isFinite(Number(q.raw.marks)) ? Number(q.raw.marks) : -1,
    neg: q.raw.negMarks != null && q.raw.negMarks !== '' && Number.isFinite(Number(q.raw.negMarks)) ? Math.abs(Number(q.raw.negMarks)) : -1
  });
  const infoOfRow = r => ({ k: r.kind, exam: r.exam, marks: r.marks, neg: r.neg });
  const fmtN = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

  const hasAnswer = (q, a) => (q.kind === 'number' ? String(a.val ?? '').trim() !== '' : (a.sel || []).length > 0);

  function grade(q, a, E) {
    const mk = markOf(infoOfQ(q), E.pattern);
    if (q.bonus) return { res: 'b', score: mk.plus, mk };
    if (!hasAnswer(q, a)) return { res: 'u', score: 0, mk };
    if (q.kind === 'number') {
      const expected = JW.qAnswer(q);
      if (!expected) return { res: 'u', score: 0, mk, ungradable: true };
      const typed = String(a.val).trim(), num = Number(typed.replace(/,/g, ''));
      let ok = false;
      const range = expected.match(/^(-?\d+(?:\.\d+)?)\s*(?:to|-)\s*(-?\d+(?:\.\d+)?)$/i);
      if (range && Number.isFinite(num)) { const lo = Math.min(+range[1], +range[2]), hi = Math.max(+range[1], +range[2]); ok = num >= lo - 1e-9 && num <= hi + 1e-9; }
      else if (Number.isFinite(num) && Number.isFinite(Number(expected))) { const t = Number(expected); ok = Math.abs(num - t) <= Math.max(1e-6, Math.abs(t) * 1e-6); }
      else ok = typed.toLowerCase() === expected.toLowerCase();
      return ok ? { res: 'c', score: mk.plus, mk } : { res: 'w', score: -mk.minus, mk };
    }
    const right = JW.qCorrect(q).slice().sort(), got = (a.sel || []).map(String).sort();
    if (!right.length) return { res: 'u', score: 0, mk, ungradable: true };
    if (got.length === right.length && got.every((v, i) => v === right[i])) return { res: 'c', score: mk.plus, mk };
    if (mk.partial && got.every(g => right.includes(g))) return { res: 'p', score: Math.round((mk.plus / 4) * got.length * 100) / 100, mk };
    return { res: 'w', score: -mk.minus, mk };
  }

  /* ===================== Question index (rows, no text) ===================== */
  const X = { ready: null, rows: [], papers: new Map(), paperRows: new Map(), derived: false, pending: null, run: null, status: null };

  async function deriveRows(onStatus) {
    // No exam-index.json: load every chapter once (saved on this device afterwards) and read the index from the questions.
    onStatus?.('Building the paper list from your question files (one-time). Run build_question_manifest.py to skip this.');
    const paths = data.files.map(f => f.path);
    await JW.loadFiles(paths, (d, n) => onStatus?.(`Reading question files… ${d}/${n}`));
    const papers = new Map(), rows = [];
    for (const f of data.files) {
      for (const q of data.cache.get(f.path) || []) {
        const pid = q.paperId || q.paper || '';
        if (pid && !papers.has(pid)) papers.set(pid, { id: pid, title: q.paper || pid, exam: q.exam, year: q.year, key: q.sortKey });
        rows.push({
          id: q.id, f, path: f.path, subject: f.subject, chapter: f.chapter, exam: q.exam, paper: papers.get(pid) || null, kind: kindCode(q),
          diff: q.diff, marks: infoOfQ(q).marks, neg: infoOfQ(q).neg, topic: q.topic, oos: q.oos, bonus: q.bonus
        });
      }
    }
    X.derived = true;
    return { rows, papers };
  }

  function ensureIndex(onStatus) {
    return (X.ready ||= (async () => {
      const raw = await JW.loadIndex();
      let rows, papers;
      if (raw && Array.isArray(raw.rows)) {
        const byI = new Map(data.files.map(f => [f._i, f]));
        const plist = (raw.papers || []).map(p => ({ id: p.id, title: p.t, exam: p.e, year: p.y, key: p.k }));
        papers = new Map(plist.map(p => [p.id, p]));
        rows = [];
        for (const r of raw.rows) {
          const f = byI.get(r[1]); if (!f) continue;
          const p = r[2] >= 0 ? plist[r[2]] : null;
          rows.push({ id: String(r[0]), f, path: f.path, subject: f.subject, chapter: f.chapter, exam: (p && p.exam) || f.exam, paper: p, kind: r[3],
            diff: raw.diffs[r[4]] || 'Unknown', marks: r[5], neg: r[6], topic: raw.topics[r[7]] || '', oos: !!(r[8] & 1), bonus: !!(r[8] & 2) });
        }
      } else ({ rows, papers } = await deriveRows(onStatus));
      X.rows = rows; X.papers = papers; X.paperRows = new Map();
      for (const r of rows) if (r.paper) { if (!X.paperRows.has(r.paper.id)) X.paperRows.set(r.paper.id, []); X.paperRows.get(r.paper.id).push(r); }
      return rows;
    })().catch(err => { X.ready = null; throw err; }));
  }

  /* ===================== Building an exam from rows ===================== */
  const qNo = q => { const n = Number(q.raw.questionNumber ?? q.raw.question_number ?? q.raw.qno ?? q.raw.order ?? q.raw.number); return Number.isFinite(n) ? n : NaN; };
  const kindRank = { s: 0, m: 1, x: 2, n: 3 };

  function orderQuestions(qs, sortByNumber) {
    const subs = [...new Set(qs.map(q => q.subject))].sort((a, b) => (SUBJ.indexOf(a) + 1 || 99) - (SUBJ.indexOf(b) + 1 || 99));
    const out = [];
    for (const s of subs) {
      for (const sec of ['mcq', 'num']) {
        let list = qs.filter(q => q.subject === s && secOfKind(kindCode(q)) === sec);
        if (sortByNumber) list.sort((a, b) => (kindRank[kindCode(a)] - kindRank[kindCode(b)]) || (Number.isFinite(qNo(a)) && Number.isFinite(qNo(b)) ? qNo(a) - qNo(b) : natural(a.id, b.id)));
        else list.sort((a, b) => kindRank[kindCode(a)] - kindRank[kindCode(b)]);
        out.push(...list);
      }
    }
    return out;
  }

  function limitsFor(qs, draft) {
    // JEE Main (2019 on): in the numerical section of each subject, attempt any 5 of 10.
    const lim = {};
    if (!(draft.pattern === 'main' || (draft.examKind === MAIN && (draft.year || 0) >= 2019))) return lim;
    for (const s of new Set(qs.map(q => q.subject))) {
      const n = qs.filter(q => q.subject === s && q.kind === 'number').length;
      if (n === 10) lim[s] = 5;
    }
    return lim;
  }

  const autoDuration = (n, examKind, pattern) => (pattern === 'main' || n >= 75 || (examKind === ADV && n >= 48) ? 180 : clamp(Math.round(n * (examKind === ADV ? 3.3 : 2.4)), 10, 360));

  function makeExam(draft, qs, opts) {
    const ordered = orderQuestions(qs, draft.sortByNumber);
    const E = {
      id: uid(), title: draft.title, pattern: draft.pattern === 'main' ? 'main' : 'orig', examKind: draft.examKind, year: draft.year || 0, source: draft.source,
      paperId: draft.paperId || '', durationMin: opts.durationMin, strict: opts.strict, fs: opts.fs, maxViol: opts.maxViol, name: opts.name,
      ids: ordered.map(q => q.id), paths: [...new Set(ordered.map(q => q.file))],
      lim: limitsFor(ordered, draft), startedAt: Date.now(), endsAt: Date.now() + opts.durationMin * 60000,
      ans: {}, cur: 0, viol: [], lang: JW.getLang()
    };
    return { E, Q: ordered };
  }

  /* ===================== Custom paper generator ===================== */
  const levelOf = d => (/easy/i.test(d) ? 'easy' : /hard|diff/i.test(d) ? 'hard' : 'medium');
  const MIXES = {
    any: ['Any', 'Natural mix of the pool', null], easy: ['Easy', 'Easy questions only', { easy: 1 }], medium: ['Medium', 'Medium only', { medium: 1 }], hard: ['Hard', 'Hard only', { hard: 1 }],
    balanced: ['Balanced', '30% easy · 50% medium · 20% hard', { easy: .3, medium: .5, hard: .2 }], tough: ['Tough', '10% easy · 30% medium · 60% hard', { easy: .1, medium: .3, hard: .6 }]
  };

  // Picks n rows. Spreads across chapters, follows the difficulty mix, prefers questions you have not attempted.
  function pickSet(rows, n, B) {
    if (n <= 0 || !rows.length) return [];
    const mix = MIXES[B.mix]?.[2];
    let buckets;
    if (!mix) buckets = [{ share: 1, rows }];
    else {
      const by = { easy: [], medium: [], hard: [] };
      rows.forEach(r => by[levelOf(r.diff)].push(r));
      buckets = Object.keys(mix).filter(k => mix[k] > 0).map(k => ({ share: mix[k], rows: by[k] }));
    }
    const order = rs => {
      const seen = r => (B.unseen && JW.latestOf(r.id) ? 1 : 0);
      const perChap = new Map();
      shuffle(rs).sort((a, b) => seen(a) - seen(b)).forEach(r => { const k = JW.norm(r.chapter); if (!perChap.has(k)) perChap.set(k, []); perChap.get(k).push(r); });
      const lists = shuffle([...perChap.values()]);
      const out = [];
      for (let i = 0; out.length < rs.length; i++) { let any = false; for (const l of lists) if (i < l.length) { out.push(l[i]); any = true; } if (!any) break; }
      return out;
    };
    const lists = buckets.map(b => ({ ...b, q: order(b.rows), take: 0 }));
    let left = n;
    lists.forEach(b => { b.take = Math.min(b.q.length, Math.floor(n * b.share)); left -= b.take; });
    for (let guard = 0; left > 0 && guard < 50; guard++) {
      const open = lists.filter(b => b.take < b.q.length).sort((a, b) => b.share - a.share);
      if (!open.length) break;
      for (const b of open) { if (left <= 0) break; b.take++; left--; }
    }
    let picked = lists.flatMap(b => b.q.slice(0, b.take));
    if (picked.length < n && mix) { // the mix cannot be met: top up from whatever is left
      const have = new Set(picked.map(r => r.id));
      picked = picked.concat(order(rows.filter(r => !have.has(r.id))).slice(0, n - picked.length));
    }
    return picked;
  }

  const chapKey = r => JW.norm(r.chapter);
  const srcExams = B => (B.src === 'both' ? [MAIN, ADV] : [B.src]);
  function poolFor(B, subject, kinds) {
    const sel = B.chap[subject];
    return X.rows.filter(r => r.subject === subject && srcExams(B).includes(r.exam) && kinds.includes(r.kind)
      && (!sel || sel.has(chapKey(r))) && (!B.noOos || !r.oos) && (!B.noBonus || !r.bonus));
  }
  const mcqKinds = B => (B.pattern === 'main' ? ['s'] : ['s', 'm', 'x'].filter(k => B.types[k]));

  function plan(B) {
    // What each subject will contain: {Physics: {mcq: {want, have}, num: {want, have}}}
    const out = {};
    for (const s of B.subjects) {
      const mk = mcqKinds(B), mp = poolFor(B, s, mk), np = poolFor(B, s, ['n']);
      let wantM, wantN;
      if (B.pattern === 'main') { wantM = 20; wantN = 10; }
      else if (B.pattern === 'adv') { wantM = null; wantN = null; }
      else { wantM = B.counts[s].mcq; wantN = B.counts[s].num; }
      out[s] = { mp, np, wantM, wantN };
    }
    return out;
  }

  function generate(B) {
    const P = plan(B), picked = [], short = [];
    for (const s of B.subjects) {
      const { mp, np } = P[s];
      let wantM = P[s].wantM, wantN = P[s].wantN;
      if (B.pattern === 'adv') {
        // Pattern-less: random type weights, total fixed per subject
        const kinds = ['s', 'm', 'x', 'n'].filter(k => (k === 'n' ? np : mp).some(r => r.kind === k) && (k === 'n' || B.types[k]));
        const w = Object.fromEntries(kinds.map(k => [k, 0.4 + Math.random()]));
        const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
        const cnt = Object.fromEntries(kinds.map(k => [k, Math.min(Math.round((B.advN * w[k]) / sum), [...mp, ...np].filter(r => r.kind === k).length)]));
        let tot = Object.values(cnt).reduce((a, b) => a + b, 0);
        while (tot > B.advN) { const big = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; cnt[big]--; tot--; }
        for (let g = 0; tot < B.advN && g < 200; g++) { const open = kinds.filter(k => cnt[k] < [...mp, ...np].filter(r => r.kind === k).length); if (!open.length) break; cnt[open[g % open.length]]++; tot++; }
        for (const k of kinds) picked.push(...pickSet([...mp, ...np].filter(r => r.kind === k), cnt[k], B));
        if (tot < B.advN) short.push(`${s}: only ${tot} of ${B.advN}`);
        continue;
      }
      const gm = pickSet(mp, wantM, B), gn = pickSet(np, wantN, B);
      if (gm.length < wantM) short.push(`${s} MCQ: ${gm.length} of ${wantM}`);
      if (gn.length < wantN) short.push(`${s} numerical: ${gn.length} of ${wantN}`);
      picked.push(...gm, ...gn);
    }
    return { rows: picked, short };
  }

  /* ===================== Saved papers & results ===================== */
  const getPapers = () => (store.get(K.papers, []) || []).filter(p => p && Array.isArray(p.ids));
  const getResults = () => (store.get(K.results, []) || []).filter(r => r && r.id);
  function savePaper(rec) { const l = getPapers().filter(p => p.id !== rec.id); l.unshift(rec); store.set(K.papers, l.slice(0, 30)); }
  function saveResult(res) { const l = getResults().filter(r => r.id !== res.id); l.unshift(res); store.set(K.results, l.slice(0, 25)); }
  const readActive = () => { const a = store.get(K.active, null); return a && Array.isArray(a.ids) && a.endsAt ? a : null; };

  /* ===================== Pages: hub, papers, maker, instructions ===================== */
  const here = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } }); // ['exam', sub, arg, arg2]
  const view = html => JW.setView(html);
  const PV = { q: '', year: '', limit: 24, tab: 'papers' };

  function loadingView(msg) { view(`<div class="empty"><strong>${esc(msg || 'Loading…')}</strong><span class="muted" id="exStatus"></span><div class="skeleton" style="width:min(420px,100%)"></div></div>`); }
  const status = msg => { const el = $('#exStatus'); if (el) el.textContent = msg; };

  async function page(token) {
    const r = here(), sub = r[1] || '';
    if (X.run && sub !== 'run') { showRun(); return; }
    if (sub === 'run') { return resumeGate(); }
    hideRun();
    if (!JW.isCurrent(token)) return;
    if (sub === 'start') return pageStart();
    if (sub === 'result') return pageResult(r[2], r[3], token);
    if (sub === 'new') { PV.tab = 'new'; } else if (sub === 'mine') { PV.tab = 'mine'; } else PV.tab = 'papers';
    loadingView('Loading exams…');
    try { await ensureIndex(status); } catch (err) { view(`<div class="empty"><strong>Couldn't load the question index</strong><span>${esc(err.message)}</span><a class="btn" href="#/">Go home</a></div>`); return; }
    if (!JW.isCurrent(token)) return;
    await autoFinishIfOver();
    pageHub();
  }

  async function autoFinishIfOver() {
    const a = readActive();
    if (a && Date.now() >= a.endsAt && !X.run) { try { await finishStored(a, 'time'); } catch { store.del(K.active); } }
  }

  const tabsHtml = () => `<div class="seg ex-tabs" role="tablist">${[['papers', 'Past papers', '#/exam'], ['new', 'Make a paper', '#/exam/new'], ['mine', 'My papers & results', '#/exam/mine']]
    .map(([k, l, h]) => `<a role="tab" class="${PV.tab === k ? 'active' : ''}" href="${h}">${l}</a>`).join('')}</div>`;

  function pageHub() {
    const a = readActive();
    const banner = a ? `<div class="notice ex-resume"><span class="grow"><b>Exam in progress</b><br><span class="muted">${esc(a.title)} · ${clock(a.endsAt - Date.now())} left</span></span><a class="btn primary sm" href="#/exam/run">Resume</a></div>` : '';
    const idxNote = X.derived ? '<div class="callout">Tip: run <code>python build_question_manifest.py</code> once. It writes <code>exam-index.json</code> and file versions, so papers open faster and use less data.</div>' : '';
    view(`<div class="page-head"><div><div class="eyebrow">Exam mode</div><h1>Sit a real exam</h1>
      <p>Full-length papers in an exam-hall interface: countdown timer, question palette, marking and a detailed analysis at the end.</p></div></div>
      ${banner}${idxNote}${tabsHtml()}<div id="exBody"></div>`);
    if (PV.tab === 'new') drawBuilder(); else if (PV.tab === 'mine') drawMine(); else drawPapers();
  }

  /* ---------- Past papers ---------- */
  function paperStats(rows) {
    const subj = {}; let mcq = 0, num = 0;
    for (const r of rows) { subj[r.subject] = (subj[r.subject] || 0) + 1; if (r.kind === 'n') num++; else mcq++; }
    return { subj, mcq, num, total: rows.length };
  }

  function drawPapers() {
    const exam = app.exam;
    let list = [...X.paperRows.entries()].filter(([, rows]) => rows[0].paper.exam === exam).map(([id, rows]) => ({ p: rows[0].paper, rows }));
    list.sort((a, b) => (b.p.key || 0) - (a.p.key || 0) || natural(b.p.title, a.p.title));
    const years = [...new Set(list.map(x => x.p.year).filter(Boolean))].sort((a, b) => b - a);
    const q = PV.q.trim().toLowerCase();
    const shown = list.filter(x => (!PV.year || String(x.p.year) === PV.year) && (!q || x.p.title.toLowerCase().includes(q)));
    const expected = exam === MAIN ? 90 : 0;
    $('#exBody').innerHTML = `<div class="ex-filter"><input class="input" id="exSearch" type="search" placeholder="Search papers…" value="${esc(PV.q)}" aria-label="Search papers">
      <select class="select" id="exYear" aria-label="Year"><option value="">All years</option>${years.map(y => `<option ${String(y) === PV.year ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      ${shown.length ? `<div class="ex-list">${shown.slice(0, PV.limit).map(({ p, rows }) => {
        const st = paperStats(rows);
        const partial = expected && st.total < expected;
        return `<div class="card ex-paper"><div class="ex-p-main"><div class="ex-p-title">${esc(p.title)}</div>
          <div class="ex-chips">${SUBJ.filter(s => st.subj[s]).map(s => `<span class="chip">${s.slice(0, 3)} ${st.subj[s]}</span>`).join('')}
          <span class="chip">${st.mcq} MCQ</span><span class="chip">${st.num} numerical</span>
          ${partial ? `<span class="chip warn" title="Not every question of this paper is in the library">${st.total} of ${expected}</span>` : `<span class="chip ok">${st.total} questions</span>`}</div></div>
          <button class="btn primary" data-x="paper" data-id="${esc(p.id)}">${icon('play')}Start</button></div>`;
      }).join('')}</div>${shown.length > PV.limit ? `<div style="text-align:center;margin-top:14px"><button class="btn" data-x="more">Show more · ${shown.length - PV.limit}</button></div>` : ''}`
      : `<div class="empty"><strong>No papers found</strong><span>${list.length ? 'Try a different search.' : `No ${examLabel(exam)} papers are grouped by paperId in the library yet.`}</span></div>`}`;
    hydrateIcons($('#exBody'));
  }

  function startPaper(pid) {
    const rows = X.paperRows.get(pid); if (!rows?.length) return;
    const p = rows[0].paper;
    beginDraft({ title: p.title, rows, pattern: 'paper', examKind: p.exam, year: p.year, source: 'paper', paperId: pid, sortByNumber: true });
  }

  function beginDraft(draft) {
    draft.paths = [...new Set(draft.rows.map(r => r.path))];
    draft.done = 0;
    draft.loading = (async () => {
      await JW.loadFiles(draft.paths, d => { draft.done = d; const el = $('#exLoad'); if (el) el.textContent = `Preparing questions… ${d}/${draft.paths.length}`; });
      draft.qs = draft.rows.map(r => JW.byId(r.id)).filter(Boolean);
      return draft.qs;
    })();
    draft.loading.catch(() => {});
    X.pending = draft;
    location.hash = '#/exam/start';
  }

  /* ---------- Instructions / start screen ---------- */
  function schemeRows(draft) {
    const m = new Map();
    for (const r of draft.rows) {
      const mk = markOf(infoOfRow(r), draft.pattern === 'main' ? 'main' : 'orig');
      const key = `${r.kind}|${mk.plus}|${mk.minus}|${mk.partial}`;
      const o = m.get(key) || { k: r.kind, n: 0, ...mk }; o.n++; m.set(key, o);
    }
    return [...m.values()].sort((a, b) => kindRank[a.k] - kindRank[b.k]);
  }

  // Highest possible score, honouring "attempt any 5 of 10" in JEE Main numerical sections.
  function maxMarksOf(draft) {
    const pat = draft.pattern === 'main' ? 'main' : 'orig';
    const limited = pat === 'main' || (draft.examKind === MAIN && (draft.year || 0) >= 2019);
    let total = 0; const seen = {}, nums = {};
    draft.rows.forEach(r => { if (r.kind === 'n') nums[r.subject] = (nums[r.subject] || 0) + 1; });
    for (const r of draft.rows) {
      const plus = markOf(infoOfRow(r), pat).plus;
      if (limited && r.kind === 'n' && nums[r.subject] === 10) { seen[r.subject] = (seen[r.subject] || 0) + 1; if (seen[r.subject] > 5) continue; }
      total += plus;
    }
    return total;
  }

  function pageStart() {
    const d = X.pending;
    if (!d) { location.replace('#/exam'); return; }
    const total = d.rows.length;
    const dur = d.durationMin || autoDuration(total, d.examKind, d.pattern);
    d.durationMin = dur;
    const maxMarks = maxMarksOf(d);
    const subs = SUBJ.filter(s => d.rows.some(r => r.subject === s));
    const fsOk = !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
    view(`<div class="ex-start"><a class="btn ghost sm" href="#/exam">${icon('left')}Back</a>
      <div class="page-head" style="margin-top:12px"><div><div class="eyebrow">${esc(examLabel(d.examKind))}${d.year ? ' · ' + d.year : ''}</div><h1>${esc(d.title)}</h1>
        <p>${plural(total, 'question')} · ${subs.join(', ')} · up to ${fmtN(maxMarks)} marks</p></div></div>
      <div class="grid cols-2 ex-start-grid">
        <div class="card"><h3 class="ex-h">Marking scheme</h3>
          <table class="ex-table"><thead><tr><th>Type</th><th>Questions</th><th>Correct</th><th>Wrong</th></tr></thead><tbody>
          ${schemeRows(d).map(s => `<tr><td>${KIND[s.k]}${s.partial ? '<small class="muted"> · partial marks</small>' : ''}</td><td>${s.n}</td><td class="ok">+${fmtN(s.plus)}</td><td class="bad">${s.minus ? '−' + fmtN(s.minus) : '0'}</td></tr>`).join('')}</tbody></table>
          <ul class="ex-rules"><li>The countdown keeps running even if you close the page. Time over → the paper is submitted automatically.</li>
          <li>Answer colours: <b class="st-0">grey</b> not visited · <b class="st-1">red</b> not answered · <b class="st-2">green</b> answered · <b class="st-3">purple</b> marked for review · <b class="st-4">purple + tick</b> answered &amp; marked (this one is evaluated).</li>
          <li>Subjects and sections are on the top bar. ${d.pattern === 'main' || (d.examKind === MAIN && (d.year || 0) >= 2019) ? 'In JEE Main numerical sections with 10 questions you may answer only 5 per subject.' : ''}</li>
          <li>Numerical answers are typed with the on-screen keypad.</li></ul></div>
        <div class="card"><h3 class="ex-h">Your settings</h3>
          <label class="ex-f"><span>Name on screen</span><input class="input" id="exName" maxlength="40" placeholder="Candidate" value="${esc(cfg.name)}"></label>
          <label class="ex-f"><span>Duration (minutes)</span><input class="input" id="exDur" type="number" min="5" max="400" value="${dur}"></label>
          <label class="ex-sw"><input type="checkbox" id="exFs" ${cfg.fs && fsOk ? 'checked' : ''} ${fsOk ? '' : 'disabled'}><span><b>Full screen</b><small>${fsOk ? 'Hides the browser bars, like an exam centre.' : 'Not supported on this device.'}</small></span></label>
          <label class="ex-sw"><input type="checkbox" id="exStrict" ${cfg.strict ? 'checked' : ''}><span><b>Strict mode</b><small>Stays in full screen. Copy, paste, right-click, print, F11/F12/F5 and most shortcuts are blocked. Leaving full screen or switching tabs is a warning.</small></span></label>
          <label class="ex-f" id="exViolRow" ${cfg.strict ? '' : 'hidden'}><span>Auto-submit after</span><select class="select" id="exViol">${[[3, '3 warnings'], [5, '5 warnings'], [10, '10 warnings'], [0, 'Never (just record)']].map(([v, l]) => `<option value="${v}" ${Number(cfg.maxViol) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted ex-note">A web page cannot stop Alt+Tab or the operating system. In strict mode every such exit is detected, counted and shown in your result.</p>
          <button class="btn primary lg block" id="exBegin" data-x="begin">${icon('play')}Begin exam</button>
          <p class="muted" id="exLoad" style="text-align:center;margin-top:8px;min-height:1.3em"></p></div></div></div>`);
    const strict = $('#exStrict');
    strict.addEventListener('change', () => { $('#exViolRow').hidden = !strict.checked; if (strict.checked && fsOk) $('#exFs').checked = true; });
    hydrateIcons($('#view'));
    d.loading.then(() => { const el = $('#exLoad'); if (el && X.pending === d) el.textContent = d.qs.length < d.rows.length ? `${d.rows.length - d.qs.length} question(s) could not be loaded.` : 'Questions are ready.'; }).catch(() => { const el = $('#exLoad'); if (el) el.textContent = 'Could not load the questions. Check your connection.'; });
  }

  async function onBegin() {
    const d = X.pending; if (!d) return;
    cfg.name = $('#exName').value.trim().slice(0, 40); cfg.strict = $('#exStrict').checked; cfg.fs = $('#exFs').checked || cfg.strict && !$('#exFs').disabled;
    cfg.maxViol = Number($('#exViol').value); saveCfg();
    const durationMin = clamp(Math.round(Number($('#exDur').value) || d.durationMin), 5, 400);
    const btn = $('#exBegin'); btn.disabled = true;
    if (cfg.fs) enterFullscreen();                   // must run inside this click
    let qs;
    try { qs = await d.loading; } catch { qs = []; }
    if (!qs.length) { exitFullscreen(); btn.disabled = false; toast('Could not load the questions.'); return; }
    const { E, Q } = makeExam(d, qs, { durationMin, strict: cfg.strict, fs: cfg.fs, maxViol: cfg.maxViol, name: cfg.name || 'Candidate' });
    if (d.source === 'paper' || d.source === 'custom') { /* keep a copy so it can be retaken */ }
    X.pending = null;
    startRun(E, Q);
  }

  /* ---------- Make a paper ---------- */
  const B = {
    pattern: 'main', src: MAIN, subjects: [...SUBJ], chap: { Physics: null, Chemistry: null, Mathematics: null }, mix: 'any',
    counts: { Physics: { mcq: 20, num: 10 }, Chemistry: { mcq: 20, num: 10 }, Mathematics: { mcq: 20, num: 10 } }, advN: 18,
    types: { s: true, m: true, x: true }, unseen: true, noOos: true, noBonus: true, dur: 0, chapOpen: ''
  };
  const PATTERNS = [
    ['main', 'JEE Main pattern', '3 subjects × (20 MCQ + 10 numerical, attempt 5) · 300 marks · 3 hours'],
    ['adv', 'JEE Advanced style', 'Random mix of single, multiple, matrix and numerical questions. Marks come from each question.'],
    ['custom', 'My own counts', 'Choose how many MCQ and numerical questions you want per subject.']
  ];

  function chapterList(subject) {
    const files = srcExams(B).flatMap(e => JW.filesFor(e, subject));
    const map = new Map();
    for (const f of files) { const k = JW.norm(f.chapter); if (!map.has(k)) map.set(k, { key: k, name: f.chapter, group: JW.chapInfo(f).group, f }); }
    return JW.groupFiles([...map.values()].map(c => c.f)).map(([g, fs]) => [g, fs.map(f => map.get(JW.norm(f.chapter)))]);
  }

  function availability() {
    const P = plan(B); const out = {};
    for (const s of B.subjects) out[s] = { mcq: P[s].mp.length, num: P[s].np.length, wantM: P[s].wantM, wantN: P[s].wantN };
    return out;
  }
  const stepper = (k, s, v, max) => `<span class="ex-step"><button data-x="cnt" data-s="${s}" data-k="${k}" data-d="-1" aria-label="Fewer">−</button><b>${v}</b><button data-x="cnt" data-s="${s}" data-k="${k}" data-d="1" aria-label="More">+</button></span>`;

  function drawBuilder() {
    const av = availability();
    const total = B.subjects.reduce((n, s) => n + (B.pattern === 'adv' ? B.advN : av[s].wantM + av[s].wantN), 0);
    const warn = B.subjects.flatMap(s => B.pattern === 'adv'
      ? ((av[s].mcq + av[s].num) < B.advN ? [`${s}: only ${av[s].mcq + av[s].num} questions match`] : [])
      : [(av[s].mcq < av[s].wantM ? [`${s}: ${av[s].mcq} MCQ available, ${av[s].wantM} wanted`] : []), (av[s].num < av[s].wantN ? [`${s}: ${av[s].num} numerical available, ${av[s].wantN} wanted`] : [])].flat());
    const body = `
      <div class="card ex-sec"><h3 class="ex-h">1 · Pattern</h3><div class="ex-cards">${PATTERNS.map(([k, t, d]) => `<button class="order-card ${B.pattern === k ? 'active' : ''}" data-x="pat" data-v="${k}"><b>${t}</b><small>${d}</small></button>`).join('')}</div></div>
      <div class="card ex-sec"><h3 class="ex-h">2 · Questions from</h3>
        <div class="seg">${[[MAIN, 'JEE Main PYQs'], [ADV, 'JEE Advanced PYQs'], ['both', 'Both']].map(([v, l]) => `<button class="${B.src === v ? 'active' : ''}" data-x="src" data-v="${v}">${l}</button>`).join('')}</div>
        <div class="ex-subs">${SUBJ.map(s => `<label class="ex-chk"><input type="checkbox" data-x="sub" data-s="${s}" ${B.subjects.includes(s) ? 'checked' : ''}>${s}</label>`).join('')}</div></div>
      <div class="card ex-sec"><h3 class="ex-h">3 · Chapters</h3><p class="muted" style="margin:-4px 0 10px">Leave a subject on “All chapters” or pick the ones you want.</p>
        ${B.subjects.map(s => {
          const sel = B.chap[s], list = chapterList(s), open = B.chapOpen === s, n = list.reduce((a, [, cs]) => a + cs.length, 0);
          return `<div class="ex-chap"><div class="ex-chap-h"><b>${s}</b><span class="muted">${sel ? `${sel.size} of ${n} chapters` : `All ${n} chapters`}</span>
            ${sel ? `<button class="btn sm ghost" data-x="chapAll" data-s="${s}">Use all</button>` : ''}<button class="btn sm" data-x="chapOpen" data-s="${s}">${open ? 'Hide' : 'Choose'}</button></div>
            ${open ? `<div class="ex-chap-b">${list.map(([g, cs]) => `<div class="ex-grp"><small>${esc(g)}</small><div class="ex-pills">${cs.map(c => `<button class="ex-pill ${sel && sel.has(c.key) ? 'on' : ''}" data-x="chap" data-s="${s}" data-k="${esc(c.key)}">${esc(c.name)}</button>`).join('')}</div></div>`).join('')}</div>` : ''}</div>`;
        }).join('')}</div>
      <div class="card ex-sec"><h3 class="ex-h">4 · Difficulty</h3><div class="ex-cards">${Object.entries(MIXES).map(([k, [t, d]]) => `<button class="order-card ${B.mix === k ? 'active' : ''}" data-x="mix" data-v="${k}"><b>${t}</b><small>${d}</small></button>`).join('')}</div></div>
      <div class="card ex-sec"><h3 class="ex-h">5 · How many</h3>
        ${B.pattern === 'main' ? `<p class="muted">Fixed by the JEE Main pattern: 20 MCQ and 10 numerical per subject.</p>` : ''}
        ${B.pattern === 'adv' ? `<div class="ex-row"><span>Questions per subject</span><span class="ex-step"><button data-x="advN" data-d="-2">−</button><b>${B.advN}</b><button data-x="advN" data-d="2">+</button></span></div>` : ''}
        ${B.pattern !== 'main' ? `<div class="ex-row"><span>Question types</span><span>${[['s', 'Single'], ['m', 'Multiple'], ['x', 'Matrix']].map(([k, l]) => `<label class="ex-chk"><input type="checkbox" data-x="type" data-k="${k}" ${B.types[k] ? 'checked' : ''}>${l}</label>`).join('')}</span></div>` : ''}
        ${B.subjects.map(s => `<div class="ex-row"><span><b>${s}</b> <small class="muted">${av[s].mcq} MCQ · ${av[s].num} numerical available</small></span>
          ${B.pattern === 'custom' ? `<span class="ex-cnts"><label>MCQ ${stepper('mcq', s, B.counts[s].mcq)}</label><label>Numerical ${stepper('num', s, B.counts[s].num)}</label></span>` : ''}</div>`).join('')}</div>
      <div class="card ex-sec"><h3 class="ex-h">6 · Options</h3>
        <label class="ex-sw"><input type="checkbox" data-x="opt" data-k="unseen" ${B.unseen ? 'checked' : ''}><span><b>Prefer questions I haven't attempted</b></span></label>
        <label class="ex-sw"><input type="checkbox" data-x="opt" data-k="noOos" ${B.noOos ? 'checked' : ''}><span><b>Skip out-of-syllabus questions</b></span></label>
        <label class="ex-sw"><input type="checkbox" data-x="opt" data-k="noBonus" ${B.noBonus ? 'checked' : ''}><span><b>Skip bonus questions</b></span></label>
        <label class="ex-f"><span>Duration (minutes, blank = automatic)</span><input class="input" id="exBDur" type="number" min="5" max="400" value="${B.dur || ''}" placeholder="auto"></label></div>
      <div class="ex-bar"><div><b>${total}</b> questions${warn.length ? `<div class="ex-warn">${warn.slice(0, 3).map(esc).join(' · ')}${warn.length > 3 ? ` · +${warn.length - 3} more` : ''}</div>` : ''}</div>
        <button class="btn primary lg" data-x="gen" ${B.subjects.length && total ? '' : 'disabled'}>Create paper ${icon('right')}</button></div>`;
    const keepScroll = window.scrollY;
    $('#exBody').innerHTML = body;
    hydrateIcons($('#exBody'));
    window.scrollTo(0, keepScroll);
  }

  function onGenerate() {
    const { rows, short } = generate(B);
    if (!rows.length) { toast('No questions match these filters.'); return; }
    const pat = PATTERNS.find(p => p[0] === B.pattern)[1];
    const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const examKind = B.src === 'both' ? 'custom' : B.src;
    const draft = { title: `${pat} · ${date}`, rows, pattern: B.pattern === 'main' ? 'main' : 'orig', examKind, year: 0, source: 'custom', sortByNumber: false, durationMin: B.dur || autoDuration(rows.length, examKind, B.pattern === 'main' ? 'main' : 'orig'), generator: B.pattern };
    savePaper({ id: uid(), title: draft.title, ids: rows.map(r => r.id), pattern: draft.pattern, examKind, durationMin: draft.durationMin, created: Date.now() });
    if (short.length) toast('Not enough questions for: ' + short.slice(0, 2).join(', ') + (short.length > 2 ? '…' : ''));
    beginDraft(draft);
  }

  /* ---------- My papers & results ---------- */
  function drawMine() {
    const papers = getPapers(), results = getResults();
    $('#exBody').innerHTML = `<h2 class="section-title" style="margin-top:6px">Results</h2>${results.length ? `<div class="ex-list">${results.map(r => `<div class="card ex-paper"><div class="ex-p-main"><div class="ex-p-title">${esc(r.title)}</div>
        <div class="ex-chips"><span class="chip new">${fmtN(r.score)} / ${fmtN(r.max)}</span><span class="chip">${r.correct} correct</span><span class="chip">${r.wrong} wrong</span><span class="chip">${nice(r.usedMs)}</span><span class="chip">${new Date(r.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>${r.viol?.length ? `<span class="chip bad">${r.viol.length} warning${r.viol.length > 1 ? 's' : ''}</span>` : ''}</div></div>
        <span class="ex-acts"><a class="btn" href="#/exam/result/${esc(r.id)}">Open</a><button class="icon-btn" data-x="delRes" data-id="${esc(r.id)}" aria-label="Delete result">${icon('trash')}</button></span></div>`).join('')}</div>` : '<div class="empty"><strong>No results yet</strong><span>Finish an exam and it will appear here.</span></div>'}
      <h2 class="section-title">Saved papers</h2>${papers.length ? `<div class="ex-list">${papers.map(p => `<div class="card ex-paper"><div class="ex-p-main"><div class="ex-p-title">${esc(p.title)}</div>
        <div class="ex-chips"><span class="chip">${p.ids.length} questions</span><span class="chip">${p.durationMin} min</span><span class="chip">${new Date(p.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></div></div>
        <span class="ex-acts"><button class="btn primary" data-x="again" data-id="${esc(p.id)}">${icon('play')}Start</button><button class="icon-btn" data-x="delPaper" data-id="${esc(p.id)}" aria-label="Delete paper">${icon('trash')}</button></span></div>`).join('')}</div>` : '<div class="empty"><strong>No saved papers</strong><span>Papers you make are saved here so you can sit them again.</span></div>'}`;
    hydrateIcons($('#exBody'));
  }

  function startSaved(id) {
    const p = getPapers().find(x => x.id === id); if (!p) return;
    const byId = new Map(X.rows.map(r => [r.id, r]));
    const rows = p.ids.map(i => byId.get(i)).filter(Boolean);
    if (!rows.length) { toast('Those questions are no longer in the library.'); return; }
    beginDraft({ title: p.title, rows, pattern: p.pattern, examKind: p.examKind, year: 0, source: 'custom', sortByNumber: false, durationMin: p.durationMin });
  }

  /* ===================== The exam hall (runner) ===================== */
  const fsOk = () => !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
  function enterFullscreen() {
    if (!fsOk() || document.fullscreenElement) return Promise.resolve();
    return document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => { try { return navigator.keyboard?.lock?.(['Escape', 'F11']); } catch { return null; } })
      .catch(() => {});
  }
  function exitFullscreen() { try { navigator.keyboard?.unlock?.(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { /* ignore */ } }

  const root = () => {
    let el = $('#exRun');
    if (!el) { el = document.createElement('section'); el.id = 'exRun'; el.className = 'ex-run'; el.hidden = true; el.setAttribute('aria-label', 'Exam'); document.body.appendChild(el); el.addEventListener('click', onRunClick); }
    return el;
  };
  const R = () => X.run;
  const ansOf = (id) => (R().E.ans[id] ||= { sel: [], val: '', st: 0, t: 0 });

  function layoutOf(Q) {
    const subs = [];
    Q.forEach((q, i) => {
      let g = subs.find(x => x.s === q.subject);
      if (!g) { g = { s: q.subject, secs: { mcq: [], num: [] }, idx: [] }; subs.push(g); }
      g.secs[secOfKind(kindCode(q))].push(i); g.idx.push(i);
    });
    return subs;
  }

  function startRun(E, Q, resumed) {
    X.run = { E, Q, lay: layoutOf(Q), last: Date.now(), started: Date.now(), lastViol: 0, finishing: false, pal: false };
    Q.forEach(q => ansOf(q.id));
    if (resumed) X.run.E.cur = clamp(E.cur || 0, 0, Q.length - 1);
    const first = ansOf(Q[E.cur].id); if (first.st === 0) first.st = 1;
    if (E.lang) JW.setLang(E.lang);
    document.body.classList.add('ex-lock');
    persist();
    armRun();
    if (location.hash !== '#/exam/run') location.hash = '#/exam/run';
    showRun();
  }

  let saveT;
  const persist = () => { if (X.run) store.set(K.active, X.run.E); };
  const persistSoon = () => { clearTimeout(saveT); saveT = setTimeout(persist, 350); };
  function tickTime() {
    const r = R(); if (!r) return;
    const now = Date.now(), e = ansOf(r.Q[r.E.cur].id);
    if (!document.hidden) e.t = (e.t || 0) + Math.min(now - r.last, 5000);
    r.last = now;
  }

  function showRun() {
    const r = root(); r.hidden = false;
    r.classList.toggle('strict', !!R().E.strict);
    renderRun();
  }
  function hideRun() {
    const el = $('#exRun'); if (el) el.hidden = true;
    if (!X.run) document.body.classList.remove('ex-lock');
  }

  const stOf = i => ansOf(R().Q[i].id).st;
  function setStatus(e, q) {
    const has = hasAnswer(q, e), marked = e.st === 3 || e.st === 4;
    e.st = has ? (marked ? 4 : 2) : (marked ? 3 : 1);
  }

  function renderRun() {
    const { E, Q, lay } = R(), i = E.cur, q = Q[i], e = ansOf(q.id);
    const grp = lay.find(g => g.s === q.subject), kc = kindCode(q), mk = markOf(infoOfQ(q), E.pattern);
    const d = JW.qd(q), n = grp.idx.indexOf(i) + 1, sec = secOfKind(kc);
    const lim = E.lim[q.subject];
    const answeredIn = (g, key) => g.secs[key].filter(x => hasAnswer(Q[x], ansOf(Q[x].id))).length;
    const hasHi = JW.hasHindi(q);
    const opts = kc === 'n' ? '' : JW.qOptions(q).map(o => `<button class="opt ${(e.sel || []).includes(o.id) ? 'sel' : ''}" data-x="opt" data-id="${esc(o.id)}" aria-pressed="${(e.sel || []).includes(o.id)}"><span class="key">${esc(o.id)}</span><span class="txt">${JW.sanitize(o.html)}</span></button>`).join('');
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '-'].map(k => `<button data-x="key" data-k="${k}">${k === '-' ? '−' : k}</button>`).join('');
    const callouts = [d.direction, d.comprehension].filter(Boolean).map(h => `<div class="callout">${JW.sanitize(h)}</div>`).join('');
    root().innerHTML = `
      <header class="ex-top"><div class="ex-brand"><b>JEEwise</b><span>${esc(E.title)}</span></div>
        <div class="ex-cand">${icon('teacher')}<span>${esc(E.name)}</span></div>
        <div class="ex-time">Time left <b id="exTimer">${clock(E.endsAt - Date.now())}</b></div>
        ${E.strict ? `<span class="chip warn ex-strict">${icon('lock')}Strict · <span id="exWarnCount">${E.viol.length}</span>${E.maxViol ? '/' + E.maxViol : ''}</span>` : ''}
        ${hasHi ? `<button class="btn sm ghost" data-x="lang">${JW.getLang() === 'hi' ? 'EN' : 'हिं'}</button>` : ''}
        <button class="btn sm ghost ex-palbtn" data-x="pal">${icon('grid')}</button></header>
      <nav class="ex-subj">${lay.map(g => `<button class="${g.s === q.subject ? 'active' : ''}" data-x="subj" data-s="${esc(g.s)}">${esc(g.s)}<small>${g.idx.filter(x => hasAnswer(Q[x], ansOf(Q[x].id))).length}/${g.idx.length}</small></button>`).join('')}</nav>
      <div class="ex-secbar">${['mcq', 'num'].filter(k => grp.secs[k].length).map(k => `<button class="${k === sec ? 'active' : ''}" data-x="sec" data-s="${k}">Section ${k === 'mcq' ? 'A' : 'B'} · ${secName(k, E.pattern === 'main' || E.examKind === MAIN ? 'main' : 'orig')}<small>${answeredIn(grp, k)}/${grp.secs[k].length}</small></button>`).join('')}
        ${lim && sec === 'num' ? `<span class="chip warn">Attempt any ${lim} of ${grp.secs.num.length}</span>` : ''}</div>
      <div class="ex-body"><main class="ex-q" id="exQ"><div class="ex-qhead"><b>Question ${n}</b><span class="chip">${KIND[kc]}</span><span class="chip ok">+${fmtN(mk.plus)}</span><span class="chip ${mk.minus ? 'bad' : ''}">${mk.minus ? '−' + fmtN(mk.minus) : 'No negative'}</span></div>
          ${callouts}<div class="prompt" id="exPrompt">${JW.sanitize(d.content || 'Question text unavailable.')}</div>
          ${kc === 'n' ? `<div class="ex-num"><div class="ex-numbox" id="exNum">${esc(e.val || '') || '&nbsp;'}</div><div class="ex-keypad">${keys}<button data-x="key" data-k="bs">⌫</button><button class="wide" data-x="key" data-k="clr">Clear</button></div></div>`
            : `<p class="muted ex-hint">${kc === 'm' ? 'One or more options may be correct.' : 'Choose the correct option.'}</p><div class="options">${opts}</div>`}</main>
        <aside class="ex-pal ${R().pal ? 'open' : ''}" id="exPal">${palHtml(grp)}</aside></div>
      <footer class="ex-foot"><button class="btn" data-x="mark">Mark for review &amp; next</button><button class="btn" data-x="clear">Clear response</button><span class="spacer"></span>
        <button class="btn" data-x="prev" ${i === 0 ? 'disabled' : ''}>${icon('left')}<span class="lbl">Previous</span></button>
        <button class="btn primary" data-x="next">Save &amp; next${icon('right')}</button></footer>
      <div class="ex-warnbar" id="exWarn" hidden></div><div class="ex-gate" id="exGate" hidden></div>`;
    hydrateIcons(root());
    JW.typeset($('#exQ'));
    $('#exQ').scrollTop = 0;
    if (E.strict && fsOk() && !document.fullscreenElement) showGate();
  }

  function palHtml(grp) {
    const { E, Q } = R(), cnt = [0, 0, 0, 0, 0];
    grp.idx.forEach(x => cnt[ansOf(Q[x].id).st]++);
    const btn = x => { const st = ansOf(Q[x].id).st; return `<button class="st-${st} ${x === E.cur ? 'cur' : ''}" data-x="go" data-i="${x}" aria-label="Question ${grp.idx.indexOf(x) + 1}">${grp.idx.indexOf(x) + 1}</button>`; };
    return `<div class="ex-pal-h"><b>${esc(grp.s)}</b><button class="icon-btn ex-palx" data-x="pal" aria-label="Close">${icon('x')}</button></div>
      <div class="ex-legend"><span><i class="st-2"></i>${cnt[2]} Answered</span><span><i class="st-1"></i>${cnt[1]} Not answered</span><span><i class="st-0"></i>${cnt[0]} Not visited</span><span><i class="st-3"></i>${cnt[3]} Marked</span><span><i class="st-4"></i>${cnt[4]} Answered &amp; marked</span></div>
      <div class="ex-pal-s">${['mcq', 'num'].filter(k => grp.secs[k].length).map(k => `<small>Section ${k === 'mcq' ? 'A' : 'B'}</small><div class="ex-grid">${grp.secs[k].map(btn).join('')}</div>`).join('')}</div>
      <button class="btn danger block" data-x="submit">Submit exam</button>`;
  }
  function refreshPal() {
    const { E, Q, lay } = R(), q = Q[E.cur], grp = lay.find(g => g.s === q.subject);
    const el = $('#exPal'); if (el) el.innerHTML = palHtml(grp), hydrateIcons(el);
    $$('.ex-subj button').forEach((b, k) => { const g = lay[k]; b.querySelector('small').textContent = `${g.idx.filter(x => hasAnswer(Q[x], ansOf(Q[x].id))).length}/${g.idx.length}`; });
    $$('.ex-secbar button').forEach(b => { const key = b.dataset.s; b.querySelector('small').textContent = `${grp.secs[key].filter(x => hasAnswer(Q[x], ansOf(Q[x].id))).length}/${grp.secs[key].length}`; });
  }

  function go(i) {
    const r = R(); if (!r) return;
    tickTime();
    const q = r.Q[r.E.cur], e = ansOf(q.id); setStatus(e, q);
    r.E.cur = clamp(i, 0, r.Q.length - 1);
    const nq = r.Q[r.E.cur], ne = ansOf(nq.id); if (ne.st === 0) ne.st = 1;
    r.pal = false;
    persist(); renderRun();
  }
  const subjFirst = s => R().Q.findIndex(q => q.subject === s);

  function limitBlocked(q, e) {
    const { E, Q } = R(), lim = E.lim[q.subject];
    if (!lim || q.kind !== 'number' || hasAnswer(q, e)) return false;
    const used = Q.filter(x => x.subject === q.subject && x.kind === 'number' && x.id !== q.id && hasAnswer(x, ansOf(x.id))).length;
    if (used >= lim) { toast(`You can answer only ${lim} numerical questions in ${q.subject}. Clear one first.`); return true; }
    return false;
  }

  function afterAnswerChange() {
    const { E, Q } = R(), q = Q[E.cur], e = ansOf(q.id);
    setStatus(e, q); persistSoon(); refreshPal();
  }

  function pickOption(id) {
    const { E, Q } = R(), q = Q[E.cur], e = ansOf(q.id);
    if (limitBlocked(q, e)) return;
    const multi = kindCode(q) === 'm';
    if (multi) e.sel = e.sel.includes(id) ? e.sel.filter(x => x !== id) : [...e.sel, id];
    else e.sel = e.sel.includes(id) ? [] : [id];
    $$('#exQ .opt').forEach(b => { const on = e.sel.includes(b.dataset.id); b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); });
    afterAnswerChange();
  }

  function typeKey(k) {
    const { E, Q } = R(), q = Q[E.cur], e = ansOf(q.id);
    if (q.kind !== 'number') return;
    let v = String(e.val || '');
    if (k === 'bs') v = v.slice(0, -1);
    else if (k === 'clr') v = '';
    else {
      if (limitBlocked(q, e)) return;
      if (k === '-') { v = v.startsWith('-') ? v.slice(1) : '-' + v; }
      else if (k === '.') { if (!v.includes('.')) v += v === '' || v === '-' ? '0.' : '.'; }
      else if (/^\d$/.test(k) && v.replace(/[-.]/g, '').length < 12) v += k;
    }
    e.val = v;
    const box = $('#exNum'); if (box) box.innerHTML = esc(v) || '&nbsp;';
    afterAnswerChange();
  }

  function onRunClick(ev) {
    const b = ev.target.closest('[data-x]'); if (!b || !R()) return;
    const { E, Q } = R(), q = Q[E.cur], e = ansOf(q.id);
    switch (b.dataset.x) {
      case 'opt': pickOption(b.dataset.id); break;
      case 'key': typeKey(b.dataset.k); break;
      case 'next': go(E.cur + 1 < Q.length ? E.cur + 1 : E.cur); break;
      case 'prev': go(E.cur - 1); break;
      case 'go': go(Number(b.dataset.i)); break;
      case 'mark': e.st = hasAnswer(q, e) ? 4 : 3; go(E.cur + 1 < Q.length ? E.cur + 1 : E.cur); break;
      case 'clear': e.sel = []; e.val = ''; e.st = (e.st === 3 || e.st === 4) ? 3 : 1; persistSoon(); renderRun(); break;
      case 'subj': go(subjFirst(b.dataset.s)); break;
      case 'sec': { const g = R().lay.find(x => x.s === q.subject); const first = g.secs[b.dataset.s][0]; if (first != null) go(first); break; }
      case 'lang': JW.setLang(JW.getLang() === 'hi' ? 'en' : 'hi'); E.lang = JW.getLang(); renderRun(); break;
      case 'pal': R().pal = !R().pal; $('#exPal')?.classList.toggle('open', R().pal); break;
      case 'submit': openSubmit(); break;
      case 'confirmSubmit': closeSubmit(); finish('submit'); break;
      case 'cancelSubmit': closeSubmit(); break;
      case 'gateBack': enterFullscreen().then(() => { if (document.fullscreenElement) hideGate(); }); break;
      default: break;
    }
  }

  function openSubmit() {
    tickTime();
    const { E, Q, lay } = R();
    const rows = lay.map(g => { const c = [0, 0, 0, 0, 0]; g.idx.forEach(x => c[ansOf(Q[x].id).st]++); return `<tr><td>${esc(g.s)}</td><td>${g.idx.length}</td><td class="ok">${c[2] + c[4]}</td><td>${c[1]}</td><td>${c[0]}</td><td>${c[3] + c[4]}</td></tr>`; }).join('');
    const el = document.createElement('div'); el.className = 'ex-modal'; el.id = 'exSubmit';
    el.innerHTML = `<div class="ex-modal-card"><h2>Submit exam?</h2><p class="muted">Time left ${clock(E.endsAt - Date.now())}. You cannot change answers after submitting.</p>
      <table class="ex-table"><thead><tr><th>Subject</th><th>Total</th><th>Answered</th><th>Not answered</th><th>Not visited</th><th>Marked</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="ex-modal-foot"><button class="btn" data-x="cancelSubmit">Go back</button><button class="btn primary" data-x="confirmSubmit">Yes, submit</button></div></div>`;
    root().appendChild(el);
  }
  const closeSubmit = () => $('#exSubmit')?.remove();

  /* ---------- Timer, strict mode, safety ---------- */
  let timerId, hbId;
  function onTick() {
    const r = R(); if (!r || r.finishing) return;
    const left = r.E.endsAt - Date.now(), t = $('#exTimer');
    if (t) { t.textContent = clock(left); t.parentElement.classList.toggle('low', left < 600000); }
    if (left <= 0) finish('time');
  }

  const BLOCKED_KEYS = new Set(['F1', 'F3', 'F5', 'F6', 'F7', 'F10', 'F11', 'F12', 'PrintScreen', 'ContextMenu']);
  const L = {
    key(e) {
      const r = R(); if (!r) return;
      const q = r.Q[r.E.cur];
      if (q.kind === 'number' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); typeKey(e.key); return; }
        if (e.key === '-' ) { e.preventDefault(); typeKey('-'); return; }
        if (e.key === 'Backspace') { e.preventDefault(); typeKey('bs'); return; }
      }
      if (!r.E.strict) return;
      const c = e.ctrlKey || e.metaKey;
      if (BLOCKED_KEYS.has(e.key) || (c && /^[a-z0-9]$/i.test(e.key)) || (e.altKey && /^Arrow|Home$/.test(e.key)) || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
    },
    stop(e) { if (R()?.E.strict) e.preventDefault(); },
    vis() { if (!R()) return; if (document.hidden) { tickTime(); persist(); if (R().E.strict) violate('left the tab'); } else R().last = Date.now(); },
    blur() { if (R()?.E.strict && !document.hidden && Date.now() - R().started > 2500) violate('window lost focus'); },
    fs() {
      const r = R(); if (!r || !r.E.strict || !fsOk()) return;
      if (!document.fullscreenElement) { showGate(); violate('left full screen'); } else hideGate();
    },
    print() { if (R()?.E.strict) violate('print'); },
    unload(e) { if (R()) { persist(); e.preventDefault(); e.returnValue = ''; } },
    hide() { if (R()) persist(); },
    pop() { if (R()) { history.pushState(null, '', '#/exam/run'); if (R().E.strict) toast('Back is disabled during the exam.'); } },
    hash() { if (R() && location.hash !== '#/exam/run') location.replace('#/exam/run'); }
  };
  function armRun() {
    disarmRun();
    document.addEventListener('keydown', L.key, true);
    ['contextmenu', 'copy', 'cut', 'paste', 'dragstart', 'selectstart'].forEach(t => document.addEventListener(t, L.stop, true));
    document.addEventListener('visibilitychange', L.vis); window.addEventListener('blur', L.blur);
    document.addEventListener('fullscreenchange', L.fs); window.addEventListener('beforeprint', L.print);
    window.addEventListener('beforeunload', L.unload); window.addEventListener('pagehide', L.hide);
    window.addEventListener('popstate', L.pop); window.addEventListener('hashchange', L.hash);
    history.pushState(null, '', '#/exam/run');
    timerId = setInterval(onTick, 500); hbId = setInterval(() => { tickTime(); persist(); }, 10000);
  }
  function disarmRun() {
    document.removeEventListener('keydown', L.key, true);
    ['contextmenu', 'copy', 'cut', 'paste', 'dragstart', 'selectstart'].forEach(t => document.removeEventListener(t, L.stop, true));
    document.removeEventListener('visibilitychange', L.vis); window.removeEventListener('blur', L.blur);
    document.removeEventListener('fullscreenchange', L.fs); window.removeEventListener('beforeprint', L.print);
    window.removeEventListener('beforeunload', L.unload); window.removeEventListener('pagehide', L.hide);
    window.removeEventListener('popstate', L.pop); window.removeEventListener('hashchange', L.hash);
    clearInterval(timerId); clearInterval(hbId);
  }

  function showGate() {
    const g = $('#exGate'); if (!g) return;
    g.hidden = false;
    g.innerHTML = `<div class="ex-modal-card"><h2>Return to full screen</h2><p class="muted">Strict mode needs the exam in full screen. The timer is still running.</p><button class="btn primary lg" data-x="gateBack">Return to full screen</button></div>`;
  }
  const hideGate = () => { const g = $('#exGate'); if (g) g.hidden = true; };

  function violate(kind) {
    const r = R(); if (!r || r.finishing) return;
    const now = Date.now();
    if (now - r.lastViol < 1500) return;
    r.lastViol = now;
    r.E.viol.push({ t: now, k: kind }); persist();
    const n = r.E.viol.length, max = r.E.maxViol;
    const c = $('#exWarnCount'); if (c) c.textContent = n;
    const w = $('#exWarn');
    if (w) { w.hidden = false; w.textContent = `Warning ${n}${max ? ' of ' + max : ''}: ${kind}.${max && n >= max ? ' Submitting…' : max ? ` ${max - n} left before the exam is submitted.` : ''}`; setTimeout(() => { if (w) w.hidden = true; }, 6000); }
    if (max && n >= max) finish('violations');
  }

  /* ---------- Finishing, results ---------- */
  function computeResult(E, Q, reason) {
    const sub = {}, secs = {}, items = [], numSeen = {};
    let score = 0, max = 0, correct = 0, wrong = 0, partial = 0, skipped = 0, bonus = 0;
    for (const q of Q) {
      const e = E.ans[q.id] || { sel: [], val: '', st: 0, t: 0 }, g = grade(q, e, E), sec = secOfKind(kindCode(q));
      const lim = E.lim[q.subject]; let counts = true;
      if (lim && q.kind === 'number') { numSeen[q.subject] = (numSeen[q.subject] || 0) + 1; counts = numSeen[q.subject] <= lim; }
      const S = (sub[q.subject] ||= { score: 0, max: 0, c: 0, w: 0, p: 0, u: 0, b: 0, t: 0 }), T = (secs[`${q.subject}|${sec}`] ||= { score: 0, max: 0, c: 0, w: 0, p: 0, u: 0, b: 0, t: 0 });
      if (counts) { max += g.mk.plus; S.max += g.mk.plus; T.max += g.mk.plus; }
      score += g.score; S.score += g.score; T.score += g.score; S.t += e.t || 0; T.t += e.t || 0;
      const key = { c: 'c', w: 'w', p: 'p', u: 'u', b: 'b' }[g.res];
      S[key]++; T[key]++;
      if (g.res === 'c') correct++; else if (g.res === 'w') wrong++; else if (g.res === 'p') partial++; else if (g.res === 'b') bonus++; else skipped++;
      items.push({ i: q.id, s: e.sel || [], v: e.val || '', st: e.st, t: Math.round(e.t || 0), sc: g.score, r: g.res, ug: g.ungradable ? 1 : 0 });
    }
    const usedMs = Math.min(Date.now(), E.endsAt) - E.startedAt;
    return { id: E.id, title: E.title, examKind: E.examKind, pattern: E.pattern, date: Date.now(), usedMs, durationMin: E.durationMin, reason, score: Math.round(score * 100) / 100, max, correct, wrong, partial, skipped, bonus, subjects: sub, secs, items, viol: E.viol, strict: E.strict, ids: E.ids, paths: E.paths, lim: E.lim, source: E.source, paperId: E.paperId };
  }

  function recordAttempts(res, Q) {
    const byId = new Map(res.items.map(x => [x.i, x]));
    for (const q of Q) { const it = byId.get(q.id); if (it && ['c', 'w', 'p'].includes(it.r)) JW.recordAttempt(q, { correct: it.r === 'c', score: it.sc, spent: it.t }); }
  }

  function teardown() {
    disarmRun(); clearTimeout(saveT);
    closeSubmit();
    X.run = null;
    exitFullscreen();
    document.body.classList.remove('ex-lock');
    const el = $('#exRun'); if (el) { el.hidden = true; el.innerHTML = ''; }
  }

  function finish(reason) {
    const r = R(); if (!r || r.finishing) return;
    r.finishing = true; tickTime();
    const { E, Q } = r;
    const res = computeResult(E, Q, reason);
    saveResult(res); recordAttempts(res, Q);
    store.del(K.active);
    teardown();
    location.replace('#/exam/result/' + res.id);
    if (reason === 'time') toast('Time is up — your exam was submitted.');
    if (reason === 'violations') toast('Too many warnings — your exam was submitted.');
  }

  async function loadQs(paths, ids) {
    await JW.loadFiles(paths);
    return ids.map(id => JW.byId(id)).filter(Boolean);
  }

  async function finishStored(a, reason) {
    const Q = await loadQs(a.paths, a.ids);
    const E = { ...a }; E.ids = Q.map(q => q.id);
    const res = computeResult(E, Q, reason);
    saveResult(res); recordAttempts(res, Q); store.del(K.active);
    location.replace('#/exam/result/' + res.id);
  }

  /* ---------- Resume after reload ---------- */
  async function resumeGate() {
    if (X.run) { showRun(); return; }
    const a = readActive();
    if (!a) { location.replace('#/exam'); return; }
    if (Date.now() >= a.endsAt) { loadingView('Your time ran out. Submitting…'); try { await finishStored(a, 'time'); } catch { store.del(K.active); location.replace('#/exam'); } return; }
    view(`<div class="empty ex-resume-card"><strong>${esc(a.title)}</strong><span>${clock(a.endsAt - Date.now())} left · ${Object.values(a.ans || {}).filter(x => x.st === 2 || x.st === 4).length} of ${a.ids.length} answered</span>
      ${a.strict ? '<span class="muted">Strict mode: coming back after leaving counts as a warning.</span>' : ''}
      <button class="btn primary lg" id="exResume">${icon('play')}Resume exam</button><button class="btn ghost sm" id="exSubmitOld">Submit now</button></div>`);
    hydrateIcons($('#view'));
    $('#exResume').onclick = async () => {
      $('#exResume').disabled = true;
      if (a.fs) enterFullscreen();
      const Q = await loadQs(a.paths, a.ids);
      if (!Q.length) { toast('Could not load the questions.'); $('#exResume').disabled = false; return; }
      a.ids = Q.map(q => q.id);
      startRun(a, Q, true);
      if (a.strict) violate('page was reloaded or reopened');
    };
    $('#exSubmitOld').onclick = () => finishStored(a, 'submit').catch(() => { store.del(K.active); location.replace('#/exam'); });
  }

  /* ===================== Result & review ===================== */
  const RC = { id: '', map: null, filter: 'all' };
  const RES = { c: ['ok', 'Correct'], w: ['bad', 'Wrong'], p: ['warn', 'Partial'], u: ['', 'Not attempted'], b: ['new', 'Bonus'] };
  const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtN(Math.abs(n));

  async function pageResult(id, n, token) {
    const res = getResults().find(r => r.id === id);
    if (!res) { location.replace('#/exam/mine'); return; }
    if (n === undefined) return resultSummary(res);
    loadingView('Opening review…');
    if (RC.id !== id || !RC.map) {
      const qs = await loadQs(res.paths, res.ids);
      if (!JW.isCurrent(token)) return;
      RC.id = id; RC.map = new Map(qs.map(q => [q.id, q]));
    }
    resultReview(res, clamp(Number(n) || 0, 0, res.items.length - 1));
  }

  function resultSummary(res) {
    const subs = Object.keys(res.subjects).sort((a, b) => (SUBJ.indexOf(a) + 1 || 99) - (SUBJ.indexOf(b) + 1 || 99));
    const attempted = res.correct + res.wrong + res.partial;
    const reasonTxt = { time: 'Time ran out', violations: 'Submitted after too many warnings', submit: 'Submitted' }[res.reason] || 'Submitted';
    const row = (name, S) => `<tr><td>${esc(name)}</td><td><b>${sgn(S.score).replace(/^\+/, '')}</b> / ${fmtN(S.max)}</td><td class="ok">${S.c}</td><td class="bad">${S.w}</td><td>${S.p || 0}</td><td>${S.u}</td><td>${nice(S.t)}</td>
      <td class="ex-bar-c"><span class="ex-meter"><i style="width:${clamp(pctOf(Math.max(0, S.score), S.max), 0, 100)}%"></i></span></td></tr>`;
    const tableHead = '<thead><tr><th></th><th>Marks</th><th>Correct</th><th>Wrong</th><th>Partial</th><th>Skipped</th><th>Time</th><th></th></tr></thead>';
    const secRows = Object.entries(res.secs).sort(([a], [b]) => a.localeCompare(b)).map(([k, S]) => { const [s, sec] = k.split('|'); return row(`${s} · ${sec === 'mcq' ? 'Section A' : 'Section B'}`, S); }).join('');
    const perIdx = res.items.map((it, k) => `<a class="ex-dot r-${it.r}" href="#/exam/result/${esc(res.id)}/${k}" title="${RES[it.r][1]}">${k + 1}</a>`).join('');
    view(`<div class="ex-result"><a class="btn ghost sm" href="#/exam/mine">${icon('left')}All results</a>
      <div class="ex-hero card"><div><div class="eyebrow">${esc(reasonTxt)} · ${new Date(res.date).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div><h1>${esc(res.title)}</h1>
        <div class="ex-chips"><span class="chip">${nice(res.usedMs)} of ${res.durationMin} min</span>${res.strict ? '<span class="chip warn">Strict mode</span>' : ''}${res.viol?.length ? `<span class="chip bad">${res.viol.length} warning${res.viol.length > 1 ? 's' : ''}</span>` : ''}</div></div>
        <div class="ex-score"><b>${fmtN(res.score)}</b><span>/ ${fmtN(res.max)}</span><div class="ex-meter big"><i style="width:${clamp(pctOf(Math.max(0, res.score), res.max), 0, 100)}%"></i></div></div></div>
      <div class="grid cols-4 ex-stats"><div class="card"><b class="ok">${res.correct}</b><span>Correct</span></div><div class="card"><b class="bad">${res.wrong}</b><span>Wrong</span></div>
        <div class="card"><b>${res.skipped}</b><span>Not attempted</span></div><div class="card"><b>${pctOf(res.correct, attempted)}%</b><span>Accuracy</span></div></div>
      ${res.partial || res.bonus ? `<p class="muted" style="margin-top:10px">${res.partial ? `${res.partial} partially correct` : ''}${res.partial && res.bonus ? ' · ' : ''}${res.bonus ? `${res.bonus} bonus` : ''}</p>` : ''}
      <h2 class="section-title">Subject-wise</h2><div class="card ex-scroll"><table class="ex-table">${tableHead}<tbody>${subs.map(s => row(s, res.subjects[s])).join('')}</tbody></table></div>
      <h2 class="section-title">Section-wise</h2><div class="card ex-scroll"><table class="ex-table">${tableHead}<tbody>${secRows}</tbody></table></div>
      <h2 class="section-title">Question map</h2><div class="card"><div class="ex-legend r"><span><i class="r-c"></i>Correct</span><span><i class="r-w"></i>Wrong</span><span><i class="r-p"></i>Partial</span><span><i class="r-u"></i>Not attempted</span></div><div class="ex-dots">${perIdx}</div></div>
      ${res.viol?.length ? `<h2 class="section-title">Warnings</h2><div class="card"><ul class="ex-viol">${res.viol.map(v => `<li><b>${new Date(v.t).toLocaleTimeString()}</b> ${esc(v.k)}</li>`).join('')}</ul></div>` : ''}
      <div class="ex-actions"><a class="btn primary" href="#/exam/result/${esc(res.id)}/0">Review all answers</a><button class="btn" data-x="reviewWrong" data-id="${esc(res.id)}">Review mistakes</button>
        <button class="btn" data-x="retake" data-id="${esc(res.id)}">${icon('retry')}Retake this paper</button><a class="btn ghost" href="#/exam">More exams</a></div></div>`);
    hydrateIcons($('#view'));
  }

  const matchFilter = (it, f) => f === 'all' || (f === 'w' && (it.r === 'w' || it.r === 'p')) || (f === 'u' && it.r === 'u') || (f === 'c' && it.r === 'c') || (f === 'm' && (it.st === 3 || it.st === 4));

  function resultReview(res, k) {
    const idxs = res.items.map((it, j) => j).filter(j => matchFilter(res.items[j], RC.filter) || j === k);
    const pos = idxs.indexOf(k), prev = idxs[pos - 1], next = idxs[pos + 1];
    const it = res.items[k], q = RC.map.get(it.i), href = j => `#/exam/result/${esc(res.id)}/${j}`;
    const [cls, label] = RES[it.r];
    let body;
    if (!q) body = '<div class="empty"><strong>This question is no longer in the library.</strong></div>';
    else {
      const d = JW.qd(q), kc = kindCode(q), correct = JW.qCorrect(q), expl = d.explanation || JW.langBlock(q.raw, 'en').explanation || '';
      const picked = it.s || [];
      const optionsHtml = kc === 'n'
        ? `<div class="result ${it.r === 'c' ? 'ok' : it.r === 'u' ? 'info' : 'bad'}"><div>Your answer: <b>${esc(it.v || '—')}</b> · Correct answer: <b>${esc(JW.qAnswer(q) || 'n/a')}</b></div></div>`
        : `<div class="options">${JW.qOptions(q).map(o => `<div class="opt ${correct.includes(o.id) ? 'right' : picked.includes(o.id) ? 'wrong' : ''}"><span class="key">${esc(o.id)}</span><span class="txt">${JW.sanitize(o.html)}</span>${picked.includes(o.id) ? '<span class="chip ex-you">Your answer</span>' : ''}</div>`).join('')}</div>`;
      body = `<div class="prompt" id="exRevQ">${JW.sanitize(d.content || '')}</div>${[d.direction, d.comprehension].filter(Boolean).map(h => `<div class="callout">${JW.sanitize(h)}</div>`).join('')}${optionsHtml}
        ${expl ? `<div class="result info"><h3>Solution</h3><div class="explain">${JW.sanitize(expl)}</div></div>` : ''}`;
    }
    view(`<div class="ex-review"><div class="ex-rev-head"><a class="btn ghost sm" href="#/exam/result/${esc(res.id)}">${icon('left')}Result</a>
      <div class="ex-filters">${[['all', 'All'], ['w', 'Wrong'], ['u', 'Skipped'], ['c', 'Correct'], ['m', 'Marked']].map(([f, l]) => `<button class="${RC.filter === f ? 'active' : ''}" data-x="rf" data-f="${f}" data-id="${esc(res.id)}">${l}</button>`).join('')}</div></div>
      <div class="ex-qhead"><b>${q ? esc(q.subject) + ' · ' : ''}Q${k + 1} of ${res.items.length}</b>${q ? `<span class="chip">${KIND[kindCode(q)]}</span>` : ''}<span class="chip ${cls}">${label} ${it.r === 'u' ? '' : sgn(it.sc)}</span><span class="chip">${nice(it.t)}</span></div>
      ${body}
      <div class="ex-rev-nav"><a class="btn ${prev == null ? 'disabled' : ''}" ${prev == null ? 'aria-disabled="true"' : `href="${href(prev)}"`}>${icon('left')}Previous</a><span class="muted">${pos + 1} / ${idxs.length}</span><a class="btn primary ${next == null ? 'disabled' : ''}" ${next == null ? 'aria-disabled="true"' : `href="${href(next)}"`}>Next${icon('right')}</a></div></div>`);
    hydrateIcons($('#view'));
    JW.typeset($('#view'));
  }

  function retake(id) {
    const res = getResults().find(r => r.id === id); if (!res) return;
    ensureIndex().then(() => {
      const byId = new Map(X.rows.map(r => [r.id, r]));
      const rows = res.ids.map(i => byId.get(i)).filter(Boolean);
      if (!rows.length) { toast('Those questions are no longer in the library.'); return; }
      beginDraft({ title: res.title, rows, pattern: res.pattern === 'main' ? 'main' : 'orig', examKind: res.examKind, year: 0, source: res.source || 'custom', paperId: res.paperId, sortByNumber: res.source === 'paper', durationMin: res.durationMin });
    }).catch(() => toast('Could not open the exam list.'));
  }

  /* ===================== Events for the pages ===================== */
  const redraw = () => { if (PV.tab === 'new') drawBuilder(); };
  document.addEventListener('click', ev => {
    const b = ev.target.closest('#view [data-x]'); if (!b) return;
    const d = b.dataset, s = d.s;
    switch (d.x) {
      case 'paper': startPaper(d.id); break;
      case 'more': PV.limit += 24; drawPapers(); break;
      case 'begin': onBegin(); break;
      case 'pat': B.pattern = d.v; redraw(); break;
      case 'src': B.src = d.v; B.chap = { Physics: null, Chemistry: null, Mathematics: null }; B.chapOpen = ''; redraw(); break;
      case 'chapOpen': B.chapOpen = B.chapOpen === s ? '' : s; redraw(); break;
      case 'chapAll': B.chap[s] = null; redraw(); break;
      case 'chap': { const cur = B.chap[s] || new Set(); if (cur.has(d.k)) cur.delete(d.k); else cur.add(d.k); B.chap[s] = cur.size ? cur : null; redraw(); break; }
      case 'mix': B.mix = d.v; redraw(); break;
      case 'cnt': B.counts[s][d.k] = clamp(B.counts[s][d.k] + Number(d.d), 0, 40); redraw(); break;
      case 'advN': B.advN = clamp(B.advN + Number(d.d), 4, 40); redraw(); break;
      case 'gen': onGenerate(); break;
      case 'delRes': store.set(K.results, getResults().filter(r => r.id !== d.id)); drawMine(); break;
      case 'delPaper': store.set(K.papers, getPapers().filter(p => p.id !== d.id)); drawMine(); break;
      case 'again': startSaved(d.id); break;
      case 'retake': retake(d.id); break;
      case 'reviewWrong': RC.filter = 'w'; { const res = getResults().find(r => r.id === d.id); const k = res.items.findIndex(it => matchFilter(it, 'w')); location.hash = `#/exam/result/${d.id}/${Math.max(0, k)}`; } break;
      case 'rf': { RC.filter = d.f; const res = getResults().find(r => r.id === d.id); const k = res.items.findIndex(it => matchFilter(it, d.f)); if (k >= 0) location.hash = `#/exam/result/${d.id}/${k}`; else { toast('No questions in this group.'); RC.filter = 'all'; } break; }
      default: break;
    }
  });
  document.addEventListener('change', ev => {
    const t = ev.target, x = t.dataset?.x;
    if (t.id === 'exYear') { PV.year = t.value; PV.limit = 24; drawPapers(); }
    else if (t.id === 'exBDur') { B.dur = clamp(Math.round(Number(t.value) || 0), 0, 400); }
    else if (x === 'sub') { const s = t.dataset.s; B.subjects = t.checked ? SUBJ.filter(v => B.subjects.includes(v) || v === s) : B.subjects.filter(v => v !== s); redraw(); }
    else if (x === 'type') { B.types[t.dataset.k] = t.checked; if (!B.types.s && !B.types.m && !B.types.x) B.types.s = true; redraw(); }
    else if (x === 'opt') { B[t.dataset.k] = t.checked; redraw(); }
  });
  let qTimer;
  document.addEventListener('input', ev => {
    if (ev.target.id !== 'exSearch') return;
    clearTimeout(qTimer); const v = ev.target.value;
    qTimer = setTimeout(() => { PV.q = v; PV.limit = 24; drawPapers(); const el = $('#exSearch'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 150);
  });

  window.JWE = { page, active: () => !!X.run };
})();
