# 灵珑 LingLong

> 桌面浮动宠物 × 多智能体对话终端 —— 一个 Electron 应用，将三个本地 CLI 智能体封装为一只始终在屏幕上的小机器人。

<!-- PLACEHOLDER: hero-screenshot.png — 桌面全景截图，展示机器人悬浮在桌面上 + 打开的聊天窗口 -->

## 目录

- [项目概览](#一项目概览)
- [目录结构](#二目录结构)
- [UI 设计](#三ui-设计详解)
- [交互逻辑](#四交互逻辑详解)
- [核心功能](#五核心功能详解)
- [技术架构](#六技术架构)
- [快速开始](#七快速开始)
- [配置说明](#八配置说明)
- [项目现状](#九项目现状与未来规划)
- [开发指南](#十开发指南)
- [许可证](#十一许可证)

---

## 一、项目概览

### 基本信息

| 字段 | 值 |
|------|-----|
| 产品名 | 灵珑 LingLong |
| 包名 | `robot-agent` |
| 版本 | 1.0.0 |
| 描述 | Floating AI Robot Agent Desktop App |
| 应用 ID | `com.robotagent.app` |
| 入口 | `main.js` |
| 平台 | Windows x64（NSIS 安装包） |
| 语言 | 中文 / 英文 |

### 一句话定位

一只住在桌面上的 SVG 小机器人，背后连着 Claude、Hermes、OpenClaw 三个本地 AI 智能体，随时可以拖拽、甩飞、对话。

### 核心功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 三 Agent 切换对话 | ✅ | Claude / OpenClaw / Hermes 三 Tab |
| 实时流式输出 | ✅ | 16ms 批量 flush + streaming 光标 |
| Markdown 渲染 | ✅ | 标题/代码块/列表/引用/链接/加粗/斜体 |
| 工具调用展示 | ✅ | 可展开的 tool chip 卡片 |
| 对话分支 (Fork) | ✅ | 树状节点图，600 节点上限 |
| 四种工作模式 | ✅ | 默认/编码/调研/运维 |
| SVG 机器人角色 | ✅ | 皇冠、玉佩、飘带、眼睛、嘴巴 |
| 拖拽 + 甩飞物理 | ✅ | 重力/弹性/摩擦/地面反弹 |
| 边缘吸附 + 偷看 | ✅ | 靠边吸附 + peek 姿态 |
| 眼睛追踪 | ✅ | 全局光标→瞳孔跟随 |
| 空闲微动作 | ✅ | 眨眼/歪头/点头/打哈欠/左顾右盼 |
| 昵眩检测 | ✅ | 快速扫过→触发眩晕 |
| 情绪系统 | ✅ | 5 分钟无交互→ tired |
| 通知气泡 | ✅ | 聊天关闭时回复预览 |
| 系统托盘 | ✅ | 完整右键菜单 |
| 首次启动英雄动画 | ✅ | 居中放大→发光→问候 |
| 搜索 | ✅ | Ctrl+F，正则高亮 |
| 命令面板 | ✅ | `/` 前缀触发 10 条命令 |
| 文件拖入 | ✅ | 拖文件→`@path` 插入 |
| 静默模式 | ✅ | 关闭气泡通知 |
| 智能体部署检测 | ✅ | 启动时 PATH 检测 |
| 全局快捷键 | ✅ | Ctrl+Shift+Space / Ctrl+Shift+R |

### 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 桌面框架 | Electron | ^29.1.0 |
| 构建打包 | electron-builder | ^24.9.1 |
| 持久化存储 | electron-store | ^8.1.0 |
| 前端 | 纯 HTML / CSS / JS（无框架） | — |
| 角色渲染 | 内联 SVG + CSS 动画 + SMIL | — |
| Agent 集成 | Claude CLI (stream-json) / Hermes / OpenClaw | — |

### 依赖关系

```
robot-agent
├── electron-store ^8.1.0        （运行时唯一依赖）
├── electron ^29.1.0             （开发依赖）
└── electron-builder ^24.9.1     （开发依赖）
```

---

## 二、目录结构

```
robot-agent/
├── main.js                      # Electron 主进程（~950 行）
├── preload.js                   # IPC 安全桥接（~60 行）
├── package.json                 # 项目配置 + electron-builder 配置
│
├── renderer/                    # 渲染进程 HTML 文件
│   ├── robot.html               # 浮动宠物窗口（135×162px，透明）
│   ├── chat.html                # 聊天界面（390×570px）
│   ├── bubble.html              # 通知气泡（300×140px，透明）
│   └── showcase.html            # 设计稿展示页（960×720px）
│
├── runtime/                     # 后端逻辑模块
│   ├── claudeRuntime.js         # Claude CLI 持久进程管理
│   ├── sessionGraph.js          # 树状对话存储
│   ├── personas.js              # 工作模式定义
│   └── agentCheck.js            # 智能体 PATH 检测
│
├── assets/
│   ├── icon.ico                 # Windows 应用图标
│   └── robot.png                # 托盘图标
│
├── scripts/
│   ├── make-ico.js              # ICO 生成工具
│   └── png-to-ico.js            # PNG 转 ICO 工具
│
├── CLAUDE.md                    # Claude Code 项目文档
└── .claudeignore                # Claude Code 忽略规则
```

---

## 三、UI 设计详解

### 设计风格

项目采用"东方夜色"暗色主题，以深棕/金色为基调，配合各 Agent 品牌色。

### 色彩系统

**主题色（CSS 变量，`chat.html :root`）**

| 变量 | 色值 | 用途 |
|------|------|------|
| `--bg` | `#14120d` | 主背景 |
| `--bg2` | `#1b1810` | 次级背景（Tab 栏、工具栏） |
| `--bg3` | `#252015` | 三级背景（输入框、Tab） |
| `--bg4` | `#2e2818` | 悬停背景 |
| `--border` | `#352f22` | 边框 |
| `--gold` | `#D4A847` | 金色强调 |
| `--gold-soft` | `rgba(212,168,71,.55)` | 半透明金 |
| `--text` | `#ece4d0` | 主文字 |
| `--text-dim` | `#a39a82` | 次要文字 |

**Agent 品牌色**

| Agent | 色值 | 来源 |
|-------|------|------|
| Claude | `#D97757` | Anthropic Claude 珊瑚色 |
| OpenClaw | `#D63B2F` | 小龙虾红 |
| Hermes | `#F37021` | 爱马仕橙 |

**机器人角色色（robot.html）**

| 变量 | 色值 | 用途 |
|------|------|------|
| `--accent` | `#74F6E8` | 默认翡翠绿（眼睛、宝石、嘴巴） |
| `--accent-soft` | `rgba(116,246,232,.5)` | 发光效果 |

**状态指示色**

| 变量 | 色值 | 用途 |
|------|------|------|
| `--warn` | `#f0a823` | 思考中/工作中 |
| `--err` | `#ff7a6b` | 错误 |
| `--ok` | `#5fc77a` | 就绪 |

### 机器人角色窗口（robot.html）

**尺寸**：135 × 162 px，透明无边框，始终置顶。

**SVG 角色结构**（viewBox `0 0 130 168`）：

```
皇冠 (head-gem)        ← 5 瓣金色皇冠 + 中央翡翠宝石
  ↓
飘带 (ribbons)         ← 2 条金色飘带，SMIL 摆动动画
  ↓
身体 (body-group)      ← 蛋形身体，径向渐变（#FFFCF5 → #D8CFB8）
  ├── 屏幕脸 (screen)  ← 黑色圆角矩形，反光渐变
  ├── 眼睛 (eyes)      ← 2 组椭圆（base + shine），跟随光标
  ├── 嘴巴 (mouth)     ← 7 种状态：happy/neutral/speaking/surprised/sleepy/confused/shy
  ├── 腮红 (blush)     ← shy 状态显示
  ├── 手臂 (arms)      ← 2 个椭圆 + 金色手腕
  ├── 腰带 (belt)      ← 金色波浪纹腰带
  ├── 玉佩 (pendant)   ← 翡翠圆形 + "灵" 字
  ├── 齿轮 (gears)     ← working 状态显示，2 个旋转齿轮
  ├── 思考气泡          ← thinking 状态显示
  └── 通知红点          ← notification 状态显示
  ↓
底座 (base-group)      ← 金色圆环 + 翡翠光环 + 中心光点
  ↓
浮雾 (mist)            ← 3 个椭圆，SMIL 缓动漂浮
```

### 聊天界面（chat.html）

**尺寸**：390 × 570 px，无边框深色窗口。

**布局从上到下**：

1. **标题栏** — 拖拽区 + 关闭/最小化按钮 + "灵珑 · LingLong" + 静默模式 badge
2. **Tab 栏** — Claude / OpenClaw / Hermes 三标签，含彩色圆点 + 工作中旋转 + 未读红点
3. **Persona 行** — 4 个可点击的模式药丸（默认/编码/调研/运维）
4. **工具栏** — 状态指示灯 + 搜索按钮 + 新对话按钮
5. **消息区** — 可滚动，用户消息右对齐（青色边框），AI 消息左对齐（Agent 色左边框）
6. **输入区** — 自动调高 textarea + 发送/停止按钮 + 命令面板 + 拖拽覆盖层

**消息气泡样式**：
- 用户：`linear-gradient(160deg, #202d34, #1a242a)`，圆角 14/14/4/14
- AI：`linear-gradient(170deg, #1f1b12, #181410)`，圆角 14/14/14/4，左边框 3px Agent 色

### 通知气泡（bubble.html）

**尺寸**：300 × 140 px，透明无边框，不可聚焦。

半透明深色背景 + 金色边框，最多显示 4 行文本（`-webkit-line-clamp:4`），底部三角形指向机器人。6.5 秒后自动消失。

### 设计稿展示（showcase.html）

从托盘菜单"查看设计稿"打开，960 × 720 px。包含：
- 正面/侧面/背面 SVG 插图
- 6 种表情变体
- 物理参数表（尺寸、动画、色值）

---

## 四、交互逻辑详解

### 窗口交互

| 操作 | 触发 | 行为 |
|------|------|------|
| 点击机器人 | mouseup 且 dist < 4px | 单击涟漪 → 230ms 延迟后 toggleChat（双击取消） |
| 拖拽机器人 | mousedown + mousemove | 实时 setBounds 跟随光标，伪 3D 旋转（±35°） |
| 甩飞机器人 | 拖拽后快速释放（speed > 7） | throwWindow 物理模拟：重力 1.4、弹性 0.4、空气摩擦 0.992 |
| 双击机器人 | dblclick | shy 表情 + 心形/星形粒子效果，2400ms 后恢复 |
| 拖到边缘 | 拖拽释放时距离 < 4px | getEdgeSnap → 吸附到边缘 + peek 姿态（仅 110px 可见） |
| 偷看恢复 | peek 后 900ms | maybeSlideBack 检测光标是否在附近，不在则滑回 |

### 甩飞物理参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 速度上限 | 90 px/frame | clamp 后的最大速度 |
| 重力 | 1.4 px/frame² | 每帧加速 |
| 空气摩擦 | 0.992 | 水平速度衰减系数 |
| 地面摩擦 | 0.84 | 落地后水平速度衰减 |
| 弹性系数 | 0.4 | 反弹速度 = |vy| × 0.4 |
| 最小反弹速度 | 3.2 | 低于此值直接粘地 |
| 最小反弹回弹 | 2.4 | 反弹后速度低于此值也粘地 |
| 硬上限帧数 | 360 | ~6 秒强制结束 |

### 聊天交互

| 操作 | 行为 |
|------|------|
| Enter 发送 | 调用 `sendToAgent(agent, text)` |
| Shift+Enter | 换行 |
| `/` 前缀 | 打开命令面板，支持 10 条命令 |
| Ctrl+F | 搜索覆盖层，正则匹配高亮 |
| 拖文件到窗口 | 插入 `@path` 到输入框 |
| 点击工具 chip | 展开/折叠 tool detail |
| 点击复制按钮 | 复制代码块到剪贴板 |
| 点击分叉按钮 | 确认后 forkFrom 当前节点 |
| Tab 切换 | 切换 Agent，加载对应分支历史 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+Space` | 切换聊天窗口（peek 中先召回） |
| `Ctrl+Shift+R` | 召回机器人到右下角 |

### 系统托盘

右键菜单项：
1. 显示/隐藏聊天
2. 召回灵珑
3. ── 分隔线 ──
4. 智能体状态（Claude / Hermes / OpenClaw 已部署/未检测）
5. 重新检测智能体
6. ── 分隔线 ──
7. 静默模式（复选框）
8. 查看设计稿
9. ── 分隔线 ──
10. 退出

---

## 五、核心功能详解

### 5.1 多 Agent 集成

#### Claude（持久进程模式）

通过 `runtime/claudeRuntime.js` 管理一个长期存活的 `claude` CLI 进程：

```
claude -p --input-format=stream-json --output-format=stream-json \
       --verbose --include-partial-messages \
       --append-system-prompt "<persona>" \
       -r <sessionId> [--fork-session]
```

- 启动后保持进程存活，跨轮次复用
- JSON Lines 解析：`system.init`（session）、`assistant`（token/tool_use）、`user`（tool_result）、`result`（done）
- 中断（interrupt）= kill + 保留 sessionId + 自动 respawn
- 10 秒初始化超时

#### Hermes / OpenClaw（每轮 spawn 模式）

每次用户发消息时 spawn 新进程：

| Agent | 命令 |
|-------|------|
| Hermes（首轮） | `hermes -z <message>` |
| Hermes（续轮） | `hermes --continue -z <message>` |
| OpenClaw | `openclaw agent --local -m <message>` |

- 首轮消息前注入 `[系统指令] <persona>\n\n[用户] <message>`
- ANSI 转义码清理后输出
- 进程退出时写入对话图

#### 统一事件总线

所有 Agent 的输出通过统一的 `AgentEvent` 事件流传递到聊天窗口：

```
token → queueToken → 16ms flush → emitEvent → safeSend(chatWindow, 'agent-event')
```

事件类型：`token`、`tool_start`、`tool_end`、`state`、`done`、`error`、`user_node`、`fork`、`persona`

### 5.2 对话分支（Session Graph）

`runtime/sessionGraph.js` 实现树状对话存储：

```
数据结构（electron-store `graph.<agent>`）：
{
  nodes: {
    <uuid>: { id, parentId, role, text, ts, claudeSessionId?, persona?, agent }
  },
  leaf: <current-node-id>
}
```

- **append** — 追加节点作为新 leaf
- **setLeaf** — 移动 leaf 指针（分叉）
- **getBranch** — 从 leaf 向上遍历到 root，返回线性列表
- **findClaudeSessionId** — 沿分支向上查找最近的 Claude sessionId
- **_cap** — 超过 600 节点时，保留当前分支可达节点，删除最旧的不可达节点
- **迁移** — 自动将旧 `history.<agent>` 扁平数组迁移为链式图

### 5.3 工作模式（Personas）

| ID | 标签 | 图标 | 系统提示 |
|----|------|------|---------|
| `default` | 默认 | ◐ | （无） |
| `coding` | 编码 | ⌨ | "你处于「编码模式」。回答以代码和操作为主，少寒暄。解释最多两句，剩下都给代码。代码块标注语言。默认指出可运行的命令、可编辑的文件路径。" |
| `research` | 调研 | 🔎 | "你处于「调研模式」。回答以信息整理为主：要点、对比、来源、不确定点。不给完整代码（除非用户明确要求），重在帮用户建立认知。尽量给出多角度、列出取舍。" |
| `infra` | 运维 | ⚙ | "你处于「运维模式」。关注稳定性、可观测性、自动化、回滚预案。回答时优先指出潜在风险、依赖关系、副作用。操作命令要给完整的安全形态（dry-run 等）。" |

切换模式时：
- Claude：stop 当前进程，下次 send 时用新 system prompt 重启
- Hermes/OpenClaw：重置 conversationStarted，下次消息重新注入 persona

### 5.4 机器人动画系统

#### 状态机

| 状态 | CSS 类 | 视觉效果 |
|------|--------|---------|
| `idle` | `.s-idle` | 嘴巴 happy，gem ambientGlow |
| `active` | `.s-active` | 嘴巴 happy |
| `thinking` | `.s-thinking` | 嘴巴 neutral，眼睛 blink 1.7s，思考气泡 |
| `working` | `.s-working` | 嘴巴 neutral，眼睛 blink 1.1s，齿轮旋转 |
| `speaking` | `.s-speaking` | 嘴巴 talk 动画 0.32s |
| `notification` | `.s-notification` | 嘴巴 surprised，眼睛 scale(1.2)，身体 bounce |
| `error` | `.s-error` | 嘴巴 confused，眉毛显示 |
| `shy` | `.s-shy` | 眼睛 happy 弯月，腮红显示 |
| `sleeping` | `.s-sleeping` | 整体变暗 brightness(.55)，闭眼，呼吸 6.2s |
| `dizzy` | `.s-dizzy` | 身体 shake，闭眼，嘴巴 confused |
| `thrown` | `.s-thrown` | 身体 tumble 旋转，嘴巴 surprised |

#### 呼吸动画

所有状态下 `#body-group` 都有 `breath` 动画（scale 微变），速率随状态变化：
- idle: 3.4s
- thinking/working: 1.7s
- sleeping: 6.2s
- speaking: 2.0s

#### 空闲微动作

每 8-20 秒随机触发一次：

| 动作 | CSS 类 | 时长 |
|------|--------|------|
| 向上看 | `mc-lookup` | 1200ms |
| 向下看 | `mc-lookdown` | 1200ms |
| 左眼眨 | `mc-wink-l` | 1200ms |
| 右眼眨 | `mc-wink-r` | 1200ms |
| 左歪头 | `mc-tilt` | 1200ms |
| 右歪头 | `mc-tilt-r` | 1200ms |
| 加速呼吸 | `mc-bob` | 1200ms |
| 点头 | `mc-nod` | 1200ms |
| 向左看 | `mc-look-left` | 1200ms |
| 向右看 | `mc-look-right` | 1200ms |
| 好奇 | `mc-curious` | 1200ms |
| 打哈欠 | `mc-yawn` | 1800ms |

#### SMIL 动画

| 元素 | 动画 | 时长 |
|------|------|------|
| 浮雾 | cx 漂浮 + opacity | 4.5-6s |
| 底座浮动 | translateY 0→-3→0 | 3.6s |
| 身体浮动 | translateY 0→-8→0 | 3.6s |
| 飘带 | rotate ±7° | 3.2s |
| 宝石光晕 | opacity + rx 脉动 | 2.6-2.8s |
| 齿轮 | rotate 360°/-360° | 1.8-2.4s |

### 5.5 首次启动英雄动画

1. 机器人居中显示
2. `heroIn` 动画：2.6s，从 scale(.2) rotate(-18°) → scale(1.18) rotate(6°) → scale(1)
3. 1400ms 后显示问候气泡："我是灵珑。按下 Ctrl+Shift+Space 随时唤我;\n平时我在右下角等你。"
4. 3200ms 后 smoothMove 滑到右下角休息位

### 5.6 情绪系统

每 20 秒检查一次 `Date.now() - lastInteractionTs`：
- 超过 5 分钟无交互 → 进入 tired 模式（SVG 变暗 brightness(.88)，gem 光晕减弱）
- 任何交互（拖拽、发消息、快捷键等）→ 立即恢复

### 5.7 通知气泡

当聊天窗口关闭时，Agent 回复通过气泡展示：
- 位置：机器人左上方（超出屏幕时翻转到右侧）
- 内容：Markdown 被 stripMarkdown 处理为纯文本，最多 4 行
- 防抖：4 秒内不重复显示，最少 8 字符才显示
- 自动隐藏：6.5 秒
- 点击打开聊天，× 关闭气泡

---

## 六、技术架构

### 进程模型

```
┌─────────────────────────────────────────────┐
│              Electron Main Process           │
│                                             │
│  main.js                                    │
│  ├── BrowserWindow 管理                     │
│  │   ├── robotWindow (135×162, 透明)        │
│  │   ├── chatWindow (390×570)               │
│  │   └── bubbleWindow (300×140, 透明)       │
│  ├── IPC 处理                               │
│  ├── Agent 进程管理                         │
│  │   ├── ClaudeRuntime (持久进程)           │
│  │   ├── Hermes (每轮 spawn)                │
│  │   └── OpenClaw (每轮 spawn)              │
│  ├── 物理模拟 (throwWindow)                 │
│  ├── 系统托盘                               │
│  └── 全局快捷键                             │
│                                             │
│  preload.js                                 │
│  └── contextBridge → window.robot API       │
│                                             │
├─────────────────────────────────────────────┤
│           Renderer Processes (×3)           │
│                                             │
│  robot.html    ← set-state, cursor-point,   │
│                   set-peek, set-mood,        │
│                   set-accent                 │
│  chat.html     ← agent-event, agent-ready,  │
│                   silent-changed             │
│  bubble.html   ← bubble-show, bubble-hide    │
└─────────────────────────────────────────────┘
```

### IPC 通道

| 通道 | 方向 | 用途 |
|------|------|------|
| `toggle-chat` | renderer → main | 切换聊天窗口 |
| `hide-chat` | renderer → main | 隐藏聊天 |
| `robot-moved` | renderer → main | 拖拽结束通知 |
| `move-window` | renderer → main | 拖拽中实时移动 |
| `throw-from` | renderer → main | 甩飞速度 |
| `send-message` | renderer → main | 发送消息 |
| `stop-agent` | renderer → main | 停止生成 |
| `start-agent` | renderer → main | 初始化 Agent |
| `get-branch` | renderer → main (invoke) | 获取对话分支 |
| `new-conversation` | renderer → main | 清空对话 |
| `set-persona` | renderer → main | 切换工作模式 |
| `fork-from` | renderer → main | 分叉对话 |
| `agent-changed` | renderer → main | Tab 切换 |
| `get-silent` | renderer → main (invoke) | 获取静默状态 |
| `toggle-silent` | renderer → main | 切换静默 |
| `get-personas` | renderer → main (invoke) | 获取模式列表 |
| `get-first-launch` | renderer → main (invoke) | 首次启动检测 |
| `bubble-click` | renderer → main | 气泡点击 |
| `bubble-dismiss` | renderer → main | 气泡关闭 |
| `set-state` | main → renderer | 设置机器人状态 |
| `trigger-pulse` | main → renderer | 触发 active 脉冲 |
| `agent-event` | main → renderer | 统一 Agent 事件流 |
| `agent-ready` | main → renderer | Agent 就绪 |
| `silent-changed` | main → renderer | 静默模式变更 |
| `set-accent` | main → renderer | Agent 主题色 |
| `cursor-point` | main → renderer | 全局光标位置 |
| `set-peek` | main → renderer | 边缘偷看姿态 |
| `set-mood` | main → renderer | 情绪状态 |
| `bubble-show` | main → renderer | 显示气泡 |
| `bubble-hide` | main → renderer | 隐藏气泡 |

### Token 平滑机制

```
Agent 输出 → queueToken(agentName, text)
  ↓
tokenBuf[agent] += text
  ↓
如果 tokenBuf 长度 > 32KB → 立即 flush
否则 → 16ms 后 setTimeout flush
  ↓
flushTokens → emitEvent({ type: 'token', agent, text })
  ↓
safeSend(chatWindow, 'agent-event', ev)   // guards isDestroyed()
```

### 数据存储

所有持久化通过 `electron-store`（JSON 文件，位于 userData 目录）：

| Key | 类型 | 说明 |
|-----|------|------|
| `hasLaunched` | boolean | 是否已启动过 |
| `silentMode` | boolean | 静默模式 |
| `persona.claude` | string | Claude 当前模式 |
| `persona.hermes` | string | Hermes 当前模式 |
| `persona.openclaw` | string | OpenClaw 当前模式 |
| `graph.claude` | object | Claude 对话图 |
| `graph.hermes` | object | Hermes 对话图 |
| `graph.openclaw` | object | OpenClaw 对话图 |
| `agentCheckDismissed.<set>` | boolean | 部署检测"不再提示" |

对话图存储在 `graph.<agent>` 下，结构为 `{ nodes: {<uuid>: Node}, leaf: <uuid> }`。

### Windows 透明窗口 Size 泄漏

**问题**：Windows DWM 对透明 frameless 分层窗口调用 `setPosition()` 时，OS 报告的窗口尺寸会逐帧增长约 1px（`GetWindowRect` 膨胀）。

**缓解措施**：
1. 所有窗口移动统一使用 `setBounds({ x, y, width: ROBOT_W, height: ROBOT_H })`
2. 拖拽/甩飞结束后调用 `clampRobotSize()` 重置尺寸
3. 避免在创建后调用 `setAlwaysOnTop(true, '<level>')`
4. `setVisibleOnAllWorkspaces` 仅在 macOS 使用

---

## 七、快速开始

### 环境要求

- Node.js（Electron 29 需要 Node 18+）
- Windows 10/11 x64
- 需要预装的 CLI 智能体（可选）：
  - `claude`（Claude Code CLI）
  - `hermes`
  - `openclaw`

### 安装

```bash
git clone <repo-url>
cd robot-agent
npm install
```

### 开发运行

```bash
npm start
# 或
npx electron .
```

### 构建安装包

```bash
npm run build:win
```

输出位于 `dist/` 目录：
- `dist/win-unpacked/灵珑 LingLong.exe` — 免安装版本
- `dist/灵珑 LingLong Setup 1.0.0.exe` — NSIS 安装包

### 调试

- 主进程日志：`console.error` 输出到终端
- 渲染进程：`Ctrl+Shift+I` 打开 DevTools
- 杀进程：`taskkill /F /IM electron.exe`

---

## 八、配置说明

### 硬编码常量

| 常量 | 值 | 文件 | 说明 |
|------|-----|------|------|
| `ROBOT_W` | 135 | runtime/windows.js | 机器人窗口宽度 (px) |
| `ROBOT_H` | 162 | runtime/windows.js | 机器人窗口高度 (px) |
| `FLUSH_MS` | 16 | main.js | Token flush 间隔 (ms) |
| `TOKEN_BUF_MAX` | 32768 | main.js | Token buffer 上限 (bytes) |
| `PEEK_VISIBLE` | 110 | main.js | 偷看时可见宽度 (px) |
| `SNAP_THRESHOLD` | 4 | main.js | 边缘吸附距离阈值 (px) |
| `MAX_FRAMES` | 360 | main.js | 甩飞物理最大帧数 (~6s) |
| `LOOKUP_TIMEOUT_MS` | 3000 | agentCheck.js | PATH 检测超时 (ms) |
| `CODE_BLOCK_MAX` | 200 | chat.html | Markdown 代码块缓存上限 |
| `W` / `H` | 135 / 162 | robot.html | 渲染进程窗口尺寸 |
| `FLOAT_DUR` | 各状态不同 | robot.html | 呼吸动画时长映射 |

### electron-store 配置

存储路径：`%APPDATA%/robot-agent/config.json`

| Key | 默认值 | 说明 |
|-----|--------|------|
| `hasLaunched` | `false` | 首次启动标记 |
| `silentMode` | `false` | 静默模式 |
| `persona.claude` | `'default'` | Claude 工作模式 |
| `persona.hermes` | `'default'` | Hermes 工作模式 |
| `persona.openclaw` | `'default'` | OpenClaw 工作模式 |

### electron-builder 配置

内联在 `package.json` 的 `build` 字段中：

```json
{
  "appId": "com.robotagent.app",
  "productName": "灵珑 LingLong",
  "win": {
    "target": "nsis",
    "icon": "assets/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "灵珑 LingLong"
  }
}
```

---

## 九、项目现状与未来规划

### 已完成

- [x] 三 Agent 切换对话
- [x] 实时流式输出 + Markdown 渲染
- [x] 工具调用展示
- [x] 对话分支 (Fork)
- [x] 四种工作模式
- [x] SVG 机器人角色 + 10 种状态动画
- [x] 拖拽 + 甩飞物理
- [x] 边缘吸附 + 偷看
- [x] 眼睛追踪
- [x] 空闲微动作 + 情绪系统
- [x] 通知气泡
- [x] 系统托盘
- [x] 全局快捷键
- [x] 搜索 + 命令面板
- [x] 文件拖入
- [x] 静默模式
- [x] 智能体部署检测
- [x] 首次启动英雄动画
- [x] 设计稿展示页

### 已知问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| Windows 透明窗口 size 泄漏 | 中 | 已用 setBounds 缓解，未根治 |
| requestAnimationFrame 主进程不可用 | 已修复 | 已改用 setTimeout |
| screen.getDisplayMatching 边界异常 | 已修复 | 已加 try/catch + primaryDisplay fallback |
| Hermes/OpenClaw shell:true 注入风险 | 低 | 已做 null byte 清理 |
| 根目录截图/日志未清理 | 低 | 开发产物，不影响功能 |

### 待实现

- [ ] 多显示器管理 UI
- [ ] 自动更新（electron-updater）
- [ ] 持久化日志系统
- [ ] 单元测试 / 集成测试
- [ ] 设置界面
- [ ] macOS / Linux 平台适配
- [ ] Agent 输出的流式 Markdown 增量渲染（当前为全量 re-render）

### 可扩展性

- **添加新 Agent**：在 `buildPlainCommand` 中添加命令模板，`AGENT_ACCENT` 中添加颜色，`chat.html` 中添加 Tab
- **添加新 Persona**：在 `personas.js` 的 `PERSONAS` 对象中添加条目
- **添加新动画状态**：在 `robot.html` 的 CSS 中添加 `.s-<state>` 样式，在 `FLOAT_DUR` 中添加时长

---

## 十、开发指南

### 代码结构

| 文件 | 行数 | 职责 |
|------|------|------|
| `main.js` | ~950 | 主进程全部逻辑（窗口、IPC、Agent、物理、托盘） |
| `preload.js` | ~60 | IPC 安全桥接 |
| `renderer/robot.html` | ~860 | 机器人角色 + 动画 + 拖拽 |
| `renderer/chat.html` | ~1050 | 聊天界面 + Markdown + 搜索 |
| `renderer/bubble.html` | ~140 | 通知气泡 |
| `renderer/showcase.html` | ~275 | 设计稿展示 |
| `runtime/claudeRuntime.js` | ~250 | Claude CLI 管理 |
| `runtime/sessionGraph.js` | ~145 | 对话图存储 |
| `runtime/personas.js` | ~55 | 模式定义 |
| `runtime/agentCheck.js` | ~45 | PATH 检测 |

### 添加新 Agent

1. 在 `buildPlainCommand()` 中添加命令模板
2. 在 `AGENT_ACCENT` 中添加 `{ color, soft }` 色值
3. 在 `chat.html` 的 `LABELS`、`COLORS` 中添加映射
4. 在 `chat.html` 的 Tab 栏 HTML 中添加新 Tab
5. 在 `agentCheck.js` 的 `AGENT_BINARIES` 中添加二进制名
6. 在 `bubble.html` 的 `AGENT_INFO` 中添加显示信息

### 添加新工作模式

在 `runtime/personas.js` 的 `PERSONAS` 对象中添加：

```js
newMode: {
  id: 'newMode',
  label: '新模式',
  icon: '🔧',
  systemPrompt: '你的系统提示...'
}
```

并更新 `ORDER` 数组。

### 关键开发注意事项

1. **永远不要在拖拽 handler 中使用 `robotWindow.setPosition()`** — 使用 `setBounds` 并指定 width/height
2. **主进程中不要使用 `requestAnimationFrame`** — Electron 主进程不支持，使用 `setTimeout(tick, 16)`
3. **`screen.getDisplayMatching()` 在窗口部分超出屏幕时可能抛异常** — 始终 try/catch 并 fallback 到 `screen.getPrimaryDisplay()`
4. **所有 `ipcRenderer.on()` 调用通过 `_safeOn()` 包装** — 防止监听器累积

---

## 十一、许可证

本项目采用 [GNU AGPL-3.0](LICENSE) 许可证。

任何分发、修改、或通过网络提供本软件服务的行为，须遵守 AGPL-3.0 的条款，包括但不限于公开衍生作品的源代码。
