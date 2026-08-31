---
name: map-dataflow
description: Produce a structured data-flow analysis (markdown table plus Mermaid diagram) without writing files.
---

# Map Dataflow

Use this skill when you need a focused Step 3 style data-flow analysis outside the full codereview workflow, or when splitting codereview tasks across agents.

## Inputs

- Task must specify the code scope to analyze (files, functions, behaviors, or diff summary).
- You may use the standard tooling (`read`, `ls`, `find`, `grep`, `bash`) to inspect sources. **Do not write or edit files.**

## Procedure

1. **Understand the change**
   - Inspect the implementation details needed to explain how data enters, moves through, and exits the code under review.

2. **Build the analysis**
   - Prepare the following sections for your final response (no filesystem output):
     * `### Summary` — concise description of the behavior under review.
     * `### Dataflow Table` — Markdown table with columns **Source**, **Transformation**, **Sink / Side-effect**, **Trust Boundary**.
     * `### Inputs and Outputs` — bullet list covering each external input, derived value, and resulting output/side effect. For every entry include:
       - Origin (file/function/API/env)
       - Type / shape
       - Validation or assumptions applied
       - Downstream consumer(s)
       - For derived values: any quantization applied (round/floor/truncate/integer division) and when/how the value is sampled (per request, on a schedule/cron, on poll). Note if the value changes over time and how it steps between observations.
     * `### Flow Narrative` — step-by-step textual walkthrough showing how data moves from inputs through transformations into outputs, including branching and error paths.
     * `### Edgecase Seeds` — list potential edge-case dimensions discovered while tracing flows (these will be expanded by a separate edgecase process). Always seed, where applicable:
       - **Input relationships**: phase/offset/ordering/equality between two inputs (e.g. event time vs sample time), not just each input in isolation.
       - **Derived-value trajectory**: how a quantized value (floor/round/truncate) steps across successive samples, and whether any branch keyed on an exact value (`==`, `in {…}`) can be skipped when the value jumps past it.
       - **Sampling cadence**: delayed, skipped, or duplicated scheduled/polled runs.
     * `### Mermaid Diagram` — fenced code block labelled `mermaid` that mirrors the flow described above and annotates trust boundaries where applicable. Ensure every node mentioned elsewhere appears in the diagram and vice versa.

3. **Quality checks**
   - Keep prose succinct and evidence-based.
   - Cross-check that all inputs/outputs mentioned in the narrative appear in both the table and the diagram.

4. **Finalize**
   - Return a single markdown response containing the sections above.
   - Do not claim to have written any files.

## Notes

- Use this skill standalone or as part of the codereview workflow. When codereview consumes the output, it becomes responsible for writing `dataflow.md` and `dataflow.mmd`.
- Operate statelessly: rely only on this document plus the user-provided task.
