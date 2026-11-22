"""Enrich a CRM export: a CSV with a domain column in, the same rows with funding and hiring out.
Needs ALION_API_KEY: $0.01 a company + $0.005 a slice; domains Alion does not know are free.

    pip install alion
    export ALION_API_KEY=...
    python enrich_csv.py accounts.csv > accounts_enriched.csv
"""

import csv
import sys

from alion import Alion, flatten, to_csv

path = sys.argv[1] if len(sys.argv) > 1 else "accounts.csv"
with open(path, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))
domains = [r.get("domain") or r.get("website") or "" for r in rows]

alion = Alion(max_credits=100)  # stop before $10 is spent
res = alion.enrich_companies([d for d in domains if d], slices="funding,hiring")
by_domain = {c["domain"]: flatten(c) for c in res["items"] if c.get("domain")}

out = []
for row, domain in zip(rows, domains):
    found = by_domain.get(domain.lower().removeprefix("https://").removeprefix("www.").strip("/"), {})
    out.append({**row, **{"alion." + k: v for k, v in found.items()}})
print(to_csv(out), end="")
print(f"found {len(res['items'])}, not found {len(res['not_found'])}, charged {res['credits_charged']} credits", file=sys.stderr)
