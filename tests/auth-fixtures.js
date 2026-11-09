'use strict';
// Synthetic, unsigned test data; never sent to F1 or accepted without its entitlement API.
function jwt(claims = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({alg:'RS256', kid:'unit-test'}) + '.' +
    encode({exp:Math.floor(Date.now()/1000)+3600, ...claims}) + '.' +
    Buffer.from('unit-test-signature').toString('base64url');
}
module.exports = {jwt};
