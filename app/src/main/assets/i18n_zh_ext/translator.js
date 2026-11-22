(function (rootScope) {
  "use strict";

  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const DOCUMENT_NODE = 9;
  const DOCUMENT_FRAGMENT_NODE = 11;

  const TRANSLATABLE_ATTRS = ["placeholder", "aria-label", "title"];

  const FORBIDDEN_ATTR_TAGS = new Set([
    "PRE",
    "CODE",
    "KBD",
    "SAMP",
    "VAR",
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "SVG",
    "MATH",
    "CANVAS"
  ]);

  const FORBIDDEN_TEXT_TAGS = new Set([
    "PRE",
    "CODE",
    "KBD",
    "SAMP",
    "VAR",
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "SVG",
    "MATH",
    "CANVAS",
    "TEXTAREA",
    "INPUT",
    "SELECT"
  ]);

  const FORBIDDEN_EDITOR_CLASSES = [
    "monaco-editor",
    "cm-editor",
    "CodeMirror"
  ];

  const FORBIDDEN_ICON_EXACT_CLASSES = new Set([
    "material-icons",
    "material-icons-outlined",
    "material-icons-round",
    "material-icons-sharp",
    "material-icons-two-tone",
    "material-symbols",
    "material-symbols-outlined",
    "material-symbols-rounded",
    "material-symbols-sharp",
    "google-material-icons",
    "google-symbols",
    "codicon",
    "fa",
    "fas",
    "far",
    "fab",
    "lucide",
    "mdi",
    "bi"
  ]);

  const FORBIDDEN_ICON_PREFIXES = [
    "material-icons-",
    "material-symbols-",
    "google-material-icons-",
    "google-symbols-",
    "codicon-",
    "ri-"
  ];

  const ICON_FONT_FAMILY_REGEX =
    /material\s*(?:icons|symbols)|google\s*symbols|codicon|font\s*awesome|icomoon|ionicons|lucide/i;

  const LIGATURE_TOKEN_REGEX = /^[a-z0-9_]+$/;
  const iconFontCache = new WeakMap();

  const INTERACTIVE_TAGS = new Set([
    "BUTTON",
    "A",
    "LABEL",
    "SUMMARY",
    "TH",
    "LEGEND",
    "FIGCAPTION"
  ]);

  const INTERACTIVE_ROLES = new Set([
    "button",
    "tab",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "switch",
    "checkbox",
    "radio",
    "link",
    "treeitem"
  ]);

  const PROSE_CONTAINER_CLASSES = [
    "prose",
    "markdown",
    "markdown-body",
    "message-body",
    "message-content",
    "chat-message",
    "assistant-message",
    "user-message",
    "ai-response",
    "response-content"
  ];

  const PROSE_BLOCK_TAGS = new Set([
    "ARTICLE",
    "BLOCKQUOTE",
    "P",
    "LI",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6"
  ]);

  const HARD_PROSE_BODY_TAGS = new Set(["ARTICLE", "BLOCKQUOTE", "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6"]);
  const INLINE_TAGS = new Set(["STRONG", "B", "EM", "I", "U", "S", "MARK", "SMALL", "SPAN", "SUB", "SUP", "FONT"]);

  function resolveDefaultDict() {
    if (rootScope && rootScope.AG_I18N_DICT) {
      return rootScope.AG_I18N_DICT;
    }
    if (typeof require === "function") {
      try {
        return require("./dict_zh.js");
      } catch (_err) {
        return null;
      }
    }
    return null;
  }

  function getTagName(node) {
    if (!node || node.nodeType !== ELEMENT_NODE) {
      return "";
    }
    return String(node.tagName || node.nodeName || "").toUpperCase();
  }

  function getParentElement(node) {
    if (!node) {
      return null;
    }
    if (node.parentElement && node.parentElement.nodeType === ELEMENT_NODE) {
      return node.parentElement;
    }
    const parent = node.parentNode;
    return parent && parent.nodeType === ELEMENT_NODE ? parent : null;
  }

  function getAttr(el, name) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return null;
    }
    if (typeof el.getAttribute === "function") {
      const val = el.getAttribute(name);
      return val === undefined ? null : val;
    }
    if (el.attributes && Object.prototype.hasOwnProperty.call(el.attributes, name)) {
      const val = el.attributes[name];
      return val === undefined || val === null ? null : String(val);
    }
    return null;
  }

  function setAttr(el, name, value) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return;
    }
    if (typeof el.setAttribute === "function") {
      el.setAttribute(name, value);
      return;
    }
    if (!el.attributes) {
      el.attributes = Object.create(null);
    }
    el.attributes[name] = String(value);
  }

  function hasAttr(el, name) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return false;
    }
    if (typeof el.hasAttribute === "function") {
      return el.hasAttribute(name);
    }
    return getAttr(el, name) !== null;
  }

  function getClassTokens(el) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return [];
    }
    if (el.classList && typeof el.classList.length === "number") {
      const tokens = [];
      for (let i = 0; i < el.classList.length; i++) {
        tokens.push(String(el.classList[i]));
      }
      return tokens;
    }
    const rawClass = getAttr(el, "class") || el.className || "";
    if (!rawClass || typeof rawClass !== "string") {
      return [];
    }
    return rawClass.trim().split(/\s+/).filter(Boolean);
  }

  function hasClass(el, className) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return false;
    }
    if (el.classList && typeof el.classList.contains === "function") {
      return el.classList.contains(className);
    }
    const tokens = getClassTokens(el);
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === className) {
        return true;
      }
    }
    return false;
  }

  function isIconFontByComputedStyle(el) {
    if (!el || el.nodeType !== ELEMENT_NODE || typeof getComputedStyle !== "function") {
      return false;
    }
    if (iconFontCache.has(el)) {
      return iconFontCache.get(el);
    }
    let matched = false;
    try {
      const style = getComputedStyle(el);
      const fontFamily = style && style.fontFamily ? String(style.fontFamily) : "";
      matched = ICON_FONT_FAMILY_REGEX.test(fontFamily);
    } catch (_err) {
      matched = false;
    }
    iconFontCache.set(el, matched);
    return matched;
  }

  function isIconElement(el, textNode) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return false;
    }
    const tokens = getClassTokens(el);
    for (let i = 0; i < tokens.length; i++) {
      const lower = tokens[i].toLowerCase();
      if (FORBIDDEN_ICON_EXACT_CLASSES.has(lower)) {
        return true;
      }
      for (let j = 0; j < FORBIDDEN_ICON_PREFIXES.length; j++) {
        if (lower.startsWith(FORBIDDEN_ICON_PREFIXES[j])) {
          return true;
        }
      }
    }

    const tag = getTagName(el);
    if ((tag === "SPAN" || tag === "I") && getAttr(el, "aria-hidden") === "true") {
      const rawText = textNode && typeof textNode.nodeValue === "string"
        ? textNode.nodeValue.trim()
        : "";
      if (rawText && LIGATURE_TOKEN_REGEX.test(rawText)) {
        return true;
      }
    }

    return isIconFontByComputedStyle(el);
  }

  function hasCommonForbiddenFlags(el) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return false;
    }
    if (hasAttr(el, "data-no-translate")) {
      const noTrans = getAttr(el, "data-no-translate");
      if (noTrans === null || String(noTrans).toLowerCase() !== "false") {
        return true;
      }
    }
    const translateAttr = getAttr(el, "translate");
    if (translateAttr !== null && String(translateAttr).trim().toLowerCase() === "no") {
      return true;
    }
    if (hasAttr(el, "contenteditable")) {
      const ce = String(getAttr(el, "contenteditable") || "").trim().toLowerCase();
      if (ce === "" || ce === "true" || ce === "plaintext-only") {
        return true;
      }
    }
    for (let i = 0; i < FORBIDDEN_EDITOR_CLASSES.length; i++) {
      if (hasClass(el, FORBIDDEN_EDITOR_CLASSES[i])) {
        return true;
      }
    }
    return false;
  }

  function isForbiddenElementForAttributes(el) {
    let cur = el;
    while (cur && cur.nodeType === ELEMENT_NODE) {
      if (FORBIDDEN_ATTR_TAGS.has(getTagName(cur)) || hasCommonForbiddenFlags(cur)) {
        return true;
      }
      cur = getParentElement(cur);
    }
    return false;
  }

  function isForbiddenElementForText(el) {
    let cur = el;
    while (cur && cur.nodeType === ELEMENT_NODE) {
      if (
        FORBIDDEN_TEXT_TAGS.has(getTagName(cur)) ||
        hasCommonForbiddenFlags(cur) ||
        isIconElement(cur, null)
      ) {
        return true;
      }
      cur = getParentElement(cur);
    }
    return false;
  }

  function isInteractiveElement(el) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return false;
    }
    if (INTERACTIVE_TAGS.has(getTagName(el))) {
      return true;
    }
    const role = getAttr(el, "role");
    if (role) {
      const normRole = String(role).trim().toLowerCase();
      if (INTERACTIVE_ROLES.has(normRole)) {
        return true;
      }
    }
    return false;
  }

  function isProseContainer(el) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return false;
    }
    const tag = getTagName(el);
    if (tag === "ARTICLE" || tag === "BLOCKQUOTE") {
      return true;
    }
    if (hasAttr(el, "data-message-author-role")) {
      return true;
    }
    const testId = getAttr(el, "data-testid");
    if (testId === "message-content" || testId === "message-body") {
      return true;
    }
    for (let i = 0; i < PROSE_CONTAINER_CLASSES.length; i++) {
      if (hasClass(el, PROSE_CONTAINER_CLASSES[i])) {
        return true;
      }
    }
    return false;
  }

  function isMarkdownBodyClass(el) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return false;
    }
    const tag = getTagName(el);
    if (tag === "ARTICLE" || tag === "BLOCKQUOTE") {
      return true;
    }
    return (
      hasClass(el, "prose") ||
      hasClass(el, "markdown") ||
      hasClass(el, "markdown-body") ||
      hasClass(el, "ai-response") ||
      hasClass(el, "response-content")
    );
  }

  function collectTextLength(node, limit) {
    if (!node) {
      return 0;
    }
    if (node.nodeType === TEXT_NODE) {
      const val = String(node.nodeValue || "").trim();
      return val.length;
    }
    if (node.nodeType !== ELEMENT_NODE) {
      return 0;
    }
    let total = 0;
    const children = node.childNodes || [];
    for (let i = 0; i < children.length; i++) {
      total += collectTextLength(children[i], limit - total);
      if (total > limit) {
        return total;
      }
    }
    return total;
  }

  function hasInlineSentenceContext(textNode, normalizedLength) {
    let cur = getParentElement(textNode);
    while (cur && INLINE_TAGS.has(getTagName(cur))) {
      // If this inline tag itself has other sibling text nodes/elements inside it, check its length
      if (collectTextLength(cur, normalizedLength + 8) > normalizedLength + 4) {
        return true;
      }
      const parent = getParentElement(cur);
      if (!parent) {
        return false;
      }
      if (HARD_PROSE_BODY_TAGS.has(getTagName(parent))) {
        return collectTextLength(parent, normalizedLength + 8) > normalizedLength + 4;
      }
      // Check if parent container mixes direct non-trivial prose text around this inline element
      const siblings = parent.childNodes || [];
      for (let i = 0; i < siblings.length; i++) {
        const sib = siblings[i];
        if (sib && sib !== cur && sib.nodeType === TEXT_NODE) {
          const sibText = String(sib.nodeValue || "").trim();
          if (sibText.length >= 2 && /[A-Za-z]/.test(sibText)) {
            return true;
          }
        }
      }
      cur = parent;
    }

    if (cur && HARD_PROSE_BODY_TAGS.has(getTagName(cur))) {
      return collectTextLength(cur, normalizedLength + 8) > normalizedLength + 4;
    }
    return false;
  }

  function looksLikeCode(text) {
    if (!text) {
      return false;
    }
    if (/[{}]|\=\>|<\/|;\s*$|`/.test(text)) {
      return true;
    }
    if (/\b(?:const|let|var|function|return|import|export|async|await|class|interface)\s+[A-Za-z_$]/.test(text)) {
      return true;
    }
    if (/\b[a-zA-Z_]\w*\([^)]*\)\s*[{;]/.test(text)) {
      return true;
    }
    return false;
  }

  function hasMultipleSentences(text) {
    if (!text) {
      return false;
    }
    return /(\.\.\.|[^.][.!?])\s+[A-Za-z0-9"'(]/.test(text);
  }

  function isPunctuationOrNumberOnly(text) {
    return /^[\d\s.,:;!?+\-*/=<>()[\]{}|\\/_~@#$%^&`"'·•—–]+$/.test(text);
  }

  /**
   * Walk ancestors once to determine whether the text node lives in a forbidden subtree,
   * an interactive UI control, a markdown/prose container, or neutral UI chrome.
   */
  function inspectTextAncestors(textNode) {
    let cur = getParentElement(textNode);
    let nearestZone = null;
    let nearestProseBlock = null;
    let inMarkdownBody = false;

    while (cur && cur.nodeType === ELEMENT_NODE) {
      const tag = getTagName(cur);
      if (
        FORBIDDEN_TEXT_TAGS.has(tag) ||
        hasCommonForbiddenFlags(cur) ||
        isIconElement(cur, textNode)
      ) {
        return { forbidden: true, zone: "forbidden", proseBlock: null, inMarkdownBody: false };
      }

      if (!nearestZone) {
        if (isInteractiveElement(cur)) {
          nearestZone = "interactive";
        } else if (isProseContainer(cur)) {
          nearestZone = "prose-container";
          if (isMarkdownBodyClass(cur)) {
            inMarkdownBody = true;
          }
          if (!nearestProseBlock) {
            nearestProseBlock = cur;
          }
        } else if (PROSE_BLOCK_TAGS.has(tag)) {
          nearestZone = "prose-tag";
          nearestProseBlock = cur;
        }
      } else if (nearestZone === "prose-tag" && isProseContainer(cur)) {
        nearestZone = "prose-container";
        if (isMarkdownBodyClass(cur)) {
          inMarkdownBody = true;
        }
      } else if (nearestZone === "prose-container" && !inMarkdownBody && isMarkdownBodyClass(cur)) {
        inMarkdownBody = true;
      }

      cur = getParentElement(cur);
    }

    return {
      forbidden: false,
      zone: nearestZone || "chrome",
      proseBlock: nearestProseBlock,
      inMarkdownBody,
      textNode
    };
  }

  function splitWhitespace(raw) {
    const match = String(raw).match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!match) {
      return { leading: "", core: "", normalized: "", trailing: "" };
    }
    const leading = match[1];
    const core = match[2];
    const trailing = match[3];
    const normalized = core.replace(/\s+/g, " ");
    return { leading, core, normalized, trailing };
  }

  function getWalkRoot(root) {
    if (!root) {
      return null;
    }
    if (root.nodeType === DOCUMENT_NODE) {
      return root.body || root.documentElement || root;
    }
    return root;
  }

  function createTranslator(options) {
    const opts = options || {};
    const dict = opts.dict || resolveDefaultDict();
    if (!dict || typeof dict.lookupExact !== "function" || typeof dict.lookupRegex !== "function") {
      throw new Error("AG_I18N_DICT is required by translator");
    }

    let enabled = opts.enabled !== false;
    let customDict = opts.customDict && typeof opts.customDict === "object" ? { ...opts.customDict } : {};
    let customLowerMap = dict.buildCustomLowerMap ? dict.buildCustomLowerMap(customDict) : null;

    const originalTextMap = new WeakMap();
    const appliedTextMap = new WeakMap();
    const originalAttrMap = new WeakMap();
    const appliedAttrMap = new WeakMap();

    const hasWeakRef = typeof WeakRef === "function";
    const trackedTextRefs = new Set();
    const trackedAttrRefs = new Set();

    function trackTextNode(node) {
      if (!hasWeakRef) {
        return;
      }
      if (!node.__agI18nTextRef) {
        const ref = new WeakRef(node);
        try {
          Object.defineProperty(node, "__agI18nTextRef", { value: ref, enumerable: false, configurable: true });
        } catch (_err) {
          // Ignore non-extensible mock nodes
        }
        trackedTextRefs.add(ref);
      } else {
        trackedTextRefs.add(node.__agI18nTextRef);
      }
    }

    function untrackTextNode(node) {
      if (hasWeakRef && node && node.__agI18nTextRef) {
        trackedTextRefs.delete(node.__agI18nTextRef);
      }
    }

    function trackAttrElement(el) {
      if (!hasWeakRef) {
        return;
      }
      if (!el.__agI18nAttrRef) {
        const ref = new WeakRef(el);
        try {
          Object.defineProperty(el, "__agI18nAttrRef", { value: ref, enumerable: false, configurable: true });
        } catch (_err) {
          // Ignore non-extensible mock nodes
        }
        trackedAttrRefs.add(ref);
      } else {
        trackedAttrRefs.add(el.__agI18nAttrRef);
      }
    }

    function untrackAttrElement(el) {
      if (hasWeakRef && el && el.__agI18nAttrRef) {
        trackedAttrRefs.delete(el.__agI18nAttrRef);
      }
    }

    function resolveCandidate(normalizedText, ancestorInfo) {
      if (!normalizedText || isPunctuationOrNumberOnly(normalizedText)) {
        return null;
      }

      const exactVal = dict.lookupExact(normalizedText, customDict, customLowerMap);
      let translated = null;
      let isExact = false;

      if (exactVal !== null && exactVal !== normalizedText) {
        translated = exactVal;
        isExact = true;
      } else {
        if (normalizedText.length > 120) {
          return null;
        }
        if (looksLikeCode(normalizedText) || hasMultipleSentences(normalizedText)) {
          return null;
        }
        const regexVal = dict.lookupRegex(normalizedText);
        if (regexVal !== null && regexVal !== normalizedText) {
          translated = regexVal;
        }
      }

      if (!translated) {
        return null;
      }

      if (ancestorInfo) {
        const { zone, proseBlock, inMarkdownBody } = ancestorInfo;
        if (zone === "forbidden") {
          return null;
        }
        if (zone === "prose-container" || zone === "prose-tag") {
          if (inMarkdownBody) {
            return null;
          }
          if (normalizedText.length > 60) {
            return null;
          }
          if (looksLikeCode(normalizedText) || hasMultipleSentences(normalizedText)) {
            return null;
          }
          if (proseBlock && zone === "prose-container" && HARD_PROSE_BODY_TAGS.has(getTagName(proseBlock))) {
            return null;
          }
          if (proseBlock && zone === "prose-tag") {
            const blockLen = collectTextLength(proseBlock, normalizedText.length + 12);
            if (blockLen > normalizedText.length + 4) {
              return null;
            }
          }
          if (hasInlineSentenceContext(ancestorInfo.textNode, normalizedText.length)) {
            return null;
          }
        } else if (zone === "chrome") {
          if (!isExact && (normalizedText.length > 120 || looksLikeCode(normalizedText) || hasMultipleSentences(normalizedText))) {
            return null;
          }
          if (hasInlineSentenceContext(ancestorInfo.textNode, normalizedText.length)) {
            return null;
          }
        }
      }

      return translated;
    }

    function translateTextNode(textNode) {
      if (!textNode || textNode.nodeType !== TEXT_NODE) {
        return false;
      }
      const currentRaw = textNode.nodeValue;
      if (typeof currentRaw !== "string" || !currentRaw) {
        return false;
      }

      const info = inspectTextAncestors(textNode);
      if (info.forbidden) {
        return false;
      }

      // Detect whether currentRaw was written by us or is fresh/updated page text.
      let sourceRaw;
      if (appliedTextMap.has(textNode) && appliedTextMap.get(textNode) === currentRaw) {
        sourceRaw = originalTextMap.get(textNode);
      } else {
        sourceRaw = currentRaw;
      }

      const { leading, normalized, trailing } = splitWhitespace(sourceRaw);
      const translatedCore = enabled ? resolveCandidate(normalized, info) : null;

      if (translatedCore && translatedCore !== normalized) {
        const nextRaw = leading + translatedCore + trailing;
        originalTextMap.set(textNode, sourceRaw);
        appliedTextMap.set(textNode, nextRaw);
        trackTextNode(textNode);
        if (currentRaw !== nextRaw) {
          textNode.nodeValue = nextRaw;
        }
        return true;
      }

      // Previously translated, but no longer matches (e.g. customDict removed or disabled)
      if (originalTextMap.has(textNode)) {
        const orig = originalTextMap.get(textNode);
        if (appliedTextMap.get(textNode) === currentRaw && currentRaw !== orig) {
          textNode.nodeValue = orig;
        }
        originalTextMap.delete(textNode);
        appliedTextMap.delete(textNode);
        untrackTextNode(textNode);
      }
      return false;
    }

    function translateElementAttributes(el) {
      if (!el || el.nodeType !== ELEMENT_NODE) {
        return 0;
      }
      if (isForbiddenElementForAttributes(el)) {
        return 0;
      }

      let activeAttrsCount = 0;
      let origMap = originalAttrMap.get(el);
      let appliedMap = appliedAttrMap.get(el);

      for (let i = 0; i < TRANSLATABLE_ATTRS.length; i++) {
        const attrName = TRANSLATABLE_ATTRS[i];
        const currentVal = getAttr(el, attrName);

        if (currentVal === null) {
          if (origMap) {
            origMap.delete(attrName);
          }
          if (appliedMap) {
            appliedMap.delete(attrName);
          }
          continue;
        }

        let sourceVal;
        if (appliedMap && appliedMap.has(attrName) && appliedMap.get(attrName) === currentVal) {
          sourceVal = origMap.get(attrName);
        } else {
          sourceVal = currentVal;
        }

        const { leading, normalized, trailing } = splitWhitespace(sourceVal);
        const translatedCore = enabled ? resolveCandidate(normalized, null) : null;

        if (translatedCore && translatedCore !== normalized) {
          if (!origMap) {
            origMap = new Map();
            originalAttrMap.set(el, origMap);
          }
          if (!appliedMap) {
            appliedMap = new Map();
            appliedAttrMap.set(el, appliedMap);
          }
          const nextVal = leading + translatedCore + trailing;
          origMap.set(attrName, sourceVal);
          appliedMap.set(attrName, nextVal);
          trackAttrElement(el);
          if (currentVal !== nextVal) {
            setAttr(el, attrName, nextVal);
          }
          activeAttrsCount++;
        } else if (origMap && origMap.has(attrName)) {
          const origVal = origMap.get(attrName);
          if (appliedMap && appliedMap.get(attrName) === currentVal && currentVal !== origVal) {
            setAttr(el, attrName, origVal);
          }
          origMap.delete(attrName);
          if (appliedMap) {
            appliedMap.delete(attrName);
          }
        }
      }

      if (origMap && origMap.size === 0) {
        originalAttrMap.delete(el);
        appliedAttrMap.delete(el);
        untrackAttrElement(el);
      }

      return activeAttrsCount;
    }

    function walkAndTranslate(node, stats) {
      if (!node) {
        return;
      }
      if (node.nodeType === TEXT_NODE) {
        if (translateTextNode(node)) {
          stats.textCount++;
          stats.translatedCount++;
        }
        return;
      }

      if (node.nodeType === ELEMENT_NODE) {
        if (isForbiddenElementForAttributes(node)) {
          return;
        }
        const attrTranslated = translateElementAttributes(node);
        if (attrTranslated > 0) {
          stats.attrCount += attrTranslated;
          stats.translatedCount += attrTranslated;
        }
        if (FORBIDDEN_TEXT_TAGS.has(getTagName(node))) {
          return;
        }
        if (node.shadowRoot) {
          walkAndTranslate(node.shadowRoot, stats);
        }
      }

      if (
        node.nodeType === ELEMENT_NODE ||
        node.nodeType === DOCUMENT_NODE ||
        node.nodeType === DOCUMENT_FRAGMENT_NODE
      ) {
        const children = node.childNodes || [];
        for (let i = 0; i < children.length; i++) {
          walkAndTranslate(children[i], stats);
        }
      }
    }

    function walkAndRestore(node, stats) {
      if (!node) {
        return;
      }
      if (node.nodeType === TEXT_NODE) {
        if (originalTextMap.has(node)) {
          const orig = originalTextMap.get(node);
          const applied = appliedTextMap.get(node);
          if (node.nodeValue === applied && node.nodeValue !== orig) {
            node.nodeValue = orig;
            stats.restoredCount++;
          }
          originalTextMap.delete(node);
          appliedTextMap.delete(node);
          untrackTextNode(node);
        }
        return;
      }

      if (node.nodeType === ELEMENT_NODE) {
        const origMap = originalAttrMap.get(node);
        const appliedMap = appliedAttrMap.get(node);
        if (origMap) {
          origMap.forEach((origVal, attrName) => {
            const curVal = getAttr(node, attrName);
            if (appliedMap && curVal === appliedMap.get(attrName) && curVal !== origVal) {
              setAttr(node, attrName, origVal);
              stats.restoredCount++;
            }
          });
          originalAttrMap.delete(node);
          appliedAttrMap.delete(node);
          untrackAttrElement(node);
        }
        if (node.shadowRoot) {
          walkAndRestore(node.shadowRoot, stats);
        }
      }

      if (
        node.nodeType === ELEMENT_NODE ||
        node.nodeType === DOCUMENT_NODE ||
        node.nodeType === DOCUMENT_FRAGMENT_NODE
      ) {
        const children = node.childNodes || [];
        for (let i = 0; i < children.length; i++) {
          walkAndRestore(children[i], stats);
        }
      }
    }

    function translateTree(rootNode) {
      const start = getWalkRoot(rootNode);
      const stats = { translatedCount: 0, textCount: 0, attrCount: 0 };
      if (!start) {
        return stats;
      }
      if (!enabled) {
        restoreTree(start);
        return stats;
      }
      walkAndTranslate(start, stats);
      return stats;
    }

    function restoreTree(rootNode) {
      const start = getWalkRoot(rootNode);
      const stats = { restoredCount: 0 };
      if (!start) {
        return stats;
      }
      walkAndRestore(start, stats);
      return stats;
    }

    function getActiveTranslatedCount() {
      if (!enabled) {
        return 0;
      }
      if (!hasWeakRef) {
        return 0;
      }
      let total = 0;
      trackedTextRefs.forEach((ref) => {
        const node = ref.deref();
        if (!node || node.isConnected === false || !appliedTextMap.has(node)) {
          trackedTextRefs.delete(ref);
          return;
        }
        if (node.nodeValue === appliedTextMap.get(node)) {
          total++;
        }
      });
      trackedAttrRefs.forEach((ref) => {
        const el = ref.deref();
        if (!el || el.isConnected === false || !appliedAttrMap.has(el)) {
          trackedAttrRefs.delete(ref);
          return;
        }
        const appliedMap = appliedAttrMap.get(el);
        appliedMap.forEach((appliedVal, attrName) => {
          if (getAttr(el, attrName) === appliedVal) {
            total++;
          }
        });
      });
      return total;
    }

    function setCustomDict(nextCustomDict) {
      customDict = nextCustomDict && typeof nextCustomDict === "object" ? { ...nextCustomDict } : {};
      customLowerMap = dict.buildCustomLowerMap ? dict.buildCustomLowerMap(customDict) : null;
    }

    function setEnabled(nextEnabled) {
      enabled = nextEnabled !== false;
    }

    function setConfig(nextConfig) {
      if (!nextConfig || typeof nextConfig !== "object") {
        return;
      }
      if ("enabled" in nextConfig) {
        setEnabled(nextConfig.enabled);
      }
      if ("customDict" in nextConfig) {
        setCustomDict(nextConfig.customDict);
      }
    }

    function getConfig() {
      return {
        enabled,
        customDict: { ...customDict }
      };
    }

    function isTrackedAppliedText(textNode) {
      return Boolean(
        textNode &&
        appliedTextMap.has(textNode) &&
        textNode.nodeValue === appliedTextMap.get(textNode)
      );
    }

    function isTrackedAppliedAttr(el, attrName) {
      if (!el || !attrName || !appliedAttrMap.has(el)) {
        return false;
      }
      const map = appliedAttrMap.get(el);
      return map.has(attrName) && getAttr(el, attrName) === map.get(attrName);
    }

    return {
      translateTree,
      restoreTree,
      translateTextNode,
      translateElementAttributes,
      setCustomDict,
      setEnabled,
      setConfig,
      getConfig,
      getActiveTranslatedCount,
      isTrackedAppliedText,
      isTrackedAppliedAttr
    };
  }

  /**
   * Throttled MutationObserver controller (~80ms batching + rAF alignment when available)
   * so rapid token streaming never starves or thrashes the DOM.
   */
  function createObserverController(options) {
    const opts = options || {};
    const translator = opts.translator;
    const rootNode = opts.root;
    const debounceMs = typeof opts.debounceMs === "number" && opts.debounceMs >= 0 ? opts.debounceMs : 80;
    const onTranslated = typeof opts.onTranslated === "function" ? opts.onTranslated : null;
    const ObserverCtor = opts.MutationObserver || (typeof MutationObserver !== "undefined" ? MutationObserver : null);

    let observer = null;
    let running = false;
    let timerId = null;
    let rafId = null;
    const dirtyTargets = new Set();

    function clearPending() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function flush() {
      clearPending();
      if (!running || !translator || dirtyTargets.size === 0) {
        dirtyTargets.clear();
        return;
      }
      const targets = Array.from(dirtyTargets);
      dirtyTargets.clear();

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (!target || target.isConnected === false) {
          continue;
        }
        if (target.nodeType === TEXT_NODE) {
          translator.translateTextNode(target);
        } else {
          translator.translateTree(target);
        }
      }

      if (onTranslated) {
        onTranslated({ translatedCount: translator.getActiveTranslatedCount() });
      }
    }

    function scheduleFlush() {
      if (timerId !== null || rafId !== null) {
        return;
      }
      timerId = setTimeout(() => {
        timerId = null;
        if (typeof requestAnimationFrame === "function") {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            flush();
          });
        } else {
          flush();
        }
      }, debounceMs);
    }

    function handleMutations(mutations) {
      if (!running || !mutations) {
        return;
      }
      let addedDirty = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (!m) {
          continue;
        }
        if (m.type === "childList" && m.addedNodes) {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const added = m.addedNodes[j];
            if (added && (added.nodeType === ELEMENT_NODE || added.nodeType === TEXT_NODE || added.nodeType === DOCUMENT_FRAGMENT_NODE)) {
              dirtyTargets.add(added);
              addedDirty = true;
            }
          }
        } else if (m.type === "characterData" && m.target) {
          if (!translator.isTrackedAppliedText(m.target)) {
            dirtyTargets.add(m.target);
            addedDirty = true;
          }
        } else if (m.type === "attributes" && m.target && m.attributeName) {
          if (!translator.isTrackedAppliedAttr(m.target, m.attributeName)) {
            dirtyTargets.add(m.target);
            addedDirty = true;
          }
        }
      }
      if (addedDirty) {
        scheduleFlush();
      }
    }

    function start() {
      if (running || !ObserverCtor || !rootNode) {
        return false;
      }
      const target = getWalkRoot(rootNode);
      if (!target) {
        return false;
      }
      if (!observer) {
        observer = new ObserverCtor(handleMutations);
      }
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: TRANSLATABLE_ATTRS
      });
      running = true;
      return true;
    }

    function stop() {
      running = false;
      clearPending();
      dirtyTargets.clear();
      if (observer && typeof observer.disconnect === "function") {
        observer.disconnect();
      }
    }

    return {
      start,
      stop,
      flush,
      isRunning: () => running,
      handleMutations
    };
  }

  const api = {
    TRANSLATABLE_ATTRS,
    createTranslator,
    createObserverController,
    isForbiddenElementForText,
    isForbiddenElementForAttributes,
    isIconElement,
    isInteractiveElement,
    isProseContainer
  };

  if (rootScope && typeof rootScope === "object") {
    rootScope.AG_I18N_TRANSLATOR = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
