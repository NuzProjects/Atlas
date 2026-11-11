document.addEventListener('pointerdown', () => document.documentElement.classList.add('atlas-pointer-input'), true);
document.addEventListener(
  'keydown',
  event => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey)
      document.documentElement.classList.remove('atlas-pointer-input');
  },
  true
);
document.title = 'Atlas';

const defaultLocalWisp = window.__atlasConfig.defaultWisp || atlasAppOrigin().replace(/^http/, 'ws') + '/wisp/';
if (!localStorage.getItem('atlas_wisp_default_version')) {
  localStorage.removeItem('wisp_server_url');
  localStorage.setItem('atlas_wisp_default_version', 'atlas-self-hosted-1');
}
let activeWss = localStorage.getItem('wisp_server_url') || defaultLocalWisp;

const homeView = document.getElementById('homeView');
const browserView = document.getElementById('browserView');
const bottomBar = document.getElementById('bottomBar');
const homeSearchInput = document.getElementById('homeSearchInput');
const viewportContainer = document.getElementById('viewportContainer');
const bottomAddressBar = document.getElementById('bottomAddressBar');
const tabList = document.getElementById('tabList');
const newTabBtn = document.getElementById('newTabBtn');
const bottomHomeBtn = document.getElementById('bottomHomeBtn');
const navBack = document.getElementById('navBack');
const navForward = document.getElementById('navForward');
const navReload = document.getElementById('navReload');
const loaderOverlay = document.getElementById('loaderOverlay');
const newTabScreen = document.getElementById('newTabScreen');
const newTabSearchInput = document.getElementById('newTabSearchInput');
const SEARCH_ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  brave: { name: 'Brave', url: 'https://search.brave.com/search?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  yahoo: { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=' },
};

function getSearchEngineId() {
  const saved = localStorage.getItem('setting_search_engine');
  return Object.hasOwn(SEARCH_ENGINES, saved) ? saved : 'duckduckgo';
}

function syncSearchEngine() {
  const id = getSearchEngineId();
  const engine = SEARCH_ENGINES[id];
  [homeSearchInput, newTabSearchInput].forEach(input => {
    input.placeholder = `Search ${engine.name} or type a URL`;
  });
  ['homeSearchEngine', 'newTabSearchEngine', 'settingSearchEngine'].forEach(controlId => {
    const control = document.getElementById(controlId);
    if (control) {
      control.value = id;
      control._atlasRefresh?.();
    }
  });
}

function setSearchEngine(id) {
  if (!Object.hasOwn(SEARCH_ENGINES, id)) return;
  localStorage.setItem('setting_search_engine', id);
  syncSearchEngine();
}

['homeSearchEngine', 'newTabSearchEngine'].forEach(id => {
  document.getElementById(id).addEventListener('change', e => setSearchEngine(e.target.value));
});
syncSearchEngine();
const homeShortcutsRow = document.getElementById('homeShortcutsRow');
const newTabShortcutsRow = document.getElementById('newTabShortcutsRow');
const addShortcutModal = document.getElementById('addShortcutModal');
const closeShortcutModalBtn = document.getElementById('closeShortcutModalBtn');
const cancelShortcutModalBtn = document.getElementById('cancelShortcutModalBtn');
const confirmAddShortcutBtn = document.getElementById('confirmAddShortcutBtn');
const shortcutNameInput = document.getElementById('shortcutNameInput');
const shortcutUrlInput = document.getElementById('shortcutUrlInput');
const hideBottomBarBtn = document.getElementById('hideBottomBarBtn');
const revealBottomBarBtn = document.getElementById('revealBottomBarBtn');

const siteInfoBtn = document.getElementById('siteInfoBtn');
const bookmarkBtn = document.getElementById('bookmarkBtn');
const siteInfoPopup = document.getElementById('siteInfoPopup');
const siteInfoHeader = document.getElementById('siteInfoHeader');
const siteInfoBackBtn = document.getElementById('siteInfoBackBtn');
const siteInfoTitleMain = document.getElementById('siteInfoTitleMain');
const siteInfoDomain = document.getElementById('siteInfoDomain');
const siteInfoMenu = document.querySelector('.site-info-menu');
const siteInfoCookiesSubview = document.getElementById('siteInfoCookiesSubview');
const siteInfoSecurityRow = document.getElementById('siteInfoSecurityRow');
const siteInfoSecurityDesc = document.getElementById('siteInfoSecurityDesc');
const siteInfoFingerprintRow = document.getElementById('siteInfoFingerprintRow');
const siteInfoFingerprintDesc = document.getElementById('siteInfoFingerprintDesc');
const siteInfoCookiesRow = document.getElementById('siteInfoCookiesRow');
const manageSiteDataRow = document.getElementById('manageSiteDataRow');
const openOnDeviceDataBtn = document.getElementById('openOnDeviceDataBtn');
const siteInfoOnDeviceSubview = document.getElementById('siteInfoOnDeviceSubview');
const onDeviceList = document.getElementById('onDeviceList');
const thirdPartyCookieToggle = document.getElementById('thirdPartyCookieToggle');
const thirdPartyCookieStatus = document.getElementById('thirdPartyCookieStatus');
const siteDataAllowedText = document.getElementById('siteDataAllowedText');

function isNewTabUrl(url) {
  if (!url) return true;
  const u = url.trim().toLowerCase();
  return (
    u === 'atlas://new' ||
    u === 'atlas://new/' ||
    u === 'atlas://search' ||
    u === 'atlas://search/' ||
    u === '/new-tab' ||
    u === 'site://newtab' ||
    u === '/newtab' ||
    u === 'site://new' ||
    u === 'site://new-tab' ||
    u === 'new-tab' ||
    u === 'newtab' ||
    u === 'about:blank' ||
    u === 'about:newtab'
  );
}

function atlasInternalPage(url) {
  if (isNewTabUrl(url)) return /^atlas:\/\/search\/?$/i.test((url || '').trim()) ? 'search' : 'new';
  const match = /^(?:atlas:\/\/)(history)\/?$/i.exec((url || '').trim());
  return match ? match[1].toLowerCase() : null;
}

function getHostname(rawUrl) {
  if (!rawUrl || atlasInternalPage(rawUrl)) return '';
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function officialAtlasSite(rawUrl, exact = false) {
  try {
    const url = new URL(rawUrl);
    return (window.ATLAS_OFFICIAL_SITES || []).find(site => {
      const candidate = new URL(site.url);
      return (
        candidate.hostname.replace(/^www\./, '') === url.hostname.replace(/^www\./, '') &&
        (!exact || (candidate.pathname.replace(/\/$/, '') === url.pathname.replace(/\/$/, '') && !url.search))
      );
    });
  } catch {
    return null;
  }
}
function getRealSiteTitle(rawUrl) {
  const internal = atlasInternalPage(rawUrl);
  if (internal) return { new: 'New Tab', search: 'Search', history: 'History' }[internal];
  if (!rawUrl || isNewTabUrl(rawUrl)) return 'New Tab';
  const host = getHostname(rawUrl);
  if (!host) return 'New Tab';
  atlasPrimeMetadataCache();
  return atlasSiteTitles.get(rawUrl) || officialAtlasSite(rawUrl, true)?.title || host;
}

const atlasSiteFavicons = new Map();
const atlasSiteTitles = new Map();
let atlasMetadataCacheReady = false;

function atlasPrimeMetadataCache() {
  if (atlasMetadataCacheReady || typeof atlasHistoryEntries !== 'function') return;
  atlasMetadataCacheReady = true;
  for (const entry of atlasHistoryEntries()) {
    if (entry.title && !atlasSiteTitles.has(entry.url)) atlasSiteTitles.set(entry.url, entry.title);
    if (entry.favicon && !atlasSiteFavicons.has(entry.url)) atlasSiteFavicons.set(entry.url, entry.favicon);
  }
}
const atlasEncryptedFavicons = new Map();

function getFaviconUrl(rawUrl) {
  const internal = atlasInternalPage(rawUrl);
  if (internal === 'history') return '/assets/atlas-history.svg';
  if (internal) return '/assets/atlas.png';
  if (!rawUrl || isNewTabUrl(rawUrl)) {
    return '';
  }
  try {
    atlasPrimeMetadataCache();
    const actual = atlasSiteFavicons.get(rawUrl);
    if (actual?.startsWith('data:image/')) return actual;
    if (actual) {
      const key = actual + '|' + activeWss;
      if (!atlasEncryptedFavicons.has(key)) {
        if (atlasEncryptedFavicons.size >= 256)
          atlasEncryptedFavicons.delete(atlasEncryptedFavicons.keys().next().value);
        atlasEncryptedFavicons.set(key, atlasProxyAddress(actual, false, true, true, activeWss));
      }
      return atlasEncryptedFavicons.get(key);
    }
    const host = getHostname(rawUrl);
    if (!host) return '';
    return officialAtlasSite(rawUrl)?.icon || `/api/favicon?domain=${encodeURIComponent(host)}`;
  } catch {
    return '';
  }
}

const MAX_TABS = 10;
let tabs = [];
const atlasClosedTabs = [];
let activeTabId = null;

function updateNewTabBtnState() {
  if (!newTabBtn) return;
  if (tabs.length >= MAX_TABS) {
    newTabBtn.disabled = true;
    newTabBtn.classList.add('disabled');
  } else {
    newTabBtn.disabled = false;
    newTabBtn.classList.remove('disabled');
  }
}

let isDraggingTab = false;

function renderTabs() {
  if (isDraggingTab) return;
  const previousItems = new Map([...tabList.querySelectorAll('.tab-item')].map(item => [item.dataset.tabId, item]));
  tabs.forEach((tab, tabIndex) => {
    const item = previousItems.get(tab.id) || document.createElement('div');
    previousItems.delete(tab.id);
    item.classList.add('tab-item');
    item.classList.toggle('active', tab.id === activeTabId);
    item.classList.toggle('opening', Boolean(tab.isJustOpened));
    item.classList.toggle('closing', Boolean(tab.isClosing));
    item.setAttribute('data-tab-id', tab.id);
    item.oncontextmenu = e => e.preventDefault();
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-label', tab.title || 'New Tab');
    item.setAttribute('aria-selected', String(tab.id === activeTabId));
    item.setAttribute('aria-keyshortcuts', 'Delete');
    item.tabIndex = 0;
    if (tab.iframe) tab.iframe.setAttribute('aria-label', tab.title || 'New Tab');
    item.onkeydown = e => {
      if (e.target !== item) return;
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateTab(tab.id);
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        closeTab(tab.id);
      }
    };

    item.onpointerdown = e => startAtlasTabDrag(e, tab);

    if (tab.isJustOpened && !tab.openingTimer) {
      tab.openingTimer = setTimeout(() => {
        tab.isJustOpened = false;
        item.classList.remove('opening');
        updateTabSizing();
      }, 220);
    }

    const iconSpan = item.querySelector('.tab-icon') || document.createElement('span');
    iconSpan.className = 'tab-icon';

    const faviconUrl = tab.isErrorPage ? null : getFaviconUrl(tab.url);
    if (tab.isErrorPage) {
      iconSpan.innerHTML = '<img class="tab-placeholder-globe" src="/assets/tab-globe.svg" alt="" />';
    } else if (faviconUrl && !tab.isNewTab && iconSpan.dataset.source !== faviconUrl) {
      iconSpan.innerHTML = `
      <img class="tab-placeholder-globe" src="/assets/tab-globe.svg" alt="" />
      <img class="tab-favicon-img tab-favicon-pending" alt="" />
    `;
      const image = iconSpan.querySelector('.tab-favicon-img');
      const globe = iconSpan.querySelector('.tab-placeholder-globe');
      image.onload = () => {
        image.classList.remove('tab-favicon-pending');
        globe.hidden = true;
      };
      image.onerror = () => {
        image.onerror = null;
        const fallback =
          officialAtlasSite(tab.url)?.icon || '/api/favicon?domain=' + encodeURIComponent(new URL(tab.url).hostname);
        if (fallback !== faviconUrl) image.src = fallback;
      };
      image.src = faviconUrl;
    } else if (!faviconUrl || tab.isNewTab) {
      iconSpan.innerHTML = `
      ${atlasIcon('globe', 'tab-icon-svg')}
    `;
    }
    iconSpan.dataset.source = faviconUrl;

    const titleSpan = item.querySelector('.tab-title') || document.createElement('span');
    titleSpan.className = 'tab-title';
    if (titleSpan.textContent !== (tab.title || 'New Tab')) titleSpan.textContent = tab.title || 'New Tab';

    const closeBtn = item.querySelector('.tab-close') || document.createElement('div');
    closeBtn.className = 'tab-close';
    closeBtn.setAttribute('aria-hidden', 'true');
    closeBtn.innerHTML = `<svg data-icon="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>`;
    closeBtn.onclick = e => {
      e.stopPropagation();
      closeTab(tab.id);
    };

    if (iconSpan.parentNode !== item) item.replaceChildren(iconSpan, titleSpan, closeBtn);
    if (!item.parentNode) tabList.append(item);
  });
  previousItems.forEach(item => item.remove());
  let previousNode = null;
  tabs.forEach(tab => {
    const item = tabList.querySelector(`.tab-item[data-tab-id="${tab.id}"]`);
    const node = item?.closest('.atlas-tab-pair') || item;
    if (!node || node === previousNode) return;
    const expected = previousNode ? previousNode.nextSibling : tabList.firstChild;
    if (expected !== node) tabList.insertBefore(node, expected);
    previousNode = node;
  });

  tabList.querySelectorAll('.atlas-tab-pair:empty').forEach(group => group.remove());
  if (typeof renderAtlasSplitTabs === 'function') renderAtlasSplitTabs();
  updateTabSizing();
  updateNewTabBtnState();
  if (typeof syncAtlasHistoryTitles === 'function') syncAtlasHistoryTitles();
  if (typeof persistAtlasSession === 'function') persistAtlasSession();
}

