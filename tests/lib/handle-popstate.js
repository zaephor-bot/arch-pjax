var tape = require("tape");

var handlePopstate = require("../../lib/handle-popstate");

var hasPjaxUid = handlePopstate.hasPjaxUid;

tape("only states carrying a pjax uid are treated as pjax’s own", function(t) {
  t.equal(hasPjaxUid({ uid: "pjax1730000000123_7", url: "/a" }), true);
  t.equal(
    hasPjaxUid(null),
    false,
    "a null state (replaceState(null, …, url)) is not pjax’s"
  );
  t.equal(hasPjaxUid(undefined), false);
  t.equal(
    hasPjaxUid({ route: "/c" }),
    false,
    "a foreign state object without a uid is not pjax’s"
  );
  t.equal(
    hasPjaxUid({ uid: 5 }),
    false,
    "a numeric uid from other code is not pjax’s"
  );

  t.end();
});

var Pjax = require("../../index");
var on = require("../../lib/events/on");
var off = require("../../lib/events/off");
var trigger = require("../../lib/events/trigger");
var updateQueryString = require("../../lib/util/update-query-string");

var ORIGIN = window.location.protocol + "//" + window.location.host;
// jsdom-global (tests/setup.js) shares one window across every test file;
// tests must leave it as they found it
var INITIAL_URL = ORIGIN + "/";

function pageHtml(title, content) {
  return (
    "<html><head><title>" +
    title +
    "</title></head><body>" +
    '<div class="js-Pjax">' +
    content +
    "</div></body></html>"
  );
}

var pages = {
  "/a": pageHtml("A", "PAGE-A"),
  "/b": pageHtml("B", "PAGE-B"),
  "/c": pageHtml("C", "PAGE-C")
};

function urlPath(url) {
  var a = document.createElement("a");
  a.href = url;
  return a.pathname;
}

function resetDocument(title, content) {
  document.head.innerHTML = "<title>" + title + "</title>";
  document.body.innerHTML = '<div class="js-Pjax">' + content + "</div>";
  document.title = title;
}

// Mimics lib/send-request.js closely enough for these tests: same
// cache-busting behavior (recording options.cacheBustValue), same handling
// of a url that can’t be resolved, synchronous responses.
function createFakeSendRequest() {
  var log = {
    // every doRequest() call, including ones with an unresolvable url
    calls: [],
    // the urls actually requested over "the network"
    urls: []
  };

  log.doRequest = function(location, options, callback) {
    var request = {
      readyState: 4,
      status: 0,
      responseText: null,
      aborted: false,
      getResponseHeader: function() {
        return null;
      },
      abort: function() {
        request.aborted = true;
      }
    };

    log.calls.push(location);

    if (typeof location !== "string") {
      callback(false, request, location, options);
      return request;
    }

    if (options.cacheBust) {
      options.cacheBustValue = Date.now();
      location = updateQueryString(location, "t", options.cacheBustValue);
    }

    request.url = location;
    log.urls.push(location);

    var page = pages[urlPath(location)];

    if (page) {
      request.status = 200;
      request.responseText = page;
      callback(request.responseText, request, location, options);
    } else {
      request.status = 404;
      callback(null, request, location, options);
    }

    return request;
  };

  return log;
}

// jsdom doesn’t implement the loading side of back/forward, and fires
// popstate asynchronously, so the history stack is driven by hand: entries
// are recorded as pjax and the outside code create them, and go() moves the
// address bar and the history state to the target entry and fires the
// popstate a real browser would fire for it.
//
// replaceState is wrapped while a test runs, so states pjax writes while
// handling something (scroll positions, uids) keep the recorded entries in
// sync with the real history.
function HistoryStack() {
  var stack = this;

  this.entries = [{ state: window.history.state, url: window.location.href }];
  this.pointer = 0;

  this.nativeReplaceState = window.history.replaceState;
  window.history.replaceState = function(state, title, url) {
    stack.nativeReplaceState.call(window.history, state, title, url);
    stack.entries[stack.pointer] = {
      state: state,
      url: window.location.href
    };
  };
}

HistoryStack.prototype.restoreNativeReplaceState = function() {
  delete window.history.replaceState;
};

