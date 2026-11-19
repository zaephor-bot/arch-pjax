var on = require("../events/on");
var clone = require("../util/clone");
var trackElementListener = require("../track-element-listener");

var attrState = "data-pjax-state";

function isSubmitControl(el) {
  var tagName = el.tagName.toLowerCase();
  var type = (el.getAttribute("type") || "").toLowerCase();

  if (tagName === "button") {
    return type === "" || type === "submit";
  }

  if (tagName === "input") {
    return type === "submit" || type === "image";
  }

  return false;
}

// Returns the formaction of the submit control that triggered the submission,
// or null if there is none to apply
function getSubmitterFormAction(el, event) {
  var submitter = event.submitter;

  // event.submitter is unavailable in some browsers and when the form is
  // submitted implicitly (eg. pressing Enter in a text field), so fall back
  // to the focused element
  if (!submitter) {
    var activeElement = document.activeElement;

    if (
      activeElement &&
      isSubmitControl(activeElement) &&
      el.contains(activeElement)
    ) {
      submitter = activeElement;
    }
  }

  if (!submitter) {
    return null;
  }

  // Read the attribute instead of the formAction property, since the
  // property resolves to the current page URL when the attribute is missing
  var formaction = submitter.getAttribute("formaction");

  return formaction ? formaction : null;
}

var formAction = function(el, event) {
  if (isDefaultPrevented(event)) {
    return;
  }

  // Since loadUrl modifies options and we may add our own modifications below,
  // clone it so the changes don't persist
  var options = clone(this.options);

  // Initialize requestOptions
  options.requestOptions = {
    // A non-empty formaction on the clicked submit control overrides the
    // form's own action
    requestUrl:
      getSubmitterFormAction(el, event) ||
      el.getAttribute("action") ||
      window.location.href,
    requestMethod: el.getAttribute("method") || "GET"
  };

  // create a testable virtual link of the form action
  var virtLinkElement = document.createElement("a");
  virtLinkElement.setAttribute("href", options.requestOptions.requestUrl);

  var attrValue = checkIfShouldAbort(virtLinkElement, options);
  if (attrValue) {
    el.setAttribute(attrState, attrValue);
    return;
  }

  event.preventDefault();

  if (el.enctype === "multipart/form-data") {
    options.requestOptions.formData = new FormData(el);
  } else {
    options.requestOptions.requestParams = parseFormElements(el);
  }

  el.setAttribute(attrState, "submit");

  options.triggerElement = el;
  this.loadUrl(virtLinkElement.href, options);
};

function parseFormElements(el) {
  var requestParams = [];
  var formElements = el.elements;

  for (var i = 0; i < formElements.length; i++) {
    var element = formElements[i];
    var tagName = element.tagName.toLowerCase();
    // jscs:disable disallowImplicitTypeConversion
    if (
      !!element.name &&
      element.attributes !== undefined &&
      tagName !== "button"
    ) {
      // jscs:enable disallowImplicitTypeConversion
      var type = element.attributes.type;

      if (
        !type ||
        (type.value !== "checkbox" && type.value !== "radio") ||
        element.checked
      ) {
        // Build array of values to submit
        var values = [];

        if (tagName === "select") {
          var opt;

          for (var j = 0; j < element.options.length; j++) {
            opt = element.options[j];
            if (opt.selected && !opt.disabled) {
              values.push(opt.hasAttribute("value") ? opt.value : opt.text);
            }
          }
        } else {
          values.push(element.value);
        }

        for (var k = 0; k < values.length; k++) {
          requestParams.push({
            name: encodeURIComponent(element.name),
            value: encodeURIComponent(values[k])
          });
        }
      }
    }
  }

  return requestParams;
}

function checkIfShouldAbort(virtLinkElement, options) {
  // Ignore external links.
  if (
    virtLinkElement.protocol !== window.location.protocol ||
    virtLinkElement.host !== window.location.host
  ) {
    return "external";
  }

  // Ignore click if we are on an anchor on the same page
  if (
    virtLinkElement.hash &&
    virtLinkElement.href.replace(virtLinkElement.hash, "") ===
      window.location.href.replace(location.hash, "")
  ) {
    return "anchor";
  }

  // Ignore empty anchor "foo.html#"
  if (virtLinkElement.href === window.location.href.split("#")[0] + "#") {
    return "anchor-empty";
  }

  // if declared as a full reload, just normally submit the form
  if (
    options.currentUrlFullReload &&
    virtLinkElement.href === window.location.href.split("#")[0]
  ) {
    return "reload";
  }
}

var isDefaultPrevented = function(event) {
  return event.defaultPrevented || event.returnValue === false;
};

module.exports = function(el) {
  var that = this;

  // Once this instance has been destroyed, stop hooking elements,
  // so the default form behavior is restored for good
  if (this.destroyed) {
    return;
  }

  el.setAttribute(attrState, "");

  var submitListener = function(event) {
    formAction.call(that, el, event);
  };

  on(el, "submit", submitListener);
  trackElementListener(this, el, "submit", submitListener);
};
