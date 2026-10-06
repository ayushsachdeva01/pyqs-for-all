(() => {
  'use strict';

  const KEY = {
    attempts: 'jeePractice_attempts_v3',
    bookmarks: 'jeePractice_bookmarks_v3',
    review: 'jeePractice_review_v3',
    sessions: 'jeePractice_sessions_v3',
    active: 'jeePractice_sessions_v3__active',
    theme: 'jeePractice_theme_v3',
    snapshotSettings: 'jeePractice_snapshot_settings_v1'
  };

  const $ = id => document.getElementById(id);

  const shortcutsBtn = $('shortcutsBtn');
  const shortcutsModal = $('shortcutsModal');
  const closeShortcutsModal = $('closeShortcutsModal');

  shortcutsBtn?.addEventListener('click', () => {
    shortcutsModal?.classList.remove('hidden');
  });

  closeShortcutsModal?.addEventListener('click', () => {
    shortcutsModal?.classList.add('hidden');
  });

  shortcutsModal?.addEventListener('click', (event) => {
    if (event.target === shortcutsModal) {
      shortcutsModal.classList.add('hidden');
    }
  });

  const DEFAULT_SNAPSHOT_SETTINGS = {
    showKicker: true,
    showTitle: true,
    showPaper: true,
    showBadges: true,
    showQuestionNumber: false,
    showQuestion: true,
    showOptions: true,
    showCorrectAnswer: false,
    showExplanation: false,
    showFooter: true,
    showLogo: false,
    logoData: '',
    footerText: 'Saved from JEE Practice',
    accent: '#6659f6',
    pageBg: '#070d1a',
    cardBg: '#0f1a30',
    text: '#f2f5fc',
    muted: '#8794ad',
    optionBg: '#151f35',
    border: '#344768',
    badgeBg: '#24224e',
    badgeText: '#aaa4ff',
    width: 1000,
    scale: 1.5,
    radius: 28,
    padding: 38,
    questionSize: 22,
    optionSize: 17
  };

  const state = {
    questions: [],
    exam: 'jee-main',
    subject: 'Physics',
    page: 'home',
    chapter: null,
    chapterFilter: 'all',
    chapterView: 'all',
    session: null,
    index: 0,
    timer: null,
    qStartedAt: 0,
    order: 'newest',
    resumeChoice: 'resume',
    detailFilters: {},
    modalReturnFocus: null,
    manifestFiles: [],
    loadedFiles: new Set(),
    loadingFiles: new Set(),
    manifestReady: false,
    libraryLoadGeneration: 0,
    imageExporting: new Set(),
    filePromises: new Map(),
    snapshotSettings: { ...DEFAULT_SNAPSHOT_SETTINGS },
    questionById: new Map(),
    questionIds: new Set(),
    attemptIndex: new Map(),
    bookmarkSet: new Set(),
    reviewSet: new Set(),
    storageLoaded: false,
    selected: new Set(),
    sessionCount: 20,
    exportJob: null,
    exportCancel: false,
    backgroundWarmupStarted: false,
    backgroundWarmupPaused: false,
    backgroundWarmupTimer: null
  };

  function read(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null || raw === '') return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      toast('Could not save changes on this device.');
      return false;
    }
  }

  function refreshStorageCaches() {
    const rawAttempts = read(KEY.attempts, []);
    const list = Array.isArray(rawAttempts) ? rawAttempts : [];
    state.attemptIndex = new Map();
    list.forEach(item => {
      if (!item?.questionId) return;
      const id = String(item.questionId);
      const bucket = state.attemptIndex.get(id);
      if (bucket) bucket.push(item); else state.attemptIndex.set(id, [item]);
    });
    const rawBookmarks = read(KEY.bookmarks, []);
    state.bookmarkSet = new Set(Array.isArray(rawBookmarks) ? rawBookmarks.map(String) : []);
    const rawReviews = read(KEY.review, []);
    state.reviewSet = new Set(Array.isArray(rawReviews) ? rawReviews.map(String) : []);
    state.storageLoaded = true;
  }

  function invalidateStorageCache(key) {
    if (key === KEY.attempts) {
      const raw = read(KEY.attempts, []);
      state.attemptIndex = new Map();
      (Array.isArray(raw) ? raw : []).forEach(item => {
        if (!item?.questionId) return;
        const id = String(item.questionId);
        const bucket = state.attemptIndex.get(id);
        if (bucket) bucket.push(item); else state.attemptIndex.set(id, [item]);
      });
    }
    if (key === KEY.bookmarks) {
      const raw = read(KEY.bookmarks, []);
      state.bookmarkSet = new Set(Array.isArray(raw) ? raw.map(String) : []);
    }
    if (key === KEY.review) {
      const raw = read(KEY.review, []);
      state.reviewSet = new Set(Array.isArray(raw) ? raw.map(String) : []);
    }
  }

  const attempts = () => {
    const value = read(KEY.attempts, []);
    return Array.isArray(value) ? value : [];
  };
  const bookmarks = () => state.bookmarkSet;
  const reviews = () => state.reviewSet;

  function snapshotSettings() {
    return { ...DEFAULT_SNAPSHOT_SETTINGS, ...(state.snapshotSettings || {}) };
  }

  function persistSnapshotSettings() {
    write(KEY.snapshotSettings, snapshotSettings());
  }

  function loadSnapshotSettings() {
    const saved = read(KEY.snapshotSettings, {});
    state.snapshotSettings = { ...DEFAULT_SNAPSHOT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  }

  function normalize(list) {
    return (Array.isArray(list) ? list : []).map((q, i) => ({
      ...q,
      _id: String(q.question_id ?? q.id ?? `q-${i}`),
      _exam: q.exam || 'jee-main',
      _subject: title(q.subject || 'Unknown'),
      _chapter: title(q.chapter || 'Uncategorized'),
      _topic: title(q.topic || 'General'),
      _year: Number(q.year || 0),
      _difficulty: title(q.difficulty || 'Unknown'),
      _type: title(q.type || 'Unknown'),
      _group: title(q.chapterGroup || 'Other'),
      _marks: Number.isFinite(Number(q.marks)) ? Number(q.marks) : 4,
      _negMarks: Number.isFinite(Number(q.negMarks)) ? Number(q.negMarks) : 0
    })).map(q => {
      const plain = strip(qLang(q)?.content || '');
      q._plainText = plain;
      q._searchText = `${plain} ${q._topic} ${q._chapter} ${q.paperTitle || ''}`.toLowerCase();
      return q;
    });
  }

  function dedupeQuestions(list) {
    const map = new Map();
    list.forEach(q => map.set(q._id, q));
    return [...map.values()];
  }

  function title(value) {
    return String(value).replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  }

  function strip(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  function qLang(q) {
    const question = q?.question;
    if (!question) return {};
    if (question.en) return question.en;
    if (question.hi) return question.hi;
    return question;
  }

  function qtext(q) { return qLang(q)?.content || ''; }

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html ?? '');
    const blocked = new Set(['script', 'iframe', 'object', 'embed', 'applet', 'base', 'meta', 'link']);
    template.content.querySelectorAll('*').forEach(element => {
      if (blocked.has(element.tagName.toLowerCase())) {
        element.remove();
        return;
      }
      [...element.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on') || name === 'srcdoc') {
          element.removeAttribute(attribute.name);
          return;
        }
        if (['href', 'src', 'xlink:href', 'action', 'formaction'].includes(name)) {
          if (/^\s*(javascript|vbscript|data:text\/html)/i.test(value)) {
            element.removeAttribute(attribute.name);
          } else if (name === 'src' && value && /^(javascript|vbscript|data:text\/html):/i.test(value)) {
            element.removeAttribute(attribute.name);
          } else if (name === 'href' && value && /^(javascript|vbscript|data:text\/html):/i.test(value)) {
            element.removeAttribute(attribute.name);
          }
        }
        if (name === 'style' && /url\s*\(|expression\s*\(|behavior\s*:|-moz-binding/i.test(value)) {
          element.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  }

  function qopts(q) {
    const options = qLang(q)?.options || [];
    return options.map((option, index) => {
      if (option && typeof option === 'object') {
        return {
          identifier: String(option.identifier ?? String.fromCharCode(65 + index)),
          content: String(option.content ?? '')
        };
      }
      return {
        identifier: String.fromCharCode(65 + index),
        content: String(option ?? '')
      };
    });
  }

  function qcorrect(q) { return (qLang(q)?.correct_options || []).map(String); }
  function qanswer(q) { return qLang(q)?.answer ?? ''; }
  function qexplain(q) { return qLang(q)?.explanation || ''; }

  function questionMarks(q) {
    return {
      correct: Math.max(0, Number(q?._marks) || 0),
      incorrect: Math.max(0, Number(q?._negMarks) || 0)
    };
  }

  function scoreForResult(q, correct, submitted = true) {
    if (!submitted) return 0;
    const marks = questionMarks(q);
    return correct ? marks.correct : -marks.incorrect;
  }

  function attemptScore(item) {
    if (Number.isFinite(Number(item?.score))) return Number(item.score);
    const q = state.questions.find(x => x._id === item?.questionId);
    return q ? scoreForResult(q, !!item.correct, true) : 0;
  }

  function prettyExam(exam) { return exam === 'jee-advanced' ? 'JEE Advanced' : 'JEE Main'; }
  function prettyYear(year) {
    const value = Number(year);
    return Number.isFinite(value) && value > 0 ? String(value) : 'Year not specified';
  }
  function paperLabel(q) {
    const paper = q?.paperTitle || '';
    return paper ? strip(paper) : '';
  }
  function yearRange(list) {
    const years = [...new Set(list.map(q => Number(q._year)).filter(y => Number.isFinite(y) && y > 0))].sort((a, b) => b - a);
    if (!years.length) return 'Years unavailable';
    if (years.length === 1) return String(years[0]);
    return `${years[years.length - 1]}–${years[0]}`;
  }
  function examQs() { return state.questions.filter(q => q._exam === state.exam); }
  function allSubjects() { return ['Physics', 'Chemistry', 'Mathematics']; }
  function subjects() {
    const manifestSubjects = state.manifestFiles
      .filter(file => file.exam === state.exam)
      .map(file => file.subject);
    return [...new Set(manifestSubjects.length ? manifestSubjects : allSubjects().filter(s => state.questions.some(q => q._exam === state.exam && q._subject === s)))];
  }

  function manifestFilesFor(exam, subject = '') {
    return state.manifestFiles.filter(file => file.exam === exam && (!subject || file.subject === subject));
  }

  function manifestStats(exam, subject = '') {
    const files = manifestFilesFor(exam, subject);
    return {
      files,
      questions: files.reduce((sum, file) => sum + file.count, 0),
      chapters: new Set(files.map(file => file.chapter)).size
    };
  }

  function isExamFullyLoaded(exam) {
    const files = manifestFilesFor(exam);
    return files.length > 0 && files.every(file => state.loadedFiles.has(file.name));
  }

  function getAttempts(id) { return state.attemptIndex.get(String(id)) || []; }
  function lastAttempt(id) {
    const list = getAttempts(id);
    return list[list.length - 1] || null;
  }

  function accuracyFor(qs) {
    const ids = new Set(qs.map(q => q._id));
    const list = attempts().filter(a => ids.has(a.questionId));
    return list.length ? Math.round(list.filter(a => a.correct).length / list.length * 100) : 0;
  }

  function formatTime(ms) {
    let seconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
    let minutes = Math.floor(seconds / 60);
    seconds %= 60;
    const hours = Math.floor(minutes / 60);
    minutes %= 60;
    return hours
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function toast(message) {
    const element = $('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 2200);
  }

  async function init() {
    loadSnapshotSettings();
    refreshStorageCaches();
    initTheme();
    bind();
    renderExamTabs();
    renderHome();
    showPage('home');
    await loadQuestionLibrary();
    renderExamTabs();
    renderHome();
    showPage(state.page || 'home');
  }

  async function loadQuestionLibrary() {
    const base = new URL('./questions/', document.baseURI);
    const generation = ++state.libraryLoadGeneration;
    const splashStartedAt = performance.now();
    showLibraryLoading(8);

    try {
      const manifestResponse = await fetch(new URL('manifest.json', base), { cache: 'default' });
      if (!manifestResponse.ok) throw new Error('Question manifest unavailable');
      const manifest = await manifestResponse.json();
      const files = Array.isArray(manifest) ? manifest : manifest.files;
      if (!Array.isArray(files)) throw new Error('Invalid question manifest');

      state.manifestFiles = files.map(entry => {
        if (typeof entry === 'string') {
          const parts = entry.split('/');
          const subject = parts[0] || 'Unknown';
          const examLabel = parts[1] || '';
          const exam = /advanced/i.test(examLabel) ? 'jee-advanced' : 'jee-main';
          const fileName = parts[parts.length - 1] || entry;
          const chapterSlug = fileName.replace(/_\d+q\.json$/i, '');
          const countMatch = fileName.match(/_(\d+)q\.json$/i);
          return { name: entry, subject, exam, chapter: title(chapterSlug), count: Number(countMatch?.[1] || 0), group: 'Chapters' };
        }
        return {
          name: entry.path || entry.name,
          subject: entry.subject || 'Unknown',
          exam: entry.exam || (/advanced/i.test(entry.examName || '') ? 'jee-advanced' : 'jee-main'),
          chapter: entry.chapter || title(String(entry.name || '').split('/').pop()?.replace(/_\d+q\.json$/i, '') || 'Chapter'),
          count: Number(entry.count || 0),
          group: entry.group || 'Chapters'
        };
      }).filter(file => file.name);
      state.manifestReady = true;

      refreshStorageCaches();
      renderExamTabs();
      populateAllFilters();
      renderHome();

      // The launch screen is intentionally independent from the question data.
      // It stays solid for exactly 1.8s, while the tiny manifest is fetched.
      const remaining = Math.max(0, 1800 - (performance.now() - splashStartedAt));
      await new Promise(resolve => setTimeout(resolve, remaining));
      hideLibraryLoading();

      // Once the app is visible, progressively warm the browser cache in the
      // background. Only one file is parsed at a time so the UI remains snappy.
      startBackgroundWarmup(generation);
    } catch (error) {
      console.warn('Question manifest could not be loaded:', error);
      state.questions = [];
      const remaining = Math.max(0, 1800 - (performance.now() - splashStartedAt));
      await new Promise(resolve => setTimeout(resolve, remaining));
      hideLibraryLoading();
      toast('Could not load the question library. Check the questions folder.');
    }
  }

  async function loadManifestFiles(files, base, generation, options = {}) {
    const queue = files.filter(file => !state.loadedFiles.has(file.name));
    if (!queue.length) return;

    const concurrency = options.background ? 1 : Math.min(4, queue.length);
    let cursor = 0;
    let completed = 0;
    let failed = 0;

    const worker = async () => {
      while (cursor < queue.length) {
        if (options.background && state.backgroundWarmupPaused) return;
        const file = queue[cursor++];
        if (!file || generation !== state.libraryLoadGeneration) return;
        state.loadingFiles.add(file.name);
        try {
          let filePromise = state.filePromises.get(file.name);
          if (!filePromise) {
            filePromise = fetchQuestionFile(new URL(file.name, base));
            state.filePromises.set(file.name, filePromise);
            filePromise.then(() => state.filePromises.delete(file.name), () => state.filePromises.delete(file.name));
          }
          const payload = await filePromise;
          const normalized = normalize(extractQuestionArray(payload));
          if (normalized.length) {
            for (const q of normalized) {
              if (state.questionIds.has(q._id)) continue;
              state.questionIds.add(q._id);
              state.questionById.set(q._id, q);
              state.questions.push(q);
            }
          }
          state.loadedFiles.add(file.name);
        } catch (error) {
          failed += 1;
          console.warn(`Question file failed to load: ${file.name}`, error);
        } finally {
          state.loadingFiles.delete(file.name);
          completed += 1;
          if (!options.background) {
            showLibraryLoading(completed / queue.length * 100);
          }
          if (completed % 5 === 0 || completed === queue.length) {
            if (state.page === 'home') renderHome();
            if (state.page === 'chapters') renderChapters();
          }
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    if (failed) console.warn(`${failed} question file(s) failed to load.`);
  }

  async function ensureSubjectLoaded(exam, subject) {
    // Subject selection is manifest-only. Actual JSON is loaded when a chapter
    // is opened, keeping the chapters screen effectively instant.
    if (!state.manifestReady) return;
    state.subject = subject;
    if (state.page === 'chapters') renderChapters();
  }

  async function ensureExamLoaded(exam) {
    if (!state.manifestReady || isExamFullyLoaded(exam)) return;
    pauseBackgroundWarmup();
    const files = manifestFilesFor(exam).filter(file => !state.loadedFiles.has(file.name));
    if (!files.length) return;
    const generation = state.libraryLoadGeneration;
    const base = new URL('./questions/', document.baseURI);
    await loadManifestFiles(files, base, generation, { background: false });
    populateAllFilters();
    renderHome();
    resumeBackgroundWarmup(generation);
  }

  function startBackgroundWarmup(generation) {
    if (state.backgroundWarmupStarted || !state.manifestReady) return;
    state.backgroundWarmupStarted = true;
    state.backgroundWarmupPaused = false;
    const run = async () => {
      // Yield once so the first visible paint is never competing with parsing.
      await new Promise(resolve => setTimeout(resolve, 250));
      const base = new URL('./questions/', document.baseURI);
      const queue = state.manifestFiles.slice();
      for (const file of queue) {
        if (generation !== state.libraryLoadGeneration) return;
        while (state.backgroundWarmupPaused) {
          await new Promise(resolve => setTimeout(resolve, 120));
          if (generation !== state.libraryLoadGeneration) return;
        }
        if (state.loadedFiles.has(file.name)) continue;
        await loadManifestFiles([file], base, generation, { background: true });
        // Small idle gap: active navigation always gets priority over warmup.
        await new Promise(resolve => setTimeout(resolve, 90));
      }
    };
    run().catch(error => console.warn('Background question warmup stopped:', error));
  }

  function pauseBackgroundWarmup() {
    state.backgroundWarmupPaused = true;
  }

  function resumeBackgroundWarmup(generation = state.libraryLoadGeneration) {
    state.backgroundWarmupPaused = false;
    if (!state.backgroundWarmupStarted) startBackgroundWarmup(generation);
  }

  function showLibraryLoading(percent = 8) {
    if (!state.initialSplash) return;
    const overlay = $('libraryLoading');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const fill = $('libraryLoadingFill');
    if (fill) fill.style.width = `${Math.max(8, Math.min(100, percent))}%`;
  }

  function hideLibraryLoading() {
    const overlay = $('libraryLoading');
    if (!overlay) return;
    const fill = $('libraryLoadingFill');
    if (fill) fill.style.width = '100%';
    state.initialSplash = false;
    overlay.classList.add('hidden');
  }

  async function fetchQuestionFile(url) {
    const response = await fetch(url, { cache: 'default' });
    if (!response.ok) throw new Error(`Failed to load ${url.pathname}`);
    return response.json();
  }

  function extractQuestionArray(payload) {
    // Question JSON files may be wrapped in an API-style response such as:
    // { statusCode, total, results: [{ title, chapter, questions: [...] }] }.
    // Keep this loader tolerant of all supported formats.
    if (Array.isArray(payload)) return payload.flatMap(extractQuestionArray);
    if (!payload || typeof payload !== 'object') return [];

    if (Array.isArray(payload.questions)) return payload.questions;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) {
      return payload.results.flatMap(result => extractQuestionArray(result));
    }

    // A single question object is also a valid payload.
    if (payload.question_id || payload.id) return [payload];

    return [];
  }

  function debounce(fn, wait = 100) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  }

  function bind() {
    document.querySelectorAll('[data-page]').forEach(button => {
      button.onclick = () => showPage(button.dataset.page);
    });

    document.querySelectorAll('#examTabs button').forEach(button => {
      button.onclick = () => switchExam(button.dataset.exam);
    });

    $('cycleExam').onclick = () => switchExam(state.exam === 'jee-main' ? 'jee-advanced' : 'jee-main');
    $('quickPractice').onclick = () => openSession('all');
    $('weakPractice').onclick = () => openSession('weak');
    $('openAllQuestions').onclick = async () => { showPage('allQuestions'); await ensureExamLoaded(state.exam); showPage('allQuestions'); };
    $('allPractice').onclick = () => openSession('allFiltered');
    $('detailPractice').onclick = () => openSession(state.chapterView === 'mistakes' ? 'mistakes' : 'chapter');
    document.querySelectorAll('[data-chapter-view]').forEach(button => {
      button.onclick = () => {
        state.chapterView = button.dataset.chapterView;
        updateChapterViewTabs();
        const mistakes = getChapterMistakes();
        $('detailPractice').textContent = state.chapterView === 'mistakes' ? `Retry ${mistakes.length} mistake${mistakes.length === 1 ? '' : 's'}` : 'Start practice';
        $('detailPractice').disabled = state.chapterView === 'mistakes' && mistakes.length === 0;
        renderChapterQuestions();
      };
    });
    $('backToChapters').onclick = () => showPage('chapters');
    $('menuButton').onclick = () => $('sidebar').classList.toggle('open');
    $('themeButton').onclick = toggleTheme;
    // Snapshot/image export is temporarily disabled. Keep the implementation below for a future re-enable.
    /*
    $('openSnapshotSettings')?.addEventListener('click', openSnapshotSettings);
    $('snapshotReset')?.addEventListener('click', resetSnapshotSettings);
    $('snapshotLogoInput')?.addEventListener('change', handleSnapshotLogoUpload);
    */
    $('chapterSort').onchange = renderChapters;

    document.querySelectorAll('[data-close]').forEach(button => {
      button.onclick = () => closeModal(button.dataset.close);
    });
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', event => {
        if (event.target === modal) closeModal(modal.id);
      });
    });

    document.querySelectorAll('[data-order-choice]').forEach(button => {
      button.onclick = () => { state.order = button.dataset.orderChoice; document.querySelectorAll('[data-order-choice]').forEach(x => x.classList.toggle('active', x === button)); };
    });
    $('sessionCount')?.addEventListener('change', () => { state.sessionCount = Number($('sessionCount').value) || state._pool?.length || 20; updateSessionSummary(state._pool?.length || 0); });

    document.querySelectorAll('[data-resume-choice]').forEach(button => {
      button.onclick = () => {
        state.resumeChoice = button.dataset.resumeChoice;
        document.querySelectorAll('[data-resume-choice]').forEach(x => x.classList.toggle('active', x === button));
      };
    });

    document.querySelectorAll('[data-filter]').forEach(button => {
      button.onclick = () => {
        state.chapterFilter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === button));
        renderChapters();
      };
    });

    $('launchSession').onclick = launchSession;
    $('closePractice').onclick = closePractice;
    $('submitAnswer').onclick = submitAnswer;
    $('nextQuestion').onclick = nextQuestion;
    $('prevQuestion').onclick = prevQuestion;
    $('showAnswerToggle').onclick = toggleAnswer;
    $('bookmarkCurrent').onclick = () => toggleSaved('bookmark');
    $('reviewCurrent').onclick = () => toggleSaved('review');
    $('practiceThemeButton').onclick = toggleTheme;
    $('prevStrip').onclick = prevQuestion;
    $('nextStrip').onclick = nextQuestion;

    $('questionSearch').oninput = renderChapterQuestions;
    ['yearFilter', 'difficultyFilter', 'typeFilter'].forEach(id => $(id).onchange = renderChapterQuestions);
    $('clearQuestionFilters').onclick = () => {
      ['questionSearch', 'yearFilter', 'difficultyFilter', 'typeFilter'].forEach(id => $(id).value = '');
      renderChapterQuestions();
    };
    // JPG snapshot/export is temporarily disabled.
    /*
    $('exportChapterFiltered')?.addEventListener('click', () => openExportForQuestions(filteredChapterQuestions(), 'Filtered chapter questions'));
    $('exportChapterSelected')?.addEventListener('click', () => openExportForQuestions(filteredChapterQuestions().filter(q => state.selected.has(q._id)), 'Selected chapter questions'));
    */

    $('allSearch').oninput = debounce(() => { state.allRenderLimit = 400; renderAllQuestions(); }, 90);
    ['allSubject', 'allChapter', 'allYear', 'allStatus'].forEach(id => $(id).onchange = () => { state.allRenderLimit = 400; renderAllQuestions(); });
    $('clearAllFilters').onclick = () => {
      ['allSearch', 'allSubject', 'allChapter', 'allYear', 'allStatus'].forEach(id => $(id).value = '');
      state.allRenderLimit = 400;
      renderAllQuestions();
    };
    $('clearSelection')?.addEventListener('click', clearSelection);
    // JPG snapshot/export controls are intentionally disabled for now.
    /*
    $('exportSelected')?.addEventListener('click', () => openExportForQuestions([...state.selected].map(id => state.questionById.get(id)).filter(Boolean), 'Selected questions'));
    $('exportFiltered')?.addEventListener('click', () => openExportForQuestions(filteredAllQuestions(), 'Filtered questions'));
    $('exportStart')?.addEventListener('click', runExport);
    $('exportCancel')?.addEventListener('click', () => { if (state.exportJob?.running) state.exportCancel = true; else $('exportModal')?.classList.add('hidden'); });
    $('exportClose')?.addEventListener('click', closeExportModal);
    */

    document.addEventListener('keydown', keyboard);
  }

  function showPage(page) {
    state.page = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = $(page + 'Page');
    if (target) target.classList.add('active');
    document.querySelectorAll('.side-link[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    $('sidebar').classList.remove('open');

    if (page === 'home') renderHome();
    if (page === 'chapters') renderChapters();
    if (page === 'chapter') renderChapterQuestions();
    if (page === 'allQuestions') {
      renderAllQuestions();
      if (state.manifestReady && !isExamFullyLoaded(state.exam)) {
        ensureExamLoaded(state.exam).then(() => { if (state.page === 'allQuestions') renderAllQuestions(); });
      }
    }
    if (page === 'bookmarks') renderBookmarks();
    if (page === 'history') renderHistory();
    if (page === 'analytics') renderAnalytics();
  }

  async function switchExam(exam) {
    state.libraryLoadGeneration++;
    state.backgroundWarmupStarted = false;
    state.backgroundWarmupPaused = false;
    state.exam = exam;
    state.subject = allSubjects().find(subject => manifestFilesFor(exam, subject).length) || 'Physics';
    state.chapter = null;
    renderExamTabs();
    renderHome();
    showPage('home');
    populateAllFilters();
  }

  function renderExamTabs() {
    document.querySelectorAll('#examTabs button').forEach(b => b.classList.toggle('active', b.dataset.exam === state.exam));
    $('sideExam').textContent = prettyExam(state.exam);
  }

  function renderHome() {
    const qs = examQs();
    const examStats = manifestStats(state.exam);
    $('homeTitle').textContent = prettyExam(state.exam);
    $('sideExam').textContent = prettyExam(state.exam);
    const chapterLabel = examStats.chapters || new Set(qs.map(q => q._chapter)).size;
    $('homeSubtitle').textContent = `${examStats.questions.toLocaleString()} questions across ${chapterLabel} chapters · question data loads as needed and warms in the background · progress is stored locally on this device.`;

    const icons = { Physics: 'PHY', Chemistry: 'CHE', Mathematics: 'MAT' };
    $('subjectGrid').innerHTML = allSubjects().map(subject => {
      const data = qs.filter(q => q._subject === subject);
      const stats = manifestStats(state.exam, subject);
      const loaded = data.length > 0 || stats.files.length === 0;
      const questionCount = stats.questions || data.length;
      const chapterCount = stats.chapters || new Set(data.map(q => q._chapter)).size;
      const loadingCopy = loaded ? 'Chapter-wise questions with solutions, progress and personal timing.' : 'Opens instantly; chapter data loads only when needed.';
      return `<article class="subject-card ${questionCount ? '' : 'empty-subject'}" data-subject="${esc(subject)}">
        <div class="subject-top">
          <div class="subject-icon">${icons[subject]}</div>
          <h2>${subject}</h2>
          <p>${loadingCopy}</p>
          <div class="subject-meta"><span>${questionCount.toLocaleString()} questions</span><span>•</span><span>${chapterCount} chapters</span><span>•</span><span>${loaded && data.length ? esc(yearRange(data)) : 'On demand'}</span></div>
        </div>
        <button type="button" class="subject-open" data-open-subject="${esc(subject)}">${data.length ? 'Explore chapters' : 'Load & explore'} <span aria-hidden="true">→</span></button>
      </article>`;
    }).join('');

    const openSubject = subject => {
      if (!subject) return;
      state.subject = subject;
      state.chapter = null;
      state.chapterFilter = 'all';
      // Navigation must never wait for question JSON. The manifest already
      // contains the complete chapter/count index, so the chapters screen is
      // rendered immediately. Individual JSON files are loaded only when a
      // chapter is opened.
      showPage('chapters');
    };

    document.querySelectorAll('.subject-card').forEach(card => {
      card.addEventListener('click', event => {
        if (event.target.closest('.subject-open')) return;
        openSubject(card.dataset.subject);
      });
    });
    document.querySelectorAll('[data-open-subject]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openSubject(button.dataset.openSubject);
      });
    });

    const relevant = attempts().filter(a => qs.some(q => q._id === a.questionId));
    const attempted = new Set(relevant.map(a => a.questionId)).size;
    const correct = relevant.filter(a => a.correct).length;
    const saved = [...bookmarks()].filter(id => qs.some(q => q._id === id)).length;
    $('homeOverview').innerHTML = [
      ['Questions', examStats.questions || qs.length],
      ['Attempted', attempted],
      ['Accuracy', relevant.length ? `${Math.round(correct / relevant.length * 100)}%` : '—'],
      ['Bookmarks', saved]
    ].map(([label, value]) => `<div class="mini-stat"><b>${value}</b><span>${label}</span></div>`).join('');
  }

  function renderSubjectTabs() {
    $('subjectTabs').innerHTML = allSubjects().map(subject =>
      `<button class="${subject === state.subject ? 'active' : ''}" data-subject-tab="${esc(subject)}">${subject}</button>`
    ).join('');
    document.querySelectorAll('[data-subject-tab]').forEach(button => {
      button.onclick = () => {
        state.subject = button.dataset.subjectTab;
        renderChapters();
      };
    });
  }

  function latestAttemptsFor(qs) {
    const ids = new Set(qs.map(q => q._id));
    const latest = new Map();
    attempts().forEach(item => {
      if (ids.has(item.questionId)) latest.set(item.questionId, item);
    });
    return [...latest.values()];
  }

  function progressFor(qs) {
    const latest = latestAttemptsFor(qs);
    return {
      attempted: latest.length,
      correct: latest.filter(a => a.correct).length,
      wrong: latest.filter(a => !a.correct).length
    };
  }

  function updateChapterViewTabs() {
    document.querySelectorAll('[data-chapter-view]').forEach(button => {
      const active = button.dataset.chapterView === state.chapterView;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const badge = $('mistakeCountBadge');
    if (badge) badge.textContent = String(getChapterMistakes().length);
  }

  function getChapterMistakes() {
    if (!state.chapter) return [];
    const allQs = examQs().filter(q => q._subject === state.subject && q._chapter === state.chapter);
    const latest = latestAttemptsFor(allQs);
    const wrongIds = new Set(latest.filter(a => !a.correct).map(a => a.questionId));
    return allQs.filter(q => wrongIds.has(q._id));
  }

  function renderChapters() {
    renderSubjectTabs();
    $('chaptersTitle').textContent = `${state.subject} Chapters`;
    const filter = state.chapterFilter;
    const files = manifestFilesFor(state.exam, state.subject);
    const loaded = examQs().filter(q => q._subject === state.subject);
    const loadedByChapter = new Map();
    loaded.forEach(q => {
      const list = loadedByChapter.get(q._chapter);
      if (list) list.push(q); else loadedByChapter.set(q._chapter, [q]);
    });
    let chapters = files.map(file => {
      const data = loadedByChapter.get(file.chapter) || [];
      const count = file.count || data.length;
      const progress = data.length ? progressFor(data) : { attempted: 0, correct: 0, wrong: 0 };
      const accuracy = progress.attempted ? Math.round(progress.correct / progress.attempted * 100) : 0;
      return { chapter: file.chapter, data, count, attempted: progress.attempted, correct: progress.correct, wrong: progress.wrong, accuracy, weak: data.length > 0 && accuracy < 60, loaded: !!data.length };
    });
    if (filter === 'weak') chapters = chapters.filter(x => x.weak);
    if (filter === 'unattempted') chapters = chapters.filter(x => !x.loaded || x.attempted < x.count);
    const sort = $('chapterSort').value;
    if (sort === 'questions') chapters.sort((a, b) => b.count - a.count);
    if (sort === 'accuracy') chapters.sort((a, b) => (b.loaded ? b.accuracy : -1) - (a.loaded ? a.accuracy : -1));
    if (sort === 'weakness') chapters.sort((a, b) => (a.loaded ? a.accuracy : 101) - (b.loaded ? b.accuracy : 101));
    const groups = {};
    chapters.forEach(chapter => {
      const group = chapter.data[0]?._group || fileGroupForChapter(files, chapter.chapter) || 'Other';
      (groups[group] ??= []).push(chapter);
    });
    $('chapterGroups').innerHTML = Object.entries(groups).map(([group, items]) =>
      `<section class="chapter-group"><h2>${esc(title(group))}</h2><div class="chapter-grid">${items.map(chapterCard).join('')}</div></section>`
    ).join('') || '<div class="empty">No chapters match this filter.</div>';
    document.querySelectorAll('.chapter-card').forEach(card => card.onclick = () => openChapter(card.dataset.chapter));
  }

  function fileGroupForChapter(files, chapter) {
    return files.find(file => file.chapter === chapter)?.group || 'Chapters';
  }

  function chapterCard(item) {
    const correctPct = item.count ? (item.correct / item.count * 100) : 0;
    const wrongPct = item.count ? (item.wrong / item.count * 100) : 0;
    return `<article class="chapter-card" data-chapter="${esc(item.chapter)}">
      <div class="chapter-card-top">
        <div class="chapter-count"><b>${item.count.toLocaleString()}</b><span>Qs</span></div>
        <div class="chapter-card-info"><h3>${esc(item.chapter)}</h3>
          <div class="chapter-tags"><span class="tag">${esc(prettyExam(state.exam))}</span><span class="tag">${item.loaded ? esc(yearRange(item.data)) : 'On demand'}</span></div>
          <div class="chapter-progress"><span>${item.attempted}/${item.count} attempted · ${item.correct} correct · ${item.wrong} wrong${item.loaded ? '' : ' · not loaded yet'}</span><b>${item.attempted ? item.accuracy : 0}%</b></div>
        </div>
      </div>
      <div class="progress progress-multi" aria-label="${item.correct} correct, ${item.wrong} wrong, ${item.count - item.attempted} unattempted">
        <i class="progress-correct" style="width:${Math.min(100, correctPct)}%"></i><i class="progress-wrong" style="width:${Math.min(100 - Math.min(100, correctPct), wrongPct)}%"></i>
      </div>
      <div class="chapter-card-foot">Open chapter <span>→</span></div>
    </article>`;
  }

  async function openChapter(chapter) {
    state.chapter = chapter;
    state.chapterView = 'all';
    state.subject = state.subject || 'Physics';
    showPage('chapter');
    const files = manifestFilesFor(state.exam, state.subject).filter(file => file.chapter === chapter && !state.loadedFiles.has(file.name));
    if (files.length) {
      pauseBackgroundWarmup();
      const generation = state.libraryLoadGeneration;
      const base = new URL('./questions/', document.baseURI);
      renderChapterQuestions();
      await loadManifestFiles(files, base, generation, { background: false });
      if (state.page === 'chapter') renderChapterQuestions();
      resumeBackgroundWarmup(generation);
    }
  }

  function filteredChapterQuestions() {
    const allQs = examQs().filter(q => q._subject === state.subject && q._chapter === state.chapter);
    const qs = state.chapterView === 'mistakes' ? getChapterMistakes() : allQs;
    const search = $('questionSearch').value.trim().toLowerCase();
    const year = $('yearFilter').value; const difficulty = $('difficultyFilter').value; const type = $('typeFilter').value;
    return qs.filter(q => (!search || q._searchText.includes(search)) && (!year || String(q._year) === year) && (!difficulty || q._difficulty === difficulty) && (!type || q._type === type));
  }

  function renderChapterQuestions() {
    const allQs = examQs().filter(q => q._subject === state.subject && q._chapter === state.chapter);
    const manifestFile = manifestFilesFor(state.exam, state.subject).find(file => file.chapter === state.chapter);
    const manifestCount = manifestFile?.count || allQs.length;
    const qs = state.chapterView === 'mistakes' ? getChapterMistakes() : allQs;
    updateChapterViewTabs();
    $('detailSubject').textContent = state.subject.toUpperCase();
    $('detailTitle').textContent = state.chapter || 'Chapter';
    const mistakeCount = getChapterMistakes().length;
    const loadingText = allQs.length ? `${allQs.length} questions` : `${manifestCount.toLocaleString()} questions · loading when opened`;
    $('detailSub').textContent = `${state.chapterView === 'mistakes' ? 'Questions currently in your mistake list' : loadingText} · ${new Set(allQs.map(q => q._topic)).size} topics${allQs.length ? ` · ${yearRange(allQs)}` : ''}`;
    $('detailPractice').textContent = state.chapterView === 'mistakes' ? `Retry ${mistakeCount} mistake${mistakeCount === 1 ? '' : 's'}` : 'Start practice';
    $('detailPractice').disabled = state.chapterView === 'mistakes' ? mistakeCount === 0 : !allQs.length;

    const relevant = latestAttemptsFor(allQs);
    const correct = relevant.filter(a => a.correct).length;
    const avg = relevant.length ? Math.round(relevant.reduce((sum, a) => sum + (Number(a.timeMs) || 0), 0) / relevant.length) : 0;
    $('detailStats').innerHTML = [
      ['Questions', manifestCount],
      ['Attempted', relevant.length],
      ['Accuracy', relevant.length ? `${Math.round(correct / relevant.length * 100)}%` : '—'],
      ['Mistakes', mistakeCount]
    ].map(([label, value]) => `<div class="detail-stat"><span>${label}</span><b>${value}</b></div>`).join('');

    const selectedYear = $('yearFilter').value;
    const selectedDifficulty = $('difficultyFilter').value;
    const selectedType = $('typeFilter').value;

    const filterSource = qs.length ? qs : allQs;
    const years = [...new Set(filterSource.map(q => q._year).filter(Boolean))].sort((a, b) => b - a);
    $('yearFilter').innerHTML = '<option value="">All years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    $('yearFilter').value = years.some(y => String(y) === selectedYear) ? selectedYear : '';

    const difficulties = [...new Set(filterSource.map(q => q._difficulty))].sort();
    $('difficultyFilter').innerHTML = '<option value="">Difficulty</option>' + difficulties.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    $('difficultyFilter').value = difficulties.includes(selectedDifficulty) ? selectedDifficulty : '';

    const types = [...new Set(filterSource.map(q => q._type))].sort();
    $('typeFilter').innerHTML = '<option value="">Question type</option>' + types.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    $('typeFilter').value = types.includes(selectedType) ? selectedType : '';

    const filtered = filteredChapterQuestions();

    const grouped = {};
    filtered.forEach(q => (grouped[q._year || 'Other'] ??= []).push(q));
    $('chapterQuestions').innerHTML = Object.entries(grouped).sort((a, b) => Number(b[0]) - Number(a[0])).map(([yearKey, list]) =>
      `<section><h2 class="year-heading">${esc(yearKey)}</h2>${list.map((q, i) => questionRow(q, i)).join('')}</section>`
    ).join('') || (allQs.length ? `<div class="empty"><strong>${state.chapterView === 'mistakes' ? 'No mistakes here' : 'No questions match these filters.'}</strong><span>${state.chapterView === 'mistakes' ? 'Questions leave this tab automatically once your latest attempt is correct.' : ''}</span></div>` : `<div class="empty chapter-loading-state"><strong>Loading ${manifestCount.toLocaleString()} questions…</strong><span>This chapter is being loaded now. Other chapters stay lightweight until you open them.</span></div>`);

    bindQuestionRows();
    updateBulkExportControls();
  }

  function questionRow(q, index, options = {}) {
    const selectable = options.selectable !== false;
    const attempt = lastAttempt(q._id);
    const saved = bookmarks().has(q._id);
    const statusClass = attempt ? (attempt.correct ? 'row-correct' : 'row-wrong') : '';
    const status = attempt ? (attempt.correct ? 'Correct' : 'Wrong') : 'Unattempted';
    const text = q._plainText || strip(qtext(q));
    return `<article class="question-row ${statusClass} ${state.selected.has(q._id) ? 'row-selected' : ''}" data-open-q="${esc(q._id)}">
      ${selectable ? `<label class="q-select" data-select-control title="Select for export"><input type="checkbox" data-select-q="${esc(q._id)}" ${state.selected.has(q._id) ? 'checked' : ''}><span></span></label>` : ''}<div class="q-index">${index + 1}</div>
      <div class="q-row-content">
        <div class="q-text">${esc(text.slice(0, 420))}${text.length > 420 ? '…' : ''}</div>
        <div class="q-meta">
          <span class="q-exam">${esc(prettyExam(q._exam))}</span>
          <span class="q-year">${esc(prettyYear(q._year))}</span>
          ${paperLabel(q) ? `<span class="q-paper">${esc(paperLabel(q))}</span>` : ''}
          <span class="difficulty">${esc(q._difficulty)}</span>
          <span class="status-${attempt?.correct ? 'correct' : attempt ? 'wrong' : 'new'}">${status}</span>
        </div>
      </div>
      <div class="q-actions">
        <button class="tiny-action" data-bookmark-q="${esc(q._id)}" title="Bookmark" aria-label="Bookmark">${saved ? '★' : '☆'}</button>
        <button class="tiny-action image-action" data-save-image-q="${esc(q._id)}" title="Save as image" aria-label="Save question as image">⇩</button>
      </div>
    </article>`;
  }

  function bindQuestionRows() {
    document.querySelectorAll('[data-select-q]').forEach(input => {
      input.onchange = event => {
        event.stopPropagation();
        const id = input.dataset.selectQ;
        if (input.checked) state.selected.add(id); else state.selected.delete(id);
        input.closest('.question-row')?.classList.toggle('row-selected', input.checked);
        updateBulkExportControls();
      };
      input.onclick = event => event.stopPropagation();
    });
    document.querySelectorAll('[data-open-q]').forEach(button => {
      button.onclick = event => {
        if (event.target.closest('[data-bookmark-q], [data-save-image-q], [data-select-q], [data-select-control]')) return;
        const q = state.questionById.get(String(button.dataset.openQ));
        if (q) openSingle(q);
      };
    });
    document.querySelectorAll('[data-bookmark-q]').forEach(button => {
      button.onclick = event => {
        event.stopPropagation();
        toggleBookmark(button.dataset.bookmarkQ);
        if (state.page === 'chapter') renderChapterQuestions();
        if (state.page === 'allQuestions') renderAllQuestions();
        if (state.page === 'bookmarks') renderBookmarks();
      };
    });
    document.querySelectorAll('[data-save-image-q]').forEach(button => {
      button.onclick = async event => {
        event.stopPropagation();
        const q = state.questionById.get(String(button.dataset.saveImageQ));
        if (q) await saveQuestionAsImage(q, button);
      };
    });
  }

  function updateBulkExportControls() {
    const count = state.selected.size;
    document.querySelectorAll('[data-bulk-export]').forEach(button => {
      const chapterButton = button.id === 'exportChapterSelected';
      const visibleCount = chapterButton && state.chapter ? filteredChapterQuestions().filter(q => state.selected.has(q._id)).length : count;
      button.disabled = visibleCount === 0;
      button.textContent = visibleCount ? `Export selected · ${visibleCount}` : 'Export selected';
    });
    const filteredButton = $('exportFiltered');
    if (filteredButton) filteredButton.textContent = `Export filtered · ${filteredAllQuestions().length}`;
  }

  function clearSelection() {
    state.selected.clear();
    document.querySelectorAll('[data-select-q]').forEach(input => { input.checked = false; input.closest('.question-row')?.classList.remove('row-selected'); });
    updateBulkExportControls();
  }

  function openExportForQuestions(questions, label = 'Selected questions') {
    const unique = [...new Map(questions.map(q => [q._id, q])).values()];
    if (!unique.length) { toast('No questions to export.'); return; }
    state.exportJob = { questions: unique, label, totalSlides: unique.length * 2 };
    state.exportCancel = false;
    const modal = $('exportModal');
    if (!modal) return;
    $('exportTitle').textContent = label;
    $('exportTotal').textContent = `${unique.length} question${unique.length === 1 ? '' : 's'} · ${unique.length * 2} JPG slides`;
    $('exportProgressFill').style.width = '0%';
    $('exportPercent').textContent = '0%';
    $('exportCurrent').textContent = 'Ready to export';
    $('exportStatus').textContent = 'The app will stay responsive while slides are generated.';
    $('exportStart').disabled = false;
    $('exportCancel').disabled = false;
    modal.classList.remove('hidden');
  }

  function closeExportModal() {
    if (state.exportJob?.running) { state.exportCancel = true; return; }
    $('exportModal')?.classList.add('hidden');
    state.exportJob = null;
  }

  function nextFrame() { return new Promise(resolve => requestAnimationFrame(() => resolve())); }
  function yieldToBrowser() { return new Promise(resolve => setTimeout(resolve, 0)); }

  function exportCss() {
    return `.image-export-card{width:100%;box-sizing:border-box;background:var(--export-card);color:var(--export-text);border-radius:var(--export-radius);overflow:hidden;font-family:Inter,Arial,sans-serif}.image-export-header{box-sizing:border-box;padding:calc(var(--export-pad)*.9) var(--export-pad) calc(var(--export-pad)*.78);background:var(--export-accent);color:#fff;display:flex;align-items:flex-start;gap:24px}.image-export-header-copy{min-width:0}.image-export-logo{width:52px;height:52px;object-fit:contain;flex:0 0 52px;border-radius:10px;background:rgba(255,255,255,.12);padding:6px;box-sizing:border-box;order:2}.image-export-kicker{font-size:14px;line-height:20px;font-weight:800;letter-spacing:.02em}.image-export-title{margin-top:8px;font-size:29px;line-height:36px;font-weight:800}.image-export-paper{margin-top:6px;font-size:16px;line-height:24px;font-weight:500}.image-export-body{padding:calc(var(--export-pad)*.8) var(--export-pad) calc(var(--export-pad)*.72)}.image-export-badges{display:flex;flex-wrap:nowrap;white-space:nowrap;gap:9px;margin-bottom:22px}.image-export-badge{display:inline-flex;align-items:center;min-height:28px;padding:5px 12px;border-radius:999px;background:var(--export-badge);color:var(--export-badge-text);font-size:12px;line-height:18px;font-weight:700}.image-export-question{color:var(--export-text);font-size:var(--export-q-size);line-height:1.48;font-weight:650;overflow-wrap:anywhere}.image-export-question p{display:inline;margin:0}.image-export-question mjx-container{color:var(--export-text)!important}.image-export-question mjx-container[display=true]{margin:10px 0!important}.image-export-options{display:grid;gap:10px;margin-top:24px}.image-export-option{display:grid;grid-template-columns:40px minmax(0,1fr);align-items:center;gap:12px;box-sizing:border-box;min-height:58px;padding:12px 14px;border:1px solid var(--export-border);border-radius:13px;background:var(--export-option);color:var(--export-text);font-size:var(--export-option-size);line-height:1.5}.image-export-option-key{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;background:var(--export-badge);color:var(--export-badge-text);font-size:12px;font-weight:800}.image-export-option-content{min-width:0}.image-export-answer,.image-export-explanation{margin-top:18px;padding:16px;border:1px solid var(--export-border);border-radius:13px;background:var(--export-option);color:var(--export-text);font-size:15px;line-height:1.55}.image-export-answer{display:flex;gap:12px;align-items:center}.image-export-answer strong,.image-export-explanation strong{color:var(--export-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}.image-export-explanation strong{display:block;margin-bottom:8px}.image-export-footer{margin:0 var(--export-pad);padding:15px 0 24px;border-top:1px solid var(--export-border);color:var(--export-muted);font-size:12px;line-height:18px}`;
  }

  function makeImageExportStage(q, mode = 'question') {
    const s = snapshotSettings();
    const stage = document.createElement('div');
    stage.className = 'image-export-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.style.width = `${s.width}px`;
    stage.style.background = s.pageBg;
    stage.style.color = s.text;

    const options = qopts(q);
    const answer = qcorrect(q);
    const correctLabels = answer.length ? answer.join(', ') : (qanswer(q) || 'Not provided');
    const explanationText = qexplain(q) || 'No explanation is available for this question.';
    const meta = [q._difficulty || '', q._type || '', q._chapter || ''].filter(Boolean);

    const logo = s.showLogo && s.logoData
      ? `<img class="image-export-logo" src="${esc(s.logoData)}" alt="">`
      : '';

    const header = `
      <header class="image-export-header">
        ${logo}
        <div class="image-export-header-copy">
          ${s.showKicker ? '<div class="image-export-kicker">JEE PRACTICE · PYQ</div>' : ''}
          ${s.showTitle ? `<div class="image-export-title">${esc(prettyExam(q._exam))} · ${esc(q._subject || '')}</div>` : ''}
          ${s.showPaper ? `<div class="image-export-paper">${esc(prettyYear(q._year))}${paperLabel(q) ? ` · ${esc(paperLabel(q))}` : ''}</div>` : ''}
        </div>
      </header>`;

    const badges = s.showBadges && meta.length
      ? `<div class="image-export-badges">${meta.map(item => `<span class="image-export-badge">${esc(item)}</span>`).join('')}</div>`
      : '';

    const number = s.showQuestionNumber
      ? `<div class="image-export-number">Question ${esc(q._number || q.question_number || '')}</div>`
      : '';

    const question = `
      <div class="image-export-question">
        ${sanitizeHtml(qtext(q) || 'Question text unavailable.')}
      </div>`;

    const optionMarkup = options.length
      ? `<div class="image-export-options">${options.map(option => `
          <div class="image-export-option">
            <span class="image-export-option-key">${esc(option.identifier)}</span>
            <div class="image-export-option-content">${sanitizeHtml(option.content || '')}</div>
          </div>`).join('')}</div>`
      : '';

    /*
     * IMPORTANT:
     * Export is deliberately a strict two-slide sequence per question:
     *
     *   slide N   -> question + options
     *   slide N+1 -> answer + explanation
     *
     * The answer slide does NOT render the question/options again. This prevents
     * the old "answer slide looks like another question" behaviour.
     */
    let body;
    if (mode === 'answer') {
      body = `
        <div class="image-export-answer-page">
          <div class="image-export-answer-label">ANSWER</div>
          <div class="image-export-correct">${esc(correctLabels)}</div>
          <div class="image-export-explanation">
            <div class="image-export-explanation-title">Explanation</div>
            <div>${sanitizeHtml(explanationText)}</div>
          </div>
        </div>`;
    } else {
      body = `${badges}${number}${question}${optionMarkup}`;
    }

    stage.innerHTML = `
      <div class="image-export-card image-export-${mode}"
        style="--export-accent:${esc(s.accent)};
               --export-card:${esc(s.cardBg)};
               --export-text:${esc(s.text)};
               --export-muted:${esc(s.muted)};
               --export-option:${esc(s.optionBg)};
               --export-border:${esc(s.border)};
               --export-badge:${esc(s.badgeBg)};
               --export-badge-text:${esc(s.badgeText)};
               --export-radius:${s.radius}px;
               --export-pad:${s.padding}px;
               --export-q-size:${s.questionSize}px;
               --export-option-size:${s.optionSize}px">
        ${header}
        <div class="image-export-body">${body}</div>
        ${s.showFooter ? `<footer class="image-export-footer">${esc(s.footerText || '')}</footer>` : ''}
      </div>`;

    document.body.appendChild(stage);
    return stage;
  }

  async function fastDomToJpeg(card, quality = .92) {
    /*
     * JPG EXPORT RENDERER
     *
     * The previous SVG/foreignObject implementation looked attractive but is
     * not a safe rasterization path in Chromium: drawing an SVG containing a
     * foreignObject onto a canvas can produce an opaque/tainted canvas and
     * canvas.toBlob() then throws:
     *   SecurityError: Tainted canvases may not be exported.
     *
     * Use html2canvas for the actual DOM -> bitmap conversion. It renders the
     * already-typeset question DOM directly, keeps MathJax output intact and
     * avoids the cross-origin SVG canvas trap. The library is loaded once in
     * index.html from jsDelivr. A dynamic loader is retained as a fallback.
     */
    const settings = snapshotSettings();
    const scale = Math.min(2, Math.max(1, Number(settings.scale) || 1));

    if (!window.html2canvas) {
      await loadHtml2Canvas();
    }
    if (typeof window.html2canvas !== 'function') {
      throw new Error('JPG renderer unavailable: html2canvas could not be loaded');
    }

    // Images inside the export card must be same-origin/data URLs for a clean
    // canvas. Convert local images once; cached data URLs are reused.
    const clone = card.cloneNode(true);
    clone.style.width = `${Math.ceil(card.getBoundingClientRect().width)}px`;
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';

    const images = [...clone.querySelectorAll('img')];
    await Promise.all(images.map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;

      try {
        const absolute = new URL(src, document.baseURI).href;
        const response = await fetch(absolute, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
        img.setAttribute('src', await blobToDataUrl(await response.blob()));
      } catch (_) {
        // Hide an optional failed image instead of poisoning the whole export.
        img.removeAttribute('src');
        img.style.display = 'none';
      }
    }));

    // Render a detached clone so export never changes or scrolls the visible UI.
    const host = document.createElement('div');
    host.style.cssText = [
      'position:fixed',
      'left:-100000px',
      'top:0',
      'width:0',
      'height:0',
      'overflow:visible',
      'pointer-events:none',
      'opacity:1',
      'z-index:-1'
    ].join(';');
    host.appendChild(clone);
    document.body.appendChild(host);

    try {
      // Force the same computed export CSS onto the detached clone.
      // html2canvas reads computed styles from the real DOM, so this style
      // element must live beside the clone rather than inside an SVG.
      const styleTag = document.createElement('style');
      styleTag.textContent = exportCss();
      clone.prepend(styleTag);

      await nextFrame();

      const canvas = await window.html2canvas(clone, {
        backgroundColor: settings.pageBg || '#ffffff',
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 10000,
        removeContainer: true,
        foreignObjectRendering: false
      });

      if (!canvas || !canvas.width || !canvas.height) {
        throw new Error('JPG renderer produced an empty canvas');
      }

      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('JPG encoding failed')),
          'image/jpeg',
          quality
        );
      });
    } finally {
      host.remove();
    }
  }

  let html2CanvasLoadPromise = null;

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (html2CanvasLoadPromise) return html2CanvasLoadPromise;

    html2CanvasLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-html2canvas-fallback]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.html2canvas), { once: true });
        existing.addEventListener('error', () => reject(new Error('Could not load html2canvas')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.async = true;
      script.dataset.html2canvasFallback = 'true';
      script.onload = () => window.html2canvas
        ? resolve(window.html2canvas)
        : reject(new Error('html2canvas loaded without exposing its API'));
      script.onerror = () => reject(new Error('Could not load html2canvas'));
      document.head.appendChild(script);
    });

    return html2CanvasLoadPromise;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error('Could not read image'));
      reader.readAsDataURL(blob);
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const zipCrcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = zipCrcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipStored(entries) {
    const enc = new TextEncoder();
    const chunks = []; const central = []; let offset = 0;
    const u16 = n => new Uint8Array([n & 255, (n >>> 8) & 255]);
    const u32 = n => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
    const concat = parts => { const total = parts.reduce((n,p) => n + p.length, 0); const out = new Uint8Array(total); let at=0; for(const part of parts){out.set(part,at);at+=part.length;} return out; };
    for (const entry of entries) {
      const name = enc.encode(entry.name); const data = new Uint8Array(entry.bytes); const crc = crc32(data);
      const local = concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
      chunks.push(local);
      const centralHeader = concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
      central.push(centralHeader); offset += local.length;
    }
    const centralBytes = concat(central); const all = concat([...chunks, centralBytes, u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralBytes.length),u32(offset),u16(0)]);
    return new Blob([all], {type:'application/zip'});
  }

  async function runExport() {
    const job = state.exportJob; if (!job || job.running) return;
    job.running = true; state.exportCancel = false; $('exportStart').disabled = true;
    let slide = 0;
    const entries = [];
    try {
      for (let i = 0; i < job.questions.length; i++) {
        const q = job.questions[i];
        for (const mode of ['question', 'answer']) {
          if (state.exportCancel) throw new Error('EXPORT_CANCELLED');
          slide++;
          $('exportCurrent').textContent = `Rendering slide ${slide} of ${job.totalSlides} · Question ${i + 1}`;
          $('exportPercent').textContent = `${Math.round(slide / job.totalSlides * 100)}%`;
          $('exportProgressFill').style.width = `${slide / job.totalSlides * 100}%`;
          await nextFrame();
          const stage = makeImageExportStage(q, mode);
          try {
            await typesetExportStage(stage);
            await nextFrame();
            const blob = await fastDomToJpeg(stage.querySelector('.image-export-card'));
            // Deliberately use only the slide number. No exam/chapter/ID slug:
            // slide_1.jpg, slide_2.jpg, slide_3.jpg, ...
            entries.push({ name: `slide_${slide}.jpg`, bytes: await blob.arrayBuffer() });
          } finally { stage.remove(); }
          await yieldToBrowser();
        }
      }
      $('exportCurrent').textContent = 'Packaging JPG slides';
      $('exportStatus').textContent = 'Creating one ZIP so your browser does not have to handle dozens of separate downloads.';
      await yieldToBrowser();
      const zip = zipStored(entries);
      downloadBlob(zip, `jee-pyq-export-${Date.now()}.zip`);
      $('exportPercent').textContent = '100%';
      $('exportProgressFill').style.width = '100%';
      $('exportStatus').textContent = `Finished ${job.totalSlides} slides and packaged them into one ZIP.`;
      toast(`Export complete · ${job.totalSlides} JPG slides`);
    } catch (error) {
      if (error?.message === 'EXPORT_CANCELLED') $('exportStatus').textContent = 'Export cancelled. Slides already generated remain saved.';
      else { console.error('Bulk export failed:', error); $('exportStatus').textContent = 'Export failed. Try a smaller selection or lower image quality.'; toast('Export failed.'); }
    } finally {
      job.running = false; $('exportStart').disabled = false; $('exportCancel').disabled = false;
    }
  }

  // Image export: render the real question DOM in an off-screen card, let the
  // same MathJax instance typeset it, then snapshot only that small card.
  // This avoids reconstructing TeX on a canvas and avoids rendering the whole app.
  function imageFileName(q) {
    return `slide.jpg`;
  }

  function nextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  function snapshotSettingsMarkup() {
    const s = snapshotSettings();
    const toggle = (key, label, hint) => `
      <label class="snapshot-toggle">
        <input type="checkbox" data-snapshot-setting="${key}" ${s[key] ? 'checked' : ''}>
        <span><b>${label}</b><small>${hint}</small></span>
      </label>`;
    const color = (key, label) => `<label class="snapshot-field color-field"><span>${label}</span><input type="color" data-snapshot-setting="${key}" value="${esc(s[key])}"></label>`;
    return `
      <div class="modal snapshot-modal" id="snapshotSettingsModal" role="dialog" aria-modal="true" aria-labelledby="snapshotSettingsTitle">
        <div class="modal-card snapshot-settings-card">
          <div class="modal-head">
            <div><div class="eyebrow">IMAGE EXPORT</div><h2 id="snapshotSettingsTitle">Snapshot settings</h2><p>Choose exactly what appears in saved question images.</p></div>
            <button class="close" id="closeSnapshotSettings" aria-label="Close">×</button>
          </div>

          <section class="snapshot-section">
            <div class="section-heading"><div><h3>Elements</h3><p>Turn any part of the snapshot on or off.</p></div></div>
            <div class="snapshot-toggle-grid">
              ${toggle('showKicker','Brand kicker','JEE PRACTICE · PYQ')}
              ${toggle('showTitle','Exam & subject','JEE Main · Physics')}
              ${toggle('showPaper','Year & paper','Year and shift line')}
              ${toggle('showBadges','Badges','Difficulty, type, chapter')}
              ${toggle('showQuestionNumber','Question number','Small number above the question')}
              ${toggle('showQuestion','Question','Question text and equations')}
              ${toggle('showOptions','Options','All answer choices')}
              ${toggle('showCorrectAnswer','Correct answer','Adds the correct option at the bottom')}
              ${toggle('showExplanation','Explanation','Adds the saved explanation, if available')}
              ${toggle('showFooter','Footer','Custom footer text')}
              ${toggle('showLogo','Your logo','Use your uploaded logo at the top')}
            </div>
          </section>

          <section class="snapshot-section">
            <div class="section-heading"><div><h3>Branding & text</h3><p>Personalise the small details.</p></div></div>
            <div class="snapshot-form-grid">
              <label class="snapshot-field full-field"><span>Footer text</span><input type="text" maxlength="90" data-snapshot-setting="footerText" value="${esc(s.footerText)}"></label>
              <label class="snapshot-field"><span>Logo</span><div class="snapshot-logo-row"><div class="snapshot-logo-preview" id="snapshotLogoPreview">${s.logoData ? `<img src="${esc(s.logoData)}" alt="Logo preview">` : '<span>+</span>'}</div><input id="snapshotLogoInput" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></div></label>
              <div class="snapshot-field"><span>Logo actions</span><button class="secondary" id="removeSnapshotLogo" type="button">Remove logo</button></div>
            </div>
          </section>

          <section class="snapshot-section">
            <div class="section-heading"><div><h3>Colors</h3><p>Use your own palette instead of the default JEE Practice look.</p></div></div>
            <div class="snapshot-color-grid">
              ${color('accent','Accent')}${color('pageBg','Outer background')}${color('cardBg','Card background')}${color('text','Text')}
              ${color('muted','Muted text')}${color('optionBg','Option background')}${color('border','Borders')}${color('badgeBg','Badge background')}
            </div>
          </section>

          <section class="snapshot-section">
            <div class="section-heading"><div><h3>Layout</h3><p>Control the image proportions and typography.</p></div></div>
            <div class="snapshot-range-grid">
              <label class="snapshot-field"><span>Width <b data-range-value="width">${s.width}px</b></span><input type="range" min="700" max="1400" step="10" data-snapshot-setting="width" value="${s.width}"></label>
              <label class="snapshot-field"><span>Quality <b data-range-value="scale">${s.scale}×</b></span><input type="range" min="1" max="2" step="0.25" data-snapshot-setting="scale" value="${s.scale}"></label>
              <label class="snapshot-field"><span>Corner radius <b data-range-value="radius">${s.radius}px</b></span><input type="range" min="0" max="42" step="1" data-snapshot-setting="radius" value="${s.radius}"></label>
              <label class="snapshot-field"><span>Padding <b data-range-value="padding">${s.padding}px</b></span><input type="range" min="20" max="60" step="2" data-snapshot-setting="padding" value="${s.padding}"></label>
              <label class="snapshot-field"><span>Question size <b data-range-value="questionSize">${s.questionSize}px</b></span><input type="range" min="16" max="30" step="1" data-snapshot-setting="questionSize" value="${s.questionSize}"></label>
              <label class="snapshot-field"><span>Option size <b data-range-value="optionSize">${s.optionSize}px</b></span><input type="range" min="14" max="24" step="1" data-snapshot-setting="optionSize" value="${s.optionSize}"></label>
            </div>
          </section>

          <div class="snapshot-settings-actions"><button class="secondary" id="snapshotReset">Reset defaults</button><button class="primary" id="closeSnapshotSettingsSave">Done</button></div>
        </div>
      </div>`;
  }

  function openSnapshotSettings() {
    document.getElementById('snapshotSettingsModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', snapshotSettingsMarkup());
    const modal = $('snapshotSettingsModal');
    const close = () => { modal?.remove(); };
    $('closeSnapshotSettings')?.addEventListener('click', close);
    $('closeSnapshotSettingsSave')?.addEventListener('click', () => { persistSnapshotSettings(); close(); });
    $('snapshotReset')?.addEventListener('click', () => {
      state.snapshotSettings = { ...DEFAULT_SNAPSHOT_SETTINGS };
      persistSnapshotSettings();
      close();
      openSnapshotSettings();
    });
    $('removeSnapshotLogo')?.addEventListener('click', () => {
      state.snapshotSettings.logoData = '';
      persistSnapshotSettings();
      close();
      openSnapshotSettings();
    });
    $('snapshotLogoInput')?.addEventListener('change', handleSnapshotLogoUpload);
    modal?.addEventListener('click', event => { if (event.target === modal) close(); });
    modal?.querySelectorAll('[data-snapshot-setting]').forEach(input => {
      input.addEventListener('input', () => updateSnapshotSettingFromInput(input));
      input.addEventListener('change', () => updateSnapshotSettingFromInput(input));
    });
  }

  function updateSnapshotSettingFromInput(input) {
    const key = input.dataset.snapshotSetting;
    if (!key) return;
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (['width','scale','radius','padding','questionSize','optionSize'].includes(key)) value = Number(value);
    state.snapshotSettings[key] = value;
    persistSnapshotSettings();
    const valueNode = document.querySelector(`[data-range-value="${key}"]`);
    if (valueNode) valueNode.textContent = key === 'scale' ? `${value}×` : `${value}px`;
  }

  function handleSnapshotLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast('Please use a logo smaller than 1 MB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.snapshotSettings.logoData = String(reader.result || '');
      persistSnapshotSettings();
      const preview = $('snapshotLogoPreview');
      if (preview) preview.innerHTML = `<img src="${esc(state.snapshotSettings.logoData)}" alt="Logo preview">`;
    };
    reader.readAsDataURL(file);
  }

  function resetSnapshotSettings() {
    state.snapshotSettings = { ...DEFAULT_SNAPSHOT_SETTINGS };
    persistSnapshotSettings();
  }

  function makeImageExportStage(q) {
    const s = snapshotSettings();
    const stage = document.createElement('div');
    stage.className = 'image-export-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.style.width = `${s.width}px`;
    stage.style.background = s.pageBg;
    stage.style.color = s.text;

    const options = qopts(q);
    const meta = [q._difficulty || '', q._type || '', q._chapter || ''].filter(Boolean);
    const answer = qcorrect(q);
    const correctLabels = answer.length ? answer.join(', ') : '';
    const logo = s.showLogo && s.logoData ? `<img class="image-export-logo" src="${esc(s.logoData)}" alt="">` : '';
    const kicker = s.showKicker ? `<div class="image-export-kicker">JEE PRACTICE · PYQ</div>` : '';
    const title = s.showTitle ? `<div class="image-export-title">${esc(prettyExam(q._exam))} · ${esc(q._subject || '')}</div>` : '';
    const paper = s.showPaper ? `<div class="image-export-paper">${esc(prettyYear(q._year))}${paperLabel(q) ? ` · ${esc(paperLabel(q))}` : ''}</div>` : '';
    const badges = s.showBadges ? `<div class="image-export-badges">${meta.map((item, i) => `<span class="image-export-badge badge-${i}">${esc(item)}</span>`).join('')}</div>` : '';
    const number = s.showQuestionNumber ? `<div class="image-export-number">Question ${esc(q._number || q.question_number || '')}</div>` : '';
    const question = s.showQuestion ? `<div class="image-export-question">${sanitizeHtml(qtext(q) || '')}</div>` : '';
    const optionMarkup = s.showOptions && options.length ? `<div class="image-export-options">${options.map(option => `<div class="image-export-option"><span class="image-export-option-key">${esc(option.identifier)}</span><div class="image-export-option-content">${sanitizeHtml(option.content || '')}</div></div>`).join('')}</div>` : '';
    const correctMarkup = s.showCorrectAnswer && correctLabels ? `<div class="image-export-answer"><strong>Correct answer</strong><span>${esc(correctLabels)}</span></div>` : '';
    const explanation = s.showExplanation && qexplain(q) ? `<div class="image-export-explanation"><strong>Explanation</strong><div>${sanitizeHtml(qexplain(q))}</div></div>` : '';
    const footer = s.showFooter ? `<footer class="image-export-footer">${esc(s.footerText || '')}</footer>` : '';

    stage.innerHTML = `<div class="image-export-card" style="--export-accent:${esc(s.accent)};--export-card:${esc(s.cardBg)};--export-text:${esc(s.text)};--export-muted:${esc(s.muted)};--export-option:${esc(s.optionBg)};--export-border:${esc(s.border)};--export-badge:${esc(s.badgeBg)};--export-badge-text:${esc(s.badgeText)};--export-radius:${s.radius}px;--export-pad:${s.padding}px;--export-q-size:${s.questionSize}px;--export-option-size:${s.optionSize}px">
      <header class="image-export-header">${logo}<div class="image-export-header-copy">${kicker}${title}${paper}</div></header>
      <div class="image-export-body">${badges}${number}${question}${optionMarkup}${correctMarkup}${explanation}</div>${footer}
    </div>`;
    document.body.appendChild(stage);
    return stage;
  }

  async function typesetExportStage(stage) {
    const mj = window.MathJax;
    if (!mj?.typesetPromise) return false;
    try {
      if (mj.startup?.promise) await mj.startup.promise;
      await mj.typesetPromise([stage]);
      return true;
    } catch (error) {
      console.warn('MathJax export typesetting failed:', error);
      return false;
    }
  }

  async function saveQuestionAsImage(q, button) {
    if (state.imageExporting.has(q._id)) return;
    state.imageExporting.add(q._id);
    if (button) { button.disabled = true; button.textContent = '…'; }
    let stage = null;
    try {
      await nextFrame();
      stage = makeImageExportStage(q, 'question');
      await typesetExportStage(stage);
      await nextFrame();
      const blob = await fastDomToJpeg(stage.querySelector('.image-export-card'));
      downloadBlob(blob, `slide_1.jpg`);
      toast('JPG saved');
    } catch (error) { console.error('Could not save question image:', error); toast('Could not create the JPG.'); }
    finally { stage?.remove(); state.imageExporting.delete(q._id); if (button) { button.disabled = false; button.textContent = '⇩'; } }
  }

  function openSingle(q) {
    if (!q) return;
    state.session = createSession([q], 'single');
    state._sessionSource = 'single';
    clearActiveSession();
    openPractice();
  }

  function filteredAllQuestions() {
    const qs = examQs();
    const search = $('allSearch').value.trim().toLowerCase();
    const subject = $('allSubject').value;
    const chapter = $('allChapter').value;
    const year = $('allYear').value;
    const status = $('allStatus').value;
    return qs.filter(q =>
      (!search || q._searchText.includes(search)) &&
      (!subject || q._subject === subject) &&
      (!chapter || q._chapter === chapter) &&
      (!year || String(q._year) === year) &&
      (!status || statusMatch(q, status))
    );
  }

  function renderAllQuestions() {
    const filtered = filteredAllQuestions();
    const total = manifestStats(state.exam).questions;
    const limit = state.allRenderLimit || 400;
    $('allCount').textContent = total > filtered.length ? `${filtered.length.toLocaleString()} loaded · ${total.toLocaleString()} total` : `${filtered.length.toLocaleString()} questions`;
    const visible = filtered.slice(0, limit);
    $('allQuestions').innerHTML = visible.length
      ? visible.map((q, i) => questionRow(q, i)).join('')
      : '<div class="empty">No questions match these filters.</div>';
    if (filtered.length > limit) {
      $('allQuestions').insertAdjacentHTML('beforeend', `<div class="load-more-wrap"><button class="secondary" id="loadMoreQuestions">Show next ${Math.min(400, filtered.length - limit).toLocaleString()} · ${filtered.length.toLocaleString()} total matches</button></div>`);
      $('loadMoreQuestions').onclick = () => { state.allRenderLimit = limit + 400; renderAllQuestions(); };
    }
    bindQuestionRows();
    updateBulkExportControls();
  }

  function statusMatch(q, status) {
    const attempt = lastAttempt(q._id);
    if (status === 'unattempted') return !attempt;
    if (status === 'correct') return !!attempt?.correct;
    if (status === 'incorrect') return !!attempt && !attempt.correct;
    if (status === 'bookmarked') return bookmarks().has(q._id);
    if (status === 'review') return reviews().has(q._id);
    return true;
  }

  function populateAllFilters() {
    const qs = examQs();
    $('allSubject').innerHTML = '<option value="">All subjects</option>' + subjects().map(s => `<option>${esc(s)}</option>`).join('');
    $('allChapter').innerHTML = '<option value="">All chapters</option>' + [...new Set(qs.map(q => q._chapter))].sort().map(x => `<option>${esc(x)}</option>`).join('');
    $('allYear').innerHTML = '<option value="">All years</option>' + [...new Set(qs.map(q => q._year).filter(Boolean))].sort((a, b) => b - a).map(x => `<option>${x}</option>`).join('');
  }

  function renderBookmarks() {
    const ids = bookmarks();
    const qs = state.questions.filter(q => q._exam === state.exam && ids.has(q._id));
    $('bookmarksContent').innerHTML = `<div class="result-line"><span>${qs.length} saved questions</span></div>${qs.length ? qs.map((q, i) => questionRow(q, i)).join('') : '<div class="empty">No bookmarks yet.</div>'}`;
    bindQuestionRows();
    updateBulkExportControls();
  }

  function renderHistory() {
    const history = attempts().slice().reverse();
    $('historyContent').innerHTML = history.length
      ? `<div class="analytics-grid">
          <div class="analysis-card"><span>Attempts</span><b>${history.length}</b></div>
          <div class="analysis-card"><span>Accuracy</span><b>${Math.round(history.filter(x => x.correct).length / history.length * 100)}%</b></div>
          <div class="analysis-card"><span>Avg. time</span><b>${formatTime(history.reduce((sum, x) => sum + (Number(x.timeMs) || 0), 0) / history.length)}</b></div>
          <div class="analysis-card"><span>Total score</span><b>${history.reduce((sum, x) => sum + attemptScore(x), 0)}</b></div>
        </div>
        <div>${history.slice(0, 100).map(item => {
          const q = state.questionById.get(String(item.questionId));
          return q ? questionRow(q, 0, { selectable: false }).replace('data-open-q', 'data-history-q') : '';
        }).join('')}</div>`
      : '<div class="empty">Your practice history will appear here after your first answer.</div>';

    document.querySelectorAll('[data-history-q]').forEach(button => {
      button.onclick = () => {
        const q = state.questionById.get(String(button.dataset.historyQ));
        if (q) openSingle(q);
      };
    });
  }

  function renderAnalytics() {
    const qs = examQs();
    const ids = new Set(qs.map(q => q._id));
    const list = attempts().filter(a => ids.has(a.questionId));
    const correct = list.filter(a => a.correct).length;
    const bySubject = subjects().map(subject => {
      const subIds = new Set(qs.filter(q => q._subject === subject).map(q => q._id));
      const data = list.filter(a => subIds.has(a.questionId));
      return [subject, data.length ? Math.round(data.filter(a => a.correct).length / data.length * 100) : 0, data.length];
    });
    const chapters = [...new Set(qs.map(q => q._chapter))].map(chapter => {
      const chapterIds = new Set(qs.filter(q => q._chapter === chapter).map(q => q._id));
      const data = list.filter(a => chapterIds.has(a.questionId));
      return [chapter, data.length ? Math.round(data.filter(a => a.correct).length / data.length * 100) : 0, data.length];
    }).filter(x => x[2]).sort((a, b) => a[1] - b[1]).slice(0, 8);

    $('analyticsContent').innerHTML = `
      <div class="analytics-grid">
        <div class="analysis-card"><span>Accuracy</span><b>${list.length ? Math.round(correct / list.length * 100) + '%' : '—'}</b></div>
        <div class="analysis-card"><span>Average time</span><b>${list.length ? formatTime(list.reduce((s, x) => s + x.timeMs, 0) / list.length) : '—'}</b></div>
        <div class="analysis-card"><span>Questions attempted</span><b>${new Set(list.map(x => x.questionId)).size}</b></div>
        <div class="analysis-card"><span>Bookmarks</span><b>${[...bookmarks()].filter(id => ids.has(id)).length}</b></div>
      </div>
      <div class="analysis-panels">
        <div class="analysis-panel"><h3>Accuracy by subject</h3>${bySubject.map(x => `<div class="bar-row"><span>${esc(x[0])}</span><div class="bar"><i style="width:${x[1]}%"></i></div><b>${x[1]}%</b></div>`).join('') || '<div class="empty">Attempt some questions first.</div>'}</div>
        <div class="analysis-panel"><h3>Weakest chapters</h3>${chapters.map(x => `<div class="bar-row"><span title="${esc(x[0])}">${esc(x[0])}</span><div class="bar"><i style="width:${x[1]}%"></i></div><b>${x[1]}%</b></div>`).join('') || '<div class="empty">Attempt some questions first.</div>'}</div>
      </div>`;
  }

  function createSession(pool, source) {
    return {
      id: `session-${Date.now()}`,
      source,
      questions: [...pool],
      index: 0,
      startedAt: Date.now(),
      seen: [],
      answers: {},
      answerVisible: false
    };
  }

  function openSession(source = 'current') {
    let pool;
    if (source === 'chapter') {
      pool = examQs().filter(q => q._subject === state.subject && q._chapter === state.chapter);
    } else if (source === 'weak') {
      pool = examQs().filter(q => {
        const list = getAttempts(q._id);
        return list.length && (list.filter(x => x.correct).length / list.length < 0.6 || list.some(x => x.timeMs > 120000));
      });
    } else if (source === 'mistakes') {
      pool = getChapterMistakes();
    } else if (source === 'allFiltered') {
      pool = filteredAllQuestions();
    } else if (source === 'single') {
      pool = [state.questions[state.index]].filter(Boolean);
    } else {
      pool = examQs();
    }

    state._pool = [...pool];
    state._sessionSource = source;
    state.order = 'random';
    state.resumeChoice = 'resume';
    state.sessionCount = Math.min(20, pool.length) || 1;
    $('sessionTitle').textContent = source === 'chapter' ? state.chapter : 'Practice session';
    $('sessionSubtitle').textContent = `${pool.length} questions · ${prettyExam(state.exam)} · ${yearRange(pool)}. All matching questions will be included.`;
    $('sessionCount').value = String(state.sessionCount);
    updateSessionSummary(pool.length);

    document.querySelectorAll('[data-order-choice]').forEach(b => b.classList.toggle('active', b.dataset.orderChoice === 'newest'));
    document.querySelectorAll('[data-resume-choice]').forEach(b => b.classList.toggle('active', b.dataset.resumeChoice === 'resume'));
    $('sessionFound').hidden = !getSavedSession(pool);
    state.modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = $('sessionModal');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.querySelector('button, [href], input, select, textarea')?.focus());
  }

  function closeModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    const returnFocus = state.modalReturnFocus;
    state.modalReturnFocus = null;
    if (returnFocus && document.contains(returnFocus)) {
      requestAnimationFrame(() => returnFocus.focus());
    }
  }

  function sessionSourceKey(pool) {
    return pool.map(q => q._id).join('|');
  }

  function getSavedSession(pool) {
    const raw = read(KEY.active, null);
    if (!raw || !Array.isArray(raw.questions) || !raw.questions.length) return null;
    if (raw.sourceKey !== sessionSourceKey(pool)) return null;
    if (!Number.isInteger(raw.index) || raw.index < 0 || raw.index >= raw.questions.length) return null;
    if (!raw.answers || typeof raw.answers !== 'object') return null;
    return raw;
  }

  function saveActiveSession() {
    if (!state.session?.questions?.length) return;
    write(KEY.active, {
      sourceKey: sessionSourceKey(state.session.questions),
      questions: state.session.questions.map(q => q._id),
      index: state.index,
      startedAt: state.session.startedAt,
      seen: state.session.seen,
      answers: state.session.answers
    });
  }

  function normalizeSavedAnswers(rawAnswers, questions) {
    const source = rawAnswers && typeof rawAnswers === 'object' ? rawAnswers : {};
    const ids = new Set(questions.map(q => q._id));
    const result = {};
    Object.entries(source).forEach(([id, raw]) => {
      if (!ids.has(id) || !raw || typeof raw !== 'object') return;
      const selectedIds = Array.isArray(raw.selectedIds) ? raw.selectedIds.map(String) : [];
      result[id] = {
        selectedIds,
        value: typeof raw.value === 'string' ? raw.value : '',
        submitted: raw.submitted === true,
        correct: raw.correct === true,
        score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : undefined,
        timeMs: Number.isFinite(Number(raw.timeMs)) ? Math.max(0, Number(raw.timeMs)) : 0,
        date: Number.isFinite(Number(raw.date)) ? Number(raw.date) : Date.now()
      };
    });
    return result;
  }

  function clearActiveSession() {
    try { localStorage.removeItem(KEY.active); } catch { /* storage may be unavailable */ }
  }

  function updateSessionSummary(poolLength) {
    const count = Number(state.sessionCount) || poolLength;
    $('sessionSummaryCount').textContent = `${Math.min(count, poolLength)} question${Math.min(count, poolLength) === 1 ? '' : 's'} in this session`;
    const hint = $('sessionCountHint'); if (hint) hint.textContent = count >= poolLength ? 'Full set' : `${poolLength - count} left out for a shorter session`;
  }

  function launchSession() {
    let pool = [...(state._pool || examQs())];
    if (!pool.length) {
      closeModal('sessionModal');
      toast('There are no questions in this selection.');
      return;
    }

    const saved = getSavedSession(pool);
    if (state.resumeChoice === 'resume' && saved) {
      const byId = new Map(pool.map(q => [q._id, q]));
      const questions = saved.questions.map(id => byId.get(id)).filter(Boolean);
      if (questions.length) {
        state.session = {
          id: `resumed-${Date.now()}`,
          source: state._sessionSource,
          questions,
          index: Math.min(saved.index || 0, questions.length - 1),
          startedAt: saved.startedAt || Date.now(),
          seen: saved.seen || [],
          answers: saved.answers || {},
          answerVisible: false
        };
        state.index = state.session.index;
        closeModal('sessionModal');
        openPractice(true);
        return;
      }
    }

    if (state.order === 'random') pool = shuffle(pool);
    if (state.order === 'newest') pool.sort((a, b) => b._year - a._year);
    if (state.order === 'oldest') pool.sort((a, b) => a._year - b._year);
    const requestedCount = Number(state.sessionCount) || pool.length;
    if (requestedCount < pool.length) pool = pool.slice(0, requestedCount);

    state.session = createSession(pool, state._sessionSource);
    clearActiveSession();
    closeModal('sessionModal');
    openPractice();
  }

  function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function openPractice() {
    state.index = state.session.index || 0;
    $('practiceOverlay').classList.remove('hidden');
    saveActiveSession();
    showPracticeQuestion();
  }

  function currentQuestion() { return state.session?.questions?.[state.index]; }

  function showPracticeQuestion() {
    const q = currentQuestion();
    if (!q) return closePractice();

    if (!state.session.seen.includes(q._id)) state.session.seen.push(q._id);
    state.selected = new Set(state.session.answers[q._id]?.selectedIds || []);
    state.session.answerVisible = false;
    state.qStartedAt = Date.now();

    $('practiceChapter').textContent = q._chapter;
    $('practiceExam').textContent = `${prettyExam(q._exam)} · ${prettyYear(q._year)}`;
    $('practiceNumber').textContent = state.index + 1;
    $('questionTime').textContent = state.session.answers[q._id]?.submitted ? formatTime(state.session.answers[q._id].timeMs) : '00:00';
    $('practiceBadges').innerHTML = [
      `<span class="practice-badge exam-badge">${esc(prettyExam(q._exam))}</span>`,
      `<span class="practice-badge year-badge">${esc(prettyYear(q._year))}</span>`,
      `<span class="practice-badge">${esc(q._subject)}</span>`,
      q.paperTitle ? `<span class="practice-badge paper-badge">${esc(paperLabel(q))}</span>` : ''
    ].join('');
    $('practicePrompt').innerHTML = sanitizeHtml(qtext(q));

    renderAnswers(q);
    // MathJax output is replaced whenever the answer options are re-rendered.
    // Typeset the newly-created answer area so selecting an option never exposes raw TeX.
    typeset($('answerArea'));
    updateQuestionStatusVisuals(q);
    renderStrip();
    renderPalette();
    setAnswerVisibility(false);
    updateSavedButtons();
    updateSubmitButtons(q);

    if (!state.session.answers[q._id]?.submitted) startTimer();
    else stopTimer();
    saveActiveSession();
    typeset([$('practicePrompt'), $('answerArea')].filter(Boolean));
  }

  function renderAnswers(q) {
    const opts = qopts(q);
    const answer = state.session.answers[q._id];

    if (opts.length) {
      $('answerArea').innerHTML = `<div class="answer-options">${opts.map((option, i) => {
        const selected = state.selected.has(String(option.identifier));
        const correct = answer?.submitted && qcorrect(q).includes(String(option.identifier));
        const incorrect = answer?.submitted && selected && !correct;
        return `<button class="answer-option ${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${incorrect ? 'incorrect' : ''}" data-option="${i}">
          <span class="option-key">${esc(option.identifier)}</span><span class="option-content">${sanitizeHtml(option.content)}</span>
        </button>`;
      }).join('')}</div>`;
      document.querySelectorAll('.answer-option').forEach(button => {
        button.onclick = () => toggleOption(Number(button.dataset.option));
        button.disabled = !!answer?.submitted;
      });
    } else {
      $('answerArea').innerHTML = `<input class="fill-answer" id="fillAnswer" inputmode="${q._type.toLowerCase().includes('integer') ? 'decimal' : 'text'}" autocomplete="off" aria-label="Your answer" placeholder="Enter your answer" value="${esc(answer?.value || '')}" ${answer?.submitted ? 'disabled' : ''}>`;
      const input = $('fillAnswer');
      if (input && !answer?.submitted) {
        input.addEventListener('input', () => {
          state.session.answers[q._id] = {
            ...(state.session.answers[q._id] || {}),
            value: input.value
          };
          updateSubmitButtons(q);
          saveActiveSession();
        });
      }
    }
  }

  function toggleOption(index) {
    const q = currentQuestion();
    const answer = state.session.answers[q._id];
    if (answer?.submitted) return;

    const options = qopts(q);
    const id = String(options[index]?.identifier ?? String.fromCharCode(65 + index));
    const type = (q._type || '').toLowerCase();
    if (type.includes('single') || type === 'mcq' || qcorrect(q).length <= 1) {
      state.selected = new Set([id]);
    } else if (state.selected.has(id)) {
      state.selected.delete(id);
    } else {
      state.selected.add(id);
    }

    state.session.answers[q._id] = {
      ...(state.session.answers[q._id] || {}),
      selectedIds: [...state.selected]
    };
    renderAnswers(q);
    updateSubmitButtons(q);
    // Re-typeset after replacing the option DOM; otherwise MathJax markup can
    // temporarily appear as literal TeX when the selected state changes.
    typeset($('answerArea'));
    renderStrip();
    renderPalette();
    saveActiveSession();
  }

  function isCorrectInput(q, value) {
    const entered = String(value ?? '').trim();
    if (!entered) return false;
    const expected = String(qanswer(q) ?? '').trim();
    if (!expected) return false;

    if ((q._type || '').toLowerCase().includes('integer')) {
      const range = expected.match(/^\\s*(-?\\d+(?:\\.\\d+)?)\\s*TO\\s*(-?\\d+(?:\\.\\d+)?)\\s*$/i);
      if (range) {
        const number = Number(entered);
        const low = Number(range[1]);
        const high = Number(range[2]);
        return Number.isFinite(number) && number >= Math.min(low, high) && number <= Math.max(low, high);
      }
      const number = Number(entered);
      const target = Number(expected);
      return Number.isFinite(number) && Number.isFinite(target) && number === target;
    }

    return entered.toLowerCase() === expected.toLowerCase();
  }

  function submitAnswer() {
    const q = currentQuestion();
    if (!q) return;
    if (state.session.answers[q._id]?.submitted) return;

    const elapsed = Date.now() - state.qStartedAt;
    const correctOptions = qcorrect(q).slice().sort();
    let selectedIds = [...state.selected].map(String).sort();
    let correct = false;
    let value = '';

    if (qopts(q).length) {
      correct = selectedIds.length === correctOptions.length && selectedIds.every((v, i) => v === correctOptions[i]);
    } else {
      value = ($('fillAnswer')?.value || '').trim();
      correct = isCorrectInput(q, value);
    }

    const score = scoreForResult(q, correct, true);
    state.session.answers[q._id] = {
      selectedIds,
      value,
      submitted: true,
      correct,
      score,
      timeMs: elapsed,
      date: Date.now()
    };

    recordAttempt(q, correct, elapsed, score);
    // Keep the library UI in sync immediately; do not require a page reload.
    renderHome();
    renderChapters();
    if (state.chapter) renderChapterQuestions();
    stopTimer();
    state.session.answerVisible = true;
    setAnswerVisibility(true);
    renderAnswers(q);
    updateQuestionStatusVisuals(q);
    renderStrip();
    renderPalette();
    updateSubmitButtons(q);
    saveActiveSession();
    toast(correct ? 'Correct answer' : 'Wrong answer');
    typeset([$('answerArea'), $('explanation')].filter(Boolean));
  }

  function updateQuestionStatusVisuals(q) {
    const answer = state.session.answers[q._id];
    const number = $('practiceNumber');
    number.classList.remove('status-blue', 'status-correct', 'status-wrong');
    number.classList.add(answer?.submitted ? (answer.correct ? 'status-correct' : 'status-wrong') : 'status-blue');
  }

  function updateSubmitButtons(q) {
    const submitted = !!state.session.answers[q._id]?.submitted;
    const hasAnswer = qopts(q).length ? state.selected.size > 0 : !!($('fillAnswer')?.value || '').trim();
    $('submitAnswer').classList.toggle('hidden', submitted);
    $('submitAnswer').disabled = submitted || !hasAnswer;
    $('nextQuestion').classList.remove('hidden');
    $('nextQuestion').textContent = state.index >= state.session.questions.length - 1 ? 'Finish →' : 'Next →';
    $('nextQuestion').title = 'Go to the next question without submitting';
    const marks = questionMarks(q);
    $('scoreCorrect').textContent = `+${marks.correct}`;
    $('scoreIncorrect').textContent = `−${marks.incorrect}`;
  }

  function renderStrip() {
    const questions = state.session.questions;
    $('questionStrip').innerHTML = questions.map((q, i) =>
      `<button class="strip-number ${stripStatus(q, i)}" data-strip="${i}" title="Question ${i + 1}">${i + 1}</button>`
    ).join('');
    document.querySelectorAll('[data-strip]').forEach(button => {
      button.onclick = () => goToQuestion(Number(button.dataset.strip));
    });
    requestAnimationFrame(() => {
      const active = $('questionStrip').querySelector('.current');
      active?.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
  }

  function stripStatus(q, index) {
    const answer = state.session.answers[q._id];
    const classes = [];
    if (index === state.index) classes.push('current');
    if (answer?.submitted) classes.push(answer.correct ? 'correct' : 'wrong');
    else if (answer?.selectedIds?.length) classes.push('attempted');
    else if (state.session.seen.includes(q._id)) classes.push('seen');
    else classes.push('not-seen');
    return classes.join(' ');
  }

  function renderPalette() {
    const questions = state.session.questions;
    $('paletteSubject').textContent = `${state.subject || questions[state.index]?._subject || 'Questions'} · ${questions.length}`;
    $('paletteNumbers').innerHTML = questions.map((q, i) =>
      `<button class="palette-number ${paletteStatus(q, i)}" data-pal="${i}">${i + 1}</button>`
    ).join('');
    document.querySelectorAll('[data-pal]').forEach(button => {
      button.onclick = () => goToQuestion(Number(button.dataset.pal));
    });
  }

  function paletteStatus(q, index) {
    const answer = state.session.answers[q._id];
    const classes = [];
    if (index === state.index) classes.push('current');
    if (answer?.submitted) classes.push(answer.correct ? 'correct' : 'wrong');
    else if (answer?.selectedIds?.length) classes.push('attempted');
    else if (state.session.seen.includes(q._id)) classes.push('seen');
    else classes.push('not-seen');
    return classes.join(' ');
  }

  function goToQuestion(index) {
    if (!state.session?.questions[index]) return;
    state.index = index;
    state.session.index = index;
    saveActiveSession();
    showPracticeQuestion();
  }

  function nextQuestion() {
    if (state.index >= state.session.questions.length - 1) {
      finishSession();
      return;
    }
    goToQuestion(state.index + 1);
  }

  function prevQuestion() {
    if (state.index > 0) goToQuestion(state.index - 1);
  }

  function toggleAnswer() {
    const visible = !state.session.answerVisible;
    setAnswerVisibility(visible);
    state.session.answerVisible = visible;
    saveActiveSession();
    if (visible) typeset($('explanation'));
  }

  function setAnswerVisibility(visible) {
    const q = currentQuestion();
    if (!q) return;
    $('explanation').classList.toggle('hidden', !visible);
    $('showAnswerToggle').classList.toggle('active', visible);
    $('showAnswerToggle').textContent = visible ? 'Hide Answer' : 'Show Answer';
    if (visible) {
      const answer = qanswer(q);
      const explanation = qexplain(q);
      $('explanationBody').innerHTML = `${answer ? `<div class="answer-reveal"><strong>Answer</strong><div>${esc(answer)}</div></div>` : ''}${sanitizeHtml(explanation) || '<p>No explanation was provided in the question data.</p>'}`;
    } else {
      $('explanationBody').innerHTML = '';
    }
  }

  function toggleSaved(kind) {
    const q = currentQuestion();
    if (!q) return;
    const set = kind === 'bookmark' ? state.bookmarkSet : state.reviewSet;
    const had = set.has(q._id);
    if (had) set.delete(q._id); else set.add(q._id);
    const key = kind === 'bookmark' ? KEY.bookmarks : KEY.review;
    write(key, [...set]);
    invalidateStorageCache(key);
    updateSavedButtons();
    toast(had ? (kind === 'bookmark' ? 'Bookmark removed' : 'Removed from review') : (kind === 'bookmark' ? 'Bookmarked' : 'Added to review'));
  }

  function updateSavedButtons() {
    const q = currentQuestion();
    if (!q) return;
    const saved = bookmarks().has(q._id);
    const review = reviews().has(q._id);
    $('bookmarkCurrent').textContent = saved ? '★' : '☆';
    $('bookmarkCurrent').classList.toggle('active', saved);
    $('reviewCurrent').textContent = review ? '⚑' : '⚐';
    $('reviewCurrent').classList.toggle('active', review);
  }

  function recordAttempt(q, correct, timeMs, score = scoreForResult(q, correct, true)) {
    const list = attempts();
    list.push({
      questionId: q._id,
      correct,
      score,
      timeMs,
      date: Date.now(),
      subject: q._subject,
      chapter: q._chapter,
      year: q._year
    });
    write(KEY.attempts, list);
    invalidateStorageCache(KEY.attempts);
  }

  function finishSession() {
    stopTimer();
    const session = state.session;
    const answered = Object.values(session.answers || {}).filter(a => a.submitted);
    const correct = answered.filter(a => a.correct).length;
    const totalScore = answered.reduce((sum, answer) => sum + (Number(answer.score) || 0), 0);
    const sessions = read(KEY.sessions, []);
    const sessionList = Array.isArray(sessions) ? sessions : [];
    sessionList.push({
      date: Date.now(),
      total: session.questions.length,
      answered: answered.length,
      correct,
      score: totalScore,
      label: session.questions[0]?._chapter || 'Practice'
    });
    write(KEY.sessions, sessionList);
    clearActiveSession();
    closePractice();
    toast(`Session complete · ${correct}/${answered.length} answered correctly`);
    showPage(state.chapter ? 'chapter' : 'home');
  }

  function closePractice() {
    stopTimer();
    $('practiceOverlay').classList.add('hidden');
  }

  function startTimer() {
    stopTimer();
    state.timer = setInterval(() => {
      const q = currentQuestion();
      if (!q || state.session.answers[q._id]?.submitted) return;
      $('questionTime').textContent = formatTime(Date.now() - state.qStartedAt);
    }, 250);
  }

  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function toggleBookmark(id) {
    const set = state.bookmarkSet;
    if (set.has(id)) set.delete(id); else set.add(id);
    write(KEY.bookmarks, [...set]);
    invalidateStorageCache(KEY.bookmarks);
    toast(set.has(id) ? 'Bookmarked' : 'Bookmark removed');
  }



  function toggleTheme() {
    const light = document.documentElement.classList.toggle('light');
    write(KEY.theme, light ? 'light' : 'dark');
  }

  function initTheme() {
    if (read(KEY.theme, '') === 'light') document.documentElement.classList.add('light');
  }

  function keyboard(event) {
    const modal = $('sessionModal');
    if (modal && !modal.classList.contains('hidden')) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal(modal.id);
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
          .filter(element => !element.disabled && element.offsetParent !== null);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      return;
    }

    const practice = $('practiceOverlay');
    if (!practice || practice.classList.contains('hidden')) return;

    const target = event.target;
    const typing = target instanceof HTMLElement && (
      target.matches('input, textarea, select, [contenteditable="true"]') ||
      target.isContentEditable
    );
    if (typing) return;

    const key = event.key.toLowerCase();
    if (key === 'enter' && !$('submitAnswer').classList.contains('hidden') && !$('submitAnswer').disabled) {
      event.preventDefault();
      submitAnswer();
      return;
    }
     if (key === 'n' || event.key === 'ArrowRight') {
      event.preventDefault();
      nextQuestion();
    } else if (key === 'p' || event.key === 'ArrowLeft') {
      event.preventDefault();
      prevQuestion();
    } else if (key === 'm') {
      event.preventDefault();
      toggleSaved('bookmark');
    } else if (key === 'r') {
      event.preventDefault();
      toggleSaved('review');
    } else if (key === 's') {
      event.preventDefault();
      toggleAnswer();
    } else if (/^[0-9]$/.test(event.key)) {
  const fillInput = $('fillAnswer');

  // Integer/numerical question:
  // Any number key focuses the answer field and inserts the number.
  if (fillInput && !fillInput.disabled) {
    event.preventDefault();

    fillInput.focus();

    const start = fillInput.selectionStart ?? fillInput.value.length;
    const end = fillInput.selectionEnd ?? fillInput.value.length;

    fillInput.setRangeText(event.key, start, end, 'end');
    fillInput.dispatchEvent(new Event('input', { bubbles: true }));

    return;
  }

  // MCQ:
  // 1-5 select options A-E.
  const optionIndex = Number(event.key) - 1;

  if (optionIndex >= 0 && optionIndex < 5) {
    const buttons = document.querySelectorAll('.answer-option');
    const button = buttons[optionIndex];

    if (button && !button.disabled) {
      event.preventDefault();
      button.click();
    }
  }
} else if (/^[a-eA-E]$/.test(event.key)) {
  // A-E select options 1-5.
  const optionIndex = event.key.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);

  const buttons = document.querySelectorAll('.answer-option');
  const button = buttons[optionIndex];

  if (button && !button.disabled) {
    event.preventDefault();
    button.click();
  }
}
  }

  function typeset(element = null) {
    const mathJax = window.MathJax;
    if (!mathJax?.typesetPromise) return;

    // Passing the newly-rendered container is important: answer options are
    // replaced with innerHTML on every selection, so their TeX must be
    // explicitly processed again.
    const targets = element ? [element] : undefined;
    mathJax.typesetPromise(targets).catch(error => {
      console.warn('MathJax typesetting failed:', error);
    });
  }

  window.addEventListener('error', event => {
    console.error('Unhandled application error:', event.error || event.message);
    toast('Something went wrong. Please refresh and try again.');
  });
  window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled promise rejection:', event.reason);
    toast('A background operation failed. Please try again.');
  });

  init();

  // Cache the question library after the first visit. This makes subsequent
  // opens much faster without moving progress/history out of localStorage.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }, { once: true });
  }
})();
