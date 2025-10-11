const fs = require('fs')
const path = require('path')
const os = require('os')

function getPath() {
    const homeDir = os.homedir()
    const nestDir = path.join(homeDir, '.nestualize')
    
    if (!fs.existsSync(nestDir)) {
        fs.mkdirSync(nestDir, { recursive: true })
    }
    
    return path.join(nestDir, 'config.json')
}

function readCfg(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8') || '{}') } catch { return {} }
}

function writeCfg(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

module.exports.init = (ipcMain, app) => {
    const file = getPath()
    ipcMain.handle('cfg-load', () => readCfg(file))
    ipcMain.handle('cfg-save', (e, d) => { writeCfg(file, d); return { ok: true } })
}