function updateTabSizing() {
  if (!tabList) return;

  if (typeof atlasSplitTransition !== 'undefined' && atlasSplitTransition) return;
  const tabElements = tabList.querySelectorAll('.tab-item');
  if (tabElements.length === 0) return;

  tabElements.forEach(el => {
    if (el.classList.contains('opening') || el.classList.contains('closing')) return;
    const width = el.getBoundingClientRect().width;
    if (width > 0) el.classList.toggle('tab-compact', width < 68);
  });
}

window.addEventListener('resize', updateTabSizing);

function createTab(initialUrl = '/new-tab', initialTitle = null, animateOpen = true, makeActive = true) {
  if (tabs.length >= MAX_TABS) {
    updateNewTabBtnState();
    return null;
  }
  const tabId = 'tab_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const isNewTab = isNewTabUrl(initialUrl);
  const targetUrl = isNewTab ? 'atlas://' + atlasInternalPage(initialUrl) : initialUrl;
  const computedTitle = initialTitle || getRealSiteTitle(targetUrl);

  const iframe = document.createElement('iframe');
  iframe.className = 'browser-frame';

  iframe.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-pointer-lock'
  );
  iframe.setAttribute('allow', AtlasSitePermissions.allowFor(targetUrl));
  iframe.setAttribute('allowfullscreen', '');
  iframe.id = 'frame_' + tabId;
  iframe.style.display = 'none';

  iframe.addEventListener('load', () => {
    try {
      if (iframe.contentWindow.location.href === 'about:blank' && iframe.getAttribute('src') !== 'about:blank') return;
    } catch {}
    const loadedTab = tabs.find(t => t.id === tabId);
    if (iframe.contentDocument?.querySelector('meta[name="atlas-content-blocked"]')) iframe.style.visibility = '';
    if (loadedTab && !loadedTab.isNewTab) AtlasContentFilter.watch(iframe, () => atlasBlockSexualContent(loadedTab));
    if (loadedTab?.contentBlocked && !iframe.contentDocument?.querySelector('meta[name="atlas-content-blocked"]'))
      return;
    const engineMetadata = AtlasEngines.metadata(iframe);
    if (loadedTab && engineMetadata) {
      loadedTab.url = engineMetadata.url;
      loadedTab.title = engineMetadata.title || getRealSiteTitle(engineMetadata.url);
      loadedTab.favicon = engineMetadata.icon;
      atlasSiteFavicons.set(loadedTab.url, engineMetadata.icon);
      atlasRememberNavigation(loadedTab, loadedTab.url, loadedTab.navigationLoading);
      loadedTab.navigationLoading = false;
      if (AtlasSitePermissions.apply(iframe, loadedTab.url)) {
        iframe.contentWindow.location.reload();
        return;
      }
    }
    if (loadedTab && !loadedTab.isNewTab)
      AtlasSitePermissions.watch(
        iframe,
        () => loadedTab.url,
        () => reloadAtlasTabWithPermissions(loadedTab)
      );
    if (loadedTab) {
      loadedTab.isLoading = false;
      loadedTab.documentReadyRevision = (loadedTab.documentReadyRevision || 0) + 1;
    }
    if (activeTabId === tabId) hideLoader();
    try {
      const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (loadedTab && doc) loadedTab.isErrorPage = !!doc.querySelector('meta[name="atlas-error-page"]');
      if (doc && doc.title && doc.title.trim()) {
        const currentTab = tabs.find(t => t.id === tabId);
        if (currentTab && !currentTab.isNewTab) {
          currentTab.title = doc.title.trim();
        }
      }
    } catch {}

    try {
      const u = new URL(iframe.contentWindow.location.href);
      const proxiedTarget =
        iframe.contentDocument?.documentElement?.getAttribute('data-atlas-url') || u.searchParams.get('url');
      if (
        u.origin === atlasAppOrigin() &&
        u.pathname === '/atlas-pages.html' &&
        ['history'].includes(u.searchParams.get('page'))
      ) {
        const currentTab = tabs.find(t => t.id === tabId);
        if (currentTab) {
          currentTab.url = 'atlas://' + u.searchParams.get('page');
          if (currentTab.id === activeTabId) {
            bottomAddressBar.value = currentTab.url;
            updateSiteInfo();
          }
        }
      }
      if (proxiedTarget) {
        const currentTab = tabs.find(t => t.id === tabId);
        if (currentTab && !currentTab.isNewTab) {
          atlasRememberNavigation(currentTab, proxiedTarget, currentTab.navigationLoading);
          currentTab.navigationLoading = false;
          currentTab.navigationPreviousDocument = null;
          currentTab.url = proxiedTarget;
          if (currentTab.id === activeTabId) {
            bottomAddressBar.value = proxiedTarget;
            updateBookmarkStar();
            updateSiteInfo();
          }
        }
      }
    } catch {}
    renderTabs();
  });

  viewportContainer.appendChild(iframe);

  const tab = {
    id: tabId,
    title: computedTitle,
    url: targetUrl,
    iframe: iframe,
    isNewTab: isNewTab,
    navigationEntries: isNewTab || /^https?:\/\//i.test(targetUrl) ? [targetUrl] : [],
    navigationIndex: isNewTab || /^https?:\/\//i.test(targetUrl) ? 0 : -1,
    isJustOpened: animateOpen,
  };

  tab.disposeGameAds = AtlasGameAds.watch(iframe, () => tab.blockAds !== false);
  tabs.push(tab);
  if (makeActive) activateTab(tabId);
  else renderTabs();

  if (!isNewTab) {
    navigateTab(tabId, targetUrl);
  }

  return tab;
}

function activateTab(tabId) {
  const changedTab = activeTabId !== tabId;
  const previousWasNewTab =
    tabs.find(tab => tab.id === activeTabId)?.isNewTab && newTabScreen.classList.contains('active');
  activeTabId = tabId;
  const currentTab = tabs.find(t => t.id === tabId);
  if (!currentTab) return;
  if (changedTab) {
    browserView.scrollTop = 0;
    viewportContainer.scrollTop = 0;
    newTabScreen.scrollTop = 0;
  }
  closeAtlasMenu();

  if (currentTab.isLoading) showLoader();
  else hideLoader();

  tabs.forEach(t => {
    if (t.id === tabId) {
      if (t.isNewTab) {
        t.iframe.style.display = 'none';
        t.iframe.classList.remove('active-tab-frame');
        newTabScreen.classList.add('active');
        if (
          (currentTab.animateInternal || (changedTab && !previousWasNewTab)) &&
          (typeof atlasSplitTransition === 'undefined' || !atlasSplitTransition)
        )
          animateAtlasContent(newTabScreen, 'atlas-frame-enter');
        bottomAddressBar.value = t.url;
        newTabScreen.classList.toggle('atlas-search-page', t.url === 'atlas://search');
        newTabScreen.querySelector('.new-tab-title').textContent = t.url === 'atlas://search' ? 'Search' : 'New Tab';
        renderShortcuts();
        setTimeout(() => newTabSearchInput.focus(), 50);
      } else {
        t.iframe.style.display = 'block';
        t.iframe.classList.add('active-tab-frame');
        if (changedTab && (typeof atlasSplitTransition === 'undefined' || !atlasSplitTransition))
          animateAtlasContent(t.iframe, 'atlas-frame-enter');
        newTabScreen.classList.remove('active');
        bottomAddressBar.value = t.url;
        if (bottomBar) bottomBar.style.display = '';
        if (revealBottomBarBtn) revealBottomBarBtn.style.display = '';
        if (viewportContainer) {
          viewportContainer.style.height = '';
          viewportContainer.style.marginBottom = '';
        }
      }
    } else {
      t.iframe.style.display = 'none';
      t.iframe.classList.remove('active-tab-frame');
    }
  });

  if (typeof applyAtlasSplitLayout === 'function') applyAtlasSplitLayout();
  if (changedTab) {
    try {
      currentTab.iframe?.contentWindow?.scrollTo(0, 0);
    } catch {}
  }
  currentTab.animateInternal = false;
  renderTabs();
  updateBookmarkStar();
  updateSiteInfo();

  document.title = 'Atlas';

  refreshBranding();
}

