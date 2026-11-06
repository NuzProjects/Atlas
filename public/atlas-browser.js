let atlasSplitPair = null;
let atlasSplitGroupElement = null;
let atlasSplitRatio = 50;
let atlasSplitTransition = false;
let atlasSplitTimer = null;
let atlasSplitPhase = null;
let atlasSplitGeneration = 0;
let atlasSplitAnimations = [];
const atlasSplitButton = document.getElementById('atlasSplitButton');
const atlasHistoryButton = document.getElementById('atlasHistoryButton');
const atlasSplitDivider = document.getElementById('atlasSplitDivider');
const atlasSplitEmpty = document.getElementById('atlasSplitEmpty');
atlasHistoryButton.innerHTML = atlasIcon('history');
function openAtlasInternalTab(page) {
  const existing = tabs.find(tab => !tab.isClosing && tab.url === 'atlas://' + page);
  if (existing?.id === activeTabId && browserView.style.display !== 'none') {
    closeAtlasMenu();
    return;
  }
  if (existing) activateTab(existing.id);
  else createTab('atlas://' + page);
  switchView('browser');
}
document.getElementById('navReload').innerHTML = atlasIcon('rotate-cw', 'atlas-reload-icon');

const atlasLinkPreview = document.createElement('div');
atlasLinkPreview.className = 'atlas-link-preview';
atlasLinkPreview.setAttribute('aria-hidden', 'true');
browserView.append(atlasLinkPreview);
function clearAtlasLinkPreview() {
  delete atlasLinkPreview.dataset.visible;
}
window.addEventListener('message', e => {
  if (e.data?.type !== '__atlas_link_preview') return;
  const tab = tabs.find(tab => !tab.isClosing && tab.iframe?.contentWindow === e.source);
  const visible =
    tab && (tab.id === activeTabId || (atlasSplitPair?.includes(activeTabId) && atlasSplitPair.includes(tab.id)));
  if (!visible) return;
  try {
    if (AtlasProxyOrigin.originFor(tab.url, window.__atlasConfig.proxyOriginTemplate) !== e.origin) return;
  } catch {
    return;
  }
  if (!e.data.url) {
    clearAtlasLinkPreview();
    return;
  }
  let url;
  try {
    url = new URL(e.data.url);
  } catch (_) {
    return;
  }
  if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return;
  atlasLinkPreview.textContent = url.href;
  atlasLinkPreview.dataset.visible = 'true';
});
viewportContainer.addEventListener('pointerleave', clearAtlasLinkPreview);
tabList.addEventListener('pointerdown', clearAtlasLinkPreview, true);
window.addEventListener('blur', clearAtlasLinkPreview);

function atlasHistoryRow(title, url, open, remove, visitedAt) {
  const row = document.createElement('div');
  row.className = 'atlas-history-row';
  const item = document.createElement('button');
  item.className = 'atlas-history-entry';
  item.innerHTML = `<img class="atlas-history-favicon" src="${escapeHtml(getFaviconUrl(url) || '/assets/atlas.png')}" alt=""/><span><strong>${escapeHtml(title || url || 'New Tab')}</strong><small>${escapeHtml(url === '/new-tab' ? 'atlas://new' : url)}</small></span>`;
  if (visitedAt) {
    const time = document.createElement('time'),
      date = new Date(visitedAt);
    time.className = 'atlas-history-time';
    time.dateTime = date.toISOString();
    time.textContent = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    time.title = date.toLocaleString();
    item.prepend(time);
  }
  item.querySelector('img').onerror = e => {
    e.target.onerror = null;
    e.target.src = '/assets/atlas.png';
  };
  item.onclick = open;
  const close = document.createElement('button');
  close.className = 'atlas-history-delete';
  close.setAttribute('aria-label', 'Remove ' + (title || url || 'New Tab') + ' from history');
  close.innerHTML = atlasIcon('x');
  close.onclick = e => {
    e.stopPropagation();
    if (row.inert) return;
    remove();
    animateAtlasHistoryRemoval(row);
  };
  row.append(item, close);
  return row;
}

