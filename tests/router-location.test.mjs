import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { rewriteLocations } from '../server/proxy-compat.mjs';

test('routers receiving window through a parameter see the upstream homepage', () => {
  const window = { location: { pathname: '/view', search: '?token=encrypted', hash: '' } };
  const logical = { pathname: '/', search: '', hash: '' };
  const context = { window, __atlasLocationFor: object => (object === window ? logical : object.location) };
  const source =
    'function route(r){let {pathname,search,hash}=r.location;return pathname+search+hash;} result=route(window);';
  vm.runInNewContext(rewriteLocations(source), context);
  assert.equal(context.result, '/');
  logical.pathname = '/players';
  vm.runInNewContext('result=route(window)', context);
  assert.equal(context.result, '/players');
});

test('location fields on application data retain their meaning', () => {
  const context = { data: { location: { pathname: '/data' } }, __atlasLocationFor: object => object.location };
  vm.runInNewContext(
    rewriteLocations(
      'result=data.location.pathname; data.location={pathname:"/changed"}; data["location"].pathname="/edited";'
    ),
    context
  );
  assert.equal(context.result, '/data');
  assert.equal(context.data.location.pathname, '/edited');
});

test('aliases in workers work without the document location helper', () => {
  const context = { self: { location: { href: 'https://atlas.example/worker.js' } } };
  vm.runInNewContext(rewriteLocations('function read(r){return r.location.href;} result=read(self);'), context);
  assert.equal(context.result, context.self.location.href);
});