function atlasBlockSexualContent(tab) {
  if (tab.isClosing || tab.contentBlocked) return;
  tab.contentBlocked = true;
  tab.engineGeneration = (tab.engineGeneration || 0) + 1;
  AtlasContentFilter.dispose(tab.iframe);
  try {
    tab.iframe.contentWindow.stop();
  } catch {}
  tab.iframe.style.visibility = 'hidden';
  tab.iframe.src = '/atlas-blocked.html';
  tab.isLoading = false;
  tab.navigationLoading = false;
  tab.isErrorPage = true;
  tab.favicon = null;
  tab.title = 'Page blocked';
  if (tab.id === activeTabId) hideLoader();
  renderTabs();
}

function closeTab(tabId, animateClose = true) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  const tab = tabs[index];
  if (tab.isClosing) return;
  if (animateClose && typeof handleAtlasSplitClose === 'function' && handleAtlasSplitClose(tabId)) return;
  atlasClosedTabs.push({
    url: tab.url,
    title: tab.title,
    index,
  });
  if (atlasClosedTabs.length > 30) atlasClosedTabs.shift();
  tab.disposeGameAds?.();
  AtlasContentFilter.dispose(tab.iframe);
  tab.isClosing = true;
  if (animateClose && tabs.every(t => t.isClosing)) {
    tab.returnHome = true;
    switchView('home');
  }
  if (typeof persistAtlasSession === 'function') persistAtlasSession();
  const tabElement = tabList.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
  if (tabElement && animateClose) {
    tabElement.style.setProperty('--tab-close-width', `${tabElement.getBoundingClientRect().width}px`);
    tabElement.classList.add('closing');
  }

  const wasActive = activeTabId === tabId;
  let nextTabToActivate = null;
  if (wasActive && tabs.length > 1) {
    nextTabToActivate = tabs[index + 1] || tabs[index - 1];
  }

  const finishClose = () => {
    if (tab.iframe && tab.iframe.parentNode) {
      tab.iframe.parentNode.removeChild(tab.iframe);
    }
    const currentIndex = tabs.findIndex(t => t.id === tabId);
    if (currentIndex !== -1) tabs.splice(currentIndex, 1);
    if (typeof onAtlasTabClosed === 'function') onAtlasTabClosed(tabId);

    if (tabs.length === 0) {
      activeTabId = null;
      hideLoader();
      renderTabs();
      if (!tab.returnHome) switchView('home');
    } else {
      if (activeTabId === tabId) {
        const nextTab = tabs.find(t => t.id === nextTabToActivate?.id && !t.isClosing) || tabs.find(t => !t.isClosing);
        if (nextTab) activateTab(nextTab.id);
      } else {
        renderTabs();
      }
    }
  };
  if (animateClose) setTimeout(finishClose, 230);
  else finishClose();
}

function showLoader() {
  newTabScreen.classList.remove('active');
  loaderOverlay.classList.add('active');
}

function hideLoader() {
  loaderOverlay.classList.remove('active');
}

function atlasRememberNavigation(tab, url, replace = false) {
  if (!url || tab.navigationTraversing) return;
  if (!Array.isArray(tab.navigationEntries)) {
    tab.navigationEntries = [tab.url];
    tab.navigationIndex = 0;
  }
  if (tab.navigationEntries[tab.navigationIndex] === url) return;
  if (replace) tab.navigationEntries[tab.navigationIndex] = url;
  else {
    tab.navigationEntries.splice(tab.navigationIndex + 1);
    tab.navigationEntries.push(url);
    if (tab.navigationEntries.length > 100) tab.navigationEntries.shift();
    tab.navigationIndex = tab.navigationEntries.length - 1;
  }
}
function atlasNavigateHistory(tab, direction) {
  const next = tab.navigationIndex + (direction === 'back' ? -1 : 1);
  if (!Array.isArray(tab.navigationEntries) || next < 0 || next >= tab.navigationEntries.length) return false;
  tab.navigationIndex = next;
  tab.navigationTraversing = true;
  try {
    navigateTab(tab.id, tab.navigationEntries[next]);
  } finally {
    tab.navigationTraversing = false;
  }
  return true;
}
let atlasPersistentStorageRequested = false;
function requestAtlasPersistentStorage() {
  if (atlasPersistentStorageRequested || !navigator.storage?.persist) return;
  atlasPersistentStorageRequested = true;
  navigator.storage
    .persisted()
    .then(persisted => persisted || navigator.storage.persist())
    .catch(() => {});
}
function navigateTab(tabId, rawInput) {
  const input = (rawInput || '').trim();
  if (!input) return;

  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  AtlasContentFilter.dispose(tab.iframe);
  tab.contentBlocked = false;
  tab.iframe.style.visibility = '';

  if (
    atlasInternalPage(input) &&
    tab.url === 'atlas://' + atlasInternalPage(input) &&
    (tab.isNewTab || tab.iframe.getAttribute('src') === '/atlas-pages.html?page=' + atlasInternalPage(input))
  ) {
    activateTab(tabId);
    return;
  }

  if (isNewTabUrl(input)) {
    tab.animateInternal = true;
    tab.isNewTab = true;
    tab.isLoading = false;
    atlasRememberNavigation(tab, 'atlas://' + atlasInternalPage(input));
    tab.url = 'atlas://' + atlasInternalPage(input);
    tab.title = getRealSiteTitle(tab.url);
    bottomAddressBar.value = tab.url;
    if (tab.iframe) {
      tab.iframe.src = 'about:blank';
      tab.iframe.style.display = 'none';
      tab.iframe.classList.remove('active-tab-frame');
    }
    activateTab(tabId);
    return;
  }

  tab.navigationLoading = true;
  tab.navigationPreviousDocument = tab.iframe.contentDocument;
  tab.iframe.onload = null;
  tab.isNewTab = false;
  tab.isLoading = true;
  const internal = atlasInternalPage(input);
  if (internal) {
    atlasRememberNavigation(tab, 'atlas://' + internal);
    tab.url = 'atlas://' + internal;
    tab.title = getRealSiteTitle(tab.url);
    tab.iframe.title = tab.title;
    if (tabId === activeTabId) activateTab(tabId);
    else renderTabs();
    tab.iframe.src = '/atlas-pages.html?page=' + internal;
    tab.iframe.onload = () => {
      if (tab.id === activeTabId && typeof animateAtlasContent === 'function')
        animateAtlasContent(tab.iframe, 'atlas-frame-enter');
    };
    if (typeof applyAtlasSplitLayout === 'function') applyAtlasSplitLayout();
    return;
  }
  let finalUrl = input;
  const isUrl =
    input.startsWith('http://') || input.startsWith('https://') || (input.includes('.') && !input.includes(' '));

  if (isUrl) {
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    tab.title = getRealSiteTitle(finalUrl);
  } else {
    const engine = SEARCH_ENGINES[getSearchEngineId()];
    finalUrl = engine.url + encodeURIComponent(input);
    tab.title = `${input} at ${engine.name}`;
  }

  const previousVisit =
    typeof atlasHistoryEntries === 'function' ? atlasHistoryEntries().find(entry => entry.url === finalUrl) : null;
  tab.favicon = atlasSiteFavicons.get(finalUrl) || previousVisit?.favicon || null;
  atlasRememberNavigation(tab, finalUrl);
  tab.url = finalUrl;
  if (typeof recordAtlasVisit === 'function') recordAtlasVisit(tab);
  if (tabId === activeTabId) bottomAddressBar.value = finalUrl;
  renderTabs();
  updateBookmarkStar();
  updateSiteInfo();

  if (tabId === activeTabId) {
    showLoader();
    tab.iframe.style.display = 'block';
    tab.iframe.classList.add('active-tab-frame');
    newTabScreen.classList.remove('active');
  }

  tab.blockAds = localStorage.getItem('setting_block_ads') !== 'false';
  tab.blockFp = localStorage.getItem('setting_block_fp') !== 'false';

  const proxyUrl = atlasProxyAddress(finalUrl, true, tab.blockAds, tab.blockFp, activeWss);
  AtlasSitePermissions.apply(tab.iframe, finalUrl);
  requestAtlasPersistentStorage();
  AtlasEngines.navigate(tab, finalUrl, proxyUrl, activeWss);
  if (typeof applyAtlasSplitLayout === 'function') applyAtlasSplitLayout();
}

function navigateActiveTab(input) {
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  if (!activeTab) {
    createTab(input);
  } else {
    navigateTab(activeTab.id, input);
  }
}

