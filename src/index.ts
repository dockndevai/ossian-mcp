#!/usr/bin/env node
/**
 * MCP server for Ossian.
 *
 * Gives an agent two things it cannot get from a model alone: answers grounded in a company's own
 * documents, with the passage that produced each one, and a memory that survives the
 * conversation.
 *
 * Safe by default: the server starts in read-only mode, so only the read tools (ask_documents,
 * list_namespaces, list_documents, recall) are registered. Ingest and remember need
 * OSSIAN_MODE=read-write; the irreversible forget needs admin mode plus OSSIAN_ALLOW_FORGET=true.
 * The access model is enforced by src/security.ts and is defence in depth over the Ossian API
 * key's own roles and namespace confinement.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig();

if (!config.connection.apiKey) {
  // Fail at startup with the fix, rather than on the first tool call with a 401 the model will
  // try to work around.
  process.stderr.write(
    "OSSIAN_API_KEY is not set. Issue one from the Ossian console (Console → API keys) or:\n" +
      "  curl -X POST $OSSIAN_URL/api/admin/api-keys -H 'Authorization: Bearer <token>' \\\n" +
      "    -H 'Content-Type: application/json' -d '{\"name\":\"mcp\",\"roles\":[\"ossian-user\"]}'\n",
  );
  process.exit(1);
}

const { server, enabled } = buildServer(config);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout carries the protocol; anything written there that is not a JSON-RPC frame corrupts the
// stream. Diagnostics go to stderr.
process.stderr.write(
  `ossian-mcp connected to ${config.connection.baseUrl} [mode=${config.security.mode}, tools=${enabled.length}: ${enabled.join(", ")}]\n`,
);
