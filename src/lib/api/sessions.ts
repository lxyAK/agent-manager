import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  CreateSessionOptions,
  SessionDataEvent,
  SessionExitEvent,
  SessionInfo,
} from "../../types";

/** 会话相关 API */
export const sessionsApi = {
  /** 创建新会话 */
  create: (opts: CreateSessionOptions): Promise<SessionInfo> =>
    invoke("session_create", { opts }),

  /** 向会话写入数据 */
  write: (id: string, data: string): Promise<boolean> =>
    invoke("session_write", { id, data }),

  /** 调整终端大小 */
  resize: (id: string, cols: number, rows: number): Promise<boolean> =>
    invoke("session_resize", { id, cols, rows }),

  /** 终止会话 */
  kill: (id: string): Promise<boolean> =>
    invoke("session_kill", { id }),

  /** 列出所有活跃会话 */
  list: (): Promise<SessionInfo[]> =>
    invoke("session_list"),

  /** 监听 PTY 数据输出 */
  onData: (callback: (event: SessionDataEvent) => void): Promise<UnlistenFn> =>
    listen<SessionDataEvent>("session:data", (e) => callback(e.payload)),

  /** 监听会话退出 */
  onExit: (callback: (event: SessionExitEvent) => void): Promise<UnlistenFn> =>
    listen<SessionExitEvent>("session:exit", (e) => callback(e.payload)),
};
