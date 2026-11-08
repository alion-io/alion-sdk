"""Checked by mypy --strict in CI (not run): the typed methods accept the schema's arguments and refuse others.
Each `type: ignore` marks a line that must be an error; --warn-unused-ignores fails the check if it is not."""

from typing import Optional

from alion import Alion, AlionError, AsyncAlion, types


def sync_usage() -> None:
    alion = Alion()
    r: types.SearchCompaniesResult = alion.search_companies(industry="Fintech", startup=True, hiring_level="A", limit=5)
    domain: Optional[str] = (r.get("items") or [{}])[0].get("domain")
    alion.similar_companies(company="stripe.com")
    alion.get_company(domain="stripe.com")
    for job in alion.paginate("search_jobs", query="rust", max_items=10):
        print(job.get("title"))
    try:
        alion.get_company(domain="x")
    except AlionError as e:
        print(e.code, e.needs_account)

    alion.search_companies(hiring_level="Z")  # type: ignore[arg-type]
    alion.search_companies(no_such_argument=1)  # type: ignore[call-arg]
    alion.similar_companies()  # type: ignore[call-arg]
    print(domain)


async def async_usage() -> None:
    alion = AsyncAlion(api_key="")
    r: types.SearchJobsResult = await alion.search_jobs(query="go", country="DE")
    print(r.get("items"))
    async for c in alion.paginate("search_companies", technology="Snowflake"):
        print(c.get("name"))
