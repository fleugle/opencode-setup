// Local OpenCode V2 plugin — Claude Code parity / extensibility.
//
// Loader contract (verified against this v2.3.0 binary):
//   export default { id, setup: (ctx) => Promise|void }
// A V1-style function export FAILS (err_9db2a52c). The runtime `ctx` exposes
// the full documented V2 server API: app, location, options, agent, aisdk,
// command, credential, event, experimental, generate, model, provider,
// integration, mcp, permission, plugin, reference, rpc, skill, storage, tool,
// vcs, websearch, worktree, session, shell.
//
// Registers read-only diagnostics via the V2 Promise plugin API.

const text = (obj) => ({ content: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) });

export default {
  id: "claude-parity",

  async setup(ctx) {
    // ---- Real custom tools (the "possibilities" win over prompt commands) ----
    await ctx.tool.transform((editor) => {
        editor.namespace({
          name: "parity",
          description:
            "Claude Code parity utilities: live status/diagnostics for this OpenCode install.",
        });

        // /status + /doctor parity: read the LIVE registries, not a static prompt.
        editor.add({
          name: "status",
          description:
            "Return a live status report of this OpenCode install: version, connected MCP servers, command count, agent list, skill count, and active plugins. Like Claude Code /status + /doctor.",
          input: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
          options: { namespace: "parity", codemode: true },
          execute: async () => {
            const read = async (fn) => {
              try {
                const result = await fn();
                const items = Array.isArray(result) ? result : result?.data;
                if (!Array.isArray(items)) throw new Error("unexpected response shape");
                return { items };
              } catch (error) {
                return { error: error instanceof Error ? error.message : String(error) };
              }
            };
            const version = ctx?.app?.version ?? "unknown";
            const [commands, agents, skills, mcps, plugins] = await Promise.all([
              read(() => ctx.command.list()), read(() => ctx.agent.list()),
              read(() => ctx.skill.list()), read(() => ctx.mcp.list()),
              read(() => ctx.plugin.list()),
            ]);
            const names = (items) => items.map((item) => item?.name ?? item?.id).filter(Boolean);
            const show = (result, format) => result.error ? `unavailable (${result.error})` : format(result.items);
            return text([
              `OpenCode parity status (v${version})`,
              "-----------------------------------",
              `MCP servers : ${show(mcps, (items) => items.map((item) => `${item.name}: ${item.status?.status ?? "unknown"}`).join(", ") || "none")}`,
              `Commands    : ${show(commands, (items) => String(items.length))}`,
              `Agents      : ${show(agents, (items) => names(items).join(", ") || "none")}`,
              `Skills      : ${show(skills, (items) => String(items.length))}`,
              `Plugins     : ${show(plugins, (items) => `${items.filter((item) => item.state?.status === "active").length} active / ${items.length} total`)}`,
            ].join("\n"));
          },
        });

        // /context-style environment probe that runs SERVER-side (has real cwd).
        editor.add({
          name: "env_probe",
          description:
            "Return a compact snapshot of the runtime environment the OpenCode server runs in (platform, arch, Node version, cwd, pid). Useful for diagnosing shell/CLI/Node issues on this machine.",
          input: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
          options: { namespace: "parity", codemode: true },
          execute: async () => {
            const p = globalThis.process;
            return text([
              "Runtime probe",
              "-------------",
              `platform : ${p?.platform ?? "?"} (${p?.arch ?? "?"})`,
              `node     : ${p?.version ?? "?"}`,
              `cwd      : ${p?.cwd?.() ?? "?"}`,
              `pid      : ${p?.pid ?? "?"}`,
              `location : ${ctx?.location?.directory ?? "?"}`,
            ].join("\n"));
          },
        });
    });
  },
};