// Undo everything a test did to the shared window
HistoryStack.prototype.restore = function() {
  this.restoreNativeReplaceState();

  window.history.replaceState(null, "", INITIAL_URL);
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.title = "";
};

// Record the current (usually just pushed) entry as the newest one
HistoryStack.prototype.recordCurrentEntry = function() {
  this.entries = this.entries.slice(0, this.pointer + 1);
  this.entries.push({
    state: window.history.state,
    url: window.location.href
  });
  this.pointer = this.entries.length - 1;
};

HistoryStack.prototype.go = function(steps) {
  this.pointer += steps;
  var entry = this.entries[this.pointer];

  window.history.replaceState(entry.state, "", entry.url);
  trigger(window, "popstate", { state: entry.state });
};

function createEnvironment(path, title, content) {
  resetDocument(title, content);
  window.history.replaceState(null, "", ORIGIN + path);

  var requests = createFakeSendRequest();
  var pjax = new Pjax();
  pjax.doRequest = requests.doRequest;

  return {
    pjax: pjax,
    requests: requests,
    stack: new HistoryStack()
  };
}

function clickLink(pjax, href) {
  var link = document.createElement("a");
  link.href = href;
  document.body.appendChild(link);
  pjax.attachLink(link);
  trigger(link, "click");
  document.body.removeChild(link);
}

function assertLocation(t, label, urlRegex, description) {
  t.ok(
    urlRegex.test(window.location.href),
    label + ": address bar shows " + description + " (got " +
      window.location.href +
      ")"
  );
}

function assertPage(t, label, expected) {
  assertLocation(t, label, expected.url, expected.urlDescription || expected.url);
  t.equal(
    document.title,
    expected.title,
    label + ": document title is " + expected.title
  );
  t.equal(
    document.querySelector(".js-Pjax").innerHTML,
    expected.content,
    label + ": content on screen is " + expected.content
  );
}

var C_URL = /^https:\/\/example\.org\/c$/;
var B_URL = /^https:\/\/example\.org\/b$/;
var A_URL = /^https:\/\/example\.org\/a$/;
var B_BUSTED_URL = /^https:\/\/example\.org\/b\?t=\d+$/;

tape("reported sequence with replaceState(null): A, C, B, back, forward, back", function(t) {
  var env = createEnvironment("/a", "A", "PAGE-A");
  var pjax = env.pjax;
  var stack = env.stack;

  // The page rewrites its own url to /c, outside of pjax. The content on
  // screen still belongs to /a.
  window.history.replaceState(null, "", ORIGIN + "/c");
  assertPage(t, "after the outside replaceState to C", {
    url: C_URL,
    urlDescription: "C’s url",
    title: "A",
    content: "PAGE-A"
  });

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();
  assertPage(t, "after the pjax link to B", {
    url: B_BUSTED_URL,
    urlDescription: "B’s (cache-busted) url",
    title: "B",
    content: "PAGE-B"
  });

  stack.go(-1);
  assertPage(t, "after back to C", {
    url: C_URL,
    urlDescription: "C’s url",
    title: "C",
    content: "PAGE-C"
  });

  stack.go(1);
  assertPage(t, "after forward to B", {
    url: B_BUSTED_URL,
    urlDescription: "B’s (cache-busted) url",
    title: "B",
    content: "PAGE-B"
  });

  stack.go(-1);
  // The reported symptom: C’s url with B’s content still on screen
  assertPage(t, "after back to C again", {
    url: C_URL,
    urlDescription: "C’s url",
    title: "C",
    content: "PAGE-C"
  });

  pjax.destroy();
  stack.restore();
  t.end();
});

tape("reported sequence with a foreign replaceState state object", function(t) {
  var env = createEnvironment("/a", "A", "PAGE-A");
  var pjax = env.pjax;
  var stack = env.stack;

  // Outside code (e.g. a router) rewrites the url to /c with its own state
  // object, which carries no pjax uid
  window.history.replaceState({ route: "/c" }, "", ORIGIN + "/c");

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();
  assertPage(t, "after the pjax link to B", {
    url: B_BUSTED_URL,
    urlDescription: "B’s (cache-busted) url",
    title: "B",
    content: "PAGE-B"
  });

  stack.go(-1);
  assertPage(t, "after back to C", {
    url: C_URL,
    urlDescription: "C’s url",
    title: "C",
    content: "PAGE-C"
  });

  stack.go(1);
  assertPage(t, "after forward to B", {
    url: B_BUSTED_URL,
    urlDescription: "B’s (cache-busted) url",
    title: "B",
    content: "PAGE-B"
  });

  stack.go(-1);
  assertPage(t, "after back to C again", {
    url: C_URL,
    urlDescription: "C’s url",
    title: "C",
    content: "PAGE-C"
  });

  pjax.destroy();
  stack.restore();
  t.end();
});

