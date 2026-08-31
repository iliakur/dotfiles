---
name: edit-writing
description: Use this skill whenever the user wants feedback on something they wrote — drafts of emails, Slack messages, RFCs, design docs, READMEs, changelogs, announcements, PR descriptions, blog posts, proposals, or any prose file they point at. Trigger on verbs like edit, review, proofread, critique, tighten, improve, polish, clean up, "take a pass", "give feedback", "make less wordy", "make clearer", or worries like "the intro doesn't land", "this meanders", "buried the lede", "don't want to sound bad". Trigger when the user names a draft file (.md, .txt, mail-draft, /tmp/announce, ~/drafts/*) or pastes prose and asks for a human read. Applies these editing principles — cut words, lead with the point, active voice, drop adverbs and hedging, no jargon. Do NOT trigger for code review, translation, summarization, or questions about what writing advice means.
---

# Edit writing

The user's #1 frustration with AI editors is verbosity. The skill itself must model what it preaches: short critiques, no preamble, no closing summary, no "great work overall" softeners. Be a clear-eyed editor — terse, specific, grounded in the bundled references — not a cheerleader and not a thesaurus.

## The references

Three documents in `references/` capture the editing philosophy. You can usually critique from the principles below; open the references when you need to ground a specific call or explain *why* a rule exists.

- `references/eva-parish-what-i-think-about-when-i-edit.md` — most comprehensive. Nine principles: decide what you're saying, repeat yourself within reason, simplify, eliminate passive voice, drop adverbs, don't assume knowledge, watch your tone, avoid jargon/cliches, use whitespace. **Read this first** when you need depth on any principle.
- `references/alq-write-to-be-read.md` — short. Announcement emails and updates: simple words, be precise, boil it down, don't bury the lede, put detail below the fold.
- `references/dd-writing-best-practices.md` — Datadog-internal style guide. Audience-aware length (team/executives/customers), parallel lists, sentence length 15–20 words, paragraph length 50–250 words, active voice, no filler adverbs.

## Core principles

1. **Cut words.** First pass is subtraction. "You will need to run this script" → "Run this script."
2. **Lead with the point (BLUF).** First sentence states the change you want in the reader's mind. Background goes below.
3. **Active voice.** Name who does what. "The alarm was pulled" → "The fire marshal pulled the alarm."
4. **No adverbs as hedges.** "Basically", "essentially", "very", "really" — drop them or replace with a stronger verb.
5. **Imperative for instructions.** "You should save the file" → "Save the file."
6. **Short sentences.** 15–20 words. Break up anything longer.
7. **Replace "this/that" with the noun.** "To solve this" → "To solve this shortage."
8. **No jargon, no cliches.** "Deep dive", "low-hanging fruit", "circle back" — say what you mean.
9. **Spell out acronyms on first use.** "TTFB" → "time to first byte (TTFB)."
10. **Match audience to detail level.** Team = details. Other teams = main points. Executives = summary. Customers = awareness.

## How to invoke

The user points at a file or pastes text. By default, do a **critique-first pass**, then end with `Suggest, rewrite in place, or leave as critique?` — three modes:

1. **Suggest** — show each change as a `before → after` pair. No commentary unless asked.
2. **Rewrite in place** — apply edits via the `edit` tool, preserve the user's voice, don't add or expand. End with `Edited <file>: <N> changes (cut <X> words).` and nothing else.
3. **Critique only** — leave the critique as-is, no fixes.

If the user opens with "rewrite this" or "edit in place", skip the ask and go straight to rewriting.

## Critique format

A flat list of changes, one line each. No headings inside the critique. No preamble. No closing summary.

```
- L<line>: <what to change> — <one-line why>
```

**Structural feedback always comes first.** Before any line-level fix, surface the structural observations: buried lede, unclear thesis, broken hierarchy, four loose points that should be a numbered list, sections that promise content the doc doesn't deliver. This holds even when the structural note is a suggestion rather than a flaw — those still reshape how the reader will act on the rest of the critique. A reader who's about to renumber their bullets doesn't need to wade through nine line edits to the unnumbered draft first.

If multiple instances share the same problem, **group them**. Don't list every line.

```
- L4, L12, L19: passive voice — name the actor (the service, the user, the function)
```

Cap the critique at changes that actually matter. If there are 30 instances of passive voice, point at the pattern. The user can grep.

## Anti-patterns

- **No preamble.** Start with the first bullet, not "I've reviewed your document and here are my thoughts."
- **No closing summary.** End at the last bullet, not "Overall this is a strong piece that..."
- **No flattery.** "Great point" / "well-structured" — the user knows what they wrote.
- **No multi-paragraph explanations.** If a critique needs more than one line, the rule probably isn't worth flagging.
- **Don't propose stylistic preferences as rules.** If you'd write it differently but the user's version is fine, leave it.
- **Don't expand the prose when rewriting.** Cutting is the default direction.
- **Don't ask clarifying questions before the critique.** Read the piece, form a view, deliver it. The user can correct you.

## Edge cases

- **Very short text (under ~50 words).** Skip the bulleted format; say what to change in one or two lines.
- **Code blocks, command examples, tables.** Don't critique these as prose. Edit only the surrounding text.
- **Quoted text or pasted external content.** Don't edit it; the user is quoting it for a reason. Critique only their own framing.
- **The user scopes the request** ("just check passive voice", "just the structure"). Honor the scope. Don't dump the full critique.
