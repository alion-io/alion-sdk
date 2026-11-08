# alion

The official Python client for [Alion](https://alion.io/developers): a live graph of companies worldwide (what each one does, where it operates, its tech stack, funding rounds and investors, how fast it hires), startup investors, verified job postings with hiring and pay statistics, and people open to offers.

Every tool of the [Alion MCP server](https://alion.io/developers/agents) is a typed method, sync or async. Python 3.9+. It uses only the standard library (plus `typing_extensions` before 3.11).

```bash
pip install alion
```

## Free without a key

```python
from alion import Alion

alion = Alion()  # no key: the open address, free within a daily allowance

companies = alion.search_companies(industry="Fintech", country="DE", startup=True, funding_stage="early", limit=10)
for c in companies["items"]:
    print(c["name"], c["domain"])

match = alion.resolve_company(domain="stripe.com")["match"]
jobs = alion.search_jobs(query="data engineer", country="PL", work_mode="remote")
```

Without a key you get compact company, investor and job searches, lookalike companies, full job postings, the people tools and the agent tools. The allowance is 300 calls a day per network, 30 a minute, and up to 20 rows per list.

## Everything with a key

Create a key at [alion.io/developers/keys](https://alion.io/developers/keys) and pass it, or set `ALION_API_KEY`:

```python
alion = Alion(api_key="...")

stripe = alion.get_company(domain="stripe.com")          # funding, hiring, stack, offices, visa
pay = alion.market_stats(role="Backend Developer", country="US")
fund = alion.get_investor(domain="sequoiacap.com")
```

Calls with a key are paid from your account's credits. Prices are at [alion.io/developers](https://alion.io/developers).

## Async

```python
from alion import AsyncAlion

async with AsyncAlion() as alion:
    jobs = await alion.search_jobs(query="rust", country="DE")
```

## Paging

```python
for company in alion.paginate("search_companies", technology="Snowflake", hiring=True, max_items=50):
    print(company["name"])
```

The server stops a search at row 100. Narrow the filters to reach further.

## Errors

Every failure is an `AlionError` with a machine-readable `code`:

```python
from alion import AlionError

try:
    alion.get_company(domain="stripe.com")
except AlionError as e:
    e.code           # "account_required", "invalid_params", "rate_limited", "unauthorized", "timeout", ...
    e.needs_account  # True when the tool needs a key or a payment
    e.data           # the server's full answer: hints, free_tools, examples
```

Rate limits (429), network errors and server errors on read-only tools are retried twice with backoff by default.

## Options

```python
Alion(
    api_key="...",            # default: ALION_API_KEY; "" forces the open address
    app_name="my-agent/1.0",  # added to the User-Agent so Alion can tell your agent apart
    timeout=60.0,
    max_retries=2,
    headers={...},            # extra headers on every call
    transport=my_transport,   # (url, headers, body, timeout) -> (status, headers, text), e.g. over httpx or requests
)
```

Any tool can also be called by name, including tools added to the server after this release:

```python
alion.call("check_counterparty", {"target": "acme.com"})
alion.list_tools()  # names, descriptions, input and output schemas
```

## Tools

| Method | What it does |
|---|---|
| `search_companies` | Companies by industry, country, size, founding year, startup, funding stage, investor, technology, ATS, hiring and growth level |
| `similar_companies` | Lookalikes of a company |
| `get_company` | One company in depth: funding, hiring, stack, offices, visa sponsorship |
| `resolve_company` | Which company a name or a domain means |
| `search_investors`, `get_investor` | Funds, accelerators and angels: what they back, at which stage, how active now |
| `search_jobs`, `get_job` | Verified job postings |
| `market_stats` | Demand, pay percentiles, top employers and technologies of a role in a country |
| `search_people`, `match_people`, `similar_people`, `get_person`, `check_fit` | People open to offers |
| `send_message`, `get_conversation`, `list_conversations` | Write to people in Alion messages |
| `watch_search`, `check_watch`, `list_watches`, `delete_watch`, `set_webhook` | Follow a search for new results |
| `check_counterparty`, `check_employer`, `contact_company` | Check a company or an agent, write to a company |
| `register_agent`, `get_agent`, `agent_status`, `report_problem` | Your agent on Alion |

Every argument is typed (`alion.types`), so your editor completes them and mypy or pyright check them.

## For AI agents

To give a model these tools directly, connect the MCP server instead of wrapping methods yourself:

- remote clients (Claude, ChatGPT, Cursor, VS Code, the OpenAI Agents SDK, LangChain's `langchain-mcp-adapters`): `https://alion.io/mcp/open` without an account, `https://alion.io/mcp` with one;
- clients that start a local command: `npx -y @alion-io/mcp`.

## Links

- Docs: https://alion.io/developers
- JavaScript and TypeScript: [`@alion-io/sdk`](https://www.npmjs.com/package/@alion-io/sdk)
- Source and issues: https://github.com/alion-io/alion-sdk
- MIT license
