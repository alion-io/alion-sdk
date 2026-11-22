# Alion SDK

[![npm @alion-io/sdk](https://img.shields.io/npm/v/@alion-io/sdk?label=%40alion-io%2Fsdk)](https://www.npmjs.com/package/@alion-io/sdk)
[![npm @alion-io/mcp](https://img.shields.io/npm/v/@alion-io/mcp?label=%40alion-io%2Fmcp)](https://www.npmjs.com/package/@alion-io/mcp)
[![PyPI alion](https://img.shields.io/pypi/v/alion?label=alion)](https://pypi.org/project/alion/)
[![PyPI langchain-alion](https://img.shields.io/pypi/v/langchain-alion?label=langchain-alion)](https://pypi.org/project/langchain-alion/)
[![CI](https://github.com/alion-io/alion-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/alion-io/alion-sdk/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Company data for code and AI agents, from [Alion](https://alion.io/developers): 3.7 million companies with what each one does, where it operates, its tech stack, funding rounds and investors, owners, the public record, dated events (rounds, new offices, leadership hires), public contracts, and verified job postings with hiring and pay statistics.

**No account needed to start.** Without a key you get company, investor and job searches, lookalikes, name and domain matching, and market statistics, 300 calls a day.

## Try it in 10 seconds

```bash
npx @alion-io/sdk companies --industry Fintech --country DE --startup --limit 5
```

```
name              domain             industry            size_band  hq_country  open_jobs  founded_year
----------------  -----------------  ------------------  ---------  ----------  ---------  ------------
Skalar            skalar.de          Financial Services  11-50      DE          12
Trade Republic    traderepublic.com  Financial Services  201-500    DE          42         2015
Scalable Capital  scalable.capital   Financial Services  501-1000   DE          97         2014
...
```

Or in Python: `pip install alion`, then `alion companies --industry Fintech --country DE --startup`.

## Pick your package

| You are building | Install | Start here |
|---|---|---|
| A script, a backend, a data pipeline (JS/TS) | `npm install @alion-io/sdk` | [js/](js) |
| The same in Python, sync or async, pandas | `pip install alion` | [python/](python) |
| An agent with the Vercel AI SDK | `npm install @alion-io/sdk ai` | [`alionTools()`](js#vercel-ai-sdk) |
| An agent with LlamaIndex | `pip install "alion[llama-index]"` | [`alion_tools()`](python#llamaindex) |
| An agent with LangChain or LangGraph | `pip install langchain-alion` | [langchain/](langchain) |
| An agent with CrewAI | nothing, native MCP | [examples/crewai](examples/crewai) |
| Claude Desktop, Cursor, VS Code, any MCP client | `npx -y @alion-io/mcp` or the URL `https://alion.io/mcp/open` | [mcp/](mcp) |
| A spreadsheet or a one-off list | `npx @alion-io/sdk ... --format csv` | [CLI](js#command-line) |
| n8n | [`@alion-io/n8n-nodes-alion`](https://github.com/alion-io/n8n-nodes-alion) | |

## Recipes

Each one is a runnable script in [examples/](examples).

| Task | Code | Cost |
|---|---|---|
| A prospect list: fintech startups in Germany that are hiring, to CSV | `searchCompanies({ industry: 'Fintech', country: 'DE', startup: true, hiring: true })` | free without a key; $0.01 a company with a key |
| Lookalikes of your best customer | `similarCompanies({ company: 'stripe.com' })` | free without a key |
| Enrich a CRM export of domains | `enrichCompanies(domains, { slices: 'funding,hiring' })` | $0.01 a company + $0.005 a slice; not found is free |
| Funding round alerts | `for await (const e of alion.events({ type: 'funding_round', country: 'DE' }))` | $0.005 an event |
| Who a company pays and who pays it | `getCompanyMoney({ company: 'stripe.com' })` | $0.05 a call, up to 200 rows |
| A counterparty check before a deal | `getCompanyRecord({ company: 'acme.com' })` | $0.05 a call |
| Open roles at a company, hiring trend | `searchJobs({ company: 'stripe.com' })` | free without a key |
| Pay and demand for a role in a country | `marketStats({ role: 'Data Engineer', country: 'PL' })` | free |

A key comes with $1 of free data every month. Prices: [alion.io/developers/pricing](https://alion.io/developers/pricing). The SDKs can stop themselves before they overspend: `new Alion({ maxCredits: 50 })`.

## What a key adds

| Without a key | With a key |
|---|---|
| Compact company cards, up to 20 rows a list | Full profiles: funding, hiring, stack, offices, visa sponsorship |
| Company, investor and job searches, lookalikes | Slices: money, ownership, record, financials, patents and trials, competitors, Buying windows |
| Name, domain and identifier matching (LEI, CIK, VAT...) | The company event feed and webhooks |
| Market statistics, job postings | Public contracts and tenders, batch enrichment |

Get a key at [alion.io/developers/keys](https://alion.io/developers/keys) and set `ALION_API_KEY`.

## Answers

Every row has a stable `id` and the `url` of its Alion page. Every answer has `meta.schema_version` (the shape of the answers; changes are listed on [alion.io/developers/docs](https://alion.io/developers/docs#dev_doc_changes)) and a `cite` block with a dated sentence and a source line, for agents that quote figures. Empty means unknown, never zero.

## Repository layout

- `js/`: `@alion-io/sdk`, the JavaScript and TypeScript client, the CLI and the Vercel AI SDK tools.
- `python/`: `alion` on PyPI, the Python client, the CLI and the LlamaIndex tools.
- `langchain/`: `langchain-alion` on PyPI.
- `mcp/`: `@alion-io/mcp`, the MCP server as a local stdio command.
- `examples/`: runnable recipes in both languages, a notebook, CrewAI.
- `schema/tools.json`: a snapshot of the server's tool list (`https://alion.io/mcp/tools`); `scripts/generate.mjs` regenerates the typed methods from it.

## Development

```bash
node scripts/generate.mjs   # after the server gains a tool or an argument
cd js && npm ci && npm run build && npm test && npm run test:types
cd ../mcp && npm ci && npm test
cd ../python && pip install -e '.[dev]' && pytest && mypy src/alion
```

Live tests against https://alion.io run on demand: the CI workflow's `live` input, or `npm run test:live` and `pytest -m live` locally.

## Releasing

Push a tag. The publish workflow tests, publishes with trusted publishing (no stored tokens) and creates a GitHub release from the package's CHANGELOG:

- `js-vX.Y.Z`: `@alion-io/sdk` (must equal `js/package.json`);
- `mcp-vX.Y.Z`: `@alion-io/mcp` (must equal `mcp/package.json`);
- `py-vX.Y.Z`: `alion` (must equal `python/src/alion/_version.py`);
- `lc-vX.Y.Z`: `langchain-alion` (must equal `langchain/src/langchain_alion/_version.py`).

## Help

Questions and ideas: [Discussions](https://github.com/alion-io/alion-sdk/discussions). Bugs and wrong data: [Issues](https://github.com/alion-io/alion-sdk/issues/new/choose).

## License

MIT
