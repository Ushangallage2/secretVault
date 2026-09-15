use crate::vault::{Entry, EntryType};
use chrono::Utc;
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDraft {
    #[serde(rename = "type")]
    pub entry_type: EntryType,
    pub title: String,
    pub username: String,
    pub password: String,
    pub body: String,
    pub url: String,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub source: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub drafts: Vec<ImportDraft>,
    pub secrets: usize,
    pub commands: usize,
    pub notes: usize,
    pub skipped: usize,
}

pub fn preview_paths(paths: &[String]) -> Result<ImportPreview, String> {
    let mut drafts = Vec::new();
    let mut skipped = 0usize;
    let mut seen = HashSet::new();

    for path in paths {
        let text = fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
        let source = Path::new(path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(path)
            .to_string();
        let (parsed, skip) = parse_text(&text, &source);
        skipped += skip;
        for d in parsed {
            let key = fingerprint(&d);
            if seen.insert(key) {
                drafts.push(d);
            } else {
                skipped += 1;
            }
        }
    }

    let secrets = drafts
        .iter()
        .filter(|d| d.entry_type == EntryType::Secret)
        .count();
    let commands = drafts
        .iter()
        .filter(|d| d.entry_type == EntryType::Command)
        .count();
    let notes = drafts
        .iter()
        .filter(|d| d.entry_type == EntryType::Note)
        .count();

    Ok(ImportPreview {
        drafts,
        secrets,
        commands,
        notes,
        skipped,
    })
}

fn fingerprint(d: &ImportDraft) -> String {
    format!(
        "{:?}|{}|{}|{}|{}",
        d.entry_type,
        d.title.to_lowercase(),
        d.username.to_lowercase(),
        d.password,
        d.body.chars().take(200).collect::<String>()
    )
}

pub fn parse_text(text: &str, source: &str) -> (Vec<ImportDraft>, usize) {
    let mut drafts = Vec::new();
    let mut skipped = 0usize;
    let normalized = text.replace("\r\n", "\n");

    // Structured sheet from cmds — keep whole postgres control block as note + extract secrets
    if source == "cmds" || normalized.contains("POSTGRESQL NATIVE SANDBOX CONTROL SHEET") {
        drafts.extend(parse_cmds_sheet(&normalized, source));
    }

    let blocks = split_blocks(&normalized);
    for block in blocks {
        let trimmed = block.trim();
        if trimmed.is_empty() || trimmed.chars().count() < 3 {
            skipped += 1;
            continue;
        }
        // Already handled as part of cmds sheet header
        if trimmed.contains("POSTGRESQL NATIVE SANDBOX CONTROL SHEET") {
            continue;
        }

        let extracted = extract_special(trimmed, source);
        if !extracted.is_empty() {
            drafts.extend(extracted);
            continue;
        }

        match classify_block(trimmed) {
            Some(d) => drafts.push(with_source(d, source)),
            None => skipped += 1,
        }
    }

    (drafts, skipped)
}

fn with_source(mut d: ImportDraft, source: &str) -> ImportDraft {
    if !d.tags.iter().any(|t| t == "imported") {
        d.tags.push("imported".into());
    }
    let src_tag = source
        .trim()
        .to_lowercase()
        .replace(' ', "-")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect::<String>();
    if !src_tag.is_empty() && !d.tags.iter().any(|t| t == &src_tag) {
        d.tags.push(src_tag);
    }
    d.source = source.to_string();
    d
}

fn split_blocks(text: &str) -> Vec<String> {
    let re = Regex::new(r"\n\s*\n+").unwrap();
    re.split(text)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn parse_cmds_sheet(text: &str, source: &str) -> Vec<ImportDraft> {
    let mut out = Vec::new();

    if let Some(end) = text.find("================\n\nVPN") {
        let sheet = text[..end].trim();
        if sheet.contains("POSTGRESQL NATIVE SANDBOX") {
            out.push(with_source(
                ImportDraft {
                    entry_type: EntryType::Note,
                    title: "PostgreSQL sandbox control sheet".into(),
                    username: String::new(),
                    password: String::new(),
                    body: sheet.to_string(),
                    url: String::new(),
                    tags: vec![
                        "postgres".into(),
                        "asdf".into(),
                        "env".into(),
                        "imported".into(),
                    ],
                    favorite: true,
                    source: source.into(),
                },
                source,
            ));
        }
    }

    // Explicit shortcut commands from the sheet
    for (title, body, tags) in [
        (
            "env-legacy",
            "env-legacy  -> Sets Java 8 + Tomcat 9 + Boots Postgres 9.6 (Port 5433)",
            vec!["env", "postgres", "java"],
        ),
        (
            "env-modern",
            "env-modern  -> Sets Java 21 + Tomcat 11 + Boots Postgres 16 (Port 5432)",
            vec!["env", "postgres", "java"],
        ),
        (
            "pg9",
            "pg9         -> Shuts down version 16, starts Postgres 9.6 on Port 5433",
            vec!["postgres", "shortcut"],
        ),
        (
            "pg16",
            "pg16        -> Shuts down version 9.6, starts Postgres 16 on Port 5432",
            vec!["postgres", "shortcut"],
        ),
        (
            "pg-stop",
            "pg-stop     -> Safely powers down all databases completely",
            vec!["postgres", "shortcut"],
        ),
    ] {
        if text.contains(title) {
            out.push(with_source(
                ImportDraft {
                    entry_type: EntryType::Command,
                    title: title.into(),
                    username: String::new(),
                    password: String::new(),
                    body: body.into(),
                    url: String::new(),
                    tags: tags.into_iter().map(String::from).collect(),
                    favorite: true,
                    source: source.into(),
                },
                source,
            ));
        }
    }

    // Fallback pg_ctl command lines found in the sheet
    for line in text.lines().map(str::trim) {
        if !line.contains("pg_ctl") {
            continue;
        }
        let title = if line.contains("start") && line.contains("16") {
            "Start Postgres 16"
        } else if line.contains("stop") && line.contains("16") {
            "Stop Postgres 16"
        } else if line.contains("start") && (line.contains("9.6") || line.contains("/v9")) {
            "Start Postgres 9.6"
        } else if line.contains("stop") && (line.contains("9.6") || line.contains("/v9")) {
            "Stop Postgres 9.6"
        } else if line.contains("start") {
            "Start Postgres"
        } else if line.contains("stop") {
            "Stop Postgres"
        } else {
            continue;
        };
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Command,
                title: title.into(),
                username: String::new(),
                password: String::new(),
                body: line.to_string(),
                url: String::new(),
                tags: vec!["postgres".into(), "fallback".into()],
                favorite: false,
                source: source.into(),
            },
            source,
        ));
    }

    // Local postgres connection params
    if text.contains("POSTGRESQL 16:") {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "PostgreSQL 16 local".into(),
                username: "postgres".into(),
                password: String::new(),
                body: "Host: localhost\nPort: 5432\nUsername: postgres\nPassword: (blank)".into(),
                url: "localhost:5432".into(),
                tags: vec!["postgres".into(), "local".into()],
                favorite: true,
                source: source.into(),
            },
            source,
        ));
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "PostgreSQL 9.6 local".into(),
                username: "postgres".into(),
                password: String::new(),
                body: "Host: localhost\nPort: 5433\nUsername: postgres\nPassword: (blank)".into(),
                url: "localhost:5433".into(),
                tags: vec!["postgres".into(), "local".into()],
                favorite: true,
                source: source.into(),
            },
            source,
        ));
    }

    out
}

