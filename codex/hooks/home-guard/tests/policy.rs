use std::path::PathBuf;

use codex_home_guard::{Decision, HookInput, ToolInput, evaluate};

fn check(command: &str, cwd: &str) -> Decision {
    evaluate(&HookInput {
        cwd: PathBuf::from(cwd),
        tool_name: "Bash".into(),
        tool_input: ToolInput {
            command: Some(command.into()),
        },
    })
}

fn blocked(command: &str) {
    assert!(
        matches!(check(command, "/Users/arda/project"), Decision::Block(_)),
        "expected command to be blocked: {command}"
    );
}

fn allowed(command: &str) {
    assert_eq!(
        check(command, "/Users/arda/project"),
        Decision::Allow,
        "expected command to be allowed: {command}"
    );
}

#[test]
fn blocks_catastrophic_rm_targets() {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap();
    let home_parent = PathBuf::from(&home).parent().unwrap().display().to_string();
    for command in [
        "rm -rf /".into(),
        "rm -rf /*".into(),
        "sudo -u root rm -rf /".into(),
        format!("command rm -r {home_parent}"),
        "rm -rf ~".into(),
        "rm -rf ~/".into(),
        "rm -rf $HOME".into(),
        "rm -rf ${HOME}/*".into(),
        format!("rm -rf {home}/project/../.."),
        "bash -c 'rm -rf /'".into(),
    ] {
        blocked(&command);
    }
}

#[test]
fn blocks_credential_roots_but_allows_scoped_changes() {
    for command in [
        "rm -rf ~/.ssh",
        "rm -rf $HOME/.gnupg/*",
        "find ~/.aws -delete",
    ] {
        blocked(command);
    }

    for command in [
        "rm ~/.ssh/id_ed25519",
        "rm -rf ~/.ssh/old-keys",
        "unlink ~/.aws/credentials",
        "truncate -s 0 ~/.kube/config",
        "mv ~/.ssh /tmp/old-ssh",
    ] {
        allowed(command);
    }
}

#[test]
fn blocks_unresolved_indirection_for_broad_operations() {
    for command in [
        "rm -rf $TARGET",
        "rm -rf ${TARGET}",
        "rm -rf ${HOME:?}",
        "rm -rf $(resolve-target)",
        "rm -rf `resolve-target`",
        "rm -rf ~another-user",
        "find $TARGET -delete",
        "rsync -a --delete empty/ $TARGET",
    ] {
        blocked(command);
    }

    for command in ["rm -f $TARGET", "mv $TARGET /tmp/old-target"] {
        allowed(command);
    }
}

#[test]
fn blocks_other_catastrophic_operators() {
    for command in [
        "find / -delete",
        "find $HOME -delete",
        "chmod -R 000 /",
        "chown --recursive root /Users",
        "rsync -a --delete empty/ /",
        "dd if=/dev/zero of=/dev/disk0",
        "mkfs.ext4 /dev/sda",
        "diskutil eraseDisk APFS Empty /dev/disk3",
    ] {
        blocked(command);
    }
}

#[test]
fn allows_normal_development_work() {
    for command in [
        "rm -rf target",
        "rm -rf ./dist",
        "rm package-lock.json",
        "find . -name '*.tmp' -delete",
        "chmod -R u+rw ./fixtures",
        "git clean -fdx",
        "rsync -a --delete src/ dist/",
        "echo 'rm -rf /'",
        "printf '%s' 'diskutil eraseDisk'",
        "rm ~/Downloads/old.zip",
        "rm -rf ~/.cache/my-tool",
        "rm -rf $HOME/project/dist",
        "rm -rf ${HOME}/project/build/*",
        "rm -rf /Applications",
        "rm -rf /Library",
        "rm -rf /System",
        "rm -rf /etc",
        "rm -rf /opt",
        "rm -rf /var",
        "rmdir /etc",
    ] {
        allowed(command);
    }
}

#[test]
fn blocks_git_clean_from_home_or_root() {
    assert!(matches!(check("git clean -fdx", "/"), Decision::Block(_)));
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap();
    assert!(matches!(check("git clean -fdx", &home), Decision::Block(_)));
}

#[test]
fn ignores_other_tools_and_missing_commands() {
    assert_eq!(
        evaluate(&HookInput {
            cwd: "/".into(),
            tool_name: "apply_patch".into(),
            tool_input: ToolInput {
                command: Some("rm -rf /".into()),
            },
        }),
        Decision::Allow
    );
}
