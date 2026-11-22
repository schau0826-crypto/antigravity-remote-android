import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const EXT_DIR = path.join(ROOT_DIR, "app", "src", "main", "assets", "i18n_zh_ext");

const require = createRequire(import.meta.url);
const dictZh = require(path.join(EXT_DIR, "dict_zh.js"));
const translatorLib = require(path.join(EXT_DIR, "translator.js"));

// ---------------------------------------------------------------------------
// Lightweight Mock DOM (validates browser-free portability of translator.js)
// ---------------------------------------------------------------------------
class MockNode {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.parentNode = null;
    this.childNodes = [];
    this.isConnected = true;
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }
}

class MockText extends MockNode {
  constructor(text = "") {
    super(3);
    this.nodeValue = String(text);
  }

  get textContent() {
    return this.nodeValue;
  }

  set textContent(val) {
    this.nodeValue = String(val);
  }
}

class MockElement extends MockNode {
  constructor(tagName, attrs = {}, children = []) {
    super(1);
    this.tagName = String(tagName).toUpperCase();
    this.nodeName = this.tagName;
    this.attributes = Object.create(null);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null && v !== undefined) {
        this.attributes[k] = String(v);
      }
    }
    this.value = "value" in this.attributes ? this.attributes.value : "";
    for (const child of children) {
      this.appendChild(child);
    }
  }

  appendChild(child) {
    const node = typeof child === "string" ? new MockText(child) : child;
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    node.parentNode = this;
    node.isConnected = this.isConnected;
    this.childNodes.push(node);
    return node;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
      child.isConnected = false;
    }
    return child;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  get className() {
    return this.attributes.class || "";
  }

  set className(val) {
    this.attributes.class = String(val);
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(val) {
    this.childNodes = [];
    if (val !== "" && val !== null && val !== undefined) {
      this.appendChild(new MockText(String(val)));
    }
  }
}

class MockDocument extends MockNode {
  constructor() {
    super(9);
    this.readyState = "complete";
    this.documentElement = new MockElement("html");
    this.body = new MockElement("body");
    this.documentElement.appendChild(this.body);
    this.documentElement.parentNode = this;
    this.childNodes = [this.documentElement];
    this._listeners = new Map();
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  createTextNode(text) {
    return new MockText(text);
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(fn);
  }

  dispatchEvent(ev) {
    const list = this._listeners.get(ev?.type) || [];
    for (const fn of list) {
      fn(ev);
    }
    return true;
  }

  querySelectorAll(selector) {
    const results = [];
    const parts = String(selector).split(",").map((s) => s.trim()).filter(Boolean);
    const matchSingle = (el, sel) => {
      if (sel === "textarea") return el.tagName === "TEXTAREA";
      if (sel === "span") return el.tagName === "SPAN";
      if (sel === "div") return el.tagName === "DIV";
      if (sel === "p") return el.tagName === "P";
      if (sel === "button") return el.tagName === "BUTTON";
      if (sel === "[contenteditable='true']" || sel === '[contenteditable="true"]') {
        return el.getAttribute("contenteditable") === "true";
      }
      if (sel === "[role='status']") return el.getAttribute("role") === "status";
      if (sel.includes("aria-label")) {
        const label = (el.getAttribute("aria-label") || "").toLowerCase();
        return label.includes("stop") || label.includes("停止");
      }
      return false;
    };
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 1) {
        if (parts.some((p) => matchSingle(node, p))) {
          results.push(node);
        }
      }
      for (const child of node.childNodes || []) {
        walk(child);
      }
    };
    walk(this.documentElement);
    return results;
  }
}

function h(tag, attrsOrChild, ...rest) {
  let attrs = {};
  let children = [];
  if (
    attrsOrChild &&
    typeof attrsOrChild === "object" &&
    !(attrsOrChild instanceof MockNode) &&
    !Array.isArray(attrsOrChild)
  ) {
    attrs = attrsOrChild;
    children = rest;
  } else if (attrsOrChild !== undefined) {
    children = [attrsOrChild, ...rest];
  }
  const flat = [];
  for (const c of children) {
    if (Array.isArray(c)) {
      flat.push(...c);
    } else if (c !== null && c !== undefined) {
      flat.push(c);
    }
  }
  return new MockElement(tag, attrs, flat);
}

function makeDoc(...bodyChildren) {
  const doc = new MockDocument();
  for (const c of bodyChildren) {
    doc.body.appendChild(c);
  }
  return doc;
}

function createMockMutationObserverClass() {
  return class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      MockMutationObserver.instances.push(this);
    }
    observe(target, opts) {
      this.observed.push({ target, opts });
    }
    disconnect() {
      this.observed = [];
    }
    trigger(records) {
      this.callback(records, this);
    }
  };
}

