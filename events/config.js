const fs = require('fs')
const path = require('path')

function getPath(app) {
    return path.join(app.getPath('userData'), 'nest-config.json')
}

function readCfg(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8') || '{}') } catch { return {} }
}

function writeCfg(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

module.exports.init = (ipcMain, app) => {
    const file = getPath(app)
    ipcMain.handle('cfg-load', () => readCfg(file))
    ipcMain.handle('cfg-save', (e, d) => { writeCfg(file, d); return { ok: true } })
}