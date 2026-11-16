const AtlasConsent = (() => {
  const termsKey = 'atlas_terms_accepted';
  const termsVersion = '2026-11-13';
  try {
    localStorage.removeItem('atlas_ad_consent');
  } catch {}
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
      '<a href="/terms" target="_blank" rel="noopener">Terms of Service</a> and ' +
      '<a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>' +
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
      window.dispatchEvent(new CustomEvent('atlas-terms-accepted'));
    };
    document.body.append(backdrop);
    void backdrop.offsetWidth;
    backdrop.classList.add('active');
    backdrop.querySelector('.modal-card').focus();
  }
  function start() {
    if (!termsAccepted()) showTerms();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  return { termsAccepted };
})();
