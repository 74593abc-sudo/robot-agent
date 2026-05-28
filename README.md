# 灵珑 LingLong

> 桌面浮动宠物 × 多智能体对话终端 —— 一个 Electron 应用，将三个本地 CLI 智能体封装为一只始终在屏幕上的小机器人。

## 目录

- [项目概览](#一项目概览)
- [目录结构](#二目录结构)
- [快速开始](#三快速开始)
- [技术架构](#四技术架构)
- [核心功能](#五核心功能)
- [开发指南](#六开发指南)
- [已知问题](#七已知问题)
- [许可证](#八许可证)

---

## 一、项目概览

### 基本信息

| 字段 | 值 |
|------|-----|
| 产品名 | 灵珑 LingLong |
| 包名 | `robot-agent` |
| 版本 | 1.1.0 |
| 应用 ID | `com.robotagent.app` |
| 平台 | Windows x64（NSIS 安装包） |
| 许可证 | AGPL-3.0 |

### 一句话定位

一只住在桌面上的 SVG 小机器人，背后连着 Claude、Hermes、OpenClaw 三个本地 AI 智能体，随时可以拖拽、甩飞、对话。

### 核心功能

| 功能 | 说明 |
|------|------|
| 三 Agent 切换对话 | Claude / Hermes / OpenClaw 三 Tab，各自独立对话历史 |
| 实时流式输出 | 16ms 批量 flush + streaming 光标 |
| Markdown 渲染 | 标题/代码块/列表/引用/链接/加粗/斜体 |
| 工具调用展示 | 可展开的 tool chip 卡片 |
| 对话分支 (Fork) | 树状节点图，600 节点上限 |
| 四种工作模式 | 默认/编码/调研/运维，切换后 AI 回答风格变化 |
| SVG 机器人角色 | 皇冠、玉佩、飘带、眼睛、嘴巴，10+ 种状态动画 |
| 拖拽 + 甩飞物理 | 重力/弹性/摩擦/地面反弹 |
| 边缘吸附 + 偷看 | 靠边吸附 + peek 姿态 |
| 眼睛追踪 | 全局光标→瞳孔跟随 |
| 空闲微动作 | 眨眼/歪头/点头/打哈欠/左顾右盼 |
| 情绪系统 | 5 分钟无交互→ tired |
| 通知气泡 | 聊天关闭时回复预览 |
| 系统托盘 | 像素机器人图标 + 完整右键菜单 |
| 主题切换 | 暗色（东方夜色）/ 亮色，聊天窗口标题栏按钮 |
| 静默模式 | 关闭气泡通知 |
| 全局快捷键 | Ctrl+Shift+Space / Ctrl+Shift+R |
| 搜索 | Ctrl+F，正则高亮 |
| 命令面板 | `/` 前缀触发 |
| 文件拖入 | 拖文件→`@path` 插入 |
| 智能体部署检测 | 启动时 PATH 检测 |
| 覆盖安装 | NSIS 安装器，新版自动覆盖旧版 |

### 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Electron ^29.1.0 |
| 构建打包 | electron-builder ^24.9.1 |
| 持久化存储 | electron-store ^8.1.0 |
| 前端 | 纯 HTML / CSS / JS（无框架） |
| 角色渲染 | 内联 SVG + CSS 动画 + SMIL |
| Agent 集成 | Claude CLI (stream-json) / Hermes / OpenClaw |

---

## 二、目录结构

```
robot-agent/
├── main.js                      # Electron 主进程入口（窗口、快捷键、Agent 初始化）
├── preload.js                   # IPC 安全桥接（contextBridge → window.robot API）
├── package.json                 # 项目配置 + electron-builder 配置
│
├── renderer/                    # 渲染进程 HTML
│   ├── robot.html               # 浮动宠物窗口（135×162px，透明）
│   ├── chat.html                # 聊天界面（390×570px）
│   ├── bubble.html              # 通知气泡（300×140px，透明）
│   ├── onboarding.html          # 新手引导（6 页）
│   └── showcase.html            # 设计稿展示页
│
├── runtime/                     # 后端逻辑模块
│   ├── claudeRuntime.js         # Claude CLI 持久进程管理
│   ├── agents.js                # Agent 生命周期（spawn/interrupt/token 流）
│   ├── ipc.js                   # IPC 通道注册（28 个通道）
│   ├── windows.js               # 窗口创建/管理/定位
│   ├── physics.js               # 拖拽 + 甩飞物理模拟
│   ├── tray.js                  # 系统托盘 + 右键菜单
│   ├── store.js                 # electron-store 封装（schema 校验 + 崩溃恢复）
│   ├── sessionGraph.js          # 树状对话存储
│   ├── personas.js              # 四种工作模式定义
│   ├── agentCheck.js            # 智能体 PATH 检测
│   ├── updater.js               # 自动更新（electron-updater）
│   └── safeSend.js              # 安全 IPC 发送（防窗口已销毁崩溃）
│
├── assets/
│   └── icon.ico                 # Windows 应用图标
│
├── CLAUDE.md                    # Claude Code 项目文档
└── .claudeignore                # Claude Code 忽略规则
```

---

## 三、快速开始

### 环境要求

- Node.js 18+
- Windows 10/11 x64
- 预装的 CLI 智能体（可选）：
  - `claude`（Claude Code CLI）
  - `hermes`（Nous Research Hermes Agent）
  - `openclaw`（OpenClaw 多通道网关）

### 安装依赖

```bash
git clone https://github.com/74593abc-sudo/robot-agent.git
cd robot-agent
npm install
```

### 开发运行

```bash
npm start
```

### 构建安装包

```bash
npm run build:win
```

输出位于 `dist/` 目录：
- `dist/LingLong-Setup-1.1.0.exe` — NSIS 安装包（~68MB）
- `dist/win-unpacked/` — 免安装版本

### 安装到其他电脑

1. 将 `dist/LingLong-Setup-1.1.0.exe` 拷贝到目标电脑
2. 双击运行安装器，选择安装目录
3. 安装完成后桌面和开始菜单均有快捷方式
4. 再次安装新版本时，选择相同目录即可覆盖旧版

### 调试

- 主进程日志：终端输出
- 渲染进程：`Ctrl+Shift+I` 打开 DevTools
- 杀进程：`taskkill /F /IM electron.exe`

---

## 四、技术架构

### 进程模型

```
┌─────────────────────────────────────────────┐
│              Electron Main Process           │
│                                             │
│  main.js                                    │
│  ├── BrowserWindow 管理 (windows.js)        │
│  ├── IPC 通道注册 (ipc.js, 28 个通道)       │
│  ├── Agent 进程管理 (agents.js)             │
│  │   ├── ClaudeRuntime (claudeRuntime.js)   │
│  │   ├── Hermes (每轮 spawn)                │
│  │   └── OpenClaw (每轮 spawn)              │
│  ├── 物理模拟 (physics.js)                  │
│  ├── 系统托盘 (tray.js)                     │
│  ├── 自动更新 (updater.js)                  │
│  └── 安全 IPC (safeSend.js)                 │
│                                             │
│  preload.js                                 │
│  └── contextBridge → window.robot API       │
│                                             │
├─────────────────────────────────────────────┤
│           Renderer Processes (×3)           │
│                                             │
│  robot.html    ← set-state, cursor-point,   │
│                   set-peek, set-accent       │
│  chat.html     ← agent-event, agent-ready,  │
│                   theme-changed              │
│  bubble.html   ← bubble-show, bubble-hide    │
└─────────────────────────────────────────────┘
```

### IPC 通道（28 个）

**渲染进程 → 主进程（20 个）：**

| 通道 | 用途 |
|------|------|
| `toggle-chat` | 切换聊天窗口 |
| `hide-chat` | 隐藏聊天 |
| `quit-app` | 退出应用 |
| `robot-moved` | 拖拽结束通知 |
| `move-window` | 拖拽中实时移动 |
| `throw-from` | 甩飞速度 |
| `send-message` | 发送消息 |
| `stop-agent` | 停止生成 |
| `start-agent` | 初始化 Agent |
| `new-conversation` | 清空对话 |
| `set-persona` | 切换工作模式 |
| `fork-from` | 分叉对话 |
| `agent-changed` | Tab 切换 |
| `toggle-silent` | 切换静默 |
| `set-auto-start` | 设置开机自启 |
| `set-theme` | 设置主题 |
| `set-ui-flag` | 通用 UI 标志 |
| `bubble-click` | 气泡点击 |
| `bubble-dismiss` | 气泡关闭 |
| `onboarding-done` | 新手引导完成 |

**渲染进程 ↔ 主进程（8 个 invoke）：**

| 通道 | 用途 |
|------|------|
| `get-branch` | 获取对话分支 |
| `get-silent` | 获取静默状态 |
| `get-personas` | 获取模式列表 |
| `get-first-launch` | 首次启动检测 |
| `get-auto-start` | 获取开机自启状态 |
| `get-agent-status` | 获取智能体部署状态 |
| `get-theme` | 获取当前主题 |
| `get-ui-flag` | 获取 UI 标志 |

**主进程 → 渲染进程：**

| 通道 | 用途 |
|------|------|
| `set-state` | 设置机器人状态 |
| `trigger-pulse` | 触发 active 脉冲 |
| `agent-event` | 统一 Agent 事件流 |
| `agent-ready` | Agent 就绪 |
| `silent-changed` | 静默模式变更 |
| `theme-changed` | 主题变更 |
| `set-accent` | Agent 主题色 |
| `cursor-point` | 全局光标位置 |
| `set-peek` | 边缘偷看姿态 |
| `set-mood` | 情绪状态 |
| `bubble-show` | 显示气泡 |
| `bubble-hide` | 隐藏气泡 |

### Agent 集成

#### Claude（持久进程模式）

通过 `claudeRuntime.js` 管理一个长期存活的 `claude` CLI 进程：

```bash
claude -p --input-format=stream-json --output-format=stream-json \
       --verbose --include-partial-messages \
       --append-system-prompt "<persona>" \
       -r <sessionId> [--fork-session]
```

- 启动后保持进程存活，跨轮次复用
- JSON Lines 流式解析
- 中断 = kill + 保留 sessionId + 自动 respawn
- 10 秒初始化超时
- Windows 上使用 `shell: true`（.cmd shim 需要 shell 解析）

#### Hermes / OpenClaw（每轮 spawn 模式）

每次用户发消息时 spawn 新进程：

| Agent | 命令 |
|-------|------|
| Hermes（首轮） | `hermes -z <message>` |
| Hermes（续轮） | `hermes --continue -z <message>` |
| OpenClaw | `openclaw agent --local -m <message>` |

### 数据存储

通过 `electron-store` 持久化（JSON 文件，位于 `%APPDATA%/robot-agent/config.json`）：

| Key | 类型 | 说明 |
|-----|------|------|
| `hasLaunched` | boolean | 是否已启动过 |
| `silentMode` | boolean | 静默模式 |
| `autoStart` | boolean | 开机自启 |
| `onboardingDone` | boolean | 新手引导已完成 |
| `agentCheckDone` | boolean | 智能体检测已完成 |
| `theme` | string | 主题（`dark` / `light`） |
| `persona.claude` | string | Claude 当前模式 |
| `persona.hermes` | string | Hermes 当前模式 |
| `persona.openclaw` | string | OpenClaw 当前模式 |
| `graph.<agent>` | object | 对话图（树状节点） |
| `ui.flag.<key>` | any | 通用 UI 标志 |

---

## 五、核心功能

### 四种工作模式

| 模式 | 图标 | 系统提示 |
|------|------|---------|
| 默认 | ◐ | （无额外指令） |
| 编码 | ⌨ | 代码优先、少废话，直接给可运行的命令和文件路径 |
| 调研 | 🔎 | 信息整理、多角度对比、列出取舍 |
| 运维 | ⚙ | 关注稳定性与风险，操作命令优先给 dry-run 安全形式 |

切换模式时 Claude 会用新 system prompt 重启进程，Hermes/OpenClaw 在下次消息时重新注入 persona。

### 机器人动画状态

| 状态 | 视觉效果 |
|------|---------|
| `idle` | 嘴巴 happy，宝石 ambientGlow |
| `active` | 嘴巴 happy |
| `thinking` | 嘴巴 neutral，思考气泡 |
| `working` | 嘴巴 neutral，齿轮旋转 |
| `speaking` | 嘴巴 talk 动画 |
| `notification` | 嘴巴 surprised，眼睛放大 |
| `error` | 嘴巴 confused，眉毛显示 |
| `shy` | 眼睛 happy 弯月，腮红 |
| `sleeping` | 整体变暗，闭眼，呼吸 6.2s |
| `dizzy` | 身体 shake，闭眼 |

### 甩飞物理参数

| 参数 | 值 |
|------|-----|
| 速度上限 | 90 px/frame |
| 重力 | 1.4 px/frame² |
| 空气摩擦 | 0.992 |
| 地面摩擦 | 0.84 |
| 弹性系数 | 0.4 |
| 最小反弹速度 | 3.2 |

### 新手引导

首次启动自动打开 6 页引导：
1. 欢迎 + 功能概览
2. 三个智能体详解
3. 拖拽与物理效果
4. 快捷键与主题
5. 四种工作模式
6. 对话分叉与文件引用

可通过托盘右键「重看新手引导」随时回顾。

---

## 六、开发指南

### 添加新 Agent

1. 在 `runtime/agents.js` 的 `buildPlainCommand()` 中添加命令模板
2. 在 `runtime/ipc.js` 的 `AGENT_ACCENT` 中添加颜色
3. 在 `renderer/chat.html` 的 Tab 栏 HTML 中添加新 Tab
4. 在 `runtime/agentCheck.js` 中添加二进制名

### 添加新工作模式

在 `runtime/personas.js` 的 `_build()` 中添加条目并更新 `ORDER` 数组。

### 关键注意事项

1. **永远不要在拖拽 handler 中使用 `robotWindow.setPosition()`** — 使用 `setBounds` 并指定 width/height
2. **主进程中不要使用 `requestAnimationFrame`** — 使用 `setTimeout(tick, 16)`
3. **Windows 上 Claude CLI 需要 `shell: true`** — .cmd shim 不能用 shell:false spawn
4. **所有 `ipcMain.on()` 通过 `_on()` 包装** — 支持重注册，防止监听器累积
5. **所有窗口 IPC 通过 `safeSend()`** — 防止窗口已销毁时崩溃

---

## 七、已知问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| Windows 透明窗口 size 泄漏 | 中 | 已用 setBounds 缓解，未根治。setPosition 会导致 DWM 报告尺寸逐帧膨胀 |
| shell:true 注入风险 | 低 | Windows 上 spawn .cmd shim 必须用 shell:true，参数均为硬编码无用户输入 |

---

## 八、许可证

本项目采用 [GNU AGPL-3.0](LICENSE) 许可证。

任何分发、修改、或通过网络提供本软件服务的行为，须遵守 AGPL-3.0 的条款，包括但不限于公开衍生作品的源代码。
