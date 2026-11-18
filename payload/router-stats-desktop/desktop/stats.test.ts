import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { describeDispatch, readDesktopStats } from "../src/routing/commands/desktop-stats";
import { createPersister, nodePersistDeps } from "../src/routing/outcomes";
import type { DecisionRow, VerdictRow } from "../src/routing/outcomes/types";
import { loadConfig } from "../src/router/config";

const chosen: DecisionRow["chosen"] = {
  key: "recon|router:fast|opencode/deepseek-v4.1-flash-free#default",
  agent: "fast", origin: "router", model: "opencode/deepseek-v4.1-flash-free", variant: "default",
};
const best = { ...chosen, key: "recon|router:fast|opencode/deepseek-v4.1-flash-free#high", variant: "high" } as const;
const row: DecisionRow = {
  kind: "decision", v: 1, ts: "2026-11-17T00:00:00.000Z", sessionID: "ses_test",
  decisionID: "test", mode: "shadow", childSessionID: null,
  facts: { class: "recon", risk: "low", scope: "single", needs: [], confidence: 1, source: "rules" },
  chosen, best, switched: true, pinned: false, unit: "ratio", costs: { [chosen.key]: 2, [best.key]: 1 },
  confidence: 1, reason: "switched", step: "dispatch", resume: false,
};

test("describes a shadow recommendation separately from the dispatched route", () => {
  expect(describeDispatch(row)).toMatchObject({ agent: "fast", variant: null, result: expect.stringMatching(/^Would switch to .*high$/) });
  expect(describeDispatch({ ...row, mode: "enforce" })).toMatchObject({ variant: "high", result: "Switched by router" });
});

test("reads the shared stats store, filters dates, and rejects argument injection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "router-desktop-test-"));
  try {
    const cfg = { ...loadConfig(dir), routing: { engine: "shadow", outcomes: { path: dir } } } as const;
    const logger = { warn() {} };
    const persist = createPersister(dir, nodePersistDeps(logger));
    const verdict: VerdictRow = {
      kind: "verdict", v: 1, ts: row.ts, sessionID: row.sessionID, childSessionID: "ses_child",
      decisionID: row.decisionID, attemptID: "attempt", key: chosen.key, step: "dispatch", verdict: "pass",
    };
    await persist.appendRows([row, row, verdict, { ...verdict, verdict: "unverifiable" }]);
    const deps = { cfg, host: "v2", logger } as const;
    const report = await readDesktopStats({}, deps);
    expect(report).toMatchObject({ mode: "shadow", dispatches: 1, enforcedSwitches: 0, wouldSwitches: 1 });
    expect(report.decisions).toHaveLength(1);
    expect(report.decisions[0]?.verification).toBe("pass");
    expect(await readDesktopStats({ since: "2026-11-18T00:00:00.000Z" }, deps)).toMatchObject({ dispatches: 0, decisions: [] });
    await expect(readDesktopStats({ since: "--dir C:\\private" }, deps)).rejects.toThrow("Invalid start date");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
