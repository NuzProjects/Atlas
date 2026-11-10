(() => {
  const home = document.getElementById('homeView');
  if (!home) return;
  const content = home.querySelector('.home-content');
  const config = window.__atlasConfig.ads;
  if (!config || config.origin === location.origin) return;
  const { origin, units } = config;
  const version = encodeURIComponent(config.version);
  const rails = [];
  const phone = matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 600px) and (max-width: 1000px)');
  let mobileSlot;
  let mobileOffset = 0;
  let queued = false;
  const slotObserver = new ResizeObserver(entries => {
    for (const { target: slot, contentRect } of entries) {
      const mobile = slot.classList.contains('atlas-home-mobile-slot');
      const unit = mobile
        ? units[0]
        : units.find(unit => unit.width <= contentRect.width && unit.height <= contentRect.height);
      if (!unit) {
        slot.replaceChildren();
        delete slot.dataset.unit;
        continue;
      }
      const scale = mobile ? Math.min(contentRect.width / unit.width, contentRect.height / unit.height) : 1;
      if (slot.dataset.unit === unit.name) {
        slot.firstElementChild.style.transform = scale === 1 ? 'none' : `scale(${scale})`;
        continue;
      }
      const frame = document.createElement('iframe');
      frame.className = 'atlas-home-ad';
      frame.title = 'Advertisement';
      frame.width = String(unit.width);
      frame.height = String(unit.height);
      frame.style.transformOrigin = 'top left';
      frame.style.transform = scale === 1 ? 'none' : `scale(${scale})`;
      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-same-origin');
      frame.setAttribute('credentialless', '');
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.src = `${origin}/banner-ad.html?unit=${encodeURIComponent(unit.name)}&v=${version}`;
      slot.dataset.unit = unit.name;
      slot.replaceChildren(frame);
    }
  });
  function removeSlot(slot) {
    slotObserver.unobserve(slot);
    slot.remove();
  }
  function clearRails() {
    for (const rail of rails.splice(0)) {
      for (const slot of [...rail.children]) removeSlot(slot);
      rail.remove();
    }
  }
  function clearMobile() {
    if (mobileSlot) removeSlot(mobileSlot);
    mobileSlot = null;
    mobileOffset = 0;
    if (home.style.getPropertyValue('--atlas-mobile-ad-offset')) home.style.removeProperty('--atlas-mobile-ad-offset');
    if (home.classList.contains('atlas-home-has-mobile-ad')) home.classList.remove('atlas-home-has-mobile-ad');
  }
  function update() {
    queued = false;
    const path = typeof atlasAppURL === 'function' ? atlasAppURL().pathname : location.pathname;
    const visible =
      ['/', '/home'].includes(path) &&
      getComputedStyle(home).display !== 'none' &&
      !home.classList.contains('view-exit');
    if (visible && phone.matches) {
      clearRails();
      const scale = Math.max(0, Math.min(1, (home.clientWidth - 48) / 300, (home.clientHeight * 0.28) / 250));
      if (!scale) {
        clearMobile();
        return;
      }
      if (!home.classList.contains('atlas-home-has-mobile-ad')) home.classList.add('atlas-home-has-mobile-ad');
      if (!mobileSlot) {
        mobileSlot = document.createElement('div');
        mobileSlot.className = 'atlas-home-ad-slot atlas-home-mobile-slot';
        mobileSlot.setAttribute('aria-label', 'Advertisement');
        home.prepend(mobileSlot);
        slotObserver.observe(mobileSlot);
      }
      mobileSlot.style.width = `${300 * scale}px`;
      mobileSlot.style.height = `${250 * scale}px`;
      if (content) {
        const naturalTop =
          content.getBoundingClientRect().top - home.getBoundingClientRect().top - mobileOffset + home.scrollTop;
        const offset = Math.ceil(Math.max(0, 28 + 250 * scale - naturalTop));
        if (offset !== mobileOffset) {
          mobileOffset = offset;
          home.style.setProperty('--atlas-mobile-ad-offset', `${offset}px`);
        }
      }
      return;
    }
    clearMobile();
    const columns = visible ? Math.max(0, Math.floor((home.clientWidth - 680 - 96) / 632)) : 0;
    const rows = visible ? Math.max(0, Math.floor((home.clientHeight - 64 + 16) / 266)) : 0;
    const count = columns * rows;
    if (!count) {
      clearRails();
      return;
    }
    for (let side = 0; side < 2; side++) {
      let rail = rails[side];
      if (!rail) {
        rail = document.createElement('aside');
        rail.className = 'atlas-home-ads';
        rail.dataset.side = side ? 'right' : 'left';
        rail.setAttribute('aria-label', 'Advertisements');
        rails[side] = rail;
        home.append(rail);
      }
      rail.style.gridTemplateRows = `repeat(${rows},250px)`;
      rail.style.gridTemplateColumns = `repeat(${columns},300px)`;
      while (rail.children.length > count) removeSlot(rail.lastElementChild);
      while (rail.children.length < count) {
        const slot = document.createElement('div');
        slot.className = 'atlas-home-ad-slot';
        rail.append(slot);
        slotObserver.observe(slot);
      }
    }
  }
  function schedule() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  }
  new MutationObserver(schedule).observe(home, { attributes: true, attributeFilter: ['style', 'class'] });
  new ResizeObserver(schedule).observe(home);
  if (content) {
    new ResizeObserver(schedule).observe(content);
    content.addEventListener('animationend', schedule);
  }
  document.fonts?.ready.then(schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  phone.addEventListener('change', schedule);
  schedule();
})();