// ---------------------------------------------------------------------------
// 1. Manifest & Dictionary Integrity Tests
// ---------------------------------------------------------------------------
test("manifest.json follows MV2 GeckoView built-in WebExtension contract", () => {
  const manifestRaw = fs.readFileSync(path.join(EXT_DIR, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw);

  assert.equal(manifest.manifest_version, 2);
  assert.equal(manifest.version, "1.1.0");
  assert.equal(manifest.browser_specific_settings?.gecko?.id, "ag-remote-zh@agremote.local");

  for (const perm of [
    "nativeMessaging",
    "nativeMessagingFromContent",
    "geckoViewAddons",
    "storage",
    "tabs",
    "https://antigravity.google.com/*",
    "https://antigravity.google/*",
    "https://*.antigravity.google/*",
    "https://antigravity.static.usercontent.goog/*",
    "https://*.usercontent.goog/*"
  ]) {
    assert.ok(manifest.permissions.includes(perm), `Missing permission: ${perm}`);
  }

  assert.deepEqual(manifest.background?.scripts, ["background.js"]);
  assert.equal(manifest.content_scripts.length, 2);

  const preconnectCs = manifest.content_scripts[0];
  assert.ok(preconnectCs.matches.includes("https://antigravity.google.com/*"));
  assert.ok(preconnectCs.matches.includes("https://antigravity.google/*"));
  assert.ok(preconnectCs.matches.includes("https://*.antigravity.google/*"));
  assert.deepEqual(preconnectCs.js, ["preconnect.js"]);
  assert.equal(preconnectCs.run_at, "document_start");
  assert.equal(preconnectCs.all_frames, false);

  const cs = manifest.content_scripts[1];
  assert.ok(cs.matches.includes("https://antigravity.google.com/*"));
  assert.ok(cs.matches.includes("https://antigravity.google/*"));
  assert.ok(cs.matches.includes("https://*.antigravity.google/*"));
  assert.ok(cs.matches.includes("https://antigravity.static.usercontent.goog/*"));
  assert.ok(cs.matches.includes("https://*.usercontent.goog/*"));
  assert.deepEqual(cs.js, ["dict_zh.js", "translator.js", "session_probe.js", "content.js"]);
  assert.deepEqual(cs.css, ["mobile_polish.css"]);
  assert.equal(cs.run_at, "document_idle");
  assert.equal(cs.all_frames, true);
});

test("dict_zh.js contains 250+ exact UI entries and valid dynamic regex rules", () => {
  const keys = Object.keys(dictZh.EXACT_DICT);
  assert.ok(keys.length >= 250, `Expected >= 250 exact entries, got ${keys.length}`);
  assert.ok(dictZh.REGEX_RULES.length >= 25);

  // Spot check required Antigravity 2.0 & Remote Control entries
  const required = [
    "Remote Control",
    "New Conversation",
    "Files Changed",
    "Subagents",
    "Background Tasks",
    "Plan Mode",
    "Agent Mode",
    "Allow once",
    "Always allow",
    "Allow in sandbox",
    "Review Changes",
    "Terminal Sandbox",
    "MCP Servers",
    "Ask anything...",
    "Message Antigravity...",
    "Type / for commands",
    "Just now"
  ];
  for (const key of required) {
    assert.equal(typeof dictZh.EXACT_DICT[key], "string", `Missing key: ${key}`);
    assert.ok(dictZh.EXACT_DICT[key].length > 0);
  }
});

test("dict_zh.js and translator.js load cleanly in plain browser script global scope (no ESM export syntax)", () => {
  const dictSource = fs.readFileSync(path.join(EXT_DIR, "dict_zh.js"), "utf8");
  const translatorSource = fs.readFileSync(path.join(EXT_DIR, "translator.js"), "utf8");

  const sandbox = {
    globalThis: null,
    Set,
    Map,
    WeakMap,
    WeakRef,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    setTimeout,
    clearTimeout
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(dictSource, sandbox);
  vm.runInContext(translatorSource, sandbox);

  assert.ok(sandbox.AG_I18N_DICT, "AG_I18N_DICT should attach to globalThis");
  assert.ok(sandbox.AG_I18N_TRANSLATOR, "AG_I18N_TRANSLATOR should attach to globalThis");

  const instance = sandbox.AG_I18N_TRANSLATOR.createTranslator({ dict: sandbox.AG_I18N_DICT });
  const btn = h("button", "Allow once");
  const doc = makeDoc(btn);
  const stats = instance.translateTree(doc);
  assert.equal(btn.textContent, "仅允许这一次");
  assert.equal(stats.translatedCount, 1);
});

// ---------------------------------------------------------------------------
// 2. Exact Dictionary & Dynamic Regex Translations
// ---------------------------------------------------------------------------
test("translates built-in UI controls, statuses, permissions, and settings accurately", () => {
  const nav = h(
    "nav",
    h("a", { href: "#" }, "Projects"),
    h("button", "New Conversation"),
    h("span", "Remote Control"),
    h("span", "Connected"),
    h("button", "Plan Mode"),
    h("button", "Allow once"),
    h("button", "Always allow"),
    h("button", "Deny"),
    h("span", "Review Changes"),
    h("button", "Terminal Sandbox"),
    h("button", "MCP Servers")
  );
  const doc = makeDoc(nav);
  const translator = translatorLib.createTranslator({ dict: dictZh });
  const stats = translator.translateTree(doc);

  assert.equal(nav.childNodes[0].textContent, "项目");
  assert.equal(nav.childNodes[1].textContent, "新对话");
  assert.equal(nav.childNodes[2].textContent, "远程控制");
  assert.equal(nav.childNodes[3].textContent, "已连接");
  assert.equal(nav.childNodes[4].textContent, "规划模式");
  assert.equal(nav.childNodes[5].textContent, "仅允许这一次");
  assert.equal(nav.childNodes[6].textContent, "始终允许");
  assert.equal(nav.childNodes[7].textContent, "拒绝");
  assert.equal(nav.childNodes[8].textContent, "审查更改");
  assert.equal(nav.childNodes[9].textContent, "终端沙盒");
  assert.equal(nav.childNodes[10].textContent, "MCP 服务器");
  assert.equal(stats.translatedCount, 11);
});

test("translates dynamic regex templates for timestamps, diffs, thinking time, and steps", () => {
  const panel = h(
    "div",
    { class: "status-bar" },
    h("span", "5 minutes ago"),
    h("span", "1 second ago"),
    h("span", "3 files changed"),
    h("span", "12 lines added"),
    h("span", "4 lines removed"),
    h("span", "Thought for 12 seconds"),
    h("span", "Thought for 1.5s"),
    h("span", "Step 2 of 5"),
    h("span", "Showing lines 10-25 of 120"),
    h("span", "4 running"),
    h("span", "Connected to MacBook-Pro")
  );
  const doc = makeDoc(panel);
  const translator = translatorLib.createTranslator({ dict: dictZh });
  translator.translateTree(doc);

  assert.equal(panel.childNodes[0].textContent, "5 分钟前");
  assert.equal(panel.childNodes[1].textContent, "1 秒前");
  assert.equal(panel.childNodes[2].textContent, "3 个文件已更改");
  assert.equal(panel.childNodes[3].textContent, "新增 12 行");
  assert.equal(panel.childNodes[4].textContent, "删除 4 行");
  assert.equal(panel.childNodes[5].textContent, "思考了 12 秒");
  assert.equal(panel.childNodes[6].textContent, "思考了 1.5 秒");
  assert.equal(panel.childNodes[7].textContent, "第 2 / 5 步");
  assert.equal(panel.childNodes[8].textContent, "显示第 10-25 行（共 120 行）");
  assert.equal(panel.childNodes[9].textContent, "4 个运行中");
  assert.equal(panel.childNodes[10].textContent, "已连接到 MacBook-Pro");
});

test("short lowercase tokens are not falsely translated unless exact-case UI match", () => {
  const el = h(
    "div",
    h("span", "on"),
    h("span", "no"),
    h("button", "On"),
    h("button", "OK"),
    h("span", "remote control")
  );
  const doc = makeDoc(el);
  const translator = translatorLib.createTranslator({ dict: dictZh });
  translator.translateTree(doc);

  assert.equal(el.childNodes[0].textContent, "on");
  assert.equal(el.childNodes[1].textContent, "no");
  assert.equal(el.childNodes[2].textContent, "开启");
  assert.equal(el.childNodes[3].textContent, "确定");
  assert.equal(el.childNodes[4].textContent, "远程控制");
});

// ---------------------------------------------------------------------------
// 3. customDict Override Priority & Live Updates
// ---------------------------------------------------------------------------
test("customDict overrides built-in entries and updates live cleanly", () => {
  const header = h(
    "header",
    h("span", "Remote Control"),
    h("button", "My Custom Action"),
    h("button", "Settings")
  );
  const doc = makeDoc(header);
  const translator = translatorLib.createTranslator({
    dict: dictZh,
    customDict: {
      "Remote Control": "手机遥控",
      "My Custom Action": "自定义操作"
    }
  });

  translator.translateTree(doc);
  assert.equal(header.childNodes[0].textContent, "手机遥控");
  assert.equal(header.childNodes[1].textContent, "自定义操作");
  assert.equal(header.childNodes[2].textContent, "设置");

  // Live update: change override and drop custom-only key
  translator.setCustomDict({ "Remote Control": "远程接管" });
  translator.translateTree(doc);
  assert.equal(header.childNodes[0].textContent, "远程接管");
  assert.equal(header.childNodes[1].textContent, "My Custom Action");
  assert.equal(header.childNodes[2].textContent, "设置");

  // Clear customDict: falls back to built-in exact translation
  translator.setCustomDict({});
  translator.translateTree(doc);
  assert.equal(header.childNodes[0].textContent, "远程控制");
});

// ---------------------------------------------------------------------------
// 4. Safety Guards: Code Blocks, Inputs, Editors, and No-Translate Subtrees
// ---------------------------------------------------------------------------
test("never translates code, pre, kbd, textarea, select, contenteditable, editors, or data-no-translate", () => {
  const codeEl = h("code", "Allow once");
  const preEl = h("pre", "Remote Control\nAllow once");
  const kbdEl = h("kbd", "Settings");
  const sampEl = h("samp", "Error");
  const textareaEl = h("textarea", "Allow once");
  const selectEl = h("select", h("option", "Plan Mode"), h("option", "Agent Mode"));
  const ceTrueEl = h("div", { contenteditable: "true" }, h("span", "Allow once"));
  const ceEmptyEl = h("div", { contenteditable: "" }, h("span", "Remote Control"));
  const monacoEl = h("div", { class: "monaco-editor" }, h("span", "Settings"), h("button", "Close"));
  const cmEl = h("div", { class: "cm-editor" }, h("span", "Files"));
  const codeMirrorEl = h("div", { class: "CodeMirror" }, h("span", "Search"));
  const noTransEl = h("div", { "data-no-translate": "" }, h("button", "Allow once"));
  const translateNoEl = h("div", { translate: "no" }, h("button", "Cancel"));
  const svgEl = h("svg", h("text", "Close"));
  const btnCodeEl = h("button", h("code", "Settings"));

  const doc = makeDoc(
    codeEl,
    preEl,
    kbdEl,
    sampEl,
    textareaEl,
    selectEl,
    ceTrueEl,
    ceEmptyEl,
    monacoEl,
    cmEl,
    codeMirrorEl,
    noTransEl,
    translateNoEl,
    svgEl,
    btnCodeEl
  );

  const translator = translatorLib.createTranslator({ dict: dictZh });
  const stats = translator.translateTree(doc);

  assert.equal(codeEl.textContent, "Allow once");
  assert.equal(preEl.textContent, "Remote Control\nAllow once");
  assert.equal(kbdEl.textContent, "Settings");
  assert.equal(sampEl.textContent, "Error");
  assert.equal(textareaEl.textContent, "Allow once");
  assert.equal(selectEl.childNodes[0].textContent, "Plan Mode");
  assert.equal(ceTrueEl.textContent, "Allow once");
  assert.equal(ceEmptyEl.textContent, "Remote Control");
  assert.equal(monacoEl.textContent, "SettingsClose");
  assert.equal(cmEl.textContent, "Files");
  assert.equal(codeMirrorEl.textContent, "Search");
  assert.equal(noTransEl.textContent, "Allow once");
  assert.equal(translateNoEl.textContent, "Cancel");
  assert.equal(svgEl.textContent, "Close");
  assert.equal(btnCodeEl.textContent, "Settings");
  assert.equal(stats.translatedCount, 0);
});

// ---------------------------------------------------------------------------
// 5. Prose / AI Message Protection + Nested Interactive Control Translation
// ---------------------------------------------------------------------------
test("protects AI/user prose and code snippets while translating nested interactive controls and chrome labels", () => {
  const longProse =
    "To configure your workspace permissions safely, please review the local sandbox settings and verify that every command in the pipeline matches your policy.";
  const inlineProseP = h("p", "Please click ", h("strong", "Allow once"), " to approve this action.");
  const markdownProseOnlyP = h("p", "Settings");
  const codeLikeSpan = h("span", "const config = { Settings: true };");
  const arrowFnSpan = h("span", "() => Remote Control");
  const multiSentenceSpan = h("span", "Build failed. Please retry.");

  const nestedButton = h("button", "Allow once");
  const nestedLink = h("a", { href: "#diff" }, "View diff");
  const nestedChip = h("span", { role: "button" }, "Copy");
  const nestedTab = h("div", { role: "tab" }, "Files Changed");
  const nestedMenuItem = h("div", { role: "menuitem" }, "Rename");
  const nestedOption = h("div", { role: "option" }, "Plan Mode");
  const nestedSwitch = h("div", { role: "switch" }, "Auto");
  const nestedCheckbox = h("div", { role: "checkbox" }, "Enable Notifications");
  const nestedSummary = h("summary", "Show more");
  const nestedTh = h("th", "Files");
  const statusChrome = h("span", { class: "meta" }, "Thought for 12 seconds");

  const messageContainer = h(
    "div",
    { class: "message-body" },
    statusChrome,
    h(
      "div",
      { class: "markdown-body prose" },
      h("p", longProse),
      inlineProseP,
      markdownProseOnlyP,
      codeLikeSpan,
      arrowFnSpan,
      multiSentenceSpan,
      nestedButton,
      nestedLink,
      nestedChip,
      nestedTab,
      nestedMenuItem,
      nestedOption,
      nestedSwitch,
      nestedCheckbox,
      nestedSummary,
      h("table", h("thead", h("tr", nestedTh)))
    )
  );

  const doc = makeDoc(messageContainer);
  const translator = translatorLib.createTranslator({ dict: dictZh });
  translator.translateTree(doc);

  // Prose & code-like strings remain completely untouched
  assert.equal(inlineProseP.textContent, "Please click Allow once to approve this action.");
  assert.equal(markdownProseOnlyP.textContent, "Settings");
  assert.equal(codeLikeSpan.textContent, "const config = { Settings: true };");
  assert.equal(arrowFnSpan.textContent, "() => Remote Control");
  assert.equal(multiSentenceSpan.textContent, "Build failed. Please retry.");

  // Nested interactive UI controls and outside-markdown status chrome ARE translated
  assert.equal(statusChrome.textContent, "思考了 12 秒");
  assert.equal(nestedButton.textContent, "仅允许这一次");
  assert.equal(nestedLink.textContent, "查看差异");
  assert.equal(nestedChip.textContent, "复制");
  assert.equal(nestedTab.textContent, "已更改文件");
  assert.equal(nestedMenuItem.textContent, "重命名");
  assert.equal(nestedOption.textContent, "规划模式");
  assert.equal(nestedSwitch.textContent, "自动");
  assert.equal(nestedCheckbox.textContent, "启用通知");
  assert.equal(nestedSummary.textContent, "显示更多");
  assert.equal(nestedTh.textContent, "文件");
});

test("translates and restores open Shadow DOM subtrees", () => {
  const host = h("div");
  const shadowBtn = h("button", "Accept all");
  host.shadowRoot = new MockNode(11);
  host.shadowRoot.childNodes = [shadowBtn];
  shadowBtn.parentNode = host.shadowRoot;

  const doc = makeDoc(host);
  const translator = translatorLib.createTranslator({ dict: dictZh });
  translator.translateTree(doc);
  assert.equal(shadowBtn.textContent, "全部接受");

  translator.setEnabled(false);
  translator.restoreTree(doc);
  assert.equal(shadowBtn.textContent, "Accept all");
});

// ---------------------------------------------------------------------------
// 6. Attribute Translation without Mutating Input Values
// ---------------------------------------------------------------------------
test("translates placeholder, aria-label, and title without mutating input value or textarea text", () => {
  const input = h("input", {
    type: "text",
    placeholder: "Ask anything...",
    "aria-label": "Message Antigravity...",
    title: "Enter command...",
    value: "Allow once"
  });
  const textarea = h(
    "textarea",
    {
      placeholder: "Type a message...",
      "aria-label": "Add a comment..."
    },
    "Allow once"
  );
  const iconBtn = h("button", { "aria-label": "Close", title: "Settings" }, "×");
  const protectedInput = h("input", {
    "data-no-translate": "true",
    placeholder: "Ask anything..."
  });

  const doc = makeDoc(input, textarea, iconBtn, protectedInput);
  const translator = translatorLib.createTranslator({ dict: dictZh });
  translator.translateTree(doc);

  assert.equal(input.getAttribute("placeholder"), "有问题尽管问...");
  assert.equal(input.getAttribute("aria-label"), "向 Antigravity 发送消息...");
  assert.equal(input.getAttribute("title"), "输入命令...");
  assert.equal(input.value, "Allow once");
  assert.equal(input.getAttribute("value"), "Allow once");

  assert.equal(textarea.getAttribute("placeholder"), "输入消息...");
  assert.equal(textarea.getAttribute("aria-label"), "添加评论...");
  assert.equal(textarea.textContent, "Allow once");

  assert.equal(iconBtn.getAttribute("aria-label"), "关闭");
  assert.equal(iconBtn.getAttribute("title"), "设置");
  assert.equal(iconBtn.textContent, "×");

  assert.equal(protectedInput.getAttribute("placeholder"), "Ask anything...");
});

// ---------------------------------------------------------------------------
// 7. Lossless Toggle, Whitespace Preservation, Idempotency & In-place Updates
// ---------------------------------------------------------------------------
test("lossless toggle EN -> ZH -> EN -> ZH preserves whitespace and exact original text", () => {
  const btn = h("button", "\n  Allow once\t");
  const input = h("input", { placeholder: " Ask anything... " });
  const status = h("span", "  5 minutes ago  ");
  const doc = makeDoc(btn, input, status);

  const translator = translatorLib.createTranslator({ dict: dictZh });

  // Pass 1: EN -> ZH
  const s1 = translator.translateTree(doc);
  assert.equal(btn.textContent, "\n  仅允许这一次\t");
  assert.equal(input.getAttribute("placeholder"), " 有问题尽管问... ");
  assert.equal(status.textContent, "  5 分钟前  ");
  assert.equal(s1.translatedCount, 3);

  // Pass 2 & 3: Idempotency
  const s2 = translator.translateTree(doc);
  assert.equal(btn.textContent, "\n  仅允许这一次\t");
  assert.equal(s2.translatedCount, 3);

  // Toggle OFF: Lossless restore
  translator.setEnabled(false);
  const restored = translator.restoreTree(doc);
  assert.equal(btn.textContent, "\n  Allow once\t");
  assert.equal(input.getAttribute("placeholder"), " Ask anything... ");
  assert.equal(status.textContent, "  5 minutes ago  ");
  assert.equal(restored.restoredCount, 3);

  // Toggle ON: Re-apply ZH
  translator.setEnabled(true);
  const s3 = translator.translateTree(doc);
  assert.equal(btn.textContent, "\n  仅允许这一次\t");
  assert.equal(input.getAttribute("placeholder"), " 有问题尽管问... ");
  assert.equal(status.textContent, "  5 分钟前  ");
  assert.equal(s3.translatedCount, 3);
});

test("handles SPA in-place text node updates accurately and restores the new source text", () => {
  const badge = h("span", "Working");
  const doc = makeDoc(badge);
  const translator = translatorLib.createTranslator({ dict: dictZh });

  translator.translateTree(doc);
  assert.equal(badge.textContent, "执行中");

  // Simulate React updating the same Text node in-place
  badge.childNodes[0].nodeValue = "Completed";
  translator.translateTree(doc);
  assert.equal(badge.textContent, "已完成");

  // Disabling should restore "Completed", not stale "Working"
  translator.setEnabled(false);
  translator.restoreTree(doc);
  assert.equal(badge.textContent, "Completed");
});

// ---------------------------------------------------------------------------
// 8. Throttled MutationObserver Controller
// ---------------------------------------------------------------------------
test("createObserverController batches streaming mutations and reports accurate stats", async () => {
  const MockMO = createMockMutationObserverClass();
  MockMO.instances = [];

  const list = h("div", h("button", "Save"));
  const doc = makeDoc(list);
  const translator = translatorLib.createTranslator({ dict: dictZh });
  translator.translateTree(doc);

  const reported = [];
  const ctrl = translatorLib.createObserverController({
    translator,
    root: doc,
    debounceMs: 25,
    MutationObserver: MockMO,
    onTranslated: (stats) => reported.push(stats.translatedCount)
  });

  assert.equal(ctrl.start(), true);
  assert.equal(ctrl.isRunning(), true);
  assert.equal(MockMO.instances.length, 1);

  const observer = MockMO.instances[0];
  const added1 = h("button", "Cancel");
  const added2 = h("span", "2 minutes ago");
  list.appendChild(added1);
  list.appendChild(added2);

  // Trigger rapid burst + self-mutation noise that should be ignored
  observer.trigger([
    { type: "childList", addedNodes: [added1] },
    { type: "childList", addedNodes: [added2] },
    { type: "characterData", target: list.childNodes[0].childNodes[0] }
  ]);

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(added1.textContent, "取消");
  assert.equal(added2.textContent, "2 分钟前");
  assert.equal(reported.length, 1);
  assert.equal(reported[0], 3);

  ctrl.stop();
  assert.equal(ctrl.isRunning(), false);
});

// ---------------------------------------------------------------------------
// 9. Native Messaging Protocol Smoke Test for background.js & content.js
// ---------------------------------------------------------------------------
test("background.js and content.js wire native port READY, CONFIG_UPDATE, and STATS cleanly", async () => {
  const bgSource = fs.readFileSync(path.join(EXT_DIR, "background.js"), "utf8");
  const contentSource = fs.readFileSync(path.join(EXT_DIR, "content.js"), "utf8");

  const storageState = {};
  const storageChangedListeners = [];
  const nativeMessagesSent = [];
  const portMessageListeners = [];
  const bgRuntimeListeners = [];
  const contentRuntimeListeners = [];
  const tabMessagesSent = [];

  const mockPort = {
    postMessage(msg) {
      nativeMessagesSent.push(JSON.parse(JSON.stringify(msg)));
    },
    onMessage: {
      addListener(fn) {
        portMessageListeners.push(fn);
      }
    },
    onDisconnect: {
      addListener() {}
    },
    disconnect() {}
  };

  let connectedAppId = null;
  const bgBrowser = {
    runtime: {
      connectNative(appId) {
        connectedAppId = appId;
        return mockPort;
      },
      onMessage: {
        addListener(fn) {
          bgRuntimeListeners.push(fn);
        }
      }
    },
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const k of keys) {
            if (k in storageState) {
              out[k] = storageState[k];
            }
          }
          return out;
        },
        async set(obj) {
          Object.assign(storageState, obj);
        }
      }
    },
    tabs: {
      async query() {
        return [{ id: 101, url: "https://antigravity.google.com/" }];
      },
      async sendMessage(tabId, payload) {
        tabMessagesSent.push({ tabId, payload });
        for (const fn of contentRuntimeListeners) {
          fn(payload);
        }
      }
    }
  };

  const bgCtx = {
    browser: bgBrowser,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Promise,
    JSON,
    Math,
    setTimeout,
    clearTimeout
  };
  vm.createContext(bgCtx);
  vm.runInContext(bgSource, bgCtx);

  assert.equal(connectedAppId, "ag_remote_i18n");
  assert.deepEqual(nativeMessagesSent[0], { type: "READY", version: "1.1.0" });

  // Simulate Android -> Extension CONFIG_UPDATE
  for (const fn of portMessageListeners) {
    fn({
      type: "CONFIG_UPDATE",
      enabled: true,
      customDict: { "Remote Control": "远程接管" }
    });
  }
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(storageState.enabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(storageState.customDict)), { "Remote Control": "远程接管" });
  assert.equal(tabMessagesSent.length, 1);
  assert.equal(tabMessagesSent[0].tabId, 101);

  // Now mount content.js against a MockDocument wired to bgBrowser runtime handlers
  const titleSpan = h("span", "Remote Control");
  const actionBtn = h("button", "Allow once");
  const doc = makeDoc(titleSpan, actionBtn);
  const MockMO = createMockMutationObserverClass();
  MockMO.instances = [];

  const contentBrowser = {
    runtime: {
      async sendMessage(msg) {
        for (const fn of bgRuntimeListeners) {
          const res = fn(msg);
          if (res && typeof res.then === "function") {
            return await res;
          }
        }
        return undefined;
      },
      onMessage: {
        addListener(fn) {
          contentRuntimeListeners.push(fn);
        }
      }
    },
    storage: {
      local: bgBrowser.storage.local,
      onChanged: {
        addListener(fn) {
          storageChangedListeners.push(fn);
        }
      }
    }
  };

  const contentCtx = {
    globalThis: null,
    AG_I18N_DICT: dictZh,
    AG_I18N_TRANSLATOR: translatorLib,
    document: doc,
    browser: contentBrowser,
    MutationObserver: MockMO,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Promise,
    Date,
    Math,
    setTimeout,
    clearTimeout
  };
  contentCtx.globalThis = contentCtx;
  vm.createContext(contentCtx);
  vm.runInContext(contentSource, contentCtx);

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(titleSpan.textContent, "远程接管");
  assert.equal(actionBtn.textContent, "仅允许这一次");
  assert.ok(
    nativeMessagesSent.some((m) => m.type === "STATS" && m.translatedCount === 2),
    "Expected STATS message with translatedCount 2"
  );

  // Live toggle OFF from Android
  for (const fn of portMessageListeners) {
    fn({
      type: "CONFIG_UPDATE",
      enabled: false,
      customDict: { "Remote Control": "远程接管" }
    });
  }
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(titleSpan.textContent, "Remote Control");
  assert.equal(actionBtn.textContent, "Allow once");
  assert.ok(
    nativeMessagesSent.some((m) => m.type === "STATS" && m.translatedCount === 0),
    "Expected STATS message with translatedCount 0 after toggle off"
  );
});

