const AtlasBlankStorage = (() => {
  const SITE_DATABASE = /^(?:https?:\/\/[^@/]+@|atlas_[0-9a-z]{32}_)/i;
  const COOKIE_DATABASES = { $scramjet: ['cookies'], __op: ['cookies'] };
  const interval = 5000;
  const skipKey = key => String(key).startsWith('bare-mux-');

  function plan(name) {
    if (Object.hasOwn(COOKIE_DATABASES, name)) return COOKIE_DATABASES[name];
    return SITE_DATABASE.test(name) ? true : null;
  }
  const cookieDatabase = name => Object.hasOwn(COOKIE_DATABASES, name);
  const result = request =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  function openExisting(factory, name) {
    return new Promise(resolve => {
      try {
        const request = factory.open(name);
        request.onupgradeneeded = () => request.transaction.abort();
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function names(factory) {
    try {
      return ((await factory.databases?.()) || []).map(entry => entry.name).filter(name => name && plan(name));
    } catch {
      return [];
    }
  }

  async function snapshot(factory, name) {
    const db = await openExisting(factory, name);
    if (!db) return null;
    try {
      const storeNames = [...db.objectStoreNames];
      if (!storeNames.length) return { version: db.version, stores: [] };
      const wanted = plan(name);
      const transaction = db.transaction(storeNames, 'readonly');
      const stores = storeNames.map(storeName => {
        const store = transaction.objectStore(storeName);
        const entry = {
          name: storeName,
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          indexes: [...store.indexNames].map(indexName => {
            const index = store.index(indexName);
            return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
          }),
          records: null,
        };
        if (wanted === true || wanted.includes(storeName))
          entry.pending = Promise.all([result(store.getAllKeys()), result(store.getAll())]);
        return entry;
      });
      for (const entry of stores)
        if (entry.pending) {
          const [keys, values] = await entry.pending;
          entry.records = keys.map((key, index) => [key, values[index]]);
          delete entry.pending;
        }
      return { version: db.version, stores };
    } catch {
      return null;
    } finally {
      db.close();
    }
  }

  function create(factory, name, snap) {
    return new Promise(resolve => {
      try {
        const request = factory.open(name, snap.version || 1);
        request.onupgradeneeded = () => {
          for (const entry of snap.stores) {
            const store = request.result.createObjectStore(entry.name, {
              keyPath: entry.keyPath,
              autoIncrement: entry.autoIncrement,
            });
            for (const index of entry.indexes)
              store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function write(factory, name, snap) {
    const db = (await openExisting(factory, name)) || (await create(factory, name, snap));
    if (!db) return false;
    try {
      const stores = snap.stores.filter(entry => entry.records && db.objectStoreNames.contains(entry.name));
      if (!stores.length) return true;
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(
          stores.map(entry => entry.name),
          'readwrite'
        );
        for (const entry of stores) {
          const store = transaction.objectStore(entry.name);
          store.clear();
          for (const [key, value] of entry.records) {
            if (store.keyPath === null) store.put(value, key);
            else store.put(value);
          }
        }
        transaction.oncomplete = resolve;
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
      return true;
    } catch {
      return false;
    } finally {
      db.close();
    }
  }

  function remove(factory, name) {
    return new Promise(resolve => {
      try {
        const timer = setTimeout(resolve, 3000);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        const request = factory.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = done;
      } catch {
        resolve();
      }
    });
  }

  function describe(value) {
    try {
      return JSON.stringify(value, (key, item) => {
        const tag = Object.prototype.toString.call(item);
        if (tag === '[object Blob]' || tag === '[object File]') return tag + item.size;
        if (tag === '[object ArrayBuffer]' || ArrayBuffer.isView(item)) {
          const bytes = new Uint8Array(item.buffer || item, item.byteOffset || 0, item.byteLength);
          let hash = bytes.length;
          const end = bytes.length <= 65536 ? bytes.length : 1024;
          for (let i = 0; i < end; i++) hash = (Math.imul(hash, 31) + bytes[i]) | 0;
          if (bytes.length > 65536)
            for (let i = bytes.length - 1024; i < bytes.length; i++) hash = (Math.imul(hash, 31) + bytes[i]) | 0;
          return tag + bytes.length + ':' + hash;
        }
        return item;
      });
    } catch {
      return '?';
    }
  }
  function signature(snap) {
    let hash = 0x811c9dc5;
    const feed = text => {
      const value = String(text);
      for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    };
    feed(snap.version);
    for (const entry of snap.stores) {
      feed(entry.name);
      for (const [key, value] of entry.records || []) {
        feed(describe(key));
        feed(describe(value));
      }
    }
    return hash >>> 0;
  }

  function mirror(local, remote) {
    const lastKeys = new Map();
    const lastDatabases = new Map();
    let ticks = 0;
    let busy = null;

    function localKeys() {
      const keys = new Map();
      for (let index = 0; index < local.localStorage.length; index++) {
        const key = local.localStorage.key(index);
        if (!skipKey(key)) keys.set(key, local.localStorage.getItem(key));
      }
      return keys;
    }

    async function restore() {
      for (const name of await names(remote.indexedDB)) {
        const snap = await snapshot(remote.indexedDB, name);
        if (snap && (await write(local.indexedDB, name, snap))) lastDatabases.set(name, signature(snap));
      }
    }

    function syncKeys() {
      const current = localKeys();
      for (const [key, value] of current) {
        if (lastKeys.get(key) !== value && remote.localStorage.getItem(key) !== value)
          remote.localStorage.setItem(key, value);
      }
      for (const key of lastKeys.keys()) if (!current.has(key)) remote.localStorage.removeItem(key);
      lastKeys.clear();
      for (const [key, value] of current) lastKeys.set(key, value);
    }

    async function syncDatabases(everything) {
      const present = new Set(await names(local.indexedDB));
      for (const name of present) {
        if (!everything && !cookieDatabase(name)) continue;
        const snap = await snapshot(local.indexedDB, name);
        if (!snap) continue;
        const hash = signature(snap);
        if (lastDatabases.get(name) === hash) continue;
        if (await write(remote.indexedDB, name, snap)) lastDatabases.set(name, hash);
      }
      if (everything)
        for (const name of [...lastDatabases.keys()])
          if (!present.has(name) && !cookieDatabase(name)) {
            await remove(remote.indexedDB, name);
            lastDatabases.delete(name);
          }
    }

    function sync(everything = false) {
      if (busy) return busy;
      busy = (async () => {
        try {
          syncKeys();
          await syncDatabases(everything || ticks++ % 3 === 0);
        } catch {
        } finally {
          busy = null;
        }
      })();
      return busy;
    }

    async function start() {
      try {
        await Promise.race([restore(), new Promise(resolve => setTimeout(resolve, 5000))]);
      } catch {}
      for (const key of localKeys().keys()) {
        const stored = remote.localStorage.getItem(key);
        if (stored !== null) lastKeys.set(key, stored);
      }
      const flush = () => sync(true);
      setInterval(sync, interval);
      local.addEventListener?.('pagehide', flush);
      local.document?.addEventListener?.('visibilitychange', () => {
        if (local.document.visibilityState === 'hidden') flush();
      });
    }

    return { start, restore, sync };
  }

  function start(remote, local = window) {
    try {
      return mirror(local, remote).start();
    } catch {
      return Promise.resolve();
    }
  }

  return { start, mirror, plan, signature };
})();
