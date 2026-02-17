const { app, BrowserWindow, shell, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

// Memory optimization flags
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('enable-features', 'V8VmFuture');

let mainWindow;
let screenPickerCallback = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            spellcheck: false,
            v8CacheOptions: 'code',
        },
        title: "So Mua VoiceChat",
        icon: path.join(__dirname, 'Icon.png'),
        backgroundColor: '#1a1a2e',
        show: false,
    });

    // Show when ready to avoid white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Load the remote URL
    mainWindow.loadURL('https://voicechatweb.onrender.com');

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Handle Screen Share Permissions
    mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
            screenPickerCallback = callback;
            mainWindow.webContents.send('get-screen-sources', sources);
        }).catch((e) => {
            console.error(e);
            callback({ video: sources[0], audio: 'loopback' }); // Fallback
        });
    });

    ipcMain.on('select-screen-source', (event, sourceId) => {
        if (screenPickerCallback) {
            screenPickerCallback({ video: { id: sourceId }, audio: 'loopback' });
            screenPickerCallback = null;
        }
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
