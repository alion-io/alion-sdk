"""Official Python client for Alion: companies, startups, investors, job postings, hiring and pay
statistics, and people open to offers, for code and AI agents. https://alion.io/developers

>>> from alion import Alion
>>> alion = Alion()  # free without a key
>>> alion.search_companies(industry="Fintech", country="DE", startup=True, limit=10)["items"]
"""

from . import _types as types
from ._client import DEFAULT_BASE_URL, PROTOCOL_VERSION, Alion, AsyncAlion, Response, Transport, urllib_transport
from ._errors import AlionError
from ._types import PAGED_TOOLS, READ_ONLY_TOOLS, TOOL_NAMES
from ._version import __version__

__all__ = [
    "Alion",
    "AsyncAlion",
    "AlionError",
    "types",
    "PAGED_TOOLS",
    "READ_ONLY_TOOLS",
    "TOOL_NAMES",
    "PROTOCOL_VERSION",
    "DEFAULT_BASE_URL",
    "Response",
    "Transport",
    "urllib_transport",
    "__version__",
]
