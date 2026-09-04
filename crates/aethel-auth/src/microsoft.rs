use crate::storage::SecureStorage;
use aethel_core::{AppError, AppErrorCode};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::net::TcpListener;
use std::sync::Arc;

pub const DEFAULT_MINECRAFT_CLIENT_ID: &str = "00000000402b5328";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MicrosoftProfile {
    pub uuid: String,
    pub username: String,
    pub access_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MicrosoftToken {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

pub struct MicrosoftAuth {
    client: reqwest::Client,
    storage: Arc<SecureStorage>,
    client_id: String,
}

impl MicrosoftAuth {
    pub fn new(storage: Arc<SecureStorage>) -> Self {
        let client_id = std::env::var("AZURE_CLIENT_ID")
            .unwrap_or_else(|_| DEFAULT_MINECRAFT_CLIENT_ID.to_string());
        Self::with_client_id(storage, client_id)
    }

    pub fn with_client_id(storage: Arc<SecureStorage>, client_id: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::builder().build().unwrap_or_default(),
            storage,
            client_id: client_id.into(),
        }
    }

    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    pub fn extract_code_from_request(&self, request_line: &str) -> Result<String, AppError> {
        let parts: Vec<&str> = request_line.split_whitespace().collect();
        if parts.len() < 2 {
            return Err(AppError::new(
                AppErrorCode::AuthFailed,
                "Invalid HTTP request format in OAuth callback",
            ));
        }

        let path = parts[1];
        let query = path.split('?').nth(1).unwrap_or("");

        for param in query.split('&') {
            let mut kv = param.split('=');
            if let (Some(key), Some(value)) = (kv.next(), kv.next()) {
                if key == "code" {
                    let decoded = urlencoding::decode(value).map_err(|e| {
                        AppError::new(
                            AppErrorCode::AuthFailed,
                            format!("Failed to decode authorization code: {e}"),
                        )
                    })?;
                    return Ok(decoded.into_owned());
                }
            }
        }

        Err(AppError::new(
            AppErrorCode::AuthFailed,
            "Authorization code not found in callback URL",
        ))
    }

    pub async fn authenticate_via_browser(&self) -> Result<MicrosoftProfile, AppError> {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to bind loopback TCP server: {e}"),
            )
        })?;

        let port = listener
            .local_addr()
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::InternalError,
                    format!("Failed to get loopback server address: {e}"),
                )
            })?
            .port();

        let redirect_uri = format!("http://127.0.0.1:{port}");

        let auth_url = format!(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?\
            client_id={}&response_type=code&redirect_uri={}&scope=XboxLive.signin%20offline_access",
            self.client_id,
            urlencoding::encode(&redirect_uri)
        );

        let _ = open::that(&auth_url);

        let (stream, _) = listener.accept().map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to accept connection from browser: {e}"),
            )
        })?;

        let mut reader = std::io::BufReader::new(stream.try_clone().map_err(|e| {
            AppError::new(
                AppErrorCode::InternalError,
                format!("Failed to clone socket stream: {e}"),
            )
        })?);

        let mut request_line = String::new();
        std::io::BufRead::read_line(&mut reader, &mut request_line).map_err(|e| {
            AppError::new(
                AppErrorCode::NetworkError,
                format!("Failed to read HTTP request from callback: {e}"),
            )
        })?;

        let code = self.extract_code_from_request(&request_line)?;

        let response_html = "<!DOCTYPE html><html><body style='background:#09090b;color:#f4f4f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'><div style='text-align:center;'><h2>Aethel Launcher</h2><p>Authorization successful! You can close this tab and return to the launcher.</p></div></body></html>";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            response_html.len(),
            response_html
        );

        let mut writer = std::io::BufWriter::new(stream);
        let _ = std::io::Write::write_all(&mut writer, response.as_bytes());
        let _ = std::io::Write::flush(&mut writer);

        let ms_token = self
            .exchange_code_for_ms_token(&code, &redirect_uri)
            .await?;
        self.complete_auth_chain(ms_token).await
    }

    pub async fn exchange_code_for_ms_token(
        &self,
        code: &str,
        redirect_uri: &str,
    ) -> Result<MicrosoftToken, AppError> {
        #[derive(Deserialize)]
        struct TokenResp {
            access_token: String,
            refresh_token: String,
            expires_in: u64,
        }

        let params = [
            ("client_id", self.client_id.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("scope", "XboxLive.signin offline_access"),
        ];

        let res = self
            .client
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to contact Microsoft token endpoint: {e}"),
                )
            })?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::new(
                AppErrorCode::AuthFailed,
                format!("Microsoft OAuth token error {status}: {body}"),
            ));
        }

        let parsed: TokenResp = res.json().await.map_err(|e| {
            AppError::new(
                AppErrorCode::AuthFailed,
                format!("Failed to parse Microsoft token response: {e}"),
            )
        })?;

        Ok(MicrosoftToken {
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
            expires_in: parsed.expires_in,
        })
    }

    pub async fn initiate_device_code(&self) -> Result<DeviceCodeResponse, AppError> {
        #[derive(Deserialize)]
        struct DeviceResp {
            device_code: String,
            user_code: String,
            verification_uri: String,
            expires_in: u64,
            interval: u64,
        }

        let params = [
            ("client_id", self.client_id.as_str()),
            ("scope", "XboxLive.signin offline_access"),
        ];

        let res = self
            .client
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
            .form(&params)
            .send()
            .await
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to contact Microsoft devicecode endpoint: {e}"),
                )
            })?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::new(
                AppErrorCode::AuthFailed,
                format!("Device code request failed ({status}): {body}"),
            ));
        }

        let parsed: DeviceResp = res.json().await.map_err(|e| {
            AppError::new(
                AppErrorCode::AuthFailed,
                format!("Failed to parse device code response: {e}"),
            )
        })?;

        Ok(DeviceCodeResponse {
            device_code: parsed.device_code,
            user_code: parsed.user_code,
            verification_uri: parsed.verification_uri,
            expires_in: parsed.expires_in,
            interval: parsed.interval,
        })
    }

    pub async fn poll_device_code(&self, device_code: &str) -> Result<MicrosoftToken, AppError> {
        #[derive(Deserialize)]
        struct TokenResp {
            access_token: Option<String>,
            refresh_token: Option<String>,
            expires_in: Option<u64>,
            error: Option<String>,
        }

        let params = [
            ("client_id", self.client_id.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code),
        ];

        let res = self
            .client
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to poll token endpoint: {e}"),
                )
            })?;

        let parsed: TokenResp = res.json().await.map_err(|e| {
            AppError::new(
                AppErrorCode::AuthFailed,
                format!("Failed to parse token polling response: {e}"),
            )
        })?;

        if let Some(err) = parsed.error {
            return Err(AppError::new(
                AppErrorCode::AuthFailed,
                format!("Device authorization pending or failed: {err}"),
            ));
        }

        match (parsed.access_token, parsed.refresh_token, parsed.expires_in) {
            (Some(access), Some(refresh), Some(expires)) => Ok(MicrosoftToken {
                access_token: access,
                refresh_token: refresh,
                expires_in: expires,
            }),
            _ => Err(AppError::new(
                AppErrorCode::AuthFailed,
                "Incomplete token response from Microsoft",
            )),
        }
    }

    pub async fn refresh_token(&self, refresh_token: &str) -> Result<MicrosoftToken, AppError> {
        #[derive(Deserialize)]
        struct TokenResp {
            access_token: String,
            refresh_token: String,
            expires_in: u64,
        }

        let params = [
            ("client_id", self.client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("scope", "XboxLive.signin offline_access"),
        ];

        let res = self
            .client
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to contact token refresh endpoint: {e}"),
                )
            })?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::new(
                AppErrorCode::AuthFailed,
                format!("Token refresh failed ({status}): {body}"),
            ));
        }

        let parsed: TokenResp = res.json().await.map_err(|e| {
            AppError::new(
                AppErrorCode::AuthFailed,
                format!("Failed to parse token refresh response: {e}"),
            )
        })?;

        Ok(MicrosoftToken {
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
            expires_in: parsed.expires_in,
        })
    }

    pub async fn get_xbl_token(&self, ms_access_token: &str) -> Result<(String, String), AppError> {
        #[derive(Serialize)]
        struct XblReqProperties<'a> {
            #[serde(rename = "AuthMethod")]
            auth_method: &'a str,
            #[serde(rename = "SiteName")]
            site_name: &'a str,
            #[serde(rename = "RpsTicket")]
            rps_ticket: String,
        }

        #[derive(Serialize)]
        struct XblReq<'a> {
            #[serde(rename = "Properties")]
            properties: XblReqProperties<'a>,
            #[serde(rename = "RelyingParty")]
            relying_party: &'a str,
            #[serde(rename = "TokenType")]
            token_type: &'a str,
        }

        #[derive(Deserialize)]
        struct XuiClaim {
            uhs: String,
        }

        #[derive(Deserialize)]
        struct DisplayClaims {
            xui: Vec<XuiClaim>,
        }

        #[derive(Deserialize)]
        struct XblResp {
            #[serde(rename = "Token")]
            token: String,
            #[serde(rename = "DisplayClaims")]
            display_claims: DisplayClaims,
        }

        let req_body = XblReq {
            properties: XblReqProperties {
                auth_method: "RPS",
                site_name: "user.auth.xboxlive.com",
                rps_ticket: format!("d={ms_access_token}"),
            },
            relying_party: "http://auth.xboxlive.com",
            token_type: "JWT",
        };

        let res = self
            .client
            .post("https://user.auth.xboxlive.com/user/authenticate")
            .json(&req_body)
            .send()
            .await
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to contact Xbox Live authenticate endpoint: {e}"),
                )
            })?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::new(
                AppErrorCode::AuthFailed,
                format!("Xbox Live authentication failed ({status}): {body}"),
            ));
        }

        let parsed: XblResp = res.json().await.map_err(|e| {
            AppError::new(
                AppErrorCode::AuthFailed,
                format!("Failed to parse Xbox Live response: {e}"),
            )
        })?;

        let uhs = parsed
            .display_claims
            .xui
            .first()
            .map(|x| x.uhs.clone())
            .ok_or_else(|| {
                AppError::new(
                    AppErrorCode::AuthFailed,
                    "Xbox Live response missing user hash (uhs)",
                )
            })?;

        Ok((parsed.token, uhs))
    }

    pub async fn get_xsts_token(&self, xbl_token: &str) -> Result<(String, String), AppError> {
        #[derive(Serialize)]
        struct XstsProperties<'a> {
            #[serde(rename = "SandboxId")]
            sandbox_id: &'a str,
            #[serde(rename = "UserTokens")]
            user_tokens: Vec<&'a str>,
        }

        #[derive(Serialize)]
        struct XstsReq<'a> {
            #[serde(rename = "Properties")]
            properties: XstsProperties<'a>,
            #[serde(rename = "RelyingParty")]
            relying_party: &'a str,
            #[serde(rename = "TokenType")]
            token_type: &'a str,
        }

        #[derive(Deserialize)]
        struct XuiClaim {
            uhs: String,
        }

        #[derive(Deserialize)]
        struct DisplayClaims {
            xui: Vec<XuiClaim>,
        }

        #[derive(Deserialize)]
        struct XstsResp {
            #[serde(rename = "Token")]
            token: String,
            #[serde(rename = "DisplayClaims")]
            display_claims: DisplayClaims,
        }

        let req_body = XstsReq {
            properties: XstsProperties {
                sandbox_id: "RETAIL",
                user_tokens: vec![xbl_token],
            },
            relying_party: "rp://api.minecraftservices.com/",
            token_type: "JWT",
        };

        let res = self
            .client
            .post("https://xsts.auth.xboxlive.com/xsts/authorize")
            .json(&req_body)
            .send()
            .await
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to contact XSTS authorize endpoint: {e}"),
                )
            })?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::new(
                AppErrorCode::AuthFailed,
                format!("XSTS authorization failed ({status}): {body}"),
            ));
        }

        let parsed: XstsResp = res.json().await.map_err(|e| {
            AppError::new(
                AppErrorCode::AuthFailed,
                format!("Failed to parse XSTS response: {e}"),
            )
        })?;

        let uhs = parsed
            .display_claims
            .xui
            .first()
            .map(|x| x.uhs.clone())
            .ok_or_else(|| {
                AppError::new(
                    AppErrorCode::AuthFailed,
                    "XSTS response missing user hash (uhs)",
                )
            })?;

        Ok((parsed.token, uhs))
    }

    pub async fn get_minecraft_token(
        &self,
        xsts_token: &str,
        uhs: &str,
    ) -> Result<(String, u64), AppError> {
        #[derive(Serialize)]
        struct McAuthReq {
            #[serde(rename = "identityToken")]
            identity_token: String,
        }

        #[derive(Deserialize)]
        struct McAuthResp {
            access_token: String,
            expires_in: u64,
        }

        let req_body = McAuthReq {
            identity_token: format!("XBL3.0 x={uhs};{xsts_token}"),
        };

        let res = self
            .client
            .post("https://api.minecraftservices.com/authentication/login_with_xbox")
            .json(&req_body)
            .send()
            .await
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to contact Minecraft authentication endpoint: {e}"),
                )
            })?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::new(
                AppErrorCode::AuthFailed,
                format!("Minecraft authentication failed ({status}): {body}"),
            ));
        }

        let parsed: McAuthResp = res.json().await.map_err(|e| {
            AppError::new(
                AppErrorCode::AuthFailed,
                format!("Failed to parse Minecraft authentication response: {e}"),
            )
        })?;

        Ok((parsed.access_token, parsed.expires_in))
    }

    pub async fn get_minecraft_profile(
        &self,
        mc_token: &str,
    ) -> Result<MicrosoftProfile, AppError> {
        #[derive(Deserialize)]
        struct ProfileResp {
            id: String,
            name: String,
        }

        let res = self
            .client
            .get("https://api.minecraftservices.com/minecraft/profile")
            .header("Authorization", format!("Bearer {mc_token}"))
            .send()
            .await
            .map_err(|e| {
                AppError::new(
                    AppErrorCode::NetworkError,
                    format!("Failed to contact Minecraft profile endpoint: {e}"),
                )
            })?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(AppError::new(
                AppErrorCode::AuthFailed,
                format!("Failed to get Minecraft profile ({status}): {body}"),
            ));
        }

        let parsed: ProfileResp = res.json().await.map_err(|e| {
            AppError::new(
                AppErrorCode::AuthFailed,
                format!("Failed to parse Minecraft profile response: {e}"),
            )
        })?;

        Ok(MicrosoftProfile {
            uuid: parsed.id,
            username: parsed.name,
            access_token: mc_token.to_string(),
        })
    }

    pub async fn complete_auth_chain(
        &self,
        ms_token: MicrosoftToken,
    ) -> Result<MicrosoftProfile, AppError> {
        let (xbl_token, _) = self.get_xbl_token(&ms_token.access_token).await?;
        let (xsts_token, uhs) = self.get_xsts_token(&xbl_token).await?;
        let (mc_token, _) = self.get_minecraft_token(&xsts_token, &uhs).await?;
        let profile = self.get_minecraft_profile(&mc_token).await?;

        // Securely persist tokens in Keyring / AES-GCM fallback
        let key_prefix = format!("ms_{}", profile.uuid);
        let _ = self
            .storage
            .store_token(&format!("{key_prefix}_ms_token"), &ms_token.access_token);
        let _ = self.storage.store_token(
            &format!("{key_prefix}_refresh_token"),
            &ms_token.refresh_token,
        );
        let _ = self
            .storage
            .store_token(&format!("{key_prefix}_mc_token"), &mc_token);

        Ok(profile)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_extract_code_from_request() {
        let dir = tempdir().unwrap();
        let auth = MicrosoftAuth::new(Arc::new(SecureStorage::new(
            "aethel-test",
            dir.path().to_path_buf(),
        )));

        let request = "GET /?code=M.R3_BAY.123456789&state=xyz HTTP/1.1";
        let code = auth.extract_code_from_request(request).unwrap();
        assert_eq!(code, "M.R3_BAY.123456789");
    }

    #[test]
    fn test_extract_code_url_encoded() {
        let dir = tempdir().unwrap();
        let auth = MicrosoftAuth::new(Arc::new(SecureStorage::new(
            "aethel-test",
            dir.path().to_path_buf(),
        )));

        let request = "GET /?code=M.R3%20BAY.ABC%2B123&session=1 HTTP/1.1";
        let code = auth.extract_code_from_request(request).unwrap();
        assert_eq!(code, "M.R3 BAY.ABC+123");
    }

    #[test]
    fn test_invalid_callback_handling() {
        let dir = tempdir().unwrap();
        let auth = MicrosoftAuth::new(Arc::new(SecureStorage::new(
            "aethel-test",
            dir.path().to_path_buf(),
        )));

        let request_no_code =
            "GET /?error=access_denied&error_description=User%20cancelled HTTP/1.1";
        assert!(auth.extract_code_from_request(request_no_code).is_err());

        let malformed = "NOT_A_VALID_HTTP_REQUEST";
        assert!(auth.extract_code_from_request(malformed).is_err());
    }
}
