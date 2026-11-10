import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentConfig } from '../server/deployment-config.mjs';

test('production uses only the Atlas default even with a stale relay environment override', () => {
  const config = deploymentConfig({
    NODE_ENV: 'production',
    PORT: '8080',
    PUBLIC_ORIGIN: 'https://atlas.example.com',
    ATLAS_ADDITIONAL_PUBLIC_ORIGINS: 'https://alias.example.com',
    ATLAS_DEFAULT_WISP_URL: 'wss://retired-relay.example/',
  });
  assert.equal(config.defaultWisp, 'wss://atlas.example.com/wisp/');
  assert.equal(config.normalizeRelay(config.defaultWisp), config.localWisp);
});

test('local development uses the local Wisp server', () => {
  assert.equal(deploymentConfig({ PORT: '8099' }).defaultWisp, 'ws://127.0.0.1:8099/wisp/');
});
