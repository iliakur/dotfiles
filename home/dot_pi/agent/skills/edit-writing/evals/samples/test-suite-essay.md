Still a Work In Progress! The main ideas are there though.

What you'll get out of this:

* common-sense conceptual framework for thinking about your tests…
* … OR at least another annoying opinion that prompts you to think about your tests

What you won't get

* new fuel for buzzword-bingo
* recommendations for test tools, mocking libs etc.

# Introduction

So far in my experience when it comes to automated testing our industry is a mess. They say _you should write tests_. However when we sit down to write them we get hit with a whole slew of questions and dilemmas. We search for answers, but we find wildly different opinions and tons of jargon.

Take for instance the whole discussion about _unit_, _integration_, _end-to-end_ tests. Everyone has their own understanding of those terms. Some [even argue](https://martinfowler.com/articles/practical-test-pyramid.html) that this is OK! Then why introduce any terms in the first place? An example of spending too much time on jargon is the famous "[Mocks aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)" article.

In part due to this abundance of undefined terms I see most conversations about tests devolve into ideological disputes that go nowhere. As a result we code grunts give up on finding any systematic approach and write our tests ad-hoc.

What I see in practice:

* Test suites that slow down development instead of speeding it up.

    * It's not easy or quick to add new tests.
    * Tests know so much about the implementation that they need adjusting in order to refactor said implementation.
    * Tests take long to run both on a developer's machine and in CI.

* Test suites that are a pain to maintain.

    * Non-deterministic tests are a drag on attention and erode confidence in the test suite.
    * Complex test rigs need devops-level care to stay usable.

* Tests get written just to tick the box "we have tests". We don't evaluate their business value.

    * Some are testing trivial things.
    * Some are so narrow and/or surrounded by mocks that they barely exercise any code.


* A test that creates an instance of a class, then checks that fields defined on this class are present in the instance and have values that we passed when creating the instance. Do we not trust our programming language to do its job?
* A test that exercises some very small helper function `foo(x)` that does something simple like `x + CONSTANT`. Can we find the customer who cares about this particular test?

I have yet to see an approach that starts with **why** we test, then uses that to inform **what** and **how** we test. I don't expect anything deep or ground-breaking, just coherent.

In that spirit, let's first ask ourselves **why do we test in the context of commercial software?** The answer is simple: we want to catch problems **before** customers do. Why does it matter that we catch problems before customers? It's essentially about risk management. We want to minimize the risk of releasing something that breaks a customer (and costs us money).

This leads us to the following definition:

Tests help minimize risk by **signaling when a change breaks customer-visible functionality.**

When I say _signal_ I don't mean physical signals, but rather:

> **an** action**,** movement**, or** sound **that gives** information**, a** message**, a** warning**, or an** order**:**

Source: https://dictionary.cambridge.org/dictionary/english/signal

This definition consists of 3 salient parts:

* Tests protect customer-visible functionality.
* Tests track changes that can be risky.
* Tests are a signal.

What we'll do in the following sections is explore these parts one by one.

**Terms and References**

I didn't have time to polish this. Here are some rough edges I'm aware of:

* I use _user_ and _customer_ to refer to the same thing. It's the people who justify the existence of the software in the first place. Some of them pay, some don't, but they exert very similar pressure on the tests. If I had more time I'd stick to one term.
* I provided all the references I collected on this topic over the years. If I had more time I'd indicate which ideas came from where. For what it's worth, I don't claim any originality. If you think you've heard/read an idea somewhere else, then you probably have.

# Focus on the Customer

Let's start by taking things to the extreme:

**You don't need any tests if you don't have any customers!**

Bringing this down to earth: prototypes and POCs don't need tests. At that point there's no evidence that customers will care enough for the proposed product to justify the time investment. Even Google agrees, and they take testing so seriously they have a separate "Test Engineer" role.

Things are not as clear when we look at internal tooling. Sure, there's no paying customer that's using it. However, do we want to add more chaos to our colleagues' days because of buggy and unreliable tools? I can see how that can affect the bottom line:

1. it costs time
2. it costs morale

So whether or not to add tests to tooling boils down to specific cost/benefit tradeoffs.

The next sound-byte:

**Only test behavior visible to the customer!**

Seems obvious, right? And yet…

I regularly see Python tests that focus on private and semi-private code. Here's a contrived example to avoid pointing any fingers:

```python
class Trash:
    def collect(self): # This is what our users will call directly.
        ...
        self._collect_recycling()
        ...

    def _collect_recycling(self): # Users aren't meant to call this directly.
        ...

def test_collect_recycling():
    # Aaaand there goes our encapsulation!
    # Might as well make `_collect_recycling` public :(
    assert Trash()._collect_recycling()
```

Both Go and Rust have a culture that promotes testing individual sub-modules in a system **without regard for its interface to the end user**. Before I get attacked by Rustaceans, here's a direct quote from [The Book](https://doc.rust-lang.org/stable/book/ch11-03-test-organization.html) (highlight mine):

> _Unit tests_ are small and more focused, testing one module in isolation at a time, and can test private interfaces.

My guess is that the JS ecosystem suffers from something similar.

You can mitigate the situation by limiting yourself to the public interfaces of your sub-modules, but you're still making a big commitment to the structure of your system. This structure is an implementation detail from the point of view of your customers!

With libraries the sub-module structure you expose **is your user-facing interface.** Testing on that level is consistent with what I'm arguing for.

"The Agile Test Pyramid" is in large part to blame for this. It approaches tests only from the point of view of engineers. Engineers are biased towards writing lots of "small fast tests":

* We feel great and productive writing all them little tests.
* We feel great and thorough checking all them edge-cases. We're engineers after all!
* It's up to us, the engineers, to define what a _unit_ is. This often ends up being "the part  that I can wrap my (little) brain around" or "the part that's **easy** to test".
* We can stay in our comfort zone by mocking out any dependencies that we **think** we should. In practice this is determined by convenience more than anything else.
* We don't need to **design** our test suite, we can just throw a bunch of these "small tests" at the problem and keep our CI fast and green.

Let's highlight just a few of the downsides of this approach:

* Getting stuck in rabbit holes while exploring edge-cases. When we test inputs to a specific module, we're tempted to be exhaustive **from the point of view of that module**. It's harder to see that some inputs are impossible **given how the module is used in the overall system**. By testing these impossible inputs we spend time on stuff that customers don't care about.
* Our test suite now knows a lot about our application, **they are tightly coupled**. That makes refactoring the system difficult or even impossible. This is brought up as an argument against _unit tests_. Implicit in that argument is "The Agile Test Pyramid" definition of _unit._
* Heavy and undisciplined use of mocking detaches our tests from important parts of reality. We're more likely to have a happy green test suite while our releases break.

If we take testing user-visible behavior seriously, then our go-to choice should be what "The Agile Test Pyramid" calls _end-to-end tests_!! These tests become part of the value of our software, they provide an executable spec that customers can hold us accountable to.

To conclude, here's a pragmatic sound-byte take:

Make tests as close to end-to-end (a.k.a. _e2e_) tests _as possible_.

We'll come back to the _as possible_ part, there's much to discuss there.

Some folks like the term "System Under Test" or [SUT](https://en.wikipedia.org/wiki/System_under_test). I find it still leaves too much of the definition and designation to the engineers.

# Managing Risk and Change

Since tests warn us about breaking changes, let's discuss what those changes can be.

Broadly speaking we can think of the following types of changes and the dangers they pose:

* In-place changes that we initiate. The main danger here is regressions, i.e. something that used to work, no longer does.

    * bugfixes
    * refactors, here I'll focus on more realistic cases than the "redesign in the sky":

        * Upgrading or switching _deep dependencies_. For instance the web server framework that powers an app, or the data validation library. Another example is also programming language version upgrades. All of these changes can come with the need to change the application code. In my experience these changes can be extensive.
        * Scaling. Alexis said in some introduction material (reference?) that because usage keeps growing, we have to redesign systems at Datadog every couple of years. This is just to meet the new scale requirements.


* 3rd-party dependency upgrades that don't require any changes on our part. The danger of regressions is lower here, but it's also present.
* Additions that we initiate. The danger here is that we have problems in flows that matter to customers.

The role of tests is very different for in-place and dependency changes vs. new code additions.

To catch regressions we need extensive coverage and very careful use of mocks.

To ensure new features work we essentially need to test the main happy paths and failure modes of the new feature. Neither extensive coverage, nor mocks play that big a role there.

# Tests as Signals

Since tests are signals, let's see if we can discover something about them by looking at properties of signals in general. Note that all of these properties are relative, not just binary "yes/no" values.

* **Feedback Speed**. How soon do you get a response to a question? Real life example: communication over long distances. Sending a messenger on horse is faster than a messenger on foot. Sending a carrion pigeon is even faster. Telegraph is faster than that and the internet is even faster. Telepathy is presumably the fastest.
* **Noise Level**. How many times do you get a response that doesn't answer your question? We can also think of this as the proportion of false positives in the signal. Real life examples abound.
* **Sensitivity**. How often do you get no warning about a problem that you expected to be warned about? In other words, it's the proportion of false negatives in the signal. Often noise level and sensitivity have a trade-off relationship: more sensitive sensors are also noisier.

Bringing this back to software testing:

* **Feedback Speed.** Proponents of Test-Driven-Development (TDD) claim that a "fast" test suite should complete in 5 minutes. Some others argue that tests should complete before the developer gets distracted and cite psychological studies to determine how long that is. When considering feedback speed it's important to take into account the full product life cycle, not just the tests! In other words, a CI that takes hours to complete may seem slow (and probably can use some optimization), but it's still faster than getting complaints from customers days/weeks/months after you make a change!
* **Noise Level.** Noise in tests is when they fail for reasons other than broken functionality. Typical sources of such _flaky tests_ are network I/O and concurrency. In general, any sources of non-determinism in the application (or in the test rig!) will also make the tests non-deterministic.
* **Sensitivity.** We know we lack sensitivity if we make a change, our tests pass, but then customers report problems caused by our change. Adding tests to cover more of the possible states of our application increases sensitivity. Using mocks decreases sensitivity.

In a perfect world we would have a test suite that yields a **fast, clear (no noise), and sensitive** signal. Alas, our world is imperfect. In practice we cannot have it all:

* e2e tests give good sensitivity, but tend to be slow and noisy
* tests that use mocks mocks are fast and no-noise (if done right) but can miss changes in the pieces they mock, i.e. lose sensitivity

If we can't have it all, the natural reaction is to start prioritizing. Do we value feedback speed over lack of noise, for example?

The priorities can definitely differ depending on domain and application. In other words, they depend on the risks we are trying to mitigate. However, here are some observations that apply to most situations.

First of all, **noise is the worst!!** It really undermines the whole purpose of having the test suite. Here's why: **humans are great at detecting and ignoring noise**. In other words, we have all the costs of a test suite (maintenance, slower CI) and since we ignore it we don't reap any benefits. **Literally the worst!**

Now, there's a school of thought that we need to clench our teeth and maintain discipline. "Life's tough, deal with it". In my experience this attitude just hurts morale (nobody **wants** to chase down false leads) and productivity (unpredictable test failures is one more source of unplanned work).

In short, I would strongly prioritize removing noise from tests.

To me the next important dimension is sensitivity. Whereas noise reduces confidence in the test suite, lack of sensitivity **gives us false confidence**. In other words, we see our tests are green → we ship → we break stuff, because our tests didn't catch it. The irony is that after this happens a few times we lose confidence in the test suite. It's as corrosive as noise in that way. So far in my experience the effect is not as devastating though, that's why I worry about sensitivity less than noise.

Feedback speed to me matters for sure, but less than the other dimensions. The reason is that in my experience so far our tests will almost always discover problems faster than customers. That's what matters at the end of the day. To reuse the analogy about long-distance communication: speeding up a test suite is like upgrading from telegraph to internet while your competitors are still using horse messengers! It's good to do, but it doesn't fundamentally change the game.
