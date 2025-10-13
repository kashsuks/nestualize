window.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('startup-overlay')

    setTimeout(() => {
        overlay.classList.add('fade-out')
        setTimeout(() => {
            overlay.classList.remove('active')
            overlay.style.display = 'none'
            checkFirstTime()
        }, 800)
    }, 3000)
})

const { Terminal } = window;
const term = new Terminal({ cols: 80, rows: 24 })
const wrap = document.getElementById('termWrap')
const userIn = document.getElementById('user')
const btnSave = document.getElementById('btnSave')
const btnStart = document.getElementById('btnStart')
const btnRefresh = document.getElementById('btnRefresh')

let isConnected = false
let currentPath = '~'

term.open(wrap)
term.focus()

console.log('terminal init complete')

function checkFirstTime() {
    window.nestApi.loadConfig().then(config => {
        if (!config.hasSeenTutorial) {
            showTutorial()
        }
    })
}

function showTutorial() {
    const tutorialOverlay = document.getElementById('tutorial-overlay')
    const raccoon = document.getElementById('tutorial-raccoon')

    tutorialOverlay.classList.add('active')

    raccoon.addEventListener('click', () => {
        const bubble = document.getElementById('tutorial-bubble')
        bubble.classList.add('active')
    })
}

function startGuide() {
    const bubble = document.getElementById('tutorial-bubble')
    bubble.innerHTML = '<p class="bubble-title">Do you have a Nest account?</p><div class="bubble-actions"><button onclick="hasAccount()" class="bubble-btn primary">Yes</button><button onclick="noAccount()" class="bubble-btn secondary">No</button></div>'
}

function hasAccount() {
    const bubble = document.getElementById('tutorial-bubble')
    bubble.innerHTML = '<p class="bubble-title">Great! Let\'s continue</p><p class="bubble-text">You\'re all set to start using Nestualize. Click below to finish the tutorial.</p><div class="bubble-actions"><button onclick="dismissTutorial()" class="bubble-btn primary">Finish</button></div>'
}

function noAccount() {
    const bubble = document.getElementById('tutorial-bubble')
    bubble.innerHTML = '<p class="bubble-title">Setting up Nest</p><div class="bubble-steps"><p class="bubble-step"><strong>Step 1:</strong> Join the Hack Club Slack at <a href="https://hackclub.com/slack" target="_blank">hackclub.com/slack</a></p><p class="bubble-step"><strong>Step 2:</strong> Send a DM to @quetzal on Slack asking for a Nest account</p><p class="bubble-step"><strong>Step 3:</strong> They will provide you with your hash and account details</p></div><div class="bubble-actions"><button onclick="testSSH()" class="bubble-btn primary">I have my account, test SSH</button><button onclick="dismissTutorial()" class="bubble-btn secondary">I\'ll do this later</button></div>'
}

function testSSH() {
    const bubble = document.getElementById('tutorial-bubble')
    bubble.innerHTML = '<p class="bubble-title">Test your SSH connection</p><p class="bubble-text">Enter your Nest username in the input field at the top and click "Start Nest" to test your connection.</p><div class="bubble-actions"><button onclick="dismissTutorial()" class="bubble-btn primary">Got it!</button></div>'
    document.querySelector('[data-view="terminal"]').click()
}

function dismissTutorial() {
    const tutorialOverlay = document.getElementById('tutorial-overlay')
    const bubble = document.getElementById('tutorial-bubble')

    bubble.classList.remove('active')
    tutorialOverlay.classList.remove('active')

    window.nestApi.loadConfig().then(config => {
        config.hasSeenTutorial = true
        window.nestApi.saveConfig(config)
    })
}

const sidebar = document.getElementById('sidebar')
const hamburger = document.getElementById('hamburger')

hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed')
})

const navItems = document.querySelectorAll('.nav-item')
const viewContainers = document.querySelectorAll('.view-container')

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const viewName = item.dataset.view

        navItems.forEach(nav => nav.classList.remove('active'))
        item.classList.add('active')

        viewContainers.forEach(view => view.classList.remove('active'))
        document.getElementById('view-' + viewName).classList.add('active')
    })
})

window.nestApi.loadConfig().then(c => {
    console.log('Config loaded:', c)
    if (c && c.username) userIn.value = c.username 
})

btnSave.addEventListener('click', () => {
    const u = userIn.value.trim()
    console.log('Saving config:', u)
    window.nestApi.saveConfig({ username: u })
})

btnStart.addEventListener('click', async () => {
    const u = userIn.value.trim()
    if (!u) {
        console.log('No username provided')
        return
    }

    console.log('Starting session for:', u)
    const result = await window.nestApi.startSession(u)
    console.log('Session start result:', result)

    setTimeout(() => {
        isConnected = true
        console.log('Connection ready for commands')
    }, 2000)
})

