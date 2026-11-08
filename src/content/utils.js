/**
 * Kairos Utils Module
 * Helper functions for video identification and formatting
 */

(function () {
  'use strict';

  const { log } = window.Kairos;

  /**
   * Utility functions for video operations
   */
  const Utils = {
    /**
     * Extracts video ID from current URL based on platform
     * @returns {string|null} Platform-prefixed ID, or null outside a playback page
     */
    getVideoId(href = window.location.href) {
      const url = new URL(href);
      if (!['https:', 'http:'].includes(url.protocol)) return null;
      if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
        const shorts = url.pathname.match(/^\/shorts\/([\w-]+)\/?$/);
        if (shorts) return `yt-${shorts[1]}`;
        const id = url.searchParams.get('v');
        return url.pathname === '/watch' && id && /^[\w-]+$/.test(id) ? `yt-${id}` : null;
      }
      if (['www.bilibili.com', 'bilibili.com'].includes(url.hostname)) {
        const video = url.pathname.match(/^\/video\/(BV[\w]+|av\d+)\/?$/);
        if (video) return video[1].startsWith('BV') ? `bili-${video[1]}` : `bili-${url.pathname}`;
        // Preserve existing episode IDs while rejecting feeds, profiles and opus pages.
        if (/^\/bangumi\/play\/(ep|ss)\d+\/?$/.test(url.pathname)) return `bili-${url.pathname}`;
      }
      if (url.hostname === 'www.coursera.org') {
        const lecture = url.pathname.match(/^\/learn\/([^/]+)\/lecture\/([^/]+)(?:\/[^/]+)?\/?$/);
        if (lecture) return `coursera-${lecture[1]}-${lecture[2]}`;
      }
      if (url.hostname === 'www.udemy.com') {
        const course = url.pathname.match(/^\/course\/([^/]+)\/learn\/(?:lecture\/\d+\/?)?$/);
        const lecture = url.pathname.match(/\/lecture\/(\d+)/) || url.hash.match(/^#\/?(?:overview\/)?lecture\/(\d+)(?:[/?]|$)/);
        if (course && lecture) return `udemy-${course[1]}-${lecture[1]}`;
      }
      if (url.hostname === 'www.ted.com') {
        const talk = url.pathname.match(/^\/talks\/([^/]+)(?:\/transcript)?\/?$/);
        if (talk && !['browse','quick-list'].includes(talk[1])) return `ted-${talk[1]}`;
      }
      return null;
    },

    /**
     * Gets comprehensive video information
     * @returns {Object} Video info containing id, url, and title
     */
    getVideoInfo() {
      return {
        videoId: this.getVideoId(),
        url: window.location.href,
        title: document.title.replace(/\(\d+\)\s*/, '').split(' - YouTube')[0].trim()
      };
    },

    /**
     * Formats seconds into HH:MM:SS or MM:SS string
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    formatTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return [h, m, s]
        .filter((v, i) => v > 0 || i > 0)
        .map(v => v.toString().padStart(2, '0'))
        .join(':');
    },

    /**
     * Generates a unique ID using timestamp and random string
     * @returns {string} Unique identifier
     */
    generateId() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
  };

  // Export to global namespace
  window.Kairos.Utils = Utils;

})();
