/**
 * parser.js
 * Scans a FileList from <input webkitdirectory> and builds a fully
 * recursive course tree mirroring the real folder hierarchy.
 *
 * Tree node shape:
 * {
 *   id:       string,          // unique path key
 *   rawName:  string,          // original folder name, unchanged
 *   title:    string,          // cleaned display name
 *   children: Node[],          // sub-folders (recursive)
 *   videos:   VideoItem[],     // video files directly in this folder
 * }
 *
 * Course shape (returned by parse()):
 * {
 *   title:    string,          // cleaned root folder name
 *   rootPath: string,
 *   root:     Node,            // the root node
 * }
 */

const Parser = (() => {

  // ── Name cleaning ────────────────────────────────────────
  function cleanName(raw) {
    let s = raw.replace(/\.[^.]+$/, ''); // strip extension

    const prefixMatch = s.match(/^(\d+)[_.\s-]+(.*)$/);
    const numOnly     = !prefixMatch && s.match(/^(\d+)$/);

    let number = null;
    let rest   = s;

    if (prefixMatch) {
      number = parseInt(prefixMatch[1], 10);
      rest   = prefixMatch[2];
    } else if (numOnly) {
      number = parseInt(numOnly[1], 10);
      rest   = '';
    }

    const label = rest
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());

    if (number !== null) return label ? `${number}. ${label}` : `${number}`;
    return label || s;
  }

  function sortKey(raw) {
    const m = raw.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : Infinity;
  }

  // ── File type helpers ────────────────────────────────────
  const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogv', '.mov', '.mkv', '.avi', '.m4v']);
  const SUB_EXTS   = new Set(['.srt', '.vtt']);

  function fileExt(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i).toLowerCase() : '';
  }
  function isVideo(f) { return VIDEO_EXTS.has(fileExt(f.name)); }
  function isSub(f)   { return SUB_EXTS.has(fileExt(f.name)); }

  function baseStem(filename) {
    return filename.replace(/(\.[a-z]{2})?(\.[^.]+)$/i, '');
  }

  function matchSubs(videoFile, subsInDir) {
    const vStem = baseStem(videoFile.name).toLowerCase();
    return subsInDir.filter(s => {
      const sStem = baseStem(s.name).toLowerCase();
      return sStem === vStem || sStem.startsWith(vStem + '.');
    });
  }

  function videoId(file) { return file.webkitRelativePath; }

  // ── Build a directory-content map ────────────────────────
  // Map<dirPath → { videos: File[], subs: File[] }>
  function buildDirMap(fileList) {
    const map = new Map();
    for (const file of fileList) {
      const parts  = file.webkitRelativePath.split('/');
      const dirKey = parts.slice(0, -1).join('/');
      if (!map.has(dirKey)) map.set(dirKey, { videos: [], subs: [] });
      const entry = map.get(dirKey);
      if      (isVideo(file)) entry.videos.push(file);
      else if (isSub(file))   entry.subs.push(file);
    }
    return map;
  }

  // ── Collect all unique folder paths ──────────────────────
  // Returns every path that either contains files OR is an ancestor of one.
  function allFolderPaths(fileList) {
    const set = new Set();
    for (const file of fileList) {
      const parts = file.webkitRelativePath.split('/');
      // Add every ancestor path (excluding the filename)
      for (let i = 1; i < parts.length; i++) {
        set.add(parts.slice(0, i).join('/'));
      }
    }
    return set;
  }

  // ── Recursive tree builder ────────────────────────────────
  /**
   * Recursively build a tree node for `currentPath`.
   * `dirMap`     – the file map
   * `allFolders` – set of all known folder paths
   */
  function buildNode(currentPath, dirMap, allFolders) {
    const rawName = currentPath.split('/').pop();

    // Gather video files directly in this folder
    const dirEntry  = dirMap.get(currentPath) || { videos: [], subs: [] };
    const sortedVids = [...dirEntry.videos].sort((a, b) =>
      sortKey(a.name) - sortKey(b.name));

    const videos = sortedVids.map(vFile => {
      const subs = matchSubs(vFile, dirEntry.subs);
      return {
        id:           videoId(vFile),
        title:        cleanName(vFile.name),
        rawName:      vFile.name,
        file:         vFile,
        subs,
        hasSubtitles: subs.length > 0,
      };
    });

    // Find direct children folders (paths that are exactly one level deeper)
    const childPaths = [...allFolders]
      .filter(p => {
        if (!p.startsWith(currentPath + '/')) return false;
        // Must be a direct child — no further '/' after the prefix
        const remainder = p.slice(currentPath.length + 1);
        return !remainder.includes('/');
      })
      .sort((a, b) => sortKey(a.split('/').pop()) - sortKey(b.split('/').pop()));

    const children = childPaths.map(cp => buildNode(cp, dirMap, allFolders));

    return {
      id:       currentPath,
      rawName,
      title:    cleanName(rawName),
      children,
      videos,
    };
  }

  // ── Main entry point ─────────────────────────────────────
  function parse(fileList) {
    if (!fileList || fileList.length === 0) return null;

    const dirMap    = buildDirMap(fileList);
    const allFolders = allFolderPaths(fileList);

    const rootPath    = fileList[0].webkitRelativePath.split('/')[0];
    const courseTitle = cleanName(rootPath);

    const root = buildNode(rootPath, dirMap, allFolders);

    return { title: courseTitle, rootPath, root };
  }

  // ── Flatten to ordered video list ─────────────────────────
  function _flattenNode(node, ancestors, list) {
    // Videos in this folder first
    for (const v of node.videos) {
      list.push({
        ...v,
        breadcrumb: ancestors.map(a => a.title),
        topicTitle:  ancestors[0]?.title  || node.title,
        lessonTitle: ancestors.slice(-1)[0]?.title || node.title,
      });
    }
    // Then recurse into children
    for (const child of node.children) {
      _flattenNode(child, [...ancestors, child], list);
    }
  }

  function flattenVideos(course) {
    if (!course || !course.root) return [];
    const list = [];
    // Start from root's children so root itself isn't counted as an ancestor
    for (const child of course.root.children) {
      _flattenNode(child, [child], list);
    }
    // Also include videos at the root level (flat layout)
    for (const v of course.root.videos) {
      list.push({ ...v, breadcrumb: [], topicTitle: course.title, lessonTitle: course.title });
    }
    return list;
  }

  function countVideos(course) {
    return flattenVideos(course).length;
  }

  return { parse, flattenVideos, countVideos, cleanName };

})();

