/**
 * 文件名：TabsBar.tsx
 * 描述：标签栏组件，显示打开的会话标签页
 * 作者：LR
 * 创建日期：2026-05-21
 */

import type { AgentStatus, SessionInfo } from "../../types";

interface TabsBarProps {
  sessions: Map<string, { info: SessionInfo; status: AgentStatus; exited: boolean }>;
  activeId: string | null;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string) => void;
}

/**
 * 标签栏组件
 * 每个会话对应一个标签，支持切换、关闭和双击重命名
 */
export function TabsBar({
  sessions,
  activeId,
  onSwitch,
  onClose,
  onRename,
}: TabsBarProps) {
  const entries = Array.from(sessions.entries());

  if (entries.length === 0) return null;

  return (
    <div className="flex items-center h-9 bg-tn-sidebar border-b border-tn-border overflow-x-auto">
      {entries.map(([id, session]) => (
        <div
          key={id}
          className={`flex items-center gap-1.5 px-3 h-full cursor-pointer border-r border-tn-border shrink-0 text-sm transition-colors ${
            activeId === id
              ? "bg-tn-bg text-tn-fg"
              : "text-tn-comment hover:text-tn-fg hover:bg-tn-bg/50"
          } ${!session.exited && session.status !== "idle" ? `tab-status-${session.status}` : ""}`}
          onClick={(e) => {
            if ((e.target as HTMLElement).classList.contains("tab-close-btn"))
              return;
            onSwitch(id);
          }}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).classList.contains("tab-close-btn"))
              return;
            onRename(id);
          }}
          title={session.info.cwd || session.info.label}
        >
          <span className="truncate max-w-[120px]">{session.info.label}</span>
          <button
            className="tab-close-btn opacity-0 hover:opacity-100 text-xs text-tn-comment hover:text-tn-red transition-opacity ml-1"
            onClick={(e) => {
              e.stopPropagation();
              onClose(id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
