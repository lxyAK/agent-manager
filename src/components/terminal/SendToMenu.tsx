/**
 * 文件名：SendToMenu.tsx
 * 描述：右键上下文菜单，将选中文字发送到其他会话终端
 */

import { useEffect, useRef, useMemo } from "react";
import type { AgentStatus, SessionInfo } from "../../types";
import { STATUS_CONFIG } from "../../lib/agentStatus";

interface SendToMenuProps {
  x: number;
  y: number;
  text: string;
  sourceId: string;
  sessions: Map<string, { info: SessionInfo; status: AgentStatus; exited: boolean }>;
  onSend: (targetId: string, text: string) => void;
  onCopy: (text: string) => void;
  onClose: () => void;
}

export function SendToMenu({
  x,
  y,
  text,
  sourceId,
  sessions,
  onSend,
  onCopy,
  onClose,
}: SendToMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const id = requestAnimationFrame(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const pos = useMemo(() => {
    const menuW = 200;
    const menuH = sessions.size * 36 + 80;
    const vx = window.innerWidth;
    const vy = window.innerHeight;
    return {
      left: x + menuW > vx ? x - menuW : x,
      top: y + menuH > vy ? y - menuH : y,
    };
  }, [x, y, sessions.size]);

  const targets = Array.from(sessions.entries()).filter(
    ([id, s]) => id !== sourceId && !s.exited,
  );

  return (
    <div
      ref={menuRef}
      className="send-to-menu"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="send-to-menu-title">发送到...</div>
      {targets.length === 0 ? (
        <div className="send-to-menu-item disabled">无可用会话</div>
      ) : (
        targets.map(([id, session]) => (
          <div
            key={id}
            className="send-to-menu-item"
            onClick={() => {
              onSend(id, text);
              onClose();
            }}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${STATUS_CONFIG[session.status].color}`}
            />
            <span className="truncate">{session.info.label}</span>
          </div>
        ))
      )}
      <div className="send-to-menu-separator" />
      <div
        className="send-to-menu-item"
        onClick={() => {
          onCopy(text);
          onClose();
        }}
      >
        复制到剪贴板
      </div>
    </div>
  );
}
