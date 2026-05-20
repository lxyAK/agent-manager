const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// 检测 Windows 上可用的 PowerShell，优先 pwsh (7+) 再回退 powershell (5.1)
let _winShell = null;
function getWinShell() {
  if (_winShell !== null) return _winShell;
  try {
    execSync('where pwsh.exe', { stdio: 'ignore' });
    _winShell = 'pwsh.exe';
  } catch {
    _winShell = 'powershell.exe';
  }
  return _winShell;
}

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
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Windows 上 Electron 窗口加载后 webContents 可能未获得焦点，导致 IME 失效
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.focus();
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// Spawn a new agent session via node-pty
ipcMain.handle('session:create', async (event, { command, args = [], cwd, label }) => {
  console.log('[session:create] called, command:', command, 'cwd:', cwd);
  const safeCommand = sanitizeCommand(command);
  const safeArgs = (args || []).map(sanitizeArg);

  const id = uuidv4();
  const isWin = process.platform === 'win32';
  const shell = isWin ? getWinShell() : (process.env.SHELL || '/bin/bash');
  const spawnCwd = cwd || os.homedir();

  // 构造启动参数：有命令则通过 shell -Command 直接执行，无命令则打开交互式 shell
  let spawnArgs;
  if (safeCommand) {
    const fullCmd = `${safeCommand} ${safeArgs.join(' ')}`;
    if (isWin) {
      // PowerShell: -NoLogo 去掉横幅, -NoExit 命令结束后保留 shell
      const cd = cwd ? `Set-Location '${cwd.replace(/'/g, "''")}'; ` : '';
      spawnArgs = ['-NoLogo', '-NoExit', '-Command', `${cd}${fullCmd}`];
    } else {
      spawnArgs = ['-c', `cd "${spawnCwd}" && ${fullCmd}; exec $SHELL`];
    }
  } else {
    spawnArgs = [];
  }

  const ptyProcess = getPty().spawn(shell, spawnArgs, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: spawnCwd,
    env: { ...process.env },
  });
  console.log('[session:create] pty spawned, pid:', ptyProcess.pid);

  const session = { id, label: label || command, command: safeCommand, args: safeArgs, cwd, ptyProcess };
  sessions.set(id, session);

  ptyProcess.onData((data) => {
    sendToRenderer('session:data', { id, data });
  });

  ptyProcess.onExit(({ exitCode }) => {
    sendToRenderer('session:exit', { id, exitCode });
    sessions.delete(id);
  });

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
