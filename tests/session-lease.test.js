'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SessionLease = require('../service/session-lease');
test('foreground lease renews and releases on app disappearance', async () => {
  const activity = {activityId:123};
  let created = 0, completed = 0, expired, cleared = 0;
  const lease = new SessionLease({
    create(name, callback) { assert.equal(name, 'f1tv-foreground-session'); created++; callback(activity); },
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
test('concurrent heartbeats share one pending activity and suspend cancels late acquisition', async () => {
  const callbacks=[], completed=[];
  const lease = new SessionLease({
    create(name, callback) { callbacks.push(callback); },
    complete(activity, options, callback) { completed.push(activity); callback(); }
  }, {setTimeout:() => 1, clearTimeout(){}});
  const first=lease.acquire(), second=lease.acquire();
  assert.equal(first, second);
  assert.equal(callbacks.length, 1);
  lease.release();
  const next=lease.acquire();
  callbacks[0]({activityId:1});
  await first;
  assert.deepEqual(completed, [{activityId:1}]);
  assert.equal(lease.activity, null);
  callbacks[1]({activityId:2});
  await next;
  assert.equal(lease.activity.activityId, 2);
  lease.release();
  assert.deepEqual(completed, [{activityId:1},{activityId:2}]);
});
