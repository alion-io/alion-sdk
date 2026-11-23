# Changelog: @alion-io/sdk

## 0.4.0 - 2026-11-23

- For recruiting tools: `toCandidateRecord(person)` turns a row of `searchPeople` / `matchPeople` / `similarPeople` or a `getPerson` profile into one flat record keyed by the new stable `person_id`, with the contacts the person gave your account (`contacts_basis`).
- Account webhooks (https://alion.io/developers/webhooks): `parseWebhook(rawBody, signature, secret)` checks the signature and returns the event typed by its name (`candidate.replied`, `candidate.consented`, `candidate.erased`, `role.became_hard`, `window.opened`; `WEBHOOK_EVENTS` lists the rest).
- `verifyWebhook` also checks the timestamped `t=<ts>,v1=<hex>` signature of the account webhooks and refuses a replay older than `toleranceSec` (300); the `sha256=` signature of the agent webhooks works as before.
- The people tools' types carry `person_id`, `contacts`, `contacts_shared` and `meta.mark`.

## 0.3.0 - 2026-11-23

- A command line: `npx @alion-io/sdk company stripe.com`. Commands `resolve`, `company`, `companies`, `similar`, `jobs`, `market`, `money`, `owners`, `record`, `events`, `contracts`, `enrich`, `call`, `tools`; `--format table|json|csv`, `--all` to walk every page.
- `@alion-io/sdk/ai-sdk`: `alionTools()` gives 16 company and job data tools to the Vercel AI SDK (5 and later). Without a key only the free ones; a refusal goes back to the model as `{ error, message, hint }`.
- `enrichCompanies(domains, { slices })`: up to 100 companies a call over REST `company.getBatch`; the ones not found are free.
- `events(args, { follow })`: an async iterator over the company event feed (rounds, offices, leadership hires, Buying windows), each event once, oldest first.
- `verifyWebhook(body, signature, secret)` for agent and watch webhooks; `toCSV` and `flatten` for exports.
- `maxCredits` stops the client before a call that could pass the budget; `creditsSpent` counts what was charged.
- `AlionError.hint`: where to get a key, when to retry.
- Inside CI the User-Agent says `ci`, so pipeline traffic is told apart from people.

## 0.2.0 - 2026-11-23

- The company slices: `getCompany({ slices })` with `summary`, `standard`, `premium` or a list; `getCompanyMoney`, `getCompanyOwnership`, `getCompanyRecord`.
- `searchCompanyEvents`, `searchContracts`; `resolveCompany` by registration number (LEI, CIK, VAT...).
- `watchSearch({ kind: 'events', deliver: 'webhook' })`.

## 0.1.0 - 2026-11-08

- First release under the `@alion-io` scope: every tool of the Alion MCP server as a typed method, `paginate`, `AlionError` with codes, retries with backoff. No dependencies; Node 18+, Bun, Deno, browsers, edge.
