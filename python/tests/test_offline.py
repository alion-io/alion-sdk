"""Offline tests: a fake transport stands in for the server."""

import asyncio
import json
import re
import socket
from pathlib import Path

import pytest

import alion
from alion import Alion, AlionError, AsyncAlion


class Fake:
    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = []

    def __call__(self, url, headers, body, timeout):
        self.calls.append({"url": url, "headers": headers, "body": json.loads(body.decode()), "timeout": timeout})
        a = self.answers.pop(0)
        if isinstance(a, BaseException):
            raise a
        status, body_obj, hdrs = a if len(a) == 3 else (*a, {})
        text = body_obj if isinstance(body_obj, str) else json.dumps(body_obj)
        return status, {"content-type": "application/json", **hdrs}, text


def ok(structured):
    return 200, {"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": json.dumps(structured)}], "structuredContent": structured}}


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr("alion._client.time.sleep", lambda s: None)

    async def fast(s):
        return None

    monkeypatch.setattr("alion._client.asyncio.sleep", fast)
    monkeypatch.delenv("ALION_API_KEY", raising=False)
    monkeypatch.delenv("ALION_BASE_URL", raising=False)


def test_version_matches_pyproject():
    text = (Path(__file__).parent.parent / "src" / "alion" / "_version.py").read_text()
    assert re.search(r'"(.+)"', text).group(1) == alion.__version__


def test_endpoint_without_and_with_key(monkeypatch):
    f = Fake(ok({"items": []}))
    Alion(transport=f).search_companies(query="acme")
    assert f.calls[0]["url"] == "https://alion.io/mcp/open"
    assert "Authorization" not in f.calls[0]["headers"]

    g = Fake(ok({"items": []}))
    Alion("k_1", base_url="https://example.test/", transport=g).search_companies()
    assert g.calls[0]["url"] == "https://example.test/mcp"
    assert g.calls[0]["headers"]["Authorization"] == "Bearer k_1"

    monkeypatch.setenv("ALION_API_KEY", "k_env")
    assert Alion(transport=g).endpoint == "https://alion.io/mcp"
    assert Alion(api_key="", transport=g).endpoint == "https://alion.io/mcp/open"


def test_a_call_is_one_tools_call_none_dropped():
    f = Fake(ok({"items": [{"id": 1}], "has_more": False}))
    res = Alion(transport=f, app_name="my-agent/2.0").search_companies(industry="Fintech", country=None, limit=5)
    assert res == {"items": [{"id": 1}], "has_more": False}
    body = f.calls[0]["body"]
    assert body["jsonrpc"] == "2.0" and body["method"] == "tools/call"
    assert body["params"] == {"name": "search_companies", "arguments": {"industry": "Fintech", "limit": 5}}
    assert f.calls[0]["headers"]["User-Agent"] == f"alion-python/{alion.__version__} my-agent/2.0"
    assert f.calls[0]["headers"]["MCP-Protocol-Version"] == alion.PROTOCOL_VERSION


def test_text_content_when_no_structured_content():
    f = Fake((200, {"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": '{"a": 1}'}]}}))
    assert Alion(transport=f).call("get_job", {"id": 1}) == {"a": 1}


def test_tool_refusal_is_an_alion_error():
    payload = {"error": "account_required", "message": "get_company is paid.", "free_tools": ["search_jobs"]}
    f = Fake((200, {"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": json.dumps(payload)}], "isError": True}}))
    with pytest.raises(AlionError) as ei:
        Alion(transport=f).get_company(domain="stripe.com")
    e = ei.value
    assert e.code == "account_required" and e.tool == "get_company" and e.needs_account
    assert e.data["free_tools"] == ["search_jobs"]


