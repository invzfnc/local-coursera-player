/**
 * player.js
 * Manages the HTML5 video element, custom controls,
 * subtitle loading, keyboard shortcuts, and long-press speed.
 */

const Player = (() => {

  // ── DOM refs ─────────────────────────────────────────────
  let videoEl, scrubberContainer, scrubberProgress, scrubberBuffer,
      scrubberThumb, scrubberTooltip, playPauseBtn, volumeBtn,
      volumeSlider, timeDisplay, speedSelect, subtitleBtn,
      fullscreenBtn, playIndicator, seekLeftIndicator,
      seekRightIndicator, speedBadge, videoLoading,
      autoAdvanceBar, autoAdvanceBarFill, autoAdvanceToast,
      autoAdvanceCancel, nextBtn, videoInfoTitle, videoInfoMeta;

  // ── State ────────────────────────────────────────────────
  let currentVideo     = null;  // video object from Parser
  let flatList         = [];    // ordered list of all videos
  let currentIndex     = -1;
  let blobUrls         = {};    // videoId → blob url
  let subsBlobUrls     = {};    // file.name → blob url
  let isDragging       = false;
  let longPressTimer   = null;
  let isLongPress      = false;
  let normalSpeed      = 1.0;
  let autoAdvanceTimer = null;
  let onVideoChange    = null;  // callback(video, index)
  let onVideoComplete  = null;  // callback(videoId)

  // ── Init ─────────────────────────────────────────────────
  function init(callbacks = {}) {
    onVideoChange  = callbacks.onVideoChange  || (() => {});
    onVideoComplete = callbacks.onVideoComplete || (() => {});

    videoEl              = document.getElementById('video-el');
    scrubberContainer    = document.getElementById('scrubber-container');
    scrubberProgress     = document.getElementById('scrubber-progress');
    scrubberBuffer       = document.getElementById('scrubber-buffer');
    scrubberThumb        = document.getElementById('scrubber-thumb');
    scrubberTooltip      = document.getElementById('scrubber-tooltip');
    playPauseBtn         = document.getElementById('play-pause-btn');
    volumeBtn            = document.getElementById('volume-btn');
    volumeSlider         = document.getElementById('volume-slider');
    timeDisplay          = document.getElementById('time-display');
    speedSelect          = document.getElementById('speed-select');
    subtitleBtn          = document.getElementById('subtitle-btn');
    fullscreenBtn        = document.getElementById('fullscreen-btn');
    playIndicator        = document.getElementById('play-indicator');
    seekLeftIndicator    = document.getElementById('seek-left-indicator');
    seekRightIndicator   = document.getElementById('seek-right-indicator');
    speedBadge           = document.getElementById('speed-overlay-badge');
    videoLoading         = document.getElementById('video-loading');
    autoAdvanceBar       = document.getElementById('auto-advance-bar');
    autoAdvanceBarFill   = document.getElementById('auto-advance-bar-fill');
    autoAdvanceToast     = document.getElementById('auto-advance-toast');
    autoAdvanceCancel    = document.getElementById('auto-advance-cancel');
    nextBtn              = document.getElementById('next-video-btn');
    videoInfoTitle       = document.getElementById('video-current-title');
    videoInfoMeta        = document.getElementById('video-current-meta');

    _bindEvents();
    _applyStoredSettings();
  }

  function _applyStoredSettings() {
    const vol   = Storage.getSetting('volume');
    const speed = Storage.getSetting('playbackSpeed');
    videoEl.volume = vol;
    volumeSlider.value = vol * 100;
    _updateVolumeIcon();
    normalSpeed = speed;
    speedSelect.value = speed;
    videoEl.playbackRate = speed;
  }

  // ── Load a video object ───────────────────────────────────
  function load(video, list, autoPlay = false) {
    if (!video) return;

    _cancelAutoAdvance();

    flatList      = list || flatList;
    currentVideo  = video;
    currentIndex  = flatList.findIndex(v => v.id === video.id);

    // Revoke old blob URL for this slot
    if (blobUrls[video.id]) {
      URL.revokeObjectURL(blobUrls[video.id]);
    }

    const blobUrl = URL.createObjectURL(video.file);
    blobUrls[video.id] = blobUrl;

    // Clear tracks
    while (videoEl.firstChild) videoEl.removeChild(videoEl.firstChild);

    videoEl.src = blobUrl;
    videoEl.load();

    // Load subtitles
    _loadSubtitles(video.subs || []);

    // Restore resume time
    const resumeTime = Storage.getResumeTime(video.id);

    videoEl.addEventListener('loadedmetadata', () => {
      if (resumeTime > 5) videoEl.currentTime = resumeTime;
      if (autoPlay) videoEl.play().catch(() => {});
    }, { once: true });

    // Update info bar
    videoInfoTitle.textContent = video.title;
    videoInfoMeta.textContent  = `${video.topicTitle || ''} › ${video.lessonTitle || ''}`;

    // Subtitle button state
    subtitleBtn.classList.toggle('has-subtitles', video.hasSubtitles);
    subtitleBtn.title = video.hasSubtitles ? 'Subtitles available' : 'No subtitles';

    // Notify app
    onVideoChange(video, currentIndex);

    // Next button visibility
    _updateNextBtn();
  }

  /**
   * Convert an SRT string to a valid WebVTT string.
   * Injects a default cue position (bottom-center) into every cue header
   * so ::cue CSS can style them as professional hard-coded captions.
   *   SRT:  00:00:01,500 --> 00:00:04,000
   *   VTT:  00:00:01.500 --> 00:00:04.000 line:88% position:50% align:center
   */
  function _srtToVtt(srtText) {
    const normalized = srtText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/^\uFEFF/, '')
      .trim();

    // Split into cue blocks (separated by blank lines)
    const blocks = normalized.split(/\n\n+/);
    const vttBlocks = blocks.map(block => {
      const lines = block.split('\n');
      // Find the timestamp line (contains ' --> ')
      const tsIdx = lines.findIndex(l => l.includes(' --> '));
      if (tsIdx === -1) return null; // skip non-cue blocks

      // Convert SRT timestamps (comma) to VTT (dot) and append position settings
      lines[tsIdx] = lines[tsIdx]
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
        // Only append position if not already present
        + (lines[tsIdx].includes('line:') ? '' : ' line:88% position:50% align:center');

      // Drop the numeric cue index line if present (SRT has it, VTT doesn't need it)
      if (tsIdx === 1 && /^\d+$/.test(lines[0].trim())) {
        lines.shift();
      }

      return lines.join('\n');
    }).filter(Boolean);

    return 'WEBVTT\n\n' + vttBlocks.join('\n\n');
  }

  /**
   * Read a File as text (returns a Promise<string>).
   */
  function _readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Could not read ' + file.name));
      reader.readAsText(file, 'utf-8');
    });
  }

  async function _loadSubtitles(subFiles) {
    // Revoke old blob URLs
    Object.values(subsBlobUrls).forEach(u => URL.revokeObjectURL(u));
    subsBlobUrls = {};

    for (let i = 0; i < subFiles.length; i++) {
      const file = subFiles[i];
      try {
        let text = await _readFileText(file);
        const isSrt = file.name.toLowerCase().endsWith('.srt');
        const isVtt = file.name.toLowerCase().endsWith('.vtt');

        if (isSrt) {
          // Full conversion: timestamps + position injection
          text = _srtToVtt(text);
        } else if (isVtt) {
          // Inject position into existing VTT cue headers that lack it
          text = _injectVttPosition(text);
        }

        const blob    = new Blob([text], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);
        subsBlobUrls[file.name] = blobUrl;

        const track   = document.createElement('track');
        track.kind    = 'subtitles';
        track.src     = blobUrl;
        track.srclang = _detectLang(file.name);
        track.label   = track.srclang.toUpperCase();
        track.default = i === 0;
        videoEl.appendChild(track);

        // Force the first track to showing mode once loaded
        if (i === 0) {
          track.addEventListener('load', () => {
            if (videoEl.textTracks[0]) {
              videoEl.textTracks[0].mode = 'showing';
              subtitleBtn.classList.add('active');
            }
          }, { once: true });
        }
      } catch (err) {
        console.warn('Subtitle load error:', file.name, err);
      }
    }
  }

  /**
   * Inject bottom-center position settings into VTT cue timestamp lines
   * that don't already have positioning directives.
   */
  function _injectVttPosition(vttText) {
    return vttText.replace(
      /^(\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3})(?!\s*line:)(.*)$/gm,
      '$1 line:88% position:50% align:center$2'
    );
  }

  function _detectLang(filename) {
    const m = filename.match(/\.([a-z]{2})\.[^.]+$/i);
    return m ? m[1].toLowerCase() : 'en';
  }

  // ── Event binding ─────────────────────────────────────────
  function _bindEvents() {
    // Video element events
    videoEl.addEventListener('play',        _onPlay);
    videoEl.addEventListener('pause',       _onPause);
    videoEl.addEventListener('timeupdate',  _onTimeUpdate);
    videoEl.addEventListener('progress',    _onProgress);
    videoEl.addEventListener('ended',       _onEnded);
    videoEl.addEventListener('waiting',     () => videoLoading.classList.add('visible'));
    videoEl.addEventListener('canplay',     () => videoLoading.classList.remove('visible'));
    videoEl.addEventListener('volumechange', _updateVolumeIcon);

    // Click overlay (play/pause)
    document.getElementById('video-overlay').addEventListener('click', togglePlay);

    // Play/Pause button
    playPauseBtn.addEventListener('click', togglePlay);

    // Scrubber
    scrubberContainer.addEventListener('mousedown',  _scrubStart);
    scrubberContainer.addEventListener('mousemove',  _scrubHover);
    scrubberContainer.addEventListener('mouseleave', () => {
      if (!isDragging) scrubberTooltip.style.opacity = '0';
    });
    document.addEventListener('mousemove',  _scrubDrag);
    document.addEventListener('mouseup',    _scrubEnd);
    scrubberContainer.addEventListener('touchstart', _scrubTouchStart, { passive: true });
    document.addEventListener('touchmove',  _scrubTouchMove, { passive: false });
    document.addEventListener('touchend',   _scrubEnd);

    // Volume
    volumeBtn.addEventListener('click', _toggleMute);
    volumeSlider.addEventListener('input', e => {
      videoEl.volume = e.target.value / 100;
      Storage.setSetting('volume', videoEl.volume);
    });

    // Speed
    speedSelect.addEventListener('change', e => {
      normalSpeed = parseFloat(e.target.value);
      videoEl.playbackRate = normalSpeed;
      Storage.setSetting('playbackSpeed', normalSpeed);
    });

    // Subtitle
    subtitleBtn.addEventListener('click', _toggleSubtitles);

    // Fullscreen
    fullscreenBtn.addEventListener('click', _toggleFullscreen);
    document.addEventListener('fullscreenchange', _onFullscreenChange);

    // Keyboard shortcuts
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);

    // Next button
    nextBtn?.addEventListener('click', next);
    autoAdvanceCancel?.addEventListener('click', _cancelAutoAdvance);

    // ── Controls auto-hide — FULLSCREEN ONLY ─────────────
    const videoWrapper = document.getElementById('video-wrapper');
    let hideControlsTimer = null;

    function showControls() {
      videoWrapper.classList.remove('controls-hidden');
      clearTimeout(hideControlsTimer);
    }

    function scheduleHideControls() {
      clearTimeout(hideControlsTimer);
      // Only hide when playing AND in fullscreen
      if (!videoEl.paused && document.fullscreenElement) {
        hideControlsTimer = setTimeout(() => {
          videoWrapper.classList.add('controls-hidden');
        }, 2500);
      }
    }

    // Show on any mouse movement inside wrapper
    videoWrapper.addEventListener('mousemove', () => {
      if (!document.fullscreenElement) return;
      showControls();
      scheduleHideControls();
    });

    // Always show when mouse is on controls bar
    document.getElementById('player-controls')?.addEventListener('mouseenter', () => {
      if (!document.fullscreenElement) return;
      showControls();
    });

    videoWrapper.addEventListener('mouseleave', () => {
      if (!document.fullscreenElement) return;
      scheduleHideControls();
    });

    // Play/pause state changes
    videoEl.addEventListener('play', () => {
      videoWrapper.classList.remove('paused');
      if (document.fullscreenElement) scheduleHideControls();
    });

    videoEl.addEventListener('pause', () => {
      videoWrapper.classList.add('paused');
      showControls(); // always show when paused
    });

    // On fullscreen exit: always restore controls visibility
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        showControls();
        clearTimeout(hideControlsTimer);
      }
    });

    // Touch support in fullscreen
    videoWrapper.addEventListener('touchstart', () => {
      if (!document.fullscreenElement) return;
      showControls();
      scheduleHideControls();
    }, { passive: true });
  }

  // ── Playback ──────────────────────────────────────────────
  function togglePlay() {
    if (!videoEl.src) return;
    if (videoEl.paused) {
      videoEl.play();
    } else {
      videoEl.pause();
    }
    _flashPlayIndicator(!videoEl.paused);
  }

  function _onPlay() {
    playPauseBtn.innerHTML = _icon('pause');
  }

  function _onPause() {
    playPauseBtn.innerHTML = _icon('play');
    if (currentVideo) {
      Storage.saveResumeTime(currentVideo.id, videoEl.currentTime);
      Storage.saveLastWatched(currentVideo.id, videoEl.currentTime);
    }
  }

  function _onTimeUpdate() {
    if (isDragging) return;
    const pct = videoEl.duration ? (videoEl.currentTime / videoEl.duration) * 100 : 0;
    scrubberProgress.style.width = pct + '%';
    scrubberThumb.style.left     = pct + '%';
    timeDisplay.innerHTML =
      `<span class="current">${_fmtTime(videoEl.currentTime)}</span>` +
      `<span class="sep">/</span>` +
      `${_fmtTime(videoEl.duration)}`;

    // Save progress periodically
    if (currentVideo && Math.floor(videoEl.currentTime) % 5 === 0) {
      Storage.saveResumeTime(currentVideo.id, videoEl.currentTime);
    }
  }

  function _onProgress() {
    if (!videoEl.duration) return;
    try {
      const buf = videoEl.buffered;
      if (buf.length > 0) {
        const pct = (buf.end(buf.length - 1) / videoEl.duration) * 100;
        scrubberBuffer.style.width = pct + '%';
      }
    } catch {}
  }

  function _onEnded() {
    if (currentVideo) {
      Storage.markComplete(currentVideo.id);
      onVideoComplete(currentVideo.id);
    }
    if (Storage.getSetting('autoAdvance') && hasNext()) {
      _startAutoAdvance();
    }
  }

  // ── Scrubber ──────────────────────────────────────────────
  function _getPercent(clientX) {
    const rect = scrubberContainer.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function _applyPercent(pct) {
    if (!videoEl.duration) return;
    videoEl.currentTime = pct * videoEl.duration;
    scrubberProgress.style.width = (pct * 100) + '%';
    scrubberThumb.style.left     = (pct * 100) + '%';
  }

  function _scrubStart(e) {
    isDragging = true;
    scrubberContainer.classList.add('dragging');
    _applyPercent(_getPercent(e.clientX));
  }

  function _scrubHover(e) {
    if (!videoEl.duration) return;
    const pct = _getPercent(e.clientX);
    scrubberTooltip.textContent  = _fmtTime(pct * videoEl.duration);
    scrubberTooltip.style.left   = (pct * 100) + '%';
    scrubberTooltip.style.opacity = '1';
  }

  function _scrubDrag(e) {
    if (!isDragging) return;
    _applyPercent(_getPercent(e.clientX));
  }

  function _scrubEnd() {
    if (!isDragging) return;
    isDragging = false;
    scrubberContainer.classList.remove('dragging');
  }

  function _scrubTouchStart(e) {
    isDragging = true;
    _applyPercent(_getPercent(e.touches[0].clientX));
  }

  function _scrubTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    _applyPercent(_getPercent(e.touches[0].clientX));
  }

  // ── Volume ────────────────────────────────────────────────
  function _toggleMute() {
    videoEl.muted = !videoEl.muted;
    _updateVolumeIcon();
  }

  function _updateVolumeIcon() {
    const muted = videoEl.muted || videoEl.volume === 0;
    const low   = !muted && videoEl.volume < 0.5;
    volumeBtn.innerHTML = muted ? _icon('volume-x') : low ? _icon('volume-1') : _icon('volume-2');
  }

  // ── Subtitles ─────────────────────────────────────────────
  function _toggleSubtitles() {
    const tracks = videoEl.textTracks;
    if (!tracks.length) return;
    const t = tracks[0];
    if (t.mode === 'showing') {
      t.mode = 'hidden';
      subtitleBtn.classList.remove('active');
    } else {
      t.mode = 'showing';
      subtitleBtn.classList.add('active');
    }
  }

  // ── Fullscreen ────────────────────────────────────────────
  function _toggleFullscreen() {
    const wrapper = document.getElementById('video-wrapper');
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapper.requestFullscreen().catch(() => {});
    }
  }

  function _onFullscreenChange() {
    const isFS = !!document.fullscreenElement;
    fullscreenBtn.innerHTML = isFS ? _icon('minimize') : _icon('maximize');
  }

  // ── Keyboard shortcuts ────────────────────────────────────
  function _onKeyDown(e) {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const seekSec = Storage.getSetting('seekInterval') || 5;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (!isLongPress) {
          // Start long-press timer
          longPressTimer = setTimeout(() => {
            isLongPress = true;
            videoEl.playbackRate = 2.0;
            speedBadge.textContent = '2×';
            speedBadge.classList.add('visible');
          }, 500);
          if (videoEl.paused) togglePlay();
        }
        break;
      case 'p':
      case 'P':
        togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        seek(seekSec);
        _showSeekIndicator('right', seekSec);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seek(-seekSec);
        _showSeekIndicator('left', seekSec);
        break;
      case 'ArrowUp':
        e.preventDefault();
        videoEl.volume = Math.min(1, videoEl.volume + 0.1);
        volumeSlider.value = videoEl.volume * 100;
        break;
      case 'ArrowDown':
        e.preventDefault();
        videoEl.volume = Math.max(0, videoEl.volume - 0.1);
        volumeSlider.value = videoEl.volume * 100;
        break;
      case 'f':
      case 'F':
        _toggleFullscreen();
        break;
      case 'm':
      case 'M':
        _toggleMute();
        break;
      case 'c':
      case 'C':
        _toggleSubtitles();
        break;
    }
  }

  function _onKeyUp(e) {
    if (e.key === ' ') {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (isLongPress) {
        videoEl.playbackRate = normalSpeed;
        speedBadge.classList.remove('visible');
        isLongPress = false;
      }
    }
  }

  function seek(seconds) {
    if (!videoEl.duration) return;
    videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, videoEl.currentTime + seconds));
  }

  // ── Navigation ────────────────────────────────────────────
  function hasNext() {
    return currentIndex >= 0 && currentIndex < flatList.length - 1;
  }

  function hasPrev() {
    return currentIndex > 0;
  }

  function next() {
    _cancelAutoAdvance();
    if (hasNext()) {
      load(flatList[currentIndex + 1], flatList, true);
    }
  }

  function prev() {
    if (hasPrev()) {
      load(flatList[currentIndex - 1], flatList, true);
    }
  }

  function _updateNextBtn() {
    const container = document.getElementById('next-btn-container');
    if (!container) return;
    container.classList.toggle('visible', hasNext());
    if (hasNext()) {
      const nextTitle = flatList[currentIndex + 1]?.title || 'Next';
      const span = container.querySelector('.next-btn-label');
      if (span) span.textContent = nextTitle;
    }
  }

  // ── Auto-advance ──────────────────────────────────────────
  function _startAutoAdvance() {
    autoAdvanceBar.classList.add('visible');
    // Recreate animation
    autoAdvanceBarFill.style.animation = 'none';
    autoAdvanceBarFill.offsetHeight; // reflow
    autoAdvanceBarFill.style.animation = '';

    autoAdvanceToast.classList.add('visible');
    const nextVideo = flatList[currentIndex + 1];
    const toastText = autoAdvanceToast.querySelector('.toast-text');
    if (toastText) toastText.textContent = `Next: ${nextVideo?.title || 'Next video'}`;

    autoAdvanceTimer = setTimeout(() => {
      next();
      autoAdvanceBar.classList.remove('visible');
      autoAdvanceToast.classList.remove('visible');
    }, 4000);
  }

  function _cancelAutoAdvance() {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
    autoAdvanceBar.classList.remove('visible');
    autoAdvanceToast.classList.remove('visible');
  }

  // ── Visual feedback ───────────────────────────────────────
  function _flashPlayIndicator(playing) {
    playIndicator.innerHTML = _icon(playing ? 'play' : 'pause', 28);
    playIndicator.classList.remove('flash');
    playIndicator.offsetHeight;
    playIndicator.classList.add('flash');
    setTimeout(() => playIndicator.classList.remove('flash'), 400);
  }

  let seekHideTimer = null;
  function _showSeekIndicator(dir, secs) {
    const el = dir === 'left' ? seekLeftIndicator : seekRightIndicator;
    el.textContent = (dir === 'left' ? '−' : '+') + secs + 's';
    el.classList.add('visible');
    clearTimeout(seekHideTimer);
    seekHideTimer = setTimeout(() => {
      seekLeftIndicator.classList.remove('visible');
      seekRightIndicator.classList.remove('visible');
    }, 800);
  }

  // ── SVG Icon helper ───────────────────────────────────────
  function _icon(name, size = 18) {
    const icons = {
      'play':      '<polygon points="5 3 19 12 5 21 5 3"/>',
      'pause':     '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
      'volume-x':  '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
      'volume-1':  '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
      'volume-2':  '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
      'maximize':  '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
      'minimize':  '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>',
      'subtitles': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>',
      'check':     '<polyline points="20 6 9 17 4 12"/>',
      'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
    };
    const d = icons[name] || '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }

  // ── Utils ─────────────────────────────────────────────────
  function _fmtTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }

  // ── Public ────────────────────────────────────────────────
  return {
    init, load,
    togglePlay, seek, next, prev,
    hasNext, hasPrev,
    get currentVideo() { return currentVideo; },
    get currentIndex() { return currentIndex; },
  };

})();
