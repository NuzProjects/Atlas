(() => {
  function classify(value) {
    const text = String(value)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
      .replace(/\s+/g, ' ');
    const direct =
      /\b(?:(?:watch|free|stream|download|hd|hardcore)\s+(?:hd\s+)?porn(?:ography)?|porn(?:ographic)?\s+(?:videos?|movies?|clips?|tube|cams?)|live\s+sex\s+(?:cams?|shows?|chat)|(?:nude|naked)\s+(?:cams?|webcams?)|xxx\s+(?:videos?|movies?|porn)|hentai\s+(?:porn|videos?))\b/;
    if (direct.test(text)) return true;
    const groups = [
      /\b(?:porn|pornography|pornographic)\b/,
      /\bxxx\b/,
      /\bhentai\b/,
      /\b(?:nude|nudes|nudity|naked)\b/,
      /\b(?:hardcore|nsfw)\b/,
      /\b(?:blowjobs?|handjobs?|cumshots?|gangbangs?)\b/,
      /\b(?:milf|milfs|orgasm|orgasms)\b/,
      /\b(?:sex\s+cams?|sex\s+chat|adult\s+entertainment)\b/,
    ];
    const signals = groups.reduce((count, pattern) => count + Number(pattern.test(text)), 0);
    return (
      signals >= 3 &&
      /\b(?:porn|pornographic|xxx|hentai|blowjobs?|cumshots?|gangbangs?)\b/.test(text) &&
      /\b(?:watch|videos?|movies?|gallery|galleries|subscribe|webcams?|stream|clips?)\b/.test(text)
    );
  }

  function observeDocument(root, onBlocked) {
    const documents = new Map();
    let timer,
      stopped = false;
    function dispose() {
      stopped = true;
      clearTimeout(timer);
      for (const [document, observer] of documents) {
        observer.disconnect();
        document.removeEventListener('load', schedule, true);
        document.removeEventListener('scroll', schedule, true);
        document.removeEventListener('DOMContentLoaded', schedule);
      }
      documents.clear();
    }
    function schedule() {
      if (!stopped && !timer)
        timer = setTimeout(() => {
          timer = undefined;
          scan();
        }, 200);
    }
    function scan() {
      if (stopped) return;
      const pending = [root],
        current = new Set();
      while (pending.length && current.size < 24) {
        const document = pending.shift();
        if (!document?.documentElement || current.has(document)) continue;
        current.add(document);
        if (!documents.has(document)) {
          const observer = new MutationObserver(schedule);
          observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'src'],
          });
          document.addEventListener('load', schedule, true);
          document.addEventListener('scroll', schedule, true);
          document.addEventListener('DOMContentLoaded', schedule);
          documents.set(document, observer);
        }
        if (classify((document.body?.innerText || '').slice(0, 200000))) {
          dispose();
          onBlocked();
          return;
        }
        for (const frame of document.querySelectorAll('iframe')) {
          try {
            if (
              frame.getClientRects().length &&
              getComputedStyle(frame).visibility !== 'hidden' &&
              frame.contentDocument
            )
              pending.push(frame.contentDocument);
          } catch {}
        }
      }
      for (const [document, observer] of documents)
        if (!current.has(document)) {
          observer.disconnect();
          document.removeEventListener('load', schedule, true);
          document.removeEventListener('scroll', schedule, true);
          document.removeEventListener('DOMContentLoaded', schedule);
          documents.delete(document);
        }
    }
    scan();
    return dispose;
  }

  const frames = new WeakMap();
  function dispose(frame) {
    frames.get(frame)?.();
    frames.delete(frame);
  }
  function watch(frame, onBlocked) {
    dispose(frame);
    let cleanup = () => {},
      stopped = false;
    const refresh = () => {
      cleanup();
      if (stopped || !frame.getClientRects().length || getComputedStyle(frame).visibility === 'hidden') return;
      try {
        const document = frame.contentDocument;
        if (document && !document.querySelector('meta[name="atlas-content-blocked"]'))
          cleanup = observeDocument(document, onBlocked);
      } catch {}
    };
    const observer = new MutationObserver(refresh);
    observer.observe(frame, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    frames.set(frame, () => {
      stopped = true;
      observer.disconnect();
      cleanup();
    });
    refresh();
  }
  window.AtlasContentFilter = { classify, observeDocument, watch, dispose };
})();
