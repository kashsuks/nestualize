module.exports.init = (ipcMain) => {
    ipcMain.handle('get-directory', async (e, path) => {
        //this will be used later for sending stuff like 'ls -la' through shh
        //placeholder for now
        return {
            error: 'Directory listing requires active SSH connection.',
            items: []
        }
    })
}