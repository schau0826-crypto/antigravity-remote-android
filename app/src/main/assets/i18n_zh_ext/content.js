(function (rootScope) {
  "use strict";

  if (rootScope.__AG_I18N_CONTENT_INITIALIZED__) {
    return;
  }
  rootScope.__AG_I18N_CONTENT_INITIALIZED__ = true;

  const DICT = rootScope.AG_I18N_DICT;
  const TRANSLATOR_LIB = rootScope.AG_I18N_TRANSLATOR;
  if (!DICT || !TRANSLATOR_LIB) {
    return;
  }

  const STATS_THROTTLE_MS = 1200;
  const STALL_WATCH_MS = 2800;
  const RUNNING_TEXT_REGEX =
    /^(?:Working|执行中|工作中|Thinking|思考中|Running|运行中|Generating|生成中|Connecting|正在连接|Reconnecting|正在重连)(?=$|[\s.,:：!！…·()（）])/i;
  const CONVERSATION_PATH_REGEX = /\/r\/|\/web\//i;

  let currentConfig = {
    enabled: true,
    customDict: {}
  };
  let hasAppliedInitialConfig = false;
  let lastReportedCount = -1;
  let lastReportTime = 0;
  let pendingStatsTimer = null;

  let stallWatchTimer = null;
  let stallStreamObserver = null;
  let realStreamMutationCount = 0;

  const translator = TRANSLATOR_LIB.createTranslator({
    dict: DICT,
    enabled: true,
    customDict: {}
  });

  const observerCtrl = TRANSLATOR_LIB.createObserverController({
    translator,
    root: document,
    debounceMs: 80,
    onTranslated: (stats) => {
      if (stats && typeof stats.translatedCount === "number") {
        reportStats(stats.translatedCount, false);
      }
    }
  });

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function sanitizeCustomDict(rawDict) {
    if (!isPlainObject(rawDict)) {
      return {};
    }
    const clean = {};
    for (const [k, v] of Object.entries(rawDict)) {
      if (typeof k === "string" && typeof v === "string" && k.trim().length > 0 && v.length > 0) {
        clean[k] = v;
      }
    }
    return clean;
  }

  function normalizeConfig(raw) {
    const enabled = typeof raw?.enabled === "boolean" ? raw.enabled : true;
    const customDict = raw && "customDict" in raw ? sanitizeCustomDict(raw.customDict) : {};
    return { enabled, customDict };
  }

  function sendStatsNow(count) {
    lastReportedCount = count;
    lastReportTime = Date.now();
    if (typeof browser !== "undefined" && browser.runtime && typeof browser.runtime.sendMessage === "function") {
      browser.runtime.sendMessage({ type: "STATS", translatedCount: count }).catch(() => {});
    }
  }

  function reportStats(count, force) {
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    if (!force && safeCount === lastReportedCount) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastReportTime;
    if (force || elapsed >= STATS_THROTTLE_MS) {
      if (pendingStatsTimer !== null) {
        clearTimeout(pendingStatsTimer);
        pendingStatsTimer = null;
      }
      sendStatsNow(safeCount);
      return;
    }

    if (pendingStatsTimer === null) {
      pendingStatsTimer = setTimeout(() => {
        pendingStatsTimer = null;
        const latestCount = currentConfig.enabled ? translator.getActiveTranslatedCount() : 0;
        if (latestCount !== lastReportedCount) {
          sendStatsNow(latestCount);
        }
      }, STATS_THROTTLE_MS - elapsed);
    }
  }

  function configsEqual(a, b) {
    if (!a || !b || a.enabled !== b.enabled) {
      return false;
    }
    const keysA = Object.keys(a.customDict || {});
    const keysB = Object.keys(b.customDict || {});
    if (keysA.length !== keysB.length) {
      return false;
    }
    for (let i = 0; i < keysA.length; i++) {
      const k = keysA[i];
      if (!Object.prototype.hasOwnProperty.call(b.customDict, k) || a.customDict[k] !== b.customDict[k]) {
        return false;
      }
    }
    return true;
  }

  function applyConfig(nextConfig) {
    const normalized = normalizeConfig(nextConfig);
    if (hasAppliedInitialConfig && configsEqual(normalized, currentConfig)) {
      return;
    }
    hasAppliedInitialConfig = true;
    currentConfig = normalized;
    translator.setConfig(currentConfig);

    if (currentConfig.enabled) {
      const stats = translator.translateTree(document);
      observerCtrl.start();
      reportStats(stats.translatedCount, true);
    } else {
      observerCtrl.stop();
      translator.restoreTree(document);
      reportStats(0, true);
    }
  }

  function queryAllSafe(selector) {
    if (!document || typeof document.querySelectorAll !== "function") {
      return [];
    }
    try {
      return Array.from(document.querySelectorAll(selector) || []);
    } catch (_err) {
      return [];
    }
  }

  function hasUnsentDraft() {
    const textareas = queryAllSafe("textarea");
    for (const ta of textareas) {
      if (typeof ta.value === "string" && ta.value.trim().length > 0) {
        return true;
      }
    }
    const inputs = queryAllSafe('input[type="text"], input:not([type]), input[type="search"]');
    for (const inp of inputs) {
      if (typeof inp.value === "string" && inp.value.trim().length > 0) {
        return true;
      }
    }
    const editables = queryAllSafe('[contenteditable="true"], [contenteditable=""]');
    for (const ed of editables) {
      const txt = (ed.textContent || "").trim();
      if (txt.length > 0) {
        return true;
      }
    }
    return false;
  }

  function hasRunningIndicator() {
    const stopControls = queryAllSafe(
      'button[aria-label*="Stop" i], button[aria-label*="停止"], [role="button"][aria-label*="Stop" i], [role="button"][aria-label*="停止"]'
    );
    if (stopControls.length > 0) {
      return true;
    }

    const candidates = queryAllSafe("span, div, p, button, [role='status'], [aria-live]");
    for (let i = 0; i < candidates.length && i < 600; i++) {
      const el = candidates[i];
      if (!el || (el.childNodes && el.childNodes.length > 3)) {
        continue;
      }
      const txt = String(el.textContent || "").trim();
      if (txt && txt.length <= 40 && RUNNING_TEXT_REGEX.test(txt)) {
        return true;
      }
    }
    return false;
  }

  function isConversationFrame() {
    try {
      const href = String(rootScope.location?.href || "");
      if (CONVERSATION_PATH_REGEX.test(href)) {
        return true;
      }
    } catch (_err) {
      // Ignore location access error
    }
    return queryAllSafe("textarea, [contenteditable='true']").length > 0;
  }

  function dispatchWakeEvents() {
    try {
      const EventCtor = rootScope.Event;
      if (typeof EventCtor !== "function") {
        return;
      }
      if (typeof rootScope.dispatchEvent === "function") {
        rootScope.dispatchEvent(new EventCtor("online"));
        rootScope.dispatchEvent(new EventCtor("focus"));
      }
      if (document && typeof document.dispatchEvent === "function") {
        document.dispatchEvent(new EventCtor("visibilitychange"));
      }
    } catch (_err) {
      // Best-effort soft wake
    }
  }

  function stopStallWatch() {
    if (stallWatchTimer !== null) {
      clearTimeout(stallWatchTimer);
      stallWatchTimer = null;
    }
    if (stallStreamObserver && typeof stallStreamObserver.disconnect === "function") {
      stallStreamObserver.disconnect();
      stallStreamObserver = null;
    }
  }

  function startStallWatch(backgroundMs) {
    stopStallWatch();
    const isRunning = hasRunningIndicator();
    const inConversation = isConversationFrame();
    if (!isRunning && !(inConversation && backgroundMs >= 25000)) {
      return;
    }

    realStreamMutationCount = 0;
    const ObserverCtor =
      rootScope.MutationObserver || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
    const watchRoot = document.body || document.documentElement || document;

    if (ObserverCtor && watchRoot) {
      stallStreamObserver = new ObserverCtor((mutations) => {
        if (!mutations) {
          return;
        }
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          if (!m) {
            continue;
          }
          if (m.type === "childList" && m.addedNodes && m.addedNodes.length > 0) {
            realStreamMutationCount += m.addedNodes.length;
          } else if (m.type === "characterData" && m.target) {
            if (!translator.isTrackedAppliedText(m.target)) {
              realStreamMutationCount++;
            }
          }
        }
      });
      stallStreamObserver.observe(watchRoot, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    stallWatchTimer = setTimeout(() => {
      const mutationsSeen = realStreamMutationCount;
      const stillRunning = hasRunningIndicator();
      const draftPresent = hasUnsentDraft();
      stopStallWatch();

      if (mutationsSeen > 0) {
        return;
      }
      if (!stillRunning && backgroundMs < 25000) {
        return;
      }

      if (typeof browser !== "undefined" && browser.runtime && typeof browser.runtime.sendMessage === "function") {
        browser.runtime
          .sendMessage({
            type: "STREAM_STALLED",
            hasDraft: draftPresent,
            backgroundMs
          })
          .catch(() => {});
      }
    }, STALL_WATCH_MS);
  }

  function handleAppResumed(msg) {
    const backgroundMs = Number.isFinite(Number(msg?.backgroundMs))
      ? Math.max(0, Math.floor(Number(msg.backgroundMs)))
      : 0;

    dispatchWakeEvents();

    if (currentConfig.enabled) {
      const stats = translator.translateTree(document);
      reportStats(stats.translatedCount, false);
    }

    if (backgroundMs >= 2000) {
      startStallWatch(backgroundMs);
    }
  }

  async function fetchInitialConfig() {
    if (typeof browser !== "undefined" && browser.runtime && typeof browser.runtime.sendMessage === "function") {
      try {
        const res = await browser.runtime.sendMessage({ type: "GET_CONFIG" });
        if (res && typeof res === "object") {
          return normalizeConfig(res);
        }
      } catch (_err) {
        // Fallback to direct storage read
      }
    }

    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
      try {
        const stored = await browser.storage.local.get(["enabled", "customDict"]);
        return normalizeConfig(stored);
      } catch (_err) {
        // Use default enabled config
      }
    }

    return { enabled: true, customDict: {} };
  }

  if (typeof browser !== "undefined" && browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== "object") {
        return undefined;
      }
      if (msg.type === "CONFIG_UPDATE") {
        applyConfig(msg);
      } else if (msg.type === "APP_RESUMED") {
        handleAppResumed(msg);
      }
      return undefined;
    });
  }

  if (typeof browser !== "undefined" && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes) {
        return;
      }
      if (!("enabled" in changes) && !("customDict" in changes)) {
        return;
      }
      const next = {
        enabled: "enabled" in changes ? changes.enabled.newValue : currentConfig.enabled,
        customDict: "customDict" in changes ? changes.customDict.newValue : currentConfig.customDict
      };
      applyConfig(next);
    });
  }

  async function init() {
    const initial = await fetchInitialConfig();
    applyConfig(initial);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init();
    }, { once: true });
  } else {
    init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
