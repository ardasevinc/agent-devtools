#!/usr/bin/env bun
import { hostname as osHostname } from "os"
import { $ } from "bun"

$.throws(false)

// --- Types ---
// Field contract: https://code.claude.com/docs/en/statusline
// Most fields can be absent or null; never assume a context size.

interface Window {
  used_percentage?: number | null
  resets_at?: number | null
}

interface ClaudeInput {
  cwd?: string
  workspace?: { current_dir?: string; git_worktree?: string }
  model?: { display_name?: string; id?: string }
  effort?: { level?: string }
  fast_mode?: boolean
  context_window?: {
    context_window_size?: number | null
    used_percentage?: number | null
  }
  prompt_cache?: {
    warm?: boolean
    expires_at?: number | null
    hit_ratio?: number | null
  }
  rate_limits?: {
    five_hour?: Window
    seven_day?: Window
  }
}

// --- Stdin JSON ---

async function readStdin(): Promise<ClaudeInput | null> {
  try {
    const text = await Bun.stdin.text()
    if (!text.trim()) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

// --- Colors ---

const RESET = "\x1b[0m"
const DIM = "\x1b[2m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"

function heat(pct: number, text: string): string {
  if (pct >= 90) return RED + text + RESET
  if (pct >= 70) return YELLOW + text + RESET
  return text
}

// --- Model ---

function formatModel(input: ClaudeInput): string | null {
  // "claude-opus-5-5" → "opus-5.5", "claude-haiku-4-5-20251001" → "haiku-4.5"
  const id = input.model?.id
  const match = id?.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/)
  let model = match
    ? `${match[1]}-${match[2]}${match[3] ? "." + match[3] : ""}`
    : input.model?.display_name?.toLowerCase()
  if (!model) return null

  const effort = input.effort?.level
  if (effort) model += ` ${effort}`
  if (input.fast_mode) model += " ⚡"
  return model
}

// --- Context ---

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  return `${Math.round(n / 1000)}k`
}

function formatContext(input: ClaudeInput): string | null {
  const pct = input.context_window?.used_percentage
  if (pct == null) return null
  const size = input.context_window?.context_window_size
  const rounded = Math.round(pct)
  const text = size ? `ctx ${rounded}%/${formatTokens(size)}` : `ctx ${rounded}%`
  return heat(rounded, text)
}

// --- Prompt cache ---

function formatCache(input: ClaudeInput): string | null {
  const cache = input.prompt_cache
  if (!cache) return null
  const left = cache.expires_at ? Math.floor((cache.expires_at * 1000 - Date.now()) / 60_000) : null
  if (!cache.warm || (left !== null && left <= 0)) return YELLOW + "cache cold" + RESET
  let text = left !== null ? `cache ${left}m` : "cache warm"
  if (cache.hit_ratio != null) text += ` ${DIM}${Math.round(cache.hit_ratio * 100)}%hit${RESET}`
  return text
}

// --- Rate limits ---

function formatLimits(input: ClaudeInput): string | null {
  const parts: string[] = []
  const windows: [string, Window | undefined][] = [
    ["5h", input.rate_limits?.five_hour],
    ["7d", input.rate_limits?.seven_day],
  ]
  for (const [label, window] of windows) {
    if (window?.used_percentage == null) continue
    const pct = Math.round(window.used_percentage)
    parts.push(heat(pct, `${label} ${pct}%`))
  }
  return parts.length ? parts.join(" · ") : null
}

// --- Directory ---

function getShortDir(input: ClaudeInput): string {
  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd()
  const home = process.env.HOME ?? ""
  const display = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd
  const parts = display.split("/").filter(Boolean)
  return parts.length > 2 ? parts.slice(-2).join("/") : display
}

// --- Git ---

async function getGitInfo(cwd: string): Promise<string> {
  // 2 lock-free git calls in parallel
  const [statusOut, revParseOut] = await Promise.all([
    $`git --no-optional-locks status --porcelain=v2 --branch --ahead-behind`.cwd(cwd).text(),
    $`git --no-optional-locks rev-parse --git-dir --git-common-dir`.cwd(cwd).text(),
  ])

  if (!statusOut) return ""

  let branch = ""
  let ahead = 0
  let behind = 0
  let dirty = false

  for (const line of statusOut.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      branch = line.slice(14)
    } else if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/)
      if (match) {
        ahead = parseInt(match[1])
        behind = parseInt(match[2])
      }
    } else if (line.length > 0 && !line.startsWith("#")) {
      dirty = true
    }
  }

  if (!branch || branch === "(detached)") return ""

  // worktree: git-dir differs from git-common-dir
  const revLines = revParseOut.trim().split("\n")
  const isWorktree = revLines.length === 2 && revLines[0] !== revLines[1]

  let result = isWorktree ? "⎇ " : ""
  result += branch
  if (dirty) result += "*"
  if (ahead > 0) result += `↑${ahead}`
  if (behind > 0) result += `↓${behind}`

  return result
}

// --- DateTime ---

function getDateTime(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

// --- Hostname ---

async function getHostname(): Promise<string> {
  if (process.platform === "darwin") {
    // scutil returns stable user-set name on macOS (immune to DHCP)
    const name = (await $`scutil --get ComputerName`.text()).trim()
    if (name) return name
  } else if (process.platform === "linux") {
    // static hostname is stable, dynamic one can change
    const name = (await $`hostnamectl --static`.text()).trim()
    if (name) return name
  }
  return osHostname()
}

// --- Main ---

async function main() {
  const input = (await readStdin()) ?? {}
  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd()
  const [host, git] = await Promise.all([getHostname(), getGitInfo(cwd)])

  const parts = [
    host,
    getShortDir(input),
    git,
    formatModel(input),
    formatContext(input),
    formatCache(input),
    formatLimits(input),
    getDateTime(),
  ].filter(Boolean)

  console.log(parts.join(" │ "))
}

main()
