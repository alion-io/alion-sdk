from __future__ import annotations

import asyncio
import functools
import json
import os
import random
import socket
import time
import urllib.error
import urllib.request
from typing import Any, AsyncIterator, Callable, Dict, Iterator, List, Mapping, Optional, Tuple

from ._errors import AlionError
from ._tools import AsyncTools, SyncTools
from ._types import PAGED_TOOLS, READ_ONLY_TOOLS
from ._version import __version__

PROTOCOL_VERSION = "2025-11-25"
"""The protocol revision this client speaks (the server also accepts older ones)."""

DEFAULT_BASE_URL = "https://alion.io"

Response = Tuple[int, Dict[str, str], str]
"""What a transport returns: HTTP status, headers with lower-case names, body text."""

Transport = Callable[[str, Dict[str, str], bytes, float], Response]
"""A transport: (url, headers, body, timeout seconds) -> Response. Raise on a network failure."""


def urllib_transport(url: str, headers: Dict[str, str], body: bytes, timeout: float) -> Response:
    """The default transport: the standard library, no dependencies."""
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace") if e.fp is not None else ""
        return e.code, {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}, text


class _Base:
    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
        max_retries: int = 2,
        app_name: Optional[str] = None,
        headers: Optional[Mapping[str, str]] = None,
        transport: Optional[Transport] = None,
    ) -> None:
        key = os.environ.get("ALION_API_KEY", "") if api_key is None else api_key
        self.api_key: Optional[str] = key or None
        self.base_url: str = (base_url or os.environ.get("ALION_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.endpoint: str = self.base_url + ("/mcp" if self.api_key else "/mcp/open")
        self.timeout = float(timeout)
        self.max_retries = max(0, int(max_retries))
        self._transport: Transport = transport or urllib_transport
        self._user_agent = f"alion-python/{__version__}" + (f" {app_name}" if app_name else "")
        self._extra_headers = dict(headers or {})
        self._next_id = 0

    def __repr__(self) -> str:
        return f"{type(self).__name__}(endpoint={self.endpoint!r}, key={'yes' if self.api_key else 'no'})"

    def _build(self, method: str, params: Dict[str, Any]) -> Tuple[Dict[str, str], bytes]:
        self._next_id += 1
        body = json.dumps({"jsonrpc": "2.0", "id": self._next_id, "method": method, "params": params}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": PROTOCOL_VERSION,
            "User-Agent": self._user_agent,
        }
        headers.update(self._extra_headers)
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers, body

    def _parse(self, status: int, headers: Mapping[str, str], text: str) -> Dict[str, Any]:
        data = _parse_body(text, headers.get("content-type", ""))
        if status < 200 or status >= 300:
            raise AlionError._from_http(status, data, headers)
        if not isinstance(data, dict):
            raise AlionError(f"unreadable answer from {self.endpoint} (HTTP {status})", code="bad_response", status=status)
        if isinstance(data.get("error"), dict):
            raise AlionError._from_rpc(data["error"])
        return data

    def _network_error(self, e: BaseException) -> AlionError:
        if isinstance(e, (socket.timeout, TimeoutError)) or "timed out" in str(e):
            return AlionError(f"no answer from {self.endpoint} in time: {e}", code="timeout")
        return AlionError(f"network error calling {self.endpoint}: {e}", code="network_error")

    @staticmethod
    def _is_timeout(e: BaseException) -> bool:
        return isinstance(e, (socket.timeout, TimeoutError)) or (isinstance(e, urllib.error.URLError) and isinstance(e.reason, (socket.timeout, TimeoutError)))


class Alion(_Base, SyncTools):
    """The Alion client: every tool of the Alion MCP server as a method.

    >>> from alion import Alion
    >>> alion = Alion()  # no key: the free open address
    >>> alion.search_companies(industry="Fintech", country="DE", startup=True, limit=10)["items"]

    ``api_key`` defaults to the ALION_API_KEY environment variable; ``Alion(api_key="")`` forces the open address.
    Without a key: compact company, investor and job searches, lookalikes, job postings, the people and agent tools,
    free within a daily allowance per network. With a key (https://alion.io/developers/keys): everything.
    """

    def call(self, name: str, args: Optional[Dict[str, Any]] = None, *, timeout: Optional[float] = None) -> Any:
        """Calls a tool by name. The typed methods (search_companies, get_company, ...) are shortcuts for this."""
        rpc = self._rpc("tools/call", {"name": name, "arguments": _clean(args)}, timeout, name in READ_ONLY_TOOLS)
        return _tool_result(name, rpc)

    def paginate(self, name: str, *, max_items: Optional[int] = None, timeout: Optional[float] = None, **args: Any) -> Iterator[Dict[str, Any]]:
        """Walks every page of a search, yielding one row at a time (searches stop at row 100 on the server).

        >>> for job in alion.paginate("search_jobs", role="Data Engineer", country="PL", max_items=50): ...
        """
        if name not in PAGED_TOOLS:
            raise ValueError(f"{name} does not page")
        cursor: Optional[str] = None
        seen = 0
        while True:
            page = self.call(name, {**args, **({"cursor": cursor} if cursor else {})}, timeout=timeout)
            items = page.get("items") or []
            for item in items:
                yield item
                seen += 1
                if max_items is not None and seen >= max_items:
                    return
            cursor = page.get("next_cursor")
            if not cursor or page.get("has_more") is False or not items:
                return

    def list_tools(self, *, timeout: Optional[float] = None) -> List[Dict[str, Any]]:
        """The tools this address offers, with their input and output schemas."""
        tools: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        while True:
            res = self._rpc("tools/list", {"cursor": cursor} if cursor else {}, timeout, True).get("result") or {}
            tools.extend(res.get("tools") or [])
            cursor = res.get("nextCursor")
            if not cursor:
                return tools

    def close(self) -> None:
        """Nothing to release (every call is one stateless request); here for the with-statement."""

    def __enter__(self) -> "Alion":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def _rpc(self, method: str, params: Dict[str, Any], timeout: Optional[float], retry_5xx: bool) -> Dict[str, Any]:
        headers, body = self._build(method, params)
        attempt = 0
        while True:
            try:
                status, h, text = self._transport(self.endpoint, headers, body, timeout or self.timeout)
            except AlionError:
                raise
            except Exception as e:  # network failure
                if self._is_timeout(e):
                    raise self._network_error(TimeoutError(str(e))) from e
                if attempt < self.max_retries:
                    time.sleep(_backoff(attempt))
                    attempt += 1
                    continue
                raise self._network_error(e) from e
            if _retryable(status, retry_5xx) and attempt < self.max_retries:
                ra = _retry_after(h)
                time.sleep(ra if ra is not None else _backoff(attempt))
                attempt += 1
                continue
            return self._parse(status, h, text)


class AsyncAlion(_Base, AsyncTools):
    """The async client: the same methods as :class:`Alion`, awaited.

    >>> from alion import AsyncAlion
    >>> alion = AsyncAlion()
    >>> result = await alion.search_jobs(query="rust", country="DE")
    """

    async def call(self, name: str, args: Optional[Dict[str, Any]] = None, *, timeout: Optional[float] = None) -> Any:
        """Calls a tool by name. The typed methods are shortcuts for this."""
        rpc = await self._rpc("tools/call", {"name": name, "arguments": _clean(args)}, timeout, name in READ_ONLY_TOOLS)
        return _tool_result(name, rpc)

    async def paginate(self, name: str, *, max_items: Optional[int] = None, timeout: Optional[float] = None, **args: Any) -> AsyncIterator[Dict[str, Any]]:
        """Walks every page of a search, yielding one row at a time.

        >>> async for job in alion.paginate("search_jobs", role="Data Engineer", max_items=50): ...
        """
        if name not in PAGED_TOOLS:
            raise ValueError(f"{name} does not page")
        cursor: Optional[str] = None
        seen = 0
        while True:
            page = await self.call(name, {**args, **({"cursor": cursor} if cursor else {})}, timeout=timeout)
            items = page.get("items") or []
            for item in items:
                yield item
                seen += 1
                if max_items is not None and seen >= max_items:
                    return
            cursor = page.get("next_cursor")
            if not cursor or page.get("has_more") is False or not items:
                return

    async def list_tools(self, *, timeout: Optional[float] = None) -> List[Dict[str, Any]]:
        """The tools this address offers, with their input and output schemas."""
        tools: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        while True:
            res = (await self._rpc("tools/list", {"cursor": cursor} if cursor else {}, timeout, True)).get("result") or {}
            tools.extend(res.get("tools") or [])
            cursor = res.get("nextCursor")
            if not cursor:
                return tools

    async def aclose(self) -> None:
        """Nothing to release; here for the async with-statement."""

    async def __aenter__(self) -> "AsyncAlion":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()

    async def _rpc(self, method: str, params: Dict[str, Any], timeout: Optional[float], retry_5xx: bool) -> Dict[str, Any]:
        headers, body = self._build(method, params)
        loop = asyncio.get_running_loop()
        attempt = 0
        while True:
            try:
                # (the blocking transport runs in a worker thread: no event-loop stall, no extra dependency)
                status, h, text = await loop.run_in_executor(None, functools.partial(self._transport, self.endpoint, headers, body, timeout or self.timeout))
            except AlionError:
                raise
            except Exception as e:
                if self._is_timeout(e):
                    raise self._network_error(TimeoutError(str(e))) from e
                if attempt < self.max_retries:
                    await asyncio.sleep(_backoff(attempt))
                    attempt += 1
                    continue
                raise self._network_error(e) from e
            if _retryable(status, retry_5xx) and attempt < self.max_retries:
                ra = _retry_after(h)
                await asyncio.sleep(ra if ra is not None else _backoff(attempt))
                attempt += 1
                continue
            return self._parse(status, h, text)


def _clean(args: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    return {k: v for k, v in (args or {}).items() if v is not None}


def _tool_result(name: str, rpc: Dict[str, Any]) -> Any:
    result = rpc.get("result") or {}
    payload = result.get("structuredContent")
    if payload is None:
        payload = _text_content(result.get("content"))
    if result.get("isError"):
        raise AlionError._from_tool(name, payload)
    return payload


def _text_content(content: Any) -> Any:
    for c in content or []:
        if isinstance(c, dict) and c.get("type") == "text" and isinstance(c.get("text"), str):
            try:
                return json.loads(c["text"])
            except ValueError:
                return c["text"]
    return None


def _parse_body(text: str, content_type: str) -> Any:
    if not text:
        return None
    if "text/event-stream" in content_type:
        lines = [l[5:].strip() for l in text.splitlines() if l.startswith("data:")]
        text = lines[-1] if lines else ""
    try:
        return json.loads(text)
    except ValueError:
        return text


def _retryable(status: int, retry_5xx: bool) -> bool:
    return status == 429 or (retry_5xx and status >= 500)


def _backoff(attempt: int) -> float:
    return min(8.0, 0.5 * (1 << min(attempt, 6))) + random.random() * 0.25


def _retry_after(headers: Mapping[str, str]) -> Optional[float]:
    v = headers.get("retry-after")
    if v is None:
        return None
    try:
        return min(60.0, max(0.0, float(v)))
    except ValueError:
        return None
