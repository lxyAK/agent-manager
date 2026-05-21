/**
 * 文件名：RenameSessionDialog.tsx
 * 描述：会话重命名弹窗组件
 * 作者：LR
 * 创建日期：2026-05-21
 */

import { useState, useEffect, useRef } from "react";

interface RenameSessionDialogProps {
  open: boolean;
  currentName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/**
 * 会话重命名弹窗
 */
export function RenameSessionDialog({
  open,
  currentName,
  onSave,
  onCancel,
}: RenameSessionDialogProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open, currentName]);

  if (!open) return null;

  const handleSave = () => {
    if (name.trim()) onSave(name.trim());
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
      <div className="bg-tn-bg border border-tn-border rounded-lg shadow-xl p-5 min-w-[320px]">
        <h3 className="text-base font-medium text-tn-fg mb-4">重命名会话</h3>
        <input
          ref={inputRef}
          className="w-full px-3 py-1.5 rounded bg-tn-sidebar border border-tn-border text-tn-fg text-sm outline-none focus:border-tn-blue transition-colors"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end gap-2 mt-4">
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
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
