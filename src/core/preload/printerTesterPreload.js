const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printerTest', {
  list: () => ipcRenderer.invoke('printer-test/list-printers'),
  printText: (payload) => ipcRenderer.invoke('printer-test/print-text', payload),
  printHtml: (payload) => ipcRenderer.invoke('printer-test/print-html', payload),
});
