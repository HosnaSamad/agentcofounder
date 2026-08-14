import type { ChildProcess } from "node:child_process";

export function usesDetachedProcessGroup(): boolean {
  return process.platform !== "win32";
}

export function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;

  if (usesDetachedProcessGroup()) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }

  try {
    child.kill(signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}
