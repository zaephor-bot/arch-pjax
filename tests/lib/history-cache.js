var tape = require("tape");

var historyCache = require("../../lib/history-cache");

var cacheKey = historyCache.cacheKey;

tape("cacheKey keeps site-owned t parameters distinct", function(t) {
  // A t parameter owned by the site (not a timestamp pjax appended) must not
  // be stripped, or both urls would collapse into a single cache entry and a
  // pop to one of them would restore the other one’s content
  t.equal(cacheKey("/page?t=100", true), "/page?t=100");
  t.equal(cacheKey("/page?t=200", true), "/page?t=200");
  t.notEqual(
    cacheKey("/page?t=100", true),
    cacheKey("/page?t=200", true),
    "?t=100 and ?t=200 are different cache entries"
  );

  t.equal(cacheKey("/page?t=100", false), "/page?t=100");

  t.end();
});

tape("cacheKey strips the t parameter pjax appended", function(t) {
  var bustValue = 1730000000123;

  // The exact value pjax recorded for the request that produced the url
  t.equal(
    cacheKey("/page?t=" + bustValue, true, bustValue),
    "/page",
    "the exact bust value is stripped, without leaving a trailing ?"
  );
  t.equal(
    cacheKey("/page?t=" + bustValue + "#hash", true, bustValue),
    "/page",
    "the bust value is stripped and the hash removed"
  );
  t.equal(
    cacheKey("/page?a=1&t=" + bustValue, true, bustValue),
    "/page?a=1",
    "other parameters survive in order"
  );
  t.equal(
    cacheKey("/page?t=" + bustValue + "&a=1", true, bustValue),
    "/page?a=1",
    "a leading bust parameter doesn’t leave an empty entry"
  );

  // Without the recorded value, only recent millisecond timestamps (what
  // Date.now() produces in lib/send-request.js) are treated as pjax’s
  t.equal(cacheKey("/page?t=1730000000456", true), "/page");
  t.equal(cacheKey("/page?t=1730000000456&a=1", true), "/page?a=1");
  t.equal(cacheKey("/page?t=1730000000456", false), "/page?t=1730000000456");

  t.end();
});

tape("cacheKey removes the fragment", function(t) {
  t.equal(cacheKey("/page#section", true), "/page");
  t.equal(cacheKey("/page?a=1#section", false), "/page?a=1");
  t.equal(cacheKey("/page#t=1", true), "/page", "parameters in the fragment are not query parameters");

  t.end();
});

tape("cache is bounded and keeps the most recent entries", function(t) {
  var cache = historyCache.createCache(3);

  cache.set("1", "one");
  cache.set("2", "two");
  cache.set("3", "three");

  t.equal(cache.size(), 3);
  t.equal(cache.get("1"), "one");

  // Re-writing an existing key must not evict anything
  cache.set("2", "two-again");
  t.equal(cache.size(), 3);
  t.equal(cache.get("2"), "two-again");

  // Exceeding the limit drops the oldest entry
  cache.set("4", "four");
  t.equal(cache.size(), 3);
  t.equal(cache.get("1"), undefined, "the oldest entry was dropped");
  t.equal(cache.get("4"), "four");
  t.equal(cache.get("2"), "two-again");

  // Re-writing the oldest key refreshes it
  cache.set("3", "three-again");
  cache.set("5", "five");
  t.equal(cache.size(), 3);
  t.equal(cache.get("2"), undefined, "the oldest entry was dropped");
  t.equal(cache.get("3"), "three-again");
  t.equal(cache.get("5"), "five");

  cache.clear();
  t.equal(cache.size(), 0);
  t.equal(cache.get("3"), undefined);

  t.end();
});
