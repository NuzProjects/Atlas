export function installDocumentAddress(document, getURL, baseHref) {
  for (const name of ['URL', 'documentURI', 'baseURI']) {
    try {
      Object.defineProperty(document, name, {
        configurable: true,
        get: name === 'baseURI' && baseHref != null ? () => new URL(baseHref, getURL()).href : getURL,
      });
    } catch {}
  }
}
