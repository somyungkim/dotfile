import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, lstatSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Configuration and discovery checks only: no child model calls or paid API requests.
const root = join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const requirePi = createRequire(join(root, "package.json"));
const { createJiti } = requirePi("jiti");
const jiti = createJiti(import.meta.url, { alias: {
  "@earendil-works/pi-coding-agent": join(root, "dist/index.js"),
  "@earendil-works/pi-tui": requirePi.resolve("@earendil-works/pi-tui"),
  "@earendil-works/pi-ai": join(root, "node_modules/@earendil-works/pi-ai/dist/compat.js"),
  typebox: requirePi.resolve("typebox"),
  "typebox/value": requirePi.resolve("typebox/value"),
  "typebox/compile": requirePi.resolve("typebox/compile"),
} });
const packageRoot = join(homedir(), ".pi/agent/npm/node_modules/pi-subagents");
const { loadExtensions } = await import(pathToFileURL(join(root, "dist/core/extensions/loader.js")));
const { loadConfig, saveConfig } = await jiti.import(join(packageRoot, "src/extension/config.js"));
const { discoverAgents } = await jiti.import(join(packageRoot, "src/agents/agents.js"));
const { resolveEffectiveSubagentModel } = await jiti.import(join(packageRoot, "src/runs/shared/model-resolution.js"));
const { resolveDisabledFeatureSurface, disabledFeatureUseError } = await jiti.import(join(packageRoot, "src/shared/disabled-features.js"));
const { resolveWatchdogConfigStrict } = await jiti.import(join(packageRoot, "src/watchdog/settings.js"));
const { registerSubagentToolActivation } = await jiti.import(join(packageRoot, "src/extension/tool-activation.js"));
const config = JSON.parse(readFileSync(new URL("../subagents.json", import.meta.url), "utf8"));
const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const externalProfiles = ["codex-exec", "codex-exec-writer", "claude-code", "claude-code-writer", "cursor-agent", "cursor-agent-writer"];

function agents() {
  return discoverAgents(process.cwd(), "user", "github-copilot", { globalNpmRoot: null, projectTrusted: false });
}

test("subagent package is pinned and workflow prompt templates are excluded", () => {
  assert.deepEqual(settings.packages.find((p) => typeof p === "object" && p.source.startsWith("npm:pi-subagents")), {
    source: "npm:pi-subagents@0.77.0", prompts: [],
  });
  assert.equal(JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version, "0.77.0");
});

test("the package loads the dotfile-managed operational config without dropping fields", () => {
  assert.deepEqual(loadConfig(), config);
  assert.equal(config.toolActivation, "eager");
  assert.equal(config.defaultSubagentContext, "fresh");
  assert.equal(config.globalConcurrencyLimit, 2);
  assert.deepEqual(config.parallel, { maxTasks: 4, concurrency: 2 });
  assert.equal(config.maxActiveAsyncRunsPerSession, 2);
  assert.equal(config.maxSubagentSpawnsPerRun, 4);
  assert.equal(config.maxSubagentSpawnsPerSession, 16);
  assert.equal(config.maxSubagentDepth, 1);
});

test("minimal display keeps FleetView and disables duplicate async status", () => {
  assert.equal(config.inlineToolDisplay, "summary");
  assert.equal(config.fleetView, true);
  assert.equal(config.asyncWidget, false);
});

test("eager activation does not replay an old session selection that hides the launcher", () => {
  const active = ["read", "subagent"];
  const hooks = [];
  registerSubagentToolActivation({
    on: (event, handler) => hooks.push({ event, handler }),
    registerTool: () => assert.fail("Eager mode must not register the loader"),
    getAllTools: () => active.map((name) => ({ name })),
    getActiveTools: () => active,
    setActiveTools: () => assert.fail("Eager mode must not replace the tool selection"),
  }, { mode: config.toolActivation, advertisedPrompt: async () => undefined });
  assert.deepEqual(hooks, []);
  assert.ok(active.includes("subagent"));
});