function returnToHome() {
  hideLoader();
  newTabScreen.classList.remove('active');
  tabs.forEach(t => {
    if (t.iframe && t.iframe.parentNode) {
      t.iframe.parentNode.removeChild(t.iframe);
    }
  });
  tabs = [];
  activeTabId = null;
  if (typeof onAtlasTabClosed === 'function') {
    atlasSplitPair = null;
    applyAtlasSplitLayout();
  }
  if (typeof persistAtlasSession === 'function') persistAtlasSession();
  switchView('home');
  renderShortcuts();
  updateBookmarkStar();
  updateSiteInfo();
  homeSearchInput.value = '';
  homeSearchInput.focus();

  const siteFavicon = document.getElementById('siteFavicon');
  if (siteFavicon) siteFavicon.href = '/assets/atlas.png';
  refreshBranding();
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setupSearchSuggestions(inputEl, containerEl, onSelectCallback) {
  if (!inputEl || !containerEl) return;
  let dropdown = null;
  let activeIndex = -1;
  let debounceTimer = null;
  let currentSuggestions = [];
  let requestController = null;
  let revision = 0;
  const listId = 'atlas-suggestions-' + Math.random().toString(36).slice(2);
  inputEl.setAttribute('role', 'combobox');
  inputEl.setAttribute('aria-autocomplete', 'list');
  inputEl.setAttribute('aria-controls', listId);
  inputEl.setAttribute('aria-expanded', 'false');

  function positionDropdown() {
    if (!dropdown) return;
    const rect = inputEl.getBoundingClientRect(),
      viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft || 0) + 8,
      topEdge = (viewport?.offsetTop || 0) + 8;
    const rightEdge = leftEdge + (viewport?.width || innerWidth) - 16;
    const bottomEdge = topEdge + (viewport?.height || innerHeight) - 16;
    const width = Math.max(0, Math.min(rect.width, rightEdge - leftEdge));
    const left = Math.max(leftEdge, Math.min(rect.left, rightEdge - width));
    const above = Math.max(0, rect.top - topEdge - 8),
      below = Math.max(0, bottomEdge - rect.bottom - 8);
    const up = below < 180 && above > below;
    const style = getComputedStyle(dropdown);
    const rows = [...dropdown.children].slice(0, 5);
    const visibleRowsHeight =
      rows.reduce((height, row) => height + row.getBoundingClientRect().height, 0) +
      Math.max(0, rows.length - 1) * (parseFloat(style.rowGap) || 0) +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom);
    const available = Math.min(visibleRowsHeight, up ? above : below);
    Object.assign(dropdown.style, {
      left: left + 'px',
      width: width + 'px',
      maxHeight: available + 'px',
      visibility: available < 32 ? 'hidden' : 'visible',
    });
    dropdown.style.top =
      (up ? Math.max(topEdge, rect.top - 8 - dropdown.offsetHeight) : Math.min(bottomEdge, rect.bottom + 8)) + 'px';
  }
  window.addEventListener('resize', positionDropdown);
  window.addEventListener('scroll', positionDropdown, true);
  window.visualViewport?.addEventListener('resize', positionDropdown);
  window.visualViewport?.addEventListener('scroll', positionDropdown);

  function closeDropdown(immediate = false) {
    revision++;
    requestController?.abort();
    clearTimeout(debounceTimer);
    inputEl.setAttribute('aria-expanded', 'false');
    inputEl.removeAttribute('aria-activedescendant');
    if (!dropdown) return;
    const target = dropdown;
    dropdown = null;
    activeIndex = -1;
    currentSuggestions = [];
    if (immediate) {
      target.remove();
    } else {
      target.classList.add('closing');
      setTimeout(() => {
        target.remove();
      }, 160);
    }
  }

  function renderDropdown(suggestions, query) {
    const rect = inputEl.getBoundingClientRect(),
      viewport = window.visualViewport;
    const top = (viewport?.offsetTop || 0) + 8;
    const bottom = top + (viewport?.height || innerHeight) - 16;
    const above = Math.max(0, rect.top - top - 8),
      below = Math.max(0, bottom - rect.bottom - 8);
    const available = below < 180 && above > below ? above : below;
    const limit = Math.max(0, Math.min(5, Math.floor((available - 10) / 46)));
    suggestions = suggestions?.slice(0, limit);
    currentSuggestions = suggestions;
    activeIndex = -1;

    if (!suggestions || suggestions.length === 0) {
      closeDropdown();
      return;
    }

    const oldClosing = document.querySelectorAll('#' + listId + '.closing');
    oldClosing.forEach(el => el.remove());

    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'search-suggestions-dropdown';
      dropdown.id = listId;
      dropdown.setAttribute('role', 'listbox');
      document.body.appendChild(dropdown);
    } else {
      dropdown.classList.remove('closing');
    }
    dropdown.innerHTML = '';

    inputEl.setAttribute('aria-expanded', 'true');
    suggestions.forEach((text, index) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.id = listId + '-' + index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.innerHTML = `
      <div class="suggestion-icon">
        <svg data-icon="search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
      </div>
      <div class="suggestion-text">${escapeHtml(text)}</div>
      <div class="suggestion-arrow">
        <svg data-icon="arrow-up-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
      </div>
    `;

      item.onmousedown = e => {
        e.preventDefault();
      };
      item.onclick = () => {
        closeDropdown();
        onSelectCallback(text);
      };

      dropdown.appendChild(item);
    });
    positionDropdown();
  }

  function fetchSuggestions(query) {
    if (!query || query.length < 1 || query.startsWith('http://') || query.startsWith('https://')) {
      closeDropdown();
      return;
    }
    requestController?.abort();
    requestController = new AbortController();
    const requestRevision = ++revision;
    fetch(`/api/suggestions?q=${encodeURIComponent(query)}`, { signal: requestController.signal })
      .then(res => res.json())
      .then(data => {
        if (
          requestRevision === revision &&
          Array.isArray(data) &&
          inputEl.value.trim() === query &&
          document.activeElement === inputEl
        ) {
          renderDropdown(data, query);
        }
      })
      .catch(error => {
        if (error.name !== 'AbortError' && requestRevision === revision) closeDropdown();
      });
  }

  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = inputEl.value.trim();
    if (!val) {
      closeDropdown();
      return;
    }
    debounceTimer = setTimeout(() => {
      fetchSuggestions(val);
    }, 90);
  });

  inputEl.addEventListener(
    'keydown',
    e => {
      if (e.key === 'Enter' && !e.isComposing) {
        const chosen = activeIndex >= 0 ? currentSuggestions[activeIndex] : inputEl.value.trim();
        closeDropdown(true);
        e.preventDefault();
        e.stopImmediatePropagation();
        if (chosen) onSelectCallback(chosen);
        return;
      }
      if (!dropdown || currentSuggestions.length === 0) return;

      if (e.key === 'Tab' || (e.key === 'ArrowRight' && inputEl.selectionStart === inputEl.value.length)) {
        if (currentSuggestions.length > 0) {
          e.preventDefault();
          const chosen =
            activeIndex >= 0 && activeIndex < currentSuggestions.length
              ? currentSuggestions[activeIndex]
              : currentSuggestions[0];
          inputEl.value = chosen;
          closeDropdown();
        }
        return;
      }

      const items = dropdown.querySelectorAll('.suggestion-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        updateActiveItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        updateActiveItem(items);
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    },
    { capture: true }
  );

  function updateActiveItem(items) {
    items.forEach((it, i) => {
      if (i === activeIndex) {
        it.classList.add('selected');
        it.setAttribute('aria-selected', 'true');
        inputEl.setAttribute('aria-activedescendant', it.id);
        it.scrollIntoView({ block: 'nearest' });
        inputEl.value = currentSuggestions[i];
      } else {
        it.classList.remove('selected');
        it.setAttribute('aria-selected', 'false');
      }
    });
  }

  inputEl.addEventListener('focus', () => {
    const val = inputEl.value.trim();
    if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
      fetchSuggestions(val);
    }
  });

  inputEl.addEventListener('blur', () => {
    setTimeout(closeDropdown, 160);
  });

  document.addEventListener('click', e => {
    if (!containerEl.contains(e.target) && !dropdown?.contains(e.target)) {
      closeDropdown();
    }
  });
}

function submitHomeSearch(val) {
  const trimmed = (val || '').trim();
  if (!trimmed) return;
  dismissAtlasRestore();
  homeSearchInput.value = '';
  switchView('browser');

  if (isNewTabUrl(trimmed)) {
    createTab(trimmed, null, true);
  } else {
    createTab(trimmed);
  }
}

function submitNewTabSearch(val) {
  const trimmed = (val || '').trim();
  if (!trimmed) return;
  dismissAtlasRestore();
  newTabSearchInput.value = '';
  navigateActiveTab(trimmed);
}

function submitBottomAddressBar(val) {
  const trimmed = (val || '').trim();
  if (!trimmed) return;
  dismissAtlasRestore();
  navigateActiveTab(trimmed);
  bottomAddressBar.setSelectionRange(bottomAddressBar.value.length, bottomAddressBar.value.length);
  bottomAddressBar.blur();
}

homeSearchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) {
    submitHomeSearch(homeSearchInput.value);
  }
});

newTabSearchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) {
    submitNewTabSearch(newTabSearchInput.value);
  }
});

bottomAddressBar.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) {
    submitBottomAddressBar(bottomAddressBar.value);
  }
});

const homeSearchWrapper = document.querySelector('.search-wrapper');
const newTabSearchWrapper = document.querySelector('.new-tab-search-wrapper') || newTabSearchInput.parentElement;

setupSearchSuggestions(homeSearchInput, homeSearchWrapper, query => {
  homeSearchInput.value = query;
  submitHomeSearch(query);
});

setupSearchSuggestions(newTabSearchInput, newTabSearchWrapper, query => {
  submitNewTabSearch(query);
});

let selectAddressOnPointerUp = false;
bottomAddressBar.addEventListener('pointerdown', () => {
  selectAddressOnPointerUp = document.activeElement !== bottomAddressBar;
});
bottomAddressBar.addEventListener('focus', () => bottomAddressBar.select());
bottomAddressBar.addEventListener('mouseup', e => {
  if (selectAddressOnPointerUp) {
    e.preventDefault();
    bottomAddressBar.select();
    selectAddressOnPointerUp = false;
  }
});
bottomAddressBar.addEventListener('blur', () => {
  selectAddressOnPointerUp = false;
});

newTabBtn.onclick = () => {
  if (tabs.length >= MAX_TABS) return;
  createTab('/new-tab', 'New Tab', true);
};

bottomHomeBtn.onclick = returnToHome;

