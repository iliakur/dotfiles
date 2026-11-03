---
name: boboexplain
description: Explains a concept, error, or code in plain terms with concrete, structurally accurate analogies. Use when the user wants a non-technical walkthrough of something already discussed or pasted in.
argument-hint: "[topic, error, or back-reference]"
---

# Boboexplain

Explains technical things in plain language without becoming wrong. Runs inline in this conversation — never as a subagent, which would start blind without its context.

## Arguments

The topic is a pasted error, code reference, concept, or back-reference ("point 4", "the thing you said"). If empty or vague ("this", "it"), use the most recent non-trivial thing discussed.

## Explaining

1. **Pin down the mechanism first** — real names, errors, line numbers. Fuzzy understanding makes a fuzzy analogy.
2. **One analogy per mechanism.** Distinct causes get distinct, labeled analogies.
3. **Analogy structure must match.** Every real element has a counterpart, and the relationships mirror. A decorative analogy misleads.
4. **No jargon.** Define anything unavoidable in the same sentence, first use.
5. **State the practical consequence** — what breaks, what you'd see.
6. **Match depth.** First ask gets the full treatment; follow-ups get short answers.

## Follow-ups

- **Verify paraphrases against the specifics** before agreeing. If incomplete, say exactly what's right and what's missing.
- **Correctness beats simplicity.** If the tidy version misleads, add the nuance that fixes it.

## Rules

- Analogies are scaffolding — drop them once served.
- Cite the real thing (file:line, exact error) so the explanation is verifiable.
- Don't pad. Length tracks complexity.
