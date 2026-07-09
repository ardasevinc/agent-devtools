#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { $ } from "bun";

$.throws(true);

type EntryKind = "collection" | "single" | "curated" | "local" | "local-adopted";

interface RuntimeConfig {
  root: string;
  source_cache: string;
  managed_by?: string;
}

interface ManifestEntry {
  name: string;
  kind: EntryKind;
  repo?: string;
  ref?: string;
  source_path?: string;
  runtime_path: string;
  include?: string[];
  exclude?: string[];
  note?: string;
  update_policy?: string;
  parts?: ManifestPart[];
}

interface ManifestPart {
  repo?: string;
  ref?: string;
  from: string;
  to: string;
  include?: string[];
  exclude?: string[];
}

interface Manifest {
  version: number;
  runtime: RuntimeConfig;
  defaults?: {
    include?: string[];
    exclude?: string[];
  };
  source: ManifestEntry[];
}

interface SkillLeaf {
  name: string;
  path: string;
  digest: string;
}

interface LockEntry {
  name: string;
  kind: EntryKind;
  repo?: string;
  ref?: string;
  resolved_commit?: string;
  runtime_path: string;
  source_tree_digest?: string;
  runtime_tree_digest: string;
  file_count: number;
  byte_count: number;
  skill_leaves: SkillLeaf[];
  note?: string;
}

interface Lockfile {
  version: number;
  generated_at: string;
  runtime_root: string;
  manifest_digest: string;
  entries: LockEntry[];
}

interface StagedEntry {
  entry: ManifestEntry;
  stagedRoot: string;
  resolvedCommit?: string;
  sourceDigest?: string;
  runtimeDigest: string;
  leaves: SkillLeaf[];
  fileCount: number;
  byteCount: number;
}

interface DiffSummary {
  added: string[];
  changed: string[];
  removed: string[];
}

const REPO_ROOT = resolve(import.meta.dir, "..");
const MANIFEST_PATH = join(REPO_ROOT, "lazy-skills.manifest.toml");
const LOCK_PATH = join(REPO_ROOT, "lazy-skills.lock.json");

const args = new Set(Bun.argv.slice(2));
const positional = Bun.argv.slice(2).filter((arg) => !arg.startsWith("--"));

function usage(): never {
  console.error(`usage:
  bun scripts/sync-lazy-skills.ts status
  bun scripts/sync-lazy-skills.ts adopt --all
  bun scripts/sync-lazy-skills.ts --dry-run --all
  bun scripts/sync-lazy-skills.ts --all
  bun scripts/sync-lazy-skills.ts --dry-run --only <name>`);
  process.exit(2);
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(): Promise<Manifest> {
  const text = await readFile(MANIFEST_PATH, "utf8");
  const parsed = Bun.TOML.parse(text) as unknown as Manifest;
  if (parsed.version !== 1) throw new Error("manifest version must be 1");
  if (!parsed.runtime?.root || !parsed.runtime?.source_cache) {
    throw new Error("manifest missing runtime.root or runtime.source_cache");
  }
  if (!Array.isArray(parsed.source)) throw new Error("manifest missing [[source]] entries");
  return parsed;
}

async function readLock(): Promise<Lockfile | null> {
  if (!(await pathExists(LOCK_PATH))) return null;
  return JSON.parse(await readFile(LOCK_PATH, "utf8")) as Lockfile;
}

function sha256(bytes: Bun.BlobPart): string {
  return `sha256:${createHash("sha256").update(bytes as string | Buffer).digest("hex")}`;
}

async function fileDigest(path: string): Promise<string> {
  return sha256(Buffer.from(await readFile(path)));
}

async function manifestDigest(): Promise<string> {
  return fileDigest(MANIFEST_PATH);
}

export function globToRegExp(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const next = pattern[i + 1];
    if (char === "*" && next === "*") {
      const after = pattern[i + 2];
      if (after === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
    } else if (char === "*") {
      out += "[^/]*";
    } else {
      out += char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
    }
  }
  out += "$";
  return new RegExp(out);
}

export function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split("\\").join("/");
      const info = await lstat(full);
      if (info.isSymbolicLink()) {
        const target = resolve(dirname(full), await readlink(full));
        const targetRel = relative(root, target);
        if (targetRel.startsWith("..") || resolve(root) === target) {
          throw new Error(`symlink escapes root: ${rel}`);
        }
        continue;
      }
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  }

  if (await pathExists(root)) await visit(root);
  return files.sort();
}