fn extract_special(block: &str, source: &str) -> Vec<ImportDraft> {
    let mut out = Vec::new();
    let lower = block.to_lowercase();

    // Maven/XML connection properties → Secret
    if block.contains("<connection.username>") || block.contains("<connection.password>") {
        if let Some(d) = extract_connection_properties(block) {
            out.push(with_source(d, source));
            return out;
        }
    }

    // CREATE USER ... WITH PASSWORD
    let create_user = Regex::new(
        r#"(?i)CREATE\s+USER\s+(\S+)\s+WITH\s+PASSWORD\s+'([^']+)'"#,
    )
    .unwrap();
    for cap in create_user.captures_iter(block) {
        let user = cap[1].trim_matches('"').to_string();
        let pass = cap[2].to_string();
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: format!("DB user {user}"),
                username: user,
                password: pass,
                body: block.to_string(),
                url: String::new(),
                tags: vec!["postgres".into(), "db".into()],
                favorite: false,
                source: source.into(),
            },
            source,
        ));
    }
    if !out.is_empty() && create_user.is_match(block) {
        // Also keep SQL as command if it has more than just CREATE USER
        if block.lines().count() > 1
            || lower.contains("grant")
            || lower.contains("alter")
            || lower.contains("create database")
        {
            out.push(with_source(
                ImportDraft {
                    entry_type: EntryType::Command,
                    title: title_from_first_line(block, "SQL: create user"),
                    username: String::new(),
                    password: String::new(),
                    body: block.to_string(),
                    url: String::new(),
                    tags: vec!["postgres".into(), "sql".into()],
                    favorite: false,
                    source: source.into(),
                },
                source,
            ));
        }
        return out;
    }

    // Tomcat users XML
    let tomcat_user = Regex::new(
        r#"(?i)<user\s+password="([^"]+)"\s+roles="([^"]+)"\s+username="([^"]+)""#,
    )
    .unwrap();
    if let Some(cap) = tomcat_user.captures(block) {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "Tomcat manager user".into(),
                username: cap[3].to_string(),
                password: cap[1].to_string(),
                body: format!("roles: {}", &cap[2]),
                url: String::new(),
                tags: vec!["tomcat".into()],
                favorite: true,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // VPN block
    if lower.contains("vpn")
        && (lower.contains("username") || lower.contains("pass"))
        && block.lines().count() <= 12
    {
        let user = capture_labeled(block, &["Username", "username", "user"]);
        let pass = capture_labeled(block, &["Pass", "Password", "password", "pw"]);
        if user.is_some() || pass.is_some() {
            out.push(with_source(
                ImportDraft {
                    entry_type: EntryType::Secret,
                    title: "VPN".into(),
                    username: user.unwrap_or_default(),
                    password: pass.unwrap_or_default(),
                    body: block.to_string(),
                    url: String::new(),
                    tags: vec!["vpn".into()],
                    favorite: true,
                    source: source.into(),
                },
                source,
            ));
            return out;
        }
    }

    // foodserverpw = xxx / namepw = xxx
    let pw_assign = Regex::new(r"(?im)^([A-Za-z0-9_.-]*pw)\s*=\s*(\S+)\s*$").unwrap();
    if let Some(cap) = pw_assign.captures(block) {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: cap[1].to_string(),
                username: String::new(),
                password: cap[2].to_string(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["password".into()],
                favorite: false,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // email + pw- / pw =
    let email_pw = Regex::new(
        r"(?i)([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s+(?:pw-|pw\s*[:=-]\s*|password\s*[:=-]\s*)(\S+)",
    )
    .unwrap();
    if let Some(cap) = email_pw.captures(block) {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: format!("Email {}", &cap[1]),
                username: cap[1].to_string(),
                password: cap[2].to_string(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["email".into()],
                favorite: true,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // Username / Pass or Pw lines (tomcat manager style)
    if (lower.contains("username") || lower.contains("user"))
        && (lower.contains("pass") || lower.contains("pw -") || lower.contains("pw-"))
        && block.lines().count() <= 10
        && !looks_like_shell(block)
    {
        let user = capture_labeled(block, &["Username", "username", "User"])
            .or_else(|| {
                block.lines().find_map(|l| {
                    let t = l.trim();
                    if t.len() < 40
                        && !t.contains(' ')
                        && !t.contains(':')
                        && !t.contains('=')
                        && t.chars()
                            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
                        && !t.eq_ignore_ascii_case("vpn")
                        && !t.eq_ignore_ascii_case("pass")
                        && !t.eq_ignore_ascii_case("password")
                    {
                        return Some(t.to_string());
                    }
                    None
                })
            });
        let pass = capture_labeled(block, &["Pass", "Password", "password", "Pw", "pw"]);
        if let (Some(u), Some(p)) = (user.clone(), pass.clone()) {
            let title = if lower.contains("tomcat") || lower.contains("manager") {
                "Tomcat manager".into()
            } else if lower.contains("vpn") {
                "VPN".into()
            } else {
                format!("Login {u}")
            };
            out.push(with_source(
                ImportDraft {
                    entry_type: EntryType::Secret,
                    title,
                    username: u,
                    password: p,
                    body: block.to_string(),
                    url: String::new(),
                    tags: vec!["login".into()],
                    favorite: true,
                    source: source.into(),
                },
                source,
            ));
            return out;
        }
        if let Some(p) = pass {
            if lower.contains("vpn") || lower.contains("email pass") || block.contains("VPN PASS") {
                out.push(with_source(
                    ImportDraft {
                        entry_type: EntryType::Secret,
                        title: if lower.contains("vpn") {
                            "VPN password".into()
                        } else {
                            "Email / VPN related password".into()
                        },
                        username: user.unwrap_or_default(),
                        password: p,
                        body: block.to_string(),
                        url: String::new(),
                        tags: vec!["password".into()],
                        favorite: true,
                        source: source.into(),
                    },
                    source,
                ));
                return out;
            }
        }
    }

    // access token / github token
    let token_re = Regex::new(
        r"(?i)(?:access\s*token|acces\s*token|token)\s*[-:=]\s*([A-Za-z0-9._\-]+)",
    )
    .unwrap();
    if let Some(cap) = token_re.captures(block) {
        let tok = cap[1].to_string();
        if tok.len() >= 8 {
            let title = if tok.starts_with("ghp_") {
                "GitHub access token".into()
            } else {
                "Access token".into()
            };
            out.push(with_source(
                ImportDraft {
                    entry_type: EntryType::Secret,
                    title,
                    username: String::new(),
                    password: tok,
                    body: block.to_string(),
                    url: String::new(),
                    tags: vec!["token".into()],
                    favorite: true,
                    source: source.into(),
                },
                source,
            ));
            return out;
        }
    }
    if let Some(tok) = block.split_whitespace().find(|w| w.starts_with("ghp_")) {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "GitHub access token".into(),
                username: String::new(),
                password: tok.to_string(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["token".into(), "github".into()],
                favorite: true,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // JWT
    if let Some(jwt) = block.split_whitespace().find(|w| w.starts_with("eyJ") && w.len() > 40) {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "JWT token".into(),
                username: String::new(),
                password: jwt.trim_matches(|c| c == '"' || c == ',' || c == ':').to_string(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["token".into(), "jwt".into()],
                favorite: false,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // redis-cli -a password
    let redis_re = Regex::new(r"redis-cli\s+-a\s+(\S+)").unwrap();
    if let Some(cap) = redis_re.captures(block) {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "Redis password".into(),
                username: String::new(),
                password: cap[1].to_string(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["redis".into()],
                favorite: true,
                source: source.into(),
            },
            source,
        ));
        // also keep the ping command
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Command,
                title: "redis-cli ping".into(),
                username: String::new(),
                password: String::new(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["redis".into()],
                favorite: false,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // psql connection URI with password=
    let psql_uri = Regex::new(
        r#"(?i)psql\s+"(host=[^"]+password=([^"\s]+)[^"]*)""#,
    )
    .unwrap();
    if let Some(cap) = psql_uri.captures(block) {
        let pass = cap[2].to_string();
        let user = Regex::new(r"user=([^\s]+)")
            .unwrap()
            .captures(&cap[1])
            .map(|c| c[1].to_string())
            .unwrap_or_default();
        let host = Regex::new(r"host=([^\s]+)")
            .unwrap()
            .captures(&cap[1])
            .map(|c| c[1].to_string())
            .unwrap_or_default();
        let db = Regex::new(r"dbname=([^\s]+)")
            .unwrap()
            .captures(&cap[1])
            .map(|c| c[1].to_string())
            .unwrap_or_default();
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: format!("DB {db}@{host}"),
                username: user,
                password: pass,
                body: block.to_string(),
                url: host,
                tags: vec!["postgres".into(), "remote".into()],
                favorite: true,
                source: source.into(),
            },
            source,
        ));
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Command,
                title: format!("psql {db}"),
                username: String::new(),
                password: String::new(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["postgres".into(), "psql".into()],
                favorite: false,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // bcrypt hash
    if let Some(hash) = block
        .split_whitespace()
        .find(|w| w.starts_with("$2a$") || w.starts_with("$2b$") || w.starts_with("hash"))
    {
        if hash.starts_with("$2") {
            out.push(with_source(
                ImportDraft {
                    entry_type: EntryType::Secret,
                    title: "Bcrypt hash".into(),
                    username: String::new(),
                    password: hash.to_string(),
                    body: block.to_string(),
                    url: String::new(),
                    tags: vec!["hash".into()],
                    favorite: false,
                    source: source.into(),
                },
                source,
            ));
            return out;
        }
    }
    let hash_line = Regex::new(r"(?im)^hash\s*[-:=]\s*(\S+)").unwrap();
    if let Some(cap) = hash_line.captures(block) {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "Password hash".into(),
                username: String::new(),
                password: cap[1].to_string(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["hash".into()],
                favorite: false,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // recovery codes block
    if lower.contains("recovery codes") {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "Recovery codes".into(),
                username: String::new(),
                password: String::new(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["recovery".into(), "2fa".into()],
                favorite: true,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // Postgres system user password note
    if lower.contains("pw - postgres") || (lower.contains("postgres for postgres") && lower.contains("pw")) {
        let pass = capture_labeled(block, &["pw", "Pw", "password", "Password"])
            .unwrap_or_else(|| "Postgres".into());
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "PostgreSQL system user".into(),
                username: "postgres".into(),
                password: pass,
                body: block.to_string(),
                url: String::new(),
                tags: vec!["postgres".into()],
                favorite: true,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    // Long hex key / api-ish line
    let hex_pair = Regex::new(r"(?m)^([0-9a-fA-F]{20,}),([0-9a-fA-F]{20,})\s*$").unwrap();
    if let Some(cap) = hex_pair.captures(block) {
        out.push(with_source(
            ImportDraft {
                entry_type: EntryType::Secret,
                title: "Key pair".into(),
                username: cap[1].to_string(),
                password: cap[2].to_string(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["key".into()],
                favorite: false,
                source: source.into(),
            },
            source,
        ));
        return out;
    }

    out
}

fn extract_connection_properties(block: &str) -> Option<ImportDraft> {
    let user = xml_tag(block, "connection.username")?;
    let pass = xml_tag(block, "connection.password").unwrap_or_default();
    let url = xml_tag(block, "connection.url").unwrap_or_default();
    let war = xml_tag(block, "war.name").unwrap_or_default();
    let title = if !war.is_empty() {
        format!("DB {war} ({user})")
    } else if !url.is_empty() {
        let db = url.rsplit('/').next().unwrap_or("db");
        format!("DB {db}")
    } else {
        format!("DB user {user}")
    };
    let mut tags = vec!["db".into(), "postgres".into(), "maven".into()];
    if !war.is_empty() {
        tags.push(war.to_lowercase());
    }
    Some(ImportDraft {
        entry_type: EntryType::Secret,
        title,
        username: user,
        password: pass,
        body: block.to_string(),
        url,
        tags,
        favorite: true,
        source: String::new(),
    })
}

fn xml_tag(block: &str, name: &str) -> Option<String> {
    let re = Regex::new(&format!(r"(?s)<{name}>\s*([^<]+?)\s*</{name}>")).ok()?;
    re.captures(block).map(|c| c[1].trim().to_string())
}

fn capture_labeled(block: &str, labels: &[&str]) -> Option<String> {
    for line in block.lines() {
        let t = line.trim();
        for label in labels {
            let patterns = [
                format!("{label} :"),
                format!("{label}:"),
                format!("{label} -"),
                format!("{label}-"),
                format!("{label} ="),
                format!("{label}="),
            ];
            for p in patterns {
                if let Some(rest) = t.strip_prefix(&p) {
                    let v = rest.trim().trim_matches(|c| c == '\'' || c == '"');
                    if !v.is_empty() {
                        return Some(v.to_string());
                    }
                }
                // case-insensitive starts
                if t.to_lowercase().starts_with(&p.to_lowercase()) {
                    let v = t[p.len()..].trim().trim_matches(|c| c == '\'' || c == '"');
                    if !v.is_empty() {
                        return Some(v.to_string());
                    }
                }
            }
        }
    }
    // inline "pw-VALUE"
    let re = Regex::new(r"(?i)\bpw-(\S+)").unwrap();
    if let Some(cap) = re.captures(block) {
        return Some(cap[1].to_string());
    }
    None
}

fn classify_block(block: &str) -> Option<ImportDraft> {
    let lower = block.to_lowercase();
    let first = block.lines().next().unwrap_or("").trim();

    // Skip pure noise
    if block.chars().all(|c| c == '=' || c == '-' || c.is_whitespace()) {
        return None;
    }

    // Large Java method → note
    if block.contains("public String") || block.contains("SimpleDateFormat") || block.contains("ArrayList<") {
        if block.lines().count() > 15 {
            return Some(ImportDraft {
                entry_type: EntryType::Note,
                title: title_from_first_line(block, "Java code snippet"),
                username: String::new(),
                password: String::new(),
                body: block.to_string(),
                url: String::new(),
                tags: vec!["java".into(), "code".into()],
                favorite: false,
                source: String::new(),
            });
        }
    }

    if looks_like_shell(block) || looks_like_sql(block) {
        let tags = infer_command_tags(block);
        return Some(ImportDraft {
            entry_type: EntryType::Command,
            title: title_from_command(block),
            username: String::new(),
            password: String::new(),
            body: block.to_string(),
            url: String::new(),
            tags,
            favorite: false,
            source: String::new(),
        });
    }

    // zshrc / profile chunks
    if lower.contains("export ") || lower.contains("alias ") || lower.contains("() {") {
        return Some(ImportDraft {
            entry_type: EntryType::Command,
            title: title_from_first_line(block, "Shell config"),
            username: String::new(),
            password: String::new(),
            body: block.to_string(),
            url: String::new(),
            tags: vec!["shell".into(), "zshrc".into()],
            favorite: false,
            source: String::new(),
        });
    }

    // URLs only
    if (first.starts_with("http://") || first.starts_with("https://")) && block.lines().count() <= 3 {
        return Some(ImportDraft {
            entry_type: EntryType::Note,
            title: format!("URL {}", truncate(first, 40)),
            username: String::new(),
            password: String::new(),
            body: block.to_string(),
            url: first.to_string(),
            tags: vec!["url".into()],
            favorite: false,
            source: String::new(),
        });
    }

    // Process / how-to notes
    if lower.contains("steps") || lower.contains("solution") || first.ends_with(':') || block.lines().count() >= 3 {
        // Avoid treating tiny labels as notes
        if block.chars().count() < 12 {
            return None;
        }
        return Some(ImportDraft {
            entry_type: EntryType::Note,
            title: title_from_first_line(block, "Note"),
            username: String::new(),
            password: String::new(),
            body: block.to_string(),
            url: String::new(),
            tags: vec!["note".into()],
            favorite: false,
            source: String::new(),
        });
    }

    // Short leftover labels like "grandseiko" / "worldbalance" → note bookmark
    if block.lines().count() == 1 && first.len() < 40 && !first.contains(' ') {
        return Some(ImportDraft {
            entry_type: EntryType::Note,
            title: first.to_string(),
            username: String::new(),
            password: String::new(),
            body: first.to_string(),
            url: String::new(),
            tags: vec!["label".into()],
            favorite: false,
            source: String::new(),
        });
    }

    None
}

fn looks_like_shell(block: &str) -> bool {
    let first = block.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let starters = [
        "curl", "mvn", "git", "psql", "cp ", "cp\t", "tail", "export ", "alias ", "brew",
        "redis", "open ", "pkill", "jar ", "sdk ", "unalias", "java8", "java21", "mvn36",
        "mvn39", "psql96", "psql16", "tomcat", "pg_ctl", "pg9", "pg16", "env-", "./",
        "sh ", "source ", "cd ", "npm ", "cargo ", "for ", "while ", "if ", "cat ", "echo ",
        "kill", "lsof", "chmod", "mkdir", "rm ", "scp ", "ssh ", "docker", "kubectl",
    ];
    let lower = first.to_lowercase();
    starters.iter().any(|s| lower.starts_with(s) || lower.contains(&format!(" {s}")))
        || first.starts_with('/') && (first.contains("pg_ctl") || first.contains(".sh"))
        || block.contains("curl ")
        || block.contains("mvn ")
}

fn looks_like_sql(block: &str) -> bool {
    let upper = block.trim_start().to_uppercase();
    upper.starts_with("SELECT ")
        || upper.starts_with("INSERT ")
        || upper.starts_with("UPDATE ")
        || upper.starts_with("DELETE ")
        || upper.starts_with("ALTER ")
        || upper.starts_with("CREATE ")
        || upper.starts_with("DROP ")
        || upper.starts_with("GRANT ")
        || upper.starts_with("--")
        || upper.starts_with("POSTGRES=#")
}

fn infer_command_tags(block: &str) -> Vec<String> {
    let lower = block.to_lowercase();
    let mut tags = Vec::new();
    let pairs = [
        ("curl", "curl"),
        ("mvn", "maven"),
        ("git", "git"),
        ("psql", "postgres"),
        ("postgres", "postgres"),
        ("tomcat", "tomcat"),
        ("redis", "redis"),
        ("tail", "logs"),
        ("brew", "brew"),
        ("sdk", "sdkman"),
        ("java", "java"),
        ("docker", "docker"),
        ("create ", "sql"),
        ("select ", "sql"),
        ("alter ", "sql"),
        ("insert ", "sql"),
        ("export ", "shell"),
        ("alias ", "shell"),
    ];
    for (needle, tag) in pairs {
        if lower.contains(needle) && !tags.iter().any(|t| t == tag) {
            tags.push(tag.into());
        }
    }
    if tags.is_empty() {
        tags.push("cmd".into());
    }
    tags
}

fn title_from_command(block: &str) -> String {
    let first = block
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('#'))
        .unwrap_or("Command");
    if first.to_lowercase().starts_with("curl") {
        // try path segment from URL
        let re = Regex::new(r#"https?://[^\s'"]+/([A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+){0,4})"#).unwrap();
        if let Some(cap) = re.captures(first) {
            return format!("curl {}", truncate(&cap[1], 50));
        }
        return "curl request".into();
    }
    if first.to_lowercase().starts_with("mvn") {
        return truncate(first, 60);
    }
    if first.to_uppercase().starts_with("SELECT") {
        return format!("SQL: {}", truncate(first, 50));
    }
    if first.to_uppercase().starts_with("CREATE")
        || first.to_uppercase().starts_with("ALTER")
        || first.to_uppercase().starts_with("DROP")
        || first.to_uppercase().starts_with("INSERT")
        || first.to_uppercase().starts_with("GRANT")
    {
        return format!("SQL: {}", truncate(first, 50));
    }
    truncate(first, 60)
}

fn title_from_first_line(block: &str, fallback: &str) -> String {
    let first = block
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.chars().all(|c| c == '=' || c == '-'))
        .unwrap_or(fallback);
    let cleaned = first.trim_start_matches(['#', '-', '*', ' ']);
    truncate(cleaned, 60)
}

fn truncate(s: &str, max: usize) -> String {
    let mut t = s.chars().take(max).collect::<String>();
    if s.chars().count() > max {
        t.push('…');
    }
    t
}

pub fn drafts_to_entries(drafts: Vec<ImportDraft>) -> Vec<Entry> {
    let now = Utc::now();
    drafts
        .into_iter()
        .map(|d| Entry {
            id: Uuid::new_v4().to_string(),
            entry_type: d.entry_type,
            title: d.title,
            username: d.username,
            password: d.password,
            body: d.body,
            url: d.url,
            tags: d.tags,
            favorite: d.favorite,
            file_name: String::new(),
            mime_type: String::new(),
            file_content: String::new(),
            byte_size: 0,
            created_at: now,
            updated_at: now,
            last_used_at: None,
            deleted_at: None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_foodserver_pw() {
        let (d, _) = parse_text("foodserverpw = secret123\n", "t");
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].entry_type, EntryType::Secret);
        assert_eq!(d[0].password, "secret123");
    }

    #[test]
    fn classifies_curl_as_command() {
        let (d, _) = parse_text("curl --location 'http://127.0.0.1:8080/x'\n", "t");
        assert!(!d.is_empty());
        assert_eq!(d[0].entry_type, EntryType::Command);
    }

    #[test]
    fn smoke_preview_known_files() {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        let paths = [
            format!("{home}/Downloads/message.txt"),
            format!("{home}/Documents/important commands/cmds"),
        ];
        let existing: Vec<String> = paths
            .into_iter()
            .filter(|p| Path::new(p).exists())
            .collect();
        if existing.is_empty() {
            return;
        }
        let preview = preview_paths(&existing).expect("preview");
        assert!(preview.secrets > 0, "expected secrets");
        assert!(preview.commands > 0, "expected commands");
        assert!(
            preview.drafts.len() > 10,
            "expected a useful number of drafts, got {}",
            preview.drafts.len()
        );
        eprintln!(
            "import smoke: {} secrets, {} commands, {} notes, {} skipped",
            preview.secrets, preview.commands, preview.notes, preview.skipped
        );
    }
}
