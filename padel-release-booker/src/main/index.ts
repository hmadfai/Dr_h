import { app, BrowserWindow, Menu, Tray, nativeImage, powerMonitor, session, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../core/persistence/db.js';
import { SystemClock } from '../core/time/clock.js';
import { AppRuntime } from './appRuntime.js';
import { registerIpcHandlers } from './ipc/handlers.js';
import { ElectronExternalUrlOpener } from './shell/externalUrlOpener.js';
import { ElectronNotifier } from './notifications/electronNotifier.js';
import { ElectronSecretsStore } from './security/electronSecretsStore.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import { isAllowedExternalUrl } from '../core/urlAllowlist.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// --- Single application instance lock (spec section 6) ---------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let runtime: AppRuntime | null = null;
let quitting = false;

function getMetaStore(db: ReturnType<typeof openDatabase>) {
  const getMeta = (key: string): string | null => {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  };
  const setMeta = (key: string, value: string): void => {
    db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  };
  return { getMeta, setMeta };
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Padel Release Booker',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());

  // Spec section 7: closing the window must not quit the app; only an
  // explicit Quit does. The scheduler keeps running in the background.
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Defense in depth: even though the renderer never receives Node/network
  // access directly, block any attempt to navigate the main window itself to
  // a non-allowlisted origin, and route window.open()/target=_blank links
  // through the same allowlist + shell.openExternal rather than letting
  // Electron create a second, less-restricted window.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedExternalUrl(url) && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}

function createTray(): void {
  // A 16x16 transparent fallback icon keeps this cross-platform-safe without
  // bundling a binary asset; packaging can swap in a proper .icns-derived
  // tray icon via electron-builder's `mac.icon` without code changes here.
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Padel Release Booker');
  const menu = Menu.buildFromTemplate([
    { label: 'Show Padel Release Booker', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Emergency Stop',
      click: () => {
        void runtime?.emergencyStop();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow?.show());
}

function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        ]
      }
    });
  });
}

async function bootstrap(): Promise<void> {
  applyContentSecurityPolicy();

  const userDataDir = app.getPath('userData');
  const db = openDatabase({ filePath: join(userDataDir, 'padel-release-booker.sqlite') });
  const clock = new SystemClock();
  const notifier = new ElectronNotifier();
  const secretsStore = new ElectronSecretsStore();

  runtime = new AppRuntime({
    db,
    clock,
    externalUrlOpener: new ElectronExternalUrlOpener(),
    notifier,
    ...getMetaStore(db)
  });

  registerIpcHandlers(runtime, clock, secretsStore);

  mainWindow = createMainWindow();
  createTray();

  runtime.on('heartbeat', (payload) => {
    mainWindow?.webContents.send(IPC_CHANNELS.onHeartbeat, payload);
  });
  runtime.on('notice', (payload) => {
    mainWindow?.webContents.send(IPC_CHANNELS.onNotice, payload);
    void notifier.notify(payload.title, payload.body, { urgent: payload.level === 'error' });
  });

  // Spec section 5/7: re-evaluate schedules immediately on wake rather than
  // waiting for the next heartbeat, and warn clearly that sleep prevention
  // (if the user enables it elsewhere) cannot make a powered-off Mac run
  // anything — there is no code path here that can act while the OS itself
  // is suspended.
  powerMonitor.on('resume', () => runtime?.notifyWoke());
  powerMonitor.on('unlock-screen', () => runtime?.notifyWoke());

  runtime.start();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  // Intentionally a no-op on macOS and in general: the app only exits via
  // the explicit Quit action (tray menu or Cmd+Q), per spec section 7.
});

app.on('before-quit', () => {
  quitting = true;
  runtime?.stop();
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});

if (gotLock) {
  void app.whenReady().then(bootstrap);
}
