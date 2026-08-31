# Emacs Configuration

Lightweight vanilla Emacs configuration managed by chezmoi.

`config.org` is the authoritative literate configuration. `init.el` bootstraps
`straight.el`, ensures `use-package` is available, tangles `config.org` to
`config.el` only when needed, and loads the generated file.

## Current contents

- `early-init.el`: disables package.el startup and basic chrome early.
- `init.el`: bootstraps `straight.el` and `use-package`, then loads the tangled config.
- `config.org`: core behavior, Evil/Colemak movement, Spacemacs-style leader keys for jumping/window/buffer/file/frame/toggle commands, Which-Key, Beacon, Olivetti, Vertico/Orderless/Consult completion and search, Embark actions, Corfu/Cape in-buffer completion, project.el bindings, Magit/git-link, Yasnippet, Tree-sitter, Python editing support, Elm editing support, Markdown editing support, minimal Org behavior, and small utility commands.
- `snippets/`: custom Yasnippet snippets.
- `straight/versions/default.el`: frozen package revisions for this milestone.
- `.gitignore`: excludes generated `config.el` and straight.el build/cache state.

## Generated/local state

The generated `config.el` and package/build/cache directories are intentionally
not tracked.

## Package versions

Package versions are frozen with `straight.el` in
`straight/versions/default.el`. Startup should not silently update packages.

Normal package update workflow:

1. Start from a working configuration.
2. Create a Git branch.
3. Update packages intentionally.
4. Restart Emacs and smoke-test normal workflows.
5. Run `M-x straight-freeze-versions`.
6. Commit `straight/versions/default.el` together with any config changes.

If an update breaks startup or behavior, restore the lockfile and run
`M-x straight-thaw-versions`.

## External dependencies

`straight.el` pins Emacs packages only. System tools still need to be installed
outside Emacs.

### General

- `git`
- `ripgrep`

### Python

Python support uses built-in `python`, `eglot`, and `flymake`, plus Corfu/Cape
completion from the main config. For a full Python workflow, install:

- Python
- `pyright` or `basedpyright` for `pyright-langserver`/`basedpyright-langserver`
- `ruff`
- `black`
- `pytest`

### Elm

Elm support uses `elm-mode`, built-in `eglot` and `flymake`, and Corfu/Cape
completion from the main config. For a full Elm workflow, install:

- `elm`
- `elm-format`
- `elm-language-server`

### Tree-sitter

Tree-sitter grammars are installed on demand through Emacs/`treesit-auto`.
Missing grammars should not break startup.

### Fonts and theme

The config uses the Solarized Light theme and applies these fonts when they are
installed:

- `Inconsolata` for fixed-pitch text
- `Linux Biolinum` on macOS for variable-pitch text
- `Linux Biolinum O` on other systems for variable-pitch text
