import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "./index.js";

async function setup(overrides = {}) {
  const registered = new Map();
  const ctx = {
    app: { version: "test" }, location: { directory: "project" },
    command: { list: async () => [{ name: "recap" }] },
    agent: { list: async () => [{ id: "build" }] },
    skill: { list: async () => [] },
    mcp: { list: async () => [{ name: "edge", status: { status: "connected" } }] },
    plugin: { list: async () => [{ state: { status: "active" } }, { state: { status: "failed" } }] },
    ...overrides,
    tool: { transform: async (callback) => callback({ namespace() {}, add: (tool) => registered.set(tool.name, tool) }) },
  };
  await plugin.setup(ctx);
  return registered;
}

test("status reports actual connection and active plugin counts", async () => {
  const tools = await setup();
  const { content } = await tools.get("status").execute();
  assert.match(content, /edge: connected/);
  assert.match(content, /1 active \/ 2 total/);
  assert.match(content, /Commands\s+: 1/);
});

test("status makes failed reads explicit", async () => {
  const tools = await setup({ command: { list: async () => { throw new Error("offline"); } } });
  const { content } = await tools.get("status").execute();
  assert.match(content, /Commands\s+: unavailable \(offline\)/);
});

test("environment probe reports the plugin location", async () => {
  const tools = await setup();
  const { content } = await tools.get("env_probe").execute();
  assert.match(content, /location\s+: project/);
});
