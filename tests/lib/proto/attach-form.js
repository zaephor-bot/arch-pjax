var tape = require("tape");

var on = require("../../../lib/events/on");
var trigger = require("../../../lib/events/trigger");
var attachForm = require("../../../lib/proto/attach-form");

var attr = "data-pjax-state";

tape("test attach form prototype method", function(t) {
  var form = document.createElement("form");
  var loadUrlCalled = false;

  attachForm.call(
    {
      options: {
        currentUrlFullReload: true
      },
      loadUrl: function() {
        loadUrlCalled = true;
      }
    },
    form
  );

  var internalUri =
    window.location.protocol +
    "//" +
    window.location.host +
    window.location.pathname +
    window.location.search;

  form.action = "http://external.com/";
  trigger(form, "submit");
  t.equal(form.getAttribute(attr), "external", "external url stop behavior");

  form.action = internalUri + "#anchor";
  trigger(form, "submit");
  t.equal(form.getAttribute(attr), "anchor", "internal anchor stop behavior");

  window.location.hash = "#anchor";
  form.action = internalUri + "#another-anchor";
  trigger(form, "submit");
  t.equal(form.getAttribute(attr), "anchor", "different anchors stop behavior");
  window.location.hash = "";

  form.action = internalUri + "#";
  trigger(form, "submit");
  t.equal(
    form.getAttribute(attr),
    "anchor-empty",
    "empty anchor stop behavior"
  );

  form.action = window.location.href;
  trigger(form, "submit");
  t.equal(
    form.getAttribute(attr),
    "reload",
    "submitting when currentUrlFullReload is true will submit normally, without XHR"
  );
  t.equal(loadUrlCalled, false, "loadUrl() not called");

  form.action =
    window.location.protocol + "//" + window.location.host + "/internal";
  form.method = "POST";
  trigger(form, "submit");
  t.equal(
    form.getAttribute(attr),
    "submit",
    "triggering a POST request to the next page"
  );
  t.equal(loadUrlCalled, true, "loadUrl() called correctly");

  loadUrlCalled = false;
  form.setAttribute(attr, "");
  form.action =
    window.location.protocol + "//" + window.location.host + "/internal";
  form.method = "GET";
  trigger(form, "submit");
  t.equal(
    form.getAttribute(attr),
    "submit",
    "triggering a GET request to the next page"
  );
  t.equal(loadUrlCalled, true, "loadUrl() called correctly");

  t.end();
});

tape("test attach form preventDefaulted events", function(t) {
  var loadUrlCalled = false;
  var form = document.createElement("form");

  // This needs to be before the call to attachForm()
  on(form, "submit", function(event) {
    event.preventDefault();
  });

  attachForm.call(
    {
      options: {},
      loadUrl: function() {
        loadUrlCalled = true;
      }
    },
    form
  );

  form.action = "#";
  trigger(form, "submit");
  t.equal(
    loadUrlCalled,
    false,
    "events that are preventDefaulted should not fire callback"
  );

  t.end();
});

tape("test options are not modified by attachForm", function(t) {
  var form = document.createElement("form");
  var options = { foo: "bar" };
  var loadUrl = function() {};

  attachForm.call({ options: options, loadUrl: loadUrl }, form);

  form.action =
    window.location.protocol +
    "//" +
    window.location.host +
    window.location.pathname +
    window.location.search;
  form.method = "GET";
  trigger(form, "submit");

  t.equal(
    1,
    Object.keys(options).length,
    "options object that is passed in should not be modified"
  );
  t.equal(
    "bar",
    options.foo,
    "options object that is passed in should not be modified"
  );

  t.end();
});

tape("test form elements parsed correctly", function(t) {
  t.plan(1);

  var form = document.createElement("form");
  var input = document.createElement("input");
  input.name = "input";
  input.value = "value";
  form.appendChild(input);

  var params = [
    {
      name: "input",
      value: "value"
    }
  ];
  var pjax = {
    options: {},
    loadUrl: function(href, options) {
      t.same(
        options.requestOptions.requestParams,
        params,
        "form elements parsed correctly"
      );
    }
  };

  attachForm.call(pjax, form);

  form.action =
    window.location.protocol + "//" + window.location.host + "/internal";

  trigger(form, "submit");
  // see loadUrl defined above

  t.end();
});