function assertInside(parent: string, child: string) {
  const rel = relative(parent, child);
  if (rel.startsWith("..") || rel === "" || rel.includes("..")) {
    if (resolve(parent) !== resolve(child)) {
      throw new Error(`path escapes root: ${child}`);
    }
  }
}

async function copySelectedFiles(
  sourceRoot: string,
  destRoot: string,
  include: string[],
  exclude: string[],
) {
  const sourceFiles = await walkFiles(sourceRoot);
  for (const rel of sourceFiles) {
    if (!matchesAny(rel, include)) continue;
    if (matchesAny(rel, exclude)) continue;
    if (rel.split("/").includes(".git")) throw new Error(`refusing .git file: ${rel}`);

    const from = join(sourceRoot, rel);
    const to = join(destRoot, rel);
    assertInside(destRoot, to);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    await chmod(to, 0o644);
  }
}

export async function treeDigest(root: string): Promise<{ digest: string; fileCount: number; byteCount: number }> {
  const files = await walkFiles(root);
  const hash = createHash("sha256");
  let byteCount = 0;
  for (const rel of files) {
    const full = join(root, rel);
    const data = await readFile(full);
    byteCount += data.byteLength;
    hash.update(rel);
    hash.update("\0");
    hash.update(data);
    hash.update("\0");
  }
  return {
    digest: `sha256:${hash.digest("hex")}`,
    fileCount: files.length,
    byteCount,
  };
}

async function skillLeaves(root: string, runtimePath: string): Promise<SkillLeaf[]> {
  const files = await walkFiles(root);
  const leaves: SkillLeaf[] = [];
  for (const rel of files.filter((file) => file.endsWith("SKILL.md"))) {
    const full = join(root, rel);
    const text = await readFile(full, "utf8");
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
    const nameMatch = frontmatter?.[1].match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
    leaves.push({
      name: (nameMatch?.[1] ?? basename(dirname(full))).trim(),
      path: `${runtimePath}/${rel}`.split("\\").join("/"),
      digest: await fileDigest(full),
    });
  }
  return leaves.sort((a, b) => a.path.localeCompare(b.path));
}

function repoCachePath(sourceCache: string, repo: string): string {
  const url = new URL(repo);
  const cleanPath = url.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
  return join(sourceCache, url.hostname, `${cleanPath}.git`);
}

async function ensureMirror(entry: ManifestEntry, sourceCache: string, offline: boolean): Promise<string> {
  if (!entry.repo) throw new Error(`${entry.name}: missing repo`);
  const mirror = repoCachePath(sourceCache, entry.repo);
  if (!(await pathExists(mirror))) {
    if (offline) throw new Error(`${entry.name}: source mirror missing in offline mode`);
    await mkdir(dirname(mirror), { recursive: true });
    await $`git clone --mirror ${entry.repo} ${mirror}`.quiet();
  } else if (!offline) {
    await $`git -C ${mirror} fetch --prune --tags`.quiet();
  }
  return mirror;
}

async function checkoutMirror(mirror: string, ref: string, tempRoot: string): Promise<{ root: string; commit: string }> {
  const commit = (await $`git -C ${mirror} rev-parse ${ref}^{commit}`.text()).trim();
  const checkoutRoot = join(tempRoot, "checkout");
  await $`git clone --no-checkout ${mirror} ${checkoutRoot}`.quiet();
  await $`git -C ${checkoutRoot} checkout --detach ${commit}`.quiet();
  return { root: checkoutRoot, commit };
}

