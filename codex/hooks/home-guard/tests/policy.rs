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
    for command in [
        "rm -rf /",
        "rm -rf /*",
        "sudo rm --recursive --force /System",
        "sudo -u root rm -rf /",
        "command rm -r /Users",
        "env LC_ALL=C rm -rf /etc",
        "env -u TMPDIR rm -rf /var",
        "rm -rf ~",
        "rm -rf ~/",
        "rm -rf $HOME",
        "rm -rf ${HOME}/*",
        "rm -rf /Users/arda/project/../..",
        "bash -c 'rm -rf /'",
        "echo ok && sudo /bin/rm -rf /var",
        "rmdir /etc",
    ] {
        blocked(command);
    }
}

#[test]
fn blocks_credential_deletion() {
    for command in [
        "rm ~/.ssh/id_ed25519",
        "rm -rf $HOME/.gnupg",
        "unlink ~/.aws/credentials",
        "truncate -s 0 ~/.kube/config",
        "mv ~/.ssh /tmp/old-ssh",
    ] {
        blocked(command);
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
    ] {
        allowed(command);
    }
}

#[test]
fn blocks_git_clean_from_home_or_root() {
    assert!(matches!(check("git clean -fdx", "/"), Decision::Block(_)));
    let home = std::env::var("HOME").unwrap();
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
