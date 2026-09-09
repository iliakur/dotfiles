---
name: codereview
description: "Review code artifacts end-to-end: infer purpose, build a purpose-rooted change tree, map data flow, derive edge cases from input variation, and prepare review comments."
---

# Code Review

Use this skill when asked to review a pull request or other code artifact and produce structured analysis (purpose tree, data-flow, edge cases, and review comments).

## Output location (mandatory)

Write all review artifacts to:

`~/Documents/reviews/<repo-folder-name>/<target-identifier>/`

Where:
- `<repo-folder-name>` = `basename "$PWD"`
- `<target-identifier>` = numeric PR id when reviewing a PR; otherwise a short slug you define in Step 0 (for example, a branch name, commit hash, or dated tag)

Create the directory first.

## Workflow

### 0) Determine review target

Decide what you are reviewing.
- If the request includes a GitHub PR URL, treat the target as a PR. Plan to record anchors for every comment as both `filepath:line` and a GitHub diff locator (`position` or `commit_id` + `path` + `line`). Use the PR number as `<target-identifier>`.
- Otherwise, treat the target as a local or alternative artifact. Record anchors as `filepath:line` only and choose an appropriate `<target-identifier>` (for example, `branch-foo`, `commit-abc123`, or `snapshot-20240603`).

Document the target classification and chosen identifier at the top of `review-comments.md` before listing individual comments.

### 1) Gather context

If Step 0 identified a GitHub PR:
- Collect and save:
  - PR metadata (`title`, `body`, `headRefName`, `baseRefName`, `author`, `commits`, `files`, `url`)
  - PR discussions (top-level issue comments, review summaries, and inline review comments)
  - file-level diff summary
  - full patch for changed files relevant to logic
- Reuse policy for context artifacts:
  - If a context file from this step already exists and is non-empty in `$out`, reuse it instead of regenerating.
  - Regenerate only when the file is missing, empty, or the user explicitly asks for refresh.
- Recommended commands:

```bash
repo_name="$(basename "$PWD")"
pr_number="<PR_NUMBER>"
out="$HOME/Documents/reviews/$repo_name/$pr_number"
mkdir -p "$out"

[ -s "$out/pr.json" ] || gh pr view "$pr_number" --json number,title,body,headRefName,baseRefName,author,mergeStateStatus,state,commits,files,url > "$out/pr.json"
[ -s "$out/pr-comments.txt" ] || gh pr view "$pr_number" --comments > "$out/pr-comments.txt"
[ -s "$out/reviews.json" ] || gh api "repos/{owner}/{repo}/pulls/$pr_number/reviews" > "$out/reviews.json"
[ -s "$out/review-comments.json" ] || gh api "repos/{owner}/{repo}/pulls/$pr_number/comments" > "$out/review-comments.json"
[ -s "$out/name-status.txt" ] || git diff --name-status "origin/<base-branch>...HEAD" > "$out/name-status.txt"
[ -s "$out/diff-stat.txt" ] || git diff --stat "origin/<base-branch>...HEAD" > "$out/diff-stat.txt"
```

Review these discussion artifacts before drafting findings so prior reviewer concerns and author clarifications are part of the analysis.

If the local branch is not the PR head, fetch PR refs and diff `base...head` explicitly.

If Step 0 identified another artifact:
- Capture equivalent context artifacts (for example, commit range, branch diff, or file snapshot). At minimum, save:
  - a short `context.md` describing what is under review and why
  - a diff summary (`git diff --stat <range>`)
  - the diff itself or focused patches for logic changes (`git diff <range> > "$out/diff.patch"`)
- Reuse existing non-empty context files in `$out` when present; regenerate only if missing/empty or explicitly requested.
- Place these files in the output directory selected above.

### 2) Build purpose-rooted change tree

Identify:
- root purpose / problem to solve
- structured change summary
- for each change: how it supports purpose (directly or indirectly)

Flag in the tree any change that does **not** clearly support the root purpose. Mark these nodes explicitly (for example, prefix with `UNSUPPORTED:`) and plan to call them out later in `review-comments.md`.

Write to:
- `purpose.md`

Required format:
- rooted tree
- each node explicitly linked to parent by “supports” relationship

### 3) Define inputs, outputs, and side effects (data flow)

After the purpose tree is complete, map how data flows through the changed behavior.

Run `/skill:map-dataflow` with the same `REVIEW_DIR` header (or mirror its spec manually). The response will include:
- `### Summary`
- `### Dataflow Table`
- `### Inputs and Outputs`
- `### Flow Narrative`
- `### Edgecase Seeds`
- `### Mermaid Diagram`

Ensure these sections cover all sources, transformations, sinks/side effects, trust boundaries, and seeding edge-case dimensions.

Copy everything before `### Mermaid Diagram` into `dataflow.md`. Copy the fenced `mermaid` block (without backticks) into `dataflow.mmd`.


### 4) Use data flow to explore edge cases

For each input in `dataflow.md`, vary value classes and trace behavior.

Vary **three** dimensions, not just one:
- the **value** of a single input (categories below)
- the **relationship between inputs** (e.g. phase/offset between two timestamps, ordering, equality, one derived from another)
- the **trajectory of a derived value over time/sampling** (how it steps between successive runs, and whether a branch keyed on a specific value is actually reachable)

