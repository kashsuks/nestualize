const os = require('os')
const pty = require('node-pty')

let termProc = null
let directoryCallbacks = []
let servicesCallbacks = []
let serviceCommandCallbacks = []
let isCapturingDirectory = false
let isCapturingServices = false
let isCapturingServiceCommand = false
let directoryOutput = ''
let servicesOutput = ''
let serviceCommandOutput = ''

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
            } else if (isCapturingServices) {
                servicesOutput += d
                
                if (d.includes('$') || d.includes('#')) {
                    setTimeout(() => {
                        if (isCapturingServices) {
                            isCapturingServices = false
                            processServicesOutput()
                        }
                    }, 200)
                }
            } else if (isCapturingServiceCommand) {
                serviceCommandOutput += d
                
                if (d.includes('$') || d.includes('#')) {
                    setTimeout(() => {
                        if (isCapturingServiceCommand) {
                            isCapturingServiceCommand = false
                            processServiceCommandOutput()
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

    function processServicesOutput() {
        if (servicesCallbacks.length === 0) return

        const callback = servicesCallbacks.shift()
        
        const cleanOutput = stripAnsi(servicesOutput)
        console.log('Services clean output:', cleanOutput)
        
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

        const services = relevantLines
            .filter(line => line.endsWith('.service'))
            .map(line => {
                const name = line.replace('.service', '')
                return {
                    name: name,
                    description: 'Systemd service',
                    status: 'unknown'
                }
            })

        console.log('Parsed services:', services)
        callback({ services })
        servicesOutput = ''
    }

    function processServiceCommandOutput() {
        if (serviceCommandCallbacks.length === 0) return

        const callback = serviceCommandCallbacks.shift()
        
        const cleanOutput = stripAnsi(serviceCommandOutput)
        console.log('Service command output:', cleanOutput)
        
        callback({ output: cleanOutput })
        serviceCommandOutput = ''
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

    ipcMain.handle('services-list', async () => {
        if (!termProc) {
            return { error: 'No active SSH connection', services: [] }
        }

        return new Promise((resolve) => {
            servicesCallbacks.push(resolve)
            
            isCapturingServices = true
            servicesOutput = ''

            const cmd = 'ls ~/.config/systemd/user/*.service\n'
            console.log('Sending services list command:', cmd.trim())
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServices && servicesCallbacks.length > 0) {
                    console.log('Services listing timeout')
                    isCapturingServices = false
                    const callback = servicesCallbacks.shift()
                    
                    if (servicesOutput.trim().length > 0) {
                        processServicesOutput()
                    } else {
                        callback({ error: 'Timeout or no services found', services: [] })
                    }
                }
            }, 3000)
        })
    })

    ipcMain.handle('service-status', async (e, serviceName) => {
        if (!termProc) {
            return { status: 'unknown' }
        }

        return new Promise((resolve) => {
            serviceCommandCallbacks.push((result) => {
                const output = result.output.toLowerCase()
                if (output.includes('active')) {
                    resolve({ status: 'active' })
                } else if (output.includes('inactive') || output.includes('failed')) {
                    resolve({ status: 'inactive' })
                } else {
                    resolve({ status: 'unknown' })
                }
            })
            
            isCapturingServiceCommand = true
            serviceCommandOutput = ''

            const cmd = 'systemctl --user is-active ' + serviceName + '\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServiceCommand) {
                    isCapturingServiceCommand = false
                    if (serviceCommandCallbacks.length > 0) {
                        const callback = serviceCommandCallbacks.shift()
                        callback({ output: '' })
                    }
                }
            }, 2000)
        })
    })

    ipcMain.handle('service-start', async (e, serviceName) => {
        if (!termProc) {
            return { success: false, error: 'Not connected' }
        }

        return new Promise((resolve) => {
            serviceCommandCallbacks.push(() => {
                resolve({ success: true })
            })
            
            isCapturingServiceCommand = true
            serviceCommandOutput = ''

            const cmd = 'systemctl --user start ' + serviceName + '\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServiceCommand) {
                    isCapturingServiceCommand = false
                    if (serviceCommandCallbacks.length > 0) {
                        serviceCommandCallbacks.shift()
                    }
                    resolve({ success: true })
                }
            }, 2000)
        })
    })

    ipcMain.handle('service-stop', async (e, serviceName) => {
        if (!termProc) {
            return { success: false, error: 'Not connected' }
        }

        return new Promise((resolve) => {
            serviceCommandCallbacks.push(() => {
                resolve({ success: true })
            })
            
            isCapturingServiceCommand = true
            serviceCommandOutput = ''

            const cmd = 'systemctl --user stop ' + serviceName + '\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServiceCommand) {
                    isCapturingServiceCommand = false
                    if (serviceCommandCallbacks.length > 0) {
                        serviceCommandCallbacks.shift()
                    }
                    resolve({ success: true })
                }
            }, 2000)
        })
    })

    ipcMain.handle('service-restart', async (e, serviceName) => {
        if (!termProc) {
            return { success: false, error: 'Not connected' }
        }

        return new Promise((resolve) => {
            serviceCommandCallbacks.push(() => {
                resolve({ success: true })
            })
            
            isCapturingServiceCommand = true
            serviceCommandOutput = ''

            const cmd = 'systemctl --user restart ' + serviceName + '\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServiceCommand) {
                    isCapturingServiceCommand = false
                    if (serviceCommandCallbacks.length > 0) {
                        serviceCommandCallbacks.shift()
                    }
                    resolve({ success: true })
                }
            }, 2000)
        })
    })
}