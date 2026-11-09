import { PROVIDER_ICONS } from './provider-icons.js';
import { AI_PROVIDERS, AI_SETTINGS_KEYS, resolveModel } from './ai-providers.js';
import './content/i18n.js';
const { t, localize } = window.Kairos.I18n;
import './content/markdown.js';
import './content/refinement.js';
import { mountSummary } from './dashboard-summary.js';
import { openSharePage } from './dashboard-share-page.js';

document.addEventListener('DOMContentLoaded', async () => {
  await window.Kairos.I18n.init();
  document.documentElement.lang = window.Kairos.I18n.locale;
  localize();
    const label = (en,zh)=>window.Kairos.I18n.locale.startsWith('zh')?zh:en;
    const escapeText = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const videoListEl = document.getElementById('videoList');
    const libraryViewEl = document.getElementById('libraryView');
    const welcomeMarkup = libraryViewEl.innerHTML;
    document.getElementById('brandHome').addEventListener('click', () => {
        switchTab('library');
        libraryViewEl.innerHTML = welcomeMarkup;
        localize(libraryViewEl);
        videoListEl.querySelectorAll('.video-item.active').forEach(item => item.classList.remove('active'));
        document.getElementById('mainContent').scrollTop = 0;
    });
    const settingsViewEl = document.getElementById('settingsView');
    const navItems = document.querySelectorAll('.nav-item');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusMessageEl = document.getElementById('statusMessage');
    document.body.append(statusMessageEl);
    let toastTimer;
    const hideToast=()=>{clearTimeout(toastTimer);statusMessageEl.hidden=true;};
    const scheduleToast=()=>{clearTimeout(toastTimer);if(statusMessageEl.dataset.type==='success'&&!statusMessageEl.matches(':hover')&&!statusMessageEl.contains(document.activeElement))toastTimer=setTimeout(hideToast,4500);};
    statusMessageEl.querySelector('[data-dismiss-toast]').onclick=hideToast;
    statusMessageEl.addEventListener('mouseenter',()=>clearTimeout(toastTimer));
    statusMessageEl.addEventListener('mouseleave',scheduleToast);
    statusMessageEl.addEventListener('focusin',()=>clearTimeout(toastTimer));
    statusMessageEl.addEventListener('focusout',()=>setTimeout(scheduleToast,0));
    document.querySelectorAll('.settings-path a').forEach(link=>link.addEventListener('click',event=>{
        event.preventDefault();const section=document.querySelector(link.getAttribute('href'));section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});section.focus({preventScroll:true});
    }));

    const toggleKeyVisibilityBtn = document.getElementById('toggleKeyVisibility');
    const languageOptions = document.querySelectorAll('.radio-option[data-lang]');
    const highlightOptions = document.querySelectorAll('.radio-option[data-highlight]');
    const uiLanguageGroup = document.getElementById('uiLanguageGroup');
    const uiLanguageInputs = [...uiLanguageGroup.querySelectorAll('input')];
    const syncUILanguage = () => uiLanguageInputs.forEach(input => {
        input.checked = input.value === window.Kairos.I18n.preference;
        input.closest('.radio-option').classList.toggle('selected', input.checked);
    });
    syncUILanguage();
    uiLanguageGroup.addEventListener('change', async event => {
        const value = event.target.value;
        if (!['auto', 'zh', 'en'].includes(value)) return;
        uiLanguageInputs.forEach(input => { input.disabled = true; });
        try {
            await chrome.storage.sync.set({ uiLanguage: value });
            window.Kairos.I18n.setPreference(value);
            document.documentElement.lang = window.Kairos.I18n.locale;
            localize();
            const selectedProvider = document.querySelector('input[name="provider"]:checked').value;
            tempKeys[selectedProvider] = apiKeyInput.value.trim();
            tempModels[selectedProvider] = document.getElementById('modelSelect').value;
            updateProviderUI(selectedProvider);
            const provider = providerConfig[selectedProvider];
            apiKeyInput.placeholder = t('Paste your {provider} API Key ({example})', { provider: provider.name, example: provider.keyPlaceholder });
            showStatus(t('Interface language saved.'), 'success');
        } catch {
            showStatus(t('Could not save interface language. Please try again.'), 'error');
        } finally {
            syncUILanguage();
            uiLanguageInputs.forEach(input => { input.disabled = false; });
        }
    });

    // State
    let currentTab = 'library';
    let selectedVideo = null;
    let noteLayout='vertical', layoutObserver;
    try{noteLayout=(await chrome.storage.local.get('dashboardNoteLayout')).dashboardNoteLayout==='zigzag'?'zigzag':'vertical';}catch{}
    const refinementStyle = document.createElement('style');
    refinementStyle.textContent = window.Kairos.Refinement.styles + `
      .note-versions{display:grid;gap:16px}.note-version-label{font-size:11px;font-weight:600;opacity:.6;margin-bottom:8px;letter-spacing:.03em}
      .note-version-original{border-bottom:1px solid #8883;padding-bottom:14px}.note-version-original .version-text{opacity:.8}
      .note-version-history{border-top:1px solid #8883;margin-top:18px;padding-top:12px;font-size:12px}.note-version-history summary{cursor:pointer;opacity:.65}.note-version-history article{padding:12px 0}
      .timestamp-group .kairos-refinement-status{margin-left:8px}
    `;
    document.head.appendChild(refinementStyle);
    await window.Kairos.Refinement.init();
    window.addEventListener('kairos-note-updated', ({ detail: { id, note } }) => {
      const previous = selectedVideo?.notes.find(item => item.id === id);
      if (previous && (!note || (note.updatedAt || 0) >= (previous.updatedAt || 0))) {
        const entry = document.getElementById(`note-${id}`);
        if (!note) { selectedVideo.notes = selectedVideo.notes.filter(item => item.id !== id); entry?.remove(); }
        else {
          Object.assign(previous, note);
          if (entry) {
            entry.querySelector('.content').innerHTML = renderNoteVersions(note);
            entry.querySelector('.kairos-refinement-status')?.replaceWith(window.Kairos.Refinement.status(note));
          }
        }
      }
    });

    // Check URL params for tab
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['library', 'settings'].includes(tabParam)) {
        currentTab = tabParam;
    }

    // Init
    loadVideoList();

    setupNavigation();
    switchTab(currentTab); // Apply initial tab state

    function setupNavigation() {
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.dataset.tab;
                switchTab(tab);
            });
        });

        toggleKeyVisibilityBtn.addEventListener('click', () => {
            const type = apiKeyInput.type === 'password' ? 'text' : 'password';
            apiKeyInput.type = type;
        });

        // Language option selection
        languageOptions.forEach(option => {
            option.addEventListener('click', () => {
                const radio = option.querySelector('input[type="radio"]');
                radio.checked = true;

                // Update UI
                languageOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });
        });

        // Highlight option selection
        highlightOptions.forEach(option => {
            option.addEventListener('click', () => {
                const radio = option.querySelector('input[type="radio"]');
                radio.checked = true;

                // Update UI
                highlightOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });
        });

        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    function switchTab(tab) {
        currentTab = tab;

        // Update Nav UI
        navItems.forEach(item => {
            if (item.dataset.tab === tab) item.classList.add('active');
            else item.classList.remove('active');
        });

        // Update View UI
        if (tab === 'library') {
            libraryViewEl.style.display = 'block';
            settingsViewEl.style.display = 'none';
            videoListEl.style.display = 'block'; // Show sidebar list
        } else {
            libraryViewEl.style.display = 'none';
            settingsViewEl.style.display = 'block';
            videoListEl.style.display = 'none'; // Hide sidebar list for cleaner look
        }
    }

    // --- Settings Logic ---

    const providerConfig = AI_PROVIDERS;
    const tempKeys = {};
    const tempModels = {};
    document.getElementById('providerGroup').innerHTML = Object.entries(providerConfig).map(([id, config]) => `
      <label class="radio-option provider-card" data-provider="${id}">
        <input type="radio" name="provider" value="${id}">
        <span class="provider-icon" style="--provider-color:${config.color}" aria-hidden="true">${PROVIDER_ICONS[id]}</span>
        <span class="radio-content"><span class="radio-title">${config.name}</span>
        <span class="radio-desc" data-i18n="${config.description}">${t(config.description)}</span></span>
      </label>`).join('');
    loadSettings();

    function setupSettingsListeners() {
        const providerRadios = document.querySelectorAll('input[name="provider"]');
        providerRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                // Save current input to temp before switching
                const currentKey = apiKeyInput.value.trim();
                const previousProvider = document.querySelector('.radio-option[data-provider].selected')?.dataset.provider;
                if (previousProvider) {
                    tempKeys[previousProvider] = currentKey;
                    tempModels[previousProvider] = document.getElementById('modelSelect').value;
                }

                updateProviderUI(e.target.value);
            });
        });
    }

    /**
     * Updates the UI (Model dropdown, Key Input) based on selected provider
     */
    function updateProviderUI(provider) {
        const config = providerConfig[provider];
        if (!config) return;

        // Update Visual Selection
        document.querySelectorAll('.radio-option[data-provider]').forEach(opt => {
            if (opt.dataset.provider === provider) {
                opt.classList.add('selected');
                opt.querySelector('input').checked = true;
            } else {
                opt.classList.remove('selected');
            }
        });

        // Update Model Dropdown
        const modelSelect = document.getElementById('modelSelect');
        modelSelect.innerHTML = config.models.map((m, index) =>
            `<option value="${m}">${m} · ${t(config.labels[index])}</option>`
        ).join('');
        
        // Select default or saved model (if applicable logic exists, for now default)
        const saved = tempModels[provider];
        if (saved && !config.models.includes(saved)) {
            const option = document.createElement('option');
            option.value = saved; option.textContent = saved + ' · ' + t('Previously selected');
            modelSelect.append(option);
        }
        modelSelect.value = saved || config.models[0];

        // Update API Key Input
        apiKeyInput.value = tempKeys[provider] || '';
        apiKeyInput.placeholder = t("Paste your {provider} API Key ({example})", { provider: config.name, example: config.keyPlaceholder });
        
        // Update Help Link
        const helpLink = document.querySelector('#apiKeyHelp a');
        helpLink.href = config.keyHelpLink;
        helpLink.textContent = config.keyHelpText;
    }

    /**
     * Loads saved settings from chrome.storage.sync
     */
    function loadSettings() {
        chrome.storage.sync.get(AI_SETTINGS_KEYS, (result) => {
            
            // 1. Determine Provider
            let currentProvider = providerConfig[result.aiProvider] ? result.aiProvider : 'google';
            
            // 2. Load Keys
            for (const [id, config] of Object.entries(providerConfig)) {
                tempKeys[id] = result[config.keyField] || (id === 'google' ? result.geminiApiKey : '') || '';
                const saved = result.providerModels?.[id] || (id === currentProvider ? result.aiModel : '');
                tempModels[id] = resolveModel(id, saved);
            }
            updateProviderUI(currentProvider);

            // 5. Load Language Preference
            const savedLang = result.noteLanguage || 'auto';
            const targetLangRadio = document.querySelector(`input[name="noteLanguage"][value="${savedLang}"]`);
            if (targetLangRadio) {
                targetLangRadio.checked = true;
                // Update visuals
                languageOptions.forEach(opt => opt.classList.remove('selected'));
                targetLangRadio.closest('.radio-option').classList.add('selected');
            }
            
            // Setup listeners after loading initial state
            setupSettingsListeners();
        });
    }

    /**
     * Saves settings to chrome.storage.sync
     */
    async function saveSettings() {
        if(saveSettingsBtn.disabled)return;
        const currentProvider = document.querySelector('input[name="provider"]:checked').value;
        const currentModel = document.getElementById('modelSelect').value;
        const currentKey = apiKeyInput.value.trim();
        const selectedLang = document.querySelector('input[name="noteLanguage"]:checked').value;

        if (!currentKey) {
            showStatus(t("Please enter a valid API Key"), 'error');
            return;
        }

        // Update temp storage
        tempKeys[currentProvider] = currentKey;

        tempModels[currentProvider] = currentModel;
        const updates = {
            aiProvider: currentProvider,
            aiModel: currentModel,
            providerModels: { ...tempModels },
            noteLanguage: selectedLang
        };
        for (const [id, key] of Object.entries(tempKeys)) updates[providerConfig[id].keyField] = key;

        saveSettingsBtn.disabled=true;
        try {
            await chrome.storage.sync.set(updates);
            showStatus(t("Settings saved successfully!"), 'success');
        } catch {
            showStatus(t('Could not save settings. Please try again.'), 'error');
        } finally { saveSettingsBtn.disabled=false; }
    }

    function showStatus(msg, type) {
        clearTimeout(toastTimer);
        statusMessageEl.querySelector('.toast-message').textContent=msg;
        statusMessageEl.querySelector('.toast-symbol').textContent=type==='success'?'✓':'!';
        statusMessageEl.dataset.type=type;
        statusMessageEl.hidden=false;
        scheduleToast();
    }

    // --- Library Logic ---

    function loadVideoList() {
        chrome.runtime.sendMessage({ type: 'GET_ALL_NOTES' }, (response) => {
            if (response && response.success) {
                const notes = response.data;
                processNotes(notes);
            } else {
                console.error('Failed to load notes:', response ? response.error : 'Unknown');
            }
        });
    }

    function processNotes(notes) {
        if (!notes || notes.length === 0) { videoListEl.replaceChildren(); return; }

        // Group notes by videoId
        const videos = {};
        notes.forEach(note => {
            if (!videos[note.videoId]) {
                videos[note.videoId] = {
                    videoId: note.videoId,
                    title: note.lessonTitle || note.videoTitle || 'Untitled Video',
                    courseTitle: note.courseTitle || '',
                    url: note.videoUrl,
                    notes: [],
                    lastUpdated: 0
                };
            }
            videos[note.videoId].notes.push(note);
            if (note.createdAt > videos[note.videoId].lastUpdated) {
                videos[note.videoId].lastUpdated = note.createdAt;
            }
        });

        // Render List
        videoListEl.innerHTML = '';
        Object.values(videos)
            .sort((a, b) => b.lastUpdated - a.lastUpdated) // Recent first
            .forEach(video => {
                const item = document.createElement('div');
                item.className = 'video-item';
                item.innerHTML = `
                    <div class="video-item-title">${escapeText(video.title)}</div>
                    ${video.courseTitle ? `<div class="video-item-course">${escapeText(video.courseTitle)}</div>` : ''}
                    <div class="video-item-meta">
                        <span>${t("{count} notes", { count: video.notes.length })}</span>
                        <span>${new Date(video.lastUpdated).toLocaleDateString()}</span>
                    </div>
                `;
                item.addEventListener('click', () => {
                    // Switch to library tab if not active
                    if (currentTab !== 'library') switchTab('library');

                    // Highlight active
                    document.querySelectorAll('.video-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    renderNotes(video);
                });
                videoListEl.appendChild(item);
            });
    }

    function renderNotes(video) {
        layoutObserver?.disconnect();
        selectedVideo = video;
        // Sort notes by timestamp
        video.notes.sort((a, b) => a.timestamp - b.timestamp);

        libraryViewEl.innerHTML = `
            <div class="note-header">
                <div class="note-meta" style="color: #aaa; font-size: 13px; margin-bottom: 8px;">
                    <a href="${escapeText(video.url)}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dotted #aaa;">${t("View Source Video \u2197")}</a>
                </div>
                ${video.courseTitle ? `<div class="note-course-title">${escapeText(video.courseTitle)}</div>` : ''}
                <div class="note-title">${escapeText(video.title)}</div>
                <div class="workspace-toolbar">
                    <span class="workspace-count">${t('{count} notes',{count:video.notes.length})}<span> · ${label('Saved on this device','保存在此设备')}</span></span>
                    <div class="workspace-tools">
                      <button class="action-btn primary" id="btnWebpage" data-help="${label('AI composition, editable webpage and a shareable link','AI 编排为可编辑网页，支持发布链接')}">✧ ${label('Share webpage','分享网页')}</button>
                      <button class="action-btn" id="btnSummary" data-help="${label('Summarize takeaways; copy text or create a share image','提炼要点，可复制文字或生成分享长图')}">≋ ${label('Text summary','文字总结')}</button>
                      <button class="action-btn" id="btnExport" data-help="${label('Export original notes and timestamps as Markdown','导出原始笔记与时间点，格式为 Markdown')}">↓ ${label('Export notes','导出笔记')}</button>
                      <button class="action-btn workspace-clear" id="btnDelete" data-help="${label('Clear only this video’s notes, after confirmation','二次确认后，仅清空此视频的笔记')}">⌫ ${label('Clear notes','清空笔记')}</button>
                    </div>
                </div>
            </div>
            <section class="summary-panel" hidden></section>
            <div class="layout-toolbar"><span>${label('Reading layout','阅读布局')}</span><div class="layout-switch" role="group" aria-label="${label('Reading layout','阅读布局')}"><button data-layout="vertical" aria-pressed="true">↧ ${label('Vertical','纵向时间轴')}</button><button data-layout="zigzag" aria-pressed="false">⇄ ${label('Zigzag','横向折返')}</button></div><span class="layout-status" role="status"></span></div>
            <div class="timeline">
                ${video.notes.map(note => `
                    <div class="note-entry" id="note-${note.id}">
                        <div class="timestamp-dot"></div>
                        
                        <div class="note-header-row">
                             <div class="timestamp-group">
                                <button class="timestamp btn-replay-note" data-note-id="${escapeText(note.id)}" data-help="${label('Reopen this lesson at this moment','打开此课节并定位到记录时刻')}">${escapeText(note.timeLabel)}</button>
                                <span class="note-badge ${note.source === 'ai' ? 'ai' : 'user'}">${note.source === 'ai' ? 'AI' : t("You")}</span>
                             </div>
                             <div class="note-actions">
                             <button class="btn-replay-note note-action" data-note-id="${escapeText(note.id)}" data-help="${label('Reopen this lesson at this moment','打开此课节并定位到记录时刻')}">
                               <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5 3 10l6 5M3 10h10a7 7 0 0 1 7 7v2"/></svg>
                               ${label('Revisit','回看')}
                             </button>
                             <button class="btn-copy-note" data-note-id="${note.id}" title="${t('Copy note text')}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                ${t("Copy")}
                             </button>
                             </div>
                        </div>
                        <div class="note-location">${escapeText([note.courseTitle, note.lessonTitle || note.videoTitle, note.timeLabel].filter(Boolean).join(' → '))}</div>
                        <div class="note-replay-status" role="status" hidden></div>

                        <div class="note-body ${note.source === 'ai' ? 'ai-note' : 'user-note'}">
                            <div class="content">${renderNoteVersions(note)}</div>
                            ${renderExtras(note)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        setupNoteLayout();
        video.notes.forEach(note => {
            document.getElementById(`note-${note.id}`)?.querySelector('.timestamp-group')?.appendChild(window.Kairos.Refinement.status(note));
        });
        document.getElementById('btnWebpage').onclick = () => {openSharePage(video);};
        document.getElementById('btnExport').onclick = () => {exportMarkdown(video);};
        const summaryPanel = libraryViewEl.querySelector('.summary-panel');
        document.getElementById('btnSummary').onclick = () => {
            summaryPanel.hidden = false;
            if (!summaryPanel.dataset.initialized) {
                summaryPanel.dataset.initialized = 'true';
                mountSummary(summaryPanel, video);
            }
        };
        document.getElementById('btnDelete').onclick = () => {deleteVideoNotes(video.videoId, video.notes);};
        libraryViewEl.querySelectorAll('.note-screenshot').forEach(image => {
            image.tabIndex = 0;
            image.setAttribute('role', 'button');
            const open = () => {
                if (document.querySelector('.snapshot-dialog')) return;
                const dialog = document.createElement('dialog');
                dialog.className = 'snapshot-dialog';
                dialog.setAttribute('aria-label', t('Visual Snapshot'));
                const close = document.createElement('button');
                close.type = 'button';
                close.className = 'action-btn snapshot-close'; close.textContent = t('Close');
                const enlarged = image.cloneNode();
                enlarged.loading = 'eager';
                enlarged.setAttribute('aria-label', t('Close'));
                enlarged.title = t('Close');
                let animation;
                let closing = false;
                const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
                const thumbnailTransform = () => {
                    const from = image.getBoundingClientRect();
                    const to = enlarged.getBoundingClientRect();
                    if (!image.isConnected || !from.width || !to.width) return 'scale(.96)';
                    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
                };
                const dismiss = () => {
                    if (closing) return;
                    closing = true;
                    if (reducedMotion()) { dialog.close(); return; }
                    // Start from the current frame, even when closing mid-expansion.
                    const current = getComputedStyle(enlarged).transform;
                    animation?.cancel();
                    const target = thumbnailTransform();
                    dialog.classList.add('is-closing');
                    animation = enlarged.animate([{ transform: current }, { transform: target }], {
                        duration: 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards'
                    });
                    animation.finished.then(() => { if (dialog.open) dialog.close(); }).catch(() => {});
                };
                close.onclick = dismiss;
                enlarged.onclick = dismiss;
                enlarged.onkeydown = event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dismiss(); }
                };
                dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
                dialog.append(close, enlarged);
                dialog.addEventListener('close', () => {
                    animation?.cancel(); dialog.remove();
                    if (image.isConnected) image.focus({ preventScroll: true });
                });
                document.body.append(dialog); dialog.showModal();
                if (!reducedMotion()) {
                    animation = enlarged.animate([{ transform: thumbnailTransform() }, { transform: 'none' }], {
                        duration: 320, easing: 'cubic-bezier(.22,1,.36,1)'
                    });
                }
            };
            image.onclick = open;
            image.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
        });

        libraryViewEl.querySelectorAll('.btn-replay-note').forEach(button => {
            button.addEventListener('click', async () => {
                const entry = button.closest('.note-entry');
                const controls = entry.querySelectorAll('.btn-replay-note');
                const status = entry.querySelector('.note-replay-status');
                const note = video.notes.find(item => String(item.id) === button.dataset.noteId);
                if (!note) return;
                controls.forEach(control => control.disabled = true);
                status.hidden = true;
                try {
                    const result = await chrome.runtime.sendMessage({ type: 'OPEN_NOTE', payload: { id: note.id } });
                    if (!result?.success) throw new Error(result?.error || 'No response');
                } catch {
                    status.textContent = label('Could not reopen this note. Check the saved source and try again.', '暂时无法打开此笔记，请检查原视频地址后重试。');
                    status.hidden = false;
                } finally { controls.forEach(control => control.disabled = false); }
            });
        });

        // Bind Copy Buttons
        document.querySelectorAll('.btn-copy-note').forEach(btn => {
            btn.addEventListener('click', () => {
                const noteId = btn.dataset.noteId;
                const note = video.notes.find(n => n.id == noteId);
                if (note) {
                    copyToClipboard(note.content, btn);
                }
            });
        });
    }

    function renderNoteVersions(note) {
        const markdown = text => Kairos.SimpleMarkdown.parse(text || '');
        const pair = (original, refined) => `<div class="note-versions"><section class="note-version-original"><div class="note-version-label">${t('Your original')}</div><div class="version-text">${markdown(original)}</div></section><section><div class="note-version-label">${t('AI refined')}</div><div class="version-text">${markdown(refined)}</div></section></div>`;
        const current = note.originalContent && note.aiContent
            ? pair(note.originalContent, note.aiContent)
            : markdown(note.content || t('Screenshot'));
        const history = note.versions?.length
            ? `<details class="note-version-history"><summary>${t('Earlier versions')}</summary>${note.versions.map(version => `<article>${pair(version.originalContent, version.aiContent)}</article>`).join('')}</details>` : '';
        return current + history;
    }

    function renderExtras(note) {
        if (!note.imageUrl && !note.context) return '';

        let html = '<div class="extras-grid">';

        if (note.imageUrl) {
            html += `
                <div class="extra-item">
                    <div class="extra-header">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        ${t("Visual Snapshot")}
                    </div>
                    <div class="note-screenshot-container">
                        <img src="${note.imageUrl}" class="note-screenshot" loading="lazy" alt="${t('Visual Snapshot')}">
                    </div>
                </div>
            `;
        }

        if (note.context) {
            html += `
                <div class="extra-item">
                     <div class="extra-header">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        ${t("Audio Transcript")}
                     </div>
                    <div class="note-context-text">"${note.context}"</div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    function copyToClipboard(text, btnElement) {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = btnElement.innerHTML;
            btnElement.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ${t("Copied!")}`;
            btnElement.style.color = 'var(--accent)';
            btnElement.style.borderColor = 'var(--accent)';
            
            setTimeout(() => {
                btnElement.innerHTML = originalHTML;
                btnElement.style.color = '';
                btnElement.style.borderColor = '';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    function exportMarkdown(video) {
        const date = new Date().toLocaleDateString();
        let md = `# ${video.title}\n\n`;
        md += `**Source**: [${video.url}](${video.url})\n`;
        md += `**Captured**: ${date}\n\n`;
        md += `---\n\n`;

        video.notes.forEach(note => {
            md += `### ${note.timeLabel}\n`;
            if (note.originalContent && note.aiContent) md += `**${t('Your original')}**\n\n${note.originalContent}\n\n**${t('AI refined')}**\n\n${note.aiContent}\n\n`;
            else md += `${note.content}\n\n`;

            if (note.context) {
                md += `> **Transcript**: "${note.context}"\n\n`;
            }
        });

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Kairos-${video.videoId}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function setupNoteLayout() {
        const timeline=libraryViewEl.querySelector('.timeline');
        const ns='http://www.w3.org/2000/svg';
        const rail=document.createElementNS(ns,'svg');rail.classList.add('zigzag-rail');rail.setAttribute('aria-hidden','true');
        const path=document.createElementNS(ns,'path');rail.append(path);timeline.prepend(rail);
        const draw=()=>{
            if(!timeline.isConnected)return;
            if(!timeline.clientWidth)return;
            const cards=[...timeline.querySelectorAll('.note-entry')];
            const cols=timeline.clientWidth<540?1:timeline.clientWidth<880?2:3;
            timeline.style.setProperty('--note-columns',cols);
            cards.forEach((card,i)=>{card.style.gridColumn=noteLayout==='zigzag'?String(Math.floor(i/cols)%2?cols-i%cols:i%cols+1):'';card.style.gridRow=noteLayout==='zigzag'?String(Math.floor(i/cols)+1):'';});
            if(noteLayout!=='zigzag'){path.setAttribute('d','');return;}
            const box=timeline.getBoundingClientRect();
            rail.setAttribute('viewBox',`0 0 ${box.width} ${timeline.scrollHeight}`);
            let d='',last;
            cards.forEach((card,i)=>{
                const r=card.getBoundingClientRect(),point={x:r.left-box.left+r.width/2,y:r.top-box.top-12};
                if(!i)d=`M ${point.x} ${point.y}`;
                else if(Math.floor(i/cols)===Math.floor((i-1)/cols))d+=` L ${point.x} ${point.y}`;
                else {const edge=Math.floor((i-1)/cols)%2?2:box.width-2;const mid=(last.y+point.y)/2;d+=` C ${edge} ${last.y}, ${edge} ${last.y}, ${edge} ${mid} S ${edge} ${point.y}, ${point.x} ${point.y}`;}
                last=point;
            });path.setAttribute('d',d);
        };
        const apply=()=>{timeline.classList.toggle('timeline-zigzag',noteLayout==='zigzag');libraryViewEl.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layout===noteLayout)));draw();};
        libraryViewEl.querySelectorAll('[data-layout]').forEach(button=>button.onclick=async()=>{
            noteLayout=button.dataset.layout;apply();
            try{await chrome.storage.local.set({dashboardNoteLayout:noteLayout});}catch{libraryViewEl.querySelector('.layout-status').textContent=label('Layout changed, but could not save preference.','布局已切换，但偏好保存失败。');}
        });
        layoutObserver=new ResizeObserver(draw);layoutObserver.observe(timeline);apply();
    }

    function deleteVideoNotes(videoId, notes) {
        const dialog=document.createElement('dialog');dialog.className='clear-notes-dialog';
        dialog.setAttribute('aria-labelledby','clearNotesHeading');
        dialog.innerHTML=`<div class="clear-icon">⌫</div><h2 id="clearNotesHeading">${label('Clear this video’s notes?','清空此视频的笔记？')}</h2><p>${label(`This removes ${notes.length} notes and the local summary and webpage drafts. This cannot be undone.`,`将删除 ${notes.length} 条笔记及本地总结、网页草稿，无法撤销。`)}</p><p class="clear-footnote">${label('Other videos are unaffected. Published pages and exported files remain available.','不会影响其他视频。已发布网页与导出文件不会被删除。')}</p><p role="status"></p><div class="clear-actions"><button class="action-btn" data-cancel>${label('Keep notes','保留笔记')}</button><button class="action-btn danger" data-confirm>${label('Clear notes','确认清空')}</button></div>`;
        document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-cancel]').focus();
        let working=false;
        const close=()=>{if(!working){dialog.close();dialog.remove();}};
        dialog.querySelector('[data-cancel]').onclick=close;
        dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
        dialog.querySelector('[data-confirm]').onclick=async()=>{
            if(working)return;working=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
            const status=dialog.querySelector('[role=status]');status.textContent=label('Clearing notes…','正在清空…');
            const results=await Promise.allSettled(notes.map(note=>chrome.runtime.sendMessage({type:'DELETE_NOTE',payload:{id:note.id}}).then(r=>{if(!r?.success)throw new Error(r?.error||'Delete failed');return note.id;})));
            const deleted=new Set(results.filter(r=>r.status==='fulfilled').map(r=>r.value));
            const remaining=notes.filter(n=>!deleted.has(n.id));
            if(selectedVideo?.videoId===videoId){selectedVideo.notes=remaining;if(remaining.length)renderNotes(selectedVideo);else{selectedVideo=null;libraryViewEl.innerHTML=welcomeMarkup;localize(libraryViewEl);}}
            loadVideoList();
            working=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);
            if(remaining.length){status.textContent=label(`${deleted.size} cleared; ${remaining.length} could not be deleted. Try again.`,`已删除 ${deleted.size} 条，另有 ${remaining.length} 条删除失败，请重试。`);notes=remaining;return;}
            try{await chrome.storage.local.remove([`video-summary:${videoId}`,`share-page-draft:${videoId}`]);close();}catch{status.textContent=label('Notes cleared. Local drafts could not be removed. Close this dialog and retry later.','笔记已清空，但本地草稿清理失败。可以关闭此窗口，稍后重试。');}
        };
    }
});
