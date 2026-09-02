import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"

function mkConfig(path: string = "/"): object {
  return ({
    "baseUrl": `https://ai-gateway.us1.prod.dog${path}`,
    "apiKey": "!ddtool auth token rapid-ai-platform --datacenter us1.prod.dog",
    "authHeader": true,
    "headers": {
      "org-id": "2",
      "source": "pi",
      "claude-code": "true",
      "x-llmo-force-redaction": "true",
    }
  })
}

export default function(pi: ExtensionAPI) {
  pi.registerProvider("anthropic", (() => {
    let attrs = mkConfig("")
    attrs["headers"]["provider"] = "anthropic"
    return attrs
  })())

  pi.registerProvider("baseten", (() => {
    const attrs = mkConfig("/v1")
    attrs["models"] = getBuiltinModels("baseten").map((model) => ({
      ...model,
      id: `baseten/${model.id}`,
      baseUrl: attrs["baseUrl"],
    }))
    return attrs
  })())

  pi.registerProvider("google", mkConfig("/v1beta"))

  pi.registerProvider("openai", (() => {
    const attrs = mkConfig("/v1")
    attrs["models"] = getBuiltinModels("openai").map((model) => ({
      ...model,
      id: `openai/${model.id}`,
      baseUrl: attrs["baseUrl"],
    }))
    return attrs
  })())
}