tape('test form.enctype="multipart/form-data"', function(t) {
  t.plan(4);

  var form = document.createElement("form");
  form.enctype = "multipart/form-data";
  var input = document.createElement("input");
  input.name = "input";
  input.value = "value";
  form.appendChild(input);

  var pjax = {
    options: {},
    loadUrl: function(href, options) {
      t.equals(
        options.requestOptions.requestParams,
        undefined,
        "form elements not parsed manually"
      );
      t.true(
        options.requestOptions.formData instanceof FormData,
        "requestOptions.formData is a FormData"
      );
      t.equals(
        Array.from(options.requestOptions.formData.entries()).length,
        1,
        "correct number of FormData elements"
      );
      t.equals(
        options.requestOptions.formData.get("input"),
        "value",
        "FormData element value set correctly"
      );
    }
  };

  attachForm.call(pjax, form);

  form.action =
    window.location.protocol + "//" + window.location.host + "/internal";

  trigger(form, "submit");
  // see loadUrl defined above

  t.end();
});

tape("test submit control formaction attribute", function(t) {
  var form = document.createElement("form");
  form.setAttribute("method", "get");
  form.setAttribute("action", "/form-action");

  var textInput = document.createElement("input");
  textInput.type = "text";
  textInput.name = "input";
  textInput.value = "value";
  form.appendChild(textInput);

  var buttonDefault = document.createElement("button");
  buttonDefault.type = "submit";
  form.appendChild(buttonDefault);

  var buttonOverride = document.createElement("button");
  buttonOverride.type = "submit";
  buttonOverride.setAttribute("formaction", "/button-override");
  form.appendChild(buttonOverride);

  var inputOverride = document.createElement("input");
  inputOverride.type = "submit";
  inputOverride.setAttribute("formaction", "/input-override");
  form.appendChild(inputOverride);

  var buttonEmpty = document.createElement("button");
  buttonEmpty.type = "submit";
  buttonEmpty.setAttribute("formaction", "");
  form.appendChild(buttonEmpty);

  var currentUrl = null;
  var currentOptions = null;
  var pjax = {
    options: {},
    loadUrl: function(href, options) {
      currentUrl = href;
      currentOptions = options;
    }
  };

  attachForm.call(pjax, form);

  var testSubmission = function(submitter, expectedUrl, message) {
    currentUrl = null;

    if (submitter === null) {
      trigger(form, "submit");
    } else {
      trigger(form, "submit", { submitter: submitter });
    }

    t.equal(currentUrl, expectedUrl, message);
  };

  var base = window.location.protocol + "//" + window.location.host;

  testSubmission(
    buttonOverride,
    base + "/button-override",
    "submit button formaction overrides the form action"
  );
  testSubmission(
    inputOverride,
    base + "/input-override",
    "submit input formaction overrides the form action"
  );
  testSubmission(
    buttonDefault,
    base + "/form-action",
    "submit button without formaction uses the form action"
  );
  testSubmission(
    buttonEmpty,
    base + "/form-action",
    "empty formaction falls back to the form action"
  );
  testSubmission(
    null,
    base + "/form-action",
    "submission without a submitter (Enter key) uses the form action"
  );

  t.same(
    currentOptions.requestOptions.requestParams,
    [{ name: "input", value: "value" }],
    "form fields are still parsed for the overridden URL"
  );

  t.end();
});

