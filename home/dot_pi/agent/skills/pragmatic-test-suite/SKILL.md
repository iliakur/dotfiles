---
name: pragmatic-test-suite
description: Design or review a software test suite using Rex Black's risk-based, lifecycle-oriented approach from Pragmatic Software Testing. Use when asked for a test strategy, test plan, coverage model, test-suite review, test estimation, release criteria, defect workflow, or advice on making testing more effective and efficient.
---

# Pragmatic Test Suite

Apply a condensed, operational version of Rex Black's *Pragmatic Software Testing*: testing is a managed investigation that gives stakeholders timely, credible information about product quality and release risk. It samples behavior; it does not prove the absence of defects.

## Choose the mode

- **Design:** propose a suite or strategy. Do not write tests unless asked.
- **Review:** inspect the existing suite, its test results, and the behavior or requirements it claims to cover. Report gaps before editing anything.
- **Improve:** after reviewing, make the requested test changes and run the smallest relevant checks.

If the target, stakeholders, release decision, requirements, or constraints are unclear, ask only the questions whose answers would materially change the suite. Otherwise state assumptions and proceed.

## Gather evidence

Inspect available sources rather than inferring coverage from test names alone:

1. Product goals, users, quality expectations, and release decision.
2. Requirements, acceptance criteria, architecture, interfaces, data flows, and operational environment.
3. Changed and failure-prone areas, defect history, support incidents, and production telemetry.
4. Existing tests, fixtures, data, environments, CI configuration, results, quarantines, and flaky-test records.
5. Schedule, people, tools, environment availability, and other constraints.

In review mode, trace representative tests through setup, stimulus, oracle, cleanup, and the production path they exercise. Distinguish asserted behavior from code merely executed.

## Build a quality-risk model

A **quality risk** is a possible product failure and its consequences. Write each risk as a concrete failure, not as a component name.

For every risk record:

- affected stakeholder or user;
- failure and triggering conditions;
- impact if it occurs;
- likelihood, considering complexity, novelty, change, dependencies, defect history, and usage;
- detectability before release when useful;
- priority using a simple documented ordinal scale;
- planned test coverage and remaining exposure.

Use stakeholder input to rank risks. Avoid unsupported numeric precision. Priority determines test effort, order, depth, independence, environment fidelity, and regression frequency. It does not justify ignoring low-priority risks without recording the decision.

Start with these risk categories, then adapt them:

- functional correctness and completeness;
- data integrity, transactions, migration, and recovery;
- security, privacy, permissions, and abuse;
- reliability, availability, resilience, and failover;
- performance, capacity, scalability, and resource use;
- compatibility, configuration, installation, upgrade, and rollback;
- usability, accessibility, localization, and documentation;
- interoperability with external systems;
- operability, diagnostics, monitoring, and supportability;
- compliance, contractual, financial, and safety consequences.

## Design coverage

Map each important risk to one or more test conditions before selecting individual cases. Cover across the relevant levels: unit/component, integration/API, system/end-to-end, and acceptance/operational. Put a test at the lowest level that can reveal the risk credibly, while retaining higher-level tests for interactions and stakeholder-visible journeys.

For each condition, choose techniques deliberately:

- **Equivalence partitioning:** one or more representatives from each valid and invalid class.
- **Boundary-value analysis:** values at, immediately below, and immediately above boundaries.
- **Decision tables:** meaningful combinations of rules and outcomes.
- **State-transition testing:** states, valid and invalid transitions, repeated transitions, and recovery.
- **Use-case/scenario testing:** main, alternate, exception, and interrupted flows.
- **Combinatorial testing:** pairwise or stronger interaction coverage for configuration-heavy behavior.
- **Structural testing:** statement, branch, condition, or path evidence where code visibility makes it useful.
- **Experience-based testing:** error guessing, defect-taxonomy checks, and time-boxed exploratory charters.

Vary more than nominal inputs. Include missing, malformed, extreme, duplicate, unordered, concurrent, stale, interrupted, unauthorized, degraded-dependency, timeout, retry, and partial-failure cases when applicable. Test error handling and recovery, not just error detection.

Maintain bidirectional traceability:

`stakeholder need -> quality risk -> test condition -> test case/charter -> result -> defect`

Traceability should reveal important uncovered risks and obsolete tests. It is not a paperwork goal.

## Engineer the suite

Every scripted test needs:

- a specific objective or risk;
- controlled preconditions and explicit data;
- observable stimulus;
- an oracle that can distinguish acceptable from unacceptable behavior;
- expected results, including side effects and forbidden effects;
- isolation or cleanup appropriate to the level;
- stable diagnostics that make failures actionable.

Prefer tests that are sensitive to relevant failures, specific about their cause, repeatable under controlled conditions, and maintainable when intended behavior changes.

