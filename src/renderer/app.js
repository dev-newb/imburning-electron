// Application state
let credentials = null;
let updateInterval = null;
let countdownInterval = null;
let latestUsageData = null;
let isExpanded = false;
let isCompactMode = false;
let _settingsOpenedFromCompact = false;
let usageChart = null;
let graphVisible = false;
let graphWasVisible = false; // preserves graph state across compact mode toggle
let appInitializing = true;  // suppresses _saveViewState during startup restore
let isFetching = false;       // in-flight guard — prevents overlapping fetchUsageData calls
let _updateReadyToInstall = false; // an auto-update is downloaded and ready to apply
let isOpenaiExtrasOpen = true;     // OpenAI Credits + Limit Resets sub-panel
let projectionsVisible = true;     // graph forecast lines (the psychic's trance)
const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const WIDGET_HEIGHT_COLLAPSED = 155;
const WIDGET_ROW_HEIGHT = 30;
const GRAPH_HEIGHT = 232;

// Debug logging — only shows in DevTools (development mode).
// Regular users won't see verbose logs in production.
const DEBUG = (new URLSearchParams(window.location.search)).has('debug');
function debugLog(...args) {
  if (DEBUG) console.log('[Debug]', ...args);
}

// DOM elements
const elements = {
    loadingContainer: document.getElementById('loadingContainer'),
    loginContainer: document.getElementById('loginContainer'),
    noUsageContainer: document.getElementById('noUsageContainer'),
    mainContent: document.getElementById('mainContent'),
    loginStep1: document.getElementById('loginStep1'),
    loginStep2: document.getElementById('loginStep2'),
    autoDetectBtn: document.getElementById('autoDetectBtn'),
    autoDetectError: document.getElementById('autoDetectError'),
    openBrowserLink: document.getElementById('openBrowserLink'),
    nextStepBtn: document.getElementById('nextStepBtn'),
    backStepBtn: document.getElementById('backStepBtn'),
    sessionKeyInput: document.getElementById('sessionKeyInput'),
    connectBtn: document.getElementById('connectBtn'),
    sessionKeyError: document.getElementById('sessionKeyError'),
    refreshBtn: document.getElementById('refreshBtn'),
    graphBtn: document.getElementById('graphBtn'),
    minimizeBtn: document.getElementById('minimizeBtn'),
    closeBtn: document.getElementById('closeBtn'),

    sessionPercentage: document.getElementById('sessionPercentage'),
    sessionProgress: document.getElementById('sessionProgress'),
    sessionTimer: document.getElementById('sessionTimer'),
    sessionTimeText: document.getElementById('sessionTimeText'),

    weeklyPercentage: document.getElementById('weeklyPercentage'),
    weeklyProgress: document.getElementById('weeklyProgress'),
    weeklyTimer: document.getElementById('weeklyTimer'),
    weeklyTimeText: document.getElementById('weeklyTimeText'),
    weeklyResetsAt: document.getElementById('weeklyResetsAt'),

    sessionResetsAt: document.getElementById('sessionResetsAt'),

    expandToggle: document.getElementById('expandToggle'),
    expandArrow: document.getElementById('expandArrow'),
    expandSection: document.getElementById('expandSection'),
    extraRows: document.getElementById('extraRows'),
    scopedRows: document.getElementById('scopedRows'),
    anthropicCliRows: document.getElementById('anthropicCliRows'),
    openaiCliRows: document.getElementById('openaiCliRows'),
    googleCliRows: document.getElementById('googleCliRows'),
    titleBar: document.getElementById('titleBar'),
    headerAnthropic: document.getElementById('headerAnthropic'),
    bodyAnthropic: document.getElementById('bodyAnthropic'),
    eyeAnthropic: document.getElementById('eyeAnthropic'),
    sectionOpenai: document.getElementById('sectionOpenai'),
    headerOpenai: document.getElementById('headerOpenai'),
    bodyOpenai: document.getElementById('bodyOpenai'),
    openaiRows: document.getElementById('openaiRows'),
    eyeOpenai: document.getElementById('eyeOpenai'),
    sectionGoogle: document.getElementById('sectionGoogle'),
    headerGoogle: document.getElementById('headerGoogle'),
    bodyGoogle: document.getElementById('bodyGoogle'),
    googleRows: document.getElementById('googleRows'),
    eyeGoogle: document.getElementById('eyeGoogle'),
    graphSection: document.getElementById('graphSection'),
    usageChart: document.getElementById('usageChart'),

    settingsBtn: document.getElementById('settingsBtn'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    githubBtn: document.getElementById('githubBtn'),
    psychicBtn: document.getElementById('psychicBtn'),
    chipAnthropic: document.getElementById('chipAnthropic'),
    chipOpenai: document.getElementById('chipOpenai'),
    chipGoogle: document.getElementById('chipGoogle'),
    connectRowOpenai: document.getElementById('connectRowOpenai'),
    connectOpenaiBtn: document.getElementById('connectOpenaiBtn'),
    connectErrorOpenai: document.getElementById('connectErrorOpenai'),
    connectRowGoogle: document.getElementById('connectRowGoogle'),
    connectGoogleBtn: document.getElementById('connectGoogleBtn'),
    connectErrorGoogle: document.getElementById('connectErrorGoogle'),
    settingsConnectOpenaiBtn: document.getElementById('settingsConnectOpenaiBtn'),
    settingsConnectGoogleBtn: document.getElementById('settingsConnectGoogleBtn'),
    disconnectOpenaiBtn: document.getElementById('disconnectOpenaiBtn'),
    disconnectGoogleBtn: document.getElementById('disconnectGoogleBtn'),
    openaiLoginStatus: document.getElementById('openaiLoginStatus'),
    googleLoginStatus: document.getElementById('googleLoginStatus'),
    psychicImg: document.getElementById('psychicImg'),
    openaiExtras: document.getElementById('openaiExtras'),
    openaiExtraRows: document.getElementById('openaiExtraRows'),
    openaiExpandToggle: document.getElementById('openaiExpandToggle'),
    openaiExpandArrow: document.getElementById('openaiExpandArrow'),
    autoStartCol: document.getElementById('autoStartCol'),
    autoStartToggle: document.getElementById('autoStartToggle'),
    autoStartHint: document.getElementById('autoStartHint'),
    minimizeToTrayToggle: document.getElementById('minimizeToTrayToggle'),
    alwaysOnTopToggle: document.getElementById('alwaysOnTopToggle'),
    warnThreshold: document.getElementById('warnThreshold'),
    dangerThreshold: document.getElementById('dangerThreshold'),
    themeBtns: document.querySelectorAll('.theme-btn'),
    timeFormat: document.getElementById('timeFormat'),
    weeklyDateFormat: document.getElementById('weeklyDateFormat'),
    refreshInterval: document.getElementById('refreshInterval'),
    orgSelector: document.getElementById('orgSelector'),
    orgSelectorCol: document.getElementById('orgSelectorCol'),

    updateBanner: document.getElementById('updateBanner'),
    updateBannerText: document.getElementById('updateBannerText'),
    updateBannerDismiss: document.getElementById('updateBannerDismiss'),
    settingsVersionLabel: document.getElementById('settingsVersionLabel'),
    settingsUpdateLink: document.getElementById('settingsUpdateLink'),
    usageAlertsToggle: document.getElementById('usageAlertsToggle'),
    compactModeToggle: document.getElementById('compactModeToggle'),
    compactModeToggleCompact: document.getElementById('compactModeToggleCompact'),
    compactContent: document.getElementById('compactContent'),
    compactCollapseBtn: document.getElementById('compactCollapseBtn'),
    compactExpandBtn: document.getElementById('compactExpandBtn'),
    compactSessionFill: document.getElementById('compactSessionFill'),
    compactSessionPct: document.getElementById('compactSessionPct'),
    compactWeeklyFill: document.getElementById('compactWeeklyFill'),
    compactWeeklyPct: document.getElementById('compactWeeklyPct'),
    compactScopedRow: document.getElementById('compactScopedRow'),
    compactScopedLabel: document.getElementById('compactScopedLabel'),
    compactScopedFill: document.getElementById('compactScopedFill'),
    compactScopedPct: document.getElementById('compactScopedPct'),
    showClaudeCodeToggle: document.getElementById('showClaudeCodeToggle'),
    trayOpenaiBg: document.getElementById('trayOpenaiBg'),
    trayOpenaiText: document.getElementById('trayOpenaiText'),
    trayGoogleBg: document.getElementById('trayGoogleBg'),
    trayGoogleText: document.getElementById('trayGoogleText'),
    traySessionBg: document.getElementById('traySessionBg'),
    traySessionText: document.getElementById('traySessionText'),
    trayWeeklyBg: document.getElementById('trayWeeklyBg'),
    trayWeeklyText: document.getElementById('trayWeeklyText'),
    trayFableBg: document.getElementById('trayFableBg'),
    trayFableText: document.getElementById('trayFableText'),
    trayOutlineToggle: document.getElementById('trayOutlineToggle'),
    trayOutlineColor: document.getElementById('trayOutlineColor'),
    burnAlertsToggle: document.getElementById('burnAlertsToggle'),
    fontColorToggle: document.getElementById('fontColorToggle'),
    fontColorPicker: document.getElementById('fontColorPicker'),
    planNote: document.getElementById('planNote'),
    planNoteOpenai: document.getElementById('planNoteOpenai'),
    planNoteGoogle: document.getElementById('planNoteGoogle'),
    webhookToggle: document.getElementById('webhookToggle'),
    webhookUrl: document.getElementById('webhookUrl'),
    dailyDigestToggle: document.getElementById('dailyDigestToggle'),
    showCodexToggle: document.getElementById('showCodexToggle'),
    showCodexCliToggle: document.getElementById('showCodexCliToggle'),
    showGeminiToggle: document.getElementById('showGeminiToggle'),
    showGeminiCliToggle: document.getElementById('showGeminiCliToggle'),
    compactSettingsOverlay: document.getElementById('compactSettingsOverlay'),
    closeCompactSettingsBtn: document.getElementById('closeCompactSettingsBtn')
};

// Populate organization selector dropdown
function populateOrgSelector(organizations, selectedOrgId) {
    if (!organizations || organizations.length === 0) {
        // No orgs - hide selector column
        elements.orgSelectorCol.style.display = 'none';
        return;
    }

    // Only show selector if user has multiple chat orgs
    if (organizations.length > 1) {
        elements.orgSelectorCol.style.display = '';  // Show column (use default flex display)
        
        // Clear existing options
        elements.orgSelector.innerHTML = '';
        
        // Add each org as an option
        organizations.forEach(org => {
            const option = document.createElement('option');
            option.value = org.id;
            option.textContent = `${org.name}${org.isTeam ? ' (Team)' : ' (Personal)'}`;
            if (org.id === selectedOrgId) {
                option.selected = true;
            }
            elements.orgSelector.appendChild(option);
        });
    } else {
        // Single org - hide selector column
        elements.orgSelectorCol.style.display = 'none';
    }
}

// Handle organization change
async function handleOrgChange() {
    const newOrgId = elements.orgSelector.value;
    if (newOrgId && newOrgId !== credentials.organizationId) {
        credentials.organizationId = newOrgId;
        await window.electronAPI.saveCredentials(credentials);
        // Refresh usage data with new org
        await fetchUsageData();
    }
}

// Initialize
async function init() {
    setupEventListeners();
    initSubheadings();
    credentials = await window.electronAPI.getCredentials();

    // Apply saved theme and load thresholds immediately
    const settings = await window.electronAPI.getSettings();
    window._cachedSettings = settings;
    applyTheme(settings.theme);
    if (window.electronAPI.platform === 'darwin') {
        document.getElementById('trayLabel').textContent = 'Hide from Dock';
    }
    warnThreshold = settings.warnThreshold;
    dangerThreshold = settings.dangerThreshold;
    applyFontColor(settings);
    applySectionStates(settings);

    // Restore compact mode from saved settings
    if (settings.compactMode) {
        applyCompactMode(true);
    } else {
        // Ensure compact overlay is hidden in normal mode
        if (elements.compactSettingsOverlay) elements.compactSettingsOverlay.style.display = 'none';
    }

    // Restore graph visibility
    if (settings.graphVisible) {
        if (!settings.compactMode) {
            // Normal mode — show graph immediately
            graphVisible = true;
            elements.graphBtn.classList.add('active');
            elements.graphSection.style.display = 'block';
        } else {
            // Compact mode — store so it restores when exiting compact
            graphWasVisible = true;
        }
    }

    // Restore expanded state (default: everything expanded)
    if (settings.expandedOpen !== false) {
        isExpanded = true;
        elements.expandArrow.classList.add('expanded');
        elements.expandSection.style.display = 'block';
    }
    isOpenaiExtrasOpen = settings.openaiExtrasOpen !== false;
    elements.openaiExpandArrow.classList.toggle('expanded', isOpenaiExtrasOpen);
    elements.openaiExtras.style.display = isOpenaiExtrasOpen ? 'block' : 'none';
    projectionsVisible = settings.projectionsOn !== false;
    applyPsychicState();
    applyPizazz(settings.pizazz !== false);

    if ((credentials.sessionKey && credentials.organizationId) || credentials.cliFallbackAvailable) {
        // Populate org selector if user has multiple orgs
        if (credentials.organizations && credentials.organizations.length > 0) {
            populateOrgSelector(credentials.organizations, credentials.organizationId);
        }
        showMainContent();
        await fetchUsageData();
        startAutoUpdate();
    } else {
        showLoginRequired();
    }

    // Populate version label then check for updates after a short delay
    const version = await window.electronAPI.getAppVersion();
    if (elements.settingsVersionLabel) {
        elements.settingsVersionLabel.textContent = `Application Version: v${version}`;
    }
    setTimeout(checkForUpdate, 2000);
    // Also check once every 24 hours for users who never close the app
    setInterval(checkForUpdate, 24 * 60 * 60 * 1000);

    // Startup restore complete — allow _saveViewState to persist changes
    appInitializing = false;
}

// Merge a partial settings change into the cached settings and persist —
// used by controls that live outside the settings overlay (section headers)
async function _saveSettingsPatch(patch) {
    const settings = window._cachedSettings || await window.electronAPI.getSettings();
    Object.assign(settings, patch);
    window._cachedSettings = settings;
    await window.electronAPI.saveSettings(settings);
}

// Provider sections: collapsible, each with its own tray-icon checkbox
const PROVIDER_SECTIONS = [
    { key: 'anthropic', traySetting: 'showTrayStats' },
    { key: 'openai', traySetting: 'trayOpenai' },
    { key: 'google', traySetting: 'trayGoogle' }
];

function sectionEls(key) {
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    return {
        header: elements['header' + cap],
        body: elements['body' + cap],
        eye: elements['eye' + cap]
    };
}

function applySectionStates(settings) {
    const collapsed = settings.sectionCollapsed || {};
    for (const { key, traySetting } of PROVIDER_SECTIONS) {
        const { header, body, eye } = sectionEls(key);
        if (!header) continue;
        header.classList.toggle('collapsed', !!collapsed[key]);
        body.classList.toggle('collapsed', !!collapsed[key]);
        if (eye) eye.classList.toggle('on', settings[traySetting] === true);
    }
}

function setupProviderSections() {
    for (const { key, traySetting } of PROVIDER_SECTIONS) {
        const { header, body, eye } = sectionEls(key);
        if (!header) continue;
        header.addEventListener('click', async (e) => {
            if (e.target.closest('.section-eye')) return; // eye handles itself
            const nowCollapsed = !body.classList.contains('collapsed');
            header.classList.toggle('collapsed', nowCollapsed);
            body.classList.toggle('collapsed', nowCollapsed);
            if (!isCompactMode) resizeWidget();
            const settings = window._cachedSettings || await window.electronAPI.getSettings();
            const sectionCollapsed = { ...(settings.sectionCollapsed || {}), [key]: nowCollapsed };
            await _saveSettingsPatch({ sectionCollapsed });
        });
        if (eye) {
            eye.addEventListener('click', async (e) => {
                e.stopPropagation();
                const nowOn = !eye.classList.contains('on');
                eye.classList.toggle('on', nowOn);
                // Closing the Anthropic eye while hidden from taskbar would
                // leave no icon to restore the app from
                if (key === 'anthropic' && !nowOn && elements.minimizeToTrayToggle.checked) {
                    elements.minimizeToTrayToggle.checked = false;
                    await _saveSettingsPatch({ minimizeToTray: false });
                }
                await _saveSettingsPatch({ [traySetting]: nowOn });
            });
        }
    }
}

// Event Listeners
function setupEventListeners() {
    // Step 1: Login via BrowserWindow
    elements.autoDetectBtn.addEventListener('click', handleAutoDetect);

    // Step navigation
    elements.nextStepBtn.addEventListener('click', () => {
        elements.loginStep1.style.display = 'none';
        elements.loginStep2.style.display = 'block';
        elements.sessionKeyInput.focus();
    });

    elements.backStepBtn.addEventListener('click', () => {
        elements.loginStep2.style.display = 'none';
        elements.loginStep1.style.display = 'flex';
        elements.sessionKeyError.textContent = '';
    });

    // Open browser link in step 2
    elements.openBrowserLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.electronAPI.openExternal('https://claude.ai');
    });

    // Step 2: Manual sessionKey connect
    elements.connectBtn.addEventListener('click', handleConnect);
    elements.sessionKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleConnect();
        elements.sessionKeyError.textContent = '';
    });

    elements.refreshBtn.addEventListener('click', async () => {
        debugLog('Refresh button clicked');
        elements.refreshBtn.classList.add('spinning');
        await fetchUsageData();
        elements.refreshBtn.classList.remove('spinning');
    });

    elements.graphBtn.addEventListener('click', async () => {
        graphVisible = !graphVisible;
        elements.graphBtn.classList.toggle('active', graphVisible);
        elements.graphSection.style.display = graphVisible ? 'block' : 'none';
        if (graphVisible) {
            await loadChart();
        }
        if (!isCompactMode) resizeWidget();
        _saveViewState();
    });

    elements.minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });

    elements.closeBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });

    // Expand/collapse toggle
    elements.expandToggle.addEventListener('click', async () => {
        const wasExpanded = isExpanded;
        isExpanded = !isExpanded;
        elements.expandArrow.classList.toggle('expanded', isExpanded);
        elements.expandSection.style.display = isExpanded ? 'block' : 'none';
        if (graphVisible) {
            loadChart();
        }
        resizeWidget();
        
        // CRITICAL: Update expandedOpen setting IMMEDIATELY (no debounce) to prevent race condition
        // If we wait for the debounced save, auto-refresh might fetch with stale expandedOpen=false
        const settings = window._cachedSettings || await window.electronAPI.getSettings();
        settings.expandedOpen = isExpanded;
        window._cachedSettings = settings;
        await window.electronAPI.saveSettings(settings);
        
        // Trigger immediate fetch if panel was just opened (collapsed → expanded)
        // This ensures fresh overage/prepaid data is available when user expands the panel
        // Pass forceExtended to bypass any cached setting and fetch extended data immediately
        if (!wasExpanded && isExpanded) {
            debugLog('[Conditional Polling] Panel expanded - triggering immediate fetch with extended data');
            await fetchUsageData({ forceExtended: true });
        }
    });

    // Settings close
    elements.closeSettingsBtn.addEventListener('click', async () => {
        await saveSettings();
        elements.settingsOverlay.style.display = 'none';
        if (_settingsOpenedFromCompact) {
            _settingsOpenedFromCompact = false;
            if (isCompactMode) {
                window.electronAPI.setCompactMode(true);
            } else {
                resizeWidget();
            }
        } else if (!isCompactMode) {
            resizeWidget();
        }
        startAutoUpdate();
        // Account toggles filter post-fetch, so a refetch applies them now
        await fetchUsageData();
    });

    elements.logoutBtn.addEventListener('click', async () => {
        await window.electronAPI.deleteCredentials();
        credentials = await window.electronAPI.getCredentials();
        elements.settingsOverlay.style.display = 'none';
        if (credentials.cliFallbackAvailable) {
            // The claude CLI login keeps the Anthropic section alive
            showMainContent();
            await fetchUsageData({ forceExtended: true });
        } else {
            showLoginRequired();
        }
    });

    elements.githubBtn.addEventListener('click', () => {
        window.electronAPI.openExternal('https://github.com/dev-newb/burnwatch');
    });

    document.getElementById('coffeeBtn').addEventListener('click', () => {
        window.electronAPI.openExternal('https://buymeacoffee.com/devnewb');
    });

    document.getElementById('creditLink').addEventListener('click', () => {
        window.electronAPI.openExternal('https://github.com/SlavomirDurej');
    });

    // The hydraulic press: crushes the widget into compact mode
    const pressBtn = document.getElementById('compactPressBtn');
    pressBtn.addEventListener('click', async () => {
        const compact = !isCompactMode;
        applyCompactMode(compact);
        await _saveCompactSetting(compact);
    });

    // The clown: jail him to turn off all visual pizazz
    const clownBtn = document.getElementById('clownBtn');
    clownBtn.addEventListener('click', async () => {
        const jailed = !document.body.classList.contains('no-pizazz');
        applyPizazz(!jailed);
        await _saveSettingsPatch({ pizazz: !jailed });
    });

    // Official OAuth connect paths (OpenAI / Google): section connect rows,
    // the clickable 'via CLI login' chips, and the Settings Connect buttons
    const runConnect = async (provider, busyFn, doneFn, errFn) => {
        if (busyFn) busyFn();
        const result = await window.electronAPI.oauthConnect(provider);
        if (doneFn) doneFn();
        if (result.ok) {
            await fetchUsageData({ forceExtended: true });
            if (elements.settingsOverlay.style.display !== 'none') await loadSettings();
        } else if (errFn) {
            errFn(result.error || 'Connection failed');
        }
    };
    const wireConnect = (btn, errEl, provider) => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            const original = btn.textContent;
            runConnect(provider,
                () => { btn.disabled = true; btn.textContent = 'Waiting for browser sign-in...'; if (errEl) errEl.textContent = ''; },
                () => { btn.disabled = false; btn.textContent = original; },
                (msg) => { if (errEl) errEl.textContent = msg; });
        });
    };
    wireConnect(elements.connectOpenaiBtn, elements.connectErrorOpenai, 'openai');
    wireConnect(elements.connectGoogleBtn, elements.connectErrorGoogle, 'google');
    wireConnect(elements.settingsConnectOpenaiBtn, null, 'openai');
    wireConnect(elements.settingsConnectGoogleBtn, null, 'google');

    // 'via CLI login' chips double as connect buttons
    const wireChipConnect = (chip, provider) => {
        if (!chip) return;
        chip.addEventListener('click', () => {
            if (!chip.classList.contains('cli')) return; // dual chip is informational
            const original = chip.textContent;
            runConnect(provider,
                () => { chip.textContent = 'waiting for sign-in...'; },
                () => { if (chip.textContent === 'waiting for sign-in...') chip.textContent = original; },
                null);
        });
    };
    wireChipConnect(elements.chipOpenai, 'openai');
    wireChipConnect(elements.chipGoogle, 'google');

    const wireDisconnect = (btn, provider) => {
        if (!btn) return;
        btn.addEventListener('click', async () => {
            await window.electronAPI.oauthDisconnect(provider);
            await fetchUsageData({ forceExtended: true });
            await loadSettings();
        });
    };
    wireDisconnect(elements.disconnectOpenaiBtn, 'openai');
    wireDisconnect(elements.disconnectGoogleBtn, 'google');

    // The psychic: toggles the forecast projection lines on the graph
    elements.psychicBtn.addEventListener('click', async () => {
        projectionsVisible = !projectionsVisible;
        applyPsychicState();
        if (graphVisible) await loadChart();
        await _saveSettingsPatch({ projectionsOn: projectionsVisible });
    });

    // OpenAI extras (Credits + Limit Resets) collapse toggle
    elements.openaiExpandToggle.addEventListener('click', async () => {
        isOpenaiExtrasOpen = !isOpenaiExtrasOpen;
        elements.openaiExpandArrow.classList.toggle('expanded', isOpenaiExtrasOpen);
        elements.openaiExtras.style.display = isOpenaiExtrasOpen ? 'block' : 'none';
        if (!isCompactMode) resizeWidget();
        await _saveSettingsPatch({ openaiExtrasOpen: isOpenaiExtrasOpen });
    });

    // Theme buttons
    elements.themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyTheme(btn.dataset.theme);
        });
    });

    // Prevent accidental app hiding: enabling "Hide from Taskbar" force-enables
    // the Anthropic tray icons (ensures a tray icon exists to restore from)
    elements.minimizeToTrayToggle.addEventListener('change', () => {
        if (elements.minimizeToTrayToggle.checked && !elements.eyeAnthropic.classList.contains('on')) {
            elements.eyeAnthropic.classList.add('on');
            _saveSettingsPatch({ showTrayStats: true });
        }
    });

    setupProviderSections();

    // Listen for refresh requests from tray
    window.electronAPI.onRefreshUsage(async () => {
        if (elements.refreshBtn) elements.refreshBtn.classList.add('spinning');
        await fetchUsageData();
        if (elements.refreshBtn) elements.refreshBtn.classList.remove('spinning');
    });

    // Listen for session expiration events (403 errors)
    window.electronAPI.onSessionExpired(async () => {
        debugLog('Session expired event received');
        credentials = await window.electronAPI.getCredentials();
        if (credentials.cliFallbackAvailable) {
            // The claude CLI login keeps the section alive without the web session
            showMainContent();
            await fetchUsageData({ forceExtended: true });
        } else {
            showLoginRequired();
        }
    });

    // Update banner
    elements.updateBannerDismiss.addEventListener('click', () => {
        elements.updateBanner.style.display = 'none';
        resizeWidget();
    });
    elements.updateBannerText.addEventListener('click', () => {
        if (_updateReadyToInstall) {
            window.electronAPI.installUpdate();
        } else {
            window.electronAPI.openExternal(`https://github.com/dev-newb/burnwatch/releases/latest`);
        }
    });
    elements.settingsUpdateLink.addEventListener('click', () => {
        if (_updateReadyToInstall) {
            window.electronAPI.installUpdate();
        } else {
            window.electronAPI.openExternal(`https://github.com/dev-newb/burnwatch/releases/latest`);
        }
    });

    // Auto-update: a downloaded release turns the banner into a one-click
    // "restart & apply" — no installer wizard involved
    window.electronAPI.onUpdateDownloaded((version) => {
        _updateReadyToInstall = true;
        elements.updateBannerText.textContent = `▲  v${version} downloaded — click to restart & apply`;
        elements.updateBanner.style.display = 'flex';
        if (elements.settingsUpdateLink) {
            elements.settingsUpdateLink.textContent = `→ v${version} ready — click to apply`;
            elements.settingsUpdateLink.style.display = 'inline';
        }
        if (!isCompactMode) resizeWidget(true);
    });

    // Compact mode — collapse chevron (normal → compact)
    elements.compactCollapseBtn.addEventListener('click', async () => {
        applyCompactMode(true);
        await _saveCompactSetting(true);
    });

    // Compact mode — expand chevron (compact → normal)
    elements.compactExpandBtn.addEventListener('click', async () => {
        applyCompactMode(false);
        await _saveCompactSetting(false);
    });

    // Compact mode toggle in normal settings panel — deferred to Done click

    // Compact mode toggle in compact settings panel — just updates the checkbox, Done applies it
    elements.compactModeToggleCompact.addEventListener('change', () => {
        // No immediate action — Done button reads this value and applies
    });

    // Organization selector — change triggers immediate save and refresh
    elements.orgSelector.addEventListener('change', handleOrgChange);

    // Settings button — always open full settings; if in compact mode, temporarily expand the window first
    elements.settingsBtn.addEventListener('click', async () => {
        stopAutoUpdate();
        if (isCompactMode) {
            _settingsOpenedFromCompact = true;
            window.electronAPI.setCompactMode(false);
        }
        await loadSettings();
        elements.settingsOverlay.style.display = 'flex';
        window.electronAPI.resizeWindow(700 + 34);
    });

    // Close compact settings — apply compact toggle value then close
    elements.closeCompactSettingsBtn.addEventListener('click', async () => {
        const compact = elements.compactModeToggleCompact.checked;
        if (compact !== isCompactMode) {
            applyCompactMode(compact);
            await _saveCompactSetting(compact);
        }
        elements.compactSettingsOverlay.style.display = 'none';
        startAutoUpdate();
    });
}

