import type { ZodRawShape } from "zod";
import type { OssianClient } from "../ossian/client.js";
import type { Capability, SecurityPolicy } from "../security.js";

export interface ToolContext {
  client: OssianClient;
  policy: SecurityPolicy;
  defaultAgentId: string;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface ToolDef<Shape extends ZodRawShape = ZodRawShape> {
  name: string;
  capability: Capability;
  /** Marks a mutating tool as destructive (irreversible loss). Defaults to `capability === "admin"`. */
  destructive?: boolean;
  /** Overrides the idempotency hint. Defaults to `true` for read tools, `false` otherwise. */
  idempotent?: boolean;
  config: {
    title: string;
    description: string;
    inputSchema: Shape;
  };
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}
