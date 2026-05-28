# 灵珑 LingLong — Phase 1 全局扫描报告

**扫描时间**: 2026-05-27  
**扫描范围**: 全部 21 个源文件（main process, renderer, runtime, tests）  
**总代码行数**: ~4,349 行（不含 node_modules）

---

## 一、项目结构概览

```
robot-agent/
├── main.js                      (170 行) — 入口、生命周期、全局快捷键
├── preload.js                   (70 行)  — IPC 桥接
├── package.json                 — Electron 29 + electron-builder
├── runtime/
│   ├── store.js                 (3 行)   — electron-store 单例
│   ├── windows.js               (158 行) — 窗口创建、定位、切换
│   ├── physics.js               (221 行) — 平滑移动、边缘吸附、甩飞
│   ├── ipc.js                   (160 行) — IPC 事件注册
│   ├── agents.js                (348 行) — Agent 生命周期管理
│   ├── claudeRuntime.js         (251 行) — Claude CLI 长连接
│   ├── sessionGraph.js          (144 行) — 会话图（树结构）
│   ├── personas.js              (53 行)  — 4 种 Persona 定义
│   ├── agentCheck.js            (45 行)  — PATH 检测 CLI 可用性
│   └── tray.js                  (103 行) — 系统托盘
├── renderer/
│   ├── robot.html               (859 行) — 浮动机器人 + SVG 动画
│   ├── chat.html                (1221 行)— 完整聊天 UI
│   ├── bubble.html              (141 行) — 通知气泡
│   ├── onboarding.html          (128 行) — 新手引导
│   └── showcase.html            (275 行) — 设计稿展示页
├── __tests__/
│   ├── sessionGraph.test.js     (96 行)  — 10 个测试
│   └── agentCheck.test.js       (23 行)  — 2 个测试
├── assets/
│   ├── icon.ico
│   └── robot.png
└── backups/                     — 本次扫描自动创建的备份
```

---

## 二、五大专家角色问题清单

### 🔧 前端工程师 (Frontend Engineer)

| # | 文件 | 行号 | 严重度 | 问题描述 |
|---|------|------|--------|---------|
| F1 | chat.html | 461 | P2-Bug | `renderMarkdown` 重复 `if (!text) return '';` (L458 和 L461)，copy-paste 残留 |
| F2 | chat.html | 888-899 | P2-Perf | `loadBranch` 中 monkey-patch `msgs.appendChild` 来批插入 DOM，恢复方式脆弱——如果中途抛异常会永久破坏 |
| F3 | chat.html | 457-533 | P2-Perf | `renderMarkdown` 内部先 `escapeHtml` 再做正则替换，但 code block 的 `CB` 标记也被 escape 导致占位符匹配失败（`escapeHtml` 在 code block 提取之后才调用，实际无问题，但逻辑混乱难以维护） |
| F4 | main.js | 68-71 | P2-Code | `toggleChat()` 函数仅是 `require('./runtime/windows').toggleChatImpl()` 的包装，多一层间接调用无意义 |
| F5 | ipc.js | 28,31,43,45,57,68 | P3-Maint | `robot-moved` 和 `move-window` 中重复 `require('./windows')` 而非用顶部已导入的变量，属于运行时重复解析 |
| F6 | tray.js | 34 | P3-Bug | `buildTrayMenu` 中 `new BrowserWindow(...)` 使用但未在文件顶部导入 `BrowserWindow`，依赖 Electron 的隐式全局——在严格模式或某些打包场景下可能失败 |
| F7 | windows.js | 83-102 | P3-Code | `showBubble` 将 `_lastTs`、`_hideTimer` 作为函数静态属性，不符合常规模式，可读性差 |

### 📋 产品经理 (Product Manager)

| # | 文件 | 行号 | 严重度 | 问题描述 |
|---|------|------|--------|---------|
| P1 | robot.html | 844-856 | P1-UX | 首次启动 hero 动画（2.6s）期间机器人不可交互，无任何提示文字说明"初始化中" |
| P2 | chat.html | 877-903 | P2-UX | 切换 tab 加载历史分支时无 loading 指示，用户可能误以为无响应 |
| P3 | chat.html | 1000-1002 | P2-UX | 最小化按钮调用 `quitApp()` 而非 `hideChat()`，用户期望最小化到托盘而非退出应用 |
| P4 | onboarding.html | 95 | P3-UX | 新手引导直接使用 `require('electron')`，但 `contextIsolation: true` 下 `nodeIntegration` 未明确启用——见 main.js:154 已设置 `nodeIntegration: true`，这意味着引导页有完整 Node 权限，但其他页面无此需求，安全不一致 |
| P5 | chat.html | 1189 | P3-UX | `setStatus('ready')` 在 `startAgent` 之前调用，时序上 agent 尚未真正就绪就显示"已就绪" |

