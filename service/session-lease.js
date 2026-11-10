'use strict';
// Keep RAM authentication alive while the foreground app renews its activity.
class SessionLease {
  constructor(manager, timers = {setTimeout, clearTimeout}) {
    this.manager = manager;
    this.timers = timers;
    this.activity = null;
    this.timer = null;
    this.pending = null;
    this.generation = 0;
  }
  acquire() {
    if (this.activity) { this.touch(); return Promise.resolve(); }
    if (this.pending) return this.pending;
    const generation = this.generation;
    const pending = new Promise(resolve => this.manager.create('f1tv-foreground-session', activity => {
      if (generation !== this.generation) this.manager.complete(activity, {}, () => {});
      else { this.activity = activity; this.touch(); }
      resolve();
    }));
    this.pending = pending;
    const clear = () => { if (this.pending === pending) this.pending = null; };
    pending.then(clear, clear);
    return pending;
  }
  touch() {
    if (!this.activity) return;
    if (this.timer) this.timers.clearTimeout(this.timer);
    // Release after an app crash or lost connection; all signed-in foreground pages renew it.
    this.timer = this.timers.setTimeout(() => this.release(), 60000);
  }
  release() {
    this.generation++;
    this.pending = null;
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = null;
    const activity = this.activity;
    this.activity = null;
    if (activity) this.manager.complete(activity, {}, () => {});
  }
}
module.exports = SessionLease;
