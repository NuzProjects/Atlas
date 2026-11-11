const AtlasConsent = (() => {
  const key = 'atlas_ad_consent';
  const version = '1';
  const configured = () => Boolean(window.__atlasConfig?.ads);
  function choice() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      return saved?.version === version && ['accepted', 'rejected'].includes(saved.choice) ? saved.choice : null;
    } catch {
      return null;
    }
  }
  function set(next) {
    try {
      localStorage.setItem(key, JSON.stringify({ choice: next, version, at: new Date().toISOString() }));
    } catch {}
    document.getElementById('atlasConsentBanner')?.remove();
    window.dispatchEvent(new CustomEvent('atlas-ad-consent', { detail: next }));
  }
  function show() {
    if (!configured() || document.getElementById('atlasConsentBanner')) return;
    const banner = document.createElement('section');
    banner.id = 'atlasConsentBanner';
    banner.className = 'atlas-consent';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Ad preferences');
    banner.innerHTML =
      '<p>Atlas is free because of ads. Our ad partner may use cookies or similar technology to show and measure ads. ' +
      '<a href="/privacy.html" target="_blank" rel="noopener">Privacy policy</a></p>' +
      '<div class="atlas-consent-actions"><button type="button" data-consent="rejected">Reject</button>' +
      '<button type="button" data-consent="accepted">Accept</button></div>';
    banner.onclick = event => {
      const next = event.target.closest('[data-consent]')?.dataset.consent;
      if (next) set(next);
    };
    document.body.append(banner);
  }
  const termsKey = 'atlas_terms_accepted';
  const termsVersion = '2026-11-11';
  function termsAccepted() {
    try {
      return JSON.parse(localStorage.getItem(termsKey) || 'null')?.version === termsVersion;
    } catch {
      return false;
    }
  }
  function showTerms() {
    if (document.getElementById('atlasTermsNotice')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'atlasTermsNotice';
    backdrop.className = 'modal-backdrop atlas-terms-backdrop';
    backdrop.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="atlasTermsTitle" aria-describedby="atlasTermsText" tabindex="-1">' +
      '<h2 id="atlasTermsTitle" class="atlas-terms-title">Welcome to Atlas</h2>' +
      '<p id="atlasTermsText" class="atlas-terms-text">By using Atlas, you agree to our ' +
      '<a href="/terms.html" target="_blank" rel="noopener">Terms of Service</a> and ' +
      '<a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>' +
      '<button type="button" class="modal-btn atlas-terms-agree" disabled></button></div>';
    const button = backdrop.querySelector('button');
    const hidden = [...document.body.children].filter(element => !element.inert);
    hidden.forEach(element => (element.inert = true));
    let remaining = 10;
    const label = () => (button.textContent = remaining > 0 ? `Continue (${remaining})` : 'I agree');
    label();
    const timer = setInterval(() => {
      remaining--;
      label();
      if (remaining <= 0) {
        clearInterval(timer);
        button.disabled = false;
        button.focus();
      }
    }, 1000);
    backdrop.addEventListener('keydown', event => {
      if (event.key === 'Escape') event.preventDefault();
      if (event.key === 'Tab') {
        event.preventDefault();
        const items = [...backdrop.querySelectorAll('a, button:not([disabled])')];
        const index = items.indexOf(document.activeElement);
        items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      }
    });
    button.onclick = () => {
      try {
        localStorage.setItem(termsKey, JSON.stringify({ version: termsVersion, at: new Date().toISOString() }));
      } catch {}
      hidden.forEach(element => (element.inert = false));
      backdrop.classList.remove('active');
      setTimeout(() => backdrop.remove(), 230);
      if (configured() && !choice()) show();
    };
    document.body.append(backdrop);
    void backdrop.offsetWidth;
    backdrop.classList.add('active');
    backdrop.querySelector('.modal-card').focus();
  }
  function start() {
    if (!termsAccepted()) showTerms();
    else if (configured() && !choice()) show();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  return { configured, choice, set, show, termsAccepted, adsAllowed: () => choice() === 'accepted' };
})();