const MAX_SHORTCUTS = 10;
const DEFAULT_SHORTCUTS = [
  { id: 'sc_youtube', name: 'YouTube', url: 'https://www.youtube.com/', isDefault: true },
  { id: 'sc_x', name: 'X', url: 'https://x.com/', isDefault: true },
  { id: 'sc_github', name: 'GitHub', url: 'https://github.com/', isDefault: true },
  { id: 'sc_discord', name: 'Discord', url: 'https://discord.com/app', isDefault: true },
  { id: 'sc_duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/', isDefault: true },
  { id: 'sc_wikipedia', name: 'Wikipedia', url: 'https://www.wikipedia.org/', isDefault: true },
];
function loadAtlasShortcuts() {
  const stored = localStorage.getItem('network_shortcuts');
  let saved;
  try {
    saved = stored ? JSON.parse(stored) : null;
  } catch {
    saved = null;
  }
  const valid = Array.isArray(saved)
    ? saved.filter(
        sc =>
          sc &&
          typeof sc.id === 'string' &&
          typeof sc.name === 'string' &&
          typeof sc.url === 'string' &&
          (/^https?:\/\//i.test(sc.url) || atlasInternalPage(sc.url))
      )
    : [];
  let result = valid;
  if (localStorage.getItem('network_shortcuts_revision') !== '2') {
    if (stored) localStorage.setItem('network_shortcuts_backup', stored);
    result = [...DEFAULT_SHORTCUTS.map(sc => ({ ...sc })), ...valid.filter(sc => !sc.isDefault && sc.id !== 'sc_ddg')];
    localStorage.setItem('network_shortcuts_revision', '2');
  } else if (!Array.isArray(saved)) {
    result = DEFAULT_SHORTCUTS.map(sc => ({ ...sc }));
  }
  const seen = new Set(),
    ids = new Set();
  result = result
    .filter(sc => {
      const url = sc.url.replace(/\/$/, '');
      if (seen.has(url) || ids.has(sc.id)) return false;
      seen.add(url);
      ids.add(sc.id);
      return true;
    })
    .slice(0, MAX_SHORTCUTS);
  localStorage.setItem('network_shortcuts', JSON.stringify(result));
  return result;
}
let shortcuts = loadAtlasShortcuts();

function saveShortcuts() {
  try {
    localStorage.setItem('network_shortcuts', JSON.stringify(shortcuts));
  } catch {}
}

const removingShortcuts = new Set();
function removeShortcut(id) {
  if (removingShortcuts.has(id)) return;
  removingShortcuts.add(id);
  shortcuts = shortcuts.filter(s => s.id !== id);
  saveShortcuts();
  const cards = document.querySelectorAll(`.shortcut-card[data-sc-id="${id}"]`);
  const finish = () => {
    renderShortcuts();
    removingShortcuts.delete(id);
  };
  if (!cards.length || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }
  const animations = [...cards].map(card => {
    card.inert = true;
    return card
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' })
      .finished.catch(() => {});
  });
  Promise.all(animations).then(finish);
}

let draggedScId = null;
let isDraggingShortcut = false;

function atlasShortcutTarget(rects, x, y) {
  let closest = 0,
    distance = Infinity;
  rects.forEach((rect, index) => {
    const next = (rect.left + rect.width / 2 - x) ** 2 + (rect.top + rect.height / 2 - y) ** 2;
    if (next < distance) {
      closest = index;
      distance = next;
    }
  });
  return closest;
}

function renderShortcuts() {
  const rows = [homeShortcutsRow, newTabShortcutsRow].filter(Boolean);
  const animations = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  rows.forEach(row => {
    const oldCards = new Map(
      [...row.querySelectorAll('.shortcut-card:not(.shortcut-add-fading)')].map(card => [
        card.dataset.scId || 'add',
        card,
      ])
    );
    const positions = new Map([...oldCards].map(([id, card]) => [id, card.getBoundingClientRect()]));
    oldCards.forEach(card => {
      card.getAnimations().forEach(animation => animation.cancel());
      card.classList.remove('sc-is-dragging', 'sc-gliding', 'sc-shifting');
      card.style.transform = '';
    });
    const oldCount = Number(row.dataset.shortcutCount);
    const fadingAdd = shortcuts.length === MAX_SHORTCUTS && oldCount < MAX_SHORTCUTS ? oldCards.get('add') : null;
    const oldAddRect = positions.get('add'),
      rowRect = row.getBoundingClientRect();
    const content = document.createDocumentFragment();
    row.dataset.shortcutCount = String(shortcuts.length);

    shortcuts.forEach(sc => {
      if (oldCards.has(sc.id)) {
        content.append(oldCards.get(sc.id));
        return;
      }
      const card = document.createElement('div');
      card.className = 'shortcut-card';
      card.setAttribute('data-sc-id', sc.id);
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Open ' + sc.name);
      card.tabIndex = 0;
      card.onkeydown = e => {
        if (e.target !== card || !['Enter', ' '].includes(e.key)) return;
        e.preventDefault();
        if (row === homeShortcutsRow) {
          switchView('browser');
          createTab(sc.url, officialAtlasSite(sc.url, true)?.title || sc.name);
        } else navigateActiveTab(sc.url);
      };

      card.onpointerdown = e => {
        if (isDraggingShortcut || e.target.closest('.shortcut-remove-btn') || e.button !== 0) return;
        draggedScId = sc.id;
        let startX = e.clientX;
        let startY = e.clientY;
        let dragMoved = false;

        const allCards = Array.from(row.querySelectorAll('.shortcut-card[data-sc-id]'));
        const initialIdx = allCards.indexOf(card);
        const cardCount = allCards.length;
        const cardRect = card.getBoundingClientRect();
        const cardRects = allCards.map(item => item.getBoundingClientRect());
        let targetIdx = initialIdx;

        const onPointerMove = moveEvt => {
          if (moveEvt.pointerId !== e.pointerId) return;
          const dx = moveEvt.clientX - startX;
          const dy = moveEvt.clientY - startY;

          if (!dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            dragMoved = true;
            isDraggingShortcut = true;
            card.classList.add('sc-is-dragging');
          }
          if (!dragMoved) return;

          card.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;

          targetIdx = atlasShortcutTarget(
            cardRects,
            cardRect.left + cardRect.width / 2 + dx,
            cardRect.top + cardRect.height / 2 + dy
          );

          for (let i = 0; i < cardCount; i++) {
            if (i === initialIdx) continue;
            const other = allCards[i];
            other.classList.add('sc-shifting');
            const destination = i > initialIdx && i <= targetIdx ? i - 1 : i < initialIdx && i >= targetIdx ? i + 1 : i;
            other.style.transform = `translate(${cardRects[destination].left - cardRects[i].left}px, ${cardRects[destination].top - cardRects[i].top}px)`;
          }
        };

        const onPointerUp = (upEvt, cancelled = false) => {
          if (upEvt?.pointerId !== undefined && upEvt.pointerId !== e.pointerId) return;
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', cancelDrag);
          window.removeEventListener('blur', cancelDrag);
          window.removeEventListener('resize', cancelDrag);

          if (dragMoved) {
            if (!cancelled && targetIdx !== initialIdx) {
              const fromIdx = shortcuts.findIndex(s => s.id === sc.id);
              if (fromIdx >= 0) {
                const [moved] = shortcuts.splice(fromIdx, 1);
                shortcuts.splice(targetIdx, 0, moved);
                saveShortcuts();
              }
            }

            renderShortcuts().finally(() => {
              isDraggingShortcut = false;
            });
          } else if (!cancelled) {
            isDraggingShortcut = false;
            if (row === homeShortcutsRow) {
              switchView('browser');
              createTab(sc.url, officialAtlasSite(sc.url, true)?.title || sc.name);
            } else {
              navigateActiveTab(sc.url);
            }
          }
          draggedScId = null;
        };
        const cancelDrag = () => onPointerUp(null, true);

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', cancelDrag);
        window.addEventListener('blur', cancelDrag);
        window.addEventListener('resize', cancelDrag);
      };

      const host = getHostname(sc.url) || 'duckduckgo.com';
      const iconUrl = getFaviconUrl(sc.url) || '/assets/atlas.png';

      const iconDiv = document.createElement('div');
      iconDiv.className = 'shortcut-icon';

      const img = document.createElement('img');
      img.src = iconUrl;
      img.style.cssText = 'width: 24px; height: 24px; border-radius: 4px; object-fit: contain;';
      img.alt = sc.name;
      img.onerror = function () {
        if (!this.dataset.fallback) {
          this.dataset.fallback = '1';
          this.src = '/assets/atlas.png';
        }
      };
      iconDiv.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'shortcut-remove-btn';
      removeBtn.type = 'button';
      removeBtn.onpointerdown = e => e.stopPropagation();
      removeBtn.onpointerup = e => e.stopPropagation();
      removeBtn.setAttribute('aria-label', 'Remove ' + sc.name + ' shortcut');
      removeBtn.innerHTML = `
      <svg data-icon="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
    `;
      removeBtn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        removeShortcut(sc.id);
      };
      iconDiv.appendChild(removeBtn);

      const label = document.createElement('div');
      label.className = 'shortcut-label';
      label.textContent = sc.name;

      card.appendChild(iconDiv);
      card.appendChild(label);
      content.appendChild(card);
    });

    if (shortcuts.length >= MAX_SHORTCUTS) {
      row.replaceChildren(content);
      if (fadingAdd && oldAddRect.width && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        fadingAdd.inert = true;
        fadingAdd.classList.add('shortcut-add-fading');
        fadingAdd.style.cssText = `position:absolute;left:${oldAddRect.left - rowRect.left}px;top:${oldAddRect.top - rowRect.top}px;width:${oldAddRect.width}px;height:${oldAddRect.height}px;pointer-events:none;`;
        row.append(fadingAdd);
        const fade = fadingAdd.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 180,
          easing: 'ease-out',
          fill: 'forwards',
        });
        fade.finished.catch(() => {}).then(() => fadingAdd.remove());
      }
    } else {
      const addCard = oldCards.get('add') || document.createElement('div');
      addCard.className = 'shortcut-card';
      addCard.dataset.shortcutAdd = 'true';
      addCard.setAttribute('role', 'button');
      addCard.setAttribute('aria-label', 'Add Shortcut');
      addCard.tabIndex = 0;
      addCard.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openAddShortcutModal();
        }
      };

      if (!oldCards.has('add')) {
        const addIcon = document.createElement('div');
        addIcon.className = 'shortcut-icon';
        addIcon.innerHTML = `
    <svg width="18" height="18" data-icon="plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
  `;

        const addLabel = document.createElement('div');
        addLabel.className = 'shortcut-label';
        addLabel.textContent = 'Add Shortcut';

        addCard.appendChild(addIcon);
        addCard.appendChild(addLabel);
      }

      addCard.onclick = () => {
        openAddShortcutModal();
      };

      content.appendChild(addCard);
      row.replaceChildren(content);
    }
    if (!reduced && rowRect.width)
      row.querySelectorAll('.shortcut-card:not(.shortcut-add-fading)').forEach(card => {
        const before = positions.get(card.dataset.scId || 'add'),
          after = card.getBoundingClientRect();
        let frames;
        if (before) {
          const dx = before.left - after.left,
            dy = before.top - after.top;
          if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;
          frames = [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }];
        } else if (oldCards.size) frames = [{ opacity: 0 }, { opacity: 1 }];
        if (!frames) return;
        const animation = card.animate(frames, {
          duration: 180,
          easing: 'cubic-bezier(.4,0,.2,1)',
          fill: 'both',
        });
        animations.push(animation.finished.catch(() => {}).then(() => animation.cancel()));
      });
  });
  updateBookmarkStar();
  return Promise.all(animations);
}

let addShortcutReturnFocus = null;
function addShortcutFocusables() {
  return [...addShortcutModal.querySelectorAll('input, button')].filter(element => !element.disabled);
}
function keepAddShortcutFocus(e) {
  if (addShortcutModal.classList.contains('active') && !addShortcutModal.contains(e.target)) shortcutNameInput.focus();
}
function handleAddShortcutKeys(e) {
  if (!addShortcutModal.classList.contains('active')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeAddShortcutModal();
    return;
  }
  if (e.key !== 'Tab') return;
  const focusables = addShortcutFocusables();
  const index = focusables.indexOf(document.activeElement);
  const next = e.shiftKey
    ? focusables[(index <= 0 ? focusables.length : index) - 1]
    : focusables[(index + 1) % focusables.length];
  e.preventDefault();
  next.focus();
}

