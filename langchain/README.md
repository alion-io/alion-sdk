# langchain-alion

LangChain tools for [Alion](https://alion.io/developers): a live graph of companies worldwide (what each one does, where it operates, its tech stack, funding rounds and investors, how fast it hires), startup investors, verified job postings, and hiring and pay statistics.

Give an agent prospect lists, company enrichment by domain, lookalikes, investor research and market pay data. **Most tools are free without an account.**

```bash
pip install langchain-alion
```

## Quick start

```python
from langchain.agents import create_agent
from langchain_alion import AlionToolkit

agent = create_agent(
    "anthropic:claude-sonnet-5-5",
    tools=AlionToolkit().get_tools(),
)
result = agent.invoke({"messages": [{"role": "user", "content": "Find seed-stage fintech startups in Germany that are hiring, and their tech stacks."}]})
```

Any chat model that supports tool calling works. The tools also work in LangGraph and on their own:

```python
from langchain_alion import AlionSearchCompanies

tool = AlionSearchCompanies()
print(tool.invoke({"industry": "Fintech", "country": "DE", "startup": True, "funding_stage": "seed", "limit": 5}))
```

## Free without a key, everything with a key

Without a key, `AlionToolkit().get_tools()` returns the tools that are free on Alion's open address: search companies, similar companies, resolve a company, check a counterparty, search job postings and get a job posting. The allowance is 300 calls a day per network and up to 20 rows per list.

With an [API key](https://alion.io/developers/keys) you get every tool, including full company and investor profiles and pay statistics:

```bash
export ALION_API_KEY=...
```

or `AlionToolkit(api_key="...")`. Calls with a key are paid from your account's credits ([prices](https://alion.io/developers/pricing)).

## Tools

| Tool | Class | What it does | Free |
|---|---|---|---|
| `alion_search_companies` | `AlionSearchCompanies` | Companies by industry, country, size, founding year, startup, funding stage, recent rounds, investor, technology, ATS, hiring and growth level | Yes |
| `alion_get_company` | `AlionGetCompany` | One company in depth: funding, hiring, stack, offices, visa sponsorship | Key |
| `alion_similar_companies` | `AlionSimilarCompanies` | Lookalikes of a company | Yes |
| `alion_resolve_company` | `AlionResolveCompany` | Which company a name or a domain means | Yes |
| `alion_check_counterparty` | `AlionCheckCounterparty` | Whether a domain, site, email or agent is a real, active counterparty | Yes |
| `alion_search_investors` | `AlionSearchInvestors` | Funds, accelerators and angels by stage, sector, geography and activity | Key |
| `alion_get_investor` | `AlionGetInvestor` | One investor: portfolio, rounds, co-investors | Key |
| `alion_search_jobs` | `AlionSearchJobs` | Verified job postings by role, country, work mode, pay, technology and visa sponsorship | Yes |
| `alion_get_job` | `AlionGetJob` | One posting in full | Yes |
| `alion_market_stats` | `AlionMarketStats` | Demand, pay percentiles, top employers and technologies of a role in a country | Key |

Pick a subset with `AlionToolkit(include=["search_companies", "get_company"])`. Arguments and descriptions come from the Alion server's own tool schemas.

Each tool returns the answer as compact JSON text for the model, and the parsed answer as the message artifact (`response_format="content_and_artifact"`). When the server refuses a call (a paid tool without a key, a rate limit), the reason goes back to the model as text, so the agent can adjust instead of failing.

## Options

```python
AlionToolkit(
    api_key="...",            # default: ALION_API_KEY
    app_name="my-agent/1.0",  # added to the User-Agent
    timeout=120.0,            # seconds per call
    include=None,             # Alion tool names to include
)
```

## Links

- Alion docs: https://alion.io/developers
- Python client this package builds on: [`alion`](https://pypi.org/project/alion/)
- MCP server (for clients that speak MCP directly): `https://alion.io/mcp/open`, or `npx -y @alion-io/mcp`
- Source and issues: https://github.com/alion-io/alion-sdk
- MIT license
