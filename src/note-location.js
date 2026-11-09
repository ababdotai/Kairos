import './content/utils.js';

/** Upgrade stored locations without inferring a different lesson from its title. */
export function normalizeNoteLocation(note) {
  let url;
  try { url = new URL(note.videoUrl); } catch { return note; }
  const id = globalThis.Kairos.Utils.getVideoId(url.href);
  if (!id) return note;
  let course = url.pathname.match(/^\/(?:learn|course)\/([^/]+)/)?.[1] || '';
  try { course = decodeURIComponent(course); } catch { /* Keep a malformed legacy slug readable. */ }
  const part = id.match(/:p(\d+)$/)?.[1];
  return {
    ...note, videoId: id,
    ...(part ? { lessonNumber: `P${part}` } : {}),
    lessonTitle: note.lessonTitle || (part ? `P${part}` : note.videoTitle || ''),
    courseTitle: note.courseTitle || (part ? note.videoTitle || '' :
      course.replace(/[-_]+/g, ' '))
  };
}

/** Only playback URLs supported by the installed content script can be reopened. */
export function replayDestination(note) {
  const normalized = normalizeNoteLocation(note);
  const url = new URL(normalized.videoUrl);
  const hosts = ['www.youtube.com', 'www.bilibili.com', 'www.coursera.org', 'www.udemy.com', 'www.ted.com'];
  const identity = globalThis.Kairos.Utils.getVideoId(url.href);
  if (!identity || !hosts.includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      identity !== normalized.videoId ||
      !Number.isFinite(note.timestamp) || note.timestamp < 0) throw new Error('This note has no valid playback location');
  // Remove previous native time hints; the request below carries this note's exact second.
  for (const key of ['t', 'start', 'time_continue']) url.searchParams.delete(key);
  return { url: url.href, videoId: normalized.videoId, timestamp: note.timestamp, noteId: note.id };
}