function openAddShortcutModal() {
  if (shortcuts.length >= MAX_SHORTCUTS) return;
  shortcutNameInput.value = '';
  shortcutUrlInput.value = '';
  addShortcutReturnFocus = document.activeElement;
  addShortcutModal.classList.add('active');
  document.addEventListener('focusin', keepAddShortcutFocus, true);
  document.addEventListener('keydown', handleAddShortcutKeys, true);
  const focusName = (attempt = 0) => {
    if (!addShortcutModal.classList.contains('active') || addShortcutModal.contains(document.activeElement)) return;
    shortcutNameInput.focus();
    if (document.activeElement !== shortcutNameInput && attempt < 10) setTimeout(() => focusName(attempt + 1), 30);
  };
  requestAnimationFrame(() => focusName());
}

function closeAddShortcutModal() {
  addShortcutModal.classList.remove('active');
  document.removeEventListener('focusin', keepAddShortcutFocus, true);
  document.removeEventListener('keydown', handleAddShortcutKeys, true);
  if (addShortcutReturnFocus?.isConnected) addShortcutReturnFocus.focus({ preventScroll: true });
  addShortcutReturnFocus = null;
}

function submitAddShortcut() {
  if (shortcuts.length >= MAX_SHORTCUTS) {
    closeAddShortcutModal();
    return;
  }
  const rawName = (shortcutNameInput.value || '').trim();
  const rawUrl = (shortcutUrlInput.value || '').trim();

  if (!rawName) {
    shortcutNameInput.focus();
    return;
  }
  if (!rawUrl) {
    shortcutUrlInput.focus();
    return;
  }

  let finalUrl = rawUrl;
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = 'https://' + finalUrl;
  }

  const newShortcut = {
    id: 'sc_' + Date.now(),
    name: rawName,
    url: finalUrl,
    isDefault: false,
  };

  shortcuts.push(newShortcut);
  saveShortcuts();
  renderShortcuts();
  closeAddShortcutModal();
}

closeShortcutModalBtn.onclick = closeAddShortcutModal;
cancelShortcutModalBtn.onclick = closeAddShortcutModal;
confirmAddShortcutBtn.onclick = submitAddShortcut;

addShortcutModal.onclick = e => {
  if (e.target === addShortcutModal) {
    closeAddShortcutModal();
  }
};

shortcutUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitAddShortcut();
});

shortcutNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitAddShortcut();
});

function updateBookmarkStar() {
  if (!bookmarkBtn) return;
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (!currentTab || currentTab.isNewTab) {
    bookmarkBtn.disabled = true;
    bookmarkBtn.setAttribute('aria-pressed', 'false');
    bookmarkBtn.classList.remove('bookmarked');
    bookmarkBtn.style.opacity = '0.35';
    bookmarkBtn.style.pointerEvents = 'none';
    return;
  }

  bookmarkBtn.style.opacity = '1';
  bookmarkBtn.disabled = false;
  bookmarkBtn.style.pointerEvents = 'auto';

  const currentTabUrl = (currentTab.url || '').trim();
  const isBookmarked = shortcuts.some(s => (s.url || '').trim() === currentTabUrl);
  bookmarkBtn.disabled = !isBookmarked && shortcuts.length >= MAX_SHORTCUTS;
  bookmarkBtn.style.opacity = bookmarkBtn.disabled ? '0.35' : '1';
  bookmarkBtn.setAttribute('aria-pressed', String(isBookmarked));

  if (isBookmarked) {
    bookmarkBtn.classList.add('bookmarked');
  } else {
    bookmarkBtn.classList.remove('bookmarked');
  }
}

if (bookmarkBtn) {
  bookmarkBtn.onclick = e => {
    e.stopPropagation();
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (!currentTab || currentTab.isNewTab) return;

    const targetUrl = (currentTab.url || '').trim();
    const existingIndex = shortcuts.findIndex(s => (s.url || '').trim() === targetUrl);

    if (existingIndex !== -1) {
      shortcuts.splice(existingIndex, 1);
      saveShortcuts();
      renderShortcuts();
      bookmarkBtn.classList.remove('bookmarked');
    } else {
      if (shortcuts.length >= MAX_SHORTCUTS) return;

      const siteName =
        currentTab.title && currentTab.title !== 'New Tab' ? currentTab.title : getRealSiteTitle(targetUrl);

      const newSc = {
        id: 'sc_' + Date.now(),
        name: siteName,
        url: targetUrl,
        isDefault: false,
      };

      shortcuts.push(newSc);
      saveShortcuts();
      renderShortcuts();

      bookmarkBtn.classList.add('bookmarked');
    }
  };
}

let currentSiteInfoView = 'main';
let siteInfoTransitionGeneration = 0;
const onDeviceListFrame = document.getElementById('onDeviceListFrame');
let siteDataScrollFrame = 0;
function updateSiteDataScrollEdges() {
  if (siteDataScrollFrame) return;
  siteDataScrollFrame = requestAnimationFrame(() => {
    siteDataScrollFrame = 0;
    if (!onDeviceList || !onDeviceListFrame) return;
    onDeviceListFrame.style.setProperty('--site-data-top-edge', onDeviceList.scrollTop > 1 ? '1' : '0');
    onDeviceListFrame.style.setProperty(
      '--site-data-bottom-edge',
      onDeviceList.scrollHeight - onDeviceList.clientHeight - onDeviceList.scrollTop > 1 ? '1' : '0'
    );
  });
}
if (onDeviceList) {
  onDeviceList.addEventListener('scroll', updateSiteDataScrollEdges, { passive: true });
  new ResizeObserver(updateSiteDataScrollEdges).observe(onDeviceList);
  new MutationObserver(updateSiteDataScrollEdges).observe(onDeviceList, { childList: true });
}

function transitionSiteInfoPopupHeight(updateFn) {
  const generation = ++siteInfoTransitionGeneration;
  if (!siteInfoPopup || !siteInfoPopup.classList.contains('active')) {
    updateFn();
    return;
  }

  const prevHeight = siteInfoPopup.offsetHeight;
  siteInfoPopup.style.height = prevHeight + 'px';
  siteInfoPopup.style.overflow = 'hidden';

  updateFn();

  siteInfoPopup.style.height = 'auto';
  const targetHeight = siteInfoPopup.offsetHeight;

  siteInfoPopup.style.height = prevHeight + 'px';
  void siteInfoPopup.offsetHeight;

  requestAnimationFrame(() => {
    if (generation !== siteInfoTransitionGeneration) return;
    siteInfoPopup.style.height = targetHeight + 'px';

    setTimeout(() => {
      if (generation === siteInfoTransitionGeneration && siteInfoPopup && siteInfoPopup.classList.contains('active')) {
        siteInfoPopup.style.height = 'auto';
        siteInfoPopup.style.overflow = '';
      }
    }, 300);
  });
}

function showSiteInfoMainMenu() {
  transitionSiteInfoPopupHeight(() => {
    currentSiteInfoView = 'main';
    if (siteInfoBackBtn) siteInfoBackBtn.style.display = 'none';
    if (siteInfoTitleMain) siteInfoTitleMain.style.display = 'none';
    if (siteInfoDomain) siteInfoDomain.style.display = 'block';
    if (siteInfoMenu) siteInfoMenu.style.display = 'flex';
    if (siteInfoCookiesSubview) siteInfoCookiesSubview.style.display = 'none';
    if (siteInfoOnDeviceSubview) siteInfoOnDeviceSubview.style.display = 'none';
  });
}

function showSiteInfoCookiesView() {
  transitionSiteInfoPopupHeight(() => {
    currentSiteInfoView = 'cookies';
    if (siteInfoBackBtn) siteInfoBackBtn.style.display = 'flex';
    if (siteInfoTitleMain) {
      siteInfoTitleMain.style.display = 'block';
      siteInfoTitleMain.textContent = 'Cookies and Site Data';
    }
    if (siteInfoDomain) siteInfoDomain.style.display = 'none';
    if (siteInfoMenu) siteInfoMenu.style.display = 'none';
    if (siteInfoCookiesSubview) siteInfoCookiesSubview.style.display = 'flex';
    if (siteInfoOnDeviceSubview) siteInfoOnDeviceSubview.style.display = 'none';
  });
}

function showSiteInfoOnDeviceView() {
  transitionSiteInfoPopupHeight(() => {
    currentSiteInfoView = 'ondevice';
    if (siteInfoBackBtn) siteInfoBackBtn.style.display = 'flex';
    if (siteInfoTitleMain) {
      siteInfoTitleMain.style.display = 'block';
      siteInfoTitleMain.textContent = 'Site Data';
    }
    if (siteInfoDomain) siteInfoDomain.style.display = 'none';
    if (siteInfoMenu) siteInfoMenu.style.display = 'none';
    if (siteInfoCookiesSubview) siteInfoCookiesSubview.style.display = 'none';
    if (siteInfoOnDeviceSubview) siteInfoOnDeviceSubview.style.display = 'flex';
    renderOnDeviceSiteData();
  });
}

function atlasSiteDataSummary(item) {
  const parts = [];
  if (item.cookies) parts.push(item.cookies + (item.cookies === 1 ? ' cookie' : ' cookies'));
  if (item.items) parts.push(item.items + (item.items === 1 ? ' saved item' : ' saved items'));
  if (item.databases) parts.push(item.databases + (item.databases === 1 ? ' database' : ' databases'));
  return parts.join(' · ');
}

