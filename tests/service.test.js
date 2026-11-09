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
    req.write = body => { calls[calls.length-1].body = String(body); };
    req.destroy = error => req.emit('error', error);
    req.end = () => queueMicrotask(() => {
      const response = new EventEmitter();
      const entry = responses.shift();
      const next = typeof entry === 'function' ? entry(calls) : entry;
      response.statusCode = next?.httpStatus || 200; response.headers = next?.headers || {};
      callback(response);
      response.emit('data', Buffer.from(next?.rawText ?? JSON.stringify(next)));
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
const {jwt} = require('./auth-fixtures');
const token = jwt();
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
test('invalid or challenge tokens never reach the network', async () => {
  for (const input of ['short', JSON.stringify({token:'3:synthetic-challenge', renewInSec:825})]) {
    const h = harness([]);
    assert.equal((await h.call('token', {token:input})).returnValue, false);
    assert.equal(h.calls.length, 0);
  }
});
test('whole login JSON sends only the extracted subscription token to F1', async () => {
  const h = harness([{resultObj:{entitlementToken:'entitlement'}},
    {resultObj:{userLocation:[{entitlement:'premium', groupId:7}]}}]);
  const result = await h.call('token', {token:JSON.stringify({data:{subscriptionToken:token}})});
  assert.equal(result.returnValue, true);
  assert.equal(h.calls[0].options.headers.ascendontoken, token);
});
test('only the F1 entitlement response can accept a parsed JWT', async () => {
  const h = harness([{resultCode:'ERROR', message:'AscendonToken signature validation failed or token expired'}]);
  const result = await h.call('token', {token});
  assert.equal(result.returnValue, false);
  assert.match(result.errorText, /signature or expiry/);
  assert.equal((await h.call('status')).result.authenticated, false);
});
test('password service uses current OAuth flow before validating entitlement', async () => {
  const h = harness([
    {rawText:'davinci:{clientId:"public-client",acrValues:"policy"}'},
    {_links:{next:{href:'https://id.formula1.com/flow/submit'}}, id:'id', eventName:'signin', interactionId:'interaction'},
    calls => ({status:'COMPLETED', authorizeResponse:{code:'code', state:new URL(calls[1].url).searchParams.get('state')}}),
    {access_token:jwt({subscriptionToken:token})},
    {resultObj:{entitlementToken:'entitlement'}},
    {resultObj:{userLocation:[{entitlement:'premium', groupId:7}]}}
  ]);
  assert.equal((await h.call('login', {email:'user@example.test', password:'test-password'})).returnValue, true);
  assert.equal(h.calls.length, 6);
  assert.match(h.calls[0].url, /account\.formula1\.com\/scripts\/main.min.js$/);
  assert.equal(h.calls[4].options.headers.ascendontoken, token);
  assert.ok(h.calls.every(call => !call.url.includes('by-password')));
});
test('HTTP 403 challenge stops direct login without retrying the password', async () => {
  const h = harness([{httpStatus:403, rawText:'browser verification'}]);
  const result = await h.call('login', {email:'user@example.test', password:'test-password'});
  assert.equal(result.returnValue, false);
  assert.match(result.errorText, /browser/);
  assert.equal(h.calls.length, 1);
});
