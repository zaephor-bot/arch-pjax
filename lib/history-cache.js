// Url-keyed cache of pjax responses, used by the popstate reconciliation
// listener (lib/handle-popstate.js).
//
// Pjax identifies its own history entries by a uid stored inside the entry’s
// state object. Outside code (history.replaceState) can drop or overwrite
// that state, so a popstate to such an entry can only be resolved by matching
// the document’s actual url. This module holds the responses to match
// against, and derives the cache keys.
//
// Keys are urls with the fragment (#…) and pjax’s own cache-bust parameter
// (?t=…) removed — but the bust parameter is only removed when pjax put it
// there, so query strings owned by the site (e.g. ?t=100 vs ?t=200) keep
// distinct cache entries.

// Pjax only appends t values produced by Date.now() (lib/send-request.js),
// i.e. 13 digit millisecond timestamps (~2001–2033), and only when
// options.cacheBust is enabled.
var BUST_TIMESTAMP_REGEX = /^1\d{12}$/;

function isPjaxBustValue(value, bustValue) {
  if (bustValue !== undefined && value === String(bustValue)) {
    return true;
  }
  return BUST_TIMESTAMP_REGEX.test(value);
}

// Remove pjax’s cache-bust parameter from a url.
//
// `bustValue` is the exact value pjax appended to the request that produced
// this url, when it is known (recorded by lib/send-request.js). Otherwise
// only values that look like pjax timestamps are stripped, so that a
// site-owned parameter such as ?t=100 is left alone.
function stripBustParam(url, bustValue) {
  var hashIndex = url.indexOf("#");
  var hash = "";
  var withoutHash = url;

  if (hashIndex !== -1) {
    hash = url.slice(hashIndex);
    withoutHash = url.slice(0, hashIndex);
  }

  var queryIndex = withoutHash.indexOf("?");
  if (queryIndex === -1) {
    return url;
  }

  var params = withoutHash.slice(queryIndex + 1).split("&");
  var kept = [];
  var stripped = false;

  for (var i = 0; i < params.length; i++) {
    var param = params[i];
    if (
      param.slice(0, 2) === "t=" &&
      isPjaxBustValue(param.slice(2), bustValue)
    ) {
      stripped = true;
    } else {
      kept.push(param);
    }
  }

  if (!stripped) {
    return url;
  }

  return (
    withoutHash.slice(0, queryIndex + (kept.length > 0 ? 1 : 0)) +
    kept.join("&") +
    hash
  );
}

// Canonical cache key for a url: the url without its fragment, and without
// pjax’s cache-bust parameter when pjax is the one who added it.
function cacheKey(url, cacheBust, bustValue) {
  var key = cacheBust ? stripBustParam(url, bustValue) : url;

  var hashIndex = key.indexOf("#");
  if (hashIndex !== -1) {
    key = key.slice(0, hashIndex);
  }

  return key;
}

// Bounded cache: the most recently written entries are kept, the oldest
// entries are dropped once `maxSize` is exceeded.
function createCache(maxSize) {
  var entries = {};
  var order = [];

  return {
    get: function(key) {
      return entries.hasOwnProperty(key) ? entries[key] : undefined;
    },

    set: function(key, value) {
      var index = order.indexOf(key);
      if (index !== -1) {
        order.splice(index, 1);
      }
      order.push(key);

      while (order.length > maxSize) {
        delete entries[order.shift()];
      }

      entries[key] = value;
    },

    size: function() {
      return order.length;
    },

    clear: function() {
      entries = {};
      order = [];
    }
  };
}

module.exports = {
  cacheKey: cacheKey,
  createCache: createCache
};
