# 灵珑 LingLong (robot-agent)

Electron floating-pet desktop app wrapping three local CLI agents (Claude, Hermes, OpenClaw) into a single ambient chat surface.

## Architecture

- `main.js` — Electron main process: BrowserWindow management, IPC, agent spawning, throw/bounce physics
- `preload.js` — IPC bridge between main and renderer
- `renderer/robot.html` — floating pet sprite + animations
- `renderer/chat.html` — chat UI with inline markdown, command palette, tool-call chips
- `renderer/bubble.html` — notification bubble overlay
- `renderer/showcase.html` — demo/showcase page

## Agent Event Bus

Unified `AgentEvent` bus in main.js: `token` / `tool_start` / `tool_end` / `state` / `done` / `error`. Chat consumes via single `agent-event` IPC channel.

## Robot States

`thinking` / `working` (gears spin) / `speaking` / `notification` / `error` / `shy` / `sleeping` / `idle` / `active`

## Key Constants

- Robot window size: 150x180 px
- Token smoothing: 16ms batched flush per agent
- Edge snap + peek + 900ms grace before slide-back

## Development

```bash
npm install
npm start          # launches Electron
```

Kill Electron: `taskkill //F //IM electron.exe`

## Windows-Specific Pitfalls

- NEVER use `robotWindow.setPosition()` in drag handlers — always `setBounds` with explicit width/height (setPosition leaks OS-reported size on transparent layered windows)
- Don't call `setAlwaysOnTop(true, '<level>')` — use constructor's `alwaysOnTop: true`
- Guard `setVisibleOnAllWorkspaces` with `process.platform === 'darwin'`
