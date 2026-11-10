import './content/runtime.js';
import { resumeNoteReplay } from './content/note-replay.js';
import './content/i18n.js';
import './content/action_tips.js';
import './content/delete_button.js';
import './content/refinement.js';
import './content.css';
import './content/config.js';
import './content/availability.js';
import './content/utils.js';
import './content/storage.js';
import './content/markdown.js';
import './content/tracker.js';
import './content/capture.js';
import './content/subtitles.js';
import './content/agent.js';
import './content/styles.js';
import './content/gen_ui.js';
import './content/hud_agent.js';
import './content/companion.js';
import './content/overlay.js';
import './content/sidepanel.js';

/**
 * Kairos Content Script Entry Point
 * Orchestrates the video overlay functionality
 */

(function () {
  'use strict';

  // Wait for modules to initialize window.Kairos
  // In a bundled environment, they execute immediately upon import.
  const { CONFIG, log, OverlayManager, VideoTracker, SubtitleManager, SidePanelManager } = window.Kairos;

  /**
   * Main application initialization
   */
  const runtime = window.Kairos.Runtime;
  const safely = promise => promise.catch(error => {
    if (runtime.isInvalid(error)) runtime.invalidate();
    else console.error('Kairos initialization failed:', error);
  });
  const availability = window.Kairos.Availability;
  async function bootstrap() {
    await window.Kairos.I18n.init();
    void resumeNoteReplay();
    await availability.init();
    let started = false;
    function startWhenEnabled() {
      if (!started && runtime.valid() && !availability.disabled()) {
        started = true;
        void safely(init());
      }
    }
    availability.subscribe(startWhenEnabled);
    startWhenEnabled();
  }

  async function init() {
    await window.Kairos.Refinement.init();
    log('Initializing Kairos...');

    // Create GenUI Manager
    const { GenUIManager } = window.Kairos;
    const genUiManager = new GenUIManager();

    // Create subtitle manager
    const subtitleManager = new SubtitleManager();
    subtitleManager.init();
    const sidePanelManager = new SidePanelManager();
    sidePanelManager.subtitleManager = subtitleManager;
    await sidePanelManager.init();

    // Sidebar and fullscreen island share the current video's notes.
    const overlayManager = new OverlayManager();
    overlayManager.sidePanel = sidePanelManager;
    window.Kairos.overlayManagerInstance = overlayManager; // Store for HUD Agent feedback
    overlayManager.subtitleManager = subtitleManager;
    overlayManager.genUiManager = genUiManager; // Link HUD manager
    await overlayManager.init();

    // Create HUD Agent
    const { HUDAgent } = window.Kairos;
    const hudAgent = new HUDAgent(subtitleManager, genUiManager);
    await hudAgent.init();
    overlayManager.hudAgent = hudAgent;

    // Initialize GenUI with overlay's shadow root
    genUiManager.init(overlayManager.shadowRoot);

    // Initialize Proactive Agent
    const { ProactiveAgent } = window.Kairos;
    const agent = new ProactiveAgent(subtitleManager, overlayManager);
    await agent.init();

    // Link agent to overlay manager
    overlayManager.agent = agent;

    // Create video tracker
    const videoTracker = new VideoTracker(CONFIG.VIDEO_SELECTOR);

    // Start tracking and update overlay position
    const onVideo = (rect, video) => {
      overlayManager.updatePosition(rect, video);
      if (!window.Kairos.Utils.getVideoId()) {
        sidePanelManager.injectPanel(); // Removes a stale sidebar immediately on SPA exit.
        if (overlayManager.currentVideoId) overlayManager.loadNotesForCurrentVideo();
      }
      if (video) sidePanelManager.updateTime(video.currentTime);
    };
    videoTracker.start(onVideo);
    function applyAvailability() {
      if (!runtime.valid()) return;
      if (availability.disabled()) {
        videoTracker.stop();
        overlayManager.updatePosition(null, null);
        sidePanelManager.injectPanel();
        agent.stop();
        hudAgent.stop();
        subtitleManager.stop();
      } else {
        subtitleManager.init();
        agent.start();
        if (hudAgent.isActive) hudAgent.start();
        videoTracker.update();
        overlayManager.loadNotesForCurrentVideo();
        sidePanelManager.injectPanel();
      }
    }
    availability.subscribe(applyAvailability);
    if (availability.disabled()) applyAvailability();

    // Monitor URL changes (for SPA like YouTube)
    let lastUrl = window.location.href;
    const navigationTimer = setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        availability.checkVisit();
        if (availability.disabled()) return;
        log('URL changed, reloading notes...');
        overlayManager.loadNotesForCurrentVideo();
        sidePanelManager.refresh();
        if (genUiManager) genUiManager.clearAll();
        if (hudAgent) hudAgent.lastAnalysisTime = 0; // Trigger scan soon
      }
    }, 2000);

    runtime.onInvalidated(() => {
      clearInterval(navigationTimer);
      videoTracker.stop(); agent.stop(); hudAgent.stop(); subtitleManager.stop();
      const draft = overlayManager.isEditing ? overlayManager.noteInput?.value : '';
      sidePanelManager.destroy();
      overlayManager.destroy();
      const notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.textContent = window.Kairos.I18n.t('Extension updated or disconnected. Refresh this video page and try again.');
      notice.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#203440ed;color:white;padding:12px 18px;border-radius:14px;font:14px/1.5 system-ui;max-width:85vw';
      if (draft?.trim()) {
        const field = document.createElement('textarea');
        field.value = draft; field.readOnly = true;
        field.style.cssText='display:block;width:100%;min-height:70px;margin-top:8px;color:inherit;background:transparent;border:1px solid #ffffff60';
        notice.append(field);
      }
      document.body.append(notice);
      if (!draft?.trim()) setTimeout(()=>notice.remove(),10000);
    });

    // Initial load
    overlayManager.loadNotesForCurrentVideo();

    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      log('Fullscreen state changed');
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      videoTracker.stop();
      overlayManager.destroy();
    });

    log('Kairos initialized successfully');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => safely(bootstrap()));
  } else {
    safely(bootstrap());
  }

})();
