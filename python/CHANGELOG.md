# Changelog: alion (PyPI)

## 0.4.0 - 2026-11-23

- For recruiting tools: `to_candidate_record(person)` turns a row of `search_people` / `match_people` / `similar_people` or a `get_person` profile into one flat record keyed by the new stable `person_id`, with the contacts the person gave your account (`contacts_basis`).
- Account webhooks (https://alion.io/developers/webhooks): `parse_webhook(raw_body, signature, secret)` checks the signature and returns the event; `WEBHOOK_EVENTS` lists them.
- `verify_webhook` also checks the timestamped `t=<ts>,v1=<hex>` signature of the account webhooks and refuses a replay older than `tolerance` (300 s); the `sha256=` signature of the agent webhooks works as before.
- The people tools' types carry `person_id`, `contacts`, `contacts_shared` and `meta.mark`.

## 0.3.0 - 2026-11-23

- A command line: `alion company stripe.com` (or `python -m alion`). Commands `resolve`, `company`, `companies`, `similar`, `jobs`, `market`, `money`, `owners`, `record`, `events`, `contracts`, `enrich`, `call`, `tools`; `--format table|json|csv`, `--all` to walk every page.
- `alion.llama_index.alion_tools()`: 16 company and job data tools for LlamaIndex agents (`pip install "alion[llama-index]"`). Without a key only the free ones; a refusal goes back to the model as `{"error", "message", "hint"}`.
- `enrich_companies(domains, slices=...)`: up to 100 companies a call over REST `company.getBatch`; the ones not found are free.
- `events(type=..., follow=True)`: an iterator over the company event feed (rounds, offices, leadership hires, Buying windows), each event once, oldest first. Sync and async.
- `verify_webhook(body, signature, secret)`; `to_csv`, `flatten` and `to_pandas` (`pip install "alion[pandas]"`).
- `max_credits` stops the client before a call that could pass the budget; `credits_spent` counts what was charged.
- `AlionError.hint`: where to get a key, when to retry.
- Inside CI the User-Agent says `ci`, so pipeline traffic is told apart from people.

## 0.2.0 - 2026-11-23

- The company slices: `get_company(slices=...)` with `summary`, `standard`, `premium` or a list; `get_company_money`, `get_company_ownership`, `get_company_record`.
- `search_company_events`, `search_contracts`; `resolve_company` by registration number (LEI, CIK, VAT...).
- `watch_search(kind="events", deliver="webhook")`.

## 0.1.0 - 2026-11-08

- First release: every tool of the Alion MCP server as a typed method, sync (`Alion`) and async (`AsyncAlion`), `paginate`, `AlionError` with codes, retries with backoff. Python 3.9+, standard library only.
