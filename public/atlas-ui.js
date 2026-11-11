let atlasOpenMenu = null;
let atlasMenuTrigger = null;
function fadeAtlasMenu(menu) {
  if (!menu || menu.classList.contains('atlas-menu-closing')) return;
  menu.style.setProperty('--atlas-menu-opacity', getComputedStyle(menu).opacity);
  menu.classList.add('atlas-menu-closing');
  menu.setAttribute('aria-hidden', 'true');
  menu.inert = true;
  setTimeout(() => menu.remove(), 140);
}
function closeAtlasMenu(returnFocus = false) {
  fadeAtlasMenu(atlasOpenMenu);
  atlasOpenMenu = null;
  if (atlasMenuTrigger) {
    atlasMenuTrigger.setAttribute('aria-expanded', 'false');
    if (returnFocus && atlasMenuTrigger.isConnected) atlasMenuTrigger.focus();
  }
  atlasMenuTrigger = null;
}
function placeAtlasMenu(menu, x, y) {
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - rect.height - 8))}px`;
}
function wireAtlasMenuKeyboard(menu) {
  menu.addEventListener('keydown', e => {
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')].filter(
      button => button.offsetParent !== null && !button.closest('.atlas-menu-closing')
    );
    const current = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAtlasMenu(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const index =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? buttons.length - 1
            : (current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus();
    } else if (e.key === 'Tab') closeAtlasMenu();
  });
}
document.addEventListener('pointerdown', e => {
  if (atlasOpenMenu && !atlasOpenMenu.contains(e.target) && !atlasMenuTrigger?.contains(e.target)) closeAtlasMenu();
});
window.addEventListener('resize', () => closeAtlasMenu());
document.addEventListener(
  'scroll',
  e => {
    if (atlasOpenMenu && !atlasOpenMenu.contains(e.target)) closeAtlasMenu();
  },
  true
);

const ATLAS_OPTION_DOMAINS = {
  google: 'google.com',
  duckduckgo: 'duckduckgo.com',
  bing: 'bing.com',
  brave: 'brave.com',
  yahoo: 'yahoo.com',
  drive: 'drive.google.com',
  classroom: 'classroom.google.com',
  docs: 'docs.google.com',
  canvas: 'instructure.com',
  desmos: 'desmos.com',
  khan: 'khanacademy.org',
};
function dropdownOptionIcon(value, select) {
  const domain = ATLAS_OPTION_DOMAINS[value];
  if (domain)
    return `<img class="atlas-dropdown-icon" src="${escapeHtml(officialAtlasSite('https://' + domain)?.icon || '/api/favicon?domain=' + encodeURIComponent(domain))}" alt="" />`;
  return '';
}
function hydrateAtlasDropdowns(root = document) {
  root.querySelectorAll('select:not([data-atlas-dropdown])').forEach(select => {
    select.dataset.atlasDropdown = 'true';
    const wrapper = document.createElement('div');
    wrapper.className = 'atlas-dropdown';
    select.before(wrapper);
    wrapper.append(select);
    select.hidden = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = select.id + 'Button';
    button.className = 'atlas-dropdown-button';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const label =
      select.getAttribute('aria-label') ||
      select.closest('.settings-row')?.querySelector('.settings-row-title')?.textContent ||
      'Select option';
    button.setAttribute('aria-label', label);
    wrapper.append(button);
    select._atlasRefresh = () => {
      const option = select.selectedOptions[0] || select.options[0];
      button.innerHTML = `<span class="atlas-dropdown-label">${escapeHtml(option.textContent.replace(/\s*\(selected\)/g, ''))}</span>${dropdownOptionIcon(option.value, select)}${atlasIcon('chevron-down', 'atlas-dropdown-chevron')}`;
    };
    select._atlasRefresh();
    select.addEventListener('change', select._atlasRefresh);
    button.addEventListener('click', () => {
      const wasOpen = atlasMenuTrigger === button;
      closeAtlasMenu();
      if (wasOpen) return;
      const menu = document.createElement('div');
      menu.className = 'atlas-dropdown-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', label + ' options');
      [...select.options].forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'atlas-dropdown-option';
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(option.value === select.value));
        item.innerHTML = `<span>${escapeHtml(option.textContent.replace(/\s*\(selected\)/g, ''))}</span>${dropdownOptionIcon(option.value, select)}`;
        item.onclick = () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          closeAtlasMenu(true);
        };
        menu.append(item);
      });
      document.body.append(menu);
      atlasOpenMenu = menu;
      atlasMenuTrigger = button;
      button.setAttribute('aria-expanded', 'true');
      const rect = button.getBoundingClientRect();
      placeAtlasMenu(menu, rect.right - menu.offsetWidth, rect.bottom + 8);
      wireAtlasMenuKeyboard(menu);
      menu.querySelector('[aria-checked="true"]')?.focus();
    });
  });
}

const ATLAS_THEMES = {
  charcoal: { label: 'Charcoal', colors: ['#141414', '#1c1c1c', '#363636', '#464646'] },
  graphite: { label: 'Graphite', colors: ['#212121', '#2b2b2b', '#424242', '#505050'] },
  oled: { label: 'OLED', colors: ['#080808', '#151515', '#303030', '#414141'] },
  stone: { label: 'Stone', colors: ['#282828', '#333333', '#494949', '#595959'] },
  sepia: { label: 'Sepia', colors: ['#1b1713', '#28221b', '#493e30', '#5e503e'] },
  forest: { label: 'Forest', colors: ['#121815', '#1c2520', '#36463c', '#45594c'] },
  plum: { label: 'Plum', colors: ['#19141b', '#251e29', '#42364a', '#574761'] },
};
const ATLAS_BACKGROUNDS = {
  grid: {
    label: 'Grid',
    image: 'linear-gradient(#ffffff09 1px, transparent 1px),linear-gradient(90deg,#ffffff09 1px,transparent 1px)',
    size: '38px 38px',
  },
  fine_grid: {
    label: 'Fine Grid',
    image: 'linear-gradient(#ffffff07 1px, transparent 1px),linear-gradient(90deg,#ffffff07 1px,transparent 1px)',
    size: '20px 20px',
  },
  dots: { label: 'Dots', image: 'radial-gradient(#ffffff13 1px, transparent 1px)', size: '22px 22px' },
  diagonal: {
    label: 'Diagonal Lines',
    image: 'repeating-linear-gradient(45deg,transparent 0 25px,#ffffff08 25px 26px)',
    size: 'auto',
  },
  crosshatch: {
    label: 'Crosshatch',
    image:
      'repeating-linear-gradient(45deg,transparent 0 35px,#ffffff07 35px 36px),repeating-linear-gradient(-45deg,transparent 0 35px,#ffffff07 35px 36px)',
    size: 'auto',
  },
  rings: {
    label: 'Rings',
    image: 'repeating-radial-gradient(circle at center,transparent 0 44px,#ffffff07 44px 45px)',
    size: '100% 100%',
  },
  glow: {
    label: 'Soft Glow',
    image:
      'radial-gradient(ellipse at 20% 25%,#ffffff09,transparent 55%),radial-gradient(ellipse at 85% 80%,#ffffff06,transparent 50%)',
    size: '100% 100%',
  },
  checkerboard: {
    label: 'Checkerboard',
    image: 'conic-gradient(#ffffff06 25%,transparent 0 50%,#ffffff06 0 75%,transparent 0)',
    size: '72px 72px',
  },
  none: { label: 'None', image: 'none', size: 'auto' },
};
let customTitleEnabled = localStorage.getItem('setting_custom_title_enabled') === 'true';
let customSiteTitle = localStorage.getItem('setting_custom_title') || 'Atlas';
let customSiteFavicon = localStorage.getItem('setting_custom_favicon') || '/assets/atlas.png';

let autoCloakEnabled = localStorage.getItem('setting_auto_cloak') === 'true';
let panicKeyEnabled = localStorage.getItem('setting_panic_enabled') === 'true';
let panicKeyChar = localStorage.getItem('setting_panic_key') || ']';
let panicRedirectUrl = localStorage.getItem('setting_panic_url') || 'https://google.com';
let atlasRecordingShortcut = false;
const settingsCardsContainer = document.getElementById('settingsCardsContainer');
const settingsSectionTitle = document.getElementById('settingsSectionTitle');
const settingsNavItems = document.querySelectorAll('.settings-nav-item');
const settingsSearchInput = document.getElementById('settingsSearchInput');

function validAtlasFavicon(value) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value, atlasAppOrigin());
    return (
      ['http:', 'https:'].includes(url.protocol) ||
      /^data:image\/(?:png|jpeg|gif|webp|x-icon|vnd.microsoft.icon|svg\+xml)[;,]/i.test(value)
    );
  } catch {
    return false;
  }
}
function refreshBranding() {
  const ownerDocument = window.__atlasBlankBoot?.embedded ? window.parent.document : document;
  const active = ownerDocument.hasFocus() && !ownerDocument.hidden;
  const custom = customTitleEnabled && (!autoCloakEnabled || !active);
  document.title = custom ? customSiteTitle.trim() || 'Atlas' : 'Atlas';
  const icon =
    custom && validAtlasFavicon(customSiteFavicon) && customSiteFavicon.trim()
      ? customSiteFavicon
      : '/assets/atlas.png';
  document.getElementById('siteFavicon').href = window.__atlasBlankBoot?.embedded
    ? new URL(icon, atlasAppOrigin()).href
    : icon;
}
window.addEventListener('blur', refreshBranding);
window.addEventListener('focus', refreshBranding);
if (window.__atlasBlankBoot?.embedded) {
  window.parent.addEventListener('blur', () => setTimeout(refreshBranding, 0));
  window.parent.addEventListener('focus', () => setTimeout(refreshBranding, 0));
  window.parent.document.addEventListener('visibilitychange', refreshBranding);
} else document.addEventListener('visibilitychange', refreshBranding);

function shortcutFromEvent(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  let key = e.key === ' ' ? 'Space' : e.key;
  if (e.shiftKey && /^Key[A-Z]$/.test(e.code || '')) key = e.code.slice(3);
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join('+');
}
function normalizedShortcut(value) {
  return value.toLowerCase().replace(/\s+/g, '');
}
function runPanicShortcut(e, fromFrame = false) {
  if (e.repeat || e.isComposing) return;
  if (atlasRecordingShortcut && !fromFrame) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      atlasRecordingShortcut = false;
      document.getElementById('settingPanicKeyChar').textContent = panicKeyChar;
      return;
    }
    const shortcut = shortcutFromEvent(e);
    if (!shortcut) return;
    panicKeyChar = shortcut;
    localStorage.setItem('setting_panic_key', shortcut);
    atlasRecordingShortcut = false;
    document.getElementById('settingPanicKeyChar').textContent = shortcut;
    return;
  }
  if (!panicKeyEnabled || (!fromFrame && settingsView.contains(e.target))) return;
  if (normalizedShortcut(shortcutFromEvent(e)) !== normalizedShortcut(panicKeyChar)) return;
  e.preventDefault?.();
  closeAtlasMenu();
  window.onbeforeunload = null;
  try {
    window.top.location.replace(panicRedirectUrl);
  } catch {
    location.replace(panicRedirectUrl);
  }
}
const ATLAS_TAB_KEYBINDS = {
  new: { description: 'Open a new browsing tab.', title: 'New Tab', default: 'Ctrl+T' },
  reopen: { description: 'Restore the last closed tab.', title: 'Reopen Closed Tab', default: 'Ctrl+Shift+T' },
  close: { description: 'Close the current tab.', title: 'Close Tab', default: 'Ctrl+W' },
  next: { description: 'Switch to the next tab.', title: 'Next Tab', default: 'Ctrl+Tab' },
  previous: { description: 'Switch to the previous tab.', title: 'Previous Tab', default: 'Ctrl+Shift+Tab' },
  reload: { description: 'Refresh the current page.', title: 'Reload Page', default: 'Ctrl+R' },
  duplicate: { description: 'Open a copy of the current tab.', title: 'Duplicate Tab', default: 'Ctrl+Shift+D' },
  address: {
    description: 'Select the address bar to enter a URL or search.',
    title: 'Focus Address Bar',
    default: 'Ctrl+L',
  },
  split: { description: 'Open or close side-by-side browsing.', title: 'Toggle Split View', default: 'Ctrl+Shift+S' },
  history: { description: 'View your recently visited pages.', title: 'Open History', default: 'Ctrl+H' },
  bookmark: { description: 'Save the current page as a shortcut.', title: 'Bookmark Page', default: 'Ctrl+D' },
  bar: {
    description: 'Toggle the bottom browser controls.',
    title: 'Show or Hide Browser Bar',
    default: 'Ctrl+Shift+B',
  },
};
let atlasRecordingTabKeybind = null;
function atlasTabKeybind(action) {
  return localStorage.getItem('setting_keybind_' + action) ?? ATLAS_TAB_KEYBINDS[action].default;
}
function reopenAtlasClosedTab() {
  const closed = atlasClosedTabs.at(-1);
  if (!closed || tabs.length >= MAX_TABS) return;
  const restored = createTab(closed.url, closed.title, true);
  if (!restored) return;
  atlasClosedTabs.pop();
  tabs.splice(tabs.indexOf(restored), 1);
  tabs.splice(Math.min(closed.index, tabs.length), 0, restored);
  switchView('browser');
  renderTabs();
}
function handleAtlasKeyboard(e, fromFrame = false) {
  if (e.repeat || e.isComposing) return;
  if (atlasRecordingTabKeybind && !fromFrame) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const action = atlasRecordingTabKeybind;
    const button = document.getElementById('settingKeybind_' + action);
    const status = document.getElementById('settingKeybindStatus');
    if (e.key === 'Escape') {
      atlasRecordingTabKeybind = null;
      button.textContent = atlasTabKeybind(action) || 'Not set';
      status.textContent = '';
      return;
    }
    const shortcut = shortcutFromEvent(e);
    if (!shortcut) return;
    if (!e.ctrlKey && !e.altKey && !e.metaKey && !/^F\d{1,2}$/.test(e.key)) {
      status.textContent = 'Use Ctrl, Alt, or Meta with a key, or a function key.';
      return;
    }
    if (
      Object.keys(ATLAS_TAB_KEYBINDS).some(
        other => other !== action && normalizedShortcut(atlasTabKeybind(other)) === normalizedShortcut(shortcut)
      ) ||
      (panicKeyEnabled && normalizedShortcut(panicKeyChar) === normalizedShortcut(shortcut))
    ) {
      status.textContent = 'That shortcut is already in use. Choose another combination.';
      return;
    }
    localStorage.setItem('setting_keybind_' + action, shortcut);
    button.textContent = shortcut;
    atlasRecordingTabKeybind = null;
    status.textContent = 'Shortcut saved.';
    return;
  }
  if (atlasRecordingShortcut) {
    runPanicShortcut(e, fromFrame);
    return;
  }
  const shortcut = normalizedShortcut(shortcutFromEvent(e));
  const action = Object.keys(ATLAS_TAB_KEYBINDS).find(
    key => atlasTabKeybind(key) && normalizedShortcut(atlasTabKeybind(key)) === shortcut
  );
  if (action) {
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    closeAtlasMenu();
    if (action === 'new') {
      createTab('/new-tab', 'New Tab', true);
      switchView('browser');
    } else if (action === 'reopen') reopenAtlasClosedTab();
    else if (action === 'close' && activeTabId) closeTab(activeTabId);
    else {
      const current = tabs.find(tab => tab.id === activeTabId && !tab.isClosing);
      if (action === 'next' || action === 'previous') {
        const open = tabs.filter(tab => !tab.isClosing);
        const index = open.findIndex(tab => tab.id === activeTabId);
        const next = open[(index + (action === 'next' ? 1 : -1) + open.length) % open.length];
        if (next) {
          switchView('browser');
          activateTab(next.id);
        }
      } else if (action === 'reload') reloadAtlasTab(current);
      else if (action === 'duplicate' && current) {
        createTab(current.url, current.title, true);
        switchView('browser');
      } else if (action === 'address') {
        const input = current ? bottomAddressBar : homeSearchInput;
        switchView(current ? 'browser' : 'home');
        if (current) browserView.classList.remove('bottom-bar-hidden');
        input.focus();
        input.select();
      } else if (action === 'split' && current) {
        switchView('browser');
        toggleAtlasSplit();
      } else if (action === 'history') openAtlasHistory();
      else if (action === 'bookmark' && current) bookmarkBtn.click();
      else if (action === 'bar') browserView.classList.toggle('bottom-bar-hidden');
    }
    return;
  }
  runPanicShortcut(e, fromFrame);
}
window.addEventListener('keydown', e => handleAtlasKeyboard(e), true);

function animateAtlasContent(element, className = 'view-enter') {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), 300);
}
function applyAtlasAppearance() {
  const root = document.documentElement;
  const theme = localStorage.getItem('setting_theme') || 'charcoal';
  const palette = (ATLAS_THEMES[theme] || ATLAS_THEMES.charcoal).colors;
  ['--bg', '--bg-card', '--btn-bg', '--btn-hover'].forEach((key, i) => root.style.setProperty(key, palette[i]));
  root.style.setProperty('--input-bg', palette[2]);
  root.style.setProperty('--input-hover', palette[3]);
  const design = localStorage.getItem('setting_bg_design') || 'grid';
  const background = ATLAS_BACKGROUNDS[design] || ATLAS_BACKGROUNDS.grid;
  [document.body, newTabScreen, document.getElementById('atlasSplitEmpty')].forEach(element => {
    element.style.backgroundImage = background.image;
    element.style.backgroundSize = background.size;
  });
  let custom = document.getElementById('atlasCustomCSS');
  if (!custom) {
    custom = document.createElement('style');
    custom.id = 'atlasCustomCSS';
    document.head.append(custom);
  }
  custom.textContent = localStorage.getItem('setting_custom_css') || '';
  window.dispatchEvent(new Event('atlas-appearance-updated'));
}

function atlasSettingsRow(title, description, control, extraClass = '') {
  return `<div class="settings-row ${extraClass}"><div class="settings-row-text"><div class="settings-row-title">${escapeHtml(title)}</div><div class="settings-row-sub">${escapeHtml(description)}</div></div><div class="settings-control">${control}</div></div>`;
}
function atlasSelect(id, value, options, label) {
  return `<select id="${id}" aria-label="${escapeHtml(label)}">${options.map(([key, text]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;
}
function atlasToggle(id, checked, label) {
  return `<label class="clean-switch"><input type="checkbox" id="${id}" aria-label="${escapeHtml(label)}" ${checked ? 'checked' : ''}/><span class="clean-switch-slider"></span></label>`;
}
function bindAtlasToggle(id, storageKey, callback = () => {}) {
  document.getElementById(id).onchange = e => {
    localStorage.setItem(storageKey, e.target.checked);
    callback(e.target.checked);
  };
}
function bindAtlasAppearance(id, storageKey) {
  document.getElementById(id).onchange = e => {
    localStorage.setItem(storageKey, e.target.value);
    applyAtlasAppearance();
  };
}
function filterAtlasSettings() {
  const query = AtlasLabelText.plain(settingsSearchInput.value).toLowerCase().trim();
  settingsCardsContainer.querySelectorAll('.settings-row').forEach(row => {
    row.style.display =
      !query || AtlasLabelText.plain(row.querySelector('.settings-row-text').textContent).toLowerCase().includes(query)
        ? 'flex'
        : 'none';
  });
}
let atlasSettingsTimer;
let atlasSettingsScrollFrame;
function scrollAtlasSettingsTop() {
  cancelAnimationFrame(atlasSettingsScrollFrame);
  const top = settingsView.scrollTop;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    settingsView.scrollTop = 0;
    return;
  }
  const started = performance.now();
  const step = time => {
    const progress = Math.min((time - started) / 240, 1);
    settingsView.scrollTop = top * Math.pow(1 - progress, 3);
    if (progress < 1) atlasSettingsScrollFrame = requestAnimationFrame(step);
  };
  atlasSettingsScrollFrame = requestAnimationFrame(step);
}
for (const event of ['wheel', 'touchstart'])
  settingsView.addEventListener(event, () => cancelAnimationFrame(atlasSettingsScrollFrame), { passive: true });
function renderSettingsTab(tab, afterFade = false) {
  cancelAnimationFrame(atlasSettingsScrollFrame);
  clearTimeout(atlasSettingsTimer);
  settingsNavItems.forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  if (!afterFade && settingsCardsContainer.children.length && settingsSectionTitle.textContent.toLowerCase() !== tab) {
    settingsCardsContainer.classList.remove('settings-enter');
    settingsCardsContainer.classList.add('settings-exit');
    atlasSettingsTimer = setTimeout(() => renderSettingsTab(tab, true), 140);
    return;
  }
  settingsCardsContainer.classList.remove('settings-exit');
  settingsView.scrollTop = 0;
  closeAtlasMenu();
  atlasRecordingShortcut = false;
  atlasRecordingTabKeybind = null;
  const title =
    { privacy: 'Privacy', customize: 'Customize', browsing: 'Browsing', keybinds: 'Keybinds', advanced: 'Advanced' }[
      tab
    ] || 'Privacy';
  settingsSectionTitle.textContent = title;
  if (tab === 'privacy') {
    settingsCardsContainer.innerHTML =
      '<div class="settings-custom-title-group">' +
      atlasSettingsRow(
        'Use Custom Site Title',
        'Change your browser tab’s title and icon.',
        atlasToggle('settingCustomTitleEnabled', customTitleEnabled, 'Use custom site title')
      ) +
      `<div id="customSiteBranding" class="custom-site-branding-reveal${customTitleEnabled ? ' is-open' : ''}" ${customTitleEnabled ? '' : 'inert'}><div class="custom-site-branding"><label>Title<input id="settingCustomTitle" class="settings-input-sm" maxlength="160" value="${escapeHtml(customSiteTitle)}" placeholder="Atlas" /></label><label>Favicon URL<input id="settingCustomFavicon" class="settings-input-sm" value="${escapeHtml(customSiteFavicon)}" placeholder="https://example.com/favicon.ico or data:image/..." /><span id="customFaviconError" role="status"></span></label></div></div></div>` +
      atlasSettingsRow(
        'Auto Cloak',
        'Show your custom title and icon while away.',
        atlasToggle('settingAutoCloak', autoCloakEnabled, 'Auto cloak')
      ) +
      atlasSettingsRow(
        'Auto about:blank',
        'Open Atlas in about:blank automatically when it loads.',
        atlasToggle(
          'settingAboutBlankStartup',
          localStorage.getItem('setting_about_blank') === 'true',
          'Open about:blank on startup'
        )
      ) +
      atlasSettingsRow(
        'Anti-Close',
        'Confirm before closing or leaving Atlas.',
        atlasToggle('settingAntiClose', localStorage.getItem('setting_confirm_leave') === 'true', 'Anti-Close')
      ) +
      atlasSettingsRow(
        'Panic Key',
        'Enable your panic shortcut on all pages.',
        atlasToggle('settingPanicKey', panicKeyEnabled, 'Panic key')
      ) +
      atlasSettingsRow(
        'Panic Shortcut',
        'Record a shortcut and set its destination.',
        `<div class="settings-shortcut-controls"><button id="settingPanicKeyChar" class="settings-action-btn" aria-label="Record panic shortcut">${escapeHtml(panicKeyChar)}</button><input id="settingPanicUrl" class="settings-input-sm" aria-label="Panic destination" value="${escapeHtml(panicRedirectUrl)}" placeholder="https://google.com" /></div>`
      );
    bindAtlasToggle('settingCustomTitleEnabled', 'setting_custom_title_enabled', enabled => {
      customTitleEnabled = enabled;
      const fields = document.getElementById('customSiteBranding');
      fields.classList.toggle('is-open', enabled);
      fields.inert = !enabled;
      refreshBranding();
    });
    document.getElementById('settingCustomTitle').oninput = e => {
      customSiteTitle = e.target.value;
      localStorage.setItem('setting_custom_title', customSiteTitle);
      refreshBranding();
    };
    document.getElementById('settingCustomFavicon').oninput = e => {
      const valid = validAtlasFavicon(e.target.value);
      e.target.setAttribute('aria-invalid', String(!valid));
      document.getElementById('customFaviconError').textContent = valid ? '' : 'Use an image URL or image data URL.';
      if (!valid) return;
      customSiteFavicon = e.target.value.trim();
      localStorage.setItem('setting_custom_favicon', customSiteFavicon);
      refreshBranding();
    };
    bindAtlasToggle('settingAutoCloak', 'setting_auto_cloak', enabled => {
      autoCloakEnabled = enabled;
      refreshBranding();
    });
    bindAtlasToggle('settingAntiClose', 'setting_confirm_leave', applyConfirmLeave);
    bindAtlasToggle('settingAboutBlankStartup', 'setting_about_blank', async enabled => {
      if (enabled && !window.__atlasBlankBoot && !(await openAtlasBlank())) {
        const row = document.getElementById('settingAboutBlankStartup').closest('.settings-row');
        row.querySelector('.settings-row-sub').textContent =
          'Your browser blocked the window. Allow popups for Atlas to use about:blank.';
      }
    });
    bindAtlasToggle('settingPanicKey', 'setting_panic_enabled', enabled => {
      panicKeyEnabled = enabled;
    });
    document.getElementById('settingPanicKeyChar').onclick = e => {
      atlasRecordingShortcut = true;
      e.currentTarget.textContent = 'Press Key';
      e.currentTarget.focus();
    };
    const destination = document.getElementById('settingPanicUrl');
    destination.oninput = () => {
      try {
        const url = new URL(
          /^https?:\/\//i.test(destination.value) ? destination.value : 'https://' + destination.value
        );
        if (!['http:', 'https:'].includes(url.protocol)) return;
        panicRedirectUrl = url.href;
        localStorage.setItem('setting_panic_url', panicRedirectUrl);
      } catch {}
    };
    destination.onkeydown = e => {
      if (e.key === 'Enter') {
        destination.oninput();
        destination.blur();
      }
    };
  } else if (tab === 'customize') {
    const get = (key, fallback) => localStorage.getItem(key) || fallback;
    const theme = get('setting_theme', 'charcoal');
    settingsCardsContainer.innerHTML =
      atlasSettingsRow(
        'Site Theme',
        'Choose your colors.',
        atlasSelect(
          'settingSiteTheme',
          Object.hasOwn(ATLAS_THEMES, theme) ? theme : 'charcoal',
          Object.entries(ATLAS_THEMES).map(([id, preset]) => [id, preset.label]),
          'Site theme'
        )
      ) +
      atlasSettingsRow(
        'Background Design',
        'Set the Home and New Tab background.',
        atlasSelect(
          'settingBgDesign',
          get('setting_bg_design', 'grid'),
          Object.entries(ATLAS_BACKGROUNDS).map(([id, preset]) => [id, preset.label]),
          'Background design'
        )
      ) +
      `<div class="settings-row settings-custom-css"><div class="settings-row-text"><div class="settings-row-title">Custom CSS</div><div class="settings-row-sub">Add custom styles. Changes save automatically.</div></div><textarea id="settingCustomCSS" aria-label="Custom CSS" spellcheck="false" placeholder=".welcome-title { letter-spacing: -2px; }">${escapeHtml(get('setting_custom_css', ''))}</textarea></div>`;
    [
      ['settingSiteTheme', 'setting_theme'],
      ['settingBgDesign', 'setting_bg_design'],
    ].forEach(([id, key]) => bindAtlasAppearance(id, key));
    document.getElementById('settingCustomCSS').oninput = e => {
      localStorage.setItem('setting_custom_css', e.target.value);
      applyAtlasAppearance();
    };
  } else if (tab === 'browsing') {
    settingsCardsContainer.innerHTML =
      atlasSettingsRow(
        'Search Engine',
        'Choose your default search engine.',
        atlasSelect(
          'settingSearchEngine',
          getSearchEngineId(),
          Object.entries(SEARCH_ENGINES).map(([key, engine]) => [key, engine.name]),
          'Search engine'
        )
      ) +
      atlasSettingsRow(
        'Block Ads & Trackers',
        'Block ads and trackers on all sites.',
        atlasToggle('settingGlobalAds', blockAdsToggle.checked, 'Block ads and trackers')
      ) +
      atlasSettingsRow(
        'Fingerprinting Protection',
        'Reduce fingerprinting across all tabs.',
        atlasToggle('settingGlobalFingerprint', fingerprintToggle.checked, 'Fingerprinting protection')
      );
    document.getElementById('settingSearchEngine').onchange = e => setSearchEngine(e.target.value);
    document.getElementById('settingGlobalAds').onchange = e => {
      blockAdsToggle.checked = e.target.checked;
      blockAdsToggle.dispatchEvent(new Event('change'));
    };
    document.getElementById('settingGlobalFingerprint').onchange = e => {
      fingerprintToggle.checked = e.target.checked;
      fingerprintToggle.dispatchEvent(new Event('change'));
    };
  } else if (tab === 'keybinds') {
    settingsCardsContainer.innerHTML =
      Object.entries(ATLAS_TAB_KEYBINDS)
        .map(([action, preset]) =>
          atlasSettingsRow(
            preset.title,
            preset.description,
            `<div class="settings-keybind-controls"><button id="settingKeybind_${action}" class="settings-action-btn" aria-label="Record ${escapeHtml(preset.title.toLowerCase())} shortcut">${escapeHtml(atlasTabKeybind(action) || 'Not set')}</button><button id="settingKeybindClear_${action}" class="settings-action-btn" aria-label="Clear ${escapeHtml(preset.title.toLowerCase())} shortcut">Clear</button></div>`
          )
        )
        .join('') +
      atlasSettingsRow(
        'Restore Defaults',
        'Reset all keyboard shortcuts.',
        '<button id="settingKeybindReset" class="settings-action-btn">Reset Keybinds</button>'
      ) +
      '<p class="settings-row-sub settings-note">Avoid shortcuts reserved by your browser.</p>' +
      '<div id="settingKeybindStatus" class="settings-status" role="status" aria-live="polite"></div>';
    Object.keys(ATLAS_TAB_KEYBINDS).forEach(action => {
      document.getElementById('settingKeybindClear_' + action).onclick = () => {
        localStorage.setItem('setting_keybind_' + action, '');
        if (atlasRecordingTabKeybind === action) atlasRecordingTabKeybind = null;
        document.getElementById('settingKeybind_' + action).textContent = 'Not set';
        document.getElementById('settingKeybindStatus').textContent = 'Shortcut cleared.';
      };
      document.getElementById('settingKeybind_' + action).onclick = () => {
        atlasRecordingShortcut = false;
        if (atlasRecordingTabKeybind)
          document.getElementById('settingKeybind_' + atlasRecordingTabKeybind).textContent =
            atlasTabKeybind(atlasRecordingTabKeybind) || 'Not set';
        atlasRecordingTabKeybind = action;
        document.getElementById('settingKeybind_' + action).textContent = 'Press Key';
        document.getElementById('settingKeybindStatus').textContent = '';
      };
    });
    document.getElementById('settingKeybindReset').onclick = () => {
      atlasRecordingTabKeybind = null;
      Object.keys(ATLAS_TAB_KEYBINDS).forEach(action => {
        localStorage.removeItem('setting_keybind_' + action);
        const button = document.getElementById('settingKeybind_' + action);
        const label = atlasTabKeybind(action) || 'Not set';
        button.getAnimations().forEach(animation => animation.cancel());
        if (button.textContent === label || matchMedia('(prefers-reduced-motion: reduce)').matches) {
          button.textContent = label;
          return;
        }
        button
          .animate(
            [
              { opacity: 1, transform: 'translateY(0)' },
              { opacity: 0, transform: 'translateY(-3px)' },
            ],
            { duration: 80, easing: 'ease-out' }
          )
          .finished.then(() => {
            if (!button.isConnected || atlasRecordingTabKeybind === action) return;
            button.textContent = label;
            button.animate(
              [
                { opacity: 0, transform: 'translateY(3px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
              { duration: 120, easing: 'ease-out' }
            );
          })
          .catch(() => {});
      });
      document.getElementById('settingKeybindStatus').textContent = 'Default shortcuts restored.';
      scrollAtlasSettingsTop();
    };
  } else {
    const build = window.__atlasConfig?.build;
    const version = build?.revision
      ? build.revision.slice(0, 7) + (build.modified ? ' (local changes)' : '')
      : 'Development build';
    settingsCardsContainer.innerHTML =
      atlasSettingsRow(
        'Build Version',
        'Your current Atlas revision.',
        `<code id="atlasBuildVersion" title="${escapeHtml(build?.revision || '')}">${escapeHtml(version)}</code>`
      ) +
      atlasSettingsRow(
        'Proxy Engine',
        'Choose how websites are rendered.',
        `<select id="settingProxyEngine" class="settings-input-sm" aria-label="Proxy engine"><option value="scramjet">Scramjet</option><option value="ultraviolet">Ultraviolet</option></select>`
      ) +
      atlasSettingsRow(
        'Wisp Config',
        'Add a custom relay, or leave blank to use Atlas.',
        `<div class="settings-wisp-control"><input type="text" id="settingWispInput" placeholder="wss://your-wisp-url.net/wisp/" class="settings-input-sm" aria-label="Wisp server" value="${escapeHtml(activeWss === defaultLocalWisp ? '' : activeWss)}"/><div class="settings-status" id="settingWispStatus" role="status"></div></div>`
      ) +
      atlasSettingsRow(
        'Export Settings',
        'Download your settings as JSON.',
        '<button class="settings-action-btn" id="settingExportBtn">Export JSON</button>'
      ) +
      atlasSettingsRow(
        'Import Settings',
        'Restore settings from JSON.',
        '<input type="file" id="settingImportFileInput" accept=".json" hidden/><button class="settings-action-btn" id="settingImportBtn">Import JSON</button>'
      ) +
      atlasSettingsRow(
        'Reset Instance',
        'Clear saved preferences and shortcuts.',
        '<button class="settings-action-btn danger" id="settingResetDataBtn">Reset Data</button>'
      );
    const engineSelect = document.getElementById('settingProxyEngine');
    engineSelect.value = AtlasEngines.selected();
    engineSelect.onchange = () => {
      localStorage.setItem('setting_proxy_engine', engineSelect.value);
      tabs.filter(tab => !tab.isNewTab && !atlasInternalPage(tab.url)).forEach(tab => navigateTab(tab.id, tab.url));
    };
    const wispInput = document.getElementById('settingWispInput');
    const parseWisp = () => {
      const value = wispInput.value.trim(),
        url = new URL(value || defaultLocalWisp);
      if (value && (url.protocol !== 'wss:' || !url.hostname || url.username || url.password || url.hash))
        throw new Error();
      return url;
    };
    const markInvalid = () => {
      wispInput.setAttribute('aria-invalid', 'true');
      wispInput.setAttribute('aria-label', 'Wisp server, enter a valid wss:// address');
    };
    wispInput.oninput = () => {
      delete wispInput.dataset.saved;
      document.getElementById('settingWispStatus').textContent = '';
      try {
        parseWisp();
        wispInput.removeAttribute('aria-invalid');
        wispInput.setAttribute('aria-label', 'Wisp server');
      } catch {
        markInvalid();
      }
    };
    wispInput.onkeydown = e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const status = document.getElementById('settingWispStatus');
      try {
        const url = parseWisp();
        activeWss = url.href;
        if (activeWss === defaultLocalWisp) localStorage.removeItem('wisp_server_url');
        else localStorage.setItem('wisp_server_url', activeWss);
        wispInput.value = activeWss === defaultLocalWisp ? '' : activeWss;
        status.textContent = '';
        wispInput.dataset.saved = 'true';
        wispInput.setAttribute('aria-invalid', 'false');
        wispInput.setAttribute('aria-label', 'Wisp server, saved');
        tabs.filter(tab => !tab.isNewTab).forEach(tab => navigateTab(tab.id, tab.url));
        wispInput.blur();
      } catch {
        delete wispInput.dataset.saved;
        markInvalid();
        status.textContent = '';
      }
    };
    document.getElementById('settingExportBtn').onclick = () => {
      const data = exportAtlasSettings(localStorage);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      link.download = 'atlas-settings.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
    const input = document.getElementById('settingImportFileInput');
    document.getElementById('settingImportBtn').onclick = () => input.click();
    input.onchange = async () => {
      try {
        if (!input.files?.length) return;
        const entries = parseAtlasSettings(JSON.parse(await input.files[0].text()));
        const previous = entries.map(([key]) => [key, localStorage.getItem(key)]);
        try {
          entries.forEach(([key, value]) => localStorage.setItem(key, value));
        } catch (error) {
          previous.forEach(([key, value]) =>
            value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)
          );
          throw error;
        }
        window.onbeforeunload = null;
        location.reload();
      } catch {
        alert('Choose a valid Atlas settings JSON file.');
      } finally {
        input.value = '';
      }
    };
    document.getElementById('settingResetDataBtn').onclick = () => {
      if (!confirm('Reset Atlas settings and shortcuts?')) return;
      Object.keys(localStorage)
        .filter(isAtlasStorageKey)
        .forEach(key => localStorage.removeItem(key));
      window.onbeforeunload = null;
      location.reload();
    };
  }
  hydrateAtlasDropdowns(settingsCardsContainer);
  filterAtlasSettings();
  animateAtlasContent(settingsCardsContainer, 'settings-enter');
  animateAtlasContent(settingsSectionTitle, 'settings-enter');
}
function isAtlasStorageKey(key) {
  return (
    key.startsWith('setting_') ||
    key.startsWith('network_shortcuts') ||
    ['wisp_server_url', 'atlas_browsing_history', 'atlas_tab_sessions', 'atlas_current_session'].includes(key)
  );
}
const ATLAS_BOOLEAN_SETTINGS = new Set([
  'about_blank',
  'auto_cloak',
  'block_ads',
  'block_fp',
  'confirm_leave',
  'custom_title_enabled',
  'panic_enabled',
]);
function exportAtlasSettings(storage) {
  const result = { format: 'atlas-settings', version: 1, settings: {}, keybinds: {}, relay: null, data: {} };
  Object.keys(storage)
    .filter(isAtlasStorageKey)
    .sort()
    .forEach(key => {
      const value = storage.getItem(key);
      if (key.startsWith('setting_keybind_')) result.keybinds[key.slice('setting_keybind_'.length)] = value;
      else if (key.startsWith('setting_')) {
        const name = key.slice(8);
        if (name === 'custom_css') {
          result.settings[name] = value;
          return;
        }
        result.settings[name] =
          ATLAS_BOOLEAN_SETTINGS.has(name) && ['true', 'false'].includes(value) ? value === 'true' : value;
      } else if (key === 'wisp_server_url') result.relay = value;
      else {
        try {
          result.data[key] = { encoding: 'json', value: JSON.parse(value) };
        } catch {
          result.data[key] = { encoding: 'text', value };
        }
      }
    });
  return result;
}
function parseAtlasSettings(data) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(data)) throw new Error('Invalid settings');
  let entries;
  if (Object.hasOwn(data, 'format') || Object.hasOwn(data, 'version')) {
    if (
      data.format !== 'atlas-settings' ||
      data.version !== 1 ||
      !object(data.settings) ||
      !object(data.keybinds) ||
      !object(data.data)
    )
      throw new Error('Unsupported settings format');
    entries = [];
    for (const [name, value] of Object.entries(data.settings)) {
      if (
        !/^[a-z][a-z0-9_]*$/.test(name) ||
        name.startsWith('keybind_') ||
        !(typeof value === 'string' || (ATLAS_BOOLEAN_SETTINGS.has(name) && typeof value === 'boolean'))
      )
        throw new Error('Invalid setting');
      entries.push(['setting_' + name, String(value)]);
    }
    for (const [name, value] of Object.entries(data.keybinds)) {
      if (!Object.hasOwn(ATLAS_TAB_KEYBINDS, name) || typeof value !== 'string') throw new Error('Invalid keybind');
      entries.push(['setting_keybind_' + name, value]);
    }
    if (data.relay !== null && data.relay !== undefined) {
      if (typeof data.relay !== 'string' || !['ws:', 'wss:'].includes(new URL(data.relay).protocol))
        throw new Error('Invalid relay');
      entries.push(['wisp_server_url', data.relay]);
    }
    for (const [key, record] of Object.entries(data.data)) {
      if (
        !isAtlasStorageKey(key) ||
        key.startsWith('setting_') ||
        key === 'wisp_server_url' ||
        !object(record) ||
        !Object.hasOwn(record, 'value')
      )
        throw new Error('Invalid saved data');
      if (record.encoding === 'json') entries.push([key, JSON.stringify(record.value)]);
      else if (record.encoding === 'text' && typeof record.value === 'string') entries.push([key, record.value]);
      else throw new Error('Invalid saved data encoding');
    }
  } else {
    entries = Object.entries(data).filter(([key]) => isAtlasStorageKey(key));
    if (entries.some(([, value]) => typeof value !== 'string')) throw new Error('Invalid legacy settings');
  }
  if (!entries.length) throw new Error('No Atlas settings found');
  return entries;
}
function applyConfirmLeave(enabled) {
  window.onbeforeunload = enabled
    ? e => {
        e.preventDefault();
        e.returnValue = '';
      }
    : null;
}
settingsSearchInput.addEventListener('input', filterAtlasSettings);
settingsNavItems.forEach(
  button =>
    (button.onclick = () => {
      if (currentSettingsTab === button.dataset.tab) return;
      currentSettingsTab = button.dataset.tab;
      atlasSetAppPath('/settings#' + currentSettingsTab);
      renderSettingsTab(currentSettingsTab);
    })
);

