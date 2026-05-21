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
  { id: 'claude',  name: 'Claude Code',  icon: 'claude.svg',  command: 'npx', args: ['-y', '@anthropic-ai/claude-code'], desc: 'claude' },
  { id: 'codex',   name: 'OpenAI Codex', icon: 'openai.svg',  command: 'npx', args: ['-y', '@openai/codex'],              desc: 'codex' },
  { id: 'opencode', name: 'OpenCode',    icon: 'opencode.svg', command: 'npx', args: ['-y', 'opencode-ai'],              desc: 'opencode' },
  { id: 'terminal', name: '新建终端',    icon: 'terminal.svg', command: '',    args: [],                                  desc: '' },
];

// Load saved agents or use defaults
const AGENTS_VERSION = 5;

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

// ============ 图标渲染 ============
function renderIcon(icon, cls = '') {
  if (icon.endsWith('.svg')) {
    return `<img class="agent-svg-icon ${cls}" src="assets/${icon}" alt="" />`;
  }
  return `<span class="agent-emoji-icon ${cls}">${icon}</span>`;
}

// ============ ANSI 剥离 ============
const ANSI_RE = /\x1b\[[0-9;:?<=>]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1bP[^\x1b]*(\x1b\\|$)|\x1b[()][0-9A-Za-z]|[\x0e\x0f]/g;
function stripAnsi(str) {
  return str.replace(ANSI_RE, '');
}

// ============ 空闲检测 ============
const IDLE_SILENCE_MS = 6000;   // 静默 6 秒触发"可能空闲"
const IDLE_CONFIRM_MS = 15000;  // 静默 15 秒直接判定空闲
const IDLE_MIN_ACTIVE_MS = 2000; // 至少活跃 2 秒才开始检测

function startIdleDetection(session) {
  let silenceTimer = null;
  let confirmed = false;
  // 三态：idle = 未开始，active = agent 正在输出，waiting = 等待静默判定
  let phase = 'idle';

  const reset = () => {
    clearTimeout(silenceTimer);
    silenceTimer = null;
    confirmed = false;
    phase = 'idle';
    session.idleState = 'active';
    updateIdleUI(session.id, false);
  };

  // 用户按键时触发，检测到 Enter 表示提交任务
  session._idleOnInput = (data) => {
    if (data.includes('\r') || data.includes('\n')) {
      phase = 'active';
      confirmed = false;
      clearTimeout(silenceTimer);
      updateIdleUI(session.id, false);
    }
  };

  const checkBuffer = () => {
    const terminal = session.terminal;
    if (!terminal) return false;
    const buf = terminal.buffer.active;
    if (buf.type === 'alternate') return false;

    const checkLines = Math.min(8, terminal.rows);
    for (let i = 0; i < checkLines; i++) {
      const line = buf.getLine(buf.length - 1 - i);
      if (!line) continue;
      const text = stripAnsi(line.translateToString(true));
      if (/❯\s*$/.test(text)) return true;
    }
    return false;
  };

  const onSilence = () => {
    const elapsed = Date.now() - session._lastDataTime;
    if (elapsed >= IDLE_CONFIRM_MS || checkBuffer()) {
      confirmed = true;
      phase = 'idle';
      session.idleState = 'idle';
      updateIdleUI(session.id, true);
    } else {
      silenceTimer = setTimeout(onSilence, IDLE_CONFIRM_MS - elapsed);
    }
  };

  session._idleOnData = () => {
    // 用户还没提交过任务，不检测
    if (phase === 'idle') return;
    session._lastDataTime = Date.now();
    // 收到新数据，清除之前的空闲判定
    if (confirmed) {
      confirmed = false;
      session.idleState = 'active';
      updateIdleUI(session.id, false);
    }
    // 每次收到数据重置静默计时器
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(onSilence, IDLE_SILENCE_MS);
  };

  session._idleReset = reset;
  session.idleState = 'active';
}

// ============ State ============
const state = {
  sessions: new Map(),  // id -> { id, label, icon, terminal, fitAddon, cwd }
  activeId: null,
  sessionCounter: 0,
};

// ============ 空闲状态 UI 更新 ============
function updateIdleUI(id, idle) {
  // 标签页 ✓ 标记
  const tab = document.getElementById(`tab-${id}`);
  if (tab) tab.classList.toggle('idle', idle);

  // 侧边栏绿点闪烁
  const item = document.getElementById(`session-${id}`);
  if (item) {
    const dot = item.querySelector('.dot');
    if (dot) dot.classList.toggle('idle-blink', idle);
  }

  // 桌面通知（仅当会话不在前台时）
  if (idle && state.activeId !== id) {
    const session = state.sessions.get(id);
    if (session && window.Notification && Notification.permission !== 'denied') {
      if (Notification.permission === 'default') Notification.requestPermission();
      try {
        new Notification('Agent Manager', {
          body: `${session.label} 任务已完成`,
          silent: false,
        });
      } catch (e) {}
    }
  }
}

// ============ Init ============
function init() {
  initTheme();
  initCollapsible();
  renderQuickLaunch();
  setupListeners();
}

// ============ Collapsible Sections ============
function initCollapsible() {
  document.querySelectorAll('.section-title[data-toggle]').forEach((title) => {
    const targetId = title.getAttribute('data-toggle');
    const target = document.getElementById(targetId);
    if (!target) return;

    if (!title.classList.contains('collapsed')) {
      target.style.maxHeight = target.scrollHeight + 'px';
    }
    title.addEventListener('click', () => {
      const collapsed = title.classList.toggle('collapsed');
      if (collapsed) {
        target.style.maxHeight = '0px';
      } else {
        target.style.maxHeight = target.scrollHeight + 'px';
      }
    });
  });
}

function refreshCollapsible(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const title = el.previousElementSibling;
  if (title && title.classList.contains('collapsed')) return;
  el.style.maxHeight = el.scrollHeight + 'px';
}

// ============ Quick Launch ============
function renderQuickLaunch() {
  const container = document.getElementById('quick-launch');
  container.innerHTML = '';

  AGENTS.forEach((agent, idx) => {
    const el = document.createElement('div');
    el.className = 'quick-launch-item';
    el.innerHTML = `
      <span class="agent-icon">${renderIcon(agent.icon)}</span>
      <span class="agent-name">${agent.name}</span>
      <button class="edit-btn" data-idx="${idx}" title="编辑">✎</button>
    `;
    // Click on the item (not edit button) to launch
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('edit-btn')) return;
      createSession(agent);
    });
    // Edit button
    el.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      editAgent(idx);
    });
    container.appendChild(el);
  });
  refreshCollapsible('quick-launch');
}

