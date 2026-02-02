#!/usr/bin/env bun

import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { $ } from "bun";

const TASKS_DIR = join(homedir(), ".claude", "tasks");
const PROJECTS_DIR = join(homedir(), ".claude", "projects");

// Handle --preview mode (called by fzf)
if (Bun.argv[2] === "--preview") {
  const id = Bun.argv[3];
  if (id) await printPreview(id);
  process.exit(0);
}

async function findSessionFile(uuid: string): Promise<string | null> {
  const projectDirs = await readdir(PROJECTS_DIR);
  for (const dir of projectDirs) {
    const sessionPath = join(PROJECTS_DIR, dir, `${uuid}.jsonl`);
    try {
      const stats = await stat(sessionPath);
      if (stats.isFile()) return sessionPath;
    } catch {
      // file doesn't exist, continue
    }
  }
  return null;
}

async function getProjectPath(sessionPath: string): Promise<string> {
  // Stream through file looking for first line with cwd field
  const proc = Bun.spawn(["grep", "-m1", '"cwd"', sessionPath], {
    stdout: "pipe",
  });
  const output = await new Response(proc.stdout).text();

  try {
    const data = JSON.parse(output.trim());
    return data.cwd || "unknown";
  } catch {
    return "unknown";
  }
}

async function getTaskCount(taskDir: string): Promise<number> {
  const files = await readdir(taskDir);
  return files.filter((f) => f.endsWith(".json") && f !== ".lock").length;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TaskListInfo {
  id: string;
  projectPath: string;
  projectName: string;
  taskCount: number;
  modifiedAt: Date;
}

async function getTaskLists(): Promise<TaskListInfo[]> {
  const entries = await readdir(TASKS_DIR);
  const uuidPattern = /^[a-f0-9-]{36}$/;

  const lists: TaskListInfo[] = [];

  for (const entry of entries) {
    if (!uuidPattern.test(entry)) continue;

    const taskDir = join(TASKS_DIR, entry);
    const stats = await stat(taskDir);
    if (!stats.isDirectory()) continue;

    const sessionPath = await findSessionFile(entry);
    const projectPath = sessionPath ? await getProjectPath(sessionPath) : "unknown";

    lists.push({
      id: entry,
      projectPath,
      projectName: basename(projectPath),
      taskCount: await getTaskCount(taskDir),
      modifiedAt: stats.mtime,
    });
  }

  return lists.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
}

async function printPreview(id: string): Promise<void> {
  const taskDir = join(TASKS_DIR, id);
  try {
    const files = await readdir(taskDir);
    const jsonFiles = files
      .filter((f) => f.endsWith(".json") && f !== ".lock")
      .sort((a, b) => parseInt(a) - parseInt(b));

    for (const file of jsonFiles.slice(0, 15)) {
      try {
        const data = await Bun.file(join(taskDir, file)).json();
        const status =
          data.status === "completed" ? "✓" : data.status === "in_progress" ? "→" : "○";
        console.log(`${status} ${data.subject}`);
      } catch {}
    }
  } catch {}
}

async function main() {
  const lists = await getTaskLists();

  if (lists.length === 0) {
    console.log("No task lists found");
    process.exit(1);
  }

  // Format: "display\tID" - fzf shows display, we get ID back
  const fzfInput = lists
    .map((l) => `${l.projectName} (${l.taskCount} tasks) - ${timeAgo(l.modifiedAt)}\t${l.id}`)
    .join("\n");

  const scriptPath = process.argv[1];

  const result =
    await $`echo ${fzfInput} | fzf --height=50% --reverse --header="Select task list" --delimiter="\t" --with-nth=1 --preview="${scriptPath} --preview {2}" --preview-window=right:60%:wrap`
      .quiet()
      .nothrow();

  const selected = result.stdout.toString().trim();
  if (!selected) {
    console.log("No selection made");
    process.exit(0);
  }

  const id = selected.split("\t")[1];
  const list = lists.find((l) => l.id === id);

  console.log(`Launching claude in ${list?.projectPath ?? "."} with task list: ${id}`);

  process.chdir(list?.projectPath ?? ".");

  // exec replaces current process
  const args = Bun.argv.slice(2).filter(a => a !== "--preview");
  const env = { ...process.env, CLAUDE_CODE_TASK_LIST_ID: id };

  Bun.spawnSync(["claude", ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env,
  });
}

main().catch(console.error);
