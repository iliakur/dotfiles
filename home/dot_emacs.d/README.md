# Emacs Configuration

Lightweight vanilla Emacs configuration managed by chezmoi.

`config.org` is the authoritative literate configuration. `init.el` bootstraps
`straight.el`, ensures `use-package` is available, tangles `config.org` to
`config.el` only when needed, and loads the generated file.

## Phase 1 contents

- `early-init.el`: disables package.el startup and basic chrome early.
- `init.el`: bootstraps `straight.el` and `use-package`, then loads the tangled config.
- `config.org`: minimal core behavior only.
- `straight/versions/default.el`: frozen package revisions for this milestone.

## Generated/local state

The generated `config.el` and package/build/cache directories are intentionally
not tracked.
