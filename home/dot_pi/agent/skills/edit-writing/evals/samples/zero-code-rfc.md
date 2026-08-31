# [RFC] 2026-03-18 - Zero Code Agent Checks (Integrations)

## Overview

Every Datadog Agent integration today requires Python (or Go) code. We propose a system where we define an integration using a declarative specification file. Two things follow from checks being data rather than code.

1. For integration developers, specs are fast to review: a reviewer verifies metric names and config fields against upstream documentation, and CI validates everything else. Even reviewing AI-generated specs becomes trivial.
2. For the runtime, spec-defined checks open deployment paths that compiled or interpreted checks cannot support, for instance remote delivery.

There are still important open questions.

---

# Introduction

## Glossary

* _Check_ or _Integration._ Consistent with Datadog practice, we use these two words to refer to and "Agent-based Integration", as documented here: https://docs.datadoghq.com/extend/integrations/agent_integration/?tab=ootbintegration

## Problem

Agent integrations are expensive to build and maintain. The absolute majority of our integrations these days are converting OpenMetrics formatted metrics to Datadog metrics. A typical OpenMetrics integration requires:

1. **A Python check class** that subclasses `OpenMetricsBaseCheckV2`, overrides configuration, defines metric mappings, and handles transformations that diverge from the common path.
2. **A** `spec.yaml` defining configuration fields and their validation rules.
3. **A** `conf.yaml.example` generated from `spec.yaml` for user reference.
4. **A** `metadata.csv` listing every metric with its type, unit, and description.
5. **Tests** exercising the check against sample payloads.

Most of this work is mechanical. The developer is not writing business logic -- they are mapping OpenMetrics names to Datadog names, declaring metric types, and wiring up configuration fields that follow well-known patterns. The Python code amounts to glue between a fixed pipeline and a fixed output format.

This creates the following problems:

* **Review is the bottleneck, not authoring.** Writing the code is the easy part. The expensive part is reviewing it. A Python check mixes data (metric mappings, config fields) with logic (pipeline glue, edge-case handling). A reviewer must read through both to verify correctness. Even when an AI generates the check code, a human must still review every line. A declarative spec that contains only metric mappings and pipeline configuration is much easier to review: the reviewer checks that metric names match the upstream documentation and that the config fields are correct. CI validates the rest.
* **Checks are coupled to deployment.** A Python check is a file that ships with the Agent or an integration package. Adding a new check means releasing a new package, updating the Agent, and waiting for users to upgrade. There is no way to push a new check definition to a running Agent without shipping code.

We want a system where the developer writes one file that declares what the check does, and the tooling handles the rest: configuration validation, artifact generation, metadata extraction, and runtime execution.

## Constraints

* **The Agent's shared library FFI interface is the integration point.** The Agent loads checks via `dlopen`/`dlsym` on `Run` and `Version` C symbols. Any solution must produce a shared library (`.so`/`.dylib`/`.dll`) matching this interface. The Agent pushes metrics through callback function pointers in an `aggregator_t` struct (defined in `rtloader_types.h`).
* **Preserve the existing conf.yaml format.** Many users will continue to configure integrations through `conf.yaml` files. The generated `conf.yaml.example` must follow the same format and conventions as Python integrations to avoid breaking user expectations and existing documentation.
* **Metadata.csv format is fixed.** The Datadog platform consumes `metadata.csv` in a specific format. Generated metadata must match exactly.

## Requirements

* A developer must be able to define a complete OpenMetrics integration in a single specification file.
* The build tooling must generate `check.json`, `conf.yaml.example`, and optionally `metadata.csv` from this file.
* The Agent must be able to load and run the check via FFI with no per-integration compiled code.
* Configuration must be validated at runtime against a per-check schema derived from the specification.
* The specification format must support multiple pipelines (one per scrape endpoint) within a single integration.

## Decision Drivers

* **Review velocity.** The bigger time sink in integration implementation is not authoring – it is review. The solution should produce artifacts that a reviewer can verify easier than code.
* **Correctness by construction.** The specification format should make it difficult to express an invalid check. Validation should happen both at build time and at runtime.
* **Data-driven checks.** Checks defined as data (JSON) rather than code open deployment paths that compiled or interpreted checks cannot support: remote delivery, dynamic generation, and AI-assisted authoring.
* **Future extensibility.** While the first application is OpenMetrics, the spec format should accommodate other check types (other HTTP endpoint scrapers at the very least) without a redesign.

## Recommended Solution

### Architecture

The system has two components: a **build-time toolchain** (`devkit`) and a **runtime engine** (`check_engine`).

