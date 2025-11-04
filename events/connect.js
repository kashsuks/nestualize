const os = require('os')
const pty = require('node-pty')

let termProc = null
let directoryCallbacks = []
let servicesCallbacks = []
let timersCallbacks = []
let timerStatusCallbacks = []
let serviceCommandCallbacks = []
let isCapturingDirectory = false
let isCapturingServices = false
let isCapturingTimers = false
let isCapturingTimerStatus = false
let isCapturingServiceCommand = false
let directoryOutput = ''
let servicesOutput = ''
let timersOutput = ''
let timerStatusOutput = ''
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
            } else if (isCapturingTimers) {
                timersOutput += d
                
                if (d.includes('$') || d.includes('#')) {
                    setTimeout(() => {
                        if (isCapturingTimers) {
                            isCapturingTimers = false
                            processTimersOutput()
                        }
                    }, 200)
                }
            } else if (isCapturingTimerStatus) {
                timerStatusOutput += d
                
                if (d.includes('$') || d.includes('#') || d.includes('@nest')) {
                    setTimeout(() => {
                        if (isCapturingTimerStatus) {
                            isCapturingTimerStatus = false
                            processTimerStatusOutput()
                        }
                    }, 200)
                }
            } else if (isCapturingServiceCommand) {
                serviceCommandOutput += d
                console.log('Capturing service command data:', JSON.stringify(d))
                
                if (d.includes('$') || d.includes('#') || d.includes('@nest')) {
                    setTimeout(() => {
                        if (isCapturingServiceCommand) {
                            console.log('Prompt detected, processing service command output')
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
                const parts = line.split('/')
                const filename = parts[parts.length - 1]
                const name = filename.replace('.service', '')
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

    function processTimersOutput() {
        if (timersCallbacks.length === 0) return

        const callback = timersCallbacks.shift()
        
        const cleanOutput = stripAnsi(timersOutput)
        console.log('Timers clean output:', cleanOutput)
        
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

        const timers = relevantLines
            .filter(line => line.endsWith('.timer'))
            .map(line => {
                const parts = line.split('/')
                const filename = parts[parts.length - 1]
                const name = filename.replace('.timer', '')
                return {
                    name: name,
                    description: 'Systemd timer',
                    status: 'unknown',
                    nextTrigger: null,
                    unit: null
                }
            })

        console.log('Parsed timers:', timers)
        callback({ timers })
        timersOutput = ''
    }

    function processTimerStatusOutput() {
        if (timerStatusCallbacks.length === 0) return

        const callback = timerStatusCallbacks.shift()
        
        const cleanOutput = stripAnsi(timerStatusOutput)
        console.log('Timer status output:', cleanOutput)
        
        // Parse timer details from systemctl list-timers output
        const lines = cleanOutput.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0)
        
        let nextTrigger = null
        let unit = null
        
        for (const line of lines) {
            // Look for lines containing time information
            if (line.match(/\d+h|\d+min|\d+s|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i)) {
                const parts = line.split(/\s+/)
                if (parts.length >= 2) {
                    nextTrigger = parts.slice(0, -1).join(' ')
                    unit = parts[parts.length - 1]
                }
            }
        }
        
        callback({ nextTrigger, unit })
        timerStatusOutput = ''
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

            const cmd = 'ls ~/.config/systemd/user/*.service 2>/dev/null\n'
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

    ipcMain.handle('timers-list', async () => {
        if (!termProc) {
            return { error: 'No active SSH connection', timers: [] }
        }

        return new Promise((resolve) => {
            timersCallbacks.push(resolve)
            
            isCapturingTimers = true
            timersOutput = ''

            const cmd = 'ls ~/.config/systemd/user/*.timer 2>/dev/null\n'
            console.log('Sending timers list command:', cmd.trim())
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingTimers && timersCallbacks.length > 0) {
                    console.log('Timers listing timeout')
                    isCapturingTimers = false
                    const callback = timersCallbacks.shift()
                    
                    if (timersOutput.trim().length > 0) {
                        processTimersOutput()
                    } else {
                        callback({ error: 'Timeout or no timers found', timers: [] })
                    }
                }
            }, 3000)
        })
    })

    ipcMain.handle('timer-status', async (e, timerName) => {
        if (!termProc) {
            return { nextTrigger: null, unit: null }
        }

        return new Promise((resolve) => {
            timerStatusCallbacks.push(resolve)
            
            isCapturingTimerStatus = true
            timerStatusOutput = ''

            const cmd = 'systemctl --user list-timers ' + timerName + '.timer 2>/dev/null | grep "' + timerName + '"\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingTimerStatus) {
                    console.log('Timer status timeout for', timerName)
                    isCapturingTimerStatus = false
                    if (timerStatusCallbacks.length > 0) {
                        const callback = timerStatusCallbacks.shift()
                        if (timerStatusOutput.trim()) {
                            processTimerStatusOutput()
                        } else {
                            callback({ nextTrigger: null, unit: null })
                        }
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
                const rawOutput = result.output.toLowerCase().trim()
                console.log('Service status check for', serviceName, '- raw output:', JSON.stringify(result.output))
                
                const lines = rawOutput.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0)
                let status = 'unknown'
                
                for (const line of lines) {
                    if (line === 'active') {
                        status = 'active'
                        break
                    } else if (line === 'inactive' || line === 'failed') {
                        status = 'inactive'
                        break
                    }
                }
                
                console.log('Service status check for', serviceName, '- extracted status:', status)
                
                resolve({ status: status })
            })
            
            isCapturingServiceCommand = true
            serviceCommandOutput = ''

            const cmd = 'systemctl --user is-active ' + serviceName + '\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServiceCommand) {
                    console.log('Service command timeout for', serviceName)
                    isCapturingServiceCommand = false
                    if (serviceCommandCallbacks.length > 0) {
                        const callback = serviceCommandCallbacks.shift()
                        if (serviceCommandOutput.trim()) {
                            processServiceCommandOutput()
                        } else {
                            callback({ output: '' })
                        }
                    }
                }
            }, 3000)
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
            }, 3000)
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
            }, 3000)
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
            }, 3000)
        })
    })

    // Timer control handlers
    ipcMain.handle('timer-start', async (e, timerName) => {
        if (!termProc) {
            return { success: false, error: 'Not connected' }
        }

        return new Promise((resolve) => {
            serviceCommandCallbacks.push(() => {
                resolve({ success: true })
            })
            
            isCapturingServiceCommand = true
            serviceCommandOutput = ''

            const cmd = 'systemctl --user start ' + timerName + '.timer\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServiceCommand) {
                    isCapturingServiceCommand = false
                    if (serviceCommandCallbacks.length > 0) {
                        serviceCommandCallbacks.shift()
                    }
                    resolve({ success: true })
                }
            }, 3000)
        })
    })

    ipcMain.handle('timer-stop', async (e, timerName) => {
        if (!termProc) {
            return { success: false, error: 'Not connected' }
        }

        return new Promise((resolve) => {
            serviceCommandCallbacks.push(() => {
                resolve({ success: true })
            })
            
            isCapturingServiceCommand = true
            serviceCommandOutput = ''

            const cmd = 'systemctl --user stop ' + timerName + '.timer\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServiceCommand) {
                    isCapturingServiceCommand = false
                    if (serviceCommandCallbacks.length > 0) {
                        serviceCommandCallbacks.shift()
                    }
                    resolve({ success: true })
                }
            }, 3000)
        })
    })

    ipcMain.handle('timer-enable', async (e, timerName) => {
        if (!termProc) {
            return { success: false, error: 'Not connected' }
        }

        return new Promise((resolve) => {
            serviceCommandCallbacks.push(() => {
                resolve({ success: true })
            })
            
            isCapturingServiceCommand = true
            serviceCommandOutput = ''

            const cmd = 'systemctl --user enable --now ' + timerName + '.timer\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServiceCommand) {
                    isCapturingServiceCommand = false
                    if (serviceCommandCallbacks.length > 0) {
                        serviceCommandCallbacks.shift()
                    }
                    resolve({ success: true })
                }
            }, 3000)
        })
    })

    ipcMain.handle('timer-disable', async (e, timerName) => {
        if (!termProc) {
            return { success: false, error: 'Not connected' }
        }

        return new Promise((resolve) => {
            serviceCommandCallbacks.push(() => {
                resolve({ success: true })
            })
            
            isCapturingServiceCommand = true
            serviceCommandOutput = ''

            const cmd = 'systemctl --user disable --now ' + timerName + '.timer\n'
            termProc.write(cmd)

            setTimeout(() => {
                if (isCapturingServiceCommand) {
                    isCapturingServiceCommand = false
                    if (serviceCommandCallbacks.length > 0) {
                        serviceCommandCallbacks.shift()
                    }
                    resolve({ success: true })
                }
            }, 3000)
        })
    })
}