// ============ Edit agent preset ============
function editAgent(idx) {
  const agent = AGENTS[idx];
  const overlay = document.getElementById('edit-dialog-overlay');
  const nameInput = document.getElementById('edit-name');
  const cmdInput = document.getElementById('edit-cmd');
  const argsInput = document.getElementById('edit-args');

  nameInput.value = agent.name;
  cmdInput.value = agent.command;
  argsInput.value = agent.args.join(' ');
  overlay.style.display = 'flex';
  nameInput.focus();

  const close = (save) => {
    overlay.style.display = 'none';
    cleanup();
    if (!save) return;

    AGENTS[idx] = {
      ...agent,
      name: nameInput.value || agent.name,
      command: cmdInput.value || agent.command,
      args: argsInput.value ? argsInput.value.split(/\s+/) : [],
      desc: cmdInput.value ? `${cmdInput.value}${argsInput.value ? ' ' + argsInput.value : ''}` : agent.desc,
    };
    saveAgents(AGENTS);
    renderQuickLaunch();
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); close(true); }
    if (e.key === 'Escape') { close(false); }
  };

  const cleanup = () => {
    document.getElementById('edit-btn-save').onclick = null;
    document.getElementById('edit-btn-cancel').onclick = null;
    overlay.onclick = null;
    nameInput.removeEventListener('keydown', handleKey);
    cmdInput.removeEventListener('keydown', handleKey);
    argsInput.removeEventListener('keydown', handleKey);
  };

  document.getElementById('edit-btn-save').onclick = () => close(true);
  document.getElementById('edit-btn-cancel').onclick = () => close(false);
  overlay.onclick = (e) => { if (e.target === overlay) close(false); };
  nameInput.addEventListener('keydown', handleKey);
  cmdInput.addEventListener('keydown', handleKey);
  argsInput.addEventListener('keydown', handleKey);
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
    session._idleOnInput?.(data);
  });

  // Listen for PTY output -> terminal
  const dataListener = ({ id: sid, data }) => {
    if (sid === id) {
      try { terminal.write(data); } catch(e) {}
      session._idleOnData?.();
    }
  };
  const dataWrapper = window.api.onData(dataListener);

  // Listen for exit
  const exitListener = ({ id: sid, exitCode }) => {
    if (sid === id) {
      terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
      updateSessionDot(id, true);
      session._idleReset?.();
    }
  };
  const exitWrapper = window.api.onExit(exitListener);

  // 存储监听器引用以便后续移除
  const listeners = { dataWrapper, exitWrapper };

  // Store state
  const session = { id, label, icon: agent.icon, terminal, fitAddon, pane, cwd, listeners, idleState: 'active' };
  state.sessions.set(id, session);
  startIdleDetection(session);

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
    <span class="tab-icon">${renderIcon(icon)}</span>
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
  tab.addEventListener('dblclick', (e) => {
    if (e.target.classList.contains('tab-close')) return;
    renameSession(id);
  });
  bar.appendChild(tab);
}

