;;; early-init.el --- Early startup configuration -*- lexical-binding: t; -*-

(setq package-enable-at-startup nil)

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