Use production-like environments where the risk depends on deployment, topology, data volume, timing, permissions, hardware, or external services. Record material differences between test and production environments as residual risk.

Treat automation as an investment, not a goal. Automate when repeated execution, precision, scale, or fast feedback repays implementation and maintenance cost. Keep human-led testing for discovery, usability, ambiguity, and novel risks. Do not count automated cases as a proxy for effectiveness.

Partition regression tests by purpose and cadence, such as commit smoke, component regression, integration regression, end-to-end critical paths, and scheduled non-functional tests. Remove duplicates and tests whose cost exceeds the information they provide.

## Plan execution and control

Define:

- scope and explicit exclusions;
- test levels, types, techniques, and test basis;
- roles and required independence;
- environments, data, tools, and configuration control;
- dependencies, entry criteria, suspension/resumption criteria, and exit criteria;
- execution order based on risk, dependencies, and early feedback;
- estimates with assumptions and contingency;
- defect triage, retest, regression, and reporting workflow.

Estimate from identifiable work: analysis, design, implementation, environment and data preparation, execution, defect investigation, retest, regression, reporting, and coordination. Use historical data when available. State confidence and assumptions rather than presenting a single unsupported date.

During execution, preserve the tested build, configuration, data, testware version, actual result, evidence, and disposition. A blocked or unexecuted test is not a pass.

A useful defect report contains a concise summary, environment/build, preconditions, minimal reproduction steps, expected and actual results, evidence, reproducibility, impact, and links to the revealing test and risk. Separate observed facts from hypotheses.

## Evaluate and report

Judge completion against risks and exit criteria, not case counts alone. Report:

- which important risks were tested and with what result;
- important risks not tested or tested under weak conditions;
- failed, blocked, skipped, flaky, and not-run tests separately;
- open defects and their relationship to quality risks;
- environment or test-data limitations;
- regression status and change since the prior report;
- residual risk and decisions needed from stakeholders.

Use metrics only when they answer a decision question. Useful candidates include risk coverage, requirement coverage, planned-versus-executed conditions, pass/fail/block trends, defect discovery and closure trends, escaped defects, defect detection percentage when later defect data exists, flake rate, and time to diagnose. Explain denominator, time window, and caveats. Never use a metric as a target when gaming it would reduce test value.

Exit criteria may include required high-priority risk coverage, acceptable results for critical journeys, no unresolved defects violating an agreed threshold, regression completion, and accepted residual risks. Passing exit criteria informs a release decision; testers do not silently redefine business acceptance.

After a test phase or release, compare predicted risks with found and escaped defects. Update the risk model, regression suite, estimates, environments, and process.

## Review rubric

Classify each finding as one of:

- **Risk-model gap:** an important failure mode is absent or badly prioritized.
- **Coverage gap:** a known risk lacks an adequate condition, level, technique, or environment.
- **Oracle gap:** the test runs behavior but cannot reliably detect the relevant failure.
- **Data/environment gap:** fixtures or infrastructure cannot represent the target risk.
- **Execution/control gap:** results are not reproducible, attributable, or configuration-controlled.
- **Lifecycle gap:** planning, triage, reporting, exit criteria, or learning is missing.
- **Efficiency gap:** duplication, brittleness, excessive setup, wrong test level, or low information value wastes effort.

For every finding provide:

1. evidence with file, test, requirement, or result anchors;
2. the quality risk or decision affected;
3. the concrete failure that can escape or waste that occurs;
4. the smallest practical correction;
5. a way to verify the correction.

Do not infer good coverage from line coverage, case count, a green pipeline, or the presence of an end-to-end test. Do not demand exhaustive testing. Make trade-offs explicit.

## Output

Use only sections relevant to the request, in this order:

### Mission and context
State the product/release decision, stakeholders, constraints, evidence inspected, and assumptions.

### Quality-risk register
Use a table with: `Risk`, `Stakeholder/impact`, `Likelihood basis`, `Priority`, `Existing or proposed coverage`, `Residual exposure`.

### Coverage map
Map risks to levels, techniques, environments/data, and cases or charters. Call out positive, negative, recovery, regression, and non-functional coverage where relevant.

### Findings
For reviews, list evidence-backed findings using the review rubric. Keep coverage absence distinct from observed product defects.

### Suite design or changes
For designs, give the proposed suite grouped by feedback cadence or test level. For improvements, state what changed and the checks run.

### Execution and reporting
Give entry/exit criteria, ordering, environment needs, defect flow, and decision-oriented metrics when requested or necessary.

### Residual risks and open questions
List explicit exclusions, weak test conditions, blocked work, unresolved policy questions, and stakeholder decisions.

Keep the result proportional to the target. Prefer a small risk-to-test matrix over a generic testing checklist.