async function stageEntry(
  manifest: Manifest,
  entry: ManifestEntry,
  runtimeRoot: string,
  sourceCache: string,
  offline: boolean,
): Promise<StagedEntry> {
  const tempRoot = await mkdtemp(join(tmpdir(), `lazy-skill-${entry.name}-`));
  const stagedRoot = join(tempRoot, "runtime", entry.runtime_path);
  await mkdir(stagedRoot, { recursive: true });

  const include = entry.include ?? manifest.defaults?.include ?? [];
  const exclude = entry.exclude ?? manifest.defaults?.exclude ?? [];
  let resolvedCommit: string | undefined;
  let sourceDigest: string | undefined;

  if (entry.parts?.length) {
    const commits: string[] = [];
    for (const part of entry.parts) {
      const partRepo = part.repo ?? entry.repo;
      const partRef = part.ref ?? entry.ref;
      if (!partRepo || !partRef) throw new Error(`${entry.name}: curated part missing repo/ref`);
      const mirror = await ensureMirror({ ...entry, repo: partRepo }, sourceCache, offline);
      const checkout = await checkoutMirror(mirror, partRef, await mkdtemp(join(tmpdir(), `lazy-skill-${entry.name}-part-`)));
      commits.push(`${partRepo}#${checkout.commit}`);
      const sourceRoot = join(checkout.root, part.from);
      if (!(await pathExists(sourceRoot))) throw new Error(`${entry.name}: curated part missing: ${part.from}`);
      const partDest = join(stagedRoot, part.to);
      await mkdir(partDest, { recursive: true });
      await copySelectedFiles(sourceRoot, partDest, part.include ?? include, part.exclude ?? exclude);
    }
    resolvedCommit = commits.join(",");
    sourceDigest = (await treeDigest(stagedRoot)).digest;
  } else if (entry.kind === "local-adopted") {
    const currentRoot = join(runtimeRoot, entry.runtime_path);
    if (!(await pathExists(currentRoot))) throw new Error(`${entry.name}: adopted runtime path missing`);
    await copySelectedFiles(currentRoot, stagedRoot, ["**"], []);
  } else if (entry.kind === "local") {
    if (!entry.source_path) throw new Error(`${entry.name}: local entry missing source_path`);
    await copySelectedFiles(join(REPO_ROOT, entry.source_path), stagedRoot, include, exclude);
  } else {
    if (!entry.repo || !entry.ref) throw new Error(`${entry.name}: remote entry missing repo/ref`);
    const mirror = await ensureMirror(entry, sourceCache, offline);
    const checkout = await checkoutMirror(mirror, entry.ref, tempRoot);
    resolvedCommit = checkout.commit;
    const sourceRoot = join(checkout.root, entry.source_path ?? ".");
    if (!(await pathExists(sourceRoot))) throw new Error(`${entry.name}: source_path not found: ${entry.source_path ?? "."}`);
    const selectedRoot = join(tempRoot, "selected-source");
    await mkdir(selectedRoot, { recursive: true });
    await copySelectedFiles(sourceRoot, selectedRoot, include, exclude);
    if (entry.source_path) {
      await copyRootBreadcrumbs(checkout.root, selectedRoot);
    }
    const sourceStats = await treeDigest(selectedRoot);
    sourceDigest = sourceStats.digest;
    await copySelectedFiles(selectedRoot, stagedRoot, ["**"], []);
  }

  await writeProvenance(stagedRoot, entry, resolvedCommit, sourceDigest);
  await validateEntry(entry, stagedRoot);
  const runtimeStats = await treeDigest(stagedRoot);
  const leaves = await skillLeaves(stagedRoot, entry.runtime_path);

  return {
    entry,
    stagedRoot,
    resolvedCommit,
    sourceDigest,
    runtimeDigest: runtimeStats.digest,
    leaves,
    fileCount: runtimeStats.fileCount,
    byteCount: runtimeStats.byteCount,
  };
}

async function copyRootBreadcrumbs(checkoutRoot: string, selectedRoot: string) {
  const readme = join(checkoutRoot, "README.md");
  const upstreamReadme = join(selectedRoot, "UPSTREAM-README.md");
  if ((await pathExists(readme)) && !(await pathExists(upstreamReadme))) {
    await copyFile(readme, upstreamReadme);
  }

  const entries = await readdir(checkoutRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith("LICENSE")) continue;
    const to = join(selectedRoot, entry.name);
    if (!(await pathExists(to))) await copyFile(join(checkoutRoot, entry.name), to);
  }
}

