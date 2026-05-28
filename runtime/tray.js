const { app, BrowserWindow, Menu, Tray, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { checkAgents } = require('./agentCheck');
const { getIsChatVisible, getRobotWindow } = require('./windows');
const updater = require('./updater');

const AGENT_DISPLAY = { claude: 'Claude Code', hermes: 'Hermes', openclaw: 'OpenClaw' };
let lastAgentCheck = null;
let tray = null;

function buildTrayMenu(callbacks) {
  const { toggleChat, recallRobot, getSilent, setSilent, getAutoStart, setAutoStart, getTheme, setTheme, forceCheck, openOnboarding } = callbacks;
  const currentTheme = getTheme();
  const items = [
    { label: getIsChatVisible() ? '隐藏聊天' : '显示聊天', click: () => toggleChat() },
    { label: '召回灵珑', click: () => recallRobot() },
    { type: 'separator' },
    { label: '智能体', enabled: false },
    { label: `  Claude: ${lastAgentCheck?.claude ? '已部署' : '未检测'}`, enabled: false },
    { label: `  Hermes: ${lastAgentCheck?.hermes ? '已部署' : '未检测'}`, enabled: false },
    { label: `  OpenClaw: ${lastAgentCheck?.openclaw ? '已部署' : '未检测'}`, enabled: false },
    { label: '重新检测智能体', click: () => forceCheck() },
    { type: 'separator' },
    { type: 'checkbox', label: '静默模式', checked: getSilent(), click: (item) => {
      setSilent(item.checked);
    }},
    { type: 'checkbox', label: '开机自启', checked: getAutoStart(), click: (item) => {
      setAutoStart(item.checked);
    }},
    { label: '主题', enabled: false },
    { type: 'radio', label: '暗色(东方夜色)', checked: currentTheme === 'dark', click: () => setTheme('dark') },
    { type: 'radio', label: '亮色', checked: currentTheme === 'light', click: () => setTheme('light') },
    { type: 'separator' },
    { label: '重看新手引导', click: () => { if (openOnboarding) openOnboarding(); } },
    { label: '查看设计稿', click: () => {
      const w = new BrowserWindow({ width: 960, height: 720, title: '灵珑 · 设计稿', webPreferences: { contextIsolation: true, nodeIntegration: false } });
      w.loadFile(path.join(__dirname, '..', 'renderer', 'showcase.html'));
    }},
    { type: 'separator' },
  ];
  // Update item only appears when an update is downloaded and ready.
  if (updater.isUpdateReady()) {
    items.push({ label: '⬆ 重启以应用新版本', click: () => updater.quitAndInstall() });
    items.push({ type: 'separator' });
  }
  items.push({ label: '退出', click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}

function createTray(callbacks) {
  try {
    const iconPath = path.join(__dirname, '..', 'assets', 'robot.png');
    const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');
    let icon;
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } else if (fs.existsSync(icoPath)) {
      icon = nativeImage.createFromPath(icoPath).resize({ width: 16, height: 16 });
    } else {
      // Asset files missing (broken install / dev fork). The SVG fallback
      // works on modern Windows but may not render on older Tray APIs;
      // log loudly so the issue surfaces.
      console.error('[tray] icon assets missing — falling back to inline SVG. ' +
                    'Expected: ' + iconPath + ' or ' + icoPath);
      icon = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="#D4A847" stroke="#8B6914" stroke-width="1"/></svg>').toString('base64'));
    }
    tray = new Tray(icon);
    tray.setToolTip('灵珑 · LingLong');
    tray.setContextMenu(buildTrayMenu(callbacks));
    tray.on('click', () => callbacks.toggleChat());
  } catch (_) {}
  return tray;
}

function updateTrayMenu(callbacks) {
  if (tray) tray.setContextMenu(buildTrayMenu(callbacks));
}

function getTray() { return tray; }

async function runAgentCheckOnStartup(store, { force = false } = {}) {
  const result = await checkAgents();
  lastAgentCheck = result;
  const missing = Object.keys(AGENT_DISPLAY).filter(a => !result[a]);

  if (missing.length === 0) {
    if (force) {
      dialog.showMessageBox(getRobotWindow() || undefined, {
        type: 'info',
        title: '智能体检测',
        message: '三个智能体均已部署。',
        buttons: ['好的'],
        defaultId: 0,
      });
    }
    return;
  }

  // On first launch, show a gentle info message about missing agents
  if (!force && !store.get('agentCheckDone', false)) {
    const names = missing.map(a => AGENT_DISPLAY[a]).join('、');
    dialog.showMessageBox(getRobotWindow() || undefined, {
      type: 'info',
      title: '灵珑 · 智能体提示',
      message: `部分智能体未安装：${names}`,
      detail: '对应的 Tab 已灰显，您可以先使用已安装的智能体（如 Claude）。如需使用其他智能体，请参考各自文档完成安装后重启灵珑。',
      buttons: ['知道了'],
      defaultId: 0,
    });
    store.set('agentCheckDone', true);
  }
}

module.exports = {
  createTray, updateTrayMenu, getTray, buildTrayMenu, runAgentCheckOnStartup,
};