tape("forward into an outside-replaced entry (null state) shows that url’s content", function(t) {
  var env = createEnvironment("/a", "A", "PAGE-A");
  var pjax = env.pjax;
  var requests = env.requests;
  var stack = env.stack;

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();
  t.equal(requests.urls.length, 1);

  // Rewrite the entry for /b into /c, with no state at all
  window.history.replaceState(null, "", ORIGIN + "/c");

  stack.go(-1);
  // The initial entry still carries the uid pjax gave it when navigating
  // away, so this goes through pjax’s own bookkeeping
  assertPage(t, "after back to A", {
    url: A_URL,
    urlDescription: "A’s url",
    title: "A",
    content: "PAGE-A"
  });

  stack.go(1);
  // The popped-to entry has no pjax uid: the content must be resolved
  // against the document’s url. /c was never loaded, so it is fetched
  // instead of leaving A’s content on screen.
  assertPage(t, "after forward to the replaced entry C", {
    url: C_URL,
    urlDescription: "C’s url",
    title: "C",
    content: "PAGE-C"
  });
  t.equal(
    requests.urls.length,
    3,
    "the content for /c was fetched (link to B, back to A, forward to C)"
  );

  stack.go(-1);
  assertPage(t, "after back to A again", {
    url: A_URL,
    urlDescription: "A’s url",
    title: "A",
    content: "PAGE-A"
  });

  pjax.destroy();
  stack.restore();
  t.end();
});

tape("a foreign state object pop is reconciled once, without a bogus load", function(t) {
  var env = createEnvironment("/a", "A", "PAGE-A");
  var pjax = env.pjax;
  var requests = env.requests;
  var stack = env.stack;

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();

  window.history.replaceState({ route: "/c" }, "", ORIGIN + "/c");

  stack.go(-1);
  assertPage(t, "after back to A", {
    url: A_URL,
    urlDescription: "A’s url",
    title: "A",
    content: "PAGE-A"
  });
  t.equal(requests.calls.length, 2);

  stack.go(1);
  assertPage(t, "after forward to the replaced entry C", {
    url: C_URL,
    urlDescription: "C’s url",
    title: "C",
    content: "PAGE-C"
  });

  // Pjax’s own popstate listener treats any truthy state as its own and
  // would call loadUrl() with the state’s (missing) url on top of the
  // reconciliation; only the reconciled load may happen.
  t.equal(
    requests.calls.length,
    3,
    "exactly one load happens for the foreign-state pop"
  );
  t.ok(
    requests.urls.every(function(url) {
      return typeof url === "string";
    }),
    "no request is made for an undefined url"
  );

  pjax.destroy();
  stack.restore();
  t.end();
});

tape("a uid-less pop to a previously loaded url is restored from the cache", function(t) {
  var env = createEnvironment("/a", "A", "PAGE-A");
  var pjax = env.pjax;
  var requests = env.requests;
  var stack = env.stack;

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();
  clickLink(pjax, ORIGIN + "/c");
  stack.recordCurrentEntry();
  t.equal(requests.urls.length, 2);

  // Rewrite the /c entry into /b, with no state: /b is already cached
  window.history.replaceState(null, "", ORIGIN + "/b");

  stack.go(-2);
  assertPage(t, "after jumping back to A", {
    url: A_URL,
    urlDescription: "A’s url",
    title: "A",
    content: "PAGE-A"
  });
  t.equal(requests.urls.length, 3, "the jump to A goes through the uid path");

  stack.go(2);
  assertPage(t, "after jumping forward to the replaced entry B", {
    url: B_URL,
    urlDescription: "B’s url",
    title: "B",
    content: "PAGE-B"
  });
  t.equal(
    requests.urls.length,
    3,
    "the content for /b is restored from the cache, without a new request"
  );

  // The restored entry keeps its uid-less state, so repeated jumps to it
  // keep reconciling against the cache
  stack.go(-2);
  stack.go(2);
  assertPage(t, "after jumping back and forward again", {
    url: B_URL,
    urlDescription: "B’s url",
    title: "B",
    content: "PAGE-B"
  });
  t.equal(requests.urls.length, 4, "only the jump to A fetches");

  pjax.destroy();
  stack.restore();
  t.end();
});

