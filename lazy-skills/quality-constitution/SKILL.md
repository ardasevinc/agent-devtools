---
name: quality-constitution
description: Use when designing or applying agent-operable code quality gates around duplication, CRAP risk, mutation testing, and role-based review queues.
version: 0.1.0
---

# Quality Constitution

Use this skill when the user wants to turn code quality into an agent-operable workflow: architecture review, test quality, mutation testing, complexity risk, structural duplication, or multi-agent quality gates.

This is a seed skill. It is not a full toolchain yet. Its job is to preserve the operating doctrine and help design the next concrete loop.

## Source Note

Primary vault note:

`/Users/arda/Documents/obsidian/obsidian-main/projects/agent-devtools/research/unclebob-quality-essence-2026-05-12.md`

Reference repos:

- `/Users/arda/.agents/repo-ref/swarm-forge`
- `/Users/arda/.agents/repo-ref/dry4java`
- `/Users/arda/.agents/repo-ref/dry4clj`
- `/Users/arda/.agents/repo-ref/dry4go`
- `/Users/arda/.agents/repo-ref/crap4java`
- `/Users/arda/.agents/repo-ref/crap4clj`
- `/Users/arda/.agents/repo-ref/crap4go`
- `/Users/arda/.agents/repo-ref/mutate4java`
- `/Users/arda/.agents/repo-ref/mutate4go`
- `/Users/arda/.agents/repo-ref/clj-mutate`

## Doctrine

Code quality should become a queue agents can work down:

```text
change -> measure -> queue -> assign -> repair -> verify -> record trust
```

The four core signals:

- Structural duplication: normalized AST/form similarity, not raw clone matching.
- Change risk: cyclomatic complexity amplified by missing coverage.
- Mutation survival: tests must kill plausible wrong programs.
- Constitutional orchestration: role-scoped agents work against explicit gates.

## How To Apply

1. Identify the concrete scope: changed files, risky module, planned refactor, or architecture boundary.
2. Separate signals:
   - duplicate shape asks "same abstraction or coincidental structure?"
   - high CRAP asks "test first, then refactor?"
   - uncovered mutation asks "can tests reach this branch?"
   - surviving mutation asks "is an assertion missing or behavior underspecified?"
3. Produce a ranked agenda, not a generic quality essay.
4. Recommend the smallest verification loop that can prove improvement.
5. Record waivers explicitly when a metric is intentionally ignored.

## Output Shape

Prefer a compact agenda:

```text
1. file:line - signal - why it matters - next agent action - verification
2. file:line - signal - why it matters - next agent action - verification
```

For architecture planning, include:

- constitution rules
- agent roles
- gate commands
- waiver policy
- evidence artifacts

## Guardrails

- Do not treat metrics as moral law.
- Do not auto-refactor duplication without domain inspection.
- Do not chase mutation score uniformly across prototypes or low-risk glue.
- Do not invent tool availability. If scanners do not exist yet, say so and design the loop.
- Prefer local, incremental, changed-file workflows over expensive whole-repo ceremonies.
