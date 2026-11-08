from __future__ import annotations

from typing import Optional

from langchain_core.tools import BaseTool, BaseToolkit
from langchain_core.utils import secret_from_env
from pydantic import Field, SecretStr

from ._tools import ALL_TOOLS

# the tools that work without an API key (Alion's free open address)
FREE_TOOLS = frozenset({"search_companies", "similar_companies", "resolve_company", "check_counterparty", "search_jobs", "get_job"})


class AlionToolkit(BaseToolkit):
    """Alion tools for LangChain agents: companies, startups, investors, job postings and pay statistics.

    >>> from langchain_alion import AlionToolkit
    >>> tools = AlionToolkit().get_tools()  # without a key: only the tools that are free on the open address

    With ``ALION_API_KEY`` (or ``api_key=``) every tool is included. Pass ``include=[...]`` with Alion tool names
    (``"search_companies"``, ``"get_company"``...) to choose a subset.
    """

    api_key: Optional[SecretStr] = Field(default_factory=secret_from_env("ALION_API_KEY", default=None))
    base_url: str = "https://alion.io"
    timeout: float = 120.0
    app_name: Optional[str] = None
    include: Optional[list[str]] = None
    """Alion tool names to include. Default: all of them with a key, the free ones without."""

    def get_tools(self) -> list[BaseTool]:
        """The Alion tools, configured with this toolkit's key and settings."""
        wanted = set(self.include) if self.include is not None else None
        tools: list[BaseTool] = []
        for cls in ALL_TOOLS:
            name = cls.model_fields["alion_tool"].default
            if wanted is not None:
                if name not in wanted:
                    continue
            elif self.api_key is None and name not in FREE_TOOLS:
                continue
            tools.append(cls(api_key=self.api_key, base_url=self.base_url, timeout=self.timeout, app_name=self.app_name))
        if wanted is not None:
            known = {cls.model_fields["alion_tool"].default for cls in ALL_TOOLS}
            unknown = wanted - known
            if unknown:
                raise ValueError(f"unknown Alion tools: {sorted(unknown)}; available: {sorted(known)}")
        return tools
