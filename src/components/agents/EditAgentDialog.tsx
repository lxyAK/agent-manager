/**
 * 文件名：EditAgentDialog.tsx
 * 描述：编辑代理预设弹窗组件
 * 作者：LR
 * 创建日期：2026-05-21
 */

import { useState, useEffect, useRef } from "react";
import type { AgentPreset } from "../../types";

interface EditAgentDialogProps {
  open: boolean;
  agent: AgentPreset | null;
  onSave: (updates: Partial<AgentPreset>) => void;
  onCancel: () => void;
}

/**
 * 编辑代理预设弹窗
 * 支持修改名称、命令和参数
 */
export function EditAgentDialog({
  open,
  agent,
  onSave,
  onCancel,
}: EditAgentDialogProps) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && agent) {
      setName(agent.name);
      setCommand(agent.command);
      setArgs(agent.args.join(" "));
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open, agent]);

  if (!open || !agent) return null;

  const handleSave = () => {
    onSave({
      name: name || agent.name,
      command: command || agent.command,
      args: args ? args.split(/\s+/) : [],
      desc: command ? `${command}${args ? " " + args : ""}` : agent.desc,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") onCancel();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-tn-bg border border-tn-border rounded-lg shadow-xl p-5 min-w-[360px]">
        <h3 className="text-base font-medium text-tn-fg mb-4">
          编辑代理 — {agent.name}
        </h3>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-tn-comment">
            名称
            <input
              ref={nameRef}
              className="px-3 py-1.5 rounded bg-tn-sidebar border border-tn-border text-tn-fg text-sm outline-none focus:border-tn-blue transition-colors"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-tn-comment">
            命令
            <input
              className="px-3 py-1.5 rounded bg-tn-sidebar border border-tn-border text-tn-fg text-sm outline-none focus:border-tn-blue transition-colors"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-tn-comment">
            参数（空格分隔）
            <input
              className="px-3 py-1.5 rounded bg-tn-sidebar border border-tn-border text-tn-fg text-sm outline-none focus:border-tn-blue transition-colors"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </label>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-4 py-1.5 rounded text-tn-comment text-sm hover:bg-tn-selection/50 transition-colors"
              onClick={onCancel}
            >
              取消
            </button>
            <button
              className="px-4 py-1.5 rounded bg-tn-blue text-white text-sm hover:opacity-90 transition-opacity"
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
