(() => {
  if (window.__atlasTooltipsDisabled) return;
  window.__atlasTooltipsDisabled = true;
  const preserved = new WeakMap();
  function removeTitle(element) {
    if (!element.hasAttribute('title')) return;
    const text = element.getAttribute('title');
    if (text) {
      const previous = preserved.get(element);
      if (previous && element.getAttribute(previous.attribute) === previous.text) {
        element.setAttribute(previous.attribute, text);
        preserved.set(element, { attribute: previous.attribute, text });
      } else {
        const attribute =
          !element.textContent.trim() &&
          !element.hasAttribute('aria-label') &&
          !element.hasAttribute('aria-labelledby') &&
          !element.getAttribute('alt') &&
          !element.labels?.length
            ? 'aria-label'
            : 'aria-description';
        if (!element.hasAttribute(attribute)) {
          element.setAttribute(attribute, text);
          preserved.set(element, { attribute, text });
        }
      }
    }
    element.removeAttribute('title');
  }
  function scan(root) {
    if (root.nodeType === 1) removeTitle(root);
    root.querySelectorAll?.('[title]').forEach(removeTitle);
  }
  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') removeTitle(record.target);
      else for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title'],
  });
})();
