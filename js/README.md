# @alion-io/sdk

[![npm](https://img.shields.io/npm/v/@alion-io/sdk)](https://www.npmjs.com/package/@alion-io/sdk) [![CI](https://github.com/alion-io/alion-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/alion-io/alion-sdk/actions/workflows/ci.yml) [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/alion-io/alion-sdk/tree/main/examples/js)

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

Calls with a key are paid from your account's credits, and a key comes with $1 of free data every month. Prices are at [alion.io/developers/pricing](https://alion.io/developers/pricing).

## Command line

No install needed:

```bash
npx @alion-io/sdk companies --industry Fintech --country DE --startup --limit 5
npx @alion-io/sdk similar stripe.com
npx @alion-io/sdk jobs --query "data engineer" --country PL --work_mode remote --format csv > jobs.csv
npx @alion-io/sdk events --type funding_round --country DE --since 7d          # with ALION_API_KEY
npx @alion-io/sdk enrich stripe.com adyen.com mollie.com --slices funding,hiring  # with ALION_API_KEY
```

```
name              domain             industry            size_band  hq_country  open_jobs  founded_year
----------------  -----------------  ------------------  ---------  ----------  ---------  ------------
Skalar            skalar.de          Financial Services  11-50      DE          12
Trade Republic    traderepublic.com  Financial Services  201-500    DE          42         2015
Scalable Capital  scalable.capital   Financial Services  501-1000   DE          97         2014
```

Every flag is a tool argument. `--format table|json|csv`, `--all` walks every page, `--key` passes a key. `npx @alion-io/sdk tools` lists every tool, `npx @alion-io/sdk call <tool> --arg value` calls any of them.

## Recipes

**Enrich a list of domains** ($0.01 a company + $0.005 a slice; not found is free):

```ts
const { items, not_found, credits_charged } = await alion.enrichCompanies(['stripe.com', 'adyen.com', 'mollie.com'], { slices: 'funding,hiring' });
```

Up to 100 companies a call; longer lists are split for you.

**Follow funding rounds** ($0.005 an event):

```ts
for await (const event of alion.events({ type: 'funding_round', country: 'DE', since: '7d' })) {
  console.log(event.type, event.company?.name, event.date);   // each event once, oldest first; polls every 15 minutes
}
```

`{ follow: false }` reads once and stops. Or let Alion push them: `watchSearch({ kind: 'events', deliver: 'webhook', ... })`, then check each delivery:

```ts
import { verifyWebhook } from '@alion-io/sdk';

const ok = await verifyWebhook(rawBody, request.headers.get('x-alion-signature'), process.env.ALION_WEBHOOK_SECRET!);
```

**For recruiting tools** (ATS, CRM): people rows as flat records keyed by the stable `person_id`, and the account webhooks of [alion.io/developers/webhooks](https://alion.io/developers/webhooks) (`candidate.replied`, `candidate.consented`, `candidate.erased`, `role.became_hard`, ...) checked and typed in one call:

```ts
import { toCandidateRecord, parseWebhook } from '@alion-io/sdk';

const { items } = await alion.matchPeople({ role: 'Backend', technology: 'Python,Kubernetes', can_work_in: 'US' });
const rows = items.map(toCandidateRecord);   // person_id, handle, name, skills, current_job, the contacts you were given...

const event = await parseWebhook(rawBody, request.headers.get('x-alion-signature'), process.env.ALION_WEBHOOK_SECRET!);
if (event.event === 'candidate.erased') await ats.remove(event.data.person.person_id);
```

**A budget**: `new Alion({ maxCredits: 50 })` refuses a call that could pass 50 credits ($5) in this process; `alion.creditsSpent` says what was charged.

**To CSV**:

```ts
import { toCSV } from '@alion-io/sdk';

const { items } = await alion.searchCompanies({ technology: 'Snowflake', country: 'US', hiring: true });
await fs.writeFile('snowflake.csv', toCSV(items));     // nested fields become funding.last_round, hq.city...
```

More in [examples/js](https://github.com/alion-io/alion-sdk/tree/main/examples/js).

## Vercel AI SDK

```bash
npm install @alion-io/sdk ai
```

```ts
import { generateText, stepCountIs } from 'ai';
import { alionTools } from '@alion-io/sdk/ai-sdk';

const { text } = await generateText({
  model: 'anthropic/claude-sonnet-5-5',
  tools: alionTools(),                  // no key: the free tools; ALION_API_KEY: all 16
  stopWhen: stepCountIs(5),
  prompt: 'Which fintech startups in Germany raised money this month, and are they hiring?',
});
```

`alionTools({ include: ['search_companies', 'get_company_money'], maxCredits: 20 })` picks tools and caps the spend. A refusal (no key, a limit, a bad argument) goes back to the model as `{ error, message, hint }`, so it can recover instead of failing the run.

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
    e.hint;          // what to do: where to get a key, when to retry
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
  maxCredits: 50,           // refuse calls that could pass this budget (credits, $0.10 each)
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
| `getCompany` | One company in depth: funding, hiring, stack, offices, visa sponsorship; `slices` adds more (money, ownership, record, financials, patents and trials, competitors, Buying windows...), `slices: 'summary'` lists what holds data and its price |
| `getCompanyMoney`, `getCompanyOwnership`, `getCompanyRecord` | Money in and out with a source on every row; owners, legal entities and subsidiaries; the public record for a counterparty check |
| `searchCompanyEvents` | What changed at companies: rounds, new offices, leadership hires, launches, Buying windows (also `watchSearch({ kind: 'events', deliver: 'webhook' })`) |
| `searchContracts` | Public contracts and tenders: won by a company, put out by a buyer, ending soon |
| `resolveCompany` | Which company a name, a domain or a registration number (LEI, CIK, VAT...) means |
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