function animateAtlasHistoryRemoval(row) {
  if (!row || row.inert) return Promise.resolve();
  const next = row.nextElementSibling || row.previousElementSibling;
  if (row.contains(document.activeElement)) next?.querySelector('button')?.focus({ preventScroll: true });
  const spacing = typeof getComputedStyle === 'function' ? getComputedStyle(row) : null;
  const paddingTop = spacing?.paddingTop || '0px';
  const paddingBottom = spacing?.paddingBottom || '0px';
  row.style.height = row.getBoundingClientRect().height + 'px';
  row.inert = true;
  void row.offsetHeight;
  row.classList.add('atlas-history-removing');
  if (row.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const animation = row.animate(
      [
        { height: row.style.height, opacity: 1, transform: 'none', paddingTop, paddingBottom, marginBottom: '0px' },
        {
          height: '0px',
          opacity: 0,
          transform: 'translateX(-6px)',
          paddingTop: '0px',
          paddingBottom: '0px',
          marginBottom: '-3px',
        },
      ],
      { duration: 180, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
    );
    return animation.finished.catch(() => {}).then(() => row.remove());
  }
  row.style.height = '0px';
  return new Promise(resolve =>
    setTimeout(() => {
      row.remove();
      resolve();
    }, 200)
  );
}

function atlasAvailableSplitTabs(blankId) {
  return tabs.filter(
    tab =>
      !tab.isClosing &&
      !tab.isNewTab &&
      tab.id !== activeTabId &&
      tab.id !== blankId &&
      !atlasSplitPair?.includes(tab.id)
  );
}

function chooseAtlasSplitTab(blankId, selectedId) {
  const slot = atlasSplitPair?.indexOf(blankId) ?? -1;
  const blank = tabs.find(tab => tab.id === blankId && !tab.isClosing);
  const selected = tabs.find(tab => tab.id === selectedId && !tab.isClosing);
  if (slot < 0 || !blank?.isNewTab || !selected || !atlasAvailableSplitTabs(blankId).includes(selected)) return;
  runAtlasSplitTransition(
    () => {
      if (atlasSplitPair?.[slot] !== blankId || !tabs.includes(selected) || selected.isClosing) return;
      atlasSplitPair[slot] = selectedId;
      activateTab(selectedId);
      closeTab(blankId, false);
    },
    'replace',
    slot === 0 ? 'left' : 'right'
  );
}
function renderAtlasSplitChoices() {
  const activeSlot = atlasSplitPair?.indexOf(activeTabId) ?? -1;
  [newTabScreen, atlasSplitEmpty].forEach(screen => {
    const list = screen.querySelector('.atlas-split-tab-picker');
    if (!list) return;
    const blankId = activeSlot < 0 ? null : atlasSplitPair[screen === newTabScreen ? activeSlot : 1 - activeSlot];
    const blank = tabs.find(tab => tab.id === blankId && !tab.isClosing);
    if (!blank?.isNewTab) return;
    const changedPane = list.dataset.choiceTabId !== blankId;
    list.dataset.choiceTabId = blankId;
    const available = atlasAvailableSplitTabs(blankId);
    const entries = available.map(tab => {
      const item = document.createElement('button');
      item.className = 'atlas-history-entry atlas-open-tab-option';
      item.innerHTML = `<img class="atlas-history-favicon" src="${escapeHtml(getFaviconUrl(tab.url))}" alt=""/><span><strong>${escapeHtml(tab.title || tab.url)}</strong><small>${escapeHtml(tab.url)}</small></span>`;
      const image = item.querySelector('img');
      image.onerror = () => {
        image.onerror = null;
        image.src = '/assets/atlas.png';
      };
      item.onclick = () => chooseAtlasSplitTab(blankId, tab.id);
      return item;
    });
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'atlas-history-empty';
      empty.textContent = 'No other tabs are available. Search or enter a URL above.';
      entries.push(empty);
    }
    list.replaceChildren(...entries);
    if (changedPane) list.scrollTop = 0;
  });
}
[newTabScreen, atlasSplitEmpty].forEach(screen => {
  const picker = document.createElement('div');
  picker.className = 'atlas-split-tab-picker';
  picker.setAttribute('role', 'region');
  picker.setAttribute('aria-label', 'Open tabs for split view');
  screen.querySelector('.new-tab-search-wrapper').after(picker);
});

