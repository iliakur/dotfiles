---
name: gh-ddtool-auth
description: Authenticate gh CLI using ddtool before running GitHub CLI commands. PROACTIVELY invoke this skill whenever gh returns HTTP 401/Bad credentials, gh auth status shows a login failure, GH_TOKEN is missing or expired, or a ddoghq/* repo returns HTTP 404. Do NOT suggest `gh auth login` — always use ddtool instead.
---

## Two GitHub orgs, two tokens

Datadog uses two GitHub organizations with separate tokens:

| Org | Account | Token command |
|-----|---------|---------------|
| `DataDog/*` | `iliakur` | `ddtool auth github token` (default) |
| `ddoghq/*` | `ilia-kurenkov_ddog` (EMU) | `ddtool auth github token --org ddoghq` |

A 404 on a `ddoghq/*` repo almost always means the wrong token is being used — the `iliakur` token has no access to the EMU org.

## Usage

For `DataDog/*` repos (default):

```bash
GH_TOKEN="$(ddtool auth github token)" gh <args>
```

For `ddoghq/*` repos (EMU org):

```bash
GH_TOKEN="$(ddtool auth github token --org ddoghq)" gh <args>
```

Or export once per session if running multiple commands:

```bash
# DataDog org
export GH_TOKEN="$(ddtool auth github token)"

# ddoghq EMU org
export GH_TOKEN="$(ddtool auth github token --org ddoghq)"
```

When another skill or script invokes `gh` in a Datadog-owned private repo, wrap the command with `GH_TOKEN=...` instead of relying on ambient `gh` auth. Ambient credentials can be stale and return `HTTP 401: Bad credentials` even though `ddtool` can mint a valid token immediately.

## git pull / push fails even after setting GH_TOKEN

If `git pull` or `git push` fails with "Authentication failed" even though `GH_TOKEN` is set, check whether the remote URL has credentials embedded in it:

```bash
git remote -v
# Bad:  origin  https://x-token-auth:ghu_OLD_TOKEN@github.com/DataDog/repo.git
# Good: origin  git@github.com:DataDog/repo.git
```

Embedded credentials take priority over `GH_TOKEN` and `credential.helper`, and they also prevent the global `url.insteadOf` rewrite (`https://github.com/` → `git@github.com:`) from firing — because the embedded-credential prefix doesn't match.

Fix it by switching to SSH — no secret in the URL, no expiry:

```bash
git remote set-url origin git@github.com:DataDog/marketplace.git
# ddoghq: git remote set-url origin git@github.com:ddoghq/repo.git
```


## Diagnosing which token you need

If a `gh` command returns HTTP 404 on a `ddoghq/*` repo, verify which account the current token belongs to:

```bash
GH_TOKEN="$(ddtool auth github token --org ddoghq)" gh api user --jq .login
# Expected: ilia-kurenkov_ddog
```

If it returns `iliakur`, the `--org ddoghq` flag was not used.
