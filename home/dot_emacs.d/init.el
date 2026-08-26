;;; init.el --- Bootstrap package management and literate config -*- lexical-binding: t; -*-

(defvar ik/config-org (expand-file-name "config.org" user-emacs-directory)
  "Authoritative literate Emacs configuration file.")

(defvar ik/config-el (expand-file-name "config.el" user-emacs-directory)
  "Generated Emacs Lisp configuration file.")

;; Bootstrap straight.el.
(defvar bootstrap-version)
(let ((bootstrap-file
       (expand-file-name "straight/repos/straight.el/bootstrap.el" user-emacs-directory))
      (bootstrap-version 7))
  (unless (file-exists-p bootstrap-file)
    (with-current-buffer
        (url-retrieve-synchronously
         "https://raw.githubusercontent.com/radian-software/straight.el/develop/install.el"
         'silent 'inhibit-cookies)
      (goto-char (point-max))
      (eval-print-last-sexp)))
  (load bootstrap-file nil 'nomessage))

;; Install and load use-package. Configuration belongs in config.org.
(straight-use-package 'use-package)
(require 'use-package)
(setq straight-use-package-by-default t)

;; Tangle config.org only when generated config.el is missing or stale.
(when (or (not (file-exists-p ik/config-el))
          (file-newer-than-file-p ik/config-org ik/config-el))
  (require 'org)
  (org-babel-tangle-file ik/config-org ik/config-el "emacs-lisp"))

(load ik/config-el nil 'nomessage)

;;; init.el ends here
