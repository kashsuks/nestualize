const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const cfg = require('./events/config')
const conn = require('./events/connect')

function createMain() {
    const win = new BrowserWindow({
        width: 900,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegraion: false
        }
    })
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(() => {
    cfg.init(ipcMain, app)
    conn.init(ipcMain, app)
    createMain()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMain() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })