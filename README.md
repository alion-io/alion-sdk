# Alion SDK

Official clients for [Alion](https://alion.io/developers): companies, startups, investors, job postings, hiring and pay statistics, and people open to offers, for code and AI agents.

| Package | Install | What it is |
|---|---|---|
| [`@alion-io/sdk`](js) | `npm install @alion-io/sdk` | Typed JavaScript and TypeScript client. No dependencies. Works in Node 18+, Bun, Deno, browsers and edge runtimes |
| [`@alion-io/mcp`](mcp) | `npx -y @alion-io/mcp` | The Alion MCP server as a local stdio command, for Claude Desktop, Cursor, VS Code and agent frameworks |
| [`alion`](python) (PyPI) | `pip install alion` | Typed Python client, sync and async. Python 3.9+, standard library only |
| [`langchain-alion`](langchain) (PyPI) | `pip install langchain-alion` | LangChain tools and toolkit for agents (LangChain, LangGraph) |

Both are free without an account: compact searches, job postings, the people tools and the agent tools, within a daily allowance. Full profiles and statistics need an [API key](https://alion.io/developers/keys).

```ts
import { Alion } from '@alion-io/sdk';

const alion = new Alion();
const { items } = await alion.searchCompanies({ industry: 'Fintech', country: 'DE', startup: true, limit: 10 });
```

Frameworks: [LangChain](langchain) (`pip install langchain-alion`), [CrewAI](examples/crewai) (native MCP, no package needed), n8n ([`@alion-io/n8n-nodes-alion`](https://github.com/alion-io/n8n-nodes-alion)).

## Layout

- `schema/tools.json`: snapshot of the server's tool list (`https://alion.io/mcp/tools`), the source of the generated types.
- `scripts/generate.mjs`: regenerates `js/src/tools.generated.ts` and `python/src/alion/_types.py` + `_tools.py` from it. Run `node scripts/generate.mjs` after the server gains a tool or an argument, then release.
- `js/`: the `@alion-io/sdk` package.
- `mcp/`: the `@alion-io/mcp` package.
- `python/`: the `alion` package on PyPI.
- `langchain/`: the `langchain-alion` package on PyPI (tool classes generated into `_tools.py`).

## Development

```bash
cd js && npm ci && npm run build && npm test && npm run test:types
npm run test:live          # against https://alion.io, no key needed
cd ../mcp && npm ci && npm test && npm run test:live
cd ../python && pip install -e '.[dev]' && pytest && pytest -m live && mypy tests/typecheck_consumer.py src/alion
```

## Releasing

Push a tag. The publish workflow builds, tests and publishes with npm provenance (trusted publishing, no tokens):

- `js-v0.1.1`: publishes `@alion-io/sdk` (the tag must equal `js/package.json` version);
- `mcp-v0.1.1`: publishes `@alion-io/mcp` (the tag must equal `mcp/package.json` version);
- `py-v0.1.1`: publishes `alion` to PyPI (the tag must equal `python/src/alion/_version.py`);
- `lc-v0.1.1`: publishes `langchain-alion` to PyPI (the tag must equal `langchain/src/langchain_alion/_version.py`).

## License

MIT
