import { invoke } from "@tauri-apps/api/core";

/** 对话框相关 API */
export const dialogApi = {
  /** 打开目录选择对话框 */
  openDir: (): Promise<string | null> =>
    invoke("dialog_open_dir"),
};
