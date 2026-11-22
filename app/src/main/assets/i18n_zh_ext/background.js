(function () {
  "use strict";

  const NATIVE_APP_ID = "ag_remote_i18n";
  const EXT_VERSION = "1.0.2";
  const TAB_URL_PATTERNS = [
    "https://antigravity.google.com/*",
    "https://*.antigravity.google.com/*",
    "https://antigravity.google/*",
    "https://*.antigravity.google/*",
    "https://antigravity.static.usercontent.goog/*",
    "https://*.usercontent.goog/*"
  ];
  const BASE_RECONNECT_MS = 500;
  const MAX_RECONNECT_MS = 10000;

  let currentConfig = {
    enabled: true,
    customDict: {}
  };
  let nativePort = null;
  let reconnectTimer = null;
  let stabilityTimer = null;
  let reconnectAttempts = 0;
  let lastStatsCount = 0;
  const frameStatsMap = new Map();

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

  function normalizeConfig(raw, fallback) {
    const base = fallback || currentConfig;
    const enabled = typeof raw?.enabled === "boolean" ? raw.enabled : base.enabled;
    const customDict =
      raw && "customDict" in raw ? sanitizeCustomDict(raw.customDict) : { ...base.customDict };
    return { enabled, customDict };
  }

  async function loadConfigFromStorage() {
    try {
      const stored = await browser.storage.local.get(["enabled", "customDict"]);
      currentConfig = normalizeConfig(stored, { enabled: true, customDict: {} });
    } catch (_err) {
      // Keep default config if storage is temporarily unavailable
    }
    return currentConfig;
  }

  const storageReady = loadConfigFromStorage();

  async function persistConfig(config) {
    try {
      await browser.storage.local.set({
        enabled: config.enabled,
        customDict: config.customDict
      });
    } catch (_err) {
      // Non-fatal; in-memory config still broadcasts to tabs
    }
  }

  async function queryTargetTabs() {
    let tabs = [];
    try {
      tabs = await browser.tabs.query({ url: TAB_URL_PATTERNS });
    } catch (_err) {
      tabs = [];
    }

    if (!tabs || tabs.length === 0) {
      try {
        tabs = await browser.tabs.query({});
      } catch (_err) {
        tabs = [];
      }
    }
    return tabs || [];
  }

  async function broadcastToTabs(payload) {
    const tabs = await queryTargetTabs();
    for (const tab of tabs) {
      if (tab && typeof tab.id === "number") {
        browser.tabs.sendMessage(tab.id, payload).catch(() => {});
      }
    }
  }

  async function broadcastConfigToTabs(config) {
    await broadcastToTabs({
      type: "CONFIG_UPDATE",
      enabled: config.enabled,
      customDict: config.customDict
    });
  }

  function recomputeTotalStats() {
    let total = 0;
    for (const count of frameStatsMap.values()) {
      total += count;
    }
    return total;
  }

  function getSenderKey(sender) {
    const tabId = typeof sender?.tab?.id === "number" ? sender.tab.id : 0;
    const frameId = typeof sender?.frameId === "number" ? sender.frameId : 0;
    return `${tabId}:${frameId}`;
  }

  function parseIncomingPayload(rawMsg) {
    if (typeof rawMsg === "string") {
      try {
        return JSON.parse(rawMsg);
      } catch (_err) {
        return null;
      }
    }
    return rawMsg && typeof rawMsg === "object" ? rawMsg : null;
  }

  async function handleNativeMessage(rawMsg) {
    const msg = parseIncomingPayload(rawMsg);
    if (!msg) {
      return;
    }

    if (msg.type === "APP_RESUMED") {
      const backgroundMs = Number.isFinite(Number(msg.backgroundMs))
        ? Math.max(0, Math.floor(Number(msg.backgroundMs)))
        : 0;
      await broadcastToTabs({
        type: "APP_RESUMED",
        backgroundMs
      });
      return;
    }

    if (
      msg.type === "CONFIG_UPDATE" ||
      typeof msg.enabled === "boolean" ||
      isPlainObject(msg.customDict)
    ) {
      await storageReady;
      currentConfig = normalizeConfig(msg, currentConfig);
      if (!currentConfig.enabled) {
        frameStatsMap.clear();
        lastStatsCount = 0;
      }
      await persistConfig(currentConfig);
      await broadcastConfigToTabs(currentConfig);
      return;
    }

    if (msg.type === "PING" || msg.type === "GET_STATUS") {
      sendToNative({ type: "READY", version: EXT_VERSION });
      sendToNative({ type: "STATS", translatedCount: lastStatsCount });
    }
  }

  async function sendNativeFallback(payload) {
    if (!browser.runtime || typeof browser.runtime.sendNativeMessage !== "function") {
      return;
    }
    try {
      const response = await browser.runtime.sendNativeMessage(NATIVE_APP_ID, payload);
      if (response) {
        await handleNativeMessage(response);
      }
    } catch (_err) {
      // Ignore if native handler is not yet ready
    }
  }

  function sendToNative(payload) {
    if (nativePort) {
      try {
        nativePort.postMessage(payload);
        return true;
      } catch (_err) {
        teardownPort();
        scheduleReconnect();
      }
    }
    sendNativeFallback(payload);
    return false;
  }

  function clearTimers() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (stabilityTimer !== null) {
      clearTimeout(stabilityTimer);
      stabilityTimer = null;
    }
  }

  function teardownPort() {
    if (stabilityTimer !== null) {
      clearTimeout(stabilityTimer);
      stabilityTimer = null;
    }
    if (nativePort) {
      try {
        nativePort.disconnect();
      } catch (_err) {
        // Ignore
      }
      nativePort = null;
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer !== null) {
      return;
    }
    const delay = Math.min(
      MAX_RECONNECT_MS,
      BASE_RECONNECT_MS * Math.pow(2, Math.min(reconnectAttempts, 5))
    );
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectNativePort();
    }, delay);
  }

  function connectNativePort() {
    clearTimers();
    if (!browser.runtime || typeof browser.runtime.connectNative !== "function") {
      sendNativeFallback({ type: "READY", version: EXT_VERSION });
      return;
    }

    try {
      const port = browser.runtime.connectNative(NATIVE_APP_ID);
      nativePort = port;

      port.onMessage.addListener((rawMsg) => {
        reconnectAttempts = 0;
        handleNativeMessage(rawMsg);
      });

      port.onDisconnect.addListener(() => {
        if (browser.runtime && browser.runtime.lastError) {
          void browser.runtime.lastError.message;
        }
        if (nativePort === port) {
          nativePort = null;
        }
        if (stabilityTimer !== null) {
          clearTimeout(stabilityTimer);
          stabilityTimer = null;
        }
        scheduleReconnect();
      });

      stabilityTimer = setTimeout(() => {
        stabilityTimer = null;
        if (nativePort === port) {
          reconnectAttempts = 0;
        }
      }, 2000);

      port.postMessage({ type: "READY", version: EXT_VERSION });
    } catch (_err) {
      nativePort = null;
      sendNativeFallback({ type: "READY", version: EXT_VERSION });
      scheduleReconnect();
    }
  }

  if (browser.tabs && browser.tabs.onRemoved) {
    browser.tabs.onRemoved.addListener((tabId) => {
      const prefix = `${tabId}:`;
      for (const key of Array.from(frameStatsMap.keys())) {
        if (key.startsWith(prefix)) {
          frameStatsMap.delete(key);
        }
      }
      lastStatsCount = recomputeTotalStats();
      sendToNative({ type: "STATS", translatedCount: lastStatsCount });
    });
  }

  browser.runtime.onMessage.addListener((rawMsg, sender) => {
    const msg = parseIncomingPayload(rawMsg);
    if (!msg || !msg.type) {
      return undefined;
    }

    if (msg.type === "GET_CONFIG") {
      return storageReady.then(() => ({
        enabled: currentConfig.enabled,
        customDict: { ...currentConfig.customDict }
      }));
    }

    if (msg.type === "STATS") {
      const rawCount = Number(msg.translatedCount);
      const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
      const key = getSenderKey(sender);
      if (count === 0) {
        frameStatsMap.delete(key);
      } else {
        frameStatsMap.set(key, count);
      }
      lastStatsCount = recomputeTotalStats();
      sendToNative({ type: "STATS", translatedCount: lastStatsCount });
      return Promise.resolve({ ok: true, total: lastStatsCount });
    }

    if (msg.type === "STREAM_STALLED") {
      sendToNative({
        type: "STREAM_STALLED",
        hasDraft: Boolean(msg.hasDraft),
        backgroundMs: Number.isFinite(Number(msg.backgroundMs))
          ? Math.max(0, Math.floor(Number(msg.backgroundMs)))
          : 0
      });
      return Promise.resolve({ ok: true });
    }

    return undefined;
  });

  connectNativePort();
})();
