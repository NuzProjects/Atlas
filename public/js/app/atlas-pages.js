(() => {
  const page = 'history';
  const content = document.getElementById('pageContent');
  const tools = document.getElementById('pageTools');
  const status = document.getElementById('pageStatus');
  let state = { entries: [] };
  let filter = '';
  const removing = new Set();
  const send = (action, data = {}) =>
    parent.postMessage({ type: '__atlas_internal', action, ...data }, location.origin);
  const escape = text =>
    String(text || '').replace(
      /[&<>"']/g,
      char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    );
  const closeIcon = atlasIcon('x');
  document.title = 'History';
  document.getElementById('pageTitle').textContent = document.title;
  document.querySelectorAll('[data-page]').forEach(button => {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    button.onclick = () => send('navigate', { page: button.dataset.page });
  });
  function removeRow(row, action, data) {
    if (row.inert) return;
    row.inert = true;
    removing.add(data.url);
    state.entries = state.entries.filter(entry => entry.url !== data.url);
    send(action, data);
    const animation = row.animate(
      [
        { height: row.offsetHeight + 'px', minHeight: '0px', opacity: 1 },
        { height: '0px', minHeight: '0px', opacity: 0 },
      ],
      {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180,
        easing: 'cubic-bezier(.4,0,.2,1)',
        fill: 'forwards',
      }
    );
    animation.finished
      .catch(() => {})
      .then(() => {
        removing.delete(data.url);
        renderHistory();
      });
  }
  function historyRow(entry) {
    const row = document.createElement('div');
    row.className = 'history-row';
    const link = document.createElement('button');
    link.className = 'history-entry';
    const favicon =
      entry.icon ||
      (/^https?:\/\//i.test(entry.url)
        ? '/api/favicon?domain=' + encodeURIComponent(new URL(entry.url).hostname)
        : '/assets/atlas.png');
    let hostname = entry.url;
    try {
      hostname = new URL(entry.url).host;
    } catch (_) {}
    const time = document.createElement('time');
    time.className = 'history-time';
    if (entry.visitedAt) {
      const date = new Date(entry.visitedAt);
      time.dateTime = date.toISOString();
      time.textContent = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      time.title = date.toLocaleString();
    }
    link.innerHTML = `<img src="${escape(favicon)}" alt=""><span><strong>${escape(entry.title || entry.url)}</strong><small>${escape(hostname)}</small></span>`;
    link.querySelector('img').onerror = e => {
      e.target.onerror = null;
      e.target.src = '/assets/tab-globe.svg';
    };
    link.onclick = () => send('open', { url: entry.url });
    const remove = document.createElement('button');
    remove.className = 'history-delete';
    remove.setAttribute('aria-label', 'Remove ' + (entry.title || entry.url));
    remove.innerHTML = closeIcon;
    remove.onclick = () => removeRow(row, 'remove-visit', { url: entry.url });
    row.append(time, link, remove);
    return row;
  }
  function renderHistory() {
    if (removing.size) return;
    content.replaceChildren();
    const matches = entry => ((entry.title || '') + ' ' + entry.url).toLowerCase().includes(filter);
    const groups = new Map();
    state.entries.filter(matches).forEach(entry => {
      const date = new Date(entry.visitedAt || Date.now()).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(entry);
    });
    groups.forEach((entries, date) => {
      const section = document.createElement('section');
      section.className = 'history-section';
      const title = document.createElement('h2');
      title.textContent = date;
      const list = document.createElement('div');
      list.className = 'history-list';
      entries.forEach(entry => list.append(historyRow(entry)));
      section.append(title, list);
      content.append(section);
    });
    if (!content.children.length)
      content.innerHTML = `<p class="empty">${filter ? 'No matching history.' : 'Pages you open in Atlas will appear here.'}</p>`;
  }
  if (page === 'history') {
    tools.innerHTML =
      '<input id="historySearch" type="search" placeholder="Search history" aria-label="Search history" autocomplete="off">';
    tools.firstElementChild.oninput = e => {
      filter = e.target.value.trim().toLowerCase();
      renderHistory();
    };
  }
  window.addEventListener('message', e => {
    if (e.source !== parent || e.origin !== location.origin || e.data?.type !== '__atlas_internal_state') return;
    state = e.data;
    Object.entries(state.theme || {}).forEach(([name, value]) =>
      document.documentElement.style.setProperty(name, value)
    );
    status.hidden = !state.error;
    status.textContent = state.error || '';
    renderHistory();
  });
  send('ready');
})();
