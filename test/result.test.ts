import { describe, expect, it } from "vitest";
import { composeResult } from "../src/result.js";
import type { PartialRunResult, UsageSummary } from "../src/types.js";
import { validateResultObject } from "../src/validate-result.js";

const partial: PartialRunResult = {
  status: "success",
  app_url: "http://localhost:3000",
  start_command: "npm run dev",
  summary: "A useful app",
  implemented_features: ["Create records"],
  assumptions: ["Used a fixed category set"],
  tests_run: [{ command: "npm test", journey: "Create a record", result: "passed" }],
};

const usage: UsageSummary = {
  model_calls: 1,
  input_tokens: 10,
  output_tokens: 5,
  cache_read_tokens: 2,
  cache_write_tokens: 1,
  total_tokens: 18,
  reasoning_tokens: 0,
  cost_total: 0.01,
  call_log: [
    {
      index: 1,
      model: "test-model",
      input_tokens: 10,
      output_tokens: 5,
      cache_read_tokens: 2,
      cache_write_tokens: 1,
      total_tokens: 18,
      cost_total: 0.01,
    },
  ],
};

describe("result contract", () => {
  it("accepts a reconciled result", async () => {
    expect(await validateResultObject(composeResult(partial, usage, 0))).toEqual([]);
  });

  it("overrides success when Pi exits unsuccessfully", () => {
    expect(composeResult(partial, usage, 124).status).toBe("failed");
  });

  it("rejects telemetry totals that do not reconcile", async () => {
    const result = composeResult(partial, usage, 0);
    result.input_tokens += 1;
    expect(await validateResultObject(result)).toContain("input_tokens does not reconcile with call_log");
  });
});
