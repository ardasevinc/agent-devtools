import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import {
  matchesAny,
  replaceRuntimeEntry,
  stageXcodeSource,
  treeDigest,
  xcodeUnavailableReason,
} from "./sync-lazy-skills";

const tempRoots: string[] = [];

async function tempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lazy-skills-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("glob matching supports recursive skill paths", () => {
  expect(matchesAny("skills/foo/SKILL.md", ["skills/**/SKILL.md"])).toBe(true);
  expect(matchesAny("skills/foo/references/bar.md", ["skills/**/references/**"])).toBe(true);
  expect(matchesAny("plugins/a/skills/foo/SKILL.md", ["plugins/**/skills/**/SKILL.md"])).toBe(true);
  expect(matchesAny("node_modules/pkg/SKILL.md", ["skills/**/SKILL.md"])).toBe(false);
});

test("tree digest is stable across file creation order", async () => {
  const a = await tempDir();
  const b = await tempDir();

  await mkdir(join(a, "one"), { recursive: true });
  await writeFile(join(a, "one", "A.md"), "a\n");
  await writeFile(join(a, "B.md"), "b\n");

  await writeFile(join(b, "B.md"), "b\n");
  await mkdir(join(b, "one"), { recursive: true });
  await writeFile(join(b, "one", "A.md"), "a\n");

  expect(await treeDigest(a)).toEqual(await treeDigest(b));
});

test("tree digest changes when file content changes", async () => {
  const root = await tempDir();
  await writeFile(join(root, "SKILL.md"), "one\n");
  const before = await treeDigest(root);
  await writeFile(join(root, "SKILL.md"), "two\n");
  const after = await treeDigest(root);
  expect(after.digest).not.toBe(before.digest);
});

test("Xcode source staging preserves the complete skills subtree and adds a root overlay", async () => {
  const root = await tempDir();
  const exported = join(root, "exported");
  const staged = join(root, "staged");
  await mkdir(join(exported, "skills", "one", "references"), { recursive: true });
  await writeFile(join(exported, "skills", "one", "SKILL.md"), "---\nname: one\n---\n");
  await writeFile(join(exported, "skills", "one", "references", "guide.md"), "support\n");
  await mkdir(join(root, "overlay"));
  await writeFile(join(root, "overlay", "README.md"), "local context\n");

  const calls: string[] = [];
  const result = await stageXcodeSource(
    { name: "apple-xcode", kind: "xcode", runtime_path: "apple-xcode", source_path: "overlay" },
    staged,
    ["**"],
    [],
    async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (command === "xcodebuild") return "Xcode 27.0\nBuild version 27A266a\n";
      return `${exported}\n`;
    },
    root,
  );

  expect(calls).toEqual([
    "xcodebuild -version",
    "xcrun agent plugin path --plugin-format codex",
  ]);
  expect(result.version).toBe("27.0");
  expect(result.build).toBe("27A266a");
  expect(await readFile(join(staged, "skills", "one", "references", "guide.md"), "utf8")).toBe("support\n");
  expect(await readFile(join(staged, "README.md"), "utf8")).toBe("local context\n");
});

test("Xcode overlays cannot replace vendor skill files", async () => {
  const root = await tempDir();
  const exported = join(root, "exported");
  await mkdir(join(exported, "skills", "one"), { recursive: true });
  await writeFile(join(exported, "skills", "one", "SKILL.md"), "---\nname: one\n---\n");
  await mkdir(join(root, "overlay", "skills", "one"), { recursive: true });
  await writeFile(join(root, "overlay", "skills", "one", "SKILL.md"), "replacement\n");

  await expect(stageXcodeSource(
    { name: "apple-xcode", kind: "xcode", runtime_path: "apple-xcode", source_path: "overlay" },
    join(root, "staged"),
    ["**"],
    [],
    async (command) => command === "xcodebuild"
      ? "Xcode 27.0\nBuild version 27A266a\n"
      : `${exported}\n`,
    root,
  )).rejects.toThrow("overlay may not modify vendor skills/**");
});

