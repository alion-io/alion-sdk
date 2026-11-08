# @alion-io/sdk

The official JavaScript and TypeScript client for [Alion](https://alion.io/developers): a live graph of companies worldwide (what each one does, where it operates, its tech stack, funding rounds and investors, how fast it hires), startup investors, verified job postings with hiring and pay statistics, and people open to offers.

Every tool of the [Alion MCP server](https://alion.io/developers/agents) is a typed method. It works in Node 18+, Bun, Deno, browsers and edge runtimes, and has no dependencies.

```bash
npm install @alion-io/sdk
```

## Free without a key

```ts
import { Alion } from '@alion-io/sdk';

const alion = new Alion(); // no key: the open address, free within a daily allowance

const { items } = await alion.searchCompanies({
  industry: 'Fintech',
  country: 'DE',
  startup: true,
  funding_stage: 'early',
  limit: 10,
});

const { match } = await alion.resolveCompany({ domain: 'stripe.com' });
const jobs = await alion.searchJobs({ query: 'data engineer', country: 'PL', work_mode: 'remote' });
```

Without a key you get compact company, investor and job searches, lookalike companies, full job postings, the people tools and the agent tools. The allowance is 300 calls a day per network, 30 a minute, and up to 20 rows per list.

## Everything with a key

Create a key at [alion.io/developers/keys](https://alion.io/developers/keys) and pass it, or set `ALION_API_KEY`:

```ts
const alion = new Alion({ apiKey: process.env.ALION_API_KEY });

const stripe = await alion.getCompany({ domain: 'stripe.com' });      // funding, hiring, stack, offices, visa
const pay = await alion.marketStats({ role: 'Backend Developer', country: 'US' });
const fund = await alion.getInvestor({ domain: 'sequoiacap.com' });
```

Calls with a key are paid from your account's credits. Prices are at [alion.io/developers](https://alion.io/developers).

## Paging

The searches return `next_cursor`. `paginate` walks the pages for you:

```ts
for await (const company of alion.paginate('search_companies', { technology: 'Snowflake', hiring: true }, { maxItems: 50 })) {
  console.log(company.name, company.domain);
}
```

The server stops a search at row 100. Narrow the filters to reach further.

## Errors

Every failure is an `AlionError` with a machine-readable `code`:

```ts
import { Alion, AlionError } from '@alion-io/sdk';

try {
  await alion.getCompany({ domain: 'stripe.com' });
} catch (e) {
  if (e instanceof AlionError) {
    e.code;          // "account_required", "invalid_params", "rate_limited", "unauthorized", "timeout", ...
    e.needsAccount;  // true when the tool needs a key or a payment
    e.data;          // the server's full answer: hints, free_tools, examples
  }
}
```

Rate limits (429), network errors and server errors on read-only tools are retried twice with backoff by default.

## Options

```ts
new Alion({
  apiKey: '...',            // default: process.env.ALION_API_KEY; null forces the open address
  appName: 'my-agent/1.0',  // added to the User-Agent so Alion can tell your agent apart
  timeoutMs: 60_000,
  maxRetries: 2,
  fetch: customFetch,       // any fetch implementation
  headers: { ... },         // extra headers on every call
});
```

Any tool can also be called by name, including tools added to the server after this release:

```ts
const result = await alion.call('check_counterparty', { target: 'acme.com' });
const tools = await alion.listTools(); // names, descriptions, input and output schemas
```

## Tools

| Method | What it does |
|---|---|
| `searchCompanies` | Companies by industry, country, size, founding year, startup, funding stage, investor, technology, ATS, hiring and growth level |
| `similarCompanies` | Lookalikes of a company |
| `getCompany` | One company in depth: funding, hiring, stack, offices, visa sponsorship |
| `resolveCompany` | Which company a name or a domain means |
| `searchInvestors`, `getInvestor` | Funds, accelerators and angels: what they back, at which stage, how active now |
| `searchJobs`, `getJob` | Verified job postings |
| `marketStats` | Demand, pay percentiles, top employers and technologies of a role in a country |
| `searchPeople`, `matchPeople`, `similarPeople`, `getPerson`, `checkFit` | People open to offers |
| `sendMessage`, `getConversation`, `listConversations` | Write to people in Alion messages |
| `watchSearch`, `checkWatch`, `listWatches`, `deleteWatch`, `setWebhook` | Follow a search for new results |
| `checkCounterparty`, `checkEmployer`, `contactCompany` | Check a company or an agent, write to a company |
| `registerAgent`, `getAgent`, `agentStatus`, `reportProblem` | Your agent on Alion |

The full list with every argument is in the types: your editor shows it as you type.

## For AI agents

To give a model these tools directly, connect the MCP server instead of wrapping methods yourself:

- remote clients (Claude, ChatGPT, Cursor, VS Code): `https://alion.io/mcp/open` without an account, `https://alion.io/mcp` with one;
- clients that start a local command: [`npx -y @alion-io/mcp`](https://www.npmjs.com/package/@alion-io/mcp).

## Links

- Docs: https://alion.io/developers
- Source and issues: https://github.com/alion-io/alion-sdk
- MIT license
