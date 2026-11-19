var tape = require("tape");

var Pjax = require("../../../index");
var on = require("../../../lib/events/on");
var trigger = require("../../../lib/events/trigger");

var internalUri =
  window.location.protocol + "//" + window.location.host + "/internal";

tape("test destroy restores the default link behavior", function(t) {
  var pjax = new Pjax();

  var loadUrlCalled = 0;
  pjax.loadUrl = function() {
    loadUrlCalled++;
  };

  var a = document.createElement("a");
  a.href = internalUri;
  pjax.attachLink(a);

  // This listener is registered after Pjax's own one, so it runs after it and
  // sees whether the default link behavior has been prevented or not
  var defaultPrevented;
  on(a, "click", function(event) {
    defaultPrevented = event.defaultPrevented;
  });

  trigger(a, "click");
  t.equal(loadUrlCalled, 1, "before destroy(), Pjax intercepts link clicks");
  t.equal(
    defaultPrevented,
    true,
    "before destroy(), Pjax prevents the default link behavior"
  );

  pjax.destroy();

  trigger(a, "click");
  t.equal(
    loadUrlCalled,
    1,
    "after destroy(), Pjax no longer intercepts link clicks"
  );
  t.equal(
    defaultPrevented,
    false,
    "after destroy(), the default link behavior is restored"
  );

  t.end();
});

tape("test destroy restores the default form behavior", function(t) {
  var pjax = new Pjax();

  var loadUrlCalled = 0;
  pjax.loadUrl = function() {
    loadUrlCalled++;
  };

  var form = document.createElement("form");
  form.action = internalUri;
  form.method = "GET";
  var input = document.createElement("input");
  input.name = "q";
  input.value = "pjax";
  form.appendChild(input);
  pjax.attachForm(form);

  // This listener is registered after Pjax's own one, so it runs after it and
  // sees whether the default form behavior has been prevented or not
  var defaultPrevented;
  on(form, "submit", function(event) {
    defaultPrevented = event.defaultPrevented;
  });

  trigger(form, "submit");
  t.equal(loadUrlCalled, 1, "before destroy(), Pjax intercepts form submits");
  t.equal(
    defaultPrevented,
    true,
    "before destroy(), Pjax prevents the default form behavior"
  );

  pjax.destroy();

  trigger(form, "submit");
  t.equal(
    loadUrlCalled,
    1,
    "after destroy(), Pjax no longer intercepts form submits"
  );
  t.equal(
    defaultPrevented,
    false,
    "after destroy(), the default form behavior is restored"
  );

  t.end();
});

tape("test destroy is harmless when called twice", function(t) {
  var pjax = new Pjax();

  pjax.destroy();

  t.doesNotThrow(function() {
    pjax.destroy();
  }, "calling destroy() twice does not throw");

  t.end();
});

tape("test destroy keeps listeners attached by other code", function(t) {
  var pjax = new Pjax();

  var a = document.createElement("a");
  a.href = internalUri;

  var foreignClicks = 0;
  on(a, "click", function() {
    foreignClicks++;
  });

  pjax.attachLink(a);
  pjax.destroy();

  trigger(a, "click");
  t.equal(
    foreignClicks,
    1,
    "listeners attached by other code still fire after destroy()"
  );

  t.end();
});

tape("test destroy aborts a request in flight", function(t) {
  var pjax = new Pjax();

  var aborted = false;
  pjax.request = {
    readyState: 2,
    onreadystatechange: function() {},
    abort: function() {
      aborted = true;
    }
  };

  pjax.destroy();

  t.equal(aborted, true, "a request in flight is aborted by destroy()");

  t.end();
});

tape("test destroy prevents Pjax from hooking new content", function(t) {
  var pjax = new Pjax();

  var loadUrlCalled = 0;
  pjax.loadUrl = function() {
    loadUrlCalled++;
  };

  pjax.destroy();

  var a = document.createElement("a");
  a.href = internalUri;
  document.body.appendChild(a);
  pjax.refresh(document.body);

  trigger(a, "click");
  t.equal(
    loadUrlCalled,
    0,
    "links added to the page after destroy() are not hooked by Pjax"
  );

  document.body.removeChild(a);

  t.end();
});

tape("test loadUrl() is ignored after destroy()", function(t) {
  var pjax = new Pjax();

  pjax.destroy();

  var doRequestCalled = false;
  pjax.doRequest = function() {
    doRequestCalled = true;
  };

  pjax.loadUrl(internalUri);
  t.equal(
    doRequestCalled,
    false,
    "loadUrl() does not start a request after destroy()"
  );

  t.end();
});

tape("test destroy removes the popstate listener", function(t) {
  var pjax = new Pjax();

  var loadUrlCalled = false;
  pjax.loadUrl = function() {
    loadUrlCalled = true;
  };

  var state = {
    state: {
      url: internalUri,
      title: "",
      uid: 1,
      scrollPos: [0, 0]
    }
  };

  trigger(window, "popstate", state);
  t.equal(
    loadUrlCalled,
    true,
    "history navigation triggers Pjax before destroy()"
  );

  pjax.destroy();
  loadUrlCalled = false;

  trigger(window, "popstate", state);
  t.equal(
    loadUrlCalled,
    false,
    "history navigation does not trigger Pjax after destroy()"
  );

  t.end();
});
