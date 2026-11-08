'use strict';
// A listening HTTP socket is not a webOS Activity Manager lifetime hold.
class PlaybackLease {
  constructor(manager, timers = {setTimeout, clearTimeout}) {
    this.manager = manager;
    this.timers = timers;
    this.activity = null;
    this.timer = null;
  }
  acquire() {
    if (this.activity) { this.touch(); return Promise.resolve(); }
    return new Promise(resolve => this.manager.create('f1tv-playback-relay', activity => {
      this.activity = activity;
      this.touch();
      resolve();
    }));
  }
  touch() {
    if (!this.activity) return;
    if (this.timer) this.timers.clearTimeout(this.timer);
    // Release after an app crash or lost connection; foreground playback renews this lease.
    this.timer = this.timers.setTimeout(() => this.release(), 60000);
  }
  release() {
    if (this.timer) this.timers.clearTimeout(this.timer);
    this.timer = null;
    const activity = this.activity;
    this.activity = null;
    if (activity) this.manager.complete(activity, {}, () => {});
  }
}
module.exports = PlaybackLease;