async function writeProvenance(
  stagedRoot: string,
  entry: ManifestEntry,
  resolvedCommit?: string,
  sourceDigest?: string,
) {
  const provenance = {
    managed_by: "agent-devtools.lazy-skills",
    name: entry.name,
    kind: entry.kind,
    repo: entry.repo,
    ref: entry.ref,
    resolved_commit: resolvedCommit,
    runtime_path: entry.runtime_path,
    source_path: entry.source_path,
    source_tree_digest: sourceDigest,
    note: entry.note,
  };
  await writeFile(join(stagedRoot, ".lazy-provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
}

async function validateEntry(entry: ManifestEntry, stagedRoot: string) {
  const files = await walkFiles(stagedRoot);
  if (files.some((file) => file.split("/").includes(".git"))) {
    throw new Error(`${entry.name}: staged output contains .git`);
  }
  const leaves = files.filter((file) => file.endsWith("SKILL.md"));
  if (leaves.length === 0) throw new Error(`${entry.name}: staged output contains zero SKILL.md leaves`);
  if (entry.kind === "single" && !files.includes("SKILL.md") && leaves.length < 1) {
    throw new Error(`${entry.name}: single entry has no SKILL.md`);
  }
}

async function lockEntryFromStage(stage: StagedEntry): Promise<LockEntry> {
  return {
    name: stage.entry.name,
    kind: stage.entry.kind,
    repo: stage.entry.repo,
    ref: stage.entry.ref,
    resolved_commit: stage.resolvedCommit,
    runtime_path: stage.entry.runtime_path,
    source_tree_digest: stage.sourceDigest,
    runtime_tree_digest: stage.runtimeDigest,
    file_count: stage.fileCount,
    byte_count: stage.byteCount,
    skill_leaves: stage.leaves,
    note: stage.entry.note,
  };
}

async function diffTrees(oldRoot: string, newRoot: string): Promise<DiffSummary> {
  const oldFiles = (await walkFiles(oldRoot)).filter((file) => file !== ".lazy-provenance.json");
  const newFiles = (await walkFiles(newRoot)).filter((file) => file !== ".lazy-provenance.json");
  const oldSet = new Set(oldFiles);
  const newSet = new Set(newFiles);
  const added = newFiles.filter((file) => !oldSet.has(file));
  const removed = oldFiles.filter((file) => !newSet.has(file));
  const changed: string[] = [];
  for (const file of newFiles) {
    if (!oldSet.has(file)) continue;
    const oldDigest = await fileDigest(join(oldRoot, file));
    const newDigest = await fileDigest(join(newRoot, file));
    if (oldDigest !== newDigest) changed.push(file);
  }
  return { added, changed, removed };
}

function shortDigest(digest?: string): string {
  return digest ? digest.replace("sha256:", "").slice(0, 12) : "none";
}

function shortCommit(commit?: string): string {
  return commit ? commit.slice(0, 7) : "adopted";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function currentRuntimeEntry(runtimeRoot: string, entry: ManifestEntry): Promise<LockEntry | null> {
  const root = join(runtimeRoot, entry.runtime_path);
  if (!(await pathExists(root))) return null;
  const stats = await treeDigest(root);
  return {
    name: entry.name,
    kind: entry.kind,
    repo: entry.repo,
    ref: entry.ref,
    runtime_path: entry.runtime_path,
    runtime_tree_digest: stats.digest,
    file_count: stats.fileCount,
    byte_count: stats.byteCount,
    skill_leaves: await skillLeaves(root, entry.runtime_path),
    note: entry.note,
  };
}

function selectedEntries(manifest: Manifest): ManifestEntry[] {
  const onlyIndex = Bun.argv.indexOf("--only");
  const only = onlyIndex >= 0 ? Bun.argv[onlyIndex + 1] : null;
  if (only) {
    const entry = manifest.source.find((item) => item.name === only);
    if (!entry) throw new Error(`unknown entry: ${only}`);
    return [entry];
  }
  if (args.has("--all")) return [...manifest.source].sort((a, b) => a.name.localeCompare(b.name));
  usage();
}

function stableLock(lock: Lockfile): Lockfile {
  return {
    ...lock,
    generated_at: "",
    entries: lock.entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({
        ...entry,
        skill_leaves: entry.skill_leaves.sort((a, b) => a.path.localeCompare(b.path)),
      })),
  };
}

async function writeLock(lock: Lockfile): Promise<boolean> {
  const sorted: Lockfile = {
    ...lock,
    entries: lock.entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({
        ...entry,
        skill_leaves: entry.skill_leaves.sort((a, b) => a.path.localeCompare(b.path)),
      })),
  };
  const current = await readLock();
  if (current && JSON.stringify(stableLock(current)) === JSON.stringify(stableLock(sorted))) {
    return false;
  }
  await writeFile(LOCK_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  return true;
}

async function commandStatus(manifest: Manifest, lock: Lockfile | null) {
  const runtimeRoot = expandHome(manifest.runtime.root);
  const sourceCache = expandHome(manifest.runtime.source_cache);
  const entries = [...manifest.source].sort((a, b) => a.name.localeCompare(b.name));
  const runtimeEntries = await Promise.all(entries.map((entry) => currentRuntimeEntry(runtimeRoot, entry)));
  const runtimeLeaves = runtimeEntries.reduce((sum, entry) => sum + (entry?.skill_leaves.length ?? 0), 0);
  const cachedSources = await Promise.all(
    entries
      .filter((entry) => entry.repo)
      .map(async (entry) => ((await pathExists(repoCachePath(sourceCache, entry.repo!))) ? 1 : 0)),
  );

  let dirtyRuntime = false;
  if (lock) {
    const lockByName = new Map(lock.entries.map((entry) => [entry.name, entry]));
    for (const runtimeEntry of runtimeEntries) {
      if (!runtimeEntry) {
        dirtyRuntime = true;
        continue;
      }
      const locked = lockByName.get(runtimeEntry.name);
      if (!locked || locked.runtime_tree_digest !== runtimeEntry.runtime_tree_digest) {
        dirtyRuntime = true;
      }
    }
  }

  console.log(`managed entries: ${entries.length}`);
  console.log(`runtime leaves: ${runtimeLeaves}`);
  console.log(`dirty runtime: ${lock ? (dirtyRuntime ? "yes" : "no") : "unknown (no lockfile)"}`);
  console.log(`sources cached: ${cachedSources.reduce((a, b) => a + b, 0)}/${cachedSources.length}`);
  console.log(`lock matches runtime: ${lock ? (dirtyRuntime ? "no" : "yes") : "no lockfile"}`);
}

async function commandAdopt(manifest: Manifest) {
  const runtimeRoot = expandHome(manifest.runtime.root);
  const entries = selectedEntries(manifest);
  const lockEntries: LockEntry[] = [];
  for (const entry of entries) {
    const current = await currentRuntimeEntry(runtimeRoot, entry);
    if (!current) throw new Error(`${entry.name}: runtime path missing`);
    lockEntries.push(current);
  }
  const wrote = await writeLock({
    version: 1,
    generated_at: new Date().toISOString(),
    runtime_root: manifest.runtime.root,
    manifest_digest: await manifestDigest(),
    entries: lockEntries,
  });
  console.log(`${wrote ? "adopted" : "already adopted"} ${lockEntries.length} runtime entries into ${relative(REPO_ROOT, LOCK_PATH)}`);
}

async function assertRuntimeClean(lock: Lockfile | null, runtimeRoot: string, entry: ManifestEntry, repair: boolean) {
  if (!lock || repair) return;
  const locked = lock.entries.find((item) => item.name === entry.name);
  if (!locked) return;
  const current = await currentRuntimeEntry(runtimeRoot, entry);
  if (!current) throw new Error(`${entry.name}: runtime path missing`);
  if (current.runtime_tree_digest !== locked.runtime_tree_digest) {
    throw new Error(
      `${entry.name}: runtime digest differs from lock (${shortDigest(locked.runtime_tree_digest)} -> ${shortDigest(current.runtime_tree_digest)}); use adopt/repair intentionally`,
    );
  }
}

async function replaceRuntimeEntry(runtimeRoot: string, stage: StagedEntry) {
  const target = join(runtimeRoot, stage.entry.runtime_path);
  const backup = `${target}.backup-${Date.now()}`;
  if (await pathExists(target)) await rename(target, backup);
  await mkdir(dirname(target), { recursive: true });
  await rename(stage.stagedRoot, target);
  if (await pathExists(backup)) await rm(backup, { recursive: true, force: true });
}

async function commandSync(manifest: Manifest, lock: Lockfile | null) {
  const runtimeRoot = expandHome(manifest.runtime.root);
  const sourceCache = expandHome(manifest.runtime.source_cache);
  const dryRun = args.has("--dry-run");
  const offline = args.has("--offline");
  const repair = args.has("--repair");
  const json = args.has("--json");
  const entries = selectedEntries(manifest);
  const oldLockByName = new Map((lock?.entries ?? []).map((entry) => [entry.name, entry]));
  const nextLockByName = new Map((lock?.entries ?? []).map((entry) => [entry.name, entry]));
  const report: unknown[] = [];
  let replaced = 0;

  for (const entry of entries) {
    await assertRuntimeClean(lock, runtimeRoot, entry, repair || dryRun);
    const stage = await stageEntry(manifest, entry, runtimeRoot, sourceCache, offline);
    const oldRuntimeRoot = join(runtimeRoot, entry.runtime_path);
    const diff = (await pathExists(oldRuntimeRoot))
      ? await diffTrees(oldRuntimeRoot, stage.stagedRoot)
      : { added: (await walkFiles(stage.stagedRoot)), changed: [], removed: [] };
    const old = oldLockByName.get(entry.name);
    const next = await lockEntryFromStage(stage);
    nextLockByName.set(entry.name, next);

    const item = {
      name: entry.name,
      kind: entry.kind,
      old_commit: old?.resolved_commit,
      new_commit: stage.resolvedCommit,
      old_skills: old?.skill_leaves.length,
      new_skills: stage.leaves.length,
      old_digest: old?.runtime_tree_digest,
      new_digest: stage.runtimeDigest,
      old_size: old?.byte_count,
      new_size: stage.byteCount,
      added: diff.added,
      changed: diff.changed,
      removed: diff.removed,
    };
    report.push(item);

    if (!json) {
      console.log(entry.name);
      console.log(`  commit: ${shortCommit(old?.resolved_commit)} -> ${shortCommit(stage.resolvedCommit)}`);
      console.log(`  skills: ${old?.skill_leaves.length ?? "unknown"} -> ${stage.leaves.length}`);
      console.log(`  digest: ${shortDigest(old?.runtime_tree_digest)} -> ${shortDigest(stage.runtimeDigest)}`);
      console.log(`  size: ${old?.byte_count ? formatBytes(old.byte_count) : "unknown"} -> ${formatBytes(stage.byteCount)}`);
      console.log(`  added: ${diff.added.length ? diff.added.slice(0, 8).join(", ") : "none"}`);
      console.log(`  changed: ${diff.changed.length ? diff.changed.slice(0, 8).join(", ") : "none"}`);
      console.log(`  removed: ${diff.removed.length ? diff.removed.slice(0, 8).join(", ") : "none"}`);
    }

    if (!dryRun) {
      const current = await currentRuntimeEntry(runtimeRoot, entry);
      if (current?.runtime_tree_digest !== stage.runtimeDigest) {
        await replaceRuntimeEntry(runtimeRoot, stage);
        replaced += 1;
      }
    }
  }

  if (json) console.log(JSON.stringify(report, null, 2));

  if (!dryRun) {
    const wrote = await writeLock({
      version: 1,
      generated_at: new Date().toISOString(),
      runtime_root: manifest.runtime.root,
      manifest_digest: await manifestDigest(),
      entries: [...nextLockByName.values()],
    });
    console.log(`updated ${replaced}/${entries.length} runtime entries; lockfile ${wrote ? "written" : "unchanged"}`);
  }
}

async function main() {
  const manifest = await readManifest();
  const lock = await readLock();
  const command = positional[0];

  if (command === "status") {
    await commandStatus(manifest, lock);
  } else if (command === "adopt") {
    await commandAdopt(manifest);
  } else if (args.has("--dry-run") || args.has("--all") || args.has("--only")) {
    await commandSync(manifest, lock);
  } else {
    usage();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
