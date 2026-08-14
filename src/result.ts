import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PartialRunResult, RunResult, UsageSummary } from "./types.js";

const FALLBACK_PARTIAL: PartialRunResult = {
  status: "failed",
  app_url: "http://localhost:3000",
  start_command: "npm run dev",
  summary: "The harness did not produce a valid report.partial.json file.",
  implemented_features: [],
  assumptions: [],
  tests_run: [],
};

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPartialResult(value: unknown): value is PartialRunResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  const validTests =
    Array.isArray(result.tests_run) &&
    result.tests_run.every((test) => {
      if (typeof test !== "object" || test === null) return false;
      const candidate = test as Record<string, unknown>;
      return (
        typeof candidate.command === "string" &&
        typeof candidate.journey === "string" &&
        ["passed", "failed", "skipped"].includes(String(candidate.result))
      );
    });

  return (
    ["success", "partial", "failed"].includes(String(result.status)) &&
    typeof result.app_url === "string" &&
    typeof result.start_command === "string" &&
    typeof result.summary === "string" &&
    strings(result.implemented_features) &&
    strings(result.assumptions) &&
    validTests
  );
}

export async function readPartialResult(appDirectory: string): Promise<PartialRunResult> {
  try {
    const raw = await readFile(path.join(appDirectory, "report.partial.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isPartialResult(parsed) ? parsed : FALLBACK_PARTIAL;
  } catch {
    return FALLBACK_PARTIAL;
  }
}

export function composeResult(
  partial: PartialRunResult,
  usage: UsageSummary,
  piExitCode: number,
): RunResult {
  return {
    ...partial,
    status: piExitCode === 0 ? partial.status : "failed",
    ...usage,
    pi_exit_code: piExitCode,
    telemetry_source: "pi-json-event-stream",
  };
}

export async function writeResult(appDirectory: string, result: RunResult): Promise<string> {
  const resultPath = path.join(appDirectory, "result.json");
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return resultPath;
}
