use anyhow::Result;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// 会话信息（返回给前端）
#[derive(Debug, Clone, Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub label: String,
    pub command: String,
    pub cwd: Option<String>,
}

/// 创建会话请求参数
#[derive(Debug, Deserialize)]
pub struct CreateSessionOptions {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub label: String,
}

/// 会话内部状态
struct Session {
    _master: Box<dyn MasterPty + Send>,
    _child: Box<dyn Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
    label: String,
    command: String,
    cwd: Option<String>,
}

/// PTY 管理器
pub struct PtyManager {
    sessions: Mutex<HashMap<String, Session>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// 创建新的 PTY 会话
    pub fn create(&self, app: AppHandle, opts: CreateSessionOptions) -> Result<SessionInfo> {
        let pty_system = native_pty_system();

        let size = PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system.openpty(size)?;

        let cwd = opts.cwd.clone();
        let shell = detect_shell();
        let spawn_cwd = cwd.clone().unwrap_or_else(dirs_home);

        let mut cmd = CommandBuilder::new(shell);
        cmd.cwd(&spawn_cwd);

        if !opts.command.is_empty() {
            let full_cmd = format!("{} {}", opts.command, opts.args.join(" "));
            if cfg!(windows) {
                let cd_prefix = opts
                    .cwd
                    .as_ref()
                    .map(|d| format!("Set-Location '{}'; ", d.replace('\'', "''")))
                    .unwrap_or_default();
                cmd = CommandBuilder::new("powershell");
                cmd.args(&[
                    "-NoLogo",
                    "-NoExit",
                    "-Command",
                    &format!("{}{}", cd_prefix, full_cmd),
                ]);
            } else {
                cmd = CommandBuilder::new("bash");
                cmd.args(&[
                    "-c",
                    &format!("cd \"{}\" && {}; exec $SHELL", spawn_cwd, full_cmd),
                ]);
            }
            cmd.cwd(&spawn_cwd);
        }

        let id = Uuid::new_v4().to_string();
        let label = opts.label.clone();

        let child = pair.slave.spawn_command(cmd)?;
        let writer = pair.master.take_writer()?;
        let reader = pair.master.try_clone_reader()?;

        // 后台线程：读取 PTY 输出并推送给前端
        let session_id = id.clone();
        let app_handle = app.clone();
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_handle.emit(
                            "session:data",
                            serde_json::json!({ "id": session_id, "data": data }),
                        );
                    }
                    Err(_) => break,
                }
            }
            let _ = app_handle.emit(
                "session:exit",
                serde_json::json!({ "id": session_id, "exitCode": 0 }),
            );
        });

        let session = Session {
            _master: pair.master,
            _child: child,
            writer,
            label,
            command: opts.command.clone(),
            cwd: opts.cwd.clone(),
        };

        {
            let mut sessions = self.sessions.lock().unwrap();
            sessions.insert(id.clone(), session);
        }

        Ok(SessionInfo {
            id,
            label: opts.label,
            command: opts.command,
            cwd: opts.cwd,
        })
    }

    /// 向会话写入数据
    pub fn write(&self, id: &str, data: &str) -> Result<bool> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(id) {
            session.writer.write_all(data.as_bytes())?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// 调整终端大小
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<bool> {
        let sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(id) {
            session._master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// 终止会话
    pub fn kill(&self, id: &str) -> Result<bool> {
        let mut sessions = self.sessions.lock().unwrap();
        // 从 map 移除后 Session 被 drop，_child drop 会终止进程
        if sessions.remove(id).is_some() {
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// 列出所有活跃会话
    pub fn list(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .iter()
            .map(|(id, s)| SessionInfo {
                id: id.clone(),
                label: s.label.clone(),
                command: s.command.clone(),
                cwd: s.cwd.clone(),
            })
            .collect()
    }
}

/// 检测系统 shell
fn detect_shell() -> String {
    if cfg!(windows) {
        which_exists("pwsh.exe")
            .then(|| "pwsh.exe".to_string())
            .unwrap_or_else(|| "powershell.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

/// 获取用户 home 目录
fn dirs_home() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string())
}

/// 检查命令是否在 PATH 中可用
fn which_exists(cmd: &str) -> bool {
    std::process::Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}