tape("test submit control formaction fallback to focused element", function(
  t
) {
  var form = document.createElement("form");
  form.setAttribute("method", "get");
  form.setAttribute("action", "/form-action");

  var buttonOverride = document.createElement("button");
  buttonOverride.type = "submit";
  buttonOverride.setAttribute("formaction", "/button-override");
  form.appendChild(buttonOverride);

  var currentUrl = null;
  var pjax = {
    options: {},
    loadUrl: function(href) {
      currentUrl = href;
    }
  };

  attachForm.call(pjax, form);

  var base = window.location.protocol + "//" + window.location.host;

  // event.submitter is unavailable in older browsers; the focused element
  // is used as a fallback
  buttonOverride.focus();
  trigger(form, "submit");
  t.equal(
    currentUrl,
    base + "/button-override",
    "formaction of the focused submit button is used"
  );

  // An element that is not a submit control must not be used as a submitter
  var textInput = document.createElement("input");
  textInput.type = "text";
  textInput.name = "input";
  textInput.value = "value";
  form.appendChild(textInput);

  textInput.focus();
  trigger(form, "submit");
  t.equal(
    currentUrl,
    base + "/form-action",
    "focused non-submit element does not provide a formaction"
  );

  t.end();
});

tape("test relative formaction is resolved against the page", function(t) {
  var form = document.createElement("form");
  form.setAttribute("method", "get");
  form.setAttribute("action", "/form-action");

  var button = document.createElement("button");
  button.type = "submit";
  button.setAttribute("formaction", "relative-override");
  form.appendChild(button);

  var currentUrl = null;
  var pjax = {
    options: {},
    loadUrl: function(href) {
      currentUrl = href;
    }
  };

  attachForm.call(pjax, form);

  trigger(form, "submit", { submitter: button });
  t.equal(
    currentUrl,
    window.location.protocol +
      "//" +
      window.location.host +
      "/relative-override",
    "relative formaction is resolved like any other link"
  );

  t.end();
});

tape("test form without action attribute with formaction submit control", function(
  t
) {
  var form = document.createElement("form");
  form.setAttribute("method", "get");

  var buttonOverride = document.createElement("button");
  buttonOverride.type = "submit";
  buttonOverride.setAttribute("formaction", "/button-override");
  form.appendChild(buttonOverride);

  var buttonDefault = document.createElement("button");
  buttonDefault.type = "submit";
  form.appendChild(buttonDefault);

  var currentUrl = null;
  var pjax = {
    options: {},
    loadUrl: function(href) {
      currentUrl = href;
    }
  };

  attachForm.call(pjax, form);

  var base = window.location.protocol + "//" + window.location.host;

  trigger(form, "submit", { submitter: buttonOverride });
  t.equal(
    currentUrl,
    base + "/button-override",
    "formaction is honored on a form without an action attribute"
  );

  trigger(form, "submit", { submitter: buttonDefault });
  t.equal(
    currentUrl,
    window.location.href,
    "form without an action attribute keeps today's behavior"
  );

  t.end();
});

tape("test URL requested for a GET form with formaction submit control", function(
  t
) {
  t.plan(1);

  var sendRequest = require("../../../lib/send-request");

  var form = document.createElement("form");
  form.setAttribute("method", "get");
  form.setAttribute("action", "/form-action");

  var input = document.createElement("input");
  input.type = "text";
  input.name = "input";
  input.value = "value";
  form.appendChild(input);

  var button = document.createElement("button");
  button.type = "submit";
  button.setAttribute("formaction", "/button-override");
  form.appendChild(button);

  var requestedUrls = [];
  var nativeOpen = XMLHttpRequest.prototype.open;
  var nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    requestedUrls.push(url);
    return nativeOpen.apply(this, arguments);
  };
  // Don't hit the network; the requested URL is recorded in open()
  XMLHttpRequest.prototype.send = function() {};

  attachForm.call(
    {
      options: {},
      loadUrl: function(href, options) {
        sendRequest(href, options, function() {});
      }
    },
    form
  );

  trigger(form, "submit", { submitter: button });

  XMLHttpRequest.prototype.open = nativeOpen;
  XMLHttpRequest.prototype.send = nativeSend;

  t.same(
    requestedUrls,
    [
      window.location.protocol +
        "//" +
        window.location.host +
        "/button-override?input=value"
    ],
    "the formaction URL is requested, with the form fields as query parameters"
  );

  t.end();
});
