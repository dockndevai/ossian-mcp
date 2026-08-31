import { z } from "zod";
import type { ToolDef } from "./types.js";
import { textResult } from "./types.js";

/**
 * Read tools. Available in every access mode (read-only and up).
 *
 * The descriptions are deliberately explicit about *when not* to use each tool.
 * A tool description is a prompt — it is the only thing the model reads before
 * deciding — and the common failure is not a malformed call but a well-formed
 * call to the wrong tool.
 */
export const readTools: ToolDef[] = [
  {
    name: "ask_documents",
    capability: "read",
    config: {
      title: "Ask the documents",
      description:
        "Answer a question from the organisation's own documents, with citations. Returns the exact " +
        "passages the answer was written from. Use this for anything about internal policy, runbooks, " +
        "handbooks, contracts or product documentation — anything the user's organisation wrote down. " +
        "If nothing in the corpus supports an answer this reports that rather than guessing: treat " +
        "'not found' as the real answer and say so, do not fall back on general knowledge and present " +
        "it as the organisation's policy.",
      inputSchema: {
        question: z.string().min(1).describe("The question, in full. Prefer the user's own wording."),
        namespace: z
          .string()
          .optional()
          .describe("Narrow to one slice of the corpus, e.g. 'runbooks'. Omit to search everything."),
      },
    },
    handler: async (args, { client, policy }) => {
      const namespace = args.namespace as string | undefined;
      policy.guard({ tool: "ask_documents", capability: "read", namespace });
      const r = await client.ask(args.question as string, namespace);
      if (!r.answeredFromContext) {
        return textResult(
          `No supporting passage was found in the documents.\n\n${r.answer}\n\n` +
            `Report this as "not covered by the documents" rather than answering from general knowledge.`,
        );
      }
      const sources = r.citations
        .map(
          (c) =>
            `[${c.index}] ${c.filename}${c.score != null ? ` (similarity ${c.score.toFixed(2)})` : ""}\n${c.excerpt}`,
        )
        .join("\n\n");
      return textResult(`${r.answer}\n\n--- sources ---\n${sources}`);
    },
  },
  {
    name: "list_namespaces",
    capability: "read",
    config: {
      title: "List namespaces",
      description:
        "List the slices the document corpus is divided into, with how many documents each holds. Use " +
        "this before ask_documents when a question clearly belongs to one area and you want to avoid " +
        "another area answering it.",
      inputSchema: {},
    },
    handler: async (_args, { client, policy }) => {
      policy.guard({ tool: "list_namespaces", capability: "read" });
      const ns = (await client.namespaces()).filter((n) => policy.isNamespaceAllowed(n.name));
      if (!ns.length) return textResult("No namespaces exist yet.");
      return textResult(ns.map((n) => `${n.name} — ${n.documents} documents, ${n.chunks} passages`).join("\n"));
    },
  },
  {
    name: "list_documents",
    capability: "read",
    config: {
      title: "List documents",
      description:
        "List the documents available to answer from, with their ingestion status. Use this to tell the " +
        "user what the system actually knows about, or to check whether something they uploaded has " +
        "finished processing.",
      inputSchema: { namespace: z.string().optional().describe("Restrict to one namespace.") },
    },
    handler: async (args, { client, policy }) => {
      const namespace = args.namespace as string | undefined;
      policy.guard({ tool: "list_documents", capability: "read", namespace });
      const page = await client.documents(namespace);
      if (!page.totalElements) return textResult("No documents.");
      const rows = page.content
        .map(
          (d) =>
            `${d.filename} — ${String(d.status).toLowerCase()}, ${d.chunkCount} passages [${d.namespace}]`,
        )
        .join("\n");
      return textResult(`${page.totalElements} documents\n\n${rows}`);
    },
  },
  {
    name: "recall",
    capability: "read",
    config: {
      title: "Recall from memory",
      description:
        "Retrieve what was previously remembered that relates to the current situation. Ranked by " +
        "relevance, weighted by importance and decayed by age, so a recent statement outranks an old " +
        "one saying the opposite. Worth calling at the start of a conversation with a returning user. " +
        "This searches memory, not documents — use ask_documents for anything the organisation wrote " +
        "down.",
      inputSchema: {
        query: z.string().min(1).describe("What you are trying to recall, in natural language."),
        subject: z.string().optional().describe("Narrow to one subject, e.g. 'user:ankit'."),
        sessionId: z.string().optional().describe("Narrow to one conversation."),
        limit: z.number().int().min(1).max(50).optional(),
        agentId: z.string().optional(),
      },
    },
    handler: async (args, { client, policy, defaultAgentId }) => {
      policy.guard({ tool: "recall", capability: "read" });
      const found = await client.recall({
        agentId: (args.agentId as string | undefined) ?? defaultAgentId,
        query: args.query as string,
        subject: args.subject,
        sessionId: args.sessionId,
        topK: (args.limit as number | undefined) ?? 8,
      });
      if (!found.length) return textResult("Nothing relevant is remembered.");
      return textResult(
        found
          .map(
            (m) =>
              `- ${m.content}${m.subject ? `  (${m.subject})` : ""}${m.score != null ? `  [${m.score.toFixed(2)}]` : ""}`,
          )
          .join("\n"),
      );
    },
  },
];