tape("hash-only uid-less popstates are ignored and stay visible to other listeners", function(t) {
  var env = createEnvironment("/a", "A", "PAGE-A");
  var pjax = env.pjax;
  var requests = env.requests;
  var stack = env.stack;

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();

  // Same-document hash navigation pushed by outside code, with no state
  window.history.pushState(null, "", window.location.href + "#section");
  stack.recordCurrentEntry();

  var successes = 0;
  var successListener = function() {
    successes++;
  };
  document.addEventListener("pjax:success", successListener);

  // A listener registered after pjax’s own ones, like co-resident
  // history-based code (routers, analytics)
  var seenStates = [];
  var foreignListener = function(event) {
    seenStates.push(event.state);
  };
  on(window, "popstate", foreignListener);

  stack.go(-1);
  assertPage(t, "after back to B’s entry", {
    url: B_BUSTED_URL,
    urlDescription: "B’s (cache-busted) url",
    title: "B",
    content: "PAGE-B"
  });
  t.equal(
    successes,
    1,
    "the back to B’s uid entry switched the page once"
  );

  stack.go(1);
  assertLocation(
    t,
    "after forward to the hash entry",
    /^https:\/\/example\.org\/b\?t=\d+#section$/,
    "B’s url with the hash"
  );
  t.equal(
    document.querySelector(".js-Pjax").innerHTML,
    "PAGE-B",
    "the document isn’t re-switched for a hash-only popstate"
  );
  t.equal(
    requests.urls.length,
    2,
    "a hash-only popstate doesn’t trigger a request"
  );
  t.equal(successes, 1, "a hash-only popstate doesn’t switch the page");
  t.equal(
    seenStates.length,
    2,
    "both popstates stay visible to a listener registered after pjax’s"
  );

  off(window, "popstate", foreignListener);
  document.removeEventListener("pjax:success", successListener);
  pjax.destroy();
  stack.restore();
  t.end();
});

tape("a hash-only popstate carrying a foreign state object stays visible too", function(t) {
  var env = createEnvironment("/a", "A", "PAGE-A");
  var pjax = env.pjax;
  var requests = env.requests;
  var stack = env.stack;

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();

  // Same-document hash navigation pushed by outside code carrying its own
  // state object (no pjax uid)
  window.history.pushState(
    { route: "section" },
    "",
    window.location.href + "#section"
  );
  stack.recordCurrentEntry();

  var seenStates = [];
  var foreignListener = function(event) {
    seenStates.push(event.state);
  };
  on(window, "popstate", foreignListener);

  stack.go(-1);
  assertPage(t, "after back to B’s entry", {
    url: B_BUSTED_URL,
    urlDescription: "B’s (cache-busted) url",
    title: "B",
    content: "PAGE-B"
  });

  stack.go(1);
  assertLocation(
    t,
    "after forward to the hash entry",
    /^https:\/\/example\.org\/b\?t=\d+#section$/,
    "B’s url with the hash"
  );
  t.equal(
    document.querySelector(".js-Pjax").innerHTML,
    "PAGE-B",
    "the document isn’t re-switched for a hash-only popstate"
  );
  t.equal(
    requests.urls.length,
    2,
    "a hash-only popstate doesn’t trigger a network request"
  );
  t.equal(
    seenStates.length,
    2,
    "the hash-only popstate carrying a foreign state stays visible"
  );

  off(window, "popstate", foreignListener);
  pjax.destroy();
  stack.restore();
  t.end();
});

