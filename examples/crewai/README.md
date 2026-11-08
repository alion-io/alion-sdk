# Alion in CrewAI

CrewAI connects to MCP servers natively, so Alion needs no extra package: give an agent Alion's MCP address.

```python
from crewai import Agent

scout = Agent(
    role="Startup scout",
    goal="Find recently funded startups in a market",
    backstory="You map markets from live company data.",
    mcps=["https://alion.io/mcp/open#search_companies", "https://alion.io/mcp/open#similar_companies"],
)
```

- `https://alion.io/mcp/open` is free without an Alion account: compact company and job searches, lookalikes, job postings and checks, 300 calls a day per network.
- `#tool_name` picks single tools, so each agent gets only what it needs. The bare address gives all 33 tools, including people and messaging ones.
- With an API key, use `MCPServerAdapter` and send the key as a header for full profiles, investors and pay statistics:

```python
from crewai_tools import MCPServerAdapter

server = {"url": "https://alion.io/mcp", "transport": "streamable-http", "headers": {"Authorization": "Bearer <ALION_API_KEY>"}}
with MCPServerAdapter(server, "get_company", "market_stats") as tools:
    analyst = Agent(role="Analyst", goal="...", backstory="...", tools=tools)
```

## Example: startup scout crew

[`startup_scout_crew.py`](startup_scout_crew.py) runs two agents. The scout finds startups in a market that raised a round in the last 180 days, plus lookalikes of the two newest. The analyst checks which of them are active and hiring, and for which roles. The crew writes a markdown brief.

```bash
pip install crewai "crewai-tools[mcp]"
export OPENAI_API_KEY=...        # or any LLM CrewAI supports
python startup_scout_crew.py --market Fintech --country DE
python startup_scout_crew.py --check-tools   # loads each agent's Alion tools, no LLM call
```

Tested with crewai 1.15.37 on 2026-11-09: both agents load their Alion tools from the open address, and the scout's search returns live results. The full crew run needs your LLM key.
