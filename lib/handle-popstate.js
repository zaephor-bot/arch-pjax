// Popstate reconciliation for history entries Pjax doesn’t recognize.
//
// Pjax keys its own history bookkeeping by a uid stored inside the history
// state object it owns. Outside code (e.g. history.replaceState(null, "", url)
// or a router storing its own state object) can drop or overwrite that state,
// so a popstate to such an entry carries no pjax uid. Pjax’s own popstate
// listener only understands uid entries; this listener wraps that bookkeeping
// (uid entries keep flowing through it untouched) and resolves everything
// else against the url the document actually shows: the content on screen is
// restored from the response cache, or fetched when it isn’t cached.
//
// It is registered before Pjax’s own popstate listener (see the install point
// in lib/proto/log.js, called by the constructor right before it registers
// that listener), so entries without a uid are reconciled before Pjax’s own
// listener can misread them.

var historyCache = require("./history-cache");
var clone = require("./util/clone");
var on = require("./events/on");

var MAX_CACHE_SIZE = 20;

// A state object created by Pjax carries a uid from lib/uniqueid.js
// ("pjax<timestamp>_<counter>"). Anything else — null states, or state
// objects owned by other code — identifies an entry Pjax didn’t create.
function hasPjaxUid(state) {
  return Boolean(
    state &&
      typeof state.uid === "string" &&
      state.uid.indexOf("pjax") === 0
  );
}

function reconcile(event) {
  // Ignore any popstate after destroy() has been called
  if (this.destroyed) {
    return;
  }

  var state = event.state;

  // Entries Pjax created itself are handled by its own popstate listener
  // (loadUrl through the uid bookkeeping); leave them to it.
  if (hasPjaxUid(state)) {
    return;
  }

  var target = window.location.href;
  var targetKey = historyCache.cacheKey(target, this.options.cacheBust);

  // The content on screen already belongs to the url in the address bar, so
  // there is nothing to reconcile. This also covers hash-only navigation,
  // which doesn’t change the document, and which must stay visible to other
  // popstate listeners on the page.
  if (targetKey === this.currentUrlKey) {
    return;
  }

  // A truthy state without a pjax uid belongs to other code, but Pjax’s own
  // popstate listener treats any truthy state as its own and would call
  // loadUrl() with that state’s url (undefined here), aborting the request
  // started below. That listener is registered after this one and lives in
  // index.js, which is out of scope for this change, so it is suppressed for
  // exactly these entries. null states are never suppressed: Pjax’s own
  // listener already ignores them, and the event stays visible to every
  // other popstate listener on the page.
  if (state) {
    event.stopImmediatePropagation();
  }

  var html = this.historyCache.get(targetKey);

  if (typeof html === "string") {
    // Don’t let a request in flight swap its page over the restored one
    this.abortRequest(this.request);

    var options = clone(this.options);
    // The history entry being popped to already exists, so prevent a new
    // one from being pushed
    options.history = false;
    options.url = target;

    this.state.href = target;
    this.state.options = options;

    try {
      this.loadContent(html, options);
      this.currentUrlKey = targetKey;
    } catch (e) {
      // Same fallback lib/proto/handle-response.js uses when a switch fails
      this.latestChance(target);
    }
  } else {
    // The url was never loaded through pjax (e.g. the entry only ever
    // existed as an outside replaceState), so fetch it. The response is
    // cached, and currentUrlKey updated, by handle-response.
    var fetchOptions = clone(this.options);
    fetchOptions.history = false;
    fetchOptions.url = target;

    this.loadUrl(target, fetchOptions);
  }
}

// Idempotent: called on every log call, but only the first one installs.
module.exports = function(pjax) {
  if (pjax.historyReconcileListener) {
    return;
  }

  pjax.historyCache = historyCache.createCache(MAX_CACHE_SIZE);
  // The url the content currently on screen belongs to; updated on every
  // content switch (lib/proto/handle-response.js) and restore
  pjax.currentUrlKey = historyCache.cacheKey(
    window.location.href,
    pjax.options.cacheBust
  );

  pjax.historyReconcileListener = function(event) {
    reconcile.call(pjax, event);
  };

  on(window, "popstate", pjax.historyReconcileListener);
};

// Exposed for tests
module.exports.hasPjaxUid = hasPjaxUid;
