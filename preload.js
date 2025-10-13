const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nestApi', {
    loadConfig: () => ipcRenderer.invoke('cfg-load'),
    saveConfig: (data) => ipcRenderer.invoke('cfg-save', data),
    startSession: (user) => ipcRenderer.invoke('conn-start', user),
    sendInput: (txt) => ipcRenderer.send('pty-input', txt),
    onData: (cb) => ipcRenderer.on('pty-data', (e, d) => cb(d)),
    resize: (cols, rows) => ipcRenderer.invoke('pty-resize', { cols, rows }),
    getDirectory: (path) => ipcRenderer.invoke('get-directory', path),
    listServices: () => ipcRenderer.invoke('services-list'),
    getServiceStatus: (name) => ipcRenderer.invoke('service-status', name),
    startService: (name) => ipcRenderer.invoke('service-start', name),
    stopService: (name) => ipcRenderer.invoke('service-stop', name),
    restartService: (name) => ipcRenderer.invoke('service-restart', name)
})