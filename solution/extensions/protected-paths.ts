import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import path from "node:path";

export default function protectedPaths(pi: ExtensionAPI) {
  const appRoot = process.cwd();

  pi.on("tool_call", async (event, context) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return undefined;
    const candidate = String((event.input as Record<string, unknown>).path ?? "");
    const absolute = path.resolve(appRoot, candidate);
    const relative = path.relative(appRoot, absolute);
    const outsideApp = relative.startsWith("..") || path.isAbsolute(relative);
    const segments = relative.split(path.sep);
    const basename = path.basename(absolute).toLowerCase();
    const protectedPath =
      outsideApp ||
      segments.includes(".git") ||
      segments.includes("node_modules") ||
      basename === "result.json" ||
      basename === ".env" ||
      basename.startsWith(".env.");
    if (!protectedPath) return undefined;

    if (context.hasUI) context.ui.notify(`Blocked write to protected path: ${candidate}`, "warning");
    return { block: true, reason: "Path is outside the app workspace or is runner-owned" };
  });
}
