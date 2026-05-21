/**
 * 文件名：useSessionManager.ts
 * 描述：会话管理 Hook，管理 PTY 会话的创建、切换、关闭和事件监听
 *       使用全局事件监听 + 数据缓冲，避免 PTY 早期数据丢失
 * 作者：LR
 * 创建日期：2026-05-21
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { sessionsApi } from "../lib/api";
import type {
  CreateSessionOptions,
  SessionDataEvent,
  SessionExitEvent,
} from "../types";
import type { Terminal } from "@xterm/xterm";
import type { UnlistenFn } from "@tauri-apps/api/event";

/** 会话扩展信息（前端维护） */
export interface SessionState {
  info: { id: string; label: string; command: string; cwd: string | null };
  idle: boolean;
  exited: boolean;
}

export function useSessionManager() {
  const [sessions, setSessions] = useState<Map<string, SessionState>>(
    () => new Map(),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessionCounter, setSessionCounter] = useState(0);

  /** 全局数据回调（由外部通过 setOnData/setOnExit 设置） */
  const onDataRef = useRef<Map<string, (data: string) => void>>(new Map());
  const onExitRef = useRef<Map<string, (code: number) => void>>(new Map());

  /** 数据缓冲：终端就绪前的数据暂存 */
  const bufferRef = useRef<Map<string, string[]>>(new Map());

  /** 终端实例引用 */
  const terminalRef = useRef<Map<string, Terminal>>(new Map());

  /** 全局事件监听（只注册一次，在 mount 时） */
  useEffect(() => {
    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    const setup = async () => {
      unlistenData = await sessionsApi.onData(
        (event: SessionDataEvent) => {
          const { id, data } = event;
          const terminal = terminalRef.current.get(id);
          if (terminal) {
            // 终端已就绪，直接写入
            try {
              terminal.write(data);
            } catch {
              // 终端已 dispose
            }
          } else {
            // 终端未就绪，缓冲数据
            const buf = bufferRef.current.get(id);
            if (buf) {
              buf.push(data);
            } else {
              bufferRef.current.set(id, [data]);
            }
          }
          // 调用外部回调（空闲检测等）
          onDataRef.current.get(id)?.(data);
        },
      );

      unlistenExit = await sessionsApi.onExit(
        (event: SessionExitEvent) => {
          const { id, exit_code } = event;
          onExitRef.current.get(id)?.(exit_code);
        },
      );
    };

    setup();

    return () => {
      unlistenData?.();
      unlistenExit?.();
    };
  }, []);

  /** 创建新会话 */
  const createSession = useCallback(
    async (opts: CreateSessionOptions): Promise<string | null> => {
      // 先初始化缓冲区，再 spawn PTY
      const info = await sessionsApi.create(opts);
      if (!info) return null;

      setSessionCounter((c) => c + 1);
      setSessions((prev) => {
        const next = new Map(prev);
        next.set(info.id, {
          info: { id: info.id, label: info.label, command: info.command, cwd: info.cwd },
          idle: false,
          exited: false,
        });
        return next;
      });
      setActiveId(info.id);
      return info.id;
    },
    [],
  );

  /** 注册终端实例 + 刷新缓冲数据 */
  const registerTerminal = useCallback((id: string, terminal: Terminal) => {
    terminalRef.current.set(id, terminal);

    // 刷新缓冲数据
    const buf = bufferRef.current.get(id);
    if (buf && buf.length > 0) {
      for (const data of buf) {
        try {
          terminal.write(data);
        } catch {
          // 忽略
        }
      }
      bufferRef.current.delete(id);
    }
  }, []);

  /** 设置会话级数据回调（空闲检测等） */
  const setOnData = useCallback((id: string, cb: (data: string) => void) => {
    onDataRef.current.set(id, cb);
  }, []);

  /** 设置会话级退出回调 */
  const setOnExit = useCallback((id: string, cb: (code: number) => void) => {
    onExitRef.current.set(id, cb);
  }, []);

  /** 切换活跃会话 */
  const switchTo = useCallback(
    (id: string) => {
      if (!sessions.has(id)) return;
      setActiveId(id);
    },
    [sessions],
  );

  /** 关闭会话 */
  const killSession = useCallback(
    async (id: string) => {
      await sessionsApi.kill(id);

      // 清理终端
      const terminal = terminalRef.current.get(id);
      if (terminal) {
        try {
          terminal.dispose();
        } catch {
          // 忽略
        }
        terminalRef.current.delete(id);
      }

      // 清理回调和缓冲
      onDataRef.current.delete(id);
      onExitRef.current.delete(id);
      bufferRef.current.delete(id);

      setSessions((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      setActiveId((prevActive) => {
        if (prevActive !== id) return prevActive;
        const remaining = Array.from(sessions.keys()).filter((k) => k !== id);
        return remaining.length > 0 ? remaining[remaining.length - 1] : null;
      });
    },
    [sessions],
  );

  /** 更新会话空闲状态 */
  const setIdle = useCallback((id: string, idle: boolean) => {
    setSessions((prev) => {
      const next = new Map(prev);
      const session = next.get(id);
      if (session) {
        next.set(id, { ...session, idle });
      }
      return next;
    });
  }, []);

  /** 更新会话退出状态 */
  const setExited = useCallback((id: string) => {
    setSessions((prev) => {
      const next = new Map(prev);
      const session = next.get(id);
      if (session) {
        next.set(id, { ...session, exited: true });
      }
      return next;
    });
  }, []);

  /** 重命名会话 */
  const renameSession = useCallback((id: string, label: string) => {
    setSessions((prev) => {
      const next = new Map(prev);
      const session = next.get(id);
      if (session) {
        next.set(id, { ...session, info: { ...session.info, label } });
      }
      return next;
    });
  }, []);

  return {
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
  };
}
