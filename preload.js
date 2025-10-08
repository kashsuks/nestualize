const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nestApi', {
    loadConfig: () => ipcRenderer.invoke('cfg-load'),
    saveConfig: (data) => ipcRenderer.invoke('cfg-save', data),
    startSession: (user) => ipcRenderer.invoke('conn-start', user),
    sendInput: (text) => ipcRenderer.send('pty-input', txt),
    onData: (txt) => ipcRenderer.on('pty-data', (e, d) => cb(d)),
    resize: (cols, rows) => ipcRenderer.invoke('pty-resize', { cols, rows })
})