Value categories — cover at least:
- missing/empty
- wrong type/shape
- malformed but parseable
- out-of-range/extreme
- ambiguous/conflicting duplicates
- stale/race/timing-sensitive
- partial external failures
- **rounding/floor/truncation boundaries** (e.g. `timedelta.days` floors a partial day; integer division; `int()` truncation)
- **exact-threshold vs crossing** — for any branch keyed on `==`, `in {…}`, or a specific value of a quantity that changes over time or is sampled: does the quantity actually *land* on that value at a sampled moment, or can it step/jump past it and skip the branch? Prefer crossing (`<=`/`>=`) or date comparison.
- **sampling cadence** — for cron/polling/scheduled code: a sample can be delayed, skipped, or duplicated, so a derived counter can jump by more than one between observations or never be observed at a given value.

Condition-reachability check: for every branch that must fire (alerts, state transitions, one-shot side effects), trace the full sequence of values the controlling quantity takes across runs and confirm the branch is reached on every intended occasion — not just that it is correct when reached.

For every edge case, provide a concrete value-level example down to primitive datatypes.
Examples should be explicit, e.g.:
- input value(s): `expected_run_id: "3"`, `seen_run_ids: ["3", "4"]`
- observed behavior: selects first matching bundle and outputs `bundle_id="A"`
- desired/expected behavior: reject as ambiguous, or select deterministic tie-break result

Or for a transformation:
- input value: `x = 3` (integer)
- observed output: `4`
- desired output: `5`

Classify each case:
- handled correctly
- ambiguous policy
- logic hole
- test-only gap

Write an Edgecases section in `dataflow.md`

### 5) Review for abstraction burden

Run `/skill:audit-abstractions` to evaluate abstraction burden for the same review scope.

Copy the full response into `abstractions.md`.

### 6) Draft review comments mapped to code

Create comments as close as possible to relevant changed lines.

Write planned comments to:
- `review-comments.md`

Each entry must include:
- file path
- target line/hunk (exact line numbers or nearest changed hunk anchor)
- issue type (logic hole / ambiguity / robustness / tests / unsupported change)
- concrete evidence from code behavior
- concrete example input/output (primitive values where possible)
- requested change
- suggested test tied to the same line/hunk (unless issue type is `unsupported change`, in which case document why it fails to support the purpose instead)
- `GitHub comment:` section (the exact body intended for posting)

`GitHub comment:` format (mandatory):
- First paragraph: exactly one sentence describing the problem.
- Second paragraph (only when an example is available): a concrete confirming example with explicit primitive inputs and observed vs expected behavior.
- Third paragraph: the proposed fix.

Use `GitHub comment:` as the single source of truth for posting text; do not duplicate a separate prose critique outside this section.

Before finalizing `review-comments.md`, run `/skill:edit-writing` in place on all `GitHub comment:` sections.
- Preserve all required structure and content: anchors, file paths, line numbers, issue types, evidence, examples, requested changes, and suggested tests.
- Keep the mandatory 3-paragraph format for each `GitHub comment:`.
- Do not soften or remove findings; only improve clarity and concision.

Do not assign severity, priority, or risk ratings to any finding, and do not rank findings against each other. Report each issue with its type, evidence, and requested change only. Deciding how serious an issue is belongs to the human reviewer, not this skill.

Anchors requirement: Always include file path and explicit line numbers. When Step 0 classified the target as a GitHub PR, also record the GitHub diff anchor (`position` relative to the patch or `commit_id` + `path` + `line`) so comments attach correctly when posted. Do not rely on unanchored or free-text location descriptions alone.

Do not leave comments unanchored when an anchor is available.

If asked to post review:
- post inline comments with input/output examples first (each as a diff-aware, file+line anchored comment), using the already-edited `GitHub comment:` text
- then submit the overall review using only the verdict the user explicitly specified (`COMMENT`, `REQUEST_CHANGES`, or `APPROVE`)
- do not choose or recommend the verdict yourself; if the user did not specify one, ask for it

## Minimum artifact set

Always produce:
- `purpose.md`
- `dataflow.md`
- `dataflow.mmd`
- `abstractions.md`
- `review-comments.md`

If reviewing a GitHub PR, additionally produce:
- `pr.json`
- `pr-comments.txt`
- `reviews.json`
- `review-comments.json`
- `name-status.txt`
- `diff-stat.txt`

If reviewing another artifact, include the context files captured in Step 1 (for example, `context.md`, `diff.patch`, or similar) in the same directory.

## Guardrails

- Be explicit when uncertain; ask before making policy assumptions.
- Keep findings tied to changed code and immediate context.
- Prefer actionable, line-anchored comments over broad opinions.
- Do not opine on the severity, priority, or overall risk of findings, and do not recommend a review outcome (approve / request changes / block / merge). Surface the issues with evidence and let the human reviewer judge severity and decide the outcome.
- The "Prioritize logic over style" heuristics below order what to investigate; they are not a severity ranking of the issues you find.

## Review heuristics

Prioritize logic over style:
1. Incorrect acceptance/rejection criteria
2. Ambiguous first-match / order-dependent behavior
3. Unvalidated external response shapes
4. Pagination / truncation assumptions
5. Trust-boundary mismatches
6. Side effects on failure paths
7. Determinism and idempotency
8. Discretization & threshold semantics: exact-equality/`in`-set checks against floored, rounded, truncated, or otherwise quantized values; equality where crossing was intended. Time math (`timedelta.days` floor, timezone/DST, date vs datetime) is a frequent source.
9. Sampling cadence & scheduler reliability: cron/polling/scheduled jobs assume on-time, never-skipped, never-duplicated execution; a derived value sampled at these instants can jump past a target value or never be observed at it.
10. Condition reachability: a branch can be individually correct yet never (or rarely) reached because the controlling quantity skips its trigger value.

Separate clearly:
- logic hole (behavior bug)
- ambiguity (policy not explicit)
- missing tests (coverage gap)
