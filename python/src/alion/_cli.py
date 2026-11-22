"""The Alion command line: company and job data in one command, no code.

    alion company stripe.com
    alion companies --industry Fintech --country DE --startup
    alion events --type funding_round --country DE --since 7d --format csv > rounds.csv

Free without a key for searches; set ALION_API_KEY for full profiles, money, owners, events and contracts.
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ._client import Alion
from ._errors import AlionError
from ._helpers import flatten, to_csv
from ._version import __version__

HELP = f"""alion {__version__} - company and job data from https://alion.io

Usage: alion <command> [argument] [--flag value ...] [--format table|json|csv]

Free without a key:
  resolve <domain|name|lei:...>     which company it is
  companies [--industry --country --size --technology --startup --funding_stage --list ...]
  similar <domain>                  lookalike companies (--mode competitors)
  jobs [--query --role --country --work_mode --salary_min_usd ...]
  market --role <role> [--country]  pay percentiles, demand, top employers

With ALION_API_KEY (prices: https://alion.io/developers/pricing):
  company <domain> [--slices summary|money,ownership,...]
  money <domain> [--direction in|out --kind equity]
  owners <domain>                   legal entities, group, owners, subsidiaries
  record <domain>                   court cases, regulators, insolvency (counterparty check)
  events [--type funding_round --country DE --since 7d]
  contracts [--company <domain> | --buyer <domain> | --ending_within 90d | --country DE]
  enrich <domain> <domain> ... [--slices funding,hiring]

Any tool:
  call <tool> [--arg value ...]     e.g. alion call get_index --index ai-hiring
  tools                             every tool with its description

Options: --key <api key> (or ALION_API_KEY), --limit <n>, --all (every page), --format, --app <name>
Docs: https://alion.io/developers/docs"""

OWN = {"key", "format", "all", "app", "help"}
TEXT = {"country", "query", "since"}


def _parse(argv: Sequence[str]) -> Tuple[str, List[str], Dict[str, Any]]:
    pos: List[str] = []
    flags: Dict[str, Any] = {}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("--"):
            k, eq, v = a[2:].partition("=")
            if eq:
                flags[k] = v
            elif i + 1 < len(argv) and not argv[i + 1].startswith("--"):
                i += 1
                flags[k] = argv[i]
            else:
                flags[k] = True
        else:
            pos.append(a)
        i += 1
    return (pos.pop(0) if pos else "help"), pos, flags


def _args(flags: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in flags.items():
        if k in OWN:
            continue
        if v is True or v == "true":
            out[k] = True
        elif v == "false":
            out[k] = False
        elif isinstance(v, str) and re.fullmatch(r"-?\d+", v) and k not in TEXT:
            out[k] = int(v)
        else:
            out[k] = v
    return out


def _table(rows: List[Dict[str, Any]]) -> str:
    if not rows:
        return "(nothing found)"
    flat = [flatten(r) for r in rows]
    prefer = ["date", "type", "name", "company.name", "domain", "company.domain", "title", "industry", "size_band", "size", "hq_country", "country", "open_jobs",
              "founded_year", "kind", "direction", "stage", "counterparty", "amount_usd", "status", "value_usd", "url"]
    keys: List[str] = []
    for r in flat:
        for k in r:
            if k not in keys:
                keys.append(k)
    cols = [c for c in prefer if c in keys]
    if len(cols) < 3:
        cols = [k for k in keys if any(r.get(k) is not None and len(str(r.get(k))) < 60 for r in flat)][:6]
    cols = cols[:7]

    def cut(v: Any) -> str:
        s = "" if v is None else str(v)
        return s if len(s) <= 42 else s[:40] + "..."

    width = [max(len(c), *(len(cut(r.get(c))) for r in flat)) for c in cols]

    def line(vals: List[str]) -> str:
        return "  ".join(v.ljust(width[i]) for i, v in enumerate(vals)).rstrip()

    return "\n".join([line(cols), line(["-" * w for w in width])] + [line([cut(r.get(c)) for c in cols]) for r in flat])


def _print(result: Any, fmt: str) -> None:
    rows = result if isinstance(result, list) else result.get("items") if isinstance(result, dict) else None
    if fmt == "json":
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif fmt == "csv":
        sys.stdout.write(to_csv(rows if isinstance(rows, list) else [result]))
    elif isinstance(rows, list):
        print(_table(rows))
    else:
        flat = flatten(result if isinstance(result, dict) else {"value": result})
        keys = [k for k in flat if not k.startswith(("meta.", "cite.")) and flat[k] not in (None, "")]
        w = min(36, max((len(k) for k in keys), default=0))
        for k in keys[:80]:
            print(f"{k.ljust(w)}  {str(flat[k])[:140]}")
        if len(keys) > 80:
            print(f"... {len(keys) - 80} more (use --format json)")


def run(argv: Optional[Sequence[str]] = None) -> int:
    cmd, pos, flags = _parse(list(sys.argv[1:] if argv is None else argv))
    if cmd in ("help", "-h", "--help") or flags.get("help"):
        print(HELP)
        return 0
    if cmd in ("version", "--version"):
        print(__version__)
        return 0
    key = flags.get("key") if isinstance(flags.get("key"), str) else None
    app = f"alion-cli/{__version__}" + (f" {flags['app']}" if isinstance(flags.get("app"), str) else "")
    alion = Alion(api_key=key, app_name=app)
    fmt = flags["format"] if isinstance(flags.get("format"), str) else ("table" if sys.stdout.isatty() else "json")
    args = _args(flags)
    one = pos[0] if pos else None

    def need(what: str) -> str:
        if not one:
            raise AlionError(f"{cmd} needs {what}, e.g. alion {cmd} stripe.com", code="invalid_params")
        return one

    def page(tool: str, a: Dict[str, Any]) -> Any:
        if not flags.get("all"):
            return alion.call(tool, a)
        return {"items": list(alion.paginate(tool, **a))}

    if cmd == "resolve":
        v = need("a domain, a name or an identifier")
        result = alion.call("resolve_company", {"identifier": v} if re.match(r"^[a-z_]+:|^\d{6,}$", v, re.I) else {"domain": v} if "." in v else {"name": v})
    elif cmd == "company":
        if not alion.api_key:
            result = alion.call("resolve_company", {"query": need("a domain")})
            print("No API key: showing the free match. Set ALION_API_KEY for the full profile (https://alion.io/developers/keys).", file=sys.stderr)
        else:
            result = alion.call("get_company", {"domain": need("a domain"), **args})
    elif cmd == "companies":
        result = page("search_companies", {"detail": "compact", **args})
    elif cmd == "similar":
        result = alion.call("similar_companies", {"company": need("a domain"), "detail": "compact", **args})
    elif cmd == "jobs":
        result = page("search_jobs", {"detail": "compact", **args})
    elif cmd == "market":
        result = alion.call("market_stats", args)
    elif cmd == "money":
        result = alion.call("get_company_money", {"company": need("a domain"), **args})
    elif cmd == "owners":
        result = alion.call("get_company_ownership", {"company": need("a domain"), **args})
    elif cmd == "record":
        result = alion.call("get_company_record", {"company": need("a domain"), **args})
    elif cmd == "events":
        result = page("search_company_events", args)
    elif cmd == "contracts":
        result = page("search_contracts", args)
    elif cmd == "enrich":
        if not pos:
            raise AlionError("enrich needs domains, e.g. alion enrich stripe.com adyen.com", code="invalid_params")
        result = alion.enrich_companies(pos, slices=flags.get("slices") if isinstance(flags.get("slices"), str) else None)
    elif cmd == "call":
        result = alion.call(need("a tool name"), args)
    elif cmd == "tools":
        result = [{"name": t.get("name"), "title": t.get("title"), "description": (t.get("description") or "").split(". ")[0]} for t in alion.list_tools()]
    else:
        print(f'Unknown command "{cmd}".\n\n{HELP}', file=sys.stderr)
        return 2
    _print(result, fmt)
    if alion.credits_spent > 0:
        print(f"credits spent: {alion.credits_spent:.3f} (${alion.credits_spent / 10:.4f})", file=sys.stderr)
    return 0


def main() -> None:
    # (a Windows console or a pipe in a legacy code page: a company name it cannot print is replaced, not a crash)
    for stream in (sys.stdout, sys.stderr):
        try:
            getattr(stream, "reconfigure")(errors="replace")
        except (AttributeError, ValueError):
            pass
    try:
        sys.exit(run())
    except AlionError as e:
        print(f"error ({e.code}): {e}", file=sys.stderr)
        if e.hint:
            print(e.hint, file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