// Handle manual sessionKey connect
async function handleConnect() {
    const sessionKey = elements.sessionKeyInput.value.trim();
    if (!sessionKey) {
        elements.sessionKeyError.textContent = 'Please paste your session key';
        return;
    }

    elements.connectBtn.disabled = true;
    elements.connectBtn.textContent = '...';
    elements.sessionKeyError.textContent = '';

    try {
        const result = await window.electronAPI.validateSessionKey(sessionKey);
        if (result.success) {
            credentials = { 
                sessionKey, 
                organizationId: result.organizationId,
                organizations: result.organizations || []
            };
            await window.electronAPI.saveCredentials(credentials);
            populateOrgSelector(result.organizations || [], result.organizationId);
            elements.sessionKeyInput.value = '';
            showMainContent();
            await fetchUsageData();
            startAutoUpdate();
        } else {
            elements.sessionKeyError.textContent = result.error || 'Invalid session key';
        }
    } catch (error) {
        elements.sessionKeyError.textContent = 'Connection failed. Check your key.';
    } finally {
        elements.connectBtn.disabled = false;
        elements.connectBtn.textContent = 'Connect';
    }
}

// Handle auto-detect from browser cookies
async function handleAutoDetect() {
    elements.autoDetectBtn.disabled = true;
    elements.autoDetectBtn.textContent = 'Waiting...';
    elements.autoDetectError.textContent = '';

    try {
        const result = await window.electronAPI.detectSessionKey();
        if (!result.success) {
            elements.autoDetectError.textContent = result.error || 'Login failed';
            return;
        }

        // Got sessionKey from login, now validate it
        elements.autoDetectBtn.textContent = 'Validating...';
        const validation = await window.electronAPI.validateSessionKey(result.sessionKey);

        if (validation.success) {
            credentials = {
                sessionKey: result.sessionKey,
                organizationId: validation.organizationId,
                organizations: validation.organizations || []
            };
            await window.electronAPI.saveCredentials(credentials);
            populateOrgSelector(validation.organizations || [], validation.organizationId);
            showMainContent();
            await fetchUsageData();
            startAutoUpdate();
        } else {
            elements.autoDetectError.textContent =
                'Session invalid. Try again or use Manual →';
        }
    } catch (error) {
        elements.autoDetectError.textContent = error.message || 'Login failed';
    } finally {
        elements.autoDetectBtn.disabled = false;
        elements.autoDetectBtn.textContent = 'Log in';
    }
}

// Fetch usage data from Claude API
async function fetchUsageData(options = {}) {
    debugLog('fetchUsageData called');

    if (isFetching) {
        debugLog('Fetch already in flight — skipping');
        return;
    }

    if (!(credentials.sessionKey && credentials.organizationId) && !credentials.cliFallbackAvailable) {
        debugLog('Missing credentials, showing login');
        showLoginRequired();
        return;
    }

    isFetching = true;
    try {
        debugLog('Calling electronAPI.fetchUsageData...');
        const data = await window.electronAPI.fetchUsageData(options);
        debugLog('Received usage data:', data);
        updateUI(data);
    } catch (error) {
        console.error('Error fetching usage data:', error);
        if (error.message.includes('SessionExpired') || error.message.includes('Unauthorized')) {
            credentials = await window.electronAPI.getCredentials();
            if (credentials.cliFallbackAvailable) {
                showMainContent();
                setTimeout(() => fetchUsageData({ forceExtended: true }), 1500);
            } else {
                showLoginRequired();
            }
        } else {
            debugLog('Failed to fetch usage data');
        }
    } finally {
        isFetching = false;
    }
}


