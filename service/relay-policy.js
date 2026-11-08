'use strict';
// A license redirect must never carry account credentials to another origin.
function authorize(url, allowedHosts, credentialOrigin) {
  let target;
  try { target = new URL(url); }
  catch (error) { throw new Error('Invalid upstream URL: ' + error.message); }
  if (target.protocol !== 'https:' || target.username || target.password ||
      (target.port && target.port !== '443')) throw new Error('HTTPS origin required');
  if (credentialOrigin) {
    if (target.origin !== credentialOrigin) throw new Error('License origin changed');
  } else if (!allowedHosts.has(target.hostname)) {
    throw new Error('Media origin not authorized');
  }
  return target;
}
function redirect(url, base, allowedHosts, credentialOrigin) {
  let target;
  try { target = new URL(url, base); }
  catch (error) { throw new Error('Invalid redirect URL: ' + error.message); }
  if (!credentialOrigin && !allowedHosts.has(target.hostname)) {
    throw new Error('Unexpected media redirect origin');
  }
  return authorize(target.href, allowedHosts, credentialOrigin);
}
module.exports = {authorize, redirect};
