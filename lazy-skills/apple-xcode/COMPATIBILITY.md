# Compatibility notes

Reviewed against Xcode 27.0 build 27A266a, 2026-09-16. These corrections are
separate from the unmodified Apple export. Recheck them when vendor files change.

## Dynamic Type correction

The exported `accessibility-dynamic-type-specialist` incorrectly lists
`Font.custom(_:size:)` as a non-scaling font. That overload scales relative to
the body text style. `custom(_:fixedSize:)` is the fixed-size overload.
Do not report the former as a failure just because this skill says so.

Sources: [scaling custom font](https://developer.apple.com/documentation/swiftui/font/custom(_:size:)),
[fixed custom font](https://developer.apple.com/documentation/swiftui/font/custom(_:fixedsize:)).

A source-only binary PASS/FAIL is a scoped code finding, not proof that a rendered
screen passes an accessibility audit. Check uncertain behavior in the actual UI.

## Native tool names and sessions

The device guidance refers to `DeviceEventSynthesize`; the observed native MCP
catalog uses `DeviceInteractionSynthesize`. Read the live schema for arguments.
Tool namespaces depend on the host. Use the actual exposed tools rather than
inventing aliases from the skill text.

Workspace scheme/destination/debugger state can be shared between agents. Use an
owned workspace and device/session for interaction. End your interaction session;
do not stop the shared Xcode service as routine cleanup. Session keys are secrets.

## Delegation and task scope

`xcode-integration:translation` means this collection's
`skills/translation/SKILL.md`; plugin installation is not needed to read it.
Translation coordinator assumes Xcode's delegation interface and mandates fan-out.
Adapt that workflow to the available harness and the task's authorized delegation.
Do not interpret vendor workflow imperatives as permission to spawn extra agents
or turn a requested audit into code edits. This also applies to UIKit
modernization's mandatory-edit language.