function atlasSiteDataTabUrl() {
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (!currentTab || currentTab.isNewTab || atlasInternalPage(currentTab.url)) return '';
  try {
    const url = new URL(currentTab.url);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

let atlasSiteDataGeneration = 0;
async function renderOnDeviceSiteData() {
  if (!onDeviceList) return;
  const generation = ++atlasSiteDataGeneration;
  const pageUrl = atlasSiteDataTabUrl();
  const empty = text => {
    onDeviceList.innerHTML = '';
    const message = document.createElement('div');
    message.className = 'ondevice-empty-msg';
    message.textContent = text;
    onDeviceList.appendChild(message);
  };
  if (!pageUrl || !window.AtlasSiteData) {
    empty('No site data stored for this site.');
    return;
  }
  empty('Checking stored data…');
  let items;
  try {
    items = await AtlasSiteData.collect(pageUrl);
  } catch {
    items = [];
  }
  if (generation !== atlasSiteDataGeneration) return;
  if (!items.length) {
    empty('No site data stored for this site.');
    return;
  }
  onDeviceList.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'ondevice-item';
    row.innerHTML = `
    <div class="ondevice-item-left">
      <div class="ondevice-item-icon">
        <img class="ondevice-item-favicon" src="/api/favicon?domain=${encodeURIComponent(item.host.replace(/:\d+$/, ''))}" alt="" />
      </div>
      <div class="ondevice-item-text">
        <div class="ondevice-item-domain">${escapeHtml(item.host)}</div>
        <div class="ondevice-item-meta">${escapeHtml(atlasSiteDataSummary(item))}</div>
      </div>
    </div>
    <div class="ondevice-item-actions">
      <button class="ondevice-action-btn ondevice-delete-btn" aria-label="Delete data for ${escapeHtml(item.host)}">
        ${atlasIcon('trash-2')}
      </button>
    </div>
  `;
    const favicon = row.querySelector('.ondevice-item-favicon');
    favicon.onerror = () => favicon.replaceWith(document.createRange().createContextualFragment(atlasIcon('globe')));
    row.querySelector('.ondevice-delete-btn').onclick = async e => {
      e.stopPropagation();
      if (row.dataset.clearing) return;
      row.dataset.clearing = 'true';
      await AtlasSiteData.clear(pageUrl, item.host).catch(() => {});
      await animateAtlasHistoryRemoval(row);
      if (!onDeviceList.querySelector('.ondevice-item')) empty('No site data stored for this site.');
      updateSiteDataSummary();
      const activeT = tabs.find(t => t.id === activeTabId);
      if (activeT && atlasSiteDataTabUrl() === pageUrl) reloadAtlasTab(activeT);
    };
    onDeviceList.appendChild(row);
  }
}

async function updateSiteDataSummary() {
  if (!siteDataAllowedText) return;
  const pageUrl = atlasSiteDataTabUrl();
  if (!pageUrl || !window.AtlasSiteData) {
    siteDataAllowedText.textContent = 'No data stored';
    return;
  }
  let items = [];
  try {
    items = await AtlasSiteData.collect(pageUrl);
  } catch {}
  if (pageUrl !== atlasSiteDataTabUrl()) return;
  const cookies = items.reduce((total, item) => total + item.cookies, 0);
  const stored = items.reduce((total, item) => total + item.items + item.databases, 0);
  siteDataAllowedText.textContent = items.length
    ? [
        cookies && `${cookies} ${cookies === 1 ? 'cookie' : 'cookies'}`,
        stored && `${stored} saved ${stored === 1 ? 'item' : 'items'}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'No data stored';
}

function updateSiteInfo() {
  if (!siteInfoDomain) return;
  const currentTab = tabs.find(t => t.id === activeTabId);
  const isNewTab = !currentTab || currentTab.isNewTab || Boolean(atlasInternalPage(currentTab.url));
  const host = !isNewTab && currentTab.url ? getHostname(currentTab.url) : '';

  siteInfoDomain.textContent = host || 'Atlas';

  const securityDescInner = document.getElementById('siteInfoSecurityDescInner');
  if (securityDescInner) {
    if (isNewTab) {
      securityDescInner.textContent = 'Secure internal application context. Local isolated sandbox.';
    } else {
      securityDescInner.textContent = currentTab.engineFallback
        ? `Atlas compatibility renderer is active because ${currentTab.engineFallback.requested === 'scramjet' ? 'Scramjet' : 'Ultraviolet'} could not start.`
        : 'Atlas connects securely through the configured relay';
    }
  }

  updateSiteDataSummary();

  if (currentTab) {
    if (blockAdsToggle && typeof currentTab.blockAds === 'boolean') {
      blockAdsToggle.checked = currentTab.blockAds;
    }
    if (fingerprintToggle && typeof currentTab.blockFp === 'boolean') {
      fingerprintToggle.checked = currentTab.blockFp;
    }
  }
  const permissionSite = currentTab && !currentTab.isNewTab ? AtlasSitePermissions.site(currentTab.url) : null;
  const grants = permissionSite ? AtlasSitePermissions.get(currentTab.url) : { media: false, location: false };
  for (const [id, kind] of [
    ['sitePermissionMediaToggle', 'media'],
    ['sitePermissionLocationToggle', 'location'],
  ]) {
    const toggle = document.getElementById(id);
    if (!toggle) continue;
    toggle.checked = grants[kind];
    toggle.disabled = !permissionSite;
  }
}

function reloadAtlasTabWithPermissions(tab) {
  if (!tab?.iframe || tab.isNewTab) return;
  AtlasSitePermissions.apply(tab.iframe, tab.url);
  try {
    tab.iframe.contentWindow.location.reload();
  } catch {
    navigateTab(tab.id, tab.url);
  }
}
for (const [id, kind] of [
  ['sitePermissionMediaToggle', 'media'],
  ['sitePermissionLocationToggle', 'location'],
]) {
  const toggle = document.getElementById(id);
  if (!toggle) continue;
  toggle.onchange = () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.isNewTab) return;
    AtlasSitePermissions.set(tab.url, kind, toggle.checked);
    reloadAtlasTabWithPermissions(tab);
  };
}
for (const id of ['siteInfoMediaRow', 'siteInfoLocationRow']) {
  const row = document.getElementById(id);
  if (!row) continue;
  row.onclick = e => {
    if (e.target.closest('.clean-switch')) return;
    const isExpanded = row.classList.contains('expanded');
    collapseAllSiteInfoExpanded(row);
    row.classList.toggle('expanded', !isExpanded);
  };
}

const siteInfoBackdrop = document.getElementById('siteInfoBackdrop');

function closeSiteInfo() {
  const generation = ++siteInfoTransitionGeneration;
  if (siteInfoPopup) siteInfoPopup.classList.remove('active');
  if (siteInfoBackdrop) siteInfoBackdrop.classList.remove('active');
  setTimeout(() => {
    if (siteInfoPopup && generation === siteInfoTransitionGeneration) {
      siteInfoPopup.style.height = '';
      siteInfoPopup.style.overflow = '';
    }
  }, 240);
}

function openSiteInfo() {
  updateSiteInfo();
  showSiteInfoMainMenu();
  if (siteInfoPopup) siteInfoPopup.classList.add('active');
  if (siteInfoBackdrop) siteInfoBackdrop.classList.add('active');
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !siteInfoPopup?.classList.contains('active')) return;
  e.preventDefault();
  closeSiteInfo();
  siteInfoBtn?.focus({ preventScroll: true });
});

if (siteInfoBtn && siteInfoPopup) {
  siteInfoBtn.onclick = e => {
    e.stopPropagation();
    if (siteInfoPopup.classList.contains('active')) {
      closeSiteInfo();
    } else {
      openSiteInfo();
    }
  };

  if (siteInfoBackdrop) {
    siteInfoBackdrop.onclick = e => {
      e.stopPropagation();
      closeSiteInfo();
    };
  }

  if (siteInfoBackBtn) {
    siteInfoBackBtn.onclick = e => {
      e.stopPropagation();
      if (currentSiteInfoView === 'ondevice') {
        showSiteInfoCookiesView();
      } else {
        showSiteInfoMainMenu();
      }
    };
  }

  siteInfoPopup.addEventListener('pointerdown', e => {
    e.stopPropagation();
  });
  siteInfoPopup.addEventListener('click', e => {
    e.stopPropagation();
  });

  document.addEventListener('pointerdown', e => {
    if (siteInfoPopup && siteInfoPopup.classList.contains('active')) {
      if (!siteInfoPopup.contains(e.target) && !siteInfoBtn.contains(e.target)) {
        closeSiteInfo();
      }
    }
  });
}

function collapseAllSiteInfoExpanded(exceptEl = null) {
  siteInfoPopup?.querySelectorAll('.site-info-item.expanded').forEach(row => {
    if (row !== exceptEl) row.classList.remove('expanded');
  });
}

if (siteInfoSecurityRow) {
  siteInfoSecurityRow.onclick = e => {
    const isExpanded = siteInfoSecurityRow.classList.contains('expanded');
    collapseAllSiteInfoExpanded(siteInfoSecurityRow);
    siteInfoSecurityRow.classList.toggle('expanded', !isExpanded);
  };
}

const blockAdsToggle = document.getElementById('blockAdsToggle');
const fingerprintToggle = document.getElementById('fingerprintToggle');
blockAdsToggle.checked = localStorage.getItem('setting_block_ads') !== 'false';
fingerprintToggle.checked = localStorage.getItem('setting_block_fp') !== 'false';
const siteInfoBlockAdsRow = document.getElementById('siteInfoBlockAdsRow');

if (blockAdsToggle) {
  blockAdsToggle.onchange = () => {
    applyGlobalProxyPreferences(blockAdsToggle.checked, fingerprintToggle.checked);
  };
}

if (siteInfoBlockAdsRow) {
  siteInfoBlockAdsRow.onclick = e => {
    if (e.target.closest('.clean-switch')) {
      return;
    }
    const isExpanded = siteInfoBlockAdsRow.classList.contains('expanded');
    collapseAllSiteInfoExpanded(siteInfoBlockAdsRow);
    siteInfoBlockAdsRow.classList.toggle('expanded', !isExpanded);
  };
}

if (fingerprintToggle) {
  fingerprintToggle.onchange = () => {
    applyGlobalProxyPreferences(blockAdsToggle.checked, fingerprintToggle.checked);
  };
}

if (siteInfoFingerprintRow) {
  siteInfoFingerprintRow.onclick = e => {
    if (e.target.closest('.clean-switch')) {
      return;
    }
    const isExpanded = siteInfoFingerprintRow.classList.contains('expanded');
    collapseAllSiteInfoExpanded(siteInfoFingerprintRow);
    siteInfoFingerprintRow.classList.toggle('expanded', !isExpanded);
  };
}

if (siteInfoCookiesRow) {
  siteInfoCookiesRow.onclick = e => {
    collapseAllSiteInfoExpanded();
    showSiteInfoCookiesView();
  };
}

document.addEventListener('click', e => {
  if (
    siteInfoBlockAdsRow &&
    siteInfoBlockAdsRow.classList.contains('expanded') &&
    !siteInfoBlockAdsRow.contains(e.target)
  ) {
    siteInfoBlockAdsRow.classList.remove('expanded');
  }
  if (
    siteInfoFingerprintRow &&
    siteInfoFingerprintRow.classList.contains('expanded') &&
    !siteInfoFingerprintRow.contains(e.target)
  ) {
    siteInfoFingerprintRow.classList.remove('expanded');
  }
  if (
    siteInfoSecurityRow &&
    siteInfoSecurityRow.classList.contains('expanded') &&
    !siteInfoSecurityRow.contains(e.target)
  ) {
    siteInfoSecurityRow.classList.remove('expanded');
  }
});

if (thirdPartyCookieToggle && thirdPartyCookieStatus) {
  thirdPartyCookieToggle.onchange = () => {
    if (thirdPartyCookieToggle.checked) {
      thirdPartyCookieStatus.textContent = 'Allowed';
      thirdPartyCookieStatus.style.color = '#e2e8f0';
    } else {
      thirdPartyCookieStatus.textContent = 'Blocked';
      thirdPartyCookieStatus.style.color = '#64748b';
    }
  };
}
if (manageSiteDataRow) {
  manageSiteDataRow.onclick = e => {
    e.stopPropagation();
    showSiteInfoOnDeviceView();
  };
}

if (openOnDeviceDataBtn) {
  openOnDeviceDataBtn.onclick = e => {
    e.stopPropagation();
    showSiteInfoOnDeviceView();
  };
}

renderShortcuts();

navReload.onclick = () => {
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (currentTab && !currentTab.isNewTab && currentTab.iframe.src && currentTab.iframe.src !== 'about:blank') {
    const wasLoading = currentTab.isLoading;
    currentTab.isLoading = true;
    showLoader();
    if (currentTab.engineFallback || (currentTab.proxyEngine && currentTab.proxyEngine !== 'atlas'))
      navigateTab(currentTab.id, currentTab.url);
    else if (!atlasInternalPage(currentTab.url) && !wasLoading && !currentTab.isErrorPage) {
      const origin = window.__atlasConfig.proxyOriginTemplate
        ? AtlasProxyOrigin.originFor(currentTab.url, window.__atlasConfig.proxyOriginTemplate)
        : atlasAppOrigin();
      AtlasEngines.post(currentTab.iframe, { type: '__atlas_navigation', action: 'reload' }, origin);
    } else if (!atlasInternalPage(currentTab.url)) navigateTab(currentTab.id, currentTab.url);
    else currentTab.iframe.src = currentTab.iframe.src;
  }
};

navBack.onclick = () => {
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (currentTab && currentTab.iframe) {
    atlasNavigateHistory(currentTab, 'back');
  }
};

navForward.onclick = () => {
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (currentTab && currentTab.iframe) {
    atlasNavigateHistory(currentTab, 'forward');
  }
};

hideBottomBarBtn.onclick = () => {
  browserView.classList.add('bottom-bar-hidden');
};

revealBottomBarBtn.onclick = () => {
  browserView.classList.remove('bottom-bar-hidden');
};

window.addEventListener('message', e => {
  if (!tabs.some(tab => tab.iframe?.contentWindow === e.source)) return;

  try {
    if (!window.__atlasConfig.proxyOriginTemplate) {
      if (e.origin !== atlasAppOrigin()) return;
    } else {
      const sample = AtlasProxyOrigin.originFor('https://example.com', window.__atlasConfig.proxyOriginTemplate);
      const expected = new URL(sample),
        actual = new URL(e.origin);
      const prefix = expected.hostname.split('.')[0].slice(0, -32),
        label = actual.hostname.split('.')[0];
      if (
        actual.protocol !== expected.protocol ||
        actual.host.substring(actual.host.indexOf('.')) !== expected.host.substring(expected.host.indexOf('.')) ||
        !label.startsWith(prefix) ||
        !/^[a-f0-9]{32}$/.test(label.slice(prefix.length))
      )
        return;
      if (
        ['__network_metadata', '__network_document_ready', '__atlas_content_blocked'].includes(e.data?.type) &&
        AtlasProxyOrigin.originFor(e.data.url, window.__atlasConfig.proxyOriginTemplate) !== e.origin
      )
        return;
    }
  } catch {
    return;
  }
  if (e.data?.type === '__network_document_ready') {
    const tab = tabs.find(tab => tab.iframe?.contentWindow === e.source);
    if (tab && !tab.isNewTab && tab.url === e.data.url) {
      tab.documentReadyRevision = (tab.documentReadyRevision || 0) + 1;
      tab.isLoading = false;
      if (tab.id === activeTabId) hideLoader();
    }
    return;
  }
  if (e.data?.type === '__atlas_content_blocked') {
    const tab = tabs.find(tab => tab.iframe?.contentWindow === e.source);
    try {
      if (tab && !tab.isNewTab && new URL(tab.url).origin === new URL(e.data.url).origin) atlasBlockSexualContent(tab);
    } catch {}
    return;
  }
  if (e.data?.type === '__network_error_page') {
    const tab = tabs.find(tab => tab.iframe?.contentWindow === e.source);
    if (tab) {
      tab.isErrorPage = true;
      renderTabs();
    }
    return;
  }
  if (e.data?.type === '__network_metadata') {
    const tab = tabs.find(tab => tab.iframe?.contentWindow === e.source);
    if (!tab || tab.isNewTab) return;
    tab.isErrorPage = false;
    if (
      tab.navigationLoading &&
      tab.iframe.contentDocument &&
      tab.iframe.contentDocument.documentElement?.getAttribute('data-atlas-url') !== e.data.url
    )
      return;
    atlasRememberNavigation(tab, e.data.url, tab.navigationLoading);
    tab.navigationLoading = false;
    tab.navigationPreviousDocument = null;
    const changedUrl = tab.url !== e.data.url;
    tab.url = e.data.url;
    tab.title =
      typeof e.data.title === 'string' && e.data.title.trim() ? e.data.title.trim() : getRealSiteTitle(tab.url);
    atlasSiteTitles.set(tab.url, tab.title);
    if (atlasSiteTitles.size > 200) atlasSiteTitles.delete(atlasSiteTitles.keys().next().value);
    try {
      const icon = new URL(e.data.icon);
      const valid =
        ['http:', 'https:'].includes(icon.protocol) ||
        (icon.protocol === 'data:' &&
          /^data:image\/(?:png|jpeg|gif|webp|svg\+xml|x-icon|vnd.microsoft.icon)[;,]/i.test(icon.href) &&
          icon.href.length <= 262144);
      if (valid && (e.data.iconDeclared !== false || !atlasSiteFavicons.has(tab.url))) {
        tab.favicon = icon.href;
        atlasSiteFavicons.set(tab.url, icon.href);
        if (atlasSiteFavicons.size > 200) atlasSiteFavicons.delete(atlasSiteFavicons.keys().next().value);
      }
    } catch {}
    renderTabs();
    if (changedUrl) recordAtlasVisit(tab);
    if (tab.id === activeTabId) {
      bottomAddressBar.value = tab.url;
      updateBookmarkStar();
      updateSiteInfo();
    }
    return;
  }

  if (e.data && e.data.type === '__network_retry_tab') {
    const matchedTab = tabs.find(t => t.iframe && t.iframe.contentWindow === e.source);
    if (matchedTab && matchedTab.iframe) {
      matchedTab.isLoading = true;
      if (matchedTab.id === activeTabId) showLoader();
      const currentSrc = matchedTab.iframe.src;
      try {
        const u = new URL(currentSrc, atlasAppOrigin());
        matchedTab.iframe.src = u.toString();
      } catch {
        matchedTab.iframe.src = currentSrc;
      }
    }
  }
});

const settingsView = document.getElementById('settingsView');
const homeBottomDock = document.getElementById('homeBottomDock');

let currentSettingsTab = 'privacy';

const dockBtnHome = document.getElementById('dockBtnHome');
const dockBtnSettings = document.getElementById('dockBtnSettings');

function atlasSettingsTabFromHash() {
  const tab = atlasAppURL().hash.slice(1);
  const touchOnly = matchMedia('(pointer: coarse) and (not (any-pointer: fine))').matches;
  const available = ['privacy', 'customize', 'browsing', ...(touchOnly ? [] : ['keybinds']), 'advanced'];
  return available.includes(tab) ? tab : 'privacy';
}
function atlasUpdateSettingsPath(tab, pushUrl) {
  const path = '/settings#' + tab;
  if (atlasAppURL().pathname + atlasAppURL().hash === path) return;
  if (pushUrl) atlasSetAppPath(path);
  else if (window.__atlasBlankBoot) window.__atlasBlankBoot.url = new URL(path, atlasAppURL()).href;
  else window.history.replaceState({}, '', path);
}
let atlasViewTimer;
function switchView(target, pushUrl = true, afterFade = false) {
  if (target !== 'home' && target !== 'proxy' && typeof dismissAtlasRestore === 'function') dismissAtlasRestore();
  closeAtlasMenu();
  clearTimeout(atlasViewTimer);
  const nextView = target === 'settings' ? settingsView : target === 'browser' ? browserView : homeView;
  const views = [homeView, settingsView, browserView];
  const previous = views.find(view => view && getComputedStyle(view).display !== 'none');
  const settingsTab = pushUrl ? currentSettingsTab : atlasSettingsTabFromHash();
  if (!afterFade && previous === nextView && (target === 'settings' || target === 'home' || target === 'proxy')) {
    views.forEach(view => view?.classList.remove('view-exit'));
    if (target === 'settings') {
      if (currentSettingsTab !== settingsTab) {
        currentSettingsTab = settingsTab;
        renderSettingsTab(currentSettingsTab);
      }
      atlasUpdateSettingsPath(settingsTab, pushUrl);
    }
    return;
  }
  if (!afterFade && previous && previous !== nextView) {
    previous.classList.remove('view-enter');
    previous.classList.add('view-exit');
    atlasViewTimer = setTimeout(() => switchView(target, pushUrl, true), 140);
    return;
  }
  views.forEach(view => view?.classList.remove('view-exit'));
  if (homeView) homeView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  if (browserView) browserView.style.display = 'none';

  document.querySelectorAll('.home-dock-item').forEach(b => b.classList.remove('active'));

  if (target === 'home' || target === 'proxy') {
    if (homeView) homeView.style.display = 'flex';
    if (homeBottomDock) homeBottomDock.style.display = 'flex';
    if (dockBtnHome) dockBtnHome.classList.add('active');
    renderShortcuts();
    if (homeSearchInput) homeSearchInput.focus();
    if (pushUrl && atlasAppURL().pathname !== '/home' && atlasAppURL().pathname !== '/') {
      atlasSetAppPath('/home');
    }
  } else if (target === 'settings') {
    if (settingsView) settingsView.style.display = 'flex';
    if (homeBottomDock) homeBottomDock.style.display = 'flex';
    if (dockBtnSettings) dockBtnSettings.classList.add('active');
    currentSettingsTab = settingsTab;
    renderSettingsTab(currentSettingsTab);
    atlasUpdateSettingsPath(settingsTab, pushUrl);
  } else if (target === 'browser') {
    if (browserView) browserView.style.display = 'flex';
    if (homeBottomDock) homeBottomDock.style.display = 'none';
    if (tabs.length > 0) {
      activateTab(activeTabId || tabs[0].id);
    }
  }
  const visibleView = nextView;
  if (visibleView) visibleView.scrollTop = 0;
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  animateAtlasContent(visibleView);
}

if (dockBtnHome) {
  dockBtnHome.onclick = e => {
    e.stopPropagation();
    switchView('home');
  };
}
if (dockBtnSettings) {
  dockBtnSettings.onclick = e => {
    e.stopPropagation();
    switchView('settings');
  };
}

if (bottomHomeBtn) {
  bottomHomeBtn.onclick = () => switchView('home');
}

function atlasRestoreRoute() {
  const p = atlasAppURL().pathname;
  if (p === '/settings') switchView('settings', false);
  else if (p === '/home' || p === '/' || p === '/apps') switchView('home', false);
}
window.addEventListener('popstate', atlasRestoreRoute);
window.addEventListener('hashchange', atlasRestoreRoute);