// ---------------------------------------------------------------------------
// 10. Material Icon Ligatures, Real Antigravity 2.34.0 Strings, Multi-frame STATS & Stall Recovery
// ---------------------------------------------------------------------------
test("protects Material icon ligatures while still translating outer button aria-label/title", () => {
  const feedbackBtn = h(
    "button",
    { "aria-label": "Send Feedback", title: "Feedback" },
    h("span", { class: "material-symbols-outlined" }, "feedback")
  );
  const googleIconBtn = h(
    "button",
    { "aria-label": "Open settings" },
    h("span", { class: "google-material-icons" }, "settings")
  );
  const ariaHiddenIcon = h("span", { "aria-hidden": "true" }, "feedback");
  const normalLabel = h("span", "Feedback");
  const doc = makeDoc(feedbackBtn, googleIconBtn, ariaHiddenIcon, normalLabel);

  const translator = translatorLib.createTranslator({ dict: dictZh });
  translator.translateTree(doc);

  assert.equal(feedbackBtn.childNodes[0].textContent, "feedback");
  assert.equal(feedbackBtn.getAttribute("aria-label"), "发送反馈");
  assert.equal(feedbackBtn.getAttribute("title"), "反馈");
  assert.equal(googleIconBtn.childNodes[0].textContent, "settings");
  assert.equal(googleIconBtn.getAttribute("aria-label"), "打开设置");
  assert.equal(ariaHiddenIcon.textContent, "feedback");
  assert.equal(normalLabel.textContent, "反馈");
});

