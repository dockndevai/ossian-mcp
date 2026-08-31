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

| Tool | For |
|---|---|
| `ask_documents` | answer from the corpus, with citations — and say so when it cannot |
| `list_namespaces` | which slices exist, and how much is in each |
| `list_documents` | what is available to answer from, and what is still ingesting |
| `add_document_from_url` | pull a public page into the corpus |
| `remember` | record a preference, fact or decision worth keeping |
| `recall` | retrieve what is relevant now, ranked by relevance, importance and recency |
| `forget_session` | erase one conversation's memory |

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
        "OSSIAN_AGENT_ID": "support-bot"
      }
    }
  }
}
```

`OSSIAN_AGENT_ID` separates one agent's memories from another's; two agents sharing an id share
their recollections, which is occasionally what you want and usually not.

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
