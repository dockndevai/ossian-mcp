import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config.js";
import { OssianClient, OssianError } from "./ossian/client.js";
import { makeConfirmer } from "./elicit.js";
import { PolicyError, SecurityPolicy } from "./security.js";
import { adminTools } from "./tools/admin.js";
import { annotationsFor } from "./tools/annotations.js";
import { readTools } from "./tools/read.js";
import type { ToolContext, ToolDef } from "./tools/types.js";
import { writeTools } from "./tools/write.js";

export const ALL_TOOLS: ToolDef[] = [...readTools, ...writeTools, ...adminTools];

export function buildServer(config: AppConfig): { server: McpServer; enabled: string[] } {
  const policy = new SecurityPolicy(config.security);
  const client = new OssianClient(config.connection.baseUrl, config.connection.apiKey, config.connection.timeoutMs);
  const server = new McpServer({ name: "ossian", version: "0.2.0" });
  const ctx: ToolContext = { client, policy, defaultAgentId: config.defaultAgentId, confirm: makeConfirmer(server) };

  const enabled: string[] = [];
  for (const tool of ALL_TOOLS) {
    if (!policy.isCapabilityEnabled(tool.capability)) continue;
    enabled.push(tool.name);

    server.registerTool(
      tool.name,
      { ...tool.config, annotations: annotationsFor(tool) },
      async (args: Record<string, unknown>) => {
        try {
          return await tool.handler(args ?? {}, ctx);
        } catch (err) {
          return toErrorResult(err);
        }
      },
    );
  }

  return { server, enabled };
}

/** Errors reach the model as text it can act on, never as a stack trace. */
function toErrorResult(err: unknown) {
  let message: string;
  if (err instanceof PolicyError) {
    message = `Policy denied: ${err.message}`;
  } else if (err instanceof OssianError) {
    message =
      err.status === 401 || err.status === 403
        ? `Ossian refused this request (${err.status}): ${err.message}. The API key may lack the role, or be confined to another namespace.`
        : err.message;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
