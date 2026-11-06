import test from 'node:test';
import assert from 'node:assert/strict';
import { installDocumentAddress } from '../server/proxy-document.mjs';

test('upstream scripts see the logical document URL instead of the encrypted proxy address', () => {
  const document = {
    URL: 'https://atlas.example/view?token=encrypted',
    documentURI: 'https://atlas.example/view?token=encrypted',
    baseURI: 'https://atlas.example/',
  };
  installDocumentAddress(document, () => 'https://game.example/play?level=1#start');
  assert.equal(document.URL, 'https://game.example/play?level=1#start');
  assert.equal(document.documentURI, document.URL);
  assert.equal(document.baseURI, document.URL);
});

test('document addresses track virtual history navigation', () => {
  let url = 'https://game.example/play';
  const document = {};
  installDocumentAddress(document, () => url);
  url = 'https://game.example/levels/2?mode=classic';
  assert.equal(document.URL, url);
  assert.equal(document.documentURI, url);
  assert.equal(document.baseURI, url);
});

test('explicit base href resolves independently from the document URL', () => {
  let url = 'https://game.example/levels/1';
  const document = {};
  installDocumentAddress(document, () => url, '../assets/?a=1&b=2');
  assert.equal(document.URL, url);
  assert.equal(document.baseURI, 'https://game.example/assets/?a=1&b=2');
  url = 'https://game.example/other/levels/2';
  assert.equal(document.baseURI, 'https://game.example/other/assets/?a=1&b=2');
});

test('read-only browser properties do not prevent the remaining address overrides', () => {
  const document = {};
  Object.defineProperty(document, 'URL', { value: 'native', configurable: false });
  installDocumentAddress(document, () => 'https://game.example/');
  assert.equal(document.URL, 'native');
  assert.equal(document.documentURI, 'https://game.example/');
});
