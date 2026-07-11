use std::io::{self, Read};

use codex_home_guard::{Decision, HookInput, evaluate};

fn main() {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_err() {
        return;
    }

    let Ok(input) = serde_json::from_str::<HookInput>(&input) else {
        return;
    };

    if let Decision::Block(reason) = evaluate(&input) {
        let output = serde_json::json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        });
        println!("{output}");
    }
}
