import { Rpc } from "@opencode/plugin/rpc"

export interface Stats {
  mode: string
  dispatches: number
  enforcedSwitches: number
  wouldSwitches: number
  decisions: Array<{
    time: string
    taskClass: string
    agent: string
    model: string
    variant: string | null
    result: string
    verification: "pass" | "fail" | "unverifiable" | null
  }>
  warnings: string[]
}

export const RouterStats = Rpc.define({
  id: "opencode-model-router.stats",
  methods: {
    get: {
      input: {
        type: "object",
        properties: { since: { type: "string" } },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          mode: { type: "string" },
          dispatches: { type: "number" },
          enforcedSwitches: { type: "number" },
          wouldSwitches: { type: "number" },
          decisions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "string" },
                taskClass: { type: "string" },
                agent: { type: "string" },
                model: { type: "string" },
                variant: { type: ["string", "null"] },
                result: { type: "string" },
                verification: { enum: ["pass", "fail", "unverifiable", null] },
              },
              required: ["time", "taskClass", "agent", "model", "variant", "result", "verification"],
              additionalProperties: false,
            },
          },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: ["mode", "dispatches", "enforcedSwitches", "wouldSwitches", "decisions", "warnings"],
        additionalProperties: false,
      },
    },
  },
})
