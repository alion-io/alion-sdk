"""Startup scout: a two-agent CrewAI crew on Alion's free open MCP address (no Alion account needed).

The scout finds recently funded startups in a market and their lookalikes; the analyst checks which of them are
active and hiring, and for which roles. The result is a short markdown brief.

    pip install crewai "crewai-tools[mcp]"
    export OPENAI_API_KEY=...            # or any LLM CrewAI supports
    python startup_scout_crew.py --market "Fintech" --country DE

    python startup_scout_crew.py --check-tools   # loads the Alion tools only, no LLM call
"""

from __future__ import annotations

import argparse

from crewai import Agent, Crew, Process, Task

ALION = "https://alion.io/mcp/open"


def alion(*tools: str) -> list[str]:
    """MCP references to single Alion tools (CrewAI's `url#tool` syntax), so each agent gets only what it needs."""
    return [f"{ALION}#{t}" for t in tools]


def build_crew() -> Crew:
    scout = Agent(
        role="Startup scout",
        goal="Find startups in {market} in {country} that raised a round recently, plus close lookalikes",
        backstory="You map markets from live company data. You only report companies the data shows.",
        mcps=alion("search_companies", "similar_companies"),
        verbose=True,
    )
    analyst = Agent(
        role="Hiring analyst",
        goal="Tell which of the scouted startups are active and hiring, and for which roles",
        backstory="You check every company before it goes into a brief and you never guess.",
        mcps=alion("check_counterparty", "search_jobs"),
        verbose=True,
    )
    scouting = Task(
        description=(
            "Use search_companies with industry={market}, country={country}, startup=true, "
            "funding_stage=early, raised_since=180d, sort=recent_funding, limit=10. "
            "Then call similar_companies for the two most recently funded ones (limit 3 each). "
            "Return each company with its domain, last round and date, size and open roles."
        ),
        expected_output="A list of up to 15 companies with domain, last round, round date, size and open roles.",
        agent=scout,
    )
    checking = Task(
        description=(
            "For each company from the scout, call check_counterparty with its domain and keep the verdict. "
            "For the five with the most open roles, call search_jobs with company=<domain> and limit=5 "
            "and note which roles they hire for."
        ),
        expected_output=(
            "A markdown brief: a table of company, domain, last round, verdict, open roles and the roles they hire "
            "for, then three sentences on what the market is hiring for."
        ),
        agent=analyst,
        context=[scouting],
    )
    return Crew(agents=[scout, analyst], tasks=[scouting, checking], process=Process.sequential)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--market", default="Fintech", help="industry or segment, e.g. Fintech, Healthcare")
    parser.add_argument("--country", default="DE", help="ISO country code, e.g. DE, GB, US")
    parser.add_argument("--check-tools", action="store_true", help="load the Alion tools of each agent and exit")
    args = parser.parse_args()

    crew = build_crew()
    if args.check_tools:
        for agent in crew.agents:
            names = sorted(t.name for t in agent.get_mcp_tools(agent.mcps or []))
            print(f"{agent.role}: {names}")
        return

    result = crew.kickoff(inputs={"market": args.market, "country": args.country})
    print(result)


if __name__ == "__main__":
    main()
