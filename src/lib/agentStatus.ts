import type { AgentStatus } from "../types";

// ANSI 转义序列正则
const ANSI_RE = /\x1b\[[0-9;:?<=>]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1bP[^\x1b]*(\x1b\\|$)|\x1b[()][0-9A-Za-z]|[\x0e\x0f]/g;

/** 去除 ANSI 转义码 */
export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

// ========== 状态模式定义（按优先级排列） ==========

const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bfatal\b/i,
  /\bFAILED\b/,
  /\bpanic\b/i,
  /\bTraceback\b/,
  /\bException\b/,
  /\bPermission denied\b/,
  /\bcommand not found\b/,
  /\bNo such file\b/,
  /\bENOENT\b/,
  /\bnpm error\b/i,
  /\bcargo:\s*error\b/i,
];

const WAITING_INPUT_PATTERNS = [
  /\?\s*$/,                          // 行尾问号
  /\[Y\/n\]/,
  /\[y\/N\]/,
  /\byes\/no\b/i,
  /\bapprove\?\s*$/i,
  /\bconfirm\?\s*$/i,
  /\bDo you want\b/i,
  /\bWould you like\b/i,
  /\bSelect an option\b/i,
  /\bChoose\b.*\?/i,
  /\bPress Enter\b/i,
  /❯\s+\d+\./,                      // Claude 选择列表
  /\bAllow\s/i,                      // Codex 权限请求
];

const WRITING_PATTERNS = [
  /\bCreating\b.*\bfile\b/i,
  /\bEditing\b.*\bfile\b/i,
  /\bWriting\b.*\bfile\b/i,
  /\bModifying\b/i,
  /\bUpdating file\b/i,
  /\bSaving\b/i,
  /\bApplying\b.*\bpatch\b/i,
  /^\+\+\+ /m,                       // diff 输出
  /^--- /m,
  /^@@ /m,
  /^\+/m,
];

const THINKING_PATTERNS = [
  /\bReading\b/i,
  /\bAnalyzing\b/i,
  /\bThinking\b/i,
  /\bPlanning\b/i,
  /\bSearching\b/i,
  /\bGrep(?:ping)?\b/i,
  /\bListing\b/i,
  /\bChecking\b/i,
  /\bReviewing\b/i,
  /\bProcessing\b/i,
  /^\s*\.{3,}\s*$/m,                // 省略号动画
  /\bRunning\b/i,
];

const SHELL_PROMPT_PATTERNS = [
  /❯\s*$/,                           // Claude Code shell
  />\s*$/,                            // 通用
  /\$\s*$/,                           // bash/zsh
  /PS\s.*>\s*$/,                      // PowerShell
  /▶\s*$/,                            // Nushell
];

/** 检测最后一行是否为 Shell 提示符 */
function isShellPrompt(lines: string[]): boolean {
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const line = lines[i];
    if (line.trim() === "") continue;
    return SHELL_PROMPT_PATTERNS.some((re) => re.test(line));
  }
  return false;
}

/** 检测一组行是否匹配任意模式 */
function matchesAny(lines: string[], patterns: RegExp[]): boolean {
  // 只检查最近 20 行
  const recent = lines.slice(-20);
  const text = recent.join("\n");
  return patterns.some((re) => re.test(text));
}

/**
 * 根据最近输出行检测 Agent 状态
 * @param lines 最近的完整行（已去除 ANSI）
 * @param currentStatus 当前状态
 * @returns 检测到的新状态
 */
export function detectStatus(
  lines: string[],
  currentStatus: AgentStatus,
): AgentStatus {
  if (lines.length === 0) return currentStatus;

  // Shell 提示符 → idle（最高优先级之一，仅当非 error/waiting_input 时）
  if (isShellPrompt(lines) && currentStatus !== "error") {
    return "idle";
  }

  // error（最高优先级）
  if (matchesAny(lines, ERROR_PATTERNS)) {
    return "error";
  }

  // waiting_input
  if (matchesAny(lines, WAITING_INPUT_PATTERNS)) {
    return "waiting_input";
  }

  // writing
  if (matchesAny(lines, WRITING_PATTERNS)) {
    return "writing";
  }

  // thinking
  if (matchesAny(lines, THINKING_PATTERNS)) {
    return "thinking";
  }

  // 无明确匹配：如果当前是 idle，收到新数据则默认转为 thinking
  if (currentStatus === "idle") {
    return "thinking";
  }

  return currentStatus;
}

/** 状态显示配置 */
export const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; animation: string }
> = {
  idle: { label: "空闲", color: "bg-tn-comment/50", animation: "" },
  thinking: { label: "思考中", color: "bg-tn-blue", animation: "animate-spin-slow" },
  writing: { label: "写入中", color: "bg-tn-yellow", animation: "animate-pulse" },
  waiting_input: { label: "等待输入", color: "bg-tn-cyan", animation: "idle-blink" },
  error: { label: "错误", color: "bg-tn-red", animation: "" },
};