function sendCommand(cmd) {
    console.log('Sending command:', cmd)
    if (!isConnected) {
        console.warn('Not connected yet, sending anyway')
    }
    window.nestApi.sendInput(cmd + '\n')
}

const cmdButtons = [
    { id: 'cmd-ls', cmd: 'ls'},
    { id: 'cmd-pwd', cmd: 'pwd'},
    { id: 'cmd-whoami', cmd: 'whoami'},
    { id: 'cmd-clear', cmd: 'clear'}
]

cmdButtons.forEach(({ id, cmd }) => {
    const btn = document.getElementById(id)
    if (btn) {
        btn.addEventListener('click', () => {
            console.log('Button ' + id + ' clicked, sending: ' + cmd)
            sendCommand(cmd)
        })
        console.log('Registered handler for ' + id)
    } else {
        console.error('Button ' + id + ' not found')
    }
})

term.onData(d => {
    console.log('Terminal input:', d)
    window.nestApi.sendInput(d)
})

window.nestApi.onData(d => {
    console.log('Received data from PTY:', d)
    term.write(d)
})

function resizeTerm() {
    const cols = term.cols
    const rows = term.rows
    window.nestApi.resize(cols, rows)
}

window.addEventListener('resize', () => { term.fit && term.fit(); resizeTerm() })

const btnRefreshServices = document.getElementById('btnRefreshServices')

btnRefreshServices.addEventListener('click', () => {
    loadServices()
})

function loadServices() {
    const container = document.getElementById('servicesContainer')
    container.innerHTML = '<div class="loading">Loading services...</div>'

    window.nestApi.listServices().then(result => {
        if (result.error) {
            container.innerHTML = '<div class="empty">Error loading services: ' + result.error + '</div>'
            return
        }

        if (result.services.length === 0) {
            container.innerHTML = '<div class="empty">No services found</div>'
            return
        }

        container.innerHTML = ''
        result.services.forEach(service => {
            createServiceCard(service, container)
        })
    })
}

function createServiceCard(service, container) {
    const card = document.createElement('div')
    card.className = 'service-card'

    const header = document.createElement('div')
    header.className = 'service-header'

    const name = document.createElement('h3')
    name.className = 'service-name'
    name.textContent = service.name

    const status = document.createElement('div')
    status.className = 'service-status unknown'
    status.dataset.serviceName = service.name

    header.appendChild(name)
    header.appendChild(status)

    const desc = document.createElement('p')
    desc.className = 'service-description'
    desc.textContent = service.description

    const actions = document.createElement('div')
    actions.className = 'service-actions'

    const startBtn = document.createElement('button')
    startBtn.className = 'service-btn start'
    startBtn.textContent = 'Start'
    startBtn.onclick = () => handleServiceAction('start', service.name, card)

    const stopBtn = document.createElement('button')
    stopBtn.className = 'service-btn stop'
    stopBtn.textContent = 'Stop'
    stopBtn.onclick = () => handleServiceAction('stop', service.name, card)

    const restartBtn = document.createElement('button')
    restartBtn.className = 'service-btn restart'
    restartBtn.textContent = 'Restart'
    restartBtn.onclick = () => handleServiceAction('restart', service.name, card)

    actions.appendChild(startBtn)
    actions.appendChild(stopBtn)
    actions.appendChild(restartBtn)

    card.appendChild(header)
    card.appendChild(desc)
    card.appendChild(actions)

    container.appendChild(card)

    updateServiceStatus(service.name)
}

function updateServiceStatus(serviceName) {
    window.nestApi.getServiceStatus(serviceName).then(result => {
        const statusDot = document.querySelector('.service-status[data-service-name="' + serviceName + '"]')
        if (statusDot) {
            statusDot.className = 'service-status ' + result.status
        }
    })
}

function handleServiceAction(action, serviceName, card) {
    const buttons = card.querySelectorAll('.service-btn')
    buttons.forEach(btn => btn.disabled = true)
    
    let promise
    if (action === 'start') {
        promise = window.nestApi.startService(serviceName)
    } else if (action === 'stop') {
        promise = window.nestApi.stopService(serviceName)
    } else if (action === 'restart') {
        promise = window.nestApi.restartService(serviceName)
    }
    
    promise.then(result => {
        buttons.forEach(btn => btn.disabled = false)
        if (result.success) {
            setTimeout(() => updateServiceStatus(serviceName), 500)
        } else {
            console.error('Service action failed:', result.error)
        }
    })
}

