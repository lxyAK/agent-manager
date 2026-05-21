/**
 * 文件名：App.tsx
 * 描述：应用主入口组件，整合侧边栏、标签栏、终端容器和所有弹窗
 * 作者：LR
 * 创建日期：2026-05-21
 */

import { useState, useCallback, useRef } from "react";
import type { Terminal } from "@xterm/xterm";
import type { AgentPreset } from "./types";
import { useTheme } from "./hooks/useTheme";
import { useAgentPresets } from "./hooks/useAgentPresets";
import { useSessionManager } from "./hooks/useSessionManager";
import { dialogApi } from "./lib/api";
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
    setIdle,
    setExited,
    renameSession,
  } = useSessionManager();

  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const pendingAgentRef = useRef<AgentPreset | null>(null);

  /** 空闲检测实例 */
  const idleDetectionsRef = useRef<
    Map<
      string,
      {
        notifyInput: (data: string) => void;
        notifyData: () => void;
        reset: () => void;
      }
    >
  >(new Map());

  /** 获取或创建空闲检测 */
  const getOrCreateIdle = useCallback(
    (id: string) => {
      if (idleDetectionsRef.current.has(id)) {
        return idleDetectionsRef.current.get(id)!;
      }
      const detection = createSimpleIdleDetection(id, setIdle);
      idleDetectionsRef.current.set(id, detection);
      return detection;
    },
    [setIdle],
  );

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
  const doCreateSession = async (agent: AgentPreset, cwd: string | null) => {
    const counter = sessionCounter + 1;
    const label = `${agent.name} #${counter}`;
    const id = await createSession({
      command: agent.command,
      args: agent.args,
      cwd: cwd ?? undefined,
      label,
    });
    if (!id) return;

    // 创建空闲检测 + 注册数据/退出回调
    const idle = getOrCreateIdle(id);
    setOnData(id, () => idle.notifyData());
    setOnExit(id, () => {
      idle.reset();
      setExited(id);
    });
  };

  /** 终端就绪回调 */
  const handleTerminalReady = useCallback(
    (id: string, terminal: Terminal) => {
      // 注册终端 + 刷新缓冲数据
      registerTerminal(id, terminal);
    },
    [registerTerminal],
  );

  /** 终端输入回调 */
  const handleTerminalInput = useCallback(
    (id: string, data: string) => {
      const idle = idleDetectionsRef.current.get(id);
      idle?.notifyInput(data);
    },
    [],
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

        <div className="flex-1 relative">
          {hasSessions ? (
            sessionEntries.map(([id]) => (
              <TerminalPane
                key={id}
                id={id}
                active={id === activeId}
                theme={theme}
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

// ========== 简化版空闲检测 ==========

const IDLE_SILENCE_MS = 6000;
const IDLE_CONFIRM_MS = 15000;

/**
 * 创建空闲检测实例
 * @param sessionId 会话 ID
 * @param onIdleChange 空闲状态变化回调
 */
function createSimpleIdleDetection(
  sessionId: string,
  onIdleChange: (id: string, idle: boolean) => void,
) {
  let phase: "idle" | "active" = "idle";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastDataTime = 0;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const onSilence = () => {
    const elapsed = Date.now() - lastDataTime;
    if (elapsed >= IDLE_CONFIRM_MS) {
      phase = "idle";
      onIdleChange(sessionId, true);
    } else {
      timer = setTimeout(onSilence, IDLE_CONFIRM_MS - elapsed);
    }
  };

  return {
    notifyInput: (data: string) => {
      if (data.includes("\r") || data.includes("\n")) {
        phase = "active";
        clearTimer();
        onIdleChange(sessionId, false);
      }
    },
    notifyData: () => {
      if (phase === "idle") return;
      lastDataTime = Date.now();
      clearTimer();
      onIdleChange(sessionId, false);
      timer = setTimeout(onSilence, IDLE_SILENCE_MS);
    },
    reset: () => {
      clearTimer();
      phase = "idle";
    },
  };
}

export default App;
