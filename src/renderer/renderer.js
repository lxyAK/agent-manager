const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { WebLinksAddon } = require('@xterm/addon-web-links');

// ============ Theme ============
const TERMINAL_THEMES = {
  dark: {
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    selectionBackground: '#33467c',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
  },
  light: {
    background: '#e1e2e7',
    foreground: '#3760bf',
    cursor: '#3760bf',
    selectionBackground: '#99a7df',
    black: '#d5d6db',
    red: '#f52a65',
    green: '#587539',
    yellow: '#8c6c3e',
    blue: '#2e7de9',
    magenta: '#9854f1',
    cyan: '#007197',
    white: '#6172b0',
  },
};

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  localStorage.setItem('agent-manager:theme', name);
  const theme = TERMINAL_THEMES[name] || TERMINAL_THEMES.dark;
  for (const session of state.sessions.values()) {
    if (session.terminal) {
      session.terminal.options.theme = theme;
    }
  }
  updateThemeToggleIcon();
}

function updateThemeToggleIcon() {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = getCurrentTheme() === 'dark' ? '☀️' : '🌙';
}

function initTheme() {
  const saved = localStorage.getItem('agent-manager:theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  updateThemeToggleIcon();
  document.getElementById('theme-toggle').addEventListener('click', () => {
    applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
  });
}

// ============ Agent presets (platform-aware) ============
const IS_WIN = window.api.platform === 'win32';
const DEFAULT_AGENTS = [
  { id: 'claude',  name: 'Claude Code',  icon: '🟠', command: 'npx', args: ['-y', '@anthropic-ai/claude-code'], desc: 'claude' },
  { id: 'codex',   name: 'OpenAI Codex', icon: '🟢', command: 'npx', args: ['-y', '@openai/codex'],              desc: 'codex' },
  { id: 'opencode', name: 'OpenCode',    icon: '🔵', command: 'npx', args: ['-y', 'opencode-ai'],               desc: 'opencode' },
  { id: 'custom',  name: '自定义命令…',  icon: '⚙️', command: '',    args: [],                                  desc: '' },
];

// Load saved agents or use defaults
const AGENTS_VERSION = 3;

function loadAgents() {
  try {
    const version = localStorage.getItem('agent-manager:agents-version');
    if (String(AGENTS_VERSION) === version) {
      const saved = localStorage.getItem('agent-manager:agents');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch (e) {}
  return DEFAULT_AGENTS;
}

function saveAgents(agents) {
  localStorage.setItem('agent-manager:agents-version', String(AGENTS_VERSION));
  localStorage.setItem('agent-manager:agents', JSON.stringify(agents));
}

let AGENTS = loadAgents();

// ============ State ============
const state = {
  sessions: new Map(),  // id -> { id, label, icon, terminal, fitAddon, cwd }
  activeId: null,
  sessionCounter: 0,
};

// ============ Init ============
function init() {
  initTheme();
  renderQuickLaunch();
  setupListeners();
}

// ============ Quick Launch ============
function renderQuickLaunch() {
  const container = document.getElementById('quick-launch');
  container.innerHTML = '';

  AGENTS.forEach((agent, idx) => {
    const el = document.createElement('div');
    el.className = 'quick-launch-item';
    el.innerHTML = `
      <span class="agent-icon">${agent.icon}</span>
      <span class="agent-name">${agent.name}</span>
      ${agent.desc ? `<span class="agent-cmd">${agent.desc}</span>` : ''}
      <button class="edit-btn" data-idx="${idx}" title="编辑">✎</button>
    `;
    // Click on the item (not edit button) to launch
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('edit-btn')) return;
      if (agent.id === 'custom') {
        openCustomDialog();
      } else {
        createSession(agent);
      }
    });
    // Edit button
    el.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      editAgent(idx);
    });
    container.appendChild(el);
  });
}

// ============ Edit agent preset ============
function editAgent(idx) {
  const agent = AGENTS[idx];
  const newName = prompt('名称:', agent.name);
  if (newName === null) return;
  const newCmd = prompt('启动命令:', agent.command);
  if (newCmd === null) return;
  const newArgs = prompt('参数（空格分隔，留空为无）:', agent.args.join(' '));

  AGENTS[idx] = {
    ...agent,
    name: newName || agent.name,
    command: newCmd || agent.command,
    args: newArgs ? newArgs.split(/\s+/) : [],
    desc: newCmd ? `${newCmd}${newArgs ? ' ' + newArgs : ''}` : agent.desc,
  };
  saveAgents(AGENTS);
  renderQuickLaunch();
}

