var installHistoryReconciliation = require("../handle-popstate");

module.exports = function() {
  // Install the popstate reconciliation listener (lib/handle-popstate.js).
  //
  // It has to be registered before Pjax’s own popstate listener so that
  // history entries without a pjax uid are reconciled before that listener
  // can misread them. The constructor calls this.log() right before it
  // registers its own listener, which makes this the install point — index.js
  // itself is out of scope for this change. Installing is idempotent, so the
  // log calls made while loading content are harmless.
  installHistoryReconciliation(this);

  if (this.options.debug && console) {
    if (typeof console.log === "function") {
      console.log.apply(console, arguments);
    }
    // IE is weird
    else if (console.log) {
      console.log(arguments);
    }
  }
};
