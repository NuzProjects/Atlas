function sendAtlasInternalState(tab, error = '') {
  const styles = getComputedStyle(document.documentElement);
  const theme = Object.fromEntries(
    ['--bg', '--bg-card', '--btn-bg', '--btn-hover', '--text', '--text-muted'].map(name => [
      name,
      styles.getPropertyValue(name),
    ])
  );
  AtlasEngines.post(
    tab.iframe,
    {
      type: '__atlas_internal_state',
      entries: atlasHistoryEntries().map(entry => ({
        ...entry,
        icon:
          entry.isErrorPage ||
          /^(?:Connection Timed Out|Connection Error|Proxy Engine Unavailable)$/i.test(entry.title || '')
            ? '/assets/tab-globe.svg'
            : officialAtlasSite(entry.url)?.icon || getFaviconUrl(entry.url),
      })),
      theme,
      error,
    },
    atlasAppOrigin()
  );
}
function refreshAtlasInternalPages() {
  tabs.filter(tab => tab.url === 'atlas://history').forEach(tab => sendAtlasInternalState(tab));
}
window.addEventListener('storage', e => {
  if (['atlas_browsing_history', 'atlas_tab_sessions'].includes(e.key)) refreshAtlasInternalPages();
});
window.addEventListener('message', e => {
  if (e.origin !== atlasAppOrigin() || e.data?.type !== '__atlas_internal') return;
  const tab = tabs.find(
    tab => !tab.isClosing && tab.url === 'atlas://history' && tab.iframe.contentWindow === e.source
  );
  if (!tab) return;
  const data = e.data;
  if (data.action === 'ready') {
    tab.isLoading = false;
    if (tab.id === activeTabId) hideLoader();
  }
  if (data.action === 'navigate' && ['new', 'search', 'history'].includes(data.page)) {
    navigateTab(tab.id, 'atlas://' + data.page);
    return;
  }
  if (
    data.action === 'open' &&
    typeof data.url === 'string' &&
    (/^https?:\/\//i.test(data.url) || atlasInternalPage(data.url))
  )
    createTab(data.url);
  if (tab.url === 'atlas://history') {
    if (data.action === 'remove-visit')
      localStorage.setItem(
        'atlas_browsing_history',
        JSON.stringify(atlasHistoryEntries().filter(entry => entry.url !== data.url))
      );
  }
  refreshAtlasInternalPages();
});
new MutationObserver(refreshAtlasInternalPages).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['style'],
});
