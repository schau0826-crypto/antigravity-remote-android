(function (rootScope) {
  "use strict";

  const USER_CANCEL_REGEX =
    /(?:\bcontext\s+canceled\b|\bcancell?ed\s+by\s+user\b|\baborted\s+by\s+user\b|\buser\s+cancell?ed\b)/i;

  function unwrap(obj) {
    try {
      return obj && obj.wrappedJSObject ? obj.wrappedJSObject : obj;
    } catch (_err) {
      return obj;
    }
  }

  function toNum(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) && value >= 0 ? value : 0;
    }
    if (typeof value === "bigint") {
      if (value <= 0n) {
        return 0;
      }
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return 0;
      }
      const n = Number(trimmed);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    if (value && typeof value === "object" && typeof value.low === "number") {
      const high = typeof value.high === "number" ? value.high : 0;
      const combined = high * 4294967296 + (value.low >>> 0);
      return Number.isFinite(combined) && combined >= 0 ? combined : 0;
    }
    return 0;
  }

  function parseProtoTimestampMs(ts) {
    if (!ts) {
      return 0;
    }
    if (typeof ts === "number" || typeof ts === "bigint" || typeof ts === "string") {
      const n = toNum(ts);
      return n > 0 && n < 1e11 ? Math.round(n * 1000) : Math.round(n);
    }
    if (typeof ts === "object") {
      if ("seconds" in ts || "nanos" in ts) {
        const sec = toNum(ts.seconds);
        const nanos = toNum(ts.nanos);
        if (sec <= 0 && nanos <= 0) {
          return 0;
        }
        return Math.round(sec * 1000 + nanos / 1e6);
      }
      if (typeof ts.getTime === "function") {
        const ms = ts.getTime();
        return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0;
      }
    }
    return 0;
  }

  function extractWorkspaceShortName(uri) {
    const raw = String(uri || "").trim();
    if (!raw) {
      return "";
    }
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch (_err) {
      decoded = raw;
    }
    const clean = decoded.split("#")[0].split("?")[0].replace(/[\\/]+$/, "");
    const parts = clean.split(/[\\/]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : "";
  }

  function getPageScope(scope, doc) {
    const candidates = [
      scope && scope.wrappedJSObject,
      scope && scope.window && scope.window.wrappedJSObject,
      doc && doc.defaultView && doc.defaultView.wrappedJSObject,
      typeof window !== "undefined" && window && window.wrappedJSObject,
      rootScope && rootScope.wrappedJSObject,
      rootScope && rootScope.window && rootScope.window.wrappedJSObject,
      doc && doc.defaultView,
      scope,
      rootScope
    ];
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i]) {
        return candidates[i];
      }
    }
    return rootScope;
  }

  function cloneForPage(obj, scope, doc) {
    const cloneFn =
      (scope && typeof scope.cloneInto === "function" && scope.cloneInto) ||
      (typeof cloneInto === "function" && cloneInto) ||
      (rootScope && typeof rootScope.cloneInto === "function" && rootScope.cloneInto) ||
      null;
    if (cloneFn) {
      const pageScope = getPageScope(scope, doc);
      try {
        return cloneFn(obj, pageScope);
      } catch (_err) {
        // Fall through
      }
    }
    return obj;
  }

  function safeQuerySelector(doc, selector) {
    if (!doc || typeof doc.querySelector !== "function") {
      return null;
    }
    try {
      return doc.querySelector(selector);
    } catch (_err) {
      return null;
    }
  }

  function safeQuerySelectorAll(doc, selector) {
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return [];
    }
    try {
      return Array.from(doc.querySelectorAll(selector) || []);
    } catch (_err) {
      return [];
    }
  }

  function getReactFiber(el) {
    if (!el) {
      return null;
    }
    const raw = unwrap(el);
    if (!raw || typeof raw !== "object") {
      return null;
    }
    try {
      const keys = Object.keys(raw);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (
          k.startsWith("__reactFiber$") ||
          k.startsWith("__reactContainer$") ||
          k.startsWith("__reactInternalInstance$")
        ) {
          const candidate = raw[k];
          if (
            candidate &&
            candidate.current &&
            typeof candidate.current === "object" &&
            ("child" in candidate.current || "tag" in candidate.current)
          ) {
            return candidate.current;
          }
          return candidate || null;
        }
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  function inspectFiberForProviders(node, found) {
    if (!node) {
      return;
    }
    try {
      const props = node.memoizedProps || node.pendingProps;
      if (!props || typeof props !== "object") {
        return;
      }
      const val = props.value;

      const storeCandidate = (val && val.store) || props.store;
      if (storeCandidate && typeof storeCandidate.getState === "function") {
        let hasSummaries = false;
        try {
          const st = storeCandidate.getState();
          hasSummaries = Boolean(st && typeof st === "object" && st.trajectorySummaries);
        } catch (_err) {
          hasSummaries = false;
        }
        if (!found.store || (!found.storeHasSummaries && hasSummaries)) {
          found.store = storeCandidate;
          found.storeHasSummaries = hasSummaries;
        }
      }

      if (!found.router) {
        const routerCandidate =
          props.router ||
          (val && typeof val.navigate === "function" && val.state && val.state.location ? val : null);
        if (
          routerCandidate &&
          typeof routerCandidate.navigate === "function" &&
          routerCandidate.state &&
          routerCandidate.state.location
        ) {
          found.router = routerCandidate;
        }
      }

      if (!found.trajectoriesCtx) {
        if (val && typeof val.peek === "function" && typeof val.subscribe === "function") {
          found.trajectoriesCtx = val;
        }
      }
    } catch (_err) {
      // Ignore inaccessible fiber props
    }
  }

  function allProvidersFound(found) {
    return Boolean(found.store && found.storeHasSummaries && found.router && found.trajectoriesCtx);
  }

  function discoverProviders(doc) {
    const found = {
      store: null,
      storeHasSummaries: false,
      router: null,
      trajectoriesCtx: null
    };
    if (!doc) {
      return { store: null, router: null, trajectoriesCtx: null };
    }

    let rootEl = null;
    try {
      if (typeof doc.getElementById === "function") {
        rootEl = doc.getElementById("root");
      }
      if (!rootEl && doc.body) {
        rootEl = doc.body.firstElementChild || (doc.body.childNodes && doc.body.childNodes[0]) || null;
      }
    } catch (_err) {
      rootEl = null;
    }

    const anchors = [
      safeQuerySelector(doc, '[data-testid="conversation-view"]'),
      safeQuerySelector(doc, '[data-testid="mobile-layout"]'),
      safeQuerySelector(doc, '[data-testid="model-selector-trigger"]'),
      safeQuerySelector(doc, 'textarea, [contenteditable="true"]'),
      rootEl && rootEl.firstElementChild ? rootEl.firstElementChild : null,
      doc.body && doc.body.firstElementChild ? doc.body.firstElementChild : null
    ].filter(Boolean);

    let topFiber = null;
    const visited = new Set();

    // Phase 1: climb .return from mounted conversation elements to hit Provider ancestors immediately.
    for (let i = 0; i < anchors.length && !allProvidersFound(found); i++) {
      let cur = getReactFiber(anchors[i]);
      for (let hop = 0; hop < 120 && cur; hop++) {
        if (!visited.has(cur)) {
          visited.add(cur);
          inspectFiberForProviders(cur, found);
        }
        if (!cur.return) {
          if (!topFiber) {
            topFiber = cur;
          }
          break;
        }
        cur = cur.return;
      }
      if (allProvidersFound(found)) {
        break;
      }
    }

    // Phase 2: BFS downward from HostRoot (__reactContainer$ / topFiber) if anything is still missing.
    if (!allProvidersFound(found)) {
      const rootFiber = getReactFiber(rootEl);
      const bfsQueue = [];
      if (rootFiber) {
        bfsQueue.push(rootFiber);
      }
      if (topFiber && topFiber !== rootFiber) {
        bfsQueue.push(topFiber);
      }
      const bfsVisited = new Set();
      const MAX_VISITS = 1500;
      let visits = 0;

      while (bfsQueue.length > 0 && visits < MAX_VISITS) {
        const node = bfsQueue.shift();
        if (!node || bfsVisited.has(node)) {
          continue;
        }
        bfsVisited.add(node);
        visits++;

        inspectFiberForProviders(node, found);
        if (allProvidersFound(found)) {
          break;
        }

        try {
          if (node.child && !bfsVisited.has(node.child)) {
            bfsQueue.push(node.child);
          }
          if (node.sibling && !bfsVisited.has(node.sibling)) {
            bfsQueue.push(node.sibling);
          }
        } catch (_err) {
          // Ignore broken fiber pointers
        }
      }
    }

    return {
      store: found.store,
      router: found.router,
      trajectoriesCtx: found.trajectoriesCtx
    };
  }

  function findAgentStateProvider(doc, currentCid, trajectoriesCtx) {
    if (trajectoriesCtx && currentCid && typeof trajectoriesCtx.peek === "function") {
      try {
        const asp = trajectoriesCtx.peek(currentCid);
        if (asp && typeof asp.getState === "function") {
          return asp;
        }
      } catch (_err) {
        // Fall through to fiber return walk
      }
    }

    const anchors = [
      safeQuerySelector(doc, '[data-testid="conversation-view"]'),
      safeQuerySelector(doc, '[data-testid="model-selector-trigger"]'),
      safeQuerySelector(doc, 'textarea, [contenteditable="true"]')
    ].filter(Boolean);

    for (let i = 0; i < anchors.length; i++) {
      let cur = getReactFiber(anchors[i]);
      for (let hop = 0; hop < 45 && cur; hop++) {
        try {
          const val = cur.memoizedProps && cur.memoizedProps.value;
          const asp =
            val &&
            ((val.cascadeContext && val.cascadeContext.state && val.cascadeContext.state.agentStateProvider) ||
              val.agentStateProvider);
          if (asp && typeof asp.getState === "function") {
            return asp;
          }
          cur = cur.return || null;
        } catch (_err) {
          break;
        }
      }
    }

    return null;
  }

  function extractCascadeIdFromPath(pathStr) {
    const s = String(pathStr || "");
    const m = s.match(/\/c\/([0-9a-zA-Z_-]{2,128})/i);
    return m && m[1] ? m[1] : "";
  }

  function extractCurrentConversationId(doc, locationObj, router) {
    try {
      const fromRouter = extractCascadeIdFromPath(router && router.state && router.state.location && router.state.location.pathname);
      if (fromRouter) {
        return fromRouter;
      }
    } catch (_err) {
      // Ignore
    }

    try {
      const fromLoc = extractCascadeIdFromPath(locationObj && locationObj.pathname);
      if (fromLoc) {
        return fromLoc;
      }
    } catch (_err) {
      // Ignore
    }

    const viewEl = safeQuerySelector(doc, '[data-testid="conversation-view"][data-cascade-id]');
    const viewCid = viewEl && typeof viewEl.getAttribute === "function"
      ? String(viewEl.getAttribute("data-cascade-id") || "").trim()
      : "";
    if (viewCid) {
      return viewCid;
    }

    const selectedRow = safeQuerySelector(doc, '[data-testid="conversation-row-sidebar"][data-selected="true"]');
    const rowCid = selectedRow && typeof selectedRow.getAttribute === "function"
      ? String(selectedRow.getAttribute("data-cascade-id") || "").trim()
      : "";
    return rowCid;
  }

  function extractModelName(aspState, reduxState, currentCid, doc) {
    try {
      const fromCumulative = aspState?.costSummary?.total?.cumulativeTotal?.pricing?.modelName;
      if (typeof fromCumulative === "string" && fromCumulative.trim()) {
        return fromCumulative.trim();
      }
      const fromPricing = aspState?.costSummary?.pricing?.modelName;
      if (typeof fromPricing === "string" && fromPricing.trim()) {
        return fromPricing.trim();
      }
    } catch (_err) {
      // Ignore
    }

    try {
      const sel = reduxState?.modelSelection;
      const byConv = currentCid && sel?.byConversation ? sel.byConversation[currentCid] : null;
      const customLabel = byConv?.customLabel || sel?.default?.customLabel;
      if (typeof customLabel === "string" && customLabel.trim()) {
        return customLabel.trim();
      }
    } catch (_err) {
      // Ignore
    }

    const trigger = safeQuerySelector(doc, '[data-testid="model-selector-trigger"]');
    if (trigger) {
      const aria = typeof trigger.getAttribute === "function"
        ? (trigger.getAttribute("data-ag-orig-aria-label") || trigger.getAttribute("aria-label") || "")
        : "";
      if (aria && /model/i.test(aria)) {
        const cleaned = aria.replace(/^(?:Select model|Model(?:\s+selector)?)(?:,\s*current)?:\s*/i, "").trim();
        if (cleaned) {
          return cleaned;
        }
      }
      const txt = String(trigger.textContent || "").trim();
      if (txt) {
        return txt;
      }
    }

    return "";
  }

  function isUserConversationSummary(summaryObj) {
    if (!summaryObj || typeof summaryObj !== "object") {
      return false;
    }
    if (summaryObj.annotations && summaryObj.annotations.archived === true) {
      return false;
    }
    const meta = summaryObj.trajectoryMetadata;
    if (meta) {
      if (meta.parentConversationId) {
        return false;
      }
      if (meta.isBattleModeFork === true) {
        return false;
      }
      if (meta.sourceMetadata && meta.sourceMetadata.hideFromConversationList === true) {
        return false;
      }
    }
    const tType = Number(summaryObj.trajectoryType);
    // Official CortexTrajectoryType: CASCADE=4, INTERACTIVE_CASCADE=17,
    // SIDE_QUESTION=22, COMMIT_MESSAGE_GENERATION=23
    if (tType === 22 || tType === 23) {
      return false;
    }
    return true;
  }

  function mapSummaryStatus(summaryObj) {
    if (Array.isArray(summaryObj?.waitingSteps) && summaryObj.waitingSteps.length > 0) {
      return "waiting";
    }
    if (summaryObj?.killed === true) {
      return "idle";
    }
    const s = Number(summaryObj?.status || 0);
    if (
      s === 2 ||
      s === 3 ||
      s === 4 ||
      summaryObj?.notFullyIdle === true ||
      summaryObj?.hasRunningSubagents === true
    ) {
      return "running";
    }
    return "idle";
  }

  function extractRecentConversations(reduxState, doc, currentCid, limit) {
    const maxItems = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 5;
    const byId = new Map();

    const tsRoot = reduxState && reduxState.trajectorySummaries;
    if (tsRoot && typeof tsRoot === "object") {
      const externalEntries = tsRoot.externalSummaries && typeof tsRoot.externalSummaries === "object"
        ? Object.entries(tsRoot.externalSummaries)
        : [];
      const localEntries = tsRoot.summaries && typeof tsRoot.summaries === "object"
        ? Object.entries(tsRoot.summaries)
        : [];
      const merged = externalEntries.concat(localEntries);

      for (let i = 0; i < merged.length; i++) {
        const cascadeId = String(merged[i][0] || "").trim();
        const summaryObj = merged[i][1];
        if (!cascadeId || !isUserConversationSummary(summaryObj)) {
          continue;
        }
        const rawWs =
          (Array.isArray(summaryObj.workspaces) && summaryObj.workspaces[0]?.workspaceFolderAbsoluteUri) ||
          (Array.isArray(summaryObj.trajectoryMetadata?.workspaceUris) && summaryObj.trajectoryMetadata.workspaceUris[0]) ||
          "";
        const lastActiveMs = Math.max(
          parseProtoTimestampMs(summaryObj.lastModifiedTime),
          parseProtoTimestampMs(summaryObj.lastUserInputTime),
          parseProtoTimestampMs(summaryObj.createdTime)
        );
        byId.set(cascadeId, {
          cascadeId,
          title: String(summaryObj.summary || "").trim() || "未命名对话",
          projectId: String(summaryObj.trajectoryMetadata?.projectId || "").trim(),
          workspaceName: extractWorkspaceShortName(rawWs),
          status: mapSummaryStatus(summaryObj),
          stepCount: toNum(summaryObj.stepCount),
          lastActiveMs,
          isCurrent: Boolean(currentCid) && cascadeId === currentCid
        });
      }
    }

    let items = Array.from(byId.values());

    if (items.length === 0) {
      const domRows = safeQuerySelectorAll(doc, '[data-testid^="conversation-row-"][data-cascade-id]');
      for (let i = 0; i < domRows.length; i++) {
        const row = domRows[i];
        const cascadeId = typeof row.getAttribute === "function"
          ? String(row.getAttribute("data-cascade-id") || "").trim()
          : "";
        if (!cascadeId || byId.has(cascadeId)) {
          continue;
        }
        const selected = typeof row.getAttribute === "function" && row.getAttribute("data-selected") === "true";
        const isDomRunning = Boolean(
          row.querySelector &&
            row.querySelector('[data-testid="status-task-running"], [data-testid="status-loading-spinner"]')
        );
        const title = String(row.textContent || "").replace(/\s+/g, " ").trim() || "未命名对话";
        const item = {
          cascadeId,
          title,
          projectId: "",
          workspaceName: "",
          status: isDomRunning ? "running" : "idle",
          stepCount: 0,
          lastActiveMs: 0,
          isCurrent: selected || (Boolean(currentCid) && cascadeId === currentCid)
        };
        byId.set(cascadeId, item);
        items.push(item);
      }
    }

    const statusRank = (s) => (s === "waiting" || s === "running" ? 0 : 1);
    items.sort((a, b) => {
      const rankDiff = statusRank(a.status) - statusRank(b.status);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      const timeDiff = b.lastActiveMs - a.lastActiveMs;
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0);
    });

    return items.slice(0, maxItems);
  }

  function extractContextTelemetry(aspState, reduxState, doc, currentCid, navigatorObj) {
    const summaries = reduxState?.trajectorySummaries?.summaries;
    const external = reduxState?.trajectorySummaries?.externalSummaries;
    const currentSummary = currentCid
      ? ((summaries && summaries[currentCid]) || (external && external[currentCid]) || null)
      : null;

    const waitingCount = Array.isArray(currentSummary?.waitingSteps) ? currentSummary.waitingSteps.length : 0;
    const execCase = String(aspState?.executionStatus?.status?.case || "");

    let errorMessage = "";
    const rawErr = aspState?.trajectorySlice?.lastStepError;
    if (rawErr && !rawErr.isBenign) {
      const rawMsg = String(
        rawErr.shortError || rawErr.userErrorMessage || rawErr.modelErrorMessage || rawErr.fullError || ""
      ).trim();
      if (rawMsg && !USER_CANCEL_REGEX.test(rawMsg)) {
        errorMessage = rawMsg;
      }
    }

    const stopBtnActive = Boolean(
      safeQuerySelector(
        doc,
        '[data-testid="input-cancel-button"], button[aria-label*="Stop" i], button[aria-label*="停止"]'
      )
    );
    const aspStatus = Number(aspState?.status || 0);
    const summaryStatus = Number(currentSummary?.status || 0);

    let status = "idle";
    if (
      (navigatorObj && navigatorObj.onLine === false) ||
      (errorMessage && aspStatus !== 2 && aspStatus !== 4 && !stopBtnActive)
    ) {
      status = "error";
    } else if (waitingCount > 0 || execCase === "modelRequest") {
      status = "waiting";
    } else if (
      aspStatus === 2 ||
      aspStatus === 3 ||
      aspStatus === 4 ||
      stopBtnActive ||
      summaryStatus === 2 ||
      summaryStatus === 3 ||
      summaryStatus === 4 ||
      currentSummary?.notFullyIdle === true
    ) {
      status = "running";
    }

    const cwu = aspState?.contextWindowUsage;
    let usedTokens = toNum(cwu?.estimatedTokensUsed);
    let maxTokens = toNum(cwu?.maxContextTokens);

    if (maxTokens === 0) {
      const sel = reduxState?.modelSelection;
      const cfgWin = toNum((currentCid && sel?.byConversation?.[currentCid]?.contextWindow) || sel?.default?.contextWindow);
      if (cfgWin > 1000) {
        maxTokens = cfgWin;
      }
    }

    const turnCosts = aspState?.costSummary?.turnCosts;
    if (usedTokens === 0 && turnCosts && typeof turnCosts === "object") {
      const entries = Object.values(turnCosts);
      for (let i = entries.length - 1; i >= 0; i--) {
        const turn = entries[i]?.turn;
        if (turn) {
          const fallbackUsed = toNum(turn.input?.tokens) + toNum(turn.cacheRead?.tokens);
          if (fallbackUsed > 0) {
            usedTokens = fallbackUsed;
          }
          break;
        }
      }
    }

    const contextPct = maxTokens > 0 && usedTokens > 0
      ? Math.min(100, Math.round((usedTokens / maxTokens) * 100))
      : null;

    const cum = aspState?.costSummary?.total?.cumulativeTotal;
    const inputTokens = toNum(cum?.input?.tokens);
    const cacheReadTokens = toNum(cum?.cacheRead?.tokens);
    const outputTokens = toNum(cum?.output?.tokens);
    const thinkingTokens = toNum(cum?.thinking?.tokens);
    const generationCount = toNum(cum?.generationCount);
    const totalPrompt = inputTokens + cacheReadTokens;
    const cacheHitPct = totalPrompt > 0 ? Math.round((cacheReadTokens / totalPrompt) * 100) : null;

    const modelName = extractModelName(aspState, reduxState, currentCid, doc);
    const stepCount = toNum(aspState?.trajectorySlice?.totalStepsLength) || toNum(currentSummary?.stepCount);
    const compactedCount = Array.isArray(aspState?.compactedAtStepIndices)
      ? aspState.compactedAtStepIndices.length
      : 0;
    const activeSubagents = Boolean(aspState?.hasActiveChildren);
    const backgroundCmdCount = Array.isArray(aspState?.backgroundCommands)
      ? aspState.backgroundCommands.length
      : 0;

    if (
      !currentCid &&
      !modelName &&
      usedTokens === 0 &&
      inputTokens === 0 &&
      stepCount === 0 &&
      status === "idle"
    ) {
      return null;
    }

    return {
      status,
      modelName,
      usedTokens,
      maxTokens,
      contextPct,
      inputTokens,
      cacheReadTokens,
      outputTokens,
      thinkingTokens,
      cacheHitPct,
      generationCount,
      stepCount,
      compactedCount,
      activeSubagents,
      backgroundCmdCount,
      errorMessage
    };
  }

  function collectSnapshot(doc, scope) {
    const activeDoc = doc || (typeof document !== "undefined" ? document : null);
    const activeScope = scope || rootScope;
    const providers = discoverProviders(activeDoc);
    let reduxState = null;
    if (providers.store && typeof providers.store.getState === "function") {
      try {
        reduxState = providers.store.getState();
      } catch (_err) {
        reduxState = null;
      }
    }

    const currentConversationId = extractCurrentConversationId(
      activeDoc,
      activeScope && activeScope.location,
      providers.router
    );
    const asp = findAgentStateProvider(activeDoc, currentConversationId, providers.trajectoriesCtx);
    let aspState = null;
    if (asp && typeof asp.getState === "function") {
      try {
        aspState = asp.getState();
      } catch (_err) {
        aspState = null;
      }
    }

    const context = extractContextTelemetry(
      aspState,
      reduxState,
      activeDoc,
      currentConversationId,
      activeScope && activeScope.navigator
    );
    const recentConversations = extractRecentConversations(reduxState, activeDoc, currentConversationId, 5);
    const ts = reduxState && reduxState.trajectorySummaries;
    const localCount =
      ts && ts.summaries && typeof ts.summaries === "object" ? Object.keys(ts.summaries).length : 0;
    const extCount =
      ts && ts.externalSummaries && typeof ts.externalSummaries === "object"
        ? Object.keys(ts.externalSummaries).length
        : 0;

    return {
      currentConversationId,
      context,
      recentConversations,
      probeMeta: {
        hasStore: Boolean(providers.store),
        hasRouter: Boolean(providers.router),
        hasAsp: Boolean(aspState),
        summaryCount: localCount + extCount
      },
      updatedAtMs: Date.now()
    };
  }

  function cloneJsonSafe(val) {
    if (val === null || typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      return val;
    }
    if (typeof val === "object") {
      if (typeof JSON !== "undefined" && typeof JSON.parse === "function" && typeof JSON.stringify === "function") {
        try {
          return JSON.parse(JSON.stringify(val));
        } catch (_err) {
          return undefined;
        }
      }
      if (Array.isArray(val)) {
        const arr = [];
        for (let i = 0; i < val.length; i++) {
          const cloned = cloneJsonSafe(val[i]);
          if (cloned !== undefined) {
            arr.push(cloned);
          }
        }
        return arr;
      }
      const out = {};
      const keys = Object.keys(val);
      for (let i = 0; i < keys.length; i++) {
        const cloned = cloneJsonSafe(val[keys[i]]);
        if (cloned !== undefined) {
          out[keys[i]] = cloned;
        }
      }
      return out;
    }
    return undefined;
  }

  function buildNextSearch(curSearch, projectId) {
    const nextSearch = {};
    if (curSearch && typeof curSearch === "object") {
      const rawSearch = unwrap(curSearch) || curSearch;
      let keys = [];
      try {
        keys = Object.keys(rawSearch);
      } catch (_err) {
        keys = [];
      }
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === "q" || k === "focused" || k === "tab" || k === "cascadeId" || k === "skipBattleRedirect") {
          continue;
        }
        try {
          const cloned = cloneJsonSafe(rawSearch[k]);
          if (cloned !== undefined) {
            nextSearch[k] = cloned;
          }
        } catch (_err) {
          // Ignore unreadable search field
        }
      }
    }
    const proj = String(projectId || "").trim();
    if (proj) {
      nextSearch.project = proj;
    }
    return nextSearch;
  }

  function tryDomClickSwitch(activeDoc, cid) {
    const domRows = safeQuerySelectorAll(activeDoc, '[data-testid^="conversation-row-"][data-cascade-id]');
    for (let i = 0; i < domRows.length; i++) {
      const row = domRows[i];
      const rowCid = typeof row.getAttribute === "function"
        ? String(row.getAttribute("data-cascade-id") || "").trim()
        : "";
      if (rowCid === cid && typeof row.click === "function") {
        row.click();
        return true;
      }
    }
    return false;
  }

  function delayMs(scope, ms) {
    const PromiseCtor = (scope && scope.Promise) || (typeof Promise !== "undefined" ? Promise : null);
    const setTimer = (scope && scope.setTimeout) || (typeof setTimeout !== "undefined" ? setTimeout : null);
    if (!PromiseCtor || typeof setTimer !== "function") {
      return null;
    }
    return new PromiseCtor((resolve) => {
      setTimer(resolve, ms);
    });
  }

  function switchConversation(doc, scope, cascadeId, projectId) {
    const cid = String(cascadeId || "").trim();
    if (!cid) {
      return { switched: false, method: "none" };
    }
    const activeDoc = doc || (typeof document !== "undefined" ? document : null);
    const activeScope = scope || rootScope;
    const providers = discoverProviders(activeDoc);

    if (providers.router && typeof providers.router.navigate === "function") {
      try {
        const nextSearch = buildNextSearch(providers.router.state?.location?.search, projectId);
        const navOpts = {
          to: "/c/$cascadeId",
          params: { cascadeId: cid },
          search: nextSearch
        };
        providers.router.navigate(cloneForPage(navOpts, activeScope, activeDoc));
        return { switched: true, method: "router" };
      } catch (_err) {
        // Fall through to DOM row click fallback
      }
    }

    if (tryDomClickSwitch(activeDoc, cid)) {
      return { switched: true, method: "dom_click" };
    }

    return { switched: false, method: "none" };
  }

  async function switchConversationAsync(doc, scope, cascadeId, projectId) {
    const cid = String(cascadeId || "").trim();
    if (!cid) {
      return { switched: false, method: "none", error: "" };
    }
    const activeDoc = doc || (typeof document !== "undefined" ? document : null);
    const activeScope = scope || rootScope;
    const providers = discoverProviders(activeDoc);
    let routerError = "";

    if (providers.router && typeof providers.router.navigate === "function") {
      try {
        const nextSearch = buildNextSearch(providers.router.state?.location?.search, projectId);
        const navOpts = {
          to: "/c/$cascadeId",
          params: { cascadeId: cid },
          search: nextSearch
        };
        const navRet = providers.router.navigate(cloneForPage(navOpts, activeScope, activeDoc));
        if (navRet && typeof navRet.then === "function") {
          const PromiseCtor =
            (activeScope && activeScope.Promise) || (typeof Promise !== "undefined" ? Promise : null);
          const timeoutP = delayMs(activeScope, 1200);
          if (PromiseCtor && typeof PromiseCtor.race === "function" && timeoutP) {
            await PromiseCtor.race([navRet, timeoutP]);
          } else {
            await navRet;
          }
        }
        let nowCid = extractCurrentConversationId(
          activeDoc,
          activeScope && activeScope.location,
          providers.router
        );
        if (nowCid !== cid) {
          const wait120 = delayMs(activeScope, 120);
          if (wait120) {
            await wait120;
          }
          nowCid = extractCurrentConversationId(
            activeDoc,
            activeScope && activeScope.location,
            providers.router
          );
        }
        if (nowCid === cid) {
          return { switched: true, method: "router", error: "" };
        }
        routerError = "location_unchanged";
      } catch (err) {
        routerError = String((err && err.message) || err || "navigate_error").slice(0, 120);
      }
    }

    if (tryDomClickSwitch(activeDoc, cid)) {
      return { switched: true, method: "dom_click", error: "" };
    }

    return {
      switched: false,
      method: routerError ? "router_error" : "none",
      error: routerError
    };
  }

  const api = {
    collectSnapshot,
    switchConversation,
    switchConversationAsync,
    extractRecentConversations,
    extractContextTelemetry,
    parseProtoTimestampMs,
    extractWorkspaceShortName,
    discoverProviders
  };

  if (rootScope && typeof rootScope === "object") {
    rootScope.AG_SESSION_PROBE = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
