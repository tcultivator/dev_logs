const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  ipcMain,
  nativeImage,
} = require("electron");
const path = require("path");

const FAB_SIZE = 72;
const MENU_WIDTH = 200;
const MENU_HEIGHT = 280;
const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 620;
const MARGIN = 18;

let fabWindow = null;
let menuWindow = null;
let panelWindow = null;
let tray = null;
let fabX = null;
let fabY = null;

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function fabPos() {
  if (fabX !== null && fabY !== null) return { x: fabX, y: fabY };
  const wa = workArea();
  return {
    x: wa.x + wa.width - FAB_SIZE - MARGIN,
    y: wa.y + wa.height - FAB_SIZE - MARGIN,
  };
}

function currentFabPos() {
  if (!fabWindow || fabWindow.isDestroyed()) return fabPos();
  const bounds = fabWindow.getBounds();
  return { x: bounds.x, y: bounds.y };
}

function createFab() {
  const pos = fabPos();
  fabWindow = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: FAB_SIZE,
    height: FAB_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  fabWindow.setVisibleOnAllWorkspaces(true);
  fabWindow.loadFile(path.join(__dirname, "fab.html"));
  fabWindow.on("closed", () => { fabWindow = null; });
}

function showMenu() {
  if (menuWindow) { closeMenu(); return; }
  closePanel();

  const pos = currentFabPos();
  const wa = workArea();
  let mx = pos.x + FAB_SIZE - MENU_WIDTH;
  let my = pos.y - MENU_HEIGHT - 10;
  if (my < wa.y) my = pos.y + FAB_SIZE + 10;
  if (mx < wa.x) mx = pos.x;

  menuWindow = new BrowserWindow({
    x: mx,
    y: my,
    width: MENU_WIDTH,
    height: MENU_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  menuWindow.setVisibleOnAllWorkspaces(true);
  menuWindow.loadFile(path.join(__dirname, "menu.html"));
  menuWindow.on("closed", () => { menuWindow = null; });
  menuWindow.on("blur", () => { closeMenu(); });
}

function closeMenu() {
  if (menuWindow && !menuWindow.isDestroyed()) menuWindow.close();
  menuWindow = null;
}

function openPage(page) {
  closeMenu();
  closePanel();

  const pos = currentFabPos();
  const wa = workArea();
  let px = pos.x + FAB_SIZE - PANEL_WIDTH;
  let py = pos.y + FAB_SIZE - PANEL_HEIGHT;
  if (px < wa.x) px = pos.x;
  if (py < wa.y) py = wa.y;

  panelWindow = new BrowserWindow({
    x: px,
    y: py,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    frame: false,
    transparent: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    backgroundColor: "#0e1118",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panelWindow.setVisibleOnAllWorkspaces(true);
  panelWindow.loadFile(path.join(__dirname, "panel.html"), {
    query: { page },
  });
  panelWindow.on("closed", () => { panelWindow = null; });
}

function closePanel() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close();
  panelWindow = null;
}

function createTray() {
  const iconPath = path.join(__dirname, "tray-icon.png");
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip("Dev Log");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show menu", click: () => showMenu() },
    { type: "separator" },
    { label: "Quit Dev Log", click: () => app.quit() },
  ]));
  tray.on("click", () => showMenu());
}

ipcMain.on("fab-click", () => showMenu());
ipcMain.on("fab-drag", (_e, dx, dy) => {
  if (!fabWindow || fabWindow.isDestroyed()) return;
  const bounds = fabWindow.getBounds();
  fabWindow.setBounds({
    x: bounds.x + dx,
    y: bounds.y + dy,
    width: bounds.width,
    height: bounds.height,
  });
});
ipcMain.on("fab-drag-end", () => {
  if (!fabWindow || fabWindow.isDestroyed()) return;
  const bounds = fabWindow.getBounds();
  fabX = bounds.x;
  fabY = bounds.y;
});
ipcMain.on("open-page", (_e, page) => openPage(page));
ipcMain.on("close-panel", () => closePanel());

app.whenReady().then(() => {
  createFab();
  createTray();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