test("runtime replacement leaves the original untouched when its backup rename fails", async () => {
  const root = await tempDir();
  const runtimeRoot = join(root, "runtime");
  const stagedRoot = join(root, "staged", "entry");
  await mkdir(join(runtimeRoot, "entry"), { recursive: true });
  await mkdir(stagedRoot, { recursive: true });
  await writeFile(join(runtimeRoot, "entry", "SKILL.md"), "old\n");
  await writeFile(join(stagedRoot, "SKILL.md"), "new\n");
  let renameCalls = 0;

  await expect(replaceRuntimeEntry(
    runtimeRoot,
    join(root, "cache"),
    {
      entry: { name: "entry", kind: "local", runtime_path: "entry" },
      stagedRoot,
      runtimeDigest: "sha256:new",
      leaves: [],
      fileCount: 1,
      byteCount: 4,
    },
    async () => {
      renameCalls += 1;
      throw new Error("injected initial rename failure");
    },
  )).rejects.toThrow("injected initial rename failure");

  expect(renameCalls).toBe(1);
  expect(await readFile(join(runtimeRoot, "entry", "SKILL.md"), "utf8")).toBe("old\n");
  expect(await readFile(join(stagedRoot, "SKILL.md"), "utf8")).toBe("new\n");
});

test("Xcode availability identifies unsupported hosts without running commands", async () => {
  let called = false;
  const reason = await xcodeUnavailableReason("linux", async () => {
    called = true;
    return "";
  });
  expect(reason).toContain("unsupported host linux");
  expect(called).toBe(false);
});

test("test fixture cleanup works", async () => {
  const root = await tempDir();
  await writeFile(join(root, "note.md"), "ok\n");
  expect(await readFile(join(root, "note.md"), "utf8")).toBe("ok\n");
});


test("a later staging failure leaves earlier runtime entries and lock untouched", async () => {
  const root = await tempDir();
  await mkdir(join(root, "scripts"));
  await writeFile(join(root, "scripts/sync-lazy-skills.ts"),
    await readFile(join(import.meta.dir, "sync-lazy-skills.ts")));
  await mkdir(join(root, "source"));
  await writeFile(join(root, "source/SKILL.md"), "---\nname: first\n---\nnew\n");
  await mkdir(join(root, "runtime/first"), { recursive: true });
  await writeFile(join(root, "runtime/first/SKILL.md"), "old\n");
  const lock = JSON.stringify({ version: 1, entries: [] });
  await writeFile(join(root, "lazy-skills.lock.json"), lock);
  await writeFile(join(root, "lazy-skills.manifest.toml"), `
version = 1
[runtime]
root = "${root}/runtime"
source_cache = "${root}/cache"
[defaults]
include = ["**"]
[[source]]
name = "first"
kind = "local"
source_path = "source"
runtime_path = "first"
[[source]]
name = "second"
kind = "local"
source_path = "missing"
runtime_path = "second"
`);
  const proc = Bun.spawn([process.execPath, join(root, "scripts/sync-lazy-skills.ts"), "--all"],
    { stdout: "pipe", stderr: "pipe" });
  await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  expect(await proc.exited).not.toBe(0);
  expect(await readFile(join(root, "runtime/first/SKILL.md"), "utf8")).toBe("old\n");
  expect(await readFile(join(root, "lazy-skills.lock.json"), "utf8")).toBe(lock);
});

