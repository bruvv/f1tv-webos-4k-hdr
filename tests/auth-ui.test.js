'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function ui(reply) {
  const nodes = {}, calls = [], listeners = {}, intervals = [];
  const document = {hidden:false, activeElement:null, getElementById:node,
    createElement:tag => element('', tag.toUpperCase()),
    querySelectorAll:selector => selector === '.page' ? ['live','replay','settings','player'].map(node) : [],
    addEventListener:(name, callback) => { listeners[name] = callback; }};
  function element(id, tagName) {
    const classes = new Set();
    let text = '';
    return {id, tagName, value:'', disabled:false, selectionStart:0, selectionEnd:0, children:[], dataset:{},
      get textContent() { return text+this.children.map(child => child.textContent).join(''); },
      set textContent(value) { text=value; this.children=[]; },
      classList:{toggle(name, value) { if(value) classes.add(name); else classes.delete(name); },
        add:name => classes.add(name), remove:name => classes.delete(name), contains:name => classes.has(name)},
      append(...children) { this.children.push(...children); },
      replaceChildren() { this.children=[]; text=''; },
      focus() { document.activeElement=this; }, blur() { document.activeElement=null; },
      pause(){}, load(){}, removeAttribute(){},
      setRangeText(value, start, end) {
        this.value = this.value.slice(0,start)+value+this.value.slice(end);
        this.selectionStart = this.selectionEnd = start+value.length;
      }};
  }
  function node(id) {
    return nodes[id] ||= element(id, ['email','password'].includes(id) ? 'INPUT' : id === 'token' ? 'TEXTAREA' : 'BUTTON');
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/app'), 'utf8'), {
    document, setInterval(callback, delay) { intervals.push({callback,delay}); return intervals.length; },
    clearInterval(){}, window:{webOS:{service:{request(url, options) {
      calls.push(options);
      const result = reply ? reply(options) : options.method === 'status' ? {authenticated:false} : new Error('Synthetic auth failure');
      if(result instanceof Error) options.onFailure({errorText:result.message});
      else options.onSuccess({result});
    }}}}, console
  });
  return {node, calls, document, listeners, intervals,
    tick:() => Promise.all(intervals.map(interval => interval.callback()))};
}
async function settle() { for(let i=0;i<8;i++) await Promise.resolve(); }
function signedInReply(options) {
  if(options.method === 'status' || options.method === 'heartbeat') return {authenticated:true};
  if(options.method === 'catalog') return [];
  return {};
}
test('long TV paste shows its exact length and chunks reach the service unchanged', async () => {
  const {node, calls} = ui();
  await settle();
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
  await settle();
  node('email').value = 'user@example.test'; node('password').value = 'test-password';
  await node('signIn').onclick();
  assert.equal(node('password').value, '');
  assert.equal(node('signIn').disabled, false);
});
test('keyboard Enter blurs email to password, then password to Sign in without submitting', async () => {
  const h = ui();
  await settle();
  for(const [from,to] of [['email','password'],['password','signIn']]) {
    h.node(from).focus();
    let prevented=false, stopped=false;
    h.listeners.keydown({key:'Enter', target:h.node(from), preventDefault(){prevented=true;}, stopPropagation(){stopped=true;}});
    assert.equal(h.document.activeElement, h.node(to));
    assert.equal(prevented, true); assert.equal(stopped, true);
  }
  assert.equal(h.calls.some(call => call.method === 'login'), false);
});
test('IME composition and held Enter do not advance focus', async () => {
  const h = ui(); await settle(); h.node('email').focus();
  for(const flags of [{isComposing:true}, {repeat:true}]) {
    h.listeners.keydown({key:'Enter',target:h.node('email'),preventDefault(){},stopPropagation(){},...flags});
    assert.equal(h.document.activeElement, h.node('email'));
  }
});
test('empty live screen explains no live session and latest race action requests the selected replay', async () => {
  const h = ui(options => {
    if(options.method === 'catalog' && options.parameters.kind === 'latest-race') return [{contentId:321,title:'Latest Grand Prix'}];
    if(options.method === 'play') return new Error('Playback not exercised');
    return signedInReply(options);
  });
  await settle();
  const empty = h.node('liveList').children[0];
  assert.match(empty.textContent, /No live session is on right now/);
  assert.doesNotMatch(empty.textContent, /Try again later/);
  const latest = empty.children[0].children[0];
  assert.equal(latest.textContent, 'Rewatch the latest race');
  await latest.onclick();
  assert.equal(h.calls.find(call => call.method === 'play').parameters.contentId, 321);
});
test('missing latest race leaves browsing available; catalog failures are not reported as no live session', async () => {
  const h = ui(signedInReply); await settle();
  const [latest,browse] = h.node('liveList').children[0].children[0].children;
  await latest.onclick();
  assert.match(h.node('notice').textContent, /No full F1 race was identified/);
  assert.equal(latest.disabled, false);
  browse.onclick(); await settle();
  assert.ok(h.calls.some(call => call.method === 'catalog' && call.parameters.kind === 'replay'));
  const failed = ui(options => options.method === 'catalog' ? new Error('HTTP 503') : signedInReply(options));
  await settle();
  assert.match(failed.node('notice').textContent, /503/);
  assert.equal(failed.node('liveList').children.length, 0);
});
test('signed-in catalog pages renew the foreground session every 15 seconds without playing', async () => {
  const h = ui(signedInReply); await settle();
  assert.equal(h.intervals[0].delay, 15000);
  assert.equal(h.calls.filter(call => call.method === 'heartbeat').length, 1, 'renew immediately on boot');
  for(let i=0;i<8;i++) await h.tick();
  assert.equal(h.calls.filter(call => call.method === 'heartbeat').length, 9);
  assert.equal(h.calls.some(call => call.method === 'play'), false);
  h.document.hidden=true; h.listeners.visibilitychange(); await settle();
  assert.ok(h.calls.some(call => call.method === 'suspend'));
  await h.tick();
  assert.equal(h.calls.filter(call => call.method === 'heartbeat').length, 9);
  h.document.hidden=false; h.listeners.visibilitychange(); await settle();
  assert.equal(h.calls.filter(call => call.method === 'heartbeat').length, 10);
});
test('unexpected service restart is surfaced, not silently shown as an authenticated catalog', async () => {
  const h = ui(options => options.method === 'heartbeat' ? {authenticated:false} : signedInReply(options));
  await settle(); await h.tick();
  assert.match(h.node('notice').textContent, /service restarted/);
  assert.equal(h.node('settings').classList.contains('hidden'), false);
});
