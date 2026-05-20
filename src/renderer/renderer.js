const { Terminal, FitAddon, WebLinksAddon } = window.xterm;

// ============ Agent presets (platform-aware) ============
const IS_WIN = window.api.platform === 'win32';
const DEFAULT_AGENTS = [
  { id: 'claude',   name: 'Claude Code',   icon: '🟠', command: 'claude',    args: [],        desc: 'claude' },
  { id: 'codex',    name: 'OpenAI Codex',   icon: '🟢', command: 'codex',     args: [],        desc: 'codex' },
  { id: 'opencode', name: 'OpenCode',       icon: '🔵', command: 'opencode',  args: [],        desc: 'opencode' },
  { id: 'hermes',   name: 'Hermes Agent',  icon: '🟣',
    command: IS_WIN ? 'wsl' : 'hermes',
    args: IS_WIN ? ['hermes', 'chat'] : ['chat'],
    desc: IS_WIN ? 'wsl hermes chat' : 'hermes chat' },
  { id: 'custom',   name: '自定义命令…',    icon: '⚙️', command: '',          args: [],        desc: '' },
];

// Load saved agents or use defaults
function loadAgents() {
  try {
    const saved = localStorage.getItem('agent-manager:agents');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return DEFAULT_AGENTS;
}

function saveAgents(agents) {
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

// ============ Create Session ============
async function createSession(agent) {
  // Pick working directory first
  let cwd = null;
  const pickDir = confirm('是否选择工作目录？\n点击"确定"选择目录，点击"取消"使用默认目录（用户主目录）');
  if (pickDir) {
    cwd = await pickCwd();
    if (cwd === null) return; // user cancelled the dialog
  }

  state.sessionCounter++;
  const cwdLabel = cwd ? cwd.replace(/.*[\\/]/, '') : '~';
  const label = `${agent.name} #${state.sessionCounter}`;

  const result = await window.api.createSession({
    command: agent.command,
    args: agent.args,
    cwd: cwd,
    label,
  });

  if (!result) return;

  const id = result.id;

  // Create terminal
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    theme: {
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
  window.api.onData(dataListener);

  // Listen for exit
  const exitListener = ({ id: sid, exitCode }) => {
    if (sid === id) {
      terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
      updateSessionDot(id, true);
    }
  };
  window.api.onExit(exitListener);

  // Store state
  state.sessions.set(id, { id, label, icon: agent.icon, terminal, fitAddon, pane, cwd });

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

  // Fit terminal
  const session = state.sessions.get(id);
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
}

// ============ Start ============
init();