At build time, `devkit` compiles the CUE specification to JSON, validates it against an embedded JSON Schema, and generates configuration artifacts. At runtime, the Agent loads `check_engine.so`, passes the `check.json` content alongside `conf.yaml` to the `Run` function, and receives metrics through callback function pointers.

Unlike the existing `rustchecks` pattern (one cdylib per check containing custom Rust code), zero-code integrations contain no custom code. The check_engine library itself is the single `.so` for all integrations. The Agent passes a `check.json` spec -- plain JSON -- as a parameter to `Run`, and check_engine interprets it.

This separation of engine from definition is the most consequential choice in the design. Because a check is defined by a JSON document rather than compiled code, new possibilities open up:

* **Remote deployment.** The Agent could fetch check definitions from a remote endpoint. A new integration becomes available to all Agents without a package release or upgrade cycle.
* **Dynamic generation.** A service that knows which software a host runs could generate check definitions on the fly and push them to the Agent. Auto-discovery of OpenMetrics endpoints becomes a matter of producing the right JSON.
* **AI-assisted authoring.** An LLM can generate a `check.cue` file from an OpenMetrics endpoint's `/metrics` output. Because the result is a declarative spec -- not code -- a human reviewer can verify it by scanning metric names and config fields. CI validates the structure and runs the test suite. The review can take minutes, not hours.

### Why CUE for the Specification Format

Ultimately the specification will be in JSON, enforced by JSON Schema. However, writing raw JSON isn't the best for humans, so we propose a format that enhances the experience of **writing a Check.**

The specification language must satisfy three constraints:

* readable by developers unfamiliar with the tooling
* strict enough to prevent invalid configurations at authoring time
* expressive enough to support metric mappings, pipeline definitions, and configuration schemas in a single file

We chose CUE over YAML, JSON, TOML, and Jsonnet. Here is why:

1. **Built-in types and constraints.** CUE validates values against types at evaluation time. A field declared as `string` rejects integers without any external tooling. YAML and JSON have no type system; validation requires a separate JSON Schema step. With CUE, the schema.cue file defines types (`#CheckSpec`, `#Pipeline`, `#Metric`) that the check.cue file inherits. An invalid check.cue fails `cue export` before any Rust code runs.
2. **Composition without inheritance.** CUE lets developers merge structs with `&`. The ArgoCD integration, for example, defines `_general_metrics` (Go runtime + process metrics shared across 6 pipelines) and `_standard_phases` (shared phase configuration), then composes them into each pipeline. YAML has anchors and aliases, but these are shallow copies with no structural validation. Jsonnet has inheritance, but adds a full programming language where we want constrained data.
3. **JSON export is first-class.** `cue export --out json` produces the exact JSON we need for `check.json`. No custom serialization code, no template engine.

The tradeoff: CUE is less widely known than YAML. Developers must install the `cue` CLI. We accept this cost because YAML with external JSON Schema validation splits the spec across two files and loses the composition model that makes multi-pipeline integrations manageable.

### Why Rust

This section currently focuses on the long-term choice of runtime for zero-code checks. We understand that the most pragmatic incremental immediate step **may be** to extend the existing Python-based check machinery to support spec-driven checks.

The engine interprets a JSON spec at runtime: parse OpenMetrics payloads, apply transformations, emit metrics. Three languages are plausible -- Go, Python, and Rust. Each has a different relationship to the Agent.

#### What Rust provides

1. **The FFI interface already exists.** The Agent loads Rust shared libraries today through its shared library check framework (`pkg/collector/sharedlibrary/rustchecks/`). The C ABI types (`aggregator_t`, `MetricType`, callback signatures) are defined in `rtloader_types.h`. Writing check_engine in Rust means we use `cbindgen`-compatible types and `#[no_mangle] extern "C"` exports with no additional bridging layer. The integration path is proven.
2. **No runtime conflicts.** The Agent is written in Go. Loading a Go shared library into a Go process creates two Go runtimes -- each with its own garbage collector, goroutine scheduler, and heap -- competing for control of the same process. It is also very taxing on disk space. This is why the Agent's shared library framework was built for Rust, not Go. Rust compiles to plain machine code with C calling conventions and no process-wide initialization. Loading a Rust `.so` into a Go process is no different from loading a C library.
3. **Future compatibility with Agent Data Plane.** Agent Data Plane is a Rust-based runtime for data collection. A Rust engine compiled as a shared library can be loaded by both the current Go-based Agent (via FFI) and Agent Data Plane (as a native Rust dependency) with no rewrite.

#### The biggest risk with Rust

The "Agent Integrations" team as of this writing does not have experience running Rust in production. We have the most experience with Python.

That being said, we think the risk isn't a showstopper for the following reasons:

