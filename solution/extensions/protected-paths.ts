import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function protectedPaths(pi: ExtensionAPI) {
  const protectedFragments = [".env", ".git/", "node_modules/", "result.json"];

  pi.on("tool_call", async (event, context) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return undefined;
    const candidate = String((event.input as Record<string, unknown>).path ?? "").replaceAll("\\", "/");
    const protectedPath = protectedFragments.find((fragment) => candidate.includes(fragment));
    if (!protectedPath) return undefined;

    if (context.hasUI) context.ui.notify(`Blocked write to protected path: ${candidate}`, "warning");
    return { block: true, reason: `Path contains protected fragment: ${protectedPath}` };
  });
}
