---
name: tiny-steps
description: Implement features in tiny steps — many small, verifiable, vertical increments instead of one big change. Use when writing or planning a non-trivial feature, refactor, or bugfix; when the user asks to work in tiny/small steps; or when a change feels too big to do at once.
---

# Tiny Steps

One truth: it is easier and faster to solve many small problems than one big problem. The plan is only the next problem to solve — play match by match, and let feedback from each step decide the next one.

## Method

1. **Decompose.** Before writing code, split the task into small vertical subproblems. Each one solves part of the problem on its own and can be verified independently. Never split into technical/horizontal tasks (e.g. "write the schema", "write the endpoint") — split into partial working behavior.
2. **Loop.** Solve exactly one subproblem: make it work, prove it with an automated test, run the whole test suite, commit. Stop after each subproblem and re-plan: what did this step teach you? New subproblems discovered along the way become new items in the plan.
3. **Keep it hidden but shippable.** Intermediate steps should not be visible to end users — hide new behavior behind flags, config, or interfaces (branch by abstraction) — but keep the system working and releasable at every step. Ship early, activate at the end.

## Why small steps

- Less risk: fewer things changed, fewer things that can break.
- Lower cognitive load: few details to hold at once, faster to get to production.
- Frequent shipping forces the whole delivery process to stay fast and exposes the next bottleneck.
- Faster feedback → better adaptation: the client sees tangible things and discovers what they actually want.

## Rules

- If a step feels big, it is two steps. Split again.
- Every step ends with the system in a working state.
- Every step is proven by a test, not by inspection.
- Tests define and drive the subproblems (TDD): find the next test, make it pass, refactor.
- Refactor continuously — the tiny-steps approach adds complexity; evolutionary design keeps it controlled.
- Estimate and commit only at the subproblem level, never the whole feature.
