(function (root) {
  "use strict";

  /**
   * Simplified Chinese exact dictionary for Google Antigravity 2.0 & Remote Control UI.
   * Keep keys exact UI labels/phrases; code tokens and ambiguous fragments are intentionally omitted.
   */
  const EXACT_DICT = {
    // Navigation & Workspace
    "Antigravity Remote": "Antigravity 远程控制",
    "Remote Control": "远程控制",
    "Remote Access": "远程访问",
    "Remote Session": "远程会话",
    "Remote Sessions": "远程会话",
    "Projects": "项目",
    "Project": "项目",
    "All Projects": "全部项目",
    "Recent Projects": "最近项目",
    "Open Project": "打开项目",
    "Switch Project": "切换项目",
    "No projects found": "未找到项目",
    "Workspace": "工作区",
    "Workspaces": "工作区",
    "Open Workspace": "打开工作区",
    "Switch Workspace": "切换工作区",
    "Conversations": "对话",
    "Conversation": "对话",
    "New Conversation": "新对话",
    "New Chat": "新对话",
    "Recent Conversations": "最近对话",
    "No conversations yet": "暂无对话",
    "No conversations found": "未找到对话",
    "Delete Conversation": "删除对话",
    "Rename Conversation": "重命名对话",
    "Archive Conversation": "归档对话",
    "History": "历史记录",
    "Chat History": "对话历史",
    "Conversation History": "对话历史",
    "Clear History": "清空历史记录",
    "Files": "文件",
    "File": "文件",
    "File Explorer": "文件浏览器",
    "Explorer": "资源管理器",
    "Files Changed": "已更改文件",
    "Changed Files": "已更改的文件",
    "Open Files": "打开的文件",
    "Recent Files": "最近的文件",
    "No files": "暂无文件",
    "No files found": "未找到文件",
    "Artifacts": "产物",
    "Artifact": "产物",
    "View Artifact": "查看产物",
    "Implementation Plan": "实现方案",
    "Task List": "任务列表",
    "Walkthrough": "功能说明",
    "Summary": "摘要",
    "Terminals": "终端",
    "Terminal": "终端",
    "New Terminal": "新建终端",
    "Kill Terminal": "终止终端",
    "Clear Terminal": "清空终端",
    "Terminal Output": "终端输出",
    "Output": "输出",
    "Console": "控制台",
    "Logs": "日志",
    "View Logs": "查看日志",
    "Subagents": "子智能体",
    "Subagent": "子智能体",
    "Agents": "智能体",
    "Agent": "智能体",
    "Background Tasks": "后台任务",
    "Background Task": "后台任务",
    "Tasks": "任务",
    "Task": "任务",
    "Task Manager": "任务管理器",
    "Running Tasks": "运行中的任务",
    "No background tasks": "暂无后台任务",
    "Overview": "概览",
    "Dashboard": "控制台",
    "Details": "详情",
    "Inspect": "检查",
    "Preview": "预览",
    "Timeline": "时间线",
    "Activity": "动态",
    "Search": "搜索",
    "Filters": "筛选条件",
    "Filter": "筛选",
    "Clear filters": "清除筛选",
    "Reset filters": "重置筛选",
    "Sort by": "排序方式",
    "Newest": "最新优先",
    "Oldest": "最早优先",
    "Most recent": "最近更新",
    "Close": "关闭",
    "Back": "返回",
    "Forward": "前进",
    "Home": "主页",
    "Menu": "菜单",
    "More": "更多",
    "More options": "更多选项",
    "More actions": "更多操作",
    "Options": "选项",
    "Settings": "设置",
    "Preferences": "偏好设置",
    "Account": "账号",
    "Profile": "个人资料",
    "Sign in": "登录",
    "Sign out": "退出登录",
    "Log in": "登录",
    "Log out": "退出登录",
    "Switch account": "切换账号",

    // Connection & Machine States
    "Connected": "已连接",
    "Disconnected": "已断开",
    "Connecting": "连接中",
    "Connecting...": "正在连接...",
    "Reconnecting": "正在重连",
    "Reconnecting...": "正在重连...",
    "Reconnect": "重新连接",
    "Offline": "离线",
    "Online": "在线",
    "Syncing": "同步中",
    "Synced": "已同步",
    "Out of sync": "未同步",
    "Connection lost": "连接已断开",
    "Connection restored": "连接已恢复",
    "Host offline": "主机离线",
    "Host online": "主机在线",
    "Waiting for host...": "正在等待主机响应...",
    "Machine": "主机",
    "Machines": "主机",
    "Device": "设备",
    "Devices": "设备",
    "Desktop": "桌面端",
    "Instance": "实例",
    "Instances": "实例",
    "Host": "主机",
    "Session": "会话",
    "Sessions": "会话",
    "Session active": "会话进行中",
    "End session": "结束会话",
    "Active": "活跃",
    "Inactive": "未激活",
    "Idle": "空闲",
    "Working": "执行中",
    "Waiting": "等待中",
    "Stopped": "已停止",
    "Paused": "已暂停",
    "Resumed": "已恢复",
    "Error": "错误",
    "Warning": "警告",
    "Success": "成功",
    "Info": "提示",
    "Running": "运行中",
    "Queued": "排队中",
    "Pending": "待处理",
    "In Progress": "进行中",
    "Completed": "已完成",
    "Done": "完成",
    "Finished": "已结束",
    "Failed": "失败",
    "Cancelled": "已取消",
    "Canceled": "已取消",
    "Timed out": "已超时",
    "Blocked": "已阻塞",
    "Ready": "就绪",

    // Modes, Models, Slash Commands & Swarm
    "Plan Mode": "规划模式",
    "Agent Mode": "智能体模式",
    "Ask Mode": "问答模式",
    "Edit Mode": "编辑模式",
    "Auto": "自动",
    "Planning": "规划中",
    "Execution": "执行",
    "Executing": "执行中",
    "Verification": "验证",
    "Verifying": "验证中",
    "Fast": "快速",
    "Pro": "专业版",
    "Standard": "标准",
    "Model": "模型",
    "Models": "模型",
    "Select Model": "选择模型",
    "Switch Model": "切换模型",
    "Thinking": "思考中",
    "Thinking...": "思考中...",
    "Reasoning": "推理中",
    "Thought process": "思考过程",
    "Show thinking": "显示思考过程",
    "Hide thinking": "隐藏思考过程",
    "Thought for": "思考用时",
    "Context": "上下文",
    "Context window": "上下文窗口",
    "Add context": "添加上下文",
    "Compact": "精简上下文",
    "Compact conversation": "精简对话",
    "Schedule": "定时任务",
    "Scheduled": "已定时",
    "Swarm": "协作蜂群",
    "Board": "消息看板",
    "Message Board": "消息看板",
    "Workers": "协作智能体",
    "Worker": "协作智能体",
    "Coordinator": "协调者",
    "Slash Commands": "斜杠命令",
    "Commands": "命令",
    "Generating...": "生成中...",
    "Responding...": "回复中...",
    "Searching...": "搜索中...",
    "Reading files...": "正在读取文件...",
    "Editing files...": "正在编辑文件...",
    "Running command...": "正在运行命令...",
    "Analyzing...": "正在分析...",
    "Loading...": "加载中...",
    "Saving...": "保存中...",
    "Applying...": "正在应用...",
    "Step": "步骤",
    "Steps": "步骤",

    // Permission & Human-in-the-loop Actions
    "Allow": "允许",
    "Allow once": "仅允许这一次",
    "Always allow": "始终允许",
    "Allow for this session": "本次会话允许",
    "Allow this session": "本次会话允许",
    "Allow in sandbox": "在沙盒中允许",
    "Allow always": "始终允许",
    "Ask every time": "每次询问",
    "Deny": "拒绝",
    "Deny once": "本次拒绝",
    "Always deny": "始终拒绝",
    "Reject": "驳回",
    "Decline": "拒绝",
    "Block": "拦截",
    "Cancel": "取消",
    "Abort": "中止",
    "Stop": "停止",
    "Stop generating": "停止生成",
    "Pause": "暂停",
    "Resume": "继续",
    "Interrupt": "中断",
    "Approve": "批准",
    "Approved": "已批准",
    "Request approval": "请求批准",
    "Needs approval": "需要批准",
    "Waiting for approval": "等待批准",
    "Waiting for user": "等待用户操作",
    "Waiting for confirmation": "等待确认",
    "Permission required": "需要授权",
    "Review action": "审查操作",
    "Tool execution": "工具执行",
    "Terminal command": "终端命令",
    "File write": "文件写入",
    "Network request": "网络请求",
    "Proceed": "继续执行",
    "Continue": "继续",
    "Skip": "跳过",
    "Ignore": "忽略",
    "Confirm": "确认",
    "Submit": "提交",
    "Send": "发送",
    "Send message": "发送消息",
    "Retry": "重试",
    "Try again": "再试一次",
    "Regenerate": "重新生成",
    "Rerun": "重新运行",
    "Run again": "重新运行",
    "Run": "运行",
    "Run command": "运行命令",
    "Copy": "复制",
    "Copied": "已复制",
    "Copy code": "复制代码",
    "Copy path": "复制路径",
    "Copy link": "复制链接",
    "Copy output": "复制输出",
    "Copy share link": "复制分享链接",
    "Paste": "粘贴",
    "Cut": "剪切",
    "Select all": "全选",
    "Upload": "上传",
    "Attach": "附加",
    "Attach file": "附加文件",
    "Attach image": "附加图片",
    "Add file": "添加文件",
    "Download": "下载",
    "Download all": "全部下载",
    "Open": "打开",
    "Open file": "打开文件",
    "Open in browser": "在浏览器中打开",
    "Open in Antigravity": "在 Antigravity 中打开",
    "Expand": "展开",
    "Expand all": "全部展开",
    "Collapse": "收起",
    "Collapse all": "全部收起",
    "Show more": "显示更多",
    "Show less": "收起部分",
    "Show all": "显示全部",
    "Hide": "隐藏",
    "View": "查看",
    "View all": "查看全部",
    "View details": "查看详情",
    "View diff": "查看差异",
    "Hide diff": "隐藏差异",
    "Accept": "接受",
    "Accept all": "全部接受",
    "Accept changes": "接受更改",
    "Reject all": "全部拒绝",
    "Reject changes": "拒绝更改",
    "Apply": "应用",
    "Apply all": "全部应用",
    "Keep": "保留",
    "Keep all": "全部保留",
    "Discard": "丢弃",
    "Discard all": "全部丢弃",
    "Undo": "撤销",
    "Redo": "重做",
    "Revert": "还原",

    // Review, Diffs & Comments
    "Review Changes": "审查更改",
    "Review": "审查",
    "Start review": "开始审查",
    "Finish review": "完成审查",
    "Submit review": "提交审查",
    "Additions": "新增",
    "Deletions": "删除",
    "Changes": "更改",
    "No changes": "暂无更改",
    "No changes found": "未检测到更改",
    "Uncommitted changes": "未提交的更改",
    "Working tree": "工作区",
    "Staged": "已暂存",
    "Unstaged": "未暂存",
    "Modified": "已修改",
    "Added": "已添加",
    "Deleted": "已删除",
    "Removed": "已移除",
    "Renamed": "已重命名",
    "Untracked": "未跟踪",
    "Conflicted": "存在冲突",
    "Side-by-side": "并排对比",
    "Unified": "合并视图",
    "Inline": "行内对比",
    "Split view": "分栏视图",
    "Unified view": "统一视图",
    "Wrap lines": "自动换行",
    "Ignore whitespace": "忽略空白字符",
    "Add comment": "添加评论",
    "Comment": "评论",
    "Comments": "评论",
    "Leave a comment": "发表评论",
    "Resolve": "解决",
    "Resolved": "已解决",
    "Unresolve": "重新打开",
    "Reopen": "重新打开",
    "Reply": "回复",
    "Quote": "引用",
    "Edit": "编辑",
    "Update": "更新",
    "Stage": "暂存",
    "Stage all": "全部暂存",
    "Unstage": "取消暂存",
    "Unstage all": "全部取消暂存",
    "Commit": "提交",
    "Commit changes": "提交更改",
    "Push": "推送",
    "Pull": "拉取",
    "Branch": "分支",
    "Diff": "差异",
    "Line": "行",
    "Lines": "行",

    // Settings & Controls
    "General": "通用",
    "Appearance": "外观",
    "Theme": "主题",
    "Dark": "深色",
    "Light": "浅色",
    "System": "跟随系统",
    "Follow system": "跟随系统",
    "Notifications": "通知",
    "Push Notifications": "推送通知",
    "Enable Notifications": "启用通知",
    "Disable Notifications": "关闭通知",
    "Desktop Notifications": "桌面通知",
    "Sound": "提示音",
    "Permissions": "权限",
    "Security": "安全",
    "Privacy": "隐私",
    "Sandbox": "沙盒",
    "Terminal Sandbox": "终端沙盒",
    "Sandbox Mode": "沙盒模式",
    "File Access": "文件访问权限",
    "Internet Access": "网络访问权限",
    "Network Access": "网络访问",
    "Auto-approve": "自动批准",
    "Allowlist": "允许列表",
    "Denylist": "禁止列表",
    "Trusted paths": "受信任路径",
    "Read-only": "只读",
    "Customizations": "自定义配置",
    "Customization": "自定义配置",
    "Skills": "技能",
    "Rules": "规则",
    "Workflows": "工作流",
    "Plugins": "插件",
    "Extensions": "扩展",
    "Marketplace": "插件市场",
    "MCP Servers": "MCP 服务器",
    "Hooks": "钩子",
    "Memory": "记忆",
    "Shortcuts": "快捷键",
    "Keyboard Shortcuts": "键盘快捷键",
    "Keybindings": "按键绑定",
    "Language": "语言",
    "Display": "显示",
    "Help": "帮助",
    "Documentation": "文档",
    "About": "关于",
    "Feedback": "反馈",
    "Send Feedback": "发送反馈",
    "Report a bug": "报告问题",
    "What's new": "更新内容",
    "Refresh": "刷新",
    "Reload": "重新加载",
    "Clear": "清除",
    "Clear all": "全部清除",
    "Delete": "删除",
    "Remove": "移除",
    "Rename": "重命名",
    "Save": "保存",
    "Save changes": "保存更改",
    "Reset": "重置",
    "Reset to defaults": "恢复默认设置",
    "Create": "创建",
    "Add": "添加",
    "New": "新建",
    "Manage": "管理",
    "Configure": "配置",
    "Enable": "启用",
    "Disable": "禁用",
    "Enabled": "已启用",
    "Disabled": "已禁用",
    "On": "开启",
    "Off": "关闭",
    "Yes": "是",
    "No": "否",
    "OK": "确定",
    "Archive": "归档",
    "Unarchive": "取消归档",
    "Pin": "置顶",
    "Unpin": "取消置顶",
    "Export": "导出",
    "Share": "分享",
    "Leave": "离开",
    "Quota": "配额",
    "Usage": "用量",
    "Rate limit": "速率限制",
    "Remote URL": "远程地址",

    // Placeholders & Empty States & ARIA Labels
    "Ask anything...": "有问题尽管问...",
    "Ask anything, @ to mention, / for actions": "输入指令，@ 引用上下文，/ 调用命令",
    "Ask anything, @ to mention, / for workflows": "输入指令，@ 引用上下文，/ 调用工作流",
    "Ask Antigravity...": "向 Antigravity 提问...",
    "Message Antigravity...": "向 Antigravity 发送消息...",
    "Type a message...": "输入消息...",
    "Send a message...": "发送消息...",
    "Write a message...": "输入消息内容...",
    "Search conversations...": "搜索对话...",
    "Search files...": "搜索文件...",
    "Search projects...": "搜索项目...",
    "Search commands...": "搜索命令...",
    "Search settings...": "搜索设置...",
    "Search...": "搜索...",
    "Filter...": "筛选...",
    "Filter files...": "筛选文件...",
    "Filter by status...": "按状态筛选...",
    "Enter command...": "输入命令...",
    "Type / for commands": "输入 / 查看命令",
    "Type @ to mention": "输入 @ 引用上下文",
    "Type / for commands, @ for context": "输入 / 查看命令，输入 @ 添加上下文",
    "Enter a comment...": "输入评论...",
    "Add a comment...": "添加评论...",
    "Reply...": "回复...",
    "Name...": "输入名称...",
    "Description...": "输入描述...",
    "Paste URL...": "粘贴链接...",
    "Choose file...": "选择文件...",
    "No results found": "未找到匹配结果",
    "Nothing here yet": "这里还没有内容",
    "Start a new conversation": "开始新对话",
    "No active conversations": "暂无活跃会话",
    "Connect to a machine": "连接到一台设备",
    "Select a machine": "选择设备",
    "All conversations": "全部会话",
    "Active conversations": "进行中的会话",
    "Recent": "最近",
    "Thinking": "思考中",
    "Waiting for input": "等待输入",
    "Stop generating": "停止生成",
    "Send message": "发送消息",
    "Attach file": "添加附件",
    "Voice input": "语音输入",
    "Switch model": "切换模型",
    "Copy message": "复制消息",
    "Copy link": "复制链接",
    "Send message (Enter)": "发送消息 (Enter)",
    "New line (Shift+Enter)": "换行 (Shift+Enter)",
    "Toggle sidebar": "切换侧边栏",
    "Close sidebar": "关闭侧边栏",
    "Open settings": "打开设置",
    "Close dialog": "关闭弹窗",

    // Relative / Time Exact Entries
    "Just now": "刚刚",
    "just now": "刚刚",
    "Today": "今天",
    "Yesterday": "昨天",
    "This week": "本周",
    "Last week": "上周",
    "Earlier": "更早",
    "A moment ago": "片刻前",
    "Less than a minute ago": "不到 1 分钟前"
  };

  /**
   * Lowercase fallback map for UI phrases (>= 4 chars) so title/sentence casing variants
   * match cleanly while avoiding accidental translation of tiny 2-3 char lowercase tokens.
   */
  const EXACT_LOWER_DICT = Object.create(null);
  for (const [key, value] of Object.entries(EXACT_DICT)) {
    if (key.length >= 4) {
      const lower = key.toLowerCase();
      if (!(lower in EXACT_LOWER_DICT)) {
        EXACT_LOWER_DICT[lower] = value;
      }
    }
  }

  /**
   * Dynamic template rules for runtime counts, timestamps, diffs, and progress badges.
   * Each rule outputs Simplified Chinese and is naturally idempotent.
   */
  const REGEX_RULES = [
    {
      name: "seconds-ago",
      pattern: /^(\d+)\s+seconds?\s+ago$/i,
      replace: "$1 秒前"
    },
    {
      name: "minutes-ago",
      pattern: /^(\d+)\s+minutes?\s+ago$/i,
      replace: "$1 分钟前"
    },
    {
      name: "hours-ago",
      pattern: /^(\d+)\s+hours?\s+ago$/i,
      replace: "$1 小时前"
    },
    {
      name: "days-ago",
      pattern: /^(\d+)\s+days?\s+ago$/i,
      replace: "$1 天前"
    },
    {
      name: "weeks-ago",
      pattern: /^(\d+)\s+weeks?\s+ago$/i,
      replace: "$1 周前"
    },
    {
      name: "months-ago",
      pattern: /^(\d+)\s+months?\s+ago$/i,
      replace: "$1 个月前"
    },
    {
      name: "years-ago",
      pattern: /^(\d+)\s+years?\s+ago$/i,
      replace: "$1 年前"
    },
    {
      name: "short-seconds-ago",
      pattern: /^(\d+)s\s+ago$/i,
      replace: "$1 秒前"
    },
    {
      name: "short-minutes-ago",
      pattern: /^(\d+)m\s+ago$/i,
      replace: "$1 分钟前"
    },
    {
      name: "short-hours-ago",
      pattern: /^(\d+)h\s+ago$/i,
      replace: "$1 小时前"
    },
    {
      name: "short-days-ago",
      pattern: /^(\d+)d\s+ago$/i,
      replace: "$1 天前"
    },
    {
      name: "thought-for-seconds",
      pattern: /^Thought for\s+(\d+(?:\.\d+)?)\s+seconds?$/i,
      replace: "思考了 $1 秒"
    },
    {
      name: "thought-for-min-sec",
      pattern: /^Thought for\s+(\d+)\s*m\s*(\d+)\s*s$/i,
      replace: "思考了 $1 分 $2 秒"
    },
    {
      name: "thought-for-s",
      pattern: /^Thought for\s+(\d+(?:\.\d+)?)\s*s$/i,
      replace: "思考了 $1 秒"
    },
    {
      name: "thought-for-m",
      pattern: /^Thought for\s+(\d+)\s*m$/i,
      replace: "思考了 $1 分钟"
    },
    {
      name: "thought-for-minutes",
      pattern: /^Thought for\s+(\d+)\s+minutes?$/i,
      replace: "思考了 $1 分钟"
    },
    {
      name: "short-spaced-s-ago",
      pattern: /^(\d+)\s*s\s+ago$/i,
      replace: "$1 秒前"
    },
    {
      name: "short-spaced-m-ago",
      pattern: /^(\d+)\s*m\s+ago$/i,
      replace: "$1 分钟前"
    },
    {
      name: "short-spaced-h-ago",
      pattern: /^(\d+)\s*h\s+ago$/i,
      replace: "$1 小时前"
    },
    {
      name: "short-spaced-d-ago",
      pattern: /^(\d+)\s*d\s+ago$/i,
      replace: "$1 天前"
    },
    {
      name: "thought-less-than-second",
      pattern: /^Thought for less than a second$/i,
      replace: "思考不到 1 秒"
    },
    {
      name: "ran-for-seconds",
      pattern: /^Ran for\s+(\d+(?:\.\d+)?)\s+seconds?$/i,
      replace: "已运行 $1 秒"
    },
    {
      name: "files-changed",
      pattern: /^(\d+)\s+files?\s+changed$/i,
      replace: "$1 个文件已更改"
    },
    {
      name: "changed-files",
      pattern: /^(\d+)\s+changed\s+files?$/i,
      replace: "$1 个更改的文件"
    },
    {
      name: "lines-added",
      pattern: /^(\d+)\s+lines?\s+added$/i,
      replace: "新增 $1 行"
    },
    {
      name: "lines-removed",
      pattern: /^(\d+)\s+lines?\s+(?:removed|deleted)$/i,
      replace: "删除 $1 行"
    },
    {
      name: "count-additions",
      pattern: /^(\d+)\s+additions?$/i,
      replace: "新增 $1 处"
    },
    {
      name: "count-deletions",
      pattern: /^(\d+)\s+deletions?$/i,
      replace: "删除 $1 处"
    },
    {
      name: "showing-lines-range",
      pattern: /^Showing lines?\s+(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)$/i,
      replace: "显示第 $1-$2 行（共 $3 行）"
    },
    {
      name: "lines-range",
      pattern: /^Lines?\s+(\d+)\s*[-–]\s*(\d+)$/i,
      replace: "第 $1-$2 行"
    },
    {
      name: "line-number",
      pattern: /^Line\s+(\d+)$/i,
      replace: "第 $1 行"
    },
    {
      name: "step-n-of-m",
      pattern: /^Step\s+(\d+)\s+of\s+(\d+)$/i,
      replace: "第 $1 / $2 步"
    },
    {
      name: "count-steps",
      pattern: /^(\d+)\s+steps?$/i,
      replace: "$1 个步骤"
    },
    {
      name: "count-running",
      pattern: /^(\d+)\s+running$/i,
      replace: "$1 个运行中"
    },
    {
      name: "count-active",
      pattern: /^(\d+)\s+active$/i,
      replace: "$1 个活跃"
    },
    {
      name: "count-pending",
      pattern: /^(\d+)\s+pending$/i,
      replace: "$1 个待处理"
    },
    {
      name: "count-completed",
      pattern: /^(\d+)\s+completed$/i,
      replace: "$1 个已完成"
    },
    {
      name: "count-failed",
      pattern: /^(\d+)\s+failed$/i,
      replace: "$1 个失败"
    },
    {
      name: "count-files",
      pattern: /^(\d+)\s+files?$/i,
      replace: "$1 个文件"
    },
    {
      name: "count-tasks",
      pattern: /^(\d+)\s+tasks?$/i,
      replace: "$1 个任务"
    },
    {
      name: "count-subagents",
      pattern: /^(\d+)\s+subagents?$/i,
      replace: "$1 个子智能体"
    },
    {
      name: "count-workers",
      pattern: /^(\d+)\s+workers?$/i,
      replace: "$1 个协作节点"
    },
    {
      name: "count-messages",
      pattern: /^(\d+)\s+messages?$/i,
      replace: "$1 条消息"
    },
    {
      name: "count-comments",
      pattern: /^(\d+)\s+comments?$/i,
      replace: "$1 条评论"
    },
    {
      name: "count-results",
      pattern: /^(\d+)\s+results?$/i,
      replace: "$1 条结果"
    },
    {
      name: "count-matches",
      pattern: /^(\d+)\s+matches?$/i,
      replace: "$1 个匹配项"
    },
    {
      name: "count-selected",
      pattern: /^(\d+)\s+selected$/i,
      replace: "已选择 $1 项"
    },
    {
      name: "count-items",
      pattern: /^(\d+)\s+items?$/i,
      replace: "$1 项"
    },
    {
      name: "count-more",
      pattern: /^(\d+)\s+more$/i,
      replace: "还有 $1 项"
    },
    {
      name: "show-n-more",
      pattern: /^Show\s+(\d+)\s+more$/i,
      replace: "再显示 $1 项"
    },
    {
      name: "view-n-more",
      pattern: /^View\s+(\d+)\s+more$/i,
      replace: "查看更多 $1 项"
    },
    {
      name: "count-tokens",
      pattern: /^(\d+)\s+tokens?$/i,
      replace: "$1 个词元"
    },
    {
      name: "connected-to-host",
      pattern: /^Connected to\s+([^\n<>{}.!?]{1,60})$/i,
      replace: "已连接到 $1"
    },
    {
      name: "connecting-to-host",
      pattern: /^Connecting to\s+([^\n<>{}.!?]{1,60})\.\.\.$/i,
      replace: "正在连接到 $1..."
    },
    {
      name: "allow-prompt",
      pattern: /^Allow\s+([^\n<>{}.!?]{1,50})\?$/i,
      replace: "允许 $1？"
    },
    {
      name: "version-tag",
      pattern: /^Version\s+(v?[0-9][0-9a-zA-Z.\-_+]{0,30})$/i,
      replace: "版本 $1"
    }
  ];

  function buildCustomLowerMap(customDict) {
    if (!customDict || typeof customDict !== "object") {
      return null;
    }
    const lowerMap = Object.create(null);
    for (const [k, v] of Object.entries(customDict)) {
      if (typeof k === "string" && typeof v === "string") {
        const normKey = k.trim().replace(/\s+/g, " ");
        if (normKey.length >= 4) {
          const lower = normKey.toLowerCase();
          if (!(lower in lowerMap)) {
            lowerMap[lower] = v;
          }
        }
      }
    }
    return lowerMap;
  }

  /**
   * Look up exact or case-insensitive UI match, giving customDict strict precedence.
   */
  function lookupExact(trimmedText, customDict, customLowerMap) {
    if (!trimmedText) {
      return null;
    }
    if (customDict && typeof customDict === "object") {
      if (Object.prototype.hasOwnProperty.call(customDict, trimmedText)) {
        const val = customDict[trimmedText];
        if (typeof val === "string" && val.length > 0) {
          return val;
        }
      }
      if (trimmedText.length >= 4) {
        const lowerMap = customLowerMap || buildCustomLowerMap(customDict);
        const lower = trimmedText.toLowerCase();
        if (lowerMap && lower in lowerMap && typeof lowerMap[lower] === "string" && lowerMap[lower].length > 0) {
          return lowerMap[lower];
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(EXACT_DICT, trimmedText)) {
      return EXACT_DICT[trimmedText];
    }

    if (trimmedText.length >= 4 || trimmedText === trimmedText.toUpperCase()) {
      const lower = trimmedText.toLowerCase();
      if (lower in EXACT_LOWER_DICT) {
        return EXACT_LOWER_DICT[lower];
      }
    }
    return null;
  }

  function lookupRegex(trimmedText) {
    if (!trimmedText || trimmedText.length > 120) {
      return null;
    }
    for (let i = 0; i < REGEX_RULES.length; i++) {
      const rule = REGEX_RULES[i];
      if (rule.pattern.test(trimmedText)) {
        return trimmedText.replace(rule.pattern, rule.replace);
      }
    }
    return null;
  }

  function translateText(trimmedText, customDict, customLowerMap) {
    const exact = lookupExact(trimmedText, customDict, customLowerMap);
    if (exact !== null) {
      return { text: exact, kind: "exact" };
    }
    const regexResult = lookupRegex(trimmedText);
    if (regexResult !== null) {
      return { text: regexResult, kind: "regex" };
    }
    return null;
  }

  const api = {
    EXACT_DICT,
    EXACT_LOWER_DICT,
    REGEX_RULES,
    buildCustomLowerMap,
    lookupExact,
    lookupRegex,
    translateText
  };

  if (root && typeof root === "object") {
    root.AG_I18N_DICT = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
