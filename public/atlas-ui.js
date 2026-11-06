const ATLAS_ICONS = {
  newTab: '<path fill="currentColor" stroke="none" fill-rule="evenodd" clip-rule="evenodd" d="M5.578 5.343a9.25 9.25 0 0 0 6.803 15.9c-.206-.912-.234-2.138.393-3.319c.652-1.229 2.002-1.762 2.995-2.006a9.2 9.2 0 0 1 1.898-.254h.043c1.673-.018 2.426-.562 2.826-1.08c.342-.444.47-.887.602-1.336l.05-.172A9.22 9.22 0 0 0 18.6 5.519l-.027.1c-.163.594-.425 1.202-.711 1.636c-.256.388-.752.78-1.164 1.076a10 10 0 0 1-.902.56c-.228.132-.433.25-.63.38c-.432.286-.766.593-.991 1.056a.67.67 0 0 0-.035.49c.075.272.126.578.126.889c.002.649-.328 1.176-.753 1.518a2.4 2.4 0 0 1-1.521.526c-2.455-.027-3.965-2.02-4.164-4.236c-.08-.881-.466-1.773-.954-2.552a8.8 8.8 0 0 0-1.296-1.62m1.167-.956a10.5 10.5 0 0 1 1.4 1.779c.558.89 1.069 2.012 1.177 3.214c.15 1.68 1.213 2.854 2.686 2.87a.9.9 0 0 0 .563-.194c.146-.117.196-.24.195-.346c0-.156-.026-.328-.072-.495a2.16 2.16 0 0 1 .131-1.542c.385-.794.956-1.285 1.514-1.653c.239-.158.487-.3.71-.43l.09-.05c.255-.148.48-.28.683-.427c.431-.31.704-.557.787-.684c.183-.276.388-.734.518-1.207c.103-.374.131-.662.122-.84A9.2 9.2 0 0 0 12 2.75a9.2 9.2 0 0 0-5.255 1.637M22.68 13.24q.07-.61.071-1.24c0-5.937-4.813-10.75-10.75-10.75S1.25 6.063 1.25 12S6.063 22.75 12 22.75c5.46 0 9.97-4.071 10.659-9.344a3 3 0 0 1 .048-.156zm-2.774 3.567c-.596.218-1.314.348-2.179.357h-.031l-.09.003a7.7 7.7 0 0 0-1.477.208c-.902.221-1.693.62-2.029 1.252c-.456.859-.39 1.793-.22 2.432a9.26 9.26 0 0 0 6.026-4.252"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path fill="currentColor" stroke="none" d="M11 20a1 1 0 1 0 2 0v-7h7a1 1 0 1 0 0-2h-7V4a1 1 0 1 0-2 0v7H4a1 1 0 1 0 0 2h7z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  pin: '<path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588c-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828l-3.182 3.182c-.195.195-1.219.902-1.414.707s.512-1.22.707-1.414l3.182-3.182l-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146m.122 2.112v-.002zm0-.002v.002a.5.5 0 0 1-.122.51L6.293 6.878a.5.5 0 0 1-.511.12H5.78l-.014-.004a5 5 0 0 0-.288-.076a5 5 0 0 0-.765-.116c-.422-.028-.836.008-1.175.15l5.51 5.509c.141-.34.177-.753.149-1.175a5 5 0 0 0-.192-1.054l-.004-.013v-.001a.5.5 0 0 1 .12-.512l3.536-3.535a.5.5 0 0 1 .532-.115l.096.022c.087.017.208.034.344.034q.172.002.343-.04L9.927 2.028q-.042.172-.04.343a1.8 1.8 0 0 0 .062.46z"/>',
  mute: '<path d="M22 12c0-4.09-2.47-7.61-6-9.16v2.24c2.39 1.39 4 3.96 4 6.92c0 1.85-.64 3.54-1.69 4.89l-1.42-1.42c.7-.98 1.12-2.17 1.12-3.47c0-1.77-.78-3.36-2-4.46v7.05l-2-2V4c0-.37-.2-.71-.53-.88c-.32-.17-.72-.15-1.03.05L7.73 6.32L2.71 1.29L1.3 2.7l20 20l1.41-1.41l-2.98-2.98A9.94 9.94 0 0 0 22 11.99Zm-10-1.41L9.17 7.76L12 5.87zm0 7.54l-4.45-2.96s-.06-.02-.08-.03c-.06-.03-.12-.06-.19-.08s-.13-.03-.2-.04c-.03 0-.06-.02-.09-.02h-3V9h.76L3.02 7.27C2.41 7.61 2 8.26 2 9v6c0 1.1.9 2 2 2h2.7l5.75 3.83c.17.11.36.17.55.17c.16 0 .32-.04.47-.12c.33-.17.53-.51.53-.88v-1.76l-2-2z"/>',
  volume: '<path d="M16 21c3.527-1.547 5.999-4.909 5.999-9S19.527 4.547 16 3v2c2.387 1.386 3.999 4.047 3.999 7S18.387 17.614 16 19z"/><path d="M16 7v10c1.225-1.1 2-3.229 2-5s-.775-3.9-2-5M4 17h2.697l5.748 3.832a1 1 0 0 0 1.027.05A1 1 0 0 0 14 20V4a1 1 0 0 0-1.554-.832L6.697 7H4c-1.103 0-2 .897-2 2v6c0 1.103.897 2 2 2m0-8h3c.033 0 .061-.016.093-.019a1 1 0 0 0 .38-.116c.026-.015.057-.017.082-.033L12 5.868v12.264l-4.445-2.964c-.025-.017-.056-.02-.082-.033a1 1 0 0 0-.382-.116C7.059 15.016 7.032 15 7 15H4z"/>',
  moon: '<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  closeOthers: '<path d="m3 5 6 6m0-6-6 6m12-6 6 6m0-6-6 6M3 19h18"/>',
  closeLeft: '<path d="M4 4v16m13-13-5 5 5 5M9 12h12"/>',
  closeRight: '<path d="M20 4v16M7 7l5 5-5 5M3 12h12"/>',
  split: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18"/>',
  history: '<path fill="currentColor" stroke="none" d="M6.865 6.882A7.25 7.25 0 1 1 4.75 12a.75.75 0 0 0-1.5 0a8.75 8.75 0 1 0 2.552-6.176a1 1 0 0 0-.07.08L4.475 4.646a.5.5 0 0 0-.852.309L3.27 8.844a.5.5 0 0 0 .543.543l3.89-.354a.5.5 0 0 0 .307-.851L6.782 6.954a1 1 0 0 0 .083-.072"/><path fill="currentColor" stroke="none" d="M12.75 7a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 .352.636l3 1.875a.75.75 0 1 0 .796-1.272l-2.648-1.655z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  palette: '<circle cx="12" cy="12" r="9"/><path d="M7 9h.01M12 6h.01M17 9h.01M12 17h.01"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
  external: '<path d="M14 3h7v7M21 3 10 14M10 3H4v17h17v-6"/>'
};
function atlasIcon(name, className = '') {
  if (['pin', 'mute', 'volume'].includes(name)) return `<svg class="${className}" viewBox="0 0 ${name === 'pin' ? '16 16' : '24 24'}" fill="currentColor" aria-hidden="true">${ATLAS_ICONS[name]}</svg>`;
  if (name === 'reload') return `<svg class="${className} atlas-reload-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 16.22 7.78L13 11h7V4z"/></svg>`;
  if (name === 'developer') return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m16.71 16.71l4.7-4.71l-4.7-4.71l-1.42 1.42l3.3 3.29l-3.3 3.29zm-8-1.42L5.41 12l3.3-3.29l-1.42-1.42L2.59 12l4.7 4.71zM14 3l-.98-.22l-2 9l-2 9L10 21l.98.22l2-9l2-9z"/></svg>`;
  if (name === 'hibernate') return `<svg class="${className}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" aria-hidden="true"><path d="M16.866 7.47A18 18 0 0 0 16 13c0 9.941 8.059 18 18 18a17.9 17.9 0 0 0 7.134-1.47C38.801 36.767 32.012 42 24 42c-9.941 0-18-8.059-18-18c0-7.407 4.473-13.768 10.866-16.53Z"/><path stroke-linecap="round" d="M31.66 10H41l-10 8h10"/></svg>`;
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ATLAS_ICONS[name] || ATLAS_ICONS.check}</svg>`;
}

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
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')].filter(button => button.offsetParent !== null && !button.closest('.atlas-menu-closing'));
    const current = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeAtlasMenu(true); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const index = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
        : (current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus();
    } else if (e.key === 'Tab') closeAtlasMenu();
  });
}
document.addEventListener('pointerdown', e => {
  if (atlasOpenMenu && !atlasOpenMenu.contains(e.target) && !atlasMenuTrigger?.contains(e.target)) closeAtlasMenu();
});
window.addEventListener('resize', () => closeAtlasMenu());
document.addEventListener('scroll', e => {
  if (atlasOpenMenu && !atlasOpenMenu.contains(e.target)) closeAtlasMenu();
}, true);

const ATLAS_OPTION_DOMAINS = {
  google: 'google.com', duckduckgo: 'duckduckgo.com', bing: 'bing.com', brave: 'brave.com', yahoo: 'yahoo.com',
  drive: 'drive.google.com', classroom: 'classroom.google.com', docs: 'docs.google.com', canvas: 'instructure.com',
  desmos: 'desmos.com', khan: 'khanacademy.org'
};
function dropdownOptionIcon(value, select) {
  const domain = ATLAS_OPTION_DOMAINS[value];
  if (domain) return `<img class="atlas-dropdown-icon" src="${escapeHtml(officialAtlasSite('https://' + domain)?.icon || '/api/favicon?domain=' + encodeURIComponent(domain))}" alt="" />`;
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
    const label = select.getAttribute('aria-label') || select.closest('.settings-row')?.querySelector('.settings-row-title')?.textContent || 'Select option';
    button.setAttribute('aria-label', label);
    wrapper.append(button);
    select._atlasRefresh = () => {
      const option = select.selectedOptions[0] || select.options[0];
      button.innerHTML = `<span class="atlas-dropdown-label">${escapeHtml(option.textContent.replace(/\s*\(selected\)/g, ''))}</span>${dropdownOptionIcon(option.value, select)}${atlasIcon('chevron', 'atlas-dropdown-chevron')}`;
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

const LEGACY_CLOAK_PRESETS = {
  default: { title: 'Atlas', icon: '/assets/atlas.png' },
  google: { title: 'Google', icon: '/assets/official/google.ico' },
  classroom: { label: 'Google Classroom', title: 'Home - Classroom', icon: '/assets/classroom.png' },
  canvas: { label: 'Canvas', title: 'Dashboard', icon: '/assets/canvas.ico' },
  desmos: { label: 'Desmos', title: 'Desmos | Graphing Calculator', icon: '/assets/official/desmos.ico' },
  khan: { label: 'Khan Academy', title: 'Dashboard | Khan Academy', icon: '/assets/official/khan-academy.ico' },
  gmail: { label: 'Gmail', title: 'Inbox (3)', icon: '/assets/official/gmail.ico' },
  outlook: { title: 'Outlook', icon: '/assets/official/outlook.ico' },
  wikipedia: { title: 'Wikipedia', icon: '/assets/official/wikipedia.ico' },
  duolingo: { title: 'Duolingo', icon: '/assets/official/duolingo.ico' }
};
const ATLAS_THEMES = {
  charcoal: { label: 'Charcoal', colors: ['#141414', '#1c1c1c', '#363636', '#464646'] },
  graphite: { label: 'Graphite', colors: ['#212121', '#2b2b2b', '#424242', '#505050'] },
  oled: { label: 'OLED', colors: ['#080808', '#151515', '#303030', '#414141'] },
  stone: { label: 'Stone', colors: ['#282828', '#333333', '#494949', '#595959'] },
  sepia: { label: 'Sepia', colors: ['#1b1713', '#28221b', '#493e30', '#5e503e'] },
  forest: { label: 'Forest', colors: ['#121815', '#1c2520', '#36463c', '#45594c'] },
  plum: { label: 'Plum', colors: ['#19141b', '#251e29', '#42364a', '#574761'] }
};
const ATLAS_BACKGROUNDS = {
  grid: { label: 'Grid', image: 'linear-gradient(#ffffff09 1px, transparent 1px),linear-gradient(90deg,#ffffff09 1px,transparent 1px)', size: '38px 38px' },
  fine_grid: { label: 'Fine Grid', image: 'linear-gradient(#ffffff07 1px, transparent 1px),linear-gradient(90deg,#ffffff07 1px,transparent 1px)', size: '20px 20px' },
  dots: { label: 'Dots', image: 'radial-gradient(#ffffff13 1px, transparent 1px)', size: '22px 22px' },
  diagonal: { label: 'Diagonal Lines', image: 'repeating-linear-gradient(45deg,transparent 0 25px,#ffffff08 25px 26px)', size: 'auto' },
  crosshatch: { label: 'Crosshatch', image: 'repeating-linear-gradient(45deg,transparent 0 35px,#ffffff07 35px 36px),repeating-linear-gradient(-45deg,transparent 0 35px,#ffffff07 35px 36px)', size: 'auto' },
  rings: { label: 'Rings', image: 'repeating-radial-gradient(circle at center,transparent 0 44px,#ffffff07 44px 45px)', size: '100% 100%' },
  glow: { label: 'Soft Glow', image: 'radial-gradient(ellipse at 20% 25%,#ffffff09,transparent 55%),radial-gradient(ellipse at 85% 80%,#ffffff06,transparent 50%)', size: '100% 100%' },
  checkerboard: { label: 'Checkerboard', image: 'conic-gradient(#ffffff06 25%,transparent 0 50%,#ffffff06 0 75%,transparent 0)', size: '72px 72px' },
  none: { label: 'None', image: 'none', size: 'auto' }
};
const legacyCloak = LEGACY_CLOAK_PRESETS[localStorage.getItem('setting_tab_cloak')];
if (localStorage.getItem('setting_custom_title_enabled') === null && legacyCloak) {
  localStorage.setItem('setting_custom_title_enabled', String(legacyCloak !== LEGACY_CLOAK_PRESETS.default));
  localStorage.setItem('setting_custom_title', legacyCloak.title);
  localStorage.setItem('setting_custom_favicon', legacyCloak.icon);
}
localStorage.removeItem('setting_tab_cloak');
let customTitleEnabled = localStorage.getItem('setting_custom_title_enabled') === 'true';
let customSiteTitle = localStorage.getItem('setting_custom_title') || 'Atlas';
let customSiteFavicon = localStorage.getItem('setting_custom_favicon') || '/assets/atlas.png';

const retiredIcon = /^\/assets\/cloaks\/([a-z]+)\.(?:png|jpg)(?:\?.*)?$/.exec(customSiteFavicon);
if (retiredIcon) {
  customSiteFavicon = LEGACY_CLOAK_PRESETS[retiredIcon[1]]?.icon || '/assets/atlas.png';
  localStorage.setItem('setting_custom_favicon', customSiteFavicon);
}
if (/^\/assets\/atlas\.svg(?:\?v=7)?$/.test(customSiteFavicon) || /^\/assets\/atlas(?:-favicon)?\.png\?v=\d+$/.test(customSiteFavicon)) {
  customSiteFavicon = '/assets/atlas.png';
  localStorage.setItem('setting_custom_favicon', customSiteFavicon);
}
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
    return ['http:', 'https:'].includes(url.protocol) || /^data:image\/(?:png|jpeg|gif|webp|x-icon|vnd.microsoft.icon|svg\+xml)[;,]/i.test(value);
  } catch { return false; }
}
function refreshBranding() {
  const ownerDocument=window.__atlasBlankBoot?.embedded?window.parent.document:document;
  const active=ownerDocument.hasFocus() && !ownerDocument.hidden;
  const custom = customTitleEnabled && (!autoCloakEnabled || !active);
  document.title = custom ? customSiteTitle.trim() || 'Atlas' : 'Atlas';
  const icon=custom && validAtlasFavicon(customSiteFavicon) && customSiteFavicon.trim() ? customSiteFavicon : '/assets/atlas.png';
  document.getElementById('siteFavicon').href = window.__atlasBlankBoot?.embedded ? new URL(icon,atlasAppOrigin()).href : icon;
}
window.addEventListener('blur', refreshBranding);
window.addEventListener('focus', refreshBranding);
if(window.__atlasBlankBoot?.embedded) {
  window.parent.addEventListener('blur',()=>setTimeout(refreshBranding,0));
  window.parent.addEventListener('focus',()=>setTimeout(refreshBranding,0));
  window.parent.document.addEventListener('visibilitychange',refreshBranding);
} else document.addEventListener('visibilitychange',refreshBranding);

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
function normalizedShortcut(value) { return value.toLowerCase().replace(/\s+/g, ''); }
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
  try { window.top.location.replace(panicRedirectUrl); }
  catch { location.replace(panicRedirectUrl); }
}
const ATLAS_TAB_KEYBINDS = {
  new: { description: 'Open a new browsing tab.', title: 'New Tab', default: 'Ctrl+T' },
  reopen: { description: 'Restore the last closed tab.', title: 'Reopen Closed Tab', default: 'Ctrl+Shift+T' },
  close: { description: 'Close the current tab.', title: 'Close Tab', default: 'Ctrl+W' },
  next: { description: 'Switch to the next tab.', title: 'Next Tab', default: 'Ctrl+Tab' },
  previous: { description: 'Switch to the previous tab.', title: 'Previous Tab', default: 'Ctrl+Shift+Tab' },
  reload: { description: 'Refresh the current page.', title: 'Reload Page', default: 'Ctrl+R' },
  duplicate: { description: 'Open a copy of the current tab.', title: 'Duplicate Tab', default: 'Ctrl+Shift+D' },
  address: { description: 'Select the address bar to enter a URL or search.', title: 'Focus Address Bar', default: 'Ctrl+L' },
  split: { description: 'Open or close side-by-side browsing.', title: 'Toggle Split View', default: 'Ctrl+Shift+S' },
  history: { description: 'View your recently visited pages.', title: 'Open History', default: 'Ctrl+H' },
  bookmark: { description: 'Save the current page as a shortcut.', title: 'Bookmark Page', default: 'Ctrl+D' },
  bar: { description: 'Toggle the bottom browser controls.', title: 'Show or Hide Browser Bar', default: 'Ctrl+Shift+B' }
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
  restored.pinned = closed.pinned;
  restored.muted = closed.muted;
  applyTabMediaState(restored);
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
    if (Object.keys(ATLAS_TAB_KEYBINDS).some(other => other !== action && normalizedShortcut(atlasTabKeybind(other)) === normalizedShortcut(shortcut))
        || (panicKeyEnabled && normalizedShortcut(panicKeyChar) === normalizedShortcut(shortcut))) {
      status.textContent = 'That shortcut is already in use. Choose another combination.';
      return;
    }
    localStorage.setItem('setting_keybind_' + action, shortcut);
    button.textContent = shortcut;
    atlasRecordingTabKeybind = null;
    status.textContent = 'Shortcut saved.';
    return;
  }
  if (atlasRecordingShortcut) { runPanicShortcut(e, fromFrame); return; }
  const shortcut = normalizedShortcut(shortcutFromEvent(e));
  const action = Object.keys(ATLAS_TAB_KEYBINDS).find(key => atlasTabKeybind(key) && normalizedShortcut(atlasTabKeybind(key)) === shortcut);
  if (action) {
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    closeAtlasMenu();
    if (action === 'new') { createTab('/new-tab', 'New Tab', true); switchView('browser'); }
    else if (action === 'reopen') reopenAtlasClosedTab();
    else if (action === 'close' && activeTabId) closeTab(activeTabId);
    else {
      const current = tabs.find(tab => tab.id === activeTabId && !tab.isClosing);
      if (action === 'next' || action === 'previous') {
        const open = tabs.filter(tab => !tab.isClosing);
        const index = open.findIndex(tab => tab.id === activeTabId);
        const next = open[(index + (action === 'next' ? 1 : -1) + open.length) % open.length];
        if (next) { switchView('browser'); activateTab(next.id); }
      } else if (action === 'reload') reloadAtlasTab(current);
      else if (action === 'duplicate' && current) { createTab(current.url, current.title, true); switchView('browser'); }
      else if (action === 'address') {
        const input = current ? bottomAddressBar : homeSearchInput;
        switchView(current ? 'browser' : 'home');
        if (current) browserView.classList.remove('bottom-bar-hidden');
        input.focus(); input.select();
      } else if (action === 'split' && current) { switchView('browser'); toggleAtlasSplit(); }
      else if (action === 'history') openAtlasHistory();
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
  document.querySelector('.tab-bar').style.display = 'flex';
  homeBottomDock.style.zoom = '1';
  document.querySelector('.nav-buttons').style.zoom = '1';
  let custom = document.getElementById('atlasCustomCSS');
  if (!custom) { custom = document.createElement('style'); custom.id = 'atlasCustomCSS'; document.head.append(custom); }
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
  const query = settingsSearchInput.value.toLowerCase().trim();
  settingsCardsContainer.querySelectorAll('.settings-row').forEach(row => {
    row.style.display = !query || row.querySelector('.settings-row-text').textContent.toLowerCase().includes(query) ? 'flex' : 'none';
  });
}
let atlasSettingsTimer;
function renderSettingsTab(tab, afterFade = false) {
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
  const title = { privacy: 'Privacy', customize: 'Customize', browsing: 'Browsing', keybinds: 'Keybinds', advanced: 'Advanced' }[tab] || 'Privacy';
  settingsSectionTitle.textContent = title;
  if (tab === 'privacy') {
    settingsCardsContainer.innerHTML =
      '<div class="settings-custom-title-group">' + atlasSettingsRow('Use Custom Site Title', 'Change your browser tab’s title and icon.', atlasToggle('settingCustomTitleEnabled', customTitleEnabled, 'Use custom site title')) +
      `<div id="customSiteBranding" class="custom-site-branding-reveal${customTitleEnabled ? ' is-open' : ''}" ${customTitleEnabled ? '' : 'inert'}><div class="custom-site-branding"><label>Title<input id="settingCustomTitle" class="settings-input-sm" maxlength="160" value="${escapeHtml(customSiteTitle)}" placeholder="Atlas" /></label><label>Favicon URL<input id="settingCustomFavicon" class="settings-input-sm" value="${escapeHtml(customSiteFavicon)}" placeholder="https://example.com/favicon.ico or data:image/..." /><span id="customFaviconError" role="status"></span></label></div></div></div>` +
      atlasSettingsRow('Auto Cloak', 'Show your custom title and icon while away.', atlasToggle('settingAutoCloak', autoCloakEnabled, 'Auto cloak')) +
      atlasSettingsRow('Auto about:blank', 'Open Atlas in about:blank automatically when it loads.', atlasToggle('settingAboutBlankStartup', localStorage.getItem('setting_about_blank') === 'true', 'Open about:blank on startup')) +
      atlasSettingsRow('Anti-Close', 'Confirm before closing or leaving Atlas.', atlasToggle('settingAntiClose', localStorage.getItem('setting_confirm_leave') === 'true', 'Anti-Close')) +
      atlasSettingsRow('Panic Key', 'Enable your panic shortcut on all pages.', atlasToggle('settingPanicKey', panicKeyEnabled, 'Panic key')) +
      atlasSettingsRow('Panic Shortcut', 'Record a shortcut and set its destination.', `<div class="settings-shortcut-controls"><button id="settingPanicKeyChar" class="settings-action-btn" aria-label="Record panic shortcut">${escapeHtml(panicKeyChar)}</button><input id="settingPanicUrl" class="settings-input-sm" aria-label="Panic destination" value="${escapeHtml(panicRedirectUrl)}" placeholder="https://google.com" /></div>`);
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
    bindAtlasToggle('settingAutoCloak', 'setting_auto_cloak', enabled => { autoCloakEnabled = enabled; refreshBranding(); });
    bindAtlasToggle('settingAntiClose', 'setting_confirm_leave', applyConfirmLeave);
    bindAtlasToggle('settingAboutBlankStartup', 'setting_about_blank', async enabled => {
      if (enabled && !window.__atlasBlankBoot && !await openAtlasBlank()) {
        const row = document.getElementById('settingAboutBlankStartup').closest('.settings-row');
        row.querySelector('.settings-row-sub').textContent = 'Your browser blocked the window. Allow popups for Atlas to use about:blank.';
      }
    });
    bindAtlasToggle('settingPanicKey', 'setting_panic_enabled', enabled => { panicKeyEnabled = enabled; });
    document.getElementById('settingPanicKeyChar').onclick = e => {
      atlasRecordingShortcut = true;
      e.currentTarget.textContent = 'Press Key';
      e.currentTarget.focus();
    };
    const destination = document.getElementById('settingPanicUrl');
    destination.oninput = () => {
      try {
        const url = new URL(/^https?:\/\//i.test(destination.value) ? destination.value : 'https://' + destination.value);
        if (!['http:', 'https:'].includes(url.protocol)) return;
        panicRedirectUrl = url.href;
        localStorage.setItem('setting_panic_url', panicRedirectUrl);
      } catch {}
    };
    destination.onkeydown = e => { if (e.key === 'Enter') { destination.oninput(); destination.blur(); } };
  } else if (tab === 'customize') {
    const get = (key, fallback) => localStorage.getItem(key) || fallback;
    const theme = get('setting_theme', 'charcoal');
    settingsCardsContainer.innerHTML =
      atlasSettingsRow('Site Theme', 'Choose your colors.', atlasSelect('settingSiteTheme', Object.hasOwn(ATLAS_THEMES, theme) ? theme : 'charcoal', Object.entries(ATLAS_THEMES).map(([id, preset]) => [id, preset.label]), 'Site theme')) +
      atlasSettingsRow('Background Design', 'Set the Home and New Tab background.', atlasSelect('settingBgDesign', get('setting_bg_design', 'grid'), Object.entries(ATLAS_BACKGROUNDS).map(([id, preset]) => [id, preset.label]), 'Background design')) +
      `<div class="settings-row settings-custom-css"><div class="settings-row-text"><div class="settings-row-title">Custom CSS</div><div class="settings-row-sub">Add custom styles. Changes save automatically.</div></div><textarea id="settingCustomCSS" aria-label="Custom CSS" spellcheck="false" placeholder=".welcome-title { letter-spacing: -2px; }">${escapeHtml(get('setting_custom_css', ''))}</textarea></div>`;
    [['settingSiteTheme', 'setting_theme'], ['settingBgDesign', 'setting_bg_design']].forEach(([id, key]) => bindAtlasAppearance(id, key));
    document.getElementById('settingCustomCSS').oninput = e => {
      localStorage.setItem('setting_custom_css', e.target.value);
      applyAtlasAppearance();
    };
  } else if (tab === 'browsing') {
    settingsCardsContainer.innerHTML =
      atlasSettingsRow('Search Engine', 'Choose your default search engine.', atlasSelect('settingSearchEngine', getSearchEngineId(), Object.entries(SEARCH_ENGINES).map(([key, engine]) => [key, engine.name]), 'Search engine')) +
      atlasSettingsRow('Block Ads & Trackers', 'Block ads and trackers on all sites.', atlasToggle('settingGlobalAds', blockAdsToggle.checked, 'Block ads and trackers')) +
      atlasSettingsRow('Fingerprinting Protection', 'Reduce fingerprinting across all tabs.', atlasToggle('settingGlobalFingerprint', fingerprintToggle.checked, 'Fingerprinting protection'));
    document.getElementById('settingSearchEngine').onchange = e => setSearchEngine(e.target.value);
    document.getElementById('settingGlobalAds').onchange = e => { blockAdsToggle.checked = e.target.checked; blockAdsToggle.dispatchEvent(new Event('change')); };
    document.getElementById('settingGlobalFingerprint').onchange = e => { fingerprintToggle.checked = e.target.checked; fingerprintToggle.dispatchEvent(new Event('change')); };
  } else if (tab === 'keybinds') {
    settingsCardsContainer.innerHTML = Object.entries(ATLAS_TAB_KEYBINDS).map(([action, preset]) =>
      atlasSettingsRow(preset.title, preset.description, `<div class="settings-keybind-controls"><button id="settingKeybind_${action}" class="settings-action-btn" aria-label="Record ${escapeHtml(preset.title.toLowerCase())} shortcut">${escapeHtml(atlasTabKeybind(action) || 'Not set')}</button><button id="settingKeybindClear_${action}" class="settings-action-btn" aria-label="Clear ${escapeHtml(preset.title.toLowerCase())} shortcut">Clear</button></div>`)
    ).join('') + atlasSettingsRow('Restore Defaults', 'Reset all keyboard shortcuts.', '<button id="settingKeybindReset" class="settings-action-btn">Reset Keybinds</button>')
      + '<p class="settings-row-sub settings-note">Avoid shortcuts reserved by your browser.</p>'
      + '<div id="settingKeybindStatus" class="settings-status" role="status" aria-live="polite"></div>';
    Object.keys(ATLAS_TAB_KEYBINDS).forEach(action => {
      document.getElementById('settingKeybindClear_' + action).onclick = () => {
        localStorage.setItem('setting_keybind_' + action, '');
        if (atlasRecordingTabKeybind === action) atlasRecordingTabKeybind = null;
        document.getElementById('settingKeybind_' + action).textContent = 'Not set';
        document.getElementById('settingKeybindStatus').textContent = 'Shortcut cleared.';
      };
      document.getElementById('settingKeybind_' + action).onclick = () => {
        atlasRecordingShortcut = false;
        if (atlasRecordingTabKeybind) document.getElementById('settingKeybind_' + atlasRecordingTabKeybind).textContent = atlasTabKeybind(atlasRecordingTabKeybind) || 'Not set';
        atlasRecordingTabKeybind = action;
        document.getElementById('settingKeybind_' + action).textContent = 'Press Key';
        document.getElementById('settingKeybindStatus').textContent = '';
      };
    });
    document.getElementById('settingKeybindReset').onclick = () => {
      Object.keys(ATLAS_TAB_KEYBINDS).forEach(action => localStorage.removeItem('setting_keybind_' + action));
      renderSettingsTab('keybinds', true);
    };
  } else {
    const build = window.__atlasConfig?.build;
    const version = build?.revision ? build.revision.slice(0, 7) + (build.modified ? ' (local changes)' : '') : 'Development build';
    settingsCardsContainer.innerHTML =
      atlasSettingsRow('Build Version', 'Your current Atlas revision.', `<code id="atlasBuildVersion" title="${escapeHtml(build?.revision || '')}">${escapeHtml(version)}</code>`) +
      atlasSettingsRow('Proxy Engine', 'Choose how websites are rendered.', `<select id="settingProxyEngine" class="settings-input-sm" aria-label="Proxy engine"><option value="scramjet">Scramjet</option><option value="ultraviolet">Ultraviolet</option></select>`) +
      atlasSettingsRow('Wisp Config', 'Add a custom relay, or leave blank to use Atlas.', `<div class="settings-wisp-control"><input type="text" id="settingWispInput" placeholder="wss://your-wisp-url.net/wisp/" class="settings-input-sm" aria-label="Wisp server" value="${escapeHtml(activeWss === defaultLocalWisp ? '' : activeWss)}"/><div class="settings-status" id="settingWispStatus" role="status"></div></div>`) +
      atlasSettingsRow('Export Settings', 'Download your settings as JSON.', '<button class="settings-action-btn" id="settingExportBtn">Export JSON</button>') +
      atlasSettingsRow('Import Settings', 'Restore settings from JSON.', '<input type="file" id="settingImportFileInput" accept=".json" hidden/><button class="settings-action-btn" id="settingImportBtn">Import JSON</button>') +
      atlasSettingsRow('Reset Instance', 'Clear saved preferences and shortcuts.', '<button class="settings-action-btn danger" id="settingResetDataBtn">Reset Data</button>');
    const engineSelect=document.getElementById('settingProxyEngine');
    engineSelect.value=AtlasEngines.selected();
    engineSelect.onchange=()=>{localStorage.setItem('setting_proxy_engine',engineSelect.value);tabs.filter(tab=>!tab.isNewTab&&!atlasInternalPage(tab.url)).forEach(tab=>navigateTab(tab.id,tab.url));};
    const wispInput = document.getElementById('settingWispInput');
    const parseWisp = () => {
      const value=wispInput.value.trim(),url=new URL(value || defaultLocalWisp);
      if(value && (url.protocol!=='wss:' || !url.hostname || url.username || url.password || url.hash))throw new Error();
      return url;
    };
    const markInvalid = () => {wispInput.setAttribute('aria-invalid','true');wispInput.setAttribute('aria-label','Wisp server, enter a valid wss:// address');};
    wispInput.oninput = () => {
      delete wispInput.dataset.saved;document.getElementById('settingWispStatus').textContent='';
      try{parseWisp();wispInput.removeAttribute('aria-invalid');wispInput.setAttribute('aria-label','Wisp server');}catch{markInvalid();}
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
      } catch { delete wispInput.dataset.saved; markInvalid(); status.textContent = ''; }
    };
    document.getElementById('settingExportBtn').onclick = () => {
      const data = exportAtlasSettings(localStorage);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      link.download = 'atlas-settings.json'; link.click();
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
          previous.forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
          throw error;
        }
        window.onbeforeunload = null; location.reload();
      } catch { alert('Choose a valid Atlas settings JSON file.'); }
      finally { input.value = ''; }
    };
    document.getElementById('settingResetDataBtn').onclick = () => {
      if (!confirm('Reset Atlas settings and shortcuts?')) return;
      Object.keys(localStorage).filter(isAtlasStorageKey).forEach(key => localStorage.removeItem(key));
      window.onbeforeunload = null; location.reload();
    };
  }
  hydrateAtlasDropdowns(settingsCardsContainer);
  filterAtlasSettings();
  animateAtlasContent(settingsCardsContainer, 'settings-enter');
  animateAtlasContent(settingsSectionTitle, 'settings-enter');
}
function isAtlasStorageKey(key) { return key.startsWith('setting_') || key.startsWith('network_shortcuts') || ['wisp_server_url', 'atlas_muted_sites', 'atlas_browsing_history', 'atlas_tab_sessions', 'atlas_current_session'].includes(key); }
const ATLAS_BOOLEAN_SETTINGS = new Set(['about_blank','auto_cloak','block_ads','block_fp','confirm_leave','custom_title_enabled','panic_enabled']);
function exportAtlasSettings(storage) {
  const result = {format:'atlas-settings',version:1,settings:{},keybinds:{},relay:null,data:{}};
  Object.keys(storage).filter(isAtlasStorageKey).sort().forEach(key => {
    const value = storage.getItem(key);
    if (key.startsWith('setting_keybind_')) result.keybinds[key.slice('setting_keybind_'.length)] = value;
    else if (key.startsWith('setting_')) {
      const name = key.slice(8);
      if (name === 'custom_css') { result.settings[name] = value; return; }
      result.settings[name] = ATLAS_BOOLEAN_SETTINGS.has(name) && ['true','false'].includes(value) ? value === 'true' : value;
    } else if (key === 'wisp_server_url') result.relay = value;
    else {
      try { result.data[key] = {encoding:'json',value:JSON.parse(value)}; }
      catch { result.data[key] = {encoding:'text',value}; }
    }
  });
  return result;
}
function parseAtlasSettings(data) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(data)) throw new Error('Invalid settings');
  let entries;
  if (Object.hasOwn(data,'format') || Object.hasOwn(data,'version')) {
    if (data.format !== 'atlas-settings' || data.version !== 1 || !object(data.settings) || !object(data.keybinds) || !object(data.data)) throw new Error('Unsupported settings format');
    entries = [];
    for (const [name,value] of Object.entries(data.settings)) {
      if (!/^[a-z][a-z0-9_]*$/.test(name) || name.startsWith('keybind_') || !(typeof value === 'string' || ATLAS_BOOLEAN_SETTINGS.has(name) && typeof value === 'boolean')) throw new Error('Invalid setting');
      entries.push(['setting_'+name,String(value)]);
    }
    for (const [name,value] of Object.entries(data.keybinds)) {
      if (!Object.hasOwn(ATLAS_TAB_KEYBINDS,name) || typeof value !== 'string') throw new Error('Invalid keybind');
      entries.push(['setting_keybind_'+name,value]);
    }
    if (data.relay !== null && data.relay !== undefined) {
      if (typeof data.relay !== 'string' || !['ws:','wss:'].includes(new URL(data.relay).protocol)) throw new Error('Invalid relay');
      entries.push(['wisp_server_url',data.relay]);
    }
    for (const [key,record] of Object.entries(data.data)) {
      if (!isAtlasStorageKey(key) || key.startsWith('setting_') || key === 'wisp_server_url' || !object(record) || !Object.hasOwn(record,'value')) throw new Error('Invalid saved data');
      if (record.encoding === 'json') entries.push([key,JSON.stringify(record.value)]);
      else if (record.encoding === 'text' && typeof record.value === 'string') entries.push([key,record.value]);
      else throw new Error('Invalid saved data encoding');
    }
  } else {
    entries = Object.entries(data).filter(([key]) => isAtlasStorageKey(key));
    if (entries.some(([,value]) => typeof value !== 'string')) throw new Error('Invalid legacy settings');
  }
  if (!entries.length) throw new Error('No Atlas settings found');
  return entries;
}
function applyConfirmLeave(enabled) { window.onbeforeunload = enabled ? e => { e.preventDefault(); e.returnValue = ''; } : null; }
settingsSearchInput.addEventListener('input', filterAtlasSettings);
settingsNavItems.forEach(button => button.onclick = () => {
  if (currentSettingsTab === button.dataset.tab) return;
  currentSettingsTab = button.dataset.tab;
  atlasSetAppPath('/settings#' + currentSettingsTab);
  renderSettingsTab(currentSettingsTab);
});

function mutedAtlasSites() {
  try { const sites = JSON.parse(localStorage.getItem('atlas_muted_sites') || '[]'); return Array.isArray(sites) ? sites : []; }
  catch { return []; }
}
function applyGlobalProxyPreferences(ads, fingerprints) {
  localStorage.setItem('setting_block_ads', ads);
  localStorage.setItem('setting_block_fp', fingerprints);
  blockAdsToggle.checked = ads;
  fingerprintToggle.checked = fingerprints;
  tabs.forEach(tab => { tab.blockAds = ads; tab.blockFp = fingerprints; });
  tabs.filter(tab => !tab.isNewTab && !tab.hibernated).forEach(tab => navigateTab(tab.id, tab.url));
}
function applyTabMediaState(tab) {
  if (tab.isNewTab || tab.hibernated || !tab.iframe?.contentWindow) return;
  const muted = Boolean(tab.muted || mutedAtlasSites().includes(getHostname(tab.url)));
  const origin = new URL(tab.iframe.src || atlasAppOrigin(), atlasAppOrigin()).origin;
  if (origin === 'null') return;
  AtlasEngines.post(tab.iframe,{ type: '__atlas_media_state', muted }, origin);
}
window.addEventListener('message', event => {
  if (event.data?.type !== '__atlas_media_ready') return;
  const tab = tabs.find(tab => tab.iframe?.contentWindow === event.source);
  if (tab && event.origin === new URL(tab.iframe.src, atlasAppOrigin()).origin) applyTabMediaState(tab);
});
function reloadAtlasTab(tab) {
  if (!tab || tab.isNewTab) return;
  tab.hibernated = false;
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
  const firefox=/Firefox\//.test(navigator.userAgent);
  const blank=window.open(firefox?'about:blank':' ', '_blank');
  if(!firefox)blank?.stop();
  return blank;
}
function writeTab(tab, html) {
  const write = tab.Function('html','resolve','reject','try { document.open(); document.write(html); document.close(); resolve(); } catch(error) { reject(error); }');
  return new Promise((resolve,reject)=>tab.setTimeout(write,0,html,resolve,reject));
}
function atlasBlankLoading() {
  return '<div id="atlasBlankLoading" role="status" aria-label="Loading Atlas"><i aria-hidden="true"></i></div>';
}
function atlasBlankLoadingStyle() {
  const background=getComputedStyle(document.getElementById('loaderOverlay'));
  const spinner=getComputedStyle(document.querySelector('#loaderOverlay .custom-spinner'));
  return `html,body{width:100%;height:100%;margin:0;overflow:hidden;background:${background.backgroundColor}}#atlasBlankLoading{position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;background-color:${background.backgroundColor};background-image:${background.backgroundImage};background-size:${background.backgroundSize}}#atlasBlankLoading i{box-sizing:${spinner.boxSizing};width:${spinner.width};height:${spinner.height};border:${spinner.borderTopWidth} ${spinner.borderTopStyle} ${spinner.borderBottomColor};border-top-color:${spinner.borderTopColor};border-radius:${spinner.borderTopLeftRadius};animation:atlasBlankSpin ${spinner.animationDuration} ${spinner.animationTimingFunction} infinite}@keyframes atlasBlankSpin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#atlasBlankLoading i{animation:none}}`.replace(/</g,'\\3c ');
}
function atlasBlankWrapper(url, origin, token, session) {
  const appUrl=new URL(url);appUrl.searchParams.set('atlas_blank','1');
  const launch=JSON.stringify({url,token,session}).replace(/</g,'\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas</title><script>window.__atlasBlankLaunch=${launch};<\/script><style>${atlasBlankLoadingStyle()}iframe{width:100%;height:100%;border:0;display:block}</style></head><body>${atlasBlankLoading()}<iframe id="atlasBlankApp" title="Atlas" credentialless src="${escapeHtml(appUrl.href)}" allow="fullscreen *" allowfullscreen></iframe><script>
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
  try {loading=writeTab(blank,`<!doctype html><html><head><title>Atlas</title><style>${atlasBlankLoadingStyle()}</style></head><body>${atlasBlankLoading()}</body></html>`);}
  catch {blank.close();return false;}
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
          if (event.source === blank && event.origin === atlasAppOrigin() && event.data?.type === '__atlas_blank_ready' && event.data.token === token) resolve();
        };
        window.addEventListener('message', onReady);
        timer = setTimeout(() => reject(new Error('Application initialization timed out')), 20000);
      });
      await writeTab(blank, atlasBlankWrapper(url, atlasAppOrigin(), token, session));
      await ready;
      if (blank.closed) throw new Error('Blank tab closed');
      sessionStorage.setItem('atlas_blank_started', 'true');
      blank.opener = null;
      window.location.replace('https://www.google.com/');

      if (window.opener) window.close();
      return true;
    } catch {
      try { blank.close(); } catch {}
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
  if (!event.isTrusted || localStorage.getItem('setting_about_blank') !== 'true' || window.__atlasBlankBoot || sessionStorage.getItem('atlas_blank_started')) return;
  if (event.type === 'keydown' && !['Enter',' '].includes(event.key)) return;
  openAtlasBlank();
}
document.addEventListener('pointerdown', launchAtlasBlankOnInteraction, { capture:true });
document.addEventListener('keydown', launchAtlasBlankOnInteraction, { capture:true });

function launchAtlasBlankOnStartup() {
  if (window.top === window.self && !window.__atlasBlankBoot && localStorage.getItem('setting_about_blank') === 'true') {
    sessionStorage.removeItem('atlas_blank_started');
    openAtlasBlank();
  }
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', launchAtlasBlankOnStartup, {once:true});
else queueMicrotask(launchAtlasBlankOnStartup);
