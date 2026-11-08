from __future__ import annotations

import json
from typing import Any, Literal, Optional

from alion import Alion, AlionError, AsyncAlion
from langchain_core.tools import BaseTool, ToolException
from langchain_core.utils import secret_from_env
from pydantic import ConfigDict, Field, PrivateAttr, SecretStr

from ._version import __version__


class AlionBaseTool(BaseTool):
    """Base of every Alion tool: one call to one tool of the Alion MCP server.

    Without an API key the tools use Alion's free open address (compact searches, lookalikes, job postings and checks,
    within a daily allowance per network). With a key (``ALION_API_KEY`` or ``api_key=``) they get everything the
    account allows: full company and investor profiles and pay statistics.

    The tool returns the answer as JSON text for the model and the parsed answer as the artifact. A refusal by the
    server (for example a paid tool without a key) is returned to the model as text, so the agent can adjust.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    # (each generated tool sets its own; defaults here so the base class is constructible for type checkers)
    name: str = "alion"
    description: str = "A tool of the Alion MCP server."

    api_key: Optional[SecretStr] = Field(default_factory=secret_from_env("ALION_API_KEY", default=None))
    """Alion API key (https://alion.io/developers/keys). Defaults to the ALION_API_KEY environment variable."""
    base_url: str = "https://alion.io"
    """The Alion server."""
    timeout: float = 120.0
    """Seconds per call."""
    app_name: Optional[str] = None
    """Added to the User-Agent, e.g. "my-agent/1.0"."""

    alion_tool: str = ""
    """The Alion tool this LangChain tool calls."""

    response_format: Literal["content", "content_and_artifact"] = "content_and_artifact"
    handle_tool_error: bool = True

    _client: Optional[Alion] = PrivateAttr(default=None)
    _aclient: Optional[AsyncAlion] = PrivateAttr(default=None)

    def _client_kwargs(self) -> dict[str, Any]:
        ua = f"langchain-alion/{__version__}" + (f" {self.app_name}" if self.app_name else "")
        key = self.api_key.get_secret_value() if self.api_key else ""
        return {"api_key": key, "base_url": self.base_url, "timeout": self.timeout, "app_name": ua}

    def _sync(self) -> Alion:
        if self._client is None:
            self._client = Alion(**self._client_kwargs())
        return self._client

    def _async(self) -> AsyncAlion:
        if self._aclient is None:
            self._aclient = AsyncAlion(**self._client_kwargs())
        return self._aclient

    def _run(self, *args: Any, run_manager: Any = None, **kwargs: Any) -> tuple[str, Any]:
        try:
            result = self._sync().call(self.alion_tool, _clean(kwargs))
        except AlionError as e:
            raise ToolException(_explain(e)) from e
        return _content(result), result

    async def _arun(self, *args: Any, run_manager: Any = None, **kwargs: Any) -> tuple[str, Any]:
        try:
            result = await self._async().call(self.alion_tool, _clean(kwargs))
        except AlionError as e:
            raise ToolException(_explain(e)) from e
        return _content(result), result


def _clean(kwargs: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in kwargs.items() if v is not None}


def _content(result: Any) -> str:
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"), default=str)


def _explain(e: AlionError) -> str:
    text = str(e)
    if e.needs_account:
        text += " (This tool needs an Alion API key: set ALION_API_KEY. Free without a key: search_companies, similar_companies, resolve_company, check_counterparty, search_jobs, get_job.)"
    return text
