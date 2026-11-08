# alion-mcp

The [Alion](https://alion.io/developers) MCP server as a local command, for clients and agent frameworks that start a process over stdio.

It gives your AI assistant live data on companies worldwide (what each one does, where it operates, its tech stack, funding rounds and investors, how fast it hires), startup investors, verified job postings with hiring and pay statistics, and people open to offers.

**Free without an account.** With an [API key](https://alion.io/developers/keys) you also get full company and investor profiles and the statistics.

```bash
npx -y alion-mcp
```

Your client can take a remote URL? Then you don't need this package: connect `https://alion.io/mcp/open` (no account) or `https://alion.io/mcp` (signs you in with your Alion account).

## Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "alion": {
      "command": "npx",
      "args": ["-y", "alion-mcp"]
    }
  }
}
```

With a key:

```json
{
  "mcpServers": {
    "alion": {
      "command": "npx",
      "args": ["-y", "alion-mcp"],
      "env": { "ALION_API_KEY": "your key" }
    }
  }
}
```

## Cursor, Windsurf, Cline

The same block goes into `.cursor/mcp.json`, `~/.codeium/windsurf/mcp_config.json` or Cline's MCP settings.

## VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "alion": { "type": "stdio", "command": "npx", "args": ["-y", "alion-mcp"] }
  }
}
```

## Claude Code

```bash
claude mcp add alion -- npx -y alion-mcp
```

## Agent frameworks

Any framework with an MCP stdio client works: the OpenAI Agents SDK (`MCPServerStdio`), LangChain (`langchain-mcp-adapters`), the Claude Agent SDK, LlamaIndex, CrewAI, Mastra. Command `npx`, arguments `["-y", "alion-mcp"]`.

## Options

| Flag | Environment | Meaning |
|---|---|---|
| `--api-key KEY` | `ALION_API_KEY` | Your key from [alion.io/developers/keys](https://alion.io/developers/keys) |
| `--scope NAME` | `ALION_MCP_SCOPE` | A narrower tool set: `jobs`, `companies` or `people` |
| `--url URL` | `ALION_MCP_URL` | Another endpoint (overrides the two above) |
| `--timeout S` | `ALION_TIMEOUT` | Seconds per request, default 120 |

## What the assistant can do

- **Companies:** search by industry, country, size, founding year, startup, funding stage, investor, technology and hiring; lookalikes; full profiles with funding, stack, offices and visa sponsorship.
- **Investors:** funds, accelerators and angels, with what they back, at which stage and how active they are now.
- **Jobs:** verified postings, plus demand, pay percentiles and top employers of a role in a country.
- **People:** people open to offers. You can read open profiles and write to them in Alion messages.
- **Agents:** check a company or an agent before dealing with it, write to a company, follow a search for new results.

Without a key: 300 calls a day per network, 30 a minute, compact lists of up to 20 rows.

## How it works

The hosted server is stateless, so this package is a thin relay: each JSON-RPC message from stdin is posted to the server, and each answer is written to stdout. It has no dependencies and needs Node 18+. Tools added on alion.io reach you without an update. Logs go to stderr.

## Links

- Docs: https://alion.io/developers
- JavaScript and TypeScript client: [`alion`](https://www.npmjs.com/package/alion)
- Source and issues: https://github.com/alion-io/alion-sdk
- MIT license
