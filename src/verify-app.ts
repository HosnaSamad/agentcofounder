import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { signalProcessTree, usesDetachedProcessGroup } from "./process-tree.js";
import type { AppVerification, TestRun } from "./types.js";

interface CommandOutcome {
  exitCode: number;
  timedOut: boolean;
}

interface VitestReport {
  numTotalTests?: unknown;
  numFailedTests?: unknown;
  success?: unknown;
}

function commandName(name: string): string {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runLoggedCommand(
  command: string,
  args: string[],
  cwd: string,
  logPath: string,
  timeoutMs: number,
): Promise<CommandOutcome> {
  const log = createWriteStream(logPath, { flags: "wx" });

  return await new Promise<CommandOutcome>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: usesDetachedProcessGroup(),
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      signalProcessTree(child, "SIGTERM");
      killTimer = setTimeout(() => signalProcessTree(child, "SIGKILL"), 5_000);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      log.write(chunk);
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      log.write(chunk);
      process.stderr.write(chunk);
    });
    const finish = (outcome: CommandOutcome | undefined, error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      log.end(() => {
        if (error) reject(error);
        else resolve(outcome ?? { exitCode: 1, timedOut });
      });
    };
    child.once("error", (error) => finish(undefined, error));
    child.once("close", (code) => {
      finish({ exitCode: timedOut ? 124 : (code ?? 1), timedOut });
    });
  });
}

async function portIsFree(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close((error) => resolve(error === undefined));
    });
  });
}

async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      await response.text();
      if (response.ok) {
        await delay(300);
        return true;
      }
    } catch {
      // The development server may still be starting.
    }
    await delay(200);
  }
  return false;
}

async function waitForPortToClose(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portIsFree(port)) return true;
    await delay(100);
  }
  return false;
}

async function verifyDevelopmentServer(
  appDirectory: string,
  logPath: string,
  timeoutMs: number,
): Promise<boolean> {
  const port = 3000;
  if (!(await portIsFree(port))) {
    await writeFile(logPath, "Port 3000 was already in use before app verification.\n", {
      encoding: "utf8",
      flag: "wx",
    });
    return false;
  }

  const log = createWriteStream(logPath, { flags: "wx" });
  const child = spawn(commandName("npm"), ["run", "dev"], {
    cwd: appDirectory,
    detached: usesDetachedProcessGroup(),
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    process.stderr.write(chunk);
  });

  const closed = new Promise<number>((resolve) => {
    child.once("close", (code) => resolve(code ?? 1));
  });
  const failed = new Promise<never>((_, reject) => child.once("error", reject));

  let served = false;
  try {
    const startup = await Promise.race([
      waitForHttp("http://127.0.0.1:3000", timeoutMs).then((ready) => ({ kind: "probe" as const, ready })),
      closed.then((exitCode) => ({ kind: "exit" as const, exitCode })),
      failed,
    ]);
    served = startup.kind === "probe" && startup.ready;
  } finally {
    signalProcessTree(child, "SIGTERM");
    const exitedAfterTerm = await Promise.race([
      closed.then(() => true),
      delay(5_000).then(() => false),
    ]);
    if (!exitedAfterTerm) {
      signalProcessTree(child, "SIGKILL");
      await Promise.race([closed, delay(2_000)]);
    }
    await waitForPortToClose(port, 2_000);
    await new Promise<void>((resolve) => log.end(resolve));
  }

  return served && (await portIsFree(port));
}

function testRun(command: string, journey: string, passed: boolean): TestRun {
  return { command, journey, result: passed ? "passed" : "failed" };
}

async function hasPassingVitestReport(reportPath: string): Promise<boolean> {
  try {
    const report = JSON.parse(await readFile(reportPath, "utf8")) as VitestReport;
    return (
      report.success === true &&
      typeof report.numTotalTests === "number" &&
      report.numTotalTests > 0 &&
      report.numFailedTests === 0
    );
  } catch {
    return false;
  }
}

export async function verifyGeneratedApp(
  appDirectory: string,
  artifactDirectory: string,
  commandTimeoutMs = 120_000,
  serverTimeoutMs = 20_000,
): Promise<AppVerification> {
  const testReportPath = path.join(artifactDirectory, "app-test-results.json");
  const test = await runLoggedCommand(
    commandName("npm"),
    [
      "test",
      "--",
      "--reporter=json",
      `--outputFile=${testReportPath}`,
      "--passWithNoTests=false",
    ],
    appDirectory,
    path.join(artifactDirectory, "app-test.log"),
    commandTimeoutMs,
  );
  const testsPassed = test.exitCode === 0 && (await hasPassingVitestReport(testReportPath));
  const build = await runLoggedCommand(
    commandName("npm"),
    ["run", "build"],
    appDirectory,
    path.join(artifactDirectory, "app-build.log"),
    commandTimeoutMs,
  );
  const serverPassed = await verifyDevelopmentServer(
    appDirectory,
    path.join(artifactDirectory, "app-dev.log"),
    serverTimeoutMs,
  );

  const testsRun = [
    testRun(
      "npm test -- --reporter=json --passWithNoTests=false",
      "The generated app's Vitest report contained at least one test and no failures",
      testsPassed,
    ),
    testRun("npm run build", "The generated app completed a production build", build.exitCode === 0),
    testRun("npm run dev", "The generated app served HTTP successfully on port 3000 and shut down cleanly", serverPassed),
  ];

  return { passed: testsRun.every((entry) => entry.result === "passed"), testsRun };
}
