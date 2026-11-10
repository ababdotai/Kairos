/** An old content script cannot reconnect after an extension reload. Retire it cleanly. */
(function () {
  window.Kairos ||= {};
  let invalid = false;
  const listeners = new Set();
  const isInvalid = error => /extension context invalidated/i.test(error?.message || String(error || ''));
  function invalidate() {
    if (invalid) return;
    invalid = true;
    clearInterval(heartbeat);
    for (const listener of listeners) {
      try { listener(); } catch (error) { if (!isInvalid(error)) console.error('[Kairos] Runtime cleanup failed:', error); }
    }
  }
  function valid() {
    if (invalid) return false;
    try { if (chrome.runtime.id) return true; } catch {}
    invalidate();
    return false;
  }
  const failure = () => ({ success: false, error: 'Extension updated or disconnected. Refresh this video page and try again.', code: 'EXTENSION_CONTEXT_INVALIDATED' });
  function sendMessage(message, callback) {
    const failed = () => { const result = failure(); if (callback) callback(result); return Promise.resolve(result); };
    if (!valid()) return failed();
    try {
      if (callback) {
        chrome.runtime.sendMessage(message, response => {
          const error = chrome.runtime.lastError;
          if (isInvalid(error)) invalidate();
          callback(error ? (invalid ? failure() : { success: false, error: error.message }) : response);
        });
        return;
      }
      return chrome.runtime.sendMessage(message).catch(error => {
        if (isInvalid(error)) { invalidate(); return failure(); }
        throw error;
      });
    } catch (error) {
      if (!isInvalid(error)) throw error;
      invalidate();
      return failed();
    }
  }
  const heartbeat = setInterval(valid, 1000);
  window.addEventListener('pagehide', () => clearInterval(heartbeat), { once: true });
  window.Kairos.Runtime = {
    valid, isInvalid, invalidate, sendMessage,
    getURL(path) {
      if (!valid()) return '';
      try { return chrome.runtime.getURL(path); }
      catch (error) { if (!isInvalid(error)) throw error; invalidate(); return ''; }
    },
    onInvalidated(listener) { listeners.add(listener); if (invalid) listener(); return () => listeners.delete(listener); }
  };
})();
