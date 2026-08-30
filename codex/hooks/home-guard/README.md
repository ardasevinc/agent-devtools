# Codex Home Guard

A fast, deterministic Codex CLI `PreToolUse` hook that blocks catastrophic
filesystem commands before they run.

Home Guard is deliberately narrower than a shell security product. It acts as
a fuse for provably catastrophic commands while leaving explicit, scoped
filesystem work alone.

## What it blocks

- recursive or globbed deletion of `/`, the current user's home, or an ancestor
  of the current user's home
- recursive deletion of the exact `~/.ssh`, `~/.gnupg`, `~/.aws`, and `~/.kube`
  roots, while allowing scoped changes inside them
- broad destructive commands whose target uses unresolved shell indirection,
  such as `rm -rf "$TARGET"`; resolve the target to an explicit path and retry
- destructive `find`, recursive permission changes, and `rsync --delete`
  aimed at the same protected targets
- `git clean` when Codex is running directly from `/` or the user's home
- raw-disk writes through `dd`, `mkfs*`, and destructive macOS `diskutil`
  operations
- nested destructive commands passed through `sh -c`, `bash -c`, or
  `zsh -c`

Commands such as `rm -rf target`, `rm -rf /var`, `rm -rf "$HOME/project/dist"`,
`rm ~/.ssh/known_hosts`, `find . -name '*.tmp' -delete`, and `git clean -fdx`
inside an ordinary project remain allowed. The policy blocks ambiguous blast
radius, not force flags or privileged-looking paths.

## Install

### Prebuilt binary on macOS or Linux

```sh
curl --proto '=https' --tlsv1.2 -fsSL \
  https://raw.githubusercontent.com/ardasevinc/agent-devtools/main/codex/hooks/home-guard/install.sh |
  sh
```

The installer detects the host architecture, verifies the release checksum,
and writes `~/.local/bin/codex-home-guard`. Set
`CODEX_HOME_GUARD_INSTALL_DIR` to choose another directory or
`CODEX_HOME_GUARD_VERSION=v1.3.0` to pin a release.

### Build from source

```sh
git clone https://github.com/ardasevinc/agent-devtools.git
cd agent-devtools/codex/hooks/home-guard
cargo build --release --locked
install -m 0755 target/release/codex-home-guard ~/.local/bin/codex-home-guard
```

Windows release archives contain `codex-home-guard.exe`; install it somewhere
stable and use its absolute path in the hook's `commandWindows` field.

## Configure Codex

Create or merge `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/.local/bin/codex-home-guard",
            "commandWindows": "C:\\\\Users\\\\you\\\\.local\\\\bin\\\\codex-home-guard.exe",
            "timeout": 1,
            "statusMessage": "Checking catastrophic filesystem scope"
          }
        ]
      }
    ]
  }
}
```

Start Codex, run `/hooks`, inspect the exact command, and trust it. Codex
stores trust against the hook definition hash, so changed definitions require
review again.

## Development

```sh
cargo fmt --check
cargo test --locked
cargo clippy --all-targets --all-features -- -D warnings
```

The allow path produces no output. A denied command returns Codex's structured
`PreToolUse` denial shape with an exact reason.

## Limits

Home Guard is defense in depth, not a sandbox or complete enforcement boundary.
Codex currently intercepts supported Bash calls, file edits, and MCP tools
through `PreToolUse`, but not every possible execution path. Shell syntax is
also larger than this intentionally small parser: generated commands, arbitrary
language runtimes, custom deletion tools, aliases, and sufficiently indirect
shell expressions can evade recognition.

Keep Codex sandboxing and approval policy enabled where the consequences matter.
This hook is designed to catch obvious catastrophic mistakes cheaply, not to
make untrusted code safe.
