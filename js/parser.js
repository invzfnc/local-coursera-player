/**
 * parser.js
 * Scans a FileList from a <input webkitdirectory> and builds
 * a structured course tree: { title, topics: [ { title, lessons: [ { title, videos: [...] } ] } ] }
 */

const Parser = (() => {

  // ── Name cleaning ────────────────────────────────────────
  /**
   * Clean a raw folder/file name into a readable label.
   *   "01_intro-to-ml"  → "1. Intro to Ml"
   *   "02.deep-learning" → "2. Deep Learning"
   *   "hello_world"      → "Hello World"
   */
  function cleanName(raw) {
    // Remove extension
    raw = raw.replace(/\.[^.]+$/, '');

    // Match leading number prefix  (e.g. "01_", "2.", "03 ")
    const prefixMatch = raw.match(/^(\d+)[_.\s-]+(.*)$/);
    // Also match pure number (e.g. "01", "2") with nothing after
    const numOnlyMatch = !prefixMatch && raw.match(/^(\d+)$/);

    let number = null;
    let rest = raw;

    if (prefixMatch) {
      number = parseInt(prefixMatch[1], 10);
      rest   = prefixMatch[2];
    } else if (numOnlyMatch) {
      number = parseInt(numOnlyMatch[1], 10);
      rest   = '';
    }

    // Replace separators with spaces, capitalize each word
    const label = rest
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());

    if (number !== null) {
      // If there's a meaningful label after the number, show "N. Label"
      // If not (pure number folder), just return "N" — caller will need the raw name
      return label ? `${number}. ${label}` : `${number}`;
    }
    return label || raw;
  }

  /**
   * Extract numeric sort key from raw name for ordering.
   */
  function sortKey(raw) {
    const m = raw.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : Infinity;
  }

  // ── File type helpers ────────────────────────────────────
  const VIDEO_EXTS  = new Set(['.mp4', '.webm', '.ogv', '.mov', '.mkv', '.avi', '.m4v']);
  const SUB_EXTS    = new Set(['.srt', '.vtt']);

  function ext(filename) {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i).toLowerCase() : '';
  }

  function isVideo(f) { return VIDEO_EXTS.has(ext(f.name)); }
  function isSub(f)   { return SUB_EXTS.has(ext(f.name)); }

  /**
   * Derive a base stem from a filename for subtitle matching.
   * "01_video.en.srt" → "01_video"
   * "lecture1.vtt"    → "lecture1"
   */
  function baseStem(filename) {
    // Strip all extensions
    return filename.replace(/(\.[a-z]{2})?(\.[^.]+)$/i, '');
  }

  // ── Build path map ───────────────────────────────────────
  /**
   * Given a FileList, returns a Map<dirPath, { videos: File[], subs: File[] }>
   */
  function buildDirMap(fileList) {
    const dirMap = new Map();

    for (const file of fileList) {
      const parts  = file.webkitRelativePath.split('/');
      const dirKey = parts.slice(0, -1).join('/');

      if (!dirMap.has(dirKey)) {
        dirMap.set(dirKey, { videos: [], subs: [], rawParts: parts.slice(0, -1) });
      }

      const entry = dirMap.get(dirKey);
      if      (isVideo(file)) entry.videos.push(file);
      else if (isSub(file))   entry.subs.push(file);
    }

    return dirMap;
  }

  /**
   * Match subtitle files to a video file based on filename stem.
   * Returns an array of matched File objects (srt/vtt).
   */
  function matchSubs(videoFile, subsInDir) {
    const vStem = baseStem(videoFile.name).toLowerCase();
    return subsInDir.filter(s => {
      const sStem = baseStem(s.name).toLowerCase();
      return sStem === vStem || sStem.startsWith(vStem + '.');
    });
  }

  /**
   * Generate a stable ID for a video file from its relative path.
   */
  function videoId(file) {
    return file.webkitRelativePath;
  }

  // ── Parse into tree ──────────────────────────────────────
  /**
   * Main entry point.
   * @param {FileList} fileList  — from input[webkitdirectory]
   * @returns {CourseTree}
   *   {
   *     title: string,
   *     rootPath: string,
   *     topics: [{
   *       id: string, title: string, rawName: string,
   *       lessons: [{
   *         id: string, title: string, rawName: string,
   *         videos: [{
   *           id: string, title: string, file: File,
   *           subs: File[], hasSubtitles: boolean
   *         }]
   *       }]
   *     }]
   *   }
   */
  function parse(fileList) {
    if (!fileList || fileList.length === 0) return null;

    const dirMap = buildDirMap(fileList);

    // Root folder = first path segment
    const rootPath = fileList[0].webkitRelativePath.split('/')[0];
    const courseTitle = cleanName(rootPath);

    // Collect all unique directory paths that contain videos
    const videoDirs = [];
    dirMap.forEach((entry, path) => {
      if (entry.videos.length > 0) videoDirs.push(path);
    });

    if (videoDirs.length === 0) return { title: courseTitle, rootPath, topics: [] };

    // Determine depth structure
    // Expected: rootPath / topic / lesson / video.mp4  (depth 4 parts)
    //           rootPath / topic / video.mp4            (depth 3 parts)
    //           rootPath / video.mp4                    (depth 2 parts — flat)
    const sampleParts = videoDirs[0].split('/');
    const depth = sampleParts.length; // 1=root, 2=topic, 3=topic+lesson, ...

    // Group directories by structure
    const topicMap = new Map(); // topicKey → Map<lessonKey, [...videoDirs]>

    for (const dirPath of videoDirs) {
      const parts = dirPath.split('/');
      // parts[0] = rootPath
      // parts[1] = topic (if exists)
      // parts[2] = lesson (if exists)
      // ...

      if (parts.length === 1) {
        // Flat: all videos at root level
        if (!topicMap.has('__root__')) topicMap.set('__root__', new Map());
        const lm = topicMap.get('__root__');
        if (!lm.has('__flat__')) lm.set('__flat__', []);
        lm.get('__flat__').push(dirPath);
      } else if (parts.length === 2) {
        // Topic level only
        const topicKey = parts[1];
        if (!topicMap.has(topicKey)) topicMap.set(topicKey, new Map());
        const lm = topicMap.get(topicKey);
        if (!lm.has('__flat__')) lm.set('__flat__', []);
        lm.get('__flat__').push(dirPath);
      } else {
        // Topic + lesson (or deeper — we treat parts[1] as topic, parts[2] as lesson)
        const topicKey  = parts[1];
        const lessonKey = parts.slice(2).join('/'); // handle deeper nesting
        if (!topicMap.has(topicKey)) topicMap.set(topicKey, new Map());
        const lm = topicMap.get(topicKey);
        if (!lm.has(lessonKey)) lm.set(lessonKey, []);
        lm.get(lessonKey).push(dirPath);
      }
    }

    // Sort topics by numeric prefix
    const sortedTopics = [...topicMap.keys()].sort((a, b) =>
      sortKey(a) - sortKey(b)
    );

    const topics = sortedTopics.map(topicKey => {
      const lessonMap    = topicMap.get(topicKey);
      const topicTitle   = topicKey === '__root__' ? courseTitle : cleanName(topicKey);
      const topicId      = `topic:${topicKey}`;

      const sortedLessons = [...lessonMap.keys()].sort((a, b) => {
        // Sort by numeric prefix of the last path segment
        const aKey = a === '__flat__' ? '' : a.split('/').pop();
        const bKey = b === '__flat__' ? '' : b.split('/').pop();
        return sortKey(aKey) - sortKey(bKey);
      });

      const lessons = sortedLessons.map(lessonKey => {
        const dirs        = lessonMap.get(lessonKey);
        const lessonTitle = lessonKey === '__flat__' ? topicTitle : cleanName(lessonKey.split('/').pop());
        const lessonId    = `lesson:${topicKey}/${lessonKey}`;

        // Collect all videos from all dirs in this lesson, sorted
        const videos = [];
        for (const dirPath of dirs) {
          const { videos: vFiles, subs: sFiles } = dirMap.get(dirPath);
          const sortedVideos = [...vFiles].sort((a, b) =>
            sortKey(a.name) - sortKey(b.name)
          );

          for (const vFile of sortedVideos) {
            const subs = matchSubs(vFile, sFiles);
            videos.push({
              id:          videoId(vFile),
              title:       cleanName(vFile.name),
              file:        vFile,
              subs,
              hasSubtitles: subs.length > 0,
              dirPath
            });
          }
        }

        return { id: lessonId, title: lessonTitle, rawName: lessonKey, videos };
      }).filter(l => l.videos.length > 0);

      return { id: topicId, title: topicTitle, rawName: topicKey, lessons };
    }).filter(t => t.lessons.length > 0);

    return { title: courseTitle, rootPath, topics };
  }

  /**
   * Flatten course tree into an ordered array of video objects.
   * Useful for next/prev navigation.
   */
  function flattenVideos(course) {
    const list = [];
    if (!course) return list;
    for (const topic of course.topics) {
      for (const lesson of topic.lessons) {
        for (const video of lesson.videos) {
          list.push({ ...video, topicTitle: topic.title, lessonTitle: lesson.title });
        }
      }
    }
    return list;
  }

  /**
   * Count total videos in a course.
   */
  function countVideos(course) {
    return flattenVideos(course).length;
  }

  return { parse, flattenVideos, countVideos, cleanName };

})();
