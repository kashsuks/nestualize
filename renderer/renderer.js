const { Terminal } = window;
const term = new Terminal({ cols: 80, rows: 24 })
const wrap = document.getElementById('termWrap')
const userIn = document.getElementById('user')
const btnSave = document.getElementById('btnSave')
const btnStart = document.getElementById('btnStart')

term.open(wrap)
term.focus

window.nestApi.loadConfig().then(c => { if (c && c.username) userIn.value = c.username })

btnSave.addEventListener('click', () => {
    const u = userIn.value.trim()
    window.nestApi.saveConfig({ username: u })
})

btnStart.addEventListener('click', async () => {
    const u = userIn.value.trim()
    if (!u) return
    await window.nestApi.startSession(u)
})

term.onData(d => window.nestApi.sendInput(d))
window.nestApi.onData(d => term.write(d))

function resizeTerm() {
    const cols = term.cols
    const rows = term.rows
    window.nestApi.resize(cols, rows)
}

window.addEventListener('resize', () => { term.fit && term.fit(); resizeTerm() })