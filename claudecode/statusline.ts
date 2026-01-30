#!/usr/bin/env bun
import { homedir } from "os"
import { mkdir, readFile, readdir, rename, stat, writeFile } from "fs/promises"
import { basename, dirname, join } from "path"
import { $ } from "bun"

$.throws(false)

interface Usage {
  input_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

function getProjectDir(): { projectDir: string; projectSlug: string } {
  const cwd = process.cwd()
  const projectSlug = cwd.replaceAll("/", "-")
  return {
    projectDir: join(homedir(), ".claude", "projects", projectSlug),
    projectSlug,
  }
}

async function getTty(): Promise<string | null> {
  try {
    if (!process.stdout.isTTY) return null
    const tty = (await $`tty`.text()).trim()
    return tty && tty !== "not a tty" ? tty : null
  } catch {
    return null
  }
}

async function getParentStartTimeMs(parentPid: number): Promise<number | null> {
  try {
    const out = (
      await $`sh -lc ${`ps -o lstart= -p ${parentPid} 2>/dev/null | sed -E 's/^ +//g'`}`.text()
    ).trim()
    if (!out) return null
    const epochStr = (
      await $`sh -lc ${`date -j -f "%a %b %e %T %Y" "${out}" "+%s" 2>/dev/null`}`.text()
    ).trim()
    const epoch = Number(epochStr)
    return Number.isFinite(epoch) && epoch > 0 ? epoch * 1000 : null
  } catch {
    return null
  }
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== "string") return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

async function getSessionCreatedTimeMs(sessionFile: string): Promise<number | null> {
  try {
    const blob = Bun.file(sessionFile).slice(0, 8192)
    const text = await blob.text()
    const firstLine = text.split("\n", 1)[0]?.trim()
    if (!firstLine) return null
    const entry = JSON.parse(firstLine)
    return parseTimestampMs(entry?.snapshot?.timestamp) ?? parseTimestampMs(entry?.timestamp) ?? null
  } catch {
    return null
  }
}

type SessionCache = {
  projectDir: string
  projectSlug: string
  parentPid: number
  parentStartTimeMs: number | null
  tty: string | null
  sessionFile: string
  sessionId: string
  detectedAtMs: number
}

function safeCachePart(value: string): string {
  return value.replaceAll("/", "_").replaceAll(":", "_")
}

async function readSessionCache(cacheFile: string): Promise<SessionCache | null> {
  try {
    const raw = await readFile(cacheFile, "utf8")
    return JSON.parse(raw) as SessionCache
  } catch {
    return null
  }
}

async function writeSessionCache(cacheFile: string, cache: SessionCache): Promise<void> {
  await mkdir(dirname(cacheFile), { recursive: true }).catch(() => {})
  const tmp = `${cacheFile}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(cache), "utf8")
  await rename(tmp, cacheFile)
}

async function findSessionFileForThisProcess(projectDir: string, projectSlug: string): Promise<string | null> {
  const parentPid = process.ppid
  const tty = await getTty()
  const parentStartTimeMs = await getParentStartTimeMs(parentPid)

  const cacheDir = join(homedir(), ".claude", "cache", "statusline")
  const cacheFile = join(cacheDir, `${safeCachePart(projectSlug)}__${safeCachePart(tty ?? "no-tty")}__${parentPid}.json`)

  const cached = await readSessionCache(cacheFile)
  if (
    cached &&
    cached.projectDir === projectDir &&
    cached.parentPid === parentPid &&
    cached.tty === tty &&
    (parentStartTimeMs === null || cached.parentStartTimeMs === null || Math.abs(cached.parentStartTimeMs - parentStartTimeMs) < 1000)
  ) {
    const exists = await stat(cached.sessionFile).then(() => true, () => false)
    if (exists) return cached.sessionFile
  }

  let files: string[]
  try {
    files = await readdir(projectDir)
  } catch {
    return null
  }

  const sessions = files.filter((f) => f.endsWith(".jsonl")).map((f) => join(projectDir, f))
  if (sessions.length === 0) return null

  const withStats = await Promise.all(
    sessions.map(async (path) => {
      const s = await stat(path).catch(() => null)
      return s ? { path, mtimeMs: s.mtimeMs } : null
    })
  )

  const candidates = (withStats.filter(Boolean) as { path: string; mtimeMs: number }[]).sort((a, b) => b.mtimeMs - a.mtimeMs)

  let picked: string | null = null

  // Heuristic 1: session file modified within 2min after process start
  if (parentStartTimeMs !== null) {
    const windowMs = 2 * 60 * 1000
    const afterStart = candidates
      .map((c) => ({ ...c, deltaMs: c.mtimeMs - parentStartTimeMs }))
      .filter((c) => c.deltaMs >= 0 && c.deltaMs <= windowMs)
      .sort((a, b) => a.deltaMs - b.deltaMs)
    picked = afterStart[0]?.path ?? null
  }

  // Heuristic 2: match session creation timestamp to process start
  if (!picked && parentStartTimeMs !== null) {
    const createdTimes = await Promise.all(
      candidates.slice(0, 25).map(async (c) => {
        const createdMs = await getSessionCreatedTimeMs(c.path)
        return createdMs ? { path: c.path, createdMs } : null
      })
    )
    const created = (createdTimes.filter(Boolean) as { path: string; createdMs: number }[]).sort(
      (a, b) => Math.abs(a.createdMs - parentStartTimeMs) - Math.abs(b.createdMs - parentStartTimeMs)
    )
    picked = created[0]?.path ?? null
  }

  // Heuristic 3: most recently modified
  if (!picked) picked = candidates[0]?.path ?? null

  if (picked) {
    const sessionId = basename(picked).replace(/\.jsonl$/, "")
    await writeSessionCache(cacheFile, {
      projectDir, projectSlug, parentPid, parentStartTimeMs, tty,
      sessionFile: picked, sessionId, detectedAtMs: Date.now(),
    }).catch(() => {})
  }

  return picked
}

async function getLastUsage(sessionFile: string): Promise<Usage | null> {
  try {
    const tail = (await $`tail -n 500 ${sessionFile}`.text()).trim()
    if (!tail) return null
    const lines = tail.split("\n")
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i])
        if (entry.message?.usage?.input_tokens !== undefined) {
          return entry.message.usage as Usage
        }
      } catch { continue }
    }
  } catch {}
  return null
}

function calcContextPercent(usage: Usage): number {
  const total = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
  return Math.round((total / 200_000) * 100)
}

async function getGitInfo(): Promise<string> {
  const isRepo = await $`git rev-parse --is-inside-work-tree`.text()
  if (!isRepo.includes("true")) return ""

  const branch = (await $`git branch --show-current`.text()).trim()
  if (!branch) return ""

  const gitDir = (await $`git rev-parse --git-dir`.text()).trim()
  const gitCommon = (await $`git rev-parse --git-common-dir`.text()).trim()
  const isWorktree = gitDir !== gitCommon

  const porcelain = await $`git status --porcelain`.text()
  const dirty = porcelain.length > 0

  const ahead = parseInt((await $`git rev-list --count @{u}..HEAD`.text()).trim()) || 0
  const behind = parseInt((await $`git rev-list --count HEAD..@{u}`.text()).trim()) || 0

  let result = isWorktree ? "⎇ " : ""
  result += branch
  if (dirty) result += "*"
  if (ahead > 0) result += `↑${ahead}`
  if (behind > 0) result += `↓${behind}`
  return result
}

function getShortDir(): string {
  const cwd = process.cwd()
  const home = homedir()
  const display = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd
  const parts = display.split("/").filter(Boolean)
  return parts.length > 2 ? parts.slice(-2).join("/") : display
}

function getDateTime(): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, "0")
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const year = now.getFullYear()
  const hour = String(now.getHours()).padStart(2, "0")
  const min = String(now.getMinutes()).padStart(2, "0")
  return `${day}.${month}.${year} ${hour}:${min}`
}

async function main() {
  const parts: string[] = []
  parts.push(getShortDir())

  const git = await getGitInfo()
  if (git) parts.push(git)

  const { projectDir, projectSlug } = getProjectDir()
  const sessionFile = await findSessionFileForThisProcess(projectDir, projectSlug)
  if (sessionFile) {
    const usage = await getLastUsage(sessionFile)
    if (usage) {
      parts.push(`ctx:${calcContextPercent(usage)}%`)
    }
  }

  parts.push(getDateTime())
  console.log(parts.join(" │ "))
}

main()
