from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

_ACCOUNT_CODES = frozenset({"account_required", "payment_required", "auth_required", "unauthorized", "http_401", "http_402"})


class AlionError(Exception):
    """Every failure of a call: a refusal by a tool (the server's code, e.g. ``account_required``,
    ``rate_limited``, ``invalid_params``), an HTTP error, a JSON-RPC error, a timeout or a network error.

    >>> try:
    ...     alion.get_company(domain="stripe.com")
    ... except AlionError as e:
    ...     if e.needs_account: ...
    """

    code: str
    """A machine-readable code: the server's error code, or timeout / network_error / http_<status> / rpc_<code>."""
    status: Optional[int]
    """The HTTP status, when the server answered with an error status."""
    tool: Optional[str]
    """The tool that refused, for a tool error."""
    data: Any
    """The whole error payload from the server (hints, free_tools, examples, ...)."""
    retry_after: Optional[float]
    """Seconds to wait before retrying, when the server said so."""

    def __init__(self, message: str, *, code: str, status: Optional[int] = None, tool: Optional[str] = None, data: Any = None, retry_after: Optional[float] = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.tool = tool
        self.data = data
        self.retry_after = retry_after

    @property
    def needs_account(self) -> bool:
        """True when the tool needs an API key (or a payment): it is not free on the open address."""
        return self.code in _ACCOUNT_CODES

    def __repr__(self) -> str:
        return f"AlionError(code={self.code!r}, status={self.status!r}, message={self.message!r})"

    @classmethod
    def _from_tool(cls, tool: str, payload: Any) -> "AlionError":
        p: Dict[str, Any] = payload if isinstance(payload, dict) else {"message": "" if payload is None else str(payload)}
        code = p.get("error") if isinstance(p.get("error"), str) else p.get("code") if isinstance(p.get("code"), str) else "tool_error"
        msg = p.get("message") if isinstance(p.get("message"), str) else p.get("error") if isinstance(p.get("error"), str) else f"{tool} failed"
        ra = p.get("retry_after")
        return cls(f"{tool}: {msg}", code=str(code), tool=tool, data=payload, retry_after=float(ra) if isinstance(ra, (int, float)) else None)

    @classmethod
    def _from_rpc(cls, err: Mapping[str, Any]) -> "AlionError":
        return cls(str(err.get("message") or f"JSON-RPC error {err.get('code')}"), code=f"rpc_{err.get('code')}", data=err.get("data", err))

    @classmethod
    def _from_http(cls, status: int, data: Any, headers: Mapping[str, str]) -> "AlionError":
        retry_after: Optional[float] = None
        try:
            v = float(headers.get("retry-after", ""))
            retry_after = v if v > 0 else None
        except ValueError:
            pass
        if isinstance(data, dict):
            rpc = data.get("error") if isinstance(data.get("error"), dict) else None
            if rpc is not None:
                return cls(str(rpc.get("message") or f"HTTP {status}"), code=_code_for(status, rpc.get("code")), status=status, data=rpc.get("data", data), retry_after=retry_after)
            code = data["error"] if isinstance(data.get("error"), str) else f"http_{status}"
            msg = data.get("message") if isinstance(data.get("message"), str) else data.get("detail") if isinstance(data.get("detail"), str) else f"HTTP {status}"
            return cls(str(msg), code=code, status=status, data=data, retry_after=retry_after)
        text = f": {data}" if isinstance(data, str) and len(data) < 300 and data else ""
        return cls(f"HTTP {status}{text}", code=f"http_{status}", status=status, data=data, retry_after=retry_after)


def _code_for(status: int, rpc_code: Any) -> str:
    if status == 401:
        return "unauthorized"
    if status == 402:
        return "payment_required"
    if status == 429:
        return "rate_limited"
    return f"rpc_{rpc_code}" if rpc_code is not None else f"http_{status}"
