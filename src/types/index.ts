/** Agent 工作状态 */
export type AgentStatus = 'idle' | 'thinking' | 'writing' | 'waiting_input' | 'error';

/** 会话信息 */
export interface SessionInfo {
  id: string;
  label: string;
  command: string;
  cwd: string | null;
}

/** 创建会话参数 */
export interface CreateSessionOptions {
  command: string;
  args: string[];
  cwd?: string;
  label: string;
}

/** PTY 数据事件 */
export interface SessionDataEvent {
  id: string;
  data: string;
}

/** PTY 退出事件 */
export interface SessionExitEvent {
  id: string;
  exit_code: number;
}

/** 代理预设 */
export interface AgentPreset {
  id: string;
  name: string;
  icon: string;
  command: string;
  args: string[];
  desc: string;
}
