var off = require("../events/off");

module.exports = function() {
  // destroy() is harmless when called more than once
  if (this.destroyed) {
    return;
  }

  this.destroyed = true;

  // Cancel a request in flight, so that no pending response is swapped in
  // after Pjax has been turned off
  this.abortRequest(this.request);

  // Remove the listeners attached to links and forms.
  // Listeners attached by other code are left untouched.
  var elementListeners = this.elementListeners || [];

  elementListeners.forEach(function(tracked) {
    off(tracked.el, tracked.event, tracked.listener);
  });
  this.elementListeners = [];

  // Remove the popstate reconciliation listener and drop its response cache
  // (see lib/handle-popstate.js)
  if (this.historyReconcileListener) {
    off(window, "popstate", this.historyReconcileListener);
    this.historyReconcileListener = null;
  }
  if (this.historyCache) {
    this.historyCache.clear();
  }

  // Restore the default behavior of the history (back/forward) navigation
  off(window, "popstate", this.popstateListener);
};
