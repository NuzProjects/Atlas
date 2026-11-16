const AtlasCookieRelay = (() => {
  const blank = () => !!window.__atlasBlankBoot;
  let seeded = false;

  function withCookies(mode, use) {
    return new Promise(resolve => {
      try {
        const request = indexedDB.open('$scramjet');
        request.onupgradeneeded = () => request.transaction.abort();
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const transaction = db.transaction('cookies', mode);
            const operation = use(transaction.objectStore('cookies'));
            transaction.oncomplete = () => resolve(operation?.result ?? null);
            transaction.onerror = transaction.onabort = () => resolve(null);
          } catch {
            resolve(null);
          } finally {
            db.close();
          }
        };
      } catch {
        resolve(null);
      }
    });
  }

  async function readJar() {
    const jar = await withCookies('readonly', store => store.get('cookies'));
    return jar && Object.keys(jar).length ? JSON.stringify(jar) : null;
  }

  function writeJar(data) {
    return withCookies('readwrite', store => store.put(JSON.parse(data), 'cookies'));
  }

  async function answer(event) {
    const message = event.data;
    if (message?.type === 'atlas-cookies' && typeof message.data === 'string') {
      if (blank()) await writeJar(message.data);
    } else if (message?.type === 'atlas-request-cookies') {
      const data = blank() ? await readJar() : null;
      event.source?.postMessage({ type: 'atlas-reload-cookies', data });
    }
  }

  function install() {
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.addEventListener('message', answer);
    navigator.serviceWorker.startMessages?.();
  }

  async function seed(registration) {
    if (!blank() || seeded) return;
    const worker = registration.active;
    const data = await readJar();
    if (!worker || !data) return;
    seeded = true;
    await new Promise(resolve => {
      const done = event => {
        if (event.data?.type !== 'atlas-cookies-loaded') return;
        navigator.serviceWorker.removeEventListener('message', done);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', done);
        resolve();
      }, 1500);
      navigator.serviceWorker.addEventListener('message', done);
      worker.postMessage({ type: 'atlas-reload-cookies', data });
    });
  }

  install();
  return { seed, readJar, writeJar };
})();
