/**
 * ui.js
 * Manages theme switching, sidebar rendering, settings modal,
 * and all UI state transitions.
 */

const UI = (() => {

  // ── DOM refs ─────────────────────────────────────────────
  let sidebarEl, sidebarNav, sidebarCourseTitle,
      progressBarFill, progressPct, sidebarStats,
      statsCompleted, statsTotal, statsPercent;

  // ── Current course data ───────────────────────────────────
  let currentCourse  = null;
  let flatList       = [];
  let activeVideoId  = null;
  let onVideoSelect  = null; // callback(video)

  // ── Init ─────────────────────────────────────────────────
  function init(callbacks = {}) {
    onVideoSelect = callbacks.onVideoSelect || (() => {});

    sidebarEl          = document.getElementById('sidebar');
    sidebarNav         = document.getElementById('sidebar-nav');
    sidebarCourseTitle = document.getElementById('sidebar-course-title');

    _initTheme();
    _bindHeaderEvents();
    _initSettingsModal();
  }

  // ── Theme ─────────────────────────────────────────────────
  function _initTheme() {
    const saved = Storage.getSetting('theme');
    _applyTheme(saved, false);
  }

  function _applyTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggle = document.getElementById('theme-toggle-check');
    if (toggle) toggle.checked = theme === 'dark';
    if (save) Storage.setSetting('theme', theme);
  }

  function toggleTheme() {
    const current = Storage.getSetting('theme');
    _applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // ── Sidebar toggle ────────────────────────────────────────
  function toggleSidebar() {
    sidebarEl.classList.toggle('collapsed');
    const btn = document.getElementById('sidebar-toggle');
    const collapsed = sidebarEl.classList.contains('collapsed');
    btn.innerHTML = collapsed ? _icon('panel-left-open') : _icon('panel-left-close');
    btn.setAttribute('data-tooltip', collapsed ? 'Show sidebar' : 'Hide sidebar');
  }

  // ── Header events ─────────────────────────────────────────
  function _bindHeaderEvents() {
    document.getElementById('sidebar-toggle')
      ?.addEventListener('click', toggleSidebar);

    document.getElementById('settings-btn')
      ?.addEventListener('click', openSettings);

    document.getElementById('theme-btn')
      ?.addEventListener('click', toggleTheme);

    document.getElementById('open-folder-header')
      ?.addEventListener('click', () => {
        document.getElementById('folder-input').click();
      });

    document.getElementById('expand-all-btn')
      ?.addEventListener('click', () => {
        document.querySelectorAll('.topic-group, .lesson-group').forEach(el => {
          el.classList.add('open');
        });
        document.querySelectorAll('.topic-header').forEach(h => h.setAttribute('aria-expanded', 'true'));
      });

    document.getElementById('collapse-all-btn')
      ?.addEventListener('click', () => {
        document.querySelectorAll('.topic-group, .lesson-group').forEach(el => {
          el.classList.remove('open');
        });
        document.querySelectorAll('.topic-header').forEach(h => h.setAttribute('aria-expanded', 'false'));
      });
  }

  // ── Render course in sidebar ──────────────────────────────
  function renderCourse(course, flat) {
    currentCourse = course;
    flatList      = flat;
    activeVideoId = null;

    if (sidebarCourseTitle) {
      sidebarCourseTitle.textContent = course.title;
    }

    _renderTree();
    _updateProgress();
    _updateBreadcrumbs(null);

    // Show player screen, hide welcome
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('player-screen').classList.add('visible');
  }

  function _renderTree() {
    sidebarNav.innerHTML = '';
    if (!currentCourse || !currentCourse.topics.length) {
      sidebarNav.innerHTML = `
        <div class="sidebar-empty">
          ${_icon('folder-open', 32)}
          <span>No videos found in this folder.</span>
        </div>`;
      return;
    }

    const completed = Storage.getCompleted();

    currentCourse.topics.forEach((topic, ti) => {
      const totalVids    = topic.lessons.reduce((s, l) => s + l.videos.length, 0);
      const completedVids = topic.lessons.reduce((s, l) =>
        s + l.videos.filter(v => completed.has(v.id)).length, 0);

      const isAllDone  = completedVids === totalVids && totalVids > 0;
      const isSomeDone = completedVids > 0 && !isAllDone;

      const group = document.createElement('div');
      group.className = [
        'topic-group',
        'open',   // all topics expanded by default
        isAllDone ? 'all-complete' : '',
        isSomeDone ? 'some-complete' : '',
      ].filter(Boolean).join(' ');

      group.innerHTML = `
        <button class="topic-header" aria-expanded="true">
          <span class="topic-chevron">${_icon('chevron-right', 14)}</span>
          <span class="topic-title-area">
            <span class="topic-title">${_esc(topic.title)}</span>
            <span class="topic-meta">${completedVids} / ${totalVids} completed</span>
          </span>
          <span class="topic-progress-dot"></span>
        </button>
        <div class="topic-lessons"></div>`;

      const header  = group.querySelector('.topic-header');
      const lessonsEl = group.querySelector('.topic-lessons');

      header.addEventListener('click', () => {
        group.classList.toggle('open');
        header.setAttribute('aria-expanded', group.classList.contains('open'));
      });

      // Render lessons
      topic.lessons.forEach((lesson, li) => {
        const lessonGroup = document.createElement('div');
        lessonGroup.className = 'lesson-group open'; // all lessons expanded by default
        lessonGroup.dataset.lessonId = lesson.id;

        const completedInLesson = lesson.videos.filter(v => completed.has(v.id)).length;

        lessonGroup.innerHTML = `
          <button class="lesson-header">
            <span class="lesson-chevron">${_icon('chevron-right', 12)}</span>
            <span class="lesson-title-area">
              <span class="lesson-title">${_esc(lesson.title)}</span>
              <span class="lesson-count">${lesson.videos.length} video${lesson.videos.length !== 1 ? 's' : ''}</span>
            </span>
          </button>
          <div class="lesson-videos"></div>`;

        const lHeader    = lessonGroup.querySelector('.lesson-header');
        const videosEl   = lessonGroup.querySelector('.lesson-videos');

        lHeader.addEventListener('click', () => {
          lessonGroup.classList.toggle('open');
        });

        // Render videos
        lesson.videos.forEach(video => {
          const isComplete = completed.has(video.id);
          const item = document.createElement('button');
          item.className = 'video-item' + (isComplete ? ' completed' : '');
          item.dataset.videoId = video.id;

          const statusClass = isComplete ? 'completed' : 'not-started';
          const statusIcon  = isComplete
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
            : '';

          item.innerHTML = `
            <span class="video-status">
              <span class="status-icon ${statusClass}">${statusIcon}</span>
            </span>
            <span class="video-text">
              <span class="video-title">${_esc(video.title)}</span>
            </span>`;

          item.addEventListener('click', () => {
            onVideoSelect(video);
          });

          videosEl.appendChild(item);
        });

        lessonsEl.appendChild(lessonGroup);
      });

      sidebarNav.appendChild(group);
    });

    _renderSidebarFooter();
  }

  function _renderSidebarFooter() {
    const footer = document.getElementById('sidebar-footer-stats');
    if (!footer) return;
    // Footer is now collapse/expand controls — rendered once in HTML, nothing dynamic needed
  }

  // ── Update progress bar in sidebar header ────────────────
  function _updateProgress() {
    const stats = Storage.getCourseStats(flatList.map(v => v.id));
    const fill = document.getElementById('sidebar-progress-fill');
    const pct  = document.getElementById('sidebar-progress-pct');
    if (fill) fill.style.width = stats.percent + '%';
    if (pct)  pct.textContent  = stats.percent + '%';
  }

  // ── Set active video in sidebar ───────────────────────────
  function setActiveVideo(videoId) {
    activeVideoId = videoId;

    // Deactivate all
    document.querySelectorAll('.video-item').forEach(el => {
      el.classList.remove('active');
    });

    // Activate target
    const target = document.querySelector(`.video-item[data-video-id="${CSS.escape(videoId)}"]`);
    if (target) {
      target.classList.add('active');
      // Open parent lesson + topic groups
      const lessonGroup = target.closest('.lesson-group');
      const topicGroup  = target.closest('.topic-group');
      if (lessonGroup) lessonGroup.classList.add('open');
      if (topicGroup)  topicGroup.classList.add('open');
      // Scroll into view
      setTimeout(() => target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 100);
    }
  }

  // ── Mark video complete in sidebar ────────────────────────
  function markVideoComplete(videoId) {
    const item = document.querySelector(`.video-item[data-video-id="${CSS.escape(videoId)}"]`);
    if (!item) return;
    item.classList.add('completed');
    const statusIcon = item.querySelector('.status-icon');
    if (statusIcon) {
      statusIcon.className = 'status-icon completed';
      statusIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    }
    _updateProgress();
  }

  // ── Breadcrumbs ───────────────────────────────────────────
  function _updateBreadcrumbs(video) {
    const el = document.getElementById('breadcrumbs');
    if (!el) return;
    if (!video || !currentCourse) {
      el.innerHTML = `<span class="breadcrumb-item">${_esc(currentCourse?.title || '')}</span>`;
      return;
    }
    el.innerHTML = [
      `<span class="breadcrumb-item">${_esc(currentCourse.title)}</span>`,
      `<span class="breadcrumb-sep">›</span>`,
      `<span class="breadcrumb-item">${_esc(video.topicTitle || '')}</span>`,
      `<span class="breadcrumb-sep">›</span>`,
      `<span class="breadcrumb-item">${_esc(video.lessonTitle || '')}</span>`,
      `<span class="breadcrumb-sep">›</span>`,
      `<span class="breadcrumb-item current">${_esc(video.title)}</span>`,
    ].join('');
  }

  function updateBreadcrumbs(video) { _updateBreadcrumbs(video); }

  // ── Settings Modal ────────────────────────────────────────
  function _initSettingsModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay?.addEventListener('click', e => {
      if (e.target === overlay) closeSettings();
    });

    document.getElementById('settings-close')
      ?.addEventListener('click', closeSettings);

    // Theme toggle
    document.getElementById('theme-toggle-check')
      ?.addEventListener('change', e => {
        _applyTheme(e.target.checked ? 'dark' : 'light');
      });

    // Seek interval
    document.getElementById('seek-interval-select')
      ?.addEventListener('change', e => {
        Storage.setSetting('seekInterval', parseInt(e.target.value));
      });

    // Auto-advance
    document.getElementById('auto-advance-check')
      ?.addEventListener('change', e => {
        Storage.setSetting('autoAdvance', e.target.checked);
      });

    // Clear progress
    document.getElementById('clear-progress-btn')
      ?.addEventListener('click', () => {
        if (confirm('Clear all viewing progress? This cannot be undone.')) {
          Storage.clearProgress();
          if (currentCourse) _renderTree();
          _updateProgress();
          showToast('Progress cleared');
        }
      });

    // Export
    document.getElementById('export-btn')
      ?.addEventListener('click', () => {
        Storage.exportProgress();
        showToast('Progress exported');
      });
  }

  function openSettings() {
    const modal   = document.getElementById('modal-overlay');
    const settings = Storage.getAllSettings();

    // Populate current values
    const themeCheck  = document.getElementById('theme-toggle-check');
    const seekSel     = document.getElementById('seek-interval-select');
    const autoCheck   = document.getElementById('auto-advance-check');

    if (themeCheck) themeCheck.checked        = settings.theme === 'dark';
    if (seekSel)    seekSel.value              = settings.seekInterval;
    if (autoCheck)  autoCheck.checked          = settings.autoAdvance;

    modal.classList.add('open');
  }

  function closeSettings() {
    document.getElementById('modal-overlay')?.classList.remove('open');
  }

  // ── Toast notifications ───────────────────────────────────
  let toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: var(--text-primary); color: var(--bg-primary);
        padding: 10px 20px; border-radius: 100px;
        font-size: 0.85rem; font-family: var(--font-ui);
        z-index: 9999; pointer-events: none;
        transition: opacity 0.2s; opacity: 0;
        white-space: nowrap; box-shadow: var(--shadow-md);`;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }

  // ── SVG Icon helper ───────────────────────────────────────
  function _icon(name, size = 16) {
    const icons = {
      'panel-left-close': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
      'panel-left-open':  '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
      'chevron-right':    '<polyline points="9 18 15 12 9 6"/>',
      'folder-open':      '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    };
    const d = icons[name] || '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Public ────────────────────────────────────────────────
  return {
    init,
    renderCourse,
    setActiveVideo,
    markVideoComplete,
    updateBreadcrumbs,
    openSettings,
    closeSettings,
    showToast,
    toggleTheme,
    toggleSidebar,
  };

})();
