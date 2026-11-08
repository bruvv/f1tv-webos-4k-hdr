'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');

function harness(responses) {
  const handlers = {}, calls = [];
  class Service { register(name, fn) { handlers[name] = fn; } }
  const https = {request(url, options, callback) {
    calls.push({url:String(url), options});
    const req = new EventEmitter();
    req.write = () => {};
    req.destroy = error => req.emit('error', error);
    req.end = () => queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = 200; response.headers = {};
      callback(response);
      response.emit('data', Buffer.from(JSON.stringify(responses.shift())));
      response.emit('end');
    });
    return req;
  }};
  const server = new EventEmitter(); server.listen = () => {};
  const localRequire = name => name === 'webos-service' ? Service : name === 'https' ? https :
    name === 'http' ? {createServer:() => server} : name.startsWith('./') ? require('../service/'+name.slice(2)) : require(name);
  vm.runInNewContext(fs.readFileSync(require.resolve('../service/service'), 'utf8'), {
    require:localRequire, URL, URLSearchParams, Buffer, console:{log(){}, error(){}},
  });
  return {calls, call:(name, payload={}) => new Promise(resolve => handlers[name]({payload, respond:resolve}))};
}
const token = 'x'.repeat(60);
test('failed region lookup clears partial authentication', async () => {
  const h = harness([{resultObj:{entitlementToken:'entitlement'}}, {resultObj:{}}]);
  const result = await h.call('token', {token});
  assert.equal(result.returnValue, false);
  assert.equal((await h.call('status')).result.authenticated, false);
});
test('valid entitlement and location permit catalog calls with both authorization headers', async () => {
  const h = harness([{resultObj:{entitlementToken:'entitlement'}},
    {resultObj:{userLocation:[{entitlement:'premium', groupId:7}]}},
    {resultObj:{items:[{metadata:{contentId:123, title:'Race'}}]}}]);
  assert.equal((await h.call('token', {token})).returnValue, true);
  const result = await h.call('catalog', {kind:'live'});
  assert.equal(result.result[0].contentId, 123);
  assert.match(h.calls[2].url, /EVENTS\/LIVENOW\/premium\/7$/);
  assert.equal(h.calls[2].options.headers.ascendontoken, token);
  assert.equal(h.calls[2].options.headers.entitlementtoken, 'entitlement');
  await h.call('logout');
  assert.equal((await h.call('status')).result.authenticated, false);
});
test('invalid token never reaches the network', async () => {
  const h = harness([]);
  assert.equal((await h.call('token', {token:'short'})).returnValue, false);
  assert.equal(h.calls.length, 0);
});