* Datadog as a company has some Rust experts in-house who we could loan to share their expertise as the team ramps up its skills.
* Coding assistants have **significantly** reduced the friction of jumping into a new language. So far  experience shows that the kinds of issues programmers focus on "while on AI" tend to be language-agnostic: design, core data-structures and their effect on performance.

#### Why not Python?

Python is the incumbent language for Agent integrations. The tooling, documentation, and developer muscle memory all favor it. However the same deterministic performance argument applies: CPython's reference counting and cyclic garbage collector introduce overhead and unpredictability that compounds when hundreds of checks run in the same interpreter. More importantly, a Python engine cannot be loaded by Agent Data Plane without embedding a Python interpreter -- recreating the exact coupling we want to move away from.

The traditional argument against Rust -- higher barrier to entry for integration developers -- does not apply here. Developers never write Rust. They write CUE specs. The Rust engine is infrastructure that the Agent Integrations team maintains, not something integration authors touch.

#### Why not a Go engine inside the Agent?

Another natural option: write the spec interpreter in Go, directly in the Agent codebase, alongside the existing Go check loader. No FFI, no shared library, no cross-language boundary.

Two problems make this unattractive:

1. **Deterministic performance.** Go's garbage collector introduces pauses that are unpredictable in timing and duration. When a check runs inside the Agent's Go runtime, its memory allocations compete with the rest of the Agent for GC attention. A large OpenMetrics payload that creates thousands of short-lived sample structs can trigger a GC pause that affects unrelated Agent components. Rust has no garbage collector. Memory allocation and deallocation happen at deterministic points in the code. When a check takes longer than expected, the cause is in the check -- not in a runtime process shared with the rest of the Agent. This makes performance issues easier to diagnose and reproduce.
2. **Future compatibility with Agent Data Plane.** A Go engine would require reimplementation when the runtime changes.

## Open Questions

### Testing Developer Experience

The current test setup requires a specific directory structure: a `tests/` folder next to `check.cue`, with subdirectories containing a payload file, a `conf.yaml`, and an expected `metrics.json`. The developer runs `no-code-agent-check run` and the tool compares actual output against the expected metrics.

This structure works well for the common case -- a single payload producing a known set of metrics. It becomes cumbersome when the developer wants to:

* Test multiple configurations against the same payload (e.g., with and without `histogram_buckets_as_distributions`).
* Test edge cases like empty payloads, malformed lines, or missing labels.
* Test multi-pipeline integrations where each pipeline has its own payload and endpoint configuration.

We need to balance two goals: make the simple case trivial, and make the complex case possible.

### Publishing Platform and manifest.json

Python integrations register with the Publishing Platform through a `manifest.json` that declares the integration's name, version, supported OS, assets (dashboards, monitors), and other metadata. The platform uses this file to manage the integration lifecycle: discovery, installation, upgrades.

Zero-code integrations need the same registration. Several questions are unresolved:

* **Who generates manifest.json?** The `devkit build` command already generates `check.json`, `conf.yaml.example`, and `metadata.csv`. Should it also generate `manifest.json` from the check spec, or should the developer maintain it separately?
* **Where does the manifest live?** Python integrations store `manifest.json` alongside the check code in `integrations-core` or `integrations-extras`. Zero-code integrations have no Python code. Do they live in the same repositories, a new repository, or somewhere else entirely?
* **How does versioning interact?** The manifest includes a version field. If zero-code integrations are deployed as JSON documents (potentially fetched remotely), the versioning model may differ from the current package-based model. The platform expects semver-style versions tied to release artifacts.

### Debugging in the Agent

When a Python check misbehaves, the developer has several diagnostic tools: the check logs to the Agent's log file, the Agent flare includes check configuration and recent output, and `agent check <name>` runs the check once with verbose output.

Zero-code checks running via FFI need equivalent observability. Several questions are open:

* **Logging.** The current FFI interface has no mechanism for the check to write log messages back to the Agent. The `Run` function either succeeds or returns an error string. Intermediate diagnostic information -- which metrics were filtered, which labels were enriched, why a sample was dropped -- is lost. Should we add a logging callback to the `aggregator_t` struct? Or should check_engine write to stderr and let the Agent capture it?
* **Flare contents.** Agent flares include check configuration (`conf.yaml`) and check status (last run time, error count). For zero-code checks, the flare should also include the `check.json` spec, since it fully determines the check's behavior. Should it include the raw `check.cue` as well, or only the compiled JSON?
* **Traces.** Python checks can emit APM traces for their own execution (HTTP requests, processing time). The FFI interface has no tracing callback. If we want to trace zero-code check execution, we need either a trace submission callback or a way for check_engine to emit traces through a shared tracing library.
