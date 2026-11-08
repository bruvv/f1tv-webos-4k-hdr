'use strict';
// Capability probes are declarations, not proof of playback or HDR output.
async function playbackCapabilities(env) {
  const report = {userAgent:env.navigator.userAgent, mse:!!env.MediaSource,
    eme:!!env.navigator.requestMediaKeySystemAccess, codecs:{}, widevine:{},
    warning:'Support declarations are not proof of playback; secure hardware decode and HDR output require a real stream.'};
  for (const codec of ['avc1.640033', 'hvc1.2.4.L153.B0', 'hev1.2.4.L153.B0']) {
    const mime = 'video/mp4; codecs="'+codec+'"';
    report.codecs[codec] = env.MediaSource ? env.MediaSource.isTypeSupported(mime) : false;
  }
  if (report.eme) {
    for (const robustness of ['', 'SW_SECURE_DECODE', 'HW_SECURE_ALL']) {
      try {
        const access = await env.navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
          initDataTypes:['cenc'], distinctiveIdentifier:'optional', persistentState:'optional',
          sessionTypes:['temporary'],
          videoCapabilities:[{contentType:'video/mp4; codecs="hvc1.2.4.L153.B0"', robustness}],
        }]);
        report.widevine[robustness||'default'] = access.getConfiguration();
      } catch (error) {
        report.widevine[robustness||'default'] = {supported:false, error:error.name};
      }
    }
  }
  return report;
}
if (typeof module !== 'undefined') module.exports = playbackCapabilities;