test("translates real Antigravity 2.34.0 iframe UI strings cleanly", () => {
  const doc = makeDoc(
    h("span", "just now"),
    h("span", "Thought for 10s"),
    h("span", "Thought for 1m 25s"),
    h("div", "Working"),
    h("input", { placeholder: "Ask anything, @ to mention, / for actions" }),
    h("span", "3m ago")
  );

  const translator = translatorLib.createTranslator({ dict: dictZh });
  translator.translateTree(doc);

  const children = doc.body.childNodes;
  assert.equal(children[0].textContent, "刚刚");
  assert.equal(children[1].textContent, "思考了 10 秒");
  assert.equal(children[2].textContent, "思考了 1 分 25 秒");
  assert.equal(children[3].textContent, "执行中");
  assert.equal(children[4].getAttribute("placeholder"), "输入指令，@ 引用上下文，/ 调用命令");
  assert.equal(children[5].textContent, "3 分钟前");
});

test("background.js aggregates STATS across outer frame and iframe and relays APP_RESUMED / STREAM_STALLED", async () => {
  const bgSource = fs.readFileSync(path.join(EXT_DIR, "background.js"), "utf8");
  const contentSource = fs.readFileSync(path.join(EXT_DIR, "content.js"), "utf8");

  const nativeMessagesSent = [];
  const portMessageListeners = [];
  const bgRuntimeListeners = [];
  const contentRuntimeListeners = [];
  const wokeEvents = [];

  const mockPort = {
    postMessage(msg) {
      nativeMessagesSent.push(JSON.parse(JSON.stringify(msg)));
    },
    onMessage: { addListener: (fn) => portMessageListeners.push(fn) },
    onDisconnect: { addListener() {} },
    disconnect() {}
  };

  const bgBrowser = {
    runtime: {
      connectNative: () => mockPort,
      onMessage: { addListener: (fn) => bgRuntimeListeners.push(fn) }
    },
    storage: {
      local: {
        async get() { return { enabled: true, customDict: {} }; },
        async set() {}
      }
    },
    tabs: {
      async query() { return [{ id: 1, url: "https://antigravity.google.com/r/abc" }]; },
      async sendMessage(_tabId, payload) {
        for (const fn of contentRuntimeListeners) {
          fn(payload);
        }
      },
      onRemoved: { addListener() {} }
    }
  };

  const bgCtx = {
    browser: bgBrowser,
    Map, Object, Array, String, Number, Boolean, Promise, JSON, Math, setTimeout, clearTimeout
  };
  vm.createContext(bgCtx);
  vm.runInContext(bgSource, bgCtx);

  // Outer frame reports 3, inner iframe reports 18 -> aggregated total must be 21
  for (const fn of bgRuntimeListeners) {
    fn({ type: "STATS", translatedCount: 3 }, { tab: { id: 1 }, frameId: 0 });
    fn({ type: "STATS", translatedCount: 18 }, { tab: { id: 1 }, frameId: 2 });
  }
  assert.equal(nativeMessagesSent.at(-1).translatedCount, 21);

  // Mount content.js in a mock iframe running conversation with a Working status
  const statusBadge = h("div", "Working");
  const inputBox = h("textarea", { value: "" });
  const doc = makeDoc(statusBadge, inputBox);
  const MockMO = createMockMutationObserverClass();
  MockMO.instances = [];

  const fastSetTimeout = (fn, ms) => setTimeout(fn, Math.min(ms, 25));
  const contentBrowser = {
    runtime: {
      async sendMessage(msg) {
        for (const fn of bgRuntimeListeners) {
          const r = fn(msg, { tab: { id: 1 }, frameId: 2 });
          if (r && typeof r.then === "function") return await r;
        }
        return undefined;
      },
      onMessage: { addListener: (fn) => contentRuntimeListeners.push(fn) }
    },
    storage: {
      local: bgBrowser.storage.local,
      onChanged: { addListener() {} }
    }
  };

  const contentCtx = {
    globalThis: null,
    AG_I18N_DICT: dictZh,
    AG_I18N_TRANSLATOR: translatorLib,
    document: doc,
    browser: contentBrowser,
    location: { href: "https://antigravity.static.usercontent.goog/web/2.34.0/" },
    MutationObserver: MockMO,
    Event: class MockEvent { constructor(t) { this.type = t; } },
    dispatchEvent(ev) { wokeEvents.push(ev.type); },
    Object, Array, String, Number, Boolean, Promise, Date, Math,
    setTimeout: fastSetTimeout,
    clearTimeout
  };
  contentCtx.globalThis = contentCtx;
  vm.createContext(contentCtx);
  vm.runInContext(contentSource, contentCtx);

  await new Promise((r) => setTimeout(r, 15));

  // Trigger APP_RESUMED from Android -> wakes events and detects frozen stream -> STREAM_STALLED(hasDraft=false)
  for (const fn of portMessageListeners) {
    fn({ type: "APP_RESUMED", backgroundMs: 6000 });
  }
  await new Promise((r) => setTimeout(r, 60));

  assert.ok(wokeEvents.includes("online"));
  assert.ok(wokeEvents.includes("focus"));
  const stalledNoDraft = nativeMessagesSent.find((m) => m.type === "STREAM_STALLED");
  assert.ok(stalledNoDraft, "Expected STREAM_STALLED when running conversation freezes after resume");
  assert.equal(stalledNoDraft.hasDraft, false);

  // Now put unsent draft in textarea -> STREAM_STALLED must report hasDraft=true
  nativeMessagesSent.length = 0;
  inputBox.value = "请继续优化";
  for (const fn of portMessageListeners) {
    fn({ type: "APP_RESUMED", backgroundMs: 6000 });
  }
  await new Promise((r) => setTimeout(r, 60));

  const stalledWithDraft = nativeMessagesSent.find((m) => m.type === "STREAM_STALLED");
  assert.ok(stalledWithDraft);
  assert.equal(stalledWithDraft.hasDraft, true);
});

