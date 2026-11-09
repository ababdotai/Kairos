/**
 * Kairos Utils Module
 * Helper functions for video identification and formatting
 */

(function () {
  'use strict';

  const root = typeof window === 'undefined' ? globalThis : window;
  root.Kairos ||= {};

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
        if (video) {
          const part = Math.max(1, Number.parseInt(url.searchParams.get('p'), 10) || 1);
          return `bili-${video[1]}:p${part}`;
        }
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
      const url = new URL(window.location.href);
      const title = document.title.replace(/\(\d+\)\s*/, '').split(' - YouTube')[0].trim();
      const text = selectors => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          const value = (el?.getAttribute('title') || el?.textContent || '').trim();
          if (value) return value.slice(0, 300);
        }
        return '';
      };
      const slug = value => {
        try { return decodeURIComponent(value || '').replace(/[-_]+/g, ' '); }
        catch { return value || ''; }
      };
      let courseTitle = '', lessonTitle = title, lessonNumber = '';
      if (url.hostname === 'www.coursera.org') {
        const course = url.pathname.match(/^\/learn\/([^/]+)/)?.[1];
        courseTitle = text(['[data-e2e="course-title"]', 'a[data-e2e="course-home-link"]', `a[href="/learn/${CSS.escape(course || '')}"]`]) || slug(course);
        lessonTitle = text(['[data-e2e="lecture-title"]', 'main h1', 'h1']) || title;
      } else if (url.hostname === 'www.udemy.com') {
        const course = url.pathname.match(/^\/course\/([^/]+)/)?.[1];
        courseTitle = text(['[data-purpose="course-header-title"]', `a[href="/course/${CSS.escape(course || '')}/"]`]) || slug(course);
        lessonTitle = text(['[data-purpose="curriculum-item-link"][aria-current="true"]', '[aria-current="true"] [data-purpose="item-title"]', '[data-purpose="lecture-title"]', 'main h1']) || title;
      } else if (url.hostname.endsWith('bilibili.com') && /^\/video\//.test(url.pathname)) {
        lessonNumber = `P${Math.max(1, Number.parseInt(url.searchParams.get('p'), 10) || 1)}`;
        courseTitle = text(['h1.video-title', 'h1']) || title;
        lessonTitle = text(['.video-pod__item.active .title', '.list-box li.on .part', '.cur-list .on .part']) || lessonNumber;
      }
      return { videoId: this.getVideoId(), url: url.href, title, courseTitle, lessonTitle, lessonNumber };
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
  root.Kairos.Utils = Utils;

})();
