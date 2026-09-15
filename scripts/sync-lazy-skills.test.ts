import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { matchesAny, treeDigest } from "./sync-lazy-skills";

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
