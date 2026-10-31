/* TEMPORARY diagnostic - remove before final. Reports input-blocking state. */
(function () {
  "use strict";
  var div = document.createElement("div");
  div.id = "diagBox";
  div.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(0,0,0,.85);color:#0f0;font:11px monospace;padding:8px;max-width:46em;white-space:pre-wrap;pointer-events:none;";
  div.textContent = "diag: starting...";
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(div); });
  if (document.body) document.body.appendChild(div);

  var lastErr = "none";
  window.addEventListener("error", function (e) {
    lastErr = "window.onerror: " + (e.message || e.type) + " @ " + (e.filename || "") + ":" + (e.lineno || "");
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    lastErr = "unhandledrejection: " + (r && r.message ? r.message : String(r));
  });

  function elDesc(el) {
    if (!el) return "null";
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    if (el.className && typeof el.className === "string") s += "." + el.className.trim().split(/\s+/).join(".");
    return s;
  }

  // Track whether real user-intent clicks reach the document at all.
  var clicksSeen = 0;
  document.addEventListener("pointerdown", function () { clicksSeen++; }, true);
  document.addEventListener("click", function () { clicksSeen++; }, true);

  setInterval(function () {
    try {
      var loading = document.getElementById("loading");
      var cx = Math.floor(window.innerWidth / 2), cy = Math.floor(window.innerHeight / 2);
      var top = document.elementFromPoint(cx, cy);
      var hits = document.querySelectorAll(".pxHit").length;
      var design = document.querySelector(".designIface");
      var lines = [
        "t=" + Math.floor(performance.now() / 1000) + "s",
        "loading.hidden=" + (loading && loading.hidden) + " opacity=" + (loading && loading.style.opacity),
        "center(" + cx + "," + cy + ") top=" + elDesc(top),
        ".pxHit count=" + hits,
        "designIface visible=" + (!!design && !design.hidden),
        "pointer/click events seen=" + clicksSeen,
        "lastErr=" + lastErr,
        "__gameBooted=" + (!!window.__gameBooted)
      ];
      div.textContent = "DIAG\n" + lines.join("\n");
    } catch (e) { /* never break the game */ }
  }, 2000);
})();
