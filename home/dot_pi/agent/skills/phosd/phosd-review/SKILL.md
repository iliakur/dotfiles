---
name: phosd-review
description: Review existing code through the lens of John Ousterhout's A Philosophy of Software Design — find deep-module violations, information leakage, and other red flags. Use when asked for a design review, complexity review, architecture critique, or a "POSD pass" over code.
---

# PO/SD Review

Review code as Ousterhout would: hunt for complexity, not style.

## Inputs

- The task must identify the code to review (paths, diff, or repo scope). Ask if absent.

## Procedure

1. **Load the philosophy.** Read [`../shared/principles.md`](../shared/principles.md) first, then [`../shared/red-flags.md`](../shared/red-flags.md). Do not skip these.
2. **Map the module structure.** For each module/class/API under review, identify:
   - the interface (what callers must know)
   - the implementation (what is hidden)
   - what design decision each module is supposed to encapsulate
3. **Test depth.** For each module: is the interface as small as it could be for the functionality provided? Flag shallow modules.
4. **Test hiding.** For each design decision (format, protocol, representation, ordering): is it known to exactly one module? Flag every leak.
5. **Scan the red flags.** Work through the catalog in `red-flags.md` section by section against the code. Collect only flags with file/line evidence.
6. **Diagnose the symptom.** For each finding, name which complexity symptom it causes (change amplification, cognitive load, unknown unknowns) and who pays for it.
7. **Propose the deeper design.** For each finding, sketch the concrete alternative — the shape the module should have. Do not report a flag without a fix direction.

## Output

Markdown response:

- `### Scope` — what was reviewed.
- `### Findings` — ranked by symptom severity; each with: flag name, file/line evidence, symptom, fix direction.
- `### Design summary` — one paragraph: what the structure gets right (deep modules, good hiding) and the single highest-leverage change.

## Discipline

- Report design flaws, not formatting, naming trivia, or style preferences.
- No praise padding. If nothing is wrong, say so and stop.
- Read-only: do not modify the code under review.
