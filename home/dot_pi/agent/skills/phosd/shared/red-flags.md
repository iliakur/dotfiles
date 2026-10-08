# Red Flags

Structural symptoms that a design has failed. Each flag names the pattern, why it hurts, and the direction of the fix. Never report these without file/line evidence.

## Module-shape flags

- **Shallow module** — interface nearly as complex as implementation, or little functionality behind a wide interface. Fix: deepen (hide more behind less) or eliminate.
- **Information leakage** — a design decision encoded outside the module that owns it (e.g., callers must know a file format or ordering constraint). Fix: move the knowledge inside; expose only operations.
- **Temporal decomposition** — API order mirrors execution order rather than conceptual structure (do A then B then C, with hidden state coupling). Fix: re-group by concept, pass state explicitly or encapsulate it.
- **Overexposure** — API exposes internals rarely needed by most callers. Fix: split interface, hide the specialized parts.

## Layering flags

- **Pass-through method** — one that does nothing but forward to another layer's identical method. Fix: rethink the layer boundary; the layering is wrong.
- **Pass-through parameter** — exists only to be handed down several levels. Fix: create a higher-level object or restructure so the knowledge stays put.
- **Same abstraction at adjacent layers** — layer adds no new abstraction. Fix: merge layers or give the layer its own purpose.
- **Conjoined methods** — can only be understood together because of a hidden dependency between them. Fix: separate or make the dependency explicit and documented.

## Interface flags

- **Sign / boolean arguments** — a parameter that selects a mode inside the function. Fix: split into distinct methods, or hide the choice.
- **Hard-to-name abstraction** — can't write a crisp name or a crisp one-sentence description. Fix: the abstraction is wrong; redesign it.
- **Awkward interface docs** — interface comment must describe implementation details to be used correctly. Fix: pull those details down into the module.
- **Special-general mixture** — API mixes one general-purpose mechanism with ad-hoc special cases. Fix: separate the special cases, keep the general mechanism clean.
- **Unclear data ("garbage in")** — variable/class name doesn't convey its precise meaning, or constraints are not documented. Fix: rename; document constraints; if impossible, redesign the representation.

## Duplication flags

- **Repetition** — same logic in multiple places. Fix: unify into one deeper abstraction (never unify by coincidence if the pieces are independent — that creates a shallow module).
- **Implementation leakage** — a comment or doc describes a specific algorithm when callers only need the contract. Fix: restate as contract; hide the algorithm.

## Review discipline

- Red flags are probabilities, not verdicts: report the complexity symptom (change amplification / cognitive load / unknown unknowns) the flag causes.
- Rank findings by symptom severity, not by flag count.
- Suggest the deeper design, not just the mechanical fix.
