use std::env;
use std::path::{Component, Path, PathBuf};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct HookInput {
    pub cwd: PathBuf,
    pub tool_name: String,
    pub tool_input: ToolInput,
}

#[derive(Debug, Deserialize)]
pub struct ToolInput {
    pub command: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Block(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Word(String),
    Break,
}

pub fn evaluate(input: &HookInput) -> Decision {
    if input.tool_name != "Bash" {
        return Decision::Allow;
    }
    let Some(command) = input.tool_input.command.as_deref() else {
        return Decision::Allow;
    };
    let home = env::var_os("HOME").map(PathBuf::from);
    evaluate_command(command, &input.cwd, home.as_deref(), 0)
}

fn evaluate_command(command: &str, cwd: &Path, home: Option<&Path>, depth: u8) -> Decision {
    if depth > 2 {
        return Decision::Allow;
    }

    for segment in lex(command).split(|token| *token == Token::Break) {
        let words: Vec<&str> = segment
            .iter()
            .filter_map(|token| match token {
                Token::Word(word) => Some(word.as_str()),
                Token::Break => None,
            })
            .collect();
        if words.is_empty() {
            continue;
        }
        if let Some(decision) = inspect_segment(&words, cwd, home, depth) {
            return decision;
        }
    }
    Decision::Allow
}

fn inspect_segment(words: &[&str], cwd: &Path, home: Option<&Path>, depth: u8) -> Option<Decision> {
    let command_index = command_index(words)?;
    let program = basename(words[command_index]);
    let args = &words[command_index + 1..];

    if matches!(program, "sh" | "bash" | "zsh")
        && let Some(index) = args.iter().position(|arg| *arg == "-c")
        && let Some(nested) = args.get(index + 1)
    {
        let decision = evaluate_command(nested, cwd, home, depth + 1);
        if decision != Decision::Allow {
            return Some(decision);
        }
    }

    let targets: Vec<&str> = args
        .iter()
        .copied()
        .filter(|arg| !arg.starts_with('-'))
        .collect();
    let recursive = args.iter().any(|arg| {
        arg == &"--recursive"
            || (arg.starts_with('-')
                && !arg.starts_with("--")
                && (arg.contains('r') || arg.contains('R')))
    });
    let guarded = |target: &str, broad: bool| {
        classify_target(target, cwd, home, broad)
            .map(|reason| Decision::Block(format!("home-guard blocked {program}: {reason}")))
    };

    match program {
        "rm" => targets
            .iter()
            .find_map(|target| guarded(target, recursive || has_glob(target))),
        "rmdir" => targets.iter().find_map(|target| guarded(target, true)),
        "unlink" | "truncate" => targets.iter().find_map(|target| guarded(target, false)),
        "mv" => targets
            .first()
            .and_then(|target| guarded(target, recursive)),
        "chmod" | "chown" | "chgrp" if recursive => {
            targets.iter().find_map(|target| guarded(target, true))
        }
        "find" if args.contains(&"-delete") => args
            .iter()
            .take_while(|arg| !arg.starts_with('-'))
            .find_map(|target| guarded(target, true)),
        "rsync" if args.iter().any(|arg| arg.starts_with("--delete")) => {
            targets.last().and_then(|target| guarded(target, true))
        }
        "git" if args.first() == Some(&"clean") && dangerous_cwd(cwd, home) => Some(
            Decision::Block("home-guard blocked git clean from a protected directory".into()),
        ),
        "dd" => args.iter().find_map(|arg| {
            arg.strip_prefix("of=")
                .and_then(|target| guarded_device(target, program))
        }),
        name if name.starts_with("mkfs") => targets
            .iter()
            .find_map(|target| guarded_device(target, program)),
        "diskutil"
            if args.iter().any(|arg| {
                matches!(
                    *arg,
                    "eraseDisk" | "eraseVolume" | "partitionDisk" | "zeroDisk" | "secureErase"
                )
            }) =>
        {
            Some(Decision::Block(format!(
                "home-guard blocked destructive diskutil operation: {}",
                args.join(" ")
            )))
        }
        _ => None,
    }
}

fn command_index(words: &[&str]) -> Option<usize> {
    let mut index = 0;
    while index < words.len() {
        let word = basename(words[index]);
        if word == "sudo" {
            index += 1;
            while index < words.len() {
                let option = words[index];
                if matches!(
                    option,
                    "-u" | "--user"
                        | "-g"
                        | "--group"
                        | "-h"
                        | "--host"
                        | "-p"
                        | "--prompt"
                        | "-C"
                        | "--close-from"
                        | "-R"
                        | "--chroot"
                        | "-T"
                        | "--command-timeout"
                ) {
                    index += 2;
                } else if option.starts_with('-') {
                    index += 1;
                } else {
                    break;
                }
            }
            continue;
        }
        if word == "env" {
            index += 1;
            while index < words.len() {
                let option = words[index];
                if matches!(
                    option,
                    "-u" | "--unset" | "-C" | "--chdir" | "-S" | "--split-string"
                ) {
                    index += 2;
                } else if option.starts_with('-') || is_assignment(option) {
                    index += 1;
                } else {
                    break;
                }
            }
            continue;
        }
        if matches!(word, "command" | "builtin" | "nohup") {
            index += 1;
            while index < words.len() && words[index].starts_with('-') {
                index += 1;
            }
            continue;
        }
        if is_assignment(words[index]) {
            index += 1;
            continue;
        }
        return Some(index);
    }
    None
}

fn classify_target(target: &str, cwd: &Path, home: Option<&Path>, broad: bool) -> Option<String> {
    let expanded = expand_home(target, home);
    let globbed = has_glob(&expanded);
    let prefix = glob_prefix(&expanded);
    let path = normalize(if Path::new(prefix).is_absolute() {
        PathBuf::from(prefix)
    } else {
        cwd.join(prefix)
    });

    if path == Path::new("/") {
        return Some(format!("target {target:?} resolves to filesystem root"));
    }

    if let Some(home) = home.map(|path| normalize(path.to_path_buf())) {
        if path == home {
            return Some(format!("target {target:?} resolves to the user home"));
        }
        for credential_dir in [".ssh", ".gnupg", ".aws", ".kube"] {
            let protected = home.join(credential_dir);
            if path == protected || path.starts_with(&protected) {
                return Some(format!(
                    "target {target:?} is inside {}",
                    protected.display()
                ));
            }
        }
    }

    if (broad || globbed) && is_system_root(&path) {
        return Some(format!(
            "target {target:?} resolves to system root {}",
            path.display()
        ));
    }
    None
}

fn guarded_device(target: &str, program: &str) -> Option<Decision> {
    let target = target.trim_matches(['\'', '"']);
    if target.starts_with("/dev/disk")
        || target.starts_with("/dev/rdisk")
        || target.starts_with("/dev/sd")
        || target.starts_with("/dev/nvme")
    {
        Some(Decision::Block(format!(
            "home-guard blocked {program}: raw device target {target:?}"
        )))
    } else {
        None
    }
}

fn dangerous_cwd(cwd: &Path, home: Option<&Path>) -> bool {
    let cwd = normalize(cwd.to_path_buf());
    cwd == Path::new("/") || home.is_some_and(|home| cwd == normalize(home.to_path_buf()))
}

fn is_system_root(path: &Path) -> bool {
    [
        "/Applications",
        "/Library",
        "/System",
        "/Users",
        "/Volumes",
        "/bin",
        "/boot",
        "/dev",
        "/etc",
        "/home",
        "/opt",
        "/private",
        "/proc",
        "/root",
        "/run",
        "/sbin",
        "/srv",
        "/sys",
        "/usr",
        "/var",
    ]
    .iter()
    .any(|root| path == Path::new(root))
}

fn expand_home(target: &str, home: Option<&Path>) -> String {
    let Some(home) = home else {
        return target.to_owned();
    };
    let home = home.to_string_lossy();
    if target == "~" || target == "$HOME" || target == "${HOME}" {
        return home.into_owned();
    }
    for prefix in ["~/", "$HOME/", "${HOME}/"] {
        if let Some(rest) = target.strip_prefix(prefix) {
            return format!("{home}/{rest}");
        }
    }
    target.to_owned()
}

fn normalize(path: PathBuf) -> PathBuf {
    let absolute = path.is_absolute();
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    if normalized.as_os_str().is_empty() && absolute {
        PathBuf::from("/")
    } else {
        normalized
    }
}

fn glob_prefix(target: &str) -> &str {
    let index = target.find(['*', '?', '[', '{']).unwrap_or(target.len());
    let prefix = target[..index].trim_end_matches('/');
    if prefix.is_empty() && target.starts_with('/') {
        "/"
    } else {
        prefix
    }
}

fn has_glob(target: &str) -> bool {
    target.contains(['*', '?', '[', '{'])
}

fn basename(program: &str) -> &str {
    program.rsplit('/').next().unwrap_or(program)
}

fn is_assignment(word: &str) -> bool {
    word.split_once('=').is_some_and(|(name, _)| {
        !name.is_empty() && name.chars().all(|c| c == '_' || c.is_ascii_alphanumeric())
    })
}

fn lex(input: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut word = String::new();
    let mut chars = input.chars().peekable();
    let mut quote = None;

    let push_word = |tokens: &mut Vec<Token>, word: &mut String| {
        if !word.is_empty() {
            tokens.push(Token::Word(std::mem::take(word)));
        }
    };

    while let Some(ch) = chars.next() {
        if let Some(active) = quote {
            if ch == active {
                quote = None;
            } else if ch == '\\' && active == '"' {
                if let Some(next) = chars.next() {
                    word.push(next);
                }
            } else {
                word.push(ch);
            }
            continue;
        }

        match ch {
            '\'' | '"' => quote = Some(ch),
            '\\' => {
                if let Some(next) = chars.next() {
                    word.push(next);
                }
            }
            '#' if word.is_empty() => {
                while chars.next().is_some_and(|next| next != '\n') {}
                push_word(&mut tokens, &mut word);
                tokens.push(Token::Break);
            }
            ';' | '|' | '&' | '\n' => {
                push_word(&mut tokens, &mut word);
                while chars
                    .peek()
                    .is_some_and(|next| matches!(next, ';' | '|' | '&'))
                {
                    chars.next();
                }
                tokens.push(Token::Break);
            }
            c if c.is_whitespace() => push_word(&mut tokens, &mut word),
            _ => word.push(ch),
        }
    }
    push_word(&mut tokens, &mut word);
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexer_preserves_quoted_nested_commands() {
        assert_eq!(
            lex("sudo bash -c 'rm -rf /' && echo nope"),
            vec![
                Token::Word("sudo".into()),
                Token::Word("bash".into()),
                Token::Word("-c".into()),
                Token::Word("rm -rf /".into()),
                Token::Break,
                Token::Word("echo".into()),
                Token::Word("nope".into()),
            ]
        );
    }

    #[test]
    fn normalizes_parent_components() {
        assert_eq!(
            normalize(PathBuf::from("/Users/arda/project/../..")),
            PathBuf::from("/Users")
        );
    }
}