// Update UI with usage data
// Format a cent-based amount with the correct currency symbol.
// Known unambiguous symbols are used; everything else falls back to the
// ISO 4217 code as a suffix so the display is always correct.
function formatCurrency(amountCents, currencyCode) {
  const amount = (amountCents / 100).toFixed(2);
  const symbols = { USD: '$', EUR: '€', GBP: '£' };
  const sym = symbols[currencyCode];
  return sym ? `${sym}${amount}` : `${amount} ${currencyCode || 'USD'}`;
}

// Extra row label mapping for API fields
const EXTRA_ROW_CONFIG = {
    seven_day_sonnet: { label: 'Sonnet (7d)', color: 'sonnet' },
    seven_day_opus: { label: 'Opus (7d)', color: 'opus' },
    seven_day_cowork: { label: 'Cowork (7d)', color: 'cowork' },
    seven_day_omelette: { label: 'Design (7d)', color: 'design' },
    seven_day_oauth_apps: { label: 'OAuth Apps (7d)', color: 'oauth' },
    extra_usage: { label: 'Extra Usage', color: 'extra' },
};

function buildExtraRows(data) {
    // Don't clear existing rows if we don't have new data to replace them with
    // This preserves the last known state when expanding the panel
    const hasAnyExtendedData = Object.entries(EXTRA_ROW_CONFIG).some(([key, config]) => {
        const value = data[key];
        const hasUtilization = value && value.utilization !== undefined;
        const hasBalance = key === 'extra_usage' && value && value.balance_cents != null;
        return hasUtilization || hasBalance;
    });
    
    // Only rebuild if we have data, otherwise keep existing rows
    const existingRows = elements.extraRows.children.length + elements.scopedRows.children.length
        + elements.openaiRows.children.length + elements.openaiExtraRows.children.length + elements.googleRows.children.length
        + elements.anthropicCliRows.children.length + elements.openaiCliRows.children.length + elements.googleCliRows.children.length;
    if (!hasAnyExtendedData && existingRows > 0) {
        return; // Keep existing rows
    }

    elements.extraRows.innerHTML = '';
    elements.scopedRows.innerHTML = '';
    elements.openaiRows.innerHTML = '';
    elements.openaiExtraRows.innerHTML = '';
    elements.googleRows.innerHTML = '';
    elements.anthropicCliRows.innerHTML = '';
    elements.openaiCliRows.innerHTML = '';
    elements.googleCliRows.innerHTML = '';
    let count = 0;

    const hiddenRows = hiddenRowsMap();
    for (const [key, config] of Object.entries(EXTRA_ROW_CONFIG)) {
        const value = data[key];
        // extra_usage is valid with utilization OR balance_cents (prepaid only)
        const hasUtilization = value && value.utilization !== undefined;
        const hasBalance = key === 'extra_usage' && value && value.balance_cents != null;
        if (!hasUtilization && !hasBalance) continue;
        if (hiddenRows[key]) continue;

        const utilization = value.utilization || 0;
        const resetsAt = value.resets_at;
        const colorClass = config.color;

        const row = document.createElement('div');
        row.className = 'usage-section';

        // Build row using DOM methods (no innerHTML)
        const label = document.createElement('span');
        label.className = 'usage-label';
        
        // Narrow-width code chip (colour-matched to the bar) + abbreviated
        // form for the mid band
        label.dataset.code = rowCode(key, config.label);
        label.style.setProperty('--row-col', CODE_COLORS[config.color] || '#8b8fa3');
        label.dataset.abbr = config.label.replace(/^CLI /, '').replace(/\(daily\)/i, '(1D)');
        const tip = windowTip(config.label);
        if (tip) label.dataset.tip = tip;

        if (key === 'extra_usage') {
            // Extra usage: ON/OFF indicator goes next to label
            if (value.is_enabled === true) {
                const statusTag = document.createElement('span');
                statusTag.className = 'extra-status on';
                statusTag.textContent = 'ON';
                label.appendChild(statusTag);
            } else if (value.is_enabled === false) {
                const statusTag = document.createElement('span');
                statusTag.className = 'extra-status off';
                statusTag.textContent = 'OFF';
                label.appendChild(statusTag);
            }
            label.appendChild(document.createTextNode(' Extra Usage'));
        } else {
            label.textContent = config.label;
        }
        row.appendChild(label);

        if (key === 'extra_usage') {
            // Extra usage IS a meter when enabled (spend toward a monthly
            // cap) — the bar stays for that case. When OFF there is no cap
            // to fill against, so show a quiet note instead (same treatment
            // as OpenAI credits).
            const barGroup = document.createElement('div');
            barGroup.className = 'usage-bar-group';
            if (value.is_enabled === false) {
                const note = document.createElement('span');
                note.className = 'credits-approx dim';
                note.textContent = 'not enabled';
                barGroup.appendChild(note);
            } else {
                const progressBar = document.createElement('div');
                progressBar.className = 'progress-bar';
                const progressFill = document.createElement('div');
                progressFill.className = `progress-fill ${colorClass}`;
                progressFill.style.width = `${Math.min(utilization, 100)}%`;

                // Apply warning/danger thresholds to extra usage bar
                if (utilization >= dangerThreshold) {
                    progressFill.classList.add('danger');
                } else if (utilization >= warnThreshold) {
                    progressFill.classList.add('warning');
                }

                progressBar.appendChild(progressFill);
                barGroup.appendChild(progressBar);

                const percentage = document.createElement('span');
                if (value.used_cents != null && value.limit_cents != null) {
                    percentage.className = 'usage-percentage extra-spending';
                    percentage.textContent = `${formatCurrency(value.used_cents, value.currency)}/${formatCurrency(value.limit_cents, value.currency)}`;
                } else {
                    percentage.className = 'usage-percentage';
                    percentage.textContent = `${Math.round(utilization)}%`;
                }
                barGroup.appendChild(percentage);
            }
            row.appendChild(barGroup);

            const elapsedGroup = document.createElement('div');
            elapsedGroup.className = 'usage-elapsed-group';
            row.appendChild(elapsedGroup);

            const timerText = document.createElement('span');
            timerText.className = 'timer-text extra-balance-label';
            timerText.textContent = 'Account Credits:';
            row.appendChild(timerText);

            const resetsText = document.createElement('span');
            resetsText.className = 'resets-at-text extra-balance-amount';
            if (value.balance_cents != null) {
                resetsText.textContent = formatCurrency(value.balance_cents, value.currency);
            }
            row.appendChild(resetsText);
        } else {
            const totalMinutes = key.includes('seven_day') ? 7 * 24 * 60 : key.includes('daily') ? 24 * 60 : 5 * 60;

            const barGroup = document.createElement('div');
            barGroup.className = 'usage-bar-group';
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            const progressFill = document.createElement('div');
            progressFill.className = `progress-fill ${colorClass}`;
            progressFill.style.width = `${Math.min(utilization, 100)}%`;
            progressBar.appendChild(progressFill);
            barGroup.appendChild(progressBar);

            const percentage = document.createElement('span');
            percentage.className = 'usage-percentage';
            percentage.textContent = `${Math.round(utilization)}%`;
            barGroup.appendChild(percentage);
            row.appendChild(barGroup);

            const elapsedGroup = document.createElement('div');
            elapsedGroup.className = 'usage-elapsed-group';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'mini-timer');
            svg.setAttribute('width', '24');
            svg.setAttribute('height', '24');
            svg.setAttribute('viewBox', '0 0 24 24');
            const circleBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circleBg.setAttribute('class', 'timer-bg');
            circleBg.setAttribute('cx', '12');
            circleBg.setAttribute('cy', '12');
            circleBg.setAttribute('r', '10');
            svg.appendChild(circleBg);
            const circleProgress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circleProgress.setAttribute('class', `timer-progress ${colorClass}`);
            circleProgress.setAttribute('cx', '12');
            circleProgress.setAttribute('cy', '12');
            circleProgress.setAttribute('r', '10');
            circleProgress.style.strokeDasharray = '63';
            circleProgress.style.strokeDashoffset = '63';
            svg.appendChild(circleProgress);
            elapsedGroup.appendChild(svg);
            row.appendChild(elapsedGroup);

            const timerText = document.createElement('div');
            timerText.className = 'timer-text';
            timerText.dataset.resets = resetsAt || '';
            timerText.dataset.total = totalMinutes;
            timerText.textContent = '--:--';
            row.appendChild(timerText);

            const resetsText = document.createElement('span');
            resetsText.className = 'resets-at-text';
            if (resetsAt) {
                const settings = window._cachedSettings || {};
                resetsText.textContent = formatResetsAt(resetsAt, true, settings.timeFormat || '12h', settings.weeklyDateFormat || 'date');
            }
            row.appendChild(resetsText);
        }

        attachHideBtn(row, key, config.label);

        // Route rows to their provider section. Anthropic scoped limits
        // (e.g. Fable) are pinned below the Weekly row; CLI + extra-usage rows
        // stay in Anthropic's expandable panel and count toward its tally;
        // Codex and Gemini rows go to the OpenAI / Google sections.
        if (key.startsWith('seven_day_scoped_')) {
            const slug = key.slice('seven_day_scoped_'.length);
            const forecastAt = data.forecasts?.scoped?.[slug];
            if (forecastAt) {
                const settings = window._cachedSettings || {};
                row.title = `At the current pace, 100% by ${formatResetsAt(forecastAt, true, settings.timeFormat || '12h', 'date-day-time')}`;
            }
            elements.scopedRows.appendChild(row);
        } else if (key.startsWith('cc_')) {
            // Second-account rows live under their own burnable "CLI"
            // subheading; the subheading names the group, so drop the
            // now-redundant "CLI " label prefix
            label.textContent = config.label.replace(/^CLI /, '');
            elements.anthropicCliRows.appendChild(row);
        } else if (key.startsWith('codex_cli_')) {
            label.textContent = config.label.replace(/^CLI /, '');
            elements.openaiCliRows.appendChild(row);
        } else if (key.startsWith('codex_')) {
            elements.openaiRows.appendChild(row);
        } else if (key.startsWith('gemini_cli_')) {
            label.textContent = config.label.replace(/^CLI /, '');
            elements.googleCliRows.appendChild(row);
            const cliShade = GEMINI_BLUES[(elements.googleCliRows.children.length - 1) % GEMINI_BLUES.length];
            const cliFill = row.querySelector('.progress-fill');
            if (cliFill) cliFill.style.background = cliShade;
            label.style.setProperty('--row-col', cliShade);
        } else if (key.startsWith('gemini_')) {
            elements.googleRows.appendChild(row);
            const shade = GEMINI_BLUES[(elements.googleRows.children.length - 1) % GEMINI_BLUES.length];
            const fill = row.querySelector('.progress-fill');
            if (fill) fill.style.background = shade;
            label.style.setProperty('--row-col', shade);
        } else {
            elements.extraRows.appendChild(row);
            count++;
        }
    }

    // Codex credits — styled exactly like Anthropic's Extra Usage row
    // (ON/OFF tag, muted bar, right-aligned "Account Credits: N")
    const codexCredits = data.codex?.credits;
    if (codexCredits && elements.openaiRows.children.length && !hiddenRows.codex_row_credits) {
        const row = document.createElement('div');
        row.className = 'usage-section stretch-bar';

        const label = document.createElement('span');
        label.className = 'usage-label';
        label.dataset.code = 'CR';
        label.dataset.abbr = 'Credits';
        label.style.setProperty('--row-col', CODE_COLORS.codex);
        const creditsOn = codexCredits.unlimited || codexCredits.hasCredits;
        const statusTag = document.createElement('span');
        statusTag.className = `extra-status ${creditsOn ? 'on' : 'off'}`;
        statusTag.textContent = creditsOn ? 'ON' : 'OFF';
        label.appendChild(statusTag);
        label.appendChild(document.createTextNode(' Credits'));
        row.appendChild(label);

        // Credits are a wallet, not a meter — no bar. Show the API's own
        // message-count estimate for the balance instead.
        const barGroup = document.createElement('div');
        barGroup.className = 'usage-bar-group';
        const approx = document.createElement('span');
        approx.className = 'credits-approx';
        const fmtRange = (r) => (Array.isArray(r) && r.length === 2)
            ? (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`)
            : null;
        if (codexCredits.unlimited) {
            approx.textContent = 'unlimited';
        } else if (codexCredits.hasCredits) {
            const local = fmtRange(codexCredits.approxLocal);
            const cloud = fmtRange(codexCredits.approxCloud);
            approx.textContent = [local && `≈ ${local} local msgs`, cloud && `${cloud} cloud`]
                .filter(Boolean).join(' · ') || 'balance available';
        } else {
            approx.textContent = 'none purchased';
            approx.classList.add('dim');
        }
        barGroup.appendChild(approx);
        row.appendChild(barGroup); // spans bar+elapsed columns (stretch-bar)

        const balLabel = document.createElement('span');
        balLabel.className = 'timer-text extra-balance-label';
        balLabel.textContent = 'Account Credits:';
        row.appendChild(balLabel);

        const balAmount = document.createElement('span');
        balAmount.className = 'resets-at-text extra-balance-amount';
        balAmount.textContent = codexCredits.unlimited ? 'unlimited' : String(codexCredits.balance ?? 0);
        row.appendChild(balAmount);

        attachHideBtn(row, 'codex_row_credits', 'Credits');
        elements.openaiExtraRows.appendChild(row);
    }

    // OpenAI weekly-limit reset feature — banked resets shown as magic dots
    // (no ON/OFF: resets aren't a toggle, they simply exist)
    const resetCredits = data.codex?.resetCredits;
    if (resetCredits && elements.openaiRows.children.length && !hiddenRows.codex_row_resets) {
        const row = document.createElement('div');
        row.className = 'usage-section stretch-bar';
        row.title = resetCredits.applicable > 0
            ? `${resetCredits.applicable} reset${resetCredits.applicable > 1 ? 's' : ''} usable right now to clear a hit limit`
            : 'Banked limit resets — become usable when a limit is reached';

        const label = document.createElement('span');
        label.className = 'usage-label';
        label.textContent = 'Limit Resets';
        label.dataset.code = 'RST';
        label.dataset.abbr = 'Resets';
        label.style.setProperty('--row-col', CODE_COLORS.codex);
        row.appendChild(label);

        // One teal dot per banked reset, spread edge to edge across the column
        const barGroupDots = document.createElement('div');
        barGroupDots.className = 'usage-bar-group';
        const dotsWrap = document.createElement('div');
        const dotCount = Math.min(resetCredits.available, 12);
        dotsWrap.className = 'reset-dots' + (dotCount === 1 ? ' single' : '');
        for (let i = 0; i < dotCount; i++) {
            const dot = document.createElement('span');
            dot.className = 'reset-dot';
            dot.style.animationDelay = `${(i * 1.3 + 0.4).toFixed(1)}s`;
            dotsWrap.appendChild(dot);
        }
        barGroupDots.appendChild(dotsWrap);
        row.appendChild(barGroupDots); // spans bar+elapsed columns (stretch-bar)

        const balLabel = document.createElement('span');
        balLabel.className = 'timer-text extra-balance-label';
        balLabel.textContent = 'Resets Available:';
        row.appendChild(balLabel);

        const balAmount = document.createElement('span');
        balAmount.className = 'resets-at-text extra-balance-amount';
        balAmount.textContent = String(resetCredits.available);
        row.appendChild(balAmount);

        attachHideBtn(row, 'codex_row_resets', 'Limit Resets');
        elements.openaiExtraRows.appendChild(row);
    }

    // Provider sections appear only when they have rows
    elements.sectionOpenai.style.display = '';
    elements.sectionGoogle.style.display = '';
    elements.openaiExpandToggle.style.display = elements.openaiExtraRows.children.length ? 'flex' : 'none';

    // Hide toggle if no extra rows
    elements.expandToggle.style.display = count > 0 ? 'flex' : 'none';
    if (count === 0 && isExpanded) {
        isExpanded = false;
        elements.expandArrow.classList.remove('expanded');
        elements.expandSection.style.display = 'none';
    }

    applySubgroups();
    applyLabelMode();
    updateHiddenChips();

    return count;
}

// Title bar + bottom toolbar heights — every window-height computation
// includes both chrome strips
function _chromeHeight() {
    const th = elements.titleBar ? elements.titleBar.offsetHeight : 0;
    const bar = document.getElementById('bottomBar');
    return th + (bar ? bar.offsetHeight : 0);
}

// ---- Row identity codes + colours ----
// At narrow widths the row labels compress to short colour-matched codes;
// compact mode uses the same codes. Colour follows the row's bar colour.
const CODE_COLORS = {
    weekly: '#d97757', fable: '#d946ef', codex: '#2dd4bf', gemini: '#4285f4',
    cc: '#c8846a', opus: '#f59e0b', sonnet: '#f59e0b', cowork: '#22c55e',
    design: '#ec4899', extra: '#8b5cf6', oauth_apps: '#22c55e'
};
const COMPANY_COLORS = { anthropic: '#d97757', openai: '#10a37f', google: '#4285f4' };
// Google meters each model version separately — each pool gets its own
// shade of Google blue, darkest first
const GEMINI_BLUES = ['#1a5ce8', '#4285f4', '#7baaf7', '#a8c7fa', '#c9dcfc'];

// Tooltip text for abbreviated window suffixes (shown only when abbreviated)
function windowTip(label) {
    if (/daily/i.test(label) || /\(1D\)/i.test(label)) return 'Daily limit — resets every day';
    if (/\(7d\)/i.test(label)) return '7-day limit — resets weekly';
    if (/\(5h\)/i.test(label)) return '5-hour session limit';
    return '';
}

// Swap row-label verbosity by width band: full names, abbreviated windows
// ("(daily)" -> "(1D)"), or colour-coded chips. Tooltips carry the meaning
// only while abbreviated.
function applyLabelMode(effWidth) {
    const w = effWidth || window.innerWidth;
    const mode = w <= 450 ? 'code' : w <= 540 ? 'abbr' : 'full';
    document.querySelectorAll('.usage-label').forEach((el) => {
        const tip = el.dataset.tip || '';
        const full = (el.dataset.abbr || el.textContent || '').replace(/\(1D\)/, '(daily)');
        if (mode === 'code') el.title = tip ? `${full} — ${tip}` : full;
        else if (mode === 'abbr') el.title = tip;
        else el.title = '';
    });
}

function rowCode(key, label) {
    const clean = String(label || '').replace(/^CLI /, '');
    if (key === 'cc_five_hour') return 'CLA 5H';
    if (key === 'cc_seven_day') return 'CLA 7D';
    if (/^(cc_)?seven_day_scoped_/.test(key)) return clean.slice(0, 3).toUpperCase();
    if (key === 'extra_usage') return 'EXT';
    if (key.startsWith('codex_')) {
        if (/^Codex/i.test(clean)) return 'CDX';
        if (/Spark/i.test(clean)) return 'SPK';
        if (/Code Review/i.test(clean)) return 'CRV';
        return clean.replace(/\s*\(.*\)$/, '').slice(0, 3).toUpperCase();
    }
    if (key.startsWith('gemini_')) {
        // "2.5 Flash Lite (daily)" -> "2.5FL"
        const base = clean.replace(/\s*\(.*\)$/, '').replace(/^Gemini\s*/i, '');
        const ver = (base.match(/^[\d.]+/) || [''])[0];
        const fam = base.replace(/^[\d.]+\s*/, '').split(/\s+/).map((w) => w[0] || '').join('').toUpperCase();
        return (ver + fam) || 'GEM';
    }
    return clean.replace(/\s*\(.*\)$/, '').slice(0, 3).toUpperCase();
}

// ---- Hide individual trackers ----
// Hover any pool row for a small minus; hiding persists in
// settings.hiddenRows. Each section footer shows an "N hidden" chip that
// restores that provider's rows.
function rowProvider(key) {
    if (key.startsWith('codex_')) return 'openai';
    if (key.startsWith('gemini_')) return 'google';
    return 'anthropic';
}

function hiddenRowsMap() {
    return (window._cachedSettings || {}).hiddenRows || {};
}

async function hideRow(key) {
    const hiddenRows = { ...hiddenRowsMap(), [key]: true };
    await _saveSettingsPatch({ hiddenRows });
    if (latestUsageData) updateUI(latestUsageData);
}

async function restoreRows(provider) {
    const hiddenRows = { ...hiddenRowsMap() };
    for (const k of Object.keys(hiddenRows)) {
        if (rowProvider(k) === provider) delete hiddenRows[k];
    }
    await _saveSettingsPatch({ hiddenRows });
    if (latestUsageData) updateUI(latestUsageData);
}

function attachHideBtn(row, key, label) {
    const btn = document.createElement('button');
    btn.className = 'row-hide-btn';
    btn.textContent = '–';
    btn.title = 'Hide "' + String(label || key).replace(/^CLI /, '') + '" — restore from the "hidden" chip at the section bottom';
    btn.addEventListener('click', (e) => { e.stopPropagation(); hideRow(key); });
    row.appendChild(btn);
}

function updateHiddenChips() {
    const hidden = Object.keys(hiddenRowsMap());
    for (const [provider, footerSel] of [
        ['anthropic', '#sectionAnthropic .section-footer'],
        ['openai', '#sectionOpenai .section-footer'],
        ['google', '#sectionGoogle .section-footer']
    ]) {
        const footer = document.querySelector(footerSel);
        if (!footer) continue;
        let chip = footer.querySelector('.hidden-rows-chip');
        const count = hidden.filter((k) => rowProvider(k) === provider).length;
        if (!count) { if (chip) chip.remove(); continue; }
        if (!chip) {
            chip = document.createElement('button');
            chip.className = 'hidden-rows-chip';
            chip.addEventListener('click', () => restoreRows(provider));
            footer.appendChild(chip);
        }
        chip.textContent = count + ' hidden';
        chip.title = 'Click to restore the ' + count + ' hidden tracker' + (count > 1 ? 's' : '') + ' in this section';
    }
}

// ---- Desktop / CLI subgroups with burnable subheadings ----
// In dual mode (CLI logged into a different account than the primary sign-in)
// each provider splits into "Desktop" and "CLI" subgroups. Clicking a
// subheading ignites a fast pixel-fire sweep across it right-to-left — a hot
// front with a lit trail behind it and smoke rising — charring the letters
// and rolling the rows up; clicking again reverses the burn.
const SUBGROUP_SWEEP_MS = 380;

const _PXCOLS = { deep: '#e8590c', mid: '#ff922b', bright: '#ffd43b', core: '#fff3bf' };
const _rnd = (a, b) => a + Math.random() * (b - a);
const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Chunky flame sprite out of 2px cells (box-shadow art, robot-logo palette)
function _spawnPixelFlame(layer, x, lifeMs) {
    const cells = [];
    const rows = Math.floor(_rnd(4, 7));
    for (let r = 0; r < rows; r++) {
        for (const c of [-1, 0, 1]) {
            const edge = Math.abs(c) === 1;
            if (r === rows - 1 && edge) continue;
            if (r === rows - 1 && Math.random() < 0.4) continue;
            if (edge && Math.random() < 0.25) continue;
            const col = r >= rows - 2 ? (Math.random() < 0.5 ? _PXCOLS.mid : _PXCOLS.bright)
                : edge ? (Math.random() < 0.5 ? _PXCOLS.deep : _PXCOLS.mid)
                    : (Math.random() < 0.45 ? _PXCOLS.core : _PXCOLS.bright);
            cells.push(`${c * 2}px ${-r * 2}px 0 0 ${col}`);
        }
    }
    const f = document.createElement('div');
    f.className = 'fp';
    f.style.cssText = `left:${x}px; bottom:1px; width:2px; height:2px; background:transparent;
        box-shadow:${cells.join(',')};
        animation: pxFlame ${Math.round(lifeMs)}ms steps(5) forwards;`;
    layer.appendChild(f);
}

function _spawnPixelSmoke(layer, x) {
    const s = document.createElement('div');
    s.className = 'fp';
    s.style.cssText = `left:${x}px; bottom:${_rnd(8, 13)}px; width:3px; height:3px;
        background:${_pick(['#6a6a78', '#7c7c8a', '#585866'])};
        --dx:${Math.round(_rnd(-2, 3)) * 3}px; --ry:${-Math.round(_rnd(5, 11)) * 3}px;
        animation: pxSmoke ${Math.round(_rnd(650, 1100))}ms steps(6) forwards;`;
    layer.appendChild(s);
}

// The sweep itself: a hot front races across the word; every few px it leaves
// a trail flame that keeps burning until the front finishes, and smoke rises
// from both the front and random lit spots along the trail.
function runPixelSweep(btn, hide) {
    if (document.body.classList.contains('no-pizazz')) return; // clown's in jail
    const layer = document.createElement('div');
    layer.className = 'fx';
    btn.appendChild(layer);
    const W = Math.max(10, btn.offsetWidth - 14);
    const t0 = performance.now();
    let trailX = hide ? W : 0;
    let lastFront = 0, lastSmoke = 0;
    const lit = [];
    function frame(now) {
        const t = Math.min(1, (now - t0) / SUBGROUP_SWEEP_MS);
        const x = hide ? W * (1 - t) : W * t;
        const remaining = SUBGROUP_SWEEP_MS - (now - t0);
        if (now - lastFront > 22) { lastFront = now; _spawnPixelFlame(layer, x, _rnd(160, 300)); }
        while (hide ? trailX > x : trailX < x) {
            _spawnPixelFlame(layer, trailX + _rnd(-1, 1), remaining + _rnd(60, 220));
            lit.push(trailX);
            trailX += (hide ? -1 : 1) * 5;
        }
        if (now - lastSmoke > 45) {
            lastSmoke = now;
            const sx = (lit.length && Math.random() < 0.55) ? _pick(lit) : x + _rnd(-4, 6);
            _spawnPixelSmoke(layer, sx);
        }
        if (t < 1) requestAnimationFrame(frame);
        else setTimeout(() => layer.remove(), 1200);
    }
    requestAnimationFrame(frame);
}

// ---- Vertical squeeze classes ----
// Applied ONLY while the user has hand-sized/snapped the window (main tells
// us via window-user-sized). Auto-height mode never compresses, so the
// resize loop can't react to its own squeeze and spiral the window down.
let _windowUserSized = false;

function applySqueezeClasses() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const on = _windowUserSized;

    // Landscape: wider than tall with room for three columns — the provider
    // sections sit side by side and every width band keys on COLUMN width
    const landscape = on && w > h && w >= 760;
    document.body.classList.toggle('landscape', landscape);
    document.body.classList.toggle('vh-short', landscape && h < 420);
    const eff = landscape ? Math.floor(w / 3) - 10 : w;
    document.body.classList.toggle('sz1', eff <= 540);
    document.body.classList.toggle('lbl-abbr', eff <= 540 && eff > 450);
    document.body.classList.toggle('lbl-code', eff <= 450);
    document.body.classList.toggle('sz3', eff <= 330);
    document.body.classList.toggle('sz4', eff <= 288);

    document.body.classList.toggle('vh-1', on && !landscape && h < 520);
    document.body.classList.toggle('vh-2', on && !landscape && h < 430);
    document.body.classList.toggle('vh-3', on && !landscape && h < 340);
    // Tall mode: scale 0→1 between 820px and 1600px of height — sections
    // spread, text grows, and the wordmarks eat the extra vertical space.
    // Not in landscape, where the three columns own the layout.
    const tall = on && !landscape ? Math.min(Math.max((h - 820) / 780, 0), 1) : 0;
    document.body.classList.toggle('tall', tall > 0);
    document.body.style.setProperty('--tall', tall.toFixed(3));
    applyLabelMode(eff);
}

if (window.electronAPI.onWindowUserSized) {
    window.electronAPI.onWindowUserSized((userSized) => {
        _windowUserSized = userSized;
        applySqueezeClasses();
    });
}
window.addEventListener('resize', applySqueezeClasses);

// Track the window height every few frames while a subgroup rolls, so the
// window shrinks/grows WITH the content instead of snapping at the end
function _followResize(durationMs) {
    if (isCompactMode) return;
    const end = performance.now() + durationMs;
    let tick = 0;
    (function step() {
        if (performance.now() >= end) {
            const b = document.body.classList;
            if (!isCompactMode && !b.contains('tall') && !b.contains('landscape')
                && elements.settingsOverlay.style.display === 'none') {
                const th = _chromeHeight();
                const ch = elements.mainContent.scrollHeight;
                const bh = elements.updateBanner.style.display !== 'none' ? (elements.updateBanner.offsetHeight || 28) : 0;
                if (th >= 10 && ch >= 40) window.electronAPI.resizeWindow(th + bh + ch + 10, true);
            } else {
                resizeWidget();
            }
            return;
        }
        if ((tick++ % 3) === 0 && elements.settingsOverlay.style.display === 'none') {
            const th = _chromeHeight();
            const ch = elements.mainContent.scrollHeight;
            if (th >= 10 && ch >= 40) {
                const bh = elements.updateBanner.style.display !== 'none' ? (elements.updateBanner.offsetHeight || 28) : 0;
                window.electronAPI.resizeWindow(th + bh + ch + 10);
            }
        }
        requestAnimationFrame(step);
    })();
}

const SUBGROUP_PROVIDERS = [
    { key: 'anthropic', cliRows: 'anthropicCliRows', desk: 'sgAnthropicDesktop', cli: 'sgAnthropicCli' },
    { key: 'openai', cliRows: 'openaiCliRows', desk: 'sgOpenaiDesktop', cli: 'sgOpenaiCli' },
    { key: 'google', cliRows: 'googleCliRows', desk: 'sgGoogleDesktop', cli: 'sgGoogleCli' }
];

function initSubheadings() {
    document.querySelectorAll('.subheading').forEach((btn) => {
        const letters = [...(btn.dataset.label || '')];
        btn.textContent = '';
        // Letters char in the order the flame front reaches them (right to
        // left); healing runs the opposite way
        const span = Math.max(SUBGROUP_SWEEP_MS - 80, 100);
        letters.forEach((ch, i) => {
            const s = document.createElement('span');
            s.className = 'sub-letter';
            s.textContent = ch === ' ' ? '\u00A0' : ch;
            s.style.setProperty('--burn-d', `${Math.round(((letters.length - 1 - i) / letters.length) * span)}ms`);
            s.style.setProperty('--heal-d', `${Math.round((i / letters.length) * span)}ms`);
            s.style.setProperty('--rot', `${((i * 37) % 7) - 3}deg`);
            btn.appendChild(s);
        });
        btn.addEventListener('click', () => onSubheadingClick(btn));
    });
}

async function onSubheadingClick(btn) {
    if (btn.dataset.animating) return;
    const group = btn.closest('.subgroup');
    if (!group) return;
    const nowHidden = !group.classList.contains('hidden-group');
    btn.dataset.animating = '1';
    btn.classList.remove('burnt', 'burning', 'unburning');
    void btn.offsetWidth; // restart letter animations from a clean slate
    btn.classList.add(nowHidden ? 'burning' : 'unburning');
    runPixelSweep(btn, nowHidden);
    group.classList.add('rolling');
    group.classList.toggle('hidden-group', nowHidden);
    _followResize(SUBGROUP_SWEEP_MS + 550);
    setTimeout(() => {
        btn.classList.remove('burning', 'unburning');
        btn.classList.toggle('burnt', nowHidden);
        delete btn.dataset.animating;
        group.classList.remove('rolling');
    }, SUBGROUP_SWEEP_MS + 300);
    const settings = window._cachedSettings || {};
    const subgroupHidden = { ...(settings.subgroupHidden || {}), [btn.dataset.key]: nowHidden };
    await _saveSettingsPatch({ subgroupHidden });
}

function applySubgroups() {
    const hiddenMap = (window._cachedSettings || {}).subgroupHidden || {};
    for (const p of SUBGROUP_PROVIDERS) {
        const dual = elements[p.cliRows] && elements[p.cliRows].children.length > 0;
        const desk = document.getElementById(p.desk);
        const cli = document.getElementById(p.cli);
        if (!desk || !cli) continue;
        cli.style.display = dual ? '' : 'none';
        const deskHead = desk.querySelector('.subheading-row');
        if (deskHead) deskHead.style.display = dual ? '' : 'none';
        // Without a CLI twin there are no subheadings to click, so nothing
        // may stay burnt away — force both groups visible (the stored state
        // is kept for when dual mode returns)
        setSubgroupState(desk, dual && !!hiddenMap[p.key + '_desktop']);
        setSubgroupState(cli, dual && !!hiddenMap[p.key + '_cli']);
    }
}

function setSubgroupState(group, hidden) {
    const btn = group.querySelector('.subheading');
    if (btn && btn.dataset.animating) return; // never fight a live burn
    if (group.classList.contains('hidden-group') === hidden) return;
    group.classList.add('no-anim');
    group.classList.toggle('hidden-group', hidden);
    if (btn) {
        btn.classList.remove('burning', 'unburning');
        btn.classList.toggle('burnt', hidden);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => group.classList.remove('no-anim')));
}

function refreshExtraTimers() {
    // Pair each row's timer text with its own circle. Pairing the two
    // querySelectorAll lists by index breaks as soon as one row has a text
    // but no circle (the extra_usage row), leaving every later row's timer
    // stuck at --:--.
    // Covers the pinned scoped rows, the expandable panel, and provider sections.
    for (const container of [elements.scopedRows, elements.extraRows, elements.openaiRows, elements.googleRows,
        elements.anthropicCliRows, elements.openaiCliRows, elements.googleCliRows]) {
        container.querySelectorAll('.usage-section').forEach((row) => {
            const textEl = row.querySelector('.timer-text');
            const circleEl = row.querySelector('.timer-progress');
            if (!textEl || !circleEl) return;
            const resetsAt = textEl.dataset.resets;
            const totalMinutes = parseInt(textEl.dataset.total);
            if (resetsAt) {
                updateTimer(circleEl, textEl, resetsAt, totalMinutes);
            }
        });
    }
}

const BANNER_HEIGHT = 28;
const EXPAND_OVERHEAD = 28; // margin-top(12) + padding-top(6) + bottom buffer(10)

function resizeWidget(bannerVisible) {
    // Measure the actual laid-out content instead of summing row constants —
    // with collapsible provider sections the arithmetic became unmaintainable.
    // bannerVisible is accepted for call-site compatibility; the measurement
    // sees the banner's real display state (set before any resize call).
    void bannerVisible;
    requestAnimationFrame(() => {
        if (isCompactMode) return;
        // Never re-measure while the settings overlay is up — a background
        // refresh would stretch the window underneath the panel
        if (elements.settingsOverlay.style.display !== 'none') return;
        const titleHeight = _chromeHeight();
        const contentHeight = elements.mainContent.scrollHeight;
        // While minimized/hidden every measurement reads ~0 — resizing then
        // would shrink the window to a sliver. Skip; the focus listener
        // re-measures on restore.
        if (titleHeight < 10 || contentHeight < 40) return;
        const bannerHeight = elements.updateBanner.style.display !== 'none'
            ? (elements.updateBanner.offsetHeight || BANNER_HEIGHT) : 0;
        // +2 for the widget-container border, +8 bottom breathing room
        window.electronAPI.resizeWindow(titleHeight + bannerHeight + contentHeight + 10);
    });
}

// Colour classes for scoped weekly limits that have their own CSS identity;
// anything not listed falls back to the opus colour.
const SCOPED_COLOR_CLASSES = { fable: 'fable' };

function normalizeUsageData(data) {
    // claude.ai now reports per-model weekly limits (e.g. Fable) as entries in
    // the `limits` array with kind "weekly_scoped"; the legacy seven_day_<model>
    // fields arrive null for those models. Map each scoped weekly limit onto a
    // synthetic seven_day_* field so it renders like any other extra row.
    for (const limit of (data.limits || [])) {
        if (limit.kind !== 'weekly_scoped' || limit.percent == null) continue;
        const scopeName = limit.scope?.model?.display_name || limit.scope?.surface || 'Scoped';
        const slug = scopeName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const key = 'seven_day_scoped_' + slug;
        if (!EXTRA_ROW_CONFIG[key]) {
            EXTRA_ROW_CONFIG[key] = { label: `${scopeName} (7d)`, color: SCOPED_COLOR_CLASSES[slug] || 'opus' };
            // Re-insert extra_usage so model rows stay grouped above it
            const extraUsage = EXTRA_ROW_CONFIG.extra_usage;
            delete EXTRA_ROW_CONFIG.extra_usage;
            EXTRA_ROW_CONFIG.extra_usage = extraUsage;
        }
        data[key] = { utilization: limit.percent, resets_at: limit.resets_at };
    }

    // Claude Code (CLI) account — fetched by the main process using the local
    // OAuth credentials; same response shape as the claude.ai endpoint. Rows
    // render in the expandable panel under CLI-prefixed labels — but only when
    // the CLI login is a DIFFERENT account than the web login; when the two
    // match, the rows would be pure duplication (merged mode).
    const cc = data.claude_code_same_account ? null : data.claude_code;
    if (cc) {
        const ccRows = [];
        if (cc.five_hour?.utilization != null) {
            ccRows.push(['cc_five_hour',
                { label: 'CLI Claude Session (5h)', color: 'cc' },
                { utilization: cc.five_hour.utilization, resets_at: cc.five_hour.resets_at }]);
        }
        if (cc.seven_day?.utilization != null) {
            ccRows.push(['cc_seven_day',
                { label: 'CLI Claude Models (7d)', color: 'weekly' },
                { utilization: cc.seven_day.utilization, resets_at: cc.seven_day.resets_at }]);
        }
        for (const limit of (cc.limits || [])) {
            if (limit.kind !== 'weekly_scoped' || limit.percent == null) continue;
            const scopeName = limit.scope?.model?.display_name || limit.scope?.surface || 'Scoped';
            const slug = scopeName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            ccRows.push(['cc_seven_day_scoped_' + slug,
                { label: `CLI ${scopeName} (7d)`, color: SCOPED_COLOR_CLASSES[slug] || 'opus' },
                { utilization: limit.percent, resets_at: limit.resets_at }]);
        }
        if (ccRows.length) {
            for (const [key, config, value] of ccRows) {
                if (!EXTRA_ROW_CONFIG[key]) EXTRA_ROW_CONFIG[key] = config;
                data[key] = value;
            }
            // Re-insert extra_usage so account rows stay grouped above it
            const extraUsage = EXTRA_ROW_CONFIG.extra_usage;
            delete EXTRA_ROW_CONFIG.extra_usage;
            EXTRA_ROW_CONFIG.extra_usage = extraUsage;
        }
    }

    // Codex (OpenAI) account — fetched by the main process from the codex
    // CLI's local login (live endpoint, or its session-log snapshot when the
    // token has expired). Keys embed the window so timers use the right span.
    const cx = data.codex;
    if (cx && Array.isArray(cx.limits) && cx.limits.length) {
        for (const lim of cx.limits) {
            const key = 'codex_' + lim.key;
            if (!EXTRA_ROW_CONFIG[key]) EXTRA_ROW_CONFIG[key] = { label: lim.label, color: 'codex' };
            data[key] = { utilization: lim.percent, resets_at: lim.resetsAt };
        }
        // Dual mode: the codex CLI is a different account - tracked separately
        for (const lim of (cx.cli && cx.cli.limits || [])) {
            const key = 'codex_cli_' + lim.key;
            if (!EXTRA_ROW_CONFIG[key]) EXTRA_ROW_CONFIG[key] = { label: 'CLI ' + lim.label, color: 'codex' };
            data[key] = { utilization: lim.percent, resets_at: lim.resetsAt };
        }
        const extraUsage = EXTRA_ROW_CONFIG.extra_usage;
        delete EXTRA_ROW_CONFIG.extra_usage;
        EXTRA_ROW_CONFIG.extra_usage = extraUsage;
    }

    // Gemini (Google) account — daily per-family quota from the gemini CLI's
    // backend, fetched by the main process with the CLI's own local login.
    const gm = data.gemini;
    if (gm && Array.isArray(gm.limits) && gm.limits.length) {
        for (const lim of gm.limits) {
            const key = 'gemini_' + lim.key;
            if (!EXTRA_ROW_CONFIG[key]) EXTRA_ROW_CONFIG[key] = { label: lim.label, color: 'gemini' };
            data[key] = { utilization: lim.percent, resets_at: lim.resetsAt };
        }
        // Dual mode: the gemini CLI is a different account - tracked separately
        for (const lim of (gm.cli && gm.cli.limits || [])) {
            const key = 'gemini_cli_' + lim.key;
            if (!EXTRA_ROW_CONFIG[key]) EXTRA_ROW_CONFIG[key] = { label: 'CLI ' + lim.label, color: 'gemini' };
            data[key] = { utilization: lim.percent, resets_at: lim.resetsAt };
        }
        const extraUsage = EXTRA_ROW_CONFIG.extra_usage;
        delete EXTRA_ROW_CONFIG.extra_usage;
        EXTRA_ROW_CONFIG.extra_usage = extraUsage;
    }
    return data;
}

function updateUI(data) {
    latestUsageData = normalizeUsageData(data);

    showMainContent();
    buildExtraRows(data);
    refreshTimers();
    refreshExtraTimers(); // pinned scoped rows tick even when collapsed

    // Burn-rate forecast tooltip on the Weekly row
    const weeklySection = elements.weeklyProgress.closest('.usage-section');
    if (weeklySection) {
        const settings = window._cachedSettings || {};
        weeklySection.title = data.forecasts?.weekly
            ? `At the current pace, 100% by ${formatResetsAt(data.forecasts.weekly, true, settings.timeFormat || '12h', 'date-day-time')}`
            : '';
    }

    // Account-status chips + connect rows per provider section
    const setChip = (el, mode) => {
        if (!el) return;
        if (!mode) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.className = 'section-chip ' + mode.cls;
        el.textContent = mode.text;
        el.title = mode.title || '';
    };
    const cxStatus = data.codex;
    const gmStatus = data.gemini;
    setChip(elements.chipOpenai, cxStatus && !cxStatus.cli && !cxStatus.connected
        ? { cls: 'cli', text: 'via CLI login', title: 'Reading your codex CLI login. Sign in with ChatGPT for a widget-owned connection.' }
        : null);
    setChip(elements.chipGoogle, gmStatus && !gmStatus.cli && !gmStatus.connected
        ? { cls: 'cli', text: 'via CLI login', title: 'Reading your gemini CLI login. Sign in with Google for a widget-owned connection.' }
        : null);
    setChip(elements.chipAnthropic, (!data.claude_code || data.claude_code_same_account !== false) && data.anthropic_source === 'cli'
        ? { cls: 'cli anthropic-cli', text: 'via CLI login', title: 'Reading your claude CLI login. Log in with claude.ai (settings) for full data including Extra Usage and credits.' }
        : null);
    // The amber pill IS the CLI subheading now — give it the account detail
    const pillTitle = (sel, t) => { const b = document.querySelector(sel); if (b) b.title = t; };
    pillTitle('#sgOpenaiCli .subheading', cxStatus && cxStatus.cli
        ? 'Your codex CLI (' + (cxStatus.cli.email || 'other account') + ') differs from ' + (cxStatus.email || 'the connected account') + '. Click to hide these rows.'
        : '');
    pillTitle('#sgGoogleCli .subheading', gmStatus && gmStatus.cli
        ? 'Your gemini CLI (' + (gmStatus.cli.email || 'other account') + ') differs from ' + (gmStatus.email || 'the connected account') + '. Click to hide these rows.'
        : '');
    pillTitle('#sgAnthropicCli .subheading', (data.claude_code && data.claude_code_same_account === false)
        ? 'Your claude CLI is logged into a different account - tracked separately here. Click to hide these rows.'
        : '');
    if (elements.connectRowOpenai) elements.connectRowOpenai.style.display = cxStatus ? 'none' : '';
    if (elements.connectRowGoogle) elements.connectRowGoogle.style.display = gmStatus ? 'none' : '';

    // Frozen providers — logo goes on ice when an account has sat unused
    const frozen = data.frozenProviders || {};
    for (const [header, isFrozen] of [
        [elements.headerAnthropic, frozen.anthropic],
        [elements.headerOpenai, frozen.openai],
        [elements.headerGoogle, frozen.google]
    ]) {
        if (!header) continue;
        header.classList.toggle('frozen', !!isFrozen);
        const name = header.querySelector('.section-name');
        if (name) name.title = isFrozen ? 'On ice — no usage here in a while. Send a prompt to thaw it out.' : '';
    }

    // Session-window planner hints, one per provider section. When there is
    // not enough burn history yet, show a learning placeholder rather than
    // nothing — the line stays put instead of appearing days later.
    const plans = data.sessionPlans || {};
    const PLAN_LEARNING = 'Planner: still learning this account’s rhythm — needs more usage history.';
    for (const [el, plan] of [
        [elements.planNote, plans.anthropic],
        [elements.planNoteOpenai, plans.openai],
        [elements.planNoteGoogle, plans.google]
    ]) {
        if (!el) continue;
        el.style.display = '';
        el.textContent = plan ? plan.text : PLAN_LEARNING;
        el.title = plan ? plan.text : PLAN_LEARNING;
        el.style.opacity = plan ? '' : '0.55';
    }

    if (!isCompactMode) resizeWidget();
    startCountdown();
    if (graphVisible) {
        loadChart();
    }

    // Update compact bars in parallel if compact mode is active
    if (isCompactMode) updateCompactBars(data);

    // On first load, seed alert flags so we don't fire for thresholds
    // the user can already see when the app starts
    if (isFirstDataLoad) {
        isFirstDataLoad = false;
        seedAlertFlags(data);
    }

    checkUsageAlerts(data);
}

// Fire OS desktop notifications when usage crosses warn/danger thresholds.
// Only fires once per threshold crossing per session window — not on every refresh.
function checkUsageAlerts(data) {
    const settings = window._cachedSettings || {};
    if (!settings.usageAlerts) return;

    const sessionPct = data.five_hour?.utilization || 0;
    const weeklyPct = data.seven_day?.utilization || 0;

    // Reset alert flags when a session window resets (utilization drops back low)
    if (sessionPct < warnThreshold) {
        alertFired.session_warn = false;
        alertFired.session_danger = false;
    }
    if (weeklyPct < warnThreshold) {
        alertFired.weekly_warn = false;
        alertFired.weekly_danger = false;
    }

    // Current Session — danger threshold (check first, higher priority)
    if (sessionPct >= dangerThreshold && !alertFired.session_danger) {
        alertFired.session_danger = true;
        alertFired.session_warn = true; // suppress warn if we jumped straight to danger
        window.electronAPI.showNotification(
            'Burnwatch',
            `Anthropic Session usage is at ${Math.round(sessionPct)}% — running low`
        );
    // Current Session — warn threshold
    } else if (sessionPct >= warnThreshold && !alertFired.session_warn) {
        alertFired.session_warn = true;
        window.electronAPI.showNotification(
            'Burnwatch',
            `Anthropic Session usage has reached ${Math.round(sessionPct)}%`
        );
    }

    // Weekly Limit — danger threshold
    if (weeklyPct >= dangerThreshold && !alertFired.weekly_danger) {
        alertFired.weekly_danger = true;
        alertFired.weekly_warn = true;
        window.electronAPI.showNotification(
            'Burnwatch',
            `Anthropic Weekly (all models) usage is at ${Math.round(weeklyPct)}% — running low`
        );
        window.electronAPI.sendAlertWebhook('weekly_danger', 'Claude usage warning',
            `Anthropic Weekly (all models) usage is at ${Math.round(weeklyPct)}% — running low`);
    // Weekly Limit — warn threshold
    } else if (weeklyPct >= warnThreshold && !alertFired.weekly_warn) {
        alertFired.weekly_warn = true;
        window.electronAPI.showNotification(
            'Burnwatch',
            `Anthropic Weekly (all models) usage has reached ${Math.round(weeklyPct)}%`
        );
    }

    // Scoped weekly limits (e.g. Fable) — same warn/danger pattern, plus a
    // maxed-out alert at 99%+ with the reset time
    for (const [key, config] of Object.entries(EXTRA_ROW_CONFIG)) {
        if (!key.startsWith('seven_day_scoped_')) continue;
        const value = data[key];
        if (!value || value.utilization == null) continue;
        const pct = value.utilization;
        const label = config.label;

        if (pct < warnThreshold) {
            alertFired[`${key}_warn`] = false;
            alertFired[`${key}_danger`] = false;
            alertFired[`${key}_maxed`] = false;
        }

        if (pct >= 99 && !alertFired[`${key}_maxed`]) {
            alertFired[`${key}_maxed`] = true;
            alertFired[`${key}_danger`] = true;
            alertFired[`${key}_warn`] = true;
            const settings = window._cachedSettings || {};
            const resetStr = value.resets_at
                ? ` — resets ${formatResetsAt(value.resets_at, true, settings.timeFormat || '12h', 'date-day-time')}`
                : '';
            window.electronAPI.showNotification(
                'Burnwatch',
                `Anthropic ${label} limit is maxed out${resetStr}`
            );
            window.electronAPI.sendAlertWebhook('scoped_maxed', 'Claude limit maxed',
                `Anthropic ${label} limit is maxed out${resetStr}`);
        } else if (pct >= dangerThreshold && !alertFired[`${key}_danger`]) {
            alertFired[`${key}_danger`] = true;
            alertFired[`${key}_warn`] = true;
            window.electronAPI.showNotification(
                'Burnwatch',
                `Anthropic ${label} usage is at ${Math.round(pct)}% — running low`
            );
            window.electronAPI.sendAlertWebhook('scoped_danger', 'Claude usage warning',
                `Anthropic ${label} usage is at ${Math.round(pct)}% — running low`);
        } else if (pct >= warnThreshold && !alertFired[`${key}_warn`]) {
            alertFired[`${key}_warn`] = true;
            window.electronAPI.showNotification(
                'Burnwatch',
                `Anthropic ${label} usage has reached ${Math.round(pct)}%`
            );
        }
    }
}

// Apply or remove compact mode — switches view, resizes window, syncs all toggles
// Pizazz on: happy clown, everything animates. Off: clown in jail, sad and
// crying, and every animation/transition in the app goes dead still.
function applyPizazz(on) {
    document.body.classList.toggle('no-pizazz', !on);
    const img = document.getElementById('clownImg');
    const btn = document.getElementById('clownBtn');
    if (img) img.src = on ? '../../assets/clown-happy.png' : '../../assets/clown-jail.png';
    if (btn) btn.title = on
        ? 'Pizazz: ON — click to jail the clown and turn off all visual effects'
        : 'Pizazz: OFF — the clown weeps behind bars. Click to free him and the sparkles.';
}

function applyCompactMode(compact) {
    isCompactMode = compact;

    // Press slams down while the widget is crushed
    const pressImg = document.getElementById('pressImg');
    if (pressImg) pressImg.src = compact ? '../../assets/press-down.png' : '../../assets/press-up.png';

    // Add/remove compact-mode class from body for CSS styling
    if (compact) {
        document.body.classList.add('compact-mode');
    } else {
        document.body.classList.remove('compact-mode');
    }

    // Show/hide the correct content view
    elements.mainContent.style.display = compact ? 'none' : 'block';
    elements.compactContent.style.display = compact ? 'flex' : 'none';

    // Collapse extra rows when entering compact — prevents stale isExpanded state
    if (compact && isExpanded) {
        isExpanded = false;
        elements.expandArrow.classList.remove('expanded');
        elements.expandSection.style.display = 'none';
    }

    if (compact && graphVisible) {
        graphWasVisible = true;
        graphVisible = false;
        elements.graphBtn.classList.remove('active');
        elements.graphSection.style.display = 'none';
    } else if (!compact && graphWasVisible) {
        graphWasVisible = false;
        graphVisible = true;
        elements.graphBtn.classList.add('active');
        elements.graphSection.style.display = 'block';
        loadChart();
    }

    // Show/hide the collapse chevron (only visible in normal mode with data)
    if (elements.compactCollapseBtn) {
        elements.compactCollapseBtn.style.display = compact ? 'none' : 'flex';
    }

    // Keep refresh button visible in compact mode so users can see when data updates
    // Hide graph button in compact mode (not applicable)
    if (elements.graphBtn) {
        elements.graphBtn.style.display = compact ? 'none' : '';
    }

    // Tell main process to resize the window width
    window.electronAPI.setCompactMode(compact);

    // Sync both settings toggles
    if (elements.compactModeToggle) elements.compactModeToggle.checked = compact;
    if (elements.compactModeToggleCompact) elements.compactModeToggleCompact.checked = compact;

    // Update compact bars if we have data
    if (compact && latestUsageData) updateCompactBars(latestUsageData);
    if (!compact) resizeWidget();

    // Persist graph/expanded state changes caused by compact mode toggle
    _saveViewState();
}

// Compact mode: one slim [code][bar][%] row per active pool across ALL
// providers, grouped by a company-colour edge; CLI second-account rows carry
// the terminal-cursor underscore, matching the tray badge language.
function updateCompactBars(data) {
    const container = document.getElementById('compactRows');
    if (!container) return;
    const clamp = (v) => Math.min(Math.max(v || 0, 0), 100);
    const pools = [];

    pools.push({ co: 'anthropic', code: 'CLA 5H', name: 'Claude Session (5h)', pct: clamp(data.five_hour?.utilization), color: '#e0916f' });
    pools.push({ co: 'anthropic', code: 'CLA 7D', name: 'Claude Models (7d)', pct: clamp(data.seven_day?.utilization), color: CODE_COLORS.weekly });
    const hiddenRows = hiddenRowsMap();
    for (const [key, config] of Object.entries(EXTRA_ROW_CONFIG)) {
        const value = data[key];
        if (!value || value.utilization == null) continue;
        if (hiddenRows[key]) continue;
        if (key.startsWith('seven_day_scoped_')) {
            pools.push({ co: 'anthropic', code: rowCode(key, config.label), name: config.label, pct: clamp(value.utilization), color: CODE_COLORS[config.color] || '#d946ef' });
        } else if (key.startsWith('cc_')) {
            pools.push({ co: 'anthropic', cli: true, code: rowCode(key, config.label), name: config.label, pct: clamp(value.utilization), color: CODE_COLORS[config.color] || CODE_COLORS.cc });
        }
    }
    for (const lim of (data.codex?.limits || [])) {
        if (hiddenRows['codex_' + lim.key]) continue;
        pools.push({ co: 'openai', code: rowCode('codex_' + lim.key, lim.label), name: lim.label, pct: clamp(lim.percent), color: CODE_COLORS.codex });
    }
    for (const lim of (data.codex?.cli?.limits || [])) {
        pools.push({ co: 'openai', cli: true, code: rowCode('codex_' + lim.key, lim.label), name: 'CLI ' + lim.label, pct: clamp(lim.percent), color: CODE_COLORS.codex });
    }
    (data.gemini?.limits || []).forEach((lim, i) => {
        if (hiddenRows['gemini_' + lim.key]) return;
        pools.push({ co: 'google', code: rowCode('gemini_' + lim.key, lim.label), name: lim.label, pct: clamp(lim.percent), color: GEMINI_BLUES[i % GEMINI_BLUES.length] });
    });
    (data.gemini?.cli?.limits || []).forEach((lim, i) => {
        pools.push({ co: 'google', cli: true, code: rowCode('gemini_' + lim.key, lim.label), name: 'CLI ' + lim.label, pct: clamp(lim.percent), color: GEMINI_BLUES[i % GEMINI_BLUES.length] });
    });

    container.innerHTML = '';
    for (const p of pools) {
        const row = document.createElement('div');
        row.className = 'compact-row';
        row.style.setProperty('--co', COMPANY_COLORS[p.co]);
        row.title = (p.cli ? 'CLI account — ' : '') + p.name.replace(/^CLI /, '');

        const labelEl = document.createElement('span');
        labelEl.className = 'compact-label';
        labelEl.style.color = p.color;
        labelEl.textContent = p.code + (p.cli ? '_' : '');
        row.appendChild(labelEl);

        const wrap = document.createElement('div');
        wrap.className = 'compact-bar-wrap';
        const bg = document.createElement('div');
        bg.className = 'compact-bar-bg';
        const fill = document.createElement('div');
        fill.className = 'compact-bar-fill';
        fill.style.width = `${p.pct}%`;
        fill.style.background = p.pct >= dangerThreshold ? '#ef4444'
            : p.pct >= warnThreshold ? '#f59e0b' : p.color;
        bg.appendChild(fill);
        const pctEl = document.createElement('span');
        pctEl.className = 'compact-pct';
        pctEl.textContent = `${Math.round(p.pct)}%`;
        bg.appendChild(pctEl);
        wrap.appendChild(bg);
        row.appendChild(wrap);
        container.appendChild(row);
    }

    // Fit the compact window to the pool count. Computed, not measured —
    // the rows container stretches to fill the window (so bars can expand
    // when the user makes it bigger), which makes measuring it circular.
    if (isCompactMode) {
        window.electronAPI.resizeWindow(_chromeHeight() + pools.length * 26 + 18);
    }
}
// Persist compact mode setting without touching the rest of settings — debounced
let _saveCompactTimer = null;
async function _saveCompactSetting(compact) {
    if (_saveCompactTimer) clearTimeout(_saveCompactTimer);
    _saveCompactTimer = setTimeout(async () => {
        const settings = window._cachedSettings || await window.electronAPI.getSettings();
        settings.compactMode = compact;
        window._cachedSettings = settings;
        await window.electronAPI.saveSettings(settings);
    }, 300);
}

// Persist graph/expanded visibility state — debounced to avoid hammering disk on rapid toggles
let _saveViewStateTimer = null;
async function _saveViewState() {
    if (appInitializing) return;
    if (_saveViewStateTimer) clearTimeout(_saveViewStateTimer);
    _saveViewStateTimer = setTimeout(async () => {
        const settings = window._cachedSettings || await window.electronAPI.getSettings();
        settings.graphVisible = graphVisible;
        settings.expandedOpen = isExpanded;
        window._cachedSettings = settings;
        await window.electronAPI.saveSettings(settings);
    }, 300);
}

let sessionResetTriggered = false;
let weeklyResetTriggered = false;
let isFirstDataLoad = true; // used to seed alert flags on startup

// Track which usage alert thresholds have already fired this window
// Prevents repeat notifications on every refresh cycle
// Keys: 'session_warn', 'session_danger', 'weekly_warn', 'weekly_danger'
// Seeded on startup so thresholds already exceeded at launch don't fire immediately
const alertFired = {
    session_warn: false,
    session_danger: false,
    weekly_warn: false,
    weekly_danger: false
};

// Seed alertFired flags based on current utilization at startup.
// Any threshold already exceeded when the app launches is treated as already fired,
// so the user doesn't get a notification for something they can already see.
function seedAlertFlags(data) {
    const sessionPct = data.five_hour?.utilization || 0;
    const weeklyPct = data.seven_day?.utilization || 0;

    if (sessionPct >= dangerThreshold) {
        alertFired.session_danger = true;
        alertFired.session_warn = true;
    } else if (sessionPct >= warnThreshold) {
        alertFired.session_warn = true;
    }

    if (weeklyPct >= dangerThreshold) {
        alertFired.weekly_danger = true;
        alertFired.weekly_warn = true;
    } else if (weeklyPct >= warnThreshold) {
        alertFired.weekly_warn = true;
    }

    // Scoped weekly limits (e.g. Fable): thresholds already exceeded at launch
    // are treated as fired so startup doesn't notify about visible state
    for (const key of Object.keys(EXTRA_ROW_CONFIG)) {
        if (!key.startsWith('seven_day_scoped_')) continue;
        const pct = data[key]?.utilization;
        if (pct == null) continue;
        if (pct >= 99) alertFired[`${key}_maxed`] = true;
        if (pct >= dangerThreshold) alertFired[`${key}_danger`] = true;
        if (pct >= warnThreshold) alertFired[`${key}_warn`] = true;
    }
}

function refreshTimers() {
    if (!latestUsageData) return;

    const settings = window._cachedSettings || {};
    const timeFormat = settings.timeFormat || '12h';
    const weeklyDateFormat = settings.weeklyDateFormat || 'date';

    // Session data
    const sessionUtilization = latestUsageData.five_hour?.utilization || 0;
    const sessionResetsAt = latestUsageData.five_hour?.resets_at;

    // Check if session timer has expired and we need to refresh
    if (sessionResetsAt) {
        const sessionDiff = new Date(sessionResetsAt) - new Date();
        if (sessionDiff <= 0 && !sessionResetTriggered) {
            sessionResetTriggered = true;
            debugLog('Session timer expired, triggering refresh...');
            // Wait a few seconds for the server to update, then refresh
            setTimeout(() => {
                fetchUsageData();
                checkForUpdate();
            }, 3000);
        } else if (sessionDiff > 0) {
            sessionResetTriggered = false; // Reset flag when timer is active again
        }
    }

    updateProgressBar(
        elements.sessionProgress,
        elements.sessionPercentage,
        sessionUtilization
    );

    updateTimer(
        elements.sessionTimer,
        elements.sessionTimeText,
        sessionResetsAt,
        5 * 60 // 5 hours in minutes
    );
    elements.sessionResetsAt.textContent = formatResetsAt(sessionResetsAt, false, timeFormat, weeklyDateFormat);
    elements.sessionResetsAt.style.opacity = sessionResetsAt ? '1' : '0.4';

    // Weekly data
    const weeklyUtilization = latestUsageData.seven_day?.utilization || 0;
    const weeklyResetsAt = latestUsageData.seven_day?.resets_at;

    // Check if weekly timer has expired and we need to refresh
    if (weeklyResetsAt) {
        const weeklyDiff = new Date(weeklyResetsAt) - new Date();
        if (weeklyDiff <= 0 && !weeklyResetTriggered) {
            weeklyResetTriggered = true;
            debugLog('Weekly timer expired, triggering refresh...');
            setTimeout(() => {
                fetchUsageData();
            }, 3000);
        } else if (weeklyDiff > 0) {
            weeklyResetTriggered = false;
        }
    }

    updateProgressBar(
        elements.weeklyProgress,
        elements.weeklyPercentage,
        weeklyUtilization,
        true
    );

    updateTimer(
        elements.weeklyTimer,
        elements.weeklyTimeText,
        weeklyResetsAt,
        7 * 24 * 60 // 7 days in minutes
    );
    elements.weeklyResetsAt.textContent = formatResetsAt(weeklyResetsAt, true, timeFormat, weeklyDateFormat);
    elements.weeklyResetsAt.style.opacity = weeklyResetsAt ? '1' : '0.4';
}

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        refreshTimers();
        refreshExtraTimers(); // pinned scoped rows tick even when collapsed
    }, 30000);
}

// Update progress bar
function updateProgressBar(progressElement, percentageElement, value, isWeekly = false) {
    const percentage = Math.min(Math.max(value, 0), 100);

    progressElement.style.width = `${percentage}%`;
    percentageElement.textContent = `${Math.round(percentage)}%`;

    progressElement.classList.remove('warning', 'danger');
    if (percentage >= dangerThreshold) {
        progressElement.classList.add('danger');
    } else if (percentage >= warnThreshold) {
        progressElement.classList.add('warning');
    }
}

// Format reset date for the "Resets At" column
// Session: shows time like "3:59 PM" or "15:59"
// Weekly: shows date like "Mar 13", "Fri Mar 13", or "Fri Mar 13 3:59 PM"
function formatResetsAt(resetsAt, isWeekly, timeFormat, weeklyDateFormat) {
    if (!resetsAt) return '—';
    const date = new Date(resetsAt);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const formatTime = (d) => {
        if (timeFormat === '24h') {
            return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        } else {
            let hours = d.getHours();
            const minutes = d.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            return `${hours}:${minutes} ${ampm}`;
        }
    };

    if (isWeekly) {
        const dayStr = days[date.getDay()];
        const monthStr = months[date.getMonth()];
        const dayNum = date.getDate();
        const fmt = weeklyDateFormat || 'date';
        if (fmt === 'date-day') return `${dayStr} ${monthStr} ${dayNum}`;
        if (fmt === 'date-day-time') return `${dayStr} ${monthStr} ${dayNum} ${formatTime(date)}`;
        return `${monthStr} ${dayNum}`; // default: 'date'
    } else {
        return formatTime(date);
    }
}

// A whimsical gold sparkle burst around an elapsed ring — fired when its
// window completes, as if an unseen Tinkerbell tapped it with her wand
function sparkleRing(timerElement) {
    if (document.visibilityState !== 'visible') return; // only when in view
    if (document.body.classList.contains('no-pizazz')) return; // clown's in jail
    const anchor = timerElement.closest('.usage-elapsed-group') || timerElement.parentElement;
    if (!anchor || anchor.querySelector('.sparkle-burst')) return;
    anchor.style.position = 'relative';

    const burst = document.createElement('div');
    burst.className = 'sparkle-burst';
    const glyphs = ['✦', '✧', '✨', '⋆', '✦'];
    const colors = ['#ffd700', '#fff3b0', '#ffe066', '#ffffff', '#ffec99'];
    // A window reset is a rare event — make the burst lavish: double the
    // sparkles, born all around the ring's edge, flying further out
    const count = 28;
    const ringRadius = 10;
    for (let i = 0; i < count; i++) {
        const s = document.createElement('span');
        s.className = 'sparkle';
        s.textContent = glyphs[i % glyphs.length];
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const dist = ringRadius + 12 + Math.random() * 24;
        s.style.setProperty('--sx', `${(Math.cos(angle) * ringRadius).toFixed(1)}px`);
        s.style.setProperty('--sy', `${(Math.sin(angle) * ringRadius).toFixed(1)}px`);
        s.style.setProperty('--dx', `${(Math.cos(angle) * dist).toFixed(1)}px`);
        s.style.setProperty('--dy', `${(Math.sin(angle) * dist).toFixed(1)}px`);
        s.style.color = colors[i % colors.length];
        s.style.animationDelay = `${(Math.random() * 0.45).toFixed(2)}s`;
        s.style.fontSize = `${Math.round(5 + Math.random() * 6)}px`;
        burst.appendChild(s);
    }
    anchor.appendChild(burst);
    setTimeout(() => burst.remove(), 1900);
}

// Swap the psychic between idle (staring) and trance (beaming) states
function applyPsychicState() {
    if (!elements.psychicBtn) return;
    elements.psychicBtn.classList.toggle('on', projectionsVisible);
    elements.psychicImg.src = projectionsVisible
        ? '../../assets/psychic-on.png'
        : '../../assets/psychic-idle.png';
    elements.psychicBtn.title = projectionsVisible
        ? 'Forecast projections: ON — the psychic sees your future burn'
        : 'Forecast projections: OFF — the psychic awaits your command';
}

// Update circular timer
function updateTimer(timerElement, textElement, resetsAt, totalMinutes) {
    if (!resetsAt) {
        textElement.textContent = 'Not started';
        textElement.style.opacity = '0.4';
        textElement.style.fontSize = '10px';
        textElement.title = 'Starts when a message is sent';
        timerElement.style.strokeDashoffset = 63;
        timerElement.style.stroke = '';
        return;
    }

    // Clear the greyed out styling when timer is active
    textElement.style.opacity = '1';
    textElement.style.fontSize = '';
    textElement.title = '';

    // A genuinely NEW window (reset time jumped forward) — sparkle once.
    // Strict inequality is not enough: the API stamps resets_at with
    // sub-second jitter on every response, so require a real forward jump.
    const prevResets = Date.parse(timerElement.dataset.lastResets || '');
    const curResets = Date.parse(resetsAt);
    if (!isNaN(prevResets) && !isNaN(curResets) && curResets - prevResets > 60000) {
        sparkleRing(timerElement);
    }
    timerElement.dataset.lastResets = resetsAt;

    const resetDate = new Date(resetsAt);
    const now = new Date();
    const diff = resetDate - now;

    if (diff <= 0) {
        textElement.textContent = 'Resetting...';
        timerElement.style.strokeDashoffset = 0;
        timerElement.style.stroke = 'hsl(142, 70%, 47%)'; // full green — reset imminent
        // The circle just completed — one wand-tap per window. Tolerant
        // dedupe: resets_at jitters sub-second between responses.
        const sparkled = Date.parse(timerElement.dataset.sparkledFor || '');
        if (isNaN(sparkled) || Math.abs(curResets - sparkled) > 60000) {
            timerElement.dataset.sparkledFor = resetsAt;
            sparkleRing(timerElement);
        }
        return;
    }

    // Calculate remaining time
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    // const seconds = Math.floor((diff % (1000 * 60)) / 1000); // Optional seconds

    // Format time display
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        textElement.textContent = `${days}d ${remainingHours}h`;
    } else if (hours > 0) {
        textElement.textContent = `${hours}h ${minutes}m`;
    } else {
        textElement.textContent = `${minutes}m`;
    }

    // Calculate progress (elapsed percentage)
    const totalMs = totalMinutes * 60 * 1000;
    const elapsedMs = totalMs - diff;
    const elapsedPercentage = (elapsedMs / totalMs) * 100;

    // Update circle (63 is ~2*pi*10)
    const circumference = 63;
    const offset = circumference - (elapsedPercentage / 100) * circumference;
    timerElement.style.strokeDashoffset = offset;

    // Colour brightens toward green as the window nears its reset — elapsed
    // time is GOOD news (reset means fresh usage), so no red alarm here.
    // Slate → teal → green as the circle closes.
    const f = Math.min(Math.max(elapsedPercentage / 100, 0), 1);
    const hue = 222 - (222 - 142) * f;
    const sat = 12 + (70 - 12) * f;
    const light = 55 - (55 - 47) * f;
    timerElement.classList.remove('warning', 'danger');
    timerElement.style.stroke = `hsl(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`;

    // At very narrow widths CSS swaps this text for a remaining-time ring —
    // feed it the fraction and colour, and keep the words in the tooltip
    const remFrac = Math.min(Math.max(diff / totalMs, 0), 1);
    textElement.style.setProperty('--rem-deg', `${Math.round(remFrac * 360)}deg`);
    textElement.style.setProperty('--rem-col', `hsl(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`);
    textElement.title = `Resets in ${textElement.textContent}`;
}

// UI State Management
function showLoginRequired() {
    elements.loadingContainer.style.display = 'none';
    elements.loginContainer.style.display = 'flex';
    elements.noUsageContainer.style.display = 'none';
    elements.mainContent.style.display = 'none';
    // Reset to step 1
    elements.loginStep1.style.display = 'flex';
    elements.loginStep2.style.display = 'none';
    elements.sessionKeyError.textContent = '';
    elements.sessionKeyInput.value = '';
    // Close any open overlays
    elements.settingsOverlay.style.display = 'none';
    elements.compactSettingsOverlay.style.display = 'none';
    // Hide header buttons during login
    elements.settingsBtn.style.display = 'none';
    elements.refreshBtn.style.display = 'none';
    elements.graphBtn.style.display = 'none';
    stopAutoUpdate();
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    // Reset fetch guard so it can't get permanently stuck across login/logout
    isFetching = false;
    // Reset alert state so a new session doesn't inherit suppressed alerts
    isFirstDataLoad = true;
    alertFired.session_warn = false;
    alertFired.session_danger = false;
    alertFired.weekly_warn = false;
    alertFired.weekly_danger = false;
    // Resize window to fit login content — without this the window stays at
    // the default 155px widget height and the "Log in"/"Manual" buttons are
    // clipped off-screen and unreachable on a frameless, non-resizable window.
    window.electronAPI.resizeWindow(360);
}

function showMainContent() {
    elements.loadingContainer.style.display = 'none';
    elements.loginContainer.style.display = 'none';
    elements.noUsageContainer.style.display = 'none';
    // Respect compact mode — don't force mainContent visible if we're in compact
    if (!isCompactMode) {
        elements.mainContent.style.display = 'block';
    }
    elements.compactContent.style.display = isCompactMode ? 'flex' : 'none';
    // Always show collapse chevron here — applyCompactMode hides it when needed
    if (elements.compactCollapseBtn) {
        elements.compactCollapseBtn.style.display = isCompactMode ? 'none' : 'flex';
    }
    // Restore header buttons after login - but respect compact mode for graph button
    elements.settingsBtn.style.display = 'flex';
    elements.refreshBtn.style.display = 'flex';
    elements.graphBtn.style.display = isCompactMode ? 'none' : 'flex';
}

// Auto-update management
function startAutoUpdate() {
    stopAutoUpdate();
    const settings = window._cachedSettings || {};
    const intervalSecs = parseInt(settings.refreshInterval) || 300;
    updateInterval = setInterval(async () => {
        if (elements.refreshBtn) elements.refreshBtn.classList.add('spinning');
        await fetchUsageData();
        if (elements.refreshBtn) elements.refreshBtn.classList.remove('spinning');
    }, intervalSecs * 1000);
}

function stopAutoUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

async function loadChart() {
    const history = await window.electronAPI.getUsageHistory();
    if (!history.length) return;
    renderChart(history);
}

function renderChart(history) {
    if (usageChart) usageChart.destroy();

    const showSonnet = isExpanded && !!latestUsageData?.seven_day_sonnet;
    const showOpus = isExpanded && !!latestUsageData?.seven_day_opus;
    const showCowork = isExpanded && !!latestUsageData?.seven_day_cowork;
    const showDesign = isExpanded && !!latestUsageData?.seven_day_omelette;
    const showOAuthApps = isExpanded && !!latestUsageData?.seven_day_oauth_apps;
    const showExtraUsage = isExpanded && !!latestUsageData?.extra_usage;
    // Scoped weekly series (e.g. Fable) recorded by main.js under entry.scoped.
    // Not gated on isExpanded — the scoped bar is pinned to the main view.
    const scopedKeys = [];
    {
        const seen = new Set();
        for (const entry of history) {
            for (const key of Object.keys(entry.scoped || {})) {
                if (!seen.has(key)) { seen.add(key); scopedKeys.push(key); }
            }
        }
    }
    const allValues = history.flatMap((entry) => {
        const values = [entry.session, entry.weekly];
        if (showSonnet) values.push(entry.sonnet || 0);
        if (showOpus) values.push(entry.opus || 0);
        if (showCowork) values.push(entry.cowork || 0);
        if (showDesign) values.push(entry.design || 0);
        if (showOAuthApps) values.push(entry.oauthApps || 0);
        if (showExtraUsage) values.push(entry.extraUsage || 0);
        for (const key of scopedKeys) values.push(entry.scoped?.[key] || 0);
        return values;
    });
    const yMax = Math.max(10, Math.ceil(Math.max(...allValues) / 10) * 10);

    const datasets = [
        {
            label: 'Session',
            data: history.map((entry) => ({ x: entry.timestamp, y: entry.session })),
            borderColor: '#8b5cf6',
            backgroundColor: 'transparent',
            borderWidth: 2,
            stepped: true,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHitRadius: 10
        },
        {
            label: 'Weekly',
            data: history.map((entry) => ({ x: entry.timestamp, y: entry.weekly })),
            borderColor: '#3b82f6',
            backgroundColor: 'transparent',
            borderWidth: 2,
            stepped: true,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHitRadius: 10
        }
    ];

    if (showSonnet) {
        const sonnetData = history.map((entry) => entry.sonnet || 0);
        if (sonnetData.some((value) => value > 0)) {
            datasets.push({
                label: 'Sonnet',
                data: history.map((entry) => ({ x: entry.timestamp, y: entry.sonnet || 0 })),
                borderColor: '#f43f5e',
                backgroundColor: 'transparent',
                borderWidth: 2,
                stepped: true,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 10
            });
        }
    }

    if (showOpus) {
        const opusData = history.map((entry) => entry.opus || 0);
        if (opusData.some((value) => value > 0)) {
            datasets.push({
                label: 'Opus',
                data: history.map((entry) => ({ x: entry.timestamp, y: entry.opus || 0 })),
                borderColor: '#f59e0b',
                backgroundColor: 'transparent',
                borderWidth: 2,
                stepped: true,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 10
            });
        }
    }

    if (showCowork) {
        const coworkData = history.map((entry) => entry.cowork || 0);
        if (coworkData.some((value) => value > 0)) {
            datasets.push({
                label: 'Cowork',
                data: history.map((entry) => ({ x: entry.timestamp, y: entry.cowork || 0 })),
                borderColor: '#06b6d4',
                backgroundColor: 'transparent',
                borderWidth: 2,
                stepped: true,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 10
            });
        }
    }

    if (showDesign) {
        const designData = history.map((entry) => entry.design || 0);
        if (designData.some((value) => value > 0)) {
            datasets.push({
                label: 'Design',
                data: history.map((entry) => ({ x: entry.timestamp, y: entry.design || 0 })),
                borderColor: '#92400e',
                backgroundColor: 'transparent',
                borderWidth: 2,
                stepped: true,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 10
            });
        }
    }

    if (showOAuthApps) {
        const oauthAppsData = history.map((entry) => entry.oauthApps || 0);
        if (oauthAppsData.some((value) => value > 0)) {
            datasets.push({
                label: 'OAuth Apps',
                data: history.map((entry) => ({ x: entry.timestamp, y: entry.oauthApps || 0 })),
                borderColor: '#f97316',
                backgroundColor: 'transparent',
                borderWidth: 2,
                stepped: true,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 10
            });
        }
    }

    if (showExtraUsage) {
        const extraUsageData = history.map((entry) => entry.extraUsage || 0);
        if (extraUsageData.some((value) => value > 0)) {
            datasets.push({
            label: 'Extra Usage',
            data: history.map((entry) => ({ x: entry.timestamp, y: entry.extraUsage || 0 })),
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            borderWidth: 2,
            stepped: true,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHitRadius: 10
            });
        }
    }

    // Dynamic series for scoped weekly limits (e.g. Fable), matching the
    // per-model rows built by normalizeUsageData()
    const SCOPED_CHART_COLORS = { fable: '#d946ef' };
    const SCOPED_FALLBACK_COLORS = ['#84cc16', '#14b8a6', '#a855f7', '#64748b'];
    let scopedColorIndex = 0;
    for (const key of scopedKeys) {
        const scopedData = history.map((entry) => entry.scoped?.[key] || 0);
        if (!scopedData.some((value) => value > 0)) continue;
        const label = key.split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        const borderColor = SCOPED_CHART_COLORS[key]
            || SCOPED_FALLBACK_COLORS[scopedColorIndex++ % SCOPED_FALLBACK_COLORS.length];
        datasets.push({
            label,
            data: history.map((entry) => ({ x: entry.timestamp, y: entry.scoped?.[key] || 0 })),
            borderColor,
            backgroundColor: 'transparent',
            borderWidth: 2,
            stepped: true,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHitRadius: 10
        });
    }

    // Burn-rate projections: dotted line from the newest sample to the
    // forecast 100% crossing, plus a grey marker at the weekly reset — the
    // visual race between "when I max out" and "when the window resets".
    const lastEntry = history[history.length - 1];
    let chartXMax = lastEntry.timestamp;
    const forecasts = latestUsageData?.forecasts || {};
    const weeklyResetMs = latestUsageData?.seven_day?.resets_at
        ? new Date(latestUsageData.seven_day.resets_at).getTime() : null;
    const projections = [];
    const addProjection = (label, color, lastVal, etaIso, resetMs) => {
        if (!etaIso || lastVal == null) return;
        const eta = new Date(etaIso).getTime();
        if (eta <= lastEntry.timestamp) return;
        if (resetMs && eta > resetMs) return; // window resets first — no cap hit
        projections.push({
            label: `${label} → 100%`,
            data: [{ x: lastEntry.timestamp, y: lastVal }, { x: eta, y: 100 }],
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHitRadius: 10
        });
        chartXMax = Math.max(chartXMax, eta);
    };
    if (projectionsVisible) {
        addProjection('Weekly', '#3b82f6', lastEntry.weekly, forecasts.weekly, weeklyResetMs);
        const SCOPED_CHART_COLORS = { fable: '#d946ef' };
        for (const key of scopedKeys) {
            const scopedResetIso = latestUsageData?.['seven_day_scoped_' + key]?.resets_at;
            addProjection(
                key.charAt(0).toUpperCase() + key.slice(1),
                SCOPED_CHART_COLORS[key] || '#84cc16',
                lastEntry.scoped?.[key],
                forecasts.scoped?.[key],
                scopedResetIso ? new Date(scopedResetIso).getTime() : null
            );
        }
    }
    if (projections.length) {
        datasets.push(...projections);
        // Reset marker, if the weekly reset falls inside the projected span
        if (weeklyResetMs && weeklyResetMs > lastEntry.timestamp && weeklyResetMs <= chartXMax * 1.02) {
            chartXMax = Math.max(chartXMax, weeklyResetMs);
            datasets.push({
                label: 'Weekly reset',
                data: [{ x: weeklyResetMs, y: 0 }, { x: weeklyResetMs, y: 100 }],
                borderColor: '#9ca3af',
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [2, 3],
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 10
            });
        }
        chartXMax = Math.min(chartXMax, Date.now() + 3 * 24 * 60 * 60 * 1000);
    }

    const firstDayMidnight = new Date(history[0].timestamp);
    firstDayMidnight.setHours(0, 0, 0, 0);

    usageChart = new Chart(elements.usageChart.getContext('2d'), {
        type: 'line',
        data: { datasets },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'nearest'
            },
            scales: {
                x: {
                    type: 'linear',
                    min: firstDayMidnight.getTime(),
                    max: chartXMax,
                    afterBuildTicks(axis) {
                        const end = chartXMax;
                        const d = new Date(firstDayMidnight.getTime());
                        const ticks = [];
                        while (d.getTime() <= end) {
                            ticks.push({ value: d.getTime() });
                            d.setDate(d.getDate() + 1);
                        }
                        axis.ticks = ticks;
                    },
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0,
                        font: {
                            size: 10
                        },
                        callback(value) {
                            const tf = (window._cachedSettings || {}).timeFormat || '12h';
                            const spanMs = history.length > 1
                                ? history[history.length - 1].timestamp - history[0].timestamp
                                : 0;
                            return formatTimestampTick(value, spanMs, tf);
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    min: 0,
                    max: yMax,
                    ticks: {
                        font: {
                            size: 10
                        },
                        callback: (value) => `${value}%`
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        title(items) {
                            return new Date(items[0].parsed.x).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                            });
                        },
                        label(item) {
                            return `${item.dataset.label}: ${Math.round(item.parsed.y)}%`;
                        }
                    }
                }
            }
        }
    });
}

function formatTimestampTick(timestamp, spanMs, timeFormat) {
    const date = new Date(timestamp);
    const hour12 = (timeFormat || '12h') !== '24h';

    if (spanMs < 12 * 60 * 60 * 1000) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12 });
    }
    if (spanMs < 48 * 60 * 60 * 1000) {
        return date.toLocaleString([], { weekday: 'short', hour: 'numeric', hour12 });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Add spinning animation for refresh button
const style = document.createElement('style');
style.textContent = `
    @keyframes spin-refresh {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    .refresh-btn.spinning svg {
        animation: spin-refresh 1s linear infinite;
    }
`;
document.head.appendChild(style);

// Settings management
let warnThreshold = 75;
let dangerThreshold = 90;

async function loadSettings() {
    const settings = await window.electronAPI.getSettings();
    const isLinux = window.electronAPI.platform === 'linux';
    const isPortable = window.electronAPI.isPortable;
    const autoStartUnsupported = isLinux || isPortable;

    elements.autoStartToggle.checked = autoStartUnsupported ? false : settings.autoStart;
    elements.autoStartToggle.disabled = autoStartUnsupported;
    if (elements.autoStartCol) {
        elements.autoStartCol.classList.toggle('settings-col-disabled', autoStartUnsupported);
    }
    if (elements.autoStartHint) {
        elements.autoStartHint.style.display = autoStartUnsupported ? 'inline' : 'none';
        elements.autoStartHint.textContent = isPortable
            ? 'Not supported in portable mode!'
            : 'Not supported on Linux';
    }
    elements.minimizeToTrayToggle.checked = settings.minimizeToTray;
    elements.alwaysOnTopToggle.checked = settings.alwaysOnTop;
    applySectionStates(settings);
    elements.warnThreshold.value = settings.warnThreshold;
    elements.dangerThreshold.value = settings.dangerThreshold;
    elements.timeFormat.value = settings.timeFormat || '12h';
    elements.weeklyDateFormat.value = settings.weeklyDateFormat || 'date';
    if (elements.refreshInterval) elements.refreshInterval.value = settings.refreshInterval || '300';
    elements.usageAlertsToggle.checked = settings.usageAlerts !== false;
    if (elements.compactModeToggle) elements.compactModeToggle.checked = !!settings.compactMode;
    if (elements.showClaudeCodeToggle) elements.showClaudeCodeToggle.checked = settings.showClaudeCode !== false;

    // Tray colours + critical outline + burn alerts
    const trayColors = settings.trayColors || {};
    const colorDefaults = {
        session: { bg: '#3b82f6', text: '#000000' },
        weekly: { bg: '#3b82f6', text: '#ffffff' },
        fable: { bg: '#ef4444', text: '#000000' },
        codex: { bg: '#10a37f', text: '#ffffff' },
        gemini: { bg: '#f4b400', text: '#000000' }
    };
    for (const [key, ids] of [
        ['session', ['traySessionBg', 'traySessionText']],
        ['weekly', ['trayWeeklyBg', 'trayWeeklyText']],
        ['fable', ['trayFableBg', 'trayFableText']],
        ['codex', ['trayOpenaiBg', 'trayOpenaiText']],
        ['gemini', ['trayGoogleBg', 'trayGoogleText']]
    ]) {
        if (elements[ids[0]]) elements[ids[0]].value = trayColors[key]?.bg || colorDefaults[key].bg;
        if (elements[ids[1]]) elements[ids[1]].value = trayColors[key]?.text || colorDefaults[key].text;
    }
    if (elements.trayOutlineToggle) elements.trayOutlineToggle.checked = settings.trayOutline?.enabled !== false;
    if (elements.trayOutlineColor) elements.trayOutlineColor.value = settings.trayOutline?.color || '#facc15';
    if (elements.burnAlertsToggle) elements.burnAlertsToggle.checked = settings.burnAlerts !== false;
    if (elements.fontColorToggle) elements.fontColorToggle.checked = settings.fontColor?.enabled === true;
    if (elements.fontColorPicker) elements.fontColorPicker.value = settings.fontColor?.color || '#e0e0e0';
    if (elements.webhookToggle) elements.webhookToggle.checked = settings.webhook?.enabled === true;
    if (elements.webhookUrl) elements.webhookUrl.value = settings.webhook?.url || '';
    if (elements.dailyDigestToggle) elements.dailyDigestToggle.checked = settings.dailyDigest !== false;
    if (elements.showCodexToggle) elements.showCodexToggle.checked = settings.showCodex !== false;
    if (elements.showCodexCliToggle) elements.showCodexCliToggle.checked = settings.showCodexCli !== false;
    if (elements.showGeminiToggle) elements.showGeminiToggle.checked = settings.showGemini !== false;
    if (elements.showGeminiCliToggle) elements.showGeminiCliToggle.checked = settings.showGeminiCli !== false;
    if (elements.openaiLoginStatus) {
        const cxNow = latestUsageData && latestUsageData.codex;
        const cxConn = !!(cxNow && cxNow.connected);
        elements.openaiLoginStatus.textContent = cxConn ? (cxNow.email || 'Connected')
            : (cxNow ? 'Not connected (using CLI login)' : 'Not connected');
        elements.disconnectOpenaiBtn.style.display = cxConn ? '' : 'none';
        elements.settingsConnectOpenaiBtn.style.display = cxConn ? 'none' : '';
    }
    if (elements.googleLoginStatus) {
        const gmNow = latestUsageData && latestUsageData.gemini;
        const gmConn = !!(gmNow && gmNow.connected);
        elements.googleLoginStatus.textContent = gmConn ? (gmNow.email || 'Connected')
            : (gmNow ? 'Not connected (using CLI login)' : 'Not connected');
        elements.disconnectGoogleBtn.style.display = gmConn ? '' : 'none';
        elements.settingsConnectGoogleBtn.style.display = gmConn ? 'none' : '';
    }

    // Populate org selector if user has organizations
    if (credentials.organizations && credentials.organizations.length > 0) {
        populateOrgSelector(credentials.organizations, credentials.organizationId);
    }

    warnThreshold = settings.warnThreshold;
    dangerThreshold = settings.dangerThreshold;

    elements.themeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });

    applyTheme(settings.theme);
    if (window.electronAPI.platform === 'darwin') {
        document.getElementById('trayLabel').textContent = 'Hide from Dock';
    }
}

async function saveSettings() {
    const activeThemeBtn = document.querySelector('.theme-btn.active');
    const warn = parseInt(elements.warnThreshold.value) || 75;
    const danger = parseInt(elements.dangerThreshold.value) || 90;

    warnThreshold = warn;
    dangerThreshold = danger;

    // Apply compact mode change first, then include in saved settings
    const compactToggleValue = elements.compactModeToggle.checked;
    if (compactToggleValue !== isCompactMode) {
        applyCompactMode(compactToggleValue);
    }

    const settings = {
        autoStart: (window.electronAPI.platform === 'linux' || window.electronAPI.isPortable) ? false : elements.autoStartToggle.checked,
        minimizeToTray: elements.minimizeToTrayToggle.checked,
        alwaysOnTop: elements.alwaysOnTopToggle.checked,
        showTrayStats: elements.eyeAnthropic.classList.contains('on'),
        trayOpenai: elements.eyeOpenai.classList.contains('on'),
        trayGoogle: elements.eyeGoogle.classList.contains('on'),
        sectionCollapsed: window._cachedSettings?.sectionCollapsed || {},
        theme: activeThemeBtn ? activeThemeBtn.dataset.theme : 'dark',
        warnThreshold: warn,
        dangerThreshold: danger,
        timeFormat: elements.timeFormat.value || '12h',
        weeklyDateFormat: elements.weeklyDateFormat.value || 'date',
        refreshInterval: elements.refreshInterval ? (elements.refreshInterval.value || '300') : '300',
        usageAlerts: elements.usageAlertsToggle.checked,
        compactMode: isCompactMode,
        graphVisible: graphVisible,
        expandedOpen: isExpanded,
        showClaudeCode: elements.showClaudeCodeToggle ? elements.showClaudeCodeToggle.checked : true,
        trayColors: {
            session: { bg: elements.traySessionBg.value, text: elements.traySessionText.value },
            weekly: { bg: elements.trayWeeklyBg.value, text: elements.trayWeeklyText.value },
            fable: { bg: elements.trayFableBg.value, text: elements.trayFableText.value },
            codex: { bg: elements.trayOpenaiBg.value, text: elements.trayOpenaiText.value },
            gemini: { bg: elements.trayGoogleBg.value, text: elements.trayGoogleText.value }
        },
        trayOutline: {
            enabled: elements.trayOutlineToggle.checked,
            color: elements.trayOutlineColor.value
        },
        burnAlerts: elements.burnAlertsToggle.checked,
        fontColor: {
            enabled: elements.fontColorToggle.checked,
            color: elements.fontColorPicker.value
        },
        webhook: {
            enabled: elements.webhookToggle.checked,
            url: elements.webhookUrl.value.trim()
        },
        dailyDigest: elements.dailyDigestToggle.checked,
        showCodex: elements.showCodexToggle.checked,
        showCodexCli: elements.showCodexCliToggle ? elements.showCodexCliToggle.checked : true,
        showGemini: elements.showGeminiToggle ? elements.showGeminiToggle.checked : true,
        showGeminiCli: elements.showGeminiCliToggle ? elements.showGeminiCliToggle.checked : true,
        openaiExtrasOpen: isOpenaiExtrasOpen,
        projectionsOn: projectionsVisible
    };
    await window.electronAPI.saveSettings(settings);
    window._cachedSettings = settings;
    applyTheme(settings.theme);
    applyFontColor(settings);
    if (window.electronAPI.platform === 'darwin') {
        document.getElementById('trayLabel').textContent = 'Hide from Dock';
    }

    // Re-render resets-at values immediately with new format
    if (latestUsageData) {
        refreshTimers();
        // Rebuild extra rows to apply new threshold colors
        if (isExpanded) {
            buildExtraRows(latestUsageData);
            refreshExtraTimers();
        }
    }
    // Restart auto-update with new interval if it changed
    startAutoUpdate();
}

function applyTheme(theme) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.body.classList.toggle('theme-light', !useDark);
}

// Apply (or clear) the custom widget font colour from settings
function applyFontColor(settings) {
    const fc = settings?.fontColor || {};
    const enabled = fc.enabled === true && fc.color;
    document.body.classList.toggle('custom-font', !!enabled);
    if (enabled) {
        document.documentElement.style.setProperty('--custom-font', fc.color);
    }
}

// Update check
async function checkForUpdate() {
    try {
        const result = await window.electronAPI.checkForUpdate();
        if (!result.hasUpdate) return;

        const version = result.version;

        // Show banner and expand window to compensate
        elements.updateBannerText.textContent = `▲  Version ${version} available — click to download`;
        elements.updateBanner.style.display = 'flex';
        resizeWidget(true);

        // Populate settings panel link if already visible
        if (elements.settingsUpdateLink) {
            elements.settingsUpdateLink.textContent = `→ v${version} available`;
            elements.settingsUpdateLink.style.display = 'inline';
        }

        debugLog(`Update available: v${version}`);
    } catch (e) {
        debugLog('Update check failed silently', e);
    }
}

// Re-measure the window after a restore from minimized (measurements read ~0
// while minimized, so any resize during that state was skipped)
window.addEventListener('focus', () => {
    if (!isCompactMode && elements.mainContent.style.display !== 'none') resizeWidget();
});

// Start the application
init();
window.addEventListener('beforeunload', () => {
    stopAutoUpdate();
    if (countdownInterval) clearInterval(countdownInterval);
});
