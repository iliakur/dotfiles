# CLAUDE.md

Global guidance for Claude Code across all repositories.

## Interactions

- Don't flatter me.
- Don't praise.
- Be brief.
- No opinions or recommendations unless I ask for them!

## Practices

- DON'T ADD INLINE COMMENTS! Keep existing ones.
- Use the least number of abstractions (classes or functions) **as possible**.

## Automated Tests
- Use pytest conventions, prefer standalone test functions and fixtures to classes.
- **Tests must only import public interfaces** - never import private functions or classes (those prefixed with underscore). Test behavior through the public API instead.
- Only mock what we own, here's a reference: https://hynek.me/articles/what-to-mock-in-5-mins/
- Always document the tests, here's a reference: https://hynek.me/articles/document-your-tests/
