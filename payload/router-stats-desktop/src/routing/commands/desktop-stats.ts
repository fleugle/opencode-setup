import type { Stats } from "../../../desktop/stats-contract";
import { resolveRouting } from "../../router/config";
import { FLOOR_LIFT_REASON, type DecisionRow, type StatsTable, type VerdictRow } from "../outcomes/types";
import { runStatsCommand, type StatsCommandDeps } from "./stats";

const choiceLabel = (choice: DecisionRow["chosen"]) => `${choice.agent} · ${choice.model} · ${choice.variant}`;

export function describeDispatch(row: DecisionRow, verification: VerdictRow["verdict"] | null = null): Stats["decisions"][number] {
  const lift = row.reason.startsWith(FLOOR_LIFT_REASON);
  const applied = row.switched && row.mode === "enforce" ? row.best : null;
  const choice = applied ?? row.chosen;
  return {
    time: row.ts,
    taskClass: row.facts.class,
    agent: choice.agent,
    model: choice.model,
    variant: choice.variant === "default" ? null : choice.variant,
    verification,
    result: lift ? "Raised to minimum tier"
      : applied ? "Switched by router"
      : row.switched && row.best ? `Would switch to ${choiceLabel(row.best)}`
      : row.pinned ? "Original pick pinned"
      : row.reason.startsWith("kept:evidence") ? `Kept original pick · not enough evidence${row.trace?.argmin ? ` for ${choiceLabel(row.trace.argmin)}` : ""}`
      : row.reason.startsWith("kept:uncertain") ? "Kept original pick · uncertain task type"
      : row.decisionID.startsWith("ladder-") ? "Delegate first attempt"
      : "Kept original pick",
  };
}

export async function readDesktopStats(input: unknown, deps: StatsCommandDeps): Promise<Stats> {
  const since = (input as { since?: unknown } | null)?.since;
  const instant = typeof since === "string" && since.length <= 32 ? Date.parse(since) : NaN;
  if (since !== undefined && !Number.isFinite(instant)) throw new Error("Invalid start date.");
  // Re-encode as a canonical date; only the server can set a stats directory or supply other CLI arguments.
  const window = since === undefined ? "" : ` --since ${new Date(instant).toISOString()}`;
  let decisions: Stats["decisions"] = [];
  const result = await runStatsCommand(`--json${window}`, {
    ...deps,
    onDispatches: (rows, verdicts) => {
      const byDecision = new Map<string, VerdictRow>();
      for (const verdict of verdicts) {
        if (verdict.decisionID === null) continue;
        const prev = byDecision.get(verdict.decisionID);
        if (!prev || (verdict.verdict !== "unverifiable" && (prev.verdict === "unverifiable" || Date.parse(verdict.ts) >= Date.parse(prev.ts)))) {
          byDecision.set(verdict.decisionID, verdict);
        }
      }
      decisions = [...rows].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 50)
        .map((row) => describeDispatch(row, byDecision.get(row.decisionID)?.verdict));
    },
  });
  if (result.exit !== 0) throw new Error("The router's statistics could not be read. See the server log or /router stats for details.");
  const report: StatsTable = JSON.parse(result.stdout);
  return {
    mode: resolveRouting(deps.cfg, deps.host).engine,
    dispatches: report.dispatches,
    enforcedSwitches: report.switched.enforced,
    wouldSwitches: report.switched.count - report.switched.enforced,
    decisions,
    warnings: result.stderr.split("\n").map((line) => line.trim())
      .filter((line) => line && !line.startsWith("routing-stats: no outcome data in")),
  };
}
