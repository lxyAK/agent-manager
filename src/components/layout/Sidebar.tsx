/**
 * 文件名：Sidebar.tsx
 * 描述：左侧边栏组件，包含代理快速启动列表和活跃会话列表
 * 作者：LR
 * 创建日期：2026-05-21
 */

import { useState, useCallback } from "react";
import type { AgentPreset, AgentStatus, SessionInfo } from "../../types";
import { STATUS_CONFIG } from "../../lib/agentStatus";
import type { Theme } from "../../hooks/useTheme";

interface SidebarProps {
  agents: AgentPreset[];
  activeId: string | null;
  sessions: Map<string, { info: SessionInfo; status: AgentStatus; exited: boolean }>;
  theme: Theme;
  onLaunch: (agent: AgentPreset) => void;
  onSwitch: (id: string) => void;
  onKill: (id: string) => void;
  onRename: (id: string) => void;
  onEditAgent: (index: number) => void;
  onToggleTheme: () => void;
}

/**
 * 侧边栏组件
 * 显示代理快捷启动、活跃会话列表和主题切换
 */
export function Sidebar({
  agents,
  activeId,
  sessions,
  theme,
  onLaunch,
  onSwitch,
  onKill,
  onRename,
  onEditAgent,
  onToggleTheme,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const sessionList = Array.from(sessions.entries());

  return (
    <aside className="w-56 h-full flex flex-col bg-tn-sidebar border-r border-tn-border overflow-hidden select-none">
      {/* 快速启动 */}
      <div className="flex flex-col">
        <button
          className="flex items-center gap-2 px-3 py-2 text-xs text-tn-fg opacity-70 hover:opacity-100 transition-opacity"
          onClick={() => toggleSection("launch")}
        >
          <span className={`transition-transform ${collapsed.launch ? "-rotate-90" : ""}`}>
            ▸
          </span>
          快速启动
        </button>
        {!collapsed.launch && (
          <div className="px-1">
            {agents.map((agent, idx) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-tn-selection group"
                onClick={() => onLaunch(agent)}
              >
                {agent.icon.endsWith(".svg") ? (
                  <img
                    src={`src/assets/${agent.icon}`}
                    alt=""
                    className="w-4 h-4"
                  />
                ) : (
                  <span className="text-sm">{agent.icon}</span>
                )}
                <span className="text-sm text-tn-fg truncate flex-1">
                  {agent.name}
                </span>
                <button
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs text-tn-fg transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditAgent(idx);
                  }}
                  title="编辑"
                >
                  ✎
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 会话列表 */}
      <div className="flex flex-col flex-1 min-h-0">
        <button
          className="flex items-center gap-2 px-3 py-2 text-xs text-tn-fg opacity-70 hover:opacity-100 transition-opacity"
          onClick={() => toggleSection("sessions")}
        >
          <span className={`transition-transform ${collapsed.sessions ? "-rotate-90" : ""}`}>
            ▸
          </span>
          会话 ({sessionList.length})
        </button>
        {!collapsed.sessions && (
          <div className="flex-1 overflow-y-auto px-1 min-h-0">
            {sessionList.map(([id, session]) => (
              <div
                key={id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer group ${
                  activeId === id
                    ? "bg-tn-selection text-tn-fg"
                    : "hover:bg-tn-selection/50 text-tn-fg/80"
                }`}
                onClick={() => onSwitch(id)}
                title={session.info.cwd || session.info.label}
              >
                {/* 状态指示器 */}
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    session.exited
                      ? "bg-tn-red/50"
                      : `${STATUS_CONFIG[session.status].color} ${STATUS_CONFIG[session.status].animation}`
                  }`}
                />
                <span className="text-sm truncate flex-1">
                  {session.info.label}
                </span>
                {!session.exited && session.status !== "idle" && (
                  <span className="text-[10px] text-tn-comment shrink-0">
                    {STATUS_CONFIG[session.status].label}
                  </span>
                )}
                {/* 更多操作 */}
                <div className="relative">
                  <button
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs px-0.5 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === id ? null : id);
                    }}
                  >
                    ⋯
                  </button>
                  {menuOpenId === id && (
                    <div className="absolute right-0 top-5 bg-tn-bg border border-tn-border rounded shadow-lg z-10 py-1 min-w-[80px]">
                      <button
                        className="w-full text-left px-3 py-1 text-sm text-tn-fg hover:bg-tn-selection"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(null);
                          onRename(id);
                        }}
                      >
                        重命名
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onKill(id);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {sessionList.length === 0 && (
              <div className="text-xs text-tn-comment text-center py-4">
                暂无会话
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-tn-border">
        <span className="text-xs text-tn-comment">Agent Manager</span>
        <button
          className="text-sm hover:opacity-80 transition-opacity"
          onClick={onToggleTheme}
          title={theme === "dark" ? "切换亮色" : "切换暗色"}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
    </aside>
  );
}