// ============ Custom command dialog ============
function openCustomDialog() {
  const label = prompt('输入名称（如 my-agent）：');
  if (!label) return;
  const cmd = prompt('输入启动命令（如 npx my-cli）：');
  if (!cmd) return;

  createSession({ id: 'custom-' + Date.now(), name: label, icon: '⚙️', command: cmd, args: [] });
}

// ============ Working directory picker ============
async function pickCwd(currentCwd) {
  const dir = await window.api.openDir();
  return dir; // null if cancelled
}

// ============ CWD Dialog ============
/**
 * 显示工作目录选择弹窗
 * @returns {'pick'|'default'|'cancel'} 用户选择的结果
 */
function showCwdDialog() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('cwd-dialog-overlay');
    overlay.style.display = 'flex';

    const cleanup = (value) => {
      overlay.style.display = 'none';
      resolve(value);
    };

    document.getElementById('cwd-btn-pick').onclick = () => cleanup('pick');
    document.getElementById('cwd-btn-default').onclick = () => cleanup('default');
    document.getElementById('cwd-btn-cancel').onclick = () => cleanup('cancel');
    overlay.onclick = (e) => { if (e.target === overlay) cleanup('cancel'); };
  });
}

// ============ Create Session ============
async function createSession(agent) {
  let cwd = null;
  const choice = await showCwdDialog();
  if (choice === 'cancel') return;
  if (choice === 'pick') {
    cwd = await pickCwd();
    if (cwd === null) return;
  }

  state.sessionCounter++;
  const cwdLabel = cwd ? cwd.replace(/.*[\\/]/, '') : '~';
  const label = `${agent.name} #${state.sessionCounter}`;

  let result;
  try {
    console.log('[renderer] calling createSession...');
    result = await window.api.createSession({
      command: agent.command,
      args: agent.args,
      cwd: cwd,
      label,
    });
  } catch (e) {
    console.log('[renderer] createSession error:', e);
    alert(`创建会话失败: ${e.message}`);
    return;
  }

  console.log('[renderer] createSession result:', result);
  // alert('IPC返回结果: ' + JSON.stringify(result));
  if (!result) return;

  const id = result.id;

  // Create terminal
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    theme: TERMINAL_THEMES[getCurrentTheme()],
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  // Create terminal pane
  const pane = document.createElement('div');
  pane.className = 'terminal-pane';
  pane.id = `pane-${id}`;
  document.getElementById('terminal-container').appendChild(pane);

  terminal.open(pane);

  // 点击 pane 时直接聚焦 textarea（修复 Windows IME 输入法失效）
  pane.addEventListener('mousedown', () => {
    terminal.focus();
    const ta = pane.querySelector('.xterm-helper-textarea');
    if (ta) ta.focus();
  });

  // 延迟聚焦 textarea，让 IME 系统正确绑定
  setTimeout(() => {
    const ta = pane.querySelector('.xterm-helper-textarea');
    if (ta) {
      ta.blur();
      ta.focus();
    }
  }, 300);

  // Fit after a short delay to ensure layout
  setTimeout(() => {
    try { fitAddon.fit(); } catch(e) {}
    window.api.resizeSession(id, terminal.cols, terminal.rows);
  }, 100);

  // Wire data flow: terminal input -> PTY
  terminal.onData((data) => {
    window.api.writeSession(id, data);
  });

  // Listen for PTY output -> terminal
  const dataListener = ({ id: sid, data }) => {
    if (sid === id) {
      try { terminal.write(data); } catch(e) {}
    }
  };
  const dataWrapper = window.api.onData(dataListener);

  // Listen for exit
  const exitListener = ({ id: sid, exitCode }) => {
    if (sid === id) {
      terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
      updateSessionDot(id, true);
    }
  };
  const exitWrapper = window.api.onExit(exitListener);

  // 存储监听器引用以便后续移除
  const listeners = { dataWrapper, exitWrapper };

  // Store state
  state.sessions.set(id, { id, label, icon: agent.icon, terminal, fitAddon, pane, cwd, listeners });

  // Update UI
  addTab(id, label, agent.icon, cwd);
  addSessionItem(id, label, cwd);
  switchTo(id);

  // Hide empty state
  document.getElementById('empty-state').style.display = 'none';
}

