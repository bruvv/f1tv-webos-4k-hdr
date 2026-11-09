'use strict';
// F1's current OAuth/PKCE sequence follows FastF1's MIT-licensed account research.
const crypto = require('crypto');
const ACCOUNT = 'https://account.formula1.com';
const IDP = 'https://id.formula1.com';
const CONFIG_URL = ACCOUNT + '/scripts/main.min.js';
const MAX_INPUT = 65536;

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part) || part.length % 4 === 1)) {
    throw new Error('Incomplete or wrong token: expected a three-part JWT. Paste the full subscriptionToken or a supported login response; use Add chunk if the TV truncates pastes.');
  }
  try {
    const decode = part => JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const header = decode(parts[0]), claims = decode(parts[1]);
    if (!header || header.alg !== 'RS256' || !claims || typeof claims !== 'object' || Array.isArray(claims)) throw new Error('Unsupported JWT');
    return claims;
  } catch {
    throw new Error('The JWT is incomplete, malformed, or not an RS256 F1 token. Paste the entire value, including its signature.');
  }
}

function parseSubscriptionToken(input) {
  let value = input;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof value === 'string') {
      value = value.trim();
      if (value.length > MAX_INPUT) throw new Error('Sign-in input exceeds 65536 characters.');
      if (/^%7[bB]|^%22/.test(value)) {
        try { value = decodeURIComponent(value); }
        catch { throw new Error('Incomplete URL-encoded login-session cookie.'); }
      }
      if (value.startsWith('{') || value.startsWith('"')) {
        try { value = JSON.parse(value); }
        catch { throw new Error('Incomplete or invalid login JSON. Paste the full response, or add consecutive chunks first.'); }
        continue;
      }
      value = value.replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
      if (/^3:/.test(value)) throw new Error('This is a browser anti-bot/challenge token, not an F1 subscriptionToken. Its freshness does not make it an account credential. Copy subscriptionToken from the account sign-in response instead.');
      const claims = decodeJwt(value);
      if (typeof claims.subscriptionToken === 'string') { value = claims.subscriptionToken; continue; }
      if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) throw new Error('The JWT has no valid expiry claim. This may be the wrong token type.');
      // Parsing is not authentication. F1's entitlement endpoint validates signature and expiry.
      return value;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      value = value.subscriptionToken ?? value.data?.subscriptionToken ?? value.resultObj?.subscriptionToken ??
        value.access_token ?? value.accessToken ?? value.data?.access_token ?? value.token ?? value.data?.token;
      continue;
    }
    throw new Error('No subscriptionToken found. Use the F1 account login response or login-session cookie, not a challenge response or entitlement token.');
  }
  throw new Error('Unsupported nested sign-in response. Copy the subscriptionToken value instead.');
}

function publicConfig(script) {
  const object = /\bdavinci:\{([^}]*)\}/.exec(script);
  const client = object && /\bclientId:"([^"\r\n]+)"/.exec(object[1]);
  const policy = object && /\bacrValues:"([^"\r\n]+)"/.exec(object[1]);
  if (!client || !policy) throw new Error('F1 account configuration changed or browser verification is required. Use browser sign-in and import the account response.');
  return {clientId:client[1], policyId:policy[1]};
}
function base64url(buffer) { return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }

