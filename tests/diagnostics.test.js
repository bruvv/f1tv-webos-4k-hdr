'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const capabilities = require('../app/diagnostics');
test('unsupported browser reports no capabilities without claiming playback', async () => {
  const report = await capabilities({navigator:{userAgent:'test'}});
  assert.equal(report.mse, false);
  assert.equal(report.eme, false);
  assert.equal(Object.values(report.codecs).some(Boolean), false);
  assert.match(report.warning, /not proof/);
});
test('Widevine rejection is recorded per robustness and does not imply hardware support', async () => {
  const report = await capabilities({navigator:{userAgent:'test',
    requestMediaKeySystemAccess:async (keySystem, configs) => {
      assert.equal(keySystem, 'com.widevine.alpha');
      if (configs[0].videoCapabilities[0].robustness) throw Object.assign(new Error(), {name:'NotSupportedError'});
      return {getConfiguration:() => configs[0]};
    }}, MediaSource:{isTypeSupported:mime => mime.includes('avc1')}});
  assert.equal(report.codecs['hvc1.2.4.L153.B0'], false);
  assert.equal(report.widevine.HW_SECURE_ALL.supported, false);
  assert.equal(report.widevine.HW_SECURE_ALL.error, 'NotSupportedError');
  assert.equal(report.widevine.default.sessionTypes[0], 'temporary');
});
