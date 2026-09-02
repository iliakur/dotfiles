# AGENTS.md

Guidance for coding agents working in `home/dot_emacs.d`.

## Source of truth

- `config.org` is authoritative.
- `config.el` is generated from `config.org`.
- Prefer editing `config.org` first, then regenerate `config.el`.
- If both are edited, keep them in sync immediately.

## Regenerating config

Use Emacs batch tangling when `config.org` changes:

```bash
emacs --batch -Q --eval "(require 'org) (org-babel-tangle-file \"~/.emacs.d/config.org\" \"~/.emacs.d/config.el\" \"emacs-lisp\")"
```

## Fast validation commands

Run these after any config edits:

1. Reader/parens sanity:

```bash
emacs --batch -Q --eval "(with-temp-buffer (insert-file-contents \"~/.emacs.d/config.el\") (emacs-lisp-mode) (check-parens) (princ \"PARENS_OK\\n\"))"
```

2. Init load sanity:

```bash
emacs --batch -Q -l ~/.emacs.d/init.el --eval '(princ "INIT_OK\\n")'
```

3. Debug startup failures:

```bash
emacs --debug-init
```

## Daemon/client troubleshooting

If Emacs appears hung:

1. Check daemon process:

```bash
ps aux | rg -i 'emacs|[Ee]macs' | rg -v rg
```

2. Check `emacsclient` connectivity:

```bash
emacsclient -n -e '(+ 1 2)'
```

3. If socket exists but client gets `Connection refused`, restart daemon and reconnect clients.

## Updating the package lock file

The file `straight/versions/default.el` pins package versions. Straight.el does not update it automatically when new packages are added.

After adding or removing packages in `config.org`:

```bash
emacs --batch -l ~/.emacs.d/init.el --eval '(straight-freeze-versions t)'
```

Then commit the updated `straight/versions/default.el`.

## Operational rules for agents

- Do not introduce partial edits that can leave unbalanced forms.
- After fixing generated `config.el`, also patch `config.org` so the fix survives retangle/restart.
- Keep changes minimal and localized.
