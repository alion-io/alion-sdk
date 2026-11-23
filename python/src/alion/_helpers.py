"""Helpers that need no client: webhook signatures, CSV and pandas."""

from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import time
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Union


def verify_webhook(body: Union[str, bytes], signature: Optional[str], secret: str, *, tolerance: int = 300, now: Optional[float] = None) -> bool:
    """Checks the ``X-Alion-Signature`` header of a webhook against the raw request body and the secret:

    - an account webhook (https://alion.io/developers/webhooks): ``t=<unix seconds>,v1=<hex>``, HMAC-SHA256 of
      ``"<t>.<raw body>"`` with the address's secret (``whsec_...``); a timestamp more than ``tolerance`` seconds off fails;
    - an agent webhook (set_webhook, a watch with deliver=webhook): ``sha256=<hex>``, HMAC-SHA256 of the body.

    >>> verify_webhook(request.body, request.headers.get("X-Alion-Signature"), os.environ["ALION_WEBHOOK_SECRET"])
    """
    if not signature or not secret:
        return False
    raw = body.encode("utf-8") if isinstance(body, str) else body
    header = signature.strip()
    if header.startswith("t=") and "," in header:
        parts: Dict[str, List[str]] = {}
        for p in header.split(","):
            k, _, v = p.strip().partition("=")
            parts.setdefault(k, []).append(v.strip())
        try:
            ts = int(parts.get("t", ["0"])[0])
        except ValueError:
            return False
        if not ts or abs((now if now is not None else time.time()) - ts) > tolerance:
            return False
        got = hmac.new(secret.encode("utf-8"), str(ts).encode("ascii") + b"." + raw, hashlib.sha256).hexdigest()
        return any(hmac.compare_digest(got, v.lower()) for v in parts.get("v1", []))
    want = header[7:] if header.lower().startswith("sha256=") else header
    got = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(got, want.lower())


def flatten(row: Mapping[str, Any], prefix: str = "") -> Dict[str, Any]:
    """One row as a flat dict: nested keys dotted (``hq.country``), lists of scalars joined with "; ", lists of objects as JSON."""
    out: Dict[str, Any] = {}
    for k, v in (row or {}).items():
        key = f"{prefix}.{k}" if prefix else str(k)
        if isinstance(v, Mapping):
            out.update(flatten(v, key))
        elif isinstance(v, (list, tuple)):
            out[key] = "; ".join("" if x is None else str(x) for x in v) if all(not isinstance(x, (Mapping, list, tuple)) for x in v) else json.dumps(v, ensure_ascii=False)
        else:
            out[key] = v
    return out


def _rows(data: Any) -> List[Mapping[str, Any]]:
    if isinstance(data, Mapping) and isinstance(data.get("items"), list):
        return list(data["items"])
    if isinstance(data, Mapping):
        return [data]
    return list(data or [])


def to_csv(data: Union[Mapping[str, Any], Iterable[Mapping[str, Any]]], columns: Optional[Sequence[str]] = None) -> str:
    """Rows (a search answer, its ``items``, an events page, a batch) as CSV text, nested fields as dotted columns."""
    flat = [flatten(r) for r in _rows(data)]
    cols: List[str] = list(columns) if columns else []
    if not columns:
        for r in flat:
            for k in r:
                if k not in cols:
                    cols.append(k)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(cols)
    for r in flat:
        w.writerow(["" if r.get(c) is None else r.get(c) for c in cols])
    return buf.getvalue()


def to_pandas(data: Union[Mapping[str, Any], Iterable[Mapping[str, Any]]]) -> Any:
    """Rows as a pandas DataFrame, nested fields as dotted columns (needs ``pip install pandas``)."""
    try:
        import pandas as pd  # type: ignore
    except ImportError as e:  # pragma: no cover - depends on the environment
        raise ImportError("to_pandas needs pandas: pip install pandas") from e
    return pd.DataFrame([flatten(r) for r in _rows(data)])
