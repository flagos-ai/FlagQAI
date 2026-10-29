import test from "node:test";
import assert from "node:assert/strict";
import { blankProvider, providerInput } from "../src/state/agent-settings.ts";
import {
  parseProviderConfigurationRequest,
  parseProviderDiscoveryRequest,
} from "../../../packages/protocol/index.mjs";
test("a blank API key is omitted so existing native credentials are retained", () => {
  const input = providerInput({
    ...blankProvider(),
    route: "deepseek",
    apiKey: "   ",
  });
  assert.equal(Object.hasOwn(input, "apiKey"), false);
  assert.deepEqual(parseProviderDiscoveryRequest(input), {
    kind: "catalog",
    route: "deepseek",
  });
});
test("custom endpoint configuration uses native protocol and separates model selection from secret input", () => {
  const input = providerInput({
    ...blankProvider(),
    kind: "custom",
    route: " fixture ",
    api: "openai-completions",
    baseURL: " https://example.com/v1 ",
    apiKey: " test-only-key ",
    models: "one\ntwo",
  });
  assert.equal(input.route, "fixture");
  assert.equal(input.apiKey, "test-only-key");
  assert.equal(Object.hasOwn(input, "models"), false);
  const validated = parseProviderConfigurationRequest({
    ...input,
    models: ["one", "two"],
  });
  assert.deepEqual(validated.models, ["one", "two"]);
  assert.throws(() =>
    parseProviderDiscoveryRequest({ ...input, api: undefined }),
  );
});
