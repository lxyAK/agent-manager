# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Agent Manager 是一个 Electron 桌面应用，用于在并排终端会话中运行多个 AI 编码代理（Claude Code、OpenAI Codex、OpenCode）。UI 为中文。

## 常用命令

```bash
npm start          # 启动 Electron 应用（开发模式）
npm run build      # 打包 Windows NSIS 安装程序
npm run build:dir  # 打包为未压缩目录（更快，用于测试打包）
```

无测试套件、无 lint、无 TypeScript 编译步骤。

## 技术栈

- Electron v42 + node-pty（原生 PTY 进程管理）
- @xterm/xterm v6（终端渲染，含 addon-fit 和 addon-web-links）
- 纯 JavaScript，无框架/无打包器/无转译，直接使用 `require()`
- electron-builder 打包为 Windows NSIS 安装程序

## 架构

### 进程模型

```
主进程 (src/main/main.js)
  ├── 创建 BrowserWindow（contextIsolation: false, nodeIntegration: true）
  ├── 管理 PTY 会话（Map<uuid, session>）
  ├── IPC handlers: session:create/write/resize/kill/list, dialog:openDir
  └── 懒加载 node-pty 避免阻塞 Electron 初始化

预加载脚本 (src/main/preload.js)
  └── 暴露 window.api 对象，封装 ipcRenderer.invoke()

渲染进程 (src/renderer/)
  ├── index.html — 布局（侧边栏 + 标签页 + 终端容器）
  ├── renderer.js — 代理预设、会话管理、xterm 集成
  └── styles/main.css — Tokyo Night 暗色主题
```

### IPC 数据流

```
Renderer → window.api.createSession()
  → ipcRenderer.invoke('session:create')
    → Main: node-pty spawn
      → ptyProcess.onData() → mainWindow.send('session:data')
        → ipcRenderer.on('session:data') → terminal.write(data)
```

### 关键实现细节

- **Shell 检测**：Windows 上优先使用 pwsh.exe（PowerShell 7+），回退到 powershell.exe；Unix 使用 bash + exec $SHELL
- **命令净化**：SAFE_CMD_RE 白名单 + SHELL_META_RE 危险字符检测，防止 shell 注入
- **代理预设**：定义为对象数组，持久化到 localStorage 并带版本号，版本不匹配时恢复默认值
- **监听器清理**：每个会话保存 dataWrapper/exitWrapper 引用，kill 时显式移除防止内存泄漏
- **Windows IME 修复**：点击面板时显式聚焦 textarea、延迟 blur/focus 循环、窗口 focus 事件处理
- **node-pty 懒加载**：在 `app.whenReady()` 回调中才 require('node-pty')，避免干扰 Electron 初始化

### 文件说明

| 文件 | 职责 |
|---|---|
| `src/main/main.js` | Electron 主进程：窗口创建、PTY 管理、IPC 处理、命令净化 |
| `src/main/preload.js` | 预加载脚本：暴露 window.api 给渲染进程 |
| `src/renderer/renderer.js` | 渲染逻辑：代理预设、会话生命周期、xterm 实例管理 |
| `src/renderer/index.html` | HTML 布局：侧边栏 + 标签栏 + 终端容器 |
| `src/renderer/styles/main.css` | 应用样式，CSS 变量驱动的暗色主题 |
