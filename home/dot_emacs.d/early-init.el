;;; early-init.el --- Early startup configuration -*- lexical-binding: t; -*-

(setq package-enable-at-startup nil)

;; Emacs warns when loading Elisp files without a lexical-binding cookie.
;; That warning type is `(files missing-lexbind-cookie ...)`.
;; Suppress only that warning class (e.g. old third-party packages).
(defvar warning-suppress-log-types nil)
(add-to-list 'warning-suppress-log-types '(files missing-lexbind-cookie))

;; Avoid first-startup stalls while Emacs native-compiles straight/use-package/org.
;; The config is intentionally small enough that JIT native compilation is not
;; worth making startup feel hung.
(when (boundp 'native-comp-jit-compilation)
  (setq native-comp-jit-compilation nil))

(when (fboundp 'menu-bar-mode)
  (menu-bar-mode -1))
(when (fboundp 'tool-bar-mode)
  (tool-bar-mode -1))
(when (fboundp 'scroll-bar-mode)
  (scroll-bar-mode -1))

;;; early-init.el ends here
