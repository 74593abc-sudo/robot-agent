# 灵珑 LingLong (robot-agent)

Electron 浮动宠物桌面应用，封装三个本地 CLI 智能体（Claude、Hermes、OpenClaw）为一个统一的对话界面。

## 架构

- `main.js` — 主进程入口（窗口管理、快捷键、Agent 初始化）
- `preload.js` — IPC 安全桥接（contextBridge → window.robot API）
- `runtime/windows.js` — 窗口创建/管理/定位
- `runtime/ipc.js` — IPC 通道注册（28 个通道）
- `runtime/agents.js` — Agent 生命周期管理
- `runtime/claudeRuntime.js` — Claude CLI 持久进程（stream-json 模式）
- `runtime/physics.js` — 拖拽 + 甩飞物理模拟
- `runtime/tray.js` — 系统托盘 + 右键菜单
- `runtime/store.js` — electron-store 封装（schema 校验 + 崩溃恢复）
- `runtime/sessionGraph.js` — 树状对话存储
- `runtime/personas.js` — 四种工作模式定义
- `runtime/agentCheck.js` — 智能体 PATH 检测
- `runtime/updater.js` — 自动更新（electron-updater）
- `runtime/safeSend.js` — 安全 IPC 发送（防窗口已销毁崩溃）
- `renderer/robot.html` — 浮动宠物窗口（135×162px，透明）
- `renderer/chat.html` — 聊天界面（390×570px）
- `renderer/bubble.html` — 通知气泡（300×140px，透明）
- `renderer/onboarding.html` — 新手引导（6 页）

## Agent 事件总线

统一 `AgentEvent` 事件流：`token` / `tool_start` / `tool_end` / `state` / `done` / `error`。聊天窗口通过 `agent-event` IPC 通道接收。

## 机器人状态

`thinking` / `working`（齿轮转）/ `speaking` / `notification` / `error` / `shy` / `sleeping` / `idle` / `active`

## 关键常量

- 机器人窗口尺寸：135×162 px
- Token flush 间隔：16ms
- 边缘吸附 + peek + 900ms 滑回

## 开发

```bash
npm install
npm start          # 启动 Electron
```

杀进程：`taskkill //F //IM electron.exe`

## Windows 注意事项

- 拖拽 handler 中永远不要用 `robotWindow.setPosition()` — 用 `setBounds` 并指定 width/height
- 不要用 `setAlwaysOnTop(true, '<level>')` — 用构造函数的 `alwaysOnTop: true`
- `setVisibleOnAllWorkspaces` 仅在 macOS 使用
- Windows 上 Claude CLI .cmd shim 需要 `shell: true` 才能 spawn
- 所有窗口 IPC 通过 `safeSend()` — 防止窗口已销毁时崩溃
