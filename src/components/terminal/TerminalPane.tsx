/**
 * 文件名：TerminalPane.tsx
 * 描述：xterm.js 终端面板组件，封装终端实例的生命周期
 * 作者：LR
 * 创建日期：2026-05-21
 */

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { sessionsApi } from "../../lib/api";
import type { AgentStatus, SessionInfo } from "../../types";
import { SendToMenu } from "./SendToMenu";
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
  sessions: Map<string, { info: SessionInfo; status: AgentStatus; exited: boolean }>;
  onTerminalReady: (id: string, terminal: Terminal) => void;
  onInput: (data: string) => void;
  onSendToSession: (targetId: string, text: string) => void;
}

/**
 * 终端面板组件
 * 管理 xterm.js 实例创建、FitAddon、主题、输入输出和右键菜单
 */
export function TerminalPane({
  id,
  active,
  theme,
  sessions,
  onTerminalReady,
  onInput,
  onSendToSession,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const registeredRef = useRef(false);

  // 右键菜单状态
  const [menuState, setMenuState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  }>({ visible: false, x: 0, y: 0, text: "" });

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

  /** 右键菜单处理 */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const term = terminalRef.current;
      if (!term || !term.hasSelection()) return;

      setMenuState({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        text: term.getSelection(),
      });
    },
    [],
  );

  /** 发送文字到目标会话 */
  const handleSend = useCallback(
    (targetId: string, text: string) => {
      sessionsApi.write(targetId, text);
    },
    [],
  );

  /** 复制到剪贴板 */
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${active ? "block" : "hidden"}`}
      onMouseDown={() => {
        terminalRef.current?.focus();
        const ta = containerRef.current?.querySelector(
          ".xterm-helper-textarea",
        ) as HTMLTextAreaElement | null;
        if (ta) ta.focus();
      }}
      onContextMenu={handleContextMenu}
    >
      {menuState.visible && (
        <SendToMenu
          x={menuState.x}
          y={menuState.y}
          text={menuState.text}
          sourceId={id}
          sessions={sessions}
          onSend={handleSend}
          onCopy={handleCopy}
          onClose={() => setMenuState((s) => ({ ...s, visible: false }))}
        />
      )}
    </div>
  );
}
