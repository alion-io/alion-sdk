"""Alion's company and job data as LlamaIndex tools (``pip install alion llama-index-core``).

>>> from llama_index.core.agent.workflow import FunctionAgent
>>> from alion.llama_index import alion_tools
>>> agent = FunctionAgent(tools=alion_tools(), llm=llm)   # no key: the free tools; ALION_API_KEY: all of them
>>> await agent.run("Which fintech startups in Germany raised money this month, and are they hiring?")

A refusal (no key, a limit, a bad argument) comes back to the model as ``{"error", "message", "hint"}`` so it can recover.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple, Type

from ._agent_tools import AGENT_TOOLS
from ._client import Alion
from ._errors import AlionError

ALION_AGENT_TOOLS: List[str] = [t["name"] for t in AGENT_TOOLS]
"""The names of the tools :func:`alion_tools` can give."""

_TYPES: Dict[str, Any] = {"string": str, "integer": int, "number": float, "boolean": bool, "array": list, "object": dict}


def _model(name: str, schema: Dict[str, Any]) -> Type[Any]:
    """A pydantic model of a tool's JSON Schema arguments (every argument optional unless the schema requires it)."""
    from pydantic import Field, create_model  # type: ignore

    required = set(schema.get("required") or [])
    fields: Dict[str, Tuple[Any, Any]] = {}
    for key, prop in (schema.get("properties") or {}).items():
        t = prop.get("type")
        py = _TYPES.get(t[0] if isinstance(t, list) else t, Any) if t else Any
        desc = prop.get("description")
        if key in required:
            fields[key] = (py, Field(..., description=desc))
        else:
            fields[key] = (Optional[py], Field(None, description=desc))
    return create_model(name, **fields)  # type: ignore


def alion_tools(
    api_key: Optional[str] = None,
    *,
    client: Optional[Alion] = None,
    include: Optional[Sequence[str]] = None,
    prefix: str = "alion_",
    **client_options: Any,
) -> List[Any]:
    """The tools for a LlamaIndex agent: company search and profiles, lookalikes, the money ledger, owners, the public record,
    company events, public contracts, investors, job postings and market statistics. Without a key only the tools free on
    Alion's open address are given; ``include`` picks tools by Alion name ("search_companies", "get_company_money"...).
    """
    from llama_index.core.tools import FunctionTool, ToolMetadata  # type: ignore

    c = client or Alion(api_key, app_name=client_options.pop("app_name", "alion-llama-index"), **client_options)
    out: List[Any] = []
    for t in AGENT_TOOLS:
        if include is not None:
            if t["name"] not in include:
                continue
        elif not c.api_key and not t["free"]:
            continue

        def run(_name: str = t["name"], **kwargs: Any) -> Any:
            try:
                return c.call(_name, {k: v for k, v in kwargs.items() if v is not None})
            except AlionError as e:
                return {"error": e.code, "message": str(e), "hint": e.hint}

        model = _model("".join(p.title() for p in t["name"].split("_")) + "Input", t["inputSchema"])
        out.append(FunctionTool(fn=run, metadata=ToolMetadata(name=prefix + t["name"], description=t["description"], fn_schema=model)))
    return out
