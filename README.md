# ossian-mcp

[![npm](https://img.shields.io/npm/v/ossian-mcp)](https://www.npmjs.com/package/ossian-mcp)
[![licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](LICENSE)

MCP server for [Ossian](https://github.com/dockndevai/ossian) — ask your organisation's own
documents and get the passages the answer came from, plus a memory for your agent that outlives
the conversation.

Ossian is the server; this is the adapter that puts it in front of an agent. You need a running
Ossian to point it at — see [its README](https://github.com/dockndevai/ossian) for a
`docker compose up`.

## What it gives an agent

Tools are gated by access mode (see [Safe by default](#safe-by-default)) — the server starts
read-only, exposing only the four read tools until you raise the mode.

| Tool | For | Needs mode |
|---|---|---|
| `ask_documents` | answer from the corpus, with citations — and say so when it cannot | read-only |
| `list_namespaces` | which slices exist, and how much is in each | read-only |
| `list_documents` | what is available to answer from, and what is still ingesting | read-only |
| `recall` | retrieve what is relevant now, ranked by relevance, importance and recency | read-only |
| `add_document_from_url` | pull a public page into the corpus | read-write |
| `remember` | record a preference, fact or decision worth keeping | read-write |
| `forget_session` | erase one conversation's memory (irreversible) | admin + `OSSIAN_ALLOW_FORGET` |

## Install

```bash
npm install -g ossian-mcp
```

You need a running Ossian and an API key. Issue one from the console (**Console → API keys**) or:

```bash
curl -X POST "$OSSIAN_URL/api/admin/api-keys" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"mcp","roles":["ossian-user"],"namespace":"handbooks"}'
```

Give the key the narrowest scope that works. `namespace` confines it to one slice, so a key that
leaks reads only what that agent was for.

## Configure

```json
{
  "mcpServers": {
    "ossian": {
      "command": "ossian-mcp",
      "env": {
        "OSSIAN_URL": "http://localhost:8081",
        "OSSIAN_API_KEY": "osk_...",
        "OSSIAN_AGENT_ID": "support-bot",
        "OSSIAN_MODE": "read-only"
      }
    }
  }
}
```

`OSSIAN_AGENT_ID` separates one agent's memories from another's; two agents sharing an id share
their recollections, which is occasionally what you want and usually not.

See [docs/CLIENTS.md](docs/CLIENTS.md) for Claude Code / Cursor / Codex / VS Code / Windsurf
snippets, and [.env.example](.env.example) for every supported variable.

## Safe by default

The server enforces an access model on top of the Ossian API key — defence in depth over the
key's own roles and namespace confinement. It reads its policy from the environment
([.env.example](.env.example)) and enforces it in [`src/security.ts`](src/security.ts):

- **`OSSIAN_MODE`** — `read-only` (default) → `read-write` → `admin`. A tool is registered only if
  the mode allows its capability. Read-only exposes four tools; ingest and remember need
  `read-write`; forget needs `admin`.
- **`OSSIAN_ALLOW_FORGET`** — `forget_session` erases memory irreversibly, so on top of `admin`
  mode it also requires this flag.
- **`OSSIAN_NAMESPACE_ALLOWLIST` / `OSSIAN_PROTECTED_NAMESPACES`** — confine which slices can be
  touched, and mark slices that may be read but never ingested into.
- **`OSSIAN_DRY_RUN`** — validate and log writes (ingest / remember / forget) without executing.
- **`OSSIAN_AUDIT_LOG`** — a JSON audit line per guarded operation, on stderr (default on).
- **Interactive confirmation** — when the client supports MCP elicitation, `forget_session` prompts the **human** to approve before erasing a session's memory; clients that can't elicit fall back to the `OSSIAN_ALLOW_FORGET` gate.

The primary control remains the API key: issue the narrowest one that works. See
[SECURITY.md](SECURITY.md).

## Two things worth knowing

**A "not found" is an answer.** `ask_documents` returns a refusal when nothing in the corpus
supports a response, and the tool description tells the model to report that rather than falling
back on general knowledge. An invented answer presented as company policy is the failure this
whole system exists to prevent — do not paper over it in your own prompt.

**Memory is not the corpus.** `recall` searches what the agent was told; `ask_documents` searches
what the organisation wrote down. They are separate stores on purpose: memories surfacing as
citations in a policy answer would be indistinguishable from the policy itself.

## Developing

```bash
npm install
npm run build
OSSIAN_URL=http://localhost:8081 OSSIAN_API_KEY=osk_… node dist/index.js
```

It speaks JSON-RPC over stdio, so it will sit there waiting for a frame. To drive it by hand:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

Diagnostics go to stderr on purpose — anything written to stdout that is not a protocol frame
corrupts the stream, and the failure looks like a client that cannot parse rather than a server
that printed a log line.

## Licence

Apache-2.0
