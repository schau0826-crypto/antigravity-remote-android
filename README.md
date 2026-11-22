# Antigravity Remote Android

> Unofficial Android GeckoView wrapper for Google Antigravity Remote Control, featuring persistent Google sign-in, built-in Simplified Chinese UI localization, immersive full-screen ergonomics, and foreground stream auto-recovery.

基于 **Mozilla GeckoView 160 + 内置 WebExtension** 的 Google Antigravity Remote 手机端开源客户端（非官方社区外壳项目）。所有认证与远控通信均直接走官方 [antigravity.google.com](https://antigravity.google.com/) 通道，本地仅做浏览器引擎持久化、移动端展示微调与客户端界面汉化。

---

## 核心特性

- **GeckoView 160 标准内核与持久化登录**
  - 采用 Mozilla GeckoView（标准 Firefox 内核），规避普通 Android `WebView` 被 Google OAuth 拦截的问题；
  - 独立非隐私持久化 Profile，登录态与 Cookie 自动保留；
  - 完整支持 Google 地区 SSO 域名（如 `accounts.google.com.hk` / `google.co.jp` 等）及应用内 OAuth 弹窗叠加视图，授权验证全程不跳出到外部浏览器。
- **内置中文汉化插件 (`ag-remote-zh@agremote.local`, v1.0.2)**
  - 开启 `all_frames: true`，同时覆盖外层入口页与 `antigravity.static.usercontent.goog` 内嵌对话窗口；
  - 内置 480+ 条 Antigravity UI 精准词条与动态正则模板，自带 Material Icons / Symbols 字体连字保护，不损坏网页图标；
  - 严格跳过 `<code>`、`<pre>`、`<textarea>`、代码编辑器及长段 AI/用户对话原文；
  - 支持在悬浮快捷面板一键无损切换「中文 / 英文原版」，并支持在设置中通过 JSON 实时覆盖和扩展词条。
- **沉浸式全屏界面与单手交互**
  - 状态栏与导航栏自适应跟随手机系统浅色/深色模式，Web 画面占满全屏；
  - 右侧边缘提供可上下拖拽的半透明悬浮条，单手点击呼出 Material 3 底部快捷面板（设备列表、返回、刷新、中英切换、桌面/移动 UA 切换、设置与清缓存）。
- **加载提速与后台断流自愈**
  - 应用启动即预热 `GeckoSession`，并自动记住上次连接的机器实例（`/r/...`），下次冷启动直达会话；
  - 主页按返回键采用 `moveTaskToBack(true)` 后台保活，二次切回瞬时恢复；
  - `PRIORITY_HIGH` 保活 + 从后台切回前台时自动派发唤醒事件并检测流是否卡死；检测到断流时自动热同步最新进展，**若输入框内有未发送草稿则仅弹出提醒绝不覆盖输入内容**。

---

## 电脑端准备与手机使用

1. **在电脑端启用 Antigravity Remote Control**
   - 方式一：打开 **Antigravity Desktop**，在设置中开启 **Remote Control**；
   - 方式二：在终端运行：
     ```bash
     agy remote-control start
     ```
2. **确保网络可达**：确认手机当前网络可访问 `antigravity.google.com` 与 `accounts.google.com`。
3. **安装与使用**：
   - 将构建生成的 APK 安装到 Android 手机（`minSdk 26`，默认 `arm64-v8a`）；
   - 打开 App 完成一次 Google 账号登录即可长期免登使用；
   - 点击右侧边缘悬浮条呼出快捷面板，或在「更多设置 → 自定义汉化词典」里输入 JSON 键值对热更新翻译：
     ```json
     {
       "Remote Control": "远程控制",
       "Allow in sandbox": "允许在沙盒中运行"
     }
     ```

---

## 从源码构建与测试

### 环境要求
- **JDK 17 或 JDK 21**（例如 Android Studio 内置 JBR）
- **Android SDK**（`compileSdk 36`、`targetSdk 35`、`minSdk 26`）
- **Node.js 18+**（运行 WebExtension JS 单元测试）

### 本地配置 `local.properties`
仓库默认忽略 `local.properties`（本机路径不会提交到 Git），构建前请在项目根目录创建该文件并指向你的本地 Android SDK：

```properties
sdk.dir=/path/to/your/Android/sdk
```

### 常用命令

```bash
# 1. 运行内置 WebExtension 单元测试
node --test tests/i18n.test.mjs

# 2. 运行 Android JVM 单元测试并构建 arm64-v8a Debug APK
./gradlew testDebugUnitTest assembleDebug

# 3. 如需包含全部 ABI 的通用 APK
./gradlew -Puniversal=true assembleDebug

# 4. 通过 ADB 安装到手机
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 免责声明与许可

- 本项目为社区个人开源封装工具，与 Google 或 Mozilla 无官方关联；请遵守相关服务条款并在合法网络环境下使用。
- 本项目基于 [MIT License](LICENSE) 开源。
