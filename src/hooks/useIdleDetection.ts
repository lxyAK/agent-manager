import { useCallback, useRef } from "react";
import type { Terminal } from "@xterm/xterm";

const IDLE_SILENCE_MS = 6000;
const IDLE_CONFIRM_MS = 15000;

const ANSI_RE = /\x1b\[[0-9;:?<=>]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1bP[^\x1b]*(\x1b\\|$)|\x1b[()][0-9A-Za-z]|[\x0e\x0f]/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

/** 空闲检测 Hook */
export function useIdleDetection(
  sessionId: string,
  terminal: Terminal | null,
  onIdleChange: (id: string, idle: boolean) => void,
) {
  const phaseRef = useRef<"idle" | "active">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDataRef = useRef(0);

  const checkBuffer = useCallback((): boolean => {
    if (!terminal) return false;
    const buf = terminal.buffer.active;
    if (buf.type === "alternate") return false;
    const checkLines = Math.min(8, terminal.rows);
    for (let i = 0; i < checkLines; i++) {
      const line = buf.getLine(buf.length - 1 - i);
      if (!line) continue;
      const text = stripAnsi(line.translateToString(true));
      if (/❯\s*$/.test(text)) return true;
    }
    return false;
  }, [terminal]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 用户按 Enter 时调用 */
  const notifyInput = useCallback((data: string) => {
    if (data.includes("\r") || data.includes("\n")) {
      phaseRef.current = "active";
      clearTimer();
      onIdleChange(sessionId, false);
    }
  }, [sessionId, onIdleChange, clearTimer]);

  /** 收到 PTY 数据时调用 */
  const notifyData = useCallback(() => {
    if (phaseRef.current === "idle") return;
    lastDataRef.current = Date.now();
    clearTimer();
    onIdleChange(sessionId, false);
    timerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastDataRef.current;
      if (elapsed >= IDLE_CONFIRM_MS || checkBuffer()) {
        phaseRef.current = "idle";
        onIdleChange(sessionId, true);
      } else {
        timerRef.current = setTimeout(() => {
          phaseRef.current = "idle";
          onIdleChange(sessionId, true);
        }, IDLE_CONFIRM_MS - elapsed);
      }
    }, IDLE_SILENCE_MS);
  }, [sessionId, onIdleChange, clearTimer, checkBuffer]);

  /** 会话退出时调用 */
  const reset = useCallback(() => {
    clearTimer();
    phaseRef.current = "idle";
  }, [clearTimer]);

  return { notifyInput, notifyData, reset };
}
