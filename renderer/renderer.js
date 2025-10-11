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
    const racoon = document.getElementById('tutorial-raccoon')

    tutorialOverlay.classList.add('active')

    racoon.addEventListener('click', () => {
        const bubble = document.getElementById('tutorial-bubble')
        bubble.classList.add('active')
    })
}

function startGuide() {
    console.log('starting guide')
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

//sidebar
const sidebar = document.getElementById('sidebar')
const hamburger = document.getElementById('hamburger')

hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed')
})

//view switching
const navItems = document.querySelectorAll('.nav-item')
const viewContainers = document.querySelectorAll('.view-container')

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const viewName = item.dataset.view

        navItems.forEach(nav => nav.classList.remove('active')) //update active nav item
        item.classList.add('active')

        viewContainers.forEach(view => view.classList.remove('active'))
        document.getElementById(`view-${viewName}`).classList.add('active')
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

//command button
function sendCommand(cmd) {
    console.log('Sending command:', cmd)
    if (!isConnected) {
        console.warn('Not connected yet, sending anway')
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
            console.log(`Button ${id} clicked, sending: ${cmd}`)
            sendCommand(cmd)
        })
        console.log(`Registered handler for ${id}`)
    } else {
        console.error(`Button ${id} not found`)
    }
})

term.onData(d => {
    console.log('Terminal input:', d)
    window.nestApi.sendInput(d)
})

window.nestApi.onData(d => {
    console.log('Recieved data from PTY:', d)
    term.write(d)
})

function resizeTerm() {
    const cols = term.cols
    const rows = term.rows
    window.nestApi.resize(cols, rows)
}

window.addEventListener('resize', () => { term.fit && term.fit(); resizeTerm() })

//explorer
btnRefresh.addEventListener('click', () => {
    if (!isConnected) {
        showDirectoryMessage('Please connect to SSH first')
        return
    }
    loadDirectory(currentPath)
})

function showDirectoryMessage(msg) {
    const tree = document.getElementById('directoryTree')
    tree.innerHTML = `<div class="loading">${msg}</div>`
}

function loadDirectory(path) {
    showDirectoryMessage('Loading')
    window.nestApi.getDirectory(path).then(result => {
        if (result.error) {
            showDirectoryMessage(`Error: ${result.error}`)
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

        const name = document.createElement('span') // hi hackatime team!
        name.className = 'name'
        name.textContent = item.name
        itemBtn.appendChild(name)

        //type directory
        if (item.type === 'directory') {
            itemBtn.addEventListener('click', () => {
                if (li.classList.contains('expanded')) { //apologies for the nested ifs
                    li.classList.remove('expanded')
                    const sublist = li.querySelector('ul')
                    if (sublist) {
                        sublist.remove()
                    }
                } else {
                    li.classList.add('expanded')
                    const newPath = basePath.endsWith('/') ? `${basePath}${item.name}` : `${basePath}/${item.name}`
                    loadSubDirectory(li, newPath)
                }
            })
        } else {
            itemBtn.addEventListener('click', () => {
                const filePath = basePath.endsWith('/') ? `${basePath}${item.name}` : `${basePath}/${item.name}`
                sendCommand(`vim ${filePath}`)
                //switch to terminal for output
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
            error.textContent = `Error: ${result.error}`
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
                            const sublist = li.querySelector('ul') //sublists
                            if (sublist) {
                                sublist.remove() //cuz why the fuck do they exist
                            }
                        } else {
                                li.classList.add('expanded')
                                const newPath = path.endsWith('/') ? `${path}${item.name}` : `${path}/${item.name}`
                                loadSubDirectory(li, newPath)
                            }
                    })
                } else {
                    itemBtn.addEventListener('click', () => {
                        const filePath = path.endsWith('/') ? `${path}${item.name}`: `${path}/${item.name}`
                        sendCommand(`vim ${filePath}`)
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