/**
 * Kairos Storage Module
 * Proxy to Background Service Worker for IndexedDB operations
 */

(function () {
  'use strict';

  const { log } = window.Kairos;

  /**
   * StorageManager class - Proxy to Background Service Worker
   * Handles note persistence through message passing
   */
  class StorageManager {
    constructor() { }

    /**
     * Initializes the storage manager (no-op for proxy mode)
     * @returns {Promise<void>}
     */
    async init() {
      log('StorageManager initialized (Proxy Mode -> Background Worker)');
      return Promise.resolve();
    }

    /**
     * Saves a note to storage via background worker
     * @param {Object} note - Note data to save
     * @returns {Promise<Object>} Saved note data
     */
    async saveNote(note) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SAVE_TIMEOUT')), 12000);
        const fail = error => { clearTimeout(timer); reject(new Error(error?.message || String(error))); };
        try {
          (window.Kairos.Runtime || chrome.runtime).sendMessage({ type: 'SAVE_NOTE', payload: note }, response => {
            clearTimeout(timer);
            if (chrome.runtime.lastError) return fail(chrome.runtime.lastError);
            if (response?.success && response.data?.status === 'success') resolve(response.data);
            else fail(response?.error || 'No response from extension');
          });
        } catch (error) { fail(error); }
      });
    }

    /**
     * Retrieves all notes for a specific video
     * @param {string} videoId - Video identifier
     * @returns {Promise<Array>} Array of notes
     */
    async getNotesForVideo(videoId) {
      return new Promise((resolve, reject) => {
        (window.Kairos.Runtime || chrome.runtime).sendMessage({ type: 'GET_NOTES', payload: { videoId } }, (response) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (response && response.success) resolve(response.data);
          else reject(response ? response.error : 'Unknown error');
        });
      });
    }

    /**
     * Deletes a note by ID
     * @param {string} id - Note identifier
     * @returns {Promise<void>}
     */
    async deleteNote(id) {
      if (typeof id !== 'string' && typeof id !== 'number') throw new Error('Invalid note ID');
      return new Promise((resolve, reject) => {
        try {
          (window.Kairos.Runtime || chrome.runtime).sendMessage({ type: 'DELETE_NOTE', payload: { id } }, (response) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (response && response.success) resolve(response.data);
            else reject(new Error(response?.error || 'No response from extension'));
          });
        } catch (error) { reject(error); }
      });
    }
  }

  // Export to global namespace
  window.Kairos.StorageManager = StorageManager;

})();
