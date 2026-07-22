export type DesktopMenuPlatform = "macos" | "windows"

export type DesktopMenuAction =
  | "app.checkForUpdates"
  | "app.relaunch"
  | "edit.undo"
  | "edit.redo"
  | "edit.cut"
  | "edit.copy"
  | "edit.paste"
  | "edit.delete"
  | "edit.selectAll"
  | "view.reload"
  | "view.toggleDevTools"
  | "view.resetZoom"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.toggleFullscreen"
  | "window.new"
  | "window.close"
  | "window.minimize"
  | "window.toggleMaximize"

export type DesktopMenuRole =
  | "about"
  | "close"
  | "copy"
  | "cut"
  | "hide"
  | "hideOthers"
  | "paste"
  | "quit"
  | "redo"
  | "reload"
  | "resetZoom"
  | "selectAll"
  | "toggleDevTools"
  | "togglefullscreen"
  | "undo"
  | "unhide"
  | "windowMenu"
  | "zoomIn"
  | "zoomOut"

export type DesktopMenuItem = {
  type: "item"
  label?: string
  labelZh?: string
  command?: string
  action?: DesktopMenuAction
  role?: DesktopMenuRole
  href?: string
  accelerator?: Partial<Record<DesktopMenuPlatform, string>>
  enabled?: "updater"
  platforms?: DesktopMenuPlatform[]
}

export type DesktopMenuSeparator = {
  type: "separator"
  platforms?: DesktopMenuPlatform[]
}

export type DesktopMenuEntry = DesktopMenuItem | DesktopMenuSeparator

export type DesktopMenu = {
  id: string
  label: string
  labelZh?: string
  role?: DesktopMenuRole
  items?: DesktopMenuEntry[]
  platforms?: DesktopMenuPlatform[]
}

