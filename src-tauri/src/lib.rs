mod pty_manager;

use pty_manager::{CreateSessionOptions, PtyManager, SessionInfo};

use tauri::State;

/// 应用状态
struct AppState {
    pty_manager: PtyManager,
}

/// 创建新的 PTY 会话
#[tauri::command]
fn session_create(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    opts: CreateSessionOptions,
) -> Result<SessionInfo, String> {
    state
        .pty_manager
        .create(app, opts)
        .map_err(|e| e.to_string())
}

/// 向会话写入数据
#[tauri::command]
fn session_write(state: State<'_, AppState>, id: String, data: String) -> Result<bool, String> {
    state.pty_manager.write(&id, &data).map_err(|e| e.to_string())
}

/// 调整终端大小
#[tauri::command]
fn session_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<bool, String> {
    state
        .pty_manager
        .resize(&id, cols, rows)
        .map_err(|e| e.to_string())
}

/// 终止会话
#[tauri::command]
fn session_kill(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.pty_manager.kill(&id).map_err(|e| e.to_string())
}

/// 列出所有活跃会话
#[tauri::command]
fn session_list(state: State<'_, AppState>) -> Vec<SessionInfo> {
    state.pty_manager.list()
}

/// 打开目录选择对话框
#[tauri::command]
async fn dialog_open_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = app
        .dialog()
        .file()
        .blocking_pick_folder();
    match result {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState {
            pty_manager: PtyManager::new(),
        })
        .invoke_handler(tauri::generate_handler![
            session_create,
            session_write,
            session_resize,
            session_kill,
            session_list,
            dialog_open_dir,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Agent Manager 失败");
}
