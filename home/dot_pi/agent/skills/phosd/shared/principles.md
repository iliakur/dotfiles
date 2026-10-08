# A Philosophy of Software Design — Core Principles

Condensed from John Ousterhout, *A Philosophy of Software Design* (2nd ed., 2021).

## Thesis

Software design is the management of complexity. Complexity is anything that makes software hard to understand and hard to change.

**Symptoms of complexity:**
- Change amplification — a simple change requires edits in many places.
- Cognitive load — a developer must know a lot to complete a task.
- Unknown unknowns — it's not obvious what you need to know to make a change.

**Causes:** dependencies and obscurity.

Complexity accumulates incrementally, one shortcut at a time, so no single decision feels important. The only defense is strategic programming: invest in design continuously (~10-20% of total effort), with zero tolerance for "I'll clean it up later."

## The ten rules

1. **Deep modules.** The best modules are small interfaces over lots of functionality. Interface cost is permanent; implementation cost can be fixed later. A shallow module (interface as complex as its implementation) adds no value.

2. **Information hiding.** Each module should encapsulate one design decision (format, algorithm, protocol, data representation) that could change. Information leakage is the single greatest source of complexity — it means the encapsulation failed and knowledge is duplicated across modules.

3. **Somewhat general-purpose.** Design for today's actual needs, but in a way that will also meet a few plausible near-future needs. Avoid both over-specialization and speculative generality. "As simple as possible, but no simpler."

4. **Different layer, different abstraction.** Each layer of a system must provide a different abstraction. If an abstraction is passed through unchanged, the layer adds cost without value.

5. **Pull complexity downward.** A module should absorb complexity so its callers get the simplest possible common case. If a module forces every caller to deal with its hard parts, it leaked.

6. **Together or apart.** Place things together if they share information or form one coherent concept; separate them if they are independent. Judge any split or merge by whether the resulting modules are deeper.

7. **Define errors out of existence.** Every place that must handle an exception is complexity. Design APIs so the common path needs no special handling: mask errors, aggregate many into few, or shrink the API so errors can't occur.

8. **Design it twice.** For any nontrivial design, sketch at least two approaches and compare. The first idea is rarely the best.

9. **Comments describe the non-obvious.** Comments record abstractions, invariants, and *why* — what code cannot express. Low-level comments that restate code are worse than none. Write interface comments early: if you can't write crisp ones, the abstraction is wrong. (Ousterhout's direct rebuttal of Clean Code's comment minimalism.)

10. **Precise, consistent names.** A name is a tiny abstraction. Vague names obscure. If a name is hard to get right, the underlying abstraction is probably wrong.

## Meta-rule: decide what matters

The essence of design is separating the important from the unimportant. Identify what really matters for this system, invest design effort there, and handle the unimportant crudely.
