const os = require('os')
const pty = require('node-pty')

let termProc = null

module.exports.init = (ipcMain, app) => {
    ipcMain.handle('conn-start', (e, user) => {
        if (termProc) {
            try { termProc.kill() } catch (err) { console.error('killErr', err) }
        }
        const target = `${user}@hackclub.app`
        console.log('sshStart', target)
        try {
            termProc = pty.spawn('ssh', [target], {
                name: 'xterm-color',
                cols: 80,
                rows: 24,
                cwd: os.homedir(),
                env: Object.assign({}, process.env)
            })
        } catch (err) {
            console.error('spawnErr', err)
            e.sender.send('pty-data', `\n[ssh spawn error] ${String(err)}\n`)
            return { started: false, err: String(err) }
        }
        termProc.on('data', (d) => {
            try { e.sender.send('pty-data', d) } catch(err) {}
            process.stdout.write(d) //show the output in console
        })

        termProc.on('exit', (code, signal) => {
            const msg = `\n[session closed] code=${code} signal=${signal}\n`
            try {
                e.sender.send('pty-data', msg)
            } catch (err) {}
            console.log('sshExit', { code, signal })
            process.stdout.write(msg)
        })

        termProc.on('error', (err) => {
            console.error('ptyErr', err)
            try {
                e.sender.send('pty-data', `\n[pty error] ${String(err)}\n`)
            } catch (e) {}
        })

        return { started: true }
    })
    ipcMain.on('pty-input', (e, txt) => { if (termProc) termProc.write(txt)})
    ipcMain.handle('pty-resize', (e, { cols, rows }) => { if (termProc) termProc.resize(cols, rows); return { ok: true } })
}