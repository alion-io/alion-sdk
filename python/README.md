# alion

[![PyPI](https://img.shields.io/pypi/v/alion)](https://pypi.org/project/alion/) [![Python](https://img.shields.io/pypi/pyversions/alion)](https://pypi.org/project/alion/) [![CI](https://github.com/alion-io/alion-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/alion-io/alion-sdk/actions/workflows/ci.yml) [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/alion-io/alion-sdk/blob/main/examples/notebooks/quickstart.ipynb)

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

Calls with a key are paid from your account's credits, and a key comes with $1 of free data every month. Prices are at [alion.io/developers/pricing](https://alion.io/developers/pricing).

## Command line

`pip install alion` also installs the `alion` command (or run `python -m alion`):

```bash
alion companies --industry Fintech --country DE --startup --limit 5
alion similar stripe.com
alion jobs --query "data engineer" --country PL --work_mode remote --format csv > jobs.csv
alion events --type funding_round --country DE --since 7d            # with ALION_API_KEY
alion enrich stripe.com adyen.com mollie.com --slices funding,hiring  # with ALION_API_KEY
```

```
name              domain             industry            size_band  hq_country  open_jobs  founded_year
----------------  -----------------  ------------------  ---------  ----------  ---------  ------------
Skalar            skalar.de          Financial Services  11-50      DE          12
Trade Republic    traderepublic.com  Financial Services  201-500    DE          42         2015
Scalable Capital  scalable.capital   Financial Services  501-1000   DE          97         2014
```

Every flag is a tool argument. `--format table|json|csv`, `--all` walks every page, `--key` passes a key. `alion tools` lists every tool, `alion call <tool> --arg value` calls any of them.

## Recipes

**Enrich a list of domains** ($0.01 a company + $0.005 a slice; not found is free):

```python
res = alion.enrich_companies(["stripe.com", "adyen.com", "mollie.com"], slices="funding,hiring")
res["items"], res["not_found"], res["credits_charged"]
```

Up to 100 companies a call; longer lists are split for you.

**Follow funding rounds** ($0.005 an event):

```python
for event in alion.events(type="funding_round", country="DE", since="7d"):
    print(event["type"], event["company"]["name"], event["date"])   # each event once, oldest first; polls every 15 minutes
```

`follow=False` reads once and stops. Or let Alion push them with `watch_search(kind="events", deliver="webhook", ...)` and check each delivery:

```python
from alion import verify_webhook

ok = verify_webhook(raw_body, request.headers.get("X-Alion-Signature"), os.environ["ALION_WEBHOOK_SECRET"])
```

**A budget**: `Alion(max_credits=50)` refuses a call that could pass 50 credits ($5) in this process; `alion.credits_spent` says what was charged.

**To pandas or CSV** (`pip install "alion[pandas]"` for pandas):

```python
from alion import to_pandas, to_csv

rows = alion.search_companies(technology="Snowflake", country="US", hiring=True)
df = to_pandas(rows)            # nested fields become funding.last_round, hq.city...
open("snowflake.csv", "w").write(to_csv(rows))
```

More in [examples/python](https://github.com/alion-io/alion-sdk/tree/main/examples/python) and the [Colab notebook](https://colab.research.google.com/github/alion-io/alion-sdk/blob/main/examples/notebooks/quickstart.ipynb).

## LlamaIndex

```bash
pip install "alion[llama-index]"
```

```python
from llama_index.core.agent.workflow import FunctionAgent
from alion.llama_index import alion_tools

agent = FunctionAgent(tools=alion_tools(), llm=llm)   # no key: the free tools; ALION_API_KEY: all 16
print(await agent.run("Which fintech startups in Germany raised money this month, and are they hiring?"))
```

`alion_tools(include=["search_companies", "get_company_money"], max_credits=20)` picks tools and caps the spend. A refusal (no key, a limit, a bad argument) goes back to the model as `{"error", "message", "hint"}`, so it can recover instead of failing the run.

For LangChain and LangGraph there is [`langchain-alion`](https://pypi.org/project/langchain-alion/); CrewAI connects natively over MCP ([example](https://github.com/alion-io/alion-sdk/tree/main/examples/crewai)).

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
| `get_company` | One company in depth: funding, hiring, stack, offices, visa sponsorship; `slices=` adds more (money, ownership, record, financials, patents and trials, competitors, Buying windows...), `slices="summary"` lists what holds data and its price |
| `get_company_money`, `get_company_ownership`, `get_company_record` | Money in and out with a source on every row; owners, legal entities and subsidiaries; the public record for a counterparty check |
| `search_company_events` | What changed at companies: rounds, new offices, leadership hires, launches, Buying windows (also `watch_search(kind="events", deliver="webhook")`) |
| `search_contracts` | Public contracts and tenders: won by a company, put out by a buyer, ending soon |
| `resolve_company` | Which company a name, a domain or a registration number (LEI, CIK, VAT...) means |
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
