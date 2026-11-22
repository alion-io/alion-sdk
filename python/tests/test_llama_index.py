"""The LlamaIndex adapter (alion.llama_index): runs where llama-index-core is installed (the CI integrations job)."""

import json

import pytest

pytest.importorskip("llama_index.core")

from alion import Alion  # noqa: E402
from alion.llama_index import ALION_AGENT_TOOLS, alion_tools  # noqa: E402


def test_free_tools_without_a_key():
    names = [t.metadata.name for t in alion_tools(api_key="")]
    assert "alion_search_companies" in names and "alion_get_company" not in names


def test_every_tool_with_a_key():
    tools = alion_tools(api_key="k")
    assert len(tools) == len(ALION_AGENT_TOOLS)
    schema = next(t for t in tools if t.metadata.name == "alion_get_company_money").metadata.get_parameters_dict()
    assert "company" in schema["properties"] and "company" in schema.get("required", [])


def test_a_call_and_a_refusal():
    answers = [
        (200, {"jsonrpc": "2.0", "id": 1, "result": {"structuredContent": {"match": {"name": "Stripe"}}, "content": []}}),
        (200, {"jsonrpc": "2.0", "id": 2, "result": {"isError": True, "structuredContent": {"error": "account_required", "message": "get_company is paid"}, "content": []}}),
    ]

    def transport(url, headers, body, timeout):
        status, obj = answers.pop(0)
        return status, {"content-type": "application/json"}, json.dumps(obj)

    client = Alion(api_key="", transport=transport)
    tools = {t.metadata.name: t for t in alion_tools(client=client, include=["resolve_company", "get_company"])}
    assert tools["alion_resolve_company"](domain="stripe.com").raw_output["match"]["name"] == "Stripe"
    refused = tools["alion_get_company"](domain="stripe.com").raw_output
    assert refused["error"] == "account_required" and "developers/keys" in refused["hint"]
