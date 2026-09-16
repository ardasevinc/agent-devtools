# Apple Xcode skills

Apple's own native-development skills, materialized from the locally selected
Xcode. Read [COMPATIBILITY.md](COMPATIBILITY.md) before a member: it records
verified corrections and differences between Xcode's agent and our harness.
Vendor files under `skills/` are unchanged; this README and compatibility note
are maintained by agent-devtools.

## Choose a member

Read only the relevant `skills/<name>/SKILL.md` and its needed references.

| Area | Members |
| --- | --- |
| SwiftUI | `swiftui-specialist`, `swiftui-whats-new-27`, `building-document-based-swiftui-applications` |
| UIKit | `uikit-app-modernization` |
| Accessibility | `accessibility-dynamic-type-specialist`, `accessibility-voiceover-specialist`, `accessibility-sufficient-contrast-specialist` |
| Localization | `translation-coordinator`, `translation` (includes locale guides) |
| App Intents | `app-intents-specialist`, `app-intents-whats-new-27` |
| Devices | `device-interaction` |
| Tests | `modernize-tests` |
| Security and C | `audit-xcode-security-settings`, `adopt-c-bounds-safety` |

This list describes Xcode 27 build 27A266a; inspect the installed `skills/`
directory and provenance after an update. Native skills inform Swift/SwiftUI/UIKit
work; they are not automatically React Native implementation guidance.

## Source and updates

From the agent-devtools checkout:

```sh
bun scripts/sync-lazy-skills.ts --dry-run --only apple-xcode
# Review changed vendor guidance and these compatibility notes, then:
bun scripts/sync-lazy-skills.ts --only apple-xcode
```

The adapter uses `xcrun agent plugin path --plugin-format codex`, which can
materialize files and may launch Xcode even during a dry-run. Dry-run leaves the
installed lazy collection and lockfile unchanged. This is a local Xcode export,
not a network skill download. Updating the lazy-skill loader with `bunx skills`
does not update this collection. Refresh after changing the selected Xcode or
installing an Xcode update. Check the build and content hashes, not the plugin's
generic `1.0.0` version alone.

No MCP registration or permission changes are performed by this collection.
Native tool workflows require a working Xcode MCP connection on that machine.
A copied collection on another host provides guidance, not Xcode capabilities.

When a changed collection replaces an existing one, the previous complete tree is
retained at `~/.agents/lazy-skill-sources/xcode/apple-xcode/previous`. A no-op or
dry-run does not rotate this snapshot. Restore a snapshot as a whole collection,
not an overlay that could leave newer files behind; reconcile lock provenance
with the restored content. There is no dedicated rollback command.

On hosts without usable Xcode, bulk `--all` updates skip this collection and
preserve its existing lock entry. Explicit `--only apple-xcode` fails with the
missing capability so an intended Apple refresh cannot silently succeed.
