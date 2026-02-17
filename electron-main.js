const { app, BrowserWindow, shell, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

// Memory optimization flags
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('enable-features', 'V8VmFuture');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let screenPickerCallback = null;
let storedScreenSources = [];

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
            v8CacheOptions: 'code'
        },
        title: "So Mua VoiceChat",
        icon: path.join(__dirname, 'Icon.png'),
        backgroundColor: '#1a1a2e',
        show: false,
        fullscreenable: true, // Explicitly allow fullscreen
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

    // Explicitly allow audio
    mainWindow.webContents.setAudioMuted(false);

    // Permission Handler
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'audioCapture', 'videoCapture', 'notifications'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    // Handle Screen Share Permissions
    mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 400 } }).then((sources) => {
            screenPickerCallback = callback;
            storedScreenSources = sources; // Store actual objects for later retrieval

            // Serialize sources to ensure thumbnails are sent correctly
            const sourcesToSend = sources.map(source => ({
                id: source.id,
                name: source.name,
                thumbnail: source.thumbnail.toDataURL()
            }));
            mainWindow.webContents.send('get-screen-sources', sourcesToSend);
        }).catch((e) => {
            console.error(e);
            callback({ video: sources[0], audio: 'loopback' }); // Fallback
        });
    });

    ipcMain.on('select-screen-source', (event, sourceId) => {
        if (screenPickerCallback) {
            const source = storedScreenSources.find(s => s.id === sourceId);
            if (source) {
                screenPickerCallback({ video: source, audio: 'loopback' });
            } else {
                // Handle cancellation or not found, maybe cancel request?
                // For now, if not found, we might just letting it hang or logs error.
                // It is safer to select the first one or cancellation if possible.
                // screenPickerCallback(null); // This might throw, better to just log
                console.warn('Selected source not found');
            }
            screenPickerCallback = null;
            storedScreenSources = [];
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