btnRefresh.addEventListener('click', () => {
    if (!isConnected) {
        showDirectoryMessage('Please connect to SSH first')
        return
    }
    loadDirectory(currentPath)
})

function showDirectoryMessage(msg) {
    const tree = document.getElementById('directoryTree')
    tree.innerHTML = '<div class="loading">' + msg + '</div>'
}

function loadDirectory(path) {
    showDirectoryMessage('Loading')
    window.nestApi.getDirectory(path).then(result => {
        if (result.error) {
            showDirectoryMessage('Error: ' + result.error)
        } else {
            renderDirectory(result.items, path)
            document.getElementById('currentPath').textContent = path
        }
    })
}

function renderDirectory(items, basePath) {
    const tree = document.getElementById('directoryTree')
    if (!items || items.length === 0) {
        tree.innerHTML = '<div class="empty">Empty directory</div>'
        return
    }

    tree.innerHTML = ''
    const list = document.createElement('ul')
    list.className = 'file-list'

    items.forEach(item => {
        const li = document.createElement('li')
        li.className = 'file-item'

        const itemBtn = document.createElement('button')
        itemBtn.className = item.type === 'directory' ? 'file-btn folder' : 'file-btn file'

        if (item.type === 'directory') {
            const arrow = document.createElement('span')
            arrow.className = 'arrow'
            arrow.textContent = '▶'
            itemBtn.appendChild(arrow)
        }

        const icon = document.createElement('span')
        icon.className = 'icon'
        icon.textContent = item.type === 'directory' ? '📁' : '📄'
        itemBtn.appendChild(icon)

        const name = document.createElement('span')
        name.className = 'name'
        name.textContent = item.name
        itemBtn.appendChild(name)

        if (item.type === 'directory') {
            itemBtn.addEventListener('click', () => {
                if (li.classList.contains('expanded')) {
                    li.classList.remove('expanded')
                    const sublist = li.querySelector('ul')
                    if (sublist) {
                        sublist.remove()
                    }
                } else {
                    li.classList.add('expanded')
                    const newPath = basePath.endsWith('/') ? basePath + item.name : basePath + '/' + item.name
                    loadSubDirectory(li, newPath)
                }
            })
        } else {
            itemBtn.addEventListener('click', () => {
                const filePath = basePath.endsWith('/') ? basePath + item.name : basePath + '/' + item.name
                sendCommand('vim ' + filePath)
                document.querySelector('[data-view="terminal"]').click()
            })
        }

        li.appendChild(itemBtn)
        list.appendChild(li)
    })

    tree.appendChild(list)
}

function loadSubDirectory(parentLi, path) {
    const loading = document.createElement('div')
    loading.className = 'loading-sub'
    loading.textContent = 'Loading...'
    parentLi.appendChild(loading)

    window.nestApi.getDirectory(path).then(result => {
        loading.remove()
        if (result.error) {
            const error = document.createElement('div')
            error.className = 'error-sub'
            error.textContent = 'Error: ' + result.error
            parentLi.appendChild(error)
        } else if (result.items && result.items.length > 0) {
            const sublist = document.createElement('ul')
            sublist.className = 'file-list sub'

            result.items.forEach(item => {
                const li = document.createElement('li')
                li.className = 'file-item'

                const itemBtn = document.createElement('button')
                itemBtn.className = item.type === 'directory' ? 'file-btn folder' : 'file-btn file'

                if (item.type === 'directory') {
                    const arrow = document.createElement('span')
                    arrow.className = 'arrow'
                    arrow.textContent = '▶'
                    itemBtn.appendChild(arrow)
                }

                const icon = document.createElement('span')
                icon.className = 'icon'
                icon.textContent = item.type === 'directory' ? '📁' : '📄'
                itemBtn.appendChild(icon)

                const name = document.createElement('span')
                name.className = 'name'
                name.textContent = item.name
                itemBtn.appendChild(name)

                if (item.type === 'directory') {
                    itemBtn.addEventListener('click', () => {
                        if (li.classList.contains('expanded')) {
                            li.classList.remove('expanded')
                            const sublist = li.querySelector('ul')
                            if (sublist) {
                                sublist.remove()
                            }
                        } else {
                            li.classList.add('expanded')
                            const newPath = path.endsWith('/') ? path + item.name : path + '/' + item.name
                            loadSubDirectory(li, newPath)
                        }
                    })
                } else {
                    itemBtn.addEventListener('click', () => {
                        const filePath = path.endsWith('/') ? path + item.name : path + '/' + item.name
                        sendCommand('vim ' + filePath)
                        document.querySelector('[data-view="terminal"]').click()
                    })
                }

                li.appendChild(itemBtn)
                sublist.appendChild(li)
            })

            parentLi.appendChild(sublist)
        }
    })
}