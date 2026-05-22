/**
 * 文件名：App.tsx
 * 描述：应用主入口组件，整合侧边栏、标签栏、终端容器和所有弹窗
 * 作者：LR
 * 创建日期：2026-05-21
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { Terminal } from "@xterm/xterm";
import { sendNotification } from "@tauri-apps/plugin-notification";
import type { AgentPreset, AgentStatus } from "./types";
import { useTheme } from "./hooks/useTheme";
import { useAgentPresets } from "./hooks/useAgentPresets";
import { useSessionManager } from "./hooks/useSessionManager";
import { useAgentStatus } from "./hooks/useAgentStatus";
import { dialogApi, sessionsApi } from "./lib/api";
import { STATUS_CONFIG } from "./lib/agentStatus";
import { Sidebar } from "./components/layout/Sidebar";
import { TabsBar } from "./components/layout/TabsBar";
import { TerminalPane } from "./components/terminal/TerminalPane";
import { CwdPickerDialog } from "./components/sessions/CwdPickerDialog";
import { EditAgentDialog } from "./components/agents/EditAgentDialog";
import { RenameSessionDialog } from "./components/sessions/RenameSessionDialog";

/** 弹窗状态 */
type DialogState =
  | { type: "none" }
  | { type: "cwd"; agent: AgentPreset }
  | { type: "editAgent"; index: number }
  | { type: "rename"; id: string; currentName: string };

