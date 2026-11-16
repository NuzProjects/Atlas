const AtlasSitePermissions = (() => {
  const key = 'atlas_site_permissions';
  const kinds = {
    media: { features: ['camera', 'microphone', 'display-capture'], label: 'use your camera and microphone' },
    location: { features: ['geolocation'], label: 'use your location' },
  };
  const declined = new Set();
  let prompting = null;

  function site(url) {
    try {
      const parsed = new URL(url);
      return /^https?:$/.test(parsed.protocol) ? parsed.hostname.replace(/^www\./, '') : null;
    } catch {
      return null;
    }
  }
  function all() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch {
      return {};
    }
  }
  function get(url) {
    const grants = all()[site(url)] || {};
    return { media: grants.media === true, location: grants.location === true };
  }
  function set(url, kind, allowed) {
    const host = site(url);
    if (!host || !kinds[kind]) return;
    const grants = all();
    const next = { ...grants[host], [kind]: allowed };
    if (!next.media && !next.location) delete grants[host];
    else grants[host] = next;
    try {
      localStorage.setItem(key, JSON.stringify(grants));
    } catch {}
    if (allowed) declined.delete(host + '|' + kind);
  }
  function allowFor(url) {
    const grants = get(url);
    const policy = ['fullscreen *'];
    for (const [kind, { features }] of Object.entries(kinds))
      for (const feature of features) policy.push(`${feature} ${grants[kind] ? '*' : "'none'"}`);
    return policy.join('; ');
  }
  function apply(iframe, url) {
    const next = allowFor(url);
    if (iframe.getAttribute('allow') === next) return false;
    iframe.setAttribute('allow', next);
    return true;
  }
  function ask(kind, url, onAllow) {
    const host = site(url);
    if (!host || prompting || declined.has(host + '|' + kind)) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop atlas-permission-backdrop';
    backdrop.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="atlasPermissionTitle">' +
      '<h2 id="atlasPermissionTitle" class="atlas-permission-title"></h2>' +
      '<p class="atlas-permission-text">Atlas asks once per site. You can change this later in the site info panel.</p>' +
      '<div class="atlas-permission-actions"><button class="modal-btn atlas-permission-block" data-choice="block">Block</button>' +
      '<button class="modal-btn" data-choice="allow">Allow</button></div></div>';
    backdrop.querySelector('h2').textContent = `Allow ${host} to ${kinds[kind].label}?`;
    prompting = backdrop;
    const close = allowed => {
      prompting = null;
      backdrop.classList.remove('active');
      setTimeout(() => backdrop.remove(), 230);
      if (allowed) {
        set(url, kind, true);
        onAllow();
      } else declined.add(host + '|' + kind);
    };
    backdrop.onclick = event => {
      const choice = event.target.closest('[data-choice]')?.dataset.choice;
      if (choice) close(choice === 'allow');
      else if (event.target === backdrop) close(false);
    };
    backdrop.onkeydown = event => event.key === 'Escape' && close(false);
    document.body.append(backdrop);
    void backdrop.offsetWidth;
    backdrop.classList.add('active');
    backdrop.querySelector('[data-choice="allow"]').focus();
  }
  function watch(iframe, currentUrl, onAllow) {
    let view;
    try {
      view = iframe.contentWindow;
      if (!view?.navigator) return;
    } catch {
      return;
    }
    const hook = (target, name, kind) => {
      const original = target?.[name];
      if (typeof original !== 'function' || original.atlasPermissionHook) return;
      const hooked = function (...args) {
        const url = currentUrl();
        if (!get(url)[kind]) ask(kind, url, onAllow);
        return original.apply(this, args);
      };
      hooked.atlasPermissionHook = true;
      try {
        Object.defineProperty(target, name, { configurable: true, writable: true, value: hooked });
      } catch {}
    };
    hook(view.navigator.mediaDevices, 'getUserMedia', 'media');
    hook(view.navigator.mediaDevices, 'getDisplayMedia', 'media');
    hook(view.navigator.geolocation, 'getCurrentPosition', 'location');
    hook(view.navigator.geolocation, 'watchPosition', 'location');
  }
  return { site, get, set, allowFor, apply, watch };
})();
