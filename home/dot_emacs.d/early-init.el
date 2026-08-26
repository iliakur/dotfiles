;;; early-init.el --- Early startup configuration -*- lexical-binding: t; -*-

(setq package-enable-at-startup nil)

(when (fboundp 'menu-bar-mode)
  (menu-bar-mode -1))
(when (fboundp 'tool-bar-mode)
  (tool-bar-mode -1))
(when (fboundp 'scroll-bar-mode)
  (scroll-bar-mode -1))

;;; early-init.el ends here
