/**
 * storage.js
 * Wrapper around localStorage for progress tracking and settings.
 * All data is namespaced under "clp_" (Coursera Local Player).
 */

const Storage = (() => {

  const NS = 'clp_';

  // ── Raw access ───────────────────────────────────────────
  function _get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function _del(key) {
    try {
      localStorage.removeItem(NS + key);
    } catch {}
  }

  // ── Progress: completed video IDs ───────────────────────
  /**
   * Get the Set of completed video IDs.
   */
  function getCompleted() {
    return new Set(_get('completed', []));
  }

  /**
   * Mark a video ID as completed.
   */
  function markComplete(videoId) {
    const set = getCompleted();
    set.add(videoId);
    _set('completed', [...set]);
  }

  /**
   * Unmark a video as complete.
   */
  function markIncomplete(videoId) {
    const set = getCompleted();
    set.delete(videoId);
    _set('completed', [...set]);
  }

  /**
   * Check if a video is completed.
   */
  function isCompleted(videoId) {
    return getCompleted().has(videoId);
  }

  // ── Progress: last watched ───────────────────────────────
  /**
   * Save last watched video id and timestamp.
   */
  function saveLastWatched(videoId, currentTime = 0) {
    _set('last_watched', { id: videoId, t: currentTime, ts: Date.now() });
  }

  /**
   * Get last watched { id, t, ts } or null.
   */
  function getLastWatched() {
    return _get('last_watched', null);
  }

  /**
   * Save resume time for a specific video.
   */
  function saveResumeTime(videoId, currentTime) {
    const map = _get('resume_times', {});
    map[videoId] = currentTime;
    _set('resume_times', map);
  }

  /**
   * Get resume time for a video.
   */
  function getResumeTime(videoId) {
    const map = _get('resume_times', {});
    return map[videoId] || 0;
  }

  // ── Settings ─────────────────────────────────────────────
  const DEFAULTS = {
    theme:         'light',       // 'light' | 'dark'
    seekInterval:  5,             // seconds
    autoAdvance:   true,
    volume:        1.0,
    playbackSpeed: 1.0,
  };

  /**
   * Get a setting value.
   */
  function getSetting(key) {
    const settings = _get('settings', {});
    return key in settings ? settings[key] : DEFAULTS[key];
  }

  /**
   * Set a setting value.
   */
  function setSetting(key, value) {
    const settings = _get('settings', {});
    settings[key] = value;
    _set('settings', settings);
  }

  /**
   * Get all settings merged with defaults.
   */
  function getAllSettings() {
    const saved = _get('settings', {});
    return { ...DEFAULTS, ...saved };
  }

  // ── Clear / Export ───────────────────────────────────────
  /**
   * Clear all progress data (completed, last watched, resume times).
   * Settings are preserved.
   */
  function clearProgress() {
    _del('completed');
    _del('last_watched');
    _del('resume_times');
  }

  /**
   * Clear everything including settings.
   */
  function clearAll() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(NS))
      .forEach(k => localStorage.removeItem(k));
  }

  /**
   * Import progress data from a previously exported JSON object.
   * Returns { ok: true } on success or { ok: false, error: string } on failure.
   */
  function importProgress(data) {
    try {
      if (typeof data !== 'object' || data === null) throw new Error('Invalid data');

      if (Array.isArray(data.completed)) {
        _set('completed', data.completed);
      }
      if (data.last_watched && typeof data.last_watched === 'object') {
        _set('last_watched', data.last_watched);
      }
      if (data.resume_times && typeof data.resume_times === 'object') {
        _set('resume_times', data.resume_times);
      }
      // Import settings selectively — don't blindly overwrite unknowns
      if (data.settings && typeof data.settings === 'object') {
        const allowed = ['theme', 'seekInterval', 'autoAdvance', 'volume', 'playbackSpeed'];
        const current = _get('settings', {});
        for (const key of allowed) {
          if (key in data.settings) current[key] = data.settings[key];
        }
        _set('settings', current);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Export all data to a downloadable JSON file.
   */
  function exportProgress() {
    const data = {
      exported_at: new Date().toISOString(),
      completed:   [...getCompleted()],
      last_watched: getLastWatched(),
      resume_times: _get('resume_times', {}),
      settings:    getAllSettings(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `coursera-local-progress-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Get progress stats for the current course.
   * @param {string[]} allVideoIds
   */
  function getCourseStats(allVideoIds) {
    const completed = getCompleted();
    const done = allVideoIds.filter(id => completed.has(id)).length;
    return {
      total:     allVideoIds.length,
      completed: done,
      percent:   allVideoIds.length > 0 ? Math.round((done / allVideoIds.length) * 100) : 0,
    };
  }

  return {
    // Progress
    getCompleted, markComplete, markIncomplete, isCompleted,
    saveLastWatched, getLastWatched,
    saveResumeTime, getResumeTime,
    // Settings
    getSetting, setSetting, getAllSettings,
    // Admin
    clearProgress, clearAll, exportProgress, importProgress,
    getCourseStats,
  };

})();