function applyGlobalProxyPreferences(ads, fingerprints) {
  localStorage.setItem('setting_block_ads', ads);
  localStorage.setItem('setting_block_fp', fingerprints);
  blockAdsToggle.checked = ads;
  fingerprintToggle.checked = fingerprints;
  tabs.forEach(tab => {
    tab.blockAds = ads;
    tab.blockFp = fingerprints;
  });
  tabs.filter(tab => !tab.isNewTab).forEach(tab => navigateTab(tab.id, tab.url));
}
function reloadAtlasTab(tab) {
  if (!tab || tab.isNewTab) return;
  navigateTab(tab.id, tab.url);
}

hydrateAtlasDropdowns();
applyAtlasAppearance();
applyConfirmLeave(localStorage.getItem('setting_confirm_leave') === 'true');
refreshBranding();
const initialRoutePath = atlasAppURL().pathname;
if (initialRoutePath === '/settings') switchView('settings', false);
else switchView('home', false);

function openBlankTab() {
  const firefox = /Firefox\//.test(navigator.userAgent);
  // Use Chromium's initial empty popup without navigating it to about:blank.
  return window.open(firefox ? 'about:blank' : '', '_blank');
}
function writeTab(tab, html) {
  const write = tab.Function(
    'html',
    'resolve',
    'reject',
    'try { document.open(); document.write(html); document.close(); resolve(); } catch(error) { reject(error); }'
  );
  return new Promise((resolve, reject) => tab.setTimeout(write, 0, html, resolve, reject));
}
function atlasBlankLoading() {
  return '<div id="atlasBlankLoading" role="status" aria-label="Loading Atlas"><i aria-hidden="true"></i></div>';
}
function atlasBlankLoadingStyle() {
  const background = getComputedStyle(document.getElementById('loaderOverlay'));
  const spinner = getComputedStyle(document.querySelector('#loaderOverlay .custom-spinner'));
  return `html,body{width:100%;height:100%;margin:0;overflow:hidden;background:${background.backgroundColor}}#atlasBlankLoading{position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;background-color:${background.backgroundColor};background-image:${background.backgroundImage};background-size:${background.backgroundSize}}#atlasBlankLoading i{box-sizing:${spinner.boxSizing};width:${spinner.width};height:${spinner.height};border:${spinner.borderTopWidth} ${spinner.borderTopStyle} ${spinner.borderBottomColor};border-top-color:${spinner.borderTopColor};border-radius:${spinner.borderTopLeftRadius};animation:atlasBlankSpin ${spinner.animationDuration} ${spinner.animationTimingFunction} infinite}@keyframes atlasBlankSpin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#atlasBlankLoading i{animation:none}}`.replace(
    /</g,
    '\\3c '
  );
}
function atlasBlankWrapper(url, origin, token, session, restore) {
  const appUrl = new URL(url);
  appUrl.searchParams.set('atlas_blank', '1');
  const launch = JSON.stringify({ url, token, session, restore }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas</title><script>window.__atlasBlankLaunch=${launch};<\/script><style>${atlasBlankLoadingStyle()}iframe{width:100%;height:100%;border:0;display:block}</style></head><body>${atlasBlankLoading()}<iframe id="atlasBlankApp" title="Atlas" src="${escapeHtml(appUrl.href)}" allow="fullscreen *" allowfullscreen></iframe><script>
    const origin=${JSON.stringify(origin)},token=${JSON.stringify(token)};
    addEventListener('message',event=>{
      const app=document.getElementById('atlasBlankApp').contentDocument?.defaultView;
      if(event.source!==app || event.origin!==origin || event.data?.token!==token)return;
      if(event.data.type==='__atlas_blank_ready'){
        document.getElementById('atlasBlankLoading')?.remove();
        let currentIcon='';
        const syncBranding=()=>{
          document.title=app.document.title;
          const source=app.document.getElementById('siteFavicon');
          if(source){let icon=document.querySelector('link[rel="icon"]');if(!icon){icon=document.createElement('link');icon.id='siteFavicon';icon.rel='icon';document.head.append(icon);}if(currentIcon===source.href)return;currentIcon=source.href;icon.href=currentIcon;

            const requested=currentIcon;
            app.fetch(requested).then(response=>{if(!response.ok)throw new Error();return response.blob();}).then(blob=>{
              const reader=new FileReader();reader.onload=()=>{if(currentIcon===requested)icon.href=reader.result;};reader.readAsDataURL(blob);
            }).catch(()=>{});
          }
        };
        syncBranding();new MutationObserver(syncBranding).observe(app.document.head,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href']});
        window.opener?.postMessage(event.data,origin);
      }
    });
  <\/script></body></html>`;
}
let atlasBlankOpening = null;
async function openAtlasBlank() {
  if (window.top !== window.self || window.__atlasBlankBoot) return false;
  if (atlasBlankOpening) return atlasBlankOpening;
  const blank = openBlankTab();
  if (!blank) return false;
  let loading;
  try {
    loading = writeTab(
      blank,
      `<!doctype html><html><head><title>Atlas</title><style>${atlasBlankLoadingStyle()}</style></head><body>${atlasBlankLoading()}</body></html>`
    );
  } catch {
    blank.close();
    return false;
  }
  atlasBlankOpening = (async () => {
    let timer, onReady;
    try {
      await loading;
      persistAtlasSession();
      const url = atlasAppURL().href;
      const token = crypto.randomUUID();
      if (blank.closed) throw new Error('Blank tab closed');
      const session = readAtlasSession(localStorage.getItem('atlas_current_session'));
      const ready = new Promise((resolve, reject) => {
        onReady = event => {
          if (
            event.source === blank &&
            event.origin === atlasAppOrigin() &&
            event.data?.type === '__atlas_blank_ready' &&
            event.data.token === token
          )
            resolve();
        };
        window.addEventListener('message', onReady);
        timer = setTimeout(() => reject(new Error('Application initialization timed out')), 20000);
      });
      const restore = session ? null : typeof atlasPreviousSession === 'undefined' ? null : atlasPreviousSession;
      await writeTab(blank, atlasBlankWrapper(url, atlasAppOrigin(), token, session, restore));
      await ready;
      if (blank.closed) throw new Error('Blank tab closed');
      sessionStorage.setItem('atlas_blank_started', 'true');
      blank.opener = null;
      window.location.replace('https://www.google.com/');

      if (window.opener) window.close();
      return true;
    } catch {
      try {
        blank.close();
      } catch {}
      return false;
    } finally {
      clearTimeout(timer);
      if (onReady) window.removeEventListener('message', onReady);
      atlasBlankOpening = null;
    }
  })();
  return atlasBlankOpening;
}
function launchAtlasBlankOnInteraction(event) {
  if (
    !event.isTrusted ||
    localStorage.getItem('setting_about_blank') !== 'true' ||
    window.__atlasBlankBoot ||
    sessionStorage.getItem('atlas_blank_started')
  )
    return;
  if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
  openAtlasBlank();
}
document.addEventListener('pointerdown', launchAtlasBlankOnInteraction, { capture: true });
document.addEventListener('keydown', launchAtlasBlankOnInteraction, { capture: true });

function launchAtlasBlankOnStartup() {
  if (
    window.top === window.self &&
    !window.__atlasBlankBoot &&
    localStorage.getItem('setting_about_blank') === 'true'
  ) {
    sessionStorage.removeItem('atlas_blank_started');
    openAtlasBlank();
  }
}
if (document.readyState === 'loading')
  window.addEventListener('DOMContentLoaded', launchAtlasBlankOnStartup, { once: true });
else queueMicrotask(launchAtlasBlankOnStartup);
