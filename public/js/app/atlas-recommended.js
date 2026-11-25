const AtlasRecommended = (() => {
  const storageKey = 'atlas_recommended_settings';
  const cloakTitle = 'Google';
  const cloakIcon = '/assets/official/google.ico';
  const recommended = ['setting_auto_cloak', 'setting_about_blank', 'setting_confirm_leave', 'setting_panic_enabled'];
  let card = null;

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  const answered = () => read(storageKey) !== null;
  const alreadyOn = () => recommended.every(key => read(key) === 'true');

  function close() {
    if (!card) return;
    const closing = card;
    card = null;
    closing.classList.remove('active');
    setTimeout(() => closing.remove(), 230);
  }

  function dismiss() {
    write(storageKey, 'dismissed');
    close();
  }

  function refreshSettings() {
    if (typeof settingsView !== 'undefined' && getComputedStyle(settingsView).display !== 'none')
      renderSettingsTab(currentSettingsTab, true);
  }

  function enable() {
    write(storageKey, 'enabled');
    if (
      !customTitleEnabled &&
      customSiteTitle === 'Atlas' &&
      (!customSiteFavicon || customSiteFavicon === '/assets/atlas.png')
    ) {
      customSiteTitle = cloakTitle;
      customSiteFavicon = cloakIcon;
      write('setting_custom_title', cloakTitle);
      write('setting_custom_favicon', cloakIcon);
    }
    customTitleEnabled = true;
    autoCloakEnabled = true;
    panicKeyEnabled = true;
    write('setting_custom_title_enabled', 'true');
    write('setting_auto_cloak', 'true');
    write('setting_panic_enabled', 'true');
    write('setting_confirm_leave', 'true');
    write('setting_about_blank', 'true');
    refreshBranding();
    refreshSettings();
    const opening = window.top === window.self && !window.__atlasBlankBoot ? openAtlasBlank() : false;
    if (!opening) {
      applyConfirmLeave(true);
      close();
      return;
    }
    const button = card?.querySelector('[data-recommended="enable"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Opening about:blank…';
    }
    Promise.resolve(opening).then(opened => {
      if (opened) return;
      applyConfirmLeave(true);
      if (!card) return;
      const status = card.querySelector('.atlas-restore-error');
      status.hidden = false;
      status.textContent = 'Settings are on. Your browser blocked the about:blank window, so allow pop-ups for Atlas.';
      button.disabled = false;
      button.textContent = 'Close';
      button.onclick = close;
    });
  }

  function show() {
    if (card || answered() || alreadyOn()) return;
    if (document.querySelector('.atlas-restore-backdrop:not(.atlas-recommended-backdrop), #atlasTermsNotice')) {
      setTimeout(show, 1000);
      return;
    }
    card = document.createElement('div');
    card.className = 'modal-backdrop atlas-restore-backdrop atlas-recommended-backdrop';
    card.innerHTML =
      '<div class="modal-card" role="dialog" aria-labelledby="atlasRecommendedTitle">' +
      '<div class="atlas-restore-heading"><h2 id="atlasRecommendedTitle" class="atlas-restore-title">Recommended Settings</h2>' +
      `<button type="button" class="atlas-restore-close" aria-label="Dismiss recommended settings" data-recommended="close">${atlasIcon('x')}</button></div>` +
      '<button type="button" class="modal-btn" data-recommended="enable" aria-label="Enable Auto Cloak, about:blank, Anti-Close and the Panic Key">Enable</button>' +
      '<p class="atlas-restore-error" role="status" hidden></p></div>';
    card.querySelector('[data-recommended="close"]').onclick = dismiss;
    card.querySelector('[data-recommended="enable"]').onclick = enable;
    card.onkeydown = event => {
      if (event.key === 'Escape') dismiss();
    };
    document.body.append(card);
    void card.offsetWidth;
    card.classList.add('active');
  }

  function start() {
    if (answered() || alreadyOn()) return;
    if (typeof AtlasConsent !== 'undefined' && !AtlasConsent.termsAccepted()) {
      window.addEventListener('atlas-terms-accepted', () => setTimeout(show, 600), { once: true });
      return;
    }
    setTimeout(show, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  return { show, enable, dismiss };
})();
