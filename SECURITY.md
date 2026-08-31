# Security

`ossian-mcp` puts an Ossian installation — a document corpus and a durable
memory store — in front of an AI agent. Treat it like any other privileged
automation and grant it the least access it needs.

## Principles

- **Start read-only.** Leave `OSSIAN_MODE=read-only` until you need writes. In
  read-only mode only the read tools (`ask_documents`, `list_namespaces`,
  `list_documents`, `recall`) are registered — the ingest, remember, and forget
  tools are not exposed to the model at all.
- **The API key is the primary control.** These flags are defence in depth. The
  real boundary is the Ossian API key the server authenticates with: it carries
  its own roles and can be confined to a single namespace, so a key that leaks
  reads only what that agent was for. Issue the narrowest key that works
  (`Console → API keys`, or `POST /api/admin/api-keys` with a single `namespace`).
- **Capabilities are gated by mode.** Every tool declares a capability
  (`read` / `write` / `admin`). A tool is registered only if the mode allows its
  capability, and each call is re-checked at runtime (`src/security.ts`).
- **Protect namespaces.** Namespaces listed in `OSSIAN_PROTECTED_NAMESPACES` can
  be read and searched but never ingested into.
- **Gate irreversible forget.** `forget_session` erases a conversation's memory
  and cannot be undone. It requires both `admin` mode and
  `OSSIAN_ALLOW_FORGET=true`.
- **Preview with dry-run.** `OSSIAN_DRY_RUN=true` validates and logs write intent
  (ingest / remember / forget) without executing it.
- **Memory is not the corpus.** `recall` searches what the agent was told;
  `ask_documents` searches what the organisation wrote down. They are separate
  stores on purpose — a memory surfacing as a citation in a policy answer would
  be indistinguishable from the policy itself.

## Server-side protections (in Ossian)

- **SSRF refusal.** `add_document_from_url` cannot be used to reach private or
  internal addresses; Ossian refuses them, so the tool cannot pull anything off
  the server's own network.
- **A "not found" is an answer.** `ask_documents` returns a refusal when nothing
  in the corpus supports a response rather than inventing one. An invented answer
  presented as company policy is the failure this whole system exists to prevent.

## Limitations

- Namespace allowlist/protection is enforced on the namespace *parameter* a tool
  is given and on the `list_namespaces` result. A search with no namespace still
  goes to whatever the API key can see — for a hard boundary, confine the API key
  to a namespace rather than relying on the flag alone.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a
public issue.
