"""Lookalikes of your best customer, optionally only those operating in a country you sell to. Free without a key.

    pip install alion
    python lookalikes.py stripe.com DE
"""

import sys

from alion import Alion

company = sys.argv[1] if len(sys.argv) > 1 else "stripe.com"
country = sys.argv[2] if len(sys.argv) > 2 else None

alion = Alion()
res = alion.similar_companies(company=company, country=country, limit=10)
for c in res["items"]:
    print(f"{c['name']:<30} {c.get('domain') or '':<28} {c.get('hq_country') or '':<3} {c.get('size_band') or ''}")
