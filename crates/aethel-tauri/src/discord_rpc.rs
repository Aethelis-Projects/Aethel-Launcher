use discord_rpc_client::Client as DiscordClient;
use std::sync::mpsc::{self, Sender};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::debug;

pub const DEFAULT_DISCORD_APP_ID: u64 = 1545829310563360840;

#[derive(Debug, Clone)]
pub enum RpcMessage {
    SetInLauncher {
        locale: String,
    },
    SetPlayingGame {
        instance_name: String,
        version: String,
        loader: Option<String>,
        locale: String,
        start_time: u64,
    },
    Clear,
    SetEnabled(bool),
    Shutdown,
}

#[derive(Clone)]
pub struct DiscordRpcService {
    tx: Sender<RpcMessage>,
}

impl DiscordRpcService {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<RpcMessage>();

        thread::Builder::new()
            .name("aethel-discord-rpc".to_string())
            .spawn(move || {
                let mut client: Option<DiscordClient> = None;
                let mut is_enabled = false;
                let mut last_connect_attempt = std::time::Instant::now() - std::time::Duration::from_secs(60);
                let mut backoff_duration = std::time::Duration::from_secs(5);

                while let Ok(msg) = rx.recv() {
                    match msg {
                        RpcMessage::SetEnabled(enabled) => {
                            is_enabled = enabled;
                            debug!("Discord RPC SetEnabled: {enabled}");
                            if !enabled {
                                if let Some(ref mut c) = client {
                                    let _ = c.clear_activity();
                                }
                                client = None;
                            }
                        }
                        RpcMessage::Clear => {
                            if let Some(ref mut c) = client {
                                let _ = c.clear_activity();
                            }
                        }
                        RpcMessage::Shutdown => {
                            if let Some(ref mut c) = client {
                                let _ = c.clear_activity();
                            }
                            break;
                        }
                        RpcMessage::SetInLauncher { locale } => {
                            if !is_enabled {
                                continue;
                            }

                            if client.is_none() && last_connect_attempt.elapsed() >= backoff_duration {
                                last_connect_attempt = std::time::Instant::now();
                                let mut c = DiscordClient::new(DEFAULT_DISCORD_APP_ID);
                                c.start();
                                client = Some(c);
                            }

                            if let Some(ref mut c) = client {
                                let (state, details) = match locale.to_lowercase().as_str() {
                                    "ru" | "ru-ru" => ("В лаунчере", "Aethel Launcher"),
                                    _ => ("In Launcher", "Aethel Launcher"),
                                };
                                let res = c.set_activity(|act| {
                                    act.state(state)
                                        .details(details)
                                        .assets(|a| a.large_image("aethel_logo").large_text("Aethel Launcher"))
                                });
                                match res {
                                    Ok(_) => {
                                        backoff_duration = std::time::Duration::from_secs(5);
                                        debug!("Discord RPC activity set to InLauncher successfully");
                                    }
                                    Err(e) => {
                                        debug!("Discord RPC set_activity error (will retry with backoff): {e}");
                                        client = None;
                                        backoff_duration = (backoff_duration * 2).min(std::time::Duration::from_secs(30));
                                    }
                                }
                            }
                        }
                        RpcMessage::SetPlayingGame {
                            instance_name,
                            version,
                            loader,
                            locale,
                            start_time,
                        } => {
                            if !is_enabled {
                                continue;
                            }

                            if client.is_none() && last_connect_attempt.elapsed() >= backoff_duration {
                                last_connect_attempt = std::time::Instant::now();
                                let mut c = DiscordClient::new(DEFAULT_DISCORD_APP_ID);
                                c.start();
                                client = Some(c);
                            }

                            if let Some(ref mut c) = client {
                                let loader_str = loader.as_deref().unwrap_or("Vanilla");
                                let state = match locale.to_lowercase().as_str() {
                                    "ru" | "ru-ru" => {
                                        format!("Играет в Minecraft {version} ({loader_str})")
                                    }
                                    _ => format!("Playing Minecraft {version} ({loader_str})"),
                                };

                                let res = c.set_activity(|act| {
                                    act.state(&state)
                                        .details(&instance_name)
                                        .timestamps(|t| t.start(start_time))
                                        .assets(|a| a.large_image("aethel_logo").large_text("Aethel Launcher"))
                                });
                                match res {
                                    Ok(_) => {
                                        backoff_duration = std::time::Duration::from_secs(5);
                                        debug!("Discord RPC activity set to PlayingGame successfully: {state}");
                                    }
                                    Err(e) => {
                                        debug!("Discord RPC set_activity error (will retry with backoff): {e}");
                                        client = None;
                                        backoff_duration = (backoff_duration * 2).min(std::time::Duration::from_secs(30));
                                    }
                                }
                            }
                        }
                    }
                }
            })
            .expect("failed to spawn discord rpc thread");

        Self { tx }
    }

    pub fn set_enabled(&self, enabled: bool) {
        let _ = self.tx.send(RpcMessage::SetEnabled(enabled));
    }

    pub fn set_in_launcher(&self, locale: &str) {
        let _ = self.tx.send(RpcMessage::SetInLauncher {
            locale: locale.to_string(),
        });
    }

    pub fn set_playing_game(
        &self,
        instance_name: &str,
        version: &str,
        loader: Option<&str>,
        locale: &str,
    ) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = self.tx.send(RpcMessage::SetPlayingGame {
            instance_name: instance_name.to_string(),
            version: version.to_string(),
            loader: loader.map(|s| s.to_string()),
            locale: locale.to_string(),
            start_time: now,
        });
    }

    pub fn clear(&self) {
        let _ = self.tx.send(RpcMessage::Clear);
    }
}

impl Default for DiscordRpcService {
    fn default() -> Self {
        Self::new()
    }
}
