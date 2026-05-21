import { useState, useCallback } from "react";
import type { AgentPreset } from "../types";

const PRESETS_VERSION = 1;
const STORAGE_KEY = "agent-manager:agents";
const VERSION_KEY = "agent-manager:agents-version";

const DEFAULT_AGENTS: AgentPreset[] = [
  { id: "claude", name: "Claude Code", icon: "claude.svg", command: "npx", args: ["-y", "@anthropic-ai/claude-code"], desc: "claude" },
  { id: "codex", name: "OpenAI Codex", icon: "openai.svg", command: "npx", args: ["-y", "@openai/codex"], desc: "codex" },
  { id: "opencode", name: "OpenCode", icon: "opencode.svg", command: "npx", args: ["-y", "opencode-ai"], desc: "opencode" },
  { id: "terminal", name: "新建终端", icon: "terminal.svg", command: "", args: [], desc: "" },
];

function loadPresets(): AgentPreset[] {
  try {
    const version = localStorage.getItem(VERSION_KEY);
    if (String(PRESETS_VERSION) === version) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch { /* 忽略解析错误 */ }
  return DEFAULT_AGENTS;
}

function savePresets(agents: AgentPreset[]) {
  localStorage.setItem(VERSION_KEY, String(PRESETS_VERSION));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

/** 代理预设管理 Hook */
export function useAgentPresets() {
  const [agents, setAgents] = useState<AgentPreset[]>(loadPresets);

  const updateAgent = useCallback((index: number, updates: Partial<AgentPreset>) => {
    setAgents((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      savePresets(next);
      return next;
    });
  }, []);

  return { agents, updateAgent };
}