function atlasHistoryEntries() {
  try {
    const entries = JSON.parse(localStorage.getItem('atlas_browsing_history') || '[]');
    return Array.isArray(entries)
      ? entries.filter(entry => entry && typeof entry.url === 'string' && /^https?:\/\//i.test(entry.url)).slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
function recordAtlasVisit(tab) {
  if (!tab || tab.isNewTab || !/^https?:\/\//i.test(tab.url)) return;
  const entries = atlasHistoryEntries().filter(entry => entry.url !== tab.url);
  entries.unshift({
    url: tab.url,
    title: tab.title || getHostname(tab.url),
    visitedAt: Date.now(),
    ...(tab.favicon ? { favicon: tab.favicon } : {}),
  });
  localStorage.setItem('atlas_browsing_history', JSON.stringify(entries.slice(0, 100)));
}
function syncAtlasHistoryTitles() {
  const entries = atlasHistoryEntries();
  let changed = false;
  entries.forEach(entry => {
    const tab = tabs.find(tab => !tab.isNewTab && tab.url === entry.url);
    if (tab?.title && entry.title !== tab.title) {
      entry.title = tab.title;
      changed = true;
    }
    if (tab && entry.isErrorPage !== !!tab.isErrorPage) {
      entry.isErrorPage = !!tab.isErrorPage;
      changed = true;
    }
    if (tab?.favicon && entry.favicon !== tab.favicon) {
      entry.favicon = tab.favicon;
      changed = true;
    }
  });
  if (changed) localStorage.setItem('atlas_browsing_history', JSON.stringify(entries));
}
function openAtlasHistory() {
  const wasOpen = atlasMenuTrigger === atlasHistoryButton;
  closeAtlasMenu();
  if (wasOpen) return;
  const panel = document.createElement('div');
  panel.className = 'atlas-dropdown-menu atlas-history-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Atlas history');
  panel.innerHTML = `<div class="atlas-history-heading"><strong>History</strong><button aria-label="Close history">${atlasIcon('x')}</button></div><div class="atlas-history-list"></div>`;
  panel.querySelector('button').onclick = () => closeAtlasMenu(true);
  const list = panel.querySelector('.atlas-history-list');
  const entries = atlasHistoryEntries();
  if (!entries.length) list.innerHTML = '<p class="atlas-history-empty">Pages you open in Atlas will appear here.</p>';
  entries.forEach(entry => {
    const row = atlasHistoryRow(
      entry.title,
      entry.url,
      () => {
        closeAtlasMenu();
        createTab(entry.url, entry.title);
        switchView('browser');
      },
      () => {
        localStorage.setItem(
          'atlas_browsing_history',
          JSON.stringify(atlasHistoryEntries().filter(item => item.url !== entry.url))
        );
        refreshAtlasInternalPages();
      },
      entry.visitedAt
    );
    list.append(row);
  });
  const all = document.createElement('button');
  all.className = 'atlas-history-show-all';
  all.textContent = 'View all history';
  all.onclick = () => {
    closeAtlasMenu();
    openAtlasInternalTab('history');
  };
  panel.append(all);
  document.body.append(panel);
  atlasOpenMenu = panel;
  atlasMenuTrigger = atlasHistoryButton;
  atlasHistoryButton.setAttribute('aria-expanded', 'true');
  const rect = atlasHistoryButton.getBoundingClientRect();
  placeAtlasMenu(panel, rect.left, rect.top - panel.offsetHeight - 10);
  wireAtlasMenuKeyboard(panel);
  panel.querySelector('button').focus({ preventScroll: true });
}
atlasHistoryButton.onclick = openAtlasHistory;

function setAtlasSplitRatio(ratio) {
  atlasSplitRatio = Math.max(25, Math.min(75, ratio));
  viewportContainer.style.setProperty('--atlas-split-position', atlasSplitRatio + '%');
  atlasSplitDivider.setAttribute('aria-valuenow', String(Math.round(atlasSplitRatio)));
  localStorage.setItem('setting_split_ratio', String(atlasSplitRatio));
  syncAtlasSplitAddress();
}
function renderAtlasSplitTabs() {
  if (tabList.dataset.atlasSplitHeadersDetached === 'true') {
    renderAtlasSplitChoices();
    return;
  }
  const ids = atlasSplitPair || [];
  const items = ids.map(id => tabList.querySelector(`.tab-item[data-tab-id="${id}"]`));
  if (items.length === 2 && items.every(Boolean)) {
    if (
      atlasSplitGroupElement?.children.length &&
      [...atlasSplitGroupElement.children].some((item, index) => item.dataset.tabId !== ids[index])
    ) {
      atlasSplitGroupElement.replaceWith(...atlasSplitGroupElement.children);
    }
    if (!atlasSplitGroupElement) {
      atlasSplitGroupElement = document.createElement('div');
      atlasSplitGroupElement.className = 'atlas-tab-pair';
      atlasSplitGroupElement.setAttribute('role', 'group');
      atlasSplitGroupElement.setAttribute('aria-label', 'Split view tabs');
    }
    if (items[0].parentNode !== atlasSplitGroupElement) {
      items[0].before(atlasSplitGroupElement);
      atlasSplitGroupElement.append(...items);
    }
  } else if (atlasSplitGroupElement) {
    atlasSplitGroupElement.replaceWith(...atlasSplitGroupElement.children);
    atlasSplitGroupElement = null;
  }
  tabList.querySelectorAll('.tab-item').forEach(item => {
    const slot = atlasSplitPair?.indexOf(item.dataset.tabId) ?? -1;
    item.classList.toggle('atlas-paired-tab', slot >= 0);
    item.classList.toggle('atlas-pair-left', slot === 0);
    item.classList.toggle('atlas-pair-right', slot === 1);
  });
  renderAtlasSplitChoices();
}
function applyAtlasSplitLayout() {
  clearAtlasLinkPreview();
  const pair = atlasSplitPair?.map(id => tabs.find(tab => tab.id === id && !tab.isClosing));
  if (pair?.some(tab => !tab) || pair?.[0] === pair?.[1]) atlasSplitPair = null;
  if (atlasSplitPair && tabs.indexOf(pair[1]) !== tabs.indexOf(pair[0]) + 1) {
    tabs.splice(tabs.indexOf(pair[1]), 1);
    tabs.splice(tabs.indexOf(pair[0]) + 1, 0, pair[1]);
  }
  const enabled = Boolean(atlasSplitPair?.includes(activeTabId));
  syncAtlasSplitAddress();
  viewportContainer.classList.toggle('atlas-split', enabled);
  newTabShortcutsRow.inert = enabled;
  [newTabScreen, atlasSplitEmpty].forEach(screen => {
    screen.querySelector('.atlas-split-tab-picker').inert = !enabled;
  });
  atlasSplitButton.setAttribute('aria-pressed', String(enabled));
  atlasSplitButton.setAttribute('aria-label', enabled ? 'Exit split view' : 'Split view');
  atlasSplitDivider.hidden = !enabled;
  atlasSplitEmpty.hidden = true;
  atlasSplitEmpty.removeAttribute('data-atlas-pane');
  renderAtlasSplitTabs();
  loaderOverlay.removeAttribute('data-atlas-pane');
  newTabScreen.removeAttribute('data-atlas-pane');
  tabs.forEach(tab => {
    tab.iframe.removeAttribute('data-atlas-pane');
    tab.iframe.classList.remove('atlas-split-visible');
  });
  if (!enabled) return;
  setAtlasSplitRatio(atlasSplitRatio);
  pair.forEach((tab, index) => {
    const pane = index === 0 ? 'left' : 'right';
    if (tab.id === activeTabId) loaderOverlay.dataset.atlasPane = pane;
    if (tab.isNewTab) {
      if (tab.id === activeTabId) newTabScreen.dataset.atlasPane = pane;
      else {
        atlasSplitEmpty.hidden = false;
        atlasSplitEmpty.dataset.atlasPane = pane;
        atlasSplitEmpty.querySelector('.new-tab-title').textContent =
          tab.url === 'atlas://search' ? 'Search' : 'New Tab';
      }
    } else {
      tab.iframe.dataset.atlasPane = pane;
      tab.iframe.classList.add('atlas-split-visible');
    }
  });
}
function toggleAtlasSplit() {
  closeAtlasMenu();
  if (atlasSplitTransition) {
    if (atlasSplitPhase !== 'enter') return;
  }
  if (atlasSplitPair?.includes(activeTabId)) {
    exitAtlasSplit();
    return;
  }
  const primary = tabs.find(tab => tab.id === activeTabId);
  if (!primary) return;
  cancelAtlasSplitAnimation();

  const primaryHeader = tabList.querySelector(`.tab-item[data-tab-id="${primary.id}"]`);
  const primaryWidth = primaryHeader ? { width: primaryHeader.getBoundingClientRect().width } : null;
  const secondary = createTab('/new-tab', 'New Tab', false, false);
  if (!secondary) return;
  atlasSplitPair = [primary.id, secondary.id];
  setAtlasSplitRatio(50);
  tabs.splice(tabs.indexOf(secondary), 1);
  tabs.splice(tabs.indexOf(primary) + 1, 0, secondary);
  runAtlasSplitTransition(() => activateTab(primary.id), 'enter', 'right', false, null, primaryWidth);
}
function cancelAtlasSplitAnimation() {
  atlasSplitGeneration++;
  clearTimeout(atlasSplitTimer);
  atlasSplitTimer = null;
  atlasSplitAnimations.forEach(({ element, animation }) => {
    animation.cancel();
    element.classList.remove('atlas-split-expanding');
  });
  atlasSplitAnimations = [];
  delete viewportContainer.dataset.atlasSplitAnimation;
  delete viewportContainer.dataset.atlasSplitAnimationPane;
  delete tabList.dataset.atlasSplitAnimation;
  delete tabList.dataset.atlasSplitAnimationPane;
  delete tabList.dataset.atlasSplitRemoveBlank;
  delete tabList.dataset.atlasSplitHeadersDetached;
  delete viewportContainer.dataset.atlasSplitRemoveBlank;
  tabList.style?.removeProperty('--atlas-tab-collapse-width');
  [viewportContainer, tabList].forEach(container => {
    container.style?.removeProperty('--atlas-split-close-opacity');
    container.style?.removeProperty('--atlas-split-close-transform');
  });
  newTabScreen.classList.remove('atlas-frame-enter');
  tabs.forEach(tab => tab.iframe?.classList.remove('atlas-frame-enter'));
  atlasSplitTransition = false;
  atlasSplitPhase = null;
}
function atlasPaneElement(tabId) {
  const tab = tabs.find(tab => tab.id === tabId && !tab.isClosing);
  if (!tab) return null;
  if (!tab.isNewTab) return tab.iframe;
  return tabId === activeTabId ? newTabScreen : atlasSplitEmpty;
}
function atlasSplitHeaderSnapshot() {
  return (atlasSplitPair || []).map(id => {
    const element = tabList.querySelector(`.tab-item[data-tab-id="${id}"]`);
    return element?.getBoundingClientRect ? { element, width: element.getBoundingClientRect().width } : null;
  });
}
function animateAtlasSplitHeaders(phase, before, removeBlank, pane) {
  if (!tabList.cloneNode || !atlasSplitGroupElement?.animate || !before.every(Boolean)) return;
  if (phase === 'exit' && !removeBlank) {
    separateAtlasSplitHeaders();
    return;
  }
  const group = atlasSplitGroupElement;
  let widths;
  if (phase === 'exit') {
    const measureBar = tabList.parentNode.cloneNode(true);
    const measure = measureBar.querySelector('.tab-list');
    [measureBar, ...measureBar.querySelectorAll('[id]')].forEach(node => node.removeAttribute('id'));
    measure.classList.add('atlas-tab-measure');
    measureBar.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;width:${tabList.parentNode.getBoundingClientRect().width}px;`;
    const pair = measure.querySelector('.atlas-tab-pair');
    if (removeBlank) pair.querySelector(`.atlas-pair-${pane}`)?.remove();
    pair.replaceWith(...pair.children);
    measure.querySelectorAll('.tab-item').forEach(item => {
      item.classList.remove(
        'atlas-paired-tab',
        'atlas-pair-left',
        'atlas-pair-right',
        'opening',
        'closing',
        'tab-compact'
      );
    });
    document.body.append(measureBar);
    measure
      .querySelectorAll('.tab-item')
      .forEach(item =>
        item.classList.toggle(
          'tab-compact',
          item.getBoundingClientRect().width < 68 && !item.classList.contains('pinned')
        )
      );
    widths = before.map(
      ({ element }) =>
        measure.querySelector(`[data-tab-id="${element.dataset.tabId}"]`)?.getBoundingClientRect().width || 0
    );
    measureBar.remove();
  } else if (phase === 'enter') {
    widths = before.map(({ element }) => element.getBoundingClientRect().width);
  } else return;
  const motion = {
    duration: phase === 'enter' ? 320 : 280,
    easing: phase === 'exit' ? 'cubic-bezier(.4,0,.2,1)' : 'cubic-bezier(.2,.7,.3,1)',
    fill: 'both',
  };
  const finalGroupWidth = group.getBoundingClientRect().width;
  const start = phase === 'enter' ? before[0].width : finalGroupWidth;
  const end =
    phase === 'exit' ? widths.reduce((sum, width) => sum + width, 0) + (removeBlank ? 0 : 6) : finalGroupWidth;
  const animation = group.animate(
    [
      {
        width: `${start}px`,
        maxWidth: `${start}px`,
        flexBasis: `${start}px`,
        flexShrink: 0,
        padding: phase === 'enter' ? '0px' : '3px',
        gap: phase === 'enter' ? '0px' : '3px',
      },
      {
        width: `${end}px`,
        maxWidth: `${end}px`,
        flexBasis: `${end}px`,
        flexShrink: 0,
        padding: phase === 'exit' ? '0px' : '3px',
        gap: phase === 'exit' ? (removeBlank ? '0px' : '6px') : '3px',
      },
    ],
    motion
  );
  atlasSplitAnimations.push({ element: group, animation });
  before.forEach(({ element, width }, index) => {
    const from = phase === 'enter' && index === 1 ? 0 : width;
    const to = widths[index];
    const animation = element.animate(
      [
        {
          width: `${from}px`,
          maxWidth: `${from}px`,
          flexBasis: `${from}px`,
          flexGrow: 0,
          minWidth: '0px',
          paddingLeft: from === 0 ? '0px' : phase === 'enter' ? '12px' : '7px',
          paddingRight: from === 0 ? '0px' : phase === 'enter' ? '10px' : '5px',
          gap: phase === 'enter' ? '8px' : '5px',
        },
        {
          width: `${to}px`,
          maxWidth: `${to}px`,
          flexBasis: `${to}px`,
          flexGrow: 0,
          minWidth: '0px',
          paddingLeft: to === 0 ? '0px' : phase === 'exit' ? '12px' : '7px',
          paddingRight: to === 0 ? '0px' : phase === 'exit' ? '10px' : '5px',
          gap: phase === 'exit' ? '8px' : '5px',
        },
      ],
      motion
    );
    atlasSplitAnimations.push({ element, animation });
  });
}
function separateAtlasSplitHeaders() {
  const group = atlasSplitGroupElement;
  const elements = [...tabList.querySelectorAll('.tab-item')];
  const add = typeof newTabBtn === 'undefined' ? null : newTabBtn;
  if (add) elements.push(add);
  const snapshot = elements.map(element => ({
    element,
    rect: element.getBoundingClientRect(),
    children: [...element.querySelectorAll('.tab-icon, .tab-title, .tab-close')].map(child => ({
      element: child,
      rect: child.getBoundingClientRect(),
    })),
  }));
  tabList.dataset.atlasSplitHeadersDetached = 'true';
  group.replaceWith(...group.children);
  atlasSplitGroupElement = null;
  elements.forEach(element =>
    element.classList.remove('atlas-paired-tab', 'atlas-pair-left', 'atlas-pair-right', 'opening')
  );

  const after = snapshot.map(({ element, children }) => ({
    rect: element.getBoundingClientRect(),
    children: children.map(child => child.element.getBoundingClientRect()),
  }));
  const motion = { duration: 280, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' };
  const animate = (element, keyframes) => {
    const animation = element.animate(keyframes, motion);
    atlasSplitAnimations.push({ element, animation });
  };
  snapshot.forEach(({ element, rect, children }, index) => {
    const end = after[index];
    if (!rect.width || !end.rect.width) return;
    const x = rect.left - end.rect.left,
      y = rect.top - end.rect.top;
    const reveal = Math.max(0, end.rect.width - rect.width);
    animate(element, [
      { transform: `translate3d(${x}px,${y}px,0)`, clipPath: `inset(0 ${reveal}px 0 0 round 8px)` },
      { transform: 'none', clipPath: 'inset(0 0px 0 0 round 8px)' },
    ]);
    children.forEach((child, childIndex) => {
      const offset = child.rect.left - rect.left - (end.children[childIndex].left - end.rect.left);
      const reveal = Math.max(0, end.children[childIndex].width - child.rect.width);
      if (Math.abs(offset) > 0.1 || reveal > 0.1)
        animate(child.element, [
          { transform: `translate3d(${offset}px,0,0)`, clipPath: `inset(0 ${reveal}px 0 0)` },
          { transform: 'none', clipPath: 'inset(0 0px 0 0)' },
        ]);
    });
  });
}
function atlasPaneGeometry(element) {
  if (!element?.getBoundingClientRect || !viewportContainer.getBoundingClientRect) return null;
  const rect = element.getBoundingClientRect();
  const parent = viewportContainer.getBoundingClientRect();
  return rect.width > 0 && parent.width > 0 ? { left: rect.left - parent.left, width: rect.width } : null;
}
function animateAtlasPaneGeometry(element, from, to, phase) {
  if (!element?.animate || !from || !to) return;
  element.classList.add('atlas-split-expanding');

  const frames = [
    { left: `${from.left}px`, width: `${from.width}px` },
    { left: `${to.left}px`, width: `${to.width}px` },
  ];
  const animation = element.animate(frames, {
    duration: phase === 'enter' ? 320 : 220,
    easing: phase === 'exit' ? 'cubic-bezier(.4,0,.2,1)' : 'cubic-bezier(.2,.7,.3,1)',
    fill: 'both',
  });
  atlasSplitAnimations.push({ element, animation });
}
function animateAtlasSplitEntrance(from) {
  const incoming = atlasPaneElement(atlasSplitPair?.[1]);
  const to = atlasPaneGeometry(incoming);
  if (!from || !to || !atlasSplitDivider.animate) return;

  const edge = from.left + from.width;
  animateAtlasPaneGeometry(incoming, { left: edge + 10, width: 0 }, to, 'enter');
  const animation = atlasSplitDivider.animate([{ left: `${edge}px` }, { left: `${to.left - 10}px` }], {
    duration: 320,
    easing: 'cubic-bezier(.2,.7,.3,1)',
    fill: 'both',
  });
  atlasSplitAnimations.push({ element: atlasSplitDivider, animation });
}
function syncAtlasSplitAddress() {
  if (typeof bottomBar === 'undefined' || !bottomBar?.getBoundingClientRect) return;
  const bar = bottomBar.getBoundingClientRect();
  const leftControls = bottomBar.querySelector('.bottom-left-controls')?.getBoundingClientRect();
  const rightControls = bottomBar.querySelector('.nav-buttons')?.getBoundingClientRect();
  if (!bar.width || !leftControls || !rightControls) return;
  const safeLeft = leftControls.right + 14;
  const safeRight = rightControls.left - 14;
  const center = bar.left + bar.width / 2;
  const width = Math.max(0, Math.min(680, 2 * Math.min(center - safeLeft, safeRight - center)));
  const left = center - width / 2 - bar.left;
  const nextLeft = `${left}px`,
    nextWidth = `${width}px`;
  if (bottomBar.style.getPropertyValue('--atlas-address-left') !== nextLeft)
    bottomBar.style.setProperty('--atlas-address-left', nextLeft);
  if (bottomBar.style.getPropertyValue('--atlas-address-width') !== nextWidth)
    bottomBar.style.setProperty('--atlas-address-width', nextWidth);
  if (bottomBar.dataset.atlasAddressLayout !== 'true') bottomBar.dataset.atlasAddressLayout = 'true';
}
window.addEventListener('resize', syncAtlasSplitAddress);
function runAtlasSplitTransition(
  update,
  phase,
  pane = 'right',
  removeBlank = false,
  keepId = null,
  primaryWidth = null
) {
  const headerBefore = atlasSplitHeaderSnapshot();
  if (primaryWidth && headerBefore[0]) Object.assign(headerBefore[0], primaryWidth);
  const retained = atlasPaneElement(keepId || atlasSplitPair?.[0]);
  const before = phase === 'replace' ? null : atlasPaneGeometry(retained);
  const outgoing =
    phase === 'exit'
      ? viewportContainer.querySelector?.(
          `[data-atlas-pane="${pane}"]:is(.browser-frame, .new-tab-screen, .atlas-split-empty)`
        )
      : null;
  const outgoingGeometry = atlasPaneGeometry(outgoing);
  const currentStyle = outgoing && typeof getComputedStyle === 'function' ? getComputedStyle(outgoing) : null;
  const closeOpacity = currentStyle?.opacity || '1';
  const closeTransform = currentStyle?.transform || 'none';
  cancelAtlasSplitAnimation();
  const generation = atlasSplitGeneration;
  atlasSplitTransition = true;
  atlasSplitPhase = phase;
  const commit = () => {
    if (generation === atlasSplitGeneration) update();
  };
  const finish = () => {
    if (generation !== atlasSplitGeneration) return;
    delete viewportContainer.dataset.atlasSplitAnimation;
    delete viewportContainer.dataset.atlasSplitAnimationPane;
    delete tabList.dataset.atlasSplitAnimation;
    delete tabList.dataset.atlasSplitAnimationPane;
    delete tabList.dataset.atlasSplitRemoveBlank;
    delete tabList.dataset.atlasSplitHeadersDetached;
    delete viewportContainer.dataset.atlasSplitRemoveBlank;
    tabList.style?.removeProperty('--atlas-tab-collapse-width');
    atlasSplitAnimations.forEach(({ element, animation }) => {
      animation.cancel();
      element.classList.remove('atlas-split-expanding');
    });
    atlasSplitAnimations = [];
    [viewportContainer, tabList].forEach(container => {
      container.style?.removeProperty('--atlas-split-close-opacity');
      container.style?.removeProperty('--atlas-split-close-transform');
    });
    atlasSplitTransition = false;
    atlasSplitPhase = null;
    atlasSplitTimer = null;
    if (typeof updateTabSizing === 'function') updateTabSizing();
    syncAtlasSplitAddress();
  };
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    commit();
    finish();
    return;
  }

  if (phase !== 'exit') commit();
  if (phase === 'exit')
    [viewportContainer, tabList].forEach(container => {
      container.style?.setProperty('--atlas-split-close-opacity', closeOpacity);
      container.style?.setProperty('--atlas-split-close-transform', closeTransform);
    });
  viewportContainer.dataset.atlasSplitAnimation = phase;
  viewportContainer.dataset.atlasSplitAnimationPane = pane;
  tabList.dataset.atlasSplitAnimation = phase;
  tabList.dataset.atlasSplitAnimationPane = pane;
  if (removeBlank) {
    const closingTab = tabList.querySelector(`.atlas-pair-${pane}`);
    const closingWidth = closingTab?.getBoundingClientRect?.().width;
    if (closingWidth) tabList.style?.setProperty('--atlas-tab-collapse-width', `${closingWidth}px`);
    tabList.dataset.atlasSplitRemoveBlank = 'true';
    viewportContainer.dataset.atlasSplitRemoveBlank = 'true';
  }
  if (phase === 'enter') {
    animateAtlasPaneGeometry(retained, before, atlasPaneGeometry(retained), phase);
    animateAtlasSplitEntrance(before);
  }
  if (phase === 'exit') {
    const width = viewportContainer.clientWidth;
    animateAtlasPaneGeometry(retained, before, width > 0 ? { left: 0, width } : null, phase);

    const exitLeft = pane === 'left' ? -(outgoingGeometry?.width || 0) - 10 : width + 10;
    animateAtlasPaneGeometry(
      outgoing,
      outgoingGeometry,
      outgoingGeometry && { left: exitLeft, width: outgoingGeometry.width },
      phase
    );
    if (outgoingGeometry && atlasSplitDivider.animate) {
      const animation = atlasSplitDivider.animate(
        [
          {
            left: `${pane === 'left' ? outgoingGeometry.left + outgoingGeometry.width : outgoingGeometry.left - 10}px`,
          },
          { left: `${pane === 'left' ? 0 : width}px` },
        ],
        { duration: 220, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }
      );
      atlasSplitAnimations.push({ element: atlasSplitDivider, animation });
    }
    const keep = tabs.find(tab => tab.id === keepId);
    if (keep && atlasSplitPair?.includes(activeTabId) && typeof bottomAddressBar !== 'undefined') {
      bottomAddressBar.value = keep.url;
    }
  }
  syncAtlasSplitAddress();
  animateAtlasSplitHeaders(phase, headerBefore, removeBlank, pane);
  const complete = () => {
    if (generation !== atlasSplitGeneration) return;
    if (phase === 'exit') commit();
    finish();
    atlasSplitAnimations = [];
  };
  const pendingAnimations = atlasSplitAnimations
    .map(({ animation }) => animation.finished)
    .filter(finished => finished?.then);
  const geometryDone = pendingAnimations.length ? Promise.all(pendingAnimations) : null;
  if (geometryDone?.then) {
    geometryDone.then(complete, () => {});
  } else {
    atlasSplitTimer = setTimeout(complete, 230);
  }
}
function exitAtlasSplit(closingId = null) {
  const pairIds = atlasSplitPair.slice();
  const pair = pairIds.map(id => tabs.find(tab => tab.id === id && !tab.isClosing));
  if (pair.some(tab => !tab)) return;
  const blank = closingId
    ? pair.find(tab => tab.id === closingId)
    : pair[1].isNewTab
      ? pair[1]
      : pair[0].isNewTab
        ? pair[0]
        : null;
  const keep = blank ? pair.find(tab => tab !== blank) : pair.find(tab => tab.id === activeTabId);
  runAtlasSplitTransition(
    () => {
      if (atlasSplitPair?.every((id, index) => id === pairIds[index])) {
        const target = pairIds.includes(activeTabId) ? keep.id : activeTabId;
        atlasSplitPair = null;
        if (tabs.some(tab => tab.id === target && !tab.isClosing)) activateTab(target);
        else applyAtlasSplitLayout();

        if (blank && tabs.includes(blank) && !blank.isClosing) closeTab(blank.id, false);
      }
    },
    'exit',
    pairIds.indexOf(keep.id) === 0 ? 'right' : 'left',
    Boolean(blank),
    keep.id
  );
}
atlasSplitButton.onclick = toggleAtlasSplit;
function handleAtlasSplitClose(tabId) {
  if (!atlasSplitPair?.includes(tabId) || !atlasSplitPair.includes(activeTabId)) return false;
  if (!atlasSplitTransition || atlasSplitPhase === 'enter') exitAtlasSplit(tabId);
  return true;
}
function onAtlasTabClosed(tabId) {
  if (atlasSplitPair?.includes(tabId)) {
    cancelAtlasSplitAnimation();
    atlasSplitPair = null;
    applyAtlasSplitLayout();
  }
}
function handleAtlasFramePointer(frame) {
  const tab = tabs.find(tab => tab.iframe.contentWindow === frame && !tab.isClosing);
  if (!tab) return;
  closeAtlasMenu();
  if (atlasSplitPair?.includes(tab.id) && activeTabId !== tab.id) activateTab(tab.id);
}
window.addEventListener('message', e => {
  if (e.data?.type === '__atlas_frame_pointer') handleAtlasFramePointer(e.source);
});
window.addEventListener('blur', () => closeAtlasMenu());
document.getElementById('atlasSplitSearch').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.value.trim()) return;
  e.preventDefault();
  const otherId = atlasSplitPair?.find(id => id !== activeTabId);
  if (!otherId) return;
  const input = e.target.value.trim();
  e.target.value = '';
  activateTab(otherId);
  navigateTab(otherId, input);
});
const newTabEngineSelect = document.getElementById('newTabSearchEngine');
const splitEngine = document.getElementById('atlasSplitEngine');
splitEngine.value = newTabEngineSelect.value;
splitEngine.addEventListener('change', () => {
  newTabEngineSelect.value = splitEngine.value;
  newTabEngineSelect.dispatchEvent(new Event('change'));
});
newTabEngineSelect.addEventListener('change', () => {
  splitEngine.value = newTabEngineSelect.value;
  splitEngine._atlasRefresh?.();
});
hydrateAtlasDropdowns(atlasSplitEmpty);
atlasSplitDivider.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault();
  atlasSplitDivider.setPointerCapture(e.pointerId);
  viewportContainer.classList.add('atlas-split-resizing');
});
atlasSplitDivider.addEventListener('pointermove', e => {
  if (!atlasSplitDivider.hasPointerCapture(e.pointerId)) return;
  const rect = viewportContainer.getBoundingClientRect();
  setAtlasSplitRatio(((e.clientX - rect.left) / rect.width) * 100);
});
function finishAtlasSplitResize() {
  viewportContainer.classList.remove('atlas-split-resizing');
}
atlasSplitDivider.addEventListener('pointerup', finishAtlasSplitResize);
atlasSplitDivider.addEventListener('pointercancel', finishAtlasSplitResize);
atlasSplitDivider.addEventListener('lostpointercapture', finishAtlasSplitResize);
atlasSplitDivider.addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return;
  e.preventDefault();
  setAtlasSplitRatio(
    e.key === 'Home' ? 50 : atlasSplitRatio + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 2)
  );
});

function atlasTabUnits() {
  const units = [],
    seen = new Set();
  for (const tab of tabs) {
    if (seen.has(tab.id)) continue;
    const group =
      atlasSplitPair?.includes(tab.id) && atlasSplitPair.every(id => tabs.some(tab => tab.id === id))
        ? atlasSplitPair.slice()
        : [tab.id];
    group.forEach(id => seen.add(id));
    units.push(group);
  }
  return units;
}
function startAtlasTabDrag(e, tab) {
  if (e.target.closest('.tab-close') || e.button !== 0 || isDraggingTab) return;
  e.preventDefault();
  e.currentTarget.focus({ preventScroll: true });
  const units = atlasTabUnits();
  const initial = units.findIndex(unit => unit.includes(tab.id));
  const elements = units.map(unit => unit.map(id => tabList.querySelector(`.tab-item[data-tab-id="${id}"]`)));
  const rects = elements.map(items => {
    if (items.length === 2) {
      const rect = items[0].closest('.atlas-tab-pair').getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }
    const first = items[0].getBoundingClientRect(),
      last = items.at(-1).getBoundingClientRect();
    return { left: first.left, right: last.right, width: last.right - first.left };
  });
  const moving = rects[initial],
    bounds = tabList.getBoundingClientRect();
  let moved = false,
    target = initial;
  const startX = e.clientX;
  const move = event => {
    const delta = event.clientX - startX;
    if (!moved && Math.abs(delta) <= 4) return;
    moved = true;
    isDraggingTab = true;
    const dx = Math.max(bounds.left - moving.left, Math.min(bounds.right - moving.right, delta));
    elements[initial].forEach(el => {
      el.classList.add('tab-is-dragging');
      el.style.transform = `translateX(${dx}px)`;
    });
    const center = moving.left + moving.width / 2 + dx;
    target = initial;
    rects.forEach((rect, index) => {
      if (index > initial && center > (rect.left + rect.right) / 2) target = index;
      if (index < initial && center < (rect.left + rect.right) / 2) target = Math.min(target, index);
    });
    elements.forEach((items, index) => {
      if (index === initial) return;
      const offset =
        index > initial && index <= target
          ? -(moving.width + 6)
          : index < initial && index >= target
            ? moving.width + 6
            : 0;
      items.forEach(el => {
        el.classList.add('tab-shifting');
        el.style.transform = `translateX(${offset}px)`;
      });
    });
    if (atlasSplitGroupElement && !units[initial].includes(atlasSplitPair?.[0])) {
      const index = units.findIndex(unit => unit.length === 2);
      const offset =
        index > initial && index <= target
          ? -(moving.width + 6)
          : index < initial && index >= target
            ? moving.width + 6
            : 0;
      atlasSplitGroupElement.style.transform = `translateX(${offset}px)`;
      elements[index]?.forEach(el => {
        el.style.transform = '';
      });
    } else if (atlasSplitGroupElement && units[initial].length === 2) {
      atlasSplitGroupElement.classList.add('atlas-group-dragging');
      atlasSplitGroupElement.style.transform = `translateX(${dx}px)`;
      elements[initial].forEach(el => {
        el.style.transform = '';
      });
    }
  };
  const finish = event => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if (!moved) {
      activateTab(tab.id);
      return;
    }
    if (event.type !== 'pointercancel') {
      const [unit] = units.splice(initial, 1);
      units.splice(target, 0, unit);
      const ids = units.flat();
      tabs = [
        ...ids.map(id => tabs.find(tab => tab.id === id)).filter(Boolean),
        ...tabs.filter(tab => !ids.includes(tab.id)),
      ];
    }
    elements.flat().forEach(el => {
      el.classList.remove('tab-is-dragging', 'tab-shifting');
      el.style.transform = '';
    });
    if (atlasSplitGroupElement) {
      atlasSplitGroupElement.style.transform = '';
      atlasSplitGroupElement.classList.remove('atlas-group-dragging');
    }
    isDraggingTab = false;
    renderTabs();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}
