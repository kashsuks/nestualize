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
term.focus

console.log('terminal init complete')

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