function App() {
  const { theme, toggle } = useTheme();
  const { agents, updateAgent } = useAgentPresets();
  const {
    sessions,
    activeId,
    sessionCounter,
    createSession,
    registerTerminal,
    setOnData,
    setOnExit,
    switchTo,
    killSession,
    setStatus,
    getTerminal,
    setExited,
    renameSession,
  } = useSessionManager();

  const prevStatusRef = useRef<Map<string, AgentStatus>>(new Map());
  const activeSinceRef = useRef<Map<string, number>>(new Map());

  const { feedData, feedInput, resetSession } = useAgentStatus(
    useCallback((id: string, status: AgentStatus) => {
      const prev = prevStatusRef.current.get(id);
      prevStatusRef.current.set(id, status);
      setStatus(id, status);

      const label = sessions.get(id)?.info.label ?? "Agent";

      // 记录进入活跃状态的时间
      if (status !== "idle" && (!prev || prev === "idle")) {
        activeSinceRef.current.set(id, Date.now());
      }

      // waiting_input / error 时发送系统通知
      if (status === "waiting_input" || status === "error") {
        const config = STATUS_CONFIG[status];
        sendNotification({ title: `${label} — ${config.label}`, body: "点击查看详情" });
        return;
      }

      // 活跃超过 5 秒后回到 idle → 任务完成通知 + 任务栏闪烁
      if (status === "idle" && prev && prev !== "idle") {
        const since = activeSinceRef.current.get(id) ?? 0;
        if (Date.now() - since > 5000) {
          sendNotification({ title: `${label} — 任务完成`, body: "Agent 已回到空闲状态" });
          sessionsApi.requestAttention();
        }
      }
    }, [sessions, setStatus]),
  );

  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const pendingAgentRef = useRef<AgentPreset | null>(null);

  /** 启动代理 → 弹出 CWD 选择 */
  const handleLaunch = useCallback((agent: AgentPreset) => {
    pendingAgentRef.current = agent;
    setDialog({ type: "cwd", agent });
  }, []);

  /** CWD 选择：指定目录 */
  const handleCwdPick = useCallback(async () => {
    const dir = await dialogApi.openDir();
    setDialog({ type: "none" });
    if (!dir || !pendingAgentRef.current) return;
    const agent = pendingAgentRef.current;
    pendingAgentRef.current = null;
    await doCreateSession(agent, dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** CWD 选择：默认目录 */
  const handleCwdDefault = useCallback(async () => {
    setDialog({ type: "none" });
    if (!pendingAgentRef.current) return;
    const agent = pendingAgentRef.current;
    pendingAgentRef.current = null;
    await doCreateSession(agent, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** CWD 选择：取消 */
  const handleCwdCancel = useCallback(() => {
    pendingAgentRef.current = null;
    setDialog({ type: "none" });
  }, []);

  /** 创建会话 */
  const doCreateSession = useCallback(async (agent: AgentPreset, cwd: string | null) => {
    const counter = sessionCounter + 1;
    const label = `${agent.name} #${counter}`;
    const id = await createSession({
      command: agent.command,
      args: agent.args,
      cwd: cwd ?? undefined,
      label,
    });
    if (!id) return;

    // 注册数据回调：驱动状态检测
    setOnData(id, (data) => feedData(id, data));
    // 注册退出回调
    setOnExit(id, () => {
      resetSession(id);
      setExited(id);
    });
  }, [sessionCounter, createSession, setOnData, feedData, setOnExit, resetSession, setExited]);

  /** 终端就绪回调 */
  const handleTerminalReady = useCallback(
    (id: string, terminal: Terminal) => {
      registerTerminal(id, terminal);
    },
    [registerTerminal],
  );

  /** 终端输入回调 */
  const handleTerminalInput = useCallback(
    (id: string, data: string) => {
      feedInput(id, data);
    },
    [feedInput],
  );

  /** 编辑代理 */
  const handleEditAgent = useCallback((index: number) => {
    setDialog({ type: "editAgent", index });
  }, []);

  const handleEditAgentSave = useCallback(
    (updates: Partial<AgentPreset>) => {
      const idx = (dialog as { type: string; index: number }).index;
      updateAgent(idx, updates);
      setDialog({ type: "none" });
    },
    [dialog, updateAgent],
  );

  /** 重命名会话 */
  const handleRename = useCallback(
    (id: string) => {
      const session = sessions.get(id);
      if (!session) return;
      setDialog({ type: "rename", id, currentName: session.info.label });
    },
    [sessions],
  );

  const handleRenameSave = useCallback(
    (name: string) => {
      const d = dialog as { type: string; id: string };
      renameSession(d.id, name);
      setDialog({ type: "none" });
    },
    [dialog, renameSession],
  );

  // Ctrl+Shift+数字 快捷键：发送选中文字到目标会话
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const key = e.key;
      if (key < "1" || key > "9") return;
      e.preventDefault();

      const terminal = activeId ? getTerminal(activeId) : undefined;
      if (!terminal || !terminal.hasSelection()) return;

      const text = terminal.getSelection();
      if (!text) return;

      // 活跃且非当前、未退出的会话列表
      const entries = Array.from(sessions.entries()).filter(
        ([id, s]) => id !== activeId && !s.exited,
      );
      const index = parseInt(key) - 1;
      if (index >= entries.length) return;

      const [targetId] = entries[index];
      sessionsApi.write(targetId, text);
      switchTo(targetId);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeId, sessions, getTerminal, switchTo]);

  const sessionEntries = Array.from(sessions.entries());
  const hasSessions = sessionEntries.length > 0;

  return (
    <div className="flex h-screen w-screen bg-tn-bg text-tn-fg overflow-hidden">
      <Sidebar
        agents={agents}
        activeId={activeId}
        sessions={sessions}
        theme={theme}
        onLaunch={handleLaunch}
        onSwitch={switchTo}
        onKill={killSession}
        onRename={handleRename}
        onEditAgent={handleEditAgent}
        onToggleTheme={toggle}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <TabsBar
          sessions={sessions}
          activeId={activeId}
          onSwitch={switchTo}
          onClose={killSession}
          onRename={handleRename}
        />

        <div className="flex-1 relative overflow-hidden">
          {hasSessions ? (
            sessionEntries.map(([id]) => (
              <TerminalPane
                key={id}
                id={id}
                active={id === activeId}
                theme={theme}
                sessions={sessions}
                onTerminalReady={handleTerminalReady}
                onInput={(data) => handleTerminalInput(id, data)}
              />
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-tn-comment select-none">
              <div className="text-center">
                <div className="text-4xl mb-3">🤖</div>
                <p className="text-lg">Agent Manager</p>
                <p className="text-sm mt-1 opacity-60">
                  从左侧选择代理启动
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <CwdPickerDialog
        open={dialog.type === "cwd"}
        onPick={handleCwdPick}
        onDefault={handleCwdDefault}
        onCancel={handleCwdCancel}
      />
      <EditAgentDialog
        open={dialog.type === "editAgent"}
        agent={
          dialog.type === "editAgent" ? agents[dialog.index] ?? null : null
        }
        onSave={handleEditAgentSave}
        onCancel={() => setDialog({ type: "none" })}
      />
      <RenameSessionDialog
        open={dialog.type === "rename"}
        currentName={dialog.type === "rename" ? dialog.currentName : ""}
        onSave={handleRenameSave}
        onCancel={() => setDialog({ type: "none" })}
      />
    </div>
  );
}

export default App;