### 🎨 UI/UX 设计师 (UI/UX Designer)

| # | 文件 | 行号 | 严重度 | 问题描述 |
|---|------|------|--------|---------|
| U1 | chat.html | 389 | P2-UX | 搜索按钮使用 emoji `🔍` 而非 SVG 图标，在不同系统渲染不一致且无法精确控制大小/颜色 |
| U2 | chat.html | 390 | P3-Style | `＋` 使用全角加号作为按钮文字，与其他按钮风格不统一 |
| U3 | 全局 | — | P3-A11y | 所有窗口和交互元素缺少 ARIA 标签（tab、persona pill、message 等） |
| U4 | robot.html | 258 | P3-Style | 默认 class `s-idle` 直接写在 HTML 中，首次 hero 动画期间会短暂闪现 idle 样式再切到 hero |
| U5 | chat.html | 673-694 | P3-UX | DOM 虚拟化折叠提示 `— 已折叠 N 条早期消息 —` 无点击展开能力，历史消息永久丢失可见性 |

### ⚡ 性能专家 (Performance Expert)

| # | 文件 | 行号 | 严重度 | 问题描述 |
|---|------|------|--------|---------|
| Q1 | main.js | 18-29 | P2-Perf | 光标追踪 `setInterval(80ms)` 即使窗口不可见也在运行，浪费 CPU |
| Q2 | physics.js | 196-210 | P2-Perf | `slideBackTimer`(200ms) 和 `moodTimer`(20s) 在模块 require 时立即启动，即使窗口未创建也会持续轮询 |
| Q3 | physics.js | 40 | P3-Perf | `smoothMoveWindow` 使用 `setTimeout(tick, 16)` 而非 `requestAnimationFrame`，在后台窗口时不必要地消耗资源 |
| Q4 | chat.html | 447-533 | P2-Perf | Markdown 渲染缓存（`renderCache`）使用 `Map` 按插入顺序遍历，但 LRU 淘汰通过 `keys().next().value` 实现，当缓存达到 500 上限时每次插入都触发淘汰——实际上应该批量淘汰 |
| Q5 | agents.js | 24-27 | P3-Perf | Token buffer (`TOKEN_BUF_MAX=32KB`) 无上限保护：如果 agent 持续输出超过 32KB 未 flush，buffer 会无限增长直到触发 flush |
| Q6 | claudeRuntime.js | 108-116 | P3-Perf | `_handleStdout` 中 `this.buf += chunk.toString()` 在大输出时会频繁重新分配字符串 |

### 🔒 安全工程师 (Security Engineer)

| # | 文件 | 行号 | 严重度 | 问题描述 |
|---|------|------|--------|---------|
| S1 | chat.html | 742 | P1-XSS | `addStaticAiMsg` 中 `bub.innerHTML = renderMarkdown(text)` —— Markdown 渲染器对 `<script>` 标签无过滤。虽然 `escapeHtml` 会转义 `<`，但 code block 提取在 escape 之前完成，`escapeHtml` 之后的正则替换（h1/h2/h3/p）不会引入 HTML 注入。**风险实际低**，但 `innerHTML` 使用仍是红旗 |
| S2 | main.js | 154 | P1-Security | Onboarding 窗口 `nodeIntegration: true`，如果 `onboarding.html` 加载远程内容（当前未加载，但配置不安全）可导致 RCE |
| S3 | ipc.js | 62 | P2-Security | `send-message` 的 `text` 参数未做长度限制或清理，可发送超大消息导致内存问题 |
| S4 | agents.js | 200-203 | P2-Security | `runPlainAgent` 使用 `shell: true` + `spawn(cmd, args)`——虽然 `args` 来自内部，但 `message` 通过字符串拼接传入命令行，存在理论上的命令注入风险 |
| S5 | preload.js | 1-70 | P3-Security | IPC 桥接暴露了较多接口（20+ 方法），但无输入校验。`moveWindow(x, y)` 接受任意坐标，`sendMessage` 接受任意文本 |
| S6 | chat.html | 540 | P3-Security | `navigator.clipboard.writeText(code)` 用于复制代码块内容，无权限检查（Electron 环境通常允许，但最佳实践应检查） |