tape("ordinary uid navigation keeps flowing through pjax’s own bookkeeping", function(t) {
  var env = createEnvironment("/a", "A", "PAGE-A");
  var pjax = env.pjax;
  var requests = env.requests;
  var stack = env.stack;

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();
  t.equal(
    typeof window.history.state.uid,
    "string",
    "the pushed entry carries a pjax uid"
  );
  t.equal(requests.urls.length, 1);

  stack.go(-1);
  assertPage(t, "after back to A", {
    url: A_URL,
    urlDescription: "A’s url",
    title: "A",
    content: "PAGE-A"
  });

  stack.go(1);
  assertPage(t, "after forward to B", {
    url: B_BUSTED_URL,
    urlDescription: "B’s (cache-busted) url",
    title: "B",
    content: "PAGE-B"
  });

  t.equal(
    requests.urls.length,
    3,
    "uid popstates keep being loaded through the existing path"
  );

  pjax.destroy();
  stack.restore();
  t.end();
});

tape("destroy removes the reconciliation listener and drops the cache", function(t) {
  var env = createEnvironment("/a", "A", "PAGE-A");
  var pjax = env.pjax;
  var requests = env.requests;
  var stack = env.stack;

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();
  window.history.replaceState(null, "", ORIGIN + "/c");

  t.ok(pjax.historyCache.size() > 0, "the response cache holds an entry");

  pjax.destroy();
  t.equal(pjax.historyCache.size(), 0, "destroy() drops the response cache");

  stack.go(-1);
  stack.go(1);
  t.equal(
    requests.calls.length,
    1,
    "no load is attempted for any popstate after destroy()"
  );
  t.equal(
    document.querySelector(".js-Pjax").innerHTML,
    "PAGE-B",
    "the content isn’t touched after destroy()"
  );

  stack.restore();
  t.end();
});

tape("reconciliation uses the cache across pjax’s own cache-busted urls", function(t) {
  // This test drives the real lib/send-request.js (with a stubbed
  // XMLHttpRequest), so the cache key written when the response arrives
  // (pjax’s exact bust parameter stripped via options.cacheBustValue) and
  // the key looked up at popstate time (the address-bar url carrying the
  // bust parameter) are verified to agree end to end.
  var sentUrls = [];

  function FakeXMLHttpRequest() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = null;
    this.onreadystatechange = function() {};
  }
  FakeXMLHttpRequest.prototype.open = function(method, url) {
    this.requestedUrl = url;
  };
  FakeXMLHttpRequest.prototype.setRequestHeader = function() {};
  FakeXMLHttpRequest.prototype.getResponseHeader = function() {
    return null;
  };
  FakeXMLHttpRequest.prototype.abort = function() {};
  FakeXMLHttpRequest.prototype.send = function() {
    sentUrls.push(this.requestedUrl);

    var page = pages[urlPath(this.requestedUrl)];
    if (page) {
      this.status = 200;
      this.responseText = page;
    } else {
      this.status = 404;
    }
    this.readyState = 4;
    this.onreadystatechange();
  };

  var nativeXMLHttpRequest = global.XMLHttpRequest;
  global.XMLHttpRequest = FakeXMLHttpRequest;

  resetDocument("A", "PAGE-A");
  window.history.replaceState(null, "", ORIGIN + "/a");

  var pjax = new Pjax();
  var stack = new HistoryStack();

  clickLink(pjax, ORIGIN + "/b");
  stack.recordCurrentEntry();
  assertPage(t, "after the pjax link to B", {
    url: B_BUSTED_URL,
    urlDescription: "B’s (cache-busted) url",
    title: "B",
    content: "PAGE-B"
  });
  t.equal(sentUrls.length, 1);

  // Drop the state pjax pushed for this entry, keeping the busted url
  window.history.replaceState(null, "", window.location.href);

  stack.go(-1);
  assertPage(t, "after back to A", {
    url: A_URL,
    urlDescription: "A’s url",
    title: "A",
    content: "PAGE-A"
  });
  t.equal(sentUrls.length, 2);

  stack.go(1);
  assertPage(t, "after forward to B’s uid-less entry", {
    url: B_BUSTED_URL,
    urlDescription: "B’s (cache-busted) url",
    title: "B",
    content: "PAGE-B"
  });
  t.equal(
    sentUrls.length,
    2,
    "the response cached under the busted url is reused as-is"
  );

  global.XMLHttpRequest = nativeXMLHttpRequest;
  pjax.destroy();
  stack.restore();
  t.end();
});
