'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {authorize, redirect} = require('../service/relay-policy');
const hosts = new Set(['media.example.com']);
test('media is restricted to the exact approved HTTPS host and standard port', () => {
  assert.equal(authorize('https://media.example.com/a.mpd', hosts).hostname, 'media.example.com');
  for (const url of ['http://media.example.com/a', 'https://media.example.com:444/a',
    'https://user:password@media.example.com/a', 'https://evil.example.com/a', 'invalid']) {
    assert.throws(() => authorize(url, hosts));
  }
});
test('license credentials cannot follow cross-origin redirects, including known media hosts', () => {
  const origin = 'https://f1tv.formula1.com';
  assert.equal(redirect('/license2', origin+'/license', hosts, origin).origin, origin);
  for (const destination of ['https://media.example.com/license', 'http://f1tv.formula1.com/license',
    'https://f1tv.formula1.com:444/license', 'https://api.formula1.com/license']) {
    assert.throws(() => redirect(destination, origin+'/license', hosts, origin));
  }
});
test('CDN redirect cannot expand media access to unrelated shared-CDN tenants', () => {
  assert.throws(() => redirect('https://attacker.cloudfront.net/a', 'https://media.example.com/a', hosts));
  assert.equal(redirect('../b', 'https://media.example.com/path/a', hosts).href, 'https://media.example.com/b');
});