// ============ Tab Management ============
function addTab(id, label, icon, cwd) {
  const bar = document.getElementById('tabs-bar');
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.id = `tab-${id}`;
  tab.title = cwd || label;
  tab.innerHTML = `
    <span class="tab-icon">${icon}</span>
    <span class="tab-label">${label}</span>
    <span class="tab-close">✕</span>
  `;
  tab.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-close')) return;
    switchTo(id);
  });
  tab.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    killSession(id);
  });
  bar.appendChild(tab);
}

function switchTo(id) {
  if (!state.sessions.has(id)) return;

  state.activeId = id;

  // Update tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(`tab-${id}`);
  if (tab) tab.classList.add('active');

  // Update panes
  document.querySelectorAll('.terminal-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById(`pane-${id}`);
  if (pane) pane.classList.add('active');

  // Update session list
  document.querySelectorAll('.session-item').forEach(s => s.classList.remove('active'));
  const item = document.getElementById(`session-${id}`);
  if (item) item.classList.add('active');

  // 聚焦终端及 textarea（延迟确保 visibility 切换生效）
  const session = state.sessions.get(id);
  if (session && session.terminal) {
    setTimeout(() => {
      session.terminal.focus();
      const ta = session.pane.querySelector('.xterm-helper-textarea');
      if (ta) ta.focus();
    }, 30);
  }

  // Fit terminal
  if (session && session.fitAddon) {
    setTimeout(() => {
      try { session.fitAddon.fit(); } catch(e) {}
      window.api.resizeSession(id, session.terminal.cols, session.terminal.rows);
    }, 50);
  }
}

// ============ Session List ============
function addSessionItem(id, label, cwd) {
  const list = document.getElementById('session-list');
  const item = document.createElement('div');
  item.className = 'session-item';
  item.id = `session-${id}`;
  item.title = cwd || label;
  item.innerHTML = `
    <span class="dot"></span>
    <span class="session-label">${label}</span>
    <button class="close-btn">✕</button>
  `;
  item.addEventListener('click', (e) => {
    if (e.target.classList.contains('close-btn')) return;
    switchTo(id);
  });
  item.querySelector('.close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    killSession(id);
  });
  list.appendChild(item);
}

function updateSessionDot(id, dead) {
  const item = document.getElementById(`session-${id}`);
  if (item) {
    const dot = item.querySelector('.dot');
    if (dot) dot.classList.toggle('dead', dead);
  }
}

// ============ Kill Session ============
async function killSession(id) {
  const session = state.sessions.get(id);
  if (!session) return;

  // 移除 IPC 监听器，防止泄漏
  if (session.listeners) {
    window.api.removeDataListener(session.listeners.dataWrapper);
    window.api.removeExitListener(session.listeners.exitWrapper);
  }

  await window.api.killSession(id);

  // Dispose terminal
  try { session.terminal.dispose(); } catch(e) {}
  session.pane.remove();

  // Remove tab
  const tab = document.getElementById(`tab-${id}`);
  if (tab) tab.remove();

  // Remove session item
  const item = document.getElementById(`session-${id}`);
  if (item) item.remove();

  state.sessions.delete(id);

  // Switch to another session or show empty
  if (state.activeId === id) {
    const remaining = Array.from(state.sessions.keys());
    if (remaining.length > 0) {
      switchTo(remaining[remaining.length - 1]);
    } else {
      state.activeId = null;
      document.getElementById('empty-state').style.display = 'flex';
    }
  }
}

// ============ Window resize (single global handler, no per-session leak) ============
function setupListeners() {
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.activeId) {
        const session = state.sessions.get(state.activeId);
        if (session && session.fitAddon) {
          try { session.fitAddon.fit(); } catch(e) {}
          window.api.resizeSession(state.activeId, session.terminal.cols, session.terminal.rows);
        }
      }
    }, 100);
  });

  // 窗口重新获得焦点时，主动聚焦当前终端（修复 IME 输入法失效）
  window.addEventListener('focus', () => {
    if (state.activeId) {
      const session = state.sessions.get(state.activeId);
      if (session && session.terminal) {
        session.terminal.focus();
      }
    }
  });
}

// ============ Start ============
init();
