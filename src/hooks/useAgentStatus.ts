import { useRef, useCallback } from "react";
import type { AgentStatus } from "../types";
import { stripAnsi, detectStatus } from "../lib/agentStatus";

const MAX_LINES = 40;
const SILENCE_TIMEOUT_MS = 30_000;

interface StatusFSM {
  status: AgentStatus;
  lineBuffer: string;
  lines: string[];
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Agent 状态机 Hook
 * 管理每个会话的状态检测实例，通过 feedData/feedInput 驱动
 */
export function useAgentStatus(
  onStatusChange: (id: string, status: AgentStatus) => void,
) {
  const fsmsRef = useRef<Map<string, StatusFSM>>(new Map());
  const callbackRef = useRef(onStatusChange);
  callbackRef.current = onStatusChange;

  const getOrCreate = useCallback((id: string): StatusFSM => {
    let fsm = fsmsRef.current.get(id);
    if (!fsm) {
      fsm = { status: "idle", lineBuffer: "", lines: [], timer: null };
      fsmsRef.current.set(id, fsm);
    }
    return fsm;
  }, []);

  const clearTimer = useCallback((fsm: StatusFSM) => {
    if (fsm.timer) {
      clearTimeout(fsm.timer);
      fsm.timer = null;
    }
  }, []);

  const updateStatus = useCallback((id: string, fsm: StatusFSM, newStatus: AgentStatus) => {
    if (fsm.status === newStatus) return;
    fsm.status = newStatus;
    callbackRef.current(id, newStatus);
  }, []);

  /** 启动/重启超时计时器 */
  const startSilenceTimer = useCallback((id: string, fsm: StatusFSM) => {
    clearTimer(fsm);
    fsm.timer = setTimeout(() => {
      // thinking/writing 超时回退到 idle；waiting_input/error 不回退
      if (fsm.status === "thinking" || fsm.status === "writing") {
        updateStatus(id, fsm, "idle");
      }
    }, SILENCE_TIMEOUT_MS);
  }, [clearTimer, updateStatus]);

  /**
   * 喂入 PTY 输出数据
   * 在全局 session:data 监听器中调用
   */
  const feedData = useCallback((sessionId: string, rawData: string) => {
    const fsm = getOrCreate(sessionId);

    // 追加数据到行缓冲，按换行分割
    const stripped = stripAnsi(rawData);
    fsm.lineBuffer += stripped;

    const newLines: string[] = [];
    let idx: number;
    while ((idx = fsm.lineBuffer.indexOf("\n")) !== -1) {
      const line = fsm.lineBuffer.slice(0, idx);
      fsm.lineBuffer = fsm.lineBuffer.slice(idx + 1);
      if (line.trim()) newLines.push(line);
    }

    if (newLines.length > 0) {
      fsm.lines.push(...newLines);
      // 保留最近 MAX_LINES 行
      if (fsm.lines.length > MAX_LINES) {
        fsm.lines = fsm.lines.slice(-MAX_LINES);
      }
    }

    // 即使没有完整行也运行检测（lineBuffer 可能包含部分匹配）
    const newStatus = detectStatus(fsm.lines, fsm.status);
    updateStatus(sessionId, fsm, newStatus);

    // 有数据就重置超时计时器
    startSilenceTimer(sessionId, fsm);
  }, [getOrCreate, updateStatus, startSilenceTimer]);

  /**
   * 喂入用户输入
   * 在终端输入回调中调用
   */
  const feedInput = useCallback((sessionId: string, data: string) => {
    if (!data.includes("\r") && !data.includes("\n")) return;

    const fsm = getOrCreate(sessionId);
    // 用户按 Enter 响应了等待 → 切到 thinking
    if (fsm.status === "waiting_input") {
      updateStatus(sessionId, fsm, "thinking");
      startSilenceTimer(sessionId, fsm);
    }
  }, [getOrCreate, updateStatus, startSilenceTimer]);

  /**
   * 重置会话状态（退出或关闭时）
   */
  const resetSession = useCallback((sessionId: string) => {
    const fsm = fsmsRef.current.get(sessionId);
    if (fsm) {
      clearTimer(fsm);
      fsm.status = "idle";
      fsm.lines = [];
      fsm.lineBuffer = "";
    }
    fsmsRef.current.delete(sessionId);
  }, [clearTimer]);

  return { feedData, feedInput, resetSession };
}
