(() => {
  const policies = new WeakMap();
  function install(root, blockAds) {
    const sdk = root.WinterpixelAds;
    if (!sdk || typeof sdk.requestAd !== 'function' || !sdk.registered_events) return false;
    const existing = policies.get(sdk);
    if (existing) {
      existing.blockAds = blockAds;
      return true;
    }
    const policy = { blockAds, pending: false };
    const requestAd = sdk.requestAd;
    sdk.requestAd = function (...args) {
      const error = this.registered_events?.adError;
      if (!policy.blockAds() || typeof error !== 'function') return Reflect.apply(requestAd, this, args);
      if (policy.pending) return;
      policy.pending = true;
      queueMicrotask(() => {
        policy.pending = false;
        Reflect.apply(error, this.registered_events, []);
      });
    };
    policies.set(sdk, policy);
    return true;
  }
  function watch(frame, blockAds) {
    let document,
      active = true;
    const refresh = () => {
      if (!active) return;
      try {
        const next = frame.contentDocument;
        if (document !== next) {
          document?.removeEventListener('load', refresh, true);
          document = next;
          document?.addEventListener('load', refresh, true);
        }
        if (document?.defaultView) install(document.defaultView, blockAds);
      } catch {}
    };
    frame.addEventListener('load', refresh);
    refresh();
    return () => {
      active = false;
      frame.removeEventListener('load', refresh);
      document?.removeEventListener('load', refresh, true);
    };
  }
  window.AtlasGameAds = { install, watch };
})();
