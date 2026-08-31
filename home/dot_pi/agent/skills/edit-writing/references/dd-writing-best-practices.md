# Best Practices for Writing

### Why Write Well?

Clear communication will lead to better comprehension
→

…which will lead to better collaboration
→

…which will result in better quality work
→

“Clear communication” extends beyond things like Slack, email, and verbal comms. All pieces of work – code included! – rely on clarity for comprehension.

* Comments and threads on slacks, emails, and documents
* RFCs
* Design documents
* Architecture diagrams
* Performance feedback
* READMEs
* PR comments
* API documentation
* External- and internal- facing product documentation
* Newsletters
* Blogs
* …the list goes on!

### Good Practices: Goals and Audience

Who you are writing for often determines length, details, and tone:

* **Your team:** provide **details**
* **Other teams:** provide **main points**
* **Executives:** provide **summarization**
* **Customers**: provide **awareness**

Identify your audience (one of the above, or another audience) and write to those readers:

* Speak directly to your audience
* Use **language** your reader understands and feels comfortable with
* Be aware of your reader’s **level of knowledge**
* Focus on what **they want to know** then provide just enough context
* **Tell them** **why** the material is important to them

### Good Practices: Order and Organization

* Put general or important information first, and place background or detailed information, complex phrases, and exceptions later:
  * ❌ **Important information is hidden in the text**
    _“Except as described in the Appendix, the Incident Manager will not begin the review period of the program until the preliminary review determines that your Postmortem is complete.”_
  * ✅ **Important information is highlighted immediately**
    _“The Incident Manager will not review the program until the Postmortem is written and approved. See the Appendix for exceptions to this guideline.”_
* Separate/break up information into manageable units.
* Within a document, organize information by content type (facts, concepts, principles, procedures, processes, proposals, etc.) and documentation type (white papers, how-to guides, reference material).
* Provide context with titles and headings.
* Use lists to clarify ideas when there is a lot information:
  * Numbered lists when sequence _**is**_ important
  * Bullets when order is _**not**_ important
* Minimize levels of indentation:
  * too many
    * levels are
      * confusing
        * and hard to navigate!
* Keep your lists parallel/in the **same** grammatical form:
  * Same **part of speech** (nouns, verbs)
  * Same **verb tense** (present, past, future)
  * Same **voice** (use active voice, avoid passive voice)
  * Same **sentence type** (statement, question)
* Keep your work – beyond lists! – parallel, too:
  * Repetitive things can be boring to write, but they are really easy to read and understand.
  * Consistency builds readability and credibility.
* Examples of parallelism in writing:
  * ❌ He loved to travel, reading, and jumped on the volleyball court very often.
  * ✅ He loved to travel, read, sail, and play volleyball.

### Good Practices: Language, Grammar, and Punctuation

#### Simplicity

_Titles and headings_ should be 10 words or less. _Subtitles_ (if you need them) are generally 3–7 words. _Sentences_ should contain 15–20 words (or less!). Sentences should also have an easy-to-follow construct: subject + verb + object. _Paragraphs_ should have 50–250 words, or about 3–8 sentences.

❌ **Difficult-to-follow construct:**
“It is important to note that you need to be very careful when modifying your source code.”

✅ **Clear, subject + verb + object construct:**
“Be careful when you modify your source code.”

❌ **Too long [22 words]:**
“It is suggested that the wire should be connected to the terminal by the engineer when the switch-box assembly is completed.”

✅ **Shorter and simpler [13 words]:**
“Connect the wire to the terminal when you finish assembling the switch-box.”

#### Verb Tense and Voice

* Use simple verb tenses: past, present, and future.
* Use the active voice, where the subject performs an action stated by the verb.
* Address your reader as “You”.
* Remove ambiguity as to who is doing what:
  * ❌ Mary kicked off the meeting for Susan, wearing a pink ballgown.
    * Who is wearing the ballgown? Mary or Susan?
  * ✅ Mary put on her best ballgown, and kicked off the meeting for Susan.
* Avoid the passive voice, where the subject is being acted upon by the verb.

❌ **Passive Voice**
“It is suggested that the wire be connected”
“when the assembly is completed”
“The facts were checked by me.”

✅ **Active Voice**
“Connect the wire”
“when you finish assembly”
“I checked the facts.”

#### Voice

* **Avoid useless adverbs**
  If you feel the need to use “very,” “super,” “basically,” or similar words, there is probably a stronger word to use in place.
* **On that note… avoid useless adjectives**
  Are they all necessary? Would a more specific noun choice be better? Is it a big house or a mansion? A brimmed hat or a fedora?
  * ❌ The polished state of the tool helps the wide customer base use it as efficiently as possible.
  * ✅ The tool is in production, and all customers are able to use it.
* **Check homonyms and homophones**
  These are words that are pronounced the same but spelled differently (for example, “they’re” and “their”) – double-check your work
