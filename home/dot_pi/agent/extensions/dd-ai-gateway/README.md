# pi-dd-ai-gateway

<!--Copied this from datadog-pi-packages -->

This is a simplified alternative to configuring a Datadog-specific model provider, either manually or via the “refresh-models” package.
Instead, this package reconfigures the builtin Anthropic, Google, and OpenAI model providers to connect to the Datadog AI Gateway.

Pros:

- Very simple solution that doesn’t require much upkeep and is easy to understand
- Implicitly uses the existing per-model config Pi already has

Cons:

- Not every model in the builtin providers may be available via the Datadog AI Gateway
- Other models the DD AI Gateway has are of course not available
- Changes to the DD AI Gateway model ID scheme will require manual updates
- The DD AI Gateway may silently route calls to alternative providers of the same model (e.g. to Bedrock), and the Pi provider is not aware of this and there may be subtle incompatibles or quirks between provider backends for the same model

## Installation

Copy `extensions/dd-ai-gateway` into your extensions directory via whatever means (this is a simple extension, remember?). It may need to be loaded *after* any other provider-based plugin.

Pi 0.84.0 or greater is required, as that is the first release with a builtin Baseten provider.
