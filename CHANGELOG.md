# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-09-09

### Changed
- Require **Node 22** (previously Node 20); the updated dependency tree needs Node ≥ 22.19. CI and release workflows, the Dockerfile base image, and `engines` were updated.
- Bump the test runner `vitest` to ^5.0.0.

### Security
- Refresh the dependency tree so `npm audit` reports **0 vulnerabilities**.

## [0.1.1] - 2026-08-31

### Added
- **Safe-by-default security model** (`src/security.ts`): access modes
  (`read-only` / `read-write` / `admin`), per-tool capability gating, namespace
  allowlist and protected namespaces, an opt-in gate for the irreversible
  `forget_session` (`OSSIAN_ALLOW_FORGET`), dry-run for writes, and a JSON audit
  log. The server now starts read-only, exposing only the four read tools until
  the mode is raised deliberately.
- **MCP tool annotations** on every tool (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint`), derived from each tool's capability.
- **Tests** (vitest) for the policy engine and annotation consistency.
- **CI/CD**: build+test, CodeQL, dependency audit and secret scan workflows;
  tag-driven release to npm with provenance; optional Official MCP Registry
  publish over GitHub OIDC.
- Project docs: `SECURITY.md`, `docs/CLIENTS.md`, `PUBLISHING.md`, `.env.example`,
  issue/PR templates, code of conduct, Dockerfile.

### Changed
- Bump `@modelcontextprotocol/sdk` to ^1.30.0 to clear known dependency
  advisories flagged by supply-chain scanners.
- Refactored the single-file server into `config` / `security` / `server` /
  `ossian/client` / `tools/{read,write,admin}` modules. No change to tool
  behaviour or the Ossian API surface.

## [0.1.0]

### Added
- Initial release: a thin MCP adapter over an Ossian installation. Seven tools —
  `ask_documents`, `list_namespaces`, `list_documents`, `add_document_from_url`,
  `remember`, `recall`, `forget_session` — for grounded document Q&A with
  citations and durable agent memory.