// ---------------------------------------------------------------------------
// 11. Cellular/VPN Loading & Resume Optimization Tests (v1.0.3)
// ---------------------------------------------------------------------------
test("preconnect.js injects preconnect & dns-prefetch links and is idempotent on re-run", () => {
  const preconnectSource = fs.readFileSync(path.join(EXT_DIR, "preconnect.js"), "utf8");
  const doc = new MockDocument();
  const head = new MockElement("head");
  doc.head = head;
  doc.documentElement.appendChild(head);

  const ctx = {
    globalThis: null,
    document: doc,
    Object,
    Array,
    String,
    Boolean
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(preconnectSource, ctx);

  const firstRunCount = head.childNodes.length;
  assert.equal(firstRunCount, 8);
  assert.ok(
    head.childNodes.some(
      (n) =>
        n.tagName === "LINK" &&
        n.getAttribute("rel") === "preconnect" &&
        n.getAttribute("href") === "https://antigravity.static.usercontent.goog"
    ),
    "Expected <link rel='preconnect' href='https://antigravity.static.usercontent.goog'>"
  );
  assert.ok(
    head.childNodes.some(
      (n) =>
        n.tagName === "LINK" &&
        n.getAttribute("rel") === "preconnect" &&
        n.getAttribute("href") === "https://fonts.gstatic.com" &&
        n.getAttribute("crossorigin") === "anonymous"
    ),
    "Expected crossorigin='anonymous' for fonts.gstatic.com"
  );

  // Re-running script in same context must be a no-op
  vm.runInContext(preconnectSource, ctx);
  assert.equal(head.childNodes.length, firstRunCount);

  // Even if guard is cleared, existing link deduplication prevents duplicate hints
  ctx.__AG_PRECONNECT_INJECTED__ = false;
  vm.runInContext(preconnectSource, ctx);
  assert.equal(head.childNodes.length, firstRunCount);
});

function mountContentForStallTest({ href, bodyChildren, navigatorObj = {} }) {
  const contentSource = fs.readFileSync(path.join(EXT_DIR, "content.js"), "utf8");
  const doc = makeDoc(...bodyChildren);
  doc.removeEventListener = (type, fn) => {
    const list = doc._listeners.get(type);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  };

  const sentMessages = [];
  const runtimeListeners = [];
  const scheduledDelays = [];
  const MockMO = createMockMutationObserverClass();
  MockMO.instances = [];

  const fastSetTimeout = (fn, ms) => {
    scheduledDelays.push(ms);
    return setTimeout(fn, Math.min(ms, 40));
  };

  const locationObj = { href };
  const ctx = {
    globalThis: null,
    AG_I18N_DICT: dictZh,
    AG_I18N_TRANSLATOR: translatorLib,
    document: doc,
    location: locationObj,
    navigator: navigatorObj,
    MutationObserver: MockMO,
    Event: class MockEvent { constructor(t) { this.type = t; } },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
    browser: {
      runtime: {
        async sendMessage(msg) {
          if (msg?.type === "GET_CONFIG") {
            return { enabled: true, customDict: {} };
          }
          sentMessages.push(msg);
          return { ok: true };
        },
        onMessage: { addListener: (fn) => runtimeListeners.push(fn) }
      },
      storage: {
        local: { async get() { return { enabled: true, customDict: {} }; } },
        onChanged: { addListener() {} }
      }
    },
    Object, Array, String, Number, Boolean, Promise, Date, Math,
    setTimeout: fastSetTimeout,
    clearTimeout
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(contentSource, ctx);

  return { doc, locationObj, sentMessages, runtimeListeners, scheduledDelays };
}

test("outer portal shell frame NEVER sends STREAM_STALLED even after long background", async () => {
  const { runtimeListeners, sentMessages } = mountContentForStallTest({
    href: "https://antigravity.google.com/r/sample-machine",
    bodyChildren: [h("div", "Working"), h("textarea", { value: "" })]
  });

  await new Promise((r) => setTimeout(r, 15));
  for (const fn of runtimeListeners) {
    fn({ type: "APP_RESUMED", backgroundMs: 60000 });
  }
  await new Promise((r) => setTimeout(r, 70));

  assert.equal(
    sentMessages.some((m) => m.type === "STREAM_STALLED"),
    false,
    "Outer shell frame must never report STREAM_STALLED"
  );
});

test("idle inner iframe without running task NEVER sends STREAM_STALLED even after long background", async () => {
  const { runtimeListeners, sentMessages } = mountContentForStallTest({
    href: "https://antigravity.static.usercontent.goog/web/2.34.0/c/idle-conv",
    bodyChildren: [h("div", "Connected"), h("textarea", { value: "" })]
  });

  await new Promise((r) => setTimeout(r, 15));
  for (const fn of runtimeListeners) {
    fn({ type: "APP_RESUMED", backgroundMs: 60000 });
  }
  await new Promise((r) => setTimeout(r, 70));

  assert.equal(
    sentMessages.some((m) => m.type === "STREAM_STALLED"),
    false,
    "Idle inner iframe without running indicator must not trigger reload"
  );
});

test("active inner iframe uses adaptive cellular timeout and cancels stall reload on user interaction or URL change", async () => {
  // 1. Active running task on cellular network -> uses 6500ms watch window and reports STREAM_STALLED if frozen
  const cell = mountContentForStallTest({
    href: "https://antigravity.static.usercontent.goog/web/2.34.0/c/active-1",
    bodyChildren: [h("div", "Working"), h("textarea", { value: "" })],
    navigatorObj: { connection: { type: "cellular", effectiveType: "4g", rtt: 220 } }
  });

  await new Promise((r) => setTimeout(r, 15));
  for (const fn of cell.runtimeListeners) {
    fn({ type: "APP_RESUMED", backgroundMs: 12000 });
  }
  await new Promise((r) => setTimeout(r, 70));

  assert.ok(cell.scheduledDelays.includes(6500), "Expected slow/cellular 6500ms stall watch window");
  assert.equal(cell.sentMessages.filter((m) => m.type === "STREAM_STALLED").length, 1);

  // 2. Active running task -> user taps during watch window -> cancels STREAM_STALLED
  const interacted = mountContentForStallTest({
    href: "https://antigravity.static.usercontent.goog/web/2.34.0/c/active-2",
    bodyChildren: [h("div", "Thinking"), h("textarea", { value: "" })],
    navigatorObj: { connection: { type: "wifi", effectiveType: "4g", rtt: 40 } }
  });

  await new Promise((r) => setTimeout(r, 15));
  for (const fn of interacted.runtimeListeners) {
    fn({ type: "APP_RESUMED", backgroundMs: 12000 });
  }
  assert.ok(interacted.scheduledDelays.includes(4500), "Expected base 4500ms stall watch window on fast network");
  await new Promise((r) => setTimeout(r, 10));
  interacted.doc.dispatchEvent({ type: "pointerdown" });
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(
    interacted.sentMessages.some((m) => m.type === "STREAM_STALLED"),
    false,
    "User pointerdown during watch window must cancel STREAM_STALLED"
  );

  // 3. Active running task -> URL navigates during watch window -> cancels STREAM_STALLED
  const navigated = mountContentForStallTest({
    href: "https://antigravity.static.usercontent.goog/web/2.34.0/c/active-3",
    bodyChildren: [h("div", "Working"), h("textarea", { value: "" })]
  });

  await new Promise((r) => setTimeout(r, 15));
  for (const fn of navigated.runtimeListeners) {
    fn({ type: "APP_RESUMED", backgroundMs: 12000 });
  }
  await new Promise((r) => setTimeout(r, 10));
  navigated.locationObj.href = "https://antigravity.static.usercontent.goog/web/2.34.0/c/active-4";
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(
    navigated.sentMessages.some((m) => m.type === "STREAM_STALLED"),
    false,
    "Route change during watch window must cancel STREAM_STALLED"
  );
});

test("translator.js avoids getComputedStyle on non-matching & multi-word nodes while protecting icon ligatures", () => {
  const dictSource = fs.readFileSync(path.join(EXT_DIR, "dict_zh.js"), "utf8");
  const translatorSource = fs.readFileSync(path.join(EXT_DIR, "translator.js"), "utf8");

  let computedStyleCalls = 0;
  const sandbox = {
    globalThis: null,
    getComputedStyle(el) {
      computedStyleCalls++;
      return el.getAttribute("data-icon-font") === "true"
        ? { fontFamily: '"Material Symbols Outlined"' }
        : { fontFamily: "Inter, sans-serif" };
    },
    Set, Map, WeakMap, WeakRef, Object, Array, String, Number, Boolean, RegExp, Error,
    setTimeout, clearTimeout
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(dictSource, sandbox);
  vm.runInContext(translatorSource, sandbox);

  const prose1 = h("div", h("span", "Unmatched streaming response message text from assistant"));
  const prose2 = h("p", "Another unmatched arbitrary log output line src/App.kt");
  const btnNew = h("button", "New Conversation");
  const btnAllow = h("button", "Allow once");
  const capLabel = h("span", "Feedback");
  const iconSpan = h("span", { "data-icon-font": "true" }, "feedback");
  const doc = makeDoc(prose1, prose2, btnNew, btnAllow, capLabel, iconSpan);

  const instance = sandbox.AG_I18N_TRANSLATOR.createTranslator({ dict: sandbox.AG_I18N_DICT });
  instance.translateTree(doc);

  assert.equal(btnNew.textContent, "新对话");
  assert.equal(btnAllow.textContent, "仅允许这一次");
  assert.equal(capLabel.textContent, "反馈");
  assert.equal(iconSpan.textContent, "feedback");
  assert.equal(
    computedStyleCalls,
    1,
    `Expected getComputedStyle only for lowercase ligature candidate, got ${computedStyleCalls} calls`
  );
});

// ---------------------------------------------------------------------------
// 12. Session Probe & Quick Conversation Switcher Tests (v1.1.0)
// ---------------------------------------------------------------------------
test("session_probe.js loads cleanly as plain script and filters/prioritizes recent active conversations", () => {
  const probeSource = fs.readFileSync(path.join(EXT_DIR, "session_probe.js"), "utf8");
  const probeSandbox = {
    globalThis: null,
    Object, Array, String, Number, Boolean, RegExp, Map, Set, Math, Date, BigInt
  };
  probeSandbox.globalThis = probeSandbox;
  vm.createContext(probeSandbox);
  vm.runInContext(probeSource, probeSandbox);
  const probe = probeSandbox.AG_SESSION_PROBE;
  assert.ok(probe, "AG_SESSION_PROBE should attach cleanly");

  const reduxState = {
    trajectorySummaries: {
      summaries: {
        "cid-archived": {
          summary: "Archived Old",
          status: 1,
          annotations: { archived: true },
          lastModifiedTime: { seconds: 9999999n }
        },
        "cid-subagent": {
          summary: "Subagent Worker",
          status: 2,
          trajectoryMetadata: { parentConversationId: "cid-idle-1" },
          lastModifiedTime: { seconds: 9999998n }
        },
        "cid-battle-fork": {
          summary: "Battle Arm",
          status: 1,
          trajectoryMetadata: { isBattleModeFork: true },
          lastModifiedTime: { seconds: 9999997n }
        },
        "cid-hidden": {
          summary: "Hidden Tool",
          status: 1,
          trajectoryMetadata: { sourceMetadata: { hideFromConversationList: true } },
          lastModifiedTime: { seconds: 9999996n }
        },
        "cid-side-q": {
          summary: "Side Question",
          status: 1,
          trajectoryType: 22,
          lastModifiedTime: { seconds: 9999995n }
        },
        "cid-commit-msg": {
          summary: "Commit Message Helper",
          status: 1,
          trajectoryType: 23,
          lastModifiedTime: { seconds: 9999994n }
        },
        "cid-idle-old": {
          summary: "Old Idle Chat",
          status: 1,
          stepCount: 5,
          lastModifiedTime: { seconds: 1000n }
        },
        "cid-idle-mid": {
          summary: "Mid Idle Chat",
          status: 1,
          trajectoryType: 17,
          stepCount: 12,
          workspaces: [{ workspaceFolderAbsoluteUri: "file:///tmp/demo-repo-a" }],
          lastModifiedTime: { seconds: 2000n }
        },
        "cid-idle-new": {
          summary: "Newest Idle Chat",
          status: 1,
          trajectoryType: 4,
          stepCount: 18,
          workspaces: [{ workspaceFolderAbsoluteUri: "file:///tmp/antigravity-remote-android" }],
          trajectoryMetadata: { projectId: "proj-1" },
          lastModifiedTime: { seconds: 5000n }
        },
        "cid-running-1": {
          summary: "Running Build Task",
          status: 2,
          trajectoryType: 4,
          stepCount: 31,
          workspaces: [{ workspaceFolderAbsoluteUri: "file:///tmp/workspace-alpha" }],
          lastModifiedTime: { seconds: 1500n }
        },
        "cid-waiting-1": {
          summary: "Approval Pending",
          status: 1,
          waitingSteps: [{ stepIndex: 4 }],
          stepCount: 9,
          lastModifiedTime: { seconds: 1200n }
        }
      },
      externalSummaries: {
        "cid-idle-ext": {
          summary: "External Idle",
          status: 1,
          lastModifiedTime: { seconds: 3500n }
        }
      }
    }
  };

  const recent = probe.extractRecentConversations(reduxState, makeDoc(), "cid-running-1", 5);
  assert.equal(recent.length, 5);
  // Active running/waiting items must rank ahead of newer idle items
  assert.equal(recent[0].cascadeId, "cid-running-1");
  assert.equal(recent[0].status, "running");
  assert.equal(recent[0].isCurrent, true);
  assert.equal(recent[0].workspaceName, "workspace-alpha");

  assert.equal(recent[1].cascadeId, "cid-waiting-1");
  assert.equal(recent[1].status, "waiting");

  assert.equal(recent[2].cascadeId, "cid-idle-new");
  assert.equal(recent[2].status, "idle");
  assert.equal(recent[2].projectId, "proj-1");
  assert.equal(recent[2].workspaceName, "antigravity-remote-android");
  assert.equal(recent[2].lastActiveMs, 5000000);

  assert.equal(recent[3].cascadeId, "cid-idle-ext");
  assert.equal(recent[4].cascadeId, "cid-idle-mid");

  const killedCheck = probe.extractRecentConversations(
    {
      trajectorySummaries: {
        summaries: {
          "cid-killed": {
            summary: "Killed Run",
            status: 2,
            killed: true,
            trajectoryType: 4,
            lastModifiedTime: { seconds: 6000n }
          }
        }
      }
    },
    makeDoc(),
    "",
    5
  );
  assert.equal(killedCheck.length, 1);
  assert.equal(killedCheck[0].status, "idle");
});

test("session_probe.js extracts contextWindowUsage, costSummary, compacted count, and 4-state status", () => {
  const probe = require(path.join(EXT_DIR, "session_probe.js"));

  const reduxState = {
    trajectorySummaries: {
      summaries: {
        "cid-1": { summary: "Context Demo", status: 2, stepCount: 44, waitingSteps: [] },
        "cid-wait": { summary: "Waiting Demo", status: 1, waitingSteps: [{ stepIndex: 3 }] }
      }
    },
    modelSelection: {
      byConversation: {
        "cid-1": { customLabel: "Claude Sonnet 4.6", contextWindow: 200000 }
      }
    }
  };

  const aspRunning = {
    status: 2,
    contextWindowUsage: {
      estimatedTokensUsed: 84000n,
      maxContextTokens: 200000n
    },
    costSummary: {
      total: {
        cumulativeTotal: {
          input: { tokens: 12000n },
          cacheRead: { tokens: 88000n },
          output: { tokens: 3200n },
          thinking: { tokens: 1100n },
          generationCount: 6,
          pricing: { modelName: "Gemini 3.1 Pro" }
        }
      }
    },
    compactedAtStepIndices: [12, 28],
    hasActiveChildren: true,
    backgroundCommands: [{ pid: 1 }, { pid: 2 }],
    trajectorySlice: { totalStepsLength: 48 }
  };

  const runningCtx = probe.extractContextTelemetry(aspRunning, reduxState, makeDoc(), "cid-1", { onLine: true });
  assert.equal(runningCtx.status, "running");
  assert.equal(runningCtx.modelName, "Gemini 3.1 Pro");
  assert.equal(runningCtx.usedTokens, 84000);
  assert.equal(runningCtx.maxTokens, 200000);
  assert.equal(runningCtx.contextPct, 42);
  assert.equal(runningCtx.inputTokens, 12000);
  assert.equal(runningCtx.cacheReadTokens, 88000);
  assert.equal(runningCtx.cacheHitPct, 88);
  assert.equal(runningCtx.outputTokens, 3200);
  assert.equal(runningCtx.thinkingTokens, 1100);
  assert.equal(runningCtx.compactedCount, 2);
  assert.equal(runningCtx.stepCount, 48);
  assert.equal(runningCtx.activeSubagents, true);
  assert.equal(runningCtx.backgroundCmdCount, 2);

  // Fallback when contextWindowUsage is missing -> derives from turnCosts & modelSelection
  const aspFallback = {
    status: 1,
    costSummary: {
      turnCosts: {
        t1: { turn: { input: { tokens: 10000n }, cacheRead: { tokens: 50000n } } }
      }
    },
    trajectorySlice: { lastStepError: { isBenign: false, shortError: "Rate limited" } }
  };
  const errCtx = probe.extractContextTelemetry(aspFallback, reduxState, makeDoc(), "cid-1", { onLine: true });
  assert.equal(errCtx.status, "error");
  assert.equal(errCtx.errorMessage, "Rate limited");
  assert.equal(errCtx.usedTokens, 60000);
  assert.equal(errCtx.maxTokens, 200000);
  assert.equal(errCtx.contextPct, 30);
  assert.equal(errCtx.modelName, "Claude Sonnet 4.6");

  // Waiting state
  const waitCtx = probe.extractContextTelemetry({ status: 1 }, reduxState, makeDoc(), "cid-wait", { onLine: true });
  assert.equal(waitCtx.status, "waiting");

  // Idle state
  const idleCtx = probe.extractContextTelemetry({ status: 1 }, { trajectorySummaries: { summaries: {} } }, makeDoc(), "cid-idle", { onLine: true });
  assert.equal(idleCtx.status, "idle");
});

test("session_probe.js discovers Fiber providers via wrappedJSObject and switches via router + cloneInto or DOM fallback", () => {
  const probe = require(path.join(EXT_DIR, "session_probe.js"));

  const navCalls = [];
  const clonedObjects = [];
  const cloneTargets = [];
  const fakePageWin = { name: "page-window" };
  const fakeStore = {
    getState() {
      return {
        trajectorySummaries: {
          summaries: {
            "cid-a": { summary: "Session A", status: 1, lastModifiedTime: { seconds: 100 } },
            "cid-b": { summary: "Session B", status: 2, trajectoryMetadata: { projectId: "proj-b" }, lastModifiedTime: { seconds: 200 } }
          }
        }
      };
    }
  };
  const fakeRouter = {
    state: {
      location: {
        pathname: "/c/cid-a",
        search: { project: "proj-a", focused: "step-1", hostThemePalette: [1, "", ""] }
      }
    },
    navigate(opts) {
      navCalls.push(opts);
    }
  };
  const fakeTrajCtx = {
    subscribe() { return () => {}; },
    peek(cid) {
      return cid === "cid-a"
        ? {
            getState() {
              return {
                status: 1,
                contextWindowUsage: { estimatedTokensUsed: 40000, maxContextTokens: 200000 }
              };
            }
          }
        : null;
    }
  };

  const leafFiber = { memoizedProps: { value: fakeTrajCtx }, child: null, sibling: null };
  const routerFiber = { memoizedProps: { value: fakeRouter }, child: leafFiber, sibling: null };
  const rootFiber = { memoizedProps: { value: { store: fakeStore } }, child: routerFiber, sibling: null };

  const rootDiv = h("div", { id: "root" });
  const rawRoot = { __reactFiber$test123: rootFiber };
  rootDiv.wrappedJSObject = rawRoot;

  const doc = makeDoc(rootDiv);
  doc.getElementById = (id) => (id === "root" ? rootDiv : null);

  const scope = {
    wrappedJSObject: fakePageWin,
    location: { pathname: "/c/cid-a" },
    navigator: { onLine: true },
    cloneInto(obj, target) {
      clonedObjects.push(obj);
      cloneTargets.push(target);
      return JSON.parse(JSON.stringify(obj));
    }
  };

  const snap = probe.collectSnapshot(doc, scope);
  assert.equal(snap.currentConversationId, "cid-a");
  assert.equal(snap.context.contextPct, 20);
  assert.equal(snap.recentConversations[0].cascadeId, "cid-b");
  assert.equal(snap.recentConversations[0].status, "running");

  const swRes = probe.switchConversation(doc, scope, "cid-b", "proj-b");
  assert.deepEqual(swRes, { switched: true, method: "router" });
  assert.equal(clonedObjects.length, 1);
  assert.equal(cloneTargets[0], fakePageWin);
  assert.equal(navCalls.length, 1);
  assert.equal(navCalls[0].to, "/c/$cascadeId");
  assert.deepEqual(navCalls[0].params, { cascadeId: "cid-b" });
  assert.deepEqual(navCalls[0].search, { project: "proj-b", hostThemePalette: [1, "", ""] });

  // DOM click fallback when no router is mounted
  let clicked = false;
  const fallbackRow = h("div", { "data-testid": "conversation-row-sidebar", "data-cascade-id": "cid-dom" }, "DOM Row");
  fallbackRow.click = () => { clicked = true; };
  const domOnlyDoc = makeDoc(fallbackRow);
  domOnlyDoc.querySelectorAll = (sel) => (sel.includes("conversation-row-") ? [fallbackRow] : []);
  const domRes = probe.switchConversation(domOnlyDoc, { navigator: {} }, "cid-dom", "");
  assert.deepEqual(domRes, { switched: true, method: "dom_click" });
  assert.equal(clicked, true);
});

test("background.js and content.js relay REQUEST_SNAPSHOT -> SESSION_SNAPSHOT and SWITCH_CONVERSATION -> SWITCH_RESULT", async () => {
  const bgSource = fs.readFileSync(path.join(EXT_DIR, "background.js"), "utf8");
  const probeSource = fs.readFileSync(path.join(EXT_DIR, "session_probe.js"), "utf8");
  const contentSource = fs.readFileSync(path.join(EXT_DIR, "content.js"), "utf8");

  const nativeMessagesSent = [];
  const portMessageListeners = [];
  const bgRuntimeListeners = [];
  const contentRuntimeListeners = [];

  const mockPort = {
    postMessage(msg) { nativeMessagesSent.push(JSON.parse(JSON.stringify(msg))); },
    onMessage: { addListener: (fn) => portMessageListeners.push(fn) },
    onDisconnect: { addListener() {} },
    disconnect() {}
  };

  const bgBrowser = {
    runtime: {
      connectNative: () => mockPort,
      onMessage: { addListener: (fn) => bgRuntimeListeners.push(fn) }
    },
    storage: {
      local: { async get() { return { enabled: true, customDict: {} }; }, async set() {} }
    },
    tabs: {
      async query() { return [{ id: 7, url: "https://antigravity.google.com/r/m1" }]; },
      async sendMessage(_tabId, payload) {
        for (const fn of contentRuntimeListeners) fn(payload);
      },
      onRemoved: { addListener() {} }
    }
  };

  const bgCtx = {
    browser: bgBrowser,
    Map, Object, Array, String, Number, Boolean, Promise, JSON, Math, setTimeout, clearTimeout
  };
  vm.createContext(bgCtx);
  vm.runInContext(bgSource, bgCtx);

  const probeSandbox = {
    globalThis: null,
    Object, Array, String, Number, Boolean, RegExp, Map, Set, Math, Date, BigInt, Promise, JSON, setTimeout, clearTimeout
  };
  probeSandbox.globalThis = probeSandbox;
  vm.createContext(probeSandbox);
  vm.runInContext(probeSource, probeSandbox);

  let switchedArgs = null;
  const fakeRouter = {
    state: { location: { pathname: "/c/cid-cur", search: {} } },
    navigate(opts) {
      switchedArgs = opts;
      fakeRouter.state.location.pathname = "/c/" + opts.params.cascadeId;
      return Promise.resolve();
    }
  };
  const fakeStore = {
    getState() {
      return {
        trajectorySummaries: {
          summaries: {
            "cid-cur": { summary: "Current", status: 1, lastModifiedTime: { seconds: 100 } },
            "cid-next": { summary: "Next Task", status: 2, trajectoryMetadata: { projectId: "p-2" }, lastModifiedTime: { seconds: 300 } }
          }
        }
      };
    }
  };
  const fakeTrajCtx = {
    subscribe() { return () => {}; },
    peek() {
      return { getState: () => ({ status: 1, contextWindowUsage: { estimatedTokensUsed: 50000, maxContextTokens: 200000 } }) };
    }
  };

  const rootDiv = h("div", { id: "root" });
  rootDiv.__reactFiber$x = {
    memoizedProps: { value: { store: fakeStore } },
    child: {
      memoizedProps: { value: fakeRouter },
      child: { memoizedProps: { value: fakeTrajCtx }, child: null, sibling: null },
      sibling: null
    },
    sibling: null
  };
  const doc = makeDoc(rootDiv);
  doc.getElementById = (id) => (id === "root" ? rootDiv : null);

  const contentBrowser = {
    runtime: {
      async sendMessage(msg) {
        for (const fn of bgRuntimeListeners) {
          const r = fn(msg, { tab: { id: 7 }, frameId: 2 });
          if (r && typeof r.then === "function") return await r;
        }
        return undefined;
      },
      onMessage: { addListener: (fn) => contentRuntimeListeners.push(fn) }
    },
    storage: { local: bgBrowser.storage.local, onChanged: { addListener() {} } }
  };

  const contentCtx = {
    globalThis: null,
    AG_I18N_DICT: dictZh,
    AG_I18N_TRANSLATOR: translatorLib,
    AG_SESSION_PROBE: probeSandbox.AG_SESSION_PROBE,
    document: doc,
    browser: contentBrowser,
    location: { href: "https://antigravity.static.usercontent.goog/web/2.34.0/c/cid-cur", pathname: "/web/2.34.0/c/cid-cur" },
    navigator: { onLine: true },
    MutationObserver: createMockMutationObserverClass(),
    Object, Array, String, Number, Boolean, Promise, Date, Math,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 20)),
    clearTimeout
  };
  contentCtx.globalThis = contentCtx;
  vm.createContext(contentCtx);
  vm.runInContext(contentSource, contentCtx);

  await new Promise((r) => setTimeout(r, 30));
  nativeMessagesSent.length = 0;

  for (const fn of portMessageListeners) {
    fn({ type: "REQUEST_SNAPSHOT" });
  }
  await new Promise((r) => setTimeout(r, 20));
  const snapMsg = nativeMessagesSent.find((m) => m.type === "SESSION_SNAPSHOT");
  assert.ok(snapMsg, "Expected SESSION_SNAPSHOT after REQUEST_SNAPSHOT");
  assert.equal(snapMsg.currentConversationId, "cid-cur");
  assert.equal(snapMsg.context.contextPct, 25);
  assert.equal(snapMsg.recentConversations.length, 2);

  nativeMessagesSent.length = 0;
  for (const fn of portMessageListeners) {
    fn({ type: "SWITCH_CONVERSATION", requestId: "sw_9", cascadeId: "cid-next", projectId: "p-2" });
  }
  await new Promise((r) => setTimeout(r, 20));
  const swMsg = nativeMessagesSent.find((m) => m.type === "SWITCH_RESULT");
  assert.ok(swMsg, "Expected SWITCH_RESULT after SWITCH_CONVERSATION");
  assert.equal(swMsg.requestId, "sw_9");
  assert.equal(swMsg.switched, true);
  assert.equal(switchedArgs?.params?.cascadeId, "cid-next");
});

test("session_probe.js discovers providers inside active conversation via React 18/19 __reactContainer$ and upward .return climb without list DOM", () => {
  const probe = require(path.join(EXT_DIR, "session_probe.js"));

  const fakeStore = {
    getState() {
      return {
        trajectorySummaries: {
          summaries: {
            "cid-active": { summary: "Active Conversation", status: 2, lastModifiedTime: { seconds: 300 } },
            "cid-other": { summary: "Other Recent Chat", status: 1, lastModifiedTime: { seconds: 200 } }
          }
        }
      };
    }
  };
  const fakeRouter = {
    state: { location: { pathname: "/c/cid-active", search: {} } },
    navigate() {}
  };
  const fakeTrajCtx = {
    subscribe() { return () => {}; },
    peek(cid) {
      return cid === "cid-active"
        ? { getState: () => ({ status: 2, contextWindowUsage: { estimatedTokensUsed: 90000, maxContextTokens: 200000 } }) }
        : null;
    }
  };

  // Simulate React 18/19: #root uses __reactContainer$ (HostRoot -> Provider ancestors), and deep conversation-view has __reactFiber$ with .return chain
  const storeFiber = { memoizedProps: { value: { store: fakeStore } }, child: null, sibling: null, return: null };
  const routerFiber = { memoizedProps: { value: fakeRouter }, child: null, sibling: null, return: storeFiber };
  const trajFiber = { memoizedProps: { value: fakeTrajCtx }, child: null, sibling: null, return: routerFiber };
  const convFiber = { memoizedProps: {}, child: null, sibling: null, return: trajFiber };
  storeFiber.child = routerFiber;
  routerFiber.child = trajFiber;
  trajFiber.child = convFiber;

  const rootDiv = h("div", { id: "root" });
  rootDiv.wrappedJSObject = {
    __reactContainer$r19: { current: storeFiber }
  };

  const convView = h("div", { "data-testid": "conversation-view", "data-cascade-id": "cid-active" });
  convView.wrappedJSObject = { __reactFiber$conv1: convFiber };
  rootDiv.appendChild(convView);

  const doc = makeDoc(rootDiv);
  doc.getElementById = (id) => (id === "root" ? rootDiv : null);
  doc.querySelector = (sel) => (sel.includes("conversation-view") ? convView : null);
  doc.querySelectorAll = () => []; // Zero list rows in DOM!

  const snap = probe.collectSnapshot(doc, { location: { pathname: "/c/cid-active" }, navigator: { onLine: true } });
  assert.equal(snap.probeMeta.hasStore, true);
  assert.equal(snap.probeMeta.hasRouter, true);
  assert.equal(snap.probeMeta.hasAsp, true);
  assert.equal(snap.probeMeta.summaryCount, 2);
  assert.equal(snap.recentConversations.length, 2);
  assert.equal(snap.recentConversations[0].cascadeId, "cid-active");
  assert.equal(snap.recentConversations[1].cascadeId, "cid-other");
  assert.equal(snap.context.contextPct, 45);
});

test("session_probe.js switchConversationAsync verifies async router.navigate resolution, rejection, and no-op fallback", async () => {
  const probe = require(path.join(EXT_DIR, "session_probe.js"));

  function makeRouterDoc(routerObj) {
    const rootDiv = h("div", { id: "root" });
    rootDiv.wrappedJSObject = {
      __reactFiber$sw: {
        memoizedProps: { value: routerObj },
        child: null,
        sibling: null
      }
    };
    const d = makeDoc(rootDiv);
    d.getElementById = (id) => (id === "root" ? rootDiv : null);
    d.querySelectorAll = () => [];
    return d;
  }

  // Case 1: resolves AND updates pathname -> switched: true
  const okRouter = {
    state: { location: { pathname: "/c/cid-start", search: {} } },
    navigate(opts) {
      okRouter.state.location.pathname = "/c/" + opts.params.cascadeId;
      return Promise.resolve();
    }
  };
  const okRes = await probe.switchConversationAsync(
    makeRouterDoc(okRouter),
    { location: { pathname: "/c/cid-start" }, navigator: {} },
    "cid-target",
    ""
  );
  assert.deepEqual(okRes, { switched: true, method: "router", error: "" });

  // Case 2: rejects Promise -> switched: false, method: router_error
  const rejRouter = {
    state: { location: { pathname: "/c/cid-start", search: {} } },
    navigate() {
      return Promise.reject(new Error("Permission denied"));
    }
  };
  const rejRes = await probe.switchConversationAsync(
    makeRouterDoc(rejRouter),
    { location: { pathname: "/c/cid-start" }, navigator: {} },
    "cid-target",
    ""
  );
  assert.deepEqual(rejRes, { switched: false, method: "router_error", error: "Permission denied" });

  // Case 3: resolves WITHOUT changing pathname -> switched: false, location_unchanged
  const noopRouter = {
    state: { location: { pathname: "/c/cid-start", search: {} } },
    navigate() {
      return Promise.resolve();
    }
  };
  const noopRes = await probe.switchConversationAsync(
    makeRouterDoc(noopRouter),
    { location: { pathname: "/c/cid-start" }, navigator: {}, setTimeout },
    "cid-target",
    ""
  );
  assert.deepEqual(noopRes, { switched: false, method: "router_error", error: "location_unchanged" });
});
