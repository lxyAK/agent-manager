const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Session store
const sessions = new Map();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Agent Manager',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

// Spawn a new agent session via node-pty
ipcMain.handle('session:create', async (event, { command, args = [], cwd, label }) => {
  const pty = require('node-pty');

  const id = uuidv4();
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'cmd.exe' : (process.env.SHELL || '/bin/bash');

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: cwd || os.homedir(),
    env: { ...process.env },
  });

  const session = { id, label: label || command, command, args, cwd, ptyProcess };
  sessions.set(id, session);

  ptyProcess.onData((data) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('session:data', { id, data });
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('session:exit', { id, exitCode });
    }
    sessions.delete(id);
  });

  // cd to cwd first, then run the command
  if (command) {
    const cwdCmd = cwd ? `cd /d "${cwd}" && ` : '';
    setTimeout(() => {
      ptyProcess.write(`${cwdCmd}${command} ${args.join(' ')}\r\n`);
    }, 300);
  } else if (cwd) {
    // Just cd, no command
    const cwdCmd = isWin ? `cd /d "${cwd}"` : `cd "${cwd}"`;
    setTimeout(() => {
      ptyProcess.write(`${cwdCmd}\r\n`);
    }, 300);
  }

  return { id, label: session.label };
});

// Write to a session's PTY
ipcMain.handle('session:write', (event, { id, data }) => {
  const session = sessions.get(id);
  if (session && session.ptyProcess) {
    session.ptyProcess.write(data);
    return true;
  }
  return false;
});

// Resize a session's PTY
ipcMain.handle('session:resize', (event, { id, cols, rows }) => {
  const session = sessions.get(id);
  if (session && session.ptyProcess) {
    try {
      session.ptyProcess.resize(cols, rows);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
});

// Kill a session
ipcMain.handle('session:kill', (event, { id }) => {
  const session = sessions.get(id);
  if (session && session.ptyProcess) {
    session.ptyProcess.kill();
    sessions.delete(id);
    return true;
  }
  return false;
});

// List active sessions
ipcMain.handle('session:list', () => {
  return Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    label: s.label,
    command: s.command,
    cwd: s.cwd,
  }));
});

// Open directory picker
ipcMain.handle('dialog:openDir', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Kill all sessions on quit
  for (const [, session] of sessions) {
    if (session.ptyProcess) session.ptyProcess.kill();
  }
  sessions.clear();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
