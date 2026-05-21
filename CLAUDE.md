# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Agent Manager 是一个 Tauri v2 桌面应用，用于在并排终端会话中运行多个 AI 编码代理（Claude Code、OpenAI Codex、OpenCode）。UI 为中文。参考 cc-switch 项目的架构模式。

## 常用命令

```bash
pnpm tauri dev      # 启动开发模式（Vite HMR + Rust 后端）
pnpm vite build     # 仅构建前端
pnpm tauri build    # 打包 Windows 安装程序
```

注意：Cargo 需要在 PATH 中（`~/.cargo/bin`）。如果 `pnpm tauri dev` 报 cargo 找不到，先执行：
```powershell
$env:PATH = "$env:PATH;$env:USERPROFILE\.cargo\bin"
```

无测试套件、无 lint。

## 技术栈

- **后端**：Tauri v2 + Rust（portable-pty 0.9 PTY 管理、tokio、uuid、anyhow）
- **前端**：React 18 + TypeScript + Vite 7
- **终端**：@xterm/xterm v6 + addon-fit + addon-web-links
- **样式**：Tailwind CSS 3 + Tokyo Night 配色（CSS 变量 `tn-*`）
- **插件**：tauri-plugin-dialog（目录选择）、tauri-plugin-store（设置持久化）

## 架构

### 分层结构

```
前端 React (src/)
  ├── components/          # UI 组件
  │   ├── layout/          # Sidebar, TabsBar
  │   ├── terminal/        # TerminalPane（xterm.js 包装）
  │   ├── agents/          # EditAgentDialog
  │   └── sessions/        # CwdPickerDialog, RenameSessionDialog
  ├── hooks/               # 自定义 Hooks
  │   ├── useSessionManager.ts  # 会话 CRUD + 全局事件监听 + 数据缓冲
  │   ├── useAgentPresets.ts    # 代理预设 localStorage 管理
  │   ├── useTheme.ts           # 暗/亮主题切换
  │   └── useIdleDetection.ts   # 空闲检测 FSM（未使用，逻辑内联在 App.tsx）
  ├── lib/api/             # Tauri invoke() + listen() 封装
  │   ├── sessions.ts      # session_create/write/resize/kill/list + 事件监听
  │   └── dialog.ts        # dialog_open_dir
  ├── types/               # TypeScript 类型定义
  └── App.tsx              # 主布局 + 空闲检测逻辑

Rust 后端 (src-tauri/src/)
  ├── main.rs              # 入口
  ├── lib.rs               # Tauri Builder、命令注册、插件初始化
  └── pty_manager.rs       # PTY 生命周期管理（portable-pty）
```

### 数据流

```
前端 xterm.js
  │ terminal.onData → sessionsApi.write(id, data) → invoke("session_write")
  │                                                      → Rust: pty_manager.write()
  │
  └─ 全局 listen("session:data") ← Rust emit("session:data", {id, data})
       → terminal.write(data)（终端就绪后）或缓冲（终端未就绪时）
```

### 关键实现细节

- **全局事件监听 + 数据缓冲**：应用启动时注册全局 `session:data`/`session:exit` 监听器。PTY 数据在终端就绪前暂存到缓冲区，终端创建后刷新
- **PTY 进程保持**：`_child` 和 `writer` 存储在 Session 结构体中，避免 drop 杀死进程或 writer 失效
- **Shell 检测**：Windows 上优先 pwsh.exe，回退 powershell.exe；Unix 使用 $SHELL
- **空闲检测**：三态 FSM（idle/active/waiting），6 秒静默触发检测，15 秒确认空闲
- **代理预设**：localStorage 持久化，带版本号，版本不匹配时恢复默认值
- **Windows IME 修复**：点击终端面板时显式聚焦 xterm textarea
- **Tailwind 自定义颜色**：`tn-bg`、`tn-fg`、`tn-blue` 等 Tokyo Night 配色定义在 `tailwind.config.js`

### 文件说明

| 文件 | 职责 |
|---|---|
| `src-tauri/src/pty_manager.rs` | Rust PTY 管理：spawn/write/resize/kill、shell 检测、后台读取线程 |
| `src-tauri/src/lib.rs` | Tauri 命令注册、AppState 管理、插件初始化 |
| `src/App.tsx` | React 主布局 + 会话创建流程 + 空闲检测逻辑 |
| `src/hooks/useSessionManager.ts` | 会话状态管理、全局事件监听、数据缓冲 |
| `src/components/terminal/TerminalPane.tsx` | xterm.js 终端实例生命周期管理 |
| `src/components/layout/Sidebar.tsx` | 侧边栏：代理快速启动 + 会话列表 + 主题切换 |
| `src/components/layout/TabsBar.tsx` | 标签栏：会话切换/关闭/重命名 |
| `src/lib/api/sessions.ts` | Tauri invoke/listen 封装层 |
| `src/styles.css` | Tailwind 入口 + xterm.css + 自定义动画 |

### 旧代码（待清理）

以下为 Electron 时代的文件，已不再使用：
- `src/main/main.js` — 旧 Electron 主进程
- `src/main/preload.js` — 旧预加载脚本
- `src/renderer/` — 旧渲染进程（纯 JS，无框架）
