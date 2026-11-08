# Alion SDK

Official clients for [Alion](https://alion.io/developers): companies, startups, investors, job postings, hiring and pay statistics, and people open to offers, for code and AI agents.

| Package | Install | What it is |
|---|---|---|
| [`alion`](js) | `npm install alion` | Typed JavaScript and TypeScript client. No dependencies. Works in Node 18+, Bun, Deno, browsers and edge runtimes |
| [`alion-mcp`](mcp) | `npx -y alion-mcp` | The Alion MCP server as a local stdio command, for Claude Desktop, Cursor, VS Code and agent frameworks |

Both are free without an account: compact searches, job postings, the people tools and the agent tools, within a daily allowance. Full profiles and statistics need an [API key](https://alion.io/developers/keys).

```ts
import { Alion } from 'alion';

const alion = new Alion();
const { items } = await alion.searchCompanies({ industry: 'Fintech', country: 'DE', startup: true, limit: 10 });
```

## Layout

- `schema/tools.json`: snapshot of the server's tool list (`https://alion.io/mcp/tools`), the source of the generated types.
- `scripts/generate.mjs`: regenerates `js/src/tools.generated.ts` from it. Run `node scripts/generate.mjs` after the server gains a tool or an argument, then release.
- `js/`: the `alion` package.
- `mcp/`: the `alion-mcp` package.

## Development

```bash
cd js && npm ci && npm run build && npm test && npm run test:types
npm run test:live          # against https://alion.io, no key needed
cd ../mcp && npm ci && npm test && npm run test:live
```

## Releasing

Push a tag. The publish workflow builds, tests and publishes with npm provenance (trusted publishing, no tokens):

- `js-v0.1.1`: publishes `alion` (the tag must equal `js/package.json` version);
- `mcp-v0.1.1`: publishes `alion-mcp` (the tag must equal `mcp/package.json` version).

## License

MIT
