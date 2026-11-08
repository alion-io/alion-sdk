"""LangChain's standard unit tests for every Alion tool, plus the toolkit and error handling (no network)."""

from __future__ import annotations

from typing import Any, Optional

import pytest
from alion import AlionError
from langchain_core.messages import ToolCall
from langchain_tests.unit_tests import ToolsUnitTests

from langchain_alion import ALL_TOOLS, FREE_TOOLS, AlionSearchCompanies, AlionToolkit, __version__

EXAMPLES: dict[str, dict[str, Any]] = {
    "search_companies": {"industry": "Fintech", "country": "DE", "startup": True, "limit": 5},
    "get_company": {"domain": "stripe.com"},
    "similar_companies": {"company": "stripe.com", "limit": 3},
    "resolve_company": {"domain": "stripe.com"},
    "check_counterparty": {"target": "stripe.com"},
    "search_investors": {"stage": "seed", "invests_in": "europe", "limit": 5},
    "get_investor": {"domain": "sequoiacap.com"},
    "search_jobs": {"role": "Data Engineer", "country": "PL", "work_mode": "remote", "limit": 5},
    "get_job": {"url": "https://alion.io/job/example"},
    "market_stats": {"role": "Backend", "country": "US"},
}


def _suite(tool_cls: type) -> type:
    name = tool_cls.model_fields["alion_tool"].default  # type: ignore[attr-defined]

    class Suite(ToolsUnitTests):
        @property
        def tool_constructor(self) -> type:
            return tool_cls

        @property
        def tool_constructor_params(self) -> dict[str, Any]:
            return {}

        @property
        def tool_invoke_params_example(self) -> dict[str, Any]:
            return EXAMPLES[name]

        @property
        def init_from_env_params(self) -> tuple[dict[str, str], dict[str, Any], dict[str, Any]]:
            return {"ALION_API_KEY": "test-key"}, {}, {"api_key": "test-key"}

    Suite.__name__ = Suite.__qualname__ = f"Test{tool_cls.__name__}"
    return Suite


for _cls in ALL_TOOLS:
    globals()[f"Test{_cls.__name__}"] = _suite(_cls)


def test_every_tool_has_an_example() -> None:
    assert {c.model_fields["alion_tool"].default for c in ALL_TOOLS} == set(EXAMPLES)


def test_names_are_prefixed_and_unique() -> None:
    names = [c.model_fields["name"].default for c in ALL_TOOLS]
    assert all(n.startswith("alion_") for n in names) and len(set(names)) == len(names)


def test_toolkit_without_key_offers_the_free_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ALION_API_KEY", raising=False)
    tools = AlionToolkit().get_tools()
    assert {t.alion_tool for t in tools} == set(FREE_TOOLS)  # type: ignore[attr-defined]


def test_toolkit_with_key_offers_everything_and_include_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALION_API_KEY", "k")
    assert len(AlionToolkit().get_tools()) == len(ALL_TOOLS)
    assert [t.name for t in AlionToolkit(include=["get_company"]).get_tools()] == ["alion_get_company"]
    with pytest.raises(ValueError):
        AlionToolkit(include=["no_such_tool"]).get_tools()


class _FakeClient:
    def __init__(self, result: Any = None, error: Optional[Exception] = None) -> None:
        self.result, self.error = result, error
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def call(self, name: str, args: dict[str, Any]) -> Any:
        self.calls.append((name, args))
        if self.error:
            raise self.error
        return self.result


def test_content_and_artifact_and_none_dropped() -> None:
    tool = AlionSearchCompanies(api_key=None)
    fake = _FakeClient(result={"items": [{"domain": "stripe.com"}]})
    tool._client = fake  # type: ignore[assignment]
    msg = tool.invoke(ToolCall(name=tool.name, args={"query": "stripe", "country": None}, id="1", type="tool_call"))
    assert fake.calls == [("search_companies", {"query": "stripe"})]
    assert '"stripe.com"' in msg.content and msg.artifact == {"items": [{"domain": "stripe.com"}]}


def test_refusal_reaches_the_model_as_text() -> None:
    tool = AlionSearchCompanies(api_key=None)
    tool._client = _FakeClient(error=AlionError("get_company: paid", code="account_required"))  # type: ignore[assignment]
    out = tool.invoke({"query": "x"})
    assert "paid" in out and "ALION_API_KEY" in out


def test_user_agent_names_the_package() -> None:
    tool = AlionSearchCompanies(api_key=None, app_name="my-agent/1.0")
    assert tool._client_kwargs()["app_name"] == f"langchain-alion/{__version__} my-agent/1.0"
    assert tool._client_kwargs()["api_key"] == ""
