'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PlaybackLease = require('../service/playback-lease');
test('lease survives requests, renews heartbeat, releases on stop or app disappearance', async () => {
  const activity = {activityId:123};
  let created = 0, completed = 0, expired, cleared = 0;
  const lease = new PlaybackLease({
    create(name, callback) { assert.equal(name, 'f1tv-playback-relay'); created++; callback(activity); },
    complete(spec, options, callback) { assert.equal(spec, activity); completed++; callback(); },
  }, {setTimeout(callback, delay) { assert.equal(delay, 60000); expired=callback; return 1; },
    clearTimeout() { cleared++; }});
  await lease.acquire();
  await lease.acquire();
  assert.equal(created, 1);
  assert.equal(completed, 0);
  assert.equal(cleared, 1);
  expired();
  assert.equal(completed, 1);
  lease.release();
  assert.equal(completed, 1);
  await lease.acquire();
  lease.release();
  assert.equal(created, 2);
  assert.equal(completed, 2);
});
