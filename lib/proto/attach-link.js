var on = require("../events/on");
var clone = require("../util/clone");
var trackElementListener = require("../track-element-listener");

var attrState = "data-pjax-state";

var linkAction = function(el, event) {
  if (isDefaultPrevented(event)) {
    return;
  }

  // Since loadUrl modifies options and we may add our own modifications below,
  // clone it so the changes don't persist
  var options = clone(this.options);

  var attrValue = checkIfShouldAbort(el, event);
  if (attrValue) {
    el.setAttribute(attrState, attrValue);
    return;
  }

  event.preventDefault();

  // don’t do "nothing" if user try to reload the page by clicking the same link twice
  if (
    this.options.currentUrlFullReload &&
    el.href === window.location.href.split("#")[0]
  ) {
    el.setAttribute(attrState, "reload");
    this.reload();
    return;
  }

  el.setAttribute(attrState, "load");

  options.triggerElement = el;
  this.loadUrl(el.href, options);
};

function checkIfShouldAbort(el, event) {
  // Don’t break browser special behavior on links (like page in new window)
  if (
    event.which > 1 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return "modifier";
  }

  // we do test on href now to prevent unexpected behavior if for some reason
  // user have href that can be dynamically updated

  // Ignore external links.
  if (
    el.protocol !== window.location.protocol ||
    el.host !== window.location.host
  ) {
    return "external";
  }

  // Ignore anchors on the same page (keep native behavior)
  if (
    el.hash &&
    el.href.replace(el.hash, "") ===
      window.location.href.replace(location.hash, "")
  ) {
    return "anchor";
  }

  // Ignore empty anchor "foo.html#"
  if (el.href === window.location.href.split("#")[0] + "#") {
    return "anchor-empty";
  }
}

var isDefaultPrevented = function(event) {
  return event.defaultPrevented || event.returnValue === false;
};

module.exports = function(el) {
  var that = this;

  // Once this instance has been destroyed, stop hooking elements,
  // so the default link behavior is restored for good
  if (this.destroyed) {
    return;
  }

  el.setAttribute(attrState, "");

  var clickListener = function(event) {
    linkAction.call(that, el, event);
  };

  on(el, "click", clickListener);
  trackElementListener(this, el, "click", clickListener);

  var keyupListener = function(event) {
    if (event.keyCode === 13) {
      linkAction.call(that, el, event);
    }
  };

  on(el, "keyup", keyupListener);
  trackElementListener(this, el, "keyup", keyupListener);
};
