import { describe, expect, it } from "vitest";
import { composeResult, normalizePartialResult } from "../src/result.js";
import type { AppVerification, PartialRunResult, UsageSummary } from "../src/types.js";
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

const verification: AppVerification = {
  passed: true,
  testsRun: [
    { command: "npm test", journey: "Automated tests", result: "passed" },
    { command: "npm run build", journey: "Production build", result: "passed" },
    { command: "npm run dev", journey: "HTTP startup probe", result: "passed" },
  ],
};

describe("result contract", () => {
  it("accepts a reconciled result", async () => {
    expect(await validateResultObject(composeResult(partial, usage, 0, verification))).toEqual([]);
  });

  it("overrides success when Pi exits unsuccessfully", () => {
    expect(composeResult(partial, usage, 124, verification).status).toBe("failed");
  });

  it("overrides success when telemetry contains no model calls", async () => {
    const zeroUsage: UsageSummary = {
      model_calls: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      total_tokens: 0,
      reasoning_tokens: 0,
      cost_total: 0,
      call_log: [],
    };
    const result = composeResult(partial, zeroUsage, 0, verification);
    expect(result.status).toBe("failed");
    expect(await validateResultObject({ ...result, status: "success" })).toContain(
      "non-failed result must include at least one model call",
    );
  });

  it("overrides success when an independent app check fails", () => {
    expect(composeResult(partial, usage, 0, { ...verification, passed: false }).status).toBe("failed");
  });

  it("uses runner-verified tests and strips unknown report fields", () => {
    const normalized = normalizePartialResult({
      ...partial,
      ignored: "extra",
      tests_run: [{ ...partial.tests_run[0], notes: "chatty model output" }],
    });
    expect(normalized?.tests_run).toEqual(partial.tests_run);
    expect(composeResult(partial, usage, 0, verification).tests_run).toEqual(verification.testsRun);
  });

  it("rejects telemetry totals that do not reconcile", async () => {
    const result = composeResult(partial, usage, 0, verification);
    result.input_tokens += 1;
    expect(await validateResultObject(result)).toContain("input_tokens does not reconcile with call_log");
  });
});
