import { z } from "zod";
import type { ToolDef } from "./types.js";
import { textResult } from "./types.js";

/**
 * Admin tools. Registered only in `admin` mode. `forget_session` erases memory
 * irreversibly, so it is additionally gated behind OSSIAN_ALLOW_FORGET=true.
 */
export const adminTools: ToolDef[] = [
  {
    name: "forget_session",
    capability: "admin",
    destructive: true,
    config: {
      title: "Forget a session",
      description:
        "Erase everything remembered for one conversation. Use when a session ends or the user asks to " +
        "be forgotten. Durable memories about a subject are not affected.",
      inputSchema: {
        sessionId: z.string().min(1),
        agentId: z.string().optional(),
      },
    },
    handler: async (args, { client, policy, defaultAgentId, confirm }) => {
      const { dryRun } = policy.guard({ tool: "forget_session", capability: "admin", destructive: true });
      const sessionId = args.sessionId as string;
      if (dryRun) return textResult(`[dry-run] Would forget all memories for session '${sessionId}'.`);
      const ok = await confirm.confirm({ action: "forget session (erase its memories)", target: sessionId });
      if (!ok.approved) return textResult(`Cancelled — ${ok.reason}.`);
      const r = await client.forgetSession((args.agentId as string | undefined) ?? defaultAgentId, sessionId);
      return textResult(`Forgot ${r.forgotten} ${r.forgotten === 1 ? "memory" : "memories"} from that session.`);
    },
  },
];
