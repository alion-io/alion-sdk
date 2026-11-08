"""LangChain's standard integration tests against https://alion.io without a key (the free tools).

pytest tests/integration_tests
"""

from __future__ import annotations

from typing import Any

from langchain_tests.integration_tests import ToolsIntegrationTests

from langchain_alion import AlionResolveCompany, AlionSearchCompanies, AlionSearchJobs, AlionSimilarCompanies, AlionToolkit


class _Live(ToolsIntegrationTests):
    @property
    def tool_constructor(self) -> type:  # pragma: no cover - overridden
        raise NotImplementedError

    @property
    def tool_constructor_params(self) -> dict[str, Any]:
        return {"api_key": None, "app_name": "langchain-alion-tests"}


class TestSearchCompaniesLive(_Live):
    @property
    def tool_constructor(self) -> type:
        return AlionSearchCompanies

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"query": "stripe", "limit": 2}


class TestResolveCompanyLive(_Live):
    @property
    def tool_constructor(self) -> type:
        return AlionResolveCompany

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"domain": "stripe.com"}


class TestSimilarCompaniesLive(_Live):
    @property
    def tool_constructor(self) -> type:
        return AlionSimilarCompanies

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"company": "stripe.com", "limit": 2}


class TestSearchJobsLive(_Live):
    @property
    def tool_constructor(self) -> type:
        return AlionSearchJobs

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"query": "engineer", "limit": 2}


def test_answers_are_real() -> None:
    tools = {t.alion_tool: t for t in AlionToolkit(api_key=None).get_tools()}  # type: ignore[attr-defined]
    resolved = tools["resolve_company"].invoke({"domain": "stripe.com"})
    assert '"Stripe"' in resolved
    paid = AlionToolkit(api_key=None, include=["get_company"]).get_tools()[0].invoke({"domain": "stripe.com"})
    assert "ALION_API_KEY" in paid
