type TabsInfoCopy = {
  ariaLabel: string
  dismiss: string
  title: string
  subtitle: string
  date: string
  intro: string
  start: string
  organize: string
  home: string
  restore: string
  worktrees: string
}

const english: TabsInfoCopy = {
  ariaLabel: "Introducing Tabs. Organize your work and active sessions with tabs",
  dismiss: "Dismiss Tabs information",
  title: "Introducing Tabs",
  subtitle: "Organize your work and active sessions with tabs",
  date: "July 14",
  intro: "NovelX Desktop is now built around tabs.",
  start:
    "Start a new session in a tab, or open an existing session from any of your projects. Open a new tab when you're starting something new, and close it when you're done.",
  organize:
    "Keeping a few tabs open makes it easier to organize your active sessions. Rename tabs to something memorable if you plan to keep them around.",
  home: "You'll find all your sessions and projects on the new Home screen. Selecting a session opens it in a tab.",
  restore: "When you reopen the app, your tabs are still open.",
  worktrees:
    "The new design does not support Git Worktrees yet, it's coming soon. So if you'd prefer to continue using the previous layout, you can switch between layouts in Settings. Just keep in mind that the new layout will become permanent in a few weeks.",
}

const simplifiedChinese: TabsInfoCopy = {
  ariaLabel: "标签页功能介绍：使用标签页整理工作与当前会话",
  dismiss: "忽略标签页介绍",
  title: "标签页功能介绍",
  subtitle: "使用标签页整理工作与当前会话",
  date: "7 月 14 日",
  intro: "NovelX 桌面版现在以标签页为核心。",
  start: "在标签页中新建会话，或从任意项目打开已有会话。开始新任务时打开新标签页，完成后将其关闭。",
  organize: "保留少量标签页可以更轻松地整理当前会话。如果准备长期保留某个标签页，可以为它改一个容易记住的名称。",
  home: "新的主屏幕汇集了所有会话和项目。选择会话后，它会在标签页中打开。",
  restore: "重新打开应用时，原来的标签页仍会保留。",
  worktrees:
    "新界面暂不支持 Git 工作树，该功能即将推出。如果你希望继续使用旧版布局，可以在设置中切换。请注意，新布局将在几周后成为默认布局。",
}

export function tabsInfoCopy(locale: string): TabsInfoCopy {
  return locale === "zh" ? simplifiedChinese : english
}
