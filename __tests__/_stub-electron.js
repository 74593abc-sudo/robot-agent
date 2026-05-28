// Minimal stub of the `electron` module for unit tests that load runtime/*
// modules (which import { app } from 'electron'). Real Electron isn't
// available in node-only test environments.

module.exports = {
  app: {
    getLocale: () => 'en-US',
    getPath: () => '/tmp',
    isPackaged: false,
    setLoginItemSettings: () => {},
    quit: () => {},
    exit: () => {},
    requestSingleInstanceLock: () => true,
    on: () => {},
    whenReady: () => Promise.resolve(),
  },
  BrowserWindow: class { constructor() {} loadFile() {} on() {} },
  ipcMain: {
    on: () => {}, handle: () => {}, removeAllListeners: () => {}, removeHandler: () => {},
  },
  dialog: {
    showMessageBox: () => Promise.resolve(),
    showErrorBox: () => {},
  },
  screen: {
    getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayMatching: () => ({ workAreaSize: { width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  globalShortcut: { register: () => true, unregisterAll: () => {} },
  Menu: { buildFromTemplate: () => ({}) },
  Tray: class { constructor() {} setToolTip() {} setContextMenu() {} on() {} },
  nativeImage: { createFromPath: () => ({ resize: () => ({}) }), createFromDataURL: () => ({}) },
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { on: () => {}, removeAllListeners: () => {}, send: () => {}, invoke: () => Promise.resolve() },
  webUtils: { getPathForFile: () => '' },
};
