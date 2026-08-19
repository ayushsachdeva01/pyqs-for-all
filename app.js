(() => {
  'use strict';

  const KEY = {
    attempts: 'jeePractice_attempts_v3',
    bookmarks: 'jeePractice_bookmarks_v3',
    review: 'jeePractice_review_v3',
    sessions: 'jeePractice_sessions_v3',
    active: 'jeePractice_sessions_v3__active',
    theme: 'jeePractice_theme_v3'
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
    selected: new Set(),
    timer: null,
    qStartedAt: 0,
    order: 'newest',
    resumeChoice: 'resume',
    detailFilters: {},
    modalReturnFocus: null
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

  const attempts = () => {
    const value = read(KEY.attempts, []);
    return Array.isArray(value) ? value : [];
  };
  const bookmarks = () => {
    const value = read(KEY.bookmarks, []);
    return new Set(Array.isArray(value) ? value.map(String) : []);
  };
  const reviews = () => {
    const value = read(KEY.review, []);
    return new Set(Array.isArray(value) ? value.map(String) : []);
  };

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
    }));
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
  function subjects() { return allSubjects().filter(s => state.questions.some(q => q._exam === state.exam && q._subject === s)); }

  function getAttempts(id) { return attempts().filter(a => a.questionId === id); }
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
    try {
      const manifestResponse = await fetch(new URL('manifest.json', base), { cache: 'default' });
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        const files = Array.isArray(manifest) ? manifest : manifest.files;
        if (!Array.isArray(files)) throw new Error('Invalid question manifest');
        const manifestFiles = files.filter(name => typeof name === 'string' && /\.json$/i.test(name));
        const results = await Promise.allSettled(manifestFiles.map(name => fetchQuestionFile(new URL(name, base))));
        const payloads = results.filter(result => result.status === 'fulfilled').map(result => result.value);
        const failedFiles = results.filter(result => result.status === 'rejected').length;
        if (!payloads.length) throw new Error('No question files could be loaded');
        if (failedFiles) console.warn(`${failedFiles} question file(s) failed to load.`);

        state.questions = dedupeQuestions(normalize(payloads.flatMap(extractQuestionArray)));
        toast(`Loaded ${state.questions.length} questions`);
        return;
      }
    } catch (error) {
      console.warn('Question manifest could not be loaded:', error);
    }

    // Optional fallback for servers that expose directory listings.
    try {
      const directoryResponse = await fetch(base, { cache: 'no-store' });
      if (!directoryResponse.ok) throw new Error('Question directory unavailable');
      const html = await directoryResponse.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const files = [...doc.querySelectorAll('a[href]')]
        .map(a => a.getAttribute('href'))
        .filter(href => href && /\.json(?:$|[?#])/i.test(href) && !/manifest\.json(?:$|[?#])/i.test(href));
      if (!files.length) throw new Error('No question JSON files found');
      const payloads = await Promise.all([...new Set(files)].map(name => fetchQuestionFile(new URL(name, base))));
      state.questions = dedupeQuestions(normalize(payloads.flatMap(extractQuestionArray)));
      toast(`Loaded ${state.questions.length} questions`);
    } catch (error) {
      state.questions = [];
      console.error('Could not load the question library:', error);
      toast('Could not load the question library. Check the questions folder.');
    }
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
    $('openAllQuestions').onclick = () => showPage('allQuestions');
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
      button.onclick = () => {
        state.order = button.dataset.orderChoice;
        document.querySelectorAll('[data-order-choice]').forEach(x => x.classList.toggle('active', x === button));
      };
    });

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

    $('allSearch').oninput = renderAllQuestions;
    ['allSubject', 'allChapter', 'allYear', 'allStatus'].forEach(id => $(id).onchange = renderAllQuestions);
    $('clearAllFilters').onclick = () => {
      ['allSearch', 'allSubject', 'allChapter', 'allYear', 'allStatus'].forEach(id => $(id).value = '');
      renderAllQuestions();
    };

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
    if (page === 'allQuestions') renderAllQuestions();
    if (page === 'bookmarks') renderBookmarks();
    if (page === 'history') renderHistory();
    if (page === 'analytics') renderAnalytics();
  }

  function switchExam(exam) {
    state.exam = exam;
    state.subject = subjects()[0] || 'Physics';
    state.chapter = null;
    renderExamTabs();
    populateAllFilters();
    showPage('home');
  }

  function renderExamTabs() {
    document.querySelectorAll('#examTabs button').forEach(b => b.classList.toggle('active', b.dataset.exam === state.exam));
    $('sideExam').textContent = prettyExam(state.exam);
  }

  function renderHome() {
    const qs = examQs();
    $('homeTitle').textContent = prettyExam(state.exam);
    $('sideExam').textContent = prettyExam(state.exam);
    $('homeSubtitle').textContent = `${qs.length.toLocaleString()} questions across ${new Set(qs.map(q => q._chapter)).size} chapters · ${yearRange(qs)} · progress is stored locally on this device.`;

    const icons = { Physics: 'PHY', Chemistry: 'CHE', Mathematics: 'MAT' };
    $('subjectGrid').innerHTML = allSubjects().map(subject => {
      const data = qs.filter(q => q._subject === subject);
      const chapters = new Set(data.map(q => q._chapter));
      return `<article class="subject-card ${data.length ? '' : 'empty-subject'}" data-subject="${esc(subject)}">
        <div class="subject-top">
          <div class="subject-icon">${icons[subject]}</div>
          <h2>${subject}</h2>
          <p>${data.length ? 'Chapter-wise questions with solutions, progress and personal timing.' : 'No questions are available for this subject yet.'}</p>
          <div class="subject-meta"><span>${data.length} questions</span><span>•</span><span>${chapters.size} chapters</span><span>•</span><span>${esc(yearRange(data))}</span></div>
        </div>
        <div class="subject-open">${data.length ? 'Explore chapters' : 'No questions'} <span>→</span></div>
      </article>`;
    }).join('');

    document.querySelectorAll('.subject-card').forEach(card => {
      card.onclick = () => {
        if (!examQs().some(q => q._subject === card.dataset.subject)) return;
        state.subject = card.dataset.subject;
        showPage('chapters');
      };
    });

    const relevant = attempts().filter(a => qs.some(q => q._id === a.questionId));
    const attempted = new Set(relevant.map(a => a.questionId)).size;
    const correct = relevant.filter(a => a.correct).length;
    const saved = [...bookmarks()].filter(id => qs.some(q => q._id === id)).length;
    $('homeOverview').innerHTML = [
      ['Questions', qs.length],
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
    const qs = examQs().filter(q => q._subject === state.subject);
    let chapters = [...new Set(qs.map(q => q._chapter))].map(chapter => {
      const data = qs.filter(q => q._chapter === chapter);
      const progress = progressFor(data);
      const accuracy = progress.attempted ? Math.round(progress.correct / progress.attempted * 100) : 0;
      return { chapter, data, ...progress, accuracy, weak: data.length > 0 && accuracy < 60 };
    });

    if (filter === 'weak') chapters = chapters.filter(x => x.weak);
    if (filter === 'unattempted') chapters = chapters.filter(x => x.attempted < x.data.length);

    const sort = $('chapterSort').value;
    if (sort === 'questions') chapters.sort((a, b) => b.data.length - a.data.length);
    if (sort === 'accuracy') chapters.sort((a, b) => b.accuracy - a.accuracy);
    if (sort === 'weakness') chapters.sort((a, b) => a.accuracy - b.accuracy);

    const groups = {};
    chapters.forEach(chapter => (groups[chapter.data[0]?._group || 'Other'] ??= []).push(chapter));

    $('chapterGroups').innerHTML = Object.entries(groups).map(([group, items]) =>
      `<section class="chapter-group"><h2>${esc(title(group))}</h2><div class="chapter-grid">${items.map(chapterCard).join('')}</div></section>`
    ).join('') || '<div class="empty">No chapters match this filter.</div>';

    document.querySelectorAll('.chapter-card').forEach(card => {
      card.onclick = () => openChapter(card.dataset.chapter);
    });
  }

  function chapterCard(item) {
    const correctPct = item.data.length ? (item.correct / item.data.length * 100) : 0;
    const wrongPct = item.data.length ? (item.wrong / item.data.length * 100) : 0;
    return `<article class="chapter-card" data-chapter="${esc(item.chapter)}">
      <div class="chapter-card-top">
        <div class="chapter-count"><b>${item.data.length}</b><span>Qs</span></div>
        <div class="chapter-card-info"><h3>${esc(item.chapter)}</h3>
          <div class="chapter-tags"><span class="tag">${esc(prettyExam(item.data[0]?._exam))}</span><span class="tag">${esc(yearRange(item.data))}</span></div>
          <div class="chapter-progress"><span>${item.attempted}/${item.data.length} attempted · ${item.correct} correct · ${item.wrong} wrong</span><b>${item.attempted ? item.accuracy : 0}%</b></div>
        </div>
      </div>
      <div class="progress progress-multi" aria-label="${item.correct} correct, ${item.wrong} wrong, ${item.data.length - item.attempted} unattempted">
        <i class="progress-correct" style="width:${correctPct}%"></i><i class="progress-wrong" style="width:${wrongPct}%"></i>
      </div>
      <div class="chapter-card-foot">Open chapter <span>→</span></div>
    </article>`;
  }

  function openChapter(chapter) {
    state.chapter = chapter;
    state.chapterView = 'all';
    state.subject = examQs().find(q => q._chapter === chapter)?._subject || state.subject;
    showPage('chapter');
  }

  function renderChapterQuestions() {
    const allQs = examQs().filter(q => q._subject === state.subject && q._chapter === state.chapter);
    const qs = state.chapterView === 'mistakes' ? getChapterMistakes() : allQs;
    updateChapterViewTabs();
    $('detailSubject').textContent = state.subject.toUpperCase();
    $('detailTitle').textContent = state.chapter || 'Chapter';
    const mistakeCount = getChapterMistakes().length;
    $('detailSub').textContent = `${state.chapterView === 'mistakes' ? 'Questions currently in your mistake list' : `${allQs.length} questions`} · ${new Set(allQs.map(q => q._topic)).size} topics · ${yearRange(allQs)}`;
    $('detailPractice').textContent = state.chapterView === 'mistakes' ? `Retry ${mistakeCount} mistake${mistakeCount === 1 ? '' : 's'}` : 'Start practice';
    $('detailPractice').disabled = state.chapterView === 'mistakes' && mistakeCount === 0;

    const relevant = latestAttemptsFor(allQs);
    const correct = relevant.filter(a => a.correct).length;
    const avg = relevant.length ? Math.round(relevant.reduce((sum, a) => sum + (Number(a.timeMs) || 0), 0) / relevant.length) : 0;
    $('detailStats').innerHTML = [
      ['Questions', allQs.length],
      ['Attempted', relevant.length],
      ['Accuracy', relevant.length ? `${Math.round(correct / relevant.length * 100)}%` : '—'],
      ['Mistakes', mistakeCount]
    ].map(([label, value]) => `<div class="detail-stat"><span>${label}</span><b>${value}</b></div>`).join('');

    const search = $('questionSearch').value.trim().toLowerCase();
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

    const year = $('yearFilter').value;
    const difficulty = $('difficultyFilter').value;
    const type = $('typeFilter').value;
    const filtered = qs.filter(q =>
      (!search || strip(qtext(q)).toLowerCase().includes(search) || q._topic.toLowerCase().includes(search)) &&
      (!year || String(q._year) === year) &&
      (!difficulty || q._difficulty === difficulty) &&
      (!type || q._type === type)
    );

    const grouped = {};
    filtered.forEach(q => (grouped[q._year || 'Other'] ??= []).push(q));
    $('chapterQuestions').innerHTML = Object.entries(grouped).sort((a, b) => Number(b[0]) - Number(a[0])).map(([yearKey, list]) =>
      `<section><h2 class="year-heading">${esc(yearKey)}</h2>${list.map((q, i) => questionRow(q, i)).join('')}</section>`
    ).join('') || `<div class="empty"><strong>${state.chapterView === 'mistakes' ? 'No mistakes here' : 'No questions match these filters.'}</strong><span>${state.chapterView === 'mistakes' ? 'Questions leave this tab automatically once your latest attempt is correct.' : ''}</span></div>`;

    bindQuestionRows();
    typeset();
  }

  function questionRow(q, index) {
    const attempt = lastAttempt(q._id);
    const saved = bookmarks().has(q._id);
    const statusClass = attempt ? (attempt.correct ? 'row-correct' : 'row-wrong') : '';
    const status = attempt ? (attempt.correct ? 'Correct' : 'Wrong') : 'Unattempted';
    const text = strip(qtext(q));
    return `<article class="question-row ${statusClass}" data-open-q="${esc(q._id)}">
      <div class="q-index">${index + 1}</div>
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
      <div class="q-actions"><button class="tiny-action" data-bookmark-q="${esc(q._id)}" title="Bookmark">${saved ? '★' : '☆'}</button></div>
    </article>`;
  }

  function bindQuestionRows() {
    document.querySelectorAll('[data-open-q]').forEach(button => {
      button.onclick = event => {
        if (event.target.closest('[data-bookmark-q]')) return;
        const q = state.questions.find(item => item._id === button.dataset.openQ);
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
  }

  function openSingle(q) {
    state.session = createSession([q], 'single');
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
      (!search || strip(qtext(q)).toLowerCase().includes(search) || q._topic.toLowerCase().includes(search) || String(q.paperTitle || '').toLowerCase().includes(search)) &&
      (!subject || q._subject === subject) &&
      (!chapter || q._chapter === chapter) &&
      (!year || String(q._year) === year) &&
      (!status || statusMatch(q, status))
    );
  }

  function renderAllQuestions() {
    const filtered = filteredAllQuestions();
    $('allCount').textContent = `${filtered.length} questions`;
    $('allQuestions').innerHTML = filtered.length
      ? filtered.map((q, i) => questionRow(q, i)).join('')
      : '<div class="empty">No questions match these filters.</div>';
    bindQuestionRows();
    typeset();
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
          const q = state.questions.find(x => x._id === item.questionId);
          return q ? questionRow(q, 0).replace('data-open-q', 'data-history-q') : '';
        }).join('')}</div>`
      : '<div class="empty">Your practice history will appear here after your first answer.</div>';

    document.querySelectorAll('[data-history-q]').forEach(button => {
      button.onclick = () => {
        const q = state.questions.find(x => x._id === button.dataset.historyQ);
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
    state.order = 'newest';
    state.resumeChoice = 'resume';
    $('sessionTitle').textContent = source === 'chapter' ? state.chapter : 'Practice session';
    $('sessionSubtitle').textContent = `${pool.length} questions · ${prettyExam(state.exam)} · ${yearRange(pool)}. All matching questions will be included.`;
    $('sessionSummaryCount').textContent = `${pool.length} question${pool.length === 1 ? '' : 's'} in this session`;

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
    typeset();
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
    typeset();
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
    typeset();
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
    const set = kind === 'bookmark' ? bookmarks() : reviews();
    const had = set.has(q._id);
    if (had) set.delete(q._id); else set.add(q._id);
    write(kind === 'bookmark' ? KEY.bookmarks : KEY.review, [...set]);
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
    const set = bookmarks();
    if (set.has(id)) set.delete(id); else set.add(id);
    write(KEY.bookmarks, [...set]);
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
})();
