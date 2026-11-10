(() => {
  const glyphs = {
    A: '\u0410',
    C: '\u0421',
    E: '\u0415',
    P: '\u0420',
    S: '\u0405',
    W: '\u051c',
    a: '\u0430',
    c: '\u0441',
    e: '\u0435',
    i: '\u0456',
    o: '\u043e',
    p: '\u0440',
    s: '\u0455',
    x: '\u0445',
    y: '\u0443',
  };
  const originals = Object.fromEntries(Object.entries(glyphs).map(([letter, glyph]) => [glyph, letter]));
  const terms =
    /\b(?:proxy|proxies|wisp|scramjet|ultraviolet|unblock(?:ed|er|ers|ing)?|bypass(?:ed|ing)?|blocked|cloak(?:ing)?|about:blank)\b/gi;
  const display = text =>
    String(text).replace(terms, word => [...word].map(letter => glyphs[letter] || letter).join(''));
  const plain = text => [...String(text)].map(letter => originals[letter] || letter).join('');
  globalThis.AtlasLabelText = { display, plain };
  const excluded =
    'script, style, textarea, input, code, pre, kbd, samp, title, [contenteditable], [data-atlas-plain-text]';
  function update(node) {
    if (node.nodeType !== Node.TEXT_NODE || !node.parentElement || node.parentElement.closest(excluded)) return;
    const option = node.parentElement.closest('option');
    if (option && !option.hasAttribute('value')) return;
    // Addresses remain usable when copied, including custom relay examples.
    if (/(?:https?|wss?):\/\//i.test(node.data)) return;
    const next = display(node.data);
    if (next !== node.data) node.data = next;
  }
  function walk(root) {
    if (root.nodeType === Node.TEXT_NODE) return update(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) update(walker.currentNode);
  }
  function start() {
    walk(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') update(record.target);
        else record.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
