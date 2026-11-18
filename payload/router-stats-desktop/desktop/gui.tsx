import { Command, MenuItem, Panel, Plugin, type PanelTab } from "@opencode/plugin/gui"
import { createResource, createSignal, For, Show } from "solid-js"
import { RouterStats, type Stats } from "./stats-contract"

function isStats(value: unknown): value is Stats {
  if (!value || typeof value !== "object") return false
  const data = Object.fromEntries(Object.entries(value))
  return typeof data.mode === "string" &&
    typeof data.dispatches === "number" &&
    typeof data.enforcedSwitches === "number" &&
    typeof data.wouldSwitches === "number" &&
    Array.isArray(data.warnings) && data.warnings.every((warning: unknown) => typeof warning === "string") &&
    Array.isArray(data.decisions) && data.decisions.every((decision: unknown) => {
      if (!decision || typeof decision !== "object") return false
      const row = Object.fromEntries(Object.entries(decision))
      return typeof row.time === "string" && typeof row.taskClass === "string" &&
        typeof row.agent === "string" && typeof row.model === "string" &&
        (row.variant === null || typeof row.variant === "string") && typeof row.result === "string" &&
        (row.verification === null || row.verification === "pass" || row.verification === "fail" || row.verification === "unverifiable")
    })
}

export default Plugin.define({
  setup(ctx) {
    const tab: PanelTab = { id: "main", title: "Router Stats", closable: "compact", fallback: true }
    const open = () => {
      const session = ctx.sessions.current()
      if (session) ctx.layout.open(`${ctx.id}:main`, session)
    }

    ctx.add(Command, (): Command => ({
      id: "open",
      title: "Router Stats",
      description: "Open read-only router statistics",
      slash: { name: "router-stats" },
      enabled: !!ctx.sessions.current(),
      run: open,
    }))
    ctx.add(MenuItem, (): MenuItem => {
      const session = ctx.sessions.current()
      return {
        menu: "session.panel",
        id: "open",
        title: "Router Stats",
        keybind: `${ctx.id}.open`,
        opened: !!session && ctx.layout.state(`${ctx.id}:main`, session) !== "closed",
        run: open,
      }
    })
    ctx.add(Panel, {
      id: "main",
      region: "side",
      list: (input) => input.open.includes("main") ? [tab] : [],
      render: () => <StatsView />,
    })

    function StatsView() {
      const [window, setWindow] = createSignal("all")
      const [stats, { refetch }] = createResource(window, async (period) => {
        const hours = period === "24h" ? 24 : period === "7d" ? 168 : 0
        const input = hours ? { since: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() } : {}
        const result = await ctx.client.rpc(RouterStats).get(input)
        if (!isStats(result)) throw new Error("The router returned invalid statistics.")
        return result
      })

      const card = { border: "1px solid var(--border-weak-base, GrayText)", "border-radius": "8px", padding: "10px 12px" }
      const muted = { color: "var(--text-weak, GrayText)", "font-size": "12px" }
      return (
        <section aria-label="Router Stats" style={{ padding: "16px", overflow: "auto", height: "100%", display: "grid", "align-content": "start", gap: "12px" }}>
          <header>
            <h2 style={{ "font-size": "16px", "font-weight": "600" }}>Router Stats</h2>
            <p style={muted}>Recorded router activity across sessions sharing this router log, not all model usage.</p>
          </header>
          <div style={{ display: "flex", gap: "8px", "align-items": "center", "flex-wrap": "wrap" }}>
            <label for="router-stats-window">Window</label>
            <select id="router-stats-window" style={{ ...card, padding: "4px 8px" }} value={window()} onChange={(event) => setWindow(event.currentTarget.value)}>
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="24h">Last 24 hours</option>
            </select>
            <button type="button" style={{ ...card, padding: "4px 8px" }} onClick={() => void refetch()} disabled={stats.loading}>Refresh</button>
          </div>
          <Show when={stats.loading}><p role="status">Loading statistics…</p></Show>
          <Show when={stats.error}><p role="alert">Could not load statistics: {String(stats.error)}</p></Show>
          <Show when={!stats.loading && !stats.error && stats()} keyed>
            {(data) => (
              <>
                <dl aria-label="Overview" style={{ display: "grid", "grid-template-columns": "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                  <For each={[
                    ["Mode", data.mode],
                    ["Dispatches", data.dispatches],
                    ["Enforced switches", data.enforcedSwitches],
                    ["Recommendations not applied", data.wouldSwitches],
                  ]}>{([label, value]) => (
                    <div style={card}>
                      <dt style={muted}>{label}</dt>
                      <dd style={{ "font-size": "16px", "font-weight": "600", "margin-left": "0" }}>{value}</dd>
                    </div>
                  )}</For>
                </dl>
                <Show when={data.mode === "shadow"}><p style={muted}>Shadow mode records recommendations without changing what runs.</p></Show>
                <Show when={data.warnings.length > 0}>
                  <h3>Warnings</h3>
                  <ul><For each={data.warnings}>{(warning) => <li>{warning}</li>}</For></ul>
                </Show>
                <h3 style={{ "font-weight": "600" }}>Recent decisions</h3>
                <Show when={data.decisions.length > 0} fallback={<p>No decisions recorded in this window.</p>}>
                  <ul style={{ padding: "0", "list-style": "none" }}>
                    <For each={data.decisions}>{(decision) => (
                      <li style={{ ...card, "margin-bottom": "8px", "overflow-wrap": "anywhere" }}>
                        <div style={{ "font-weight": "600" }}>{decision.taskClass} · {decision.agent}</div>
                        <div>{decision.model} · {decision.variant ?? "Default effort"}</div>
                        <p style={muted}>{decision.result}</p>
                        <details style={muted}>
                          <summary>Details</summary>
                          <p>Verification: {decision.verification === "pass" ? "Passed" : decision.verification === "fail" ? "Failed" : decision.verification === "unverifiable" ? "Could not verify" : "Not recorded in this window"}</p>
                          <time datetime={decision.time}>{new Date(decision.time).toLocaleString()}</time>
                        </details>
                      </li>
                    )}</For>
                  </ul>
                </Show>
              </>
            )}
          </Show>
        </section>
      )
    }
  },
})
