var clone = require("../util/clone");
var newUid = require("../uniqueid");
var trigger = require("../events/trigger");
var historyCache = require("../history-cache");

module.exports = function(responseText, request, href, options) {
  // Ignore a response received once destroy() has been called,
  // so no content is swapped in after Pjax has been turned off
  if (this.destroyed) {
    return;
  }

  options = clone(options || this.options);
  options.request = request;

  // Fail if unable to load HTML via AJAX
  if (responseText === false) {
    trigger(document, "pjax:complete pjax:error", options);

    return;
  }

  // push scroll position to history
  var currentState = window.history.state || {};
  window.history.replaceState(
    {
      url: currentState.url || window.location.href,
      title: currentState.title || document.title,
      uid: currentState.uid || newUid(),
      scrollPos: [
        document.documentElement.scrollLeft || document.body.scrollLeft,
        document.documentElement.scrollTop || document.body.scrollTop
      ]
    },
    document.title,
    window.location.href
  );

  // Check for redirects
  var oldHref = href;
  if (request.responseURL) {
    if (href !== request.responseURL) {
      href = request.responseURL;
    }
  } else if (request.getResponseHeader("X-PJAX-URL")) {
    href = request.getResponseHeader("X-PJAX-URL");
  } else if (request.getResponseHeader("X-XHR-Redirected-To")) {
    href = request.getResponseHeader("X-XHR-Redirected-To");
  }

  // Add back the hash if it was removed
  var a = document.createElement("a");
  a.href = oldHref;
  var oldHash = a.hash;
  a.href = href;
  if (oldHash && !a.hash) {
    a.hash = oldHash;
    href = a.href;
  }

  this.state.href = href;
  this.state.options = options;

  // Cache the response so a later popstate to a history entry pjax can’t
  // identify (one without a pjax uid, e.g. after an outside
  // history.replaceState) can be reconciled against the document’s url, and
  // remember which url the content now on screen belongs to. Keys strip
  // pjax’s own cache-bust parameter (recorded by lib/send-request.js in
  // options.cacheBustValue) but never a site-owned one. See
  // lib/handle-popstate.js and lib/history-cache.js.
  if (this.historyCache && typeof responseText === "string") {
    var urlKey = historyCache.cacheKey(
      href,
      options.cacheBust,
      options.cacheBustValue
    );
    this.historyCache.set(urlKey, responseText);
    this.currentUrlKey = urlKey;
  }

  try {
    this.loadContent(responseText, options);
  } catch (e) {
    trigger(document, "pjax:error", options);

    if (!this.options.debug) {
      if (console && console.error) {
        console.error("Pjax switch fail: ", e);
      }
      return this.latestChance(href);
    } else {
      throw e;
    }
  }
};