---

## 三、问题汇总与优先级排序

### P1 — 必须立即修复（4 项）
1. **S2** — Onboarding 窗口 `nodeIntegration: true` → 改为 `contextIsolation: true, nodeIntegration: false`，改用 preload 桥接
2. **P3** — 最小化按钮调用 `quitApp()` → 应改为 `hideChat()` 
3. **S1** — `innerHTML` 使用 → 对 AI 回复内容考虑使用 `textContent` 或加强 sanitize
4. **F6** — tray.js 缺少 `BrowserWindow` 导入 → 添加 `const { BrowserWindow } = require('electron')`

### P2 — 高优先级修复（9 项）
5. **F1** — `renderMarkdown` 重复 null check → 删除重复行
6. **F2** — `loadBranch` monkey-patch `appendChild` → 改用 DocumentFragment 直接插入
7. **Q1** — 光标追踪在窗口不可见时仍运行 → 添加可见性检查
8. **Q2** — physics 定时器在模块加载时启动 → 延迟到窗口创建后启动
9. **Q4** — renderCache 淘汰策略 → 改为批量淘汰
10. **S3** — `send-message` 无长度限制 → 添加最大长度检查
11. **S4** — `shell: true` 潜在命令注入 → 改为 `shell: false`
12. **P1** — hero 动画期间无加载提示 → 添加短暂文字提示
13. **P2** — 切换 tab 无 loading 指示 → 添加加载中状态

### P3 — 中优先级修复（9 项）
14. **F3** — renderMarkdown 逻辑混乱 → 重排代码块处理顺序
15. **F4** — toggleChat 多余包装 → 内联调用
16. **F5** — ipc.js 重复 require → 统一使用顶部导入
17. **F7** — showBubble 静态属性 → 改用模块级变量
18. **Q3** — smoothMoveWindow 用 setTimeout → 改用 requestAnimationFrame
19. **Q5** — token buffer 无上限 → 添加硬上限保护
20. **Q6** — stdout buffer 字符串拼接 → 改用 Buffer array 后 join
21. **U1/U2** — emoji 按钮 → 改为 SVG 图标
22. **U3** — 缺少 ARIA 标签 → 添加关键交互元素的无障碍属性
23. **P4** — onboarding nodeIntegration 不一致 → 统一安全配置
24. **P5** — 时序问题 → 调整 setStatus 调用时机
25. **U5** — 虚拟化折叠不可逆 → 添加展开按钮或移除虚拟化改为滚动懒加载
26. **S5** — IPC 桥接无输入校验 → 添加关键方法的参数校验

---

## 四、分阶段执行计划

### Phase 3 — 修复与优化（按优先级批次）

**批次 1：安全修复（P1 级别）**
- [ ] S2: 修复 onboarding 窗口 nodeIntegration
- [ ] P3: 修复最小化按钮行为
- [ ] S1: 加强 innerHTML sanitize
- [ ] F6: 补充 tray.js BrowserWindow 导入

**批次 2：Bug 修复 + 高优优化（P2 级别）**
- [ ] F1: 删除重复 null check
- [ ] F2: 重写 loadBranch DOM 插入
- [ ] Q1: 光标追踪添加可见性检查
- [ ] Q2: physics 定时器延迟启动
- [ ] Q4: renderCache 淘汰策略优化
- [ ] S3: 添加 send-message 长度限制
- [ ] S4: shell: true → false
- [ ] P1: hero 动画添加 loading 提示
- [ ] P2: tab 切换添加 loading 状态

**批次 3：代码质量 + 中等优化（P3 级别）**
- [ ] F3: renderMarkdown 逻辑整理
- [ ] F4: toggleChat 内联
- [ ] F5: ipc.js require 统一
- [ ] F7: showBubble 静态属性重构
- [ ] Q3: smoothMoveWindow rAF 化
- [ ] Q5: token buffer 硬上限
- [ ] Q6: stdout buffer 优化
- [ ] P5: setStatus 时序修正

### Phase 4 — 全量测试
- 运行 `npm test` 确认 12 个测试全部通过
- 验证所有修改后的文件语法正确
- 确认 app 可正常启动

### Phase 5 — 最终报告
- 输出完整修复清单
- 生成未修复问题说明
- 输出优化建议

---

*报告结束 — Phase 1 全局扫描完成*