export const DESKTOP_MENU: DesktopMenu[] = [
  {
    id: "app",
    label: "NovelX",
    platforms: ["macos"],
    items: [
      { type: "item", role: "about" },
      {
        type: "item",
        label: "Check for Updates...",
        labelZh: "检查更新...",
        action: "app.checkForUpdates",
        enabled: "updater",
      },
      { type: "item", label: "Settings", labelZh: "设置", command: "settings.open", accelerator: { macos: "Cmd+," } },
      { type: "item", label: "Reload Webview", labelZh: "重新加载网页视图", action: "view.reload" },
      { type: "item", label: "Restart", labelZh: "重启", action: "app.relaunch" },
      { type: "item", label: "Export Logs...", labelZh: "导出日志...", command: "logs.export" },
      { type: "separator" },
      { type: "item", role: "hide" },
      { type: "item", role: "hideOthers" },
      { type: "item", role: "unhide" },
      { type: "separator" },
      { type: "item", role: "quit" },
    ],
  },
  {
    id: "file",
    label: "File",
    labelZh: "文件",
    items: [
      {
        type: "item",
        label: "New Session",
        labelZh: "新建会话",
        command: "session.new",
        accelerator: { macos: "Shift+Cmd+S" },
      },
      {
        type: "item",
        label: "Open Project...",
        labelZh: "打开项目...",
        command: "project.open",
        accelerator: { macos: "Cmd+O" },
      },
      {
        type: "item",
        label: "Settings",
        labelZh: "设置",
        command: "settings.open",
        accelerator: { windows: "Ctrl+," },
        platforms: ["windows"],
      },
      {
        type: "item",
        label: "New Window",
        labelZh: "新建窗口",
        action: "window.new",
        accelerator: { macos: "Cmd+Shift+N", windows: "Ctrl+Shift+N" },
      },
      { type: "separator" },
      { type: "item", label: "Close Window", labelZh: "关闭窗口", action: "window.close", role: "close" },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    labelZh: "编辑",
    items: [
      {
        type: "item",
        label: "Undo",
        labelZh: "撤销",
        action: "edit.undo",
        role: "undo",
        accelerator: { windows: "Ctrl+Z" },
      },
      {
        type: "item",
        label: "Redo",
        labelZh: "重做",
        action: "edit.redo",
        role: "redo",
        accelerator: { windows: "Ctrl+Y" },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Cut",
        labelZh: "剪切",
        action: "edit.cut",
        role: "cut",
        accelerator: { windows: "Ctrl+X" },
      },
      {
        type: "item",
        label: "Copy",
        labelZh: "复制",
        action: "edit.copy",
        role: "copy",
        accelerator: { windows: "Ctrl+C" },
      },
      {
        type: "item",
        label: "Paste",
        labelZh: "粘贴",
        action: "edit.paste",
        role: "paste",
        accelerator: { windows: "Ctrl+V" },
      },
      { type: "item", label: "Delete", labelZh: "删除", action: "edit.delete" },
      {
        type: "item",
        label: "Select All",
        labelZh: "全选",
        action: "edit.selectAll",
        role: "selectAll",
        accelerator: { windows: "Ctrl+A" },
      },
    ],
  },
  {
    id: "view",
    label: "View",
    labelZh: "视图",
    items: [
      { type: "item", label: "Toggle Sidebar", labelZh: "切换侧边栏", command: "sidebar.toggle" },
      {
        type: "item",
        label: "Toggle Terminal",
        labelZh: "切换终端",
        command: "terminal.toggle",
        accelerator: { macos: "Ctrl+`" },
      },
      { type: "item", label: "Toggle File Tree", labelZh: "切换文件树", command: "fileTree.toggle" },
      { type: "separator" },
      { type: "item", label: "Reload", labelZh: "重新加载", action: "view.reload", role: "reload" },
      {
        type: "item",
        label: "Toggle Developer Tools",
        labelZh: "切换开发者工具",
        action: "view.toggleDevTools",
        role: "toggleDevTools",
      },
      { type: "separator" },
      {
        type: "item",
        label: "Actual Size",
        labelZh: "实际大小",
        action: "view.resetZoom",
        role: "resetZoom",
        accelerator: { windows: "Ctrl+0" },
      },
      {
        type: "item",
        label: "Zoom In",
        labelZh: "放大",
        action: "view.zoomIn",
        role: "zoomIn",
        accelerator: { windows: "Ctrl++" },
      },
      {
        type: "item",
        label: "Zoom Out",
        labelZh: "缩小",
        action: "view.zoomOut",
        role: "zoomOut",
        accelerator: { windows: "Ctrl+-" },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Toggle Full Screen",
        labelZh: "切换全屏",
        action: "view.toggleFullscreen",
        role: "togglefullscreen",
      },
    ],
  },
  {
    id: "go",
    label: "Go",
    labelZh: "跳转",
    items: [
      { type: "item", label: "Back", labelZh: "后退", command: "common.goBack", accelerator: { macos: "Cmd+[" } },
      { type: "item", label: "Forward", labelZh: "前进", command: "common.goForward", accelerator: { macos: "Cmd+]" } },
      { type: "separator" },
      {
        type: "item",
        label: "Previous Session",
        labelZh: "上一个会话",
        command: "session.previous",
        accelerator: { macos: "Option+Up" },
      },
      {
        type: "item",
        label: "Next Session",
        labelZh: "下一个会话",
        command: "session.next",
        accelerator: { macos: "Option+Down" },
      },
      { type: "separator" },
      {
        type: "item",
        label: "Previous Project",
        labelZh: "上一个项目",
        command: "project.previous",
        accelerator: { macos: "Cmd+Option+Up" },
      },
      {
        type: "item",
        label: "Next Project",
        labelZh: "下一个项目",
        command: "project.next",
        accelerator: { macos: "Cmd+Option+Down" },
      },
    ],
  },
  {
    id: "window",
    label: "Window",
    labelZh: "窗口",
    role: "windowMenu",
    items: [
      { type: "item", label: "Minimize", labelZh: "最小化", action: "window.minimize" },
      { type: "item", label: "Maximize", labelZh: "最大化", action: "window.toggleMaximize" },
      { type: "separator" },
      { type: "item", label: "Close Window", labelZh: "关闭窗口", action: "window.close" },
    ],
  },
  {
    id: "help",
    label: "Help",
    labelZh: "帮助",
    items: [
      { type: "item", label: "OpenCode Documentation", labelZh: "OpenCode 文档", href: "https://opencode.ai/docs" },
      { type: "item", label: "Support Forum", labelZh: "支持论坛", href: "https://discord.com/invite/opencode" },
      { type: "item", label: "Export Logs...", labelZh: "导出日志...", command: "logs.export" },
      { type: "separator" },
      {
        type: "item",
        label: "Share Feedback",
        labelZh: "分享反馈",
        href: "https://github.com/anomalyco/opencode/issues/new?template=feature_request.yml",
      },
      {
        type: "item",
        label: "Report a Bug",
        labelZh: "报告错误",
        href: "https://github.com/anomalyco/opencode/issues/new?template=bug_report.yml",
      },
    ],
  },
]

export function desktopMenuVisible(item: { platforms?: DesktopMenuPlatform[] }, platform: DesktopMenuPlatform) {
  return !item.platforms || item.platforms.includes(platform)
}

export function desktopMenuLabel(item: { label?: string; labelZh?: string }, locale: string) {
  if (locale === "zh") return item.labelZh ?? item.label ?? ""
  return item.label ?? ""
}