test("native task-oriented agents remain available without model pins", () => {
  const discovered = agents();
  assert.deepEqual(discovered.agentDiagnostics ?? [], []);
  for (const name of ["delegate", "scout", "reviewer", "researcher", "evidence-auditor", "oracle", "worker"]) {
    const agent = discovered.agents.find((a) => a.name === name);
    assert.ok(agent, name);
    assert.equal(agent.model, undefined);
  }
  const reviewer = discovered.agents.find((a) => a.name === "reviewer");
  assert.ok(!reviewer.tools.some((tool) => ["bash", "edit", "write"].includes(tool)));
});

test("child model resolution follows the live parent, not the saved global default", () => {
  const available = ["gpt-6-astra", "test-parent-model"].map((id) => ({ provider: "github-copilot", id, fullId: `github-copilot/${id}` }));
  for (const parent of available) {
    for (const agent of agents().agents.filter((a) => a.name === "delegate" || a.name === "reviewer")) {
      assert.equal(resolveEffectiveSubagentModel(undefined, agent.model, parent, available), parent.fullId);
    }
  }
});

test("external CLI runner profiles are disabled", () => {
  const discovered = agents();
  for (const name of externalProfiles) {
    assert.equal(settings.subagents.agentOverrides[name].disabled, true);
    assert.ok(!discovered.agents.some((a) => a.name === name));
  }
});

test("automatic watchdogs, missions, schedules and workflow scripting are off", () => {
  const watchdog = resolveWatchdogConfigStrict(process.cwd());
  assert.equal(watchdog.enabled, false);
  assert.equal(watchdog.children.enabled, false);
  assert.equal(config.missions.enabled, false);
  assert.equal(config.scheduledRuns.enabled, false);
  const surface = resolveDisabledFeatureSurface(config);
  for (const request of [
    { action: "schedule.create" }, { action: "mission.create" },
    { action: "watchdog.configure" }, { action: "create" },
    { action: "grant-spawn-budget" }, { workflow: "some-workflow" }, { machine: "remote" },
  ]) assert.equal(typeof disabledFeatureUseError(request, surface), "string");
  assert.equal(disabledFeatureUseError({ agent: "delegate", task: "Read a file" }, surface), undefined);
  assert.equal(disabledFeatureUseError({ tasks: [{ agent: "reviewer", task: "Review a diff" }] }, surface), undefined);
});

test("package config updates preserve a symlink instead of replacing it", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-subagents-config-test-"));
  try {
    const target = join(dir, "source.json"), link = join(dir, "config.json");
    saveConfig(config, target);
    symlinkSync(target, link);
    saveConfig({ ...config, fleetView: false }, link);
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.equal(JSON.parse(readFileSync(target, "utf8")).fleetView, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Pi registers subagent tools without colliding with background jobs or todos", async () => {
  const loaded = await loadExtensions([
    join(packageRoot, "index.js"),
    new URL("../extensions/background-processes.ts", import.meta.url).pathname,
    join(homedir(), ".pi/agent/npm/node_modules/@juicesharp/rpiv-todo/index.ts"),
  ], process.cwd());
  assert.deepEqual(loaded.errors, []);
  const names = loaded.extensions.flatMap((ext) => [...ext.tools.keys()]);
  assert.equal(names.length, new Set(names).size);
  assert.ok(!names.includes("subagents_enable"));
  for (const name of ["subagent", "bg_wait", "bg_run", "bg_status", "bg_logs", "bg_kill", "todo"]) assert.ok(names.includes(name));
  const subagents = loaded.extensions.find((ext) => ext.tools.has("subagent"));
  const schema = subagents.tools.get("subagent").definition.parameters;
  assert.ok(!Object.hasOwn(schema.properties, "workflow"));
  assert.ok(!Object.hasOwn(schema.properties, "mission"));
  assert.ok(!Object.hasOwn(schema.properties, "every"));
  assert.ok(subagents.commands.has("subagents-fleet"));
  assert.ok(subagents.commands.has("subagents-models"));
});
