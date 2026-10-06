const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("devlog", {
  fabClick: () => ipcRenderer.send("fab-click"),
  fabDrag: (dx, dy) => ipcRenderer.send("fab-drag", dx, dy),
  fabDragEnd: () => ipcRenderer.send("fab-drag-end"),
  openPage: (page) => ipcRenderer.send("open-page", page),
  closePanel: () => ipcRenderer.send("close-panel"),
  onState: (cb) => ipcRenderer.on("state", (_e, d) => cb(d)),
});
