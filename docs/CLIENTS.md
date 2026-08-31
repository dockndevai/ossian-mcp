# Installing `ossian-mcp` in your MCP client

`ossian-mcp` is a **stdio** MCP server. Any MCP-compatible agent can run it. Two ways to launch it:

- **From npm (recommended):** `npx -y ossian-mcp` — or `npm i -g ossian-mcp` and run `ossian-mcp`.
- **From source:** `node /ABSOLUTE/PATH/TO/ossian-mcp/dist/index.js` after `npm install && npm run build`.

> You need a running [Ossian](https://github.com/dockndevai/ossian) and an API key. **Start in `read-only` mode** and raise it deliberately. See [`.env.example`](../.env.example) for every supported variable.

## Claude Code (CLI)

```bash
claude mcp add ossian \
  -e OSSIAN_URL="http://localhost:8081" \
  -e OSSIAN_API_KEY="osk_..." \
  -e OSSIAN_AGENT_ID="support-bot" \
  -e OSSIAN_MODE="read-only" \
  -- npx -y ossian-mcp
```

Add `-s user` to install it for all your projects, or `-s project` to write it into a shared `.mcp.json`. List with `claude mcp list`, remove with `claude mcp remove ossian`.

## Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`) and merge:

```json
{
  "mcpServers": {
    "ossian": {
      "command": "npx",
      "args": ["-y", "ossian-mcp"],
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

Restart Claude Desktop. The server appears under the tools (🔨) menu.

## Cursor

Create `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for all projects):

```json
{
  "mcpServers": {
    "ossian": {
      "command": "npx",
      "args": ["-y", "ossian-mcp"],
      "env": {
        "OSSIAN_URL": "http://localhost:8081",
        "OSSIAN_API_KEY": "osk_...",
        "OSSIAN_MODE": "read-only"
      }
    }
  }
}
```

Then enable it in **Cursor Settings → MCP**.

## OpenAI Codex CLI

Edit `~/.codex/config.toml` and add:

```toml
[mcp_servers.ossian]
command = "npx"
args = ["-y", "ossian-mcp"]
env = { OSSIAN_URL = "http://localhost:8081", OSSIAN_API_KEY = "osk_...", OSSIAN_MODE = "read-only" }
```

Codex reads MCP servers from `config.toml` on startup.

## Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "ossian": {
      "command": "npx",
      "args": ["-y", "ossian-mcp"],
      "env": {
        "OSSIAN_URL": "http://localhost:8081",
        "OSSIAN_API_KEY": "osk_...",
        "OSSIAN_MODE": "read-only"
      }
    }
  }
}
```

Then **Refresh** in the Windsurf MCP settings panel.

## VS Code (GitHub Copilot / Agent mode)

Create `.vscode/mcp.json` (note the top-level key is `servers`):

```json
{
  "servers": {
    "ossian": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "ossian-mcp"],
      "env": {
        "OSSIAN_URL": "http://localhost:8081",
        "OSSIAN_API_KEY": "osk_...",
        "OSSIAN_MODE": "read-only"
      }
    }
  }
}
```

Open the Copilot Chat **Agent** view and confirm the server is listed.

## Any other MCP client

Point it at the command `npx -y ossian-mcp` (transport: **stdio**) with the same environment variables.

## Verify

On startup the server logs a line to **stderr** like:

```
ossian-mcp connected to http://localhost:8081 [mode=read-only, tools=4: ask_documents, list_namespaces, list_documents, recall]
```

If `OSSIAN_API_KEY` is missing it exits with the fix printed to stderr. Ask your agent to *"list the Ossian tools"* to confirm the connection.
