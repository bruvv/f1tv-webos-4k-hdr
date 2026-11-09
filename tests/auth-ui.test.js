'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function ui() {
  const nodes = {}, calls = [];
  function node(id) {
    return nodes[id] ||= {value:'', textContent:'', disabled:false, selectionStart:0, selectionEnd:0,
      classList:{toggle(){}}, setRangeText(text, start, end) {
        this.value = this.value.slice(0,start)+text+this.value.slice(end);
        this.selectionStart = this.selectionEnd = start+text.length;
      }};
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/app'), 'utf8'), {
    document:{getElementById:node, querySelectorAll:() => [], addEventListener(){}},
    window:{webOS:{service:{request(url, options) {
      calls.push(options);
      if (options.method === 'status') options.onSuccess({result:{authenticated:false}});
      else options.onFailure({errorText:'Synthetic auth failure'});
    }}}}, console
  });
  return {node, calls};
}
test('long TV paste shows its exact length and chunks reach the service unchanged', async () => {
  const {node, calls} = ui();
  await Promise.resolve();
  const first = 'a'.repeat(6000), last = 'b'.repeat(7000);
  node('token').onpaste({preventDefault(){}, clipboardData:{getData:() => first}});
  assert.match(node('tokenReceipt').textContent, /6000/);
  node('appendToken').onclick();
  assert.equal(node('token').value, '');
  node('token').value = last; node('token').oninput();
  assert.match(node('tokenReceipt').textContent, /13000/);
  await node('useToken').onclick();
  assert.equal(calls.find(call => call.method === 'token').parameters.token, first+last);
  assert.equal(node('useToken').disabled, false);
  node('clearToken').onclick();
  assert.match(node('tokenReceipt').textContent, /Received 0 characters/);
});
test('over-limit paste is rejected intact instead of silently shortened', () => {
  const {node} = ui();
  node('token').value = 'existing';
  node('token').onpaste({preventDefault(){}, clipboardData:{getData:() => 'x'.repeat(65536)}});
  assert.equal(node('token').value, 'existing');
  assert.match(node('notice').textContent, /nothing was added/);
});
test('failed login clears password and re-enables controls', async () => {
  const {node} = ui();
  await Promise.resolve();
  node('email').value = 'user@example.test'; node('password').value = 'test-password';
  await node('signIn').onclick();
  assert.equal(node('password').value, '');
  assert.equal(node('signIn').disabled, false);
});
