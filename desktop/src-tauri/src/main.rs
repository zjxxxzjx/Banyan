use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

struct SidecarChild(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

// 让操作系统分配空闲端口，避免与开发模式的服务冲突
fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("无法绑定本地端口")
        .local_addr()
        .unwrap()
        .port()
}

fn wait_ready(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}").parse().unwrap();
    for _ in 0..100 {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let port = free_port();
            let resource_dir = app.path().resource_dir()?;
            let server_js = resource_dir.join("server.js");

            let (mut rx, child) = app
                .shell()
                .sidecar("node")?
                .args([server_js.to_string_lossy().to_string()])
                .env("PORT", port.to_string())
                .spawn()?;

            if !wait_ready(port) {
                eprintln!("Banyan 后端未能在端口 {port} 启动");
                app.handle().exit(1);
                return Ok(());
            }

            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External(format!("http://127.0.0.1:{port}").parse()?),
            )
            .title("Banyan · Git 客户端")
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            // inset 语义：灯位 = 默认位 + inset；实测 inset 15.5 时灯顶 7pt，14pt 灯径居中于 28px 灯条
            .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition::new(14.0, 15.5)))
            .inner_size(1280.0, 820.0)
            .min_inner_size(960.0, 600.0)
            .build()?;

            app.manage(SidecarChild(Mutex::new(Some(child))));
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Terminated(payload) = event {
                        eprintln!("Banyan 后端进程退出: {:?}", payload.code);
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("构建 Tauri 应用失败")
        .run(|app, event| {
            // 应用退出时务必带走 sidecar，避免残留 node 进程
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                if let Some(state) = app.try_state::<SidecarChild>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}