/**
 * app.js
 * Main application entry point.
 * Wires together Parser, Player, Storage, and UI.
 */

(function () {
  'use strict';

  let course   = null;
  let flatList = [];

  // ── Boot ──────────────────────────────────────────────────
  function init() {
    // Init modules
    UI.init({
      onVideoSelect: handleVideoSelect,
    });

    Player.init({
      onVideoChange:  handleVideoChange,
      onVideoComplete: handleVideoComplete,
    });

    // Folder input
    document.getElementById('folder-input')
      .addEventListener('change', handleFolderInput);

    // Welcome screen buttons
    document.getElementById('open-folder-btn')
      ?.addEventListener('click', () => {
        document.getElementById('folder-input').click();
      });

    // Keyboard: escape closes modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') UI.closeSettings();
    });

    // Restore last session
    _tryRestoreSession();
  }

  // ── Folder loading ────────────────────────────────────────
  function handleFolderInput(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    course   = Parser.parse(files);
    flatList = Parser.flattenVideos(course);

    if (!course || flatList.length === 0) {
      UI.showToast('No video files found. Check your folder structure.');
      return;
    }

    UI.renderCourse(course, flatList);
    Player.load.__flatList = flatList;

    // Try resume last watched
    const lastWatched = Storage.getLastWatched();
    let startVideo    = flatList[0];

    if (lastWatched) {
      const found = flatList.find(v => v.id === lastWatched.id);
      if (found) startVideo = found;
    }

    handleVideoSelect(startVideo);

    // Reset file input so same folder can be re-loaded
    e.target.value = '';
  }

  // ── Video selection ───────────────────────────────────────
  function handleVideoSelect(video) {
    if (!video) return;
    Player.load(video, flatList);
  }

  function handleVideoChange(video, index) {
    UI.setActiveVideo(video.id);
    UI.updateBreadcrumbs(video);
    Storage.saveLastWatched(video.id);
    document.title = `${video.title} — Local Coursera Player`;
  }

  function handleVideoComplete(videoId) {
    UI.markVideoComplete(videoId);
  }

  // ── Session restore ───────────────────────────────────────
  function _tryRestoreSession() {
    // We can only show welcome screen since files can't be persisted
    // across browser sessions (File API limitation).
    // The last-watched ID is saved for when a folder is re-loaded.
    const last = Storage.getLastWatched();
    if (last) {
      const subtitle = document.querySelector('.welcome-subtitle');
      if (subtitle) {
        subtitle.textContent =
          'Select your course folder to resume where you left off. ' +
          'Your progress is automatically saved locally.';
      }
    }
  }

  // ── Start ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
