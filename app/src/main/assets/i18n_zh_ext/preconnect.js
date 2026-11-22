(function (rootScope) {
  "use strict";

  if (rootScope.__AG_PRECONNECT_INJECTED__) {
    return;
  }
  rootScope.__AG_PRECONNECT_INJECTED__ = true;

  const PRECONNECT_TARGETS = [
    { href: "https://antigravity.static.usercontent.goog", crossOrigin: null },
    { href: "https://www.gstatic.com", crossOrigin: null },
    { href: "https://fonts.googleapis.com", crossOrigin: null },
    { href: "https://fonts.gstatic.com", crossOrigin: "anonymous" }
  ];

  function hasExistingHint(doc, parent, rel, href) {
    try {
      if (typeof doc.querySelectorAll === "function") {
        const matched = doc.querySelectorAll('link[rel="' + rel + '"][href="' + href + '"]');
        if (matched && matched.length > 0) {
          return true;
        }
      }
    } catch (_err) {
      // Fallback to manual child traversal when selector matching is unsupported
    }

    const searchRoots = [doc.head, doc.documentElement, parent].filter(Boolean);
    for (let i = 0; i < searchRoots.length; i++) {
      const container = searchRoots[i];
      const children = container && container.childNodes ? container.childNodes : [];
      for (let j = 0; j < children.length; j++) {
        const node = children[j];
        if (!node || node.nodeType !== 1) {
          continue;
        }
        const tag = String(node.tagName || node.nodeName || "").toUpperCase();
        if (tag !== "LINK") {
          continue;
        }
        const nodeRel = typeof node.getAttribute === "function" ? node.getAttribute("rel") : node.rel;
        const nodeHref = typeof node.getAttribute === "function" ? node.getAttribute("href") : node.href;
        if (String(nodeRel || "").toLowerCase() === rel && String(nodeHref || "") === href) {
          return true;
        }
      }
    }
    return false;
  }

  function appendHint(doc, parent, rel, target) {
    if (hasExistingHint(doc, parent, rel, target.href)) {
      return;
    }
    const link = doc.createElement("link");
    if (!link) {
      return;
    }
    if (typeof link.setAttribute === "function") {
      link.setAttribute("rel", rel);
      link.setAttribute("href", target.href);
      if (target.crossOrigin && rel === "preconnect") {
        link.setAttribute("crossorigin", target.crossOrigin);
      }
    } else {
      link.rel = rel;
      link.href = target.href;
      if (target.crossOrigin && rel === "preconnect") {
        link.crossOrigin = target.crossOrigin;
      }
    }
    parent.appendChild(link);
  }

  function injectHints() {
    const doc = rootScope.document || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.createElement !== "function") {
      return false;
    }
    const parent = doc.head || doc.documentElement;
    if (!parent || typeof parent.appendChild !== "function") {
      return false;
    }
    for (let i = 0; i < PRECONNECT_TARGETS.length; i++) {
      const target = PRECONNECT_TARGETS[i];
      appendHint(doc, parent, "preconnect", target);
      appendHint(doc, parent, "dns-prefetch", target);
    }
    return true;
  }

  if (!injectHints()) {
    const doc = rootScope.document || (typeof document !== "undefined" ? document : null);
    if (doc && typeof doc.addEventListener === "function") {
      doc.addEventListener("DOMContentLoaded", injectHints, { once: true });
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
