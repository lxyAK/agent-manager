# Agent Manager

多代理终端管理器——在并排的终端会话中同时运行 Claude Code、OpenAI Codex、OpenCode 等 AI 编码代理。

## 功能

- **快速启动**——侧边栏一键启动预设代理或自定义命令
- **多会话管理**——标签页切换、独立 PTY 进程、实时终端输出
- **目录选择**——启动时可选择工作目录
- **Tokyo Night 暗色主题**——护眼的终端配色方案

## 预设代理

| 代理 | 命令 |
|---|---|
| Claude Code | `npx -y @anthropic-ai/claude-code` |
| OpenAI Codex | `npx -y @openai/codex` |
| OpenCode | `npx -y opencode-ai` |
| 自定义命令 | 用户自定义 |

## 安装

需要 Node.js 和 npm。

```bash
git clone https://github.com/lxyAK/agent-manager.git
cd agent-manager
npm install
```

## 使用

```bash
npm start
```

点击侧边栏中的代理图标即可启动新会话。每个会话在独立的终端标签页中运行。

## 打包

```bash
npm run build      # 生成 Windows NSIS 安装程序
npm run build:dir  # 生成未压缩目录（快速测试）
```

## 技术栈

- [Electron](https://www.electronjs.org/) v42
- [node-pty](https://github.com/microsoft/node-pty) — 原生伪终端
- [@xterm/xterm](https://xtermjs.org/) v6 — 浏览器端终端模拟器

## 许可证

MIT
