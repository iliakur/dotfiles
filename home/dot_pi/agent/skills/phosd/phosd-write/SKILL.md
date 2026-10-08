---
name: phosd-write
description: Apply John Ousterhout's A Philosophy of Software Design while writing or designing new code, modules, and APIs — deep modules, information hiding, comments-first. Use when creating a new module, class, API, or subsystem, or when asked to "design it like PO/SD" or make design decisions while coding.
---

# PHO/SD Write

Write code as Ousterhout would: every module is a decision about what to hide.

## Procedure

Before writing any nontrivial module, class, or API:

1. **Load the philosophy.** Read [`../shared/principles.md`](../shared/principles.md). Load [`../shared/red-flags.md`](../shared/red-flags.md) before the self-check in step 6.
2. **Design it twice.** Sketch at least two decompositions. Compare them by interface depth and information hiding, not by LOC. Pick one and state in one sentence what each module encapsulates. If you can't state it, redesign.
3. **Decide what matters.** Name the aspects that could realistically change (formats, protocols, algorithms, scale) and the ones that won't. Hide the former behind module boundaries; treat the latter crudely.
4. **Interface before implementation.** Define the smallest interface that covers the actual current needs (somewhat general-purpose: it should survive plausible near-term demands, but no speculative generality). Then check: does every caller's common case work without parameters, flags, or error gymnastics? Pull complexity into the module until it does.
5. **Comments first.** Draft interface comments before writing the implementation body: what the abstraction does, its invariants, and why it exists. If crisp comments are impossible, the abstraction is wrong — go back to step 2.
6. **Self-check.** After implementation, scan the result against the red-flags catalog and fix: shallow modules, leaks, pass-through methods, sign/boolean arguments, hard-to-name abstractions.

## While modifying existing code

- Prefer adding a new special-purpose method over generalizing an existing one with extra parameters.
- If the change would deepen an existing module (simpler interface), take it; if it would shallow it, stop and reconsider the design.
- Invest a portion of every change in design cleanup — complexity is incremental, and so is its removal.

## Discipline

- Interface cost is permanent; implementation cost is not. Spend effort on the interface.
- If the first implementation comes out tangled, write it again rather than shipping tactical code.
