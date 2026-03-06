# 🎬 Local Coursera Player

A self-contained, offline-first web UI for playing, organizing, and tracking progress through downloaded Coursera course videos. No server, no dependencies, no installation — just open `index.html` in your browser.

---

## ✨ Features

### 📂 Folder Loading
- Click **Select Course Folder** to load a local directory using the browser's `<input webkitdirectory>` API
- Supports nested folder structures up to 3 levels deep: `Course / Topic / Lesson / video.mp4`
- Auto-detects and cleans names: `01_unsupervised-learning` → `1. Unsupervised Learning`

### 🎥 Video Player
- **YouTube-style controls** — the control bar overlays the video, auto-hides after 2.5s of inactivity, and reappears on mouse movement
- Custom-styled scrubber with buffer indicator and hover timestamp tooltip
- Volume control with expanding slider
- Playback speed selector (0.5× – 2×)
- **Long-press `Space`** — hold to speed up to 2×, releases back to normal
- Auto-advance — automatically plays the next video when one ends (with a 4-second cancel window)

### 📝 Subtitles / Captions
- Automatically detects `.srt` and `.vtt` files matching the video filename in the same folder
  - Example: `01_lecture.mp4` ← matched by `01_lecture.en.srt`
- **SRT files are converted to WebVTT on the fly** so the browser `<track>` element can render them natively
- Subtitles are enabled by default when detected; toggled via the **CC** button
- Language is detected from the filename (e.g. `.en.srt`, `.fr.vtt`)

### 📊 Progress Tracking
- Completed videos are marked with a green ✓ in the sidebar
- Resume position is saved per-video and restored on reload
- Last-watched video is remembered; when you re-load the same folder it resumes automatically
- Progress stats displayed in the sidebar footer (Done / Total / %)

### 🗂 Course Navigation Sidebar
- Collapsible 3-level tree: **Topic → Lesson → Videos**
- All sections are expanded by default
- Horizontal dividers and generous padding for easy scanning
- **Drag-to-resize** — grab the right edge of the sidebar to adjust its width (220–560px)
- Active video highlighted with an accent bar
- CC badge shown next to videos that have subtitle files

### ⚙️ Settings
- **Dark / Light mode** toggle
- **Seek interval** — configure arrow key seek to 5s, 10s, 15s, or 30s
- **Auto-advance** toggle
- **Export progress** — download all completion data as a JSON file
- **Clear progress** — reset all watch history (settings are preserved)

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Hold Space` | Temporarily speed up to 2× |
| `←` / `→` | Seek backward / forward (configurable interval) |
| `↑` / `↓` | Volume up / down |
| `F` | Toggle fullscreen |
| `M` | Toggle mute |

---

## 📁 Expected Folder Structure

The player handles several folder depths automatically:

```
My Course/                          ← course root
├── 01_Introduction/                ← topic
│   ├── 01_welcome/                 ← lesson
│   │   ├── 01_welcome.mp4
│   │   └── 01_welcome.en.srt
│   └── 02_overview/
│       ├── 02_overview.mp4
│       └── 02_overview.en.vtt
└── 02_Advanced Topics/
    └── 01_deep-learning/
        ├── 01_lecture.mp4
        └── 01_lecture.en.srt
```

Also works with flat layouts (videos directly inside topic folders):

```
My Course/
├── 01_intro/
│   ├── 01_video.mp4
│   └── 02_video.mp4
└── 02_advanced/
    └── 01_lecture.mp4
```

### Naming Conventions Recognized

| Raw name | Cleaned label |
|----------|--------------|
| `01_unsupervised-learning` | `1. Unsupervised Learning` |
| `02.deep_neural_networks` | `2. Deep Neural Networks` |
| `week3_gradient-descent` | `Week3 Gradient Descent` |
| `03 introduction to ml` | `3. Introduction to Ml` |

---

## 🗂 File Structure

```
coursera-player/
├── index.html          # Entry point — all HTML structure and layout
├── css/
│   ├── main.css        # CSS variables, layout, modals, utilities
│   ├── player.css      # Video player, controls overlay, scrubber
│   └── sidebar.css     # Navigation tree, progress icons, resize handle
└── js/
    ├── app.js          # Boot, folder loading, module wiring, resize logic
    ├── parser.js       # Folder scanning → structured course tree
    ├── player.js       # Video controls, subtitles, keyboard shortcuts
    ├── storage.js      # localStorage wrapper for progress and settings
    └── ui.js           # Sidebar rendering, theme, breadcrumbs, settings modal
```

---

## 🚀 Usage

1. **Download** or clone this repository
2. Open `index.html` in **Chrome** or **Edge** (recommended)
3. Click **Select Course Folder** and choose your downloaded course directory
4. Start watching — progress is saved automatically in your browser's `localStorage`

> **Browser compatibility note:** The `webkitdirectory` attribute for folder selection works best in Chromium-based browsers (Chrome, Edge, Brave). Firefox supports it but may have limitations with very large folder trees.

---

## 🔒 Privacy

- **100% local** — no data ever leaves your machine
- No analytics, no telemetry, no network requests (except loading Google Fonts on first open)
- All progress is stored in your browser's `localStorage` under the `clp_` namespace
- Use **Export Progress** in Settings to back up your data as JSON

---

## 🛠 Technical Notes

- **Zero dependencies** — plain HTML5, CSS3, and Vanilla JavaScript
- **No build step** — open `index.html` directly, nothing to install
- **SRT → VTT conversion** is done in-memory using `FileReader` and `Blob` APIs; no files are written to disk
- Subtitle matching is done by filename stem: `lecture01.mp4` matches `lecture01.en.srt`, `lecture01.vtt`, etc.
- Video blob URLs are created and revoked per-session to avoid memory leaks
- Resume timestamps are saved every 5 seconds during playback

---

## 📄 License

MIT — free for personal use.
