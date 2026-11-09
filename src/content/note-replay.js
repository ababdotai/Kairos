/** Wait for the requested lesson and a seekable player, including SPA/player replacement. */
export class NoteReplaySeeker {
  constructor(job, { getPageId, getVideo, finish, notify = () => {}, now = () => Date.now() }) {
    Object.assign(this, { job, getPageId, getVideo, finish, notify, now });
    this.started = now();
    this.attempts = 0;
  }
  stop(message) {
    if (this.done) return;
    this.done = true;
    if (message) this.notify(message);
    this.finish();
  }
  tick() {
    if (this.done) return;
    if (this.now() - this.started > 90000) return this.stop('The player is not ready. Open this note again after the lesson loads.');
    const matches = this.getPageId() === this.job.videoId;
    if (this.matched && !matches) return this.stop(); // Never seek a lesson the user switched to.
    if (!matches) return;
    this.matched = true;
    const video = this.getVideo();
    if (!video || video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 0 ||
        video.closest?.('.ad-showing, .ad-interrupting')) return;
    if (this.job.timestamp > video.duration + 1) return this.stop('This note is beyond the current video duration. Check the lesson.');
    const target = Math.min(this.job.timestamp, video.duration);
    const ranges = video.seekable;
    if (!ranges?.length || !Array.from({ length: ranges.length }, (_, i) =>
      target >= ranges.start(i) && target <= ranges.end(i)).some(Boolean)) return;
    if (this.video !== video) { this.video = video; this.stableSince = null; this.lastSeek = null; }
    const elapsed = this.lastSeek == null ? 0 : (this.now() - this.lastSeek) / 1000;
    const tolerance = video.paused ? 1 : 1 + elapsed * (video.playbackRate || 1);
    if (this.lastSeek != null && !video.seeking && Math.abs(video.currentTime - target) <= tolerance) {
      this.stableSince ??= this.now();
      if (this.now() - this.stableSince >= 1800) this.stop('Returned to your note.');
      return;
    }
    this.stableSince = null;
    if (video.seeking || (this.lastSeek != null && this.now() - this.lastSeek < 700)) return;
    if (this.attempts >= 8) return this.stop('Could not locate this moment. Open this note again to retry.');
    try {
      video.currentTime = target;
      this.lastSeek = this.now();
      this.attempts++;
    } catch { /* Metadata can precede seek readiness; retry within the bounded deadline. */ }
  }
}

export async function resumeNoteReplay() {
  let reply;
  try { reply = await chrome.runtime.sendMessage({ type: 'GET_NOTE_REPLAY' }); } catch { return; }
  if (!reply?.success || !reply.data?.videoId || !Number.isFinite(reply.data.timestamp)) return;
  const { Utils, VideoTracker, CONFIG, I18n } = window.Kairos;
  const tracker = new VideoTracker(CONFIG.VIDEO_SELECTOR);
  let timer;
  const cleanup = () => {
    clearInterval(timer);
    document.removeEventListener('pointerdown', interrupt, true);
    document.removeEventListener('keydown', interrupt, true);
    window.removeEventListener('pagehide', cleanup);
  };
  const replay = new NoteReplaySeeker(reply.data, {
    getPageId: () => Utils.getVideoId(),
    getVideo: () => { tracker.findVideoElement(); return tracker.videoElement; },
    finish: () => {
      cleanup();
      void chrome.runtime.sendMessage({ type: 'FINISH_NOTE_REPLAY' }).catch(() => {});
    },
    notify: message => {
      const toast = document.createElement('div');
      toast.setAttribute('role', 'status');
      toast.textContent = I18n.t(message);
      toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:85vw;padding:12px 18px;border:1px solid #ffffff40;border-radius:16px;background:#203440e8;backdrop-filter:blur(16px);color:white;font:14px/1.5 system-ui;box-shadow:0 8px 30px #0003;pointer-events:none';
      (document.fullscreenElement || document.body).append(toast);
      setTimeout(() => toast.remove(), 5000);
    }
  });
  const interrupt = event => { if (event.isTrusted && replay.attempts > 0) replay.stop(); };
  document.addEventListener('pointerdown', interrupt, true);
  document.addEventListener('keydown', interrupt, true);
  window.addEventListener('pagehide', cleanup, { once: true });
  timer = setInterval(() => replay.tick(), 200);
  replay.tick();
}
