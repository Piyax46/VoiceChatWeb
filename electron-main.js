const { app, BrowserWindow, shell, desktopCapturer, ipcMain, Menu } = require('electron');
const path = require('path');

// Performance & rendering flags
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('enable-features', 'V8VmFuture');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Enable hardware acceleration for glassmorphism & backdrop-filter
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// Remove the application menu entirely
Menu.setApplicationMenu(null);

let mainWindow;
let screenPickerCallback = null;
let storedScreenSources = [];

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 900,
        minHeight: 600,
        frame: false, // Remove native title bar for app-like feel
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
        fullscreenable: true,
    });

    // Show when ready to avoid white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Load the remote URL
    mainWindow.loadURL('https://voicechatweb.onrender.com');
    // Load local dev server
    // mainWindow.loadURL('http://localhost:3000');

    // Inject custom title bar after page loads
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.executeJavaScript(`
            (function() {
                if (document.getElementById('electron-titlebar')) return;
                
                // Create title bar
                const titlebar = document.createElement('div');
                titlebar.id = 'electron-titlebar';
                titlebar.innerHTML = \`
                    <div class="titlebar-drag">
                        <div class="titlebar-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                                <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                            </svg>
                        </div>
                        <span class="titlebar-title">So Mua VoiceChat</span>
                    </div>
                    <div class="titlebar-controls">
                        <button class="titlebar-btn" id="tb-minimize" title="Minimize">
                            <svg width="10" height="10" viewBox="0 0 10 10"><rect y="4" width="10" height="1.5" fill="currentColor"/></svg>
                        </button>
                        <button class="titlebar-btn" id="tb-maximize" title="Maximize">
                            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
                        </button>
                        <button class="titlebar-btn titlebar-close" id="tb-close" title="Close">
                            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.5"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.5"/></svg>
                        </button>
                    </div>
                \`;
                document.body.prepend(titlebar);

                // Create styles
                const style = document.createElement('style');
                style.textContent = \`
                    #electron-titlebar {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 32px;
                        background: linear-gradient(90deg, #0f1923 0%, #16213e 100%);
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        z-index: 100000;
                        user-select: none;
                        -webkit-app-region: drag;
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                    }
                    .titlebar-drag {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding-left: 12px;
                        flex: 1;
                    }
                    .titlebar-icon {
                        color: #5865F2;
                        display: flex;
                        align-items: center;
                    }
                    .titlebar-title {
                        font-family: 'Inter', -apple-system, sans-serif;
                        font-size: 12px;
                        font-weight: 600;
                        color: #a0a0c0;
                        letter-spacing: 0.3px;
                    }
                    .titlebar-controls {
                        display: flex;
                        -webkit-app-region: no-drag;
                        height: 100%;
                    }
                    .titlebar-btn {
                        width: 46px;
                        height: 32px;
                        border: none;
                        background: transparent;
                        color: #a0a0c0;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: background 0.15s, color 0.15s;
                    }
                    .titlebar-btn:hover {
                        background: rgba(255,255,255,0.08);
                        color: #e0e0ef;
                    }
                    .titlebar-close:hover {
                        background: #ED4245 !important;
                        color: white !important;
                    }
                    /* Shift app content down */
                    body {
                        padding-top: 32px !important;
                    }
                    .app, .auth-screen {
                        height: calc(100vh - 32px) !important;
                    }
                \`;
                document.head.appendChild(style);

                // Wire up buttons
                document.getElementById('tb-minimize').addEventListener('click', () => {
                    window.electronAPI.minimizeWindow();
                });
                document.getElementById('tb-maximize').addEventListener('click', () => {
                    window.electronAPI.maximizeWindow();
                });
                document.getElementById('tb-close').addEventListener('click', () => {
                    window.electronAPI.closeWindow();
                });
            })();
        `);
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Explicitly allow audio
    mainWindow.webContents.setAudioMuted(false);

    // Permission Handler - include fullscreen
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'audioCapture', 'videoCapture', 'notifications', 'fullscreen'];
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
            storedScreenSources = sources;

            const sourcesToSend = sources.map(source => ({
                id: source.id,
                name: source.name,
                thumbnail: source.thumbnail.toDataURL()
            }));
            mainWindow.webContents.send('get-screen-sources', sourcesToSend);
        }).catch((e) => {
            console.error('[ScreenShare] Error getting sources:', e);
            callback({});
        });
    });

    ipcMain.on('select-screen-source', (event, sourceId) => {
        if (screenPickerCallback) {
            const source = storedScreenSources.find(s => s.id === sourceId);
            if (source) {
                screenPickerCallback({ video: source, audio: 'loopback' });
            } else {
                console.warn('Selected source not found');
            }
            screenPickerCallback = null;
            storedScreenSources = [];
        }
    });

    // Window control IPC handlers
    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });
    ipcMain.on('window-maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    });
    ipcMain.on('window-close', () => {
        if (mainWindow) mainWindow.close();
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
