// Keep a reference to a listener attached to an element by a Pjax instance,
// so destroy() is able to remove exactly the listeners Pjax attached,
// without touching listeners attached by other code.
module.exports = function(pjax, el, event, listener) {
  // The registry is created lazily, since the attach methods can be called
  // with a partial instance (see unit tests)
  if (!pjax.elementListeners) {
    pjax.elementListeners = [];
  }

  pjax.elementListeners.push({
    el: el,
    event: event,
    listener: listener
  });
};