// ============ Feature Menu ============
function closeAllMenus() {
  document.querySelectorAll('.feature-menu').forEach(m => m.style.display = 'none');
}

// ============ Rename Session ============
function renameSession(id) {
  const session = state.sessions.get(id);
  if (!session) return;

  const overlay = document.getElementById('rename-dialog-overlay');
  const input = document.getElementById('rename-input');
  input.value = session.label;
  overlay.style.display = 'flex';
  input.focus();
  input.select();

  const close = (save) => {
    overlay.style.display = 'none';
    cleanup();
    if (!save || !input.value.trim()) return;

    const newLabel = input.value.trim();
    session.label = newLabel;

    const tab = document.getElementById(`tab-${id}`);
    if (tab) tab.querySelector('.tab-label').textContent = newLabel;

    const item = document.getElementById(`session-${id}`);
    if (item) item.querySelector('.session-label').textContent = newLabel;
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); close(true); }
    if (e.key === 'Escape') close(false);
  };

  const cleanup = () => {
    document.getElementById('rename-btn-ok').onclick = null;
    document.getElementById('rename-btn-cancel').onclick = null;
    overlay.onclick = null;
    input.removeEventListener('keydown', handleKey);
  };

  document.getElementById('rename-btn-ok').onclick = () => close(true);
  document.getElementById('rename-btn-cancel').onclick = () => close(false);
  overlay.onclick = (e) => { if (e.target === overlay) close(false); };
  input.addEventListener('keydown', handleKey);
}

function switchTo(id) {
  if (!state.sessions.has(id)) return;

  state.activeId = id;

  // 切换到该会话时清除空闲通知
  const switchedSession = state.sessions.get(id);
  if (switchedSession && switchedSession.idleState === 'idle') {
    switchedSession.idleState = 'active';
    updateIdleUI(id, false);
  }

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
    <button class="feature-btn" title="更多操作">⋯</button>
    <button class="close-btn" title="关闭">✕</button>
    <div class="feature-menu" style="display:none;">
      <div class="feature-menu-item" data-action="rename">重命名</div>
    </div>
  `;
  item.addEventListener('click', (e) => {
    if (e.target.classList.contains('close-btn') || e.target.classList.contains('feature-btn') || e.target.classList.contains('feature-menu-item')) return;
    closeAllMenus();
    switchTo(id);
  });
  item.querySelector('.feature-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = item.querySelector('.feature-menu');
    const isOpen = menu.style.display !== 'none';
    closeAllMenus();
    if (!isOpen) menu.style.display = 'block';
  });
  item.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllMenus();
    renameSession(id);
  });
  item.querySelector('.close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllMenus();
    killSession(id);
  });
  list.appendChild(item);
  refreshCollapsible('session-list');
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

  // 清理空闲检测定时器
  session._idleReset?.();

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
  refreshCollapsible('session-list');

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
  // 点击空白处关闭功能菜单
  document.addEventListener('click', closeAllMenus);

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
