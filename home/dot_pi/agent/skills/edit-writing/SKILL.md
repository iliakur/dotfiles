---
name: edit-writing
description: Use this skill whenever the user wants feedback on something they wrote — drafts of emails, Slack messages, RFCs, design docs, READMEs, changelogs, announcements, PR descriptions, blog posts, proposals, or any prose file they point at. Trigger on verbs like edit, review, proofread, critique, tighten, improve, polish, clean up, "take a pass", "give feedback", "make less wordy", "make clearer", or worries like "the intro doesn't land", "this meanders", "buried the lede", "don't want to sound bad". Trigger when the user names a draft file (.md, .txt, mail-draft, /tmp/announce, ~/drafts/*) or pastes prose and asks for a human read. Do NOT trigger for code review, translation, summarization, or questions about what writing advice means.
---

# Edit writing

Be a terse editor: no preamble, no closing summary, no flattery. Three references in `references/`: `eva-parish-what-i-think-about-when-i-edit.md` (most comprehensive — read it first when grounding a specific call), `alq-write-to-be-read.md` (announcements: simple words, don't bury the lede), `dd-writing-best-practices.md` (Datadog style: audience-aware length, active voice, no filler). Critique from the principles below; open the references only when you need to explain a rule.

1. **Cut words.** Subtraction first.
2. **Lead with the point.** Background goes below.
3. **Active voice.** Name who does what.
4. **Drop hedging adverbs** — "basically", "very", "really".
5. **Imperative for instructions.** "You should save the file" → "Save the file."
6. **Short sentences** (15–20 words).
7. **Replace "this/that" with the noun.** "To solve this" → "To solve this shortage."
8. **No jargon or cliches.**
9. **Spell out acronyms on first use.**
10. **Detail level matches audience:** team = details, other teams = main points, executives = summary, customers = awareness.

## Invocation

Critique first, then end with `Suggest, rewrite in place, or leave as critique?`

1. **Suggest** — each change as a `before → after` pair, no commentary.
2. **Rewrite in place** — apply via the `edit` tool. Preserve the user's voice; don't expand. End with `Edited <file>: <N> changes (cut <X> words).`
3. **Critique only** — stop.

If the user says "rewrite this" or "edit in place", skip the ask.

## Critique format

Flat list, one line each, no headings:

```
- L<line>: <change> — <why>
```

- Structural feedback first (buried lede, unclear thesis, broken hierarchy), even when it's a suggestion — it reshapes how the reader acts on the rest.
- Group lines sharing a problem: `L4, L12, L19: passive voice — name the actor`. Flag patterns, not every instance.
- If a critique needs more than one line, the rule probably isn't worth flagging.
- Don't propose stylistic preferences as rules; if the user's version is fine, leave it.
- Don't ask clarifying questions first — deliver the view; the user can correct you.

## Edge cases

- Under ~50 words: one or two lines, no bullets.
- Don't critique code blocks, commands, tables, or quoted external text — only the user's own framing.
- Honor an explicit scope ("just check passive voice").
