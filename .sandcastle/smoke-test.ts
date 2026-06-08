// Smoke test — runs ONLY the planner phase. No implement, no commits, no merge.
// Validates: docker sandbox boots, CLAUDE_CODE_OAUTH_TOKEN auth works,
// gh issue read works, structured <plan> output parses.
//   npx tsx .sandcastle/smoke-test.ts

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { z } from "zod";

const planSchema = z.object({
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), branch: z.string() }),
  ),
});

const hooks = {
  sandbox: { onSandboxReady: [{ command: "npm install" }] },
};

console.log("Smoke test: running planner only...\n");

const plan = await sandcastle.run({
  hooks,
  sandbox: docker(),
  name: "planner",
  maxIterations: 1,
  agent: sandcastle.claudeCode("claude-opus-4-8"),
  promptFile: "./.sandcastle/plan-prompt.md",
  output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
});

console.log("\n=== PLAN OUTPUT ===");
console.log(JSON.stringify(plan.output, null, 2));
console.log(`\nPlanner picked ${plan.output.issues.length} unblocked issue(s).`);
console.log("Smoke test OK — auth, sandbox, issue read, structured output all work.");
