let atlasSessionRestoring = false;
const atlasSessionId = crypto.randomUUID();
function readAtlasSession(value) {
  try {
    const session = typeof value === 'string' ? JSON.parse(value) : value;
    if (!session || !Array.isArray(session.tabs)) return null;
    const indices = new Map(),
      clean = [];
    session.tabs.slice(0, MAX_TABS).forEach((tab, index) => {
      if (!tab || typeof tab.url !== 'string') return;
      if (!(
        tab.url === '/new-tab' ||
        /^atlas:\/\/(new|search|history)$/i.test(tab.url) ||
        /^https?:\/\//i.test(tab.url)
      ))
        return;
      indices.set(index, clean.length);
      const trail =
        Array.isArray(tab.navigationEntries) &&
        tab.navigationEntries.length <= 100 &&
        tab.navigationEntries.every(
          url =>
            typeof url === 'string' &&
            url.length <= 2048 &&
            (/^https?:\/\//i.test(url) || /^atlas:\/\/(new|search|history)$/i.test(url))
        ) &&
        Number.isInteger(tab.navigationIndex) &&
        tab.navigationIndex >= 0 &&
        tab.navigationIndex < tab.navigationEntries.length &&
        tab.navigationEntries[tab.navigationIndex] === tab.url
          ? { navigationEntries: [...tab.navigationEntries], navigationIndex: tab.navigationIndex }
          : {};
      clean.push({
        ...trail,
        url: tab.url,
        title: typeof tab.title === 'string' ? tab.title : 'New Tab',
        isNewTab: tab.url === '/new-tab' || ['atlas://new', 'atlas://search'].includes(tab.url),
      });
    });
    if (!clean.length) return null;
    return {
      id: typeof session.id === 'string' ? session.id : crypto.randomUUID(),
      tabs: clean,
      active: indices.get(session.active) ?? 0,
      split:
        Array.isArray(session.split) &&
        session.split.length === 2 &&
        session.split.every(index => indices.has(index)) &&
        session.split[0] !== session.split[1]
          ? session.split.map(index => indices.get(index))
          : null,
      ratio: Math.max(25, Math.min(75, Number(session.ratio) || 50)),
    };
  } catch {
    return null;
  }
}
function atlasSavedSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem('atlas_tab_sessions') || '[]');
    return Array.isArray(saved) ? saved.map(readAtlasSession).filter(Boolean).slice(0, 20) : [];
  } catch {
    return [];
  }
}
function persistAtlasSession() {
  if (atlasSessionRestoring) return;
  const open = tabs.filter(tab => !tab.isClosing);
  if (!open.length || (open.length === 1 && open[0].isNewTab)) {
    localStorage.removeItem('atlas_current_session');
    return;
  }
  const split = atlasSplitPair?.map(id => open.findIndex(tab => tab.id === id));
  const session = {
    id: atlasSessionId,
    tabs: open.map(tab => ({
      url: tab.url,
      title: tab.title,
      navigationEntries: tab.navigationEntries,
      navigationIndex: tab.navigationIndex,
    })),
    active: Math.max(
      0,
      open.findIndex(tab => tab.id === activeTabId)
    ),
    split: split?.every(index => index >= 0) ? split : null,
    ratio: atlasSplitRatio,
  };
  try {
    localStorage.setItem('atlas_current_session', JSON.stringify(session));
  } catch {}
}
function restoreAtlasSession(session) {
  session = readAtlasSession(session);
  if (!session || tabs.length + session.tabs.length > MAX_TABS) return false;
  atlasSessionRestoring = true;
  const restored = [];
  try {
    session.tabs.forEach(saved => {
      const tab = createTab(saved.url, saved.title, false);
      if (!tab) return;
      if (saved.navigationEntries) {
        tab.navigationEntries = [...saved.navigationEntries];
        tab.navigationIndex = saved.navigationIndex;
      }
      restored.push(tab);
    });
    if (session.split && restored.length === session.tabs.length) {
      atlasSplitPair = session.split.map(index => restored[index].id);
      setAtlasSplitRatio(50);
    }
    if (restored.length) {
      activateTab(restored[session.active]?.id || restored[0].id);
      switchView('browser');
    }
  } finally {
    atlasSessionRestoring = false;
  }
  persistAtlasSession();
  return restored.length === session.tabs.length;
}
function dismissAtlasRestore() {
  document.querySelectorAll('.atlas-restore-backdrop').forEach(backdrop => {
    if (backdrop.inert) return;
    backdrop.classList.remove('active');
    backdrop.inert = true;
    setTimeout(() => backdrop.remove(), 230);
  });
}

document.querySelector('.discord-link')?.addEventListener('click', dismissAtlasRestore);
function promptAtlasRestore(session) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop atlas-restore-backdrop';
  backdrop.innerHTML = `<div class="modal-card" role="dialog" aria-labelledby="atlasRestoreTitle"><div class="atlas-restore-heading"><h2 id="atlasRestoreTitle" class="atlas-restore-title">Restore Tabs</h2><button class="atlas-restore-close" aria-label="Dismiss restore tabs" data-restore="close">${atlasIcon('x')}</button></div><button class="modal-btn" data-restore="restore">Restore tabs</button><p class="atlas-restore-error" role="status" hidden></p></div>`;
  const dismiss = dismissAtlasRestore;
  backdrop.querySelector('[data-restore="close"]').onclick = dismiss;
  backdrop.querySelector('[data-restore="restore"]').onclick = () => {
    if (restoreAtlasSession(session)) dismiss();
    else {
      const error = backdrop.querySelector('.atlas-restore-error');
      error.hidden = false;
      error.textContent = 'Close some tabs first to make room for this session.';
    }
  };
  backdrop.onclick = e => {
    if (e.target === backdrop) dismiss();
  };
  backdrop.onkeydown = e => {
    if (e.key === 'Escape') dismiss();
  };
  document.body.append(backdrop);
  void backdrop.offsetWidth;
  backdrop.classList.add('active');
}
window.addEventListener('pagehide', persistAtlasSession);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persistAtlasSession();
});
const atlasPreviousSession = readAtlasSession(localStorage.getItem('atlas_current_session'));
if (atlasPreviousSession && !window.__atlasBlankBoot) {
  localStorage.setItem(
    'atlas_tab_sessions',
    JSON.stringify(
      [atlasPreviousSession, ...atlasSavedSessions().filter(session => session.id !== atlasPreviousSession.id)].slice(
        0,
        20
      )
    )
  );
  localStorage.removeItem('atlas_current_session');
  if (!new URLSearchParams(atlasAppURL().search).has('open')) promptAtlasRestore(atlasPreviousSession);
}
const atlasOpenTarget = new URLSearchParams(atlasAppURL().search).get('open');
if (atlasOpenTarget && !window.__atlasBlankBoot) {
  if (atlasInternalPage(atlasOpenTarget)) {
    createTab(atlasOpenTarget, null, false);
    switchView('browser');
  } else {
    try {
      const target = new URL(/^https?:\/\//i.test(atlasOpenTarget) ? atlasOpenTarget : 'https://' + atlasOpenTarget);
      if (['http:', 'https:'].includes(target.protocol)) {
        createTab(target.href, null, false);
        switchView('browser');
      }
    } catch (_) {}
  }
}
