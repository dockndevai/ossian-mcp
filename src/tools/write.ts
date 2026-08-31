import { z } from "zod";
import type { ToolDef } from "./types.js";
import { textResult } from "./types.js";

/**
 * Write tools. Registered only in `read-write` mode and up. They mutate the
 * corpus or the memory store, but nothing they do is irreversible — an ingested
 * document can be removed and a memory can be overwritten or left to expire.
 */
export const writeTools: ToolDef[] = [
  {
    name: "add_document_from_url",
    capability: "write",
    config: {
      title: "Add a document from a URL",
      description:
        "Fetch a public web page and add it to the corpus so it can be answered from later. Ingestion " +
        "is asynchronous — the document is not answerable the instant this returns. The server refuses " +
        "private and internal addresses, so this cannot be used to reach anything on its network.",
      inputSchema: {
        url: z.string().url().describe("A public http or https URL."),
        namespace: z.string().optional().describe("Which slice to file it under."),
        title: z.string().optional().describe("A title, if the page's own is unhelpful."),
      },
    },
    handler: async (args, { client, policy }) => {
      const namespace = args.namespace as string | undefined;
      const { dryRun } = policy.guard({ tool: "add_document_from_url", capability: "write", namespace });
      if (dryRun) {
        return textResult(`[dry-run] Would ingest ${args.url as string}${namespace ? ` into '${namespace}'` : ""}.`);
      }
      const r = await client.addUrl(args.url as string, namespace, args.title as string | undefined);
      return textResult(
        r.duplicate
          ? `Already in the corpus (identical content): ${r.documentId}`
          : `Ingesting ${args.url as string} as ${r.documentId}. It becomes answerable once processing finishes.`,
      );
    },
  },
  {
    name: "remember",
    capability: "write",
    config: {
      title: "Remember something",
      description:
        "Record something worth carrying beyond this conversation — a stated preference, a durable fact " +
        "about the user, a decision and its reason. Do NOT use this for things the documents already " +
        "say, for anything the user would be surprised to find stored, or for the content of the " +
        "conversation itself. Restating something already remembered is harmless: it updates rather " +
        "than duplicating.",
      inputSchema: {
        content: z
          .string()
          .min(1)
          .describe("One self-contained statement. It will be read back without surrounding context."),
        subject: z
          .string()
          .optional()
          .describe("Who or what it is about, e.g. 'user:ankit'. Enables recalling everything known about them."),
        kind: z
          .enum(["fact", "preference", "decision", "event"])
          .optional()
          .describe("Defaults to fact."),
        importance: z
          .number()
          .min(0)
          .max(5)
          .optional()
          .describe("Above 1 makes it outrank equally similar memories. Use sparingly."),
        sessionId: z
          .string()
          .optional()
          .describe("Scopes it to one conversation. Pair with ttlSeconds for scratch notes."),
        ttlSeconds: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Forget after this long. Omit to keep indefinitely."),
        agentId: z.string().optional(),
      },
    },
    handler: async (args, { client, policy, defaultAgentId }) => {
      const { dryRun } = policy.guard({ tool: "remember", capability: "write" });
      if (dryRun) return textResult(`[dry-run] Would remember: ${args.content as string}`);
      const m = await client.remember({
        agentId: (args.agentId as string | undefined) ?? defaultAgentId,
        content: args.content as string,
        subject: args.subject,
        kind: (args.kind as string | undefined) ?? "fact",
        importance: args.importance,
        sessionId: args.sessionId,
        ttlSeconds: args.ttlSeconds,
      });
      return textResult(`Remembered (${m.kind}${m.subject ? `, about ${m.subject}` : ""}).`);
    },
  },
];