async function loginWithPassword(email, password, transport) {
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) throw new Error('Enter email and password.');
  // Keep each trusted origin's cookies isolated; credentials never follow redirects.
  const cookies = new Map();
  async function send(url, options = {}) {
    let target;
    try { target = new URL(url); }
    catch { throw new Error('Invalid account sign-in URL.'); }
    if (![ACCOUNT, IDP].includes(target.origin) || target.username || target.password) throw new Error('Untrusted account sign-in origin.');
    const jar = cookies.get(target.origin) || new Map();
    const headers = Object.assign({Accept:'application/json', Origin:ACCOUNT, Referer:ACCOUNT+'/'}, options.headers || {});
    if (jar.size) headers.Cookie = Array.from(jar, ([name, value]) => name+'='+value).join('; ');
    const response = await transport(target.href, Object.assign({}, options, {headers}));
    for (const cookie of response.headers['set-cookie'] || []) {
      const pair = /^([^=;\s]+)=([^;\r\n]*)/.exec(cookie);
      if (pair) {
        if (/;\s*max-age=0(?:;|$)/i.test(cookie)) jar.delete(pair[1]);
        else jar.set(pair[1], pair[2]);
      }
    }
    cookies.set(target.origin, jar);
    if (response.status < 200 || response.status >= 300) {
      if ([401, 400].includes(response.status)) throw new Error('F1 rejected sign-in. Check the account credentials; an interactive browser step may be required.');
      if ([403, 429].includes(response.status)) throw new Error('F1 blocked or rate-limited direct sign-in (HTTP '+response.status+'). Complete sign-in in a browser and import its account response.');
      throw new Error('F1 sign-in returned HTTP '+response.status+'. Redirects and interactive challenges are not followed.');
    }
    return response;
  }
  async function json(url, options) {
    const response = await send(url, options);
    try { return JSON.parse(response.text); }
    catch { throw new Error('F1 returned a browser verification page instead of account JSON. Complete sign-in in a browser.'); }
  }
  const config = publicConfig((await send(CONFIG_URL)).text);
  const verifier = base64url(crypto.randomBytes(48));
  const state = base64url(crypto.randomBytes(24));
  const query = new URLSearchParams({client_id:config.clientId, response_type:'code', response_mode:'pi.flow',
    scope:'openid', state, nonce:base64url(crypto.randomBytes(24)),
    code_challenge:base64url(crypto.createHash('sha256').update(verifier).digest()),
    code_challenge_method:'S256', acr_values:config.policyId});
  const flow = await json(IDP+'/as/authorize?'+query, {headers:{'X-Requested-With':'ping-sdk'}});
  const next = flow?._links?.next?.href;
  let nextUrl;
  try { nextUrl = new URL(next); }
  catch { throw new Error('F1 requires an interactive browser sign-in; no supported login form was returned.'); }
  if (nextUrl.origin !== IDP || nextUrl.username || nextUrl.password) throw new Error('Untrusted credential submission origin.');
  if (![flow.id, flow.eventName, flow.interactionId].every(value => typeof value === 'string' && value)) throw new Error('F1 login form is incomplete or changed.');
  const submitted = await json(nextUrl.href, {method:'POST', headers:{'Content-Type':'application/json',
    'X-Requested-With':'ping-sdk', interactionId:flow.interactionId}, body:JSON.stringify({
    id:flow.id, eventName:flow.eventName, interactionId:flow.interactionId,
    parameters:{eventType:'submit', data:{actionKey:'SIGNIN', formData:{username:email.trim(), password}}}
  })});
  if (submitted.status !== 'COMPLETED') throw new Error('F1 did not complete sign-in. Check credentials or complete any verification/MFA in a browser, then import the account response.');
  const authorization = submitted.authorizeResponse;
  if (authorization?.state !== state || typeof authorization.code !== 'string' || !authorization.code) throw new Error('F1 sign-in state/code validation failed. Try a fresh sign-in.');
  const response = await json(IDP+'/as/token', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'authorization_code', client_id:config.clientId,
      code:authorization.code, code_verifier:verifier}).toString()});
  if (typeof response.access_token !== 'string') throw new Error('F1 returned no OAuth access token.');
  const claims = decodeJwt(response.access_token);
  if (typeof claims.subscriptionToken !== 'string') throw new Error('F1 returned no subscriptionToken. Check your subscription or use browser sign-in.');
  return parseSubscriptionToken(claims.subscriptionToken);
}
module.exports = {parseSubscriptionToken, loginWithPassword, publicConfig};
