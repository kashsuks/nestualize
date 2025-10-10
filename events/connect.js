const os = require('os')
const pty = require('node-pty')

let termProc = null
let directoryCallbacks = []
let isCapturingDirectory = false
let directoryOutput = ''

function stripAnsi(str) {
    return str.replace(/\x1B\[([0-9]{1,3}(;[0-9]{1,2})?)?[mGKHflSTuABCDEFnq]/g, '')
              .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
              .replace(/\x1B\][0-9];[^\x07]*\x07/g, '')
              .replace(/\x1B[=>]/g, '')
              .replace(/\x1B\[\?[0-9]+[hl]/g, '')
              .replace(/\x1B[\[\]()#;?]*[0-9;]*[a-zA-Z]/g, '')
}

module.exports.init = (ipcMain, app) => {
    ipcMain.handle('conn-start', (e, user) => {
        if (termProc) {
            try { termProc.kill() } catch (err) { console.error('killErr', err) }
        }

        const target = user + '@hackclub.app'
        console.log('sshStart', target)

        e.sender.send('pty-data', 'Connecting to ' + target + '...\r\n')

        try {
            termProc = pty.spawn('ssh', [target], {
                name: 'xterm-color',
                cols: 80,
                rows: 24,
                cwd: os.homedir(),
                env: Object.assign({}, process.env)
            })

            console.log('SSH process spawned')
        } catch (err) {
            console.error('spawnErr', err)
            e.sender.send('pty-data', '\n[ssh spawn error] ' + String(err) + '\n')
            return { started: false, err: String(err) }
        }

        termProc.on('data', (d) => {
            if (isCapturingDirectory) {
                directoryOutput += d
                
                if (d.includes('$') || d.includes('#')) {
                    setTimeout(() => {
                        if (isCapturingDirectory) {
                            isCapturingDirectory = false
                            processDirectoryOutput()
                        }
                    }, 200)
                }
            } else {
                try { e.sender.send('pty-data', d) } catch(err) {}
                process.stdout.write(d)
            }
        })

        termProc.on('exit', (code, signal) => {
            const msg = '\n[session closed] code=' + code + ' signal=' + signal + '\n'
            try {
                e.sender.send('pty-data', msg)
            } catch (err) {}
            console.log('sshExit', { code, signal })
            process.stdout.write(msg)
            termProc = null
        })

        termProc.on('error', (err) => {
            console.error('ptyErr', err)
            try {
                e.sender.send('pty-data', '\n[pty error] ' + String(err) + '\n')
            } catch (e) {}
        })

        return { started: true }
    })

    ipcMain.on('pty-input', (e, txt) => { 
        if (termProc) {
            console.log('Sending input to PTY:', txt)
            termProc.write(txt)
        } else {
            console.log('No active PTY process')
        }
    })

    ipcMain.handle('pty-resize', (e, { cols, rows }) => {
        if (termProc) {
            termProc.resize(cols, rows)
            return { ok: true }
        }
    })

    function processDirectoryOutput() {
        if (directoryCallbacks.length === 0) return

        const callback = directoryCallbacks.shift()
        
        const cleanOutput = stripAnsi(directoryOutput)
        console.log('Clean output:', cleanOutput)
        
        const lines = cleanOutput
            .split(/[\r\n]+/)
            .map(l => l.trim())
            .filter(l => {
                return l && 
                       l.length > 0 &&
                       !l.startsWith('ls ') &&
                       !l.includes('cannot access')
            })

        const promptIndex = lines.findIndex(l => l.includes('$') || l.includes('#') || l.includes('@nest'))
        const relevantLines = promptIndex >= 0 ? lines.slice(0, promptIndex) : lines

        console.log('Filtered lines:', relevantLines)

        const items = relevantLines
            .map(line => {
                const cleanLine = line.trim()
                if (!cleanLine) return null
                
                const isDir = cleanLine.endsWith('/')
                const name = isDir ? cleanLine.slice(0, -1) : cleanLine
                
                return {
                    name: name,
                    type: isDir ? 'directory' : 'file'
                }
            })
            .filter(item => 
                item && 
                item.name && 
                item.name !== '.' && 
                item.name !== '..' &&
                item.name.length > 0
            )

        console.log('Parsed directory items:', items)
        callback({ items })
        directoryOutput = ''
    }

    ipcMain.handle('get-directory', async (e, path) => {
        if (!termProc) {
            return { error: 'No active SSH connection', items: [] }
        }

        return new Promise((resolve) => {
            directoryCallbacks.push(resolve)
            
            isCapturingDirectory = true
            directoryOutput = ''

            let cmdPath = path
            if (path === '~') {
                cmdPath = '$HOME'
            } else if (path.startsWith('~/')) {
                cmdPath = '$HOME/' + path.slice(2)
            } else {
                cmdPath = path.replace(/'/g, "'\\''")
                cmdPath = "'" + cmdPath + "'"
            }
            
            const cmd = 'ls -1Ap ' + cmdPath + '\n'
            console.log('Sending directory command:', cmd.trim())
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingDirectory && directoryCallbacks.length > 0) {
                    console.log('Directory listing timeout')
                    isCapturingDirectory = false
                    const callback = directoryCallbacks.shift()
                    
                    if (directoryOutput.trim().length > 0) {
                        processDirectoryOutput()
                    } else {
                        callback({ error: 'Timeout waiting for directory listing', items: [] })
                    }
                }
            }, 3000)
        })
    })
}