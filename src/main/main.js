const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// node-pty 是 native addon，需要延迟加载以避免干扰 Electron 初始化
let pty = null;
function getPty() {
  if (!pty) pty = require('node-pty');
  return pty;
}

// Session store
const sessions = new Map();
let mainWindow = null;

// 只允许安全的命令字符：字母、数字、-、.、/、\、_
const SAFE_CMD_RE = /^[a-zA-Z0-9\-./\\_ ]+$/;
// 危险的 shell 元字符
const SHELL_META_RE = /[&|;`$><!]/;

function sanitizeCommand(command) {
  if (!command) return '';
  if (!SAFE_CMD_RE.test(command)) {
    throw new Error(`不安全的命令: ${command}`);
  }
  return command;
}

function sanitizeArg(arg) {
  if (SHELL_META_RE.test(arg)) {
    throw new Error(`不安全的参数: ${arg}`);
  }
  return arg;
}

function createWindow() {
  mainWindow = new BrowserWindow({
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

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// Spawn a new agent session via node-pty
ipcMain.handle('session:create', async (event, { command, args = [], cwd, label }) => {
  const safeCommand = sanitizeCommand(command);
  const safeArgs = (args || []).map(sanitizeArg);

  const id = uuidv4();
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'cmd.exe' : (process.env.SHELL || '/bin/bash');

  const ptyProcess = getPty().spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: cwd || os.homedir(),
    env: { ...process.env },
  });

  const session = { id, label: label || command, command: safeCommand, args: safeArgs, cwd, ptyProcess };
  sessions.set(id, session);

  ptyProcess.onData((data) => {
    sendToRenderer('session:data', { id, data });
  });

  ptyProcess.onExit(({ exitCode }) => {
    sendToRenderer('session:exit', { id, exitCode });
    sessions.delete(id);
  });

  // cd to cwd first, then run the command
  if (safeCommand) {
    const cwdCmd = cwd ? `cd /d "${cwd}" && ` : '';
    setTimeout(() => {
      ptyProcess.write(`${cwdCmd}${safeCommand} ${safeArgs.join(' ')}\r\n`);
    }, 300);
  } else if (cwd) {
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
