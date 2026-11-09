'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {parseSubscriptionToken, loginWithPassword, publicConfig} = require('../service/auth');
const {jwt} = require('./auth-fixtures');
const token = jwt();

test('imports raw, quoted, Bearer, nested JSON, and URL-encoded subscription tokens', () => {
  const session = {data:{subscriptionToken:token}};
  for (const input of [token, 'Bearer '+token, JSON.stringify(token),
    JSON.stringify({subscriptionToken:token}), JSON.stringify(session),
    encodeURIComponent(JSON.stringify(session)), JSON.stringify({resultObj:{subscriptionToken:token}})]) {
    assert.equal(parseSubscriptionToken(input), token);
  }
});
test('extracts the inner subscriptionToken from an OAuth access token/response', () => {
  const access = jwt({subscriptionToken:token});
  assert.equal(parseSubscriptionToken(access), token);
  assert.equal(parseSubscriptionToken(JSON.stringify({access_token:access})), token);
});
test('rejects challenge tokens before any account request without echoing their contents', () => {
  for (const value of ['3:synthetic-challenge', JSON.stringify({token:'3:synthetic-challenge', renewInSec:825, cookieDomain:'.formula1.com'})]) {
    assert.throws(() => parseSubscriptionToken(value), error =>
      /anti-bot\/challenge/.test(error.message) && !error.message.includes('synthetic-challenge'));
  }
});
test('detects truncated, oversized, wrong-type and malformed pasted input', () => {
  for (const value of [token.slice(0, token.lastIndexOf('.')), '{"subscriptionToken":',
    'x'.repeat(65537), null, JSON.stringify({entitlementToken:token}), 'abc.def.ghi']) {
    assert.throws(() => parseSubscriptionToken(value));
  }
});
test('JWT parsing does not claim authenticity or reject based on an unverified clock claim', () => {
  const expired = jwt({exp:1});
  assert.equal(parseSubscriptionToken(expired), expired);
});
test('discovers only the public OAuth configuration, with no eval', () => {
  assert.deepEqual(publicConfig('config={davinci:{clientId:"public-client",acrValues:"login-policy"}}'),
    {clientId:'public-client', policyId:'login-policy'});
  assert.throws(() => publicConfig('<html>browser verification</html>'), /configuration changed|verification/);
});

function flowTransport(options = {}) {
  const calls = [];
  let state, challenge;
  return {calls, transport:async (url, request = {}) => {
    const target = new URL(url);
    calls.push({target, request});
    const reply = (body, headers = {}) => ({status:200, text:typeof body === 'string' ? body : JSON.stringify(body), headers});
    if (calls.length === 1) return reply('davinci:{clientId:"public-client",acrValues:"login-policy"}', {'set-cookie':['account=private; Path=/']});
    if (target.pathname === '/as/authorize') {
      assert.equal(request.headers.Cookie, undefined, 'account cookies must not leak to IdP');
      assert.equal(target.searchParams.get('response_mode'), 'pi.flow');
      assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
      state = target.searchParams.get('state'); challenge = target.searchParams.get('code_challenge');
      return reply({_links:{next:{href:options.next || 'https://id.formula1.com/flow/submit'}},
        id:'flow-id', interactionId:'interaction-id', eventName:'signin'}, {'set-cookie':['flow=session; Path=/']});
    }
    if (target.pathname === '/flow/submit') {
      assert.equal(request.headers.Cookie, 'flow=session');
      const body = JSON.parse(request.body);
      assert.deepEqual(body.parameters.data.formData, {username:'user@example.test', password:'test-password'});
      return reply({status:options.incomplete ? 'PENDING' : 'COMPLETED',
        authorizeResponse:{state:options.wrongState ? 'wrong-state' : state, code:'one-time-code'}});
    }
    assert.equal(target.pathname, '/as/token');
    const body = new URLSearchParams(request.body);
    assert.equal(body.get('code'), 'one-time-code');
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url'), challenge);
    assert.ok(!request.body.includes('test-password'));
    return reply({access_token:jwt({subscriptionToken:token})});
  }};
}
test('password login preserves IdP cookies, verifies OAuth state and exchanges the PKCE verifier', async () => {
  const flow = flowTransport();
  assert.equal(await loginWithPassword('user@example.test', 'test-password', flow.transport), token);
  assert.equal(flow.calls.length, 4);
});
test('refuses credential submission to another origin or a nonstandard port', async () => {
  for (const next of ['https://attacker.example/submit', 'https://id.formula1.com.attacker.example/submit',
    'https://id.formula1.com:444/submit', 'http://id.formula1.com/submit']) {
    const flow = flowTransport({next});
    await assert.rejects(loginWithPassword('user@example.test', 'test-password', flow.transport), /Untrusted credential/);
    assert.equal(flow.calls.length, 2);
  }
});
test('incomplete interactive flow or mismatched OAuth state cannot become an authenticated session', async () => {
  for (const options of [{wrongState:true}, {incomplete:true}]) {
    const flow = flowTransport(options);
    await assert.rejects(loginWithPassword('user@example.test', 'test-password', flow.transport));
    assert.equal(flow.calls.length, 3);
  }
});
test('blocked/rate-limited/redirected discovery never submits a password or retries it', async () => {
  for (const status of [302, 403, 429]) {
    let calls = 0;
    await assert.rejects(loginWithPassword('user@example.test', 'test-password', async () => {
      calls++; return {status, text:'challenge', headers:{}};
    }), /HTTP/);
    assert.equal(calls, 1);
  }
});
