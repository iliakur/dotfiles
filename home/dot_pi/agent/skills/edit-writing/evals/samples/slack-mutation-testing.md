my :twocents:, not very coherent or pretty:


I'd vote for first identifying a business-related metric we want to improve with the test improvements. examples below, without getting too into the weeds:
reduce support burden
reduce CI maintenance burden
I don't think that the percent of mutants killed is a good metric on its own, rather it's a tool we can use to boost some other metric that has a higher impact on the business.

related to above, I'd start with improving tests for the most used integrations. Bigger bang for the buck. redisdb having a low score is worrying, for instance.
About the distribution of scores:
I noticed the integrations with high scores tend to be openmetrics-based for which we have a clear unit-testing framework (mocking the incoming payload). The per-integration logic in those is also pretty low.
I notice the integrations with low scores are often non-openmetrics ones with lots of bespoke logic. This and the previous note aren't very surprising, nice to have the common sense expectation confirmed.
Should we look into the OM-based integrations with low scores? That's the surprising result, there could be real holes in there.

I share Enrico's observation that coding agents overmock when given the chance. imo the way to avoid this is to write several tests by hand first, establish a clear pattern for using mocks, maybe even define the mocks as fixtures/helper functions in such a way that we can then point an agent at them and say "just do like this". them agent tend to do much better given such input.
