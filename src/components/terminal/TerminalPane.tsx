/**
 * 文件名：TerminalPane.tsx
 * 描述：xterm.js 终端面板组件，封装终端实例的生命周期
 * 作者：LR
 * 创建日期：2026-05-21
 */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { sessionsApi } from "../../lib/api";
import type { Theme } from "../../hooks/useTheme";

/** xterm.js Tokyo Night 主题配色 */
const TERMINAL_THEMES: Record<Theme, Record<string, string>> = {
  dark: {
    background: "#1a1b26",
    foreground: "#c0caf5",
    cursor: "#c0caf5",
    selectionBackground: "#33467c",
    black: "#15161e",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#a9b1d6",
  },
  light: {
    background: "#e1e2e7",
    foreground: "#3760bf",
    cursor: "#3760bf",
    selectionBackground: "#99a7df",
    black: "#d5d6db",
    red: "#f52a65",
    green: "#587539",
    yellow: "#8c6c3e",
    blue: "#2e7de9",
    magenta: "#9854f1",
    cyan: "#007197",
    white: "#6172b0",
  },
};

interface TerminalPaneProps {
  id: string;
  active: boolean;
  theme: Theme;
  onTerminalReady: (id: string, terminal: Terminal) => void;
  onInput: (data: string) => void;
}

/**
 * 终端面板组件
 * 管理 xterm.js 实例创建、FitAddon、主题和输入输出
 */
export function TerminalPane({
  id,
  active,
  theme,
  onTerminalReady,
  onInput,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const registeredRef = useRef(false);

  // 初始化终端实例（只执行一次）
  useEffect(() => {
    if (!containerRef.current || registeredRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: TERMINAL_THEMES[theme] as any,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 终端输入 → PTY
    terminal.onData((data) => {
      sessionsApi.write(id, data);
      onInput(data);
    });

    onTerminalReady(id, terminal);
    registeredRef.current = true;

    // 延迟 fit 确保 DOM 布局完成
    setTimeout(() => {
      try {
        fitAddon.fit();
        sessionsApi.resize(id, terminal.cols, terminal.rows);
      } catch {
        // 忽略
      }
    }, 100);

    return () => {
      try {
        terminal.dispose();
      } catch {
        // 忽略
      }
      terminalRef.current = null;
      fitAddonRef.current = null;
      registeredRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 活跃状态变化时重新 fit 和聚焦
  useEffect(() => {
    if (!active || !terminalRef.current || !fitAddonRef.current) return;

    setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        const term = terminalRef.current;
        if (term) {
          sessionsApi.resize(id, term.cols, term.rows);
          term.focus();
        }
      } catch {
        // 忽略
      }
    }, 50);
  }, [active, id]);

  // 主题变化时更新终端颜色
  useEffect(() => {
    const term = terminalRef.current;
    if (term) {
      term.options.theme = TERMINAL_THEMES[theme] as any;
    }
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${active ? "block" : "hidden"}`}
      onMouseDown={() => {
        // 修复 Windows IME：点击时聚焦 textarea
        terminalRef.current?.focus();
        const ta = containerRef.current?.querySelector(
          ".xterm-helper-textarea",
        ) as HTMLTextAreaElement | null;
        if (ta) ta.focus();
      }}
    />
  );
}
