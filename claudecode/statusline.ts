#!/usr/bin/env bun
import { hostname as osHostname } from "os"
import { $ } from "bun"

$.throws(false)

// --- Types ---

interface ClaudeInput {
  workspace?: { current_dir?: string }
  model?: { display_name?: string; id?: string }
  context_window?: {
    context_window_size?: number
    current_usage?: {
      input_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
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

// --- Context ---

function calcContextUsed(input: ClaudeInput): number | null {
  const usage = input.context_window?.current_usage
  const size = input.context_window?.context_window_size ?? 200_000
  if (!usage) return null

  const total =
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)

  return Math.round((total / size) * 100)
}

// --- Model ---

function formatModel(input: ClaudeInput): string | null {
  const display = input.model?.display_name
  if (!display) return null

  // "Claude Sonnet 4" → "sonnet-4"
  // "Claude Opus 4.5" → "opus-4.5"
  const match = display.match(/Claude\s+(\w+)\s+([\d.]+)/i)
  if (match) {
    return `${match[1].toLowerCase()}-${match[2]}`
  }
  return display
}

// --- Directory ---

function getShortDir(input: ClaudeInput): string {
  const cwd = input.workspace?.current_dir ?? process.cwd()
  const home = process.env.HOME ?? ""
  const display = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd
  const parts = display.split("/").filter(Boolean)
  return parts.length > 2 ? parts.slice(-2).join("/") : display
}

// --- Git ---

async function getGitInfo(): Promise<string> {
  // 2 lock-free git calls in parallel (down from 7 sequential calls)
  const [statusOut, revParseOut] = await Promise.all([
    $`git --no-optional-locks status --porcelain=v2 --branch --ahead-behind`.text(),
    $`git --no-optional-locks rev-parse --git-dir --git-common-dir`.text(),
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
  const input = await readStdin() ?? {}
  const parts: string[] = []

  parts.push(await getHostname())
  parts.push(getShortDir(input))

  const git = await getGitInfo()
  if (git) parts.push(git)

  const ctx = calcContextUsed(input)
  if (ctx !== null) {
    parts.push(`ctx:${ctx}%`)
  }

  const model = formatModel(input)
  if (model) parts.push(model)

  parts.push(getDateTime())

  console.log(parts.join(" │ "))
}

main()