test("Xcode sync dry-run is non-mutating, retains one prior snapshot on change, and leaves it alone on no-op", async () => {
  if (process.platform !== "darwin") return;

  const root = await tempDir();
  await mkdir(join(root, "scripts"));
  await writeFile(join(root, "scripts/sync-lazy-skills.ts"),
    await readFile(join(import.meta.dir, "sync-lazy-skills.ts")));
  await mkdir(join(root, "overlay"));
  await writeFile(join(root, "overlay/README.md"), "Apple skills\n");
  await mkdir(join(root, "exported/skills/new-skill/references"), { recursive: true });
  await writeFile(join(root, "exported/skills/new-skill/SKILL.md"), "---\nname: new-skill\n---\nnew\n");
  await writeFile(join(root, "exported/skills/new-skill/references/guide.md"), "preserved\n");
  await mkdir(join(root, "runtime/apple-xcode"), { recursive: true });
  await writeFile(join(root, "runtime/apple-xcode/SKILL.md"), "---\nname: old-skill\n---\nold\n");
  await mkdir(join(root, "bin"));
  await writeFile(join(root, "bin/xcodebuild"), "#!/bin/sh\nprintf 'Xcode 27.0\\nBuild version 27A266a\\n'\n");
  await writeFile(join(root, "bin/xcrun"), `#!/bin/sh\nif [ "$1" = "--find" ]; then printf '/fixture/agent\\n'; else printf '${join(root, "exported")}\\n'; fi\n`);
  await chmod(join(root, "bin/xcodebuild"), 0o755);
  await chmod(join(root, "bin/xcrun"), 0o755);
  const initialLock = `${JSON.stringify({ version: 1, entries: [] })}\n`;
  await writeFile(join(root, "lazy-skills.lock.json"), initialLock);
  await writeFile(join(root, "lazy-skills.manifest.toml"), `
version = 1
[runtime]
root = "${root}/runtime"
source_cache = "${root}/cache"
[defaults]
include = ["**"]
[[source]]
name = "apple-xcode"
kind = "xcode"
source_path = "overlay"
runtime_path = "apple-xcode"
include = ["**"]
`);
  const env = { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}` };
  const run = async (extraArgs: string[]) => {
    const proc = Bun.spawn(
      [process.execPath, join(root, "scripts/sync-lazy-skills.ts"), ...extraArgs],
      { stdout: "pipe", stderr: "pipe", env },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(exitCode, stderr).toBe(0);
    return stdout;
  };

  await run(["--dry-run", "--only", "apple-xcode"]);
  expect(await readFile(join(root, "runtime/apple-xcode/SKILL.md"), "utf8")).toContain("old-skill");
  expect(await readFile(join(root, "lazy-skills.lock.json"), "utf8")).toBe(initialLock);

  await run(["--only", "apple-xcode"]);
  expect(await readFile(join(root, "runtime/apple-xcode/skills/new-skill/references/guide.md"), "utf8")).toBe("preserved\n");
  await expect(readFile(join(root, "runtime/apple-xcode/SKILL.md"), "utf8")).rejects.toThrow();
  expect(await readFile(join(root, "cache/xcode/apple-xcode/previous/SKILL.md"), "utf8")).toContain("old-skill");
  const lock = JSON.parse(await readFile(join(root, "lazy-skills.lock.json"), "utf8"));
  expect(lock.entries[0].xcode_version).toBe("27.0");
  expect(lock.entries[0].xcode_build).toBe("27A266a");
  expect(lock.entries[0].skill_leaves[0].path).toBe("apple-xcode/skills/new-skill/SKILL.md");

  await writeFile(join(root, "cache/xcode/apple-xcode/previous/marker"), "keep\n");
  expect(await run(["--only", "apple-xcode"])).toContain("updated 0/1 runtime entries");
  expect(await readFile(join(root, "cache/xcode/apple-xcode/previous/marker"), "utf8")).toBe("keep\n");

  await writeFile(join(root, "bin/xcodebuild"), "#!/bin/sh\nprintf 'Xcode 27.1\\nBuild version 27B100\\n'\n");
  await chmod(join(root, "bin/xcodebuild"), 0o755);
  const provenanceOnlyUpdate = await run(["--only", "apple-xcode"]);
  expect(provenanceOnlyUpdate).toContain("Xcode: 27.0 (27A266a) -> 27.1 (27B100)");
  const currentProvenance = JSON.parse(await readFile(join(root, "runtime/apple-xcode/.lazy-provenance.json"), "utf8"));
  const previousProvenance = JSON.parse(await readFile(join(root, "cache/xcode/apple-xcode/previous/.lazy-provenance.json"), "utf8"));
  expect(currentProvenance.xcode_build).toBe("27B100");
  expect(previousProvenance.xcode_build).toBe("27A266a");
  expect(currentProvenance.source_tree_digest).toBe(previousProvenance.source_tree_digest);
});
