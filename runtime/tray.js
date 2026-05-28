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

function _generateRobotIcon() {
  // Draw a tiny robot (egg body + crown + screen face + jade pendant) as a
  // 16x20 RGBA buffer, then wrap it in a nativeImage.
  const W = 16, H = 20;
  const buf = Buffer.alloc(W * H * 4, 0);

  function px(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    // Alpha-blend over existing
    const sa = a / 255, da = 1 - sa;
    buf[i]     = Math.round(r * sa + buf[i] * da);
    buf[i + 1] = Math.round(g * sa + buf[i + 1] * da);
    buf[i + 2] = Math.round(b * sa + buf[i + 2] * da);
    buf[i + 3] = Math.min(255, Math.round(a + buf[i + 3] * da));
  }

  function fillEllipse(cx, cy, rx, ry, r, g, b, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) px(x, y, r, g, b, a);
      }
    }
  }

  function fillRect(x1, y1, x2, y2, r, g, b, a = 255) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++) px(x, y, r, g, b, a);
  }

  function fillTriangle(x1, y1, x2, y2, x3, y3, r, g, b, a = 255) {
    const minX = Math.min(x1, x2, x3), maxX = Math.max(x1, x2, x3);
    const minY = Math.min(y1, y2, y3), maxY = Math.max(y1, y2, y3);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d1 = (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2);
        const d2 = (x - x3) * (y2 - y3) - (x2 - x3) * (y - y3);
        const d3 = (x - x1) * (y3 - y1) - (x3 - x1) * (y - y1);
        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        if (!(hasNeg && hasPos)) px(x, y, r, g, b, a);
      }
    }
  }

  // Gold gradient: top #F4D58E, bottom #8B6818
  const goldTop = [0xF4, 0xD5, 0x8E];
  const goldBot = [0x8B, 0x68, 0x18];
  function goldColor(t) {
    return [
      Math.round(goldTop[0] + (goldBot[0] - goldTop[0]) * t),
      Math.round(goldTop[1] + (goldBot[1] - goldTop[1]) * t),
      Math.round(goldTop[2] + (goldBot[2] - goldTop[2]) * t),
    ];
  }

  // Body (egg) — centered at (8,11), rx=5, ry=6
  fillEllipse(8, 11, 5, 6, 0xF2, 0xEB, 0xDA);

  // Screen — dark rounded rect
  fillEllipse(8, 7, 4, 3, 0x0d, 0x12, 0x18);

  // Gold frame around screen
  const gc = goldColor(0.5);
  fillEllipse(8, 7, 4.5, 3.8, gc[0], gc[1], gc[2], 180);

  // Eyes — cyan
  fillEllipse(6, 7, 1, 1, 0x74, 0xF6, 0xE8);
  fillEllipse(10, 7, 1, 1, 0x74, 0xF6, 0xE8);
  // Eye highlights
  px(5, 6, 255, 255, 255, 230);
  px(9, 6, 255, 255, 255, 230);

  // Gold belt
  fillRect(4, 12, 12, 13, gc[0], gc[1], gc[2]);

  // Jade pendant
  fillEllipse(8, 14, 1.5, 1.5, 0x2E, 0xAA, 0x8A);

  // Crown spikes
  fillTriangle(5, 4, 4, 0, 6, 3, gc[0], gc[1], gc[2]);
  fillTriangle(7, 3, 7, -1, 9, 3, gc[0], gc[1], gc[2]);
  fillTriangle(9, 4, 10, 0, 8, 3, gc[0], gc[1], gc[2]);

  // Crown base
  fillRect(5, 3, 11, 4, gc[0], gc[1], gc[2]);

  // Jade gem on crown
  fillTriangle(8, 0, 6, 3, 10, 3, 0x2E, 0xAA, 0x8A);

  // Write as a proper PNG file (raw pixel buffers confuse Electron on Windows).
  const zlib = require('zlib');
  const pngPath = path.join(app.getPath('temp'), 'linglong-tray.png');

  // Build minimal PNG: IHDR + IDAT + IEND
  function crc32(data) {
    let c = 0xFFFFFFFF;
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let v = n;
      for (let k = 0; k < 8; k++) v = v & 1 ? 0xEDB88320 ^ (v >>> 1) : v >>> 1;
      table[n] = v;
    }
    for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const tbd = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tbd));
    return Buffer.concat([len, tbd, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IDAT — raw rows with filter byte 0
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter: none
    buf.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const compressed = zlib.deflateSync(raw);

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(pngPath, png);

  return nativeImage.createFromPath(pngPath);
}

function createTray(callbacks) {
  try {
    let icon;
    try {
      icon = _generateRobotIcon();
    } catch (_) {
      const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');
      if (fs.existsSync(icoPath)) {
        icon = nativeImage.createFromPath(icoPath).resize({ width: 16, height: 16 });
      }
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
  createTray, updateTrayMenu, runAgentCheckOnStartup,
};
