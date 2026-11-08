"""Live tests against https://alion.io without a key (the open address). Run: pytest -m live"""

import asyncio

import pytest

from alion import Alion, AlionError, AsyncAlion

pytestmark = pytest.mark.live

alion = Alion(api_key="", app_name="alion-sdk-tests")


def test_resolve_company():
    r = alion.resolve_company(query="stripe.com")
    assert r["match"]["domain"] == "stripe.com" and r["match"]["name"] == "Stripe"


def test_search_companies_compact():
    r = alion.search_companies(query="stripe", limit=2)
    assert any(c["domain"] == "stripe.com" for c in r["items"])
    assert r["meta"]["tier"] == "open"


def test_get_company_needs_an_account():
    with pytest.raises(AlionError) as ei:
        alion.get_company(domain="stripe.com")
    assert ei.value.code == "account_required" and ei.value.needs_account


def test_paginate_jobs():
    rows = list(alion.paginate("search_jobs", query="engineer", limit=2, max_items=3))
    assert len(rows) == 3 and all(j["id"] and j["title"] for j in rows)


def test_list_tools():
    assert any(t["name"] == "search_companies" for t in alion.list_tools())


def test_async():
    async def main():
        async with AsyncAlion(api_key="") as a:
            r = await a.resolve_company(domain="openai.com")
        assert r["match"]["name"] == "OpenAI"

    asyncio.run(main())
