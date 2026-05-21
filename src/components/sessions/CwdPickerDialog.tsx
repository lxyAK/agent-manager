/**
 * 文件名：CwdPickerDialog.tsx
 * 描述：工作目录选择弹窗组件
 * 作者：LR
 * 创建日期：2026-05-21
 */

interface CwdPickerDialogProps {
  open: boolean;
  onPick: () => void;
  onDefault: () => void;
  onCancel: () => void;
}

/**
 * 工作目录选择弹窗
 * 用户可以选择指定目录、使用默认目录或取消
 */
export function CwdPickerDialog({
  open,
  onPick,
  onDefault,
  onCancel,
}: CwdPickerDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-tn-bg border border-tn-border rounded-lg shadow-xl p-5 min-w-[320px]">
        <h3 className="text-base font-medium text-tn-fg mb-4">
          选择工作目录
        </h3>
        <div className="flex flex-col gap-2">
          <button
            className="w-full px-4 py-2 rounded bg-tn-blue text-white text-sm hover:opacity-90 transition-opacity"
            onClick={onPick}
          >
            选择目录…
          </button>
          <button
            className="w-full px-4 py-2 rounded bg-tn-selection text-tn-fg text-sm hover:opacity-90 transition-opacity"
            onClick={onDefault}
          >
            使用默认目录
          </button>
          <button
            className="w-full px-4 py-2 rounded text-tn-comment text-sm hover:bg-tn-selection/50 transition-colors"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