def test_http_401_json_rpc_body():
    f = Fake((401, {"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "Invalid, expired or revoked token."}}))
    with pytest.raises(AlionError) as ei:
        Alion("bad", transport=f).search_jobs()
    assert ei.value.code == "unauthorized" and ei.value.status == 401 and "revoked" in str(ei.value)


def test_429_retried_then_ok_and_then_reported():
    r429 = (429, {"error": "rate_limited", "message": "slow down"}, {"retry-after": "0"})
    f = Fake(r429, ok({"items": []}))
    assert Alion(transport=f).search_jobs() == {"items": []}
    assert len(f.calls) == 2
    g = Fake(r429, r429)
    with pytest.raises(AlionError) as ei:
        Alion(transport=g, max_retries=1).search_jobs()
    assert ei.value.code == "rate_limited" and ei.value.status == 429


def test_500_retried_only_for_read_only_tools():
    e500 = (500, {"error": "internal_error", "message": "oops"})
    f = Fake(e500, ok({"items": []}))
    Alion(transport=f).search_companies()
    assert len(f.calls) == 2
    g = Fake(e500, ok({"status": "sent"}))
    with pytest.raises(AlionError) as ei:
        Alion(transport=g).send_message(person="x", text="hi")
    assert ei.value.status == 500 and len(g.calls) == 1


def test_network_error_retried_then_reported_timeout_not_retried():
    f = Fake(ConnectionError("reset"), ConnectionError("reset"))
    with pytest.raises(AlionError) as ei:
        Alion(transport=f, max_retries=1).search_jobs()
    assert ei.value.code == "network_error" and len(f.calls) == 2
    g = Fake(socket.timeout("timed out"))
    with pytest.raises(AlionError) as ei:
        Alion(transport=g).search_jobs()
    assert ei.value.code == "timeout" and len(g.calls) == 1


def test_paginate_follows_cursor_and_stops_at_max_items():
    f = Fake(ok({"items": [{"id": 1}, {"id": 2}], "has_more": True, "next_cursor": "c2"}), ok({"items": [{"id": 3}], "has_more": False, "next_cursor": None}))
    assert [r["id"] for r in Alion(transport=f).paginate("search_jobs", role="x")] == [1, 2, 3]
    assert f.calls[1]["body"]["params"]["arguments"] == {"role": "x", "cursor": "c2"}
    g = Fake(ok({"items": [{"id": 1}, {"id": 2}], "has_more": True, "next_cursor": "c2"}))
    assert [r["id"] for r in Alion(transport=g).paginate("search_jobs", max_items=1)] == [1]
    with pytest.raises(ValueError):
        list(Alion(transport=g).paginate("get_company"))


def test_sse_answer():
    sse = "event: message\ndata: " + json.dumps({"jsonrpc": "2.0", "id": 1, "result": {"structuredContent": {"ok": True}}}) + "\n\n"
    f = Fake((200, sse, {"content-type": "text/event-stream"}))
    assert Alion(transport=f).agent_status() == {"ok": True}


def test_list_tools_pages():
    f = Fake((200, {"jsonrpc": "2.0", "id": 1, "result": {"tools": [{"name": "a"}], "nextCursor": "n"}}), (200, {"jsonrpc": "2.0", "id": 2, "result": {"tools": [{"name": "b"}]}}))
    assert [t["name"] for t in Alion(transport=f).list_tools()] == ["a", "b"]
    assert f.calls[0]["body"]["method"] == "tools/list"


def test_every_tool_has_a_method():
    for name in alion.TOOL_NAMES:
        assert callable(getattr(Alion, name)) and asyncio.iscoroutinefunction(getattr(AsyncAlion, name))


def test_async_client():
    async def main():
        f = Fake((429, {"error": "rate_limited"}, {"retry-after": "0"}), ok({"items": [{"id": 1}], "next_cursor": "c"}), ok({"items": [{"id": 2}], "next_cursor": None}))
        async with AsyncAlion(transport=f) as a:
            rows = [r["id"] async for r in a.paginate("search_companies", industry="x")]
        assert rows == [1, 2] and len(f.calls) == 3
        g = Fake((200, {"jsonrpc": "2.0", "id": 1, "result": {"structuredContent": {"error": "account_required", "message": "paid"}, "isError": True}}))
        with pytest.raises(AlionError) as ei:
            await AsyncAlion(transport=g).get_company(domain="x.com")
        assert ei.value.needs_account

    asyncio.run(main())
