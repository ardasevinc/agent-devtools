# Lazy Skills Sync Covenant

`~/.agents/lazy-skills/` is generated runtime output. Do not treat it as source
of truth, and do not put `.git` directories in it.

The source of truth lives in this repo:

- `lazy-skills.manifest.toml` is human-authored intent: source repositories,
  refs, runtime paths, and pruning rules.
- `lazy-skills.lock.json` is machine-authored reality: resolved commits,
  runtime tree hashes, and `SKILL.md` leaf inventory.
- `scripts/sync-lazy-skills.ts` is the only normal way to adopt, verify, or
  update the runtime store.

Git source mirrors live outside this repo at:

```text
~/.agents/lazy-skill-sources/
```

Runtime copies live at:

```text
~/.agents/lazy-skills/
```

## Commands

```bash
bun scripts/sync-lazy-skills.ts status
bun scripts/sync-lazy-skills.ts --dry-run --all
bun scripts/sync-lazy-skills.ts --dry-run --only hono
bun scripts/sync-lazy-skills.ts --all
```

Bootstrap or intentionally re-baseline the lock from the current runtime:

```bash
bun scripts/sync-lazy-skills.ts adopt --all
```

Use adoption carefully. It records current runtime bytes as truth, even when
the entry has incomplete provenance.

## Entry Kinds

- `collection`: many leaf skills, usually `skills/**/SKILL.md`.
- `single`: one primary skill.
- `local`: copied from this repo, usually `lazy-skills/<name>`.
- `local-adopted`: current runtime snapshot, frozen until provenance is mapped.
- `curated`: assembled from declared source parts. This should stay explicit.

## Safety Rules

- Runtime updates are staged, validated, then swapped.
- The lockfile is written last.
- `.git` is rejected in runtime output.
- Symlinks may not escape the staged/runtime root.
- Entries that produce zero `SKILL.md` leaves are rejected.
- If current runtime differs from the lock, sync refuses unless the operator
  intentionally adopts or repairs.

The short version: manifest chooses intent, lockfile records reality, runtime is
disposable output.
