export function createResourceTokens(codec, { now = Date.now, limit = 16384, renewBefore = 86400 } = {}) {
  const tokens = new Map();
  let active;
  const descriptorForResources = () => {
    if (!active || active.expires - now() / 1000 < renewBefore) active = codec.issue();
    return active;
  };
  const seal = (value, descriptor = descriptorForResources()) => {
    const key = JSON.stringify([descriptor.id, descriptor.expires, value]);
    const cached = tokens.get(key);
    if (cached && cached.expires > now() / 1000) {
      tokens.delete(key);
      tokens.set(key, cached);
      return cached.token;
    }
    const token = codec.seal(value, descriptor);
    tokens.delete(key);
    if (tokens.size >= limit) tokens.delete(tokens.keys().next().value);
    tokens.set(key, { token, expires: Number(token.split('.')[1]) });
    return token;
  };
  seal.descriptor = descriptorForResources;
  return seal;
}
