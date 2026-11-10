import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentConfig } from '../server/deployment-config.mjs';
test('ads are off by default and contain no hosted-service dependency', () => {
  assert.equal(deploymentConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://example.com' }).ads, null);
});
test('isolated ads are explicitly configured per deployment', () => {
  const env = {
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: 'https://example.com',
    ATLAS_AD_ORIGIN: 'https://ads.example.com',
    ATLAS_AD_UNITS: '[{"name":"rectangle","width":300,"height":250}]',
  };
  assert.equal(deploymentConfig(env).ads.origin, 'https://ads.example.com');
  assert.throws(() => deploymentConfig({ ...env, ATLAS_AD_ORIGIN: 'https://example.com' }));
  assert.throws(() => deploymentConfig({ ...env, ATLAS_AD_ORIGIN: 'http://ads.example.com' }));
  assert.throws(() => deploymentConfig({ ...env, ATLAS_AD_UNITS: '[]' }));
  assert.throws(() => deploymentConfig({ ...env, ATLAS_AD_UNITS: '[{"name":"bad","width":0,"height":250}]' }));
});
