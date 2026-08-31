---
name: audit-abstractions
description: Evaluate abstraction burden and produce a structured markdown report without writing files.
---

# Audit Abstractions

Use this skill when you need the Step 5 abstraction review on its own or as part of the codereview workflow.

## Inputs

- Task must spell out the scope of code under review.
- Approved tooling: `read`, `ls`, `find`, `grep`, `bash`. **Do not write or edit files** when using this standalone skill.

## Procedure

1. **Inventory abstractions**
   - Build an **abstraction tree that mirrors the code structure verbatim** (package/module -> object/record -> function -> field/constant).
   - Treat **module boundaries** as abstractions too (files/packages/namespaces), even when they only contain a few symbols.
   - For package+submodule APIs, explicitly include both:
     - the package surface (what callers import), and
     - the submodule surfaces (where symbols originate).
   - Annotate every node with:
     - node type: one of `module`, `data record`, `object`, `function`, `field`, `constant`
     - complexity load: `none`, `low`, `medium`, or `high`
     - a short evidence note (for example: `pass-through re-export`, `2 branches`, `validation + transform + I/O`)
   - Do not invent idealized groupings; keep hierarchy faithful to the current file/symbol layout.

2. **Assess working-set cost**
   - Apply the 5±1 working-set guideline to judge cognitive load.
   - Flag unnamed data bundles, thin helpers, or gratuitous indirection with concrete file/line references.
   - Run a mandatory **boundary payoff check** for each new/changed module boundary:
     - Ask: **"What does this boundary hide today?"**
     - Ask: **"Would inlining/merging reduce active concepts without losing clarity?"**
     - If the boundary mostly mirrors/re-exports the same symbols with minimal hidden complexity, mark it as **shallow-module fragmentation**.
   - Explicitly check for **surface duplication** patterns (e.g., package exports nearly identical to tiny submodule exports) and record whether each layer adds unique policy, validation, or lifecycle semantics.
   - Capture concrete working-set evidence in the `### Chunking Tree`, not only in prose.

3. **Prepare the report**
   - Structure your final response (markdown only) with the following sections:
     * `### Scope` — one short paragraph summarizing purpose and review coverage.
     * `### Abstraction Tree` — fenced code block that is a faithful tree of the reviewed code structure.
       - Use this exact node annotation pattern on every line:
         - `<name> [type=<module|data record|object|function|field|constant>; complexity=<none|low|medium|high>; note=<short evidence>]`
       - Include file/line anchors on major nodes so the evidence is traceable.
       - Keep sibling order aligned with source order where practical.
     * `### Assessment` — up to three concise paragraphs referencing nodes in the abstraction tree and explaining working-set impact.
       - If module boundaries are present, include a short "boundary payoff" verdict for each major boundary (pays for itself / shallow / unclear).
     * `### Chunking Tree` — fenced code block containing the best chunking hierarchy achievable from the current code (not an idealized design).
       - Show hotspots directly in the tree: mark nodes that exceed 5±1 active child concepts with `⚠` and include counts.
       - You may summarize subtrees instead of fully expanding them; when summarizing, include child counts in parentheses, e.g. `selection protocol (11 helpers)`.
       - Include file/line anchors on major nodes so the evidence is traceable.
     * `### Dependency Notes` — optional bullet list highlighting non-tree-shaped or surprising relationships (omit if none).

4. **Quality checks**
   - Keep prose direct; avoid generic praise or style commentary.
   - Do not excuse shallow modules solely on possible future growth; evaluate payoff based on current code.

5. **Finalize**
   - Return a single markdown response containing the sections above.
   - Ensure every node in `### Abstraction Tree` has both `type=` and `complexity=` annotations.
   - Do not report any filesystem writes.

## Notes

- Invoke this skill directly or via the codereview workflow. When codereview uses the output, it is responsible for writing `abstractions.md` to disk.
- Operate statelessly with only this specification plus the task input.
