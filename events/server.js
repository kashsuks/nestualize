const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { ipcMain } = require('electron')

function getServicesPath() {
    return path.join(os.homedir(), '.config', 'systemd', 'user')
}

function parseServiceFile(filepath) {
    try {
        const content = fs.readFileSync(filepath, 'utf8')
        const lines = content.split('\n')
        let description = ''

        lines.forEach(line => {
            if (line.startsWith('Description=')) {
                description = line.substring(12).trim()
            }
        })

        return { description }
    } catch (err) {
        console.error('Error parsing service file:', err)
        return { description: 'No description available' }
    }
}

module.exports.init = (ipcMain) => {
    ipcMain.handle('services-list', async () => {
        if (!fs.existsSync(servicesPath)) {
            return { error: 'Services directory not found', services: [] }
        }

        try {
            const files = fs.readdirSync(servicesPath)
            const serviceFiles = files.filter(f => f.endsWith('.service'))

            const service = serviceFiles.map(file => {
                const name = file.replace('.service', '')
                const filePath = path.join(servicesPath, file)
                const { description } = parseServiceFile(filepath)

                return {
                    name,
                    description,
                    status: 'unknown'
                }
            })

            return { services }
        } catch (err) {
            console.error('Error listing services', err)
            return { error: String(err), services: [] }
        }
    })

    ipcMain.handle('service-status', async (exec, serviceName) => {
        return new Promise((resolve) => {
            exec('systemctl --user is-active ' + serviceName, (error, stdout) => {
                const status = stdout.trim()
                const isActive = status === 'active'
                resolve({ status: isActive ? 'active' : 'inactive' })
            })
        })
    })

    ipcMain.handle('service-start', async (e, serviceName) => {
        return new Promise((resolve) => { // omg i actually love promise
            exec('systemctl --user start ' + serviceName, (error) => {
                if (error) {
                    resolve({ success: false, error: String(error) }) 
                } else {
                    resolve({ success: true })
                }
            })
        })
    })

    ipcMain.handle('service-stop', async (e, serviceName) => {
        return new Promise((resolve) => {
            exec('systemctl --user stop ' + serviceName, (error) => {
                if (error) {
                    resolve({ success: false, error: String(error) })
                } else {
                    resolve({ success: true })
                }
            })
        })
    })

    ipcMain.handle('service-restard', async (e, serviceName) => {
        return new Promise((resolve) => {
            exec('systemctl --user restart ' + serviceName, (error) => {
                if (error) {
                    resolve({ success: false, error: String(error) })
                } else {
                    resolve({ success: true })
                }
            })
        })
    })
}