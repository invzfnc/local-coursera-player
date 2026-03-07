# 🎬 Local Coursera Player

A self-contained, offline-first web UI for playing, organizing, and tracking progress through downloaded course videos. No server, no dependencies, no installation — just open `index.html` in your browser.

## ✨ Features

### 📂 Folder Loading
- Click **Select Course Folder** to load a local directory
- Supports unlimited folder nesting depth — the sidebar mirrors your folder structure exactly
- Folder names are displayed as-is (original names), so what you see matches what's on disk

### 🎥 Video Player
- Custom controls: scrubber with buffer indicator and hover tooltip, volume slider, speed selector (0.5× – 2×)
- Controls auto-hide after 2.5s of inactivity in fullscreen; always visible in normal mode
- **Long-press `Space`** — hold to temporarily speed up to 2×, release to restore
- **Click to select, press play to watch** — selecting a video in the sidebar does not auto-play; you decide when to start
- Auto-advance to the next video when one ends, with a 4-second cancel window

### 📝 Subtitles / Captions
- Auto-detects `.srt` and `.vtt` subtitle files matching each video's filename
- SRT files are converted to WebVTT on the fly; position is injected so captions sit cleanly at the bottom center
- Captions styled as professional hard-coded-style subtitles using `::cue` CSS
- Subtitles enabled by default when detected; toggle with the **CC** button or `C` key

### 📊 Progress Tracking
- Completed videos marked with a green ✓ in the sidebar
- **Click the status icon** next to any video to manually toggle its completed state
- Resume position saved per-video and restored on next load
- Completing a video automatically clears its resume position
- Last-watched video remembered across folder reloads
- Overall progress shown as a percentage bar in the sidebar header

### 🗂 Course Navigation Sidebar
- Collapsible tree matching your full folder hierarchy, all expanded by default
- **Expand All / Collapse All** buttons in the sidebar footer
- Drag the right edge to resize the sidebar (220–560 px)
- Active video highlighted with an accent bar; auto-scrolls into view on selection

### ⚙️ Settings
- **Dark / Light mode** toggle
- **Seek interval** — configure arrow key seek to 5s, 10s, 15s, or 30s
- **Auto-advance** toggle
- **Export progress** — download all completion data as a JSON backup
- **Import progress** — restore from a previously exported JSON file
- **Clear progress** — reset all watch history (settings are preserved)

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Hold Space` | Temporarily speed up to 2× |
| `← / →` | Seek backward / forward (configurable) |
| `↑ / ↓` | Volume up / down |
| `F` | Toggle fullscreen |
| `M` | Toggle mute |
| `C` | Toggle captions |
| `p` | Play / Pause |

## 📁 Expected Folder Structure

The player works with any nesting depth:

```
My Course/
├── 01_Introduction/
│   ├── 01_welcome/
│   │   ├── 01_welcome.mp4
│   │   └── 01_welcome.en.srt
│   └── 02_overview/
│       └── 02_overview.mp4
└── 02_Advanced_Topics/
    └── 01_deep-learning/
        ├── 01_lecture.mp4
        └── 01_lecture.en.vtt
```

Flat layouts (videos directly inside topic folders) also work fine.

## 🚀 Usage

1. Download and unzip the project
2. Open `index.html` in **Chrome** or **Edge**
3. Click **Select Course Folder** and pick your course directory
4. Progress saves automatically to your browser's `localStorage`
5. Use **Settings → Export Progress** to back up your data; **Import Progress** to restore it

> **Browser note:** Folder selection (`webkitdirectory`) works best in Chromium-based browsers (Chrome, Edge, Brave).

## 🔒 Privacy

100% local — no data ever leaves your machine. No analytics, no network requests. All progress is stored under the `clp_` namespace in `localStorage`.

## Disclaimer

This project does not support or encourage downloading copyrighted course materials without permission. This tool is intended for personal offline playback of course videos that users have legitimate access to. Any misuse of this software for unauthorized distribution or playback of copyrighted content is the sole responsibility of the user.

## Acknowledgements

This project was developed with the assistance of AI tools:
- Google Gemini 3 (Thinking) - Prompting assistance and idea exploration
- Anthropic Claude Sonnet 4.6 - Code generation and debugging assistance
- OpenAI ChatGPT - Documentation guidance and refinement

## License

This project is licensed under the MIT License. See the LICENSE file for details.
