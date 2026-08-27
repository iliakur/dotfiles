# Emacs Configuration

Lightweight vanilla Emacs configuration managed by chezmoi.

`config.org` is the authoritative literate configuration. `init.el` bootstraps
`straight.el`, ensures `use-package` is available, tangles `config.org` to
`config.el` only when needed, and loads the generated file.

## Current contents

- `early-init.el`: disables package.el startup and basic chrome early.
- `init.el`: bootstraps `straight.el` and `use-package`, then loads the tangled config.
- `config.org`: core behavior, Evil/Colemak movement, leader keys, Which-Key, Beacon, Olivetti, Vertico/Orderless/Consult completion and search, Embark actions, Corfu/Cape in-buffer completion, project.el bindings, Magit/git-link, Yasnippet, Tree-sitter, Python editing support, Elm editing support, minimal Org behavior, and small utility commands.
- `straight/versions/default.el`: frozen package revisions for this milestone.
- `.gitignore`: excludes generated `config.el` and straight.el build/cache state.

## Generated/local state

The generated `config.el` and package/build/cache directories are intentionally
not tracked.

## External dependencies

General navigation and search expect `git` and `ripgrep`.

Python support uses built-in `python`, `eglot`, and `flymake`, plus Corfu/Cape
completion from the main config. For a full Python workflow, install:

- Python
- `pyright` or `basedpyright` for `pyright-langserver`/`basedpyright-langserver`
- `ruff`
- `black`
- `pytest`

Elm support uses `elm-mode`, built-in `eglot` and `flymake`, and Corfu/Cape
completion from the main config. For a full Elm workflow, install:

- `elm`
- `elm-format`
- `elm-language-server`
