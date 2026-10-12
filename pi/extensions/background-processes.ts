import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Activate only the pinned package's process lane, without global shell exports. */
export default async function (pi: ExtensionAPI) {
  const root = join(getAgentDir(), "npm/node_modules/pi-background-tasks");
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (version !== "2.6.9") {
    throw new Error("Background jobs require the validated pi-background-tasks@2.6.9. Review and test upgrades before changing this pin.");
  }
  const previousFeatures = process.env.PI_BG_FEATURES;
  const previousShortcut = process.env.PI_BG_DOCK_SHORTCUT;
  try {
    // The package snapshots these flags during activation. Its own entrypoints
    // must remain filtered out in settings.json to avoid duplicate registration.
    process.env.PI_BG_FEATURES = "process";
    process.env.PI_BG_DOCK_SHORTCUT = "ctrl+alt+b";
    const { default: activate } = await import(pathToFileURL(join(root, "dist/extensions/background-tasks.js")).href);
    await activate(pi);
  } finally {
    if (previousFeatures === undefined) delete process.env.PI_BG_FEATURES;
    else process.env.PI_BG_FEATURES = previousFeatures;
    if (previousShortcut === undefined) delete process.env.PI_BG_DOCK_SHORTCUT;
    else process.env.PI_BG_DOCK_SHORTCUT = previousShortcut;
  }
}
